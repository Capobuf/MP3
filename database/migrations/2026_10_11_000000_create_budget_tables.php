<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Composite keys also protect tenant ownership at the database boundary.
        foreach (['contracts', 'projects', 'expenses', 'cost_centers'] as $source) {
            Schema::table($source, fn (Blueprint $table) => $table->unique(['tenant_id', 'id']));
        }
        Schema::create('budget_years', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedSmallInteger('year');
            $table->json('dismissed_sources')->nullable();
            $table->boolean('structure_copied')->default(false);
            $table->timestamps();
            $table->unique(['tenant_id', 'year']);
            $table->unique(['tenant_id', 'id']);
        });
        Schema::create('budget_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('budget_year_id');
            $table->enum('type', ['contract', 'project', 'expense', 'manual']);
            foreach (['contract', 'project', 'expense'] as $type) {
                $table->unsignedBigInteger($type.'_id')->nullable();
                $table->foreign(['tenant_id', $type.'_id'])->references(['tenant_id', 'id'])->on($type.'s')->restrictOnDelete();
                $table->unique(['budget_year_id', $type.'_id']);
            }
            $table->string('description')->nullable();
            $table->decimal('manual_allocated', 14, 2)->nullable();
            $table->decimal('manual_actual', 14, 2)->nullable();
            $table->unsignedBigInteger('cost_center_id')->nullable();
            $table->foreign(['tenant_id', 'cost_center_id'])->references(['tenant_id', 'id'])->on('cost_centers')->restrictOnDelete();
            $table->foreign(['tenant_id', 'budget_year_id'])->references(['tenant_id', 'id'])->on('budget_years')->restrictOnDelete();
            $table->boolean('included')->default(true);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->index(['tenant_id', 'budget_year_id', 'position']);
        });
        $shape = "((type = 'manual' AND contract_id IS NULL AND project_id IS NULL AND expense_id IS NULL AND description IS NOT NULL) OR
            (type = 'contract' AND contract_id IS NOT NULL AND project_id IS NULL AND expense_id IS NULL) OR
            (type = 'project' AND project_id IS NOT NULL AND contract_id IS NULL AND expense_id IS NULL) OR
            (type = 'expense' AND expense_id IS NOT NULL AND contract_id IS NULL AND project_id IS NULL))
            AND (type = 'manual' OR (manual_allocated IS NULL AND manual_actual IS NULL AND description IS NULL))";
        if (DB::getDriverName() === 'sqlite') {
            // SQLite cannot add a CHECK after CREATE TABLE; equivalent guards for CI.
            $condition = preg_replace('/\b(type|contract_id|project_id|expense_id|description|manual_allocated|manual_actual)\b/', 'NEW.$1', $shape);
            foreach (['INSERT', 'UPDATE'] as $event) {
                /** @var literal-string $sql */
                $sql = "CREATE TRIGGER budget_shape_{$event} BEFORE {$event} ON budget_entries WHEN NOT ({$condition}) BEGIN SELECT RAISE(ABORT, 'Invalid budget source'); END";
                DB::unprepared($sql);
            }
        } else {
            DB::statement("ALTER TABLE budget_entries ADD CONSTRAINT budget_source_shape CHECK ({$shape})");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('budget_entries');
        Schema::dropIfExists('budget_years');
        foreach (['contracts', 'projects', 'expenses', 'cost_centers'] as $source) {
            Schema::table($source, fn (Blueprint $table) => $table->dropUnique(['tenant_id', 'id']));
        }
    }
};

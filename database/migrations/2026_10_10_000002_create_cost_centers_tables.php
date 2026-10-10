<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cost_centers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('cost_centers')->nullOnDelete();
            $table->string('name');
            $table->timestamps();
            $table->index(['tenant_id', 'parent_id']);
        });

        foreach (['expense' => 'cost_center_expense', 'project' => 'cost_center_project', 'contract' => 'contract_cost_center'] as $entity => $tableName) {
            Schema::create($tableName, function (Blueprint $table) use ($entity) {
                $table->foreignId('cost_center_id')->constrained()->cascadeOnDelete();
                $table->foreignId($entity.'_id')->constrained()->cascadeOnDelete();
                $table->primary(['cost_center_id', $entity.'_id']);
            });
        }
    }

    public function down(): void
    {
        foreach (['cost_center_expense', 'cost_center_project', 'contract_cost_center'] as $tableName) {
            Schema::dropIfExists($tableName);
        }
        Schema::dropIfExists('cost_centers');
    }
};

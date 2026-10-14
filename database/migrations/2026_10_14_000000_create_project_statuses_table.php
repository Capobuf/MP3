<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_statuses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('key');
            $table->string('name');
            $table->timestamps();
            $table->unique(['tenant_id', 'key']);
            $table->unique(['tenant_id', 'name']);
        });

        foreach (DB::table('tenants')->pluck('id') as $tenantId) {
            $statuses = ['pianificato' => 'Pianificato', 'attivo' => 'Attivo', 'completato' => 'Completato'];
            foreach (DB::table('projects')->where('tenant_id', $tenantId)->distinct()->pluck('status') as $key) {
                if ($key !== null && ! isset($statuses[$key])) {
                    $statuses[$key] = $key;
                }
            }
            foreach ($statuses as $key => $name) {
                DB::table('project_statuses')->insert(['tenant_id' => $tenantId, 'key' => $key, 'name' => $name, 'created_at' => now(), 'updated_at' => now()]);
            }
        }

        Schema::table('projects', function (Blueprint $table) {
            $table->string('status')->nullable()->default(null)->change();
        });
    }

    public function down(): void
    {
        DB::table('projects')->whereNull('status')->update(['status' => 'pianificato']);
        Schema::table('projects', function (Blueprint $table) {
            $table->string('status')->nullable(false)->default('pianificato')->change();
        });
        Schema::dropIfExists('project_statuses');
    }
};

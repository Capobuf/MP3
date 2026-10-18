<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('backup_settings', function (Blueprint $table): void {
            $table->string('scope')->primary();
            $table->string('frequency')->default('disabled');
            $table->string('time', 5)->default('02:00');
            $table->unsignedTinyInteger('weekday')->default(1);
            $table->timestamp('last_started_at')->nullable();
            $table->timestamp('last_finished_at')->nullable();
            $table->string('last_status')->nullable();
            $table->text('last_message')->nullable();
            $table->string('last_scheduled_slot')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('backup_settings');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_drive_settings', function (Blueprint $table) {
            $table->unsignedTinyInteger('id')->primary();
            $table->text('token')->nullable();
            $table->string('account_id')->nullable();
            $table->string('account_email')->nullable();
            $table->text('last_error')->nullable();
            $table->boolean('backup_enabled')->default(false);
            $table->string('backup_last_name')->nullable();
            $table->string('backup_last_status')->nullable();
            $table->text('backup_last_message')->nullable();
            $table->timestamp('backup_last_attempted_at')->nullable();
            $table->timestamps();
        });
        Schema::create('tenant_drive_syncs', function (Blueprint $table) {
            $table->foreignId('tenant_id')->primary()->constrained()->cascadeOnDelete();
            $table->boolean('enabled')->default(false);
            $table->string('last_status')->nullable();
            $table->text('last_message')->nullable();
            $table->timestamp('last_attempted_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();
        });
        Schema::create('drive_objects', function (Blueprint $table) {
            $table->id();
            $table->string('account_id');
            $table->string('object_key');
            $table->string('file_id')->unique();
            $table->boolean('created')->default(false);
            $table->string('last_status')->nullable();
            $table->text('last_message')->nullable();
            $table->timestamp('last_attempted_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->unique(['account_id', 'object_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drive_objects');
        Schema::dropIfExists('tenant_drive_syncs');
        Schema::dropIfExists('platform_drive_settings');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('platform_drive_settings', function (Blueprint $table) {
            $table->string('picker_api_key')->nullable();
            $table->string('picker_app_id')->nullable();
        });
        Schema::table('drive_objects', function (Blueprint $table) {
            $table->string('parent_id')->nullable();
            $table->text('parent_name')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('drive_objects', fn (Blueprint $table) => $table->dropColumn(['parent_id', 'parent_name']));
        Schema::table('platform_drive_settings', fn (Blueprint $table) => $table->dropColumn(['picker_api_key', 'picker_app_id']));
    }
};

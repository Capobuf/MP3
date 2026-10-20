<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('platform_drive_settings', function (Blueprint $table) {
            $table->string('client_id')->nullable();
            $table->text('client_secret')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('platform_drive_settings', function (Blueprint $table) {
            $table->dropColumn(['client_id', 'client_secret']);
        });
    }
};

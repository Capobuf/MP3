<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Sort after the package’s untimestamped create_comments_table migration on fresh installs.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comments', function (Blueprint $table): void {
            $table->string('author_name', 255)->nullable();
        });
        Schema::table('attachments', function (Blueprint $table): void {
            $table->string('uploaded_by_name', 255)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('comments', function (Blueprint $table): void {
            $table->dropColumn('author_name');
        });
        Schema::table('attachments', function (Blueprint $table): void {
            $table->dropColumn('uploaded_by_name');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->unsignedSmallInteger('undo_popup_seconds')->default(10));
        Schema::create('undo_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('label');
            $table->string('before_hash', 64);
            $table->string('after_hash', 64);
            $table->json('changes');
            $table->json('files');
            $table->timestamp('undone_at')->nullable();
            $table->timestamp('redo_expires_at')->nullable();
            $table->timestamp('created_at');
            $table->index(['tenant_id', 'user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('undo_actions');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('undo_popup_seconds'));
    }
};

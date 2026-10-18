<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->unsignedBigInteger('source_expense_id')->nullable();
            $table->foreign(['tenant_id', 'source_expense_id'])->references(['tenant_id', 'id'])->on('expenses')->restrictOnDelete();
            $table->unique(['tenant_id', 'year', 'source_expense_id']);
        });
    }

    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->dropForeign(['tenant_id', 'source_expense_id']);
            $table->dropUnique(['tenant_id', 'year', 'source_expense_id']);
            $table->dropColumn('source_expense_id');
        });
    }
};

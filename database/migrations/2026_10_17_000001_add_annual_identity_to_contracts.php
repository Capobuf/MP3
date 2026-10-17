<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->unsignedSmallInteger('year')->nullable();
            $table->unsignedBigInteger('source_contract_id')->nullable();
            $table->foreign(['tenant_id', 'source_contract_id'])->references(['tenant_id', 'id'])->on('contracts')->restrictOnDelete();
            $table->unique(['tenant_id', 'year', 'source_contract_id']);
        });
        // Ambiguous legacy contracts remain visible and untouched until explicitly classified.
        foreach (DB::table('contracts')->orderBy('id')->get(['id']) as $contract) {
            $years = DB::table('budget_entries')->join('budget_years', 'budget_years.id', '=', 'budget_entries.budget_year_id')
                ->where('contract_id', $contract->id)->pluck('budget_years.year')
                ->merge(DB::table('expenses')->leftJoin('expense_lines', 'expense_lines.expense_id', '=', 'expenses.id')
                    ->where('contract_id', $contract->id)->selectRaw('COALESCE(expense_lines.year, expenses.year) as economic_year')->pluck('economic_year'))
                ->unique()->values();
            if ($years->count() === 1) {
                DB::table('contracts')->where('id', $contract->id)->update(['year' => $years->first()]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropForeign(['tenant_id', 'source_contract_id']);
            $table->dropUnique(['tenant_id', 'year', 'source_contract_id']);
            $table->dropColumn(['year', 'source_contract_id']);
        });
    }
};

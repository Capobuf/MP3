<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->unsignedSmallInteger('year')->nullable();
            $table->unsignedBigInteger('source_project_id')->nullable();
            $table->foreign(['tenant_id', 'source_project_id'])->references(['tenant_id', 'id'])->on('projects')->restrictOnDelete();
            $table->unique(['tenant_id', 'year', 'source_project_id']);
        });
        // Ambiguous legacy projects remain visible and untouched until explicitly classified.
        foreach (DB::table('projects')->orderBy('id')->get(['id']) as $project) {
            $years = DB::table('budget_entries')->join('budget_years', 'budget_years.id', '=', 'budget_entries.budget_year_id')
                ->where('project_id', $project->id)->pluck('budget_years.year')
                ->merge(DB::table('expenses')->leftJoin('expense_lines', 'expense_lines.expense_id', '=', 'expenses.id')
                    ->where('project_id', $project->id)->selectRaw('COALESCE(expense_lines.year, expenses.year) as economic_year')->pluck('economic_year'))
                ->unique()->values();
            if ($years->count() === 1) {
                DB::table('projects')->where('id', $project->id)->update(['year' => $years->first()]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropForeign(['tenant_id', 'source_project_id']);
            $table->dropUnique(['tenant_id', 'year', 'source_project_id']);
            $table->dropColumn(['year', 'source_project_id']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('expense_lines', function (Blueprint $table) {
            $table->date('period_starts_on')->nullable();
            $table->date('period_ends_on')->nullable();
            $table->unsignedSmallInteger('year')->nullable();
        });

        DB::table('expenses')->orderBy('id')->chunkById(200, function ($expenses): void {
            foreach ($expenses as $expense) {
                DB::table('expense_lines')->where('expense_id', $expense->id)->update([
                    'period_starts_on' => $expense->period_starts_on,
                    'period_ends_on' => $expense->period_ends_on,
                    'year' => $expense->year,
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('expense_lines', function (Blueprint $table) {
            $table->dropColumn(['period_starts_on', 'period_ends_on', 'year']);
        });
    }
};

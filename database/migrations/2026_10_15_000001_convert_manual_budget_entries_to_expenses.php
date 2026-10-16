<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function (): void {
            foreach (DB::table('budget_entries')->where('type', 'manual')->orderBy('id')->lockForUpdate()->get() as $entry) {
                $year = DB::table('budget_years')->where('tenant_id', $entry->tenant_id)->where('id', $entry->budget_year_id)->sole();
                $now = now();
                $expenseId = DB::table('expenses')->insertGetId([
                    'tenant_id' => $entry->tenant_id, 'title' => $entry->description, 'year' => $year->year,
                    'allocated_amount' => $entry->manual_allocated, 'actual_amount' => $entry->manual_actual,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
                $position = 0;
                foreach (['allocated' => 'manual_allocated', 'actual' => 'manual_actual'] as $type => $field) {
                    if ($entry->{$field} !== null) {
                        DB::table('expense_lines')->insert([
                            'expense_id' => $expenseId, 'description' => $entry->description, 'type' => $type,
                            'unit_price' => $entry->{$field}, 'quantity' => 1, 'total' => $entry->{$field}, 'position' => $position++,
                            'created_at' => $now, 'updated_at' => $now,
                        ]);
                    }
                }
                if ($entry->cost_center_id !== null) {
                    DB::table('cost_center_expense')->insert(['cost_center_id' => $entry->cost_center_id, 'expense_id' => $expenseId]);
                }
                DB::table('budget_entries')->where('id', $entry->id)->update([
                    'type' => 'expense', 'expense_id' => $expenseId,
                    'description' => null, 'manual_allocated' => null, 'manual_actual' => null,
                ]);
            }
        });
    }

    public function down(): void
    {
        // Converted expenses remain real archive records; never remove economic data on rollback.
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expense_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('expense_id')->constrained()->cascadeOnDelete();
            $table->string('description');
            $table->string('type');
            $table->decimal('unit_price', 14, 2);
            $table->decimal('quantity', 10, 4)->default(1);
            $table->decimal('total', 14, 2);
            $table->unsignedInteger('position');
            $table->timestamps();
            $table->index(['expense_id', 'position']);
        });

        // Preserve existing amounts as individual lines, including explicit zeroes.
        DB::table('expenses')->orderBy('id')->chunkById(200, function ($expenses): void {
            foreach ($expenses as $expense) {
                $position = 0;
                foreach (['allocated' => 'allocated_amount', 'actual' => 'actual_amount'] as $type => $field) {
                    if ($expense->{$field} !== null) {
                        DB::table('expense_lines')->insert([
                            'expense_id' => $expense->id,
                            'description' => $expense->title,
                            'type' => $type,
                            'unit_price' => $expense->{$field},
                            'quantity' => 1,
                            'total' => $expense->{$field},
                            'position' => $position++,
                            'created_at' => $expense->created_at,
                            'updated_at' => $expense->updated_at,
                        ]);
                    }
                }
            }
        });

        // With line sums, a type without lines contributes zero.
        DB::table('expenses')->update([
            'allocated_amount' => DB::raw('COALESCE(allocated_amount, 0)'),
            'actual_amount' => DB::raw('COALESCE(actual_amount, 0)'),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('expense_lines');
    }
};

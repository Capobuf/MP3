<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['description', 'type', 'unit_price', 'quantity', 'total', 'position'])]
class ExpenseLine extends Model
{
    /** @return BelongsTo<Expense, $this> */
    public function expense(): BelongsTo
    {
        return $this->belongsTo(Expense::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['unit_price' => 'decimal:2', 'quantity' => 'decimal:4', 'total' => 'decimal:2', 'position' => 'integer'];
    }
}

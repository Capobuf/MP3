<?php

namespace App\Models;

use App\Support\Money;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string|null $allocated_amount
 * @property string|null $actual_amount
 */
#[Fillable(['title', 'year', 'vendor_id', 'contract_id', 'project_id', 'allocated_amount', 'actual_amount', 'notes'])]
class Expense extends Model
{
    /** @return HasMany<ExpenseLine, $this> */
    public function lines(): HasMany
    {
        return $this->hasMany(ExpenseLine::class)->orderBy('position')->orderBy('id');
    }

    /** @return BelongsTo<Tenant, $this> */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** @return BelongsTo<Vendor, $this> */
    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    /** @return BelongsTo<Contract, $this> */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'vendor_id' => 'integer',
            'contract_id' => 'integer',
            'project_id' => 'integer',
            'year' => 'integer',
            'allocated_amount' => 'decimal:2',
            'actual_amount' => 'decimal:2',
        ];
    }

    protected $appends = ['variance'];

    public function getVarianceAttribute(): ?string
    {
        if ($this->allocated_amount === null || $this->actual_amount === null) {
            return null;
        }

        return Money::decimal(
            Money::cents($this->actual_amount) - Money::cents($this->allocated_amount)
        );
    }
}

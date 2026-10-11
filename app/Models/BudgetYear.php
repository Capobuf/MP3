<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** @property list<string>|null $dismissed_sources */
#[Fillable(['year', 'dismissed_sources', 'structure_copied'])]
class BudgetYear extends Model
{
    /** @return BelongsTo<Tenant, $this> */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** @return HasMany<BudgetEntry, $this> */
    public function entries(): HasMany
    {
        return $this->hasMany(BudgetEntry::class)->orderBy('position')->orderBy('id');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['year' => 'integer', 'dismissed_sources' => 'array', 'structure_copied' => 'boolean'];
    }
}

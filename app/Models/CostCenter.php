<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'parent_id'])]
class CostCenter extends Model
{
    /** @return BelongsTo<Tenant, $this> */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** @return BelongsTo<CostCenter, $this> */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    /** @return HasMany<CostCenter, $this> */
    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('name');
    }

    /** @return BelongsToMany<Expense, $this> */
    public function expenses(): BelongsToMany
    {
        return $this->belongsToMany(Expense::class);
    }

    /** @return BelongsToMany<Project, $this> */
    public function projects(): BelongsToMany
    {
        return $this->belongsToMany(Project::class);
    }

    /** @return BelongsToMany<Contract, $this> */
    public function contracts(): BelongsToMany
    {
        return $this->belongsToMany(Contract::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['parent_id' => 'integer'];
    }
}

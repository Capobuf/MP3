<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug'])]
class Tenant extends Model
{
    protected static function booted(): void
    {
        static::created(function (Tenant $tenant): void {
            foreach (ProjectStatus::DEFAULTS as $key => $name) {
                $tenant->projectStatuses()->create(['key' => $key, 'name' => $name]);
            }
        });
    }

    /** @return HasMany<ProjectStatus, $this> */
    public function projectStatuses(): HasMany
    {
        return $this->hasMany(ProjectStatus::class);
    }

    /** @return HasMany<BudgetYear, $this> */
    public function budgetYears(): HasMany
    {
        return $this->hasMany(BudgetYear::class);
    }

    /** @return HasMany<BudgetEntry, $this> */
    public function budgetEntries(): HasMany
    {
        return $this->hasMany(BudgetEntry::class);
    }

    /** @return HasMany<Attachment, $this> */
    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }

    /** @return HasMany<CostCenter, $this> */
    public function costCenters(): HasMany
    {
        return $this->hasMany(CostCenter::class);
    }

    /**
     * @return BelongsToMany<User, $this>
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class);
    }

    /** @return HasMany<Vendor, $this> */
    public function vendors(): HasMany
    {
        return $this->hasMany(Vendor::class);
    }

    /** @return HasMany<Contract, $this> */
    public function contracts(): HasMany
    {
        return $this->hasMany(Contract::class);
    }

    /** @return HasMany<Project, $this> */
    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    /** @return HasMany<Expense, $this> */
    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }
}

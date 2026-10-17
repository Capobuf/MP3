<?php

namespace App\Models;

use App\Models\Concerns\HasCostCenters;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use RyanChandler\Comments\Concerns\HasComments;

#[Fillable(['name', 'description', 'status', 'starts_on', 'ends_on', 'year', 'source_project_id'])]
class Project extends Model
{
    use HasComments;
    use HasCostCenters;

    /** @param Builder<Project> $query
     * @return Builder<Project>
     */
    public function scopeForYear(Builder $query, int $year): Builder
    {
        return $query->where(fn ($query) => $query->where('projects.year', $year)->orWhereNull('projects.year'));
    }

    /** @return HasMany<Attachment, $this> */
    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }

    /** @return BelongsTo<Tenant, $this> */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** @return HasMany<Expense, $this> */
    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'year' => 'integer',
            'source_project_id' => 'integer',
            'starts_on' => 'date:Y-m-d',
            'ends_on' => 'date:Y-m-d',
        ];
    }
}

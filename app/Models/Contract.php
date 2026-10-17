<?php

namespace App\Models;

use App\Models\Concerns\HasCostCenters;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use RyanChandler\Comments\Concerns\HasComments;

#[Fillable(['vendor_id', 'name', 'reference_amount', 'starts_on', 'ends_on', 'notes', 'year', 'source_contract_id'])]
class Contract extends Model
{
    use HasComments;
    use HasCostCenters;

    /** @var list<string> */
    protected $appends = ['display_name'];

    /** @return Attribute<non-empty-string, never> */
    protected function displayName(): Attribute
    {
        return Attribute::get(fn (): string => $this->name === null || $this->name === '' ? 'Contratto senza nome' : $this->name);
    }

    /** @param Builder<Contract> $query
     * @return Builder<Contract>
     */
    public function scopeForYear(Builder $query, int $year): Builder
    {
        return $query->where(fn ($query) => $query->where('contracts.year', $year)->orWhereNull('contracts.year'));
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

    /** @return BelongsTo<Vendor, $this> */
    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
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
            'vendor_id' => 'integer',
            'year' => 'integer',
            'source_contract_id' => 'integer',
            'reference_amount' => 'decimal:2',
            'starts_on' => 'date:Y-m-d',
            'ends_on' => 'date:Y-m-d',
        ];
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

#[Fillable(['original_name', 'disk', 'path', 'mime_type', 'size_bytes', 'uploaded_by'])]
class Attachment extends Model
{
    protected $hidden = ['disk', 'path'];

    protected static function booted(): void
    {
        static::saving(function (Attachment $attachment): void {
            $owners = array_filter([
                'contract_id' => $attachment->contract_id,
                'expense_id' => $attachment->expense_id,
                'project_id' => $attachment->project_id,
            ], fn ($id) => $id !== null);
            if (count($owners) !== 1) {
                throw new LogicException('An attachment must belong to exactly one record.');
            }
            $relation = match (array_key_first($owners)) {
                'contract_id' => $attachment->contract(),
                'expense_id' => $attachment->expense(),
                'project_id' => $attachment->project(),
            };
            if (! $relation->where('tenant_id', $attachment->tenant_id)->exists()) {
                throw new LogicException('The attachment and its owner must belong to the same tenant.');
            }
        });
    }

    /** @return BelongsTo<Tenant, $this> */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** @return BelongsTo<Contract, $this> */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    /** @return BelongsTo<Expense, $this> */
    public function expense(): BelongsTo
    {
        return $this->belongsTo(Expense::class);
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<User, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['size_bytes' => 'integer'];
    }
}

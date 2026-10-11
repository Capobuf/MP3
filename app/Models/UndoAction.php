<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $tenant_id
 * @property int $user_id
 * @property string $label
 * @property string $before_hash
 * @property string $after_hash
 * @property array<string, array<string, array{before: array<string, mixed>|null, after: array<string, mixed>|null}>> $changes
 * @property list<array{disk: string, path: string, backup: string}> $files
 * @property Carbon|null $undone_at
 * @property Carbon|null $redo_expires_at
 */
class UndoAction extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['changes' => 'array', 'files' => 'array', 'undone_at' => 'datetime', 'redo_expires_at' => 'datetime'];
    }
}

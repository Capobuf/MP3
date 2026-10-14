<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

#[Fillable(['key', 'name'])]
class ProjectStatus extends Model
{
    public const DEFAULTS = ['pianificato' => 'Pianificato', 'attivo' => 'Attivo', 'completato' => 'Completato'];

    protected static function booted(): void
    {
        static::creating(function (ProjectStatus $status): void {
            $status->key ??= (string) Str::uuid();
        });
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Attributes\WithoutIncrementing;
use Illuminate\Database\Eloquent\Model;

/** @property array<string, mixed>|null $token */
#[Fillable(['id', 'token', 'account_id', 'account_email', 'last_error', 'backup_enabled', 'backup_last_name', 'backup_last_status', 'backup_last_message', 'backup_last_attempted_at'])]
#[Hidden(['token'])]
#[WithoutIncrementing]
class PlatformDriveSetting extends Model
{
    protected function casts(): array
    {
        return ['token' => 'encrypted:array', 'backup_enabled' => 'boolean'];
    }
}

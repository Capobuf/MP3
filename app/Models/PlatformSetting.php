<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\WithoutIncrementing;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['id', 'attachment_max_size_kb'])]
#[WithoutIncrementing]
class PlatformSetting extends Model
{
    protected function casts(): array
    {
        return ['attachment_max_size_kb' => 'integer'];
    }

    public static function attachmentMaxSizeKb(): int
    {
        return static::query()->find(1)->attachment_max_size_kb ?? (int) config('attachments.max_size_kb');
    }
}

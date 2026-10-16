<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Attributes\WithoutIncrementing;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['id', 'host', 'port', 'scheme', 'username', 'password', 'from_address', 'from_name'])]
#[Hidden(['password'])]
#[WithoutIncrementing]
class PlatformMailSetting extends Model
{
    protected function casts(): array
    {
        return ['port' => 'integer', 'password' => 'encrypted'];
    }
}

<?php

namespace App\Policies;

use App\Models\Tenant;
use App\Models\User;

class TenantPolicy
{
    public function view(User $user, Tenant $tenant): bool
    {
        return $user->is_active && ($user->is_super_admin
            || (($user->is_platform_admin || $user->tenants()->count() === 1)
                && $user->tenants()->whereKey($tenant->getKey())->exists()));
    }
}

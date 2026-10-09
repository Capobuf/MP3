<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use Inertia\Inertia;
use Inertia\Response;

class PlatformController extends Controller
{
    public function __invoke(): Response
    {
        return Inertia::render('platform/index', [
            'tenants' => Tenant::query()
                ->with(['users' => fn ($query) => $query
                    ->where('is_super_admin', false)
                    ->orderBy('name')
                    ->select('users.id', 'name', 'email')])
                ->orderBy('name')
                ->get(['id', 'name', 'slug']),
            'users' => User::query()
                ->with(['tenants' => fn ($query) => $query
                    ->orderBy('name')
                    ->select('tenants.id', 'name', 'slug')])
                ->orderBy('name')
                ->get(['id', 'name', 'email', 'email_verified_at', 'is_super_admin']),
        ]);
    }
}

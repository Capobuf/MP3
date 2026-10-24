<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Request;
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
            'users' => User::query()->where('is_super_admin', false)->orderBy('name')->get(['id', 'name', 'email']),
        ]);
    }

    public function users(Request $request): Response
    {
        return Inertia::render('platform/users', [
            'tenants' => Tenant::orderBy('name')->get(['id', 'name', 'slug']),
            'users' => User::query()
                ->with(['tenants' => fn ($query) => $query
                    ->orderBy('name')
                    ->select('tenants.id', 'name', 'slug')])
                ->orderBy('name')
                ->get(['id', 'name', 'email', 'email_verified_at', 'avatar_path', 'is_super_admin', 'is_platform_admin', 'is_active', 'two_factor_secret', 'two_factor_confirmed_at'])
                ->map(fn (User $user) => [
                    ...$user->makeHidden('two_factor_confirmed_at')->toArray(),
                    'two_factor_enabled' => $user->hasEnabledTwoFactorAuthentication(),
                    'can_disable_mfa' => $request->user()->is_super_admin && ! $user->is_super_admin && ! $request->user()->is($user) && $user->two_factor_secret !== null,
                ]),
        ]);
    }
}

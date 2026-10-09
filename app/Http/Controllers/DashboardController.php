<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(Request $request): RedirectResponse|Response
    {
        $user = $request->user();

        if ($user->is_super_admin) {
            return to_route('platform.index');
        }

        $tenants = $user->tenants()
            ->orderBy('name')
            ->get(['tenants.id', 'name', 'slug']);

        if ($tenants->count() === 1) {
            return to_route('tenant.dashboard', $tenants->first());
        }

        return Inertia::render('dashboard', [
            'tenants' => $tenants,
        ]);
    }
}

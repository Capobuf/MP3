<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;

class TenantUserController extends Controller
{
    public function store(Request $request, Tenant $tenant): RedirectResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $user = User::query()->where('is_super_admin', false)->findOrFail($validated['user_id']);
        $tenant->users()->syncWithoutDetaching($user);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Tenant access granted.')]);

        return to_route('platform.index');
    }

    public function destroy(Tenant $tenant, User $user): RedirectResponse
    {
        $tenant->users()->detach($user);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Tenant access removed.')]);

        return to_route('platform.index');
    }
}

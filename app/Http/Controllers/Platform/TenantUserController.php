<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use App\Services\UserAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class TenantUserController extends Controller
{
    public function store(Request $request, Tenant $tenant, UserAccess $access): RedirectResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        DB::transaction(function () use ($validated, $tenant, $access) {
            $user = User::whereKey($validated['user_id'])->lockForUpdate()->firstOrFail();
            /** @var list<int> $ids */
            $ids = $user->tenants()->pluck('tenants.id')->push($tenant->id)->unique()->values()->all();
            $access->syncTenants($user, $ids);
        });

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Tenant access granted.')]);

        return to_route('platform.index');
    }

    public function destroy(Tenant $tenant, User $user): RedirectResponse
    {
        DB::transaction(function () use ($tenant, $user) {
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_if($user->is_super_admin, 403);
            $user->tenants()->detach($tenant->id);
        });

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Tenant access removed.')]);

        return to_route('platform.index');
    }
}

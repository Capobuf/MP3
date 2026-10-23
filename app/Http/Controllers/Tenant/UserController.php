<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use App\Services\UserInvitations;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public function index(Tenant $tenant): Response
    {
        return Inertia::render('tenants/settings/users', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'users' => $tenant->users()->orderBy('name')->get(['users.id', 'name', 'email', 'email_verified_at', 'is_super_admin', 'is_active']),
        ]);
    }

    public function store(Request $request, Tenant $tenant, UserInvitations $invitations): RedirectResponse
    {
        $request->merge(['email' => Str::lower(trim((string) $request->input('email')))]);
        $data = $request->validate(['email' => ['required', 'string', 'email', 'max:255']]);
        [$user, $new, $attached] = DB::transaction(function () use ($invitations, $data, $tenant): array {
            $user = $invitations->findOrCreate($data['email']);
            $new = $user->wasRecentlyCreated;
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            if ($user->canManagePlatform() || $user->tenants()->where('tenants.id', '!=', $tenant->id)->exists()) {
                throw ValidationException::withMessages([
                    'email' => 'Questo account non può essere invitato in questa azienda. Contatta l’amministratore di Obake.',
                ]);
            }
            if ($user->tenants()->whereKey($tenant->id)->exists()) {
                return [$user, $new, false];
            }
            $user->tenants()->sync([$tenant->id]);

            return [$user, $new, true];
        });
        if (! $attached) {
            Inertia::flash('toast', ['type' => 'info', 'message' => 'L’utente appartiene già a questa azienda. Può usare “Password dimenticata?” per recuperare l’accesso.']);

            return to_route('tenant.users.index', $tenant);
        }

        $invitations->send($user, $new, $tenant);
        Inertia::flash('toast', ['type' => 'success', 'message' => 'Accesso assegnato e email inviata al destinatario.']);

        return to_route('tenant.users.index', $tenant);
    }

    public function destroy(Request $request, Tenant $tenant, User $user): RedirectResponse
    {
        // Scoped route binding also ensures the user belongs to this tenant.
        if (! $user->is_super_admin) {
            DB::transaction(function () use ($user, $tenant) {
                User::whereKey($user->id)->lockForUpdate()->firstOrFail()->tenants()->detach($tenant->id);
            });
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => $user->is_super_admin
            ? 'Il super admin conserva l’accesso a tutte le aziende.'
            : 'Accesso all’azienda rimosso.']);

        return $request->user()->is($user) && ! $user->is_super_admin
            ? to_route('dashboard')
            : to_route('tenant.users.index', $tenant);
    }
}

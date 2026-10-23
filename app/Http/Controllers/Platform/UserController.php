<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\UserAccess;
use App\Services\UserInvitations;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class UserController extends Controller
{
    public function store(Request $request, UserInvitations $invitations): RedirectResponse
    {
        $request->merge([
            'email' => Str::lower(trim((string) $request->input('email'))),
        ]);

        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'tenant_ids' => ['sometimes', 'array'],
            'tenant_ids.*' => ['required', 'integer', 'distinct', 'exists:tenants,id'],
        ]);

        $user = DB::transaction(function () use ($invitations, $validated): User {
            $user = $invitations->findOrCreate($validated['email'], $validated['name'] ?? null);
            if (! $user->wasRecentlyCreated) {
                throw ValidationException::withMessages([
                    'email' => 'Questo account esiste già. Gestiscilo dalla sua riga nella pagina Utenti; l’abilitazione ad Amministrazione richiede una conferma esplicita.',
                ]);
            }
            $user->is_platform_admin = true;
            $user->save();
            $user->tenants()->sync($validated['tenant_ids'] ?? []);

            return $user;
        });

        $invitations->send($user, true);

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Invito inviato. Il destinatario potrà impostare la propria password.']);

        return to_route('platform.users.index');
    }

    public function tenants(Request $request, User $user, UserAccess $access): RedirectResponse
    {
        $data = $request->validate([
            'tenant_ids' => ['present', 'array'],
            'tenant_ids.*' => ['required', 'integer', 'distinct', 'exists:tenants,id'],
        ]);
        DB::transaction(function () use ($user, $data, $access) {
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $access->syncTenants($user, $data['tenant_ids']);
        });

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Aziende aggiornate.']);

        return back();
    }

    public function promote(Request $request, User $user): RedirectResponse
    {
        $request->validate(['confirmed' => ['required', 'accepted']]);
        abort_if($request->user()->is($user), 403);
        DB::transaction(function () use ($user) {
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_if($user->is_super_admin, 403);
            $user->is_platform_admin = true;
            $user->save();
        });
        Inertia::flash('toast', ['type' => 'success', 'message' => 'Accesso ad Amministrazione abilitato.']);

        return back();
    }

    public function status(Request $request, User $user, UserAccess $access): RedirectResponse
    {
        $data = $request->validate(['is_active' => ['required', 'boolean']]);
        abort_if($request->user()->is($user), 403);
        DB::transaction(function () use ($user, $data, $access) {
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_if($user->is_super_admin, 403);
            $user->is_active = $data['is_active'];
            $user->save();
            if (! $user->is_active) {
                $access->revokeSessions($user);
            }
        });
        Inertia::flash('toast', ['type' => 'success', 'message' => $data['is_active'] ? 'Utente riattivato.' : 'Utente bloccato.']);

        return back();
    }

    public function destroy(Request $request, User $user, UserAccess $access): RedirectResponse
    {
        abort_if($request->user()->is($user), 403);
        $access->delete($user);
        Inertia::flash('toast', ['type' => 'success', 'message' => 'Account eliminato.']);

        return back();
    }
}

<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Services\UserInvitations;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
        ]);

        $user = $invitations->findOrCreate($validated['email'], $validated['name'] ?? null);
        if (! $user->wasRecentlyCreated) {
            throw ValidationException::withMessages([
                'email' => 'Questo account esiste già. Puoi assegnarlo agli ambienti dalla gestione attuale. Per impostare o recuperare la password, il destinatario può usare “Password dimenticata?”.',
            ]);
        }

        $invitations->send($user, true);

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Invito inviato. Il destinatario potrà impostare la propria password.']);

        return to_route('platform.users.index');
    }
}

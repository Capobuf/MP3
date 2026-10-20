<?php

namespace App\Http\Controllers;

use App\Models\PlatformDriveSetting;
use App\Models\Tenant;
use App\Services\DriveSync;
use App\Services\GoogleDrive;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

class DriveSyncController extends Controller
{
    public function index(DriveSync $sync, GoogleDrive $google, ?Tenant $tenant = null): Response
    {
        $settings = PlatformDriveSetting::query()->find(1);

        return Inertia::render('sync', [
            'tenant' => $tenant?->only('id', 'name', 'slug'),
            'connected' => $settings?->getRawOriginal('token') !== null,
            'configured' => $google->configured(),
            'account' => $tenant === null ? $settings?->account_email : null,
            'connectionError' => $tenant === null ? $settings?->last_error : null,
            'redirectUri' => $tenant === null ? $google->redirectUri() : null,
            'rootFolderId' => $tenant === null ? $sync->objectId('root') : null,
            'tenants' => ($tenant ? collect([$tenant]) : Tenant::query()->orderBy('name')->get())->map(fn ($item) => [
                ...$item->only('id', 'name', 'slug'), ...$sync->state($item),
            ]),
        ]);
    }

    public function connect(Request $request, DriveSync $sync, GoogleDrive $google): \Symfony\Component\HttpFoundation\Response
    {
        try {
            $url = $sync->locked(function () use ($request, $google): string {
                $state = Str::random(64);
                $request->session()->put('google_drive_oauth', ['state' => $state, 'expires' => now()->addMinutes(10)->timestamp]);

                return $google->authorizationUrl($state);
            });
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['sync' => $error->getMessage()]);
        }

        return Inertia::location($url);
    }

    public function callback(Request $request, DriveSync $sync, GoogleDrive $google): RedirectResponse
    {
        $pending = $request->session()->pull('google_drive_oauth');
        try {
            if (! is_array($pending) || ! is_string($request->query('state')) || ! hash_equals($pending['state'], $request->query('state')) || $pending['expires'] < now()->timestamp) {
                $google->fail('Risposta OAuth non valida o scaduta. Avvia nuovamente il collegamento Google.');
            }
            if ($request->filled('error') || ! is_string($request->query('code')) || $request->query('code') === '') {
                $google->fail('Consenso Google negato o codice OAuth mancante. Avvia nuovamente il collegamento.');
            }
            $sync->locked(function () use ($request, $google, $sync): void {
                $google->connect($request->query('code'));
                try {
                    $sync->initialize();
                } catch (\Throwable) {
                    $google->fail('Account collegato, ma creazione/verifica della cartella MP3 fallita. Verifica accesso Drive e ricollega l’account.');
                }
            });
        } catch (RuntimeException $error) {
            return to_route('platform.sync.index')->withErrors(['sync' => $error->getMessage()]);
        }

        return to_route('platform.sync.index');
    }

    public function disconnect(Request $request, DriveSync $sync, GoogleDrive $google): RedirectResponse
    {
        try {
            $sync->locked(fn () => $google->disconnect());
            $request->session()->forget('google_drive_oauth');
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['sync' => $error->getMessage()]);
        }

        return back();
    }

    public function update(Request $request, Tenant $tenant, DriveSync $sync): RedirectResponse
    {
        $data = $request->validate(['enabled' => ['required', 'boolean']]);
        try {
            $sync->enable($tenant, (bool) $data['enabled']);
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['sync' => $error->getMessage()]);
        }

        return back();
    }

    public function store(Tenant $tenant, DriveSync $sync): RedirectResponse
    {
        try {
            $sync->sync($tenant);
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['sync' => $error->getMessage()]);
        }

        return back();
    }
}

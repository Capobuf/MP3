<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\AttachmentFiles;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class IdentityController extends Controller
{
    public function edit(Tenant $tenant): Response
    {
        return Inertia::render('tenants/settings/identity', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'logoUrl' => $tenant->logoUrl(),
        ]);
    }

    public function update(Request $request, Tenant $tenant, AttachmentFiles $files): RedirectResponse
    {
        $request->validate(['logo' => ['required', 'image', 'mimes:png,jpg,jpeg', 'extensions:png,jpg,jpeg', 'max:2048', 'dimensions:max_width=4096,max_height=4096']]);
        $path = null;
        try {
            DB::transaction(function () use ($request, $tenant, $files, &$path): void {
                $owner = Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
                $path = $request->file('logo')->store($owner->id.'/logos', 'attachments');
                if (! is_string($path)) {
                    throw new \RuntimeException('Logo write failed.');
                }
                $previous = $owner->logo_path;
                $owner->logo_path = $path;
                $owner->saveOrFail();
                if ($previous) {
                    DB::afterCommit(fn () => $files->cleanup('attachments', $previous));
                }
            });
        } catch (Throwable $exception) {
            if (is_string($path)) {
                $files->cleanup('attachments', $path);
            }
            report($exception);
            throw ValidationException::withMessages(['logo' => 'Caricamento non riuscito. Il logo precedente è stato conservato.']);
        }

        Inertia::flash('toast', ['type' => $files->cleanupFailed ? 'warning' : 'success', 'message' => $files->cleanupFailed
            ? 'Logo aggiornato, ma la rimozione del file precedente non è riuscita. Contatta l’amministratore.'
            : 'Logo azienda aggiornato.']);

        return back();
    }

    public function destroy(Tenant $tenant, AttachmentFiles $files): RedirectResponse
    {
        DB::transaction(function () use ($tenant, $files): void {
            $owner = Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            $previous = $owner->logo_path;
            $owner->logo_path = null;
            $owner->saveOrFail();
            if ($previous) {
                DB::afterCommit(fn () => $files->cleanup('attachments', $previous));
            }
        });

        Inertia::flash('toast', ['type' => $files->cleanupFailed ? 'warning' : 'success', 'message' => $files->cleanupFailed
            ? 'Logo rimosso dal tenant, ma la cancellazione del file non è riuscita. Contatta l’amministratore.'
            : 'Logo azienda rimosso.']);

        return back();
    }

    public function show(Tenant $tenant): StreamedResponse
    {
        $disk = Storage::disk('attachments');
        abort_unless($tenant->logo_path && $disk->exists($tenant->logo_path), 404, 'Logo azienda non disponibile.');

        return $disk->response($tenant->logo_path, null, [
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store, max-age=0',
        ], 'inline');
    }
}

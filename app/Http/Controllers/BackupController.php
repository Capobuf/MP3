<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Services\BackupManager;
use App\Services\TenantBackup;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class BackupController extends Controller
{
    public function index(BackupManager $backups, ?Tenant $tenant = null): Response
    {
        return Inertia::render('backups', [
            'tenant' => $tenant?->only('id', 'name', 'slug'),
            'settings' => $backups->settings($tenant),
            'archives' => $backups->archives($tenant),
            'empty' => $tenant !== null && app(TenantBackup::class)->isEmpty($tenant),
            'maxFileKb' => config('platform-backups.upload_max_kb'),
        ]);
    }

    public function store(BackupManager $backups, ?Tenant $tenant = null): RedirectResponse
    {
        try {
            $backups->create($tenant);
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['backup' => $error->getMessage()]);
        }

        return back();
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'frequency' => ['required', 'in:disabled,daily,weekly'],
            'time' => ['required', 'date_format:H:i'],
            'weekday' => ['required', 'integer', 'between:0,6'],
        ]);
        DB::table('backup_settings')->updateOrInsert(['scope' => 'platform'], $data);

        return back();
    }

    public function download(Request $request, BackupManager $backups, ?Tenant $tenant = null): BinaryFileResponse
    {
        $tenant = $request->route('tenant');
        $archive = $request->route('archive');
        abort_unless(is_string($archive), 404);
        abort_unless($tenant === null || $tenant instanceof Tenant, 404);

        return response()->download($backups->path($tenant, $archive), $archive, [
            'Content-Type' => 'application/zip', 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff',
        ])->setPrivate();
    }

    public function restore(Request $request, Tenant $tenant, BackupManager $backups): RedirectResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'extensions:zip', 'mimetypes:application/zip,application/x-zip-compressed', 'max:'.config('platform-backups.upload_max_kb')],
            'confirmation' => ['required', 'accepted'],
        ]);
        $file = $request->file('file');
        abort_unless($file instanceof UploadedFile, 422);
        try {
            $backups->restoreTenant($tenant, $file->getPathname());
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['file' => $error->getMessage()]);
        }

        return back();
    }
}

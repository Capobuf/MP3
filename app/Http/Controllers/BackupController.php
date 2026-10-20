<?php

namespace App\Http\Controllers;

use App\Models\PlatformDriveSetting;
use App\Models\Tenant;
use App\Services\BackupManager;
use App\Services\DriveSync;
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
            'drive' => $tenant === null ? PlatformDriveSetting::query()->find(1)?->only('backup_enabled', 'backup_last_name', 'backup_last_status', 'backup_last_message', 'backup_last_attempted_at') : null,
            'driveCopies' => $tenant === null ? DB::table('drive_objects')->where('account_id', PlatformDriveSetting::query()->find(1)?->account_id)->where('object_key', 'like', 'backup-%')->get(['object_key', 'last_status', 'last_message', 'last_synced_at']) : [],
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
            'drive_enabled' => ['sometimes', 'boolean'],
        ]);
        try {
            app(DriveSync::class)->locked(function () use ($data): void {
                if (array_key_exists('drive_enabled', $data)) {
                    PlatformDriveSetting::query()->updateOrCreate(['id' => 1], ['backup_enabled' => $data['drive_enabled']]);
                }
                unset($data['drive_enabled']);
                DB::table('backup_settings')->updateOrInsert(['scope' => 'platform'], $data);
            });
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['drive_enabled' => $error->getMessage()]);
        }

        return back();
    }

    public function copyToDrive(Request $request, DriveSync $sync): RedirectResponse
    {
        $data = $request->validate(['archive' => ['required', 'string', 'max:240', 'regex:/^[a-zA-Z0-9-]+\.zip$/D']]);
        if (! PlatformDriveSetting::query()->find(1)?->backup_enabled) {
            throw ValidationException::withMessages(['drive' => 'Abilita prima la copia dei backup su Drive.']);
        }
        try {
            $sync->copyBackup($data['archive']);
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['drive' => $error->getMessage()]);
        }

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

    public function destroy(Request $request, BackupManager $backups, ?Tenant $tenant = null): RedirectResponse
    {
        $data = $request->validate([
            'archives' => ['required', 'array', 'min:1'],
            'archives.*' => ['required', 'string', 'distinct', 'max:255', 'regex:/^[a-zA-Z0-9-]+\.zip$/D'],
            'confirmation' => ['required', 'accepted'],
        ]);
        try {
            $backups->delete($tenant, $data['archives']);
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['archives' => $error->getMessage()]);
        }

        return back();
    }
}

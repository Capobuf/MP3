<?php

namespace App\Services;

use App\Models\Tenant;
use App\Support\Backups\BackupArchive;
use App\Support\Backups\BackupBusy;
use App\Support\Backups\BackupLock;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Spatie\Backup\BackupDestination\BackupDestination;
use Spatie\Backup\Tasks\Cleanup\CleanupJob;
use Spatie\Backup\Tasks\Cleanup\CleanupStrategy;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

class BackupManager
{
    public function scope(?Tenant $tenant): string
    {
        return $tenant === null ? 'platform' : 'tenant-'.$tenant->id;
    }

    /** @return array<string, mixed> */
    public function settings(?Tenant $tenant = null): array
    {
        return (array) (DB::table('backup_settings')->where('scope', $this->scope($tenant))->first() ?? (object) [
            'frequency' => 'disabled', 'time' => '02:00', 'weekday' => 1,
            'last_started_at' => null, 'last_finished_at' => null, 'last_status' => null, 'last_message' => null,
        ]);
    }

    public function create(?Tenant $tenant = null): string
    {
        $name = BackupLock::run(fn () => $this->createArchive($tenant));
        if ($tenant === null) {
            $this->copyToDrive($name);
        }

        return $name;
    }

    public function createScheduled(): ?string
    {
        if ($this->dueSlot($this->settings(), now()) === null) {
            return null;
        }
        try {
            $name = BackupLock::run(function (): ?string {
                $slot = $this->dueSlot($this->settings(), now());
                if ($slot === null) {
                    return null;
                }
                DB::table('backup_settings')->where('scope', 'platform')->update(['last_scheduled_slot' => $slot]);

                return $this->createArchive(null);
            });
        } catch (BackupBusy) {
            $message = 'Backup pianificato rinviato: backup o salvataggio in corso. La scadenza verrà riprovata al prossimo ciclo.';
            try {
                BackupLock::run(function () use ($message): void {
                    $settings = $this->settings();
                    if ($this->dueSlot($settings, now()) === null) {
                        return;
                    }
                    // Shared locks allow schedule edits; only update the settings we just read.
                    DB::table('backup_settings')->where('scope', 'platform')->where([
                        'frequency' => $settings['frequency'], 'time' => $settings['time'],
                        'weekday' => $settings['weekday'], 'last_scheduled_slot' => $settings['last_scheduled_slot'],
                    ])->update(['last_status' => 'deferred', 'last_message' => $message]);
                }, false);
            } catch (BackupBusy) {
                // Never write status while another operation owns the exclusive snapshot lock.
            }
            throw new BackupBusy($message);
        }
        if ($name !== null) {
            $this->copyToDrive($name);
        }

        return $name;
    }

    private function createArchive(?Tenant $tenant): string
    {
        $scope = $this->scope($tenant);
        $this->status($scope, 'running', 'Backup in corso.', true);
        $name = now()->format('Y-m-d-H-i-s').'-'.Str::uuid().'.zip';
        $disk = Storage::disk('backups');
        $stage = 'preparazione archivio';
        $mask = umask(0077);
        try {
            BackupArchive::ensureMigrated();
            File::ensureDirectoryExists(storage_path('app/backup-temp'), 0700);
            $disk->makeDirectory('.pending');
            $path = $disk->path('.pending/'.$name);
            if ($tenant === null) {
                $stage = 'dump MySQL e file della piattaforma';
                app(PlatformBackup::class)->create($name);
            } else {
                app(TenantBackup::class)->create($tenant, $path);
            }
            $stage = 'salvataggio archivio verificato';
            $disk->makeDirectory($scope);
            BackupArchive::check($disk->move('.pending/'.$name, $scope.'/'.$name), 'Salvataggio archivio fallito.');
            $stage = 'rotazione archivi';
            $this->clean($scope);
            $this->status($scope, 'success', 'Backup verificato e rotazione completata.');

            return $name;
        } catch (Throwable $error) {
            $disk->delete('.pending/'.$name);
            // Never persist driver exceptions: SQL and dump output can expose secrets or account data.
            $message = 'Backup non completato: '.$stage.'. '.($error::class === RuntimeException::class ? $error->getMessage() : 'Verifica spazio, permessi e compatibilità dei dati.');
            $this->status($scope, 'failed', $message);
            throw new RuntimeException($message);
        } finally {
            umask($mask);
        }
    }

    private function copyToDrive(string $name): void
    {
        try {
            app(DriveSync::class)->copyBackup($name);
        } catch (RuntimeException) {
            // The remote outcome is recorded separately; a verified local archive stays successful.
        }
    }

    public function restoreTenant(Tenant $tenant, string $path): void
    {
        BackupLock::run(function () use ($tenant, $path): void {
            $scope = $this->scope($tenant);
            $this->status($scope, 'running', 'Ripristino in corso.', true);
            try {
                app(TenantBackup::class)->restore($tenant, $path);
                $this->status($scope, 'success', 'Ripristino completato. Gli account nuovi accedono tramite recupero password.');
            } catch (Throwable $error) {
                $message = $error::class === RuntimeException::class ? $error->getMessage() : 'Archivio non valido o ripristino fallito. Nessun dato importato.';
                $this->status($scope, 'failed', $message);
                throw new RuntimeException($message);
            }
        });
    }

    private function status(string $scope, string $status, string $message, bool $started = false): void
    {
        DB::table('backup_settings')->updateOrInsert(['scope' => $scope], [
            'last_status' => $status, 'last_message' => $message,
            ...($started ? ['last_started_at' => now(), 'last_finished_at' => null] : ['last_finished_at' => now()]),
        ]);
    }

    public function clean(string $scope): void
    {
        (new CleanupJob(collect([BackupDestination::create('backups', $scope)]), app(CleanupStrategy::class)))->run();
    }

    /** @param list<string> $names */
    public function delete(?Tenant $tenant, array $names): void
    {
        BackupLock::run(function () use ($tenant, $names): void {
            // Validate the whole selection before removing any archive.
            try {
                foreach ($names as $name) {
                    $this->path($tenant, $name);
                }
            } catch (NotFoundHttpException) {
                throw new RuntimeException('Un archivio selezionato non è più disponibile. Aggiorna l’elenco: nessun archivio è stato eliminato.');
            }
            try {
                $paths = array_map(fn ($name) => $this->scope($tenant).'/'.$name, $names);
                BackupArchive::check(Storage::disk('backups')->delete($paths), 'Eliminazione fallita.');
            } catch (Throwable) {
                throw new RuntimeException('Eliminazione non completata. Alcuni archivi potrebbero essere già stati rimossi: aggiorna l’elenco e riprova.');
            }
        });
    }

    /** @return array<int, array{name: string, size: int, created_at: string}> */
    public function archives(?Tenant $tenant = null): array
    {
        $disk = Storage::disk('backups');

        return collect($disk->files($this->scope($tenant)))->filter(fn ($path) => str_ends_with($path, '.zip'))
            ->sortDesc()->map(fn ($path) => ['name' => basename($path), 'size' => $disk->size($path), 'created_at' => date(DATE_ATOM, $disk->lastModified($path))])->values()->all();
    }

    public function path(?Tenant $tenant, string $name): string
    {
        abort_unless(preg_match('/^[a-zA-Z0-9-]+\.zip$/D', $name) === 1, 404);
        $path = $this->scope($tenant).'/'.$name;
        abort_unless(Storage::disk('backups')->exists($path), 404);

        return Storage::disk('backups')->path($path);
    }

    /** @param array<string, mixed> $settings */
    public function dueSlot(array $settings, CarbonInterface $now): ?string
    {
        if (! in_array($settings['frequency'], ['daily', 'weekly'], true)) {
            return null;
        }
        $now = $now->copy()->timezone('Europe/Rome');
        $date = $now->copy()->startOfDay();
        if ($settings['frequency'] === 'weekly') {
            $date = $date->subDays(($date->dayOfWeek - (int) $settings['weekday'] + 7) % 7);
        }
        if ($date->copy()->setTimeFromTimeString($settings['time'])->isAfter($now)) {
            $date = $date->subDays($settings['frequency'] === 'weekly' ? 7 : 1);
        }
        $slot = $date->format('Y-m-d').' '.$settings['time'];

        return ($settings['last_scheduled_slot'] ?? null) === $slot ? null : $slot;
    }
}

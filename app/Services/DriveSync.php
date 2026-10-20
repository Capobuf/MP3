<?php

namespace App\Services;

use App\Models\PlatformDriveSetting;
use App\Models\Tenant;
use App\Support\Backups\BackupLock;
use Closure;
use Google\Http\MediaFileUpload;
use Google\Service\Drive;
use Google\Service\Drive\DriveFile;
use Google\Service\Exception as GoogleException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Maatwebsite\Excel\Facades\Excel;
use RuntimeException;
use Throwable;

class DriveSync
{
    private const FOLDER = 'application/vnd.google-apps.folder';

    private const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    /** @template T
     * @param  Closure(): T  $callback
     * @return T
     */
    public function locked(Closure $callback): mixed
    {
        return BackupLock::run(function () use ($callback) {
            $handle = fopen(storage_path('framework/drive-sync.lock'), 'c');
            if ($handle === false) {
                throw new RuntimeException('Impossibile aprire il blocco della sincronizzazione Drive.');
            }
            try {
                if (! flock($handle, LOCK_EX | LOCK_NB)) {
                    throw new RuntimeException('Operazione Drive già in corso. Riprova al termine.');
                }

                return $callback();
            } finally {
                flock($handle, LOCK_UN);
                fclose($handle);
            }
        }, false);
    }

    public function initialize(): void
    {
        $this->folder(app(GoogleDrive::class)->drive(), 'root', 'MP3');
    }

    /** @return array{id: string|null, name: string}|null */
    public function destination(): ?array
    {
        $root = DB::table('drive_objects')->where('account_id', PlatformDriveSetting::query()->find(1)?->account_id)->where('object_key', 'root')->first();

        return $root ? ['id' => $root->parent_id, 'name' => $root->parent_name ?? 'Il mio Drive'] : null;
    }

    private function destinationFolder(Drive $drive, string $id): DriveFile
    {
        $folder = $drive->files->get($id, ['fields' => 'id,name,mimeType,trashed,driveId,capabilities(canAddChildren)']);
        if ($folder->getMimeType() !== self::FOLDER || $folder->getTrashed() || ! $folder->getCapabilities()?->getCanAddChildren()) {
            throw new RuntimeException('Scegli una cartella accessibile in cui puoi salvare file.');
        }
        if ($folder->getDriveId()) {
            throw new RuntimeException('Scegli una cartella in Il mio Drive: Google non consente questo spostamento verso un Drive condiviso.');
        }

        return $folder;
    }

    public function selectDestination(string $id): void
    {
        $this->locked(function () use ($id): void {
            try {
                $drive = app(GoogleDrive::class)->drive();
                $destination = $this->destinationFolder($drive, $id);
                $object = $this->object($drive, 'root');
                if ($id === $object->file_id) {
                    throw new RuntimeException('Scegli la cartella che deve contenere MP3.');
                }
                if (! $object->created) {
                    $this->folder($drive, 'root', 'MP3');
                }
                // Read the actual parents so a retry also recovers a move whose response was lost.
                $root = $this->remote($drive, $object, self::FOLDER, null);
                if ($root === null) {
                    throw new RuntimeException('Cartella MP3 non disponibile. Ricollega Google e riprova.');
                }
                $parents = (array) $root->getParents();
                if (! in_array($id, $parents, true)) {
                    $moved = $drive->files->update($object->file_id, new DriveFile, [
                        'addParents' => $id, 'removeParents' => implode(',', $parents), 'fields' => 'id,parents',
                    ]);
                    if ($moved->getId() !== $object->file_id || ! in_array($id, $moved->getParents() ?? [], true)) {
                        throw new RuntimeException('Google non ha confermato lo spostamento della cartella MP3.');
                    }
                }
                DB::table('drive_objects')->where('id', $object->id)->update(['parent_id' => $id, 'parent_name' => $destination->getName()]);
            } catch (Throwable $error) {
                throw new RuntimeException($this->error('scelta della cartella', $error), previous: $error);
            }
        });
    }

    /** @return array<string, mixed> */
    public function state(Tenant $tenant): array
    {
        return [
            ...(array) (DB::table('tenant_drive_syncs')->where('tenant_id', $tenant->id)->first() ?? (object) [
                'enabled' => false, 'last_status' => null, 'last_message' => null, 'last_attempted_at' => null, 'last_synced_at' => null,
            ]),
            'folder_id' => $this->objectId('tenant-'.$tenant->id),
        ];
    }

    public function objectId(string $key): ?string
    {
        return DB::table('drive_objects')->where('account_id', PlatformDriveSetting::query()->find(1)?->account_id)
            ->where('object_key', $key)->where('created', true)->value('file_id');
    }

    public function enable(Tenant $tenant, bool $enabled): void
    {
        $this->locked(function () use ($tenant, $enabled): void {
            DB::table('tenant_drive_syncs')->updateOrInsert(['tenant_id' => $tenant->id], ['enabled' => $enabled]);
        });
    }

    public function sync(Tenant $tenant): void
    {
        $this->locked(function () use ($tenant): void {
            if (! $this->state($tenant)['enabled']) {
                throw new RuntimeException('Sincronizzazione disabilitata dalla piattaforma per questo ambiente.');
            }
            $this->status($tenant, 'running', 'Sincronizzazione in corso.', ['last_attempted_at' => now()]);
            $stage = 'autorizzazione Google';
            $temporary = 'drive-sync/'.Str::uuid().'.xlsx';
            try {
                $drive = app(GoogleDrive::class)->drive();
                $stage = 'verifica delle cartelle Drive';
                $root = $this->folder($drive, 'root', 'MP3');
                $folder = $this->folder($drive, 'tenant-'.$tenant->id, $tenant->name.' ('.$tenant->id.')', $root);
                $reports = app(SectionSpreadsheet::class);
                $years = $reports->annualYears($tenant);
                foreach ($years as $year) {
                    $stage = 'generazione Excel '.$year;
                    if (! Excel::store($reports->annual($tenant, $year), $temporary, 'local', \Maatwebsite\Excel\Excel::XLSX)) {
                        throw new RuntimeException('Scrittura Excel fallita.');
                    }
                    $stage = 'caricamento Excel '.$year;
                    $this->upload($drive, 'tenant-'.$tenant->id.'-'.$year, $year.'.xlsx', $folder, Storage::disk('local')->path($temporary), self::XLSX);
                }
                $this->status($tenant, 'success', count($years).' file annuali sincronizzati. Nessun file remoto eliminato.', ['last_synced_at' => now()]);
            } catch (Throwable $error) {
                $message = $this->error($stage, $error);
                $this->status($tenant, 'failed', $message);
                throw new RuntimeException($message, previous: $error);
            } finally {
                Storage::disk('local')->delete($temporary);
            }
        });
    }

    /** @param array<string, mixed> $extra */
    private function status(Tenant $tenant, string $status, string $message, array $extra = []): void
    {
        DB::table('tenant_drive_syncs')->where('tenant_id', $tenant->id)->update([
            'last_status' => $status, 'last_message' => $message, ...$extra,
        ]);
    }

    private function error(string $stage, Throwable $error): string
    {
        // SDK/driver messages can expose tokens, request bodies or SQL: persist only safe diagnostics.
        $detail = $error::class === RuntimeException::class ? $error->getMessage()
            : ($error instanceof GoogleException ? 'Drive HTTP '.$error->getCode().': verifica accesso, quota e cartelle.' : 'Verifica connessione, storage e configurazione.');

        return 'Operazione Drive non completata: '.$stage.'. '.$detail;
    }

    private function object(Drive $drive, string $key): \stdClass
    {
        $account = PlatformDriveSetting::query()->findOrFail(1)->account_id;
        $query = DB::table('drive_objects')->where('account_id', $account)->where('object_key', $key);
        $object = $query->first();
        if ($object === null) {
            $id = $drive->files->generateIds(['count' => 1, 'space' => 'drive'])->getIds()[0] ?? null;
            if (! $id) {
                throw new RuntimeException('Drive non ha assegnato un identificativo al file.');
            }
            // Reserve the ID before any remote write so retries after a lost response reuse the same file.
            DB::table('drive_objects')->insert(['account_id' => $account, 'object_key' => $key, 'file_id' => $id]);
            $object = $query->firstOrFail();
        }

        return $object;
    }

    private function remote(Drive $drive, \stdClass $object, string $mime, ?string $parent): ?DriveFile
    {
        try {
            $file = $drive->files->get($object->file_id, ['fields' => 'id,mimeType,parents,trashed']);
        } catch (GoogleException $error) {
            if ($error->getCode() !== 404 || $object->created) {
                throw $error;
            }

            return null;
        }
        if ($file->getTrashed() || $file->getMimeType() !== $mime || ($parent !== null && ! in_array($parent, $file->getParents() ?? [], true))) {
            throw new RuntimeException('File o cartella Drive nel cestino, spostato o di tipo incompatibile. Ripristinalo nella cartella assegnata e riprova.');
        }

        return $file;
    }

    private function folder(Drive $drive, string $key, string $name, ?string $parent = null): string
    {
        $object = $this->object($drive, $key);
        $parent ??= $object->parent_id;
        if ($key === 'root' && $parent !== null) {
            $this->destinationFolder($drive, $parent);
        }
        if ($this->remote($drive, $object, self::FOLDER, $parent) === null) {
            $file = $drive->files->create(new DriveFile([
                'id' => $object->file_id, 'name' => $name, 'mimeType' => self::FOLDER,
                ...($parent === null ? [] : ['parents' => [$parent]]),
            ]), ['fields' => 'id']);
            if ($file->getId() !== $object->file_id) {
                throw new RuntimeException('Identificativo della cartella Drive inatteso.');
            }
        }
        DB::table('drive_objects')->where('id', $object->id)->update(['created' => true]);

        return $object->file_id;
    }

    private function upload(Drive $drive, string $key, string $name, string $parent, string $path, string $mime): void
    {
        $object = $this->object($drive, $key);
        $exists = $this->remote($drive, $object, $mime, $parent) !== null;
        $client = $drive->getClient();
        $stream = fopen($path, 'rb');
        if ($stream === false) {
            throw new RuntimeException('File locale illeggibile.');
        }
        $client->setDefer(true);
        try {
            $metadata = new DriveFile(['name' => $name, 'mimeType' => $mime]);
            if (! $exists) {
                $metadata->setId($object->file_id);
                $metadata->setParents([$parent]);
            }
            $options = ['uploadType' => 'resumable', 'fields' => 'id,md5Checksum'];
            $request = $exists ? $drive->files->update($object->file_id, $metadata, $options) : $drive->files->create($metadata, $options);
            $upload = new MediaFileUpload($client, $request, $mime, '', true, 1024 * 1024);
            $size = filesize($path);
            if ($size === false || $size === 0) {
                throw new RuntimeException('File locale vuoto o dimensione non leggibile.');
            }
            $upload->setFileSize($size);
            $result = false;
            while (! feof($stream) && ! $result) {
                $chunk = fread($stream, 1024 * 1024);
                if ($chunk === false) {
                    throw new RuntimeException('Lettura del file locale fallita.');
                }
                $result = $upload->nextChunk($chunk);
            }
            if (! $result || $result->getId() !== $object->file_id || $result->getMd5Checksum() !== hash_file('md5', $path)) {
                throw new RuntimeException('Drive non ha confermato il caricamento completo del file.');
            }
            DB::table('drive_objects')->where('id', $object->id)->update(['created' => true, 'last_status' => 'success', 'last_message' => 'Copia Drive completata.', 'last_synced_at' => now()]);
        } finally {
            $client->setDefer(false);
            fclose($stream);
        }
    }

    public function copyBackup(string $name): void
    {
        if (! PlatformDriveSetting::query()->find(1)?->backup_enabled) {
            return;
        }
        $attemptedAt = now();
        try {
            $this->locked(function () use ($name, $attemptedAt): void {
                PlatformDriveSetting::query()->whereKey(1)->update([
                    'backup_last_name' => $name, 'backup_last_status' => 'running',
                    'backup_last_message' => 'Copia Drive in corso.', 'backup_last_attempted_at' => $attemptedAt,
                ]);
                $drive = app(GoogleDrive::class)->drive();
                $object = $this->object($drive, 'backup-'.$name);
                DB::table('drive_objects')->where('id', $object->id)->update(['last_status' => 'running', 'last_message' => 'Copia Drive in corso.', 'last_attempted_at' => now()]);
                try {
                    $folder = $this->folder($drive, 'backups', 'Backup globali', $this->folder($drive, 'root', 'MP3'));
                    $this->upload($drive, 'backup-'.$name, $name, $folder, app(BackupManager::class)->path(null, $name), 'application/zip');
                } catch (Throwable $error) {
                    DB::table('drive_objects')->where('id', $object->id)->update(['last_status' => 'failed', 'last_message' => $this->error('copia backup', $error)]);
                    throw $error;
                }
            });
            PlatformDriveSetting::query()->whereKey(1)->where('backup_last_name', $name)->update(['backup_last_status' => 'success', 'backup_last_message' => 'Archivio copiato e verificato su Drive.']);
        } catch (Throwable $error) {
            $message = $this->error('copia backup', $error);
            PlatformDriveSetting::query()->whereKey(1)->update(['backup_last_name' => $name, 'backup_last_attempted_at' => $attemptedAt, 'backup_last_status' => 'failed', 'backup_last_message' => $message]);
            throw new RuntimeException($message, previous: $error);
        }
    }
}

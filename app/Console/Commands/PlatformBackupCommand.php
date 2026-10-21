<?php

namespace App\Console\Commands;

use App\Models\PlatformDriveSetting;
use App\Services\BackupManager;
use App\Support\Backups\BackupBusy;
use Illuminate\Console\Command;
use Throwable;

class PlatformBackupCommand extends Command
{
    protected $signature = 'obake:backup {--scheduled : Recupera l’ultima scadenza pianificata maturata}';

    protected $aliases = ['mp3:backup'];

    protected $description = 'Crea e verifica un backup locale completo della piattaforma, poi applica la rotazione Spatie';

    public function handle(BackupManager $backups): int
    {
        try {
            $name = $this->option('scheduled') ? $backups->createScheduled() : $backups->create();
            if ($name === null) {
                return self::SUCCESS;
            }
            $this->info('Backup verificato: '.$name);
            $drive = PlatformDriveSetting::query()->find(1);
            if ($drive?->backup_enabled) {
                $message = 'Copia Drive: '.$drive->backup_last_message;
                $drive->backup_last_status === 'success' ? $this->info($message) : $this->warn($message);
            }

            return self::SUCCESS;
        } catch (BackupBusy $error) {
            $this->warn($error->getMessage());

            return self::FAILURE;
        } catch (Throwable $error) {
            $this->error($error::class === \RuntimeException::class ? $error->getMessage() : 'Backup fallito. Verifica storage e configurazione database.');

            return self::FAILURE;
        }
    }
}

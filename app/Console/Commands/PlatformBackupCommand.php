<?php

namespace App\Console\Commands;

use App\Services\BackupManager;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

class PlatformBackupCommand extends Command
{
    protected $signature = 'mp3:backup {--scheduled : Esegue solo il backup pianificato per questo minuto}';

    protected $description = 'Crea e verifica un backup locale completo della piattaforma, poi applica la rotazione Spatie';

    public function handle(BackupManager $backups): int
    {
        if ($this->option('scheduled')) {
            if (! $backups->due($backups->settings(), now())) {
                return self::SUCCESS;
            }
            $slot = now('Europe/Rome')->format('Y-m-d H:i');
            $claimed = DB::table('backup_settings')->where('scope', 'platform')
                ->where(fn ($query) => $query->whereNull('last_scheduled_slot')->orWhere('last_scheduled_slot', '!=', $slot))
                ->update(['last_scheduled_slot' => $slot]);
            if (! $claimed) {
                return self::SUCCESS;
            }
        }
        try {
            $this->info('Backup verificato: '.$backups->create());

            return self::SUCCESS;
        } catch (Throwable $error) {
            $this->error($error::class === \RuntimeException::class ? $error->getMessage() : 'Backup fallito. Verifica storage e configurazione database.');

            return self::FAILURE;
        }
    }
}

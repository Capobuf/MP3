<?php

namespace App\Console\Commands;

use App\Services\PlatformBackup;
use App\Support\Backups\BackupLock;
use Illuminate\Console\Command;
use Throwable;

class RestorePlatformBackup extends Command
{
    protected $signature = 'obake:restore {archive : Percorso locale dello ZIP globale} {--verify : Verifica senza ripristinare} {--force : Conferma il ripristino su destinazione vuota in manutenzione}';

    protected $aliases = ['mp3:restore'];

    protected $description = 'Verifica o ripristina database MySQL, storage e .env di un backup Obake compatibile';

    public function handle(PlatformBackup $backup): int
    {
        if (! $this->option('verify') && ! $this->option('force')) {
            $this->error('Usa --verify per controllare l’archivio; --force conferma il ripristino su destinazione vuota.');

            return self::FAILURE;
        }
        try {
            BackupLock::run(fn () => $backup->restore((string) $this->argument('archive'), (bool) $this->option('verify')));
            $this->info($this->option('verify') ? 'Archivio integro e compatibile.' : 'Ripristino completato. Conserva .env.before-restore in modo sicuro. Esegui optimize:clear in un nuovo processo, verifica i dati, poi php artisan up.');

            return self::SUCCESS;
        } catch (Throwable $error) {
            $this->error($error::class === \RuntimeException::class ? $error->getMessage() : 'Ripristino fallito. Verifica archivio, permessi e configurazione. La destinazione resta in manutenzione.');

            return self::FAILURE;
        }
    }
}

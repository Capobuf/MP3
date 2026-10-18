<?php

namespace App\Services;

use App\Support\Backups\BackupArchive as Archive;
use Dotenv\Dotenv;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Spatie\Backup\Config\Config;
use Spatie\Backup\Tasks\Backup\BackupJobFactory;
use Symfony\Component\Process\Process;
use Throwable;

class PlatformBackup
{
    public function create(string $filename): string
    {
        Archive::check(DB::getDriverName() === 'mysql', 'Il backup globale richiede MySQL e mysqldump.');
        $config = app(Config::class);
        foreach ($config->backup->source->files->include as $path) {
            Archive::check(file_exists($path) && is_readable($path), 'Un percorso obbligatorio del backup manca o non è leggibile. Verifica codice, .env e storage.');
        }
        Archive::check(Storage::disk('local')->path('') === storage_path('app/private/'), 'Lo storage privato deve usare il percorso locale standard.');
        Archive::check(Storage::disk('attachments')->path('') === storage_path('app/private/attachments/'), 'Gli allegati devono usare il percorso locale standard.');
        $environment = Dotenv::parse(File::get(base_path('.env')));
        Archive::check(filled(config('app.key')) && ($environment['APP_KEY'] ?? null) === config('app.key'), 'APP_KEY assente o diversa dalla chiave salvata in .env.');
        foreach (DB::table('attachments')->get(['disk', 'path', 'size_bytes']) as $attachment) {
            Archive::safePath($attachment->path);
            Archive::check($attachment->disk === 'attachments' && Storage::disk('attachments')->exists($attachment->path) && Storage::disk('attachments')->size($attachment->path) === $attachment->size_bytes, 'Un allegato è mancante o incompleto.');
        }
        foreach (DB::table('users')->whereNotNull('avatar_path')->pluck('avatar_path') as $path) {
            Archive::safePath($path);
            Archive::check(Storage::disk('local')->exists($path), 'Una foto profilo è mancante.');
        }
        $job = BackupJobFactory::createFromConfig($config)->setFilename($filename)->setDestinationPath('.pending');
        $expected = [];
        foreach ($job->filesToBeBackedUp() as $path) {
            // The standard public/storage link is represented as an empty ZIP directory; its target is included separately.
            if ($path === public_path('storage') && is_link($path) && realpath($path) === realpath(storage_path('app/public'))) {
                continue;
            }
            Archive::check(! is_link($path) && is_readable($path), 'Link simbolico o file illeggibile nel backup.');
            if (is_file($path)) {
                $expected[substr($path, strlen(base_path()) + 1)] = ['size' => filesize($path), 'sha256' => hash_file('sha256', $path)];
            }
        }
        try {
            $job->run();
        } catch (Throwable) {
            throw new \RuntimeException('Dump o archivio globale fallito. Verifica mysqldump, credenziali, permessi e spazio libero.');
        }
        $path = Storage::disk('backups')->path('.pending/'.$filename);
        Archive::seal($path, 'platform', ['database_driver' => 'mysql', 'database_version' => DB::selectOne('SELECT VERSION() AS version')->version]);
        $zip = Archive::open($path);
        try {
            $manifest = Archive::verify($zip, 'platform');
            foreach ($expected as $name => $file) {
                Archive::check(($manifest['files'][$name] ?? null) === $file, 'Un file sorgente manca o è cambiato durante il backup.');
            }
            $this->components($manifest);
        } finally {
            $zip->close();
        }

        return $path;
    }

    /** @param array<string, mixed> $manifest */
    private function components(array $manifest): string
    {
        foreach (['.env', 'artisan', 'composer.json', 'composer.lock', 'package-lock.json', 'bootstrap/app.php', 'routes/web.php'] as $required) {
            Archive::check(isset($manifest['files'][$required]), 'Componente obbligatorio mancante nel backup globale.');
        }
        $dumps = array_values(array_filter(array_keys($manifest['files']), fn ($name) => is_string($name) && str_starts_with($name, 'db-dumps/') && str_ends_with($name, '.sql')));
        Archive::check(count($dumps) === 1 && $manifest['files'][$dumps[0]]['size'] > 0, 'Dump database mancante o ambiguo.');

        return $dumps[0];
    }

    public function restore(string $path, bool $verifyOnly): void
    {
        $zip = Archive::open($path);
        $temporary = storage_path('app/backup-temp/restore-'.Str::uuid());
        try {
            $manifest = Archive::verify($zip, 'platform');
            $dump = $this->components($manifest);
            Archive::check(($manifest['database_driver'] ?? null) === 'mysql' && DB::getDriverName() === 'mysql', 'Il ripristino globale richiede MySQL.');
            $version = DB::selectOne('SELECT VERSION() AS version')->version;
            Archive::check(explode('.', $version)[0] === explode('.', $manifest['database_version'])[0], 'Versione principale MySQL incompatibile.');
            foreach ($manifest['files'] as $name => $file) {
                if ($name === '.env' || str_starts_with($name, 'storage/') || str_starts_with($name, 'db-dumps/') || str_ends_with($name, '/')) {
                    continue;
                }
                Archive::check(is_file(base_path($name)) && hash_file('sha256', base_path($name)) === $file['sha256'], 'Codice/configurazione incompatibili. Installa prima la versione contenuta nel backup.');
            }
            $env = Dotenv::parse($zip->getFromName('.env') ?: '');
            Archive::check(is_string($env['APP_KEY'] ?? null) && $env['APP_KEY'] !== '', 'APP_KEY mancante nel backup.');
            if ($verifyOnly) {
                return;
            }
            Archive::check(app()->isDownForMaintenance(), 'Metti la destinazione in manutenzione con php artisan down prima del ripristino.');
            Archive::check(Schema::getTableListing(DB::getDatabaseName()) === [], 'Il database di destinazione deve essere completamente vuoto. Nessun dato è stato sovrascritto.');
            foreach (['private', 'public'] as $folder) {
                foreach (File::allFiles(storage_path('app/'.$folder), true) as $file) {
                    Archive::check($file->getFilename() === '.gitignore', 'Lo storage di destinazione deve essere vuoto.');
                }
            }
            Archive::check(! file_exists(base_path('.env.before-restore')), 'Esiste già .env.before-restore: conserva o sposta la copia prima di procedere.');
            File::ensureDirectoryExists($temporary, 0700);
            Archive::copyEntry($zip, $dump, $temporary.'/database.sql');
            foreach ($manifest['files'] as $name => $file) {
                if ((str_starts_with($name, 'storage/app/private/') || str_starts_with($name, 'storage/app/public/')) && ! str_ends_with($name, '/')) {
                    Archive::copyEntry($zip, $name, $temporary.'/'.$name);
                }
            }
            // Keep destination connectivity; restore application secrets, especially APP_KEY.
            $db = DB::connection()->getConfig();
            foreach (['DB_CONNECTION' => 'mysql', 'DB_URL' => '', 'DB_HOST' => $db['host'], 'DB_PORT' => $db['port'], 'DB_DATABASE' => $db['database'], 'DB_USERNAME' => $db['username'], 'DB_PASSWORD' => $db['password'], 'DB_SOCKET' => $db['unix_socket'] ?? '', 'APP_URL' => config('app.url')] as $key => $value) {
                $env[$key] = (string) $value;
            }
            $text = '';
            foreach ($env as $key => $value) {
                $text .= $key.'="'.str_replace(['\\', '"', '$', "\n", "\r"], ['\\\\', '\\"', '\\$', '\\n', '\\r'], (string) $value).'"'."\n";
            }
            Archive::check(File::put($temporary.'/.env', $text) !== false, 'Scrittura configurazione ripristinata fallita.');
            chmod($temporary.'/.env', 0600);
            $options = '[client]'."\n";
            foreach (['host' => $db['host'], 'port' => $db['port'], 'user' => $db['username'], 'password' => $db['password']] as $key => $value) {
                $options .= $key.'="'.str_replace(['\\', '"', "\n", "\r"], ['\\\\', '\\"', '\\n', '\\r'], (string) $value).'"'."\n";
            }
            File::put($temporary.'/mysql.cnf', $options);
            chmod($temporary.'/mysql.cnf', 0600);
            $stream = fopen($temporary.'/database.sql', 'rb');
            Archive::check($stream !== false, 'Dump temporaneo illeggibile.');
            try {
                $process = new Process(['mysql', '--defaults-extra-file='.$temporary.'/mysql.cnf', '--binary-mode', '--database='.$db['database']], null, null, $stream, 600);
                $process->run();
                Archive::check($process->isSuccessful(), 'Import MySQL fallito. La destinazione resta in manutenzione e può contenere dati parziali; riparti da un database vuoto.');
            } finally {
                fclose($stream);
            }
            foreach (['private', 'public'] as $folder) {
                if (is_dir($temporary.'/storage/app/'.$folder)) {
                    Archive::check(File::copyDirectory($temporary.'/storage/app/'.$folder, storage_path('app/'.$folder)), 'Copia storage fallita. Mantieni la destinazione in manutenzione.');
                }
            }
            Archive::check(copy(base_path('.env'), base_path('.env.before-restore')), 'Conservazione della configurazione di destinazione fallita.');
            chmod(base_path('.env.before-restore'), 0600);
            Archive::check(rename($temporary.'/.env', base_path('.env')), 'Sostituzione .env fallita. Mantieni la destinazione in manutenzione.');
            DB::table('backup_settings')->where('scope', 'platform')->update(['last_status' => 'success', 'last_message' => 'Ripristino globale completato.', 'last_finished_at' => now()]);
            // Cache clearing must not connect to the restored application's old cache configuration.
            foreach (['config.php', 'events.php', 'routes-v7.php'] as $cache) {
                File::delete(base_path('bootstrap/cache/'.$cache));
            }
        } finally {
            $zip->close();
            File::deleteDirectory($temporary);
        }
    }
}

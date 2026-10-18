<?php

namespace App\Support\Backups;

use Illuminate\Database\Migrations\Migrator;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Symfony\Component\Process\Process;
use ZipArchive;

class BackupArchive
{
    public static function open(string $path, int $flags = 0): ZipArchive
    {
        $zip = new ZipArchive;
        self::check($zip->open($path, $flags) === true, 'ZIP illeggibile o incompleto.');

        return $zip;
    }

    /** @phpstan-assert true $valid */
    public static function check(bool $valid, string $message): void
    {
        if (! $valid) {
            throw new RuntimeException($message);
        }
    }

    public static function safePath(string $name): void
    {
        self::check($name !== '' && ! preg_match('~(^/|[\\\\:\x00-\x1f]|(^|/)\.\.?(/|$))~', $name), 'Percorso non valido nell’archivio.');
    }

    /** @return array<string, mixed> */
    public static function json(ZipArchive $zip, string $name): array
    {
        $stat = $zip->statName($name);
        self::check($stat !== false && $stat['size'] <= config('platform-backups.json_max_bytes'), 'Metadati mancanti o troppo grandi.');
        $data = json_decode($zip->getFromName($name) ?: '', true, 512, JSON_THROW_ON_ERROR);
        self::check(is_array($data), 'Metadati non validi.');

        return $data;
    }

    /** @return array<string, array{size: int, sha256: string}> */
    public static function inventory(ZipArchive $zip): array
    {
        self::check($zip->numFiles <= config('platform-backups.max_entries'), 'Troppi file nell’archivio.');
        $files = [];
        $total = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            self::check($stat !== false, 'Indice ZIP danneggiato.');
            $name = $stat['name'];
            self::safePath($name);
            self::check(! isset($files[$name]), 'Percorso duplicato nel backup.');
            $zip->getExternalAttributesIndex($i, $opsys, $attributes);
            self::check(($attributes >> 16 & 0170000) !== 0120000, 'Link simbolici non ammessi nel backup.');
            $total += $stat['size'];
            self::check($total <= config('platform-backups.max_uncompressed_bytes'), 'Dimensione estratta oltre il limite.');
            if (str_ends_with($name, '/')) {
                $files[$name] = ['size' => 0, 'sha256' => hash('sha256', '')];

                continue;
            }
            $stream = $zip->getStream($name);
            self::check($stream !== false, 'File ZIP illeggibile.');
            try {
                $hash = hash_init('sha256');
                $read = hash_update_stream($hash, $stream, $stat['size'] + 1);
                self::check($read === $stat['size'], 'File ZIP troncato.');
                $files[$name] = ['size' => $read, 'sha256' => hash_final($hash)];
            } finally {
                fclose($stream);
            }
        }
        ksort($files);

        return $files;
    }

    /** @param array<string, mixed> $metadata */
    public static function seal(string $path, string $kind, array $metadata): void
    {
        $zip = self::open($path);
        try {
            $manifest = ['format' => 'mp3-backup', 'version' => 1, 'kind' => $kind, 'created_at' => now()->toIso8601String(), 'revision' => self::revision(), 'schema' => self::schema(), ...$metadata, 'files' => self::inventory($zip)];
            if ($kind === 'tenant') {
                $manifest['signature'] = hash_hmac('sha256', json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
            }
            self::check($zip->addFromString('manifest.json', json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)), 'Scrittura manifest fallita.');
        } finally {
            self::check($zip->close(), 'Chiusura ZIP fallita: verifica lo spazio disponibile.');
        }
        chmod($path, 0600);
    }

    /** @return array<string, mixed> */
    public static function verify(ZipArchive $zip, string $kind): array
    {
        $files = self::inventory($zip);
        $manifest = self::json($zip, 'manifest.json');
        unset($files['manifest.json']);
        self::check(($manifest['format'] ?? null) === 'mp3-backup' && ($manifest['version'] ?? null) === 1 && ($manifest['kind'] ?? null) === $kind, 'Formato o versione del backup incompatibile.');
        self::check(($manifest['schema'] ?? null) === self::schema(), 'Schema incompatibile: usa la stessa versione dell’applicazione.');
        self::check(($manifest['files'] ?? null) === $files, 'Integrità del backup non valida: file mancanti o alterati.');

        if ($kind === 'tenant' && ($manifest['installation'] ?? null) === hash('sha256', (string) config('app.key'))) {
            $signed = $manifest;
            unset($signed['signature']);
            $expected = hash_hmac('sha256', json_encode($signed, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), (string) config('app.key'));
            self::check(is_string($manifest['signature'] ?? null) && hash_equals($expected, $manifest['signature']), 'Firma del backup non valida: identità locali non verificabili.');
        }

        return $manifest;
    }

    public static function ensureMigrated(): void
    {
        $migrator = app(Migrator::class);
        $expected = array_keys($migrator->getMigrationFiles([...$migrator->paths(), database_path('migrations')]));
        self::check(array_diff($expected, $migrator->getRepository()->getRan()) === [], 'Migration pendenti: aggiorna lo schema prima di creare un backup.');
    }

    public static function schema(): string
    {
        $files = [...File::files(database_path('migrations')), ...File::files(base_path('vendor/ryangjchandler/laravel-comments/database/migrations'))];
        $hashes = [];
        foreach ($files as $file) {
            $hashes[$file->getFilename()] = hash_file('sha256', $file->getPathname());
        }
        ksort($hashes);

        return hash('sha256', json_encode($hashes, JSON_THROW_ON_ERROR));
    }

    public static function revision(): string
    {
        $process = new Process(['git', 'rev-parse', 'HEAD'], base_path());
        $process->run();

        return $process->isSuccessful() ? trim($process->getOutput()) : 'source-sha256-in-manifest';
    }

    public static function copyEntry(ZipArchive $zip, string $name, string $path): void
    {
        $input = $zip->getStream($name);
        self::check($input !== false, 'File assente nel backup.');
        File::ensureDirectoryExists(dirname($path), 0700);
        $output = fopen($path, 'xb');
        self::check($output !== false, 'Impossibile scrivere il file di ripristino.');
        try {
            $stat = $zip->statName($name);
            self::check($stat !== false, 'File assente nel backup.');
            $size = stream_copy_to_stream($input, $output);
            self::check($size === $stat['size'] && fflush($output), 'Copia incompleta: verifica lo spazio disponibile.');
        } finally {
            fclose($input);
            fclose($output);
        }
        chmod($path, 0600);
    }
}

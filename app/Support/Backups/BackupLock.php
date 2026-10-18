<?php

namespace App\Support\Backups;

use Closure;
use RuntimeException;

class BackupLock
{
    /** @template T
     * @param  Closure(): T  $callback
     * @return T
     */
    public static function run(Closure $callback, bool $exclusive = true): mixed
    {
        $handle = fopen(storage_path('framework/backup.lock'), 'c');
        if ($handle === false) {
            throw new RuntimeException('Impossibile aprire il blocco dei backup. Verifica i permessi dello storage.');
        }
        try {
            if (! flock($handle, ($exclusive ? LOCK_EX : LOCK_SH) | LOCK_NB)) {
                throw new BackupBusy('Operazione in corso: riprova quando il backup o il salvataggio è terminato.');
            }

            return $callback();
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }
}

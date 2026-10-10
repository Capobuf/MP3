<?php

namespace App\Services;

use App\Models\Attachment;
use App\Models\Contract;
use App\Models\Expense;
use App\Models\Project;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

class AttachmentFiles
{
    public bool $cleanupFailed = false;

    // The caller locks the owner and opens a transaction, also for batch deletions.
    public function delete(Attachment|Contract|Expense|Project $record): void
    {
        $files = $record instanceof Attachment ? collect([$record]) : $record->attachments()->get();
        abort_unless($record->delete(), 409, 'Eliminazione non riuscita. Nessun elemento eliminato.');
        DB::afterCommit(function () use ($files): void {
            foreach ($files as $file) {
                $this->cleanup($file->disk, $file->path);
            }
        });
    }

    public function cleanup(string $disk, string $path): void
    {
        try {
            if (Storage::disk($disk)->delete($path)) {
                return;
            }
        } catch (Throwable $exception) {
            Log::error('Attachment storage deletion raised an error.', ['disk' => $disk, 'path' => $path, 'exception' => $exception]);
        }
        $this->cleanupFailed = true;
        Log::error('Attachment file cleanup required.', ['disk' => $disk, 'path' => $path]);
    }

    /** @return array{cleanup_failed: bool, message: string} */
    public function result(string $message): array
    {
        return [
            'cleanup_failed' => $this->cleanupFailed,
            'message' => $this->cleanupFailed
                ? 'Record eliminati, ma la rimozione di alcuni file non è riuscita. Contatta l’amministratore.'
                : $message,
        ];
    }
}

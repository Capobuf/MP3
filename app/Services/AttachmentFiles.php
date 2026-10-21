<?php

namespace App\Services;

use App\Models\Attachment;
use App\Models\BudgetEntry;
use App\Models\BudgetYear;
use App\Models\Contract;
use App\Models\Expense;
use App\Models\Project;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class AttachmentFiles
{
    public bool $cleanupFailed = false;

    // The caller locks the owner and opens a transaction, also for batch deletions.
    public function delete(Attachment|Contract|Expense|Project $record): void
    {
        if ($record instanceof Expense && Expense::where('tenant_id', $record->tenant_id)->where('source_expense_id', $record->id)->exists()) {
            throw ValidationException::withMessages(['expense' => 'Eliminazione bloccata: questa spesa è l’origine di una copia annuale.']);
        }
        if ($record instanceof Contract || $record instanceof Project || $record instanceof Expense) {
            $type = match (true) {
                $record instanceof Contract => 'contract',
                $record instanceof Project => 'project',
                $record instanceof Expense => 'expense',
            };
            if (BudgetEntry::where('tenant_id', $record->tenant_id)->where($type.'_id', $record->id)->exists()) {
                throw ValidationException::withMessages(['budget' => 'Eliminazione bloccata: questa sorgente è collegata a un Budget annuale. Rimuovi prima le relative voci dal Budget, anche quelle escluse.']);
            }
            foreach (BudgetYear::where('tenant_id', $record->tenant_id)->orderBy('id')->lockForUpdate()->get() as $year) {
                $dismissed = array_values(array_diff($year->dismissed_sources ?? [], [$type.':'.$record->id]));
                if ($dismissed !== ($year->dismissed_sources ?? [])) {
                    $year->update(['dismissed_sources' => $dismissed]);
                }
            }
        }
        $files = $record instanceof Attachment ? collect([$record]) : $record->attachments()->get();
        foreach ($files as $file) {
            app(UndoHistory::class)->preserve($file);
        }
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

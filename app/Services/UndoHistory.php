<?php

namespace App\Services;

use App\Models\Attachment;
use App\Models\Tenant;
use App\Models\UndoAction;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

class UndoHistory
{
    // Parents precede children so restoration preserves all foreign keys.
    private const TABLES = ['vendors', 'cost_centers', 'contracts', 'projects', 'expenses', 'expense_lines', 'budget_years', 'budget_entries', 'contract_cost_center', 'cost_center_project', 'cost_center_expense', 'attachments'];

    private bool $recording = false;

    /** @var array<string, array{disk: string, path: string, backup: string}> */
    private array $files = [];

    /** @var list<array{disk: string, path: string}> */
    private array $createdFiles = [];

    public function begin(): void
    {
        $this->recording = true;
        $this->files = [];
        $this->createdFiles = [];
    }

    public function finish(bool $saved): void
    {
        $this->recording = false;
        if (! $saved) {
            foreach ($this->createdFiles as $file) {
                app(AttachmentFiles::class)->cleanup($file['disk'], $file['path']);
            }
            foreach ($this->files as $file) {
                app(AttachmentFiles::class)->cleanup($file['disk'], $file['backup']);
            }
        }
        $this->files = [];
        $this->createdFiles = [];
    }

    public function preserve(Attachment $attachment): void
    {
        if (! $this->recording) {
            return;
        }
        $this->backup($attachment->disk, $attachment->path);
    }

    private function backup(string $disk, string $path): void
    {
        $key = $disk.':'.$path;
        if (isset($this->files[$key])) {
            return;
        }
        $storage = Storage::disk($disk);
        // A missing original remains missing after undo; never fabricate a file.
        if (! $storage->fileExists($path)) {
            return;
        }
        $backup = '__undo/'.Str::uuid();
        if (! $storage->copy($path, $backup)) {
            throw new RuntimeException('Impossibile conservare il documento per l’annullamento.');
        }
        $this->files[$key] = compact('disk', 'path', 'backup');
    }

    private function query(string $table, Tenant $tenant): Builder
    {
        $query = DB::table($table);
        if ($table === 'expense_lines') {
            return $query->whereIn('expense_id', DB::table('expenses')->where('tenant_id', $tenant->id)->select('id'));
        }
        if (in_array($table, ['contract_cost_center', 'cost_center_project', 'cost_center_expense'], true)) {
            return $query->whereIn('cost_center_id', DB::table('cost_centers')->where('tenant_id', $tenant->id)->select('id'));
        }

        return $query->where('tenant_id', $tenant->id);
    }

    /** @param array<string, mixed> $row */
    private function key(array $row): string
    {
        return isset($row['id']) ? (string) $row['id'] : implode(':', array_values($row));
    }

    /** @return array<string, array<string, array<string, mixed>>> */
    public function snapshot(Tenant $tenant): array
    {
        $state = [];
        foreach (self::TABLES as $table) {
            $rows = [];
            foreach ($this->query($table, $tenant)->get() as $record) {
                $row = (array) $record;
                ksort($row);
                $rows[$this->key($row)] = $row;
            }
            ksort($rows, SORT_STRING);
            $state[$table] = $rows;
        }

        return $state;
    }

    /** @param array<string, array<string, array<string, mixed>>> $state */
    public function fingerprint(array $state): string
    {
        return hash('sha256', json_encode($state, JSON_THROW_ON_ERROR));
    }

    /** @param array<string, array<string, array<string, mixed>>> $before
     * @param  array<string, array<string, array<string, mixed>>>  $after
     */
    public function record(Tenant $tenant, User $user, string $label, array $before, array $after): ?UndoAction
    {
        $changes = [];
        foreach (self::TABLES as $table) {
            foreach (array_unique([...array_keys($before[$table]), ...array_keys($after[$table])]) as $key) {
                $old = $before[$table][$key] ?? null;
                $new = $after[$table][$key] ?? null;
                if ($old !== $new) {
                    $changes[$table][$key] = ['before' => $old, 'after' => $new];
                    if ($table === 'attachments' && $new !== null) {
                        if ($old === null) {
                            $this->createdFiles[] = ['disk' => $new['disk'], 'path' => $new['path']];
                        }
                        $this->backup($new['disk'], $new['path']);
                    }
                }
            }
        }
        if ($changes === []) {
            return null;
        }
        $action = UndoAction::create([
            'tenant_id' => $tenant->id, 'user_id' => $user->id, 'label' => $label,
            'before_hash' => $this->fingerprint($before), 'after_hash' => $this->fingerprint($after),
            'changes' => $changes, 'files' => array_values($this->files),
        ]);
        // A new change starts a new branch; old restore buttons cannot replay it.
        UndoAction::where('tenant_id', $tenant->id)->where('user_id', $user->id)->whereNotNull('undone_at')->update(['redo_expires_at' => null]);

        return $action;
    }

    /** @param array<string, mixed> $row */
    private function rowQuery(string $table, array $row): Builder
    {
        return isset($row['id']) ? DB::table($table)->where('id', $row['id']) : DB::table($table)->where($row);
    }

    public function apply(UndoAction $action, bool $redo): void
    {
        $target = $redo ? 'after' : 'before';
        $source = $redo ? 'before' : 'after';
        // Restore bytes first. A storage failure leaves the database untouched.
        foreach ($action->changes['attachments'] ?? [] as $change) {
            $row = $change[$target];
            if ($row === null) {
                continue;
            }
            foreach ($action->files as $file) {
                if ($file['disk'] === $row['disk'] && $file['path'] === $row['path']) {
                    if (! Storage::disk($file['disk'])->copy($file['backup'], $file['path'])) {
                        throw new RuntimeException('Ripristino del documento non riuscito.');
                    }
                }
            }
        }
        foreach (array_reverse(self::TABLES) as $table) {
            foreach ($action->changes[$table] ?? [] as $change) {
                if ($change[$target] === null && $change[$source] !== null) {
                    $this->rowQuery($table, $change[$source])->delete();
                }
            }
        }
        foreach (self::TABLES as $table) {
            $changes = array_values($action->changes[$table] ?? []);
            if ($table === 'cost_centers') {
                usort($changes, fn ($a, $b) => (int) isset($a[$target]['parent_id']) <=> (int) isset($b[$target]['parent_id']));
            }
            foreach ($changes as $change) {
                $row = $change[$target];
                if ($row !== null) {
                    $query = $this->rowQuery($table, $row);
                    if ($query->exists()) {
                        $query->update($row);
                    } else {
                        DB::table($table)->insert($row);
                    }
                }
            }
        }
        $removed = [];
        foreach ($action->changes['attachments'] ?? [] as $change) {
            if ($change[$target] === null && $change[$source] !== null) {
                $removed[] = $change[$source];
            }
        }
        DB::afterCommit(function () use ($removed): void {
            foreach ($removed as $file) {
                app(AttachmentFiles::class)->cleanup($file['disk'], $file['path']);
            }
        });
    }

    public function prune(?Tenant $tenant = null): void
    {
        $query = UndoAction::query();
        if ($tenant !== null) {
            $query->where('tenant_id', $tenant->id);
        }
        $query->where('created_at', '<', now()->subHours(config('undo.history_hours')))
            ->where(fn ($query) => $query->whereNull('redo_expires_at')->orWhere('redo_expires_at', '<=', now()))
            ->chunkById(100, function ($actions): void {
                foreach ($actions as $action) {
                    $this->discard($action, true);
                }
            });
        if ($tenant !== null) {
            $users = UndoAction::where('tenant_id', $tenant->id)->distinct()->pluck('user_id');
            foreach ($users as $userId) {
                $old = UndoAction::where('tenant_id', $tenant->id)->where('user_id', $userId)->latest('id')->skip(config('undo.history_limit'))->take(PHP_INT_MAX)->get();
                foreach ($old as $action) {
                    $this->discard($action);
                }
            }
        }
    }

    private function discard(UndoAction $action, bool $expiredOnly = false): void
    {
        DB::transaction(function () use ($action, $expiredOnly): void {
            Tenant::whereKey($action->tenant_id)->lockForUpdate()->first();
            $stored = UndoAction::find($action->id);
            if ($stored === null || ($expiredOnly && $stored->redo_expires_at?->isFuture())) {
                return;
            }
            $files = $stored->files;
            $stored->delete();
            DB::afterCommit(function () use ($files): void {
                foreach ($files as $file) {
                    app(AttachmentFiles::class)->cleanup($file['disk'], $file['backup']);
                }
            });
        });
    }
}

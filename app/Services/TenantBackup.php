<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\CostCenter;
use App\Models\Expense;
use App\Models\Project;
use App\Models\ProjectStatus;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Vendor;
use App\Rules\CommentContent;
use App\Support\Backups\BackupArchive as Archive;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Throwable;
use ZipArchive;

class TenantBackup
{
    private const MODELS = [Vendor::class => 'vendors', CostCenter::class => 'cost_centers', Contract::class => 'contracts', Project::class => 'projects', Expense::class => 'expenses'];

    private const REFS = [
        'cost_centers' => ['parent_id' => 'cost_centers'],
        'contracts' => ['vendor_id' => 'vendors', 'source_contract_id' => 'contracts'],
        'projects' => ['source_project_id' => 'projects'],
        'expenses' => ['vendor_id' => 'vendors', 'contract_id' => 'contracts', 'project_id' => 'projects', 'source_expense_id' => 'expenses'],
        'expense_lines' => ['expense_id' => 'expenses'],
        'budget_entries' => ['budget_year_id' => 'budget_years', 'contract_id' => 'contracts', 'project_id' => 'projects', 'expense_id' => 'expenses', 'cost_center_id' => 'cost_centers'],
        'contract_cost_center' => ['contract_id' => 'contracts', 'cost_center_id' => 'cost_centers'],
        'cost_center_project' => ['project_id' => 'projects', 'cost_center_id' => 'cost_centers'],
        'cost_center_expense' => ['expense_id' => 'expenses', 'cost_center_id' => 'cost_centers'],
        'attachments' => ['contract_id' => 'contracts', 'project_id' => 'projects', 'expense_id' => 'expenses', 'uploaded_by' => 'users'],
        'comments' => ['parent_id' => 'comments', 'user_id' => 'users'],
    ];

    public function isEmpty(Tenant $tenant): bool
    {
        $statuses = $tenant->projectStatuses()->pluck('name', 'key')->all();

        return app(TenantCsvTransfer::class)->isEmpty($tenant)
            && ($statuses === [] || $statuses == ProjectStatus::DEFAULTS)
            && $tenant->contract_reminders === null
            && ! DB::table('undo_actions')->where('tenant_id', $tenant->id)->exists()
            && ! DB::table('contract_reminder_deliveries')->where('tenant_id', $tenant->id)->exists();
    }

    public function create(Tenant $tenant, string $path): void
    {
        $zip = Archive::open($path, ZipArchive::CREATE | ZipArchive::EXCL);
        try {
            DB::transaction(function () use ($tenant, $zip): void {
                Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
                $tables = app(UndoHistory::class)->snapshot($tenant);
                $tables = array_map(array_values(...), $tables);
                $tables['comments'] = [];
                foreach (self::MODELS as $model => $table) {
                    foreach (DB::table('comments')->where('commentable_type', (new $model)->getMorphClass())->whereIn('commentable_id', array_column($tables[$table], 'id'))->get() as $comment) {
                        $tables['comments'][] = (array) $comment;
                    }
                }
                $tables['contract_reminder_deliveries'] = DB::table('contract_reminder_deliveries')->where('tenant_id', $tenant->id)->get()->map(fn ($row) => (array) $row)->all();
                $members = $tenant->users()->pluck('users.id')->all();
                $userIds = array_unique([...$members, ...($tenant->fresh()->contract_reminders['user_ids'] ?? []), ...array_column($tables['attachments'], 'uploaded_by'), ...array_column($tables['comments'], 'user_id')]);
                $users = DB::table('users')->whereIn('id', array_filter($userIds))->get(['id', 'name', 'email'])->map(fn ($user) => (array) $user)->all();
                $data = ['tenant' => $tenant->fresh()->only('id', 'name', 'slug', 'contract_reminders'), 'users' => $users, 'members' => $members, 'tables' => $tables];
                Archive::check($zip->addFromString('data.json', json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)), 'Scrittura dei dati tenant fallita.');
                foreach ($tables['attachments'] as $file) {
                    Archive::check($file['disk'] === 'attachments' && str_starts_with($file['path'], $tenant->id.'/'), 'Percorso allegato non appartenente al tenant.');
                    Archive::safePath($file['path']);
                    $source = Storage::disk('attachments')->path($file['path']);
                    Archive::check(is_file($source) && ! is_link($source) && filesize($source) === (int) $file['size_bytes'], 'Allegato mancante o incompleto: backup interrotto.');
                    Archive::check($zip->addFile($source, 'attachments/'.$file['id']), 'Copia allegato fallita.');
                }
            });
        } finally {
            Archive::check($zip->close(), 'Chiusura ZIP tenant fallita. Verifica lo spazio disponibile.');
        }
        Archive::seal($path, 'tenant', ['installation' => hash('sha256', (string) config('app.key'))]);
        $zip = Archive::open($path);
        try {
            $manifest = Archive::verify($zip, 'tenant');
            $this->validate(Archive::json($zip, 'data.json'), $manifest);
        } finally {
            $zip->close();
        }
    }

    public function restore(Tenant $tenant, string $path): void
    {
        $zip = Archive::open($path);
        $createdFiles = [];
        try {
            $manifest = Archive::verify($zip, 'tenant');
            $data = Archive::json($zip, 'data.json');
            $this->validate($data, $manifest);
            DB::transaction(function () use ($tenant, $zip, $manifest, $data, &$createdFiles): void {
                $tenant = Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
                Archive::check($this->isEmpty($tenant), 'Il ripristino richiede un ambiente nuovo o vuoto, senza impostazioni personalizzate.');
                $maps = ['users' => $this->users($data['users'], $manifest['installation'])];
                $members = array_map(fn ($id) => $this->reference($maps, 'users', $id), $data['members']);
                Archive::check(array_diff($tenant->users()->pluck('users.id')->all(), $members) === [], 'Le associazioni utente del tenant di destinazione sono in conflitto con il backup.');
                $tenant->projectStatuses()->delete();
                foreach ($data['tables'] as $table => $rows) {
                    $maps[$table] = [];
                    foreach ($rows as $row) {
                        $oldId = $row['id'] ?? null;
                        unset($row['id']);
                        if (array_key_exists('tenant_id', $row)) {
                            $row['tenant_id'] = $tenant->id;
                        }
                        foreach (self::REFS[$table] ?? [] as $column => $target) {
                            $row[$column] = $target === $table ? null : $this->reference($maps, $target, $row[$column]);
                        }
                        if ($table === 'budget_years') {
                            $row['dismissed_sources'] = null;
                        }
                        if ($table === 'comments') {
                            $row['commentable_id'] = $this->reference($maps, self::MODELS[$row['commentable_type']], $row['commentable_id']);
                        }
                        if ($table === 'contract_reminder_deliveries' && str_starts_with($row['notification_key'], 'expiry:')) {
                            $parts = explode(':', $row['notification_key']);
                            $row['notification_key'] = isset($maps['contracts'][$parts[1]])
                                ? 'expiry:'.$maps['contracts'][$parts[1]].':'.$parts[2].':'.$parts[3]
                                : 'removed:'.$row['notification_key'];
                        }
                        if ($table === 'attachments') {
                            $row['disk'] = 'attachments';
                            $row['path'] = $tenant->id.'/'.Str::uuid();
                            $createdFiles[] = $row['path'];
                            Archive::copyEntry($zip, 'attachments/'.$oldId, Storage::disk('attachments')->path($row['path']));
                        }
                        if ($oldId !== null) {
                            $maps[$table][$oldId] = DB::table($table)->insertGetId($row);
                        } else {
                            DB::table($table)->insert($row);
                        }
                    }
                    // Self-references can point to a later row, including legacy annual records.
                    foreach ($rows as $row) {
                        $updates = [];
                        foreach (self::REFS[$table] ?? [] as $column => $target) {
                            if ($target === $table) {
                                $updates[$column] = $this->reference($maps, $target, $row[$column]);
                            }
                        }
                        if ($updates !== []) {
                            DB::table($table)->where('id', $maps[$table][$row['id']])->update($updates);
                        }
                    }
                }
                foreach ($data['tables']['budget_years'] as $row) {
                    $sources = json_decode($row['dismissed_sources'] ?? '[]', true, flags: JSON_THROW_ON_ERROR);
                    $sources = array_map(function ($source) use ($maps) {
                        [$type, $id] = explode(':', $source);

                        return $type.':'.$this->reference($maps, $type.'s', $id);
                    }, $sources);
                    DB::table('budget_years')->where('id', $maps['budget_years'][$row['id']])->update(['dismissed_sources' => $row['dismissed_sources'] === null ? null : json_encode($sources, JSON_THROW_ON_ERROR)]);
                }
                $settings = $data['tenant']['contract_reminders'];
                if ($settings !== null) {
                    $settings['user_ids'] = array_map(fn ($id) => $this->reference($maps, 'users', $id), $settings['user_ids']);
                }
                $tenant->forceFill(['contract_reminders' => $settings])->save();
                $tenant->users()->sync($members);
            });
        } catch (Throwable $error) {
            foreach ($createdFiles as $file) {
                Storage::disk('attachments')->delete($file);
            }
            throw $error;
        } finally {
            $zip->close();
        }
    }

    /** @param list<array<string, mixed>> $users
     * @return array<int, int>
     */
    private function users(array $users, string $installation): array
    {
        $map = [];
        foreach ($users as $identity) {
            $existing = User::where('email', $identity['email'])->first();
            if ($existing !== null) {
                Archive::check($installation === hash('sha256', (string) config('app.key')) && $existing->id === $identity['id'] && $existing->name === $identity['name'] && $existing->email === $identity['email'], 'Conflitto di identità utente: nessun account esistente è stato modificato.');
                $map[$identity['id']] = $existing->id;
            } else {
                Archive::check($installation !== hash('sha256', (string) config('app.key')) || ! User::whereKey($identity['id'])->exists(), 'Conflitto di identità utente: l’account originale ha cambiato indirizzo.');
                // Tenant archives never contain global passwords, passkeys or elevated permissions.
                $map[$identity['id']] = User::create(['name' => $identity['name'], 'email' => $identity['email'], 'password' => Str::random(64)])->id;
            }
        }

        return $map;
    }

    /** @param array<string, array<int, int>> $maps */
    private function reference(array $maps, string $table, mixed $id): ?int
    {
        if ($id === null) {
            return null;
        }
        Archive::check((is_int($id) || is_string($id)) && isset($maps[$table][$id]), 'Riferimento mancante o esterno al tenant nel backup.');

        return $maps[$table][$id];
    }

    /** @param array<string, mixed> $data
     * @param  array<string, mixed>  $manifest
     */
    private function validate(array $data, array $manifest): void
    {
        Validator::make($data, [
            'tenant' => ['required', 'array:id,name,slug,contract_reminders'],
            'tenant.id' => ['required', 'integer', 'min:1'],
            'tenant.name' => ['required', 'string'], 'tenant.slug' => ['required', 'string'],
            'tenant.contract_reminders' => ['present', 'nullable', 'array'],
            'tenant.contract_reminders.user_ids' => ['required_with:tenant.contract_reminders', 'array'],
            'users' => ['present', 'array', 'list'], 'users.*' => ['array:id,name,email'],
            'users.*.id' => ['required', 'integer', 'min:1', 'distinct'],
            'users.*.email' => ['required', 'email', 'max:255', 'distinct:ignore_case'],
            'users.*.name' => ['required', 'string', 'max:255'],
            'members' => ['present', 'array', 'list'], 'members.*' => ['integer', 'min:1', 'distinct'],
            'tables' => ['required', 'array'],
        ])->validate();
        Archive::check(is_string($manifest['installation'] ?? null), 'Identità dell’installazione mancante.');
        // Use the existing snapshot table order, but never accept arbitrary tables or columns from a ZIP.
        $expected = ['vendors', 'cost_centers', 'contracts', 'project_statuses', 'projects', 'expenses', 'expense_lines', 'budget_years', 'budget_entries', 'contract_cost_center', 'cost_center_project', 'cost_center_expense', 'attachments', 'comments', 'contract_reminder_deliveries'];
        Archive::check(array_keys($data['tables']) === $expected, 'Tabelle mancanti o non supportate nel backup.');
        $maps = ['users' => array_column($data['users'], 'id', 'id')];
        foreach ($data['tables'] as $table => $rows) {
            Archive::check(is_array($rows) && array_is_list($rows), 'Dati tabellari non validi.');
            $columns = Schema::getColumnListing($table);
            $maps[$table] = [];
            foreach ($rows as $row) {
                Archive::check(is_array($row) && count($row) === count($columns) && array_diff(array_keys($row), $columns) === [], 'Colonne incompatibili nel backup.');
                foreach ($row as $value) {
                    Archive::check(is_scalar($value) || $value === null, 'Valore tabellare non valido.');
                }
                if (in_array('id', $columns, true)) {
                    Archive::check(is_int($row['id']) && $row['id'] > 0 && ! isset($maps[$table][$row['id']]), 'Identificatore duplicato o non valido.');
                    $maps[$table][$row['id']] = $row['id'];
                }
                if (isset($row['tenant_id'])) {
                    Archive::check($row['tenant_id'] === $data['tenant']['id'], 'Il backup contiene dati di un altro tenant.');
                }
            }
        }
        $expectedFiles = ['data.json'];
        foreach ($data['tables'] as $table => $rows) {
            /** @var list<array<string, mixed>> $rows */
            foreach ($rows as $row) {
                foreach (self::REFS[$table] ?? [] as $column => $target) {
                    $this->reference($maps, $target, $row[$column]);
                }
                if ($table === 'comments') {
                    Validator::make(['content' => json_decode($row['content'], true, flags: JSON_THROW_ON_ERROR)], ['content' => ['required', 'array', new CommentContent]])->validate();
                    Archive::check(isset(self::MODELS[$row['commentable_type']]), 'Tipo di commento non supportato.');
                    $this->reference($maps, self::MODELS[$row['commentable_type']], $row['commentable_id']);
                    if ($row['parent_id'] !== null) {
                        $parent = collect($rows)->firstWhere('id', $row['parent_id']);
                        Archive::check($parent['parent_id'] === null && $parent['commentable_type'] === $row['commentable_type'] && $parent['commentable_id'] === $row['commentable_id'], 'Relazione fra commenti non valida.');
                    }
                }
                if ($table === 'attachments') {
                    $name = 'attachments/'.$row['id'];
                    $expectedFiles[] = $name;
                    Archive::check(count(array_filter([$row['contract_id'], $row['project_id'], $row['expense_id']])) === 1 && ($manifest['files'][$name]['size'] ?? null) === (int) $row['size_bytes'], 'Allegato mancante, incompleto o senza proprietario.');
                }
                if ($table === 'contract_reminder_deliveries') {
                    Archive::check(is_string($row['notification_key']) && preg_match('/^(?:removed:)?(?:expiry:[1-9][0-9]*:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]+|expiry-day:[0-9]{4}-[0-9]{2}-[0-9]{2}|monthly:[0-9]{4}-[0-9]{2})$/D', $row['notification_key']) === 1, 'Identità promemoria non valida.');
                }
                if ($table === 'budget_years') {
                    $sources = json_decode($row['dismissed_sources'] ?? '[]', true, flags: JSON_THROW_ON_ERROR);
                    Archive::check(is_array($sources) && array_is_list($sources), 'Sorgenti Budget non valide.');
                    foreach ($sources as $source) {
                        Archive::check(is_string($source) && preg_match('/^(contract|project|expense):[1-9][0-9]*$/D', $source) === 1, 'Sorgente Budget non valida.');
                        [$type, $id] = explode(':', $source);
                        $this->reference($maps, $type.'s', $id);
                    }
                }
            }
        }
        foreach ([...$data['members'], ...($data['tenant']['contract_reminders']['user_ids'] ?? [])] as $id) {
            $this->reference($maps, 'users', $id);
        }
        sort($expectedFiles);
        Archive::check(array_keys($manifest['files']) === $expectedFiles, 'File inattesi o mancanti nel backup tenant.');
    }
}

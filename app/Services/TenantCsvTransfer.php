<?php

namespace App\Services;

use App\Models\ExpenseLine;
use App\Models\ProjectStatus;
use App\Models\Tenant;
use App\Support\Money;
use App\Support\Transfers\SpreadsheetValues as Values;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class TenantCsvTransfer
{
    // Version 2 includes annual contract identity and uses explicit attributes, archive-local references and embedded pivot reference lists.
    // It excludes database IDs, tenant ownership, accounts, attachments and derived values.
    public const TYPES = [
        'vendor' => ['relation' => 'vendors', 'fields' => ['name', 'vat_number', 'email', 'phone', 'notes'], 'refs' => []],
        'cost-center' => ['relation' => 'costCenters', 'fields' => ['name'], 'refs' => ['parent_ref' => ['parent_id', 'cost-center']]],
        'contract' => ['relation' => 'contracts', 'fields' => ['year', 'name', 'reference_amount', 'starts_on', 'ends_on', 'notes'], 'refs' => ['vendor_ref' => ['vendor_id', 'vendor'], 'source_contract_ref' => ['source_contract_id', 'contract']]],
        'project' => ['relation' => 'projects', 'fields' => ['year', 'name', 'description', 'status', 'starts_on', 'ends_on'], 'refs' => ['source_project_ref' => ['source_project_id', 'project']]],
        'expense' => ['relation' => 'expenses', 'fields' => ['title', 'year', 'allocated_amount', 'actual_amount', 'notes', 'period_starts_on', 'period_ends_on'], 'refs' => ['vendor_ref' => ['vendor_id', 'vendor'], 'contract_ref' => ['contract_id', 'contract'], 'project_ref' => ['project_id', 'project']]],
        'expense-line' => ['relation' => 'lines', 'fields' => ['description', 'type', 'unit_price', 'quantity', 'total', 'position', 'period_starts_on', 'period_ends_on', 'year'], 'refs' => ['expense_ref' => ['expense_id', 'expense']]],
        'budget-year' => ['relation' => 'budgetYears', 'fields' => ['year', 'structure_copied', 'dismissed_sources'], 'refs' => []],
        'budget-entry' => ['relation' => 'budgetEntries', 'fields' => ['type', 'included', 'position'], 'refs' => ['budget_year_ref' => ['budget_year_id', 'budget-year'], 'contract_ref' => ['contract_id', 'contract'], 'project_ref' => ['project_id', 'project'], 'expense_ref' => ['expense_id', 'expense'], 'cost_center_ref' => ['cost_center_id', 'cost-center']]],
    ];

    private const PIVOTS = ['contract', 'project', 'expense'];

    private const MONEY = ['reference_amount', 'allocated_amount', 'actual_amount', 'unit_price', 'total'];

    /** @return 'vendors'|'contracts'|'projects'|'expenses'|'costCenters'|'budgetYears'|'budgetEntries' */
    private function tenantRelation(string $type): string
    {
        return match ($type) {
            'vendor' => 'vendors', 'contract' => 'contracts', 'project' => 'projects', 'expense' => 'expenses', 'cost-center' => 'costCenters', 'budget-year' => 'budgetYears', 'budget-entry' => 'budgetEntries', default => throw new \InvalidArgumentException('Unknown tenant relation')
        };
    }

    public function isEmpty(Tenant $tenant): bool
    {
        foreach (['vendors', 'contracts', 'projects', 'expenses', 'costCenters', 'budgetYears', 'budgetEntries', 'attachments'] as $relation) {
            if ($tenant->{$relation}()->exists()) {
                return false;
            }
        }

        return true;
    }

    /** @param resource $stream */
    public function write(Tenant $tenant, $stream): void
    {
        fputcsv($stream, ['record_type', 'record_ref', 'payload_json'], ',', '"', '');
        $this->row($stream, 'meta', 'tenant', ['format' => 'mp3-tenant', 'version' => 3, 'name' => $tenant->name, 'slug' => $tenant->slug, 'project_statuses' => $tenant->projectStatuses()->orderBy('id')->get(['key', 'name'])->toArray()]);
        foreach (self::TYPES as $type => $definition) {
            $query = $type === 'expense-line' ? ExpenseLine::whereHas('expense', fn ($q) => $q->where('tenant_id', $tenant->id)) : $tenant->{$this->tenantRelation($type)}()->getQuery();
            if (in_array($type, self::PIVOTS, true)) {
                $query->with('costCenters');
            }
            foreach ($query->orderBy('id')->lazy(500) as $record) {
                $payload = [];
                foreach ([...$definition['fields'], 'created_at', 'updated_at'] as $field) {
                    $value = $record->getAttribute($field);
                    $payload[$field] = $value instanceof \DateTimeInterface ? $value->format(in_array($field, ['created_at', 'updated_at'], true) ? 'Y-m-d H:i:s.u' : 'Y-m-d') : $value;
                }
                foreach ($definition['refs'] as $field => [$column, $target]) {
                    $payload[$field] = $record->getAttribute($column) === null ? null : $target.':'.$record->getAttribute($column);
                }
                if (in_array($type, self::PIVOTS, true)) {
                    $payload['cost_center_refs'] = $record->getRelation('costCenters')->pluck('id')->map(fn ($id) => 'cost-center:'.$id)->all();
                }
                $this->row($stream, $type, $type.':'.$record->id, $payload);
            }
        }
    }

    /** @param resource $stream
     * @param  array<string, mixed>  $payload
     */
    private function row($stream, string $type, string $ref, array $payload): void
    {
        fputcsv($stream, [$type, $ref, json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)], ',', '"', '');
    }

    /** @return array<string, mixed> */
    public function read(Tenant $tenant, string $path): array
    {
        if (! $this->isEmpty($tenant)) {
            Values::invalid('tenant', 'L’importazione CSV richiede un ambiente privo di dati gestionali.');
        }
        $stream = fopen($path, 'rb');
        if ($stream === false) {
            Values::invalid('file', 'Impossibile leggere il CSV.');
        }
        $records = [];
        $counts = [];
        $errors = [];
        $errorCount = 0;
        $meta = null;
        $line = 1;
        try {
            $header = fgetcsv($stream, null, ',', '"', '');
            if ($header !== false) {
                $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]);
            }
            if ($header !== ['record_type', 'record_ref', 'payload_json']) {
                Values::invalid('file', 'Intestazioni CSV incompatibili.');
            }
            while (($row = fgetcsv($stream, null, ',', '"', '')) !== false) {
                $line++;
                if ($line - 1 > (int) config('transfers.csv_max_records')) {
                    Values::invalid('file', 'Il CSV supera il limite di record consentiti.');
                }
                try {
                    if (count($row) !== 3) {
                        Values::invalid('record', 'Il record CSV deve contenere esattamente tre colonne.');
                    }
                    [$type, $ref, $json] = $row;
                    try {
                        $object = json_decode((string) $json, false, 32, JSON_THROW_ON_ERROR);
                    } catch (\JsonException) {
                        Values::invalid('payload_json', 'Payload JSON non valido.');
                    }
                    if (! $object instanceof \stdClass) {
                        Values::invalid('payload_json', 'Il payload deve essere un oggetto JSON.');
                    }
                    $data = (array) $object;
                    if ($type === 'meta') {
                        if ($line !== 2 || $meta !== null || $ref !== 'tenant' || array_diff(array_keys($data), ['format', 'version', 'name', 'slug', 'project_statuses']) !== [] || array_diff(['format', 'version', 'name', 'slug'], array_keys($data)) !== [] || ($data['format'] ?? null) !== 'mp3-tenant' || ! in_array($data['version'] ?? null, [1, 2, 3], true) || ! is_string($data['name'] ?? null) || ! is_string($data['slug'] ?? null)) {
                            Values::invalid('meta', 'Formato o versione CSV incompatibile.');
                        }
                        if (isset($data['project_statuses']) && is_array($data['project_statuses'])) {
                            $data['project_statuses'] = array_map(fn ($status) => $status instanceof \stdClass ? (array) $status : $status, $data['project_statuses']);
                        }
                        if (array_key_exists('project_statuses', $data)) {
                            Validator::make($data, [
                                'project_statuses' => ['present', 'array', 'list'],
                                'project_statuses.*' => ['required', 'array:key,name'],
                                'project_statuses.*.key' => ['required', 'string', 'max:255', 'distinct', 'not_in:none,no-status,all'],
                                'project_statuses.*.name' => ['required', 'string', 'max:255', 'distinct'],
                            ])->validate();
                        }
                        $meta = $data;

                        continue;
                    }
                    if ($line === 2 || $meta === null) {
                        Values::invalid('meta', 'Il primo record deve contenere i metadati di formato.');
                    }
                    if (! isset(self::TYPES[$type])) {
                        Values::invalid('record_type', 'Tipo di record sconosciuto.');
                    }
                    if (! is_string($ref) || ! preg_match('/^'.preg_quote($type, '/').':[1-9]\d{0,17}$/D', $ref)) {
                        Values::invalid('record_ref', 'Riferimento locale non valido.');
                    }
                    if (isset($records[$ref])) {
                        Values::invalid('record_ref', 'Riferimento duplicato.');
                    }
                    if ($type === 'contract' && $meta['version'] === 1) {
                        if (array_key_exists('year', $data) || array_key_exists('source_contract_ref', $data)) {
                            Values::invalid('payload_json', 'I campi annuali richiedono la versione CSV 2.');
                        }
                        $data['year'] = null;
                        $data['source_contract_ref'] = null;
                    }
                    if ($type === 'project' && $meta['version'] < 3) {
                        if (array_key_exists('year', $data) || array_key_exists('source_project_ref', $data)) {
                            Values::invalid('payload_json', 'I campi annuali dei progetti richiedono la versione CSV 3.');
                        }
                        $data['year'] = null;
                        $data['source_project_ref'] = null;
                    }
                    $this->validatePayload($type, $data);
                    $records[$ref] = ['type' => $type, 'data' => $data, 'row' => $line];
                    $counts[$type] = ($counts[$type] ?? 0) + 1;
                } catch (ValidationException $error) {
                    $this->errors($errors, $errorCount, $line, $error);
                }
            }
        } finally {
            fclose($stream);
        }
        if ($meta === null) {
            Values::invalid('file', 'Metadati CSV mancanti o incompatibili.');
        }
        $unique = [];
        $lineTotals = [];
        foreach ($records as $ref => $record) {
            try {
                $type = $record['type'];
                $data = $record['data'];
                $statusKeys = array_key_exists('project_statuses', $meta)
                    ? array_column($meta['project_statuses'], 'key') : array_keys(ProjectStatus::DEFAULTS);
                if ($type === 'project' && $data['status'] !== null && ! in_array($data['status'], $statusKeys, true)) {
                    Values::invalid('status', 'Lo stato non è definito nel CSV.');
                }
                foreach (self::TYPES[$type]['refs'] as $field => [$column, $target]) {
                    $this->reference($records, $data[$field], $target, $field);
                }
                foreach ($data['cost_center_refs'] ?? [] as $center) {
                    $this->reference($records, $center, 'cost-center', 'cost_center_refs');
                }
                if ($type === 'cost-center' && $data['parent_ref'] !== null) {
                    if ($data['parent_ref'] === $ref || $records[$data['parent_ref']]['data']['parent_ref'] !== null) {
                        Values::invalid('parent_ref', 'Gerarchia non valida: sono ammessi soltanto due livelli senza cicli.');
                    }
                }
                if ($type === 'budget-year') {
                    foreach ($data['dismissed_sources'] ?? [] as $source) {
                        if (! preg_match('/^(contract|project|expense):/', $source, $match)) {
                            Values::invalid('dismissed_sources', 'Tipo di sorgente rimossa non valido.');
                        }
                        $this->reference($records, $source, $match[1], 'dismissed_sources');
                    }
                    $key = 'year:'.$data['year'];
                    if (isset($unique[$key])) {
                        Values::invalid('year', 'Anno di Budget duplicato.');
                    } $unique[$key] = true;
                }
                if (in_array($type, ['contract', 'project'], true) && $data['source_'.$type.'_ref'] !== null) {
                    $sourceRef = 'source_'.$type.'_ref';
                    $source = $records[$data[$sourceRef]]['data'];
                    if ($data['year'] === null || $source['year'] === null || $source['year'] !== $data['year'] - 1) {
                        Values::invalid($sourceRef, 'La sorgente deve appartenere all’anno precedente.');
                    }
                    $key = $type.':'.$data['year'].':'.$data[$sourceRef];
                    if (isset($unique[$key])) {
                        Values::invalid($sourceRef, 'Sorgente già importata nello stesso anno.');
                    }
                    $unique[$key] = true;
                }
                if ($type === 'budget-entry') {
                    if (in_array($data['type'], ['contract', 'project'], true)) {
                        $sourceYear = $records[$data[$data['type'].'_ref']]['data']['year'];
                        if ($sourceYear !== null && $sourceYear !== $records[$data['budget_year_ref']]['data']['year']) {
                            Values::invalid($data['type'].'_ref', 'La sorgente e il Budget devono appartenere allo stesso anno.');
                        }
                    }
                    $key = $data['budget_year_ref'].':'.$data[$data['type'].'_ref'];
                    if (isset($unique[$key])) {
                        Values::invalid('source', 'Sorgente duplicata nello stesso Budget.');
                    } $unique[$key] = true;
                }
                if ($type === 'expense-line') {
                    $start = $data['period_starts_on'];
                    $end = $data['period_ends_on'];
                    if ($data['year'] !== null && $start !== null && ! in_array($data['year'], [(int) substr($start, 0, 4), (int) substr($end, 0, 4)], true)) {
                        Values::invalid('year', 'Anno non coerente con il periodo della riga.');
                    }
                    $parts = explode('.', $data['quantity']);
                    $scaled = (int) $parts[0] * 10000 + (int) str_pad($parts[1] ?? '', 4, '0');
                    $price = Money::cents($data['unit_price']);
                    if (abs($price) > intdiv(99999999999999 * 10000, $scaled)) {
                        Values::invalid('total', 'Totale riga fuori intervallo.');
                    }
                    $product = $price * $scaled;
                    if (Money::cents($data['total']) !== intdiv(abs($product) + 5000, 10000) * ($product < 0 ? -1 : 1)) {
                        Values::invalid('total', 'Il totale della riga non corrisponde a prezzo e quantità.');
                    }
                    $lineTotals[$data['expense_ref']][$data['type']] = ($lineTotals[$data['expense_ref']][$data['type']] ?? 0) + Money::cents($data['total']);
                }
            } catch (ValidationException $error) {
                $this->errors($errors, $errorCount, $record['row'], $error);
            }
        }
        foreach ($records as $ref => $record) {
            if ($record['type'] !== 'expense' || ! isset($lineTotals[$ref])) {
                continue;
            }
            foreach (['allocated', 'actual'] as $type) {
                $field = $type.'_amount';
                $amount = $record['data'][$field];
                $hasType = array_key_exists($type, $lineTotals[$ref]);
                $sum = $lineTotals[$ref][$type] ?? 0;
                // An absent type may be unknown or an ordinary expense's existing zero default.
                if (($hasType && $amount === null) || ($amount !== null && Money::cents($amount) !== $sum)) {
                    $expected = $hasType ? Money::decimal($sum) : 'null oppure 0.00 (nessuna riga di questo tipo)';
                    $message = 'Spesa «'.$record['data']['title'].'» ('.$ref.'): '.$field.' = '.($amount ?? 'null').' non coerente con le righe su tutti gli anni; atteso '.$expected.'.';
                    $this->errors($errors, $errorCount, $record['row'], ValidationException::withMessages([$field => $message]));
                }
            }
        }
        // Preserve overlapping periods and report them without blocking restoration.
        $warnings = [];
        if (collect($records)->contains(fn ($record) => $record['type'] === 'contract' && $record['data']['year'] === null)) {
            $warnings[] = 'Contratti storici senza anno: saranno conservati, ma richiedono una classificazione esplicita prima dell’importazione annuale.';
        }
        if (collect($records)->contains(fn ($record) => $record['type'] === 'project' && $record['data']['year'] === null)) {
            $warnings[] = 'Progetti storici senza anno: saranno conservati, ma richiedono una classificazione esplicita prima dell’importazione annuale.';
        }
        $periods = [];
        foreach ($records as $record) {
            if ($record['type'] !== 'expense') {
                continue;
            }
            $data = $record['data'];
            if ($data['contract_ref'] === null || $data['period_starts_on'] === null) {
                continue;
            }
            $periods[$data['contract_ref']][] = $record;
        }
        foreach ($periods as $group) {
            usort($group, fn ($a, $b) => strcmp($a['data']['period_starts_on'], $b['data']['period_starts_on']));
            $end = null;
            foreach ($group as $record) {
                if ($end !== null && $record['data']['period_starts_on'] <= $end) {
                    $warnings[] = 'Il periodo della spesa «'.$record['data']['title'].'» si sovrappone a quello di un’altra spesa dello stesso contratto.';
                }
                $end = max($end ?? '', $record['data']['period_ends_on']);
            }
        }

        return ['meta' => $meta, 'records' => $records, 'counts' => $counts, 'errors' => $errors, 'error_count' => $errorCount, 'warnings' => $warnings];
    }

    /** @param array<string, mixed> $data */
    private function validatePayload(string $type, array $data): void
    {
        $definition = self::TYPES[$type];
        $allowed = [...$definition['fields'], ...array_keys($definition['refs']), 'created_at', 'updated_at'];
        if (in_array($type, self::PIVOTS, true)) {
            $allowed[] = 'cost_center_refs';
        }
        if (array_diff(array_keys($data), $allowed) !== [] || array_diff($allowed, array_keys($data)) !== []) {
            Values::invalid('payload_json', 'Campi mancanti o non consentiti nel payload.');
        }
        $rules = [];
        foreach ($data as $field => $value) {
            $rules[$field] = match (true) {
                in_array($field, self::MONEY, true) => ['nullable', 'string', 'regex:/^-?\d{1,12}\.\d{2}$/D'],
                $field === 'quantity' => ['required', 'string', 'regex:/^\d{1,6}\.\d{4}$/D', 'numeric', 'gt:0'],
                in_array($field, ['created_at', 'updated_at'], true) => ['nullable', 'string'],
                str_ends_with($field, '_on') => ['nullable', 'date_format:Y-m-d'],
                str_ends_with($field, '_ref') => ['nullable', 'string', 'max:50'],
                $field === 'cost_center_refs' => ['present', 'array', 'list'],
                $field === 'dismissed_sources' => ['nullable', 'array', 'list'],
                $field === 'year' => [in_array($type, ['expense-line', 'contract', 'project'], true) ? 'nullable' : 'required', 'integer', 'between:2000,2100'],
                $field === 'position' => ['required', 'integer', 'min:0', 'max:4294967295'],
                in_array($field, ['included', 'structure_copied'], true) => ['required', 'boolean'],
                $field === 'type' => ['required', 'in:'.($type === 'expense-line' ? 'allocated,actual' : 'contract,project,expense')],
                $field === 'status' => ['nullable', 'string', 'max:255'],
                in_array($field, ['name', 'title'], true) => [$type === 'contract' ? 'nullable' : 'required', 'string', 'max:255'],
                default => ['nullable', 'string', 'max:'.(in_array($field, ['notes', 'description'], true) && $type !== 'expense-line' && $type !== 'budget-entry' ? '10000' : '255')],
            };
            if ($field === 'year' || $field === 'position') {
                if ($value !== null && ! is_int($value)) {
                    Values::invalid($field, 'Il valore deve essere un intero JSON.');
                }
            }
            if (in_array($field, ['included', 'structure_copied'], true) && ! is_bool($value)) {
                Values::invalid($field, 'Il valore deve essere booleano.');
            }
            if (in_array($field, ['created_at', 'updated_at'], true) && $value !== null) {
                if (! is_string($value)) {
                    Values::invalid($field, 'Timestamp non valido.');
                }
                $format = str_contains($value, '.') ? 'Y-m-d H:i:s.u' : 'Y-m-d H:i:s';
                $date = \DateTimeImmutable::createFromFormat('!'.$format, (string) $value);
                if (! $date || $date->format($format) !== $value || $date->format('u') !== '000000') {
                    Values::invalid($field, 'Timestamp non valido.');
                }
            }
        }
        $rules['cost_center_refs.*'] = ['required', 'string', 'distinct', 'max:50'];
        $rules['dismissed_sources.*'] = ['required', 'string', 'distinct', 'max:50'];
        Validator::make($data, $rules)->validate();
        foreach ([['starts_on', 'ends_on'], ['period_starts_on', 'period_ends_on']] as [$start, $end]) {
            if (! array_key_exists($start, $data)) {
                continue;
            }
            if ($start === 'period_starts_on' && (($data[$start] === null) !== ($data[$end] === null))) {
                Values::invalid($end, 'Indica entrambe le date del periodo.');
            }
            if ($data[$start] !== null && $data[$end] !== null && $data[$end] < $data[$start]) {
                Values::invalid($end, 'Periodo incoerente.');
            }
        }
        foreach (['expense_ref', 'budget_year_ref'] as $required) {
            if (array_key_exists($required, $data) && $data[$required] === null && (($type === 'expense-line' && $required === 'expense_ref') || $required === 'budget_year_ref')) {
                Values::invalid($required, 'Riferimento obbligatorio.');
            }
        }
        if ($type === 'expense-line' && ($data['unit_price'] === null || $data['total'] === null || $data['description'] === null)) {
            Values::invalid('line', 'Prezzo, totale e descrizione sono obbligatori.');
        }
        if ($type === 'budget-entry') {
            foreach (['contract', 'project', 'expense'] as $source) {
                if (($data[$source.'_ref'] !== null) !== ($data['type'] === $source)) {
                    Values::invalid('type', 'Sorgente Budget incoerente.');
                }
            }
        }
    }

    /** @param array<string, array<string, mixed>> $records */
    private function reference(array $records, ?string $ref, string $type, string $field): void
    {
        if ($ref !== null && (! isset($records[$ref]) || $records[$ref]['type'] !== $type)) {
            Values::invalid($field, 'Riferimento inesistente o di tipo errato: '.$ref);
        }
    }

    /** @param list<array<string, mixed>> $errors */
    private function errors(array &$errors, int &$count, int $row, ValidationException $error): void
    {
        foreach ($error->errors() as $field => $messages) {
            foreach ($messages as $message) {
                $count++;
                if (count($errors) < (int) config('transfers.preview_errors')) {
                    $errors[] = ['sheet' => 'CSV', 'row' => $row, 'field' => $field, 'message' => $message];
                }
            }
        }
    }

    /** @param array<string, mixed> $plan */
    public function restore(Tenant $tenant, array $plan): void
    {
        if (! $this->isEmpty($tenant)) {
            Values::invalid('tenant', 'L’ambiente contiene già dati gestionali.');
        }
        if ($plan['error_count'] > 0) {
            Values::invalid('file', 'Correggi gli errori nel CSV prima di importare.');
        }
        $statuses = $plan['meta']['project_statuses'] ?? array_map(fn ($key, $name) => compact('key', 'name'), array_keys(ProjectStatus::DEFAULTS), array_values(ProjectStatus::DEFAULTS));
        $tenant->projectStatuses()->delete();
        foreach ($statuses as $status) {
            $tenant->projectStatuses()->create($status);
        }
        /** @var array<string, Model> $map */
        $map = [];
        foreach (self::TYPES as $type => $definition) {
            foreach ($plan['records'] as $ref => $record) {
                if ($record['type'] !== $type) {
                    continue;
                }
                $payload = $record['data'];
                $attributes = array_intersect_key($payload, array_flip([...$definition['fields'], 'created_at', 'updated_at']));
                // Parent links and dismissed sources are assigned after all their targets exist.
                if ($type === 'budget-year') {
                    $attributes['dismissed_sources'] = null;
                }
                foreach ($definition['refs'] as $field => [$column, $target]) {
                    $attributes[$column] = $type === 'cost-center' || in_array($field, ['source_contract_ref', 'source_project_ref'], true) || $payload[$field] === null ? null : $map[$payload[$field]]->id;
                }
                if ($type === 'expense-line') {
                    $model = $map[$payload['expense_ref']]->lines()->make();
                } else {
                    $model = $tenant->{$this->tenantRelation($type)}()->make();
                }
                if ($type === 'budget-entry') {
                    $attributes['tenant_id'] = $tenant->id;
                }
                $model->forceFill($attributes);
                $model->timestamps = false;
                $model->save();
                $map[$ref] = $model;
            }
        }
        foreach ($plan['records'] as $ref => $record) {
            $data = $record['data'];
            $model = $map[$ref];
            if (in_array($record['type'], ['contract', 'project'], true) && $data['source_'.$record['type'].'_ref'] !== null) {
                $model->forceFill(['source_'.$record['type'].'_id' => $map[$data['source_'.$record['type'].'_ref']]->id])->save();
            }
            if ($record['type'] === 'cost-center' && $data['parent_ref'] !== null) {
                $model->forceFill(['parent_id' => $map[$data['parent_ref']]->id])->save();
            }
            if (in_array($record['type'], self::PIVOTS, true)) {
                $model->costCenters()->sync(array_map(fn ($target) => $map[$target]->id, $data['cost_center_refs']));
            }
            if ($record['type'] === 'budget-year') {
                $model->forceFill(['dismissed_sources' => $data['dismissed_sources'] === null ? null : array_map(fn ($target) => $plan['records'][$target]['type'].':'.$map[$target]->id, $data['dismissed_sources'])])->save();
            }
        }
        foreach ($plan['records'] as $ref => $record) {
            $restored = $map[$ref]->fresh();
            foreach (self::TYPES[$record['type']]['fields'] as $field) {
                if ($field === 'dismissed_sources') {
                    continue;
                }
                $actual = $restored->getAttribute($field);
                if ($actual instanceof \DateTimeInterface) {
                    $actual = $actual->format('Y-m-d');
                }
                if ($actual !== $record['data'][$field]) {
                    throw new \RuntimeException('Restored attribute mismatch.');
                }
            }
            foreach (self::TYPES[$record['type']]['refs'] as $field => [$column, $target]) {
                $expected = $record['data'][$field] === null ? null : $map[$record['data'][$field]]->id;
                if ($restored->getAttribute($column) != $expected) {
                    throw new \RuntimeException('Restored reference mismatch.');
                }
            }
        }
        foreach ($plan['counts'] as $type => $count) {
            $actual = $type === 'expense-line' ? ExpenseLine::whereHas('expense', fn ($q) => $q->where('tenant_id', $tenant->id))->count() : $tenant->{$this->tenantRelation($type)}()->count();
            if ($actual !== $count) {
                throw new \RuntimeException('Restored record count mismatch.');
            }
        }
    }
}

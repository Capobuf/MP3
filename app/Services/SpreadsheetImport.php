<?php

namespace App\Services;

use App\Http\Controllers\Tenant\BudgetController;
use App\Http\Controllers\Tenant\CatalogController;
use App\Http\Controllers\Tenant\CostCenterController;
use App\Http\Requests\ExpenseRequest;
use App\Imports\SectionFile;
use App\Imports\SectionRows;
use App\Models\Tenant;
use App\Support\EconomicYearContext;
use App\Support\ExpensePeriods;
use App\Support\Money;
use App\Support\Transfers\SpreadsheetValues as Values;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;
use PhpOffice\PhpSpreadsheet\Reader\Xlsx;
use ZipArchive;

class SpreadsheetImport
{
    /** @return array<string, mixed> */
    public function read(Tenant $tenant, string $resource, string $path): array
    {
        $rows = new SectionRows($resource);
        try {
            $zip = new ZipArchive;
            if ($zip->open($path) !== true) {
                Values::invalid('file', 'Il file non è un XLSX valido.');
            }
            $expanded = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                if ($stat === false) {
                    Values::invalid('file', 'Archivio XLSX non valido.');
                } $expanded += $stat['size'];
            }
            $zip->close();
            if ($expanded > 100 * 1024 * 1024) {
                Values::invalid('file', 'Il contenuto XLSX supera il limite di elaborazione.');
            }
            $info = (new Xlsx)->listWorksheetInfo($path);
            if (count($info) > 2 || ! in_array('Dati', array_column($info, 'worksheetName'), true) || array_diff(array_column($info, 'worksheetName'), ['Dati', 'Istruzioni']) !== []) {
                Values::invalid('file', 'Usa il modello: sono ammessi soltanto i fogli Dati e Istruzioni.');
            }
            foreach ($info as $sheet) {
                if ($sheet['totalRows'] > (int) config('transfers.xlsx_max_rows') + 1 || $sheet['totalColumns'] > max(1, count(SectionSpreadsheet::columns($resource)))) {
                    Values::invalid('file', 'Il foglio supera il limite di righe o colonne consentite.');
                }
            }
            Excel::import(new SectionFile($rows), $path, readerType: \Maatwebsite\Excel\Excel::XLSX);
        } catch (ValidationException $error) {
            throw $error;
        } catch (\Throwable $error) {
            report($error);
            Values::invalid('file', 'Impossibile leggere il file XLSX. Usa il modello della sezione.');
        }

        $plan = ['warnings' => [], 'records' => [], 'preview' => [], 'errors' => [], 'error_count' => 0, 'new' => 0, 'duplicates' => 0];
        $pending = [];
        $seen = [];
        foreach ($rows->rows as $row) {
            $status = 'new';
            $data = $row['values'];
            try {
                if ($row['formulas'] !== []) {
                    Values::invalid(implode(', ', $row['formulas']), 'Le formule non sono ammesse nei campi dati.');
                }
                $data = $this->normalize($tenant, $resource, $data);
                $status = $this->duplicate($tenant, $resource, $data, $seen) ? 'duplicate' : 'new';
                if ($status === 'new' && $resource === 'expenses') {
                    $expense = $tenant->expenses()->make();
                    $expense->setAttribute('id', -$row['row']);
                    app(ExpenseWriter::class)->persist($expense, $data, $pending, false);
                    if ($warning = ExpensePeriods::overlapWarning($expense, $pending)) {
                        $plan['warnings'][] = $warning;
                    }
                    $pending[$expense->id] = $expense;
                }
                $seen[] = $data;
                $plan[$status === 'new' ? 'new' : 'duplicates']++;
                $plan['records'][] = ['row' => $row['row'], 'data' => $data, 'status' => $status];
            } catch (ValidationException $error) {
                $status = 'error';
                foreach ($error->errors() as $field => $messages) {
                    foreach ($messages as $message) {
                        $plan['error_count']++;
                        if (count($plan['errors']) < (int) config('transfers.preview_errors')) {
                            $plan['errors'][] = ['sheet' => 'Dati', 'row' => $row['row'], 'field' => array_search($field, SectionSpreadsheet::columns($resource), true) ?: $field, 'message' => $message];
                        }
                    }
                }
            }
            if (count($plan['preview']) < (int) config('transfers.preview_rows')) {
                $plan['preview'][] = ['row' => $row['row'], 'label' => $row['values']['name'] ?? $row['values']['title'] ?? $row['values']['description'] ?? $row['values']['source_id'] ?? '', 'status' => $status, 'values' => $row['values']];
            }
        }
        if ($rows->rows === []) {
            Values::invalid('file', 'Il foglio Dati non contiene record.');
        }

        return $plan;
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function normalize(Tenant $tenant, string $resource, array $data): array
    {
        foreach ($data as $field => $value) {
            if (is_string($value)) {
                $data[$field] = trim($value) === '' ? null : trim($value);
            }
        }
        foreach (['starts_on', 'ends_on', 'period_starts_on', 'period_ends_on'] as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = Values::date($data[$field], $field);
            }
        }
        foreach (['reference_amount', 'allocated_amount', 'actual_amount'] as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = Values::money($data[$field], $field);
            }
        }
        foreach (['name', 'vat_number', 'email', 'phone', 'notes', 'description', 'title', 'status', 'type'] as $field) {
            if (isset($data[$field]) && is_numeric($data[$field])) {
                $data[$field] = (string) $data[$field];
            }
        }
        foreach (['vendor_id' => 'vendors', 'contract_id' => 'contracts', 'project_id' => 'projects', 'parent_id' => 'cost-centers', 'cost_center_id' => 'cost-centers'] as $field => $relation) {
            if (array_key_exists($field, $data)) {
                $data[$field] = $this->resolve($tenant, $relation, $data[$field], $field, isset($data['year']) ? (int) $data['year'] : null);
            }
        }
        if (array_key_exists('cost_center_ids', $data)) {
            $data['cost_center_ids'] = $data['cost_center_ids'] === null ? [] : array_map(fn ($name) => $this->resolve($tenant, 'cost-centers', trim($name), 'cost_center_ids'), explode(';', (string) $data['cost_center_ids']));
        }
        if ($resource === 'projects' && ! empty($data['status'])) {
            $matches = $tenant->projectStatuses()->where(fn ($query) => $query->where('key', $data['status'])->orWhere('name', $data['status']))->get();
            if ($matches->count() !== 1) {
                Values::invalid('status', 'Seleziona uno stato definito nelle impostazioni di questo ambiente.');
            }
            $data['status'] = $matches->first()->key;
        }
        if (in_array($resource, ['contracts', 'projects'], true)) {
            Validator::make($data, ['year' => ['required', 'integer', 'between:2000,2100']])->validate();
        }
        if (in_array($resource, ['vendors', 'contracts', 'projects'], true)) {
            return app(CatalogController::class)->validated(Request::create('/', 'POST', $data), $tenant, $resource);
        }
        if ($resource === 'cost-centers') {
            return app(CostCenterController::class)->validated(Request::create('/', 'POST', $data), $tenant);
        }
        if ($resource === 'budget') {
            Validator::make($data, ['year' => ['required', 'integer', 'between:2000,2100'], 'type' => ['required', 'in:new-expense,contract,project,expense'], 'description' => ['nullable', 'string', 'max:255']])->validate();
            $year = $tenant->budgetYears()->where('year', $data['year'])->first();
            if (! $year) {
                Values::invalid('year', 'Crea prima l’anno di Budget in MP3.');
            }
            if ($data['type'] === 'new-expense') {
                if ($data['source_id'] !== null || $data['description'] === null) {
                    Values::invalid('description', 'Una voce libera richiede descrizione e nessuna sorgente.');
                }
            } else {
                if ($data['description'] !== null || $data['allocated_amount'] !== null || $data['actual_amount'] !== null) {
                    Values::invalid('source_id', 'Le voci collegate richiedono solo la sorgente; lascia vuoti descrizione e importi.');
                }
                $data['source_id'] = $this->resolve($tenant, $data['type'].'s', $data['source_id'], 'source_id', (int) $data['year']);
                if ($data['source_id'] === null) {
                    Values::invalid('source_id', 'Indica una sorgente.');
                }
                if (in_array($data['type'].':'.$data['source_id'], $year->dismissed_sources ?? [], true)) {
                    Values::invalid('source_id', 'La sorgente è stata rimossa dal Budget. Ripristinala dall’interfaccia MP3.');
                }
            }

            return $data;
        }
        $data['lines'] = [];
        foreach (['allocated' => 'allocated_amount', 'actual' => 'actual_amount'] as $type => $field) {
            if ($data[$field] !== null) {
                $data['lines'][] = ['description' => $data['title'], 'type' => $type, 'unit_price' => $data[$field], 'quantity' => '1', 'year' => $data['year'], 'period_starts_on' => $data['period_starts_on'], 'period_ends_on' => $data['period_ends_on']];
            }
        }

        return Validator::make($data, ExpenseRequest::forTenant($tenant), (new ExpenseRequest)->messages())->validate();
    }

    private function resolve(Tenant $tenant, string $resource, mixed $value, string $field, ?int $year = null): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        $value = (string) $value;
        if ($resource === 'cost-centers') {
            $matches = $tenant->costCenters()->with('parent')->get()->filter(fn ($center) => ($center->name === $value || SectionSpreadsheet::path($center) === $value));
        } else {
            $query = $tenant->{$resource}();
            if (in_array($resource, ['contracts', 'projects'], true)) {
                $query->where('year', $year ?? EconomicYearContext::year($tenant, request()));
            }
            $name = $resource === 'expenses' ? 'title' : 'name';
            // Compare exact strings in PHP: database collations must not introduce fuzzy/case-insensitive matches.
            $matches = $query->where(fn ($q) => $resource === 'vendors' ? $q->where($name, $value)->orWhere('vat_number', $value) : $q->where($name, $value))->get()->filter(fn ($record) => $record->getAttribute($name) === $value || ($resource === 'vendors' && $record->vat_number === $value));
        }
        if ($matches->count() !== 1) {
            Values::invalid($field, $matches->isEmpty() ? "Riferimento «{$value}» inesistente in questo ambiente." : "Riferimento «{$value}» ambiguo: correggi il file.");
        }

        return $matches->first()->id;
    }

    /** @param array<string, mixed> $data
     * @param  list<array<string, mixed>>  $seen
     */
    private function duplicate(Tenant $tenant, string $resource, array $data, array $seen): bool
    {
        if ($resource === 'contracts' && ($data['name'] ?? '') === '') {
            return false;
        }
        if ($resource === 'budget') {
            $year = $tenant->budgetYears()->where('year', $data['year'])->firstOrFail();
            $matches = $data['type'] === 'new-expense'
                ? $year->entries()->where('type', 'expense')->whereHas('expense', fn ($q) => $q->where('title', $data['description'])->where('year', $data['year']))->with('expense')->get()
                : $year->entries()->where($data['type'].'_id', $data['source_id'])->get();
            if ($matches->isNotEmpty() && $data['type'] !== 'new-expense') {
                return true;
            }
        } else {
            $relation = match ($resource) {
                'cost-centers' => 'costCenters', default => $resource
            };
            $matches = $tenant->{$relation}()->where($resource === 'expenses' ? 'title' : 'name', $data[$resource === 'expenses' ? 'title' : 'name'])->get();
            if (in_array($resource, ['expenses', 'contracts', 'projects'], true)) {
                $matches = $matches->filter(fn ($r) => $r->year == $data['year']);
            }
            if ($resource === 'cost-centers') {
                $matches = $matches->filter(fn ($r) => $r->parent_id === $data['parent_id']);
            }
            if ($resource === 'vendors' && $data['vat_number'] !== null) {
                $matches = $matches->merge($tenant->vendors()->where('vat_number', $data['vat_number'])->get())->unique('id');
            }
        }
        foreach ($seen as $other) {
            if ($data === $other) {
                return true;
            }
            $key = $resource === 'expenses' ? 'title' : ($resource === 'budget' ? ($data['type'] === 'new-expense' ? 'description' : 'source_id') : 'name');
            $sameIdentity = ($data[$key] ?? null) === ($other[$key] ?? null) && ($data['year'] ?? null) == ($other['year'] ?? null) && ($data['parent_id'] ?? null) === ($other['parent_id'] ?? null) && ($data['type'] ?? null) === ($other['type'] ?? null);
            if ($resource === 'vendors' && $data['vat_number'] !== null && $data['vat_number'] === $other['vat_number']) {
                $sameIdentity = true;
            }
            if ($sameIdentity) {
                Values::invalid($key, 'Possibile duplicato nel file con dati diversi: correggi il file.');
            }

        }
        if ($matches->isEmpty()) {
            return false;
        }
        if ($matches->count() > 1) {
            Values::invalid('record', 'Corrispondenza duplicata ambigua: più record esistenti.');
        }
        $record = $matches->first();
        if ($resource === 'budget' && $data['type'] === 'new-expense') {
            if ($record->expense->title !== $data['description'] || $record->expense->allocated_amount !== $data['allocated_amount'] || $record->expense->actual_amount !== $data['actual_amount'] || $record->cost_center_id !== $data['cost_center_id']) {
                Values::invalid('description', 'Possibile duplicato con dati diversi. Nessun record verrà aggiornato.');
            }

            return true;
        }
        foreach ($data as $field => $value) {
            if ($field === 'lines') {
                continue;
            }
            if ($field === 'cost_center_ids') {
                $existing = $record->costCenters()->pluck('cost_centers.id')->all();
                sort($existing);
                $expected = $value;
                sort($expected);
                if ($existing !== $expected) {
                    Values::invalid($field, 'Possibile duplicato con centri di costo diversi.');
                }
            } elseif (! ($resource === 'budget' && in_array($field, ['source_id', 'year'], true))) {
                $existing = $record->getAttribute($field);
                if ($existing instanceof \DateTimeInterface) {
                    $existing = $existing->format('Y-m-d');
                }
                if (($existing === null) !== ($value === null) || ($existing !== null && (string) $existing !== (string) $value)) {
                    Values::invalid($field, 'Possibile duplicato con dati diversi. Nessun record verrà aggiornato.');
                }
            }
        }
        if ($resource === 'expenses' && $record->lines()->exists()) {
            $canonical = function (array $line) use ($data): array {
                foreach (['period_starts_on', 'period_ends_on'] as $date) {
                    $value = $line[$date] ?? null;
                    $line[$date] = $value instanceof \DateTimeInterface ? $value->format('Y-m-d') : $value;
                }

                return [$line['description'], $line['type'], Money::decimal(Money::cents($line['unit_price'])), number_format((float) ($line['quantity'] ?? 1), 4, '.', ''), $line['year'] ?? $data['year'], $line['period_starts_on'], $line['period_ends_on']];
            };
            $existing = $record->lines->map(fn ($line) => $canonical($line->getAttributes()))->all();
            $incoming = array_map($canonical, $data['lines']);
            if ($existing !== $incoming) {
                Values::invalid('lines', 'La spesa esistente ha condizioni economiche diverse.');
            }
        }

        return true;
    }

    /** @param array<string, mixed> $plan */
    public function commit(Tenant $tenant, string $resource, array $plan): void
    {
        if ($plan['error_count'] > 0) {
            Values::invalid('file', 'Correggi gli errori bloccanti prima di importare.');
        }
        foreach ($plan['records'] as $row) {
            if ($row['status'] !== 'new') {
                continue;
            }
            $data = $row['data'];
            if ($resource === 'expenses') {
                app(ExpenseWriter::class)->create($tenant, $data);

                continue;
            }
            if ($resource === 'budget') {
                $year = $tenant->budgetYears()->where('year', $data['year'])->lockForUpdate()->firstOrFail();
                if ($data['type'] === 'new-expense') {
                    $expense = app(ExpenseWriter::class)->create($tenant, [
                        'title' => $data['description'], 'year' => $year->year,
                        'allocated_amount' => $data['allocated_amount'], 'actual_amount' => $data['actual_amount'],
                        'cost_center_ids' => $data['cost_center_id'] === null ? [] : [$data['cost_center_id']],
                    ]);
                    $data = ['type' => 'expense', 'source_id' => $expense->id, 'cost_center_id' => $data['cost_center_id']];
                }
                unset($data['year']);
                app(BudgetController::class)->add($tenant, $year, $data, $row['row']);

                continue;
            }
            $ids = $data['cost_center_ids'] ?? [];
            unset($data['cost_center_ids']);
            $relation = $resource === 'cost-centers' ? 'costCenters' : $resource;
            $record = $tenant->{$relation}()->create($data);
            if (in_array($resource, ['contracts', 'projects'], true)) {
                $record->costCenters()->sync($ids);
            }
        }
    }
}

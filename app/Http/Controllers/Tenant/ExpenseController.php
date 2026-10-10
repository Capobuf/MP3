<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Http\Requests\ExpenseRequest;
use App\Models\Expense;
use App\Models\Tenant;
use App\Services\AttachmentFiles;
use App\Support\ExpenseOverview;
use App\Support\ExpensePeriods;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ExpenseController extends Controller
{
    public function index(Request $request, Tenant $tenant): Response
    {
        return Inertia::render('tenants/expenses', ExpenseOverview::page($tenant, $request));
    }

    public function show(Tenant $tenant, Expense $expense): Response
    {
        return Inertia::render('tenants/expense', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'expense' => $expense->load(['vendor:id,name', 'contract:id,name', 'project:id,name', 'lines', 'costCenters.parent:id,name']),
            'options' => ExpenseOverview::options($tenant),
        ]);
    }

    public function store(ExpenseRequest $request, Tenant $tenant): JsonResponse
    {
        $expense = $this->createForTenant($tenant, $request->validated());

        return response()->json(['record' => $expense->load(['vendor:id,name', 'contract:id,name', 'project:id,name', 'lines', 'costCenters.parent:id,name'])], 201);
    }

    /** @param array<string, mixed> $data Validated expense fields. */
    public function createForTenant(Tenant $tenant, array $data): Expense
    {
        return DB::transaction(function () use ($data, $tenant): Expense {
            $expense = $tenant->expenses()->make();
            ExpensePeriods::lockContracts($tenant, [$data['contract_id'] ?? null]);
            $this->persist($expense, $data);

            return $expense;
        });
    }

    public function update(ExpenseRequest $request, Tenant $tenant, Expense $expense): JsonResponse
    {
        DB::transaction(function () use ($request, $tenant, $expense): void {
            $locked = $tenant->expenses()->whereKey($expense->id)->lockForUpdate()->firstOrFail();
            ExpensePeriods::lockContracts($tenant, [$locked->contract_id, $request->validated('contract_id')]);
            $this->persist($locked, $request->validated());
        });

        return response()->json(['record' => $expense->refresh()->load(['vendor:id,name', 'contract:id,name', 'project:id,name', 'lines', 'costCenters.parent:id,name'])]);
    }

    public function destroy(Tenant $tenant, Expense $expense, AttachmentFiles $files): JsonResponse
    {
        DB::transaction(function () use ($tenant, $expense, $files): void {
            $locked = $tenant->expenses()->whereKey($expense->id)->lockForUpdate()->firstOrFail();
            ExpensePeriods::lockContracts($tenant, [$locked->contract_id]);
            $files->delete($locked);
        });

        return response()->json($files->result('Spesa eliminata.'));
    }

    public function destroyBatch(Request $request, Tenant $tenant, AttachmentFiles $files): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['prohibited'],
            'ids' => ['required', 'array', 'min:1', 'max:50'],
            'ids.*' => ['required', 'integer', 'distinct', Rule::exists('expenses', 'id')->where('tenant_id', $tenant->id)],
        ], [
            'ids.*.exists' => 'Una spesa non è disponibile in questo ambiente. Nessuna spesa eliminata.',
        ]);

        DB::transaction(function () use ($tenant, $data, $files): void {
            $records = $tenant->expenses()->whereIn('id', $data['ids'])->orderBy('id')->lockForUpdate()->get();
            abort_unless($records->count() === count($data['ids']), 409, 'La selezione è cambiata. Nessuna spesa eliminata.');
            ExpensePeriods::lockContracts($tenant, $records->pluck('contract_id')->all());

            foreach ($records as $record) {
                $files->delete($record);
            }
        });

        return response()->json($files->result('Spese selezionate eliminate.'));
    }

    public function batch(Request $request, Tenant $tenant): JsonResponse
    {
        $fields = array_filter(array_keys(ExpenseRequest::forTenant($tenant, true)), fn (string $field) => ! str_contains($field, '.'));
        $rules = ['tenant_id' => 'prohibited', 'updates' => ['required', 'array', 'min:1', 'max:500'], 'updates.*' => ['required', 'array:'.implode(',', ['id', ...$fields])]];
        $rules['updates.*.id'] = ['required', 'integer', 'distinct', Rule::exists('expenses', 'id')->where('tenant_id', $tenant->id)];
        foreach (ExpenseRequest::forTenant($tenant, true) as $field => $rule) {
            $rules['updates.*.'.$field] = $rule;
        }
        $data = Validator::make($request->all(), $rules, [
            '*.exists' => 'Una riga o un collegamento non appartiene a questo ambiente. Nessuna modifica salvata.',
            '*.regex' => 'Importo non valido: usa un valore con massimo due decimali.',
            '*.required' => 'La descrizione e l’anno non possono essere vuoti.',
        ])->validate();

        DB::transaction(function () use ($tenant, $data): void {
            $records = $tenant->expenses()->whereIn('id', array_column($data['updates'], 'id'))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            ExpensePeriods::lockContracts($tenant, [...$records->pluck('contract_id')->all(), ...array_column($data['updates'], 'contract_id')]);
            foreach ($data['updates'] as $update) {
                $record = $records->get($update['id']);
                abort_unless($record !== null, 404);
                $record->fill(array_diff_key($update, array_flip(['id', 'lines', 'cost_center_ids', 'contract_entry'])));
            }
            foreach ($data['updates'] as $index => $update) {
                $record = $records->get($update['id']);
                abort_unless($record !== null, 404);
                unset($update['id']);
                try {
                    $this->persist($record, $update, $records->all());
                } catch (ValidationException $error) {
                    $errors = [];
                    foreach ($error->errors() as $field => $messages) {
                        $errors["updates.{$index}.{$field}"] = $messages;
                    }
                    throw ValidationException::withMessages($errors);
                }
            }
        });

        return response()->json(['message' => 'Modifiche salvate.']);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<int, Expense>  $pending
     */
    private function persist(Expense $expense, array $data, array $pending = []): void
    {
        $hasLines = $expense->exists && $expense->lines()->exists();
        $contractEntry = $data['contract_entry'] ?? false;
        unset($data['contract_entry']);
        $expense->fill(array_diff_key($data, array_flip(['lines', 'cost_center_ids'])));
        $individualPeriods = isset($data['lines']) && array_filter($data['lines'], fn ($line) => array_key_exists('year', $line) || array_key_exists('period_starts_on', $line) || array_key_exists('period_ends_on', $line)) !== [];
        if ($individualPeriods) {
            $starts = array_filter(array_column($data['lines'], 'period_starts_on'));
            $ends = array_filter(array_column($data['lines'], 'period_ends_on'));
            $data['period_starts_on'] = $starts === [] ? null : min($starts);
            $data['period_ends_on'] = $ends === [] ? null : max($ends);
            $data['year'] = $data['lines'][0]['year'] ?? $expense->year;
            $expense->fill(array_diff_key($data, array_flip(['lines', 'cost_center_ids'])));
        }
        $sharedPeriodUpdate = array_intersect_key($data, array_flip(['year', 'period_starts_on', 'period_ends_on']));
        ExpensePeriods::validate($expense, $pending, ! $individualPeriods && (! $hasLines || $sharedPeriodUpdate !== []));
        if ($contractEntry && $expense->contract_id === null) {
            throw ValidationException::withMessages(['contract_id' => 'Seleziona il contratto della spesa.']);
        }
        $costCenterIds = $data['cost_center_ids'] ?? null;
        unset($data['cost_center_ids']);
        if (! array_key_exists('lines', $data)) {
            if ($contractEntry && $expense->allocated_amount === null && $expense->actual_amount === null) {
                throw ValidationException::withMessages(['allocated_amount' => 'Nel contratto indica almeno un importo previsto o effettivo, anche zero.']);
            }
            if ($hasLines &&
                (array_key_exists('allocated_amount', $data) || array_key_exists('actual_amount', $data))) {
                throw ValidationException::withMessages(['lines' => 'Modifica le righe della spesa: gli importi complessivi sono calcolati automaticamente.']);
            }
            // Keep the former shared-period API compatible without changing independent conditions.
            $periodUpdate = array_intersect_key($data, array_flip(['period_starts_on', 'period_ends_on', 'year']));
            if ($hasLines && $periodUpdate !== []) {
                $expense->lines()->where('period_starts_on', $expense->getRawOriginal('period_starts_on'))
                    ->where('period_ends_on', $expense->getRawOriginal('period_ends_on'))
                    ->where(fn ($query) => $query->where('year', $expense->getRawOriginal('year'))->orWhereNull('year'))
                    ->update($periodUpdate);
            }
            $expense->fill($data)->save();
            if ($costCenterIds !== null) {
                $expense->costCenters()->sync($costCenterIds);
            }

            return;
        }

        if ($contractEntry && $data['lines'] === []) {
            throw ValidationException::withMessages(['lines' => 'Inserisci almeno una riga economica completa, anche di valore zero.']);
        }

        $lines = [];
        $totals = ['allocated' => 0, 'actual' => 0];
        $limit = 99999999999999;
        foreach ($data['lines'] as $position => $line) {
            $start = array_key_exists('period_starts_on', $line) ? $line['period_starts_on'] : $expense->period_starts_on?->toDateString();
            $end = array_key_exists('period_ends_on', $line) ? $line['period_ends_on'] : $expense->period_ends_on?->toDateString();
            $year = $line['year'] ?? $expense->year;
            if ($start !== null && $end !== null && ! in_array((int) $year, [Carbon::parse($start)->year, Carbon::parse($end)->year], true)) {
                throw ValidationException::withMessages(["lines.{$position}.year" => 'Scegli l’anno iniziale o finale del periodo della condizione economica.']);
            }
            $quantity = (string) ($line['quantity'] ?? '1');
            $parts = explode('.', $quantity);
            $scaledQuantity = (int) $parts[0] * 10000 + (int) str_pad($parts[1] ?? '', 4, '0');
            $price = Money::cents((string) $line['unit_price']);
            if (abs($price) > intdiv($limit * 10000, $scaledQuantity)) {
                throw ValidationException::withMessages(["lines.{$position}.unit_price" => 'Il totale della riga supera l’importo massimo consentito.']);
            }
            $product = $price * $scaledQuantity;
            $cents = intdiv(abs($product) + 5000, 10000) * ($product < 0 ? -1 : 1);
            $totals[$line['type']] += $cents;
            $lines[] = [
                'description' => $line['description'],
                'type' => $line['type'],
                'unit_price' => Money::decimal($price),
                'quantity' => $quantity,
                'total' => Money::decimal($cents),
                'position' => $position,
                'period_starts_on' => $start,
                'period_ends_on' => $end,
                'year' => $expense->contract_id !== null || array_key_exists('year', $line) ? $year : null,
            ];
        }
        foreach ($totals as $total) {
            if (abs($total) > $limit) {
                throw ValidationException::withMessages(['lines' => 'La somma delle righe supera l’importo massimo consentito.']);
            }
        }
        unset($data['lines']);
        // Missing types are unknown for contracts; retain the ordinary expense defaults.
        foreach (['allocated' => 'allocated_amount', 'actual' => 'actual_amount'] as $type => $field) {
            $hasType = in_array($type, array_column($lines, 'type'), true);
            $data[$field] = ! $hasType &&
                ($expense->contract_id !== null || $expense->getRawOriginal('contract_id') !== null ||
                    ($hasLines && $expense->getRawOriginal($field) === null))
                ? null : Money::decimal($totals[$type]);
        }
        $expense->fill($data)->save();
        $expense->lines()->delete();
        $expense->lines()->createMany($lines);
        if ($costCenterIds !== null) {
            $expense->costCenters()->sync($costCenterIds);
        }
    }
}

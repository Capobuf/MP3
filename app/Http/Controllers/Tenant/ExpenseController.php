<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Http\Requests\ExpenseRequest;
use App\Models\Expense;
use App\Models\Tenant;
use App\Support\ExpenseOverview;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
        $expense = DB::transaction(function () use ($request, $tenant): Expense {
            $expense = $tenant->expenses()->make();
            $this->persist($expense, $request->validated());

            return $expense;
        });

        return response()->json(['record' => $expense->load(['vendor:id,name', 'contract:id,name', 'project:id,name', 'lines', 'costCenters.parent:id,name'])], 201);
    }

    public function update(ExpenseRequest $request, Tenant $tenant, Expense $expense): JsonResponse
    {
        DB::transaction(function () use ($request, $tenant, $expense): void {
            $locked = $tenant->expenses()->whereKey($expense->id)->lockForUpdate()->firstOrFail();
            $this->persist($locked, $request->validated());
        });

        return response()->json(['record' => $expense->refresh()->load(['vendor:id,name', 'contract:id,name', 'project:id,name', 'lines', 'costCenters.parent:id,name'])]);
    }

    public function destroy(Tenant $tenant, Expense $expense): JsonResponse
    {
        $expense->delete();

        return response()->json(['message' => 'Spesa eliminata.']);
    }

    public function destroyBatch(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['prohibited'],
            'ids' => ['required', 'array', 'min:1', 'max:50'],
            'ids.*' => ['required', 'integer', 'distinct', Rule::exists('expenses', 'id')->where('tenant_id', $tenant->id)],
        ], [
            'ids.*.exists' => 'Una spesa non è disponibile in questo ambiente. Nessuna spesa eliminata.',
        ]);

        DB::transaction(function () use ($tenant, $data): void {
            $records = $tenant->expenses()->whereIn('id', $data['ids'])->orderBy('id')->lockForUpdate()->get();
            abort_unless($records->count() === count($data['ids']), 409, 'La selezione è cambiata. Nessuna spesa eliminata.');

            foreach ($records as $record) {
                if (! $record->delete()) {
                    abort(409, 'Eliminazione non riuscita. Nessuna spesa eliminata.');
                }
            }
        });

        return response()->json(['message' => 'Spese selezionate eliminate.']);
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
            $records = $tenant->expenses()->whereIn('id', array_column($data['updates'], 'id'))->lockForUpdate()->get()->keyBy('id');
            foreach ($data['updates'] as $update) {
                $record = $records->get($update['id']);
                abort_unless($record !== null, 404);
                unset($update['id']);
                $this->persist($record, $update);
            }
        });

        return response()->json(['message' => 'Modifiche salvate.']);
    }

    /** @param array<string, mixed> $data */
    private function persist(Expense $expense, array $data): void
    {
        $costCenterIds = $data['cost_center_ids'] ?? null;
        unset($data['cost_center_ids']);
        if (! array_key_exists('lines', $data)) {
            if ($expense->exists && $expense->lines()->exists() &&
                (array_key_exists('allocated_amount', $data) || array_key_exists('actual_amount', $data))) {
                throw ValidationException::withMessages(['lines' => 'Modifica le righe della spesa: gli importi complessivi sono calcolati automaticamente.']);
            }
            $expense->fill($data)->save();
            if ($costCenterIds !== null) {
                $expense->costCenters()->sync($costCenterIds);
            }

            return;
        }

        $lines = [];
        $totals = ['allocated' => 0, 'actual' => 0];
        $limit = 99999999999999;
        foreach ($data['lines'] as $position => $line) {
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
            ];
        }
        foreach ($totals as $total) {
            if (abs($total) > $limit) {
                throw ValidationException::withMessages(['lines' => 'La somma delle righe supera l’importo massimo consentito.']);
            }
        }
        unset($data['lines']);
        $data['allocated_amount'] = Money::decimal($totals['allocated']);
        $data['actual_amount'] = Money::decimal($totals['actual']);
        $expense->fill($data)->save();
        $expense->lines()->delete();
        $expense->lines()->createMany($lines);
        if ($costCenterIds !== null) {
            $expense->costCenters()->sync($costCenterIds);
        }
    }
}

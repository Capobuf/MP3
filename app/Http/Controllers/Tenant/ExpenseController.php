<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Http\Requests\ExpenseRequest;
use App\Models\Expense;
use App\Models\Tenant;
use App\Services\AttachmentFiles;
use App\Services\ExpenseWriter;
use App\Support\ExpenseAnalytics;
use App\Support\ExpenseOverview;
use App\Support\ExpensePeriods;
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
        return Inertia::render('tenants/expenses', [
            ...ExpenseOverview::page($tenant, $request),
            'analytics' => ExpenseAnalytics::kpis($tenant, $request),
        ]);
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
        $expense = app(ExpenseWriter::class)->create($tenant, $request->validated());

        return response()->json(['record' => $expense->load(['vendor:id,name', 'contract:id,name', 'project:id,name', 'lines', 'costCenters.parent:id,name'])], 201);
    }

    public function update(ExpenseRequest $request, Tenant $tenant, Expense $expense): JsonResponse
    {
        DB::transaction(function () use ($request, $tenant, $expense): void {
            $locked = $tenant->expenses()->whereKey($expense->id)->lockForUpdate()->firstOrFail();
            ExpensePeriods::lockContracts($tenant, [$locked->contract_id, $request->validated('contract_id')]);
            app(ExpenseWriter::class)->persist($locked, $request->validated());
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
                    app(ExpenseWriter::class)->persist($record, $update, $records->all());
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
}

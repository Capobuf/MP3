<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Http\Requests\ExpenseRequest;
use App\Models\Expense;
use App\Models\Tenant;
use App\Support\ExpenseOverview;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
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
            'expense' => $expense->load(['vendor:id,name', 'contract:id,name', 'project:id,name']),
            'options' => ExpenseOverview::options($tenant),
        ]);
    }

    public function store(ExpenseRequest $request, Tenant $tenant): JsonResponse
    {
        $expense = $tenant->expenses()->create($request->validated());

        return response()->json(['record' => $expense->load(['vendor:id,name', 'contract:id,name', 'project:id,name'])], 201);
    }

    public function update(ExpenseRequest $request, Tenant $tenant, Expense $expense): JsonResponse
    {
        $expense->update($request->validated());

        return response()->json(['record' => $expense->refresh()->load(['vendor:id,name', 'contract:id,name', 'project:id,name'])]);
    }

    public function destroy(Tenant $tenant, Expense $expense): JsonResponse
    {
        $expense->delete();

        return response()->json(['message' => 'Spesa eliminata.']);
    }

    public function batch(Request $request, Tenant $tenant): JsonResponse
    {
        $rules = ['tenant_id' => 'prohibited', 'updates' => ['required', 'array', 'min:1', 'max:500'], 'updates.*' => ['required', 'array:'.implode(',', ['id', ...array_keys(ExpenseRequest::forTenant($tenant, true))])]];
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
                $record->update($update);
            }
        });

        return response()->json(['message' => 'Modifiche salvate.']);
    }
}

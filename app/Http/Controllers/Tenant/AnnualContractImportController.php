<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\BudgetYear;
use App\Models\Tenant;
use App\Services\AnnualBudget;
use App\Services\AnnualContractImport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AnnualContractImportController extends Controller
{
    public function preview(Tenant $tenant, BudgetYear $budgetYear, AnnualContractImport $import): JsonResponse
    {
        return response()->json($import->preview($tenant, $budgetYear));
    }

    public function store(Request $request, Tenant $tenant, BudgetYear $budgetYear, AnnualContractImport $import, AnnualBudget $budget): JsonResponse
    {
        $data = $request->validate([
            'contracts' => ['required', 'array', 'list', 'min:1'],
            'contracts.*' => ['required', 'array:id,token,starts_on,ends_on,expense_ids'],
            'contracts.*.id' => ['required', 'integer', 'distinct'],
            'contracts.*.token' => ['required', 'string', 'size:64'],
            'contracts.*.starts_on' => ['present', 'nullable', 'date_format:Y-m-d'],
            'contracts.*.ends_on' => ['present', 'nullable', 'date_format:Y-m-d'],
            'contracts.*.expense_ids' => ['present', 'array', 'list'],
            'contracts.*.expense_ids.*' => ['required', 'integer', 'distinct'],
        ]);
        foreach ($data['contracts'] as $selection) {
            if ($selection['starts_on'] !== null && $selection['ends_on'] !== null && $selection['ends_on'] < $selection['starts_on']) {
                throw ValidationException::withMessages(['contracts' => 'La data finale deve essere uguale o successiva alla data iniziale.']);
            }
        }
        $import->commit($tenant, $budgetYear, $data['contracts']);

        return response()->json(['budget' => $budget->snapshot($tenant, $budgetYear), 'message' => 'Importazione completata. Dati originali invariati.']);
    }
}

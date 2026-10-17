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
    public function preview(Tenant $tenant, BudgetYear $budgetYear, AnnualContractImport $import, string $type = 'contract'): JsonResponse
    {
        return response()->json($import->preview($tenant, $budgetYear, $type));
    }

    public function store(Request $request, Tenant $tenant, BudgetYear $budgetYear, AnnualContractImport $import, AnnualBudget $budget, string $type = 'contract'): JsonResponse
    {
        $resource = $type.'s';
        $data = $request->validate([
            $resource => ['required', 'array', 'list', 'min:1'],
            "{$resource}.*" => ['required', 'array:id,token,starts_on,ends_on,expense_ids'],
            "{$resource}.*.id" => ['required', 'integer', 'distinct'],
            "{$resource}.*.token" => ['required', 'string', 'size:64'],
            "{$resource}.*.starts_on" => ['present', 'nullable', 'date_format:Y-m-d'],
            "{$resource}.*.ends_on" => ['present', 'nullable', 'date_format:Y-m-d'],
            "{$resource}.*.expense_ids" => ['present', 'array', 'list'],
            "{$resource}.*.expense_ids.*" => ['required', 'integer', 'distinct'],
        ]);
        foreach ($data[$resource] as $selection) {
            if ($selection['starts_on'] !== null && $selection['ends_on'] !== null && $selection['ends_on'] < $selection['starts_on']) {
                throw ValidationException::withMessages([$resource => 'La data finale deve essere uguale o successiva alla data iniziale.']);
            }
        }
        $import->commit($tenant, $budgetYear, $data[$resource], $type);

        return response()->json(['budget' => $budget->snapshot($tenant, $budgetYear), 'message' => 'Importazione completata. Dati originali invariati.']);
    }
}

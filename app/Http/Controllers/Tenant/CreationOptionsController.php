<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\Tenant;
use App\Support\EconomicYearContext;
use App\Support\ExpenseOverview;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class CreationOptionsController extends Controller
{
    public function create(Request $request, Tenant $tenant, string $kind): Response
    {
        return $this->form($request, $tenant, $kind);
    }

    public function edit(Request $request, Tenant $tenant, string $kind, int $record): Response
    {
        $relation = match ($kind) {
            'cost-centers' => $tenant->costCenters(),
            'expenses' => $tenant->expenses(),
            'vendors' => $tenant->vendors(),
            'contracts' => $tenant->contracts(),
            'projects' => $tenant->projects(),
            default => abort(404),
        };
        $item = $relation->whereKey($record)->firstOrFail();
        $item->load(match ($kind) {
            'cost-centers' => ['parent:id,name', 'children'],
            'expenses' => ['vendor:id,name', 'contract:id,name', 'project:id,name', 'lines', 'costCenters.parent:id,name'],
            'contracts' => ['vendor:id,name', 'costCenters.parent:id,name'],
            'projects' => ['costCenters.parent:id,name'],
            default => [],
        });

        return $this->form($request, $tenant, $kind, $item);
    }

    private function form(Request $request, Tenant $tenant, string $kind, ?Model $record = null): Response
    {
        $data = $request->validate([
            'contract_id' => ['nullable', 'integer', Rule::exists('contracts', 'id')->where('tenant_id', $tenant->id)],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('tenant_id', $tenant->id)],
            'parent_id' => ['nullable', 'integer', Rule::exists('cost_centers', 'id')->where('tenant_id', $tenant->id)->whereNull('parent_id')],
        ]);
        $contract = $kind === 'expenses' && isset($data['contract_id'])
            ? $tenant->contracts()->with('costCenters.parent:id,name')->whereKey((int) $data['contract_id'])->firstOrFail()
            : null;
        if ($contract) {
            abort_if($record instanceof Expense && $record->contract_id !== $contract->id, 404);
            $contract->setAttribute('has_period_expenses', $contract->expenses()->whereNotNull('period_starts_on')->exists());
        }
        $project = $kind === 'expenses' && isset($data['project_id'])
            ? $tenant->projects()->whereKey((int) $data['project_id'])->firstOrFail()
            : null;
        if ($project) {
            abort_if($record instanceof Expense && $record->project_id !== $project->id, 404);
        }

        return Inertia::render('tenants/create', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'kind' => $kind,
            'record' => $record,
            'year' => $record instanceof Expense ? $record->year : EconomicYearContext::year($tenant, $request),
            'options' => ExpenseOverview::options($tenant),
            'contractContext' => $contract,
            'projectContext' => $project,
            'parentId' => $kind === 'cost-centers' && isset($data['parent_id']) ? (int) $data['parent_id'] : null,
        ]);
    }

    public function __invoke(Tenant $tenant): JsonResponse
    {
        return response()->json(['options' => ExpenseOverview::options($tenant)]);
    }
}

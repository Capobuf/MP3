<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\CostCenter;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class CostCenterController extends Controller
{
    public function index(Request $request, Tenant $tenant): Response
    {
        $query = $tenant->costCenters()->whereNull('parent_id')
            ->withCount(['expenses', 'projects', 'contracts'])
            ->with(['children' => fn ($query) => $query->withCount(['expenses', 'projects', 'contracts'])]);
        if ($search = $request->string('search')->trim()->toString()) {
            $query->where(fn ($query) => $query->where('name', 'like', '%'.$search.'%')
                ->orWhereHas('children', fn ($children) => $children->where('name', 'like', '%'.$search.'%')));
        }

        return Inertia::render('tenants/cost-centers', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'records' => $query->orderBy('name')->paginate(25)->withQueryString(),
            'parents' => $tenant->costCenters()->whereNull('parent_id')->orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('search'),
        ]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, Tenant $tenant, ?CostCenter $record = null): array
    {
        $data = $request->validate([
            'tenant_id' => ['prohibited'],
            'name' => ['required', 'string', 'max:255'],
            'parent_id' => ['nullable', 'integer', Rule::exists('cost_centers', 'id')->where('tenant_id', $tenant->id)->whereNull('parent_id')],
        ], [
            'name.required' => 'Inserisci il nome del Centro di Costo.',
            'parent_id.exists' => 'Seleziona un centro padre di primo livello di questo ambiente.',
        ]);
        if (! empty($data['parent_id']) && $record !== null &&
            ((int) $data['parent_id'] === $record->id || $record->children()->exists())) {
            throw ValidationException::withMessages(['parent_id' => 'Un centro con figli non può diventare figlio. Sono consentiti al massimo due livelli.']);
        }

        return $data;
    }

    public function store(Request $request, Tenant $tenant): JsonResponse
    {
        $record = DB::transaction(function () use ($request, $tenant) {
            Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();

            return $tenant->costCenters()->create($this->validated($request, $tenant));
        });

        return response()->json(['record' => $record->load('parent:id,name')], 201);
    }

    public function update(Request $request, Tenant $tenant, CostCenter $costCenter): JsonResponse
    {
        DB::transaction(function () use ($request, $tenant, $costCenter) {
            Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            $record = $tenant->costCenters()->whereKey($costCenter->id)->firstOrFail();
            $record->update($this->validated($request, $tenant, $record));
        });

        return response()->json(['record' => $costCenter->refresh()->load('parent:id,name')]);
    }

    public function destroy(Request $request, Tenant $tenant, CostCenter $costCenter): JsonResponse
    {
        $data = $request->validate(['delete_children' => ['required', 'boolean']]);
        DB::transaction(function () use ($data, $tenant, $costCenter) {
            Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            $record = $tenant->costCenters()->whereKey($costCenter->id)->firstOrFail();
            if ($data['delete_children']) {
                $record->children()->delete();
            } else {
                $record->children()->update(['parent_id' => null]);
            }
            $record->delete();
        });

        return response()->json(['message' => 'Centro di Costo eliminato.']);
    }
}

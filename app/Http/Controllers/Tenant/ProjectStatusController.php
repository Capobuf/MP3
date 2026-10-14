<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ProjectStatusController extends Controller
{
    public function index(Tenant $tenant): Response
    {
        $statuses = $tenant->projectStatuses()->orderBy('id')->get();
        $counts = $tenant->projects()->select('status')->selectRaw('COUNT(*) AS total')->groupBy('status')->pluck('total', 'status');
        foreach ($statuses as $status) {
            $status->setAttribute('projects_count', (int) ($counts[$status->key] ?? 0));
        }

        return Inertia::render('tenants/settings/project-statuses', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'statuses' => $statuses,
        ]);
    }

    public function store(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:255', Rule::unique('project_statuses')->where('tenant_id', $tenant->id)]]);

        return response()->json(['record' => $tenant->projectStatuses()->create($data)], 201);
    }

    public function update(Request $request, Tenant $tenant, int $status): JsonResponse
    {
        $record = $tenant->projectStatuses()->findOrFail($status);
        $data = $request->validate(['name' => ['required', 'string', 'max:255', Rule::unique('project_statuses')->where('tenant_id', $tenant->id)->ignore($record)]]);
        $record->update($data);

        return response()->json(['record' => $record]);
    }

    public function destroy(Request $request, Tenant $tenant, int $status): JsonResponse
    {
        DB::transaction(function () use ($request, $tenant, $status): void {
            Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            $record = $tenant->projectStatuses()->findOrFail($status);
            $data = $request->validate([
                'replacement' => ['present', 'nullable', 'string', Rule::notIn([$record->key]), Rule::exists('project_statuses', 'key')->where('tenant_id', $tenant->id)],
            ], ['replacement.present' => 'Scegli lo stato di destinazione, anche nessuno stato.']);
            $tenant->projects()->where('status', $record->key)->update(['status' => $data['replacement']]);
            $record->delete();
        });

        return response()->json(['message' => 'Stato eliminato e progetti aggiornati.']);
    }
}

<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\ContractSchedule;
use App\Support\EconomicYearContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ContractScheduleController extends Controller
{
    public function index(Request $request, Tenant $tenant, ContractSchedule $schedule): Response
    {
        return Inertia::render('tenants/contract-schedule', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'year' => EconomicYearContext::year($tenant, $request),
            'today' => now(ContractSchedule::TIMEZONE)->toDateString(),
            'records' => $schedule->listing($tenant, $request),
            'filters' => $request->only('search', 'period'),
        ]);
    }

    public function edit(Tenant $tenant, ContractSchedule $schedule): Response
    {
        $users = $tenant->users()->orderBy('name')->get(['users.id', 'name', 'email']);
        $settings = $schedule->settings($tenant);
        $settings['user_ids'] = array_values(array_intersect($settings['user_ids'], $users->modelKeys()));

        return Inertia::render('tenants/settings/contract-reminders', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'settings' => $settings,
            'users' => $users,
        ]);
    }

    public function preview(Request $request, Tenant $tenant, ContractSchedule $schedule): JsonResponse
    {
        return response()->json($schedule->preview($tenant, $this->validated($request, $tenant, false)));
    }

    public function update(Request $request, Tenant $tenant, ContractSchedule $schedule): JsonResponse
    {
        $data = $this->validated($request, $tenant, true);
        if ($data['enabled'] && $schedule->recipients($tenant, $data) === []) {
            throw ValidationException::withMessages(['user_ids' => 'Seleziona almeno un destinatario valido.']);
        }
        DB::transaction(function () use ($tenant, $data): void {
            $record = Tenant::query()->whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            $record->contract_reminders = [...$data, 'starts_at' => now(ContractSchedule::TIMEZONE)->toIso8601String()];
            $record->save();
        });

        return response()->json(['message' => 'Promemoria salvati.']);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, Tenant $tenant, bool $saving): array
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'mode' => ['required', Rule::in(['expiry', 'monthly'])],
            'days' => ['present', 'array', 'max:100', Rule::when($request->input('mode') === 'expiry', 'min:1')],
            'days.*' => ['integer', 'distinct', 'between:1,3650'],
            'monthly_day' => ['required', 'integer', 'between:1,28'],
            'user_ids' => ['present', 'array', 'max:500'],
            'user_ids.*' => ['integer', 'distinct', ...($saving ? [Rule::exists('tenant_user', 'user_id')->where('tenant_id', $tenant->id)] : [])],
            'external_emails' => ['present', 'array', 'max:100'],
            'external_emails.*' => ['required', 'string', 'email:rfc', 'max:254'],
        ]);
        $data['enabled'] = (bool) $data['enabled'];
        $data['days'] = array_map('intval', $data['days']);
        $data['monthly_day'] = (int) $data['monthly_day'];
        $data['user_ids'] = array_map('intval', $data['user_ids']);
        $data['external_emails'] = array_values(array_unique(array_map(fn ($email) => mb_strtolower(trim($email)), $data['external_emails'])));

        return $data;
    }
}

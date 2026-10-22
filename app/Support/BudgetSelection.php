<?php

namespace App\Support;

use App\Models\BudgetYear;
use App\Models\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

final class BudgetSelection
{
    /** @return list<int>|null */
    public static function ids(Request $request, Tenant $tenant, ?BudgetYear $year): ?array
    {
        $data = $request->validate(['entry_ids' => ['nullable', 'string', 'regex:/^\d+(,\d+)*$/D']]);
        if (! $request->has('entry_ids')) {
            return null;
        }
        $ids = ($data['entry_ids'] ?? '') === '' ? [] : explode(',', $data['entry_ids']);
        Validator::make(['entry_ids' => $ids], [
            'entry_ids' => ['array', Rule::exists('budget_entries', 'id')->where('tenant_id', $tenant->id)->where('budget_year_id', $year?->id)],
            'entry_ids.*' => ['integer', 'min:1'],
        ], ['entry_ids.exists' => 'Le voci selezionate non sono più disponibili in questo Budget. Aggiorna il Budget e riprova.'])->validate();

        return array_map('intval', $ids);
    }
}

<?php

namespace App\Support;

use App\Models\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

final class EconomicYearContext
{
    public static function year(Tenant $tenant, Request $request): int
    {
        $key = 'economic_year.'.$tenant->id;
        if ($request->attributes->has($key)) {
            return $request->attributes->get($key);
        }

        // Domain payloads (including expense and Budget years) never change the preference.
        $data = $request->isMethod('GET')
            ? Validator::make($request->query(), ['year' => ['sometimes', 'required', 'integer', 'between:2000,2100']])->validate()
            : [];
        $saved = $request->hasSession() ? $request->session()->get($key) : null;
        $year = isset($data['year']) ? (int) $data['year'] : ($saved ?? now()->year);
        if ($request->hasSession() && isset($data['year'])) {
            $request->session()->put($key, $year);
        }
        $request->attributes->set($key, $year);

        return $year;
    }

    /** @return list<int> */
    public static function years(Tenant $tenant, int $selected): array
    {
        $years = $tenant->expenses()->select('year')->distinct()->pluck('year')
            ->merge(DB::table('expense_lines')->join('expenses', 'expenses.id', '=', 'expense_lines.expense_id')
                ->where('expenses.tenant_id', $tenant->id)->whereNotNull('expense_lines.year')
                ->select('expense_lines.year')->distinct()->pluck('year'))
            ->merge($tenant->budgetYears()->select('year')->distinct()->pluck('year'))
            ->merge($tenant->contracts()->whereNotNull('year')->pluck('year'))
            ->merge($tenant->projects()->whereNotNull('year')->pluck('year'))
            ->push(now()->year, $selected);

        return array_values($years->map(fn ($year) => (int) $year)->filter(fn ($year) => $year >= 2000 && $year <= 2100)
            ->unique()->sortDesc()->all());
    }
}

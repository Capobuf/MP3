<?php

namespace App\Support;

use App\Models\Expense;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

final class ExpenseOverview
{
    /** @return Builder<Expense> */
    public static function query(Tenant $tenant, Request $request, bool $withYear = true): Builder
    {
        $query = $tenant->expenses()->getQuery();
        if ($withYear) {
            $query->where('year', $request->integer('year', (int) now()->format('Y')));
        }
        if ($search = $request->string('search')->trim()->toString()) {
            $query->where('title', 'like', '%'.$search.'%');
        }
        foreach (['vendor_id', 'contract_id', 'project_id'] as $field) {
            if ($request->filled($field)) {
                $request->input($field) === 'none'
                    ? $query->whereNull($field)
                    : $query->where($field, $request->integer($field));
            }
        }

        return $query;
    }

    /** @param Builder<Expense> $query
     * @return array<string, string|int>
     */
    public static function totals(Builder $query): array
    {
        // Sum integer cents so SQLite tests and MySQL DECIMAL queries share the same precision.
        $row = (clone $query)->reorder()->selectRaw('
            COUNT(*) as expense_count,
            COALESCE(SUM(CAST(ROUND(allocated_amount * 100, 0) AS SIGNED)), 0) as allocated_cents,
            COALESCE(SUM(CAST(ROUND(actual_amount * 100, 0) AS SIGNED)), 0) as actual_cents,
            COALESCE(SUM(CASE WHEN allocated_amount IS NOT NULL AND actual_amount IS NOT NULL
                THEN CAST(ROUND(actual_amount * 100, 0) AS SIGNED) - CAST(ROUND(allocated_amount * 100, 0) AS SIGNED) ELSE 0 END), 0) as variance_cents,
            COALESCE(SUM(CASE WHEN allocated_amount IS NULL OR actual_amount IS NULL THEN 1 ELSE 0 END), 0) as incomplete_count
        ')->first();

        return [
            'allocated' => Money::decimal((int) $row?->getAttribute('allocated_cents')),
            'actual' => Money::decimal((int) $row?->getAttribute('actual_cents')),
            'variance' => Money::decimal((int) $row?->getAttribute('variance_cents')),
            'count' => (int) $row?->getAttribute('expense_count'),
            'incomplete' => (int) $row?->getAttribute('incomplete_count'),
        ];
    }

    /** @param Builder<Expense> $query
     * @return array<int, array<string, mixed>>
     */
    public static function chart(Builder $query, Tenant $tenant, string $relation): array
    {
        $field = $relation.'_id';
        $groups = (clone $query)->reorder()->select($field)->selectRaw('
            SUM(allocated_amount) as allocated, SUM(actual_amount) as actual,
            COUNT(*) as expense_count,
            SUM(CASE WHEN allocated_amount IS NULL OR actual_amount IS NULL THEN 1 ELSE 0 END) as incomplete
        ')->groupBy($field)->orderByRaw('COALESCE(SUM(allocated_amount), 0) + COALESCE(SUM(actual_amount), 0) DESC')->limit(12)->get();
        $names = $tenant->{$relation.'s'}()->whereIn('id', $groups->pluck($field)->filter())->pluck('name', 'id');

        return $groups->map(fn (Expense $row) => [
            'id' => $row->getAttribute($field) ?? 'none',
            'name' => $names[$row->getAttribute($field)] ?? ($relation === 'vendor' ? 'Senza fornitore' : 'Senza progetto'),
            'allocated' => $row->getAttribute('allocated'),
            'actual' => $row->getAttribute('actual'),
            'count' => (int) $row->getAttribute('expense_count'),
            'incomplete' => (int) $row->getAttribute('incomplete'),
        ])->all();
    }

    /** @param array<string, string|int>|null $totals
     * @return array<string, mixed>
     */
    public static function page(Tenant $tenant, Request $request, ?array $totals = null): array
    {
        $query = self::query($tenant, $request);
        $sort = in_array($request->input('sort'), ['title', 'allocated_amount', 'actual_amount', 'updated_at'], true)
            ? $request->string('sort')->toString() : 'title';
        $direction = $request->input('direction') === 'desc' ? 'desc' : 'asc';

        return [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'expenses' => (clone $query)->with(['vendor:id,name', 'contract:id,name', 'project:id,name', 'lines'])->orderBy($sort, $direction)->orderBy('id')->paginate(50)->withQueryString(),
            'totals' => $totals ?? self::totals($query),
            'filters' => [...$request->only('search', 'vendor_id', 'contract_id', 'project_id'), 'year' => $request->integer('year', (int) now()->format('Y')), 'sort' => $sort, 'direction' => $direction],
            'years' => $tenant->expenses()->select('year')->distinct()->orderByDesc('year')->pluck('year')->push((int) now()->format('Y'), $request->integer('year', (int) now()->format('Y')))->unique()->values(),
            'options' => self::options($tenant),
        ];
    }

    /** @return array<string, mixed> */
    public static function options(Tenant $tenant): array
    {
        return [
            'vendors' => $tenant->vendors()->orderBy('name')->limit(100)->get(['id', 'name']),
            'contracts' => $tenant->contracts()->orderBy('name')->limit(100)->get(['id', 'name']),
            'projects' => $tenant->projects()->orderBy('name')->limit(100)->get(['id', 'name']),
        ];
    }
}

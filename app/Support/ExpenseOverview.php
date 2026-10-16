<?php

namespace App\Support;

use App\Models\Expense;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class ExpenseOverview
{
    /**
     * One economic row per expense and attribution year, retaining legacy expenses without dated lines.
     *
     * @return Builder<Expense>
     */
    public static function economicQuery(Tenant $tenant): Builder
    {
        $fields = array_diff(['id', 'tenant_id', ...(new Expense)->getFillable(), 'created_at', 'updated_at'], ['year', 'allocated_amount', 'actual_amount']);
        $columns = array_map(fn ($field) => 'expenses.'.$field, $fields);
        $legacy = DB::table('expenses')->where('tenant_id', $tenant->id)->select($columns)->addSelect('year', 'allocated_amount', 'actual_amount')
            ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('expense_lines')->whereColumn('expense_id', 'expenses.id')->whereNotNull('expense_lines.year'));
        $amounts = DB::table('expense_lines')->join('expenses', 'expenses.id', '=', 'expense_lines.expense_id')->where('expenses.tenant_id', $tenant->id)
            ->whereExists(fn ($query) => $query->selectRaw('1')->from('expense_lines as dated')->whereColumn('dated.expense_id', 'expenses.id')->whereNotNull('dated.year'))
            ->selectRaw("expense_id, COALESCE(expense_lines.year, expenses.year) as year,
                SUM(CASE WHEN type = 'allocated' THEN total END) as allocated_amount,
                SUM(CASE WHEN type = 'actual' THEN total END) as actual_amount")
            ->groupBy('expense_id')->groupByRaw('COALESCE(expense_lines.year, expenses.year)');
        $detailed = DB::table('expenses')->joinSub($amounts, 'amounts', 'amounts.expense_id', '=', 'expenses.id')->select($columns)->addSelect('amounts.year');
        foreach (['allocated', 'actual'] as $type) {
            $field = $type.'_amount';
            $detailed->selectRaw("CASE WHEN expenses.contract_id IS NULL AND expenses.$field IS NOT NULL THEN COALESCE(amounts.$field, 0) ELSE amounts.$field END as $field");
        }

        return Expense::query()->fromSub($legacy->unionAll($detailed), 'expenses');
    }

    /** @return Builder<Expense> */
    public static function query(Tenant $tenant, Request $request, bool $withYear = true): Builder
    {
        $query = self::economicQuery($tenant);
        if ($withYear) {
            $query->where('year', EconomicYearContext::year($tenant, $request));
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

    /**
     * Bounded breakdown of the same economic rows used by totals, independent of pagination.
     * Keep positive attributions separate from adjustments, including across project years.
     *
     * @param  Builder<Expense>  $query
     * @return array<string, array<string, mixed>>
     */
    public static function breakdown(Builder $query): array
    {
        $result = [];
        foreach (['allocated', 'actual'] as $metric) {
            $field = $metric.'_amount';
            $cents = "CAST(ROUND($field * 100, 0) AS SIGNED)";
            $positive = "CASE WHEN $field > 0 THEN $cents ELSE 0 END";
            $row = (clone $query)->reorder()->selectRaw("
                COALESCE(SUM($positive), 0) as positive_cents,
                COALESCE(SUM(CASE WHEN $field < 0 THEN $cents ELSE 0 END), 0) as negative_cents,
                COUNT($field) as present_count,
                COUNT(*) - COUNT($field) as missing_count,
                COALESCE(SUM(CASE WHEN $field = 0 THEN 1 ELSE 0 END), 0) as zero_count
            ")->first();
            $gross = (int) $row->getAttribute('positive_cents');
            $negative = (int) $row->getAttribute('negative_cents');
            $items = (clone $query)->reorder()->select(['id', 'title'])->selectRaw("SUM($positive) as positive_cents")
                ->groupBy('id', 'title')->havingRaw("SUM($positive) > 0")
                ->orderByDesc('positive_cents')->orderBy('id')->limit(7)->get()
                ->map(fn (Expense $expense) => [
                    'id' => (string) $expense->id,
                    'name' => $expense->title,
                    'amount' => Money::decimal((int) $expense->getAttribute('positive_cents')),
                ])->all();
            $remainder = $gross - array_sum(array_map(fn ($item) => Money::cents($item['amount']), $items));
            if ($remainder > 0) {
                $items[] = ['id' => 'other', 'name' => 'Altre voci', 'amount' => Money::decimal($remainder)];
            }
            $result[$metric] = [
                'items' => $items,
                'positive' => Money::decimal($gross),
                'negative' => Money::decimal($negative),
                'net' => (int) $row->getAttribute('present_count') > 0 ? Money::decimal($gross + $negative) : null,
                'missing' => (int) $row->getAttribute('missing_count'),
                'zero' => (int) $row->getAttribute('zero_count'),
            ];
        }

        return $result;
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
            'expenses' => (clone $query)->with(['vendor:id,name', 'contract:id,name', 'project:id,name', 'lines', 'costCenters.parent:id,name'])->orderBy($sort, $direction)->orderBy('id')->paginate(50)->withQueryString(),
            'totals' => $totals ?? self::totals($query),
            'filters' => [...$request->only('search', 'vendor_id', 'contract_id', 'project_id'), 'year' => EconomicYearContext::year($tenant, $request), 'sort' => $sort, 'direction' => $direction],
            'options' => self::options($tenant),
        ];
    }

    /** @return array<string, mixed> */
    public static function options(Tenant $tenant): array
    {
        return [
            'project_statuses' => $tenant->projectStatuses()->orderBy('id')->get(['id', 'key', 'name']),
            'vendors' => $tenant->vendors()->orderBy('name')->limit(100)->get(['id', 'name']),
            'cost_centers' => $tenant->costCenters()->with('parent:id,name')->orderBy('name')->get(['id', 'name', 'parent_id']),
            'contracts' => $tenant->contracts()->orderBy('name')->limit(100)->get(['id', 'name'])->map(fn ($contract) => ['id' => $contract->id, 'name' => $contract->display_name]),
            'projects' => $tenant->projects()->orderBy('name')->limit(100)->get(['id', 'name']),
        ];
    }
}

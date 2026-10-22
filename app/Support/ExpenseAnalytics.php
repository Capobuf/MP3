<?php

namespace App\Support;

use App\Models\Tenant;
use App\Services\ContractSchedule;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use stdClass;

final class ExpenseAnalytics
{
    /** @return literal-string */
    private static function columns(): string
    {
        $columns = ['COUNT(*) AS count', 'SUM(CASE WHEN allocated_amount IS NOT NULL AND actual_amount IS NULL THEN 1 ELSE 0 END) AS estimated_count'];
        foreach (['allocated', 'actual'] as $metric) {
            $amount = $metric.'_amount';
            $cents = "CAST(ROUND($amount * 100, 0) AS SIGNED)";
            $columns[] = "SUM($cents) AS {$metric}_cents";
            $columns[] = "SUM(CASE WHEN $amount > 0 THEN $cents ELSE 0 END) AS {$metric}_positive_cents";
            $columns[] = "SUM(CASE WHEN $amount < 0 THEN $cents ELSE 0 END) AS {$metric}_negative_cents";
        }
        foreach (['complete' => 'allocated_amount IS NOT NULL AND actual_amount IS NOT NULL', 'allocated_only' => 'allocated_amount IS NOT NULL AND actual_amount IS NULL', 'actual_only' => 'allocated_amount IS NULL AND actual_amount IS NOT NULL', 'missing' => 'allocated_amount IS NULL AND actual_amount IS NULL'] as $key => $condition) {
            $columns[] = "SUM(CASE WHEN $condition THEN 1 ELSE 0 END) AS $key";
        }

        return implode(', ', $columns);
    }

    /** @return array<string, mixed> */
    private static function economic(stdClass $row): array
    {
        $result = ['count' => (int) $row->count, 'estimated_count' => (int) $row->estimated_count];
        foreach (['allocated', 'actual'] as $metric) {
            $value = $row->{$metric.'_cents'};
            $result[$metric] = $value === null ? null : Money::decimal((int) $value);
        }
        $result['variance'] = Money::decimal((int) $row->actual_cents - (int) $row->allocated_cents);
        foreach (['allocated', 'actual'] as $metric) {
            foreach (['positive', 'negative'] as $sign) {
                $result[$metric.'_'.$sign] = Money::decimal((int) $row->{$metric.'_'.$sign.'_cents'});
            }
        }

        return $result;
    }

    /** @return array<string, mixed> */
    private static function summary(stdClass $row): array
    {
        $count = (int) $row->count;
        $completeness = [];
        foreach (['complete', 'allocated_only', 'actual_only', 'missing'] as $key) {
            $value = (int) $row->{$key};
            $completeness[] = ['id' => $key, 'count' => $value, 'percentage' => $count > 0 ? $value * 100 / $count : null];
        }

        return [...self::economic($row), 'completeness' => $completeness, 'estimated_percentage' => $count > 0 ? (int) $row->estimated_count * 100 / $count : null];
    }

    /** @return array<string, mixed> */
    public static function kpis(Tenant $tenant, Request $request): array
    {
        $year = EconomicYearContext::year($tenant, $request);
        $allYears = ExpenseOverview::query($tenant, $request, false)->toBase();
        $selected = (clone $allYears)->where('year', $year);
        $current = self::summary((clone $selected)->selectRaw(self::columns())->sole());
        $annual = (clone $allYears)->where('year', '<=', $year)->select('year')->selectRaw(self::columns())->groupBy('year')->orderByDesc('year')->limit(6)->get()
            ->map(fn (stdClass $row) => ['year' => (int) $row->year, ...self::summary($row)])->reverse()->values()->all();
        $previous = collect($annual)->firstWhere('year', $year - 1);
        $comparisons = [];
        foreach (['allocated', 'actual', 'variance'] as $metric) {
            $before = $previous[$metric] ?? null;
            $after = $current[$metric];
            $delta = $before !== null && $after !== null ? Money::cents($after) - Money::cents($before) : null;
            $comparisons[$metric] = ['difference' => $delta === null ? null : Money::decimal($delta), 'percentage' => $metric !== 'variance' && $delta !== null && Money::cents($before) > 0 ? $delta * 100 / Money::cents($before) : null];
        }
        $comparisons['estimates'] = ['points' => isset($previous['estimated_percentage'], $current['estimated_percentage']) ? $current['estimated_percentage'] - $previous['estimated_percentage'] : null];

        return ['current' => $current, 'previous' => $previous, 'comparisons' => $comparisons, 'annual' => $annual];
    }

    /** @return array<string, mixed> */
    public static function data(Tenant $tenant, Request $request): array
    {
        $kpis = self::kpis($tenant, $request);
        $selected = ExpenseOverview::query($tenant, $request)->toBase();

        $groups = [];
        foreach (['vendor' => 'Senza fornitore', 'project' => 'Senza progetto', 'contract' => 'Senza contratto'] as $relation => $missing) {
            $field = $relation.'_id';
            $rows = (clone $selected)->select($field)->selectRaw(self::columns())->groupBy($field)->orderBy($field)->get();
            $records = $tenant->{$relation.'s'}()->whereIn('id', $rows->pluck($field)->filter())->get($relation === 'project' ? ['id', 'name', 'status'] : ['id', 'name'])->keyBy('id');
            $groups[$relation.'s'] = $rows->map(fn (stdClass $row) => [
                'id' => $row->{$field} ?? 'none',
                'name' => $row->{$field} === null ? $missing : $records[$row->{$field}]->getAttribute($relation === 'contract' ? 'display_name' : 'name'),
                ...($relation === 'project' ? ['status' => $row->{$field} === null ? 'none' : $records[$row->{$field}]->getAttribute('status')] : []),
                ...self::economic($row),
            ])->all();
        }
        $statuses = [...$tenant->projectStatuses()->pluck('name', 'key')->all(), 'none' => 'Senza progetto', 'no-status' => 'Senza stato'];
        $projectStatuses = [];
        foreach ($groups['projects'] as $project) {
            $status = $project['status'] ?? 'no-status';
            if (! isset($projectStatuses[$status])) {
                $projectStatuses[$status] = ['id' => $status, 'name' => $statuses[$status] ?? 'Stato non disponibile', 'count' => 0, 'estimated_count' => 0, 'allocated' => null, 'actual' => null, 'variance' => null, 'allocated_positive' => '0.00', 'actual_positive' => '0.00', 'allocated_negative' => '0.00', 'actual_negative' => '0.00'];
            }
            foreach (['allocated', 'actual', 'allocated_positive', 'actual_positive', 'allocated_negative', 'actual_negative'] as $metric) {
                if ($project[$metric] !== null) {
                    $projectStatuses[$status][$metric] = Money::decimal(Money::cents($projectStatuses[$status][$metric] ?? '0.00') + Money::cents($project[$metric]));
                }
            }
            $projectStatuses[$status]['variance'] = Money::decimal(Money::cents($projectStatuses[$status]['actual'] ?? '0.00') - Money::cents($projectStatuses[$status]['allocated'] ?? '0.00'));
            $projectStatuses[$status]['count'] += $project['count'];
            $projectStatuses[$status]['estimated_count'] += $project['estimated_count'];
        }
        $projectStatuses = array_values($projectStatuses);

        $pairs = [];
        foreach (['project', 'contract'] as $destination) {
            $field = $destination.'_id';
            $pairs[$destination.'s'] = (clone $selected)->select('vendor_id', $field)->selectRaw(self::columns())->groupBy('vendor_id', $field)->orderBy('vendor_id')->orderBy($field)->get()
                ->map(fn (stdClass $row) => ['vendor_id' => $row->vendor_id ?? 'none', 'destination_id' => $row->{$field} ?? 'none', ...self::economic($row)])->all();
        }

        return [
            ...$kpis,
            ...$groups, 'projectStatuses' => $projectStatuses, 'pairs' => $pairs,
            'variances' => self::variances($selected, $tenant), 'expiry' => self::expiry($tenant, EconomicYearContext::year($tenant, $request)),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private static function variances(Builder $query, Tenant $tenant): array
    {
        $ranked = (clone $query)->select('expenses.*')->selectRaw('CAST(ROUND(allocated_amount * 100, 0) AS SIGNED) AS allocated_cents, CAST(ROUND(actual_amount * 100, 0) AS SIGNED) AS actual_cents');
        $expression = 'COALESCE(CAST(ROUND(actual_amount * 100, 0) AS SIGNED), 0) - COALESCE(CAST(ROUND(allocated_amount * 100, 0) AS SIGNED), 0)';
        $rows = (clone $ranked)->whereRaw("($expression) > 0")->orderByRaw("($expression) DESC")->orderBy('id')->limit(5)->get()
            ->concat((clone $ranked)->whereRaw("($expression) < 0")->orderByRaw("($expression) ASC")->orderBy('id')->limit(5)->get());
        $vendors = $tenant->vendors()->whereIn('id', $rows->pluck('vendor_id')->filter())->pluck('name', 'id');
        $projects = $tenant->projects()->whereIn('id', $rows->pluck('project_id')->filter())->pluck('name', 'id');

        return $rows->map(fn (stdClass $row) => [
            'id' => $row->id, 'title' => $row->title, 'vendor' => $vendors[$row->vendor_id] ?? 'Senza fornitore', 'project' => $projects[$row->project_id] ?? 'Senza progetto',
            'allocated' => $row->allocated_cents === null ? null : Money::decimal((int) $row->allocated_cents), 'actual' => $row->actual_cents === null ? null : Money::decimal((int) $row->actual_cents),
            'variance' => Money::decimal((int) $row->actual_cents - (int) $row->allocated_cents),
        ])->all();
    }

    /** @return array<string, mixed> */
    private static function expiry(Tenant $tenant, int $year): array
    {
        return [
            'asOf' => now(ContractSchedule::TIMEZONE)->toDateString(),
            'records' => $tenant->contracts()->forYear($year)
                ->orderByRaw('ends_on IS NULL')->orderBy('ends_on')->orderBy('id')
                ->get(['id', 'name', 'year', 'starts_on', 'ends_on'])->toArray(),
        ];
    }
}

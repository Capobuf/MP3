<?php

namespace App\Support;

use App\Models\Tenant;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use stdClass;

final class ExpenseAnalytics
{
    /** @return literal-string */
    private static function columns(): string
    {
        $columns = ['COUNT(*) AS count', 'SUM(CASE WHEN allocated_amount IS NULL OR actual_amount IS NULL THEN 1 ELSE 0 END) AS incomplete'];
        foreach (['allocated', 'actual'] as $metric) {
            $amount = $metric.'_amount';
            $cents = "CAST(ROUND($amount * 100, 0) AS SIGNED)";
            $columns[] = "SUM($cents) AS {$metric}_cents";
            $columns[] = "SUM(CASE WHEN $amount > 0 THEN $cents ELSE 0 END) AS {$metric}_positive_cents";
            $columns[] = "SUM(CASE WHEN $amount < 0 THEN $cents ELSE 0 END) AS {$metric}_negative_cents";
        }
        $columns[] = 'SUM(CASE WHEN allocated_amount IS NOT NULL AND actual_amount IS NOT NULL THEN CAST(ROUND(actual_amount * 100, 0) AS SIGNED) - CAST(ROUND(allocated_amount * 100, 0) AS SIGNED) END) AS variance_cents';
        foreach (['complete' => 'allocated_amount IS NOT NULL AND actual_amount IS NOT NULL', 'allocated_only' => 'allocated_amount IS NOT NULL AND actual_amount IS NULL', 'actual_only' => 'allocated_amount IS NULL AND actual_amount IS NOT NULL', 'missing' => 'allocated_amount IS NULL AND actual_amount IS NULL'] as $key => $condition) {
            $columns[] = "SUM(CASE WHEN $condition THEN 1 ELSE 0 END) AS $key";
        }

        return implode(', ', $columns);
    }

    /** @return array<string, mixed> */
    private static function economic(stdClass $row): array
    {
        $result = ['count' => (int) $row->count, 'incomplete' => (int) $row->incomplete];
        foreach (['allocated', 'actual', 'variance'] as $metric) {
            $value = $row->{$metric.'_cents'};
            $result[$metric] = $value === null ? null : Money::decimal((int) $value);
        }
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

        return [...self::economic($row), 'completeness' => $completeness, 'complete_percentage' => $count > 0 ? (int) $row->complete * 100 / $count : null];
    }

    /** @return array<string, mixed> */
    public static function data(Tenant $tenant, Request $request): array
    {
        $year = $request->integer('year', (int) now()->format('Y'));
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
        $comparisons['completeness'] = ['points' => isset($previous['complete_percentage'], $current['complete_percentage']) ? $current['complete_percentage'] - $previous['complete_percentage'] : null];

        $groups = [];
        foreach (['vendor' => 'Senza fornitore', 'project' => 'Senza progetto', 'contract' => 'Senza contratto'] as $relation => $missing) {
            $field = $relation.'_id';
            $rows = (clone $selected)->select($field)->selectRaw(self::columns())->groupBy($field)->orderBy($field)->get();
            $records = $tenant->{$relation.'s'}()->whereIn('id', $rows->pluck($field)->filter())->get($relation === 'project' ? ['id', 'name', 'status'] : ['id', 'name'])->keyBy('id');
            $groups[$relation.'s'] = $rows->map(fn (stdClass $row) => [
                'id' => $row->{$field} ?? 'none',
                'name' => $row->{$field} === null ? $missing : $records[$row->{$field}]->name,
                ...($relation === 'project' ? ['status' => $row->{$field} === null ? 'none' : $records[$row->{$field}]->getAttribute('status')] : []),
                ...self::economic($row),
            ])->all();
        }
        $statuses = ['pianificato' => 'Pianificato', 'attivo' => 'Attivo', 'completato' => 'Completato', 'none' => 'Senza progetto'];
        $projectStatuses = [];
        foreach ($groups['projects'] as $project) {
            $status = $project['status'];
            if (! isset($projectStatuses[$status])) {
                $projectStatuses[$status] = ['id' => $status, 'name' => $statuses[$status], 'count' => 0, 'incomplete' => 0, 'allocated' => null, 'actual' => null, 'variance' => null, 'allocated_positive' => '0.00', 'actual_positive' => '0.00', 'allocated_negative' => '0.00', 'actual_negative' => '0.00'];
            }
            foreach (['allocated', 'actual', 'variance', 'allocated_positive', 'actual_positive', 'allocated_negative', 'actual_negative'] as $metric) {
                if ($project[$metric] !== null) {
                    $projectStatuses[$status][$metric] = Money::decimal(Money::cents($projectStatuses[$status][$metric] ?? '0.00') + Money::cents($project[$metric]));
                }
            }
            $projectStatuses[$status]['count'] += $project['count'];
            $projectStatuses[$status]['incomplete'] += $project['incomplete'];
        }
        $projectStatuses = array_values($projectStatuses);

        $pairs = [];
        foreach (['project', 'contract'] as $destination) {
            $field = $destination.'_id';
            $pairs[$destination.'s'] = (clone $selected)->select('vendor_id', $field)->selectRaw(self::columns())->groupBy('vendor_id', $field)->orderBy('vendor_id')->orderBy($field)->get()
                ->map(fn (stdClass $row) => ['vendor_id' => $row->vendor_id ?? 'none', 'destination_id' => $row->{$field} ?? 'none', ...self::economic($row)])->all();
        }

        return [
            'current' => $current, 'previous' => $previous, 'comparisons' => $comparisons, 'annual' => $annual,
            ...$groups, 'projectStatuses' => $projectStatuses, 'pairs' => $pairs,
            'variances' => self::variances($selected, $tenant), 'expiry' => self::expiry($tenant),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private static function variances(Builder $query, Tenant $tenant): array
    {
        $comparable = (clone $query)->whereNotNull('allocated_amount')->whereNotNull('actual_amount')->select('expenses.*')->selectRaw('CAST(ROUND(allocated_amount * 100, 0) AS SIGNED) AS allocated_cents, CAST(ROUND(actual_amount * 100, 0) AS SIGNED) AS actual_cents');
        $expression = 'CAST(ROUND(actual_amount * 100, 0) AS SIGNED) - CAST(ROUND(allocated_amount * 100, 0) AS SIGNED)';
        $rows = (clone $comparable)->whereRaw("($expression) > 0")->orderByRaw("($expression) DESC")->orderBy('id')->limit(5)->get()
            ->concat((clone $comparable)->whereRaw("($expression) < 0")->orderByRaw("($expression) ASC")->orderBy('id')->limit(5)->get());
        $vendors = $tenant->vendors()->whereIn('id', $rows->pluck('vendor_id')->filter())->pluck('name', 'id');
        $projects = $tenant->projects()->whereIn('id', $rows->pluck('project_id')->filter())->pluck('name', 'id');

        return $rows->map(fn (stdClass $row) => [
            'id' => $row->id, 'title' => $row->title, 'vendor' => $vendors[$row->vendor_id] ?? 'Senza fornitore', 'project' => $projects[$row->project_id] ?? 'Senza progetto',
            'allocated' => Money::decimal((int) $row->allocated_cents), 'actual' => Money::decimal((int) $row->actual_cents),
            'variance' => Money::decimal((int) $row->actual_cents - (int) $row->allocated_cents),
        ])->all();
    }

    /** @return array<string, mixed> */
    private static function expiry(Tenant $tenant): array
    {
        $today = now()->startOfDay();
        $row = $tenant->contracts()->toBase()->selectRaw('COUNT(CASE WHEN ends_on < ? THEN 1 END) AS expired, COUNT(CASE WHEN ends_on BETWEEN ? AND ? THEN 1 END) AS within30, COUNT(CASE WHEN ends_on BETWEEN ? AND ? THEN 1 END) AS within60, COUNT(CASE WHEN ends_on BETWEEN ? AND ? THEN 1 END) AS within90, COUNT(CASE WHEN ends_on IS NULL THEN 1 END) AS undated', [
            $today->toDateString(), $today->toDateString(), $today->copy()->addDays(30)->toDateString(), $today->copy()->addDays(31)->toDateString(), $today->copy()->addDays(60)->toDateString(), $today->copy()->addDays(61)->toDateString(), $today->copy()->addDays(90)->toDateString(),
        ])->sole();

        return ['asOf' => $today->toDateString(), 'groups' => [
            ['id' => 'expired', 'name' => 'Scaduti', 'count' => (int) $row->expired],
            ['id' => 'within30', 'name' => 'Entro 30 giorni', 'count' => (int) $row->within30],
            ['id' => 'within60', 'name' => '31–60 giorni', 'count' => (int) $row->within60],
            ['id' => 'within90', 'name' => '61–90 giorni', 'count' => (int) $row->within90],
        ], 'undated' => (int) $row->undated, 'upcoming' => (int) $row->within30 + (int) $row->within60 + (int) $row->within90];
    }
}

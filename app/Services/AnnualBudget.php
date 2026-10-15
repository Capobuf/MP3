<?php

namespace App\Services;

use App\Models\BudgetYear;
use App\Models\Contract;
use App\Models\Expense;
use App\Models\Tenant;
use App\Support\ExpenseOverview;
use App\Support\Money;
use Illuminate\Support\Collection;

class AnnualBudget
{
    public const TYPES = ['contract', 'project', 'expense', 'manual'];

    /** @return Collection<int, Expense> */
    private function expenses(Tenant $tenant, int $year): Collection
    {
        return ExpenseOverview::economicQuery($tenant)->where('year', $year)
            ->with(['vendor:id,name', 'contract:id,name', 'project:id,name', 'costCenters.parent:id,name',
                'lines' => fn ($query) => $query->where(fn ($query) => $query->where('expense_lines.year', $year)
                    ->orWhere(fn ($query) => $query->whereNull('expense_lines.year')->whereIn('expense_id', $tenant->expenses()->where('year', $year)->select('id')))),
            ])
            ->orderBy('title')->orderBy('id')->get();
    }

    /** @return array<string, mixed> */
    public function snapshot(Tenant $tenant, BudgetYear $year): array
    {
        $entries = $tenant->budgetEntries()->where('budget_year_id', $year->id)
            ->with(['contract.vendor:id,name', 'project', 'expense.vendor:id,name', 'costCenter.parent:id,name'])
            ->orderBy('position')->orderBy('id')->get();
        $expenses = $this->expenses($tenant, $year->year);
        $owners = [];
        foreach (self::TYPES as $type) {
            foreach ($entries->where('type', $type)->where('included', true) as $entry) {
                foreach ($expenses as $expense) {
                    if ($type !== 'manual' && $this->matches($type, (int) $entry->getAttribute($type.'_id'), $expense)) {
                        $owners[$expense->id] ??= $entry->id;
                    }
                }
            }
        }
        $names = $entries->mapWithKeys(fn ($entry) => [$entry->id => $entry->type === 'manual' ? $entry->description : $entry->{$entry->type}?->getAttribute($entry->type === 'expense' ? 'title' : 'name')])->all();
        /** @var array<int, array<string, mixed>> $rows */
        $rows = [];
        foreach ($entries as $entry) {
            $source = $entry->type === 'manual' ? null : $entry->{$entry->type};
            $linked = $entry->type === 'manual' ? collect() : $expenses->filter(fn (Expense $expense) => $this->matches($entry->type, (int) $entry->getAttribute($entry->type.'_id'), $expense));
            $contributing = $linked->filter(fn (Expense $expense) => ($owners[$expense->id] ?? null) === $entry->id);
            $parts = $entry->type === 'manual'
                ? [['allocated' => $entry->manual_allocated, 'actual' => $entry->manual_actual]]
                : $contributing->map(fn (Expense $expense) => ['allocated' => $expense->allocated_amount, 'actual' => $expense->actual_amount])->values()->all();
            $values = $this->values($parts);
            // Covered expenses contribute a known zero; a source without annual data stays unknown.
            if ($parts === [] && $linked->isNotEmpty()) {
                $values = [...$values, 'allocated' => '0.00', 'actual' => '0.00', 'incomplete' => 0];
            }
            $rows[] = [
                'id' => $entry->id, 'type' => $entry->type, 'source_id' => $source?->id,
                'description' => $names[$entry->id], 'included' => $entry->included, 'position' => $entry->position,
                'cost_center_id' => $entry->cost_center_id, 'cost_center' => $entry->costCenter,
                'vendor' => $source instanceof Contract || $source instanceof Expense ? $source->vendor : null, 'manual_allocated' => $entry->manual_allocated, 'manual_actual' => $entry->manual_actual,
                'notes' => $source?->getAttribute('notes') ?? $source?->getAttribute('description'),
                'starts_on' => $source?->getAttribute('starts_on')?->toDateString(), 'ends_on' => $source?->getAttribute('ends_on')?->toDateString(),
                ...$values,
                'expenses' => $linked->map(function (Expense $expense) use ($owners, $names, $entry) {
                    $data = $expense->toArray();
                    $data['lines'] = $expense->lines->values()->toArray();
                    $data['contributes'] = ($owners[$expense->id] ?? null) === $entry->id;
                    $data['counted_in'] = $names[$owners[$expense->id] ?? 0] ?? null;

                    return $data;
                })->values()->all(),
            ];
        }
        $included = array_values(array_filter($rows, fn ($row) => $row['included']));
        $groups = [];
        foreach (self::TYPES as $type) {
            $groups[$type] = $this->totals(array_values(array_filter($included, fn ($row) => $row['type'] === $type)));
        }
        $centers = [];
        foreach ($included as $row) {
            $centers[(string) ($row['cost_center_id'] ?? 'none')][] = $row;
        }

        return [
            'entries' => $rows, 'totals' => $this->totals($included), 'groups' => $groups,
            'cost_center_groups' => array_map(fn ($group) => $this->totals($group), $centers),
            'coverage' => [
                'archive' => $this->coverage($expenses),
                'included' => $this->coverage($expenses->filter(fn (Expense $expense) => isset($owners[$expense->id]))),
                'uncovered' => $this->coverage($expenses->reject(fn (Expense $expense) => isset($owners[$expense->id]))),
            ],
            'owners' => $owners,
            'has_missing_entries' => $expenses->contains(fn (Expense $expense) => ! isset($owners[$expense->id])),
        ];
    }

    /**
     * Reconcile annual archive expenses using the same ownership as the budget.
     * Manual entries have no archive source and are deliberately not part of this comparison.
     *
     * @param  Collection<int, Expense>  $expenses
     * @return array<string, string|int|null>
     */
    private function coverage(Collection $expenses): array
    {
        $result = ['count' => $expenses->count()];
        foreach (['allocated', 'actual'] as $metric) {
            $amounts = $expenses->pluck($metric.'_amount')->filter(fn ($amount) => $amount !== null);
            $result[$metric] = $amounts->isEmpty() && $expenses->isNotEmpty()
                ? null
                : Money::decimal($amounts->sum(fn ($amount) => Money::cents($amount)));
            $result[$metric.'_missing'] = $expenses->count() - $amounts->count();
        }

        return $result;
    }

    private function matches(string $type, int $id, Expense $expense): bool
    {
        return (int) ($type === 'expense' ? $expense->id : $expense->getAttribute($type.'_id')) === $id;
    }

    /** @param array<int, array{allocated: string|null, actual: string|null}> $parts
     * @return array<string, string|int|null>
     */
    private function values(array $parts): array
    {
        $result = [];
        foreach (['allocated', 'actual'] as $metric) {
            $known = array_filter(array_column($parts, $metric), fn ($amount) => $amount !== null);
            $cents = array_map(fn ($amount) => Money::cents($amount), $known);
            $result[$metric] = $known === [] ? null : Money::decimal(array_sum($cents));
            $result[$metric.'_positive'] = Money::decimal(array_sum(array_filter($cents, fn ($value) => $value > 0)));
            $result[$metric.'_negative'] = Money::decimal(array_sum(array_filter($cents, fn ($value) => $value < 0)));
        }
        $comparable = array_filter($parts, fn ($part) => $part['allocated'] !== null && $part['actual'] !== null);
        $result['variance'] = $comparable === [] ? null : Money::decimal(array_sum(array_map(fn ($part) => Money::cents($part['actual']) - Money::cents($part['allocated']), $comparable)));
        $result['incomplete'] = $parts === [] || count($comparable) < count($parts) ? 1 : 0;
        $result['comparable_count'] = count($comparable);

        return $result;
    }

    /** @param array<int, array<string, mixed>> $rows
     * @return array<string, string|int>
     */
    public function totals(array $rows): array
    {
        $result = ['count' => count($rows), 'incomplete' => array_sum(array_column($rows, 'incomplete')), 'comparable_count' => array_sum(array_column($rows, 'comparable_count'))];
        foreach (['allocated', 'actual', 'variance', 'allocated_positive', 'allocated_negative', 'actual_positive', 'actual_negative'] as $field) {
            $result[$field] = Money::decimal(array_sum(array_map(fn ($row) => Money::cents($row[$field] ?? '0.00'), $rows)));
        }

        return $result;
    }

    /** @return array<int, array<string, mixed>> */
    public function missing(Tenant $tenant, BudgetYear $year): array
    {
        $snapshot = $this->snapshot($tenant, $year);
        /** @var array<int, array<string, mixed>> $rows */
        $rows = $snapshot['entries'];
        $entries = collect($rows);
        $suggestions = [];
        $expenses = $this->expenses($tenant, $year->year);
        $protectedContainers = [];
        foreach ($expenses as $expense) {
            $protected = $entries->contains(fn ($entry) => $entry['type'] === 'expense' && $entry['source_id'] === $expense->id && ! $entry['included'])
                || in_array('expense:'.$expense->id, $year->dismissed_sources ?? [], true);
            if ($protected) {
                foreach (['contract', 'project'] as $type) {
                    if ($expense->getAttribute($type.'_id') !== null) {
                        $protectedContainers[$type.':'.$expense->getAttribute($type.'_id')] = true;
                    }
                }
            }
        }
        foreach ($expenses as $expense) {
            if (isset($snapshot['owners'][$expense->id])) {
                continue;
            }
            $type = $expense->contract_id !== null ? 'contract' : ($expense->project_id !== null ? 'project' : 'expense');
            $id = $type === 'expense' ? $expense->id : $expense->getAttribute($type.'_id');
            $key = $type.':'.$id;
            if (isset($protectedContainers[$key])) {
                $type = 'expense';
                $id = $expense->id;
                $key = $type.':'.$id;
            }
            $existing = $entries->first(fn ($entry) => $entry['type'] === $type && $entry['source_id'] === $id);
            $state = $existing !== null ? 'excluded' : (in_array($key, $year->dismissed_sources ?? [], true) ? 'removed' : 'missing');
            // Individually excluded/removed expenses stay out of suggested containers too.
            $excludedExpense = $entries->first(fn ($entry) => $entry['type'] === 'expense' && $entry['source_id'] === $expense->id && ! $entry['included']);
            if ($excludedExpense !== null || in_array('expense:'.$expense->id, $year->dismissed_sources ?? [], true)) {
                $type = 'expense';
                $id = $expense->id;
                $key = $type.':'.$id;
                $existing = $excludedExpense;
                $state = $existing !== null ? 'excluded' : 'removed';
            }
            $suggestions[$key] ??= [
                'key' => $key, 'type' => $type, 'source_id' => $id, 'entry_id' => $existing['id'] ?? null,
                'description' => $type === 'expense' ? $expense->title : $expense->{$type}?->name,
                'state' => $state, 'parts' => [], 'expense_ids' => [],
            ];
            $suggestions[$key]['parts'][] = ['allocated' => $expense->allocated_amount, 'actual' => $expense->actual_amount];
            $suggestions[$key]['expense_ids'][] = $expense->id;
        }

        return array_values(array_map(function ($suggestion) {
            $values = $this->values($suggestion['parts']);
            unset($suggestion['parts']);

            return [...$suggestion, ...$values];
        }, $suggestions));
    }
}

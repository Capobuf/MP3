<?php

namespace App\Services;

use App\Http\Requests\ExpenseRequest;
use App\Models\BudgetYear;
use App\Models\Contract;
use App\Models\Expense;
use App\Models\ExpenseLine;
use App\Models\Project;
use App\Models\Tenant;
use App\Support\ExpenseOverview;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class AnnualContractImport
{
    /** @return array<string, mixed> */
    public function preview(Tenant $tenant, BudgetYear $target, string $type = 'contract'): array
    {
        $rows = $this->sources($tenant, $target, $type)->orderBy('id')->get()
            ->map(fn (Contract|Project|Expense $contract) => $this->row($tenant, $target, $contract, $type));

        return ['source_year' => $target->year - 1, 'target_year' => $target->year,
            $type.'s' => $rows->sortBy('group')->values()->all(),
            'project_statuses' => $type === 'project' ? $tenant->projectStatuses()->orderBy('id')->get(['key', 'name'])->toArray() : [],
            'legacy_count' => $type === 'expense' ? 0 : $tenant->{$type.'s'}()->whereNull('year')->count()];
    }

    /** @return Builder<Contract|Project|Expense> */
    private function sources(Tenant $tenant, BudgetYear $target, string $type): Builder
    {
        $query = $tenant->{$type.'s'}()->getQuery();

        return $type === 'expense'
            ? $query->whereNull('contract_id')->whereNull('project_id')->whereIn('id', ExpenseOverview::economicQuery($tenant)->where('year', $target->year - 1)->select('id'))
            : $query->where('year', $target->year - 1);
    }

    /** @return array<string, mixed>|null */
    private function expenseRow(Expense $expense, BudgetYear $target): ?array
    {
        $lines = $expense->lines->filter(fn ($line) => ($line->year ?? $expense->year) === $target->year - 1);
        if (($expense->lines->isEmpty() && $expense->year !== $target->year - 1) || ($expense->lines->isNotEmpty() && $lines->isEmpty())) {
            return null;
        }

        return [...$expense->toArray(),
            'allocated' => $expense->lines->isEmpty() ? $expense->allocated_amount : $this->total($lines->where('type', 'allocated')),
            'actual' => $expense->lines->isEmpty() ? $expense->actual_amount : $this->total($lines->where('type', 'actual')),
            'has_target_year' => $expense->lines->contains(fn ($line) => ($line->year ?? $expense->year) === $target->year),
        ];
    }

    /** @return array<string, mixed> */
    private function row(Tenant $tenant, BudgetYear $target, Contract|Project|Expense $contract, string $type): array
    {
        $contract->load($type === 'expense' ? ['vendor:id,name', 'costCenters.parent:id,name', 'lines'] : [...($type === 'contract' ? ['vendor:id,name'] : []), 'costCenters.parent:id,name', 'expenses.lines', 'expenses.costCenters.parent:id,name', 'expenses.vendor:id,name']);
        $sourceYear = $target->year - 1;
        $expenses = [];
        if (! $contract instanceof Expense) {
            foreach ($contract->expenses->sortBy('id') as $expense) {
                $expenseRow = $this->expenseRow($expense, $target);
                if ($expenseRow !== null) {
                    $expenses[] = $expenseRow;
                }
            }
        }
        $start = $contract->getRawOriginal('starts_on');
        $end = $contract->getRawOriginal('ends_on');
        $overlaps = ($start !== null || $end !== null) && ($start === null || $start <= $target->year.'-12-31') && ($end === null || $end >= $target->year.'-01-01');
        $entry = $tenant->budgetEntries()->where($type.'_id', $contract->id)
            ->whereHas('budgetYear', fn ($q) => $q->where('year', $sourceYear))->with('costCenter.parent:id,name')->first();
        $standalone = $contract instanceof Expense ? $this->expenseRow($contract, $target) : null;
        if ($contract instanceof Expense && $standalone === null) {
            throw ValidationException::withMessages(['expenses' => 'La spesa non è più disponibile nell’anno sorgente. Aggiorna l’anteprima.']);
        }
        $row = $standalone !== null ? [
            ...$standalone, 'display_name' => $contract->title, 'group' => 0, 'expenses' => [],
        ] : [...$contract->only($type === 'contract' ? ['id', 'name', 'display_name', 'year', 'vendor_id', 'reference_amount', 'starts_on', 'ends_on', 'notes'] : ['id', 'name', 'year', 'description', 'status', 'starts_on', 'ends_on']),
            'starts_on' => $start, 'ends_on' => $end,
            'display_name' => $contract instanceof Contract ? $contract->display_name : $contract->name,
            'vendor' => $contract instanceof Contract ? $contract->vendor : null, 'cost_centers' => $contract->costCenters->sortBy('id')->values()->toArray(),
            'expenses' => $expenses, 'group' => $type === 'project' || $overlaps ? 0 : ($end !== null && substr($end, 0, 4) === (string) $sourceYear ? 1 : 2)];
        $row['budget_cost_center'] = $entry?->costCenter;
        $row['already_imported'] = $tenant->{$type.'s'}()->where('year', $target->year)->where('source_'.$type.'_id', $contract->id)->exists();
        $row['token'] = hash_hmac('sha256', json_encode([$tenant->id, $target->id, $row], JSON_THROW_ON_ERROR), (string) config('app.key'));

        return $row;
    }

    /** @param Collection<int, ExpenseLine> $lines */
    private function total(Collection $lines): ?string
    {
        return $lines->isEmpty() ? null : Money::decimal($lines->sum(fn ($line) => Money::cents((string) $line->total)));
    }

    /** @param list<array<string, mixed>> $selections */
    public function commit(Tenant $tenant, BudgetYear $target, array $selections, string $type = 'contract'): void
    {
        DB::transaction(function () use ($tenant, $target, $selections, $type): void {
            Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            $target = $tenant->budgetYears()->whereKey($target->id)->lockForUpdate()->firstOrFail();
            $ids = array_column($selections, 'id');
            if ($type !== 'expense') {
                $tenant->expenses()->whereIn($type.'_id', $ids)->orderBy('id')->lockForUpdate()->get();
            }
            $contracts = $this->sources($tenant, $target, $type)->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            foreach ($selections as $selection) {
                $source = $contracts->get($selection['id']);
                if ($source === null) {
                    throw ValidationException::withMessages([$type.'s' => 'Elemento non disponibile nell’anno sorgente o in questo ambiente.']);
                }
                $row = $this->row($tenant, $target, $source, $type);
                if ($row['already_imported']) {
                    throw ValidationException::withMessages([$type.'s' => 'Elemento già importato. Aggiorna l’anteprima.']);
                }
                if (! hash_equals($row['token'], $selection['token'])) {
                    throw ValidationException::withMessages([$type.'s' => 'I dati sorgente sono cambiati. Aggiorna l’anteprima prima di confermare.']);
                }
                if ($source instanceof Expense) {
                    $copy = $this->copyExpense($tenant, $target, $row, $type);
                    $copy->update(['source_expense_id' => $source->id]);
                } else {
                    $copy = $tenant->{$type.'s'}()->create([
                        ...$source->only($type === 'contract' ? ['name', 'vendor_id', 'reference_amount', 'notes'] : ['name', 'description', 'status']),
                        'year' => $target->year, 'source_'.$type.'_id' => $source->id,
                        'starts_on' => $selection['starts_on'], 'ends_on' => $selection['ends_on'],
                    ]);
                    $copy->costCenters()->sync($source->costCenters->modelKeys());
                    foreach ($selection['expense_ids'] as $id) {
                        /** @var list<array<string, mixed>> $available */
                        $available = $row['expenses'];
                        $expense = collect($available)->firstWhere('id', $id);
                        if ($expense === null || $expense['allocated'] === null) {
                            throw ValidationException::withMessages([$type.'s' => 'La spesa selezionata non ha allocati nell’anno sorgente o non appartiene alla sorgente selezionata.']);
                        }
                        $this->copyExpense($tenant, $target, $expense, $type, $copy->id);
                    }
                }
                $target->entries()->create(['tenant_id' => $tenant->id, 'type' => $type, $type.'_id' => $copy->id,
                    'cost_center_id' => $row['budget_cost_center']?->id, 'position' => (int) $target->entries()->max('position') + 1]);
            }
        });
    }

    /** @param array<string, mixed> $expense */
    private function copyExpense(Tenant $tenant, BudgetYear $target, array $expense, string $type, ?int $parentId = null): Expense
    {
        if ($expense['allocated'] === null) {
            throw ValidationException::withMessages([$type.'s' => 'La spesa selezionata non ha allocati nell’anno sorgente.']);
        }
        $data = ['title' => $expense['title'], 'notes' => $expense['notes'], 'year' => $target->year,
            'vendor_id' => $expense['vendor_id'], 'contract_id' => $type === 'contract' ? $parentId : null, 'project_id' => $type === 'project' ? $parentId : null,
            'cost_center_ids' => array_column($expense['cost_centers'], 'id'),
            'allocated_amount' => $expense['allocated'], 'actual_amount' => null];
        if ($expense['lines'] !== []) {
            /** @var list<array<string, mixed>> $lines */
            $lines = $expense['lines'];
            $data['lines'] = collect($lines)->filter(fn ($line) => $line['type'] === 'allocated' && ($line['year'] ?? $expense['year']) === $target->year - 1)
                ->map(fn ($line) => ['description' => $line['description'], 'quantity' => $line['quantity'], 'unit_price' => $line['unit_price'], 'type' => 'allocated', 'year' => $target->year, 'period_starts_on' => null, 'period_ends_on' => null])->values()->all();
        }
        $validated = Validator::make($data, ExpenseRequest::forTenant($tenant), (new ExpenseRequest)->messages())->validate();
        $created = app(ExpenseWriter::class)->create($tenant, $validated, true);
        if ($created->allocated_amount !== $expense['allocated']) {
            throw ValidationException::withMessages([$type.'s' => 'Gli importi sorgente non corrispondono a prezzi e quantità. Correggi la spesa prima di importarla.']);
        }

        return $created;
    }
}

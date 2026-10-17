<?php

namespace App\Services;

use App\Http\Requests\ExpenseRequest;
use App\Models\BudgetYear;
use App\Models\Contract;
use App\Models\ExpenseLine;
use App\Models\Tenant;
use App\Support\Money;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class AnnualContractImport
{
    /** @return array<string, mixed> */
    public function preview(Tenant $tenant, BudgetYear $target): array
    {
        $rows = $tenant->contracts()->where('year', $target->year - 1)->orderBy('id')->get()
            ->map(fn (Contract $contract) => $this->row($tenant, $target, $contract));

        return ['source_year' => $target->year - 1, 'target_year' => $target->year,
            'contracts' => $rows->sortBy('group')->values()->all(),
            'legacy_count' => $tenant->contracts()->whereNull('year')->count()];
    }

    /** @return array<string, mixed> */
    private function row(Tenant $tenant, BudgetYear $target, Contract $contract): array
    {
        $contract->load(['vendor:id,name', 'costCenters.parent:id,name', 'expenses.lines', 'expenses.costCenters.parent:id,name', 'expenses.vendor:id,name']);
        $sourceYear = $target->year - 1;
        $expenses = [];
        foreach ($contract->expenses->sortBy('id') as $expense) {
            $lines = $expense->lines->filter(fn ($line) => ($line->year ?? $expense->year) === $sourceYear);
            if (($expense->lines->isEmpty() && $expense->year !== $sourceYear) || ($expense->lines->isNotEmpty() && $lines->isEmpty())) {
                continue;
            }
            $allocated = $expense->lines->isEmpty() ? $expense->allocated_amount : $this->total($lines->where('type', 'allocated'));
            $actual = $expense->lines->isEmpty() ? $expense->actual_amount : $this->total($lines->where('type', 'actual'));
            $expenses[] = [...$expense->toArray(), 'allocated' => $allocated, 'actual' => $actual,
                'has_target_year' => $expense->lines->isEmpty() ? $expense->year === $target->year : $expense->lines->contains(fn ($line) => ($line->year ?? $expense->year) === $target->year)];
        }
        $start = $contract->getRawOriginal('starts_on');
        $end = $contract->getRawOriginal('ends_on');
        $overlaps = ($start !== null || $end !== null) && ($start === null || $start <= $target->year.'-12-31') && ($end === null || $end >= $target->year.'-01-01');
        $entry = $tenant->budgetEntries()->where('contract_id', $contract->id)
            ->whereHas('budgetYear', fn ($q) => $q->where('year', $sourceYear))->with('costCenter.parent:id,name')->first();
        $row = [...$contract->only('id', 'name', 'display_name', 'year', 'vendor_id', 'reference_amount', 'starts_on', 'ends_on', 'notes'),
            'starts_on' => $start, 'ends_on' => $end,
            'vendor' => $contract->vendor, 'cost_centers' => $contract->costCenters->sortBy('id')->values()->toArray(),
            'budget_cost_center' => $entry?->costCenter,
            'expenses' => $expenses, 'group' => $overlaps ? 0 : ($end !== null && substr($end, 0, 4) === (string) $sourceYear ? 1 : 2),
            'already_imported' => $tenant->contracts()->where('year', $target->year)->where('source_contract_id', $contract->id)->exists()];
        $row['token'] = hash_hmac('sha256', json_encode([$tenant->id, $target->id, $row], JSON_THROW_ON_ERROR), (string) config('app.key'));

        return $row;
    }

    /** @param Collection<int, ExpenseLine> $lines */
    private function total(Collection $lines): ?string
    {
        return $lines->isEmpty() ? null : Money::decimal($lines->sum(fn ($line) => Money::cents((string) $line->total)));
    }

    /** @param list<array<string, mixed>> $selections */
    public function commit(Tenant $tenant, BudgetYear $target, array $selections): void
    {
        DB::transaction(function () use ($tenant, $target, $selections): void {
            Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            $target = $tenant->budgetYears()->whereKey($target->id)->lockForUpdate()->firstOrFail();
            $ids = array_column($selections, 'id');
            $tenant->expenses()->whereIn('contract_id', $ids)->orderBy('id')->lockForUpdate()->get();
            $contracts = $tenant->contracts()->whereIn('id', $ids)->where('year', $target->year - 1)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            foreach ($selections as $selection) {
                $source = $contracts->get($selection['id']);
                if ($source === null) {
                    throw ValidationException::withMessages(['contracts' => 'Contratto non disponibile nell’anno sorgente o in questo ambiente.']);
                }
                $row = $this->row($tenant, $target, $source);
                if ($row['already_imported']) {
                    throw ValidationException::withMessages(['contracts' => 'Contratto già importato. Aggiorna l’anteprima.']);
                }
                if (! hash_equals($row['token'], $selection['token'])) {
                    throw ValidationException::withMessages(['contracts' => 'I dati sorgente sono cambiati. Aggiorna l’anteprima prima di confermare.']);
                }
                $copy = $tenant->contracts()->create([
                    ...$source->only('name', 'vendor_id', 'reference_amount', 'notes'),
                    'year' => $target->year, 'source_contract_id' => $source->id,
                    'starts_on' => $selection['starts_on'], 'ends_on' => $selection['ends_on'],
                ]);
                $copy->costCenters()->sync($source->costCenters->modelKeys());
                foreach ($selection['expense_ids'] as $id) {
                    /** @var list<array<string, mixed>> $available */
                    $available = $row['expenses'];
                    $expense = collect($available)->firstWhere('id', $id);
                    if ($expense === null || $expense['allocated'] === null) {
                        throw ValidationException::withMessages(['contracts' => 'La spesa selezionata non ha allocati nell’anno sorgente o non appartiene al contratto.']);
                    }
                    $data = ['title' => $expense['title'], 'notes' => $expense['notes'], 'year' => $target->year,
                        'vendor_id' => $expense['vendor_id'], 'contract_id' => $copy->id, 'project_id' => null,
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
                        throw ValidationException::withMessages(['contracts' => 'Gli importi sorgente non corrispondono a prezzi e quantità. Correggi la spesa prima di importarla.']);
                    }
                }
                $target->entries()->create(['tenant_id' => $tenant->id, 'type' => 'contract', 'contract_id' => $copy->id,
                    'cost_center_id' => $row['budget_cost_center']?->id, 'position' => (int) $target->entries()->max('position') + 1]);
            }
        });
    }
}

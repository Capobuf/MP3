<?php

namespace App\Services;

use App\Models\Expense;
use App\Models\Tenant;
use App\Support\ExpenseOverview;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExpenseAllocation
{
    /** @return array<string, mixed> */
    public function preview(Tenant $tenant, Expense $expense): array
    {
        $expense->load(['lines', 'contract', 'project']);
        $type = $expense->contract_id !== null ? 'contract' : ($expense->project_id !== null ? 'project' : null);
        $container = $type === null ? null : $expense->{$type};
        $years = ExpenseOverview::economicQuery($tenant)->where('id', $expense->id)->orderBy('year')->get();
        $budgets = $tenant->budgetEntries()->where('expense_id', $expense->id)->with('budgetYear')->get();

        return [
            'ambiguous' => $expense->contract_id !== null && $expense->project_id !== null,
            'type' => $type, 'container' => $container?->only(['id', 'name', 'year']),
            'conflicts' => $type === null || ($expense->contract_id !== null && $expense->project_id !== null) ? [] : $years->where('year', '!==', $container?->year)->map(fn ($row) => [
                'year' => $row->year, 'allocated' => $row->allocated_amount, 'actual' => $row->actual_amount,
                'split' => $years->count() > 1,
            ])->values()->all(),
            'budgets' => $budgets->map(fn ($entry) => ['year' => $entry->budgetYear->year, 'url' => '/t/'.$tenant->slug.'/budget?year='.$entry->budgetYear->year])->all(),
            'token' => hash_hmac('sha256', json_encode([$expense->getAttributes(), $expense->lines->toArray(), $container?->getAttributes(), $budgets->toArray()], JSON_THROW_ON_ERROR), (string) config('app.key')),
        ];
    }

    /** @param array<string, mixed> $data */
    public function resolve(Tenant $tenant, Expense $expense, array $data): Expense
    {
        return DB::transaction(function () use ($tenant, $expense, $data): Expense {
            $data['year'] = (int) $data['year'];
            Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            $expense = $tenant->expenses()->whereKey($expense->id)->lockForUpdate()->firstOrFail();
            $preview = $this->preview($tenant, $expense);
            if (! hash_equals($preview['token'], $data['token'])) {
                throw ValidationException::withMessages(['allocation' => 'La spesa è cambiata. Ricarica la pagina e verifica gli importi prima di confermare.']);
            }
            /** @var list<array{year: int, split: bool}> $conflicts */
            $conflicts = $preview['conflicts'];
            $conflict = collect($conflicts)->firstWhere('year', $data['year']);
            if ($conflict === null || $preview['budgets'] !== []) {
                throw ValidationException::withMessages(['allocation' => 'Risolvi prima i collegamenti incompatibili e rimuovi le eventuali voci Budget dirette della spesa.']);
            }
            $type = $preview['type'];
            $lines = $expense->lines;
            $selected = $lines->filter(fn ($line) => ($line->year ?? $expense->year) === $data['year']);
            if ($data['action'] === 'year') {
                $year = $preview['container']['year'];
                if ($year === null || $expense->source_expense_id !== null) {
                    throw ValidationException::withMessages(['allocation' => 'Classifica prima il contenitore senza anno. Per una spesa importata conserva l’anno e scegli il contenitore corretto.']);
                }
                $expense->lines()->whereIn('id', $selected->modelKeys())->update(['year' => $year]);
                if ($expense->lines()->get()->every(fn ($line) => ($line->year ?? $expense->year) === $year)) {
                    app(ExpenseWriter::class)->persist($expense, ['year' => $year]);
                }

                return $expense->refresh();
            }
            $target = $tenant->{$type.'s'}()->whereKey($data['target_id'] ?? 0)->where('year', $data['year'])->lockForUpdate()->first();
            if ($target === null) {
                throw ValidationException::withMessages(['target_id' => 'Seleziona un contenitore dell’anno della spesa, appartenente a questa azienda.']);
            }
            if (! $conflict['split']) {
                app(ExpenseWriter::class)->persist($expense, ['contract_id' => null, 'project_id' => null, $type.'_id' => $target->id]);

                return $expense->refresh();
            }
            // A split must account for every recorded cent before moving any line.
            foreach (['allocated', 'actual'] as $metric) {
                $parts = $lines->where('type', $metric);
                $total = $parts->isEmpty() ? null : Money::decimal($parts->sum(fn ($line) => Money::cents((string) $line->total)));
                if ($expense->{$metric.'_amount'} !== $total) {
                    throw ValidationException::withMessages(['allocation' => 'Gli importi storici non corrispondono alle righe. Verifica la spesa prima di separare gli anni.']);
                }
            }
            $copy = app(ExpenseWriter::class)->create($tenant, [
                ...$expense->only(['title', 'notes', 'vendor_id', 'period_starts_on', 'period_ends_on']),
                'year' => $data['year'], $type.'_id' => $target->id,
                'cost_center_ids' => $expense->costCenters()->allRelatedIds()->all(),
            ]);
            $expense->lines()->whereIn('id', $selected->modelKeys())->update(['expense_id' => $copy->id, 'year' => $data['year']]);
            foreach ([$expense, $copy] as $record) {
                $remaining = $record->lines()->get();
                foreach (['allocated', 'actual'] as $metric) {
                    $parts = $remaining->where('type', $metric);
                    $record->{$metric.'_amount'} = $parts->isEmpty() ? null : Money::decimal($parts->sum(fn ($line) => Money::cents((string) $line->total)));
                }
                $record->save();
            }

            return $copy;
        });
    }
}

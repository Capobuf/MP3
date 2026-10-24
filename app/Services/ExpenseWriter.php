<?php

namespace App\Services;

use App\Models\Expense;
use App\Models\ExpenseLine;
use App\Models\Tenant;
use App\Support\ExpensePeriods;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExpenseWriter
{
    /** @param array<string, mixed> $data Validated expense fields. */
    public function create(Tenant $tenant, array $data): Expense
    {
        return DB::transaction(function () use ($data, $tenant): Expense {
            $expense = $tenant->expenses()->make();
            ExpensePeriods::lockContracts($tenant, [$data['contract_id'] ?? null]);
            $this->persist($expense, $data);

            return $expense;
        });
    }

    /** @param array<string, mixed> $data */
    public function persist(Expense $expense, array $data, bool $write = true): void
    {
        if ($expense->exists && $expense->source_expense_id !== null && isset($data['year']) && (int) $data['year'] !== $expense->getOriginal('year')) {
            throw ValidationException::withMessages(['year' => 'L’anno di una spesa importata non può essere cambiato. Importala nel Budget dell’anno successivo.']);
        }
        $hasLines = $expense->exists && $expense->lines()->exists();
        $contractEntry = $data['contract_entry'] ?? false;
        unset($data['contract_entry']);
        if ($expense->exists) {
            foreach (['year', 'period_starts_on', 'period_ends_on'] as $field) {
                if (array_key_exists($field, $data) && (string) $data[$field] === (string) $expense->getRawOriginal($field)) {
                    unset($data[$field]);
                }
            }
        }
        $expense->fill(array_diff_key($data, array_flip(['lines', 'cost_center_ids'])));
        if ($expense->contract_id !== null && $expense->project_id !== null) {
            throw ValidationException::withMessages(['contract_id' => 'Una spesa può appartenere a un solo contratto o progetto. Rimuovi esplicitamente il collegamento precedente prima di scegliere quello nuovo.', 'project_id' => 'Scegli un solo contenitore economico.']);
        }
        if ($expense->exists && ($expense->contract_id !== null || $expense->project_id !== null) &&
            DB::table('budget_entries')->where('expense_id', $expense->id)->exists()) {
            throw ValidationException::withMessages(['budget' => 'La spesa è presente come voce singola in uno o più Budget. Usa «Rimuovi solo dal Budget» in ciascuna annualità prima di collegarla a un contratto o progetto.']);
        }
        $individualPeriods = isset($data['lines']) && array_filter($data['lines'], fn ($line) => array_key_exists('year', $line) || array_key_exists('period_starts_on', $line) || array_key_exists('period_ends_on', $line)) !== [];
        if ($individualPeriods && ! $expense->exists) {
            $starts = array_filter(array_column($data['lines'], 'period_starts_on'));
            $ends = array_filter(array_column($data['lines'], 'period_ends_on'));
            $data['period_starts_on'] = $starts === [] ? null : min($starts);
            $data['period_ends_on'] = $ends === [] ? null : max($ends);
            $data['year'] = $data['lines'][0]['year'] ?? $expense->year;
            $expense->fill(array_diff_key($data, array_flip(['lines', 'cost_center_ids'])));
        }
        ExpensePeriods::validate($expense);
        if ($contractEntry && $expense->contract_id === null) {
            throw ValidationException::withMessages(['contract_id' => 'Seleziona il contratto della spesa.']);
        }
        $costCenterIds = $data['cost_center_ids'] ?? null;
        unset($data['cost_center_ids']);
        // Saving an already empty line list must not erase directly recorded amounts.
        if ($expense->exists && ! $hasLines && ! $contractEntry && ($data['lines'] ?? null) === []) {
            unset($data['lines']);
        }
        if (! array_key_exists('lines', $data)) {
            if ($contractEntry && $expense->allocated_amount === null && $expense->actual_amount === null) {
                throw ValidationException::withMessages(['allocated_amount' => 'Nel contratto indica almeno un importo allocato o effettivo, anche zero.']);
            }
            if ($hasLines &&
                (array_key_exists('allocated_amount', $data) || array_key_exists('actual_amount', $data))) {
                throw ValidationException::withMessages(['lines' => 'Modifica le righe della spesa: gli importi complessivi sono calcolati automaticamente.']);
            }
            // Keep the former shared-period API compatible without changing independent conditions.
            $periodUpdate = array_intersect_key($data, array_flip(['period_starts_on', 'period_ends_on', 'year']));
            if ($hasLines && $periodUpdate !== [] && $write) {
                $sharedLines = $expense->lines()->where('period_starts_on', $expense->getRawOriginal('period_starts_on'))
                    ->where('period_ends_on', $expense->getRawOriginal('period_ends_on'))
                    ->where(fn ($query) => $query->where('year', $expense->getRawOriginal('year'))->orWhereNull('year'));
                (clone $sharedLines)->whereNotNull('year')->update($periodUpdate);
                unset($periodUpdate['year']);
                if ($periodUpdate !== []) {
                    $sharedLines->whereNull('year')->update($periodUpdate);
                }
            }
            $expense->fill($data);
            if (! $write) {
                $expense->load('lines');
                foreach ($expense->lines as $line) {
                    if ($line->getRawOriginal('period_starts_on') === $expense->getRawOriginal('period_starts_on')
                        && $line->getRawOriginal('period_ends_on') === $expense->getRawOriginal('period_ends_on')
                        && ($line->year === null || $line->year === $expense->getOriginal('year'))) {
                        $line->fill($line->year === null ? array_diff_key($periodUpdate, ['year' => true]) : $periodUpdate);
                    }
                }

                return;
            }
            $expense->save();
            if ($costCenterIds !== null) {
                $expense->costCenters()->sync($costCenterIds);
            }

            return;
        }

        if ($contractEntry && $data['lines'] === []) {
            throw ValidationException::withMessages(['lines' => 'Inserisci almeno una riga economica completa, anche di valore zero.']);
        }

        $lines = [];
        $totals = ['allocated' => 0, 'actual' => 0];
        $limit = 99999999999999;
        foreach ($data['lines'] as $position => $line) {
            $start = array_key_exists('period_starts_on', $line) ? $line['period_starts_on'] : $expense->period_starts_on?->toDateString();
            $end = array_key_exists('period_ends_on', $line) ? $line['period_ends_on'] : $expense->period_ends_on?->toDateString();
            $year = $line['year'] ?? $expense->year;
            $quantity = (string) ($line['quantity'] ?? '1');
            $parts = explode('.', $quantity);
            $scaledQuantity = (int) $parts[0] * 10000 + (int) str_pad($parts[1] ?? '', 4, '0');
            $price = Money::cents((string) $line['unit_price']);
            if (abs($price) > intdiv($limit * 10000, $scaledQuantity)) {
                throw ValidationException::withMessages(["lines.{$position}.unit_price" => 'Il totale della riga supera l’importo massimo consentito.']);
            }
            $product = $price * $scaledQuantity;
            $cents = intdiv(abs($product) + 5000, 10000) * ($product < 0 ? -1 : 1);
            $totals[$line['type']] += $cents;
            $lines[] = [
                'description' => $line['description'],
                'type' => $line['type'],
                'unit_price' => Money::decimal($price),
                'quantity' => $quantity,
                'total' => Money::decimal($cents),
                'position' => $position,
                'period_starts_on' => $start,
                'period_ends_on' => $end,
                'year' => array_key_exists('year', $line) ? $line['year'] : ($expense->contract_id !== null ? $year : null),
            ];
        }
        foreach ($totals as $total) {
            if (abs($total) > $limit) {
                throw ValidationException::withMessages(['lines' => 'La somma delle righe supera l’importo massimo consentito.']);
            }
        }
        unset($data['lines']);
        $existingLines = $hasLines ? $expense->lines()->get() : collect();
        $unchangedLines = $hasLines && $existingLines->count() === count($lines)
            && $existingLines->every(fn ($line, $index) => ! $line->fill($lines[$index])->isDirty());
        foreach (['allocated' => 'allocated_amount', 'actual' => 'actual_amount'] as $type => $field) {
            $hasType = in_array($type, array_column($lines, 'type'), true);
            // An identical save must not reclassify historical amounts of unknown provenance.
            $data[$field] = $unchangedLines ? $expense->getRawOriginal($field)
                : ($hasType ? Money::decimal($totals[$type]) : null);
        }
        $expense->fill($data);
        if (! $write) {
            $expense->setRelation('lines', $unchangedLines ? $existingLines : (new ExpenseLine)->newCollection(array_map(fn ($line) => new ExpenseLine($line), $lines)));

            return;
        }
        $expense->save();
        if (! $unchangedLines) {
            $expense->lines()->delete();
            $expense->lines()->createMany($lines);
        }
        if ($costCenterIds !== null) {
            $expense->costCenters()->sync($costCenterIds);
        }
    }
}

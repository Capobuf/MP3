<?php

namespace App\Support;

use App\Models\Expense;
use App\Models\Tenant;
use Illuminate\Validation\ValidationException;

class ExpensePeriods
{
    /** @param array<int, int|null> $ids */
    public static function lockContracts(Tenant $tenant, array $ids): void
    {
        // Writers lock expenses by ID first, then all old/new contracts by ID.
        $tenant->contracts()->whereIn('id', array_filter($ids))->orderBy('id')->lockForUpdate()->get();
    }

    /** @param array<int, Expense> $pending Final states of all expenses in a batch. */
    public static function validate(Expense $expense, array $pending = [], bool $validateYear = true): void
    {
        $start = $expense->period_starts_on;
        $end = $expense->period_ends_on;
        if (($start === null) !== ($end === null)) {
            throw ValidationException::withMessages(['period_starts_on' => 'Indica entrambe le date del periodo oppure lasciale entrambe vuote.', 'period_ends_on' => 'Indica entrambe le date del periodo oppure lasciale entrambe vuote.']);
        }
        if ($start === null || $end === null) {
            return;
        }
        if ($end->lt($start)) {
            throw ValidationException::withMessages(['period_ends_on' => 'La data finale deve essere uguale o successiva alla data iniziale.']);
        }
        if ($validateYear && ! in_array($expense->year, [$start->year, $end->year], true)) {
            throw ValidationException::withMessages(['year' => $start->year === $end->year
                ? "Il periodo deve essere imputato all’anno {$start->year}."
                : "Scegli l’anno iniziale ({$start->year}) o finale ({$end->year}) del periodo."]);
        }
        if ($expense->contract_id === null) {
            return;
        }

        // A consistent read after the contract lock avoids locking unrelated expenses.
        $conflict = Expense::query()->where('tenant_id', $expense->tenant_id)
            ->where('contract_id', $expense->contract_id)
            ->whereNotIn('id', array_filter([$expense->id, ...array_keys($pending)]))
            ->where('period_starts_on', '<=', $end->toDateString())
            ->where('period_ends_on', '>=', $start->toDateString())
            ->orderBy('period_starts_on')->first();
        foreach ($pending as $other) {
            if ($other->id !== $expense->id && $other->tenant_id === $expense->tenant_id &&
                $other->contract_id === $expense->contract_id && $other->period_starts_on !== null && $other->period_ends_on !== null &&
                $other->period_starts_on->lte($end) && $other->period_ends_on->gte($start)) {
                $conflict = $other;
                break;
            }
        }
        if ($conflict !== null) {
            $period = $conflict->period_starts_on->format('d/m/Y').' – '.$conflict->period_ends_on->format('d/m/Y');
            throw ValidationException::withMessages(['period_starts_on' => "Il periodo si sovrappone alla spesa «{$conflict->title}» ({$period})."]);
        }
    }
}

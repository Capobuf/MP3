<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property 'contract'|'project'|'expense' $type
 * @property int|null $expense_id
 */
#[Fillable(['tenant_id', 'type', 'contract_id', 'project_id', 'expense_id', 'cost_center_id', 'included', 'position'])]
class BudgetEntry extends Model
{
    /** @return BelongsTo<BudgetYear, $this> */
    public function budgetYear(): BelongsTo
    {
        return $this->belongsTo(BudgetYear::class);
    }

    /** @return BelongsTo<Contract, $this> */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<Expense, $this> */
    public function expense(): BelongsTo
    {
        return $this->belongsTo(Expense::class);
    }

    /** @return BelongsTo<CostCenter, $this> */
    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['included' => 'boolean', 'position' => 'integer'];
    }
}

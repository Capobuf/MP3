<?php

namespace App\Models\Concerns;

use App\Models\CostCenter;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

trait HasCostCenters
{
    /** @return BelongsToMany<CostCenter, $this> */
    public function costCenters(): BelongsToMany
    {
        return $this->belongsToMany(CostCenter::class)->orderBy('name');
    }
}

<?php

namespace App\Support;

use App\Models\CostCenter;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

final class CostCenterQuery
{
    /** @return Builder<CostCenter> */
    public static function filtered(Tenant $tenant, Request $request): Builder
    {
        $query = $tenant->costCenters()->whereNull('parent_id')
            ->withCount(['expenses', 'projects', 'contracts'])
            ->with(['children' => fn ($query) => $query->withCount(['expenses', 'projects', 'contracts'])]);
        if ($search = $request->string('search')->trim()->toString()) {
            $query->where(fn ($query) => $query->where('name', 'like', '%'.$search.'%')
                ->orWhereHas('children', fn ($children) => $children->where('name', 'like', '%'.$search.'%')));
        }

        return $query->getQuery();
    }
}

<?php

namespace App\Support;

use App\Models\Contract;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\Vendor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

final class CatalogQuery
{
    /** @return Builder<Vendor|Contract|Project> */
    public static function filtered(Tenant $tenant, string $catalog, Request $request): Builder
    {
        $query = (match ($catalog) {
            'vendors' => $tenant->vendors(),
            'contracts' => $tenant->contracts(),
            'projects' => $tenant->projects(),
            default => abort(404),
        })->withCount('expenses');
        if ($catalog !== 'vendors') {
            $query->with('costCenters.parent:id,name');
        }
        if ($catalog === 'contracts') {
            $query->with('vendor:id,name');
            if ($request->filled('vendor_id')) {
                $query->where('vendor_id', $request->integer('vendor_id'));
            }
            if ($request->input('expiring') === '1') {
                $query->whereBetween('ends_on', [now()->toDateString(), now()->addDays(90)->toDateString()]);
            }
        }
        if ($catalog === 'projects' && $request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($catalog === 'vendors' && $request->input('linked') === '1') {
            $query->whereHas('expenses');
        }
        if ($search = $request->string('search')->trim()->toString()) {
            $query->where('name', 'like', '%'.$search.'%');
        }

        /** @var Builder<Vendor|Contract|Project> $builder */
        $builder = $query->getQuery();

        return $builder;
    }
}

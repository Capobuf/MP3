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
            $today = now()->startOfDay();
            $window = match ($request->input('expiring')) {
                '1' => [0, 90],
                'within30' => [0, 30],
                'within60' => [31, 60],
                'within90' => [61, 90],
                default => null,
            };
            if ($window !== null) {
                $query->whereBetween('ends_on', [$today->copy()->addDays($window[0])->toDateString(), $today->copy()->addDays($window[1])->toDateString()]);
            } elseif ($request->input('expiring') === 'expired') {
                $query->where('ends_on', '<', $today->toDateString());
            } elseif ($request->input('expiring') === 'undated') {
                $query->whereNull('ends_on');
            }
        }
        if ($catalog === 'projects' && $request->filled('status')) {
            $request->input('status') === 'none'
                ? $query->whereNull('status')
                : $query->where('status', $request->input('status'));
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

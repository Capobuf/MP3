<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Support\ExpenseOverview;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class TenantDashboardController extends Controller
{
    public function __invoke(Request $request, Tenant $tenant): Response
    {
        Gate::authorize('view', $tenant);
        $query = ExpenseOverview::query($tenant, $request);

        return Inertia::render('tenants/dashboard', [
            ...ExpenseOverview::page($tenant, $request),
            'vendorChart' => ExpenseOverview::chart($query, $tenant, 'vendor'),
            'projectChart' => ExpenseOverview::chart($query, $tenant, 'project'),
            'expiringContracts' => $tenant->contracts()->whereBetween('ends_on', [now()->toDateString(), now()->addDays(90)->toDateString()])->count(),
        ]);
    }
}

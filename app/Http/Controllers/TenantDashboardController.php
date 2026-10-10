<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Support\ExpenseAnalytics;
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
        $analytics = ExpenseAnalytics::data($tenant, $request);
        $current = $analytics['current'];
        $totals = [
            'allocated' => $current['allocated'] ?? '0.00', 'actual' => $current['actual'] ?? '0.00',
            'variance' => $current['variance'] ?? '0.00', 'count' => $current['count'], 'incomplete' => $current['incomplete'],
        ];

        return Inertia::render('tenants/dashboard', [
            ...ExpenseOverview::page($tenant, $request, $totals),
            'vendorChart' => $analytics['vendors'],
            'projectChart' => $analytics['projects'],
            'expiringContracts' => $analytics['expiry']['upcoming'],
            'analytics' => $analytics,
        ]);
    }
}

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
            'allocated' => $current['allocated'], 'actual' => $current['actual'],
            'variance' => $current['variance'], 'count' => $current['count'], 'estimated_count' => $current['estimated_count'],
        ];

        return Inertia::render('tenants/dashboard', [
            ...ExpenseOverview::page($tenant, $request, $totals),
            'analytics' => $analytics,
        ]);
    }
}

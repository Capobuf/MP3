import { usePageRefresh } from '@/hooks/use-page-refresh';
import { AnalyticsLoadingContext } from '@/components/management/analytics-ui';
import { Head } from '@inertiajs/react';
import { useState } from 'react';
import type {
    EntityFilter,
    ExpenseAnalytics,
    GroupId,
} from '@/components/management/analytics-types';
import { AnnualComparisonChart } from '@/components/management/annual-comparison-chart';
import { CompletenessChart } from '@/components/management/completeness-chart';
import { ContractExpiryChart } from '@/components/management/contract-expiry-chart';
import { DashboardFilters } from '@/components/management/dashboard-filters';
import { DashboardSummary } from '@/components/management/dashboard-summary';
import { DistributionChart } from '@/components/management/distribution-chart';
import { EconomicChart } from '@/components/management/economic-chart';
import { ExpenseSankey } from '@/components/management/expense-sankey';
import { ExpenseWorkspace } from '@/components/management/expense-workspace';
import type { ExpensePageProps } from '@/components/management/types';
import { VarianceChart } from '@/components/management/variance-chart';

export default function TenantDashboard(
    props: ExpensePageProps & { analytics: ExpenseAnalytics },
) {
    const { tenant, filters, analytics } = props;
    const [tableBusy, setTableBusy] = useState(false);
    const path = `/t/${tenant.slug}/dashboard`;
    const year = filters.year!;
    const refresh = usePageRefresh(path);
    const chartKey = JSON.stringify([tenant.id, filters]);
    const recordHref = (field: EntityFilter, id: GroupId) => {
        if (typeof id !== 'number') return undefined;
        const catalog = {
            vendor_id: 'vendors',
            project_id: 'projects',
            contract_id: 'contracts',
        }[field];
        return `/t/${tenant.slug}/${catalog}/${id}?year=${year}`;
    };
    return (
        <>
            <Head title={`Panoramica economica · ${tenant.name}`} />
            <div
                className="page-shell dashboard-enter"
                aria-busy={refresh.pending || tableBusy}
                onClickCapture={(event) => {
                    if (
                        tableBusy &&
                        event.target instanceof Element &&
                        event.target.closest('a')
                    ) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
            >
                <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">
                            {tenant.name} · {year}
                        </p>
                        <h1 className="mt-1 page-title">
                            Panoramica economica
                        </h1>
                        {refresh.visible && (
                            <p
                                className="mt-2 text-sm text-muted-foreground"
                                role="status"
                            >
                                Aggiornamento…
                            </p>
                        )}
                    </div>
                </header>
                <div className="flex flex-wrap items-center gap-2">
                    <DashboardFilters
                        key={JSON.stringify([tenant.slug, filters])}
                        {...props}
                        path={path}
                        busy={tableBusy}
                    />
                </div>
                <AnalyticsLoadingContext value={refresh.visible}>
                    <DashboardSummary
                        analytics={analytics}
                        year={year}
                        loading={
                            refresh.visible && analytics.current.count === 0
                        }
                    />
                    <section
                        className="flex min-w-0 flex-col gap-4"
                        aria-labelledby="economic-trend"
                    >
                        <h2
                            id="economic-trend"
                            className="text-lg font-semibold"
                        >
                            Andamento economico
                        </h2>
                        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
                            <div className="min-w-0 xl:col-span-2">
                                <AnnualComparisonChart
                                    key={`${chartKey}:annual`}
                                    rows={analytics.annual}
                                    year={year}
                                />
                            </div>
                            <CompletenessChart
                                key={`${chartKey}:completeness`}
                                rows={analytics.current.completeness}
                            />
                        </div>
                    </section>
                    <section
                        className="flex min-w-0 flex-col gap-4"
                        aria-labelledby="vendors"
                    >
                        <h2 id="vendors" className="text-lg font-semibold">
                            Fornitori e distribuzione
                        </h2>
                        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                            <DistributionChart
                                key={`${chartKey}:vendors-distribution`}
                                title="Distribuzione percentuale per fornitore"
                                rows={analytics.vendors}
                                values={analytics.current}
                                vendorConcentration
                                getHref={(id) => recordHref('vendor_id', id)}
                            />
                            <EconomicChart
                                key={`${chartKey}:vendors-ranking`}
                                title="Classifica fornitori"
                                rows={analytics.vendors}
                                getHref={(id) => recordHref('vendor_id', id)}
                            />
                        </div>
                    </section>
                    <section
                        className="flex min-w-0 flex-col gap-4"
                        aria-label="Flussi economici"
                    >
                        <ExpenseSankey
                            key={`${chartKey}:flows`}
                            analytics={analytics}
                            getHref={recordHref}
                        />
                    </section>
                    <section
                        className="flex min-w-0 flex-col gap-4"
                        aria-labelledby="projects-contracts"
                    >
                        <h2
                            id="projects-contracts"
                            className="text-lg font-semibold"
                        >
                            Progetti e contratti
                        </h2>
                        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                            <EconomicChart
                                key={`${chartKey}:projects`}
                                title="Allocato ed effettivo per progetto"
                                rows={analytics.projects}
                                getHref={(id) => recordHref('project_id', id)}
                            />
                            <DistributionChart
                                key={`${chartKey}:project-statuses`}
                                title="Distribuzione per stato del progetto"
                                rows={analytics.projectStatuses}
                                values={analytics.current}
                            />
                        </div>
                        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                            <EconomicChart
                                key={`${chartKey}:contracts`}
                                title="Spese per contratto"
                                rows={analytics.contracts}
                                getHref={(id) => recordHref('contract_id', id)}
                            />
                            <ContractExpiryChart
                                key={`${chartKey}:expiry`}
                                expiry={analytics.expiry}
                                slug={tenant.slug}
                            />
                        </div>
                    </section>
                    <section
                        className="flex min-w-0 flex-col gap-4"
                        aria-labelledby="critical"
                    >
                        <h2 id="critical" className="text-lg font-semibold">
                            Scostamenti e criticità
                        </h2>
                        <VarianceChart
                            key={`${chartKey}:variances`}
                            rows={analytics.variances}
                            slug={tenant.slug}
                            disabled={tableBusy}
                        />
                    </section>
                    <ExpenseWorkspace
                        key={JSON.stringify([tenant.slug, filters])}
                        {...props}
                        dashboard
                        showFilters={false}
                        onBusyChange={setTableBusy}
                    />
                </AnalyticsLoadingContext>
            </div>
        </>
    );
}
TenantDashboard.layout = {
    breadcrumbs: [{ title: 'Panoramica economica', href: '/dashboard' }],
};

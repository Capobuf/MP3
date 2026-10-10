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
import {
    DashboardFilters,
    applyFilters,
} from '@/components/management/dashboard-filters';
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
    const select = (field: EntityFilter, id: GroupId) => {
        if (!tableBusy && id !== 'others')
            applyFilters(path, { ...filters, [field]: String(id) });
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
                        <p className="mt-2 text-sm text-muted-foreground">
                            Allocazioni, costi registrati e qualità dei dati nel
                            perimetro selezionato.
                            <span role="status">
                                {refresh.visible ? ' Aggiornamento…' : ''}
                            </span>
                        </p>
                    </div>
                </header>
                <DashboardFilters
                    key={JSON.stringify([tenant.slug, filters])}
                    {...props}
                    path={path}
                    busy={tableBusy}
                />
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
                                    rows={analytics.annual}
                                    year={year}
                                    onSelect={(year) => {
                                        if (!tableBusy)
                                            applyFilters(path, {
                                                ...filters,
                                                year,
                                            });
                                    }}
                                />
                            </div>
                            <CompletenessChart
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
                                title="Distribuzione percentuale per fornitore"
                                rows={analytics.vendors}
                                values={analytics.current}
                                vendorConcentration
                                onSelect={(id) => select('vendor_id', id)}
                            />
                            <EconomicChart
                                title="Classifica fornitori"
                                rows={analytics.vendors}
                                onSelect={(id) => select('vendor_id', id)}
                            />
                        </div>
                    </section>
                    <section
                        className="flex min-w-0 flex-col gap-4"
                        aria-label="Flussi economici"
                    >
                        <ExpenseSankey
                            analytics={analytics}
                            onSelect={select}
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
                                title="Allocato ed effettivo per progetto"
                                rows={analytics.projects}
                                onSelect={(id) => select('project_id', id)}
                            />
                            <DistributionChart
                                title="Distribuzione per stato del progetto"
                                rows={analytics.projectStatuses}
                                values={analytics.current}
                            />
                        </div>
                        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                            <EconomicChart
                                title="Spese per contratto"
                                rows={analytics.contracts}
                                onSelect={(id) => select('contract_id', id)}
                            />
                            <ContractExpiryChart
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

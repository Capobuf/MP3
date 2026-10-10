import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { EntitySheet } from '@/components/management/entity-sheet';
import { ExpenseSankey } from '@/components/management/expense-sankey';
import { ExpenseWorkspace } from '@/components/management/expense-workspace';
import { matchesExpenseFilters } from '@/components/management/helpers';
import type { ExpensePageProps } from '@/components/management/types';
import { VarianceChart } from '@/components/management/variance-chart';

export default function TenantDashboard(
    props: ExpensePageProps & { analytics: ExpenseAnalytics },
) {
    const { tenant, filters, analytics } = props;
    const [creating, setCreating] = useState(false);
    const [tableBusy, setTableBusy] = useState(false);
    const path = `/t/${tenant.slug}/dashboard`;
    const year = filters.year!;
    const select = (field: EntityFilter, id: GroupId) => {
        if (!tableBusy && id !== 'others')
            applyFilters(path, { ...filters, [field]: String(id) });
    };
    return (
        <>
            <Head title={`Panoramica economica · ${tenant.name}`} />
            <div
                className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6"
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
                <header className="space-y-4">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">
                            {tenant.name} · {year}
                        </p>
                        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                            Panoramica economica
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Allocazioni, costi registrati e qualità dei dati nel
                            perimetro selezionato.
                        </p>
                    </div>
                    <DashboardFilters
                        key={JSON.stringify([tenant.slug, filters])}
                        {...props}
                        path={path}
                        busy={tableBusy}
                        onCreate={() => setCreating(true)}
                    />
                </header>
                <DashboardSummary analytics={analytics} year={year} />
                <div className="grid min-w-0 gap-4 xl:grid-cols-3">
                    <div className="min-w-0 xl:col-span-2">
                        <AnnualComparisonChart
                            rows={analytics.annual}
                            year={year}
                            onSelect={(year) => {
                                if (!tableBusy)
                                    applyFilters(path, { ...filters, year });
                            }}
                        />
                    </div>
                    <CompletenessChart rows={analytics.current.completeness} />
                </div>
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
                <ExpenseSankey analytics={analytics} onSelect={select} />
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
                <VarianceChart
                    rows={analytics.variances}
                    slug={tenant.slug}
                    disabled={tableBusy}
                />
                <ExpenseWorkspace
                    key={JSON.stringify([tenant.slug, filters])}
                    {...props}
                    dashboard
                    showFilters={false}
                    onBusyChange={setTableBusy}
                />
            </div>
            {creating && (
                <EntitySheet
                    tenant={tenant}
                    kind="expenses"
                    year={year}
                    options={props.options}
                    onClose={() => setCreating(false)}
                    onSaved={(record) => {
                        setCreating(false);
                        if (!matchesExpenseFilters(record, filters))
                            toast.info(
                                'Spesa salvata. Non compare perché non corrisponde ai filtri correnti.',
                            );
                        router.reload();
                    }}
                />
            )}
        </>
    );
}
TenantDashboard.layout = {
    breadcrumbs: [{ title: 'Panoramica economica', href: '/dashboard' }],
};

import { Head } from '@inertiajs/react';
import { useState } from 'react';
import { SpreadsheetActions } from '@/components/management/spreadsheet-actions';
import { ExpenseWorkspace } from '@/components/management/expense-workspace';
import { DashboardSummary } from '@/components/management/dashboard-summary';
import type { SummaryAnalytics } from '@/components/management/dashboard-summary';
import type { ExpensePageProps } from '@/components/management/types';

export default function Expenses(
    props: ExpensePageProps & { analytics: SummaryAnalytics },
) {
    const [busy, setBusy] = useState(false);
    return (
        <>
            <Head title={`Spese · ${props.tenant.name}`} />
            <div className="page-shell">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">
                            {props.tenant.name} · {props.filters.year}
                        </p>
                        <h1 className="page-title">Spese</h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <SpreadsheetActions
                            slug={props.tenant.slug}
                            resource="expenses"
                            label="Spese"
                            filters={props.filters}
                            disabled={busy}
                        />
                    </div>
                </header>
                <DashboardSummary
                    analytics={props.analytics}
                    year={props.filters.year!}
                />
                <ExpenseWorkspace
                    key={JSON.stringify([props.tenant.slug, props.filters])}
                    {...props}
                    onBusyChange={setBusy}
                />
            </div>
        </>
    );
}
Expenses.layout = { breadcrumbs: [{ title: 'Spese', href: '/dashboard' }] };

import { Head } from '@inertiajs/react';
import { ExpenseWorkspace } from '@/components/management/expense-workspace';
import { DashboardSummary } from '@/components/management/dashboard-summary';
import type { SummaryAnalytics } from '@/components/management/dashboard-summary';
import type { ExpensePageProps } from '@/components/management/types';

export default function Expenses(
    props: ExpensePageProps & { analytics: SummaryAnalytics },
) {
    return (
        <>
            <Head title={`Spese · ${props.tenant.name}`} />
            <div className="page-shell">
                <div>
                    <p className="text-sm text-muted-foreground">
                        {props.tenant.name} · {props.filters.year}
                    </p>
                    <h1 className="page-title">Spese</h1>
                </div>
                <DashboardSummary
                    analytics={props.analytics}
                    year={props.filters.year!}
                />
                <ExpenseWorkspace
                    key={JSON.stringify([props.tenant.slug, props.filters])}
                    {...props}
                />
            </div>
        </>
    );
}
Expenses.layout = { breadcrumbs: [{ title: 'Spese', href: '/dashboard' }] };

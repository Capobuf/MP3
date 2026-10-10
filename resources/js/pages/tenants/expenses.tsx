import { Head } from '@inertiajs/react';
import { ExpenseWorkspace } from '@/components/management/expense-workspace';
import { Summary } from '@/components/management/summary';
import type { ExpensePageProps } from '@/components/management/types';

export default function Expenses(props: ExpensePageProps) {
    return (
        <>
            <Head title={`Spese · ${props.tenant.name}`} />
            <div className="page-shell">
                <div>
                    <p className="text-sm text-muted-foreground">
                        {props.tenant.name}
                    </p>
                    <h1 className="page-title">Spese</h1>
                </div>
                <Summary totals={props.totals} />
                <ExpenseWorkspace
                    key={JSON.stringify([props.tenant.slug, props.filters])}
                    {...props}
                />
            </div>
        </>
    );
}
Expenses.layout = { breadcrumbs: [{ title: 'Spese', href: '/dashboard' }] };

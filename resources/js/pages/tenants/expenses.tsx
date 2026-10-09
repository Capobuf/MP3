import { Head } from '@inertiajs/react';
import { ExpenseWorkspace } from '@/components/management/expense-workspace';
import { Summary } from '@/components/management/summary';
import type { ExpensePageProps } from '@/components/management/types';

export default function Expenses(props: ExpensePageProps) {
    return (
        <>
            <Head title={`Spese · ${props.tenant.name}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
                <div>
                    <p className="text-sm text-muted-foreground">
                        {props.tenant.name}
                    </p>
                    <h1 className="text-3xl font-semibold">Spese</h1>
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

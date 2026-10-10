import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { DeleteRecord } from '@/components/management/delete-record';
import { EntitySheet } from '@/components/management/entity-sheet';
import { ExpenseLines } from '@/components/management/expense-lines';
import { money } from '@/components/management/helpers';
import type { Expense, Options } from '@/components/management/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Tenant } from '@/types';

export default function ExpenseDetail({
    tenant,
    expense,
    options,
}: {
    tenant: Tenant;
    expense: Expense;
    options: Options;
}) {
    const [edit, setEdit] = useState(false);
    const path = `/t/${tenant.slug}/expenses`;
    return (
        <>
            <Head title={`${expense.title} · ${tenant.name}`} />
            <div className="page-shell">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <Link
                            href={`${path}?year=${expense.year}`}
                            className="text-sm text-muted-foreground"
                        >
                            {tenant.name} / Spese / {expense.year}
                        </Link>
                        <h1 className="mt-2 page-title break-words">
                            {expense.title}
                        </h1>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <Button onClick={() => setEdit(true)}>
                            Modifica spesa
                        </Button>
                        <DeleteRecord
                            url={`${path}/${expense.id}`}
                            redirect={`${path}?year=${expense.year}`}
                            label={expense.title}
                        />
                    </div>
                </header>
                <Card>
                    <CardContent className="min-w-0">
                        <dl className="grid gap-6 sm:grid-cols-3">
                            {[
                                ['Anno di imputazione', expense.year],
                                ['Allocato', money(expense.allocated_amount)],
                                ['Effettivo', money(expense.actual_amount)],
                                [
                                    'Scostamento (effettivo − allocato)',
                                    expense.variance == null
                                        ? 'Non determinabile'
                                        : money(expense.variance),
                                ],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-sm text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd
                                        className={`mt-2 text-base font-medium tabular-nums ${['Allocato', 'Effettivo', 'Scostamento (effettivo − allocato)'].includes(String(label)) ? 'tracking-normal' : ''} ${String(label).startsWith('Scostamento') && Number(expense.variance) > 0 ? 'text-finance-overrun' : ''}`}
                                    >
                                        {value}
                                    </dd>
                                </div>
                            ))}
                            {(['vendor', 'contract', 'project'] as const).map(
                                (relation) => (
                                    <div key={relation}>
                                        <dt className="text-sm text-muted-foreground">
                                            {relation === 'vendor'
                                                ? 'Fornitore'
                                                : relation === 'contract'
                                                  ? 'Contratto'
                                                  : 'Progetto'}
                                        </dt>
                                        <dd className="mt-2">
                                            {expense[relation] ? (
                                                <Link
                                                    className="text-primary underline-offset-4 hover:underline"
                                                    href={`/t/${tenant.slug}/${relation}s/${expense[relation]!.id}`}
                                                >
                                                    {expense[relation]!.name}
                                                </Link>
                                            ) : (
                                                'Nessuno'
                                            )}
                                        </dd>
                                    </div>
                                ),
                            )}
                        </dl>
                        {expense.notes && (
                            <p className="mt-6 text-sm whitespace-pre-wrap text-muted-foreground">
                                {expense.notes}
                            </p>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="min-w-0">
                        <ExpenseLines
                            readOnly
                            lines={(expense.lines ?? []).map((line, index) => ({
                                ...line,
                                key: String(line.id ?? index),
                            }))}
                        />
                    </CardContent>
                </Card>
            </div>
            {edit && (
                <EntitySheet
                    tenant={tenant}
                    kind="expenses"
                    record={expense}
                    options={options}
                    onClose={() => setEdit(false)}
                    onSaved={() => {
                        setEdit(false);
                        router.reload();
                    }}
                />
            )}
        </>
    );
}
ExpenseDetail.layout = {
    breadcrumbs: [{ title: 'Spesa', href: '/dashboard' }],
};

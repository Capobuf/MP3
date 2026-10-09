import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { DeleteRecord } from '@/components/management/delete-record';
import { EntitySheet } from '@/components/management/entity-sheet';
import { dateLabel, money } from '@/components/management/helpers';
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
            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <Link
                            href={`${path}?year=${expense.year}`}
                            className="text-sm text-muted-foreground"
                        >
                            {tenant.name} / Spese / {expense.year}
                        </Link>
                        <h1 className="mt-2 text-3xl font-semibold">
                            {expense.title}
                        </h1>
                    </div>
                    <div className="flex gap-2">
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
                    <CardContent className="pt-6">
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
                                ['Scadenza', dateLabel(expense.due_on)],
                                [
                                    'Rilevazione effettivo',
                                    dateLabel(expense.actual_on),
                                ],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-xs text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd className="mt-2 font-medium tabular-nums">
                                        {value}
                                    </dd>
                                </div>
                            ))}
                            {(['vendor', 'contract', 'project'] as const).map(
                                (relation) => (
                                    <div key={relation}>
                                        <dt className="text-xs text-muted-foreground">
                                            {relation === 'vendor'
                                                ? 'Fornitore'
                                                : relation === 'contract'
                                                  ? 'Contratto'
                                                  : 'Progetto'}
                                        </dt>
                                        <dd className="mt-2">
                                            {expense[relation] ? (
                                                <Link
                                                    className="underline"
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

import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { AttachmentsSection } from '@/components/management/attachments-section';
import { DeleteRecord } from '@/components/management/delete-record';
import { CostCenterTags } from '@/components/management/cost-center-tags';
import { EntitySheet } from '@/components/management/entity-sheet';
import { ExpenseLines } from '@/components/management/expense-lines';
import {
    dateLabel,
    money,
    varianceTextClass,
} from '@/components/management/helpers';
import type { Expense, Options } from '@/components/management/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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
                                ...(expense.contract_id ||
                                expense.period_starts_on
                                    ? [
                                          [
                                              'Periodo coperto',
                                              expense.period_starts_on &&
                                              expense.period_ends_on
                                                  ? `${dateLabel(expense.period_starts_on)} – ${dateLabel(expense.period_ends_on)}`
                                                  : 'Periodo non indicato',
                                          ],
                                      ]
                                    : []),
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
                                        className={cn(
                                            'mt-2 text-base font-medium text-foreground tabular-nums',
                                            [
                                                'Allocato',
                                                'Effettivo',
                                                'Scostamento (effettivo − allocato)',
                                            ].includes(String(label)) &&
                                                'tracking-normal',
                                            String(label).startsWith(
                                                'Scostamento',
                                            ) &&
                                                varianceTextClass(
                                                    expense.variance,
                                                ),
                                        )}
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
                                                    className="text-primary"
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
                        <div className="mt-6 flex flex-col gap-2">
                            <p className="text-sm text-muted-foreground">
                                Centri di Costo
                            </p>
                            {expense.cost_centers?.length ? (
                                <CostCenterTags
                                    centers={expense.cost_centers}
                                />
                            ) : (
                                <p className="text-sm">Nessuno</p>
                            )}
                        </div>
                        {expense.notes && (
                            <p className="mt-6 text-sm whitespace-pre-wrap text-muted-foreground">
                                {expense.notes}
                            </p>
                        )}
                    </CardContent>
                </Card>
                <AttachmentsSection
                    key={`${tenant.id}:${expense.id}`}
                    tenant={tenant}
                    resource="expenses"
                    recordId={expense.id}
                />
                <Card>
                    <CardContent className="min-w-0">
                        <ExpenseLines
                            readOnly
                            contractMode={!!expense.contract_id}
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

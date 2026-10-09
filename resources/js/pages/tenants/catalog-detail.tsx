import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { DeleteRecord } from '@/components/management/delete-record';
import { EntitySheet } from '@/components/management/entity-sheet';
import { ExpenseTable } from '@/components/management/expense-table';
import { dateLabel, money } from '@/components/management/helpers';
import { Pagination } from '@/components/management/pagination';
import { Summary } from '@/components/management/summary';
import { labels } from '@/components/management/types';
import type {
    Catalog,
    Expense,
    Options,
    Pagination as Page,
    RecordData,
    Totals,
} from '@/components/management/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Tenant } from '@/types';

export default function CatalogDetail({
    tenant,
    catalog,
    record,
    options,
    expenses,
    totals,
    contracts,
}: {
    tenant: Tenant;
    catalog: Catalog;
    record: RecordData;
    options: Options;
    expenses: Page<Expense>;
    totals: Totals;
    contracts: Page<RecordData> | null;
}) {
    const [edit, setEdit] = useState(false);
    const [expense, setExpense] = useState<Expense | null>(null);
    const path = `/t/${tenant.slug}/${catalog}`;
    const info =
        catalog === 'vendors'
            ? [
                  ['Partita IVA', record.vat_number],
                  ['Email', record.email],
                  ['Telefono', record.phone],
              ]
            : [
                  ['Data iniziale', dateLabel(record.starts_on)],
                  ['Data finale', dateLabel(record.ends_on)],
                  ...(catalog === 'contracts'
                      ? [
                            [
                                'Importo contrattuale informativo',
                                money(record.reference_amount),
                            ],
                        ]
                      : [['Stato', record.status]]),
              ];
    return (
        <>
            <Head title={`${record.name} · ${tenant.name}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <Link
                            href={path}
                            className="text-sm text-muted-foreground hover:underline"
                        >
                            {tenant.name} / {labels[catalog]}
                        </Link>
                        <h1 className="mt-2 text-3xl font-semibold">
                            {record.name}
                        </h1>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => setEdit(true)}>Modifica</Button>
                        <DeleteRecord
                            url={`${path}/${record.id}`}
                            redirect={path}
                            label={record.name ?? ''}
                        />
                    </div>
                </header>
                <Card>
                    <CardContent className="pt-6">
                        <dl className="grid gap-5 sm:grid-cols-3">
                            {info.map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-xs text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd className="mt-1 text-sm font-medium">
                                        {value ?? '—'}
                                    </dd>
                                </div>
                            ))}
                            {catalog === 'contracts' && (
                                <div>
                                    <dt className="text-xs text-muted-foreground">
                                        Fornitore
                                    </dt>
                                    <dd className="mt-1">
                                        {record.vendor ? (
                                            <Link
                                                className="text-sm underline"
                                                href={`/t/${tenant.slug}/vendors/${record.vendor.id}`}
                                            >
                                                {record.vendor.name}
                                            </Link>
                                        ) : (
                                            '—'
                                        )}
                                    </dd>
                                </div>
                            )}
                        </dl>
                        {(record.notes || record.description) && (
                            <p className="mt-6 text-sm whitespace-pre-wrap text-muted-foreground">
                                {record.notes ?? record.description}
                            </p>
                        )}
                        {catalog === 'contracts' && (
                            <p className="mt-4 text-sm text-muted-foreground">
                                L’importo del contratto è informativo e distinto
                                dai totali delle spese qui sotto.
                            </p>
                        )}
                    </CardContent>
                </Card>
                <div>
                    <h2 className="mb-3 font-semibold">
                        Totali delle spese collegate · tutti gli anni
                    </h2>
                    <Summary totals={totals} />
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Spese collegate</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ExpenseTable
                            rows={expenses.data}
                            slug={tenant.slug}
                            showYear
                            onEdit={setExpense}
                        />
                        <Pagination page={expenses} />
                    </CardContent>
                </Card>
                {contracts && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Contratti collegati</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {contracts.data.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nessun contratto collegato a questo
                                    fornitore.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {contracts.data.map((contract) => (
                                        <Link
                                            key={contract.id}
                                            className="flex justify-between rounded-lg border p-3 text-sm hover:bg-accent"
                                            href={`/t/${tenant.slug}/contracts/${contract.id}`}
                                        >
                                            <span>{contract.name}</span>
                                            <Badge variant="secondary">
                                                {dateLabel(contract.ends_on)}
                                            </Badge>
                                        </Link>
                                    ))}
                                </div>
                            )}
                            <Pagination page={contracts} />
                        </CardContent>
                    </Card>
                )}
            </div>
            {edit && (
                <EntitySheet
                    tenant={tenant}
                    kind={catalog}
                    record={record}
                    options={options}
                    onClose={() => setEdit(false)}
                    onSaved={() => {
                        setEdit(false);
                        router.reload();
                    }}
                />
            )}
            {expense && (
                <EntitySheet
                    tenant={tenant}
                    kind="expenses"
                    record={expense}
                    options={options}
                    onClose={() => setExpense(null)}
                    onSaved={() => {
                        setExpense(null);
                        router.reload();
                    }}
                />
            )}
        </>
    );
}
CatalogDetail.layout = {
    breadcrumbs: [{ title: 'Dettaglio', href: '/dashboard' }],
};

import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { AttachmentsSection } from '@/components/management/attachments-section';
import { DeleteRecord } from '@/components/management/delete-record';
import { CostCenterTags } from '@/components/management/cost-center-tags';
import { ExpenseTable } from '@/components/management/expense-table';
import { dateLabel } from '@/components/management/helpers';
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
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { Tenant } from '@/types';

export default function CatalogDetail({
    tenant,
    catalog,
    record,
    expenses,
    totals,
    contracts,
    year,
    years,
}: {
    tenant: Tenant;
    catalog: Catalog;
    record: RecordData;
    options: Options;
    expenses: Page<Expense>;
    totals: Totals;
    contracts: Page<RecordData> | null;
    year: number | null;
    years: number[];
}) {
    const [tableBusy, setTableBusy] = useState(false);
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
                  ...(catalog === 'projects' ? [['Stato', record.status]] : []),
              ];
    return (
        <>
            <Head title={`${record.name} · ${tenant.name}`} />
            <div className="page-shell">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <Link
                            href={path}
                            className="text-sm text-muted-foreground"
                        >
                            {tenant.name} / {labels[catalog]}
                        </Link>
                        <h1 className="mt-2 page-title break-words">
                            {record.name}
                        </h1>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                            disabled={tableBusy}
                            onClick={() =>
                                router.visit(`${path}/${record.id}/edit`)
                            }
                        >
                            Modifica
                        </Button>
                        <DeleteRecord
                            url={`${path}/${record.id}`}
                            redirect={path}
                            label={record.name ?? ''}
                            disabled={tableBusy}
                        />
                    </div>
                </header>
                <Card>
                    <CardContent className="min-w-0">
                        <dl className="grid gap-5 sm:grid-cols-3">
                            {info.map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-sm text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd className="mt-1 text-sm font-medium">
                                        {value ?? '—'}
                                    </dd>
                                </div>
                            ))}
                            {catalog === 'contracts' && (
                                <div>
                                    <dt className="text-sm text-muted-foreground">
                                        Fornitore
                                    </dt>
                                    <dd className="mt-1">
                                        {record.vendor ? (
                                            <Link
                                                className="text-sm text-primary"
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
                        {catalog !== 'vendors' && (
                            <div className="mt-6 flex flex-col gap-2">
                                <p className="text-sm text-muted-foreground">
                                    Centri di Costo
                                </p>
                                {record.cost_centers?.length ? (
                                    <CostCenterTags
                                        centers={record.cost_centers}
                                    />
                                ) : (
                                    <p className="text-sm">Nessuno</p>
                                )}
                            </div>
                        )}
                        {catalog === 'projects' && (
                            <p className="mt-4 text-sm text-muted-foreground">
                                Gli importi allocati ed effettivi del progetto
                                sono la somma delle spese collegate.
                            </p>
                        )}
                    </CardContent>
                </Card>
                {catalog !== 'vendors' && (
                    <AttachmentsSection
                        key={`${tenant.id}:${catalog}:${record.id}`}
                        tenant={tenant}
                        resource={catalog}
                        recordId={record.id}
                    />
                )}
                <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="font-semibold">
                            Totali delle spese collegate ·{' '}
                            {year ?? 'tutti gli anni'}
                        </h2>
                        {catalog === 'projects' && (
                            <div className="flex flex-wrap items-center gap-2">
                                <Label htmlFor="project-expense-year">
                                    Anno di imputazione
                                </Label>
                                <Select
                                    value={year === null ? 'all' : String(year)}
                                    disabled={tableBusy}
                                    onValueChange={(value) => {
                                        router.get(
                                            `${path}/${record.id}`,
                                            value === 'all'
                                                ? {}
                                                : { year: Number(value) },
                                            {
                                                preserveState: true,
                                                preserveScroll: true,
                                            },
                                        );
                                    }}
                                >
                                    <SelectTrigger
                                        id="project-expense-year"
                                        className="w-40"
                                    >
                                        <SelectValue>
                                            {year ?? 'Tutti gli anni'}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Tutti gli anni
                                            </SelectItem>
                                            {years.map((value) => (
                                                <SelectItem
                                                    key={value}
                                                    value={String(value)}
                                                >
                                                    {value}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <Summary totals={totals} />
                </div>
                <section
                    aria-label="Spese collegate"
                    className="flex min-w-0 flex-col gap-3"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold">Spese collegate</h2>
                        {catalog === 'contracts' && (
                            <Button
                                disabled={tableBusy}
                                onClick={() =>
                                    router.visit(
                                        `/t/${tenant.slug}/expenses/create?contract_id=${record.id}`,
                                    )
                                }
                            >
                                Aggiungi spesa
                            </Button>
                        )}
                    </div>
                    <ExpenseTable
                        rows={expenses.data}
                        slug={tenant.slug}
                        showYear
                        contractMode={catalog === 'contracts'}
                        onEdit={(expense) =>
                            router.visit(
                                `/t/${tenant.slug}/expenses/${expense.id}/edit${catalog === 'contracts' ? `?contract_id=${record.id}` : ''}`,
                            )
                        }
                        onBusyChange={setTableBusy}
                    />
                    <div
                        onClickCapture={(event) => {
                            if (tableBusy) {
                                event.preventDefault();
                                event.stopPropagation();
                            }
                        }}
                    >
                        <Pagination page={expenses} />
                    </div>
                </section>
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
        </>
    );
}
CatalogDetail.layout = {
    breadcrumbs: [{ title: 'Dettaglio', href: '/dashboard' }],
};

import { SpreadsheetActions } from '@/components/management/spreadsheet-actions';
import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { AttachmentsSection } from '@/components/management/attachments-section';
import { DeleteRecord } from '@/components/management/delete-record';
import { CostCenterTags } from '@/components/management/cost-center-tags';
import { ExpenseTable } from '@/components/management/expense-table';
import { DetailBreakdownChart } from '@/components/management/detail-breakdown-chart';
import { DetailKpis } from '@/components/management/detail-kpis';
import { DetailNotes } from '@/components/management/detail-notes';
import { dateLabel, money } from '@/components/management/helpers';
import { Pagination } from '@/components/management/pagination';
import { Summary } from '@/components/management/summary';
import { labels } from '@/components/management/types';
import type {
    Catalog,
    DetailBreakdown,
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
    expenses,
    totals,
    breakdown,
    contracts,
    year,
    history,
}: {
    tenant: Tenant;
    catalog: Catalog;
    record: RecordData;
    options: Options;
    expenses: Page<Expense>;
    totals: Totals;
    breakdown: DetailBreakdown | null;
    contracts: Page<RecordData> | null;
    year: number;
    history: boolean;
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
    const economics = (
        <>
            <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-semibold">
                        Totali delle spese collegate · {year}
                    </h2>
                </div>
                {catalog === 'vendors' ? (
                    <Summary totals={totals} />
                ) : (
                    <DetailKpis
                        aggregate
                        allocated={
                            breakdown?.allocated.net == null
                                ? null
                                : totals.allocated
                        }
                        actual={
                            breakdown?.actual.net == null ? null : totals.actual
                        }
                        variance={
                            totals.count > totals.incomplete
                                ? totals.variance
                                : null
                        }
                        count={totals.count}
                        incomplete={totals.incomplete}
                    />
                )}
            </div>
            <div className="grid min-w-0 items-start gap-6 @5xl/detail:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                <section
                    aria-label="Spese collegate"
                    className="order-2 flex min-w-0 flex-col gap-3 @5xl/detail:order-1"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold">
                            Spese collegate ·{' '}
                            {history ? 'Tutti gli anni' : year}
                        </h2>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={tableBusy}
                            onClick={() =>
                                router.get(
                                    `${path}/${record.id}`,
                                    {
                                        year,
                                        ...(history ? {} : { history: 1 }),
                                    },
                                    { preserveScroll: true },
                                )
                            }
                        >
                            {history
                                ? `Mostra solo ${year}`
                                : 'Mostra storico completo'}
                        </Button>
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
                        key={`${tenant.id}:${record.id}:${year}:${history}`}
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
                {breakdown && (
                    <div className="order-1 min-w-0 @5xl/detail:order-2">
                        <DetailBreakdownChart
                            breakdown={breakdown}
                            description={`Totale delle spese collegate → singole spese · ${year}.`}
                        />
                    </div>
                )}
            </div>
        </>
    );
    return (
        <>
            <Head title={`${record.name} · ${tenant.name}`} />
            <div className="@container/detail page-shell">
                <header className="flex detail-enter flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                        <Link
                            href={path}
                            className="text-sm text-muted-foreground"
                        >
                            {tenant.name} / {labels[catalog]}
                        </Link>
                        <h1 className="mt-2 page-title [overflow-wrap:anywhere]">
                            {record.name}
                        </h1>
                        {catalog !== 'vendors' && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                {catalog === 'projects' && (
                                    <Badge variant="secondary">
                                        {record.status}
                                    </Badge>
                                )}
                                <span>
                                    {catalog === 'projects'
                                        ? year
                                        : `${dateLabel(record.starts_on)} – ${dateLabel(record.ends_on)}`}
                                </span>
                            </div>
                        )}
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
                        <SpreadsheetActions
                            slug={tenant.slug}
                            resource={catalog}
                            label={labels[catalog]}
                            filters={{
                                record: record.id,
                                year,
                            }}
                            exportOnly
                        />
                    </div>
                </header>
                {catalog !== 'vendors' && economics}
                <Card className="min-w-0 gap-4">
                    <CardHeader>
                        <CardTitle>Informazioni</CardTitle>
                    </CardHeader>
                    <CardContent className="min-w-0">
                        <dl className="grid gap-5 sm:grid-cols-3">
                            {info
                                .filter(([, value]) => value && value !== '—')
                                .map(([label, value]) => (
                                    <div key={label}>
                                        <dt className="text-sm text-muted-foreground">
                                            {label}
                                        </dt>
                                        <dd className="mt-1 text-sm font-medium">
                                            {value ?? '—'}
                                        </dd>
                                    </div>
                                ))}
                            {catalog === 'contracts' && record.vendor && (
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
                            {catalog === 'contracts' &&
                                record.reference_amount != null && (
                                    <div>
                                        <dt className="text-sm text-muted-foreground">
                                            Valore di riferimento
                                        </dt>
                                        <dd className="mt-1 financial-value text-sm">
                                            {money(record.reference_amount)}
                                        </dd>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Autonomo rispetto alle spese
                                            collegate
                                        </p>
                                    </div>
                                )}
                        </dl>
                        {catalog !== 'vendors' &&
                            !!record.cost_centers?.length && (
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
                {(record.notes || record.description) && (
                    <DetailNotes
                        key={record.id}
                        text={record.notes ?? record.description ?? ''}
                        title={catalog === 'projects' ? 'Descrizione' : 'Note'}
                    />
                )}
                {catalog !== 'vendors' && (
                    <AttachmentsSection
                        compact
                        key={`${tenant.id}:${catalog}:${record.id}`}
                        tenant={tenant}
                        resource={catalog}
                        recordId={record.id}
                    />
                )}
                {catalog === 'vendors' && economics}
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

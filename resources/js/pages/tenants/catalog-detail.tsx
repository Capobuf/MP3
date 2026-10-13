import { ArrowUpRight, CalendarDays, ChevronDown } from 'lucide-react';
import { RecordMoreActions } from '@/components/management/record-more-actions';
import {
    InlineEdit,
    saveInlineRecord,
} from '@/components/management/inline-edit';
import { SpreadsheetActions } from '@/components/management/spreadsheet-actions';
import { Head, Link, router } from '@inertiajs/react';
import { useRef, useState } from 'react';
import { AttachmentsSection } from '@/components/management/attachments-section';
import { DeleteRecord } from '@/components/management/delete-record';
import { CostCenterTags } from '@/components/management/cost-center-tags';
import {
    DashboardFilters,
    applyFilters,
} from '@/components/management/dashboard-filters';
import { ExpenseTable } from '@/components/management/expense-table';
import { LinkProjectExpense } from '@/components/management/link-project-expense';
import { DetailBreakdownChart } from '@/components/management/detail-breakdown-chart';
import { DetailNotes } from '@/components/management/detail-notes';
import {
    dateLabel,
    decimalInput,
    money,
} from '@/components/management/helpers';
import { Pagination } from '@/components/management/pagination';
import { DashboardSummary } from '@/components/management/dashboard-summary';
import type { SummaryAnalytics } from '@/components/management/dashboard-summary';
import { labels, projectStatusLabel } from '@/components/management/types';
import type {
    Catalog,
    DetailBreakdown,
    Expense,
    Filters,
    Options,
    Pagination as Page,
    RecordData,
} from '@/components/management/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Tenant } from '@/types';

export default function CatalogDetail({
    tenant,
    catalog,
    record,
    options,
    expenses,
    analytics,
    breakdown,
    contracts,
    year,
    history,
    expenseFilters,
}: {
    tenant: Tenant;
    catalog: Catalog;
    record: RecordData;
    options: Options;
    expenses: Page<Expense>;
    analytics: SummaryAnalytics;
    breakdown: DetailBreakdown | null;
    contracts: Page<RecordData> | null;
    year: number;
    history: boolean;
    expenseFilters: Filters;
}) {
    const [tableBusy, setTableBusy] = useState(false);
    const [linkExpenseOpen, setLinkExpenseOpen] = useState(false);
    const addExpenseButton = useRef<HTMLButtonElement>(null);
    const path = `/t/${tenant.slug}/${catalog}`;
    const save = (field: string, value: unknown) =>
        saveInlineRecord(`${path}/${record.id}`, { [field]: value });
    const info =
        catalog === 'vendors'
            ? [
                  ['Partita IVA', 'vat_number', record.vat_number],
                  ['Email', 'email', record.email],
                  ['Telefono', 'phone', record.phone],
              ]
            : catalog === 'projects'
              ? [
                    ['Data iniziale', 'starts_on', record.starts_on],
                    ['Data finale', 'ends_on', record.ends_on],
                    ['Stato', 'status', record.status],
                ]
              : [];
    const economics = (
        <>
            <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-semibold">
                        Totali delle spese collegate · {year}
                    </h2>
                </div>
                <DashboardSummary analytics={analytics} year={year} />
            </div>
            {breakdown && (
                <DetailBreakdownChart
                    key={`${tenant.slug}:${catalog}:${record.id}:${year}:${history}`}
                    breakdown={breakdown}
                    getHref={(id) =>
                        /^\d+$/.test(id)
                            ? `/t/${tenant.slug}/expenses/${id}`
                            : undefined
                    }
                />
            )}
            <section
                aria-label="Spese collegate"
                className="flex min-w-0 flex-col gap-3"
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">
                        Spese collegate · {history ? 'Tutti gli anni' : year}
                    </h2>
                    {catalog === 'projects' && (
                        <>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        ref={addExpenseButton}
                                        disabled={tableBusy}
                                    >
                                        Aggiungi
                                        <ChevronDown data-icon="inline-end" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    onCloseAutoFocus={(event) => {
                                        if (linkExpenseOpen)
                                            event.preventDefault();
                                    }}
                                >
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            disabled={tableBusy}
                                            onSelect={() =>
                                                router.visit(
                                                    `/t/${tenant.slug}/expenses/create?project_id=${record.id}&year=${year}`,
                                                )
                                            }
                                        >
                                            Nuova Spesa
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            disabled={tableBusy}
                                            onSelect={() =>
                                                setLinkExpenseOpen(true)
                                            }
                                        >
                                            Spesa Esistente
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <LinkProjectExpense
                                slug={tenant.slug}
                                project={record}
                                open={linkExpenseOpen}
                                onOpenChange={setLinkExpenseOpen}
                                onCloseAutoFocus={(event) => {
                                    event.preventDefault();
                                    addExpenseButton.current?.focus();
                                }}
                            />
                        </>
                    )}
                    {catalog === 'contracts' && (
                        <Button
                            disabled={tableBusy}
                            onClick={() =>
                                router.visit(
                                    `/t/${tenant.slug}/expenses/create?contract_id=${record.id}&year=${year}`,
                                )
                            }
                        >
                            Aggiungi spesa
                        </Button>
                    )}
                </div>
                <ExpenseTable
                    key={`${tenant.id}:${catalog}:${record.id}:${year}:${history}`}
                    toolbar={
                        <DashboardFilters
                            key={JSON.stringify(expenseFilters)}
                            tenant={tenant}
                            expenses={expenses}
                            filters={expenseFilters}
                            options={options}
                            path={`${path}/${record.id}`}
                            busy={tableBusy}
                            hideRelations={[catalog]}
                            contractMode={catalog === 'contracts'}
                        />
                    }
                    filters={expenseFilters}
                    onSort={(sort) =>
                        applyFilters(`${path}/${record.id}`, {
                            ...expenseFilters,
                            sort,
                            direction:
                                expenseFilters.sort === sort &&
                                expenseFilters.direction === 'asc'
                                    ? 'desc'
                                    : 'asc',
                        })
                    }
                    rows={expenses.data}
                    slug={tenant.slug}
                    options={options}
                    hideRelations={[catalog]}
                    showYear
                    contractMode={catalog === 'contracts'}
                    projectId={catalog === 'projects' ? record.id : undefined}
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
                        <InlineEdit
                            value={record.name}
                            label="Nome"
                            disabled={tableBusy}
                            as="h1"
                            className="mt-2 page-title [overflow-wrap:anywhere]"
                            onSave={(value) => save('name', value)}
                        />
                        {catalog === 'projects' && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <Badge variant="secondary">
                                    {projectStatusLabel(record.status)}
                                </Badge>
                                <span>{year}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {catalog !== 'projects' && (
                            <RecordMoreActions
                                href={`${path}/${record.id}/edit`}
                                disabled={tableBusy}
                            />
                        )}
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
                            disabled={tableBusy}
                        />
                    </div>
                </header>
                {catalog === 'contracts' && (
                    <Card
                        role="region"
                        aria-labelledby="contract-period-title"
                        className="grid min-w-0 detail-enter gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-center"
                    >
                        <CardHeader>
                            <CardTitle>
                                <h2
                                    id="contract-period-title"
                                    className="flex items-center gap-2"
                                >
                                    <CalendarDays
                                        aria-hidden="true"
                                        className="size-5 shrink-0 text-muted-foreground"
                                    />
                                    Periodo del contratto
                                </h2>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="grid gap-4 sm:grid-cols-2">
                                {(['starts_on', 'ends_on'] as const).map(
                                    (field) => {
                                        const label =
                                            field === 'starts_on'
                                                ? 'Inizio contratto'
                                                : 'Fine contratto';
                                        return (
                                            <div
                                                key={field}
                                                className="min-w-0"
                                            >
                                                <dt className="mb-2 text-sm text-muted-foreground">
                                                    {label}
                                                </dt>
                                                <dd className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
                                                    <InlineEdit
                                                        value={record[field]}
                                                        label={label}
                                                        type="date"
                                                        display={
                                                            record[field]
                                                                ? dateLabel(
                                                                      record[
                                                                          field
                                                                      ],
                                                                  )
                                                                : 'Da impostare'
                                                        }
                                                        className="min-h-9 content-center text-lg font-semibold tabular-nums"
                                                        disabled={tableBusy}
                                                        onSave={(value) =>
                                                            save(
                                                                field,
                                                                value || null,
                                                            )
                                                        }
                                                    />
                                                </dd>
                                            </div>
                                        );
                                    },
                                )}
                            </dl>
                        </CardContent>
                    </Card>
                )}
                {catalog !== 'vendors' && economics}
                <Card className="min-w-0 gap-4">
                    <CardHeader>
                        <CardTitle>Informazioni</CardTitle>
                    </CardHeader>
                    <CardContent className="min-w-0">
                        <dl className="grid gap-5 sm:grid-cols-3">
                            {info.map(([label, field, value]) => (
                                <div key={label}>
                                    <dt className="text-sm text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd className="mt-1 text-sm font-medium">
                                        <InlineEdit
                                            value={value}
                                            label={label!}
                                            disabled={tableBusy}
                                            type={
                                                field?.endsWith('_on')
                                                    ? 'date'
                                                    : field === 'email'
                                                      ? 'email'
                                                      : 'text'
                                            }
                                            display={
                                                field?.endsWith('_on')
                                                    ? dateLabel(value)
                                                    : field === 'status'
                                                      ? projectStatusLabel(
                                                            value,
                                                        )
                                                      : value || 'Da inserire'
                                            }
                                            options={
                                                field === 'status'
                                                    ? [
                                                          'pianificato',
                                                          'attivo',
                                                          'completato',
                                                      ].map((value) => ({
                                                          value,
                                                          label: projectStatusLabel(
                                                              value,
                                                          ),
                                                      }))
                                                    : undefined
                                            }
                                            onSave={(value) =>
                                                save(field!, value || null)
                                            }
                                        />
                                    </dd>
                                </div>
                            ))}
                            {catalog === 'contracts' && (
                                <div>
                                    <dt className="text-sm text-muted-foreground">
                                        Fornitore
                                    </dt>
                                    <dd className="mt-1 flex items-center gap-2">
                                        <InlineEdit
                                            value={
                                                record.vendor_id == null
                                                    ? ''
                                                    : String(record.vendor_id)
                                            }
                                            label="Fornitore"
                                            disabled={tableBusy}
                                            display={
                                                record.vendor?.name ??
                                                'Senza fornitore'
                                            }
                                            choices={[
                                                {
                                                    value: '',
                                                    label: 'Senza fornitore',
                                                },
                                                ...options.vendors.map(
                                                    (vendor) => ({
                                                        value: String(
                                                            vendor.id,
                                                        ),
                                                        label: vendor.name,
                                                    }),
                                                ),
                                            ]}
                                            onSave={(value) =>
                                                save(
                                                    'vendor_id',
                                                    value
                                                        ? Number(value)
                                                        : null,
                                                )
                                            }
                                        />
                                        {record.vendor && (
                                            <Button
                                                asChild
                                                variant="ghost"
                                                size="icon"
                                            >
                                                <Link
                                                    aria-label={`Apri ${record.vendor.name}`}
                                                    href={`/t/${tenant.slug}/vendors/${record.vendor.id}`}
                                                >
                                                    <ArrowUpRight />
                                                </Link>
                                            </Button>
                                        )}
                                    </dd>
                                </div>
                            )}
                            {catalog === 'contracts' && (
                                <div>
                                    <dt className="text-sm text-muted-foreground">
                                        Valore di riferimento
                                    </dt>
                                    <dd className="mt-1 financial-value text-sm">
                                        <InlineEdit
                                            value={record.reference_amount}
                                            label="Valore di riferimento"
                                            disabled={tableBusy}
                                            display={money(
                                                record.reference_amount,
                                            )}
                                            onSave={(value) =>
                                                save(
                                                    'reference_amount',
                                                    decimalInput(value),
                                                )
                                            }
                                        />
                                    </dd>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Autonomo rispetto alle spese collegate
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
                {
                    <DetailNotes
                        key={record.id}
                        text={record.notes ?? record.description ?? ''}
                        title={catalog === 'projects' ? 'Descrizione' : 'Note'}
                        disabled={tableBusy}
                        onSave={(value) =>
                            save(
                                catalog === 'projects'
                                    ? 'description'
                                    : 'notes',
                                value || null,
                            )
                        }
                    />
                }
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

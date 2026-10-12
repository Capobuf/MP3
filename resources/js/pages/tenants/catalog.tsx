import {
    InlineEdit,
    saveInlineRecord,
} from '@/components/management/inline-edit';
import { SpreadsheetActions } from '@/components/management/spreadsheet-actions';
import { Head, Link, router } from '@inertiajs/react';
import { Plus, Ellipsis, ArrowUpRight, Search } from 'lucide-react';
import { useState } from 'react';
import {
    useTableView,
    TableFilters,
    TableViewHeader,
    TableViewCells,
    TableViewSettings,
} from '@/components/management/table-view';
import { DeleteRecord } from '@/components/management/delete-record';
import { CostCenterTags } from '@/components/management/cost-center-tags';
import { applyFilters } from '@/components/management/expense-workspace';
import { dateLabel } from '@/components/management/helpers';
import { Pagination } from '@/components/management/pagination';
import { RecordSelect } from '@/components/management/record-select';
import { labels, singular } from '@/components/management/types';
import type {
    Catalog,
    Filters,
    Options,
    Pagination as Page,
    RecordData,
} from '@/components/management/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    InputGroup,
    InputGroupInput,
    InputGroupAddon,
} from '@/components/ui/input-group';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
    EmptyContent,
} from '@/components/ui/empty';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import type { Tenant } from '@/types';

export default function CatalogPage({
    tenant,
    catalog,
    records,
    filters,
    options,
}: {
    tenant: Tenant;
    catalog: Catalog;
    records: Page<RecordData>;
    filters: Filters;
    options: Options;
}) {
    'use no memo'; // TanStack v8 exposes mutable table and column instances.

    const [deleting, setDeleting] = useState<RecordData | null>(null);
    const [search, setSearch] = useState(filters.search ?? '');
    const path = `/t/${tenant.slug}/${catalog}`;
    const view = useTableView<RecordData>({
        rows: records.data,
        storageKey: `mp3:table:v1:${tenant.slug}:${catalog}`,
        sorting: [
            { id: filters.sort ?? 'name', desc: filters.direction === 'desc' },
        ],
        onSortingChange: (sorting) => {
            if (sorting[0])
                applyFilters(path, {
                    ...filters,
                    sort: sorting[0].id,
                    direction: sorting[0].desc ? 'desc' : 'asc',
                });
        },
        columns: [
            {
                id: 'name',
                label: 'Nome',
                value: (record) => record.name,
                canHide: false,
            },
            {
                id: 'info',
                label:
                    catalog === 'vendors'
                        ? 'Contatti'
                        : catalog === 'contracts'
                          ? 'Fornitore / periodo'
                          : 'Stato / periodo',
            },
            {
                id: 'expenses_count',
                label: 'Spese collegate · storico',
                value: (record) => record.expenses_count,
                className: 'text-right',
            },
            {
                id: 'actions',
                label: 'Azioni',
                canHide: false,
                className: 'w-12',
                header: <span className="sr-only">Azioni</span>,
            },
        ],
    });
    const activeFilterCount = [
        filters.search,
        filters.vendor_id,
        filters.status,
        filters.expiring === '1',
        filters.linked === '1',
    ].filter(Boolean).length;
    return (
        <>
            <Head title={`${labels[catalog]} · ${tenant.name}`} />
            <div className="page-shell">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm text-muted-foreground">
                            {tenant.name}
                        </p>
                        <h1 className="page-title">{labels[catalog]}</h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {
                                {
                                    vendors:
                                        'Anagrafiche e spese collegate ai tuoi fornitori.',
                                    projects:
                                        'Stato, periodo e costi dei progetti.',
                                    contracts:
                                        'Riferimenti, scadenze e spese dei contratti.',
                                }[catalog]
                            }
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={() => router.visit(`${path}/create`)}>
                            <Plus data-icon="inline-start" />
                            Nuovo {singular[catalog]}
                        </Button>
                        <SpreadsheetActions
                            slug={tenant.slug}
                            resource={catalog}
                            label={labels[catalog]}
                            filters={filters}
                        />
                    </div>
                </header>
                <Card>
                    <CardContent className="flex min-w-0 flex-col gap-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <TableFilters
                                title={`Filtri ${labels[catalog].toLocaleLowerCase('it')}`}
                                count={activeFilterCount}
                                disabled={deleting !== null}
                            >
                                <form
                                    className="flex flex-col gap-3"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        applyFilters(path, {
                                            ...filters,
                                            search,
                                        });
                                    }}
                                >
                                    <InputGroup className="min-w-0">
                                        <InputGroupInput
                                            aria-label="Cerca per nome"
                                            placeholder="Cerca per nome…"
                                            value={search}
                                            onChange={(event) =>
                                                setSearch(event.target.value)
                                            }
                                        />
                                        <InputGroupAddon>
                                            <Search aria-hidden="true" />
                                        </InputGroupAddon>
                                    </InputGroup>
                                    <Button type="submit" variant="outline">
                                        Cerca
                                    </Button>
                                    <Select
                                        value={filters.direction ?? 'asc'}
                                        onValueChange={(direction) =>
                                            applyFilters(path, {
                                                ...filters,
                                                direction,
                                            })
                                        }
                                    >
                                        <SelectTrigger
                                            className="w-full"
                                            aria-label="Ordina per nome"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem value="asc">
                                                    Nome A–Z
                                                </SelectItem>
                                                <SelectItem value="desc">
                                                    Nome Z–A
                                                </SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                    {catalog === 'projects' && (
                                        <Select
                                            value={filters.status || 'all'}
                                            onValueChange={(status) =>
                                                applyFilters(path, {
                                                    ...filters,
                                                    status:
                                                        status === 'all'
                                                            ? ''
                                                            : status,
                                                })
                                            }
                                        >
                                            <SelectTrigger
                                                className="w-full"
                                                aria-label="Filtra stato"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectGroup>
                                                    <SelectItem value="all">
                                                        Tutti gli stati
                                                    </SelectItem>
                                                    {[
                                                        'pianificato',
                                                        'attivo',
                                                        'completato',
                                                    ].map((status) => (
                                                        <SelectItem
                                                            value={status}
                                                            key={status}
                                                        >
                                                            {status}
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    )}
                                    {catalog === 'contracts' && (
                                        <>
                                            <div className="w-full">
                                                <RecordSelect
                                                    slug={tenant.slug}
                                                    catalog="vendors"
                                                    value={
                                                        filters.vendor_id ?? ''
                                                    }
                                                    label="Tutti i fornitori"
                                                    options={options.vendors}
                                                    onChange={(vendor_id) =>
                                                        applyFilters(path, {
                                                            ...filters,
                                                            vendor_id,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant={
                                                    filters.expiring === '1'
                                                        ? 'secondary'
                                                        : 'outline'
                                                }
                                                onClick={() =>
                                                    applyFilters(path, {
                                                        ...filters,
                                                        expiring:
                                                            filters.expiring ===
                                                            '1'
                                                                ? ''
                                                                : '1',
                                                    })
                                                }
                                            >
                                                In scadenza entro 90 giorni
                                            </Button>
                                        </>
                                    )}
                                    {catalog === 'vendors' && (
                                        <Button
                                            type="button"
                                            variant={
                                                filters.linked === '1'
                                                    ? 'secondary'
                                                    : 'outline'
                                            }
                                            onClick={() =>
                                                applyFilters(path, {
                                                    ...filters,
                                                    linked:
                                                        filters.linked === '1'
                                                            ? ''
                                                            : '1',
                                                })
                                            }
                                        >
                                            Con spese collegate
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => {
                                            setSearch('');
                                            applyFilters(path, {});
                                        }}
                                    >
                                        Azzera
                                    </Button>
                                </form>
                            </TableFilters>
                            <TableViewSettings
                                view={view}
                                disabled={deleting !== null}
                            />
                        </div>
                        {records.data.length === 0 ? (
                            <Empty className="border">
                                <EmptyHeader>
                                    <EmptyTitle>
                                        Nessun {singular[catalog]} trovato
                                    </EmptyTitle>
                                    <EmptyDescription>
                                        Modifica la ricerca oppure aggiungi il
                                        primo elemento.
                                    </EmptyDescription>
                                </EmptyHeader>
                                <EmptyContent>
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            router.visit(`${path}/create`)
                                        }
                                    >
                                        Aggiungi {singular[catalog]}
                                    </Button>
                                </EmptyContent>
                            </Empty>
                        ) : (
                            <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
                                <Table>
                                    <TableViewHeader
                                        view={view}
                                        disabled={deleting !== null}
                                    />
                                    <TableBody>
                                        {view.table
                                            .getRowModel()
                                            .rows.map(
                                                ({ original: record }) => (
                                                    <TableRow key={record.id}>
                                                        <TableViewCells
                                                            table={view.table}
                                                        >
                                                            <TableCell
                                                                key="name"
                                                                className="max-w-80 min-w-48 font-medium break-words whitespace-normal"
                                                            >
                                                                <div className="flex items-start gap-2">
                                                                    <InlineEdit
                                                                        value={
                                                                            record.name
                                                                        }
                                                                        label={`Nome di ${record.name}`}
                                                                        disabled={
                                                                            deleting !==
                                                                            null
                                                                        }
                                                                        className="flex-1"
                                                                        onSave={(
                                                                            value,
                                                                        ) =>
                                                                            saveInlineRecord(
                                                                                `${path}/${record.id}`,
                                                                                {
                                                                                    name: value,
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                    <Button
                                                                        asChild
                                                                        variant="ghost"
                                                                        size="icon"
                                                                    >
                                                                        <Link
                                                                            href={`${path}/${record.id}`}
                                                                            aria-label={`Apri ${record.name}`}
                                                                        >
                                                                            <ArrowUpRight />
                                                                        </Link>
                                                                    </Button>
                                                                </div>
                                                                {catalog !==
                                                                    'vendors' && (
                                                                    <CostCenterTags
                                                                        centers={
                                                                            record.cost_centers
                                                                        }
                                                                    />
                                                                )}
                                                            </TableCell>
                                                            <TableCell key="info">
                                                                {catalog ===
                                                                'vendors' ? (
                                                                    <>
                                                                        <div>
                                                                            <InlineEdit
                                                                                value={
                                                                                    record.email
                                                                                }
                                                                                label={`Email di ${record.name}`}
                                                                                type="email"
                                                                                disabled={
                                                                                    deleting !==
                                                                                    null
                                                                                }
                                                                                onSave={(
                                                                                    value,
                                                                                ) =>
                                                                                    saveInlineRecord(
                                                                                        `${path}/${record.id}`,
                                                                                        {
                                                                                            email:
                                                                                                value ||
                                                                                                null,
                                                                                        },
                                                                                    )
                                                                                }
                                                                            />
                                                                        </div>
                                                                        <div className="text-sm text-muted-foreground">
                                                                            <InlineEdit
                                                                                value={
                                                                                    record.phone
                                                                                }
                                                                                label={`Telefono di ${record.name}`}
                                                                                disabled={
                                                                                    deleting !==
                                                                                    null
                                                                                }
                                                                                onSave={(
                                                                                    value,
                                                                                ) =>
                                                                                    saveInlineRecord(
                                                                                        `${path}/${record.id}`,
                                                                                        {
                                                                                            phone:
                                                                                                value ||
                                                                                                null,
                                                                                        },
                                                                                    )
                                                                                }
                                                                            />
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        {catalog ===
                                                                        'contracts' ? (
                                                                            <p>
                                                                                {record
                                                                                    .vendor
                                                                                    ?.name ??
                                                                                    'Senza fornitore'}
                                                                            </p>
                                                                        ) : (
                                                                            <InlineEdit
                                                                                display={
                                                                                    <Badge variant="secondary">
                                                                                        {
                                                                                            record.status
                                                                                        }
                                                                                    </Badge>
                                                                                }
                                                                                value={
                                                                                    record.status
                                                                                }
                                                                                label={`Stato di ${record.name}`}
                                                                                options={[
                                                                                    'pianificato',
                                                                                    'attivo',
                                                                                    'completato',
                                                                                ].map(
                                                                                    (
                                                                                        value,
                                                                                    ) => ({
                                                                                        value,
                                                                                        label: value,
                                                                                    }),
                                                                                )}
                                                                                onSave={(
                                                                                    value,
                                                                                ) =>
                                                                                    saveInlineRecord(
                                                                                        `${path}/${record.id}`,
                                                                                        {
                                                                                            status: value,
                                                                                        },
                                                                                    )
                                                                                }
                                                                            />
                                                                        )}
                                                                        <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                                                                            <InlineEdit
                                                                                value={
                                                                                    record.starts_on
                                                                                }
                                                                                type="date"
                                                                                label={`Data iniziale di ${record.name}`}
                                                                                display={dateLabel(
                                                                                    record.starts_on,
                                                                                )}
                                                                                onSave={(
                                                                                    value,
                                                                                ) =>
                                                                                    saveInlineRecord(
                                                                                        `${path}/${record.id}`,
                                                                                        {
                                                                                            starts_on:
                                                                                                value ||
                                                                                                null,
                                                                                        },
                                                                                    )
                                                                                }
                                                                            />
                                                                            <span>
                                                                                →
                                                                            </span>
                                                                            <InlineEdit
                                                                                value={
                                                                                    record.ends_on
                                                                                }
                                                                                type="date"
                                                                                label={`Data finale di ${record.name}`}
                                                                                display={dateLabel(
                                                                                    record.ends_on,
                                                                                )}
                                                                                onSave={(
                                                                                    value,
                                                                                ) =>
                                                                                    saveInlineRecord(
                                                                                        `${path}/${record.id}`,
                                                                                        {
                                                                                            ends_on:
                                                                                                value ||
                                                                                                null,
                                                                                        },
                                                                                    )
                                                                                }
                                                                            />
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </TableCell>
                                                            <TableCell
                                                                key="expenses_count"
                                                                className="text-right tabular-nums"
                                                            >
                                                                {
                                                                    record.expenses_count
                                                                }
                                                            </TableCell>
                                                            <TableCell key="actions">
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger
                                                                        asChild
                                                                    >
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            aria-label={`Azioni per ${record.name}`}
                                                                        >
                                                                            <Ellipsis />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuGroup>
                                                                            <DropdownMenuItem
                                                                                asChild
                                                                            >
                                                                                <Link
                                                                                    href={`${path}/${record.id}`}
                                                                                >
                                                                                    Apri
                                                                                    dettaglio
                                                                                </Link>
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem
                                                                                asChild
                                                                            >
                                                                                <Link
                                                                                    href={`${path}/${record.id}/edit`}
                                                                                >
                                                                                    Gestisci
                                                                                    collegamenti
                                                                                </Link>
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuSeparator />
                                                                            <DropdownMenuItem
                                                                                variant="destructive"
                                                                                onSelect={() =>
                                                                                    setDeleting(
                                                                                        record,
                                                                                    )
                                                                                }
                                                                            >
                                                                                Elimina
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuGroup>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </TableCell>
                                                        </TableViewCells>
                                                    </TableRow>
                                                ),
                                            )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        <Pagination page={records} />
                    </CardContent>
                </Card>
            </div>
            {deleting && (
                <DeleteRecord
                    url={`${path}/${deleting.id}`}
                    label={deleting.name ?? ''}
                    open
                    onOpenChange={(open) => {
                        if (!open) setDeleting(null);
                    }}
                />
            )}
        </>
    );
}
CatalogPage.layout = {
    breadcrumbs: [{ title: 'Gestionale', href: '/dashboard' }],
};

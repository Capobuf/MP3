import { Head, Link, router } from '@inertiajs/react';
import { Plus, Ellipsis, Search } from 'lucide-react';
import { useState } from 'react';
import { DeleteRecord } from '@/components/management/delete-record';
import { CostCenterTags } from '@/components/management/cost-center-tags';
import { EntitySheet } from '@/components/management/entity-sheet';
import { applyFilters } from '@/components/management/expense-workspace';
import { dateLabel, money } from '@/components/management/helpers';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
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
    const [sheet, setSheet] = useState<{ record?: RecordData } | null>(null);
    const [deleting, setDeleting] = useState<RecordData | null>(null);
    const [search, setSearch] = useState(filters.search ?? '');
    const path = `/t/${tenant.slug}/${catalog}`;
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
                    <Button onClick={() => setSheet({})}>
                        <Plus className="mr-2 size-4" />
                        Nuovo {singular[catalog]}
                    </Button>
                </header>
                <Card>
                    <CardContent className="flex min-w-0 flex-col gap-5">
                        <form
                            className="flex flex-wrap gap-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                applyFilters(path, { ...filters, search });
                            }}
                        >
                            <InputGroup className="min-w-0 flex-1 basis-56">
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
                                    className="w-44"
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
                                                status === 'all' ? '' : status,
                                        })
                                    }
                                >
                                    <SelectTrigger
                                        className="w-44"
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
                                    <div className="w-full sm:w-64">
                                        <RecordSelect
                                            slug={tenant.slug}
                                            catalog="vendors"
                                            value={filters.vendor_id ?? ''}
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
                                                    filters.expiring === '1'
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
                                        onClick={() => setSheet({})}
                                    >
                                        Aggiungi {singular[catalog]}
                                    </Button>
                                </EmptyContent>
                            </Empty>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>
                                            {catalog === 'vendors'
                                                ? 'Contatti'
                                                : catalog === 'contracts'
                                                  ? 'Fornitore / periodo'
                                                  : 'Stato / periodo'}
                                        </TableHead>
                                        {catalog === 'contracts' && (
                                            <TableHead className="text-right">
                                                Riferimento informativo
                                            </TableHead>
                                        )}
                                        <TableHead className="text-right">
                                            Spese collegate
                                        </TableHead>
                                        <TableHead className="w-12">
                                            <span className="sr-only">
                                                Azioni
                                            </span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {records.data.map((record) => (
                                        <TableRow key={record.id}>
                                            <TableCell className="max-w-80 min-w-48 font-medium break-words whitespace-normal">
                                                <Link
                                                    href={`${path}/${record.id}`}
                                                >
                                                    {record.name}
                                                </Link>
                                                {catalog !== 'vendors' && (
                                                    <CostCenterTags
                                                        centers={
                                                            record.cost_centers
                                                        }
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {catalog === 'vendors' ? (
                                                    <>
                                                        <p>
                                                            {record.email ??
                                                                '—'}
                                                        </p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {record.phone ??
                                                                '—'}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <>
                                                        {catalog ===
                                                        'contracts' ? (
                                                            <p>
                                                                {record.vendor
                                                                    ?.name ??
                                                                    'Senza fornitore'}
                                                            </p>
                                                        ) : (
                                                            <Badge variant="secondary">
                                                                {record.status}
                                                            </Badge>
                                                        )}
                                                        <p className="mt-1 text-sm text-muted-foreground">
                                                            {dateLabel(
                                                                record.starts_on,
                                                            )}{' '}
                                                            →{' '}
                                                            {dateLabel(
                                                                record.ends_on,
                                                            )}
                                                        </p>
                                                    </>
                                                )}
                                            </TableCell>
                                            {catalog === 'contracts' && (
                                                <TableCell className="text-right text-sm font-medium tracking-normal tabular-nums">
                                                    {money(
                                                        record.reference_amount,
                                                    )}
                                                </TableCell>
                                            )}
                                            <TableCell className="text-right tabular-nums">
                                                {record.expenses_count}
                                            </TableCell>
                                            <TableCell>
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
                                                                onSelect={() =>
                                                                    setSheet({
                                                                        record,
                                                                    })
                                                                }
                                                            >
                                                                Modifica
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
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
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
            {sheet && (
                <EntitySheet
                    tenant={tenant}
                    kind={catalog}
                    record={sheet.record}
                    options={options}
                    onClose={() => setSheet(null)}
                    onSaved={() => {
                        setSheet(null);
                        router.reload();
                    }}
                />
            )}
        </>
    );
}
CatalogPage.layout = {
    breadcrumbs: [{ title: 'Gestionale', href: '/dashboard' }],
};

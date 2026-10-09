import { Head, Link, router } from '@inertiajs/react';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DeleteRecord } from '@/components/management/delete-record';
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
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
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
    const [search, setSearch] = useState(filters.search ?? '');
    const path = `/t/${tenant.slug}/${catalog}`;
    return (
        <>
            <Head title={`${labels[catalog]} · ${tenant.name}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-sm text-muted-foreground">
                            {tenant.name}
                        </p>
                        <h1 className="text-3xl font-semibold">
                            {labels[catalog]}
                        </h1>
                    </div>
                    <Button onClick={() => setSheet({})}>
                        <Plus className="mr-2 size-4" />
                        Nuovo {singular[catalog]}
                    </Button>
                </header>
                <Card>
                    <CardContent className="space-y-5 pt-6">
                        <form
                            className="flex flex-wrap gap-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                applyFilters(path, { ...filters, search });
                            }}
                        >
                            <Input
                                className="w-full sm:w-64"
                                aria-label="Cerca per nome"
                                placeholder="Cerca per nome…"
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                            />
                            <Button type="submit" variant="secondary">
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
                                    <SelectItem value="asc">
                                        Nome A–Z
                                    </SelectItem>
                                    <SelectItem value="desc">
                                        Nome Z–A
                                    </SelectItem>
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
                                    </SelectContent>
                                </Select>
                            )}
                            {catalog === 'contracts' && (
                                <>
                                    <div className="w-64">
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
                            <div className="rounded-lg border border-dashed p-10 text-center">
                                <p className="font-medium">
                                    Nessun {singular[catalog]} trovato
                                </p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Modifica la ricerca oppure aggiungi il primo
                                    elemento.
                                </p>
                                <Button
                                    variant="outline"
                                    className="mt-4"
                                    onClick={() => setSheet({})}
                                >
                                    Aggiungi {singular[catalog]}
                                </Button>
                            </div>
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
                                        <TableHead>Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {records.data.map((record) => (
                                        <TableRow key={record.id}>
                                            <TableCell className="font-medium">
                                                <Link
                                                    className="hover:underline"
                                                    href={`${path}/${record.id}`}
                                                >
                                                    {record.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                {catalog === 'vendors' ? (
                                                    <>
                                                        <p>
                                                            {record.email ??
                                                                '—'}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
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
                                                        <p className="mt-1 text-xs text-muted-foreground">
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
                                                <TableCell className="text-right text-sm font-medium tabular-nums">
                                                    {money(
                                                        record.reference_amount,
                                                    )}
                                                </TableCell>
                                            )}
                                            <TableCell className="text-right tabular-nums">
                                                {record.expenses_count}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() =>
                                                            setSheet({ record })
                                                        }
                                                    >
                                                        Modifica
                                                    </Button>
                                                    <DeleteRecord
                                                        url={`${path}/${record.id}`}
                                                        label={
                                                            record.name ?? ''
                                                        }
                                                    />
                                                </div>
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

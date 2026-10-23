import { Head, Link, router } from '@inertiajs/react';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import {
    ContractTimeline,
    type TimelineContract,
} from '@/components/management/contract-timeline';
import { DetailHero } from '@/components/management/detail-hero';
import { dateLabel } from '@/components/management/helpers';
import {
    useTableView,
    TableViewHeader,
} from '@/components/management/table-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectGroup,
    SelectItem,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import type { Tenant } from '@/types';

type Contract = TimelineContract & {
    vendor: { name: string } | null;
};
type Filters = { search?: string; period?: string };

export default function ContractSchedule({
    tenant,
    records,
    year,
    today,
    filters,
}: {
    tenant: Tenant;
    records: Contract[];
    year: number;
    today: string;
    filters: Filters;
}) {
    'use no memo'; // TanStack v8 exposes mutable table and column instances.
    const [search, setSearch] = useState(filters.search ?? '');
    const path = `/t/${tenant.slug}/scadenzario`;
    const href = (record: TimelineContract) =>
        `/t/${tenant.slug}/contracts/${record.id}?year=${record.year ?? year}`;
    const apply = (next: Filters) =>
        router.get(
            path,
            { year, ...filters, ...next },
            { preserveState: true, replace: true },
        );
    const view = useTableView({
        rows: records,
        storageKey: `mp3:schedule:${tenant.slug}`,
        columns: [
            { id: 'name', label: 'Contratto', value: (r) => r.display_name },
            { id: 'vendor', label: 'Fornitore', value: (r) => r.vendor?.name },
            {
                id: 'starts_on',
                label: 'Inizio',
                value: (r) => r.starts_on ?? undefined,
            },
            {
                id: 'ends_on',
                label: 'Scadenza',
                value: (r) => r.ends_on ?? undefined,
            },
        ],
    });
    return (
        <>
            <Head title={`Scadenzario · ${tenant.name}`} />
            <div className="page-shell detail-enter">
                <DetailHero
                    icon={CalendarDays}
                    accent="contract"
                    actions={
                        <Button variant="outline" asChild>
                            <Link
                                href={`/t/${tenant.slug}/settings/contract-reminders`}
                            >
                                Promemoria email
                            </Link>
                        </Button>
                    }
                >
                    <p className="text-sm text-muted-foreground">
                        {tenant.name} · Anno economico {year}
                    </p>
                    <h1 className="page-title">Scadenzario</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        I contratti dell’anno, anche quando terminano negli anni
                        successivi.
                    </p>
                </DetailHero>
                <Card>
                    <CardHeader>
                        <CardTitle>
                            Scadenze dei contratti{' '}
                            <Badge variant="secondary">{records.length}</Badge>
                        </CardTitle>
                        <CardDescription>
                            Apri un contratto per consultarne il dettaglio.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                        <div className="flex flex-wrap items-end gap-3">
                            <form
                                className="flex flex-1 items-end gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    apply({ search });
                                }}
                            >
                                <Field className="min-w-36">
                                    <FieldLabel htmlFor="schedule-search">
                                        Cerca contratto
                                    </FieldLabel>
                                    <Input
                                        id="schedule-search"
                                        value={search}
                                        onChange={(e) =>
                                            setSearch(e.target.value)
                                        }
                                        placeholder="Nome del contratto"
                                    />
                                </Field>
                                <Button variant="outline" type="submit">
                                    Cerca
                                </Button>
                            </form>
                            <Field className="w-full sm:w-52">
                                <FieldLabel htmlFor="schedule-period">
                                    Scadenza
                                </FieldLabel>
                                <Select
                                    value={filters.period || 'all'}
                                    onValueChange={(value) =>
                                        apply({
                                            period:
                                                value === 'all' ? '' : value,
                                        })
                                    }
                                >
                                    <SelectTrigger id="schedule-period">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            {[
                                                ['all', 'Tutte le scadenze'],
                                                ['expired', 'Scaduti'],
                                                ['30', 'Entro 30 giorni'],
                                                ['60', 'Entro 60 giorni'],
                                                ['90', 'Entro 90 giorni'],
                                                ['undated', 'Senza scadenza'],
                                            ].map(([value, label]) => (
                                                <SelectItem
                                                    key={value}
                                                    value={value}
                                                >
                                                    {label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                        {records.length === 0 ? (
                            <Empty>
                                <EmptyHeader>
                                    <EmptyTitle>Nessun contratto</EmptyTitle>
                                    <EmptyDescription>
                                        Prova a cambiare i filtri o l’anno
                                        economico.
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        ) : (
                            <>
                                <ContractTimeline
                                    key={`${year}:${filters.search ?? ''}:${filters.period ?? 'all'}`}
                                    records={records}
                                    year={year}
                                    today={today}
                                    undatedHref={`${path}?${new URLSearchParams({ year: String(year), period: 'undated', search: filters.search ?? '' })}`}
                                    href={href}
                                />
                                <Table>
                                    <TableViewHeader
                                        view={view}
                                        settingsColumn={null}
                                    />
                                    <TableBody>
                                        {view.table
                                            .getRowModel()
                                            .rows.map(
                                                ({ original: record }) => (
                                                    <TableRow key={record.id}>
                                                        <TableCell>
                                                            <Link
                                                                href={href(
                                                                    record,
                                                                )}
                                                                className="font-medium hover:text-primary"
                                                            >
                                                                {
                                                                    record.display_name
                                                                }
                                                            </Link>
                                                            {record.year ===
                                                                null && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="ml-2"
                                                                >
                                                                    Senza
                                                                    annualità
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {record.vendor
                                                                ?.name ?? '—'}
                                                        </TableCell>
                                                        <TableCell>
                                                            {dateLabel(
                                                                record.starts_on,
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {record.ends_on ? (
                                                                <span
                                                                    className={
                                                                        record.ends_on <
                                                                        today
                                                                            ? 'text-destructive'
                                                                            : undefined
                                                                    }
                                                                >
                                                                    {dateLabel(
                                                                        record.ends_on,
                                                                    )}
                                                                </span>
                                                            ) : (
                                                                <Badge variant="secondary">
                                                                    Senza
                                                                    scadenza
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ),
                                            )}
                                    </TableBody>
                                </Table>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

ContractSchedule.layout = {
    breadcrumbs: [{ title: 'Scadenzario', href: '/dashboard' }],
};

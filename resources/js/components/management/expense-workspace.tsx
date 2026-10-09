import { router } from '@inertiajs/react';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { EntitySheet } from './entity-sheet';
import { ExpenseTable } from './expense-table';
import { matchesExpenseFilters } from './helpers';
import { Pagination } from './pagination';
import { RecordSelect } from './record-select';
import type { Expense, ExpensePageProps, Filters, RecordData } from './types';

export function applyFilters(path: string, filters: Filters) {
    const query = Object.fromEntries(
        Object.entries(filters).filter(
            ([, value]) => value !== '' && value !== undefined,
        ),
    );
    router.get(path, query, { preserveState: true, preserveScroll: true });
}

export function ExpenseWorkspace({
    tenant,
    expenses,
    filters,
    years,
    options,
    dashboard = false,
    onBusyChange,
}: ExpensePageProps & {
    dashboard?: boolean;
    onBusyChange?: (busy: boolean) => void;
}) {
    const [draft, setDraft] = useState(filters);
    const [sheet, setSheet] = useState<{ record?: Expense } | null>(null);
    const [busy, setBusy] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const path = `/t/${tenant.slug}/${dashboard ? 'dashboard' : 'expenses'}`;
    const year = filters.year;
    const secondaryFilters = [
        {
            catalog: 'vendors',
            field: 'vendor_id',
            label: 'Fornitore',
            all: 'Tutti i fornitori',
            relation: 'vendor',
        },
        {
            catalog: 'contracts',
            field: 'contract_id',
            label: 'Contratto',
            all: 'Tutti i contratti',
            relation: 'contract',
        },
        {
            catalog: 'projects',
            field: 'project_id',
            label: 'Progetto',
            all: 'Tutti i progetti',
            relation: 'project',
        },
    ] as const;
    const activeFilters = secondaryFilters.filter(
        ({ field }) => filters[field],
    ).length;

    function saved(record: RecordData) {
        setSheet(null);
        if (!matchesExpenseFilters(record, filters)) {
            toast.info(
                'Spesa salvata. Non compare nella lista perché non corrisponde ai filtri correnti.',
            );
        }
        router.reload();
    }

    return (
        <section aria-label="Gestione spese" className="min-w-0 space-y-4">
            {dashboard && (
                <h2 className="text-base font-semibold">Spese · {year}</h2>
            )}
            <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    applyFilters(path, draft);
                }}
            >
                <div className="relative min-w-0 flex-1 basis-48">
                    <Search
                        aria-hidden="true"
                        className="absolute top-2.5 left-3 size-4 text-muted-foreground"
                    />
                    <Input
                        aria-label="Cerca spese per descrizione"
                        className="pl-9"
                        placeholder="Cerca una spesa…"
                        value={draft.search ?? ''}
                        disabled={busy}
                        onChange={(event) =>
                            setDraft({ ...draft, search: event.target.value })
                        }
                    />
                </div>
                <Button type="submit" variant="outline" disabled={busy}>
                    Cerca
                </Button>
                {!dashboard && (
                    <Select
                        value={String(year)}
                        disabled={busy}
                        onValueChange={(value) =>
                            applyFilters(path, {
                                ...filters,
                                year: Number(value),
                            })
                        }
                    >
                        <SelectTrigger
                            className="w-28"
                            aria-label="Anno di imputazione"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {years.map((value) => (
                                <SelectItem key={value} value={String(value)}>
                                    {value}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <PopoverTrigger asChild>
                        <Button type="button" variant="outline" disabled={busy}>
                            <SlidersHorizontal className="size-4" />
                            Filtri{activeFilters > 0 && ` (${activeFilters})`}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        className="w-80 max-w-[calc(100vw-2rem)] space-y-4"
                    >
                        <h3 className="text-sm font-medium">Filtra spese</h3>
                        {secondaryFilters.map(
                            ({ catalog, field, label, all, relation }) => (
                                <div key={field} className="space-y-1.5">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        {label}
                                    </p>
                                    <RecordSelect
                                        slug={tenant.slug}
                                        catalog={catalog}
                                        value={draft[field] ?? ''}
                                        onChange={(value) =>
                                            setDraft({
                                                ...draft,
                                                [field]: value,
                                            })
                                        }
                                        options={[
                                            ...options[catalog],
                                            ...expenses.data.flatMap(
                                                (expense) =>
                                                    expense[relation]
                                                        ? [expense[relation]!]
                                                        : [],
                                            ),
                                        ]}
                                        label={all}
                                        includeNone
                                        disabled={busy}
                                    />
                                </div>
                            ),
                        )}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                                Ordina per
                            </Label>
                            <Select
                                value={`${draft.sort ?? 'title'}:${draft.direction ?? 'asc'}`}
                                disabled={busy}
                                onValueChange={(value) => {
                                    const [sort, direction] = value.split(':');
                                    setDraft({ ...draft, sort, direction });
                                }}
                            >
                                <SelectTrigger aria-label="Ordinamento spese">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[
                                        ['title', 'Descrizione'],
                                        ['allocated_amount', 'Allocato'],
                                        ['actual_amount', 'Effettivo'],
                                        ['due_on', 'Scadenza'],
                                        ['updated_at', 'Ultima modifica'],
                                    ].flatMap(([field, label]) =>
                                        ['asc', 'desc'].map((direction) => (
                                            <SelectItem
                                                key={`${field}:${direction}`}
                                                value={`${field}:${direction}`}
                                            >
                                                {label} ·{' '}
                                                {direction === 'asc'
                                                    ? 'crescente'
                                                    : 'decrescente'}
                                            </SelectItem>
                                        )),
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            type="button"
                            className="w-full"
                            disabled={busy}
                            onClick={() => {
                                setFiltersOpen(false);
                                applyFilters(path, draft);
                            }}
                        >
                            Applica filtri
                        </Button>
                    </PopoverContent>
                </Popover>
                {(activeFilters > 0 || filters.search) && (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                            const reset = {
                                year,
                                sort: filters.sort,
                                direction: filters.direction,
                            };
                            setDraft(reset);
                            applyFilters(path, reset);
                        }}
                    >
                        Azzera filtri
                    </Button>
                )}
                {!dashboard && (
                    <Button
                        type="button"
                        disabled={busy}
                        onClick={() => setSheet({})}
                    >
                        <Plus className="size-4" />
                        Nuova spesa
                    </Button>
                )}
            </form>
            <ExpenseTable
                rows={expenses.data}
                slug={tenant.slug}
                filters={filters}
                onSort={(sort) =>
                    applyFilters(path, {
                        ...filters,
                        sort,
                        direction:
                            filters.sort === sort && filters.direction === 'asc'
                                ? 'desc'
                                : 'asc',
                    })
                }
                onEdit={(record) => setSheet({ record })}
                onBusyChange={(value) => {
                    setBusy(value);
                    onBusyChange?.(value);
                }}
            />
            <div
                onClickCapture={(event) => {
                    if (busy) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
            >
                <Pagination page={expenses} />
            </div>
            {sheet && (
                <EntitySheet
                    tenant={tenant}
                    kind="expenses"
                    record={sheet.record}
                    year={year}
                    options={options}
                    onClose={() => setSheet(null)}
                    onSaved={saved}
                />
            )}
        </section>
    );
}

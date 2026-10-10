import { router } from '@inertiajs/react';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    InputGroup,
    InputGroupInput,
    InputGroupAddon,
} from '@/components/ui/input-group';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { RecordSelect } from './record-select';
import type { ExpensePageProps, Filters } from './types';

export function applyFilters(path: string, filters: Filters) {
    const query = Object.fromEntries(
        Object.entries(filters).filter(
            ([, value]) => value !== '' && value !== undefined,
        ),
    );
    router.get(path, query, { preserveState: true, preserveScroll: true });
}

export function DashboardFilters({
    tenant,
    expenses,
    filters,
    years,
    options,
    path,
    busy = false,
    onCreate,
}: Omit<ExpensePageProps, 'totals'> & {
    path: string;
    busy?: boolean;
    onCreate?: () => void;
}) {
    const [draft, setDraft] = useState(filters);
    const [filtersOpen, setFiltersOpen] = useState(false);
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

    return (
        <form
            className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-xs"
            onSubmit={(event) => {
                event.preventDefault();
                applyFilters(path, draft);
            }}
        >
            <InputGroup className="min-w-0 flex-1 basis-48">
                <InputGroupInput
                    aria-label="Cerca spese per descrizione"
                    placeholder="Cerca una spesa…"
                    value={draft.search ?? ''}
                    disabled={busy}
                    onChange={(event) =>
                        setDraft({ ...draft, search: event.target.value })
                    }
                />
                <InputGroupAddon>
                    <Search aria-hidden="true" />
                </InputGroupAddon>
            </InputGroup>
            <Button type="submit" variant="outline" disabled={busy}>
                Cerca
            </Button>
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
                    <SelectGroup>
                        {years.map((value) => (
                            <SelectItem key={value} value={String(value)}>
                                {value}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                <PopoverTrigger asChild>
                    <Button type="button" variant="outline" disabled={busy}>
                        <SlidersHorizontal className="size-4" />
                        Filtri
                        {activeFilters > 0 && (
                            <Badge variant="secondary" className="tabular-nums">
                                {activeFilters}
                            </Badge>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-4"
                >
                    <h3 className="text-sm font-medium">Filtra spese</h3>
                    {secondaryFilters.map(
                        ({ catalog, field, label, all, relation }) => (
                            <div key={field} className="space-y-1.5">
                                <Label htmlFor={`filter-${field}`}>
                                    {label}
                                </Label>
                                <RecordSelect
                                    id={`filter-${field}`}
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
                                        ...expenses.data.flatMap((expense) =>
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
                                <SelectGroup>
                                    {[
                                        ['title', 'Descrizione'],
                                        ['allocated_amount', 'Allocato'],
                                        ['actual_amount', 'Effettivo'],
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
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                            setDraft({
                                year,
                                sort: filters.sort,
                                direction: filters.direction,
                            })
                        }
                    >
                        Azzera selezione
                    </Button>
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
            {onCreate && (
                <Button
                    type="button"
                    className="w-full sm:ml-auto sm:w-auto"
                    disabled={busy}
                    onClick={onCreate}
                >
                    <Plus className="size-4" />
                    Nuova spesa
                </Button>
            )}
            {activeFilters > 0 && (
                <div
                    className="flex w-full flex-wrap gap-2 border-t pt-3"
                    aria-label="Filtri applicati"
                >
                    {secondaryFilters
                        .filter(({ field }) => filters[field])
                        .map(({ field, catalog, label, relation }) => {
                            const selected = [
                                ...options[catalog],
                                ...expenses.data.flatMap((expense) =>
                                    expense[relation]
                                        ? [expense[relation]!]
                                        : [],
                                ),
                            ].find(
                                (option) =>
                                    String(option.id) === filters[field],
                            );
                            const name =
                                filters[field] === 'none'
                                    ? 'Senza collegamento'
                                    : (selected?.name ??
                                      `Elemento #${filters[field]}`);
                            return (
                                <Button
                                    key={field}
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={busy}
                                    className="h-auto min-h-8 max-w-full whitespace-normal"
                                    aria-label={`Rimuovi filtro ${label}: ${name}`}
                                    onClick={() =>
                                        applyFilters(path, {
                                            ...filters,
                                            [field]: '',
                                        })
                                    }
                                >
                                    {label}: {name}
                                    <X data-icon="inline-end" />
                                </Button>
                            );
                        })}
                </div>
            )}
        </form>
    );
}

import { useEffect, useState } from 'react';
import { Link } from '@inertiajs/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from '@/components/ui/sheet';
import { Field, FieldLabel } from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useDelayedBusy } from '@/hooks/use-delayed-busy';
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
} from '@/components/ui/empty';
import { ChevronsUpDown } from 'lucide-react';
import { api, money } from './helpers';
import { budgetLabels, budgetTypes } from './budget-types';
import type {
    BudgetEntry,
    BudgetMutate,
    BudgetSuggestion,
    BudgetType,
} from './budget-types';
import type { Option } from './types';

export function BudgetCenterSelect({
    value,
    centers,
    onChange,
    disabled,
    label = 'Centro di costo principale',
}: {
    value: number | null;
    centers: Option[];
    onChange: (id: number | null) => void;
    disabled?: boolean;
    label?: string;
}) {
    return (
        <Select
            value={String(value ?? 'none')}
            onValueChange={(id) => onChange(id === 'none' ? null : Number(id))}
            disabled={disabled}
        >
            <SelectTrigger aria-label={label} className="w-full min-w-36">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <SelectItem value="none">Senza centro di costo</SelectItem>
                    {centers.map((center) => (
                        <SelectItem key={center.id} value={String(center.id)}>
                            {center.name}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}

export function SourcePicker({
    slug,
    year,
    type,
    value,
    onChange,
}: {
    slug: string;
    year: number;
    type: BudgetType;
    value: Option | null;
    onChange: (value: Option) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [results, setResults] = useState<Option[]>([]);
    const [last, setLast] = useState(1);
    const [loading, setLoading] = useState(false);
    const visibleLoading = useDelayedBusy(loading);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!open) return;
        let current = true;
        setLoading(true);
        setError('');
        const timer = setTimeout(() => {
            void api<{ records: Option[]; last_page: number }>(
                `/t/${slug}/budget/options?year=${year}&type=${type}&search=${encodeURIComponent(search)}&page=${page}`,
            )
                .then((data) => {
                    if (current) {
                        setResults(data.records);
                        setLast(data.last_page);
                    }
                })
                .catch((failure: unknown) => {
                    if (current)
                        setError(
                            failure instanceof Error
                                ? failure.message
                                : 'Ricerca non riuscita.',
                        );
                })
                .finally(() => {
                    if (current) setLoading(false);
                });
        }, 200);
        return () => {
            current = false;
            clearTimeout(timer);
        };
    }, [slug, year, type, search, page, open]);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-label="Sorgente esistente"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    <span className="truncate">
                        {value?.name ?? 'Cerca nell’archivio…'}
                    </span>
                    <ChevronsUpDown data-icon="inline-end" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-[360px] max-w-[90vw] p-0"
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Cerca per descrizione…"
                        value={search}
                        onValueChange={(value) => {
                            setSearch(value);
                            setPage(1);
                        }}
                    />
                    <CommandList aria-busy={loading}>
                        {visibleLoading && !results.length && (
                            <Skeleton className="m-3 h-10" />
                        )}
                        {error && (
                            <p role="alert" className="p-3 text-destructive">
                                {error}
                            </p>
                        )}
                        {!loading && !error && !results.length && (
                            <p className="p-3 text-muted-foreground">
                                Nessun risultato.
                            </p>
                        )}
                        <CommandGroup>
                            {results.map((record) => (
                                <CommandItem
                                    key={record.id}
                                    value={String(record.id)}
                                    disabled={loading || !!error}
                                    onSelect={() => {
                                        onChange(record);
                                        setOpen(false);
                                    }}
                                >
                                    {record.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
                <div className="flex items-center justify-between gap-2 p-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={loading || page <= 1}
                        onClick={() => setPage(page - 1)}
                    >
                        Precedenti
                    </Button>
                    <span className="text-xs">
                        {page} / {last}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={loading || page >= last}
                        onClick={() => setPage(page + 1)}
                    >
                        Successivi
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function BudgetEntrySheet({
    open,
    onClose,
    slug,
    budgetYear,
    entries,
    centers,
    busy,
    mutate,
}: {
    open: boolean;
    onClose: () => void;
    slug: string;
    budgetYear: { id: number; year: number };
    entries: BudgetEntry[];
    centers: Option[];
    busy: boolean;
    mutate: BudgetMutate;
}) {
    const [type, setType] = useState<BudgetType>('contract');
    const [source, setSource] = useState<Option | null>(null);
    const [center, setCenter] = useState<number | null>(null);
    const existing = entries.find(
        (entry) => entry.type === type && entry.source_id === source?.id,
    );
    return (
        <Sheet
            open={open}
            onOpenChange={(value) => {
                if (!value && !busy) onClose();
            }}
        >
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>Aggiungi voce</SheetTitle>
                    <SheetDescription>
                        Scegli cosa includere nel Budget annuale. Contratti e
                        progetti comprendono tutte le proprie spese dell’anno;
                        le spese singole devono essere autonome.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-5 px-4 pb-6">
                    <Field>
                        <FieldLabel>Tipologia</FieldLabel>
                        <Select
                            value={type}
                            onValueChange={(value) => {
                                setType(value as BudgetType);
                                setSource(null);
                            }}
                            disabled={busy}
                        >
                            <SelectTrigger aria-label="Tipologia della voce">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {budgetTypes.map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {budgetLabels[value]}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Button asChild variant="outline" disabled={busy}>
                        <Link
                            href={`/t/${slug}/expenses/create?year=${budgetYear.year}&budget_year_id=${budgetYear.id}`}
                        >
                            Crea nuova spesa
                        </Link>
                    </Button>
                    <>
                        <Field>
                            <FieldLabel>Sorgente esistente</FieldLabel>
                            <SourcePicker
                                year={budgetYear.year}
                                key={type}
                                slug={slug}
                                type={type}
                                value={source}
                                onChange={setSource}
                            />
                        </Field>
                        <Field>
                            <FieldLabel>Centro di costo principale</FieldLabel>
                            <BudgetCenterSelect
                                value={center}
                                centers={centers}
                                onChange={setCenter}
                                disabled={busy || !!existing}
                            />
                        </Field>
                        {existing && (
                            <p role="status" className="text-sm">
                                Questa voce è già presente nel Budget.
                            </p>
                        )}
                        <Button
                            disabled={busy || !source || !!existing}
                            onClick={() => {
                                void (async () => {
                                    const ok = await mutate('entries', 'POST', {
                                        entries: [
                                            {
                                                type,
                                                source_id: source?.id,
                                                cost_center_id: center,
                                            },
                                        ],
                                    });
                                    if (ok) onClose();
                                })();
                            }}
                        >
                            {busy && <Spinner />}
                            {busy ? 'Salvataggio…' : 'Aggiungi al Budget'}
                        </Button>
                    </>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export function BudgetMissingSheet({
    open,
    onClose,
    path,
    busy,
    mutate,
}: {
    open: boolean;
    onClose: () => void;
    path: string;
    busy: boolean;
    mutate: BudgetMutate;
}) {
    const [rows, setRows] = useState<BudgetSuggestion[] | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const visibleLoading = useDelayedBusy(loading);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!open) return;
        let current = true;
        setLoading(true);
        setSelected([]);
        setError('');
        void api<{ suggestions: BudgetSuggestion[] }>(`${path}/missing`)
            .then((data) => {
                if (current) setRows(data.suggestions);
            })
            .catch((failure: unknown) => {
                if (current)
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : 'Caricamento non riuscito.',
                    );
            })
            .finally(() => {
                if (current) setLoading(false);
            });
        return () => {
            current = false;
        };
    }, [path, open]);
    async function confirm() {
        const items = (rows ?? []).filter((row) => selected.includes(row.key));
        const ok = await mutate('entries/assist', 'POST', {
            entries: items.map((row) => ({
                type: row.type,
                source_id: row.source_id,
                restore: row.state === 'removed',
            })),
        });
        if (ok) onClose();
    }
    return (
        <Sheet
            open={open}
            onOpenChange={(value) => {
                if (!value && !busy) onClose();
            }}
        >
            <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
                <SheetHeader>
                    <SheetTitle>Inserisci spese mancanti</SheetTitle>
                    <SheetDescription>
                        Spese attribuite all’anno e ancora fuori dalle voci
                        incluse. La selezione è esplicita e viene salvata in
                        un’unica operazione.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-5 px-4" aria-busy={loading}>
                    {loading && rows === null ? (
                        <div className="flex min-h-44 flex-col gap-4">
                            {visibleLoading && (
                                <>
                                    <Skeleton className="h-20" />
                                    <Skeleton className="h-20" />
                                </>
                            )}
                        </div>
                    ) : error ? (
                        <p role="alert" className="text-destructive">
                            {error}
                        </p>
                    ) : !rows?.length ? (
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>Nessuna spesa mancante</EmptyTitle>
                                <EmptyDescription>
                                    Tutte le spese dell’anno sono già
                                    rappresentate.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <>
                            {rows
                                .filter((row) => row.state === 'blocked')
                                .map((row) => (
                                    <Alert key={row.key}>
                                        <AlertTitle>
                                            {row.description} · Da risolvere
                                        </AlertTitle>
                                        <AlertDescription>
                                            <p>{row.problem}</p>
                                            <p>
                                                Allocato: {money(row.allocated)}{' '}
                                                · Effettivo: {money(row.actual)}
                                            </p>
                                            <Button
                                                asChild
                                                variant="outline"
                                                size="sm"
                                            >
                                                <Link href={row.expense_url}>
                                                    Scegli come correggere
                                                </Link>
                                            </Button>
                                        </AlertDescription>
                                    </Alert>
                                ))}
                            {(['missing', 'removed'] as const).map((state) => {
                                const items = rows.filter(
                                    (row) => row.state === state,
                                );
                                if (!items.length) return null;
                                return (
                                    <section
                                        key={state}
                                        className="flex flex-col gap-2"
                                    >
                                        <h3 className="font-medium">
                                            {state === 'missing'
                                                ? 'Da includere'
                                                : 'Rimosse · ripristino esplicito'}
                                        </h3>
                                        {state === 'missing' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="self-start"
                                                onClick={() =>
                                                    setSelected((value) => [
                                                        ...new Set([
                                                            ...value,
                                                            ...items.map(
                                                                (row) =>
                                                                    row.key,
                                                            ),
                                                        ]),
                                                    ])
                                                }
                                            >
                                                Seleziona tutte le mancanti
                                            </Button>
                                        )}
                                        {items.map((row) => (
                                            <label
                                                key={row.key}
                                                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
                                            >
                                                <Checkbox
                                                    aria-label={`${state === 'removed' ? 'Ripristina' : 'Includi'} ${row.description}`}
                                                    checked={selected.includes(
                                                        row.key,
                                                    )}
                                                    disabled={busy || loading}
                                                    onCheckedChange={(
                                                        checked,
                                                    ) =>
                                                        setSelected((value) =>
                                                            checked
                                                                ? [
                                                                      ...value,
                                                                      row.key,
                                                                  ]
                                                                : value.filter(
                                                                      (key) =>
                                                                          key !==
                                                                          row.key,
                                                                  ),
                                                        )
                                                    }
                                                />
                                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                                    <span className="font-medium break-words">
                                                        {row.description}
                                                    </span>
                                                    <span>
                                                        <Badge variant="secondary">
                                                            {
                                                                budgetLabels[
                                                                    row.type
                                                                ]
                                                            }
                                                        </Badge>{' '}
                                                        ·{' '}
                                                        {row.expense_ids.length}{' '}
                                                        spese mancanti
                                                    </span>
                                                    <span className="financial-value text-sm">
                                                        Allocato:{' '}
                                                        {money(row.allocated)} ·
                                                        Effettivo:{' '}
                                                        {money(row.actual)}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                    </section>
                                );
                            })}
                        </>
                    )}
                </div>
                <SheetFooter>
                    <Button
                        disabled={busy || loading || !selected.length}
                        onClick={() => {
                            void confirm().catch((failure: unknown) =>
                                toast.error(
                                    failure instanceof Error
                                        ? failure.message
                                        : 'Operazione non riuscita.',
                                ),
                            );
                        }}
                    >
                        {busy && <Spinner />}
                        {busy
                            ? 'Salvataggio…'
                            : `Conferma selezione (${selected.length})`}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

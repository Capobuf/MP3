import { useEffect, useState } from 'react';
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
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
} from '@/components/ui/empty';
import { ChevronsUpDown } from 'lucide-react';
import { MoneyField } from './money-field';
import { api, decimalInput, money } from './helpers';
import { budgetLabels, budgetTypes } from './budget-types';
import type {
    BudgetChanges,
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

export function BudgetManualForm({
    entry,
    centers,
    disabled,
    onSave,
    highlightIncomplete = false,
}: {
    entry?: BudgetEntry;
    centers: Option[];
    disabled: boolean;
    onSave: (changes: BudgetChanges) => Promise<boolean>;
    highlightIncomplete?: boolean;
}) {
    const [description, setDescription] = useState(entry?.description ?? '');
    const [allocated, setAllocated] = useState(entry?.manual_allocated ?? '');
    const [actual, setActual] = useState(entry?.manual_actual ?? '');
    const [center, setCenter] = useState<number | null>(
        entry?.cost_center_id ?? null,
    );
    return (
        <form
            aria-busy={disabled}
            data-undo-dirty={
                description !== (entry?.description ?? '') ||
                allocated !== (entry?.manual_allocated ?? '') ||
                actual !== (entry?.manual_actual ?? '') ||
                center !== (entry?.cost_center_id ?? null)
            }
            onSubmit={(event) => {
                event.preventDefault();
                void onSave({
                    description,
                    manual_allocated: decimalInput(allocated),
                    manual_actual: decimalInput(actual),
                    cost_center_id: center,
                });
            }}
            className="flex flex-col gap-4"
        >
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                    <FieldLabel htmlFor={`description-${entry?.id ?? 'new'}`}>
                        Descrizione
                    </FieldLabel>
                    <Input
                        id={`description-${entry?.id ?? 'new'}`}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                        maxLength={255}
                        disabled={disabled}
                    />
                </Field>
                <Field
                    data-budget-incomplete={
                        highlightIncomplete && allocated.trim() === ''
                    }
                    className={cn(
                        highlightIncomplete &&
                            allocated.trim() === '' &&
                            'rounded-md bg-accent p-3 ring-1 ring-primary/40',
                    )}
                >
                    <FieldLabel htmlFor={`allocated-${entry?.id ?? 'new'}`}>
                        Previsto facoltativo
                    </FieldLabel>
                    <MoneyField
                        id={`allocated-${entry?.id ?? 'new'}`}
                        value={allocated}
                        onChange={setAllocated}
                        disabled={disabled}
                    />
                </Field>
                <Field
                    data-budget-incomplete={
                        highlightIncomplete && actual.trim() === ''
                    }
                    className={cn(
                        highlightIncomplete &&
                            actual.trim() === '' &&
                            'rounded-md bg-accent p-3 ring-1 ring-primary/40',
                    )}
                >
                    <FieldLabel htmlFor={`actual-${entry?.id ?? 'new'}`}>
                        Effettivo facoltativo
                    </FieldLabel>
                    <MoneyField
                        id={`actual-${entry?.id ?? 'new'}`}
                        value={actual}
                        onChange={setActual}
                        disabled={disabled}
                    />
                </Field>
                <Field className="sm:col-span-2">
                    <FieldLabel>Centro di costo principale</FieldLabel>
                    <BudgetCenterSelect
                        centers={centers}
                        value={center}
                        onChange={setCenter}
                        disabled={disabled}
                    />
                </Field>
            </FieldGroup>
            <p className="text-sm text-muted-foreground">
                Vuoto indica un importo da compilare. Zero è un importo
                disponibile.
            </p>
            <Button type="submit" disabled={disabled} className="self-end">
                {disabled
                    ? 'Salvataggio…'
                    : entry
                      ? 'Salva voce'
                      : 'Aggiungi voce libera'}
            </Button>
        </form>
    );
}

function SourcePicker({
    slug,
    type,
    value,
    onChange,
}: {
    slug: string;
    type: Exclude<BudgetType, 'manual'>;
    value: Option | null;
    onChange: (value: Option) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [results, setResults] = useState<Option[]>([]);
    const [last, setLast] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!open) return;
        let current = true;
        setLoading(true);
        setError('');
        const timer = setTimeout(() => {
            void api<{ records: Option[]; last_page: number }>(
                `/t/${slug}/budget/options?type=${type}&search=${encodeURIComponent(search)}&page=${page}`,
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
    }, [slug, type, search, page, open]);
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
                        {loading && <Skeleton className="m-3 h-10" />}
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
    entries,
    centers,
    busy,
    mutate,
}: {
    open: boolean;
    onClose: () => void;
    slug: string;
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
                        Scegli cosa includere nel Budget annuale.
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
                    {type === 'manual' ? (
                        <BudgetManualForm
                            centers={centers}
                            disabled={busy}
                            onSave={async (changes) => {
                                const ok = await mutate('entries', 'POST', {
                                    entries: [{ type: 'manual', ...changes }],
                                });
                                if (ok) onClose();
                                return ok;
                            }}
                        />
                    ) : (
                        <>
                            <Field>
                                <FieldLabel>Sorgente esistente</FieldLabel>
                                <SourcePicker
                                    key={type}
                                    slug={slug}
                                    type={type}
                                    value={source}
                                    onChange={setSource}
                                />
                            </Field>
                            <Field>
                                <FieldLabel>
                                    Centro di costo principale
                                </FieldLabel>
                                <BudgetCenterSelect
                                    value={center}
                                    centers={centers}
                                    onChange={setCenter}
                                    disabled={busy || !!existing}
                                />
                            </Field>
                            {existing && (
                                <p role="status" className="text-sm">
                                    {existing.included
                                        ? 'Questa voce è già inclusa nel Budget.'
                                        : 'Questa voce è esclusa. Puoi riattivarla mantenendo i suoi collegamenti.'}
                                </p>
                            )}
                            <Button
                                disabled={busy || !source || existing?.included}
                                onClick={() => {
                                    void (async () => {
                                        const ok = await mutate(
                                            'entries',
                                            'POST',
                                            {
                                                entries: [
                                                    {
                                                        type,
                                                        source_id: source?.id,
                                                        cost_center_id: center,
                                                        reactivate: !!existing,
                                                    },
                                                ],
                                            },
                                        );
                                        if (ok) onClose();
                                    })();
                                }}
                            >
                                {busy
                                    ? 'Salvataggio…'
                                    : existing
                                      ? 'Riattiva voce'
                                      : 'Aggiungi al Budget'}
                            </Button>
                        </>
                    )}
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
    const [rows, setRows] = useState<BudgetSuggestion[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
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
        const items = rows.filter((row) => selected.includes(row.key));
        const ok = await mutate('entries/assist', 'POST', {
            entries: items.map((row) => ({
                type: row.type,
                source_id: row.source_id,
                reactivate: row.state === 'excluded',
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
                    {loading ? (
                        <>
                            <Skeleton className="h-20" />
                            <Skeleton className="h-20" />
                        </>
                    ) : error ? (
                        <p role="alert" className="text-destructive">
                            {error}
                        </p>
                    ) : !rows.length ? (
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
                            {(['missing', 'excluded', 'removed'] as const).map(
                                (state) => {
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
                                                    : state === 'excluded'
                                                      ? 'Escluse · riattivazione esplicita'
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
                                                        aria-label={`${state === 'excluded' ? 'Riattiva' : state === 'removed' ? 'Ripristina' : 'Includi'} ${row.description}`}
                                                        checked={selected.includes(
                                                            row.key,
                                                        )}
                                                        disabled={busy}
                                                        onCheckedChange={(
                                                            checked,
                                                        ) =>
                                                            setSelected(
                                                                (value) =>
                                                                    checked
                                                                        ? [
                                                                              ...value,
                                                                              row.key,
                                                                          ]
                                                                        : value.filter(
                                                                              (
                                                                                  key,
                                                                              ) =>
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
                                                            {
                                                                row.expense_ids
                                                                    .length
                                                            }{' '}
                                                            spese mancanti
                                                        </span>
                                                        <span className="financial-value text-sm">
                                                            Previsto:{' '}
                                                            {money(
                                                                row.allocated,
                                                            )}{' '}
                                                            · Effettivo:{' '}
                                                            {money(row.actual)}
                                                        </span>
                                                    </span>
                                                </label>
                                            ))}
                                        </section>
                                    );
                                },
                            )}
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
                        {busy
                            ? 'Salvataggio…'
                            : `Conferma selezione (${selected.length})`}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

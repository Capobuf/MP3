import {
    Fragment,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link } from '@inertiajs/react';
import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    getGroupedRowModel,
    getExpandedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import type {
    ColumnDef,
    ColumnOrderState,
    ExpandedState,
    SortingState,
    VisibilityState,
    RowSelectionState,
} from '@tanstack/react-table';
import {
    ArrowDown,
    ArrowRight,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    CircleMinus,
    Ellipsis,
    ListFilter,
    Pencil,
    Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
    Table,
    TableHeader,
    TableHead,
    TableBody,
    TableCell,
    TableRow,
    TableFooter,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
    PopoverHeader,
    PopoverTitle,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { clearLocalUndo, recordLocalUndo } from '@/lib/undo-state';
import { BudgetCenterSelect, BudgetManualForm } from './budget-entry-sheet';
import { BudgetColumnOrder } from './budget-column-order';
import { draftLines, ExpenseLines } from './expense-lines';
import { decimalInput, dateLabel, money, varianceTextClass } from './helpers';
import { budgetLabels, budgetTypes, budgetTotals } from './budget-types';
import type {
    BudgetEntry,
    BudgetMutate,
    BudgetSnapshot,
    BudgetType,
} from './budget-types';
import type { Option } from './types';

const columnNames: Record<string, string> = {
    select: 'Selezione',
    expand: 'Espansione',
    description: 'Descrizione',
    type: 'Tipo',
    vendor: 'Fornitore',
    center: 'Centro di costo',
    allocated: 'Previsto',
    actual: 'Effettivo',
    variance: 'Scostamento',
    actions: 'Azioni',
};
const defaultOrder = Object.keys(columnNames);
function missingAmounts(allocated: string | null, actual: string | null) {
    return [
        allocated === null ? 'previsto' : null,
        actual === null ? 'effettivo' : null,
    ]
        .filter((amount) => amount !== null)
        .join(' e ');
}

function focusCompletion(id: number) {
    const detail = document.getElementById(`budget-detail-${id}`);
    const target =
        detail?.querySelector<HTMLElement>(
            '[data-budget-incomplete="true"] input, button[data-budget-incomplete="true"]',
        ) ??
        detail?.querySelector<HTMLElement>('[data-budget-incomplete="true"]') ??
        detail;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
    });
}
type Preferences = {
    visibility: VisibilityState;
    order: ColumnOrderState;
    group: 'type' | 'center';
};
function readPreferences(key: string): Preferences {
    const defaults: Preferences = {
        visibility: {},
        order: defaultOrder,
        group: 'type',
    };
    try {
        const saved = JSON.parse(
            localStorage.getItem(key) ?? 'null',
        ) as Partial<Preferences> | null;
        if (!saved) return defaults;
        return {
            visibility: {
                ...saved.visibility,
                select: true,
                expand: true,
                description: true,
                actions: true,
            },
            order: [
                ...new Set([
                    ...(saved.order ?? []).filter((id) =>
                        defaultOrder.includes(id),
                    ),
                    ...defaultOrder,
                ]),
            ],
            group: saved.group === 'center' ? 'center' : 'type',
        };
    } catch {
        return defaults;
    }
}

function InlineAmount({
    value,
    label,
    disabled,
    onSave,
}: {
    value: string | null;
    label: string;
    disabled: boolean;
    onSave: (value: string | null) => Promise<boolean>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const submitting = useRef(false);
    async function save() {
        if (submitting.current) return;
        submitting.current = true;
        setSaving(true);
        const ok = await onSave(decimalInput(draft));
        setSaving(false);
        submitting.current = false;
        setInvalid(!ok);
        if (ok) setEditing(false);
    }
    return editing ? (
        <Input
            autoFocus
            aria-label={label}
            aria-invalid={invalid}
            inputMode="decimal"
            value={draft}
            disabled={saving}
            className="w-36 text-right financial-value"
            onChange={(event) => {
                setDraft(event.target.value);
                setInvalid(false);
            }}
            onBlur={() => {
                if (!submitting.current) void save();
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    void save();
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    submitting.current = true;
                    setEditing(false);
                }
            }}
        />
    ) : (
        <Button
            variant="ghost"
            size="sm"
            className="h-auto min-h-8 w-full justify-end financial-value"
            aria-label={label}
            disabled={disabled}
            onClick={() => {
                submitting.current = false;
                setDraft(value ?? '');
                setEditing(true);
            }}
        >
            {money(value)}
        </Button>
    );
}

function FilterSelect({
    value,
    onChange,
    label,
    options,
}: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    options: { value: string; label: string }[];
}) {
    const id = useId();
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger id={id} aria-label={label} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </Field>
    );
}

function EntryDetail({
    entry,
    slug,
    year,
    centers,
    busy,
    mutate,
    onExpenseEdit,
    highlightIncomplete,
}: {
    entry: BudgetEntry;
    slug: string;
    year: number;
    centers: Option[];
    busy: boolean;
    mutate: BudgetMutate;
    onExpenseEdit: (id: number) => void;
    highlightIncomplete: boolean;
}) {
    if (entry.type === 'manual')
        return (
            <BudgetManualForm
                key={`${entry.id}:${entry.description}:${entry.manual_allocated}:${entry.manual_actual}:${entry.cost_center_id}`}
                entry={entry}
                centers={centers}
                disabled={busy}
                highlightIncomplete={highlightIncomplete}
                onSave={(changes) =>
                    mutate('entries', 'PATCH', {
                        action: 'update',
                        ids: [entry.id],
                        changes,
                    })
                }
            />
        );
    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-medium">
                        {entry.description} · {year}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {entry.vendor ? (
                            <Link
                                className="text-foreground"
                                href={`/t/${slug}/vendors/${entry.vendor.id}`}
                            >
                                {entry.vendor.name}
                            </Link>
                        ) : (
                            'Senza fornitore'
                        )}{' '}
                        · {entry.cost_center?.name ?? 'Senza centro di costo'}
                        {entry.starts_on &&
                            ` · ${dateLabel(entry.starts_on)} – ${dateLabel(entry.ends_on)}`}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {entry.type === 'expense' && entry.source_id && (
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Modifica spesa ${entry.description}`}
                            title="Modifica spesa"
                            disabled={busy}
                            onClick={() => onExpenseEdit(entry.source_id!)}
                        >
                            <Pencil />
                        </Button>
                    )}
                    <Button variant="outline" size="sm" asChild>
                        <Link
                            href={`/t/${slug}/${entry.type}s/${entry.source_id}`}
                        >
                            Apri nell’archivio
                        </Link>
                    </Button>
                </div>
            </div>
            {entry.notes && (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {entry.notes}
                </p>
            )}
            {!entry.expenses.length ? (
                <Alert
                    tabIndex={-1}
                    data-budget-incomplete={highlightIncomplete}
                    className={cn(
                        highlightIncomplete && 'ring-1 ring-primary/40',
                    )}
                >
                    <AlertTitle>Nessun importo per il {year}</AlertTitle>
                    <AlertDescription>
                        <p>
                            {entry.type === 'expense'
                                ? `Verifica l’anno di imputazione e gli importi della spesa.`
                                : `Collega una spesa con importi previsti o effettivi imputati al ${year}.`}
                        </p>
                        {entry.type === 'expense' && entry.source_id ? (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => onExpenseEdit(entry.source_id!)}
                            >
                                Completa spesa
                            </Button>
                        ) : (
                            <Button variant="outline" size="sm" asChild>
                                <Link
                                    href={
                                        entry.type === 'contract'
                                            ? `/t/${slug}/expenses/create?contract_id=${entry.source_id}&year=${year}`
                                            : `/t/${slug}/projects/${entry.source_id}`
                                    }
                                >
                                    {entry.type === 'contract'
                                        ? 'Aggiungi spesa al contratto'
                                        : 'Apri progetto'}
                                </Link>
                            </Button>
                        )}
                    </AlertDescription>
                </Alert>
            ) : entry.type === 'expense' ? (
                <>
                    {entry.incomplete > 0 && (
                        <Alert
                            tabIndex={-1}
                            data-budget-incomplete={highlightIncomplete}
                            className={cn(
                                highlightIncomplete && 'ring-1 ring-primary/40',
                            )}
                        >
                            <AlertTitle>
                                Importi da completare · {year}
                            </AlertTitle>
                            <AlertDescription>
                                <p>
                                    Inserisci l’importo{' '}
                                    {missingAmounts(
                                        entry.expenses[0].allocated_amount ??
                                            null,
                                        entry.expenses[0].actual_amount ?? null,
                                    )}{' '}
                                    della spesa per il {year}.
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() =>
                                        onExpenseEdit(entry.expenses[0].id)
                                    }
                                >
                                    Completa importi
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}
                    <ExpenseLines
                        readOnly
                        showSummary={false}
                        showHeading={false}
                        contractMode={!!entry.expenses[0].contract_id}
                        lines={draftLines(entry.expenses[0])}
                    />
                </>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Spesa</TableHead>
                            <TableHead>Periodo coperto</TableHead>
                            <TableHead>Attribuzione</TableHead>
                            <TableHead className="text-right">
                                Previsto
                            </TableHead>
                            <TableHead className="text-right">
                                Effettivo
                            </TableHead>
                            <TableHead>Azioni</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {entry.expenses.map((expense) => (
                            <TableRow
                                key={expense.id}
                                className={cn(
                                    !expense.contributes &&
                                        'text-muted-foreground',
                                )}
                            >
                                <TableCell className="min-w-56 whitespace-normal">
                                    <Link
                                        className="font-medium text-foreground"
                                        href={`/t/${slug}/expenses/${expense.id}`}
                                    >
                                        {expense.title}
                                    </Link>
                                </TableCell>
                                <TableCell>
                                    {dateLabel(expense.period_starts_on)} –{' '}
                                    {dateLabel(expense.period_ends_on)}
                                </TableCell>
                                <TableCell className="max-w-60 whitespace-normal">
                                    <Badge
                                        variant={
                                            expense.contributes
                                                ? 'secondary'
                                                : 'outline'
                                        }
                                    >
                                        {expense.contributes
                                            ? 'Nel subtotale'
                                            : expense.counted_in
                                              ? `Già in ${expense.counted_in}`
                                              : 'Fuori dal totale'}
                                    </Badge>
                                </TableCell>
                                {(
                                    [
                                        'allocated_amount',
                                        'actual_amount',
                                    ] as const
                                ).map((field) => {
                                    const missing =
                                        expense.contributes &&
                                        expense[field] == null;
                                    return (
                                        <TableCell
                                            key={field}
                                            className={cn(
                                                'text-right financial-value',
                                                highlightIncomplete &&
                                                    missing &&
                                                    'bg-accent ring-1 ring-primary/40 ring-inset',
                                            )}
                                        >
                                            {missing ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={busy}
                                                    data-budget-incomplete={
                                                        highlightIncomplete
                                                    }
                                                    aria-label={`Completa ${field === 'allocated_amount' ? 'previsto' : 'effettivo'} di ${expense.title}`}
                                                    onClick={() =>
                                                        onExpenseEdit(
                                                            expense.id,
                                                        )
                                                    }
                                                >
                                                    Da inserire
                                                </Button>
                                            ) : (
                                                money(expense[field])
                                            )}
                                        </TableCell>
                                    );
                                })}
                                <TableCell>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Modifica spesa ${expense.title}`}
                                        title="Modifica spesa"
                                        disabled={busy}
                                        onClick={() =>
                                            onExpenseEdit(expense.id)
                                        }
                                    >
                                        <Pencil />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow>
                            <TableCell colSpan={3}>
                                Subtotale attribuito
                                {!entry.included && ' · voce esclusa'}
                            </TableCell>
                            <TableCell className="text-right financial-value">
                                {money(entry.allocated)}
                            </TableCell>
                            <TableCell className="text-right financial-value">
                                {money(entry.actual)}
                            </TableCell>
                            <TableCell />
                        </TableRow>
                    </TableFooter>
                </Table>
            )}
        </div>
    );
}

export function BudgetTable({
    budget,
    slug,
    year,
    centers,
    busy,
    loading,
    mutate,
    onAdd,
    onMissing,
    onExpenseEdit,
    typeFilter,
    setTypeFilter,
}: {
    budget: BudgetSnapshot;
    slug: string;
    year: number;
    centers: Option[];
    busy: boolean;
    loading: boolean;
    mutate: BudgetMutate;
    onAdd: () => void;
    onMissing: () => void;
    onExpenseEdit: (id: number) => void;
    typeFilter: string;
    setTypeFilter: (value: string) => void;
}) {
    'use no memo'; // TanStack v8 exposes a mutable table instance to the renderer.
    const key = `mp3:budget:grid:v1:${slug}`;
    const [preferences, setPreferences] = useState(() => readPreferences(key));
    const [sorting, setSorting] = useState<SortingState>([]);
    const [selection, setSelection] = useState<RowSelectionState>({});
    const [expanded, setExpanded] = useState<ExpandedState>(true);
    const [details, setDetails] = useState<number[]>([]);
    const [completionTarget, setCompletionTarget] = useState<{
        id: number;
    } | null>(null);
    const [search, setSearch] = useState('');
    const [vendor, setVendor] = useState('all');
    const [center, setCenter] = useState('all');
    const [status, setStatus] = useState('included');
    const [removing, setRemoving] = useState<number[]>([]);
    const [excluding, setExcluding] = useState<{
        ids: number[];
        step: 1 | 2;
    } | null>(null);
    useEffect(() => () => clearLocalUndo(`/t/${slug}`), [slug]);
    function changePreferences(next: Preferences) {
        if (JSON.stringify(next) === JSON.stringify(preferences)) return;
        const previous = preferences;
        setPreferences(next);
        recordLocalUndo({
            scope: `/t/${slug}`,
            label: 'Configurazione colonne',
            undo: () => setPreferences(previous),
            redo: () => setPreferences(next),
        });
    }
    useEffect(() => {
        if (completionTarget !== null) focusCompletion(completionTarget.id);
    }, [completionTarget]);
    const openCompletion = useCallback((id: number) => {
        setDetails((current) =>
            current.includes(id) ? current : [...current, id],
        );
        setCompletionTarget({ id });
    }, []);
    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(preferences));
        } catch {
            /* Grid remains usable when browser storage is unavailable. */
        }
    }, [key, preferences]);
    const batch = useCallback(
        (action: string, ids: number[]) =>
            mutate('entries', 'PATCH', { action, ids }),
        [mutate],
    );
    const toggleDetail = useCallback(
        (id: number) =>
            setDetails((current) =>
                current.includes(id)
                    ? current.filter((value) => value !== id)
                    : [...current, id],
            ),
        [],
    );
    const columns = useMemo<ColumnDef<BudgetEntry>[]>(
        () => [
            {
                id: 'select',
                enableHiding: false,
                header: ({ table }) => (
                    <Checkbox
                        aria-label="Seleziona tutte le voci filtrate"
                        checked={
                            table.getIsAllRowsSelected()
                                ? true
                                : table.getIsSomeRowsSelected()
                                  ? 'indeterminate'
                                  : false
                        }
                        onCheckedChange={(value) =>
                            table.toggleAllRowsSelected(value === true)
                        }
                        disabled={busy}
                    />
                ),
                cell: ({ row }) => (
                    <Checkbox
                        aria-label={`Seleziona ${row.original.description}`}
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) =>
                            row.toggleSelected(value === true)
                        }
                        disabled={busy}
                    />
                ),
            },
            {
                id: 'expand',
                header: () => <span className="sr-only">Dettagli</span>,
                enableHiding: false,
                cell: ({ row }) => (
                    <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Dettaglio ${row.original.description}`}
                        aria-expanded={details.includes(row.original.id)}
                        onClick={() => toggleDetail(row.original.id)}
                    >
                        {details.includes(row.original.id) ? (
                            <ChevronDown />
                        ) : (
                            <ChevronRight />
                        )}
                    </Button>
                ),
            },
            {
                accessorKey: 'description',
                header: 'Descrizione',
                enableHiding: false,
                cell: ({ row }) => (
                    <div className="max-w-96 min-w-52 whitespace-normal">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto min-h-8 max-w-full justify-start text-left whitespace-normal"
                            onClick={() => toggleDetail(row.original.id)}
                        >
                            {row.original.description}
                        </Button>
                        {!row.original.included && (
                            <Badge variant="outline">Esclusa</Badge>
                        )}
                        {row.original.incomplete > 0 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge asChild>
                                        <button
                                            type="button"
                                            className="cursor-pointer"
                                            aria-label={`Da completare: ${row.original.description}`}
                                            aria-controls={`budget-detail-${row.original.id}`}
                                            aria-expanded={details.includes(
                                                row.original.id,
                                            )}
                                            onClick={() =>
                                                openCompletion(row.original.id)
                                            }
                                        >
                                            Da completare
                                            <ArrowRight />
                                        </button>
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                    Mostra gli importi o le spese da completare
                                    per il {year}.
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                ),
            },
            {
                accessorKey: 'type',
                header: 'Tipo',
                cell: ({ row }) => (
                    <Badge variant="secondary">
                        {budgetLabels[row.original.type]}
                    </Badge>
                ),
            },
            {
                id: 'vendor',
                accessorFn: (row) => row.vendor?.name ?? 'Senza fornitore',
                header: 'Fornitore',
                cell: ({ row }) =>
                    row.original.vendor ? (
                        <Link
                            href={`/t/${slug}/vendors/${row.original.vendor.id}`}
                            className="text-foreground"
                        >
                            {row.original.vendor.name}
                        </Link>
                    ) : (
                        'Senza fornitore'
                    ),
            },
            {
                id: 'center',
                accessorFn: (row) => String(row.cost_center_id ?? 'none'),
                sortingFn: (a, b) =>
                    (
                        a.original.cost_center?.name ?? 'Senza centro di costo'
                    ).localeCompare(
                        b.original.cost_center?.name ?? 'Senza centro di costo',
                        'it',
                    ),
                header: 'Centro di costo',
                cell: ({ row }) => (
                    <BudgetCenterSelect
                        centers={centers}
                        value={row.original.cost_center_id}
                        disabled={busy}
                        label={`Centro di costo di ${row.original.description}`}
                        onChange={(id) => {
                            void mutate('entries', 'PATCH', {
                                action: 'update',
                                ids: [row.original.id],
                                changes: { cost_center_id: id },
                            });
                        }}
                    />
                ),
            },
            ...(['allocated', 'actual'] as const).map(
                (field): ColumnDef<BudgetEntry> => ({
                    id: field,
                    accessorFn: (row) =>
                        row[field] === null ? undefined : Number(row[field]),
                    sortUndefined: 'last',
                    aggregationFn: (_column, rows) =>
                        Number(
                            budgetTotals(rows.map((row) => row.original))[
                                field
                            ],
                        ),
                    header: columnNames[field],
                    cell: ({ row }) =>
                        row.original.type === 'manual' ? (
                            <InlineAmount
                                value={row.original[field]}
                                disabled={busy}
                                label={`Modifica ${columnNames[field]} di ${row.original.description}`}
                                onSave={(value) =>
                                    mutate('entries', 'PATCH', {
                                        action: 'update',
                                        ids: [row.original.id],
                                        changes: {
                                            [field === 'allocated'
                                                ? 'manual_allocated'
                                                : 'manual_actual']: value,
                                        },
                                    })
                                }
                            />
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto min-h-8 w-full justify-end financial-value"
                                disabled={busy}
                                aria-label={`Dettaglio ${columnNames[field]} di ${row.original.description}`}
                                onClick={() => {
                                    if (
                                        row.original.type === 'expense' &&
                                        row.original.source_id
                                    )
                                        onExpenseEdit(row.original.source_id);
                                    else toggleDetail(row.original.id);
                                }}
                            >
                                {money(row.original[field])}
                            </Button>
                        ),
                }),
            ),
            {
                id: 'variance',
                accessorFn: (row) =>
                    row.variance === null ? undefined : Number(row.variance),
                sortUndefined: 'last',
                header: 'Scostamento',
                aggregationFn: (_column, rows) =>
                    Number(
                        budgetTotals(rows.map((row) => row.original)).variance,
                    ),
                cell: ({ row }) => (
                    <span
                        className={cn(
                            'financial-value',
                            varianceTextClass(row.original.variance),
                        )}
                    >
                        {row.original.variance === null
                            ? 'Non confrontabile'
                            : money(row.original.variance)}
                    </span>
                ),
            },
            {
                id: 'actions',
                header: () => <span className="sr-only">Azioni</span>,
                enableHiding: false,
                cell: ({ row }) => {
                    const entry = row.original;
                    const ordered = [...budget.entries].sort(
                        (a, b) => a.position - b.position || a.id - b.id,
                    );
                    const index = ordered.findIndex(
                        (value) => value.id === entry.id,
                    );
                    const sameGroup = (value: BudgetEntry) =>
                        preferences.group === 'type'
                            ? value.type === entry.type
                            : value.cost_center_id === entry.cost_center_id;
                    const previous = ordered
                        .slice(0, index)
                        .findLastIndex(sameGroup);
                    const nextOffset = ordered
                        .slice(index + 1)
                        .findIndex(sameGroup);
                    const next = nextOffset < 0 ? -1 : index + 1 + nextOffset;
                    const move = (target: number) => {
                        const ids = ordered.map((value) => value.id);
                        [ids[index], ids[target]] = [ids[target], ids[index]];
                        void batch('reorder', ids);
                    };
                    return (
                        <div className="flex items-center gap-1">
                            {(entry.type === 'manual' ||
                                entry.type === 'expense') && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={busy}
                                    aria-label={`Modifica ${entry.description}`}
                                    title="Modifica"
                                    onClick={() => {
                                        if (entry.type === 'expense') {
                                            onExpenseEdit(entry.source_id!);
                                        } else if (
                                            !details.includes(entry.id)
                                        ) {
                                            toggleDetail(entry.id);
                                        }
                                    }}
                                >
                                    <Pencil />
                                </Button>
                            )}
                            {entry.included && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    disabled={busy}
                                    aria-label={`Escludi dal Budget ${entry.description}`}
                                    title="Escludi dal Budget"
                                    onClick={() =>
                                        setExcluding({
                                            ids: [entry.id],
                                            step: 1,
                                        })
                                    }
                                >
                                    <CircleMinus />
                                </Button>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={busy}
                                        aria-label={`Azioni per ${entry.description}`}
                                    >
                                        <Ellipsis />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            onSelect={() =>
                                                toggleDetail(entry.id)
                                            }
                                        >
                                            Apri dettaglio
                                        </DropdownMenuItem>
                                        {entry.type !== 'manual' && (
                                            <DropdownMenuItem asChild>
                                                <Link
                                                    href={`/t/${slug}/${entry.type}s/${entry.source_id}`}
                                                >
                                                    Apri sorgente
                                                </Link>
                                            </DropdownMenuItem>
                                        )}
                                        {!entry.included && (
                                            <DropdownMenuItem
                                                onSelect={() => {
                                                    void batch('reactivate', [
                                                        entry.id,
                                                    ]);
                                                }}
                                            >
                                                Riattiva
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem
                                            disabled={
                                                previous < 0 ||
                                                sorting.length > 0
                                            }
                                            onSelect={() => move(previous)}
                                        >
                                            Sposta voce in alto
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            disabled={
                                                next < 0 || sorting.length > 0
                                            }
                                            onSelect={() => move(next)}
                                        >
                                            Sposta voce in basso
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            variant="destructive"
                                            onSelect={() =>
                                                setRemoving([entry.id])
                                            }
                                        >
                                            Rimuovi dal Budget
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                },
            },
        ],
        [
            budget.entries,
            busy,
            centers,
            details,
            mutate,
            onExpenseEdit,
            slug,
            sorting.length,
            preferences.group,
            batch,
            toggleDetail,
            openCompletion,
            year,
        ],
    );
    const filtered = useMemo(
        () =>
            budget.entries.filter(
                (row) =>
                    (typeFilter === 'all' || row.type === typeFilter) &&
                    (vendor === 'all' ||
                        String(row.vendor?.id ?? 'none') === vendor) &&
                    (center === 'all' ||
                        String(row.cost_center_id ?? 'none') === center) &&
                    (status === 'all' ||
                        row.included === (status === 'included')),
            ),
        [budget.entries, typeFilter, vendor, center, status],
    );
    const data = useMemo(
        () =>
            [...filtered].sort(
                (a, b) =>
                    (preferences.group === 'type'
                        ? budgetTypes.indexOf(a.type) -
                          budgetTypes.indexOf(b.type)
                        : (
                              a.cost_center?.name ?? 'Senza centro di costo'
                          ).localeCompare(
                              b.cost_center?.name ?? 'Senza centro di costo',
                              'it',
                          )) ||
                    a.position - b.position ||
                    a.id - b.id,
            ),
        [filtered, preferences.group],
    );
    const grouping = useMemo(() => [preferences.group], [preferences.group]);
    const table = useReactTable({
        data,
        columns,
        getRowId: (row) => String(row.id),
        groupedColumnMode: false,
        autoResetExpanded: false,
        autoResetPageIndex: false,
        state: {
            sorting,
            rowSelection: selection,
            expanded,
            globalFilter: search,
            grouping,
            columnVisibility: preferences.visibility,
            columnOrder: preferences.order,
        },
        onSortingChange: setSorting,
        onRowSelectionChange: setSelection,
        onExpandedChange: setExpanded,
        onGlobalFilterChange: setSearch,
        onColumnVisibilityChange: (value) =>
            changePreferences({
                ...preferences,
                visibility:
                    typeof value === 'function'
                        ? value(preferences.visibility)
                        : value,
            }),
        onColumnOrderChange: (value) =>
            changePreferences({
                ...preferences,
                order:
                    typeof value === 'function'
                        ? value(preferences.order)
                        : value,
            }),
        enableRowSelection: (row) => !row.getIsGrouped(),
        globalFilterFn: (row, _column, value: string) =>
            [
                row.original.description,
                row.original.vendor?.name,
                row.original.cost_center?.name,
                budgetLabels[row.original.type],
            ].some((text) =>
                text
                    ?.toLocaleLowerCase('it')
                    .includes(value.toLocaleLowerCase('it')),
            ),
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getGroupedRowModel: getGroupedRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
    });
    const selected = budget.entries
        .filter((entry) => selection[String(entry.id)])
        .map((entry) => entry.id);
    const visibleColumns = table.getVisibleLeafColumns();
    const filteredTotals = budgetTotals(
        table.getFilteredRowModel().flatRows.map((row) => row.original),
    );
    const activeFilterCount = [
        !!search,
        typeFilter !== 'all',
        vendor !== 'all',
        center !== 'all',
        status !== 'included',
    ].filter(Boolean).length;
    const hasFilters = activeFilterCount > 0;
    const vendors = [
        ...new Map(
            budget.entries
                .filter((row) => row.vendor)
                .map((row) => [row.vendor!.id, row.vendor!]),
        ).values(),
    ];
    function footer(label: string, totals: typeof budget.totals) {
        return (
            <TableRow>
                {visibleColumns.map((column) => (
                    <TableCell
                        key={column.id}
                        className={cn(
                            ['allocated', 'actual', 'variance'].includes(
                                column.id,
                            ) && 'text-right financial-value',
                            column.id === 'variance' &&
                                varianceTextClass(totals.variance),
                        )}
                    >
                        {column.id === 'description' ? (
                            <span className="whitespace-normal">
                                {label}
                                <span className="block text-xs text-muted-foreground">
                                    {totals.count} voci incluse
                                    {(!table
                                        .getColumn('allocated')
                                        ?.getIsVisible() ||
                                        !table
                                            .getColumn('actual')
                                            ?.getIsVisible()) &&
                                        ` · Previsto ${money(totals.allocated)} · Effettivo ${money(totals.actual)}`}
                                </span>
                            </span>
                        ) : ['allocated', 'actual', 'variance'].includes(
                              column.id,
                          ) ? (
                            money(
                                totals[
                                    column.id as
                                        | 'allocated'
                                        | 'actual'
                                        | 'variance'
                                ],
                            )
                        ) : null}
                    </TableCell>
                ))}
            </TableRow>
        );
    }
    const columnSettings = (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Colonne"
                    title="Colonne"
                >
                    <Settings2 />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
            >
                <div className="flex flex-col gap-2">
                    <PopoverHeader>
                        <PopoverTitle>Configurazione colonne</PopoverTitle>
                    </PopoverHeader>
                    <BudgetColumnOrder
                        columns={preferences.order.map((id) => ({
                            id,
                            label: columnNames[id],
                            visible:
                                table.getColumn(id)?.getIsVisible() ?? false,
                            canHide: table.getColumn(id)?.getCanHide() ?? false,
                        }))}
                        onVisibilityChange={(id, visible) =>
                            table.getColumn(id)?.toggleVisibility(visible)
                        }
                        onOrderChange={(ids) => table.setColumnOrder(ids)}
                    />
                    <FilterSelect
                        label="Raggruppamento"
                        value={preferences.group}
                        onChange={(group) => {
                            changePreferences({
                                ...preferences,
                                group: group as Preferences['group'],
                            });
                            setExpanded(true);
                        }}
                        options={[
                            {
                                value: 'type',
                                label: 'Gruppi per tipologia',
                            },
                            {
                                value: 'center',
                                label: 'Gruppi per centro',
                            },
                        ]}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            changePreferences({
                                order: defaultOrder,
                                visibility: {},
                                group: 'type',
                            });
                            setSorting([]);
                            setExpanded(true);
                        }}
                    >
                        Ripristina configurazione
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
    return (
        <section
            className="flex min-w-0 flex-col gap-4"
            aria-label="Voci del Budget"
            aria-busy={busy || loading}
        >
            <div className="flex flex-wrap items-center gap-2">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline">
                            <ListFilter data-icon="inline-start" />
                            Filtri
                            {hasFilters && (
                                <Badge variant="secondary">
                                    {activeFilterCount}
                                </Badge>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
                    >
                        <FieldGroup className="gap-4">
                            <PopoverHeader>
                                <PopoverTitle>Filtri del Budget</PopoverTitle>
                            </PopoverHeader>
                            <Field>
                                <FieldLabel htmlFor="budget-search">
                                    Ricerca
                                </FieldLabel>
                                <InputGroup>
                                    <InputGroupInput
                                        id="budget-search"
                                        aria-label="Cerca nelle voci del Budget"
                                        placeholder="Cerca nelle voci…"
                                        value={search}
                                        onChange={(event) =>
                                            setSearch(event.target.value)
                                        }
                                    />
                                </InputGroup>
                            </Field>
                            <FilterSelect
                                label="Filtra per tipo"
                                value={typeFilter}
                                onChange={setTypeFilter}
                                options={[
                                    {
                                        value: 'all',
                                        label: 'Tutte le tipologie',
                                    },
                                    ...budgetTypes.map((type) => ({
                                        value: type,
                                        label: budgetLabels[type],
                                    })),
                                ]}
                            />
                            <FilterSelect
                                label="Filtra per fornitore"
                                value={vendor}
                                onChange={setVendor}
                                options={[
                                    {
                                        value: 'all',
                                        label: 'Tutti i fornitori',
                                    },
                                    { value: 'none', label: 'Senza fornitore' },
                                    ...vendors.map((v) => ({
                                        value: String(v.id),
                                        label: v.name,
                                    })),
                                ]}
                            />
                            <FilterSelect
                                label="Filtra per centro di costo"
                                value={center}
                                onChange={setCenter}
                                options={[
                                    { value: 'all', label: 'Tutti i centri' },
                                    {
                                        value: 'none',
                                        label: 'Senza centro di costo',
                                    },
                                    ...centers.map((c) => ({
                                        value: String(c.id),
                                        label: c.name,
                                    })),
                                ]}
                            />
                            <FilterSelect
                                label="Inclusione nel Budget"
                                value={status}
                                onChange={setStatus}
                                options={[
                                    {
                                        value: 'included',
                                        label: 'Voci incluse',
                                    },
                                    {
                                        value: 'excluded',
                                        label: 'Voci escluse',
                                    },
                                    {
                                        value: 'all',
                                        label: 'Incluse ed escluse',
                                    },
                                ]}
                            />
                            {hasFilters && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setSearch('');
                                        setTypeFilter('all');
                                        setVendor('all');
                                        setCenter('all');
                                        setStatus('included');
                                    }}
                                >
                                    Azzera filtri
                                </Button>
                            )}
                        </FieldGroup>
                    </PopoverContent>
                </Popover>
                <Button onClick={onAdd} disabled={busy}>
                    Aggiungi voce
                </Button>
                <Button variant="outline" onClick={onMissing} disabled={busy}>
                    Inserisci spese mancanti
                </Button>
                {sorting.length > 0 && (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSorting([])}
                    >
                        Ripristina ordine manuale
                    </Button>
                )}
            </div>
            {selected.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span role="status">
                        {selected.length} voci selezionate
                    </span>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy}
                        aria-label="Escludi dal Budget le voci selezionate"
                        title="Escludi dal Budget le voci selezionate"
                        onClick={() => setExcluding({ ids: selected, step: 1 })}
                    >
                        <CircleMinus />
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                            void batch('reactivate', selected).then((ok) => {
                                if (ok) setSelection({});
                            });
                        }}
                    >
                        Riattiva
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setRemoving(selected)}
                    >
                        Rimuovi
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelection({})}
                    >
                        Deseleziona
                    </Button>
                </div>
            )}
            {(busy || loading) && (
                <p role="status" className="sr-only">
                    {loading ? 'Aggiornamento…' : 'Salvataggio…'}
                </p>
            )}
            <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((group) => (
                            <TableRow key={group.id}>
                                {group.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        aria-sort={
                                            header.column.getIsSorted() ===
                                            'asc'
                                                ? 'ascending'
                                                : header.column.getIsSorted() ===
                                                    'desc'
                                                  ? 'descending'
                                                  : undefined
                                        }
                                        className={cn(
                                            [
                                                'allocated',
                                                'actual',
                                                'variance',
                                            ].includes(header.column.id) &&
                                                'text-right',
                                        )}
                                    >
                                        {header.column.id === 'expand' ? (
                                            columnSettings
                                        ) : header.column.getCanSort() ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={header.column.getToggleSortingHandler()}
                                            >
                                                {flexRender(
                                                    header.column.columnDef
                                                        .header,
                                                    header.getContext(),
                                                )}
                                                {header.column.getIsSorted() ===
                                                'asc' ? (
                                                    <ArrowUp data-icon="inline-end" />
                                                ) : header.column.getIsSorted() ===
                                                  'desc' ? (
                                                    <ArrowDown data-icon="inline-end" />
                                                ) : null}
                                            </Button>
                                        ) : (
                                            flexRender(
                                                header.column.columnDef.header,
                                                header.getContext(),
                                            )
                                        )}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {loading && !budget.entries.length ? (
                            <TableRow>
                                <TableCell colSpan={visibleColumns.length}>
                                    <Skeleton className="h-24" />
                                </TableCell>
                            </TableRow>
                        ) : !table.getRowModel().rows.length ? (
                            <TableRow>
                                <TableCell colSpan={visibleColumns.length}>
                                    <Empty>
                                        <EmptyHeader>
                                            <EmptyTitle>
                                                {budget.entries.length
                                                    ? 'Nessuna voce corrisponde ai filtri'
                                                    : 'Un anno da costruire'}
                                            </EmptyTitle>
                                            <EmptyDescription>
                                                Aggiungi contratti, progetti,
                                                spese o voci libere al Budget.
                                            </EmptyDescription>
                                        </EmptyHeader>
                                    </Empty>
                                </TableCell>
                            </TableRow>
                        ) : (
                            table.getRowModel().rows.map((row) => {
                                if (row.getIsGrouped()) {
                                    const value = String(
                                        row.getGroupingValue(preferences.group),
                                    );
                                    const title =
                                        preferences.group === 'type'
                                            ? budgetLabels[value as BudgetType]
                                            : (centers.find(
                                                  (c) => String(c.id) === value,
                                              )?.name ??
                                              'Senza centro di costo');
                                    const totals = budgetTotals(
                                        row
                                            .getLeafRows()
                                            .map((leaf) => leaf.original),
                                    );
                                    return (
                                        <TableRow
                                            key={row.id}
                                            className="bg-muted/50"
                                        >
                                            <TableCell
                                                colSpan={visibleColumns.length}
                                                className="whitespace-normal"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-auto min-h-9 max-w-full text-left whitespace-normal"
                                                        aria-label={`${row.getIsExpanded() ? 'Comprimi' : 'Espandi'} ${title}`}
                                                        aria-expanded={row.getIsExpanded()}
                                                        onClick={row.getToggleExpandedHandler()}
                                                    >
                                                        {row.getIsExpanded() ? (
                                                            <ChevronDown />
                                                        ) : (
                                                            <ChevronRight />
                                                        )}
                                                        <span className="font-medium">
                                                            {title} ·{' '}
                                                            {row.subRows.length}
                                                        </span>
                                                    </Button>
                                                    <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                                                        {(
                                                            [
                                                                'allocated',
                                                                'actual',
                                                                'variance',
                                                            ] as const
                                                        )
                                                            .filter((id) =>
                                                                table
                                                                    .getColumn(
                                                                        id,
                                                                    )
                                                                    ?.getIsVisible(),
                                                            )
                                                            .map((id) => (
                                                                <div
                                                                    key={id}
                                                                    className="flex items-baseline gap-2"
                                                                >
                                                                    <dt className="text-xs text-muted-foreground">
                                                                        {
                                                                            columnNames[
                                                                                id
                                                                            ]
                                                                        }
                                                                    </dt>
                                                                    <dd className="financial-value">
                                                                        {money(
                                                                            totals[
                                                                                id
                                                                            ],
                                                                        )}
                                                                    </dd>
                                                                </div>
                                                            ))}
                                                    </dl>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                }
                                return (
                                    <Fragment key={row.id}>
                                        <TableRow
                                            data-state={
                                                row.getIsSelected()
                                                    ? 'selected'
                                                    : undefined
                                            }
                                            className={cn(
                                                !row.original.included &&
                                                    'text-muted-foreground',
                                            )}
                                        >
                                            {row
                                                .getVisibleCells()
                                                .map((cell) => (
                                                    <TableCell
                                                        key={cell.id}
                                                        className={cn(
                                                            [
                                                                'allocated',
                                                                'actual',
                                                                'variance',
                                                            ].includes(
                                                                cell.column.id,
                                                            ) &&
                                                                'text-right financial-value',
                                                        )}
                                                    >
                                                        {flexRender(
                                                            cell.column
                                                                .columnDef.cell,
                                                            cell.getContext(),
                                                        )}
                                                    </TableCell>
                                                ))}
                                        </TableRow>
                                        {details.includes(row.original.id) && (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={
                                                        visibleColumns.length
                                                    }
                                                    className="bg-muted/20 p-4 whitespace-normal"
                                                >
                                                    <div
                                                        id={`budget-detail-${row.original.id}`}
                                                        tabIndex={-1}
                                                        className="dashboard-enter focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                    >
                                                        <EntryDetail
                                                            entry={row.original}
                                                            slug={slug}
                                                            year={year}
                                                            centers={centers}
                                                            busy={busy}
                                                            mutate={mutate}
                                                            highlightIncomplete={
                                                                completionTarget?.id ===
                                                                    row.original
                                                                        .id &&
                                                                row.original
                                                                    .incomplete >
                                                                    0
                                                            }
                                                            onExpenseEdit={
                                                                onExpenseEdit
                                                            }
                                                        />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </Fragment>
                                );
                            })
                        )}
                    </TableBody>
                    <TableFooter>
                        {hasFilters &&
                            footer(
                                'Totale filtrato · voci incluse visibili',
                                filteredTotals,
                            )}
                        {footer('Totale generale annuale', budget.totals)}
                    </TableFooter>
                </Table>
            </div>
            <AlertDialog
                open={excluding !== null}
                onOpenChange={(open) => {
                    if (!open && !busy) setExcluding(null);
                }}
            >
                <AlertDialogContent key={excluding?.step}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {excluding?.step === 2
                                ? 'Conferma finale dell’esclusione'
                                : 'Escludere le voci dal Budget?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {excluding?.step === 2
                                ? 'Confermando, le voci selezionate saranno escluse dai totali annuali. Potrai riattivarle dal filtro «Voci escluse».'
                                : 'Verifica le voci da escludere. Proseguendo verrà richiesta una seconda conferma.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
                        {budget.entries
                            .filter((entry) =>
                                excluding?.ids.includes(entry.id),
                            )
                            .map((entry) => (
                                <li key={entry.id}>{entry.description}</li>
                            ))}
                    </ul>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            Annulla
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            variant="destructive"
                            onClick={(event) => {
                                event.preventDefault();
                                if (!excluding) return;
                                if (excluding.step === 1) {
                                    setExcluding({ ...excluding, step: 2 });
                                    return;
                                }
                                void batch('exclude', excluding.ids).then(
                                    (ok) => {
                                        if (ok) {
                                            setExcluding(null);
                                            setSelection({});
                                        }
                                    },
                                );
                            }}
                        >
                            {excluding?.step === 2
                                ? 'Escludi dal Budget'
                                : 'Conferma esclusione'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog
                open={removing.length > 0}
                onOpenChange={(open) => {
                    if (!open && !busy) setRemoving([]);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Rimuovere {removing.length} voci dal Budget?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Verranno rimossi i riferimenti annuali selezionati.
                            Contratti, progetti e spese rimangono negli archivi.
                            Le eventuali spese ancora coperte da altre voci
                            incluse saranno riattribuite.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            Annulla
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            variant="destructive"
                            onClick={(event) => {
                                event.preventDefault();
                                void batch('remove', removing).then((ok) => {
                                    if (ok) {
                                        setRemoving([]);
                                        setSelection({});
                                    }
                                });
                            }}
                        >
                            Rimuovi
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    );
}

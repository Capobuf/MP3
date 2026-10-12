import { InlineEdit } from './inline-edit';
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
    closestCenter,
    pointerWithin,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
    Cell,
    ColumnOrderState,
    ExpandedState,
    SortingState,
    VisibilityState,
    RowSelectionState,
    Row,
} from '@tanstack/react-table';
import {
    ArrowDown,
    ArrowRight,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    GripVertical,
    Info,
    Ellipsis,
    ListFilter,
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
import type { Expense, Option } from './types';

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
    const detailRows = Array.from(
        document.querySelectorAll<HTMLElement>(
            `[data-budget-detail-owner="${id}"]`,
        ),
    );
    const target =
        detailRows.flatMap((row) =>
            Array.from(
                row.querySelectorAll<HTMLElement>(
                    '[data-budget-incomplete="true"] input, button[data-budget-incomplete="true"]',
                ),
            ),
        )[0] ?? detail;
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
        visibility: { type: false },
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

type SaveRecord = (
    resource: string,
    id: number,
    changes: Record<string, unknown>,
) => Promise<void>;

// Cell templates are pure render callbacks. Calling them keeps editor components
// mounted when refreshed column definitions change during a save.
function renderCell(cell: Cell<BudgetEntry, unknown>) {
    const renderer = cell.column.columnDef.cell;
    return typeof renderer === 'function'
        ? renderer(cell.getContext())
        : renderer;
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
            title="Doppio clic per modificare · Invio o F2 da tastiera"
            onKeyDown={(event) => {
                if (
                    event.key === 'Enter' ||
                    event.key === 'F2' ||
                    event.key === ' '
                ) {
                    event.preventDefault();
                    submitting.current = false;
                    setDraft(value ?? '');
                    setEditing(true);
                }
            }}
            onDoubleClick={() => {
                submitting.current = false;
                setDraft(value ?? '');
                setEditing(true);
            }}
        >
            {money(value)}
        </Button>
    );
}

function periodLabel(
    start: string | null | undefined,
    end: string | null | undefined,
) {
    if (start && end) return `${dateLabel(start)} – ${dateLabel(end)}`;
    if (start) return `Dal ${dateLabel(start)}`;
    if (end) return `Fino al ${dateLabel(end)}`;
    return null;
}

function Attribution({
    expense,
}: {
    expense: BudgetEntry['expenses'][number];
}) {
    if (expense.contributes) return null;
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    className="block rounded-sm text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                    {expense.counted_in
                        ? `Conteggiata in: ${expense.counted_in}`
                        : 'Non conteggiata'}
                </span>
            </TooltipTrigger>
            <TooltipContent>
                {expense.counted_in
                    ? 'Gli importi contribuiscono soltanto alla voce indicata, senza duplicare i totali.'
                    : 'Gli importi di questa spesa non contribuiscono ai totali del Budget.'}
            </TooltipContent>
        </Tooltip>
    );
}

function ExpenseAmount({
    value,
    label,
    busy,
    highlightIncomplete,
    expense,
    field,
    slug,
    onRecordSave,
}: {
    value: string | null | undefined;
    label: string;
    busy: boolean;
    highlightIncomplete?: boolean;
    expense: Expense;
    field: 'allocated_amount' | 'actual_amount';
    slug: string;
    onRecordSave: SaveRecord;
}) {
    return (
        <div data-budget-incomplete={highlightIncomplete && value == null}>
            {expense.lines?.length ? (
                <Link
                    href={`/t/${slug}/expenses/${expense.id}`}
                    title="Importo calcolato dalle righe economiche"
                >
                    {money(value)}
                </Link>
            ) : (
                <InlineEdit
                    value={value}
                    display={money(value)}
                    label={label.replace(/^Modifica /, '')}
                    disabled={busy}
                    className="text-right financial-value"
                    onSave={(value) =>
                        onRecordSave('expenses', expense.id, {
                            [field]: decimalInput(value),
                        })
                    }
                />
            )}
        </div>
    );
}

function ExpenseRows({
    entry,
    columnIds,
    slug,
    busy,
    highlightIncomplete,
    onExpenseEdit,
    onRecordSave,
}: {
    entry: BudgetEntry;
    columnIds: string[];
    slug: string;
    busy: boolean;
    highlightIncomplete: boolean;
    onExpenseEdit: (id: number) => void;
    onRecordSave: SaveRecord;
}) {
    return entry.expenses.map((expense) => (
        <TableRow
            key={expense.id}
            data-budget-detail-owner={entry.id}
            className={cn(
                'bg-muted/20 hover:bg-muted/40',
                !expense.contributes && 'text-muted-foreground',
            )}
        >
            {columnIds.map((id) => (
                <TableCell
                    key={id}
                    className={cn(
                        'py-1.5',
                        ['allocated', 'actual'].includes(id) &&
                            'text-right financial-value tabular-nums',
                        id === 'description' && 'whitespace-normal',
                        highlightIncomplete &&
                            expense.contributes &&
                            ((id === 'allocated' &&
                                expense.allocated_amount == null) ||
                                (id === 'actual' &&
                                    expense.actual_amount == null)) &&
                            'bg-accent ring-1 ring-primary/40 ring-inset',
                    )}
                >
                    {id === 'description' ? (
                        <div className="ml-4 flex min-w-48 flex-col gap-1 border-l-2 border-border py-1 pl-4">
                            <InlineEdit
                                value={expense.title}
                                label={`Titolo di ${expense.title}`}
                                disabled={busy}
                                className="font-medium break-words"
                                onSave={(value) =>
                                    onRecordSave('expenses', expense.id, {
                                        title: value,
                                    })
                                }
                            />
                            <Link
                                className="text-xs text-primary"
                                href={`/t/${slug}/expenses/${expense.id}`}
                            >
                                Apri spesa
                            </Link>
                            {periodLabel(
                                expense.period_starts_on,
                                expense.period_ends_on,
                            ) && (
                                <span className="text-xs text-muted-foreground">
                                    Periodo coperto:{' '}
                                    {periodLabel(
                                        expense.period_starts_on,
                                        expense.period_ends_on,
                                    )}
                                </span>
                            )}
                            <Attribution expense={expense} />
                        </div>
                    ) : id === 'allocated' || id === 'actual' ? (
                        <ExpenseAmount
                            value={
                                expense[
                                    id === 'allocated'
                                        ? 'allocated_amount'
                                        : 'actual_amount'
                                ]
                            }
                            label={`Modifica ${columnNames[id]} della spesa ${expense.title}`}
                            busy={busy}
                            highlightIncomplete={
                                highlightIncomplete && expense.contributes
                            }
                            expense={expense}
                            field={
                                id === 'allocated'
                                    ? 'allocated_amount'
                                    : 'actual_amount'
                            }
                            slug={slug}
                            onRecordSave={onRecordSave}
                        />
                    ) : id === 'actions' ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={busy}
                                    aria-label={`Azioni per la spesa ${expense.title}`}
                                >
                                    <Ellipsis />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuGroup>
                                    <DropdownMenuItem
                                        onSelect={() =>
                                            onExpenseEdit(expense.id)
                                        }
                                    >
                                        Righe e collegamenti
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                        <Link
                                            href={`/t/${slug}/expenses/${expense.id}`}
                                        >
                                            Apri nell’archivio
                                        </Link>
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </TableCell>
            ))}
        </TableRow>
    ));
}

function SortableBudgetRow({
    row,
    disabled,
    disabledReason,
}: {
    row: Row<BudgetEntry>;
    disabled: boolean;
    disabledReason: string;
}) {
    'use no memo'; // TanStack row selection is read through a mutable row instance.
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        isDragging,
    } = useSortable({ id: row.id, disabled });
    return (
        <TableRow
            ref={setNodeRef}
            style={{
                transform: CSS.Translate.toString(transform),
                position: 'relative',
                zIndex: isDragging ? 1 : undefined,
            }}
            data-state={row.getIsSelected() ? 'selected' : undefined}
            className={cn(
                (!row.original.included ||
                    (row.original.type === 'expense' &&
                        row.original.expenses[0] &&
                        !row.original.expenses[0].contributes)) &&
                    'text-muted-foreground',
                isDragging && 'bg-accent opacity-80',
            )}
        >
            {row.getVisibleCells().map((cell) => (
                <TableCell
                    key={cell.id}
                    className={cn(
                        'py-1.5',
                        ['allocated', 'actual', 'variance'].includes(
                            cell.column.id,
                        ) && 'text-right financial-value tabular-nums',
                    )}
                >
                    {cell.column.id === 'expand' ? (
                        <div className="flex items-center">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        ref={setActivatorNodeRef}
                                        size="icon"
                                        variant="ghost"
                                        className="cursor-grab touch-none active:cursor-grabbing aria-disabled:cursor-default aria-disabled:opacity-40"
                                        {...attributes}
                                        {...listeners}
                                        aria-disabled={disabled}
                                        aria-label={`Riordina ${row.original.description}${disabled ? `: ${disabledReason}` : ''}`}
                                    >
                                        <GripVertical />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {disabled
                                        ? disabledReason
                                        : 'Trascina nel gruppo. Da tastiera: Spazio, frecce, Spazio per confermare, Esc per annullare.'}
                                </TooltipContent>
                            </Tooltip>
                            {renderCell(cell)}
                        </div>
                    ) : (
                        renderCell(cell)
                    )}
                </TableCell>
            ))}
        </TableRow>
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
                <SelectContent avoidCollisions>
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
    onRecordSave,
    highlightIncomplete,
}: {
    entry: BudgetEntry;
    slug: string;
    year: number;
    centers: Option[];
    busy: boolean;
    mutate: BudgetMutate;
    onExpenseEdit: (id: number) => void;
    onRecordSave: SaveRecord;
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
                {periodLabel(entry.starts_on, entry.ends_on) && (
                    <p className="text-sm text-muted-foreground">
                        Periodo{' '}
                        {entry.type === 'contract'
                            ? 'contrattuale'
                            : 'del progetto'}
                        : {periodLabel(entry.starts_on, entry.ends_on)}
                    </p>
                )}
                <Button variant="outline" size="sm" asChild>
                    <Link href={`/t/${slug}/${entry.type}s/${entry.source_id}`}>
                        Apri nell’archivio
                    </Link>
                </Button>
            </div>
            <InlineEdit
                value={entry.notes}
                label={entry.type === 'project' ? 'Descrizione' : 'Note'}
                multiline
                disabled={busy}
                className="text-sm whitespace-pre-wrap text-muted-foreground"
                onSave={(value) =>
                    onRecordSave(`${entry.type}s`, entry.source_id!, {
                        [entry.type === 'project' ? 'description' : 'notes']:
                            value || null,
                    })
                }
            />
            {!entry.expenses.length ? (
                <Alert
                    tabIndex={-1}
                    data-budget-incomplete={highlightIncomplete}
                    className={cn(
                        highlightIncomplete && 'ring-1 ring-primary/40',
                    )}
                >
                    <AlertTitle>
                        Nessun importo nell’anno selezionato
                    </AlertTitle>
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
                            <AlertTitle>Importi da completare</AlertTitle>
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
                    {!!entry.expenses[0].lines?.length && (
                        <ExpenseLines
                            readOnly
                            showSummary={false}
                            showHeading={false}
                            contractMode={!!entry.expenses[0].contract_id}
                            lines={draftLines(entry.expenses[0])}
                        />
                    )}
                </>
            ) : null}
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
    onRecordSave,
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
    onRecordSave: (
        resource: string,
        id: number,
        changes: Record<string, unknown>,
    ) => Promise<void>;
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
    const [excluding, setExcluding] = useState<{ ids: number[] } | null>(null);
    const [dragging, setDragging] = useState(false);
    const [detailHeights, setDetailHeights] = useState<Record<number, number>>(
        {},
    );
    const dndId = useId();
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
            scrollBehavior: 'auto',
        }),
    );
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
                        aria-controls={`budget-detail-${row.original.id}`}
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
                        <InlineEdit
                            value={row.original.description}
                            label={`Descrizione di ${row.original.description}`}
                            disabled={busy}
                            onSave={async (value) => {
                                if (row.original.type === 'manual') {
                                    const ok = await mutate(
                                        'entries',
                                        'PATCH',
                                        {
                                            action: 'update',
                                            ids: [row.original.id],
                                            changes: { description: value },
                                        },
                                    );
                                    if (!ok)
                                        throw new Error(
                                            'Salvataggio non riuscito.',
                                        );
                                } else {
                                    await onRecordSave(
                                        `${row.original.type}s`,
                                        row.original.source_id!,
                                        {
                                            [row.original.type === 'expense'
                                                ? 'title'
                                                : 'name']: value,
                                        },
                                    );
                                }
                            }}
                        />
                        {preferences.group === 'center' &&
                            preferences.visibility.type === false && (
                                <Badge variant="secondary" className="text-xs">
                                    {budgetLabels[row.original.type]}
                                </Badge>
                            )}
                        {row.original.type === 'expense' &&
                            row.original.expenses[0] && (
                                <Attribution
                                    expense={row.original.expenses[0]}
                                />
                            )}
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
                        ) : row.original.type === 'expense' &&
                          row.original.source_id ? (
                            <ExpenseAmount
                                value={
                                    row.original.expenses[0] &&
                                    !row.original.expenses[0].contributes
                                        ? row.original.expenses[0][
                                              field === 'allocated'
                                                  ? 'allocated_amount'
                                                  : 'actual_amount'
                                          ]
                                        : row.original[field]
                                }
                                busy={busy}
                                label={`Modifica ${columnNames[field]} della spesa ${row.original.description}`}
                                expense={row.original.expenses[0]}
                                field={
                                    field === 'allocated'
                                        ? 'allocated_amount'
                                        : 'actual_amount'
                                }
                                slug={slug}
                                onRecordSave={onRecordSave}
                            />
                        ) : (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-auto min-h-8 w-full justify-end financial-value tabular-nums"
                                        aria-label={`Mostra le spese del ${row.original.type === 'contract' ? 'contratto' : 'progetto'} ${row.original.description}: ${columnNames[field]}`}
                                        aria-expanded={details.includes(
                                            row.original.id,
                                        )}
                                        onClick={() =>
                                            setDetails((current) =>
                                                current.includes(
                                                    row.original.id,
                                                )
                                                    ? current
                                                    : [
                                                          ...current,
                                                          row.original.id,
                                                      ],
                                            )
                                        }
                                    >
                                        {money(row.original[field])}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    Mostra le spese che compongono il totale
                                </TooltipContent>
                            </Tooltip>
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
                    return (
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
                                    {entry.type !== 'manual' && (
                                        <DropdownMenuItem asChild>
                                            <Link
                                                href={`/t/${slug}/${entry.type}s/${entry.source_id}`}
                                            >
                                                Apri nell’archivio
                                            </Link>
                                        </DropdownMenuItem>
                                    )}
                                    {(entry.type === 'manual' ||
                                        entry.type === 'expense') && (
                                        <DropdownMenuItem
                                            onSelect={() => {
                                                if (entry.type === 'expense')
                                                    onExpenseEdit(
                                                        entry.source_id!,
                                                    );
                                                else
                                                    setDetails((current) =>
                                                        current.includes(
                                                            entry.id,
                                                        )
                                                            ? current
                                                            : [
                                                                  ...current,
                                                                  entry.id,
                                                              ],
                                                    );
                                            }}
                                        >
                                            Righe e collegamenti
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onSelect={() => {
                                            if (entry.included)
                                                setExcluding({
                                                    ids: [entry.id],
                                                });
                                            else
                                                void batch('reactivate', [
                                                    entry.id,
                                                ]);
                                        }}
                                    >
                                        {entry.included
                                            ? 'Escludi dai totali'
                                            : 'Riattiva nei totali'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onSelect={() => setRemoving([entry.id])}
                                    >
                                        Rimuovi dal Budget
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
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
            preferences.group,
            preferences.visibility.type,
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
    const dragDisabled = busy || loading || sorting.length > 0;
    const dragDisabledReason =
        sorting.length > 0
            ? 'Ripristina ordine manuale per trascinare le voci'
            : 'Attendi il completamento del salvataggio o aggiornamento';
    const dragLabel = (id: string | number) =>
        budget.entries.find((entry) => String(entry.id) === String(id))
            ?.description ?? String(id);
    function finishDrag({ active, over }: DragEndEvent) {
        setDragging(false);
        if (dragDisabled || !over || active.id === over.id) return;
        const rows = table
            .getRowModel()
            .rows.filter((row) => !row.getIsGrouped());
        const source = rows.find((row) => row.id === active.id);
        const destination = rows.find((row) => row.id === over.id);
        if (!source || !destination || source.parentId !== destination.parentId)
            return;
        const visibleIds = rows
            .filter((row) => row.parentId === source.parentId)
            .map((row) => row.original.id);
        const moved = arrayMove(
            visibleIds,
            visibleIds.indexOf(source.original.id),
            visibleIds.indexOf(destination.original.id),
        );
        const visible = new Set(visibleIds);
        let index = 0;
        // Replace only the slots of visible group members; hidden entries and other groups keep their slots.
        const ids = [...budget.entries]
            .sort((a, b) => a.position - b.position || a.id - b.id)
            .map((entry) =>
                visible.has(entry.id) ? moved[index++] : entry.id,
            );
        void batch('reorder', ids);
    }
    function renderEntry(row: Row<BudgetEntry>) {
        const entry = row.original;
        const highlightIncomplete =
            completionTarget?.id === entry.id && entry.incomplete > 0;
        return (
            <Fragment key={row.id}>
                <SortableBudgetRow
                    row={row}
                    disabled={dragDisabled}
                    disabledReason={dragDisabledReason}
                />
                {details.includes(entry.id) &&
                    (dragging ? (
                        // Retain the detail height while suspending its contents so drag targets do not jump.
                        <TableRow aria-hidden="true">
                            <TableCell
                                colSpan={visibleColumns.length}
                                className="p-0"
                                style={{ height: detailHeights[entry.id] ?? 0 }}
                            />
                        </TableRow>
                    ) : (
                        <>
                            <TableRow data-budget-detail-owner={entry.id}>
                                <TableCell
                                    colSpan={visibleColumns.length}
                                    className="bg-muted/20 p-3 whitespace-normal"
                                >
                                    <div
                                        id={`budget-detail-${entry.id}`}
                                        tabIndex={-1}
                                        className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    >
                                        <EntryDetail
                                            entry={entry}
                                            slug={slug}
                                            year={year}
                                            centers={centers}
                                            busy={busy}
                                            mutate={mutate}
                                            highlightIncomplete={
                                                highlightIncomplete
                                            }
                                            onExpenseEdit={onExpenseEdit}
                                            onRecordSave={onRecordSave}
                                        />
                                    </div>
                                </TableCell>
                            </TableRow>
                            {(entry.type === 'contract' ||
                                entry.type === 'project') && (
                                <ExpenseRows
                                    entry={entry}
                                    columnIds={visibleColumns.map(
                                        (column) => column.id,
                                    )}
                                    slug={slug}
                                    busy={busy}
                                    highlightIncomplete={highlightIncomplete}
                                    onExpenseEdit={onExpenseEdit}
                                    onRecordSave={onRecordSave}
                                />
                            )}
                        </>
                    ))}
            </Fragment>
        );
    }
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
                                    {totals.incomplete > 0 &&
                                        ` · ${totals.incomplete} ${totals.incomplete === 1 ? 'voce con dati incompleti' : 'voci con dati incompleti'}`}
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
                            column.id === 'variance' &&
                            totals.comparable_count === 0 ? (
                                'Non confrontabile'
                            ) : (
                                money(
                                    totals[
                                        column.id as
                                            | 'allocated'
                                            | 'actual'
                                            | 'variance'
                                    ],
                                )
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
                <Button variant="outline" aria-label="Colonne" title="Colonne">
                    <Settings2 data-icon="inline-start" /> Colonne
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
                                visibility: { type: false },
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
                {columnSettings}
                <Button onClick={onAdd} disabled={busy}>
                    Aggiungi voce
                </Button>
                {budget.has_missing_entries && (
                    <Button
                        variant="outline"
                        onClick={onMissing}
                        disabled={busy}
                    >
                        Inserisci spese mancanti
                    </Button>
                )}
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
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setExcluding({ ids: selected })}
                    >
                        Escludi dai totali
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
                        Riattiva nei totali
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setRemoving(selected)}
                    >
                        Rimuovi dal Budget
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
            <DndContext
                id={dndId}
                sensors={sensors}
                collisionDetection={(args) =>
                    args.pointerCoordinates
                        ? pointerWithin(args)
                        : closestCenter(args)
                }
                accessibility={{
                    screenReaderInstructions: {
                        draggable:
                            'Premi Spazio o Invio per iniziare il riordino. Usa le frecce su e giù nel gruppo. Premi Spazio o Invio per confermare, Esc per annullare.',
                    },
                    announcements: {
                        onDragStart: ({ active }) =>
                            `Voce ${dragLabel(active.id)} selezionata.`,
                        onDragOver: ({ active, over }) => {
                            const source = table
                                .getRowModel()
                                .rows.find((row) => row.id === active.id);
                            const target = table
                                .getRowModel()
                                .rows.find((row) => row.id === over?.id);
                            return source &&
                                target &&
                                source.parentId === target.parentId
                                ? `${dragLabel(active.id)} sulla voce ${dragLabel(target.id)}.`
                                : 'Destinazione fuori dal gruppo: nessun riordino.';
                        },
                        onDragEnd: ({ active, over }) => {
                            const source = table
                                .getRowModel()
                                .rows.find((row) => row.id === active.id);
                            const target = table
                                .getRowModel()
                                .rows.find((row) => row.id === over?.id);
                            return source &&
                                target &&
                                source.id !== target.id &&
                                source.parentId === target.parentId
                                ? `Riordino di ${dragLabel(active.id)} inviato per il salvataggio.`
                                : 'Nessuna modifica all’ordine.';
                        },
                        onDragCancel: () => 'Riordino annullato.',
                    },
                }}
                onDragStart={() => {
                    const heights: Record<number, number> = {};
                    document
                        .querySelectorAll<HTMLElement>(
                            '[data-budget-detail-owner]',
                        )
                        .forEach((element) => {
                            const id = Number(
                                element.dataset.budgetDetailOwner,
                            );
                            heights[id] =
                                (heights[id] ?? 0) +
                                element.getBoundingClientRect().height;
                        });
                    setDetailHeights(heights);
                    setDragging(true);
                }}
                onDragCancel={() => setDragging(false)}
                onDragEnd={finishDrag}
            >
                <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
                    <Table>
                        <TableHeader className="bg-muted [&_th]:font-semibold">
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
                                            <div
                                                className={cn(
                                                    'flex items-center gap-1',
                                                    [
                                                        'allocated',
                                                        'actual',
                                                        'variance',
                                                    ].includes(
                                                        header.column.id,
                                                    ) && 'justify-end',
                                                )}
                                            >
                                                {header.column.getCanSort() ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={header.column.getToggleSortingHandler()}
                                                    >
                                                        {flexRender(
                                                            header.column
                                                                .columnDef
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
                                                        header.column.columnDef
                                                            .header,
                                                        header.getContext(),
                                                    )
                                                )}
                                                {header.column.id ===
                                                    'variance' && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                aria-label="Come viene calcolato lo scostamento"
                                                            >
                                                                <Info />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="max-w-72">
                                                            Differenza fra
                                                            Effettivo e Previsto
                                                            sulle sole
                                                            componenti con
                                                            entrambi gli
                                                            importi. I dati
                                                            senza uno dei due
                                                            importi sono esclusi
                                                            dal confronto.
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                            </div>
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
                                                    Aggiungi contratti,
                                                    progetti, spese o voci
                                                    libere al Budget.
                                                </EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                table.getSortedRowModel().rows.map((row) => {
                                    if (row.getIsGrouped()) {
                                        const value = String(
                                            row.getGroupingValue(
                                                preferences.group,
                                            ),
                                        );
                                        const title =
                                            preferences.group === 'type'
                                                ? budgetLabels[
                                                      value as BudgetType
                                                  ]
                                                : (centers.find(
                                                      (c) =>
                                                          String(c.id) ===
                                                          value,
                                                  )?.name ??
                                                  'Senza centro di costo');
                                        const totals = budgetTotals(
                                            row
                                                .getLeafRows()
                                                .map((leaf) => leaf.original),
                                        );
                                        return (
                                            <Fragment key={row.id}>
                                                <TableRow className="border-y bg-muted/60">
                                                    <TableCell
                                                        colSpan={
                                                            visibleColumns.length
                                                        }
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
                                                                <span className="font-semibold">
                                                                    {title} ·{' '}
                                                                    {
                                                                        row
                                                                            .subRows
                                                                            .length
                                                                    }
                                                                </span>
                                                            </Button>
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                {totals.incomplete >
                                                                    0 && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {
                                                                            totals.incomplete
                                                                        }{' '}
                                                                        {totals.incomplete ===
                                                                        1
                                                                            ? 'voce con dati incompleti'
                                                                            : 'voci con dati incompleti'}
                                                                    </span>
                                                                )}
                                                                <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                                                                    {(
                                                                        [
                                                                            'allocated',
                                                                            'actual',
                                                                            'variance',
                                                                        ] as const
                                                                    )
                                                                        .filter(
                                                                            (
                                                                                id,
                                                                            ) =>
                                                                                table
                                                                                    .getColumn(
                                                                                        id,
                                                                                    )
                                                                                    ?.getIsVisible(),
                                                                        )
                                                                        .map(
                                                                            (
                                                                                id,
                                                                            ) => (
                                                                                <div
                                                                                    key={
                                                                                        id
                                                                                    }
                                                                                    className="flex items-baseline gap-2"
                                                                                >
                                                                                    <dt className="text-xs text-muted-foreground">
                                                                                        {
                                                                                            columnNames[
                                                                                                id
                                                                                            ]
                                                                                        }
                                                                                    </dt>
                                                                                    <dd
                                                                                        className={cn(
                                                                                            'financial-value tabular-nums',
                                                                                            id ===
                                                                                                'variance' &&
                                                                                                varianceTextClass(
                                                                                                    totals.variance,
                                                                                                ),
                                                                                        )}
                                                                                    >
                                                                                        {id ===
                                                                                            'variance' &&
                                                                                        totals.comparable_count ===
                                                                                            0
                                                                                            ? 'Non confrontabile'
                                                                                            : money(
                                                                                                  totals[
                                                                                                      id
                                                                                                  ],
                                                                                              )}
                                                                                    </dd>
                                                                                </div>
                                                                            ),
                                                                        )}
                                                                </dl>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                                {row.getIsExpanded() && (
                                                    <SortableContext
                                                        items={row.subRows.map(
                                                            (leaf) => leaf.id,
                                                        )}
                                                        strategy={
                                                            verticalListSortingStrategy
                                                        }
                                                    >
                                                        {row.subRows.map(
                                                            renderEntry,
                                                        )}
                                                    </SortableContext>
                                                )}
                                            </Fragment>
                                        );
                                    }
                                    return renderEntry(row);
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
            </DndContext>
            <AlertDialog
                open={excluding !== null}
                onOpenChange={(open) => {
                    if (!open && !busy) setExcluding(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Escludere le voci dai totali?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Le voci resteranno nel Budget senza contribuire ai
                            totali. Potrai riattivarle dal filtro «Voci
                            escluse».
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
                            Escludi dai totali
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

import { Fragment, useEffect, useRef, useState } from 'react';
import { addYears, format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, dateLabel, money } from './helpers';
import { cents, decimal } from './analytics-helpers';
import { DateField } from './date-field';
import type { BudgetSnapshot } from './budget-types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Field,
    FieldLabel,
    FieldGroup,
    FieldSet,
    FieldLegend,
} from '@/components/ui/field';
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

type Center = { id: number; name: string; parent?: { name: string } | null };
type SourceExpense = {
    id: number;
    title: string;
    allocated: string | null;
    has_target_year: boolean;
    project_id: number | null;
};
type Source = {
    id: number;
    display_name: string;
    starts_on: string | null;
    ends_on: string | null;
    group: number;
    already_imported: boolean;
    token: string;
    vendor: { name: string } | null;
    cost_centers: Center[];
    budget_cost_center: Center | null;
    expenses: SourceExpense[];
};
type Preview = {
    source_year: number;
    target_year: number;
    contracts: Source[];
    legacy_count: number;
};
type Selection = {
    id: number;
    token: string;
    starts_on: string | null;
    ends_on: string | null;
    expense_ids: number[];
};
const centerName = (center: Center) =>
    center.parent ? `${center.parent.name} / ${center.name}` : center.name;

export function AnnualContractImport({
    path,
    onClose,
    onImported,
}: {
    path: string;
    onClose: () => void;
    onImported: (budget: BudgetSnapshot) => void;
}) {
    const [preview, setPreview] = useState<Preview | null>(null);
    const [selection, setSelection] = useState<Record<number, Selection>>({});
    const [summary, setSummary] = useState(false);
    const [expanded, setExpanded] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    const form = useRef<HTMLFormElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const endpoint = `${path}/contract-import`;
    async function load() {
        setBusy(true);
        setError('');
        try {
            const result = await api<Preview>(endpoint);
            setPreview(result);
            setSelection(
                Object.fromEntries(
                    result.contracts
                        .filter((source) => !source.already_imported)
                        .map((source) => [source.id, initial(source)]),
                ),
            );
            setExpanded([]);
            setSummary(false);
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Impossibile caricare i contratti.',
            );
        } finally {
            setBusy(false);
        }
    }
    useEffect(() => {
        void load();
    }, [endpoint]);
    useEffect(() => {
        content.current?.scrollTo({ top: 0 });
    }, [summary]);
    function initial(source: Source): Selection {
        return {
            id: source.id,
            token: source.token,
            starts_on: source.starts_on,
            ends_on: source.ends_on,
            expense_ids: [],
        };
    }
    function selectAll() {
        setSelection((current) =>
            Object.fromEntries(
                (preview?.contracts ?? [])
                    .filter((source) => !source.already_imported)
                    .map((source) => [
                        source.id,
                        current[source.id] ?? initial(source),
                    ]),
            ),
        );
    }
    function selectAllExpenses(checked: boolean) {
        setSelection((current) => {
            const next = { ...current };
            for (const source of available) {
                const ids = source.expenses
                    .filter((expense) => expense.allocated !== null)
                    .map((expense) => expense.id);
                if (checked && ids.length > 0) {
                    next[source.id] = {
                        ...(current[source.id] ?? initial(source)),
                        expense_ids: ids,
                    };
                } else if (!checked && next[source.id]) {
                    next[source.id] = { ...next[source.id], expense_ids: [] };
                }
            }
            return next;
        });
    }
    function select(source: Source, checked: boolean) {
        setSelection((current) => {
            const next = { ...current };
            if (checked)
                next[source.id] = current[source.id] ?? initial(source);
            else delete next[source.id];
            return next;
        });
    }
    function change(source: Source, changes: Partial<Selection>) {
        setSelection((current) => ({
            ...current,
            [source.id]: {
                ...(current[source.id] ?? initial(source)),
                ...changes,
            },
        }));
    }
    async function commit() {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError('');
        try {
            const result = await api<{
                budget: BudgetSnapshot;
                message: string;
            }>(endpoint, 'POST', { contracts: Object.values(selection) });
            onImported(result.budget);
            toast.success(result.message);
            onClose();
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Importazione non riuscita.',
            );
        } finally {
            lock.current = false;
            setBusy(false);
        }
    }
    const chosen =
        preview?.contracts.filter((source) => selection[source.id]) ?? [];
    const available =
        preview?.contracts.filter((source) => !source.already_imported) ?? [];
    const expenseCount = available.reduce(
        (count, source) =>
            count +
            source.expenses.filter((expense) => expense.allocated !== null)
                .length,
        0,
    );
    const selectedExpenseCount = Object.values(selection).reduce(
        (count, draft) => count + draft.expense_ids.length,
        0,
    );
    const total = chosen.reduce(
        (sum, source) =>
            sum +
            source.expenses
                .filter((expense) =>
                    selection[source.id].expense_ids.includes(expense.id),
                )
                .reduce(
                    (amount, expense) => amount + cents(expense.allocated!),
                    0,
                ),
        0,
    );
    function outside(draft: Selection) {
        return (
            !!preview &&
            ((draft.starts_on !== null &&
                draft.starts_on > `${preview.target_year}-12-31`) ||
                (draft.ends_on !== null &&
                    draft.ends_on < `${preview.target_year}-01-01`))
        );
    }
    const tables =
        preview &&
        [
            `Validi nel ${preview.target_year}`,
            `Scaduti nel ${preview.source_year} / Da rinnovare`,
            'Altri',
        ].map((label, group) => {
            const sources = (summary ? chosen : preview.contracts).filter(
                (source) => source.group === group,
            );
            if (sources.length === 0) return null;
            return (
                <FieldSet key={group} className="min-w-0">
                    <FieldLegend>{label}</FieldLegend>
                    <div className="min-w-0 overflow-hidden rounded-md border">
                        <Table
                            className="min-w-[48rem] table-fixed"
                            aria-label={label}
                        >
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">
                                        <span className="sr-only">
                                            Seleziona
                                        </span>
                                    </TableHead>
                                    <TableHead>Descrizione</TableHead>
                                    <TableHead className="w-40">
                                        Data iniziale
                                    </TableHead>
                                    <TableHead className="w-40">
                                        Data finale
                                    </TableHead>
                                    <TableHead className="w-36 text-right">
                                        Allocato{' '}
                                        {summary
                                            ? preview.target_year
                                            : preview.source_year}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sources.map((source) => {
                                    const draft = selection[source.id];
                                    const open =
                                        summary || expanded.includes(source.id);
                                    const expenses = summary
                                        ? source.expenses.filter((expense) =>
                                              draft.expense_ids.includes(
                                                  expense.id,
                                              ),
                                          )
                                        : source.expenses;
                                    const allocations = expenses.filter(
                                        (expense) => expense.allocated !== null,
                                    );
                                    const amount = allocations.reduce(
                                        (sum, expense) =>
                                            sum + cents(expense.allocated!),
                                        0,
                                    );
                                    return (
                                        <Fragment key={source.id}>
                                            <TableRow>
                                                <TableCell>
                                                    <Checkbox
                                                        id={`annual-contract-${source.id}`}
                                                        aria-label={`Seleziona contratto ${source.display_name}`}
                                                        disabled={
                                                            summary ||
                                                            busy ||
                                                            source.already_imported
                                                        }
                                                        checked={!!draft}
                                                        onCheckedChange={(
                                                            value,
                                                        ) =>
                                                            select(
                                                                source,
                                                                value === true,
                                                            )
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell className="whitespace-normal">
                                                    <div className="flex items-center gap-2">
                                                        {summary ? (
                                                            <ChevronDown
                                                                className="mx-3 size-4 shrink-0"
                                                                aria-hidden="true"
                                                            />
                                                        ) : (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                aria-label={`${open ? 'Comprimi' : 'Espandi'} spese di ${source.display_name}`}
                                                                aria-expanded={
                                                                    open
                                                                }
                                                                onClick={() =>
                                                                    setExpanded(
                                                                        (
                                                                            current,
                                                                        ) =>
                                                                            open
                                                                                ? current.filter(
                                                                                      (
                                                                                          id,
                                                                                      ) =>
                                                                                          id !==
                                                                                          source.id,
                                                                                  )
                                                                                : [
                                                                                      ...current,
                                                                                      source.id,
                                                                                  ],
                                                                    )
                                                                }
                                                            >
                                                                {open ? (
                                                                    <ChevronDown />
                                                                ) : (
                                                                    <ChevronRight />
                                                                )}
                                                            </Button>
                                                        )}
                                                        <FieldLabel
                                                            htmlFor={`annual-contract-${source.id}`}
                                                            className="min-w-0 flex-1"
                                                        >
                                                            {
                                                                source.display_name
                                                            }
                                                        </FieldLabel>
                                                    </div>
                                                    {source.already_imported && (
                                                        <Badge
                                                            variant="secondary"
                                                            className="ml-10"
                                                        >
                                                            Già importato
                                                        </Badge>
                                                    )}
                                                    {summary && (
                                                        <div className="mt-1 flex flex-col gap-1 pl-10 text-xs text-muted-foreground">
                                                            <p>
                                                                Fornitore:{' '}
                                                                {source.vendor
                                                                    ?.name ??
                                                                    'Nessuno'}
                                                            </p>
                                                            <p>
                                                                Centri di costo:{' '}
                                                                {source.cost_centers
                                                                    .map(
                                                                        centerName,
                                                                    )
                                                                    .join(
                                                                        ', ',
                                                                    ) ||
                                                                    'Nessuno'}{' '}
                                                                · Centro Budget:{' '}
                                                                {source.budget_cost_center
                                                                    ? centerName(
                                                                          source.budget_cost_center,
                                                                      )
                                                                    : 'Nessuno'}
                                                            </p>
                                                            {outside(draft) && (
                                                                <p role="note">
                                                                    Attenzione:
                                                                    periodo
                                                                    esterno al{' '}
                                                                    {
                                                                        preview.target_year
                                                                    }
                                                                    . Puoi
                                                                    comunque
                                                                    importare il
                                                                    contratto
                                                                    con queste
                                                                    date.
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                    {!summary &&
                                                        source.group === 1 &&
                                                        draft && (
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="mt-2 ml-10"
                                                                disabled={busy}
                                                                onClick={() => {
                                                                    if (
                                                                        !form.current?.reportValidity()
                                                                    )
                                                                        return;
                                                                    change(
                                                                        source,
                                                                        {
                                                                            starts_on:
                                                                                draft.starts_on
                                                                                    ? format(
                                                                                          addYears(
                                                                                              parseISO(
                                                                                                  draft.starts_on,
                                                                                              ),
                                                                                              1,
                                                                                          ),
                                                                                          'yyyy-MM-dd',
                                                                                      )
                                                                                    : null,
                                                                            ends_on:
                                                                                draft.ends_on
                                                                                    ? format(
                                                                                          addYears(
                                                                                              parseISO(
                                                                                                  draft.ends_on,
                                                                                              ),
                                                                                              1,
                                                                                          ),
                                                                                          'yyyy-MM-dd',
                                                                                      )
                                                                                    : null,
                                                                        },
                                                                    );
                                                                }}
                                                            >
                                                                Sposta periodo
                                                                +1 anno
                                                            </Button>
                                                        )}
                                                </TableCell>
                                                {(
                                                    [
                                                        'starts_on',
                                                        'ends_on',
                                                    ] as const
                                                ).map((field, index) => (
                                                    <TableCell key={field}>
                                                        {summary ? (
                                                            <div className="flex flex-col gap-1">
                                                                <span>
                                                                    {dateLabel(
                                                                        draft[
                                                                            field
                                                                        ],
                                                                    )}
                                                                </span>
                                                                {draft[
                                                                    field
                                                                ] !==
                                                                    source[
                                                                        field
                                                                    ] && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        Prima:{' '}
                                                                        {dateLabel(
                                                                            source[
                                                                                field
                                                                            ],
                                                                        )}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <Field>
                                                                <FieldLabel
                                                                    className="sr-only"
                                                                    htmlFor={`annual-${index ? 'end' : 'start'}-${source.id}`}
                                                                >
                                                                    Data{' '}
                                                                    {index
                                                                        ? 'finale'
                                                                        : 'iniziale'}{' '}
                                                                    di{' '}
                                                                    {
                                                                        source.display_name
                                                                    }
                                                                </FieldLabel>
                                                                <DateField
                                                                    id={`annual-${index ? 'end' : 'start'}-${source.id}`}
                                                                    value={
                                                                        (draft ??
                                                                            source)[
                                                                            field
                                                                        ] ?? ''
                                                                    }
                                                                    disabled={
                                                                        busy ||
                                                                        !draft
                                                                    }
                                                                    onChange={(
                                                                        value,
                                                                    ) =>
                                                                        change(
                                                                            source,
                                                                            {
                                                                                [field]:
                                                                                    value ||
                                                                                    null,
                                                                            },
                                                                        )
                                                                    }
                                                                />
                                                            </Field>
                                                        )}
                                                    </TableCell>
                                                ))}
                                                <TableCell className="text-right tabular-nums">
                                                    {money(
                                                        summary ||
                                                            allocations.length
                                                            ? decimal(amount)
                                                            : null,
                                                        'Non presente',
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                            {open &&
                                                (expenses.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell
                                                            colSpan={5}
                                                            className="pl-20 text-muted-foreground"
                                                        >
                                                            {summary
                                                                ? 'Solo contratto, nessuna spesa.'
                                                                : `Nessuna spesa attribuita al ${preview.source_year}.`}
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    expenses.map((expense) => (
                                                        <TableRow
                                                            key={expense.id}
                                                            className="bg-muted/30"
                                                        >
                                                            <TableCell>
                                                                <Checkbox
                                                                    id={`annual-expense-${expense.id}`}
                                                                    aria-label={`Seleziona spesa ${expense.title}`}
                                                                    disabled={
                                                                        summary ||
                                                                        busy ||
                                                                        source.already_imported ||
                                                                        expense.allocated ===
                                                                            null
                                                                    }
                                                                    checked={
                                                                        draft?.expense_ids.includes(
                                                                            expense.id,
                                                                        ) ??
                                                                        false
                                                                    }
                                                                    onCheckedChange={(
                                                                        checked,
                                                                    ) =>
                                                                        change(
                                                                            source,
                                                                            {
                                                                                expense_ids:
                                                                                    checked ===
                                                                                    true
                                                                                        ? [
                                                                                              ...(draft?.expense_ids ??
                                                                                                  []),
                                                                                              expense.id,
                                                                                          ]
                                                                                        : (
                                                                                              draft?.expense_ids ??
                                                                                              []
                                                                                          ).filter(
                                                                                              (
                                                                                                  id,
                                                                                              ) =>
                                                                                                  id !==
                                                                                                  expense.id,
                                                                                          ),
                                                                            },
                                                                        )
                                                                    }
                                                                />
                                                            </TableCell>
                                                            <TableCell
                                                                colSpan={3}
                                                                className="whitespace-normal"
                                                            >
                                                                <FieldLabel
                                                                    htmlFor={`annual-expense-${expense.id}`}
                                                                    className="pl-10"
                                                                >
                                                                    {
                                                                        expense.title
                                                                    }
                                                                </FieldLabel>
                                                                <p className="pl-10 text-xs text-muted-foreground">
                                                                    Spesa ·{' '}
                                                                    {summary
                                                                        ? preview.target_year
                                                                        : preview.source_year}
                                                                    {expense.allocated ===
                                                                    null
                                                                        ? ' · Nessun allocato da importare'
                                                                        : ''}
                                                                </p>
                                                                {summary &&
                                                                    expense.has_target_year && (
                                                                        <p
                                                                            role="note"
                                                                            className="mt-1 pl-10 text-xs text-muted-foreground"
                                                                        >
                                                                            Attenzione:
                                                                            la
                                                                            spesa
                                                                            sorgente
                                                                            ha
                                                                            già
                                                                            righe
                                                                            nel{' '}
                                                                            {
                                                                                preview.target_year
                                                                            }
                                                                            .
                                                                            Restano
                                                                            invariate;
                                                                            questa
                                                                            operazione
                                                                            aggiunge
                                                                            una
                                                                            nuova
                                                                            previsione
                                                                            dalla
                                                                            quota{' '}
                                                                            {
                                                                                preview.source_year
                                                                            }
                                                                            .
                                                                        </p>
                                                                    )}
                                                                {summary &&
                                                                    expense.project_id !==
                                                                        null && (
                                                                        <p className="mt-1 pl-10 text-xs text-muted-foreground">
                                                                            Il
                                                                            collegamento
                                                                            al
                                                                            progetto
                                                                            sorgente
                                                                            non
                                                                            verrà
                                                                            copiato.
                                                                        </p>
                                                                    )}
                                                            </TableCell>
                                                            <TableCell className="text-right tabular-nums">
                                                                {money(
                                                                    expense.allocated,
                                                                    'Non presente',
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ))}
                                        </Fragment>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </FieldSet>
            );
        });
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !busy) onClose();
            }}
        >
            <DialogContent
                ref={content}
                className="max-h-[90vh] overflow-y-auto sm:max-w-6xl"
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>
                        {summary
                            ? '2. Riepilogo importazione'
                            : '1. Seleziona e configura'}
                    </DialogTitle>
                    <DialogDescription>
                        Importa dall’anno precedente
                        {preview
                            ? `: ${preview.source_year} → ${preview.target_year}`
                            : ''}
                        . I contratti saranno copie indipendenti.
                    </DialogDescription>
                </DialogHeader>
                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>Operazione non completata</AlertTitle>
                        <AlertDescription>
                            {error}
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void load()}
                            >
                                Aggiorna anteprima
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
                {!preview && (
                    <p role="status">
                        {busy
                            ? 'Caricamento contratti…'
                            : 'Anteprima non disponibile.'}
                    </p>
                )}
                {preview && (
                    <>
                        {preview.legacy_count > 0 && (
                            <Alert>
                                <AlertTitle>
                                    Contratti storici senza anno
                                </AlertTitle>
                                <AlertDescription>
                                    {preview.legacy_count} contratti richiedono
                                    una classificazione esplicita prima
                                    dell’importazione. Restano disponibili
                                    nell’archivio.
                                </AlertDescription>
                            </Alert>
                        )}
                        <form
                            ref={form}
                            onSubmit={(event) => {
                                event.preventDefault();
                                setSummary(true);
                            }}
                            className="flex min-w-0 flex-col gap-4"
                        >
                            {!summary && (
                                <FieldSet>
                                    <FieldLegend className="sr-only">
                                        Selezione massiva
                                    </FieldLegend>
                                    <FieldGroup className="flex-row flex-wrap gap-6">
                                        <Field
                                            orientation="horizontal"
                                            className="w-auto"
                                        >
                                            <Checkbox
                                                id="annual-all-contracts"
                                                disabled={
                                                    busy ||
                                                    available.length === 0
                                                }
                                                checked={
                                                    chosen.length === 0
                                                        ? false
                                                        : chosen.length ===
                                                            available.length
                                                          ? true
                                                          : 'indeterminate'
                                                }
                                                onCheckedChange={(checked) =>
                                                    checked === true
                                                        ? selectAll()
                                                        : setSelection({})
                                                }
                                            />
                                            <FieldLabel htmlFor="annual-all-contracts">
                                                Tutti i contratti
                                            </FieldLabel>
                                        </Field>
                                        <Field
                                            orientation="horizontal"
                                            className="w-auto"
                                        >
                                            <Checkbox
                                                id="annual-all-expenses"
                                                disabled={
                                                    busy || expenseCount === 0
                                                }
                                                checked={
                                                    selectedExpenseCount === 0
                                                        ? false
                                                        : selectedExpenseCount ===
                                                            expenseCount
                                                          ? true
                                                          : 'indeterminate'
                                                }
                                                onCheckedChange={(checked) =>
                                                    selectAllExpenses(
                                                        checked === true,
                                                    )
                                                }
                                            />
                                            <FieldLabel htmlFor="annual-all-expenses">
                                                Tutte le spese allocate
                                            </FieldLabel>
                                        </Field>
                                    </FieldGroup>
                                </FieldSet>
                            )}
                            <p className="text-sm text-muted-foreground">
                                Selezionati: {chosen.length} contratti ·{' '}
                                {selectedExpenseCount} spese allocate
                            </p>
                            {preview.contracts.length === 0 && (
                                <Empty>
                                    <EmptyHeader>
                                        <EmptyTitle>
                                            Nessun contratto nell’anno{' '}
                                            {preview.source_year}
                                        </EmptyTitle>
                                    </EmptyHeader>
                                </Empty>
                            )}
                            {tables}
                            {summary && (
                                <>
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-4 font-medium">
                                        <span>
                                            Totale allocato{' '}
                                            {preview.target_year}
                                        </span>
                                        <span className="tabular-nums">
                                            {money(decimal(total))}
                                        </span>
                                    </div>
                                </>
                            )}
                        </form>
                    </>
                )}
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                            summary ? setSummary(false) : onClose()
                        }
                    >
                        {summary ? 'Indietro' : 'Annulla'}
                    </Button>
                    <Button
                        type="button"
                        disabled={busy || chosen.length === 0}
                        onClick={() => {
                            if (summary) void commit();
                            else form.current?.requestSubmit();
                        }}
                    >
                        {busy
                            ? 'Attendi…'
                            : summary
                              ? 'Conferma importazione'
                              : 'Riepilogo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

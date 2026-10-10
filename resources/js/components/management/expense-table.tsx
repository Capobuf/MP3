import { Skeleton } from '@/components/ui/skeleton';
import { Link, router, usePage } from '@inertiajs/react';
import { ArrowDown, ArrowUp, Ellipsis } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { CostCenterTags } from './cost-center-tags';
import { api, dateLabel, money, varianceTextClass } from './helpers';
import type { DeletionResult, Expense, Filters } from './types';

type AmountField = 'allocated_amount' | 'actual_amount';
const amountLabels = {
    allocated_amount: 'Allocato',
    actual_amount: 'Effettivo',
};

export function ExpenseTable({
    rows,
    loading = false,
    slug,
    onEdit,
    showYear = false,
    contractMode = false,
    filters,
    onSort,
    onBusyChange,
}: {
    rows: Expense[];
    loading?: boolean;
    slug: string;
    onEdit: (expense: Expense) => void;
    showYear?: boolean;
    contractMode?: boolean;
    filters?: Filters;
    onSort?: (field: string) => void;
    onBusyChange?: (busy: boolean) => void;
}) {
    const { url } = usePage();
    const scope = JSON.stringify([slug, url, rows.map((row) => row.id)]);
    const [previousScope, setPreviousScope] = useState(scope);
    const [selected, setSelected] = useState<number[]>([]);
    const [deleting, setDeleting] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    const refreshing = useRef(false);
    if (previousScope !== scope) {
        setPreviousScope(scope);
        setSelected([]);
        setDeleting([]);
        setError('');
    }

    useEffect(() => {
        const stop = router.on('before', (event) => {
            if (refreshing.current) {
                refreshing.current = false;
                return;
            }
            if (lock.current) {
                event.preventDefault();
                toast.info('Attendi il completamento dell’operazione.');
            }
        });
        const leave = (event: BeforeUnloadEvent) => {
            if (lock.current) event.preventDefault();
        };
        window.addEventListener('beforeunload', leave);
        return () => {
            stop();
            window.removeEventListener('beforeunload', leave);
        };
    }, []);

    async function mutate() {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        onBusyChange?.(true);
        setError('');
        let persisted = false;
        try {
            const result = await api<DeletionResult>(
                `/t/${slug}/expenses/batch`,
                'DELETE',
                { ids: deleting },
            );
            setDeleting([]);
            setSelected([]);
            persisted = true;
            refreshing.current = true;
            const pageNumber = Number(
                new URL(url, window.location.origin).searchParams.get('page') ??
                    1,
            );
            await new Promise<void>((resolve, reject) => {
                let refreshed = false;
                router.reload({
                    ...(deleting.length === rows.length && pageNumber > 1
                        ? { data: { page: pageNumber - 1 } }
                        : {}),
                    onSuccess: () => {
                        refreshed = true;
                        resolve();
                    },
                    onFinish: () => {
                        if (!refreshed)
                            reject(
                                new Error(
                                    'Aggiornamento della pagina non riuscito.',
                                ),
                            );
                    },
                    onHttpException: () => false,
                    onNetworkError: () => false,
                });
            });
            if (result.cleanup_failed) {
                setError(result.message);
                toast.error(result.message);
            } else toast.success(result.message);
        } catch (failure) {
            const message =
                failure instanceof Error
                    ? failure.message
                    : 'Operazione non riuscita.';
            const detail = persisted
                ? 'Operazione completata sul server, ma i dati visualizzati non sono aggiornati. Ricarica la pagina prima di continuare.'
                : `${message} Eliminazione non confermata. La selezione è conservata.`;
            setError(detail);
            toast.error(detail);
        } finally {
            lock.current = false;
            refreshing.current = false;
            setBusy(false);
            onBusyChange?.(false);
        }
    }

    function amount(expense: Expense, field: AmountField) {
        return (
            <button
                type="button"
                disabled={busy}
                aria-label={`Modifica ${amountLabels[field].toLowerCase()} per ${expense.title}`}
                className="min-h-9 rounded px-1 text-right text-sm font-medium tracking-normal whitespace-nowrap text-foreground tabular-nums hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => onEdit(expense)}
            >
                {money(expense[field])}
            </button>
        );
    }

    function heading(label: string, field: string) {
        if (!onSort) return label;
        const sorted = filters?.sort === field;
        const Icon = filters?.direction === 'desc' ? ArrowDown : ArrowUp;
        return (
            <button
                type="button"
                disabled={busy}
                onClick={() => onSort(field)}
                className="inline-flex min-h-9 items-center gap-1 rounded text-xs hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
                {label}
                {sorted && <Icon aria-hidden="true" className="size-3" />}
                <span className="sr-only">
                    {' '}
                    · Ordina{' '}
                    {sorted && filters?.direction === 'asc'
                        ? 'decrescente'
                        : 'crescente'}
                </span>
            </button>
        );
    }
    function sortDirection(field: string) {
        return filters?.sort === field
            ? filters.direction === 'desc'
                ? 'descending'
                : 'ascending'
            : 'none';
    }
    const allSelected = rows.length > 0 && selected.length === rows.length;
    const amountCell =
        'col-span-2 col-start-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-0.5 pl-0 whitespace-normal xl:table-cell xl:w-44 xl:px-3 xl:py-3 xl:text-right';

    return (
        <div
            className="flex min-w-0 flex-col gap-3"
            aria-busy={busy || loading}
        >
            {selected.length > 0 && (
                <div
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-accent px-4 py-3 text-sm"
                    aria-label="Azioni sulle spese selezionate"
                >
                    <span role="status" className="mr-auto">
                        {selected.length}{' '}
                        {selected.length === 1
                            ? 'spesa selezionata'
                            : 'spese selezionate'}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setSelected([])}
                    >
                        Deseleziona tutto
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        disabled={busy}
                        onClick={() => setDeleting([...selected])}
                    >
                        Elimina selezionate
                    </Button>
                </div>
            )}
            <p
                id="expense-edit-help"
                className="text-sm text-muted-foreground"
                aria-live="polite"
            >
                {busy
                    ? 'Operazione in corso…'
                    : loading
                      ? 'Aggiornamento delle spese…'
                      : 'Clic sugli importi per modificare la spesa.'}
            </p>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <div className="min-w-0 overflow-hidden rounded-xl border bg-card px-3 shadow-xs sm:px-4">
                <Table className="block table-fixed xl:table">
                    <TableHeader className="block xl:table-header-group">
                        <TableRow className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center border-border/60 hover:bg-transparent xl:table-row">
                            <TableHead className="flex items-center pl-0 xl:table-cell xl:w-10 xl:pl-2">
                                <Checkbox
                                    aria-label="Seleziona tutte le spese della pagina"
                                    disabled={busy || !rows.length}
                                    checked={
                                        allSelected
                                            ? true
                                            : selected.length
                                              ? 'indeterminate'
                                              : false
                                    }
                                    onCheckedChange={(checked) =>
                                        setSelected(
                                            checked === true
                                                ? rows.map((row) => row.id)
                                                : [],
                                        )
                                    }
                                />
                            </TableHead>
                            <TableHead
                                aria-sort={
                                    onSort ? sortDirection('title') : undefined
                                }
                                className="flex items-center px-0 text-sm text-muted-foreground xl:table-cell xl:px-2"
                            >
                                {heading('Descrizione', 'title')}
                            </TableHead>
                            {contractMode && (
                                <>
                                    <TableHead className="hidden w-52 xl:table-cell">
                                        Periodo coperto
                                    </TableHead>
                                    <TableHead className="hidden w-24 xl:table-cell">
                                        Anno di imputazione
                                    </TableHead>
                                </>
                            )}
                            <TableHead
                                aria-sort={
                                    onSort
                                        ? sortDirection('allocated_amount')
                                        : undefined
                                }
                                className="hidden w-44 text-right text-sm text-muted-foreground xl:table-cell"
                            >
                                {heading(
                                    contractMode ? 'Previsto' : 'Allocato',
                                    'allocated_amount',
                                )}
                            </TableHead>
                            <TableHead
                                aria-sort={
                                    onSort
                                        ? sortDirection('actual_amount')
                                        : undefined
                                }
                                className="hidden w-44 text-right text-sm text-muted-foreground xl:table-cell"
                            >
                                {heading('Effettivo', 'actual_amount')}
                            </TableHead>
                            {!contractMode && (
                                <TableHead className="hidden w-44 text-right text-sm text-muted-foreground xl:table-cell">
                                    Scostamento
                                </TableHead>
                            )}
                            <TableHead className="w-10">
                                <span className="sr-only">Azioni</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody className="block xl:table-row-group">
                        {!rows.length && (
                            <TableRow className="block xl:table-row">
                                <TableCell
                                    colSpan={contractMode ? 7 : 6}
                                    className="block py-10 text-center whitespace-normal text-muted-foreground xl:table-cell"
                                >
                                    {loading ? (
                                        <Skeleton className="mx-auto h-10 w-3/4" />
                                    ) : (
                                        'Nessuna spesa in questo perimetro. Aggiungi una spesa oppure modifica i filtri.'
                                    )}
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.map((expense) => (
                            <TableRow
                                key={expense.id}
                                data-state={
                                    selected.includes(expense.id)
                                        ? 'selected'
                                        : undefined
                                }
                                className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] gap-y-0 border-border/50 py-3 hover:bg-muted/50 data-[state=selected]:bg-accent xl:table-row xl:h-14 xl:py-0"
                            >
                                <TableCell className="col-start-1 row-start-1 pl-0 xl:pl-2">
                                    <Checkbox
                                        aria-label={`Seleziona ${expense.title}`}
                                        checked={selected.includes(expense.id)}
                                        disabled={busy}
                                        onCheckedChange={(checked) =>
                                            setSelected((previous) =>
                                                checked === true
                                                    ? [...previous, expense.id]
                                                    : previous.filter(
                                                          (id) =>
                                                              id !== expense.id,
                                                      ),
                                            )
                                        }
                                    />
                                </TableCell>
                                <TableCell className="col-start-2 row-start-1 min-w-0 px-0 whitespace-normal xl:px-2">
                                    <Link
                                        href={`/t/${slug}/expenses/${expense.id}`}
                                        className="block rounded font-medium break-words focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                        title={expense.title}
                                    >
                                        {expense.title}
                                    </Link>
                                    <p
                                        className="mt-1 line-clamp-2 text-sm text-muted-foreground"
                                        title={`${expense.vendor?.name ?? 'Senza fornitore'} · ${expense.project?.name ?? 'Senza progetto'}`}
                                    >
                                        {expense.vendor?.name ??
                                            'Senza fornitore'}{' '}
                                        ·{' '}
                                        {expense.project?.name ??
                                            'Senza progetto'}
                                        {showYear &&
                                            !contractMode &&
                                            ` · ${expense.year}`}
                                        {contractMode &&
                                            !!expense.lines?.length &&
                                            ` · ${expense.lines.length} ${expense.lines.length === 1 ? 'condizione economica' : 'condizioni economiche'}`}
                                    </p>
                                    <CostCenterTags
                                        centers={expense.cost_centers}
                                    />
                                </TableCell>
                                {contractMode && (
                                    <>
                                        <TableCell className={amountCell}>
                                            <span className="text-sm text-muted-foreground xl:hidden">
                                                Periodo coperto
                                            </span>
                                            <span>
                                                {expense.period_starts_on &&
                                                expense.period_ends_on
                                                    ? `${dateLabel(expense.period_starts_on)} – ${dateLabel(expense.period_ends_on)}`
                                                    : 'Periodo non indicato'}
                                            </span>
                                        </TableCell>
                                        <TableCell className={amountCell}>
                                            <span className="text-sm text-muted-foreground xl:hidden">
                                                Anno di imputazione
                                            </span>
                                            {[
                                                ...new Set(
                                                    expense.lines?.map(
                                                        (line) =>
                                                            line.year ??
                                                            expense.year,
                                                    ) ?? [expense.year],
                                                ),
                                            ]
                                                .sort(
                                                    (left, right) =>
                                                        Number(left) -
                                                        Number(right),
                                                )
                                                .join(', ') || expense.year}
                                        </TableCell>
                                    </>
                                )}
                                <TableCell className={amountCell}>
                                    <span className="text-sm text-muted-foreground xl:hidden">
                                        {contractMode ? 'Previsto' : 'Allocato'}
                                    </span>
                                    {amount(expense, 'allocated_amount')}
                                </TableCell>
                                <TableCell className={amountCell}>
                                    <span className="text-sm text-muted-foreground xl:hidden">
                                        Effettivo
                                    </span>
                                    {amount(expense, 'actual_amount')}
                                </TableCell>
                                {!contractMode && (
                                    <TableCell
                                        className={cn(
                                            amountCell,
                                            'text-sm font-medium tabular-nums',
                                            varianceTextClass(expense.variance),
                                        )}
                                    >
                                        <span className="text-xs font-normal text-muted-foreground xl:hidden">
                                            Scostamento
                                        </span>
                                        <span className="tracking-normal whitespace-nowrap">
                                            {expense.variance == null
                                                ? 'Non determinabile'
                                                : money(expense.variance)}
                                        </span>
                                    </TableCell>
                                )}
                                <TableCell className="col-start-3 row-start-1 px-0 text-right xl:px-2">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={`Azioni per ${expense.title}`}
                                                disabled={busy}
                                            >
                                                <Ellipsis className="size-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuGroup>
                                                <DropdownMenuItem asChild>
                                                    <Link
                                                        href={`/t/${slug}/expenses/${expense.id}`}
                                                    >
                                                        Apri dettaglio
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        onEdit(expense)
                                                    }
                                                >
                                                    Modifica
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    variant="destructive"
                                                    onSelect={() =>
                                                        setDeleting([
                                                            expense.id,
                                                        ])
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
            </div>
            <AlertDialog
                open={deleting.length > 0}
                onOpenChange={(open) => {
                    if (!open && !busy) {
                        setDeleting([]);
                        setError('');
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Eliminare{' '}
                            {deleting.length === 1
                                ? 'questa spesa'
                                : `${deleting.length} spese`}
                            ?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Le spese selezionate verranno eliminate
                            definitivamente. L’operazione non può essere
                            annullata.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            Annulla
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={busy}
                            onClick={(event) => {
                                event.preventDefault();
                                void mutate();
                            }}
                        >
                            {busy ? 'Eliminazione…' : 'Elimina'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

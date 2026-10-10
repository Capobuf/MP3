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
import { api, money } from './helpers';
import type { Expense, Filters } from './types';

type AmountField = 'allocated_amount' | 'actual_amount';
const amountLabels = {
    allocated_amount: 'Allocato',
    actual_amount: 'Effettivo',
};

export function ExpenseTable({
    rows,
    slug,
    onEdit,
    showYear = false,
    filters,
    onSort,
    onBusyChange,
}: {
    rows: Expense[];
    slug: string;
    onEdit: (expense: Expense) => void;
    showYear?: boolean;
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
            await api(`/t/${slug}/expenses/batch`, 'DELETE', { ids: deleting });
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
            toast.success('Spese eliminate.');
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
                aria-label={`Modifica le righe ${amountLabels[field].toLowerCase()} per ${expense.title}`}
                className="min-h-8 rounded px-1 text-right text-sm font-medium tabular-nums hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
        'col-span-2 col-start-2 flex min-w-0 items-center justify-between gap-3 py-0.5 pl-0 whitespace-normal lg:table-cell lg:w-36 lg:px-2 lg:py-2 lg:text-right';

    return (
        <div className="min-w-0 space-y-2">
            {selected.length > 0 && (
                <div
                    className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
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
                className="text-xs text-muted-foreground"
                aria-live="polite"
            >
                {busy
                    ? 'Operazione in corso…'
                    : 'Clic su allocato o effettivo per modificare le righe della spesa.'}
            </p>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <Table className="block table-fixed lg:table">
                <TableHeader className="block lg:table-header-group">
                    <TableRow className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center border-border/60 hover:bg-transparent lg:table-row">
                        <TableHead className="flex items-center pl-0 lg:table-cell lg:w-10 lg:pl-2">
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
                            className="flex items-center px-0 text-xs text-muted-foreground lg:table-cell lg:px-2"
                        >
                            {heading('Descrizione', 'title')}
                        </TableHead>
                        <TableHead
                            aria-sort={
                                onSort
                                    ? sortDirection('allocated_amount')
                                    : undefined
                            }
                            className="hidden w-36 text-right text-xs text-muted-foreground lg:table-cell"
                        >
                            {heading('Allocato', 'allocated_amount')}
                        </TableHead>
                        <TableHead
                            aria-sort={
                                onSort
                                    ? sortDirection('actual_amount')
                                    : undefined
                            }
                            className="hidden w-36 text-right text-xs text-muted-foreground lg:table-cell"
                        >
                            {heading('Effettivo', 'actual_amount')}
                        </TableHead>
                        <TableHead className="hidden w-36 text-right text-xs text-muted-foreground lg:table-cell">
                            Scostamento
                        </TableHead>
                        <TableHead className="w-10">
                            <span className="sr-only">Azioni</span>
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody className="block lg:table-row-group">
                    {!rows.length && (
                        <TableRow className="block lg:table-row">
                            <TableCell
                                colSpan={6}
                                className="block py-10 text-center whitespace-normal text-muted-foreground lg:table-cell"
                            >
                                Nessuna spesa in questo perimetro. Aggiungi una
                                spesa oppure modifica i filtri.
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
                            className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] gap-y-0 border-border/50 py-3 hover:bg-muted/30 data-[state=selected]:bg-muted/50 lg:table-row lg:h-14 lg:py-0"
                        >
                            <TableCell className="col-start-1 row-start-1 pl-0 lg:pl-2">
                                <Checkbox
                                    aria-label={`Seleziona ${expense.title}`}
                                    checked={selected.includes(expense.id)}
                                    disabled={busy}
                                    onCheckedChange={(checked) =>
                                        setSelected((previous) =>
                                            checked === true
                                                ? [...previous, expense.id]
                                                : previous.filter(
                                                      (id) => id !== expense.id,
                                                  ),
                                        )
                                    }
                                />
                            </TableCell>
                            <TableCell className="col-start-2 row-start-1 min-w-0 px-0 whitespace-normal lg:px-2">
                                <Link
                                    href={`/t/${slug}/expenses/${expense.id}`}
                                    className="block truncate rounded font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    title={expense.title}
                                >
                                    {expense.title}
                                </Link>
                                <p
                                    className="truncate text-xs text-muted-foreground"
                                    title={`${expense.vendor?.name ?? 'Senza fornitore'} · ${expense.project?.name ?? 'Senza progetto'}`}
                                >
                                    {expense.vendor?.name ?? 'Senza fornitore'}{' '}
                                    ·{' '}
                                    {expense.project?.name ?? 'Senza progetto'}
                                    {showYear && ` · ${expense.year}`}
                                </p>
                            </TableCell>
                            <TableCell className={amountCell}>
                                <span className="text-xs text-muted-foreground lg:hidden">
                                    Allocato
                                </span>
                                {amount(expense, 'allocated_amount')}
                            </TableCell>
                            <TableCell className={amountCell}>
                                <span className="text-xs text-muted-foreground lg:hidden">
                                    Effettivo
                                </span>
                                {amount(expense, 'actual_amount')}
                            </TableCell>
                            <TableCell
                                className={`${amountCell} text-sm font-medium tabular-nums ${Number(expense.variance) > 0 ? 'text-amber-700 dark:text-amber-400' : expense.variance == null ? 'text-muted-foreground' : ''}`}
                            >
                                <span className="text-xs font-normal text-muted-foreground lg:hidden">
                                    Scostamento
                                </span>
                                <span className="wrap-anywhere">
                                    {expense.variance == null
                                        ? 'Non determinabile'
                                        : money(expense.variance)}
                                </span>
                            </TableCell>
                            <TableCell className="col-start-3 row-start-1 px-0 text-right lg:px-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            aria-label={`Azioni per ${expense.title}`}
                                            disabled={busy}
                                        >
                                            <Ellipsis className="size-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem asChild>
                                            <Link
                                                href={`/t/${slug}/expenses/${expense.id}`}
                                            >
                                                Apri dettaglio
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onSelect={() => onEdit(expense)}
                                        >
                                            Modifica
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            variant="destructive"
                                            onSelect={() =>
                                                setDeleting([expense.id])
                                            }
                                        >
                                            Elimina
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
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

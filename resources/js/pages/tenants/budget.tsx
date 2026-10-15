import { SpreadsheetActions } from '@/components/management/spreadsheet-actions';
import { changeEconomicYear } from '@/lib/economic-year';
import { Head, router } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { Ellipsis, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { BudgetSankey } from '@/components/management/budget-sankey';
import { BudgetTable } from '@/components/management/budget-table';
import {
    BudgetEntrySheet,
    BudgetMissingSheet,
} from '@/components/management/budget-entry-sheet';
import { EntityForm } from '@/components/management/entity-form';
import type { EntityFormHandle } from '@/components/management/entity-form';
import { api } from '@/components/management/helpers';
import { DashboardSummary } from '@/components/management/dashboard-summary';
import { budgetSummary } from '@/components/management/budget-types';
import type {
    BudgetProps,
    BudgetSnapshot,
    BudgetYear,
} from '@/components/management/budget-types';
import type { RecordData } from '@/components/management/types';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
    EmptyContent,
} from '@/components/ui/empty';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageRefresh } from '@/hooks/use-page-refresh';
import { useUnsavedNavigation } from '@/hooks/use-unsaved-navigation';

function BudgetHeader({
    props,
    busy,
    onNewYear,
    onCopy,
}: {
    props: BudgetProps;
    busy: boolean;
    onNewYear: (year: number) => void;
    onCopy?: () => void;
}) {
    return (
        <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <p className="text-sm text-muted-foreground">
                    {props.tenant.name}
                </p>
                <h1 className="page-title">Budget</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    variant="outline"
                    onClick={() =>
                        onNewYear(
                            props.budgetYear
                                ? Math.min(2100, props.selectedYear + 1)
                                : props.selectedYear,
                        )
                    }
                >
                    <Plus data-icon="inline-start" />
                    Nuovo anno
                </Button>
                {onCopy && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={busy}>
                                Gestisci anno{' '}
                                <Ellipsis data-icon="inline-end" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                                <DropdownMenuItem
                                    disabled={busy}
                                    onSelect={() => {
                                        onCopy?.();
                                    }}
                                >
                                    Copia struttura dall’anno precedente
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                <SpreadsheetActions
                    slug={props.tenant.slug}
                    resource="budget"
                    label="Budget"
                    filters={{ year: props.selectedYear }}
                    disabled={busy}
                />
            </div>
        </header>
    );
}

function BudgetWorkspace({
    props,
    year,
    initial,
    onNewYear,
    pending,
}: {
    props: BudgetProps;
    year: BudgetYear;
    initial: BudgetSnapshot;
    onNewYear: (year: number) => void;
    pending: boolean;
}) {
    const [budget, setBudget] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [add, setAdd] = useState(false);
    const [missing, setMissing] = useState(false);
    const [typeFilter, setTypeFilter] = useState('all');
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [editing, setEditing] = useState<RecordData | null>(null);
    const [expenseFormBusy, setExpenseFormBusy] = useState(false);
    const expenseForm = useRef<EntityFormHandle>(null);
    const lock = useRef(false);
    const base = `/t/${props.tenant.slug}/budget/years/${year.id}`;
    useEffect(() => {
        setBudget(initial);
    }, [initial]);
    useEffect(() => {
        const stop = router.on('before', (event) => {
            if (lock.current) event.preventDefault();
        });
        return stop;
    }, []);
    async function mutate(suffix: string, method: string, payload?: unknown) {
        if (lock.current) return false;
        lock.current = true;
        setBusy(true);
        setError('');
        try {
            const result = await api<{
                budget: BudgetSnapshot;
                message: string;
                reassigned: number[];
            }>(`${base}/${suffix}`, method, payload);
            setBudget(result.budget);
            setNotice(result.reassigned.length ? result.message : '');
            toast.success(result.message);
            return true;
        } catch (failure) {
            const message =
                failure instanceof Error
                    ? failure.message
                    : 'Operazione non riuscita.';
            setError(message);
            toast.error(message);
            return false;
        } finally {
            lock.current = false;
            setBusy(false);
        }
    }
    async function refresh() {
        setLoading(true);
        try {
            const result = await api<{ budget: BudgetSnapshot }>(base);
            setBudget(result.budget);
            setError('');
        } catch (failure) {
            const message =
                failure instanceof Error
                    ? failure.message
                    : 'Aggiornamento non riuscito.';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }
    async function saveRecord(
        resource: string,
        id: number,
        changes: Record<string, unknown>,
    ) {
        if (lock.current)
            throw new Error('Attendi il completamento dell’operazione.');
        lock.current = true;
        setBusy(true);
        try {
            await api(
                `/t/${props.tenant.slug}/${resource}/${id}`,
                'PATCH',
                changes,
            );
            const result = await api<{ budget: BudgetSnapshot }>(base);
            setBudget(result.budget);
        } finally {
            lock.current = false;
            setBusy(false);
        }
    }
    async function editExpense(id: number) {
        setLoading(true);
        try {
            const result = await api<{ record: RecordData }>(
                `/t/${props.tenant.slug}/budget/options?type=expense&id=${id}`,
            );
            setEditing(result.record);
        } catch (failure) {
            toast.error(
                failure instanceof Error
                    ? failure.message
                    : 'Spesa non disponibile.',
            );
        } finally {
            setLoading(false);
        }
    }
    const totals = budget.totals;
    return (
        <>
            <BudgetHeader
                props={props}
                busy={busy || loading || pending}
                onNewYear={onNewYear}
                onCopy={() => {
                    void mutate('copy', 'POST');
                }}
            />
            <section aria-label="Riepilogo budget">
                <DashboardSummary
                    analytics={budgetSummary(totals, props.previousBudget)}
                    year={year.year}
                    scope="budget"
                />
            </section>
            <BudgetSankey budget={budget} />
            <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || loading}
                        onClick={() => {
                            void refresh();
                        }}
                    >
                        <RefreshCw data-icon="inline-start" />
                        Aggiorna
                    </Button>
                </div>
            </div>
            {notice && (
                <Alert>
                    <AlertTitle>Attribuzione aggiornata</AlertTitle>
                    <AlertDescription>
                        {notice} Le spese originali conservano i loro
                        collegamenti.
                    </AlertDescription>
                </Alert>
            )}
            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Operazione non completata</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            <BudgetTable
                budget={budget}
                slug={props.tenant.slug}
                year={year.year}
                centers={props.options.cost_centers}
                busy={busy || loading || pending}
                loading={loading}
                mutate={mutate}
                typeFilter={typeFilter}
                setTypeFilter={setTypeFilter}
                onAdd={() => setAdd(true)}
                onMissing={() => setMissing(true)}
                onRecordSave={saveRecord}
                onExpenseEdit={(id) => {
                    void editExpense(id);
                }}
            />
            <BudgetEntrySheet
                budgetYear={props.budgetYear!}
                open={add}
                onClose={() => setAdd(false)}
                slug={props.tenant.slug}
                entries={budget.entries}
                centers={props.options.cost_centers}
                busy={busy || loading || pending}
                mutate={mutate}
            />
            <BudgetMissingSheet
                open={missing}
                onClose={() => setMissing(false)}
                path={base}
                busy={busy || loading || pending}
                mutate={mutate}
            />
            <Sheet
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) expenseForm.current?.requestClose();
                }}
            >
                <SheetContent
                    closeDisabled={expenseFormBusy}
                    className="w-full overflow-y-auto sm:max-w-5xl"
                    onEscapeKeyDown={(event) => event.preventDefault()}
                    onInteractOutside={(event) => event.preventDefault()}
                >
                    <SheetHeader>
                        <SheetTitle>Modifica spesa originale</SheetTitle>
                        <SheetDescription>
                            Dopo il salvataggio il Budget viene ricalcolato per
                            l’anno selezionato.
                        </SheetDescription>
                    </SheetHeader>
                    {editing && (
                        <EntityForm
                            ref={expenseForm}
                            key={editing.id}
                            tenant={props.tenant}
                            kind="expenses"
                            record={editing}
                            year={editing.year}
                            options={props.options}
                            onBusyChange={setExpenseFormBusy}
                            onClose={() => setEditing(null)}
                            onSaved={() => {
                                setEditing(null);
                                void refresh();
                            }}
                        />
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}

export default function Budget(props: BudgetProps) {
    const [newYear, setNewYear] = useState(false);
    const [draftYear, setDraftYear] = useState(String(props.selectedYear));
    const [creating, setCreating] = useState(false);
    const [yearError, setYearError] = useState('');
    const navigation = useUnsavedNavigation(false, creating);
    const path = `/t/${props.tenant.slug}/budget`;
    const refresh = usePageRefresh(path);
    function selectYear(year: number) {
        changeEconomicYear(year);
    }
    function createDialog(year: number) {
        setDraftYear(String(year));
        setYearError('');
        setNewYear(true);
    }
    async function createYear(event: React.SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (creating) return;
        setCreating(true);
        setYearError('');
        try {
            const result = await api<{ year: BudgetYear }>(
                `${path}/years`,
                'POST',
                { year: draftYear },
            );
            setNewYear(false);
            toast.success('Anno di Budget creato.');
            navigation.allow();
            selectYear(result.year.year);
        } catch (failure) {
            setYearError(
                failure instanceof Error
                    ? failure.message
                    : 'Creazione non riuscita.',
            );
        } finally {
            setCreating(false);
        }
    }
    return (
        <>
            <Head
                title={`Budget ${props.selectedYear} · ${props.tenant.name}`}
            />
            <div className="page-shell">
                {(!props.budgetYear || !props.budget) && (
                    <BudgetHeader
                        props={props}
                        busy={refresh.pending}
                        onNewYear={createDialog}
                    />
                )}
                {refresh.visible && !props.budget ? (
                    <div
                        className="flex flex-col gap-4"
                        role="status"
                        aria-label="Caricamento Budget"
                    >
                        <Skeleton className="h-32" />
                        <Skeleton className="h-56" />
                        <Skeleton className="h-72" />
                    </div>
                ) : props.budgetYear && props.budget ? (
                    <BudgetWorkspace
                        key={`${props.tenant.id}:${props.budgetYear.id}`}
                        props={props}
                        year={props.budgetYear}
                        initial={props.budget}
                        onNewYear={createDialog}
                        pending={refresh.pending}
                    />
                ) : (
                    <Empty className="min-h-80 border">
                        <EmptyHeader>
                            <EmptyTitle>
                                Il Budget {props.selectedYear} è da creare
                            </EmptyTitle>
                            <EmptyDescription>
                                Crea un anno vuoto e scegli le voci da
                                includere. Puoi aggiungere dati dagli archivi
                                oppure compilare voci libere.
                            </EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                            <Button
                                onClick={() => createDialog(props.selectedYear)}
                            >
                                Crea Budget {props.selectedYear}
                            </Button>
                        </EmptyContent>
                    </Empty>
                )}
            </div>
            <Dialog
                open={newYear}
                onOpenChange={(open) => {
                    if (!creating) setNewYear(open);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nuovo anno di Budget</DialogTitle>
                        <DialogDescription>
                            L’anno nasce vuoto, pronto per la pianificazione.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={(event) => {
                            void createYear(event);
                        }}
                        className="flex flex-col gap-4"
                    >
                        <Field data-invalid={!!yearError}>
                            <FieldLabel htmlFor="budget-new-year">
                                Anno
                            </FieldLabel>
                            <Input
                                id="budget-new-year"
                                type="number"
                                min={2000}
                                max={2100}
                                value={draftYear}
                                required
                                disabled={creating}
                                aria-invalid={!!yearError}
                                aria-describedby={
                                    yearError ? 'budget-year-error' : undefined
                                }
                                onChange={(event) =>
                                    setDraftYear(event.target.value)
                                }
                            />
                            {yearError && (
                                <p
                                    id="budget-year-error"
                                    role="alert"
                                    className="text-sm text-destructive"
                                >
                                    {yearError}
                                </p>
                            )}
                        </Field>
                        <Button disabled={creating} type="submit">
                            {creating ? 'Creazione…' : 'Crea anno'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
Budget.layout = { breadcrumbs: [{ title: 'Budget', href: '/dashboard' }] };

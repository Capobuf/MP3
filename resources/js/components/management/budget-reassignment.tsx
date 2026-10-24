import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { api, money } from './helpers';
import type { RecordData } from './types';

type Values = {
    allocated: string | null;
    actual: string | null;
    variance: string | null;
};
export type BudgetReassignmentPreview = {
    expense: { id: number; title: string };
    target: {
        type: 'contract' | 'project';
        id: number;
        name: string;
        year: number | null;
    };
    valid: boolean;
    problem: string | null;
    token: string;
    years: {
        year: number;
        budget_id: number | null;
        direct_entries: { id: number; included: boolean }[];
        destination: 'included' | 'excluded' | 'missing';
        expense_before: Values | null;
        expense_after: Values | null;
        budget_before: Values | null;
        budget_after: Values | null;
        difference: Values;
    }[];
};

export class BudgetReassignmentRequired extends Error {
    constructor(
        public url: string,
        public data: Record<string, unknown>,
        public afterSaved?: () => void,
    ) {
        super('Questa spesa è già nel Budget.');
    }
}

const metrics = [
    ['allocated', 'Allocato'],
    ['actual', 'Effettivo'],
    ['variance', 'Scostamento'],
] as const;

function AmountRow({
    label,
    before,
    after,
    difference,
}: {
    label: string;
    before: string | null | undefined;
    after: string | null | undefined;
    difference?: string | null;
}) {
    if (before == null && after == null) return null;
    const changed = before != null && after != null && before !== after;
    return (
        <div
            className={cn(
                'grid items-baseline gap-x-4 gap-y-1 py-2',
                changed
                    ? 'grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto]'
                    : 'grid-cols-[minmax(0,1fr)_auto]',
            )}
        >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd
                className={cn(
                    'flex flex-wrap items-center gap-2 financial-value',
                    changed ? 'sm:justify-end' : 'justify-end',
                )}
            >
                {changed ? (
                    <>
                        <span className="text-muted-foreground">
                            <span className="sr-only">Prima: </span>
                            {money(before)}
                        </span>
                        <ArrowRight
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <span className="font-medium">
                            <span className="sr-only">Dopo: </span>
                            {money(after)}
                        </span>
                        {difference != null && Number(difference) !== 0 && (
                            <Badge variant="secondary">
                                <span className="sr-only">Variazione: </span>
                                {Number(difference) > 0 ? '+' : ''}
                                {money(difference)}
                            </Badge>
                        )}
                    </>
                ) : (
                    <>
                        {(before == null || after == null) && (
                            <span className="text-xs text-muted-foreground">
                                {before == null ? 'Dopo' : 'Prima'}
                            </span>
                        )}
                        <span className="font-medium">
                            {money(after ?? before)}
                        </span>
                    </>
                )}
            </dd>
        </div>
    );
}

export function BudgetReassignmentComparison({
    preview,
}: {
    preview: BudgetReassignmentPreview;
}) {
    const targetLabel =
        preview.target.type === 'contract' ? 'Contratto' : 'Progetto';
    const detailYears = preview.years.filter((year) =>
        metrics.some(
            ([key]) =>
                year.expense_before?.[key] != null ||
                year.expense_after?.[key] != null,
        ),
    );
    return (
        <div className="flex flex-col gap-5">
            <div>
                <h3 className="mb-3 font-semibold [overflow-wrap:anywhere]">
                    {preview.expense.title}
                </h3>
                <div className="grid gap-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <div className="min-w-0">
                        <p className="mb-1 text-xs text-muted-foreground">
                            Prima
                        </p>
                        <p className="font-medium">Voce singola</p>
                        {preview.years.flatMap((year) =>
                            year.direct_entries.map((entry) => (
                                <p
                                    key={entry.id}
                                    className="mt-1 text-xs text-muted-foreground"
                                >
                                    Budget {year.year} ·{' '}
                                    {entry.included ? 'Inclusa' : 'Esclusa'}
                                </p>
                            )),
                        )}
                    </div>
                    <ArrowRight
                        className="size-5 rotate-90 text-muted-foreground sm:rotate-0"
                        aria-hidden="true"
                    />
                    <div className="min-w-0">
                        <p className="mb-1 text-xs text-muted-foreground">
                            Dopo · {targetLabel.toLowerCase()}
                        </p>
                        <p className="font-semibold [overflow-wrap:anywhere]">
                            {preview.target.name}
                        </p>
                        {preview.years.map((year) => (
                            <p
                                key={year.year}
                                className="mt-1 text-xs text-muted-foreground"
                            >
                                Budget {year.year} ·{' '}
                                {year.destination === 'included'
                                    ? 'Incluso'
                                    : year.destination === 'excluded'
                                      ? 'Escluso'
                                      : 'Non presente'}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
            {preview.years.map((year) => {
                const unchanged =
                    preview.valid &&
                    year.budget_before !== null &&
                    year.budget_after !== null &&
                    metrics.some(
                        ([key]) => year.budget_before?.[key] != null,
                    ) &&
                    metrics.every(
                        ([key]) =>
                            year.budget_before?.[key] ===
                            year.budget_after?.[key],
                    );
                return (
                    <section
                        key={year.year}
                        aria-label={`Confronto ${year.year}`}
                        className="flex flex-col gap-3"
                    >
                        <h3 className="text-sm font-medium">
                            {year.budget_id
                                ? 'Totale Budget'
                                : 'Nessun Budget per il'}{' '}
                            {year.year}
                        </h3>
                        {unchanged ? (
                            <p className="text-sm text-muted-foreground">
                                Il totale resta invariato.
                            </p>
                        ) : (
                            preview.valid &&
                            year.budget_id !== null && (
                                <dl className="divide-y">
                                    {metrics
                                        .filter(
                                            ([key]) =>
                                                year.budget_before?.[key] !==
                                                year.budget_after?.[key],
                                        )
                                        .map(([key, label]) => (
                                            <AmountRow
                                                key={key}
                                                label={label}
                                                before={
                                                    year.budget_before?.[key]
                                                }
                                                after={year.budget_after?.[key]}
                                                difference={
                                                    year.difference[key]
                                                }
                                            />
                                        ))}
                                </dl>
                            )
                        )}
                        {preview.valid && year.destination !== 'included' && (
                            <Alert>
                                <AlertDescription>
                                    {year.destination === 'excluded'
                                        ? `Il ${targetLabel.toLowerCase()} è escluso dal Budget.`
                                        : `Il ${targetLabel.toLowerCase()} non è nel Budget.`}{' '}
                                    La spesa non verrà conteggiata finché non lo
                                    includi.
                                </AlertDescription>
                            </Alert>
                        )}
                    </section>
                );
            })}
            {preview.valid && detailYears.length > 0 && (
                <Collapsible>
                    <CollapsibleTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="group -ml-2"
                        >
                            Dettagli economici
                            <ChevronDown
                                className="group-data-[state=open]:rotate-180"
                                aria-hidden="true"
                            />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                        <div className="flex flex-col gap-5">
                            {detailYears.map((year) => (
                                <section
                                    key={year.year}
                                    aria-label={`Dettagli ${year.year}`}
                                >
                                    <h4 className="mb-2 text-sm font-medium">
                                        Importi della spesa · {year.year}
                                    </h4>
                                    <dl className="divide-y">
                                        {metrics.map(([key, label]) => (
                                            <AmountRow
                                                key={key}
                                                label={label}
                                                before={
                                                    year.expense_before?.[key]
                                                }
                                                after={
                                                    year.expense_after?.[key]
                                                }
                                            />
                                        ))}
                                    </dl>
                                </section>
                            ))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    );
}

export function BudgetReassignment({
    request,
    onClose,
    onSaved,
    returnFocus,
}: {
    request: BudgetReassignmentRequired;
    onClose: () => void;
    onSaved: (record: RecordData) => void;
    returnFocus?: () => void;
}) {
    const [preview, setPreview] = useState<BudgetReassignmentPreview | null>(
        null,
    );
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [opener] = useState(() =>
        typeof document === 'undefined' ? null : document.activeElement,
    );
    useEffect(() => {
        let active = true;
        api<BudgetReassignmentPreview>(
            `${request.url}/budget-reassignment/preview`,
            'PATCH',
            request.data,
        )
            .then((data) => {
                if (active) setPreview(data);
            })
            .catch((failure: unknown) => {
                if (active)
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : 'Anteprima non disponibile.',
                    );
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [request, revision]);
    async function confirm() {
        if (!preview?.valid || loading || busy) return;
        setBusy(true);
        setError('');
        try {
            const result = await api<{ record: RecordData }>(
                `${request.url}/budget-reassignment`,
                'PATCH',
                { ...request.data, token: preview.token, confirmed: true },
            );
            toast.success('Spesa collegata. Budget aggiornato.');
            onSaved(result.record);
        } catch (failure) {
            setPreview(null);
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Operazione non riuscita. Ricarica l’anteprima.',
            );
        } finally {
            setBusy(false);
        }
    }
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !busy) onClose();
            }}
        >
            <DialogContent
                className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
                aria-busy={busy || loading}
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    if (returnFocus) returnFocus();
                    else if (opener instanceof HTMLElement) opener.focus();
                }}
            >
                <DialogHeader className="shrink-0 px-6 pt-6 pb-4 text-left">
                    <DialogTitle>Questa spesa è già nel Budget</DialogTitle>
                    <DialogDescription>
                        Collegandola, non comparirà più come voce singola. La
                        spesa non viene eliminata.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pb-4">
                    {loading && <p role="status">Caricamento anteprima…</p>}
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {preview && (
                        <BudgetReassignmentComparison preview={preview} />
                    )}
                    {preview?.problem && (
                        <Alert variant="destructive">
                            <AlertDescription>
                                {preview.problem}
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
                <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:flex-wrap">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={onClose}
                    >
                        Lascia invariato
                    </Button>
                    {error && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy || loading}
                            onClick={() => {
                                setPreview(null);
                                setError('');
                                setLoading(true);
                                setRevision((value) => value + 1);
                            }}
                        >
                            Ricarica anteprima
                        </Button>
                    )}
                    <Button
                        type="button"
                        className="h-auto whitespace-normal"
                        disabled={busy || loading || !preview?.valid}
                        onClick={() => void confirm()}
                    >
                        {busy
                            ? 'Collegamento…'
                            : `Collega al ${request.data.contract_id ? 'contratto' : 'progetto'}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

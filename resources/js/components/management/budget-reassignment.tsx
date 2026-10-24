import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { api, money, varianceTextClass } from './helpers';
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

function Amounts({
    values,
    difference = false,
}: {
    values: Values | null;
    difference?: boolean;
}) {
    return (
        <dl className="grid grid-cols-3 gap-2 text-sm">
            {(
                [
                    ['allocated', 'Allocato'],
                    ['actual', 'Effettivo'],
                    ['variance', 'Scostamento'],
                ] as const
            ).map(([key, label]) => {
                const value = values?.[key];
                return (
                    <div key={key} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">
                            {label}
                        </dt>
                        <dd
                            className={`financial-value break-words ${key === 'variance' && !difference ? varianceTextClass(value) : ''}`}
                        >
                            {difference && Number(value) > 0 ? '+' : ''}
                            {money(value, 'Non disponibile')}
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}

export function BudgetReassignmentComparison({
    preview,
}: {
    preview: BudgetReassignmentPreview;
}) {
    const targetLabel =
        preview.target.type === 'contract' ? 'contratto' : 'progetto';
    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm">
                <strong>{preview.expense.title}</strong> → {targetLabel}{' '}
                <strong>{preview.target.name}</strong>
            </p>
            {preview.years.map((year) => (
                <section
                    key={year.year}
                    aria-label={`Confronto ${year.year}`}
                    className="flex flex-col gap-3"
                >
                    <h3 className="font-medium">
                        {year.budget_id ? 'Budget' : 'Anno senza Budget'}{' '}
                        {year.year}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {(['before', 'after'] as const).map((side) => (
                            <Card key={side}>
                                <CardHeader>
                                    <CardTitle>
                                        {side === 'before' ? 'PRIMA' : 'DOPO'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-3">
                                    <p className="text-sm">
                                        {side === 'before'
                                            ? year.direct_entries.length
                                                ? `Voce singola Budget ${year.year}`
                                                : 'Spesa autonoma'
                                            : `Spesa del ${targetLabel} ${preview.target.name}`}
                                    </p>
                                    {side === 'before' ? (
                                        year.direct_entries.map((entry) => (
                                            <p
                                                key={entry.id}
                                                className="text-xs text-muted-foreground"
                                            >
                                                Voce diretta{' '}
                                                {entry.included
                                                    ? 'inclusa'
                                                    : 'esclusa'}
                                            </p>
                                        ))
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Destinazione{' '}
                                            {year.destination === 'included'
                                                ? 'presente e inclusa'
                                                : year.destination ===
                                                    'excluded'
                                                  ? 'presente ed esclusa'
                                                  : 'non presente'}{' '}
                                            nel Budget
                                        </p>
                                    )}
                                    <p className="text-xs font-medium">
                                        Valore della spesa nell’anno
                                    </p>
                                    <Amounts values={year[`expense_${side}`]} />
                                    <p className="text-xs font-medium">
                                        Totale Budget
                                    </p>
                                    <Amounts values={year[`budget_${side}`]} />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                    {preview.valid && (
                        <>
                            <p className="text-xs font-medium">
                                Differenza del totale Budget (DOPO − PRIMA)
                            </p>
                            <Amounts values={year.difference} difference />
                        </>
                    )}
                    {year.destination !== 'included' && (
                        <p className="text-sm text-muted-foreground">
                            Dopo il collegamento la spesa non contribuirà ai
                            totali di questo Budget finché il {targetLabel} non
                            verrà incluso o riattivato manualmente nell’anno
                            compatibile.
                        </p>
                    )}
                </section>
            ))}
            <p className="text-sm text-muted-foreground">
                La variazione del totale Budget non è un risparmio né una
                cancellazione della spesa. Gli importi non disponibili restano
                distinti da zero; lo scostamento segue il calcolo Effettivo −
                Allocato del Budget.
            </p>
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
            toast.success(
                'Spesa collegata. Rimosse le sole voci dirette dal Budget.',
            );
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
                className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
                aria-busy={busy || loading}
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    if (returnFocus) returnFocus();
                    else if (opener instanceof HTMLElement) opener.focus();
                }}
            >
                <DialogHeader>
                    <DialogTitle>Questa spesa è già nel Budget</DialogTitle>
                    <DialogDescription>
                        Verifica il confronto prima di rimuovere le sole voci
                        dirette e collegare la spesa.
                    </DialogDescription>
                </DialogHeader>
                {loading && <p role="status">Caricamento anteprima…</p>}
                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                {preview && <BudgetReassignmentComparison preview={preview} />}
                {preview?.problem && (
                    <Alert variant="destructive">
                        <AlertDescription>{preview.problem}</AlertDescription>
                    </Alert>
                )}
                <p className="text-sm">
                    La spesa non viene cancellata: conserva ID, righe
                    economiche, importi, date, fornitore, centri di costo,
                    allegati e commenti. Si rimuovono soltanto le voci dirette
                    dai Budget e si aggiorna il collegamento. Le altre modifiche
                    del form, se presenti, vengono salvate insieme alla
                    conferma.
                </p>
                <DialogFooter className="sm:flex-wrap">
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
                            : `Rimuovi dal Budget e collega al ${preview?.target.type === 'contract' ? 'contratto' : 'progetto'}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

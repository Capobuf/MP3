import { Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { SourcePicker } from './budget-entry-sheet';
import { api, money } from './helpers';
import type { Option } from './types';

type Conflict = {
    year: number;
    allocated: string | null;
    actual: string | null;
    split: boolean;
};
export type Allocation = {
    ambiguous: boolean;
    type: 'contract' | 'project' | null;
    container: { id: number; name: string | null; year: number | null } | null;
    conflicts: Conflict[];
    budgets: { year: number; url: string }[];
    token: string;
};

export function ExpenseAllocation({
    slug,
    expenseId,
    allocation,
    imported,
    disabled,
}: {
    slug: string;
    expenseId: number;
    allocation: Allocation;
    imported: boolean;
    disabled: boolean;
}) {
    const [conflict, setConflict] = useState<Conflict | null>(null);
    const [action, setAction] = useState('');
    const [target, setTarget] = useState<Option | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const container = allocation.container;
    async function save() {
        if (!conflict || !confirmed || busy) return;
        setBusy(true);
        setError('');
        try {
            const result = await api<{
                record: { id: number };
                message: string;
            }>(`/t/${slug}/expenses/${expenseId}/allocation`, 'POST', {
                action,
                year: conflict.year,
                target_id: target?.id,
                token: allocation.token,
                confirmed,
            });
            toast.success(result.message);
            router.visit(
                `/t/${slug}/expenses/${result.record.id}?year=${action === 'year' ? container?.year : conflict.year}`,
                {
                    onFinish: () => {
                        setBusy(false);
                        setConflict(null);
                    },
                },
            );
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Correzione non riuscita.',
            );
            setBusy(false);
        }
    }
    return (
        <>
            {allocation.ambiguous && (
                <Alert>
                    <AlertTitle>Collegamento storico da risolvere</AlertTitle>
                    <AlertDescription>
                        <p>
                            La spesa appartiene sia a un contratto sia a un
                            progetto. Scegli quale conservare e rimuovi
                            esplicitamente l’altro collegamento.
                        </p>
                        <Button asChild variant="outline">
                            <Link
                                href={`/t/${slug}/expenses/${expenseId}/edit`}
                            >
                                Modifica collegamenti
                            </Link>
                        </Button>
                    </AlertDescription>
                </Alert>
            )}
            {allocation.budgets.length > 0 && (
                <Alert>
                    <AlertTitle>Spesa singola nel Budget</AlertTitle>
                    <AlertDescription>
                        <p>
                            {allocation.type === null && !allocation.ambiguous
                                ? 'Puoi collegarla a un contratto o progetto dalle Informazioni o dal form di modifica. Se manca nel Budget, potrai scegliere se aggiungerlo.'
                                : 'Per correggere i collegamenti storici, rimuovi prima la sola voce da tutti i Budget indicati. Gli importi della spesa restano conservati.'}
                        </p>
                        {allocation.budgets.map((budget) => (
                            <Button
                                key={budget.year}
                                asChild
                                variant="outline"
                                size="sm"
                            >
                                <Link href={budget.url}>
                                    Apri Budget {budget.year}
                                </Link>
                            </Button>
                        ))}
                    </AlertDescription>
                </Alert>
            )}
            {allocation.conflicts.map((item) => (
                <Alert key={item.year}>
                    <AlertTitle>Anno da verificare · {item.year}</AlertTitle>
                    <AlertDescription>
                        <p>
                            Questi importi appartengono al {item.year}, ma «
                            {container?.name || 'Contenitore'}» è{' '}
                            {container?.year ?? 'senza anno'}. Non possono
                            entrare nel Budget {item.year} attraverso questo
                            contenitore.
                        </p>
                        <p>
                            Allocato: {money(item.allocated)} · Effettivo:{' '}
                            {money(item.actual)}
                        </p>
                        <Button
                            variant="outline"
                            disabled={
                                disabled ||
                                busy ||
                                allocation.budgets.length > 0
                            }
                            onClick={() => {
                                setConflict(item);
                                setAction('');
                                setTarget(null);
                                setConfirmed(false);
                                setError('');
                            }}
                        >
                            Scegli come correggere
                        </Button>
                    </AlertDescription>
                </Alert>
            ))}
            <Dialog
                open={conflict !== null}
                onOpenChange={(open) => {
                    if (!open && !busy) setConflict(null);
                }}
            >
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            Correggi l’imputazione {conflict?.year}
                        </DialogTitle>
                        <DialogDescription>
                            Scegli in base alla competenza reale della spesa.
                            Questa correzione non aggiunge voci al Budget.
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="allocation-action">
                                Cosa vuoi correggere?
                            </FieldLabel>
                            <Select
                                value={action}
                                disabled={busy}
                                onValueChange={(value) => {
                                    setAction(value);
                                    setConfirmed(false);
                                    setTarget(null);
                                }}
                            >
                                <SelectTrigger id="allocation-action">
                                    <SelectValue placeholder="Scegli un’operazione…" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem
                                            value="year"
                                            disabled={
                                                container?.year == null ||
                                                imported
                                            }
                                        >
                                            L’anno è sbagliato: porta gli
                                            importi al {container?.year ?? '…'}
                                        </SelectItem>
                                        <SelectItem value="container">
                                            L’anno è corretto: scegli un
                                            contenitore del {conflict?.year}
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            {imported && (
                                <p className="text-sm text-muted-foreground">
                                    La spesa proviene da un’importazione
                                    annuale: conserva l’anno e scegli il
                                    contenitore corretto.
                                </p>
                            )}
                            {container?.year == null && (
                                <p className="text-sm text-muted-foreground">
                                    Per correggere l’anno, assegna prima un anno
                                    al contenitore dalla sua scheda.
                                </p>
                            )}
                        </Field>
                        {action === 'container' &&
                            conflict &&
                            allocation.type && (
                                <Field>
                                    <FieldLabel>
                                        Contenitore del {conflict.year}
                                    </FieldLabel>
                                    <SourcePicker
                                        key={`${conflict.year}:${allocation.type}`}
                                        slug={slug}
                                        year={conflict.year}
                                        type={allocation.type}
                                        value={target}
                                        onChange={(value) => {
                                            setTarget(value);
                                            setConfirmed(false);
                                        }}
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        Se manca, crealo oppure importalo
                                        dall’anno precedente senza selezionare
                                        le spese da copiare, poi torna qui.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                        >
                                            <Link
                                                href={`/t/${slug}/${allocation.type}s/create?year=${conflict.year}`}
                                            >
                                                Crea contenitore
                                            </Link>
                                        </Button>
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                        >
                                            <Link
                                                href={`/t/${slug}/budget?year=${conflict.year}`}
                                            >
                                                Apri Budget e importazione
                                                annuale
                                            </Link>
                                        </Button>
                                    </div>
                                </Field>
                            )}
                        {action && conflict && (
                            <Alert>
                                <AlertTitle>Prima di confermare</AlertTitle>
                                <AlertDescription>
                                    <p>
                                        Allocato {money(conflict.allocated)} ·
                                        Effettivo {money(conflict.actual)}.
                                    </p>
                                    <p>
                                        {action === 'year'
                                            ? `Solo gli importi del ${conflict.year} saranno imputati al ${container?.year}. Prezzi, quantità e date dei periodi restano invariati.`
                                            : conflict.split
                                              ? `Le righe del ${conflict.year} saranno spostate in una nuova spesa collegata a «${target?.name ?? 'contenitore da scegliere'}». Gli altri anni, gli allegati e i commenti resteranno nella spesa originale.`
                                              : `La spesa sarà spostata in «${target?.name ?? 'contenitore da scegliere'}», conservando importi, righe, allegati e commenti.`}
                                    </p>
                                </AlertDescription>
                            </Alert>
                        )}
                        <Field orientation="horizontal">
                            <Checkbox
                                id="allocation-confirm"
                                checked={confirmed}
                                disabled={
                                    busy ||
                                    !action ||
                                    (action === 'container' && !target)
                                }
                                onCheckedChange={(value) =>
                                    setConfirmed(value === true)
                                }
                            />
                            <FieldLabel htmlFor="allocation-confirm">
                                Confermo la correzione descritta e gli importi
                                interessati
                            </FieldLabel>
                        </Field>
                        {error && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}
                    </FieldGroup>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => setConflict(null)}
                        >
                            Annulla
                        </Button>
                        <Button
                            disabled={busy || !confirmed}
                            onClick={() => void save()}
                        >
                            {busy ? 'Salvataggio…' : 'Applica correzione'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

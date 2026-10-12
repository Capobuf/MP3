import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useUnsavedNavigation } from '@/hooks/use-unsaved-navigation';
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
import {
    Card,
    CardAction,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { draftLines, emptyDraftLine, ExpenseLines } from './expense-lines';
import type { DraftLine } from './expense-lines';
import { periodYear } from './expense-period-fields';
import { ApiError, decimalInput } from './helpers';
import { saveInlineRecord } from './inline-edit';
import type { Expense, ExpenseLine } from './types';

function lineData(line: ExpenseLine, year: number) {
    return {
        description: line.description,
        type: line.type,
        unit_price: decimalInput(line.unit_price),
        quantity: decimalInput(line.quantity),
        period_starts_on: line.period_starts_on || null,
        period_ends_on: line.period_ends_on || null,
        year: line.year ?? year,
    };
}

export function ExpenseLinesCard({
    expense,
    url,
    onEditingChange,
}: {
    expense: Expense;
    url: string;
    onEditingChange: (editing: boolean) => void;
}) {
    const lines = expense.lines ?? [];
    const [draft, setDraft] = useState<DraftLine[] | null>(null);
    const [focusKey, setFocusKey] = useState<string>();
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const lock = useRef(false);
    const navigation = useUnsavedNavigation(draft !== null, saving);
    const defaultPeriod = {
        period_starts_on: expense.period_starts_on ?? '',
        period_ends_on: expense.period_ends_on ?? '',
        year: String(expense.year),
    };
    const formError = Object.entries(errors).find(
        ([field]) => field !== 'lines' && !field.startsWith('lines.'),
    )?.[1][0];

    function start(add: boolean) {
        const next = draftLines(expense);
        setErrors({});
        setFocusKey(undefined);
        if (add && next.length < 500) {
            const line = {
                ...emptyDraftLine('allocated', expense.title),
                year: expense.contract_id
                    ? periodYear(defaultPeriod, true)
                    : expense.year,
                period_starts_on: expense.period_starts_on,
                period_ends_on: expense.period_ends_on,
            };
            next.push(line);
            setFocusKey(line.key);
        }
        setDraft(next);
        onEditingChange(true);
    }

    function cancel() {
        if (lock.current) return;
        setDraft(null);
        setErrors({});
        onEditingChange(false);
    }

    async function save() {
        if (draft === null || lock.current) return;
        lock.current = true;
        setSaving(true);
        setErrors({});
        try {
            await saveInlineRecord(
                url,
                { lines: draft.map((line) => lineData(line, expense.year)) },
                navigation.allow,
            );
            setDraft(null);
            onEditingChange(false);
        } catch (error) {
            setErrors(
                error instanceof ApiError && Object.keys(error.errors).length
                    ? error.errors
                    : {
                          _form: [
                              error instanceof Error
                                  ? error.message
                                  : 'Salvataggio non riuscito.',
                          ],
                      },
            );
        } finally {
            lock.current = false;
            setSaving(false);
        }
    }

    return (
        <>
            <Card className="min-w-0 detail-enter gap-4">
                <CardHeader className="flex flex-col gap-3 px-5 sm:grid">
                    <CardTitle>
                        <h2>Righe economiche</h2>
                    </CardTitle>
                    {draft === null && (
                        <CardAction className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => start(false)}
                            >
                                Gestisci righe
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={lines.length >= 500}
                                onClick={() => start(true)}
                            >
                                <Plus data-icon="inline-start" />
                                Aggiungi riga
                            </Button>
                        </CardAction>
                    )}
                </CardHeader>
                <CardContent className="min-w-0 px-5">
                    {draft !== null ? (
                        <form
                            aria-label="Gestione righe economiche"
                            aria-busy={saving}
                            data-undo-dirty
                            className="flex min-w-0 flex-col gap-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void save();
                            }}
                        >
                            {formError && (
                                <FieldError role="alert">
                                    {formError}
                                </FieldError>
                            )}
                            <ExpenseLines
                                key="editing"
                                lines={draft}
                                initialFocusKey={focusKey}
                                onChange={(next) => {
                                    setDraft(next);
                                    setErrors({});
                                }}
                                disabled={saving}
                                showHeading={false}
                                contractMode={!!expense.contract_id}
                                defaultDescription={expense.title}
                                defaultPeriod={defaultPeriod}
                                errors={errors}
                            />
                            <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={saving}
                                    onClick={cancel}
                                >
                                    Annulla
                                </Button>
                                <Button type="submit" disabled={saving}>
                                    {saving && (
                                        <Spinner data-icon="inline-start" />
                                    )}
                                    {saving ? 'Salvataggio…' : 'Salva righe'}
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <ExpenseLines
                            key="reading"
                            readOnly
                            onSaveLine={(key, field, value) =>
                                saveInlineRecord(url, {
                                    lines: lines.map((line, index) => {
                                        const data = lineData(
                                            line,
                                            expense.year,
                                        );
                                        return String(line.id ?? index) === key
                                            ? {
                                                  ...data,
                                                  [field]: [
                                                      'unit_price',
                                                      'quantity',
                                                  ].includes(field)
                                                      ? decimalInput(value)
                                                      : field.endsWith('_on')
                                                        ? value || null
                                                        : value,
                                              }
                                            : data;
                                    }),
                                })
                            }
                            showSummary={false}
                            showHeading={false}
                            contractMode={!!expense.contract_id}
                            lines={lines.map((line, index) => ({
                                ...line,
                                key: String(line.id ?? index),
                            }))}
                        />
                    )}
                </CardContent>
            </Card>
            <AlertDialog
                open={navigation.pending !== null}
                onOpenChange={(open) => {
                    if (!open) navigation.cancel();
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Scartare le modifiche?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Le righe non sono ancora state salvate.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            Continua a modificare
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                cancel();
                                navigation.confirm();
                            }}
                        >
                            Scarta modifiche
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

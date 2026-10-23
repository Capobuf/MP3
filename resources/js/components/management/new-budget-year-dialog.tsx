import { useState } from 'react';
import { toast } from 'sonner';
import type { BudgetYear } from '@/components/management/budget-types';
import { api } from '@/components/management/helpers';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useUnsavedNavigation } from '@/hooks/use-unsaved-navigation';
import { changeEconomicYear } from '@/lib/economic-year';

export function NewBudgetYearDialog({
    slug,
    year,
    onClose,
}: {
    slug: string;
    year: number;
    onClose: () => void;
}) {
    const [draftYear, setDraftYear] = useState(String(year));
    const [creating, setCreating] = useState(false);
    const [yearError, setYearError] = useState('');
    const navigation = useUnsavedNavigation(false, creating);
    async function createYear(event: React.SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (creating) return;
        setCreating(true);
        setYearError('');
        try {
            const result = await api<{ year: BudgetYear }>(
                `/t/${slug}/budget/years`,
                'POST',
                { year: draftYear },
            );
            onClose();
            toast.success('Anno di Budget creato.');
            navigation.allow();
            changeEconomicYear(result.year.year);
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
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !creating) onClose();
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
                        <FieldLabel htmlFor="budget-new-year">Anno</FieldLabel>
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
    );
}

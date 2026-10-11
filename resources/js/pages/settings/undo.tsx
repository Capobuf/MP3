import { Form, Head, usePage } from '@inertiajs/react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Field,
    FieldLabel,
    FieldDescription,
    FieldError,
} from '@/components/ui/field';

export default function UndoSettings() {
    const { auth } = usePage().props;
    return (
        <>
            <Head title="Annullamento" />
            <Heading
                variant="small"
                title="Annullamento"
                description="Usa Ctrl+Z (⌘Z su Mac) o il pulsante nella barra superiore per annullare le ultime modifiche salvate nel gestionale."
            />
            <Form
                action="/settings/undo"
                method="patch"
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => (
                    <>
                        <Field>
                            <FieldLabel htmlFor="undo-popup-seconds">
                                Durata del popup di ripristino (secondi)
                            </FieldLabel>
                            <Input
                                id="undo-popup-seconds"
                                name="undo_popup_seconds"
                                type="number"
                                min={5}
                                max={120}
                                required
                                defaultValue={Number(
                                    auth.user.undo_popup_seconds ?? 10,
                                )}
                                aria-invalid={!!errors.undo_popup_seconds}
                                aria-describedby="undo-duration-description"
                            />
                            <FieldDescription id="undo-duration-description">
                                Dopo un annullamento, il popup offre
                                «Ripristina» per la durata scelta, da 5 a 120
                                secondi. La preferenza è salvata nel tuo
                                account.
                            </FieldDescription>
                            {errors.undo_popup_seconds && (
                                <FieldError>
                                    {errors.undo_popup_seconds}
                                </FieldError>
                            )}
                        </Field>
                        <Button type="submit" disabled={processing}>
                            Salva preferenze
                        </Button>
                    </>
                )}
            </Form>
            <p className="text-sm text-muted-foreground">
                La cronologia conserva fino a 50 operazioni per ambiente per 24
                ore. Nei campi di testo Ctrl+Z continua ad annullare la
                digitazione. Se altri utenti hanno modificato i dati,
                l’annullamento viene bloccato per preservare i loro
                aggiornamenti.
            </p>
        </>
    );
}
UndoSettings.layout = {
    breadcrumbs: [{ title: 'Annullamento', href: '/settings/undo' }],
};

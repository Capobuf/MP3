import { Head, useForm } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    InputGroupText,
} from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import PlatformSettingsLayout from '@/layouts/platform/settings-layout';

export default function GeneralSettings({
    attachmentMaxSizeMb,
    status,
}: {
    attachmentMaxSizeMb: number;
    status: string | null;
}) {
    const form = useForm({
        attachment_max_size_mb: String(attachmentMaxSizeMb),
    });

    return (
        <>
            <Head title="Generali · Amministrazione" />
            <PlatformSettingsLayout>
                <h2 className="text-xl font-semibold">Generali</h2>
                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle>Allegati</CardTitle>
                        <CardDescription id="attachment-limit-description">
                            Valido per contratti, spese e progetti di tutte le
                            aziende. Non modifica i file già caricati né i
                            limiti dei backup. Il server può imporre un limite
                            di caricamento inferiore.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                form.put('/platform/settings/general', {
                                    preserveScroll: true,
                                });
                            }}
                            aria-busy={form.processing}
                        >
                            <FieldGroup>
                                <Field
                                    data-invalid={
                                        !!form.errors.attachment_max_size_mb
                                    }
                                >
                                    <FieldLabel htmlFor="attachment-max-size">
                                        Dimensione massima per allegato (MB)
                                    </FieldLabel>
                                    <InputGroup
                                        className="max-w-xs"
                                        data-disabled={form.processing}
                                    >
                                        <InputGroupInput
                                            id="attachment-max-size"
                                            type="number"
                                            min={1 / 1024}
                                            max={1024}
                                            step={1 / 1024}
                                            required
                                            value={
                                                form.data.attachment_max_size_mb
                                            }
                                            onChange={(event) =>
                                                form.setData(
                                                    'attachment_max_size_mb',
                                                    event.target.value,
                                                )
                                            }
                                            disabled={form.processing}
                                            aria-invalid={
                                                !!form.errors
                                                    .attachment_max_size_mb
                                            }
                                            aria-describedby="attachment-limit-description attachment-limit-error"
                                        />
                                        <InputGroupAddon
                                            align="inline-end"
                                            className="gap-0 self-stretch p-0"
                                        >
                                            <Separator orientation="vertical" />
                                            <InputGroupText className="px-2">
                                                MB
                                            </InputGroupText>
                                        </InputGroupAddon>
                                    </InputGroup>
                                    <FieldError id="attachment-limit-error">
                                        {form.errors.attachment_max_size_mb}
                                    </FieldError>
                                </Field>
                                <div className="flex items-center gap-4">
                                    <Button
                                        type="submit"
                                        disabled={form.processing}
                                    >
                                        {form.processing && <Spinner />}
                                        Salva
                                    </Button>
                                    {status && (
                                        <p role="status" className="text-sm">
                                            {status}
                                        </p>
                                    )}
                                </div>
                            </FieldGroup>
                        </form>
                    </CardContent>
                </Card>
            </PlatformSettingsLayout>
        </>
    );
}

GeneralSettings.layout = {
    breadcrumbs: [
        { title: 'Amministrazione', href: '/platform' },
        { title: 'Generali', href: '/platform/settings/general' },
    ],
};

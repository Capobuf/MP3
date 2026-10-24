import { Head, useForm } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Field,
    FieldContent,
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
                <form
                    className="w-full max-w-2xl"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.put('/platform/settings/general', {
                            preserveScroll: true,
                        });
                    }}
                    aria-busy={form.processing}
                >
                    <Card>
                        <CardHeader>
                            <CardTitle>Allegati</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <FieldGroup>
                                <Field
                                    orientation="responsive"
                                    data-disabled={form.processing}
                                    data-invalid={
                                        !!form.errors.attachment_max_size_mb
                                    }
                                >
                                    <FieldContent className="@md/field-group:pt-2">
                                        <FieldLabel htmlFor="attachment-max-size">
                                            Dimensione massima per allegato (MB)
                                        </FieldLabel>
                                    </FieldContent>
                                    <FieldContent className="max-w-40">
                                        <InputGroup
                                            data-disabled={form.processing}
                                        >
                                            <InputGroupInput
                                                id="attachment-max-size"
                                                className="[appearance:textfield] tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                                type="number"
                                                min={1 / 1024}
                                                max={1024}
                                                step={1 / 1024}
                                                required
                                                value={
                                                    form.data
                                                        .attachment_max_size_mb
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
                                                aria-describedby={
                                                    form.errors
                                                        .attachment_max_size_mb
                                                        ? 'attachment-limit-error'
                                                        : undefined
                                                }
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
                                    </FieldContent>
                                </Field>
                            </FieldGroup>
                        </CardContent>
                        <CardFooter className="flex-wrap justify-end gap-4 border-t">
                            {status && (
                                <p role="status" className="mr-auto text-sm">
                                    {status}
                                </p>
                            )}
                            <Button type="submit" disabled={form.processing}>
                                {form.processing && <Spinner />}
                                Salva
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
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

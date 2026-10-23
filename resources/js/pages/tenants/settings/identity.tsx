import { Head, useForm } from '@inertiajs/react';
import { useRef } from 'react';
import { TenantSettingsNav } from '@/components/management/tenant-settings-nav';
import type { Tenant } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Field,
    FieldGroup,
    FieldLabel,
    FieldDescription,
} from '@/components/ui/field';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';

export default function Identity({
    tenant,
    logoUrl,
}: {
    tenant: Tenant;
    logoUrl: string | null;
}) {
    const form = useForm<{ logo: File | null }>({ logo: null });
    const input = useRef<HTMLInputElement>(null);
    const path = `/t/${tenant.slug}/settings/identity`;
    return (
        <>
            <Head title={`Identità azienda · ${tenant.name}`} />
            <div className="page-shell">
                <header>
                    <p className="text-sm text-muted-foreground">
                        {tenant.name}
                    </p>
                    <h1 className="page-title">Impostazioni</h1>
                </header>
                <TenantSettingsNav slug={tenant.slug} />
                <Card>
                    <CardHeader>
                        <CardTitle>Identità azienda</CardTitle>
                        <CardDescription>
                            Il logo viene utilizzato nei report del Budget di
                            questa azienda.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                        {logoUrl && (
                            <img
                                src={logoUrl}
                                alt={`Logo ${tenant.name}`}
                                className="h-24 w-48 object-contain"
                            />
                        )}
                        <form
                            className="flex max-w-lg flex-col gap-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                form.post(path, {
                                    forceFormData: true,
                                    preserveScroll: true,
                                    onSuccess: () => {
                                        form.reset();
                                        if (input.current)
                                            input.current.value = '';
                                    },
                                });
                            }}
                        >
                            <FieldGroup>
                                <Field data-invalid={!!form.errors.logo}>
                                    <FieldLabel htmlFor="tenant-logo">
                                        Logo azienda
                                    </FieldLabel>
                                    <Input
                                        ref={input}
                                        id="tenant-logo"
                                        type="file"
                                        accept="image/png,image/jpeg"
                                        disabled={form.processing}
                                        aria-invalid={!!form.errors.logo}
                                        onChange={(event) =>
                                            form.setData(
                                                'logo',
                                                event.target.files?.[0] ?? null,
                                            )
                                        }
                                    />
                                    <FieldDescription>
                                        PNG o JPG, massimo 2 MB e 4096 × 4096
                                        pixel.
                                    </FieldDescription>
                                    {form.errors.logo && (
                                        <p
                                            role="alert"
                                            className="text-sm text-destructive"
                                        >
                                            {form.errors.logo}
                                        </p>
                                    )}
                                </Field>
                            </FieldGroup>
                            <div className="flex gap-2">
                                <Button
                                    type="submit"
                                    disabled={
                                        form.processing || !form.data.logo
                                    }
                                >
                                    Salva logo
                                </Button>
                                {logoUrl && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={form.processing}
                                        onClick={() =>
                                            form.delete(path, {
                                                preserveScroll: true,
                                            })
                                        }
                                    >
                                        Rimuovi logo
                                    </Button>
                                )}
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
Identity.layout = {
    breadcrumbs: [{ title: 'Impostazioni', href: '/dashboard' }],
};

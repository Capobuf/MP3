import { useRef, useState } from 'react';
import type { FormComponentRef } from '@inertiajs/core';
import {
    AlertDialog,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import { Form, Head, Link } from '@inertiajs/react';
import { ArrowUpRight, Building2, Trash2 } from 'lucide-react';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import type { Tenant, User } from '@/types';
import PlatformSettingsLayout from '@/layouts/platform/settings-layout';

type PlatformTenant = Tenant & {
    users: Pick<User, 'id' | 'name' | 'email'>[];
};

export default function Platform({
    tenants,
    users,
}: {
    tenants: PlatformTenant[];
    users: Pick<User, 'id' | 'name' | 'email'>[];
}) {
    return (
        <>
            <Head title="Ambienti · Impostazioni Piattaforma" />
            <PlatformSettingsLayout>
                <Card>
                    <CardHeader>
                        <CardTitle>Crea ambiente</CardTitle>
                        <CardDescription>
                            Lo slug identifica l’indirizzo permanente
                            dell’ambiente e resta invariato quando modifichi il
                            nome.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form
                            action="/platform/tenants"
                            method="post"
                            resetOnSuccess
                            className="grid gap-4"
                        >
                            {({ processing, errors }) => (
                                <>
                                    <div className="grid gap-2">
                                        <Label htmlFor="tenant-name">
                                            Nome
                                        </Label>
                                        <Input
                                            id="tenant-name"
                                            name="name"
                                            required
                                            placeholder="Acme S.r.l."
                                        />
                                        <InputError message={errors.name} />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="tenant-slug">
                                            Slug
                                        </Label>
                                        <Input
                                            id="tenant-slug"
                                            name="slug"
                                            required
                                            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                                            placeholder="acme"
                                        />
                                        <InputError message={errors.slug} />
                                    </div>
                                    <Button disabled={processing}>
                                        {processing && <Spinner />}
                                        Crea ambiente
                                    </Button>
                                </>
                            )}
                        </Form>
                    </CardContent>
                </Card>

                <section className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <Building2 className="size-5" />
                        <h2 className="text-xl font-semibold">Ambienti</h2>
                        <Badge variant="secondary">{tenants.length}</Badge>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        {tenants.map((tenant) => {
                            const assignedIds = new Set(
                                tenant.users.map((user) => user.id),
                            );
                            const availableUsers = users.filter(
                                (user) => !assignedIds.has(user.id),
                            );

                            return (
                                <Card key={tenant.id}>
                                    <CardHeader>
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <CardTitle>
                                                    {tenant.name}
                                                </CardTitle>
                                                <CardDescription>
                                                    /t/{tenant.slug}
                                                </CardDescription>
                                            </div>
                                            <Button
                                                asChild
                                                size="sm"
                                                variant="outline"
                                            >
                                                <Link
                                                    href={`/t/${tenant.slug}/dashboard`}
                                                >
                                                    Apri
                                                    <ArrowUpRight />
                                                </Link>
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex flex-col gap-5">
                                        <Form
                                            action={`/platform/tenants/${tenant.id}`}
                                            method="patch"
                                            className="flex flex-wrap items-start gap-2"
                                        >
                                            {({ processing, errors }) => (
                                                <>
                                                    <div className="min-w-0 flex-1 [&_[data-slot=native-select-wrapper]]:w-full">
                                                        <Label
                                                            htmlFor={`tenant-${tenant.id}-name`}
                                                            className="sr-only"
                                                        >
                                                            Nome ambiente
                                                        </Label>
                                                        <Input
                                                            id={`tenant-${tenant.id}-name`}
                                                            name="name"
                                                            defaultValue={
                                                                tenant.name
                                                            }
                                                            required
                                                        />
                                                        <InputError
                                                            className="mt-1"
                                                            message={
                                                                errors.name
                                                            }
                                                        />
                                                    </div>
                                                    <Button
                                                        variant="secondary"
                                                        disabled={processing}
                                                    >
                                                        Salva nome
                                                    </Button>
                                                </>
                                            )}
                                        </Form>

                                        <div className="flex flex-col gap-2">
                                            <Label>Utenti assegnati</Label>
                                            {tenant.users.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">
                                                    Nessun utente assegnato.
                                                </p>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    {tenant.users.map(
                                                        (user) => (
                                                            <div
                                                                key={user.id}
                                                                className="flex items-center justify-between gap-3 rounded-md border p-3"
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-medium">
                                                                        {
                                                                            user.name
                                                                        }
                                                                    </p>
                                                                    <p className="truncate text-xs text-muted-foreground">
                                                                        {
                                                                            user.email
                                                                        }
                                                                    </p>
                                                                </div>
                                                                <RemoveTenantUser
                                                                    tenant={
                                                                        tenant
                                                                    }
                                                                    user={user}
                                                                />
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {availableUsers.length > 0 && (
                                            <Form
                                                action={`/platform/tenants/${tenant.id}/users`}
                                                method="post"
                                                className="flex flex-wrap items-start gap-2"
                                            >
                                                {({ processing, errors }) => (
                                                    <>
                                                        <div className="min-w-0 flex-1 [&_[data-slot=native-select-wrapper]]:w-full">
                                                            <Label
                                                                htmlFor={`tenant-${tenant.id}-user`}
                                                                className="sr-only"
                                                            >
                                                                Utente
                                                            </Label>
                                                            <NativeSelect
                                                                id={`tenant-${tenant.id}-user`}
                                                                name="user_id"
                                                                required
                                                                defaultValue=""
                                                                className="w-full"
                                                                disabled={
                                                                    processing
                                                                }
                                                            >
                                                                <NativeSelectOption
                                                                    value=""
                                                                    disabled
                                                                >
                                                                    Seleziona
                                                                    utente
                                                                </NativeSelectOption>
                                                                {availableUsers.map(
                                                                    (user) => (
                                                                        <NativeSelectOption
                                                                            key={
                                                                                user.id
                                                                            }
                                                                            value={
                                                                                user.id
                                                                            }
                                                                        >
                                                                            {
                                                                                user.name
                                                                            }{' '}
                                                                            (
                                                                            {
                                                                                user.email
                                                                            }
                                                                            )
                                                                        </NativeSelectOption>
                                                                    ),
                                                                )}
                                                            </NativeSelect>
                                                            <InputError
                                                                className="mt-1"
                                                                message={
                                                                    errors.user_id
                                                                }
                                                            />
                                                        </div>
                                                        <Button
                                                            disabled={
                                                                processing
                                                            }
                                                        >
                                                            Assegna accesso
                                                        </Button>
                                                    </>
                                                )}
                                            </Form>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </section>
            </PlatformSettingsLayout>
        </>
    );
}

Platform.layout = {
    breadcrumbs: [
        { title: 'Impostazioni Piattaforma', href: '/platform' },
        { title: 'Ambienti', href: '/platform' },
    ],
};

function RemoveTenantUser({
    tenant,
    user,
}: {
    tenant: PlatformTenant;
    user: PlatformTenant['users'][number];
}) {
    const [open, setOpen] = useState(false);
    const form = useRef<FormComponentRef>(null);
    return (
        <Form
            ref={form}
            action={`/platform/tenants/${tenant.id}/users/${user.id}`}
            method="delete"
            onSuccess={() => setOpen(false)}
        >
            {({ processing, errors }) => (
                <AlertDialog
                    open={open}
                    onOpenChange={(value) => {
                        if (!processing) setOpen(value);
                    }}
                >
                    <AlertDialogTrigger asChild>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={processing}
                            aria-label={`Rimuovi ${user.name} da ${tenant.name}`}
                        >
                            <Trash2 />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent aria-busy={processing}>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Rimuovere l’accesso?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {user.name} non potrà più accedere a{' '}
                                {tenant.name}. Il suo account resterà
                                disponibile sulla piattaforma.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        {Object.values(errors).map((error, index) => (
                            <InputError key={index} message={error} />
                        ))}
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={processing}>
                                Annulla
                            </AlertDialogCancel>
                            <AlertDialogAction
                                variant="destructive"
                                disabled={processing}
                                onClick={(event) => {
                                    event.preventDefault();
                                    form.current?.submit();
                                }}
                            >
                                {processing && <Spinner />}
                                {processing ? 'Rimozione…' : 'Rimuovi accesso'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </Form>
    );
}

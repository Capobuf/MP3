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
import { Form, Head, Link, useForm } from '@inertiajs/react';
import { ArrowUpRight, Building2, Plus, Trash2 } from 'lucide-react';
import InputError from '@/components/input-error';
import {
    InlineEdit,
    saveInlineRecord,
} from '@/components/management/inline-edit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
    const [creating, setCreating] = useState(false);
    const create = useForm({ name: '' });

    return (
        <>
            <Head title="Aziende · Amministrazione" />
            <PlatformSettingsLayout>
                <section className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Building2 className="size-5" />
                            <h2 className="text-xl font-semibold">Aziende</h2>
                            <Badge variant="secondary">{tenants.length}</Badge>
                        </div>
                        <Dialog
                            open={creating}
                            onOpenChange={(open) => {
                                if (!create.processing) setCreating(open);
                            }}
                        >
                            <DialogTrigger asChild>
                                <Button>
                                    <Plus data-icon="inline-start" />
                                    Nuova azienda
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>Nuova azienda</DialogTitle>
                                    <DialogDescription>
                                        Inserisci il nome dell’azienda.
                                        L’indirizzo viene creato
                                        automaticamente.
                                    </DialogDescription>
                                </DialogHeader>
                                <form
                                    className="flex flex-col gap-4"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        create.post('/platform/tenants', {
                                            onSuccess: () => {
                                                setCreating(false);
                                                create.reset();
                                            },
                                        });
                                    }}
                                >
                                    <FieldGroup>
                                        <Field
                                            data-invalid={Boolean(
                                                create.errors.name,
                                            )}
                                        >
                                            <FieldLabel htmlFor="tenant-name">
                                                Nome
                                            </FieldLabel>
                                            <Input
                                                id="tenant-name"
                                                name="name"
                                                required
                                                maxLength={255}
                                                placeholder="Acme S.r.l."
                                                value={create.data.name}
                                                onChange={(event) =>
                                                    create.setData(
                                                        'name',
                                                        event.target.value,
                                                    )
                                                }
                                                disabled={create.processing}
                                                aria-invalid={Boolean(
                                                    create.errors.name,
                                                )}
                                            />
                                            <InputError
                                                message={create.errors.name}
                                            />
                                        </Field>
                                    </FieldGroup>
                                    <DialogFooter>
                                        <Button disabled={create.processing}>
                                            {create.processing && <Spinner />}
                                            Crea azienda
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                    <div className="overflow-hidden rounded-lg border bg-card">
                        <Table aria-label="Aziende">
                            <TableHeader>
                                <TableRow>
                                    <TableHead scope="col">Azienda</TableHead>
                                    <TableHead scope="col">Indirizzo</TableHead>
                                    <TableHead scope="col">
                                        Utenti assegnati
                                    </TableHead>
                                    <TableHead
                                        scope="col"
                                        className="text-right"
                                    >
                                        Azioni
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tenants.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={4}
                                            className="h-24 text-center text-muted-foreground"
                                        >
                                            Nessuna azienda presente.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {tenants.map((tenant) => {
                                    const assignedIds = new Set(
                                        tenant.users.map((user) => user.id),
                                    );
                                    const availableUsers = users.filter(
                                        (user) => !assignedIds.has(user.id),
                                    );

                                    return (
                                        <TableRow
                                            key={tenant.id}
                                            className="[&>td]:align-top"
                                        >
                                            <TableCell className="min-w-72 p-4 whitespace-normal">
                                                <InlineEdit
                                                    value={tenant.name}
                                                    label={`Nome di ${tenant.name}`}
                                                    className="border px-3 py-2 font-medium break-words"
                                                    onSave={(value) =>
                                                        saveInlineRecord(
                                                            `/platform/tenants/${tenant.id}`,
                                                            { name: value },
                                                        )
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell className="p-4">
                                                <div className="py-2">
                                                    /t/{tenant.slug}
                                                </div>
                                            </TableCell>
                                            <TableCell className="min-w-80 p-4 whitespace-normal">
                                                <div className="flex flex-col gap-2">
                                                    {availableUsers.length >
                                                        0 && (
                                                        <Form
                                                            action={`/platform/tenants/${tenant.id}/users`}
                                                            method="post"
                                                            className="flex flex-wrap items-start gap-2"
                                                        >
                                                            {({
                                                                processing,
                                                                errors,
                                                            }) => (
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
                                                                                (
                                                                                    user,
                                                                                ) => (
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
                                                                        Assegna
                                                                        accesso
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </Form>
                                                    )}
                                                    <div className="flex flex-col gap-2">
                                                        {tenant.users.length ===
                                                        0 ? (
                                                            <p className="text-sm text-muted-foreground">
                                                                Nessun utente
                                                                assegnato.
                                                            </p>
                                                        ) : (
                                                            <div className="flex flex-col gap-2">
                                                                {tenant.users.map(
                                                                    (user) => (
                                                                        <div
                                                                            key={
                                                                                user.id
                                                                            }
                                                                            className="flex items-center justify-between gap-3"
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
                                                                                user={
                                                                                    user
                                                                                }
                                                                            />
                                                                        </div>
                                                                    ),
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="p-4 text-right">
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                >
                                                    <Link
                                                        href={`/t/${tenant.slug}/dashboard`}
                                                    >
                                                        Apri
                                                        <ArrowUpRight />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </section>
            </PlatformSettingsLayout>
        </>
    );
}

Platform.layout = {
    breadcrumbs: [
        { title: 'Amministrazione', href: '/platform' },
        { title: 'Aziende', href: '/platform' },
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
                                disponibile su Obake.
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

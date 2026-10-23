import { Form, Head, useForm } from '@inertiajs/react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { TenantSettingsNav } from '@/components/management/tenant-settings-nav';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { Tenant, User } from '@/types';

export default function TenantUsers({
    tenant,
    users,
}: {
    tenant: Tenant;
    users: User[];
}) {
    const [removing, setRemoving] = useState<User | null>(null);
    const removal = useForm<Record<string, string>>({});
    const path = `/t/${tenant.slug}/settings/users`;

    return (
        <>
            <Head title={`Utenti · ${tenant.name}`} />
            <div className="page-shell">
                <header>
                    <p className="text-sm text-muted-foreground">
                        {tenant.name}
                    </p>
                    <h1 className="page-title">Impostazioni azienda</h1>
                </header>
                <TenantSettingsNav slug={tenant.slug} />
                <Card>
                    <CardHeader>
                        <CardTitle>Invita utente</CardTitle>
                        <CardDescription>
                            Assegna l’accesso completo a questa azienda. I nuovi
                            utenti riceveranno un link per impostare la
                            password; chi ha già un account manterrà la propria.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form action={path} method="post" resetOnSuccess>
                            {({ processing, errors }) => (
                                <FieldGroup>
                                    <Field
                                        data-invalid={Boolean(errors.email)}
                                        data-disabled={processing}
                                    >
                                        <FieldLabel htmlFor="invite-email">
                                            Email{' '}
                                            <span aria-hidden="true">*</span>
                                        </FieldLabel>
                                        <Input
                                            id="invite-email"
                                            name="email"
                                            type="email"
                                            required
                                            maxLength={255}
                                            disabled={processing}
                                            aria-invalid={Boolean(errors.email)}
                                        />
                                        <InputError message={errors.email} />
                                    </Field>
                                    <Button disabled={processing}>
                                        {processing && <Spinner />}
                                        Invita
                                    </Button>
                                </FieldGroup>
                            )}
                        </Form>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Utenti dell’azienda</CardTitle>
                        <CardDescription>
                            La rimozione revoca solo l’accesso a questa azienda.
                            I super admin hanno sempre accesso a tutte le
                            aziende.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        {users.length === 0 && <p>Nessun utente assegnato.</p>}
                        {users.map((user) => (
                            <div
                                key={user.id}
                                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium break-words">
                                        {user.name}
                                    </p>
                                    <p className="text-sm break-words text-muted-foreground">
                                        {user.email}
                                    </p>
                                    <Badge
                                        variant={
                                            user.is_active
                                                ? 'secondary'
                                                : 'destructive'
                                        }
                                    >
                                        {user.is_active
                                            ? 'Abilitato'
                                            : 'Bloccato'}
                                    </Badge>
                                    <Badge
                                        variant={
                                            user.email_verified_at
                                                ? 'secondary'
                                                : 'outline'
                                        }
                                    >
                                        {user.email_verified_at
                                            ? 'Email verificata'
                                            : 'Email da verificare'}
                                    </Badge>
                                </div>
                                {user.is_super_admin ? (
                                    <Badge>Super admin</Badge>
                                ) : (
                                    <Button
                                        variant="outline"
                                        disabled={removal.processing}
                                        aria-label={`Rimuovi accesso di ${user.email}`}
                                        onClick={() => {
                                            removal.clearErrors();
                                            setRemoving(user);
                                        }}
                                    >
                                        Rimuovi accesso
                                    </Button>
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>
                <AlertDialog
                    open={removing !== null}
                    onOpenChange={(open) => {
                        if (!open && !removal.processing) setRemoving(null);
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Rimuovi accesso all’azienda
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Rimuovere l’accesso di {removing?.email} a{' '}
                                {tenant.name}? L’account e le altre aziende
                                assegnate saranno conservati. Se rimuovi il tuo
                                accesso, tornerai alla pagina del tuo account.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        {Object.values(removal.errors).map((message) => (
                            <InputError key={message} message={message} />
                        ))}
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={removal.processing}>
                                Annulla
                            </AlertDialogCancel>
                            <Button
                                variant="destructive"
                                disabled={removal.processing}
                                onClick={() => {
                                    if (removing)
                                        removal.delete(
                                            `${path}/${removing.id}`,
                                            {
                                                onSuccess: () =>
                                                    setRemoving(null),
                                            },
                                        );
                                }}
                            >
                                {removal.processing && <Spinner />}
                                Rimuovi accesso
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </>
    );
}

TenantUsers.layout = {
    breadcrumbs: [
        { title: 'Impostazioni azienda', href: '/dashboard' },
        { title: 'Utenti', href: '/dashboard' },
    ],
};

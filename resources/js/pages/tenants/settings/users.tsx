import { Form, Head, useForm, usePage } from '@inertiajs/react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { UserAccountStatus, UserAvatar } from '@/components/user-info';
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
    const { auth } = usePage().props;
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
                <Card className="overflow-hidden pb-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            Utenti dell’azienda{' '}
                            <Badge variant="secondary">{users.length}</Badge>
                        </CardTitle>
                        <CardDescription>
                            La rimozione revoca solo l’accesso a questa azienda.
                            I super admin hanno sempre accesso a tutte le
                            aziende.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        {users.length === 0 ? (
                            <p className="px-5 pb-5 text-sm text-muted-foreground">
                                Nessun utente assegnato.
                            </p>
                        ) : (
                            <>
                                <div
                                    aria-hidden="true"
                                    className="hidden grid-cols-[minmax(0,1fr)_11rem_10rem] gap-6 border-y bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid"
                                >
                                    <span>Utente</span>
                                    <span>Stato account</span>
                                    <span />
                                </div>
                                <ul
                                    className="divide-y"
                                    aria-label="Utenti dell’azienda"
                                >
                                    {users.map((user) => (
                                        <li
                                            key={user.id}
                                            className="grid grid-cols-1 items-start gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5 sm:py-5 lg:grid-cols-[minmax(0,1fr)_11rem_10rem] lg:items-center lg:gap-6"
                                        >
                                            <div className="flex min-w-0 items-center gap-3 sm:col-span-2 lg:col-span-1">
                                                <UserAvatar
                                                    user={user}
                                                    className="size-11 border text-sm font-medium"
                                                />
                                                <div className="flex min-w-0 flex-col gap-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-medium [overflow-wrap:anywhere]">
                                                            {user.name}
                                                        </p>
                                                        {user.id ===
                                                            auth.user.id && (
                                                            <Badge variant="outline">
                                                                Tu
                                                            </Badge>
                                                        )}
                                                        {user.is_super_admin && (
                                                            <Badge variant="outline">
                                                                Super admin
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm [overflow-wrap:anywhere] text-muted-foreground">
                                                        {user.email}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-start gap-2">
                                                <p className="text-xs font-medium text-muted-foreground lg:sr-only">
                                                    Stato account
                                                </p>
                                                <UserAccountStatus
                                                    user={user}
                                                />
                                            </div>
                                            <div className="justify-self-start sm:self-center sm:justify-self-end">
                                                {!user.is_super_admin && (
                                                    <Button
                                                        variant="outline"
                                                        disabled={
                                                            removal.processing
                                                        }
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
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
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

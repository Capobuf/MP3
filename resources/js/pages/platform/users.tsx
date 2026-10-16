import { Form, Head } from '@inertiajs/react';
import { Users } from 'lucide-react';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import PlatformSettingsLayout from '@/layouts/platform/settings-layout';
import type { Tenant, User } from '@/types';

type PlatformUser = User & { tenants: Tenant[] };

export default function PlatformUsers({ users }: { users: PlatformUser[] }) {
    return (
        <>
            <Head title="Utenti · Impostazioni Piattaforma" />
            <PlatformSettingsLayout>
                <Card>
                    <CardHeader>
                        <CardTitle>Invita utente</CardTitle>
                        <CardDescription>
                            Il destinatario riceverà un link per impostare la
                            propria password. Potrai poi assegnarlo agli
                            ambienti.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form
                            action="/platform/users"
                            method="post"
                            resetOnSuccess
                        >
                            {({ processing, errors }) => (
                                <FieldGroup>
                                    <Field
                                        data-invalid={Boolean(errors.name)}
                                        data-disabled={processing}
                                    >
                                        <FieldLabel htmlFor="user-name">
                                            Nome (facoltativo)
                                        </FieldLabel>
                                        <Input
                                            id="user-name"
                                            name="name"
                                            maxLength={255}
                                            disabled={processing}
                                            aria-invalid={Boolean(errors.name)}
                                        />
                                        <InputError message={errors.name} />
                                    </Field>
                                    <Field
                                        data-invalid={Boolean(errors.email)}
                                        data-disabled={processing}
                                    >
                                        <FieldLabel htmlFor="user-email">
                                            Email
                                        </FieldLabel>
                                        <Input
                                            id="user-email"
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
                                        Invita utente
                                    </Button>
                                </FieldGroup>
                            )}
                        </Form>
                    </CardContent>
                </Card>

                <section className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <Users className="size-5" />
                        <h2 className="text-xl font-semibold">Utenti</h2>
                        <Badge variant="secondary">{users.length}</Badge>
                    </div>
                    <Card>
                        <CardContent className="divide-y p-0">
                            {users.map((user) => (
                                <div
                                    key={user.id}
                                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium">
                                                {user.name}
                                            </p>
                                            {user.is_super_admin && (
                                                <Badge>Superuser</Badge>
                                            )}
                                            <Badge
                                                variant={
                                                    user.email_verified_at
                                                        ? 'secondary'
                                                        : 'outline'
                                                }
                                            >
                                                {user.email_verified_at
                                                    ? 'Attivo'
                                                    : 'Email non verificata'}
                                            </Badge>
                                        </div>
                                        <p className="text-sm break-words text-muted-foreground">
                                            {user.email}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {user.is_super_admin ? (
                                            <span className="text-sm text-muted-foreground">
                                                Accesso a tutti gli ambienti
                                            </span>
                                        ) : user.tenants.length > 0 ? (
                                            user.tenants.map((tenant) => (
                                                <Badge
                                                    key={tenant.id}
                                                    variant="secondary"
                                                >
                                                    {tenant.name}
                                                </Badge>
                                            ))
                                        ) : (
                                            <span className="text-sm text-muted-foreground">
                                                Nessun ambiente assegnato
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </section>
            </PlatformSettingsLayout>
        </>
    );
}

PlatformUsers.layout = {
    breadcrumbs: [
        { title: 'Impostazioni Piattaforma', href: '/platform' },
        { title: 'Utenti', href: '/platform/settings/users' },
    ],
};

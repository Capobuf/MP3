import { UserInfo } from '@/components/user-info';
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Form, Head, router, usePage } from '@inertiajs/react';
import { Link } from '@inertiajs/react';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import DeleteUser from '@/components/delete-user';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { edit } from '@/routes/profile';
import type { Auth } from '@/types';
import { send } from '@/routes/verification';

type PageProps = {
    auth: Auth;
};

export default function Profile({
    mustVerifyEmail,
    status,
}: {
    mustVerifyEmail: boolean;
    status?: string;
}) {
    const { auth } = usePage<PageProps>().props;

    return (
        <>
            <Head title="Impostazioni profilo" />

            <h1 className="sr-only">Impostazioni profilo</h1>

            <section className="flex flex-col gap-4" aria-label="Foto profilo">
                <Heading
                    variant="small"
                    title="Foto profilo"
                    description="Carica una foto JPG, PNG o WebP, fino a 2 MB."
                />
                <div className="flex items-center gap-3">
                    <UserInfo user={auth.user} />
                </div>
                <Form
                    action="/settings/profile/photo"
                    method="post"
                    options={{ preserveScroll: true }}
                    resetOnSuccess
                    className="flex flex-col gap-3"
                >
                    {({ processing, errors }) => (
                        <>
                            <FieldGroup>
                                <Field data-invalid={!!errors.photo}>
                                    <FieldLabel htmlFor="profile-photo">
                                        Scegli una foto
                                    </FieldLabel>
                                    <Input
                                        id="profile-photo"
                                        name="photo"
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        required
                                        disabled={processing}
                                        aria-invalid={!!errors.photo}
                                    />
                                    <FieldDescription>
                                        La nuova foto sostituisce quella
                                        precedente.
                                    </FieldDescription>
                                    <InputError message={errors.photo} />
                                </Field>
                            </FieldGroup>
                            <div className="flex flex-wrap gap-2">
                                <Button type="submit" disabled={processing}>
                                    {processing && <Spinner />}
                                    {auth.user.avatar
                                        ? 'Sostituisci foto'
                                        : 'Carica foto'}
                                </Button>
                                {auth.user.avatar && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={processing}
                                        onClick={() =>
                                            router.delete(
                                                '/settings/profile/photo',
                                                { preserveScroll: true },
                                            )
                                        }
                                    >
                                        Rimuovi foto
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </Form>
            </section>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Profilo"
                    description="Aggiorna il nome e l’indirizzo email."
                />

                <Form
                    {...ProfileController.update.form()}
                    options={{
                        preserveScroll: true,
                    }}
                    className="space-y-6"
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nome</Label>

                                <Input
                                    id="name"
                                    className="mt-1 block w-full"
                                    defaultValue={auth.user.name}
                                    name="name"
                                    required
                                    autoComplete="name"
                                    placeholder="Nome completo"
                                />

                                <InputError
                                    className="mt-2"
                                    message={errors.name}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="email">Indirizzo email</Label>

                                <Input
                                    id="email"
                                    type="email"
                                    className="mt-1 block w-full"
                                    defaultValue={auth.user.email}
                                    name="email"
                                    required
                                    autoComplete="username"
                                    placeholder="Indirizzo email"
                                />

                                <InputError
                                    className="mt-2"
                                    message={errors.email}
                                />
                            </div>

                            {mustVerifyEmail &&
                                auth.user.email_verified_at === null && (
                                    <div>
                                        <p className="-mt-4 text-sm text-muted-foreground">
                                            Il tuo indirizzo email non è
                                            verificato.{' '}
                                            <Link
                                                href={send()}
                                                as="button"
                                                className="rounded text-primary focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                Invia di nuovo l’email di
                                                verifica.
                                            </Link>
                                        </p>

                                        {status ===
                                            'verification-link-sent' && (
                                            <div className="mt-2 text-sm font-medium text-primary">
                                                Ti abbiamo inviato un nuovo link
                                                di verifica.
                                            </div>
                                        )}
                                    </div>
                                )}

                            <div className="flex items-center gap-4">
                                <Button
                                    disabled={processing}
                                    data-test="update-profile-button"
                                >
                                    {processing && <Spinner />}
                                    {processing ? 'Salvataggio…' : 'Salva'}
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>

            <DeleteUser />
        </>
    );
}

Profile.layout = {
    breadcrumbs: [
        {
            title: 'Impostazioni profilo',
            href: edit(),
        },
    ],
};

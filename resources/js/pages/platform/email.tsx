import { Head, useForm } from '@inertiajs/react';
import { CheckCircle2, Info, Mail } from 'lucide-react';
import PasswordInput from '@/components/password-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import PlatformSettingsLayout from '@/layouts/platform/settings-layout';

type Settings = {
    host: string;
    port: number | null;
    scheme: string;
    username: string | null;
    from_address: string;
    from_name: string;
};

export default function EmailSettings({
    configured,
    fallbackMailer,
    settings,
    hasPassword,
    status,
}: {
    configured: boolean;
    fallbackMailer: string;
    settings: Settings;
    hasPassword: boolean;
    status: string | null;
}) {
    const form = useForm({
        ...settings,
        port: settings.port === null ? '' : String(settings.port),
        username: settings.username ?? '',
        password: '',
    });
    const test = useForm({ recipient: '' });
    const busy = form.processing || test.processing;

    return (
        <>
            <Head title="Email · Amministrazione" />
            <PlatformSettingsLayout>
                <header>
                    <h2 className="text-xl font-semibold">Email</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Un unico server SMTP per tutte le aziende, inclusi
                        verifica email, recupero password e inviti.
                    </p>
                </header>

                {!configured && (
                    <Alert>
                        <Info />
                        <AlertTitle>SMTP di Obake non configurato</AlertTitle>
                        <AlertDescription>
                            È attiva la configurazione Laravel (mailer:{' '}
                            {fallbackMailer}). I mailer log e array non
                            recapitano email reali. Salva la configurazione SMTP
                            prima della prova d’invio.
                        </AlertDescription>
                    </Alert>
                )}
                {status && (
                    <Alert role="status">
                        <CheckCircle2 />
                        <AlertTitle>Operazione completata</AlertTitle>
                        <AlertDescription>{status}</AlertDescription>
                    </Alert>
                )}

                <div className="grid items-start gap-4 xl:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Configurazione SMTP</CardTitle>
                            <CardDescription>
                                Le modifiche salvate si applicano alle email
                                successive. Le password esistenti non vengono
                                mostrate.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    form.put('/platform/settings/email', {
                                        preserveScroll: true,
                                        onSuccess: () => {
                                            form.setDefaults({
                                                ...form.data,
                                                password: '',
                                            });
                                            form.setData('password', '');
                                        },
                                    });
                                }}
                                aria-busy={form.processing}
                            >
                                <FieldGroup>
                                    <Field data-invalid={!!form.errors.host}>
                                        <FieldLabel htmlFor="smtp-host">
                                            Server
                                        </FieldLabel>
                                        <Input
                                            id="smtp-host"
                                            value={form.data.host}
                                            onChange={(e) =>
                                                form.setData(
                                                    'host',
                                                    e.target.value,
                                                )
                                            }
                                            required
                                            maxLength={255}
                                            autoComplete="off"
                                            placeholder="smtp.example.com"
                                            aria-invalid={!!form.errors.host}
                                            aria-describedby="smtp-host-error"
                                            disabled={busy}
                                        />
                                        <FieldError id="smtp-host-error">
                                            {form.errors.host}
                                        </FieldError>
                                    </Field>
                                    <Field data-invalid={!!form.errors.port}>
                                        <FieldLabel htmlFor="smtp-port">
                                            Porta
                                        </FieldLabel>
                                        <Input
                                            id="smtp-port"
                                            type="number"
                                            min={1}
                                            max={65535}
                                            value={form.data.port}
                                            onChange={(e) =>
                                                form.setData(
                                                    'port',
                                                    e.target.value,
                                                )
                                            }
                                            required
                                            aria-invalid={!!form.errors.port}
                                            aria-describedby="smtp-port-error"
                                            disabled={busy}
                                        />
                                        <FieldError id="smtp-port-error">
                                            {form.errors.port}
                                        </FieldError>
                                    </Field>
                                    <Field data-invalid={!!form.errors.scheme}>
                                        <FieldLabel htmlFor="smtp-scheme">
                                            Sicurezza
                                        </FieldLabel>
                                        <NativeSelect
                                            id="smtp-scheme"
                                            value={form.data.scheme}
                                            onChange={(e) => {
                                                const scheme = e.target.value;
                                                form.setData((data) => ({
                                                    ...data,
                                                    scheme,
                                                    port:
                                                        scheme === 'smtps'
                                                            ? '465'
                                                            : '587',
                                                }));
                                            }}
                                            required
                                            aria-invalid={!!form.errors.scheme}
                                            aria-describedby="smtp-scheme-error"
                                            disabled={busy}
                                        >
                                            <NativeSelectOption
                                                value=""
                                                disabled
                                            >
                                                Seleziona sicurezza
                                            </NativeSelectOption>
                                            <NativeSelectOption value="smtp">
                                                Automatica / STARTTLS
                                            </NativeSelectOption>
                                            <NativeSelectOption value="smtps">
                                                SMTPS (TLS implicito)
                                            </NativeSelectOption>
                                        </NativeSelect>
                                        <FieldError id="smtp-scheme-error">
                                            {form.errors.scheme}
                                        </FieldError>
                                    </Field>
                                    <Field
                                        data-invalid={!!form.errors.username}
                                    >
                                        <FieldLabel htmlFor="smtp-username">
                                            Username
                                        </FieldLabel>
                                        <Input
                                            id="smtp-username"
                                            value={form.data.username}
                                            onChange={(e) =>
                                                form.setData(
                                                    'username',
                                                    e.target.value,
                                                )
                                            }
                                            maxLength={255}
                                            autoComplete="off"
                                            aria-invalid={
                                                !!form.errors.username
                                            }
                                            aria-describedby="smtp-username-error"
                                            disabled={busy}
                                        />
                                        <FieldError id="smtp-username-error">
                                            {form.errors.username}
                                        </FieldError>
                                    </Field>
                                    <Field
                                        data-invalid={!!form.errors.password}
                                    >
                                        <FieldLabel htmlFor="smtp-password">
                                            Password
                                        </FieldLabel>
                                        <PasswordInput
                                            id="smtp-password"
                                            value={form.data.password}
                                            onChange={(e) =>
                                                form.setData(
                                                    'password',
                                                    e.target.value,
                                                )
                                            }
                                            maxLength={4096}
                                            autoComplete="new-password"
                                            aria-invalid={
                                                !!form.errors.password
                                            }
                                            aria-describedby="smtp-password-help smtp-password-error"
                                            disabled={busy}
                                        />
                                        <FieldDescription id="smtp-password-help">
                                            {hasPassword
                                                ? 'Password già configurata. Lascia vuoto per mantenerla.'
                                                : 'Nessuna password configurata. Inseriscila se il server richiede autenticazione.'}
                                        </FieldDescription>
                                        <FieldError id="smtp-password-error">
                                            {form.errors.password}
                                        </FieldError>
                                    </Field>
                                    <Field
                                        data-invalid={
                                            !!form.errors.from_address
                                        }
                                    >
                                        <FieldLabel htmlFor="smtp-from-address">
                                            Email mittente
                                        </FieldLabel>
                                        <Input
                                            id="smtp-from-address"
                                            type="email"
                                            value={form.data.from_address}
                                            onChange={(e) =>
                                                form.setData(
                                                    'from_address',
                                                    e.target.value,
                                                )
                                            }
                                            required
                                            maxLength={255}
                                            aria-invalid={
                                                !!form.errors.from_address
                                            }
                                            aria-describedby="smtp-from-address-error"
                                            disabled={busy}
                                        />
                                        <FieldError id="smtp-from-address-error">
                                            {form.errors.from_address}
                                        </FieldError>
                                    </Field>
                                    <Field
                                        data-invalid={!!form.errors.from_name}
                                    >
                                        <FieldLabel htmlFor="smtp-from-name">
                                            Nome mittente
                                        </FieldLabel>
                                        <Input
                                            id="smtp-from-name"
                                            value={form.data.from_name}
                                            onChange={(e) =>
                                                form.setData(
                                                    'from_name',
                                                    e.target.value,
                                                )
                                            }
                                            required
                                            maxLength={255}
                                            aria-invalid={
                                                !!form.errors.from_name
                                            }
                                            aria-describedby="smtp-from-name-error"
                                            disabled={busy}
                                        />
                                        <FieldError id="smtp-from-name-error">
                                            {form.errors.from_name}
                                        </FieldError>
                                    </Field>
                                    <Button type="submit" disabled={busy}>
                                        {form.processing && (
                                            <Spinner data-icon="inline-start" />
                                        )}
                                        {form.processing
                                            ? 'Salvataggio…'
                                            : 'Salva configurazione'}
                                    </Button>
                                </FieldGroup>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Invia email di test</CardTitle>
                            <CardDescription>
                                La prova usa la configurazione salvata. L’esito
                                conferma l’accettazione da parte del trasporto
                                SMTP, senza garantire il recapito nella casella.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    test.post('/platform/settings/email/test', {
                                        preserveScroll: true,
                                    });
                                }}
                                aria-busy={test.processing}
                            >
                                <FieldGroup>
                                    <Field
                                        data-invalid={!!test.errors.recipient}
                                    >
                                        <FieldLabel htmlFor="smtp-recipient">
                                            Email destinataria
                                        </FieldLabel>
                                        <Input
                                            id="smtp-recipient"
                                            type="email"
                                            value={test.data.recipient}
                                            onChange={(e) =>
                                                test.setData(
                                                    'recipient',
                                                    e.target.value,
                                                )
                                            }
                                            required
                                            maxLength={255}
                                            aria-invalid={
                                                !!test.errors.recipient
                                            }
                                            aria-describedby="smtp-recipient-error"
                                            disabled={busy}
                                        />
                                        <FieldError id="smtp-recipient-error">
                                            {test.errors.recipient}
                                        </FieldError>
                                    </Field>
                                    {(!configured || form.isDirty) && (
                                        <FieldDescription>
                                            Salva la configurazione prima di
                                            inviare l’email di test.
                                        </FieldDescription>
                                    )}
                                    <Button
                                        type="submit"
                                        variant="outline"
                                        disabled={
                                            busy || !configured || form.isDirty
                                        }
                                    >
                                        {test.processing ? (
                                            <Spinner data-icon="inline-start" />
                                        ) : (
                                            <Mail data-icon="inline-start" />
                                        )}
                                        {test.processing
                                            ? 'Invio in corso…'
                                            : 'Invia email di test'}
                                    </Button>
                                </FieldGroup>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </PlatformSettingsLayout>
        </>
    );
}

EmailSettings.layout = {
    breadcrumbs: [
        { title: 'Amministrazione', href: '/platform' },
        { title: 'Email', href: '/platform/settings/email' },
    ],
};

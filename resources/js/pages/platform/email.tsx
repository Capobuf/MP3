import { Head, useForm } from '@inertiajs/react';
import { CheckCircle2, Save, Send, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import PasswordInput from '@/components/password-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardAction,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
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
    settings,
    hasPassword,
    status,
    sendError,
}: {
    configured: boolean;
    settings: Settings;
    hasPassword: boolean;
    status: string | null;
    sendError: { message: string; reference?: string } | null;
}) {
    const form = useForm({
        ...settings,
        port: settings.port === null ? '' : String(settings.port),
        username: settings.username ?? '',
        password: '',
    });
    const test = useForm({ recipient: '' });
    const [testOpen, setTestOpen] = useState(false);
    const busy = form.processing || test.processing;

    return (
        <>
            <Head title="Email · Amministrazione" />
            <PlatformSettingsLayout>
                <header>
                    <h2 className="text-xl font-semibold">Email</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Configura il mittente e il server di invio per tutte le
                        aziende.
                    </p>
                </header>

                {status && (
                    <Alert role="status">
                        <CheckCircle2 />
                        <AlertTitle>Operazione completata</AlertTitle>
                        <AlertDescription>{status}</AlertDescription>
                    </Alert>
                )}

                <Dialog open={testOpen} onOpenChange={setTestOpen}>
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle>Configurazione SMTP</CardTitle>
                            <CardAction>
                                <Badge variant="secondary">
                                    {configured
                                        ? 'Configurata'
                                        : 'Da configurare'}
                                </Badge>
                            </CardAction>
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
                                    <FieldSet>
                                        <FieldLegend>Connessione</FieldLegend>
                                        <Field
                                            data-invalid={!!form.errors.host}
                                        >
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
                                                aria-invalid={
                                                    !!form.errors.host
                                                }
                                                aria-describedby="smtp-host-error"
                                                disabled={busy}
                                            />
                                            <FieldError id="smtp-host-error">
                                                {form.errors.host}
                                            </FieldError>
                                        </Field>
                                        <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                                            <Field
                                                data-invalid={
                                                    !!form.errors.scheme
                                                }
                                            >
                                                <FieldLabel htmlFor="smtp-scheme">
                                                    Sicurezza
                                                </FieldLabel>
                                                <NativeSelect
                                                    id="smtp-scheme"
                                                    value={form.data.scheme}
                                                    onChange={(e) => {
                                                        const scheme =
                                                            e.target.value;
                                                        form.setData(
                                                            (data) => ({
                                                                ...data,
                                                                scheme,
                                                                port:
                                                                    scheme ===
                                                                    'smtps'
                                                                        ? '465'
                                                                        : '587',
                                                            }),
                                                        );
                                                    }}
                                                    required
                                                    aria-invalid={
                                                        !!form.errors.scheme
                                                    }
                                                    aria-describedby="smtp-scheme-error"
                                                    disabled={busy}
                                                >
                                                    <NativeSelectOption
                                                        value=""
                                                        disabled
                                                    >
                                                        Seleziona…
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
                                                data-invalid={
                                                    !!form.errors.port
                                                }
                                            >
                                                <FieldLabel htmlFor="smtp-port">
                                                    Porta
                                                </FieldLabel>
                                                <Input
                                                    id="smtp-port"
                                                    type="number"
                                                    placeholder={
                                                        form.data.scheme ===
                                                        'smtps'
                                                            ? '465'
                                                            : form.data
                                                                    .scheme ===
                                                                'smtp'
                                                              ? '587'
                                                              : 'Es. 587'
                                                    }
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
                                                    aria-invalid={
                                                        !!form.errors.port
                                                    }
                                                    aria-describedby="smtp-port-error"
                                                    disabled={busy}
                                                />
                                                <FieldError id="smtp-port-error">
                                                    {form.errors.port}
                                                </FieldError>
                                            </Field>
                                        </FieldGroup>
                                    </FieldSet>
                                    <Separator />
                                    <FieldSet>
                                        <FieldLegend>Credenziali</FieldLegend>
                                        <FieldGroup className="grid gap-4 sm:grid-cols-2">
                                            <Field
                                                data-invalid={
                                                    !!form.errors.username
                                                }
                                            >
                                                <FieldLabel htmlFor="smtp-username">
                                                    Nome utente
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
                                                    placeholder="Opzionale"
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
                                                data-invalid={
                                                    !!form.errors.password
                                                }
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
                                                    placeholder={
                                                        hasPassword
                                                            ? 'Password salvata'
                                                            : 'Opzionale'
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
                                                        ? 'Lascia vuoto per mantenere la password salvata.'
                                                        : 'Richiesta solo se il server usa autenticazione.'}
                                                </FieldDescription>
                                                <FieldError id="smtp-password-error">
                                                    {form.errors.password}
                                                </FieldError>
                                            </Field>
                                        </FieldGroup>
                                    </FieldSet>
                                    <Separator />
                                    <FieldSet>
                                        <FieldLegend>Mittente</FieldLegend>
                                        <FieldGroup className="grid gap-4 sm:grid-cols-2">
                                            <Field
                                                data-invalid={
                                                    !!form.errors.from_name
                                                }
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
                                                    value={
                                                        form.data.from_address
                                                    }
                                                    onChange={(e) =>
                                                        form.setData(
                                                            'from_address',
                                                            e.target.value,
                                                        )
                                                    }
                                                    required
                                                    maxLength={255}
                                                    aria-invalid={
                                                        !!form.errors
                                                            .from_address
                                                    }
                                                    aria-describedby="smtp-from-address-error"
                                                    disabled={busy}
                                                />
                                                <FieldError id="smtp-from-address-error">
                                                    {form.errors.from_address}
                                                </FieldError>
                                            </Field>
                                        </FieldGroup>
                                    </FieldSet>
                                    <div className="flex justify-end gap-2">
                                        <Button type="submit" disabled={busy}>
                                            {form.processing ? (
                                                <Spinner data-icon="inline-start" />
                                            ) : (
                                                <Save data-icon="inline-start" />
                                            )}
                                            Salva
                                        </Button>
                                        <DialogTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={busy}
                                            >
                                                <Send data-icon="inline-start" />
                                                Test
                                            </Button>
                                        </DialogTrigger>
                                    </div>
                                </FieldGroup>
                            </form>
                        </CardContent>
                    </Card>

                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Test email</DialogTitle>
                            <DialogDescription>
                                Invia un’email con la configurazione salvata.
                            </DialogDescription>
                        </DialogHeader>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                test.post('/platform/settings/email/test', {
                                    preserveScroll: true,
                                    onSuccess: (page) => {
                                        if (!page.props.sendError)
                                            setTestOpen(false);
                                    },
                                });
                            }}
                            aria-busy={test.processing}
                        >
                            <FieldGroup className="gap-4">
                                {sendError && !test.processing && (
                                    <Alert>
                                        <TriangleAlert />
                                        <AlertTitle>
                                            Invio non riuscito
                                        </AlertTitle>
                                        <AlertDescription>
                                            <p>{sendError.message}</p>
                                            {sendError.reference && (
                                                <p className="break-all">
                                                    Riferimento:{' '}
                                                    {sendError.reference}
                                                </p>
                                            )}
                                        </AlertDescription>
                                    </Alert>
                                )}
                                <Field data-invalid={!!test.errors.recipient}>
                                    <FieldLabel htmlFor="smtp-recipient">
                                        Destinatario
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
                                        placeholder="nome@azienda.it"
                                        maxLength={255}
                                        aria-invalid={!!test.errors.recipient}
                                        aria-describedby="smtp-recipient-error"
                                        disabled={busy}
                                    />
                                    <FieldError id="smtp-recipient-error">
                                        {test.errors.recipient}
                                    </FieldError>
                                </Field>
                                {(!configured || form.isDirty) && (
                                    <FieldDescription>
                                        Salva le modifiche prima di inviare la
                                        prova.
                                    </FieldDescription>
                                )}
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={test.processing}
                                        >
                                            Annulla
                                        </Button>
                                    </DialogClose>
                                    <Button
                                        type="submit"
                                        disabled={
                                            busy || !configured || form.isDirty
                                        }
                                    >
                                        {test.processing ? (
                                            <Spinner data-icon="inline-start" />
                                        ) : (
                                            <Send data-icon="inline-start" />
                                        )}
                                        {test.processing
                                            ? 'Invio in corso…'
                                            : 'Invia'}
                                    </Button>
                                </DialogFooter>
                            </FieldGroup>
                        </form>
                    </DialogContent>
                </Dialog>
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

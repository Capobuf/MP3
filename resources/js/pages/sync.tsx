import { Head, useForm, usePage } from '@inertiajs/react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import PasswordInput from '@/components/password-input';
import { useClipboard } from '@/hooks/use-clipboard';
import { TenantSettingsNav } from '@/components/management/tenant-settings-nav';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import PlatformSettingsLayout from '@/layouts/platform/settings-layout';
import type { Tenant } from '@/types';

type SyncTenant = Tenant & {
    enabled: boolean;
    folder_id: string | null;
    last_status: string | null;
    last_message: string | null;
    last_attempted_at: string | null;
    last_synced_at: string | null;
};

function SyncRow({
    item,
    platform,
    connected,
}: {
    item: SyncTenant;
    platform: boolean;
    connected: boolean;
}) {
    const form = useForm({ enabled: !!item.enabled });
    const run = useForm<{ sync?: string }>({});
    const path = platform
        ? `/platform/settings/sync/tenants/${item.id}`
        : `/t/${item.slug}/settings/sync`;
    const busy = form.processing || run.processing;
    return (
        <TableRow>
            <TableCell>{item.name}</TableCell>
            <TableCell>
                {platform ? (
                    <Field orientation="horizontal">
                        <Checkbox
                            id={`sync-${item.id}`}
                            checked={!!item.enabled}
                            disabled={busy}
                            onCheckedChange={(checked) => {
                                form.transform(() => ({
                                    enabled: checked === true,
                                }));
                                form.put(path, { preserveScroll: true });
                            }}
                        />
                        <FieldLabel htmlFor={`sync-${item.id}`}>
                            Abilitata
                        </FieldLabel>
                    </Field>
                ) : item.enabled ? (
                    'Abilitata'
                ) : (
                    'Disabilitata dalla piattaforma'
                )}
            </TableCell>
            <TableCell>
                {item.folder_id ? (
                    <a
                        className="text-primary hover:opacity-80"
                        href={`https://drive.google.com/drive/folders/${encodeURIComponent(item.folder_id)}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Apri cartella
                    </a>
                ) : (
                    'Non ancora creata'
                )}
            </TableCell>
            <TableCell className="max-w-sm whitespace-normal">
                <p>
                    {item.last_status === 'running'
                        ? 'In corso'
                        : item.last_status === 'failed'
                          ? 'Errore'
                          : item.last_status === 'success'
                            ? 'Completata'
                            : 'Mai eseguita'}
                </p>
                {item.last_message && <p>{item.last_message}</p>}
                {item.last_attempted_at && (
                    <p>Ultimo tentativo: {item.last_attempted_at} UTC</p>
                )}
                {item.last_synced_at && (
                    <p>Ultimo successo: {item.last_synced_at} UTC</p>
                )}
                <FieldError>
                    {form.errors.enabled ||
                        Object.values(form.errors).join(' ') ||
                        run.errors.sync}
                </FieldError>
            </TableCell>
            <TableCell>
                <Button
                    variant="outline"
                    disabled={busy || !connected || !item.enabled}
                    onClick={() => run.post(path, { preserveScroll: true })}
                >
                    {run.processing && <Spinner data-icon="inline-start" />}
                    Sincronizza ora<span className="sr-only"> {item.name}</span>
                </Button>
            </TableCell>
        </TableRow>
    );
}

export default function Sync({
    tenant,
    connected,
    configured,
    clientId,
    hasClientSecret,
    account,
    connectionError,
    redirectUri,
    rootFolderId,
    tenants,
}: {
    tenant: Tenant | null;
    connected: boolean;
    configured: boolean;
    clientId: string | null;
    hasClientSecret: boolean;
    account: string | null;
    connectionError: string | null;
    redirectUri: string | null;
    rootFolderId: string | null;
    tenants: SyncTenant[];
}) {
    const disconnect = useForm<{ sync?: string }>({});
    const connect = useForm<{ sync?: string }>({});
    const credentials = useForm({
        client_id: clientId ?? '',
        client_secret: '',
    });
    const [copiedText, copy] = useClipboard();
    const CopyIcon = copiedText === redirectUri ? Check : Copy;
    const busy =
        credentials.processing || connect.processing || disconnect.processing;
    const { errors } = usePage().props;
    const content = (
        <>
            <Head
                title={tenant ? `Sync · ${tenant.name}` : 'Sync piattaforma'}
            />
            {!tenant && (
                <Card>
                    <CardHeader>
                        <CardTitle>Account Google centrale</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <p>
                            {connected ? account : 'Google Drive non collegato'}
                        </p>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                credentials.put(
                                    '/platform/settings/sync/credentials',
                                    {
                                        preserveScroll: true,
                                        onSuccess: () =>
                                            credentials.reset('client_secret'),
                                    },
                                );
                            }}
                        >
                            <FieldGroup>
                                <Field
                                    data-invalid={
                                        !!credentials.errors.client_id
                                    }
                                >
                                    <FieldLabel htmlFor="drive-client-id">
                                        Client ID
                                    </FieldLabel>
                                    <Input
                                        id="drive-client-id"
                                        value={credentials.data.client_id}
                                        onChange={(event) =>
                                            credentials.setData(
                                                'client_id',
                                                event.target.value,
                                            )
                                        }
                                        required
                                        maxLength={255}
                                        autoComplete="off"
                                        disabled={busy}
                                        aria-invalid={
                                            !!credentials.errors.client_id
                                        }
                                    />
                                    <FieldError>
                                        {credentials.errors.client_id}
                                    </FieldError>
                                </Field>
                                <Field
                                    data-invalid={
                                        !!credentials.errors.client_secret
                                    }
                                >
                                    <FieldLabel htmlFor="drive-client-secret">
                                        Client Secret
                                    </FieldLabel>
                                    <PasswordInput
                                        id="drive-client-secret"
                                        value={credentials.data.client_secret}
                                        onChange={(event) =>
                                            credentials.setData(
                                                'client_secret',
                                                event.target.value,
                                            )
                                        }
                                        required={
                                            !hasClientSecret ||
                                            credentials.data.client_id !==
                                                clientId
                                        }
                                        maxLength={4096}
                                        autoComplete="new-password"
                                        disabled={busy}
                                        aria-invalid={
                                            !!credentials.errors.client_secret
                                        }
                                    />
                                    {hasClientSecret && (
                                        <FieldDescription>
                                            Lascia vuoto per mantenere il secret
                                            salvato.
                                        </FieldDescription>
                                    )}
                                    <FieldError>
                                        {credentials.errors.client_secret}
                                    </FieldError>
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="drive-callback">
                                        URL di callback
                                    </FieldLabel>
                                    <InputGroup>
                                        <InputGroupInput
                                            id="drive-callback"
                                            readOnly
                                            value={redirectUri ?? ''}
                                            onFocus={(event) =>
                                                event.target.select()
                                            }
                                        />
                                        <InputGroupAddon align="inline-end">
                                            <InputGroupButton
                                                size="icon-sm"
                                                aria-label="Copia URL di callback"
                                                title="Copia URL di callback"
                                                onClick={async () => {
                                                    if (
                                                        redirectUri &&
                                                        (await copy(
                                                            redirectUri,
                                                        ))
                                                    )
                                                        toast.success(
                                                            'URL copiato',
                                                        );
                                                    else
                                                        toast.error(
                                                            'Copia non riuscita. Seleziona e copia l’URL.',
                                                        );
                                                }}
                                            >
                                                <CopyIcon />
                                            </InputGroupButton>
                                        </InputGroupAddon>
                                    </InputGroup>
                                    <FieldDescription>
                                        Da autorizzare in Google Cloud.
                                    </FieldDescription>
                                </Field>
                                <Button
                                    type="submit"
                                    disabled={busy || !credentials.isDirty}
                                >
                                    Salva credenziali
                                </Button>
                                {credentials.recentlySuccessful && (
                                    <p role="status">Credenziali salvate.</p>
                                )}
                            </FieldGroup>
                        </form>
                        {rootFolderId && (
                            <a
                                className="text-primary hover:opacity-80"
                                href={`https://drive.google.com/drive/folders/${encodeURIComponent(rootFolderId)}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Apri cartella MP3
                            </a>
                        )}
                        {(connectionError || errors.sync) && (
                            <Alert variant="destructive">
                                <AlertTitle>Connessione Drive</AlertTitle>
                                <AlertDescription>
                                    {errors.sync || connectionError}
                                </AlertDescription>
                            </Alert>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {configured && (
                                <Button
                                    disabled={busy || credentials.isDirty}
                                    onClick={() =>
                                        connect.post(
                                            '/platform/settings/sync/connect',
                                        )
                                    }
                                >
                                    {connected
                                        ? 'Ricollega Google'
                                        : 'Collega Google'}
                                </Button>
                            )}
                            {connected && (
                                <Button
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() =>
                                        disconnect.delete(
                                            '/platform/settings/sync/connect',
                                        )
                                    }
                                >
                                    Disconnetti Google
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
            <Card>
                <CardHeader>
                    <CardTitle>
                        {tenant ? 'Sincronizzazione ambiente' : 'Ambienti'}
                    </CardTitle>
                    <CardDescription>
                        Report annuali aggiornati ogni giorno alle 03:00. Solo
                        MP3 → Drive.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Ambiente</TableHead>
                                <TableHead>Attivazione</TableHead>
                                <TableHead>Cartella</TableHead>
                                <TableHead>Ultimo esito</TableHead>
                                <TableHead>Azioni</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tenants.map((item) => (
                                <SyncRow
                                    key={item.id}
                                    item={item}
                                    platform={!tenant}
                                    connected={connected}
                                />
                            ))}
                        </TableBody>
                    </Table>
                    {tenants.length === 0 && (
                        <p>Nessun ambiente disponibile.</p>
                    )}
                </CardContent>
            </Card>
        </>
    );
    return tenant ? (
        <div className="page-shell">
            <header>
                <p className="text-sm text-muted-foreground">{tenant.name}</p>
                <h1 className="page-title">Impostazioni ambiente — Sync</h1>
            </header>
            <TenantSettingsNav slug={tenant.slug} />
            {content}
        </div>
    ) : (
        <PlatformSettingsLayout>{content}</PlatformSettingsLayout>
    );
}

Sync.layout = { breadcrumbs: [{ title: 'Sync', href: '/dashboard' }] };

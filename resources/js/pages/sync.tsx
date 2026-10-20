import { Head, useForm, usePage } from '@inertiajs/react';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
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
                    'Da assegnare alla prima sincronizzazione'
                )}
            </TableCell>
            <TableCell className="max-w-sm whitespace-normal">
                <p>
                    {item.last_status === 'running'
                        ? 'In corso; se interrotta, riprova.'
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
    account,
    connectionError,
    redirectUri,
    rootFolderId,
    tenants,
}: {
    tenant: Tenant | null;
    connected: boolean;
    configured: boolean;
    account: string | null;
    connectionError: string | null;
    redirectUri: string | null;
    rootFolderId: string | null;
    tenants: SyncTenant[];
}) {
    const disconnect = useForm<{ sync?: string }>({});
    const connect = useForm<{ sync?: string }>({});
    const { errors } = usePage().props;
    const content = (
        <>
            <Head
                title={tenant ? `Sync · ${tenant.name}` : 'Sync piattaforma'}
            />
            <Alert>
                <AlertTitle>
                    MP3 → Google Drive ·{' '}
                    {connected ? 'Account collegato' : 'Account non collegato'}
                </AlertTitle>
                <AlertDescription>
                    Ogni ambiente abilitato esporta un file AAAA.xlsx per tutti
                    gli anni presenti in spese, righe economiche e Budget. Ogni
                    file contiene Spese, Righe economiche, Contratti, Progetti e
                    Budget; le anagrafiche sono complete. Sincronizzazione
                    giornaliera alle 03:00 Europe/Rome e su richiesta. I file
                    sono report di consultazione: le modifiche su Drive possono
                    essere sovrascritte e non vengono importate in MP3.
                </AlertDescription>
            </Alert>
            {!tenant && (
                <Card>
                    <CardHeader>
                        <CardTitle>Account Google centrale</CardTitle>
                        <CardDescription>
                            La connessione è condivisa dagli ambienti abilitati.
                            La disconnessione conserva tutti i file remoti.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        {account && <p>Account: {account}</p>}
                        {!configured && (
                            <p>
                                Configura GOOGLE_DRIVE_CLIENT_ID e
                                GOOGLE_DRIVE_CLIENT_SECRET sul server.
                            </p>
                        )}
                        <p className="break-all">
                            URI di callback da autorizzare in Google Cloud:{' '}
                            {redirectUri}
                        </p>
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
                                    disabled={
                                        connect.processing ||
                                        disconnect.processing
                                    }
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
                                    disabled={disconnect.processing}
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
                        Gli upload aggiornano gli stessi file. Nessuna
                        cancellazione automatica su Drive.
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

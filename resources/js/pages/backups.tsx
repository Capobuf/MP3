import { Head, useForm } from '@inertiajs/react';
import { Download, LoaderCircle } from 'lucide-react';
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
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Empty, EmptyHeader, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
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

type Settings = {
    frequency: string;
    time: string;
    weekday: number;
    last_status: string | null;
    last_message: string | null;
    last_started_at: string | null;
};

export default function Backups({
    tenant,
    settings,
    archives,
    empty,
    maxFileKb,
}: {
    tenant: Tenant | null;
    settings: Settings;
    archives: { name: string; size: number; created_at: string }[];
    empty: boolean;
    maxFileKb: number;
}) {
    const path = tenant
        ? `/t/${tenant.slug}/settings/backups`
        : '/platform/settings/backups';
    const create = useForm<{ backup?: string }>({});
    const schedule = useForm({
        frequency: settings.frequency,
        time: settings.time,
        weekday: settings.weekday,
    });
    const restore = useForm<{ file: File | null; confirmation: boolean }>({
        file: null,
        confirmation: false,
    });
    const busy = create.processing || restore.processing;
    const content = (
        <>
            <Head
                title={
                    tenant ? `Backup · ${tenant.name}` : 'Backup piattaforma'
                }
            />
            <Alert>
                <AlertTitle>
                    {tenant
                        ? 'Backup dell’ambiente'
                        : 'Backup completo della piattaforma'}
                </AlertTitle>
                <AlertDescription>
                    {tenant
                        ? 'Lo ZIP conserva dati di tutti gli anni, impostazioni, commenti, allegati e associazioni utente. Gli account globali esistenti restano invariati; i nuovi account accedono tramite recupero password.'
                        : 'Lo ZIP contiene database, documenti, codice, configurazione e chiavi segrete. Conservalo in un luogo sicuro. Il ripristino globale si esegue dal server su una destinazione vuota.'}
                </AlertDescription>
            </Alert>
            {settings.last_message && (
                <Alert
                    variant={
                        settings.last_status === 'failed'
                            ? 'destructive'
                            : 'default'
                    }
                >
                    <AlertTitle>
                        Ultima operazione
                        {settings.last_started_at
                            ? ` · ${settings.last_started_at} UTC`
                            : ''}
                    </AlertTitle>
                    <AlertDescription>{settings.last_message}</AlertDescription>
                </Alert>
            )}
            <Card>
                <CardHeader>
                    <CardTitle>Crea backup</CardTitle>
                    <CardDescription>
                        Durante l’operazione i salvataggi sono temporaneamente
                        sospesi. Il download sarà disponibile dopo la verifica
                        dell’archivio.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            create.post(path, { preserveScroll: true });
                        }}
                    >
                        <FieldGroup>
                            {create.errors.backup && (
                                <FieldError>{create.errors.backup}</FieldError>
                            )}
                            <Button type="submit" disabled={busy}>
                                {create.processing && (
                                    <LoaderCircle
                                        className="animate-spin"
                                        data-icon="inline-start"
                                    />
                                )}
                                {create.processing
                                    ? 'Creazione e verifica…'
                                    : 'Crea backup ZIP'}
                            </Button>
                        </FieldGroup>
                    </form>
                </CardContent>
            </Card>
            {!tenant && (
                <Card>
                    <CardHeader>
                        <CardTitle>Programmazione</CardTitle>
                        <CardDescription>
                            Orario Europe/Rome. I backup meno recenti vengono
                            eliminati automaticamente; l’ultimo archivio viene
                            sempre conservato.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                schedule.put(path, { preserveScroll: true });
                            }}
                        >
                            <FieldGroup>
                                <Field
                                    data-invalid={!!schedule.errors.frequency}
                                >
                                    <FieldLabel htmlFor="backup-frequency">
                                        Frequenza
                                    </FieldLabel>
                                    <NativeSelect
                                        id="backup-frequency"
                                        value={schedule.data.frequency}
                                        onChange={(event) =>
                                            schedule.setData(
                                                'frequency',
                                                event.target.value,
                                            )
                                        }
                                        aria-invalid={
                                            !!schedule.errors.frequency
                                        }
                                    >
                                        <NativeSelectOption value="disabled">
                                            Disabilitata
                                        </NativeSelectOption>
                                        <NativeSelectOption value="daily">
                                            Giornaliera
                                        </NativeSelectOption>
                                        <NativeSelectOption value="weekly">
                                            Settimanale
                                        </NativeSelectOption>
                                    </NativeSelect>
                                    <FieldError>
                                        {schedule.errors.frequency}
                                    </FieldError>
                                </Field>
                                <Field data-invalid={!!schedule.errors.time}>
                                    <FieldLabel htmlFor="backup-time">
                                        Orario
                                    </FieldLabel>
                                    <Input
                                        id="backup-time"
                                        type="time"
                                        required
                                        value={schedule.data.time}
                                        onChange={(event) =>
                                            schedule.setData(
                                                'time',
                                                event.target.value,
                                            )
                                        }
                                        aria-invalid={!!schedule.errors.time}
                                    />
                                    <FieldError>
                                        {schedule.errors.time}
                                    </FieldError>
                                </Field>
                                {schedule.data.frequency === 'weekly' && (
                                    <Field
                                        data-invalid={!!schedule.errors.weekday}
                                    >
                                        <FieldLabel htmlFor="backup-weekday">
                                            Giorno
                                        </FieldLabel>
                                        <NativeSelect
                                            id="backup-weekday"
                                            value={schedule.data.weekday}
                                            onChange={(event) =>
                                                schedule.setData(
                                                    'weekday',
                                                    Number(event.target.value),
                                                )
                                            }
                                            aria-invalid={
                                                !!schedule.errors.weekday
                                            }
                                        >
                                            {[
                                                'Domenica',
                                                'Lunedì',
                                                'Martedì',
                                                'Mercoledì',
                                                'Giovedì',
                                                'Venerdì',
                                                'Sabato',
                                            ].map((day, index) => (
                                                <NativeSelectOption
                                                    key={day}
                                                    value={index}
                                                >
                                                    {day}
                                                </NativeSelectOption>
                                            ))}
                                        </NativeSelect>
                                        <FieldError>
                                            {schedule.errors.weekday}
                                        </FieldError>
                                    </Field>
                                )}
                                <Button
                                    type="submit"
                                    disabled={busy || schedule.processing}
                                >
                                    Salva programmazione
                                </Button>
                                {schedule.recentlySuccessful && (
                                    <p role="status">Programmazione salvata.</p>
                                )}
                            </FieldGroup>
                        </form>
                    </CardContent>
                </Card>
            )}
            <Card>
                <CardHeader>
                    <CardTitle>Archivi disponibili</CardTitle>
                    <CardDescription>
                        Download privati riservati agli utenti autorizzati.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {archives.length === 0 ? (
                        <Empty>
                            <EmptyHeader>
                                <EmptyDescription>
                                    Nessun backup disponibile.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Archivio</TableHead>
                                    <TableHead>Dimensione</TableHead>
                                    <TableHead>
                                        <span className="sr-only">
                                            Download
                                        </span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {archives.map((archive) => (
                                    <TableRow key={archive.name}>
                                        <TableCell
                                            className="max-w-64 truncate"
                                            title={archive.name}
                                        >
                                            {archive.name}
                                        </TableCell>
                                        <TableCell>
                                            {(
                                                archive.size /
                                                1024 /
                                                1024
                                            ).toLocaleString('it-IT', {
                                                maximumFractionDigits: 2,
                                            })}{' '}
                                            MB
                                        </TableCell>
                                        <TableCell>
                                            <Button asChild variant="outline">
                                                <a
                                                    href={`${path}/${archive.name}`}
                                                >
                                                    <Download data-icon="inline-start" />
                                                    Scarica
                                                    <span className="sr-only">
                                                        {' '}
                                                        {archive.name}
                                                    </span>
                                                </a>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
            {tenant && (
                <Card>
                    <CardHeader>
                        <CardTitle>Ripristina nell’ambiente corrente</CardTitle>
                        <CardDescription>
                            Disponibile solo in un ambiente nuovo o vuoto. Il
                            nome e l’indirizzo dell’ambiente di destinazione
                            vengono conservati. Identità utente o associazioni
                            in conflitto bloccano l’intera operazione.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!empty ? (
                            <Alert>
                                <AlertTitle>Ambiente già popolato</AlertTitle>
                                <AlertDescription>
                                    Crea o seleziona un ambiente vuoto, senza
                                    impostazioni personalizzate, per
                                    ripristinare il backup.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    restore.post(`${path}/restore`, {
                                        preserveScroll: true,
                                    });
                                }}
                            >
                                <FieldGroup>
                                    <Field data-invalid={!!restore.errors.file}>
                                        <FieldLabel htmlFor="backup-file">
                                            Archivio ZIP (massimo{' '}
                                            {maxFileKb / 1024} MB)
                                        </FieldLabel>
                                        <Input
                                            id="backup-file"
                                            type="file"
                                            accept=".zip,application/zip"
                                            required
                                            disabled={busy}
                                            onChange={(event) =>
                                                restore.setData(
                                                    'file',
                                                    event.target.files?.[0] ??
                                                        null,
                                                )
                                            }
                                            aria-invalid={!!restore.errors.file}
                                        />
                                        <FieldError>
                                            {restore.errors.file}
                                        </FieldError>
                                    </Field>
                                    <Field
                                        orientation="horizontal"
                                        data-invalid={
                                            !!restore.errors.confirmation
                                        }
                                    >
                                        <Checkbox
                                            id="backup-confirmation"
                                            checked={restore.data.confirmation}
                                            onCheckedChange={(value) =>
                                                restore.setData(
                                                    'confirmation',
                                                    value === true,
                                                )
                                            }
                                            disabled={busy}
                                            aria-invalid={
                                                !!restore.errors.confirmation
                                            }
                                        />
                                        <FieldLabel htmlFor="backup-confirmation">
                                            Confermo il ripristino in{' '}
                                            {tenant.name} delle impostazioni,
                                            dei dati e delle associazioni
                                            presenti nello ZIP.
                                        </FieldLabel>
                                        <FieldError>
                                            {restore.errors.confirmation}
                                        </FieldError>
                                    </Field>
                                    <Button
                                        type="submit"
                                        disabled={
                                            busy ||
                                            !restore.data.file ||
                                            !restore.data.confirmation
                                        }
                                    >
                                        {restore.processing && (
                                            <LoaderCircle
                                                className="animate-spin"
                                                data-icon="inline-start"
                                            />
                                        )}
                                        {restore.processing
                                            ? 'Verifica e ripristino…'
                                            : 'Ripristina backup'}
                                    </Button>
                                </FieldGroup>
                            </form>
                        )}
                    </CardContent>
                </Card>
            )}
        </>
    );

    return tenant ? (
        <div className="page-shell">
            <header>
                <p className="text-sm text-muted-foreground">{tenant.name}</p>
                <h1 className="page-title">Impostazioni ambiente — Backup</h1>
            </header>
            <TenantSettingsNav slug={tenant.slug} />
            {content}
        </div>
    ) : (
        <PlatformSettingsLayout>{content}</PlatformSettingsLayout>
    );
}
Backups.layout = { breadcrumbs: [{ title: 'Backup', href: '/dashboard' }] };

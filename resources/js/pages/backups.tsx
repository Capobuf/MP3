import { Head, Link, useForm } from '@inertiajs/react';
import {
    Archive,
    Check,
    CloudUpload,
    Download,
    Info,
    LoaderCircle,
    Save,
    Trash2,
    X,
} from 'lucide-react';
import { useState } from 'react';
import { TenantSettingsNav } from '@/components/management/tenant-settings-nav';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Empty, EmptyHeader, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
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
import { cn } from '@/lib/utils';
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
    drive,
    driveCopies,
}: {
    tenant: Tenant | null;
    settings: Settings;
    archives: { name: string; size: number; created_at: string }[];
    empty: boolean;
    maxFileKb: number;
    drive: {
        backup_enabled: boolean;
        backup_last_status: string | null;
        backup_last_name: string | null;
        backup_last_message: string | null;
        backup_last_attempted_at: string | null;
    } | null;
    driveCopies: {
        object_key: string;
        last_status: string | null;
        last_message: string | null;
        last_synced_at: string | null;
    }[];
}) {
    const path = tenant
        ? `/t/${tenant.slug}/settings/backups`
        : '/platform/settings/backups';
    const create = useForm<{ backup?: string }>({});
    const schedule = useForm({
        frequency: settings.frequency,
        time: settings.time,
        weekday: settings.weekday,
        drive_enabled: !!drive?.backup_enabled,
    });
    const copy = useForm<{ archive: string; drive?: string }>({ archive: '' });
    const restore = useForm<{ file: File | null; confirmation: boolean }>({
        file: null,
        confirmation: false,
    });
    const [selected, setSelected] = useState<string[]>([]);
    const [deleting, setDeleting] = useState(false);
    const removal = useForm({ archives: [] as string[], confirmation: true });
    const selection = selected.filter((name) =>
        archives.some((archive) => archive.name === name),
    );
    const busy =
        create.processing ||
        restore.processing ||
        removal.processing ||
        copy.processing;
    function confirmDelete(names: string[]) {
        removal.clearErrors();
        removal.setData('archives', names);
        setDeleting(true);
    }
    const content = (
        <>
            <Head
                title={
                    tenant
                        ? `Backup · ${tenant.name}`
                        : 'Backup · Amministrazione'
                }
            />
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold">Backup</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Crea e gestisci gli archivi di sicurezza.
                    </p>
                </div>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        create.post(path, { preserveScroll: true });
                    }}
                    aria-busy={create.processing}
                >
                    <Button type="submit" disabled={busy}>
                        {create.processing ? (
                            <LoaderCircle
                                className="animate-spin"
                                data-icon="inline-start"
                            />
                        ) : (
                            <Archive data-icon="inline-start" />
                        )}
                        {create.processing
                            ? 'Creazione e verifica…'
                            : 'Crea backup'}
                    </Button>
                </form>
            </header>
            <FieldError>{create.errors.backup}</FieldError>
            <Alert role="note">
                <Info aria-hidden="true" />
                <AlertTitle>
                    {tenant
                        ? 'Backup dell’azienda'
                        : 'Prima di creare un backup'}
                </AlertTitle>
                <AlertDescription>
                    {tenant ? (
                        <>
                            <p>
                                Lo ZIP conserva dati di tutti gli anni,
                                impostazioni, commenti, allegati e associazioni
                                utente. Gli account globali esistenti restano
                                invariati; i nuovi account accedono tramite
                                recupero password.
                            </p>
                            <p>
                                Durante la creazione i salvataggi sono
                                temporaneamente sospesi.
                            </p>
                        </>
                    ) : (
                        <ul className="grid gap-2">
                            <li>
                                <strong>Contenuto.</strong> Lo ZIP include
                                database, documenti, codice, configurazione e
                                chiavi segrete. Conservalo in un luogo sicuro.
                            </li>
                            <li>
                                <strong>Ripristino.</strong> Si esegue dal
                                server, in una destinazione vuota.
                            </li>
                            <li>
                                <strong>Salvataggi.</strong> Durante la
                                creazione non è possibile salvare modifiche.
                            </li>
                        </ul>
                    )}
                </AlertDescription>
            </Alert>
            {settings.last_message && (
                <Alert
                    role={
                        settings.last_status === 'failed' ? 'alert' : 'status'
                    }
                    className={cn(
                        settings.last_status === 'success' &&
                            'border-finance-saving/30 bg-finance-saving/10 text-finance-saving',
                        settings.last_status === 'failed' &&
                            'border-destructive/30 bg-destructive/10 text-destructive',
                    )}
                >
                    {settings.last_status === 'success' && (
                        <Check aria-hidden="true" />
                    )}
                    {settings.last_status === 'failed' && (
                        <X aria-hidden="true" />
                    )}
                    {settings.last_status === 'running' && (
                        <LoaderCircle
                            className="animate-spin"
                            aria-hidden="true"
                        />
                    )}
                    {settings.last_status === 'deferred' && (
                        <Info aria-hidden="true" />
                    )}
                    <AlertTitle>
                        {settings.last_status === 'deferred'
                            ? 'Backup pianificato rinviato'
                            : settings.last_status === 'success'
                              ? 'Ultimo backup riuscito'
                              : settings.last_status === 'failed'
                                ? 'Backup non riuscito'
                                : settings.last_status === 'running'
                                  ? 'Backup in corso'
                                  : 'Ultima operazione'}
                        {settings.last_status !== 'deferred' &&
                        settings.last_started_at
                            ? ` · ${settings.last_started_at} UTC`
                            : ''}
                    </AlertTitle>
                    <AlertDescription className="text-inherit">
                        {settings.last_message}
                    </AlertDescription>
                </Alert>
            )}
            {!tenant && (
                <Card>
                    <CardHeader>
                        <CardTitle>Programmazione</CardTitle>
                        <CardDescription>
                            Orario italiano (Europe/Rome). Rotazione automatica
                            degli archivi meno recenti, conservando sempre
                            l’ultimo backup.
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
                                <FieldGroup className="grid gap-4 md:grid-cols-3">
                                    <Field
                                        data-invalid={
                                            !!schedule.errors.frequency
                                        }
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
                                    <Field
                                        data-invalid={!!schedule.errors.time}
                                    >
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
                                            aria-invalid={
                                                !!schedule.errors.time
                                            }
                                        />
                                        <FieldError>
                                            {schedule.errors.time}
                                        </FieldError>
                                    </Field>
                                    {schedule.data.frequency === 'weekly' && (
                                        <Field
                                            data-invalid={
                                                !!schedule.errors.weekday
                                            }
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
                                                        Number(
                                                            event.target.value,
                                                        ),
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
                                </FieldGroup>
                                <Separator />
                                <Field orientation="horizontal">
                                    <Checkbox
                                        id="backup-drive"
                                        checked={schedule.data.drive_enabled}
                                        disabled={busy || schedule.processing}
                                        onCheckedChange={(checked) =>
                                            schedule.setData(
                                                'drive_enabled',
                                                checked === true,
                                            )
                                        }
                                    />
                                    <FieldLabel htmlFor="backup-drive">
                                        Copia automatica su Google Drive
                                    </FieldLabel>
                                </Field>
                                <FieldDescription>
                                    I nuovi backup usano l’account configurato
                                    in{' '}
                                    <Link
                                        href="/platform/settings/sync"
                                        className="text-primary hover:opacity-80"
                                    >
                                        Sync
                                    </Link>
                                    . Le copie remote non vengono eliminate
                                    dalla rotazione locale.
                                </FieldDescription>
                                <FieldError>
                                    {schedule.errors.drive_enabled}
                                </FieldError>
                                <div className="flex flex-wrap items-center justify-end gap-3">
                                    {schedule.recentlySuccessful && (
                                        <p
                                            role="status"
                                            className="text-sm text-muted-foreground"
                                        >
                                            Programmazione salvata.
                                        </p>
                                    )}
                                    <Button
                                        type="submit"
                                        disabled={busy || schedule.processing}
                                    >
                                        {schedule.processing ? (
                                            <LoaderCircle
                                                className="animate-spin"
                                                data-icon="inline-start"
                                            />
                                        ) : (
                                            <Save data-icon="inline-start" />
                                        )}
                                        Salva
                                    </Button>
                                </div>
                            </FieldGroup>
                        </form>
                    </CardContent>
                </Card>
            )}
            {!tenant && drive?.backup_last_message && (
                <Alert
                    variant={
                        drive.backup_last_status === 'failed'
                            ? 'destructive'
                            : 'default'
                    }
                >
                    <AlertTitle>
                        Ultima copia Drive ·{' '}
                        {drive.backup_last_status === 'success'
                            ? 'Completata'
                            : drive.backup_last_status === 'failed'
                              ? 'Errore'
                              : 'In corso'}{' '}
                        · {drive.backup_last_attempted_at} UTC
                    </AlertTitle>
                    <AlertDescription>
                        <p className="break-all">{drive.backup_last_name}</p>
                        <p>{drive.backup_last_message}</p>
                    </AlertDescription>
                </Alert>
            )}
            <FieldError>{copy.errors.drive}</FieldError>
            <Card>
                <CardHeader>
                    <CardTitle>Archivi disponibili</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {selection.length > 1 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="self-start"
                            disabled={busy}
                            onClick={() => confirmDelete(selection)}
                        >
                            <Trash2 data-icon="inline-start" />
                            Elimina selezionati ({selection.length})
                        </Button>
                    )}
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
                                    <TableHead>
                                        <Checkbox
                                            aria-label="Seleziona tutti gli archivi"
                                            disabled={busy}
                                            checked={
                                                selection.length ===
                                                archives.length
                                                    ? true
                                                    : selection.length > 0
                                                      ? 'indeterminate'
                                                      : false
                                            }
                                            onCheckedChange={(checked) =>
                                                setSelected(
                                                    checked === true
                                                        ? archives.map(
                                                              (archive) =>
                                                                  archive.name,
                                                          )
                                                        : [],
                                                )
                                            }
                                        />
                                    </TableHead>
                                    <TableHead>Archivio</TableHead>
                                    <TableHead>Data (ora italiana)</TableHead>
                                    <TableHead className="text-right">
                                        Dimensione
                                    </TableHead>
                                    <TableHead>
                                        <span className="sr-only">Azioni</span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {archives.map((archive) => (
                                    <TableRow key={archive.name}>
                                        <TableCell>
                                            <Checkbox
                                                aria-label={`Seleziona ${archive.name}`}
                                                disabled={busy}
                                                checked={selection.includes(
                                                    archive.name,
                                                )}
                                                onCheckedChange={(checked) =>
                                                    setSelected(
                                                        checked === true
                                                            ? [
                                                                  ...selection,
                                                                  archive.name,
                                                              ]
                                                            : selection.filter(
                                                                  (name) =>
                                                                      name !==
                                                                      archive.name,
                                                              ),
                                                    )
                                                }
                                            />
                                        </TableCell>
                                        <TableCell
                                            className="max-w-64 truncate"
                                            title={archive.name}
                                        >
                                            {archive.name}
                                            {!tenant &&
                                                driveCopies
                                                    .filter(
                                                        (item) =>
                                                            item.object_key ===
                                                            `backup-${archive.name}`,
                                                    )
                                                    .map((item) => (
                                                        <p
                                                            key={
                                                                item.object_key
                                                            }
                                                            className="text-sm whitespace-normal"
                                                            title={
                                                                item.last_message ??
                                                                undefined
                                                            }
                                                        >
                                                            Drive:{' '}
                                                            {item.last_status ===
                                                            'success'
                                                                ? `copiato il ${item.last_synced_at} UTC`
                                                                : item.last_status ===
                                                                    'failed'
                                                                  ? item.last_message
                                                                  : 'copia in corso'}
                                                        </p>
                                                    ))}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <time dateTime={archive.created_at}>
                                                {new Date(
                                                    archive.created_at,
                                                ).toLocaleString('it-IT', {
                                                    dateStyle: 'short',
                                                    timeStyle: 'short',
                                                    timeZone: 'Europe/Rome',
                                                })}
                                            </time>
                                        </TableCell>
                                        <TableCell className="text-right whitespace-nowrap tabular-nums">
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
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                >
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
                                                {!tenant &&
                                                    drive?.backup_enabled && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={busy}
                                                            onClick={() => {
                                                                copy.transform(
                                                                    () => ({
                                                                        archive:
                                                                            archive.name,
                                                                    }),
                                                                );
                                                                copy.post(
                                                                    '/platform/settings/backups/drive',
                                                                    {
                                                                        preserveScroll: true,
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            <CloudUpload data-icon="inline-start" />
                                                            Copia su Drive
                                                            <span className="sr-only">
                                                                {' '}
                                                                {archive.name}
                                                            </span>
                                                        </Button>
                                                    )}
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    disabled={busy}
                                                    aria-label={`Elimina ${archive.name}`}
                                                    onClick={() =>
                                                        confirmDelete([
                                                            archive.name,
                                                        ])
                                                    }
                                                >
                                                    <Trash2 data-icon="inline-start" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
            <AlertDialog
                open={deleting}
                onOpenChange={(open) => {
                    if (!removal.processing) setDeleting(open);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Eliminare{' '}
                            {removal.data.archives.length === 1
                                ? 'l’archivio selezionato'
                                : `${removal.data.archives.length} archivi selezionati`}
                            ?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Gli archivi verranno eliminati definitivamente,
                            anche se sono le ultime copie disponibili. I dati
                            attuali dell’applicazione restano invariati.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <ul className="max-h-48 overflow-auto text-sm">
                        {removal.data.archives.map((name) => (
                            <li key={name} className="break-all">
                                {name}
                            </li>
                        ))}
                    </ul>
                    <FieldError>
                        {Object.values(removal.errors).join(' ')}
                    </FieldError>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={removal.processing}>
                            Annulla
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={removal.processing}
                            onClick={(event) => {
                                event.preventDefault();
                                removal.delete(path, {
                                    preserveScroll: true,
                                    onSuccess: () => {
                                        setSelected([]);
                                        setDeleting(false);
                                    },
                                });
                            }}
                        >
                            {removal.processing
                                ? 'Eliminazione…'
                                : 'Elimina definitivamente'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {tenant && (
                <Card>
                    <CardHeader>
                        <CardTitle>Ripristina nell’azienda corrente</CardTitle>
                        <CardDescription>
                            Disponibile solo in un’azienda nuova o vuota. Il
                            nome e l’indirizzo dell’azienda di destinazione
                            vengono conservati. Identità utente o associazioni
                            in conflitto bloccano l’intera operazione.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!empty ? (
                            <Alert>
                                <AlertTitle>Azienda già popolata</AlertTitle>
                                <AlertDescription>
                                    Crea o seleziona un’azienda vuota, senza
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
                <h1 className="page-title">Impostazioni — Backup</h1>
            </header>
            <TenantSettingsNav slug={tenant.slug} />
            {content}
        </div>
    ) : (
        <PlatformSettingsLayout>{content}</PlatformSettingsLayout>
    );
}
Backups.layout = { breadcrumbs: [{ title: 'Backup', href: '/dashboard' }] };

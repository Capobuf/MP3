import { router } from '@inertiajs/react';
import {
    Download,
    ExternalLink,
    FileImage,
    FileText,
    Paperclip,
    Trash2,
    Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { Tenant } from '@/types';
import { api, dateLabel, fileSize, uploadAttachment } from './helpers';
import type {
    Attachment,
    AttachmentLimits,
    AttachmentResource,
    DeletionResult,
} from './types';

type AttachmentList = { attachments: Attachment[]; limits: AttachmentLimits };

export function AttachmentsSection({
    tenant,
    resource,
    recordId,
}: {
    tenant: Tenant;
    resource: AttachmentResource;
    recordId: number;
}) {
    const path = `/t/${tenant.slug}/${resource}/${recordId}/attachments`;
    const input = useRef<HTMLInputElement>(null);
    const operation = useRef(false);
    const completed = useRef(new Map<string, number>());
    const [list, setList] = useState<Attachment[]>([]);
    const [limits, setLimits] = useState<AttachmentLimits | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [reload, setReload] = useState(0);
    const [errors, setErrors] = useState<string[]>([]);
    const [uploading, setUploading] = useState('');
    const [dragging, setDragging] = useState(false);
    const [selected, setSelected] = useState<Attachment | null>(null);
    const [deleting, setDeleting] = useState(false);
    const busy = !!uploading || deleting;

    useEffect(() => {
        let active = true;
        api<AttachmentList>(path)
            .then((data) => {
                if (active) {
                    const ids = new Set(
                        data.attachments.map((file) => file.id),
                    );
                    for (const [key, id] of completed.current) {
                        if (!ids.has(id)) completed.current.delete(key);
                    }
                    setList(data.attachments);
                    setLimits(data.limits);
                    setLoadError('');
                }
            })
            .catch((error: unknown) => {
                if (active)
                    setLoadError(
                        error instanceof Error
                            ? error.message
                            : 'Elenco allegati non disponibile.',
                    );
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [path, reload]);

    useEffect(() => {
        const stop = router.on('before', (event) => {
            if (operation.current) {
                event.preventDefault();
                toast.info(
                    'Attendi il completamento dell’operazione sugli allegati.',
                );
            }
        });
        const leave = (event: BeforeUnloadEvent) => {
            if (operation.current) event.preventDefault();
        };
        window.addEventListener('beforeunload', leave);
        return () => {
            stop();
            window.removeEventListener('beforeunload', leave);
        };
    }, []);

    async function upload(files: File[]) {
        if (operation.current || !limits || loading || loadError) return;
        if (files.length > limits.max_files) {
            setErrors([
                `Seleziona al massimo ${limits.max_files} file per volta.`,
            ]);
            return;
        }
        operation.current = true;
        setErrors([]);
        const failures: string[] = [];
        const seen = new Set<string>();
        let saved = 0;
        let skipped = 0;
        try {
            for (const [index, file] of files.entries()) {
                const key = `${file.name}:${file.size}:${file.lastModified}`;
                if (seen.has(key) || completed.current.has(key)) {
                    skipped++;
                    continue;
                }
                seen.add(key);
                const extension =
                    file.name.split('.').pop()?.toLowerCase() ?? '';
                if (!limits.extensions.includes(extension)) {
                    failures.push(`${file.name}: formato non consentito.`);
                    continue;
                }
                if (file.size > limits.max_size_bytes) {
                    failures.push(
                        `${file.name}: supera il limite di ${fileSize(limits.max_size_bytes)}.`,
                    );
                    continue;
                }
                setUploading(`${index + 1}/${files.length} · ${file.name}`);
                try {
                    const data = await uploadAttachment<{
                        attachment: Attachment;
                    }>(path, file);
                    completed.current.set(key, data.attachment.id);
                    setList((current) => [data.attachment, ...current]);
                    saved++;
                } catch (error) {
                    failures.push(
                        `${file.name}: ${error instanceof Error ? error.message : 'Caricamento non riuscito.'}`,
                    );
                }
            }
            if (saved)
                toast.success(
                    `${saved} ${saved === 1 ? 'allegato caricato' : 'allegati caricati'}.`,
                );
            if (failures.length)
                toast.error(
                    'Alcuni file non sono stati caricati. Consulta i dettagli nella sezione Allegati.',
                );
            if (skipped)
                toast.info(
                    `${skipped} file già selezionati o caricati sono stati ignorati.`,
                );
            setErrors(failures);
        } finally {
            operation.current = false;
            setUploading('');
        }
    }

    async function remove() {
        if (!selected || operation.current) return;
        operation.current = true;
        setDeleting(true);
        try {
            const result = await api<DeletionResult>(
                `${path}/${selected.id}`,
                'DELETE',
            );
            setList((current) =>
                current.filter((file) => file.id !== selected.id),
            );
            if (result.cleanup_failed) {
                toast.error(result.message);
                setErrors([result.message]);
            } else toast.success(result.message);
            for (const [key, id] of completed.current) {
                if (id === selected.id) completed.current.delete(key);
            }
            setSelected(null);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Eliminazione non riuscita.',
            );
        } finally {
            operation.current = false;
            setDeleting(false);
        }
    }

    return (
        <Card
            id="attachments"
            role="region"
            aria-label="Allegati"
            className="min-w-0 scroll-mt-6"
            aria-busy={loading || busy}
        >
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                    <CardTitle className="flex items-center gap-2">
                        Allegati{' '}
                        <Badge variant="secondary">
                            {loading || loadError ? '—' : list.length}
                        </Badge>
                    </CardTitle>
                    <CardDescription>
                        Documenti di questo elemento, disponibili agli utenti
                        autorizzati dell’ambiente.
                    </CardDescription>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    disabled={busy || loading || !!loadError}
                    onClick={() => input.current?.click()}
                >
                    <Paperclip data-icon="inline-start" /> Aggiungi allegati
                </Button>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
                <input
                    ref={input}
                    type="file"
                    multiple
                    tabIndex={-1}
                    className="sr-only"
                    aria-label="Seleziona allegati"
                    disabled={busy || loading || !!loadError}
                    accept={limits?.extensions
                        .map((extension) => `.${extension}`)
                        .join(',')}
                    onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        event.target.value = '';
                        void upload(files);
                    }}
                />
                <Button
                    type="button"
                    variant="outline"
                    className={cn(
                        'h-auto min-h-24 w-full flex-col gap-2 border-dashed p-4 whitespace-normal',
                        dragging && 'ring-2 ring-ring',
                    )}
                    disabled={busy || loading || !!loadError}
                    onClick={() => input.current?.click()}
                    onDragOver={(event) => {
                        event.preventDefault();
                        if (!busy) setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                        event.preventDefault();
                        setDragging(false);
                        void upload(Array.from(event.dataTransfer.files));
                    }}
                >
                    <Upload data-icon="inline-start" />
                    Trascina qui i documenti oppure seleziona i file
                </Button>
                {loadError && (
                    <Alert variant="destructive">
                        <AlertTitle>Elenco non disponibile</AlertTitle>
                        <AlertDescription>
                            {loadError}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setLoading(true);
                                    setReload((value) => value + 1);
                                }}
                            >
                                Riprova
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
                {!!errors.length && (
                    <Alert variant="destructive">
                        <AlertTitle>
                            Operazione non completata per alcuni file
                        </AlertTitle>
                        <AlertDescription>
                            <ul className="flex list-disc flex-col gap-1 pl-4 break-words">
                                {errors.map((error, index) => (
                                    <li key={`${index}:${error}`}>{error}</li>
                                ))}
                            </ul>
                            I file già caricati restano salvati. Se la
                            connessione si è interrotta, aggiorna l’elenco prima
                            di riprovare.
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                    setLoading(true);
                                    setReload((value) => value + 1);
                                }}
                            >
                                Aggiorna elenco
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
                <div
                    aria-live="polite"
                    className="flex min-h-6 min-w-0 items-center gap-2 text-sm text-muted-foreground"
                >
                    {uploading && (
                        <>
                            <Spinner />
                            <span className="truncate" title={uploading}>
                                Caricamento {uploading}
                            </span>
                        </>
                    )}
                </div>
                {loading ? (
                    <div
                        className="flex min-h-48 flex-col gap-3"
                        aria-label="Caricamento allegati"
                    >
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                    </div>
                ) : (
                    !loadError &&
                    (list.length === 0 ? (
                        <Empty className="min-h-48">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Paperclip />
                                </EmptyMedia>
                                <EmptyTitle>Nessun allegato</EmptyTitle>
                                <EmptyDescription>
                                    Aggiungi i documenti utili a questo
                                    elemento.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <ul className="flex min-w-0 flex-col divide-y">
                            {list.map((file) => {
                                const Icon = file.mime_type.startsWith('image/')
                                    ? FileImage
                                    : FileText;
                                return (
                                    <li
                                        key={file.id}
                                        className="flex min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center"
                                    >
                                        <Icon
                                            className="size-5 shrink-0 text-muted-foreground"
                                            aria-hidden
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p
                                                className="truncate text-sm font-medium"
                                                title={file.original_name}
                                            >
                                                {file.original_name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {fileSize(file.size_bytes)} ·{' '}
                                                {dateLabel(file.created_at)}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap gap-1">
                                            {file.can_preview && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    asChild
                                                >
                                                    <a
                                                        href={`${path}/${file.id}/view`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        aria-label={`Apri ${file.original_name} (nuova scheda)`}
                                                    >
                                                        <ExternalLink data-icon="inline-start" />
                                                        Apri
                                                    </a>
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                asChild
                                            >
                                                <a
                                                    href={`${path}/${file.id}/download`}
                                                    aria-label={`Scarica ${file.original_name}`}
                                                >
                                                    <Download data-icon="inline-start" />
                                                    Scarica
                                                </a>
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                disabled={busy}
                                                aria-label={`Elimina ${file.original_name}`}
                                                onClick={() =>
                                                    setSelected(file)
                                                }
                                            >
                                                <Trash2 data-icon="inline-start" />
                                                Elimina
                                            </Button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ))
                )}
            </CardContent>
            <CardFooter>
                {limits && (
                    <p className="text-xs text-muted-foreground">
                        {limits.extensions.join(', ').toUpperCase()} · massimo{' '}
                        {fileSize(limits.max_size_bytes)} per file e{' '}
                        {limits.max_files} file per selezione.
                    </p>
                )}
            </CardFooter>
            <AlertDialog
                open={selected !== null}
                onOpenChange={(open) => {
                    if (!open && !deleting) setSelected(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Eliminare l’allegato?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="break-words">
                            {selected?.original_name} verrà eliminato
                            definitivamente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>
                            Annulla
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleting}
                            onClick={(event) => {
                                event.preventDefault();
                                void remove();
                            }}
                        >
                            {deleting && <Spinner />}Elimina
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

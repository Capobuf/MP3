import type { JSONContent } from '@tiptap/react';
import { renderToReactElement } from '@tiptap/static-renderer/pm/react';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { UserAvatar } from '@/components/user-info';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDelayedBusy } from '@/hooks/use-delayed-busy';
import { Spinner } from '@/components/ui/spinner';
import type { Tenant } from '@/types';
import { commentExtensions } from './comment-content';
import { CommentEditor } from './comment-editor';
import { api } from './helpers';

type Comment = {
    id: number;
    parent_id: number | null;
    deleted: boolean;
    content: JSONContent | null;
    author: { id: number | null; name: string; avatar: string | null } | null;
    created_at: string;
    updated_at: string;
    can_update: boolean;
    can_delete: boolean;
};
type Thread = Comment & { replies: Comment[] };
type CommentPage = {
    data: Thread[];
    total: number;
    comments_count: number;
    current_page: number;
    last_page: number;
};
type Resource =
    | 'expenses'
    | 'contracts'
    | 'projects'
    | 'vendors'
    | 'cost-centers';
const dateTime = new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
});

function CommentMessage({
    comment,
    locked,
    editing,
    busy,
    onEdit,
    onDelete,
    onSave,
    onCancel,
    onReply,
}: {
    comment: Comment;
    locked: boolean;
    editing: boolean;
    busy: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onSave: (content: JSONContent) => Promise<void>;
    onCancel: () => void;
    onReply?: () => void;
}) {
    return (
        <div
            className="flex min-w-0 items-start gap-3"
            data-comment-id={comment.id}
        >
            {comment.deleted ? (
                <div
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    aria-hidden="true"
                >
                    <Trash2 className="size-4" />
                </div>
            ) : (
                <UserAvatar
                    user={comment.author ?? { name: 'Utente non disponibile' }}
                />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {comment.deleted ? (
                    <p className="py-1 text-sm text-muted-foreground">
                        Commento eliminato
                    </p>
                ) : (
                    <>
                        <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 pt-1">
                                <span className="text-sm font-medium break-words">
                                    {comment.author?.name}
                                </span>
                                <time
                                    className="text-xs text-muted-foreground"
                                    dateTime={comment.created_at}
                                >
                                    {dateTime.format(
                                        new Date(comment.created_at),
                                    )}
                                </time>
                                {comment.updated_at !== comment.created_at && (
                                    <span
                                        className="text-xs text-muted-foreground"
                                        title={`Modificato il ${dateTime.format(new Date(comment.updated_at))}`}
                                    >
                                        Modificato
                                    </span>
                                )}
                            </div>
                            {(comment.can_update || comment.can_delete) && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Azioni commento di ${comment.author?.name}`}
                                            disabled={locked}
                                        >
                                            <Ellipsis />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuGroup>
                                            {comment.can_update && (
                                                <DropdownMenuItem
                                                    onSelect={onEdit}
                                                >
                                                    <Pencil />
                                                    Modifica
                                                </DropdownMenuItem>
                                            )}
                                            {comment.can_delete && (
                                                <DropdownMenuItem
                                                    variant="destructive"
                                                    onSelect={onDelete}
                                                >
                                                    <Trash2 />
                                                    Elimina
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                        {editing && comment.content ? (
                            <CommentEditor
                                content={comment.content}
                                label="Modifica commento"
                                submitLabel="Salva"
                                busy={busy}
                                onSave={onSave}
                                onCancel={onCancel}
                            />
                        ) : (
                            comment.content && (
                                <div className="comment-rich-text">
                                    {renderToReactElement({
                                        extensions: commentExtensions,
                                        content: comment.content,
                                    })}
                                </div>
                            )
                        )}
                        {onReply && !editing && (
                            <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto self-start px-0 py-1"
                                disabled={locked}
                                onClick={onReply}
                            >
                                Rispondi
                            </Button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export function CommentsSection({
    tenant,
    resource,
    recordId,
    onBusyChange,
}: {
    tenant: Tenant;
    resource: Resource;
    recordId: number;
    onBusyChange?: (busy: boolean) => void;
}) {
    const path = `/t/${tenant.slug}/${resource}/${recordId}/comments`;
    const [query, setQuery] = useState({
        page: 1,
        direction: 'desc',
        revision: 0,
    });
    const [list, setList] = useState<CommentPage | null>(null);
    const [loading, setLoading] = useState(true);
    const visibleLoading = useDelayedBusy(loading);
    const [loadError, setLoadError] = useState('');
    const [saveError, setSaveError] = useState('');
    const [editing, setEditing] = useState<Comment | null>(null);
    const [replying, setReplying] = useState<number | null>(null);
    const [selected, setSelected] = useState<Comment | null>(null);
    const [busy, setBusy] = useState(false);
    const [editorVersion, setEditorVersion] = useState(0);
    const operation = useRef(false);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setLoadError('');
        api<CommentPage>(
            `${path}?page=${query.page}&direction=${query.direction}`,
        )
            .then((data) => {
                if (!active) return;
                if (data.current_page > data.last_page) {
                    setQuery((current) => ({
                        ...current,
                        page: data.last_page,
                    }));
                    return;
                }
                setList(data);
            })
            .catch((error: unknown) => {
                if (active)
                    setLoadError(
                        error instanceof Error
                            ? error.message
                            : 'Elenco commenti non disponibile.',
                    );
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [path, query]);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    function refresh(page = query.page) {
        setQuery((current) => ({
            ...current,
            page,
            revision: current.revision + 1,
        }));
    }
    async function save(
        content: JSONContent,
        comment?: Comment,
        parentId?: number,
    ) {
        if (operation.current) return;
        operation.current = true;
        setBusy(true);
        setSaveError('');
        try {
            await api(
                `${path}${comment ? `/${comment.id}` : ''}`,
                comment ? 'PATCH' : 'POST',
                {
                    content,
                    ...(!comment && parentId ? { parent_id: parentId } : {}),
                },
            );
            toast.success(
                comment ? 'Commento aggiornato.' : 'Commento inviato.',
            );
            setEditing(null);
            setReplying(null);
            if (!comment && !parentId)
                setEditorVersion((version) => version + 1);
            refresh(comment || parentId ? query.page : 1);
        } catch (error) {
            setSaveError(
                error instanceof Error
                    ? error.message
                    : 'Salvataggio del commento non riuscito.',
            );
        } finally {
            operation.current = false;
            setBusy(false);
        }
    }
    async function remove() {
        if (!selected || operation.current) return;
        operation.current = true;
        setBusy(true);
        setSaveError('');
        try {
            await api(`${path}/${selected.id}`, 'DELETE');
            setSelected(null);
            setEditing(null);
            setReplying(null);
            toast.success('Commento eliminato.');
            refresh();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Eliminazione del commento non riuscita.',
            );
        } finally {
            operation.current = false;
            setBusy(false);
        }
    }
    function cancel() {
        setEditing(null);
        setReplying(null);
        setSaveError('');
    }
    const lastPage = list?.last_page ?? 1;
    const pages = Array.from(
        new Set([1, query.page - 1, query.page, query.page + 1, lastPage]),
    )
        .filter((page) => page >= 1 && page <= lastPage)
        .sort((a, b) => a - b);
    const locked = busy || loading;
    const composing = !!editing || replying !== null;
    function go(page: number) {
        if (!locked) {
            cancel();
            refresh(page);
        }
    }
    function message(comment: Comment, root: boolean) {
        return (
            <CommentMessage
                comment={comment}
                locked={locked || composing}
                editing={editing?.id === comment.id}
                busy={busy}
                onEdit={() => {
                    setEditing(comment);
                    setReplying(null);
                    setSaveError('');
                }}
                onDelete={() => setSelected(comment)}
                onSave={(content) => save(content, comment)}
                onCancel={cancel}
                onReply={
                    root && !comment.deleted
                        ? () => {
                              setReplying(comment.id);
                              setEditing(null);
                              setSaveError('');
                          }
                        : undefined
                }
            />
        );
    }
    return (
        <Card id="comments">
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                        Commenti{' '}
                        <span role="status" className="flex w-4 items-center">
                            {visibleLoading && (
                                <>
                                    <Spinner aria-hidden="true" />
                                    <span className="sr-only">
                                        Caricamento commenti…
                                    </span>
                                </>
                            )}
                        </span>
                        {list && (
                            <Badge variant="secondary">
                                {list.comments_count}
                            </Badge>
                        )}
                    </CardTitle>
                    <Select
                        value={query.direction}
                        disabled={locked || composing}
                        onValueChange={(direction) =>
                            setQuery((current) => ({
                                ...current,
                                direction,
                                page: 1,
                            }))
                        }
                    >
                        <SelectTrigger
                            aria-label="Ordina commenti"
                            className="w-40"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="desc">
                                    Più recenti
                                </SelectItem>
                                <SelectItem value="asc">
                                    Meno recenti
                                </SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-5">
                <CommentEditor
                    key={editorVersion}
                    busy={busy || composing}
                    onSave={(content) => save(content)}
                />
                {saveError && (
                    <Alert variant="destructive" role="alert">
                        <AlertTitle>Commento non salvato</AlertTitle>
                        <AlertDescription>{saveError}</AlertDescription>
                    </Alert>
                )}
                <div
                    aria-busy={loading}
                    className="flex min-w-0 flex-col gap-5"
                >
                    {loading && !list ? (
                        <div
                            className="flex min-h-16 gap-3"
                            aria-label="Caricamento commenti"
                        >
                            {visibleLoading && (
                                <>
                                    <Skeleton className="size-8 shrink-0 rounded-full" />
                                    <div className="flex flex-1 flex-col gap-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-4 w-2/3" />
                                    </div>
                                </>
                            )}
                        </div>
                    ) : loadError ? (
                        <Alert variant="destructive">
                            <AlertTitle>Commenti non disponibili</AlertTitle>
                            <AlertDescription>
                                {loadError}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => refresh()}
                                >
                                    Riprova
                                </Button>
                            </AlertDescription>
                        </Alert>
                    ) : !list?.data.length ? (
                        <p className="text-sm text-muted-foreground">
                            Nessun commento. Inizia la conversazione.
                        </p>
                    ) : (
                        <ul
                            className="flex min-w-0 flex-col gap-6"
                            aria-label="Elenco commenti"
                        >
                            {list.data.map((thread) => (
                                <li
                                    key={thread.id}
                                    className="relative min-w-0 pl-5"
                                    data-thread-id={thread.id}
                                >
                                    {(thread.replies.length > 0 ||
                                        replying === thread.id) && (
                                        <div
                                            className="pointer-events-none absolute top-4 bottom-4 left-1 border-l border-border"
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span
                                        className="pointer-events-none absolute top-4 left-1 w-4 border-t border-border"
                                        aria-hidden="true"
                                    />
                                    <span
                                        className="pointer-events-none absolute top-4 left-1 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                                        aria-hidden="true"
                                    />
                                    {message(thread, true)}
                                    {(thread.replies.length > 0 ||
                                        replying === thread.id) && (
                                        <div className="ml-10 flex min-w-0 flex-col gap-4 pt-4 sm:ml-11">
                                            {thread.replies.map((reply) => (
                                                <div
                                                    key={reply.id}
                                                    className="relative min-w-0 before:absolute before:top-4 before:-left-14 before:w-14 before:border-t before:border-border last:after:absolute last:after:top-5 last:after:bottom-0 last:after:-left-14 last:after:w-px last:after:bg-card sm:before:-left-15 sm:before:w-15 sm:last:after:-left-15"
                                                >
                                                    <span
                                                        className="pointer-events-none absolute top-4 -left-14 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary sm:-left-15"
                                                        aria-hidden="true"
                                                    />
                                                    {message(reply, false)}
                                                </div>
                                            ))}
                                            {replying === thread.id && (
                                                <div className="relative min-w-0 before:absolute before:top-4 before:-left-14 before:w-14 before:border-t before:border-border last:after:absolute last:after:top-5 last:after:bottom-0 last:after:-left-14 last:after:w-px last:after:bg-card sm:before:-left-15 sm:before:w-15 sm:last:after:-left-15">
                                                    <span
                                                        className="pointer-events-none absolute top-4 -left-14 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary sm:-left-15"
                                                        aria-hidden="true"
                                                    />
                                                    <CommentEditor
                                                        key={`reply:${thread.id}`}
                                                        label={`Rispondi a ${thread.author?.name}`}
                                                        placeholder="Scrivi una risposta…"
                                                        busy={busy}
                                                        onSave={(content) =>
                                                            save(
                                                                content,
                                                                undefined,
                                                                thread.id,
                                                            )
                                                        }
                                                        onCancel={cancel}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                {!loadError && lastPage > 1 && (
                    <Pagination aria-label="Paginazione commenti">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious asChild>
                                    <button
                                        type="button"
                                        disabled={
                                            locked ||
                                            composing ||
                                            query.page <= 1
                                        }
                                        onClick={() => go(query.page - 1)}
                                    >
                                        Precedente
                                    </button>
                                </PaginationPrevious>
                            </PaginationItem>
                            {pages.map((page, index) => (
                                <PaginationItem
                                    key={page}
                                    className="flex items-center gap-1"
                                >
                                    {index > 0 &&
                                        page - pages[index - 1] > 1 && (
                                            <PaginationEllipsis />
                                        )}
                                    <PaginationLink
                                        asChild
                                        isActive={page === query.page}
                                    >
                                        <button
                                            type="button"
                                            disabled={locked || composing}
                                            aria-label={`Pagina ${page}`}
                                            onClick={() => go(page)}
                                        >
                                            {page}
                                        </button>
                                    </PaginationLink>
                                </PaginationItem>
                            ))}
                            <PaginationItem>
                                <PaginationNext asChild>
                                    <button
                                        type="button"
                                        disabled={
                                            locked ||
                                            composing ||
                                            query.page >= lastPage
                                        }
                                        onClick={() => go(query.page + 1)}
                                    >
                                        Successiva
                                    </button>
                                </PaginationNext>
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                )}
            </CardContent>
            <AlertDialog
                open={selected !== null}
                onOpenChange={(open) => {
                    if (!open && !busy) setSelected(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Eliminare il commento?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Il messaggio verrà rimosso. Le eventuali risposte
                            resteranno visibili. L’operazione non può essere
                            annullata dall’interfaccia.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            Annulla
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={busy}
                            onClick={(event) => {
                                event.preventDefault();
                                void remove();
                            }}
                        >
                            {busy && <Spinner />}Elimina
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

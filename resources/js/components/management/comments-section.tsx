import type { JSONContent } from '@tiptap/react';
import { renderToReactElement } from '@tiptap/static-renderer/pm/react';
import { Ellipsis, MessageSquare, Pencil, Trash2 } from 'lucide-react';
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
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import type { Tenant } from '@/types';
import { commentExtensions } from './comment-content';
import { CommentEditor } from './comment-editor';
import { api } from './helpers';

type Comment = {
    id: number;
    content: JSONContent;
    author: { id: number | null; name: string };
    created_at: string;
    updated_at: string;
    can_update: boolean;
    can_delete: boolean;
};
type CommentPage = {
    data: Comment[];
    total: number;
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
    const [loadError, setLoadError] = useState('');
    const [saveError, setSaveError] = useState('');
    const [editing, setEditing] = useState<Comment | null>(null);
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
    async function save(content: JSONContent, comment?: Comment) {
        if (operation.current) return;
        operation.current = true;
        setBusy(true);
        setSaveError('');
        try {
            await api(
                `${path}${comment ? `/${comment.id}` : ''}`,
                comment ? 'PATCH' : 'POST',
                { content },
            );
            toast.success(
                comment ? 'Commento aggiornato.' : 'Commento pubblicato.',
            );
            setEditing(null);
            if (!comment) setEditorVersion((version) => version + 1);
            refresh(comment ? query.page : 1);
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
            toast.success('Commento eliminato.');
            refresh(
                list?.data.length === 1
                    ? Math.max(1, query.page - 1)
                    : query.page,
            );
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
    const lastPage = list?.last_page ?? 1;
    const pages = Array.from(
        new Set([1, query.page - 1, query.page, query.page + 1, lastPage]),
    )
        .filter((page) => page >= 1 && page <= lastPage)
        .sort((a, b) => a - b);
    const locked = busy || loading;
    function go(page: number) {
        if (!locked) {
            setEditing(null);
            setSaveError('');
            refresh(page);
        }
    }
    return (
        <Card id="comments">
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare />
                        Commenti{' '}
                        {list && (
                            <Badge variant="secondary">{list.total}</Badge>
                        )}
                    </CardTitle>
                    <Select
                        value={query.direction}
                        disabled={locked || !!editing}
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
                <CardDescription>
                    Commenti del record, condivisi tra tutti gli anni.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-5">
                {!editing && (
                    <CommentEditor
                        key={editorVersion}
                        busy={busy}
                        onSave={(content) => save(content)}
                    />
                )}
                {saveError && (
                    <Alert variant="destructive" role="alert">
                        <AlertTitle>Commento non salvato</AlertTitle>
                        <AlertDescription>{saveError}</AlertDescription>
                    </Alert>
                )}
                <Separator />
                <div
                    aria-busy={loading}
                    className="flex min-w-0 flex-col gap-5"
                >
                    {loading ? (
                        <>
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </>
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
                        <Empty>
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <MessageSquare />
                                </EmptyMedia>
                                <EmptyTitle>Nessun commento</EmptyTitle>
                                <EmptyDescription>
                                    Aggiungi il primo commento a questo record.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <ul
                            className="flex min-w-0 flex-col gap-5"
                            aria-label="Elenco commenti"
                        >
                            {list.data.map((comment) => (
                                <li
                                    key={comment.id}
                                    className="flex min-w-0 flex-col gap-3 rounded-lg border p-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 flex-col gap-1">
                                            <p className="text-sm font-medium break-words">
                                                {comment.author.name}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                <time
                                                    dateTime={
                                                        comment.created_at
                                                    }
                                                >
                                                    {dateTime.format(
                                                        new Date(
                                                            comment.created_at,
                                                        ),
                                                    )}
                                                </time>
                                                {comment.updated_at !==
                                                    comment.created_at && (
                                                    <Badge
                                                        variant="outline"
                                                        title={`Modificato il ${dateTime.format(new Date(comment.updated_at))}`}
                                                    >
                                                        Modificato
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        {(comment.can_update ||
                                            comment.can_delete) && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label={`Azioni commento di ${comment.author.name}`}
                                                        disabled={
                                                            locked || !!editing
                                                        }
                                                    >
                                                        <Ellipsis />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuGroup>
                                                        {comment.can_update && (
                                                            <DropdownMenuItem
                                                                onSelect={() => {
                                                                    setEditing(
                                                                        comment,
                                                                    );
                                                                    setSaveError(
                                                                        '',
                                                                    );
                                                                }}
                                                            >
                                                                <Pencil />
                                                                Modifica
                                                            </DropdownMenuItem>
                                                        )}
                                                        {comment.can_delete && (
                                                            <DropdownMenuItem
                                                                variant="destructive"
                                                                onSelect={() =>
                                                                    setSelected(
                                                                        comment,
                                                                    )
                                                                }
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
                                    {editing?.id === comment.id ? (
                                        <CommentEditor
                                            key={comment.id}
                                            content={comment.content}
                                            label="Modifica commento"
                                            submitLabel="Salva"
                                            busy={busy}
                                            onSave={(content) =>
                                                save(content, comment)
                                            }
                                            onCancel={() => {
                                                setEditing(null);
                                                setSaveError('');
                                            }}
                                        />
                                    ) : (
                                        <div className="comment-rich-text">
                                            {renderToReactElement({
                                                extensions: commentExtensions,
                                                content: comment.content,
                                            })}
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
                                            !!editing ||
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
                                            disabled={locked || !!editing}
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
                                            !!editing ||
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
                            Il commento verrà rimosso. Questa operazione non può
                            essere annullata dall’interfaccia.
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

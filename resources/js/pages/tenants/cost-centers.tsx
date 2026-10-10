import { Head, router } from '@inertiajs/react';
import { CornerDownRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CostCenterSheet } from '@/components/management/cost-center-sheet';
import { api } from '@/components/management/helpers';
import { Pagination } from '@/components/management/pagination';
import type {
    CostCenter,
    Option,
    Pagination as Page,
} from '@/components/management/types';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
} from '@/components/ui/empty';
import type { Tenant } from '@/types';

export default function CostCenters({
    tenant,
    records,
    parents,
    filters,
}: {
    tenant: Tenant;
    records: Page<CostCenter>;
    parents: Option[];
    filters: { search?: string };
}) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [sheet, setSheet] = useState<{
        record?: CostCenter;
        parentId?: number;
    } | null>(null);
    const [deleting, setDeleting] = useState<CostCenter | null>(null);
    const [deleteChildren, setDeleteChildren] = useState(false);
    const [confirmCascade, setConfirmCascade] = useState(false);
    const [busy, setBusy] = useState(false);
    const path = `/t/${tenant.slug}/cost-centers`;
    const hasChildren = !!deleting?.children?.length;
    async function remove() {
        if (!deleting || busy) return;
        if (deleteChildren && hasChildren && !confirmCascade) {
            setConfirmCascade(true);
            return;
        }
        setBusy(true);
        try {
            await api(`${path}/${deleting.id}`, 'DELETE', {
                delete_children: deleteChildren,
            });
            setDeleting(null);
            toast.success('Centro di Costo eliminato.');
            router.reload();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Eliminazione non riuscita.',
            );
        } finally {
            setBusy(false);
        }
    }
    function row(center: CostCenter, child = false) {
        return (
            <TableRow key={center.id}>
                <TableCell className="min-w-48 whitespace-normal">
                    <div className="flex items-center gap-2">
                        {child && (
                            <CornerDownRight
                                aria-hidden="true"
                                className="size-4 shrink-0 text-muted-foreground"
                            />
                        )}
                        <span className="font-medium break-words">
                            {center.name}
                        </span>
                    </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                    {center.expenses_count ?? 0} spese ·{' '}
                    {center.projects_count ?? 0} progetti ·{' '}
                    {center.contracts_count ?? 0} contratti
                </TableCell>
                <TableCell>
                    <div className="flex justify-end gap-1">
                        {!child && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Aggiungi un figlio a ${center.name}`}
                                onClick={() =>
                                    setSheet({ parentId: center.id })
                                }
                            >
                                <Plus />
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Modifica ${center.name}`}
                            onClick={() => setSheet({ record: center })}
                        >
                            <Pencil />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Elimina ${center.name}`}
                            onClick={() => {
                                setDeleting(center);
                                setDeleteChildren(false);
                                setConfirmCascade(false);
                            }}
                        >
                            <Trash2 />
                        </Button>
                    </div>
                </TableCell>
            </TableRow>
        );
    }
    return (
        <>
            <Head title={`Centri di Costo · ${tenant.name}`} />
            <div className="page-shell">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">
                            {tenant.name}
                        </p>
                        <h1 className="page-title">Centri di Costo</h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Tag per categorizzare spese, progetti e contratti.
                            Sono consentiti due livelli: padre e figlio.
                        </p>
                    </div>
                    <Button onClick={() => setSheet({})}>
                        <Plus data-icon="inline-start" />
                        Nuovo Centro di Costo
                    </Button>
                </header>
                <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        router.get(
                            path,
                            { search },
                            { preserveState: true, preserveScroll: true },
                        );
                    }}
                >
                    <Input
                        aria-label="Cerca Centri di Costo"
                        placeholder="Cerca per nome…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <Button type="submit" variant="outline">
                        Cerca
                    </Button>
                </form>
                <Card>
                    <CardContent>
                        {records.data.length ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Associazioni</TableHead>
                                        <TableHead className="text-right">
                                            Azioni
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {records.data.flatMap((center) => [
                                        row(center),
                                        ...(center.children ?? []).map(
                                            (child) => row(child, true),
                                        ),
                                    ])}
                                </TableBody>
                            </Table>
                        ) : (
                            <Empty>
                                <EmptyHeader>
                                    <EmptyTitle>
                                        Nessun Centro di Costo
                                    </EmptyTitle>
                                    <EmptyDescription>
                                        {filters.search
                                            ? 'Nessun centro corrisponde alla ricerca.'
                                            : 'Crea il primo Centro di Costo per categorizzare i tuoi elementi.'}
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        )}
                    </CardContent>
                </Card>
                <Pagination page={records} />
            </div>
            {sheet && (
                <CostCenterSheet
                    tenant={tenant}
                    parents={parents}
                    {...sheet}
                    onClose={() => setSheet(null)}
                    onSaved={() => {
                        setSheet(null);
                        router.reload();
                    }}
                />
            )}
            <AlertDialog
                open={deleting !== null}
                onOpenChange={(open) => {
                    if (!open && !busy) setDeleting(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmCascade
                                ? 'Conferma eliminazione di padre e figli'
                                : `Eliminare ${deleting?.name}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmCascade
                                ? 'Attenzione: verranno eliminati il padre e tutti i suoi figli, insieme alle loro associazioni. Questa operazione è definitiva.'
                                : 'Le associazioni di questo centro saranno rimosse. Spese, progetti e contratti resteranno disponibili.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {hasChildren && !confirmCascade && (
                        <Field orientation="horizontal">
                            <Checkbox
                                id="delete-center-children"
                                checked={deleteChildren}
                                onCheckedChange={(checked) =>
                                    setDeleteChildren(checked === true)
                                }
                                disabled={busy}
                            />
                            <div className="flex flex-col gap-1">
                                <FieldLabel htmlFor="delete-center-children">
                                    Elimina anche i figli e le loro associazioni
                                </FieldLabel>
                                <FieldDescription>
                                    Se non selezioni questa opzione, i figli
                                    saranno conservati come centri indipendenti
                                    con tutte le loro associazioni.
                                </FieldDescription>
                            </div>
                        </Field>
                    )}
                    {confirmCascade && (
                        <p role="alert" className="text-sm text-destructive">
                            Saranno rimossi tutti i tag del padre e dei figli.
                            Spese, progetti e contratti non verranno eliminati.
                        </p>
                    )}
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
                            {busy
                                ? 'Eliminazione…'
                                : deleteChildren &&
                                    hasChildren &&
                                    !confirmCascade
                                  ? 'Continua'
                                  : 'Elimina'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

CostCenters.layout = {
    breadcrumbs: [{ title: 'Centri di Costo', href: '/dashboard' }],
};

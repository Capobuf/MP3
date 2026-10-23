import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import { TenantSettingsNav } from '@/components/management/tenant-settings-nav';
import { ProjectStatusSelect } from '@/components/management/project-status-select';
import { InlineEdit } from '@/components/management/inline-edit';
import { api } from '@/components/management/helpers';
import type { ProjectStatus } from '@/components/management/types';
import type { Tenant } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';
import {
    Table,
    TableHeader,
    TableHead,
    TableRow,
    TableBody,
    TableCell,
} from '@/components/ui/table';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export default function ProjectStatuses({
    tenant,
    statuses,
}: {
    tenant: Tenant;
    statuses: ProjectStatus[];
}) {
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState<ProjectStatus | null>(null);
    const [replacement, setReplacement] = useState<string>();
    const path = `/t/${tenant.slug}/settings/project-statuses`;
    const reload = () =>
        new Promise<void>((resolve) =>
            router.reload({ onFinish: () => resolve() }),
        );
    const create = async () => {
        setBusy(true);
        setError('');
        try {
            await api(path, 'POST', { name });
            setName('');
            await reload();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : 'Creazione non riuscita.',
            );
        } finally {
            setBusy(false);
        }
    };
    const remove = async () => {
        if (!deleting || replacement === undefined) return;
        setBusy(true);
        setError('');
        try {
            await api(`${path}/${deleting.id}`, 'DELETE', {
                replacement: replacement || null,
            });
            setDeleting(null);
            await reload();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : 'Eliminazione non riuscita.',
            );
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            <Head title={`Stati dei progetti · ${tenant.name}`} />
            <div className="page-shell">
                <header>
                    <p className="text-sm text-muted-foreground">
                        {tenant.name}
                    </p>
                    <h1 className="page-title">Impostazioni</h1>
                </header>
                <TenantSettingsNav slug={tenant.slug} />
                <Card>
                    <CardHeader>
                        <CardTitle>Stati dei progetti</CardTitle>
                        <CardDescription>
                            Crea e rinomina gli stati disponibili per i progetti
                            di questa azienda.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void create();
                            }}
                            className="flex flex-wrap items-end gap-3"
                        >
                            <FieldGroup className="min-w-48 flex-1">
                                <Field>
                                    <FieldLabel htmlFor="status-name">
                                        Nuovo stato
                                    </FieldLabel>
                                    <Input
                                        id="status-name"
                                        value={name}
                                        onChange={(event) =>
                                            setName(event.target.value)
                                        }
                                        disabled={busy}
                                        required
                                        maxLength={255}
                                    />
                                </Field>
                            </FieldGroup>
                            <Button
                                type="submit"
                                disabled={busy || !name.trim()}
                            >
                                Aggiungi stato
                            </Button>
                        </form>
                        {error && !deleting && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead className="text-right">
                                        Progetti
                                    </TableHead>
                                    <TableHead>
                                        <span className="sr-only">Azioni</span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {statuses.length ? (
                                    statuses.map((status) => (
                                        <TableRow key={status.id}>
                                            <TableCell>
                                                <InlineEdit
                                                    value={status.name}
                                                    label={`Nome dello stato ${status.name}`}
                                                    disabled={busy}
                                                    onSave={async (value) => {
                                                        await api(
                                                            `${path}/${status.id}`,
                                                            'PATCH',
                                                            { name: value },
                                                        );
                                                        await reload();
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {status.projects_count ?? 0}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    disabled={busy}
                                                    aria-label={`Elimina stato ${status.name}`}
                                                    onClick={() => {
                                                        setDeleting(status);
                                                        setReplacement(
                                                            undefined,
                                                        );
                                                        setError('');
                                                    }}
                                                >
                                                    Elimina
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3}>
                                            Nessuno stato configurato.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <AlertDialog
                    open={deleting !== null}
                    onOpenChange={(open) => {
                        if (!open && !busy) {
                            setDeleting(null);
                            setError('');
                        }
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Elimina “{deleting?.name}”
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {deleting?.projects_count === 1
                                    ? '1 progetto utilizza questo stato.'
                                    : `${deleting?.projects_count ?? 0} progetti utilizzano questo stato.`}{' '}
                                Scegli lo stato da assegnare, oppure nessuno
                                stato.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <FieldGroup>
                            <Field>
                                <FieldLabel htmlFor="replacement-status">
                                    Stato di destinazione
                                </FieldLabel>
                                <ProjectStatusSelect
                                    id="replacement-status"
                                    statuses={statuses.filter(
                                        (status) => status.id !== deleting?.id,
                                    )}
                                    value={replacement}
                                    onChange={setReplacement}
                                    disabled={busy}
                                />
                            </Field>
                        </FieldGroup>
                        {error && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={busy}>
                                Annulla
                            </AlertDialogCancel>
                            <Button
                                variant="destructive"
                                disabled={busy || replacement === undefined}
                                onClick={() => void remove()}
                            >
                                Elimina e aggiorna progetti
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </>
    );
}
ProjectStatuses.layout = {
    breadcrumbs: [{ title: 'Impostazioni', href: '/dashboard' }],
};

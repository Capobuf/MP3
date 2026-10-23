import { Head, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, MoreHorizontal, Users } from 'lucide-react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Field,
    FieldGroup,
    FieldLabel,
    FieldSet,
    FieldLegend,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import PlatformSettingsLayout from '@/layouts/platform/settings-layout';
import type { Tenant, User } from '@/types';

type PlatformUser = User & { tenants: Tenant[] };

function TenantChoices({
    tenants,
    selected,
    onChange,
    disabled,
    single = false,
}: {
    tenants: Tenant[];
    selected: number[];
    onChange: (ids: number[]) => void;
    disabled: boolean;
    single?: boolean;
}) {
    return (
        <FieldSet disabled={disabled}>
            <FieldLegend>
                Ambienti {single ? '(massimo uno)' : '(facoltativi)'}
            </FieldLegend>
            <FieldGroup className="max-h-60 overflow-y-auto">
                {tenants.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        Nessun ambiente disponibile.
                    </p>
                )}
                {tenants.map((tenant) => (
                    <Field key={tenant.id} orientation="horizontal">
                        <Checkbox
                            id={`tenant-${tenant.id}`}
                            checked={selected.includes(tenant.id)}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                                onChange(
                                    checked
                                        ? single
                                            ? [tenant.id]
                                            : [...selected, tenant.id]
                                        : selected.filter(
                                              (id) => id !== tenant.id,
                                          ),
                                )
                            }
                        />
                        <FieldLabel htmlFor={`tenant-${tenant.id}`}>
                            {tenant.name}
                        </FieldLabel>
                    </Field>
                ))}
            </FieldGroup>
        </FieldSet>
    );
}

export default function PlatformUsers({
    users,
    tenants,
}: {
    users: PlatformUser[];
    tenants: Tenant[];
}) {
    const { auth } = usePage().props;
    const [inviting, setInviting] = useState(false);
    const invite = useForm({ name: '', email: '', tenant_ids: [] as number[] });
    const [editing, setEditing] = useState<PlatformUser | null>(null);
    const membership = useForm({ tenant_ids: [] as number[] });
    const [action, setAction] = useState<{
        user: PlatformUser;
        kind: 'block' | 'activate' | 'delete' | 'promote';
    } | null>(null);
    const change = useForm({ is_active: true, confirmed: true });
    const actionLabel =
        action?.kind === 'promote'
            ? 'Abilita accesso Piattaforma'
            : action?.kind === 'delete'
              ? 'Elimina account'
              : action?.kind === 'block'
                ? 'Blocca utente'
                : 'Riattiva utente';

    return (
        <>
            <Head title="Utenti · Impostazioni Piattaforma" />
            <PlatformSettingsLayout>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Users className="size-5" />
                        <h2 className="text-xl font-semibold">Utenti</h2>
                        <Badge variant="secondary">{users.length}</Badge>
                    </div>
                    <Dialog
                        open={inviting}
                        onOpenChange={(open) => {
                            if (!invite.processing) setInviting(open);
                        }}
                    >
                        <DialogTrigger asChild>
                            <Button>Invita utente</Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Invita utente</DialogTitle>
                                <DialogDescription className="break-words">
                                    Invita un amministratore della piattaforma.
                                    Potrà accedere alle impostazioni di Obake e
                                    agli ambienti selezionati.
                                </DialogDescription>
                            </DialogHeader>
                            <form
                                className="flex flex-col gap-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    invite.post('/platform/users', {
                                        onSuccess: () => {
                                            setInviting(false);
                                            invite.reset();
                                        },
                                    });
                                }}
                            >
                                <FieldGroup>
                                    <Field
                                        data-invalid={Boolean(
                                            invite.errors.name,
                                        )}
                                    >
                                        <FieldLabel htmlFor="user-name">
                                            Nome (facoltativo)
                                        </FieldLabel>
                                        <Input
                                            id="user-name"
                                            value={invite.data.name}
                                            onChange={(event) =>
                                                invite.setData(
                                                    'name',
                                                    event.target.value,
                                                )
                                            }
                                            maxLength={255}
                                            disabled={invite.processing}
                                            aria-invalid={Boolean(
                                                invite.errors.name,
                                            )}
                                        />
                                        <InputError
                                            message={invite.errors.name}
                                        />
                                    </Field>
                                    <Field
                                        data-invalid={Boolean(
                                            invite.errors.email,
                                        )}
                                    >
                                        <FieldLabel htmlFor="user-email">
                                            Email
                                        </FieldLabel>
                                        <Input
                                            id="user-email"
                                            type="email"
                                            required
                                            value={invite.data.email}
                                            onChange={(event) =>
                                                invite.setData(
                                                    'email',
                                                    event.target.value,
                                                )
                                            }
                                            maxLength={255}
                                            disabled={invite.processing}
                                            aria-invalid={Boolean(
                                                invite.errors.email,
                                            )}
                                        />
                                        <InputError
                                            message={invite.errors.email}
                                        />
                                    </Field>
                                    <TenantChoices
                                        tenants={tenants}
                                        selected={invite.data.tenant_ids}
                                        onChange={(ids) =>
                                            invite.setData('tenant_ids', ids)
                                        }
                                        disabled={invite.processing}
                                    />
                                    {Object.entries(invite.errors)
                                        .filter(([key]) =>
                                            key.startsWith('tenant_ids'),
                                        )
                                        .map(([key, message]) => (
                                            <InputError
                                                key={key}
                                                message={message}
                                            />
                                        ))}
                                </FieldGroup>
                                <p className="text-sm text-muted-foreground">
                                    L'invito invia un link per impostare la
                                    password. Gli amministratori della
                                    piattaforma possono modificare le
                                    assegnazioni degli ambienti.
                                </p>
                                <DialogFooter>
                                    <Button disabled={invite.processing}>
                                        {invite.processing && <Spinner />}Invita
                                        utente
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
                <Card>
                    <CardContent className="divide-y p-0">
                        {users.map((user) => (
                            <div
                                key={user.id}
                                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="flex min-w-0 flex-col gap-2">
                                    <p className="font-medium break-words">
                                        {user.name}
                                    </p>
                                    <p className="text-sm break-words text-muted-foreground">
                                        {user.email}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge variant="outline">
                                            {user.is_super_admin
                                                ? 'Super admin'
                                                : user.is_platform_admin
                                                  ? 'Piattaforma'
                                                  : 'Aziendale'}
                                        </Badge>
                                        <Badge
                                            variant={
                                                user.is_active
                                                    ? 'secondary'
                                                    : 'destructive'
                                            }
                                        >
                                            {user.is_active
                                                ? 'Abilitato'
                                                : 'Bloccato'}
                                        </Badge>
                                        <Badge variant="outline">
                                            {user.email_verified_at
                                                ? 'Email verificata'
                                                : 'Email da verificare'}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {user.is_super_admin
                                            ? 'Tutti gli ambienti'
                                            : user.tenants.length
                                              ? user.tenants
                                                    .map(
                                                        (tenant) => tenant.name,
                                                    )
                                                    .join(', ')
                                              : user.is_platform_admin
                                                ? 'Solo accesso Piattaforma'
                                                : 'Nessun ambiente assegnato'}
                                    </p>
                                    {!user.is_super_admin &&
                                        !user.is_platform_admin &&
                                        user.tenants.length > 1 && (
                                            <Alert>
                                                <AlertTriangle aria-hidden="true" />
                                                <AlertDescription>
                                                    Assegnazione da correggere:
                                                    accesso agli ambienti
                                                    sospeso. Mantieni al massimo
                                                    un ambiente oppure conferma
                                                    l’abilitazione a
                                                    Piattaforma.
                                                </AlertDescription>
                                            </Alert>
                                        )}
                                </div>
                                {!user.is_super_admin && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                aria-label={`Azioni per ${user.email}`}
                                            >
                                                <MoreHorizontal />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuGroup>
                                                <DropdownMenuItem
                                                    onSelect={() => {
                                                        membership.clearErrors();
                                                        membership.setData(
                                                            'tenant_ids',
                                                            user.tenants.map(
                                                                (tenant) =>
                                                                    tenant.id,
                                                            ),
                                                        );
                                                        setEditing(user);
                                                    }}
                                                >
                                                    Gestisci ambienti
                                                </DropdownMenuItem>
                                                {user.id !== auth.user.id && (
                                                    <>
                                                        {!user.is_platform_admin && (
                                                            <DropdownMenuItem
                                                                onSelect={() => {
                                                                    change.clearErrors();
                                                                    setAction({
                                                                        user,
                                                                        kind: 'promote',
                                                                    });
                                                                }}
                                                            >
                                                                Abilita accesso
                                                                Piattaforma
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem
                                                            onSelect={() => {
                                                                change.clearErrors();
                                                                change.setData(
                                                                    'is_active',
                                                                    !user.is_active,
                                                                );
                                                                setAction({
                                                                    user,
                                                                    kind: user.is_active
                                                                        ? 'block'
                                                                        : 'activate',
                                                                });
                                                            }}
                                                        >
                                                            {user.is_active
                                                                ? 'Blocca'
                                                                : 'Riattiva'}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            variant="destructive"
                                                            onSelect={() => {
                                                                change.clearErrors();
                                                                setAction({
                                                                    user,
                                                                    kind: 'delete',
                                                                });
                                                            }}
                                                        >
                                                            Elimina
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuGroup>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>
                <Dialog
                    open={editing !== null}
                    onOpenChange={(open) => {
                        if (!open && !membership.processing) setEditing(null);
                    }}
                >
                    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Gestisci ambienti</DialogTitle>
                            <DialogDescription className="break-words">
                                {editing?.email}.{' '}
                                {editing?.is_platform_admin
                                    ? 'Scegli gli ambienti assegnati. L’accesso Piattaforma rimane abilitato.'
                                    : 'Scegli al massimo un ambiente. Se ne scegli un altro, sostituirà quello attuale.'}
                            </DialogDescription>
                        </DialogHeader>
                        <form
                            className="flex flex-col gap-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (editing)
                                    membership.put(
                                        `/platform/users/${editing.id}/tenants`,
                                        { onSuccess: () => setEditing(null) },
                                    );
                            }}
                        >
                            <TenantChoices
                                tenants={tenants}
                                selected={membership.data.tenant_ids}
                                onChange={(ids) =>
                                    membership.setData('tenant_ids', ids)
                                }
                                disabled={membership.processing}
                                single={!editing?.is_platform_admin}
                            />
                            {Object.entries(membership.errors).map(
                                ([key, message]) => (
                                    <InputError key={key} message={message} />
                                ),
                            )}
                            <DialogFooter>
                                <Button disabled={membership.processing}>
                                    {membership.processing && <Spinner />}Salva
                                    ambienti
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
                <AlertDialog
                    open={action !== null}
                    onOpenChange={(open) => {
                        if (!open && !change.processing) setAction(null);
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{actionLabel}</AlertDialogTitle>
                            <AlertDialogDescription className="break-words">
                                {action?.user.email}.{' '}
                                {action?.kind === 'promote'
                                    ? 'Confermi l’accesso alle impostazioni globali di Obake, inclusa la gestione di utenti e assegnazioni degli ambienti? Gli ambienti attuali e lo stato di blocco saranno conservati.'
                                    : action?.kind === 'delete'
                                      ? 'L’eliminazione è definitiva e consentita solo se non ci sono dati storici collegati. Le credenziali e le assegnazioni saranno rimosse.'
                                      : action?.kind === 'block'
                                        ? 'L’utente perderà l’accesso alla piattaforma e a tutti gli ambienti, anche dalle sessioni aperte. Dati e assegnazioni saranno conservati.'
                                        : 'L’utente potrà accedere nuovamente secondo il profilo e le assegnazioni attuali.'}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        {Object.entries(change.errors).map(([key, message]) => (
                            <InputError key={key} message={message} />
                        ))}
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={change.processing}>
                                Annulla
                            </AlertDialogCancel>
                            <Button
                                variant={
                                    action?.kind === 'delete' ||
                                    action?.kind === 'block'
                                        ? 'destructive'
                                        : 'default'
                                }
                                disabled={change.processing}
                                onClick={() => {
                                    if (!action) return;
                                    const path = `/platform/users/${action.user.id}`;
                                    const options = {
                                        onSuccess: () => setAction(null),
                                    };
                                    if (action.kind === 'delete')
                                        change.delete(path, options);
                                    else if (action.kind === 'promote')
                                        change.post(`${path}/promote`, options);
                                    else
                                        change.patch(`${path}/status`, options);
                                }}
                            >
                                {change.processing && <Spinner />}
                                {actionLabel}
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </PlatformSettingsLayout>
        </>
    );
}

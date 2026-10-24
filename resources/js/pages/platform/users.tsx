import { Head, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, MoreHorizontal, Users } from 'lucide-react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import { UserAccountStatus, UserAvatar } from '@/components/user-info';
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

type PlatformUser = User & {
    tenants: Tenant[];
    two_factor_enabled: boolean;
    can_disable_mfa: boolean;
};

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
            <FieldLegend>Aziende{single ? ' (massimo una)' : ''}</FieldLegend>
            <FieldGroup className="max-h-60 overflow-y-auto">
                {tenants.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        Nessuna azienda disponibile.
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
        kind: 'block' | 'activate' | 'delete' | 'promote' | 'disable-mfa';
    } | null>(null);
    const change = useForm({ is_active: true, confirmed: true, password: '' });
    const actionLabel =
        action?.kind === 'disable-mfa'
            ? 'Disattiva MFA'
            : action?.kind === 'promote'
              ? 'Abilita accesso ad Amministrazione'
              : action?.kind === 'delete'
                ? 'Elimina account'
                : action?.kind === 'block'
                  ? 'Blocca utente'
                  : 'Riattiva utente';

    return (
        <>
            <Head title="Utenti · Amministrazione" />
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
                                    Invita un amministratore di Obake. Potrà
                                    accedere alle impostazioni di Obake e alle
                                    aziende selezionate.
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
                                            Nome
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
                                            Email{' '}
                                            <span aria-hidden="true">*</span>
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
                                    password. Gli amministratori di Obake
                                    possono modificare le assegnazioni delle
                                    aziende.
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
                <Card className="overflow-hidden py-0">
                    <CardContent className="p-0">
                        <div
                            aria-hidden="true"
                            className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_11rem_2rem] gap-6 border-b bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid"
                        >
                            <span>Utente</span>
                            <span>Accessi</span>
                            <span>Stato account</span>
                            <span />
                        </div>
                        <ul className="divide-y" aria-label="Utenti">
                            {users.map((user) => (
                                <li
                                    key={user.id}
                                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 p-4 sm:px-5 sm:py-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_11rem_2rem] lg:items-center lg:gap-6"
                                >
                                    <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
                                        <UserAvatar
                                            user={user}
                                            className="size-11 border text-sm font-medium"
                                        />
                                        <div className="flex min-w-0 flex-col gap-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium [overflow-wrap:anywhere]">
                                                    {user.name}
                                                </p>
                                                {user.id === auth.user.id && (
                                                    <Badge variant="outline">
                                                        Tu
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm [overflow-wrap:anywhere] text-muted-foreground">
                                                {user.email}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="col-start-1 flex min-w-0 flex-col items-start gap-2 lg:col-start-2 lg:row-start-1">
                                        <p className="text-xs font-medium text-muted-foreground lg:sr-only">
                                            Accessi
                                        </p>
                                        <Badge variant="outline">
                                            {user.is_super_admin
                                                ? 'Super admin'
                                                : user.is_platform_admin
                                                  ? 'Amministrazione'
                                                  : 'Aziendale'}
                                        </Badge>
                                        <p className="text-sm [overflow-wrap:anywhere] text-muted-foreground">
                                            {user.is_super_admin
                                                ? 'Tutte le aziende'
                                                : user.tenants.length
                                                  ? user.tenants
                                                        .map(
                                                            (tenant) =>
                                                                tenant.name,
                                                        )
                                                        .join(', ')
                                                  : user.is_platform_admin
                                                    ? 'Solo accesso ad Amministrazione'
                                                    : 'Nessuna azienda assegnata'}
                                        </p>
                                    </div>
                                    <div className="col-start-1 flex flex-col items-start gap-2 lg:col-start-3 lg:row-start-1">
                                        <p className="text-xs font-medium text-muted-foreground lg:sr-only">
                                            Stato account
                                        </p>
                                        <UserAccountStatus user={user} />
                                        <Badge variant="outline">
                                            TOTP:{' '}
                                            {user.two_factor_enabled
                                                ? 'attivo'
                                                : 'non attivo'}
                                        </Badge>
                                    </div>
                                    <div className="col-start-2 row-start-1 justify-self-end lg:col-start-4">
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
                                                                        (
                                                                            tenant,
                                                                        ) =>
                                                                            tenant.id,
                                                                    ),
                                                                );
                                                                setEditing(
                                                                    user,
                                                                );
                                                            }}
                                                        >
                                                            Gestisci aziende
                                                        </DropdownMenuItem>
                                                        {user.id !==
                                                            auth.user.id && (
                                                            <>
                                                                {user.can_disable_mfa && (
                                                                    <DropdownMenuItem
                                                                        variant="destructive"
                                                                        onSelect={() => {
                                                                            change.clearErrors();
                                                                            change.reset(
                                                                                'password',
                                                                            );
                                                                            setAction(
                                                                                {
                                                                                    user,
                                                                                    kind: 'disable-mfa',
                                                                                },
                                                                            );
                                                                        }}
                                                                    >
                                                                        Disattiva
                                                                        MFA
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {!user.is_platform_admin && (
                                                                    <DropdownMenuItem
                                                                        onSelect={() => {
                                                                            change.clearErrors();
                                                                            setAction(
                                                                                {
                                                                                    user,
                                                                                    kind: 'promote',
                                                                                },
                                                                            );
                                                                        }}
                                                                    >
                                                                        Abilita
                                                                        accesso
                                                                        ad
                                                                        Amministrazione
                                                                    </DropdownMenuItem>
                                                                )}
                                                                <DropdownMenuItem
                                                                    onSelect={() => {
                                                                        change.clearErrors();
                                                                        change.setData(
                                                                            'is_active',
                                                                            !user.is_active,
                                                                        );
                                                                        setAction(
                                                                            {
                                                                                user,
                                                                                kind: user.is_active
                                                                                    ? 'block'
                                                                                    : 'activate',
                                                                            },
                                                                        );
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
                                                                        setAction(
                                                                            {
                                                                                user,
                                                                                kind: 'delete',
                                                                            },
                                                                        );
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

                                    {!user.is_super_admin &&
                                        !user.is_platform_admin &&
                                        user.tenants.length > 1 && (
                                            <Alert className="col-span-full">
                                                <AlertTriangle aria-hidden="true" />
                                                <AlertDescription>
                                                    Assegnazione da correggere:
                                                    accesso alle aziende
                                                    sospeso. Mantieni al massimo
                                                    un’azienda oppure conferma
                                                    l’abilitazione ad
                                                    Amministrazione.
                                                </AlertDescription>
                                            </Alert>
                                        )}
                                </li>
                            ))}
                        </ul>
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
                            <DialogTitle>Gestisci aziende</DialogTitle>
                            <DialogDescription className="break-words">
                                {editing?.email}.{' '}
                                {editing?.is_platform_admin
                                    ? 'Scegli le aziende assegnate. L’accesso ad Amministrazione rimane abilitato.'
                                    : 'Scegli al massimo un’azienda. Se ne scegli un’altra, sostituirà quella attuale.'}
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
                                    aziende
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
                <AlertDialog
                    open={action !== null}
                    onOpenChange={(open) => {
                        if (!open && !change.processing) {
                            setAction(null);
                            change.reset('password');
                        }
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{actionLabel}</AlertDialogTitle>
                            <AlertDialogDescription className="break-words">
                                {action?.user.name} ({action?.user.email}).{' '}
                                {action?.kind === 'disable-mfa'
                                    ? 'L’utente perderà la protezione 2FA fino a una nuova configurazione. Saranno revocate le sessioni aperte e l’accesso con Ricordami. Lo stato dell’account non cambierà. Conferma con la tua password corrente.'
                                    : action?.kind === 'promote'
                                      ? 'Confermi l’accesso alle impostazioni globali di Obake, inclusa la gestione di utenti e assegnazioni delle aziende? Le aziende attuali e lo stato di blocco saranno conservati.'
                                      : action?.kind === 'delete'
                                        ? 'L’account, le credenziali, le assegnazioni e la cronologia di annullamento dell’utente saranno eliminati definitivamente. I dati aziendali e il nome sui contenuti storici saranno conservati.'
                                        : action?.kind === 'block'
                                          ? 'L’utente perderà l’accesso ad Amministrazione e a tutte le aziende, anche dalle sessioni aperte. Dati e assegnazioni saranno conservati.'
                                          : 'L’utente potrà accedere nuovamente secondo il profilo e le assegnazioni attuali.'}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        {action?.kind === 'disable-mfa' && (
                            <Field
                                data-invalid={Boolean(change.errors.password)}
                            >
                                <FieldLabel htmlFor="mfa-admin-password">
                                    La tua password corrente
                                </FieldLabel>
                                <PasswordInput
                                    id="mfa-admin-password"
                                    autoComplete="current-password"
                                    value={change.data.password}
                                    onChange={(event) =>
                                        change.setData(
                                            'password',
                                            event.target.value,
                                        )
                                    }
                                    disabled={change.processing}
                                    aria-invalid={Boolean(
                                        change.errors.password,
                                    )}
                                    aria-describedby={
                                        change.errors.password
                                            ? 'mfa-password-error'
                                            : undefined
                                    }
                                    required
                                />
                                <InputError
                                    id="mfa-password-error"
                                    message={change.errors.password}
                                />
                            </Field>
                        )}
                        {Object.entries(change.errors)
                            .filter(([key]) => key !== 'password')
                            .map(([key, message]) => (
                                <InputError key={key} message={message} />
                            ))}
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={change.processing}>
                                Annulla
                            </AlertDialogCancel>
                            <Button
                                variant={
                                    action?.kind === 'delete' ||
                                    action?.kind === 'disable-mfa' ||
                                    action?.kind === 'block'
                                        ? 'destructive'
                                        : 'default'
                                }
                                disabled={
                                    change.processing ||
                                    (action?.kind === 'disable-mfa' &&
                                        !change.data.password)
                                }
                                onClick={() => {
                                    if (!action) return;
                                    const path = `/platform/users/${action.user.id}`;
                                    const options = {
                                        onSuccess: () => {
                                            setAction(null);
                                            change.reset('password');
                                        },
                                        onError: () => change.reset('password'),
                                    };
                                    if (action.kind === 'delete')
                                        change.delete(path, options);
                                    else if (action.kind === 'disable-mfa')
                                        change.delete(`${path}/mfa`, options);
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

import { Head, Link } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TenantSettingsNav } from '@/components/management/tenant-settings-nav';
import { api, dateLabel } from '@/components/management/helpers';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Combobox,
    ComboboxChip,
    ComboboxChips,
    ComboboxChipsInput,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxItem,
    ComboboxList,
    ComboboxValue,
    useComboboxAnchor,
} from '@/components/ui/combobox';
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
} from '@/components/ui/empty';
import {
    Field,
    FieldGroup,
    FieldLabel,
    FieldSet,
    FieldLegend,
    FieldDescription,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectGroup,
    SelectItem,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Tenant } from '@/types';

type Settings = {
    enabled: boolean;
    mode: 'expiry' | 'monthly';
    days: number[];
    monthly_day: number;
    user_ids: number[];
    external_emails: string[];
};
type Preview = {
    pending: number;
    enabled: boolean;
    recipients: string[];
    until: string;
    notifications: {
        date: string;
        mode: string;
        window_end: string | null;
        recipient: string;
        contracts: {
            id: number;
            name: string;
            ends_on: string;
            days: number | null;
            url: string;
        }[];
    }[];
};

export default function ContractReminders({
    tenant,
    settings,
    users,
}: {
    tenant: Tenant;
    settings: Settings;
    users: { id: number; name: string; email: string }[];
}) {
    const [form, setForm] = useState(settings);
    const [email, setEmail] = useState('');
    const [preview, setPreview] = useState<{
        form: Settings;
        data?: Preview;
        error?: string;
    } | null>(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [revision, setRevision] = useState(0);
    const path = `/t/${tenant.slug}/settings/contract-reminders`;
    const current = preview?.form === form ? preview : null;
    useEffect(() => {
        let active = true;
        const timer = setTimeout(() => {
            api<Preview>(`${path}/preview`, 'POST', form)
                .then((data) => {
                    if (active) setPreview({ form, data });
                })
                .catch((reason: unknown) => {
                    if (active)
                        setPreview({
                            form,
                            error:
                                reason instanceof Error
                                    ? reason.message
                                    : 'Anteprima non disponibile.',
                        });
                });
        }, 350);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [form, path, revision]);
    const toggle = (key: 'user_ids', value: number, checked: boolean) =>
        setForm({
            ...form,
            [key]: checked
                ? [...form[key], value]
                : form[key].filter((item) => item !== value),
        });
    const save = async () => {
        setSaving(true);
        setError('');
        try {
            await api(path, 'PUT', form);
            toast.success('Promemoria salvati.');
            setRevision((value) => value + 1);
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : 'Salvataggio non riuscito.',
            );
        } finally {
            setSaving(false);
        }
    };
    return (
        <>
            <Head title={`Promemoria contratti · ${tenant.name}`} />
            <div className="page-shell">
                <header>
                    <p className="text-sm text-muted-foreground">
                        {tenant.name}
                    </p>
                    <h1 className="page-title">Impostazioni ambiente</h1>
                </header>
                <TenantSettingsNav slug={tenant.slug} />
                <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Promemoria contratti</CardTitle>
                            <CardDescription>
                                Configurazione condivisa da tutto l’ambiente.
                                Invio alle 08:00, fuso Europe/Rome, con l’SMTP
                                della piattaforma.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FieldGroup>
                                <Field orientation="horizontal">
                                    <Switch
                                        id="reminders-enabled"
                                        checked={form.enabled}
                                        onCheckedChange={(enabled) =>
                                            setForm({ ...form, enabled })
                                        }
                                    />
                                    <FieldLabel htmlFor="reminders-enabled">
                                        Abilita notifiche email
                                    </FieldLabel>
                                    <Badge
                                        variant={
                                            form.enabled
                                                ? 'default'
                                                : 'secondary'
                                        }
                                    >
                                        {form.enabled
                                            ? 'Attive nel form'
                                            : 'Disabilitate'}
                                    </Badge>
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="reminders-mode">
                                        Modalità di invio
                                    </FieldLabel>
                                    <Select
                                        value={form.mode}
                                        onValueChange={(
                                            mode: Settings['mode'],
                                        ) => setForm({ ...form, mode })}
                                    >
                                        <SelectTrigger id="reminders-mode">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem value="expiry">
                                                    Promemoria per scadenza
                                                </SelectItem>
                                                <SelectItem value="monthly">
                                                    Riepilogo mensile
                                                </SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                    <FieldDescription>
                                        Una sola modalità attiva. Più contratti
                                        nello stesso giorno vengono raccolti in
                                        una email per destinatario.
                                    </FieldDescription>
                                </Field>
                                {form.mode === 'expiry' ? (
                                    <Field>
                                        <FieldLabel htmlFor="reminder-days">
                                            Giorni di anticipo
                                        </FieldLabel>
                                        <ReminderDaysSelect
                                            value={form.days}
                                            onChange={(days) =>
                                                setForm({ ...form, days })
                                            }
                                        />
                                        <FieldDescription id="reminder-days-help">
                                            Seleziona uno o più anticipi oppure
                                            scrivi un numero di giorni e scegli
                                            «Aggiungi». Sono ammessi giorni
                                            interi da 1 a 3650.
                                        </FieldDescription>
                                    </Field>
                                ) : (
                                    <Field>
                                        <FieldLabel htmlFor="monthly-day">
                                            Giorno del mese
                                        </FieldLabel>
                                        <Select
                                            value={String(form.monthly_day)}
                                            onValueChange={(value) =>
                                                setForm({
                                                    ...form,
                                                    monthly_day: Number(value),
                                                })
                                            }
                                        >
                                            <SelectTrigger id="monthly-day">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectGroup>
                                                    {Array.from(
                                                        { length: 28 },
                                                        (_, i) => i + 1,
                                                    ).map((day) => (
                                                        <SelectItem
                                                            key={day}
                                                            value={String(day)}
                                                        >
                                                            {day}
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                        <FieldDescription>
                                            Scadenze da questo giorno fino al
                                            giorno prima del prossimo invio. Al
                                            massimo una email al mese per
                                            destinatario.
                                        </FieldDescription>
                                    </Field>
                                )}
                                <FieldSet>
                                    <FieldLegend>
                                        Utenti dell’ambiente
                                    </FieldLegend>
                                    <FieldDescription>
                                        Gli utenti rimossi dall’ambiente non
                                        riceveranno più notifiche.
                                    </FieldDescription>
                                    {users.length ? (
                                        users.map((user) => (
                                            <Field
                                                key={user.id}
                                                orientation="horizontal"
                                            >
                                                <Checkbox
                                                    id={`recipient-${user.id}`}
                                                    checked={form.user_ids.includes(
                                                        user.id,
                                                    )}
                                                    onCheckedChange={(
                                                        checked,
                                                    ) =>
                                                        toggle(
                                                            'user_ids',
                                                            user.id,
                                                            checked === true,
                                                        )
                                                    }
                                                />
                                                <FieldLabel
                                                    htmlFor={`recipient-${user.id}`}
                                                    className="min-w-0 flex-wrap"
                                                >
                                                    {user.name}
                                                    <span className="break-all text-muted-foreground">
                                                        {user.email}
                                                    </span>
                                                </FieldLabel>
                                            </Field>
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            Nessun utente associato.
                                        </p>
                                    )}
                                </FieldSet>
                                <FieldSet>
                                    <FieldLegend>Email esterne</FieldLegend>
                                    <form
                                        className="flex items-end gap-2"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            const address = email
                                                .trim()
                                                .toLowerCase();
                                            if (
                                                address &&
                                                !form.external_emails.includes(
                                                    address,
                                                )
                                            )
                                                setForm({
                                                    ...form,
                                                    external_emails: [
                                                        ...form.external_emails,
                                                        address,
                                                    ],
                                                });
                                            setEmail('');
                                        }}
                                    >
                                        <Field>
                                            <FieldLabel htmlFor="external-email">
                                                Aggiungi indirizzo
                                            </FieldLabel>
                                            <Input
                                                id="external-email"
                                                type="email"
                                                value={email}
                                                onChange={(event) =>
                                                    setEmail(event.target.value)
                                                }
                                                placeholder="nome@organizzazione.it"
                                                required
                                                maxLength={254}
                                            />
                                        </Field>
                                        <Button type="submit" variant="outline">
                                            Aggiungi
                                        </Button>
                                    </form>
                                    <div className="flex flex-col gap-2">
                                        {form.external_emails.map((address) => (
                                            <div
                                                key={address}
                                                className="flex min-w-0 items-center justify-between gap-2"
                                            >
                                                <Badge
                                                    variant="secondary"
                                                    className="min-w-0 break-all whitespace-normal"
                                                >
                                                    {address}
                                                </Badge>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    aria-label={`Rimuovi ${address}`}
                                                    onClick={() =>
                                                        setForm({
                                                            ...form,
                                                            external_emails:
                                                                form.external_emails.filter(
                                                                    (value) =>
                                                                        value !==
                                                                        address,
                                                                ),
                                                        })
                                                    }
                                                >
                                                    Rimuovi
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </FieldSet>
                                {error && (
                                    <Alert variant="destructive">
                                        <AlertDescription>
                                            {error}
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </FieldGroup>
                        </CardContent>
                        <CardFooter className="flex flex-wrap gap-3">
                            <Button
                                disabled={saving}
                                onClick={() => void save()}
                            >
                                {saving ? 'Salvataggio…' : 'Salva impostazioni'}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Nessun recupero delle soglie già trascorse.
                            </p>
                        </CardFooter>
                    </Card>
                    <Card aria-busy={!current}>
                        <CardHeader>
                            <CardTitle>Prossime notifiche</CardTitle>
                            <CardDescription>
                                Anteprima sui contratti reali nei prossimi 12
                                mesi, basata sul form anche prima del
                                salvataggio. Nessuna email viene inviata. Sono
                                esclusi gli invii già registrati.
                            </CardDescription>
                        </CardHeader>
                        <CardContent
                            className="flex flex-col gap-4"
                            aria-live="polite"
                        >
                            {!current ? (
                                <p className="text-sm text-muted-foreground">
                                    Calcolo dell’anteprima…
                                </p>
                            ) : current.error ? (
                                <Alert variant="destructive">
                                    <AlertDescription>
                                        {current.error}
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                current.data && (
                                    <>
                                        {current.data.pending > 0 && (
                                            <Alert>
                                                <AlertDescription>
                                                    Ci sono{' '}
                                                    {current.data.pending}{' '}
                                                    registrazioni di invio in
                                                    corso o dall’esito incerto.
                                                    Non verranno ripetute
                                                    automaticamente: contatta
                                                    l’amministratore per
                                                    verificarle.
                                                </AlertDescription>
                                            </Alert>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            Fino al{' '}
                                            {dateLabel(current.data.until)} ·
                                            ore 08:00 Europe/Rome
                                        </p>
                                        {!current.data.enabled ? (
                                            <Empty>
                                                <EmptyHeader>
                                                    <EmptyTitle>
                                                        Notifiche disabilitate
                                                    </EmptyTitle>
                                                    <EmptyDescription>
                                                        Attiva l’interruttore
                                                        per simulare i prossimi
                                                        invii.
                                                    </EmptyDescription>
                                                </EmptyHeader>
                                            </Empty>
                                        ) : current.data.recipients.length ===
                                          0 ? (
                                            <Empty>
                                                <EmptyHeader>
                                                    <EmptyTitle>
                                                        Nessun destinatario
                                                        valido
                                                    </EmptyTitle>
                                                    <EmptyDescription>
                                                        Seleziona un utente o
                                                        aggiungi un indirizzo
                                                        email.
                                                    </EmptyDescription>
                                                </EmptyHeader>
                                            </Empty>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap gap-2">
                                                    {current.data.recipients.map(
                                                        (address) => (
                                                            <Badge
                                                                key={address}
                                                                variant="outline"
                                                                className="break-all whitespace-normal"
                                                            >
                                                                {address}
                                                            </Badge>
                                                        ),
                                                    )}
                                                </div>
                                                {current.data.notifications
                                                    .length === 0 ? (
                                                    <Empty>
                                                        <EmptyHeader>
                                                            <EmptyTitle>
                                                                Nessun invio
                                                                programmato
                                                            </EmptyTitle>
                                                            <EmptyDescription>
                                                                Non ci sono
                                                                scadenze
                                                                notificabili nel
                                                                periodo. Il
                                                                contratto deve
                                                                essere presente
                                                                nell’anno della
                                                                sua scadenza.
                                                            </EmptyDescription>
                                                        </EmptyHeader>
                                                    </Empty>
                                                ) : (
                                                    <div className="flex max-h-[48rem] flex-col gap-4 overflow-y-auto">
                                                        {current.data.notifications.map(
                                                            (notification) => (
                                                                <section
                                                                    key={`${notification.date}-${notification.recipient}`}
                                                                    className="rounded-lg border p-4"
                                                                >
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <h3 className="font-medium">
                                                                            {dateLabel(
                                                                                notification.date,
                                                                            )}
                                                                        </h3>
                                                                        <Badge variant="secondary">
                                                                            {notification.mode ===
                                                                            'monthly'
                                                                                ? 'Riepilogo mensile'
                                                                                : 'Per scadenza'}
                                                                        </Badge>
                                                                    </div>
                                                                    {notification.window_end && (
                                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                                            Scadenze
                                                                            dal{' '}
                                                                            {dateLabel(
                                                                                notification.date,
                                                                            )}{' '}
                                                                            al{' '}
                                                                            {dateLabel(
                                                                                notification.window_end,
                                                                            )}
                                                                        </p>
                                                                    )}
                                                                    <p className="my-2 text-sm break-all text-muted-foreground">
                                                                        A:{' '}
                                                                        {
                                                                            notification.recipient
                                                                        }
                                                                    </p>
                                                                    <ul className="flex flex-col gap-2">
                                                                        {notification.contracts.map(
                                                                            (
                                                                                contract,
                                                                            ) => (
                                                                                <li
                                                                                    key={
                                                                                        contract.id
                                                                                    }
                                                                                    className="text-sm"
                                                                                >
                                                                                    <Link
                                                                                        href={
                                                                                            contract.url
                                                                                        }
                                                                                        className="font-medium hover:text-primary"
                                                                                    >
                                                                                        {
                                                                                            contract.name
                                                                                        }
                                                                                    </Link>
                                                                                    <p className="text-muted-foreground">
                                                                                        Scadenza{' '}
                                                                                        {dateLabel(
                                                                                            contract.ends_on,
                                                                                        )}
                                                                                        {contract.days !==
                                                                                            null &&
                                                                                            ` · ${contract.days} giorni prima`}
                                                                                    </p>
                                                                                </li>
                                                                            ),
                                                                        )}
                                                                    </ul>
                                                                </section>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}

ContractReminders.layout = {
    breadcrumbs: [{ title: 'Impostazioni ambiente', href: '/dashboard' }],
};

function ReminderDaysSelect({
    value,
    onChange,
}: {
    value: number[];
    onChange: (days: number[]) => void;
}) {
    const [search, setSearch] = useState('');
    const anchor = useComboboxAnchor();
    const query = search.trim();
    const suggested = [...new Set([1, 3, 7, 14, 30, ...value])].sort(
        (a, b) => a - b,
    );
    const custom =
        /^\d+$/.test(query) && Number(query) >= 1 && Number(query) <= 3650
            ? Number(query)
            : null;
    const items = suggested.filter(
        (day) => !query || day === custom || String(day).includes(query),
    );
    const adding = custom !== null && !suggested.includes(custom);
    if (adding) items.unshift(custom);
    const label = (day: number) => `${day} ${day === 1 ? 'giorno' : 'giorni'}`;
    return (
        <Combobox<number, true>
            multiple
            autoHighlight
            items={items}
            value={value}
            inputValue={search}
            filter={null}
            itemToStringLabel={label}
            onInputValueChange={setSearch}
            onValueChange={(days) => {
                onChange(days);
                setSearch('');
            }}
        >
            <ComboboxChips ref={anchor} className="w-full min-w-0">
                <ComboboxValue>
                    {value.map((day) => (
                        <ComboboxChip
                            key={day}
                            removeLabel={`Rimuovi ${label(day)}`}
                        >
                            {label(day)}
                        </ComboboxChip>
                    ))}
                </ComboboxValue>
                <ComboboxChipsInput
                    id="reminder-days"
                    inputMode="numeric"
                    aria-describedby="reminder-days-help"
                    placeholder="Seleziona o scrivi i giorni…"
                />
            </ComboboxChips>
            <ComboboxContent anchor={anchor}>
                <ComboboxEmpty>
                    Inserisci un numero intero da 1 a 3650.
                </ComboboxEmpty>
                <ComboboxList>
                    {(day: number) => (
                        <ComboboxItem key={day} value={day}>
                            {adding && day === custom
                                ? `Aggiungi ${label(day)}`
                                : label(day)}
                        </ComboboxItem>
                    )}
                </ComboboxList>
            </ComboboxContent>
        </Combobox>
    );
}

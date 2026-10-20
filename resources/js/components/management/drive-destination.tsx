import {
    DrivePicker,
    DrivePickerDocsView,
} from '@googleworkspace/drive-picker-react';
import { useForm } from '@inertiajs/react';
import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/components/management/helpers';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

export function DriveDestination({
    destination,
    apiKey,
    appId,
}: {
    destination: { id: string | null; name: string } | null;
    apiKey: string | null;
    appId: string | null;
}) {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [configOpen, setConfigOpen] = useState(!apiKey || !appId);
    const config = useForm({
        picker_api_key: apiKey ?? '',
        picker_app_id: appId ?? '',
    });
    const folder = useForm({ folder_id: '' });
    const busy =
        loading || folder.processing || config.processing || token !== null;
    const pickerError = {
        'onpicker-error': () => {
            setToken(null);
            toast.error(
                'Selettore Google non disponibile. Verifica la configurazione e riprova.',
            );
        },
    };
    return (
        <Card>
            <CardHeader>
                <CardTitle>Cartella di destinazione</CardTitle>
                <CardDescription>
                    La cartella di Obake con report e backup viene spostata qui.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <p>Destinazione: {destination?.name ?? 'Il mio Drive'}</p>
                <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost">
                            Configurazione selettore Google
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                config.put('/platform/settings/sync/picker', {
                                    preserveScroll: true,
                                    onSuccess: () => setConfigOpen(false),
                                });
                            }}
                        >
                            <FieldGroup>
                                <Field
                                    data-invalid={
                                        !!config.errors.picker_api_key
                                    }
                                >
                                    <FieldLabel htmlFor="drive-picker-key">
                                        API key Google Picker
                                    </FieldLabel>
                                    <Input
                                        id="drive-picker-key"
                                        value={config.data.picker_api_key}
                                        onChange={(event) =>
                                            config.setData(
                                                'picker_api_key',
                                                event.target.value,
                                            )
                                        }
                                        required
                                        maxLength={255}
                                        autoComplete="off"
                                        disabled={busy}
                                        aria-invalid={
                                            !!config.errors.picker_api_key
                                        }
                                    />
                                    <FieldError>
                                        {config.errors.picker_api_key}
                                    </FieldError>
                                </Field>
                                <Field
                                    data-invalid={!!config.errors.picker_app_id}
                                >
                                    <FieldLabel htmlFor="drive-picker-app">
                                        Numero progetto Google Cloud
                                    </FieldLabel>
                                    <Input
                                        id="drive-picker-app"
                                        value={config.data.picker_app_id}
                                        onChange={(event) =>
                                            config.setData(
                                                'picker_app_id',
                                                event.target.value,
                                            )
                                        }
                                        required
                                        maxLength={30}
                                        inputMode="numeric"
                                        pattern="[0-9]+"
                                        disabled={busy}
                                        aria-invalid={
                                            !!config.errors.picker_app_id
                                        }
                                    />
                                    <FieldError>
                                        {config.errors.picker_app_id}
                                    </FieldError>
                                </Field>
                                <Button
                                    type="submit"
                                    disabled={busy || !config.isDirty}
                                >
                                    Salva configurazione
                                </Button>
                            </FieldGroup>
                        </form>
                    </CollapsibleContent>
                </Collapsible>
                <FieldError>{folder.errors.folder_id}</FieldError>
                <div className="flex flex-wrap gap-2">
                    <Button
                        disabled={busy || !apiKey || !appId || config.isDirty}
                        onClick={async () => {
                            setLoading(true);
                            folder.clearErrors();
                            try {
                                const result = await api<{
                                    access_token: string;
                                }>(
                                    '/platform/settings/sync/picker-token',
                                    'POST',
                                );
                                setToken(result.access_token);
                            } catch (error) {
                                toast.error(
                                    error instanceof Error
                                        ? error.message
                                        : 'Impossibile aprire il selettore Google.',
                                );
                            } finally {
                                setLoading(false);
                            }
                        }}
                    >
                        {loading || folder.processing ? (
                            <Spinner data-icon="inline-start" />
                        ) : (
                            <FolderOpen data-icon="inline-start" />
                        )}
                        Scegli cartella
                    </Button>
                    {token && (
                        <Button
                            variant="outline"
                            onClick={() => setToken(null)}
                        >
                            Chiudi selettore
                        </Button>
                    )}
                </div>
                {folder.recentlySuccessful && (
                    <p role="status">Destinazione aggiornata.</p>
                )}
                {token && apiKey && appId && (
                    <DrivePicker
                        {...pickerError}
                        app-id={appId}
                        developer-key={apiKey}
                        oauth-token={token}
                        origin={window.location.origin}
                        locale="it"
                        title="Scegli dove salvare Obake"
                        max-items={1}
                        onCanceled={() => setToken(null)}
                        onOauthError={pickerError['onpicker-error']}
                        onPicked={(event) => {
                            setToken(null);
                            const id = event.detail.docs?.[0]?.id;
                            if (!id) {
                                toast.error('Nessuna cartella selezionata.');
                                return;
                            }
                            folder.transform(() => ({ folder_id: id }));
                            folder.put('/platform/settings/sync/destination', {
                                preserveScroll: true,
                            });
                        }}
                    >
                        <DrivePickerDocsView
                            view-id="FOLDERS"
                            include-folders="true"
                            select-folder-enabled="true"
                            enable-drives="false"
                            mode="LIST"
                        />
                    </DrivePicker>
                )}
            </CardContent>
        </Card>
    );
}

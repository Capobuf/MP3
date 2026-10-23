import { Head } from '@inertiajs/react';
import { Download } from 'lucide-react';
import { DataImport } from '@/components/management/data-import';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';
import type { Tenant } from '@/types';
import { TenantSettingsNav } from '@/components/management/tenant-settings-nav';

export default function TenantData({
    tenant,
    empty,
    maxFileKb,
    maxRecords,
}: {
    tenant: Tenant;
    empty: boolean;
    maxFileKb: number;
    maxRecords: number;
}) {
    const path = `/t/${tenant.slug}/settings/data`;
    return (
        <>
            <Head
                title={`Importazione ed esportazione dati · ${tenant.name}`}
            />
            <div className="page-shell">
                <header>
                    <p className="text-sm text-muted-foreground">
                        {tenant.name}
                    </p>
                    <h1 className="page-title">
                        Impostazioni — Importazione ed esportazione dati
                    </h1>
                </header>
                <TenantSettingsNav slug={tenant.slug} />
                <Alert>
                    <AlertTitle>Trasferimento dati strutturati</AlertTitle>
                    <AlertDescription>
                        Il trasferimento CSV include i dati strutturati. Non
                        include gli allegati, gli account utente o le
                        configurazioni dell’installazione. Non sostituisce un
                        backup completo.
                    </AlertDescription>
                </Alert>
                <Card>
                    <CardHeader>
                        <CardTitle>Esporta dati dell’azienda</CardTitle>
                        <CardDescription>
                            Un singolo CSV tecnico versionato per trasferire
                            fornitori, contratti, progetti, spese, righe
                            economiche, centri di costo e Budget tra
                            installazioni Obake compatibili.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild variant="outline">
                            <a href={`${path}/export.csv`}>
                                <Download data-icon="inline-start" />
                                Esporta CSV
                            </a>
                        </Button>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Importa dati nell’azienda</CardTitle>
                        <CardDescription>
                            Seleziona un’azienda vuota dalla gestione aziende.
                            Valida il CSV, controlla i conteggi e conferma
                            esplicitamente il trasferimento.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        {!empty && (
                            <Alert variant="destructive">
                                <AlertTitle>Azienda già popolata</AlertTitle>
                                <AlertDescription>
                                    L’importazione è disponibile soltanto in
                                    un’azienda priva di dati gestionali. Crea o
                                    seleziona un’azienda vuota da
                                    Amministrazione.
                                </AlertDescription>
                            </Alert>
                        )}
                        <DataImport
                            path={path}
                            format="csv"
                            maxFileKb={maxFileKb}
                            maxRecords={maxRecords}
                            disabled={!empty}
                        />
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
TenantData.layout = {
    breadcrumbs: [{ title: 'Impostazioni', href: '/dashboard' }],
};

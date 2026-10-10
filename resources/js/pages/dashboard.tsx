import { Head, Link } from '@inertiajs/react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { dashboard } from '@/routes';
import type { Tenant } from '@/types';

export default function Dashboard({ tenants }: { tenants: Tenant[] }) {
    return (
        <>
            <Head title="Scelta ambiente" />
            <div className="page-shell">
                <div>
                    <h1 className="page-title">
                        {tenants.length === 0
                            ? 'Nessun ambiente assegnato'
                            : 'Scegli un ambiente'}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {tenants.length === 0
                            ? 'Il tuo account è attivo, ma non è ancora associato a un ambiente. Contatta un amministratore.'
                            : 'Seleziona l’ambiente in cui vuoi lavorare.'}
                    </p>
                </div>

                {tenants.length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {tenants.map((tenant) => (
                            <Card key={tenant.id}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Building2 className="size-5" />
                                        {tenant.name}
                                    </CardTitle>
                                    <CardDescription>
                                        /t/{tenant.slug}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Button asChild className="w-full">
                                        <Link
                                            href={`/t/${tenant.slug}/dashboard`}
                                        >
                                            Apri ambiente
                                        </Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [{ title: 'Scelta ambiente', href: dashboard() }],
};

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
            <Head title="Choose tenant" />
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 md:p-8">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        {tenants.length === 0
                            ? 'No tenant access'
                            : 'Choose a tenant'}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {tenants.length === 0
                            ? 'Your account is active, but it has not been assigned to a tenant. Contact a platform administrator.'
                            : 'Select the customer environment you want to open.'}
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
                                            Open tenant
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
    breadcrumbs: [{ title: 'Choose tenant', href: dashboard() }],
};

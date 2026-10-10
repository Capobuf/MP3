import { Head, Link, usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import { Button } from '@/components/ui/button';
import { dashboard, login } from '@/routes';

export default function Welcome() {
    const { auth } = usePage().props;

    return (
        <>
            <Head title="MP3" />
            <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 text-center text-foreground">
                <AppLogoIcon className="size-32" />
                <div className="space-y-2">
                    <h1 className="text-4xl font-semibold">MP3</h1>
                    <p className="text-muted-foreground">
                        Gestione spese, progetti, contratti e fornitori.
                    </p>
                </div>
                <Button asChild>
                    <Link href={auth.user ? dashboard() : login()}>
                        {auth.user ? 'Apri dashboard' : 'Accedi'}
                    </Link>
                </Button>
            </main>
        </>
    );
}

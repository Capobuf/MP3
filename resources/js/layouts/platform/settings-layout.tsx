import { Link, usePage } from '@inertiajs/react';
import {
    Archive,
    Building2,
    Mail,
    RefreshCw,
    Settings,
    Users,
} from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { Button } from '@/components/ui/button';

const sections = [
    { title: 'Generali', href: '/platform/settings/general', icon: Settings },
    { title: 'Aziende', href: '/platform', icon: Building2 },
    { title: 'Utenti', href: '/platform/settings/users', icon: Users },
    { title: 'Email', href: '/platform/settings/email', icon: Mail },
    { title: 'Sync', href: '/platform/settings/sync', icon: RefreshCw },
    { title: 'Backup', href: '/platform/settings/backups', icon: Archive },
];

export default function PlatformSettingsLayout({
    children,
}: PropsWithChildren) {
    const { url } = usePage();
    const path = url.split('?')[0];

    return (
        <div className="page-shell">
            <header>
                <h1 className="page-title">Amministrazione</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Gestisci aziende, utenti e configurazioni condivise di
                    Obake.
                </p>
            </header>
            <nav aria-label="Amministrazione" className="flex flex-wrap gap-2">
                {sections.map(({ title, href, icon: Icon }) => (
                    <Button
                        key={href}
                        variant={path === href ? 'secondary' : 'ghost'}
                        asChild
                    >
                        <Link
                            href={href}
                            aria-current={path === href ? 'page' : undefined}
                        >
                            <Icon data-icon="inline-start" />
                            {title}
                        </Link>
                    </Button>
                ))}
            </nav>
            {children}
        </div>
    );
}

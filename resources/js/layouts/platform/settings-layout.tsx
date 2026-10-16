import { Link, usePage } from '@inertiajs/react';
import { Building2, Mail, Users } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { Button } from '@/components/ui/button';

const sections = [
    { title: 'Ambienti', href: '/platform', icon: Building2 },
    { title: 'Utenti', href: '/platform/settings/users', icon: Users },
    { title: 'Email', href: '/platform/settings/email', icon: Mail },
];

export default function PlatformSettingsLayout({
    children,
}: PropsWithChildren) {
    const { url } = usePage();
    const path = url.split('?')[0];

    return (
        <div className="page-shell">
            <header>
                <h1 className="page-title">Impostazioni Piattaforma</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Gestisci ambienti, utenti e configurazioni condivise della
                    piattaforma.
                </p>
            </header>
            <nav
                aria-label="Impostazioni Piattaforma"
                className="flex flex-wrap gap-2"
            >
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

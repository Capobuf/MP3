import { Link, usePage } from '@inertiajs/react';
import {
    Archive,
    ArrowRightLeft,
    BellRing,
    Building2,
    ListChecks,
    RefreshCw,
    Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const sections = [
    { path: 'identity', title: 'Identità azienda', icon: Building2 },
    { path: 'project-statuses', title: 'Stati dei progetti', icon: ListChecks },
    { path: 'users', title: 'Utenti', icon: Users },
    {
        path: 'contract-reminders',
        title: 'Promemoria contratti',
        icon: BellRing,
    },
    {
        path: 'data',
        title: 'Importazione ed esportazione',
        icon: ArrowRightLeft,
    },
    { path: 'backups', title: 'Backup', icon: Archive },
    { path: 'sync', title: 'Sync', icon: RefreshCw },
];

export function TenantSettingsNav({ slug }: { slug: string }) {
    const { url } = usePage();
    const pathname = url.split('?')[0];

    return (
        <nav
            aria-label="Impostazioni"
            className="flex flex-wrap gap-1 rounded-xl border bg-muted/30 p-1.5"
        >
            {sections.map(({ path, title, icon: Icon }) => {
                const href = `/t/${slug}/settings/${path}`;
                const active = pathname === href;

                return (
                    <Button
                        key={path}
                        asChild
                        variant={active ? 'outline' : 'ghost'}
                        className="h-auto min-h-9 max-w-full justify-start py-2 text-left whitespace-normal"
                    >
                        <Link
                            href={href}
                            aria-current={active ? 'page' : undefined}
                        >
                            <Icon data-icon="inline-start" aria-hidden="true" />
                            {title}
                        </Link>
                    </Button>
                );
            })}
        </nav>
    );
}

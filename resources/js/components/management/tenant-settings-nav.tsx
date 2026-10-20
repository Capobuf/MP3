import { Link, usePage } from '@inertiajs/react';
import { Button } from '@/components/ui/button';

export function TenantSettingsNav({ slug }: { slug: string }) {
    const { url } = usePage();
    return (
        <nav
            aria-label="Impostazioni ambiente"
            className="flex flex-wrap gap-2"
        >
            {[
                ['project-statuses', 'Stati dei progetti'],
                ['users', 'Utenti'],
                ['contract-reminders', 'Promemoria contratti'],
                ['data', 'Importazione ed esportazione'],
                ['backups', 'Backup'],
                ['sync', 'Sync'],
            ].map(([path, title]) => {
                const href = `/t/${slug}/settings/${path}`;
                return (
                    <Button
                        key={path}
                        asChild
                        variant={
                            url.split('?')[0] === href ? 'secondary' : 'ghost'
                        }
                    >
                        <Link
                            href={href}
                            aria-current={
                                url.split('?')[0] === href ? 'page' : undefined
                            }
                        >
                            {title}
                        </Link>
                    </Button>
                );
            })}
        </nav>
    );
}

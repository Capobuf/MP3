import { Link } from '@inertiajs/react';
import type { PropsWithChildren } from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn, toUrl } from '@/lib/utils';
import { edit as editAppearance } from '@/routes/appearance';
import { edit } from '@/routes/profile';
import { edit as editSecurity } from '@/routes/security';
import type { NavItem } from '@/types';

const sidebarNavItems: NavItem[] = [
    {
        title: 'Profilo',
        href: edit(),
        icon: null,
    },
    {
        title: 'Sicurezza',
        href: editSecurity(),
        icon: null,
    },
    {
        title: 'Aspetto',
        href: editAppearance(),
        icon: null,
    },
];

export default function SettingsLayout({ children }: PropsWithChildren) {
    const { isCurrentOrParentUrl } = useCurrentUrl();

    return (
        <div className="page-shell">
            <Heading
                title="Impostazioni"
                description="Gestisci il profilo e le preferenze del tuo account."
            />

            <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:gap-10">
                <aside className="w-full max-w-xl lg:w-48">
                    <nav
                        className="flex flex-wrap gap-1 lg:flex-col"
                        aria-label="Impostazioni"
                    >
                        {sidebarNavItems.map((item, index) => (
                            <Button
                                key={`${toUrl(item.href)}-${index}`}
                                size="sm"
                                variant="ghost"
                                asChild
                                className={cn('w-full justify-start', {
                                    'bg-accent text-accent-foreground':
                                        isCurrentOrParentUrl(item.href),
                                })}
                            >
                                <Link href={item.href}>
                                    {item.icon && (
                                        <item.icon className="h-4 w-4" />
                                    )}
                                    {item.title}
                                </Link>
                            </Button>
                        ))}
                    </nav>
                </aside>

                <Separator className="my-6 lg:hidden" />

                <div className="min-w-0 flex-1 rounded-xl border bg-card p-4 shadow-xs sm:p-6">
                    <section className="flex max-w-2xl flex-col gap-10">
                        {children}
                    </section>
                </div>
            </div>
        </div>
    );
}

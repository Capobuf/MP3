import { router, usePage } from '@inertiajs/react';
import {
    Building2,
    LayoutGrid,
    Palette,
    Search,
    ShieldCheck,
    UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { Button } from '@/components/ui/button';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { getPrimaryNavItems } from '@/lib/app-navigation';
import { toUrl } from '@/lib/utils';
import type { NavItem } from '@/types';

export function QuickNavigation() {
    const { auth, currentTenant } = usePage().props;
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                event.key.toLowerCase() === 'k' &&
                (event.ctrlKey || event.metaKey)
            ) {
                event.preventDefault();
                if (!event.repeat) {
                    setOpen((previous) => !previous);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const groups: { heading: string; items: NavItem[] }[] = [
        {
            heading: 'Navigazione',
            items: getPrimaryNavItems(currentTenant, auth.user.is_super_admin),
        },
        {
            heading: 'Ambienti',
            items: auth.tenants.map((tenant) => ({
                title: tenant.name,
                href: `/t/${tenant.slug}/dashboard`,
                icon: Building2,
            })),
        },
        {
            heading: 'Account',
            items: [
                {
                    title: 'Profilo',
                    href: '/settings/profile',
                    icon: UserRound,
                },
                {
                    title: 'Aspetto',
                    href: '/settings/appearance',
                    icon: Palette,
                },
                {
                    title: 'Sicurezza',
                    href: '/settings/security',
                    icon: ShieldCheck,
                },
            ],
        },
        {
            heading: 'Amministrazione',
            items: auth.user.is_super_admin
                ? [
                      {
                          title: 'Piattaforma',
                          href: '/platform',
                          icon: LayoutGrid,
                      },
                  ]
                : [],
        },
    ];
    const seenUrls = new Set<string>();
    const uniqueGroups = groups.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
            const href = toUrl(item.href);
            if (seenUrls.has(href)) {
                return false;
            }
            seenUrls.add(href);
            return true;
        }),
    }));

    const navigate = (href: string) => {
        setOpen(false);
        router.visit(href);
    };

    return (
        <>
            <Button
                type="button"
                variant="outline"
                className="h-9 w-9 rounded-lg bg-muted/50 px-0 text-muted-foreground shadow-none md:w-[260px] md:justify-start md:px-3 lg:w-72"
                aria-label="Cerca una pagina"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-keyshortcuts="Control+k Meta+k"
                onClick={() => setOpen(true)}
            >
                <Search className="size-4" aria-hidden="true" />
                <span className="hidden md:inline">Cerca una pagina...</span>
                <Kbd className="ml-auto hidden md:inline-flex">Ctrl / ⌘ K</Kbd>
            </Button>
            <CommandDialog
                open={open}
                onOpenChange={setOpen}
                title="Ricerca rapida"
                description="Cerca tra le pagine e gli ambienti disponibili."
            >
                <CommandInput
                    placeholder="Cerca una pagina..."
                    aria-label="Cerca una pagina"
                />
                <CommandList>
                    <CommandEmpty>Nessuna pagina trovata.</CommandEmpty>
                    {uniqueGroups.map((group) =>
                        group.items.length > 0 ? (
                            <CommandGroup
                                key={group.heading}
                                heading={group.heading}
                            >
                                {group.items.map((item) => (
                                    <CommandItem
                                        key={toUrl(item.href)}
                                        value={`${item.title} ${toUrl(item.href)}`}
                                        keywords={
                                            currentTenant &&
                                            toUrl(item.href) ===
                                                `/t/${currentTenant.slug}/dashboard`
                                                ? [currentTenant.name]
                                                : undefined
                                        }
                                        onSelect={() =>
                                            navigate(toUrl(item.href))
                                        }
                                    >
                                        {item.icon && (
                                            <item.icon aria-hidden="true" />
                                        )}
                                        <span className="truncate">
                                            {item.title}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ) : null,
                    )}
                </CommandList>
            </CommandDialog>
        </>
    );
}

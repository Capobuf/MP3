import { router, usePage } from '@inertiajs/react';
import {
    Building2,
    FileText,
    FolderKanban,
    Network,
    Receipt,
    Wallet,
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
import {
    getAdministrativeNavItems,
    getPrimaryNavItems,
} from '@/lib/app-navigation';
import { toUrl } from '@/lib/utils';
import type { NavItem } from '@/types';

const resultGroups = [
    { type: 'expenses', heading: 'Spese', icon: Receipt },
    { type: 'contracts', heading: 'Contratti', icon: FileText },
    { type: 'projects', heading: 'Progetti', icon: FolderKanban },
    { type: 'vendors', heading: 'Fornitori', icon: Building2 },
    { type: 'cost-centers', heading: 'Centri di costo', icon: Network },
    { type: 'budget', heading: 'Budget', icon: Wallet },
] as const;

type SearchResult = {
    type: (typeof resultGroups)[number]['type'];
    id: number;
    title: string;
    subtitle: string | null;
    href: string;
};

export function QuickNavigation() {
    const { auth, currentTenant } = usePage().props;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [response, setResponse] = useState<{
        term: string;
        tenant: string;
        results: SearchResult[];
        error: boolean;
    } | null>(null);
    const term = query.trim();
    const tenant = currentTenant?.slug;
    const canSearch = open && tenant && term.length >= 2;
    const currentResponse =
        canSearch && response?.term === term && response.tenant === tenant
            ? response
            : null;
    const loading = Boolean(canSearch && !currentResponse);

    useEffect(() => {
        if (!open || !tenant || term.length < 2) return;

        const controller = new AbortController();
        const timeout = window.setTimeout(async () => {
            try {
                const result = await fetch(
                    `/t/${tenant}/search?${new URLSearchParams({ q: term })}`,
                    {
                        headers: { Accept: 'application/json' },
                        signal: controller.signal,
                    },
                );
                if (!result.ok) throw new Error('Search failed');
                const data: { results: SearchResult[] } = await result.json();
                if (!controller.signal.aborted) {
                    setResponse({
                        term,
                        tenant,
                        results: data.results,
                        error: false,
                    });
                }
            } catch {
                if (!controller.signal.aborted) {
                    setResponse({ term, tenant, results: [], error: true });
                }
            }
        }, 300);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [open, tenant, term]);

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
            items: getAdministrativeNavItems(
                currentTenant,
                auth.user.is_super_admin,
            ),
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
                description="Cerca tra le pagine e i dati dell’ambiente corrente, in tutti gli anni."
            >
                <CommandInput
                    value={query}
                    onValueChange={(value) => {
                        setQuery(value);
                        if (value.trim() !== term) setResponse(null);
                    }}
                    maxLength={100}
                    placeholder="Cerca una pagina..."
                    aria-label="Cerca una pagina"
                />
                <CommandList>
                    {loading || currentResponse?.error ? (
                        <div
                            role="status"
                            className="py-6 text-center text-sm text-muted-foreground"
                        >
                            {loading
                                ? 'Ricerca in corso…'
                                : 'Ricerca non disponibile. Riprova.'}
                        </div>
                    ) : (
                        <CommandEmpty>Nessun risultato trovato.</CommandEmpty>
                    )}
                    {resultGroups.map((group) => {
                        const results =
                            currentResponse?.results.filter(
                                (result) => result.type === group.type,
                            ) ?? [];
                        return results.length > 0 ? (
                            <CommandGroup
                                key={group.type}
                                heading={group.heading}
                            >
                                {results.map((result) => (
                                    <CommandItem
                                        key={`${result.type}-${result.id}`}
                                        value={`${result.type}-${result.id} ${result.title}`}
                                        keywords={[
                                            `${currentResponse?.term} ${group.heading}`,
                                        ]}
                                        onSelect={() => navigate(result.href)}
                                    >
                                        <group.icon aria-hidden="true" />
                                        <span className="flex min-w-0 flex-col">
                                            <span className="truncate">
                                                {result.title}
                                            </span>
                                            {result.subtitle && (
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {result.subtitle}
                                                </span>
                                            )}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ) : null;
                    })}
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

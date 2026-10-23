import { Link, usePage } from '@inertiajs/react';
import { Building2, Check, ChevronsUpDown, Settings } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';

export function TenantSwitcher() {
    const { auth, currentTenant } = usePage().props;
    const { isMobile, setOpenMobile } = useSidebar();

    if (!auth.canManagePlatform || auth.tenants.length === 0) {
        return (
            <div
                className="flex min-w-0 items-center gap-2 px-2 py-3"
                title={
                    currentTenant?.name ??
                    auth.tenants[0]?.name ??
                    'Nessun ambiente assegnato'
                }
            >
                <Building2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate group-data-[collapsible=icon]:hidden">
                    {currentTenant?.name ??
                        auth.tenants[0]?.name ??
                        (auth.canManagePlatform
                            ? 'Piattaforma'
                            : 'Nessun ambiente assegnato')}
                </span>
            </div>
        );
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="h-12 rounded-xl border border-sidebar-border bg-card p-2 shadow-xs group-data-[collapsible=icon]:border-0 hover:bg-sidebar-accent"
                            aria-label={
                                currentTenant
                                    ? `Cambia ambiente: ${currentTenant.name}`
                                    : 'Seleziona ambiente'
                            }
                        >
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
                                <Building2
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            </div>
                            <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                                <span className="truncate text-base font-medium">
                                    {currentTenant?.name ??
                                        'Seleziona ambiente'}
                                </span>
                            </div>
                            <ChevronsUpDown
                                className="ml-auto size-4 group-data-[collapsible=icon]:hidden"
                                aria-hidden="true"
                            />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-56 max-w-[calc(100vw-2rem)] rounded-xl"
                        align="start"
                        side={isMobile ? 'bottom' : 'right'}
                    >
                        <DropdownMenuLabel>Ambienti</DropdownMenuLabel>
                        {auth.tenants.length === 0 ? (
                            <DropdownMenuItem disabled>
                                Nessun ambiente disponibile
                            </DropdownMenuItem>
                        ) : (
                            auth.tenants.map((tenant) => (
                                <DropdownMenuItem key={tenant.id} asChild>
                                    <Link
                                        href={`/t/${tenant.slug}/dashboard`}
                                        onClick={() => setOpenMobile(false)}
                                        aria-current={
                                            tenant.id === currentTenant?.id
                                                ? 'page'
                                                : undefined
                                        }
                                    >
                                        <Building2 aria-hidden="true" />
                                        <span className="min-w-0 flex-1 truncate">
                                            {tenant.name}
                                        </span>
                                        {tenant.id === currentTenant?.id && (
                                            <Check
                                                className="ml-auto size-4"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </Link>
                                </DropdownMenuItem>
                            ))
                        )}
                        {auth.canManagePlatform && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <Link
                                        href="/platform"
                                        onClick={() => setOpenMobile(false)}
                                    >
                                        <Settings aria-hidden="true" />
                                        Impostazioni Piattaforma
                                    </Link>
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

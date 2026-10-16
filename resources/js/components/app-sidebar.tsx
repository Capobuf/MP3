import { Link, usePage } from '@inertiajs/react';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { TenantSwitcher } from '@/components/tenant-switcher';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
    getAdministrativeNavItems,
    getPrimaryNavItems,
} from '@/lib/app-navigation';

export function AppSidebar() {
    const { auth, currentTenant } = usePage().props;
    const homeHref = currentTenant
        ? `/t/${currentTenant.slug}/dashboard`
        : auth.user.is_super_admin
          ? '/platform'
          : '/dashboard';
    const homeLabel = currentTenant
        ? `Vai alla home di ${currentTenant.name}`
        : auth.user.is_super_admin
          ? 'Vai a Impostazioni Piattaforma'
          : 'Scegli ambiente';

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader className="gap-4 p-3 group-data-[collapsible=icon]:px-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            size="lg"
                            className="h-14 justify-center"
                            asChild
                        >
                            <Link
                                href={homeHref}
                                aria-label={homeLabel}
                                prefetch
                            >
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
                <TenantSwitcher />
            </SidebarHeader>

            <SidebarContent>
                <NavMain
                    items={getPrimaryNavItems(
                        currentTenant,
                        auth.user.is_super_admin,
                    )}
                    label="Navigazione"
                />
                {currentTenant && (
                    <NavMain
                        items={getAdministrativeNavItems(
                            currentTenant,
                            auth.user.is_super_admin,
                        )}
                        label="Amministrazione"
                    />
                )}
            </SidebarContent>

            <SidebarFooter className="border-t border-sidebar-border p-3">
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}

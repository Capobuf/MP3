import { Link, usePage } from '@inertiajs/react';
import { LayoutGrid } from 'lucide-react';
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
import { getPrimaryNavItems } from '@/lib/app-navigation';
import { dashboard } from '@/routes';

export function AppSidebar() {
    const { auth, currentTenant } = usePage().props;

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={dashboard()} prefetch>
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
                {currentTenant && auth.user.is_super_admin && (
                    <NavMain
                        items={[
                            {
                                title: 'Piattaforma',
                                href: '/platform',
                                icon: LayoutGrid,
                            },
                        ]}
                        label="Amministrazione"
                    />
                )}
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}

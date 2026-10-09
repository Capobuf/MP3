import { Link, usePage } from '@inertiajs/react';
import {
    BookOpen,
    Building2,
    FolderGit2,
    LayoutGrid,
    Receipt,
    FileText,
    FolderKanban,
    Handshake,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { dashboard } from '@/routes';
import type { NavItem } from '@/types';

const footerNavItems: NavItem[] = [
    {
        title: 'Repository',
        href: 'https://github.com/laravel/react-starter-kit',
        icon: FolderGit2,
    },
    {
        title: 'Documentation',
        href: 'https://laravel.com/docs/starter-kits#react',
        icon: BookOpen,
    },
];

export function AppSidebar() {
    const { auth, currentTenant } = usePage().props;
    const mainNavItems: NavItem[] = currentTenant
        ? [
              {
                  title: 'Panoramica',
                  href: `/t/${currentTenant.slug}/dashboard`,
                  icon: LayoutGrid,
              },
              {
                  title: 'Spese',
                  href: `/t/${currentTenant.slug}/expenses`,
                  icon: Receipt,
              },
              {
                  title: 'Contratti',
                  href: `/t/${currentTenant.slug}/contracts`,
                  icon: FileText,
              },
              {
                  title: 'Progetti',
                  href: `/t/${currentTenant.slug}/projects`,
                  icon: FolderKanban,
              },
              {
                  title: 'Fornitori',
                  href: `/t/${currentTenant.slug}/vendors`,
                  icon: Handshake,
              },
          ]
        : [
              {
                  title: auth.user.is_super_admin
                      ? 'Platform'
                      : 'Choose tenant',
                  href: auth.user.is_super_admin ? '/platform' : dashboard(),
                  icon: LayoutGrid,
              },
          ];
    const tenantNavItems: NavItem[] = auth.tenants.map((tenant) => ({
        title: tenant.name,
        href: `/t/${tenant.slug}/dashboard`,
        icon: Building2,
    }));

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
            </SidebarHeader>

            <SidebarContent>
                <NavMain
                    items={mainNavItems}
                    label={currentTenant ? currentTenant.name : 'Platform'}
                />
                {tenantNavItems.length > 0 && (
                    <NavMain items={tenantNavItems} label="Switch tenant" />
                )}
                {currentTenant && auth.user.is_super_admin && (
                    <NavMain
                        items={[
                            {
                                title: 'Back to Platform',
                                href: '/platform',
                                icon: LayoutGrid,
                            },
                        ]}
                        label="Administration"
                    />
                )}
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}

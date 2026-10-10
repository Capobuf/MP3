import { usePage } from '@inertiajs/react';
import { ChevronsUpDown } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { UserInfo } from '@/components/user-info';
import { UserMenuContent } from '@/components/user-menu-content';

export function NavUser() {
    const { auth } = usePage().props;
    const { state, isMobile } = useSidebar();

    if (!auth.user) {
        return null;
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="h-14 rounded-xl border border-sidebar-border p-2 text-sidebar-accent-foreground group-data-[collapsible=icon]:border-0 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent"
                            aria-label={`Apri menu utente: ${auth.user.name}`}
                            data-test="sidebar-menu-button"
                        >
                            <UserInfo user={auth.user} showEmail={true} />
                            <ChevronsUpDown
                                className="ml-auto size-4 group-data-[collapsible=icon]:hidden"
                                aria-hidden="true"
                            />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) max-w-[calc(100vw-2rem)] min-w-56 rounded-xl"
                        align="end"
                        side={
                            !isMobile && state === 'collapsed' ? 'right' : 'top'
                        }
                    >
                        <UserMenuContent user={auth.user} />
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

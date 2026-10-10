import { usePage } from '@inertiajs/react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { QuickNavigation } from '@/components/quick-navigation';
import { QuickCreate } from '@/components/quick-create';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserInfo } from '@/components/user-info';
import { UserMenuContent } from '@/components/user-menu-content';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';

export function AppSidebarHeader({
    breadcrumbs = [],
}: {
    breadcrumbs?: BreadcrumbItemType[];
}) {
    const { auth, currentTenant } = usePage().props;

    return (
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-card px-4 md:px-6 2xl:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <SidebarTrigger className="-ml-1 shrink-0" />
                <div className="hidden min-w-0 overflow-hidden md:block [&_[aria-current=page]]:truncate [&_a]:truncate [&_li]:min-w-0 [&_ol]:flex-nowrap">
                    <Breadcrumbs breadcrumbs={breadcrumbs} />
                </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
                <QuickNavigation />
                <QuickCreate key={currentTenant?.id ?? 'platform'} />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-10 w-10 rounded-lg p-1 xl:w-56 xl:gap-2 xl:px-2 [&>div]:hidden xl:[&>div]:grid"
                            aria-label={`Apri menu utente: ${auth.user.name}`}
                        >
                            <UserInfo user={auth.user} showEmail={true} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-56 max-w-[calc(100vw-2rem)] rounded-xl"
                        align="end"
                        side="bottom"
                    >
                        <UserMenuContent user={auth.user} />
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}

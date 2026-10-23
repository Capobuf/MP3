import { usePage } from '@inertiajs/react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { QuickNavigation } from '@/components/quick-navigation';
import { QuickCreate } from '@/components/quick-create';
import { EconomicYearSwitcher } from '@/components/economic-year-switcher';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UndoControls } from '@/components/undo-controls';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';

export function AppSidebarHeader({
    breadcrumbs = [],
}: {
    breadcrumbs?: BreadcrumbItemType[];
}) {
    const { currentTenant } = usePage().props;

    return (
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-card px-3 sm:px-4 md:px-6 2xl:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <SidebarTrigger
                    variant="outline"
                    className="-ml-1 size-9 shrink-0"
                    title="Riduci o espandi il menu"
                    aria-label="Riduci o espandi il menu"
                />
                <div className="hidden min-w-0 overflow-hidden md:block [&_[aria-current=page]]:truncate [&_a]:truncate [&_li]:min-w-0 [&_ol]:flex-nowrap">
                    <Breadcrumbs breadcrumbs={breadcrumbs} />
                </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
                <UndoControls />
                <QuickNavigation />
                <QuickCreate key={currentTenant?.id ?? 'platform'} />
                <EconomicYearSwitcher key={currentTenant?.id ?? 'platform'} />
            </div>
        </header>
    );
}

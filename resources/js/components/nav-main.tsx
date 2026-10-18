import { Link } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuAction,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarSeparator,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';

export function NavMain({
    items,
    label,
}: {
    items: NavItem[];
    label?: string;
}) {
    const { currentUrl, isCurrentOrParentUrl } = useCurrentUrl();
    const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
    const activeGroup = items.find(
        (item) =>
            item.items &&
            (isCurrentOrParentUrl(item.href) ||
                item.items.some((child) => isCurrentOrParentUrl(child.href))),
    )?.title;

    useEffect(() => {
        setOpenItems((current) =>
            Object.fromEntries(
                Object.entries(current).filter(
                    ([title]) => title === activeGroup,
                ),
            ),
        );
    }, [currentUrl, activeGroup]);

    return (
        <SidebarGroup className="px-2 py-0">
            {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
            <SidebarMenu>
                {items.map((item) => {
                    const isActive = isCurrentOrParentUrl(item.href);
                    return (
                        <Collapsible
                            key={item.title}
                            asChild
                            open={openItems[item.title] ?? false}
                            onOpenChange={(open) =>
                                setOpenItems((current) => ({
                                    ...current,
                                    [item.title]: open,
                                }))
                            }
                        >
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    asChild
                                    className="data-[active=true]:text-sidebar-primary data-[active=true]:shadow-xs"
                                    isActive={
                                        isActive ||
                                        item.items?.some((child) =>
                                            isCurrentOrParentUrl(child.href),
                                        )
                                    }
                                    tooltip={{ children: item.title }}
                                >
                                    <Link
                                        href={item.href}
                                        aria-current={
                                            isActive ? 'page' : undefined
                                        }
                                        onClick={() => {
                                            if (item.items)
                                                setOpenItems((current) => ({
                                                    ...current,
                                                    [item.title]: true,
                                                }));
                                        }}
                                        prefetch
                                    >
                                        {item.icon && <item.icon />}
                                        <span>{item.title}</span>
                                    </Link>
                                </SidebarMenuButton>
                                {item.items && (
                                    <>
                                        <CollapsibleTrigger asChild>
                                            <SidebarMenuAction
                                                aria-label={`${openItems[item.title] ? 'Chiudi' : 'Apri'} sottomenu ${item.title}`}
                                                className="data-[state=open]:rotate-90"
                                            >
                                                <ChevronRight aria-hidden="true" />
                                            </SidebarMenuAction>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                            <SidebarMenuSub>
                                                {item.items.map((child) => {
                                                    const isChildActive =
                                                        isCurrentOrParentUrl(
                                                            child.href,
                                                        );
                                                    return (
                                                        <SidebarMenuSubItem
                                                            key={child.title}
                                                        >
                                                            <SidebarMenuSubButton
                                                                asChild
                                                                isActive={
                                                                    isChildActive
                                                                }
                                                            >
                                                                <Link
                                                                    href={
                                                                        child.href
                                                                    }
                                                                    aria-current={
                                                                        isChildActive
                                                                            ? 'page'
                                                                            : undefined
                                                                    }
                                                                    prefetch
                                                                >
                                                                    {child.icon && (
                                                                        <child.icon />
                                                                    )}
                                                                    <span>
                                                                        {
                                                                            child.title
                                                                        }
                                                                    </span>
                                                                </Link>
                                                            </SidebarMenuSubButton>
                                                        </SidebarMenuSubItem>
                                                    );
                                                })}
                                            </SidebarMenuSub>
                                        </CollapsibleContent>
                                    </>
                                )}
                                {item.separatorAfter && (
                                    <SidebarSeparator className="mx-0 my-2" />
                                )}
                            </SidebarMenuItem>
                        </Collapsible>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}

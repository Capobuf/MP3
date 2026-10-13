import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
    return (
        <nav
            role="navigation"
            aria-label="Paginazione"
            className={cn('mx-auto flex w-full justify-center', className)}
            {...props}
        />
    );
}
function PaginationContent({
    className,
    ...props
}: React.ComponentProps<'ul'>) {
    return (
        <ul
            className={cn(
                'flex flex-wrap items-center justify-center gap-1',
                className,
            )}
            {...props}
        />
    );
}
function PaginationItem(props: React.ComponentProps<'li'>) {
    return <li {...props} />;
}
function PaginationLink({
    className,
    isActive,
    size = 'icon',
    asChild = false,
    ...props
}: React.ComponentProps<'a'> & {
    isActive?: boolean;
    size?: VariantProps<typeof buttonVariants>['size'];
    asChild?: boolean;
}) {
    const Comp = asChild ? Slot : 'a';
    return (
        <Comp
            aria-current={isActive ? 'page' : undefined}
            className={cn(
                buttonVariants({
                    variant: isActive ? 'outline' : 'ghost',
                    size,
                }),
                className,
            )}
            {...props}
        />
    );
}
function PaginationPrevious({
    className,
    children,
    ...props
}: React.ComponentProps<typeof PaginationLink>) {
    return (
        <PaginationLink
            aria-label="Pagina precedente"
            size="default"
            className={cn('gap-1 px-2.5', className)}
            {...props}
        >
            {children ?? (
                <>
                    <ChevronLeft />
                    <span className="hidden sm:block">Precedente</span>
                </>
            )}
        </PaginationLink>
    );
}
function PaginationNext({
    className,
    children,
    ...props
}: React.ComponentProps<typeof PaginationLink>) {
    return (
        <PaginationLink
            aria-label="Pagina successiva"
            size="default"
            className={cn('gap-1 px-2.5', className)}
            {...props}
        >
            {children ?? (
                <>
                    <span className="hidden sm:block">Successiva</span>
                    <ChevronRight />
                </>
            )}
        </PaginationLink>
    );
}
function PaginationEllipsis({
    className,
    ...props
}: React.ComponentProps<'span'>) {
    return (
        <span
            className={cn('flex size-9 items-center justify-center', className)}
            {...props}
        >
            <MoreHorizontal aria-hidden="true" />
            <span className="sr-only">Altre pagine</span>
        </span>
    );
}
export {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationPrevious,
    PaginationNext,
    PaginationEllipsis,
};

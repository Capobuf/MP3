import { Link } from '@inertiajs/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
    Pagination as PaginationNav,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationPrevious,
    PaginationNext,
    PaginationEllipsis,
} from '@/components/ui/pagination';
import type { Pagination as Page } from './types';

export function Pagination({ page }: { page: Omit<Page<unknown>, 'data'> }) {
    if (page.total === 0) return null;
    return (
        <div className="flex flex-col items-center gap-2 py-3 text-sm">
            <span className="text-muted-foreground">
                {page.from ?? 0}–{page.to ?? 0} di {page.total}
            </span>
            {page.last_page > 1 && (
                <PaginationNav>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious asChild>
                                {page.prev_page_url ? (
                                    <Link
                                        preserveScroll
                                        preserveState
                                        href={page.prev_page_url}
                                    >
                                        <ChevronLeft />
                                        <span className="hidden sm:inline">
                                            Precedente
                                        </span>
                                    </Link>
                                ) : (
                                    <span
                                        aria-disabled="true"
                                        className="opacity-50"
                                    >
                                        <ChevronLeft />
                                        <span className="hidden sm:inline">
                                            Precedente
                                        </span>
                                    </span>
                                )}
                            </PaginationPrevious>
                        </PaginationItem>
                        {page.links.slice(1, -1).map((link, index) => (
                            <PaginationItem key={`${link.label}:${index}`}>
                                {/^[0-9]+$/.test(link.label) ? (
                                    <PaginationLink
                                        asChild
                                        isActive={link.active}
                                    >
                                        {link.url ? (
                                            <Link
                                                preserveScroll
                                                preserveState
                                                href={link.url}
                                                aria-label={`Pagina ${link.label}`}
                                            >
                                                {link.label}
                                            </Link>
                                        ) : (
                                            <span aria-disabled="true">
                                                {link.label}
                                            </span>
                                        )}
                                    </PaginationLink>
                                ) : (
                                    <PaginationEllipsis />
                                )}
                            </PaginationItem>
                        ))}
                        <PaginationItem>
                            <PaginationNext asChild>
                                {page.next_page_url ? (
                                    <Link
                                        preserveScroll
                                        preserveState
                                        href={page.next_page_url}
                                    >
                                        <span className="hidden sm:inline">
                                            Successiva
                                        </span>
                                        <ChevronRight />
                                    </Link>
                                ) : (
                                    <span
                                        aria-disabled="true"
                                        className="opacity-50"
                                    >
                                        <span className="hidden sm:inline">
                                            Successiva
                                        </span>
                                        <ChevronRight />
                                    </span>
                                )}
                            </PaginationNext>
                        </PaginationItem>
                    </PaginationContent>
                </PaginationNav>
            )}
        </div>
    );
}

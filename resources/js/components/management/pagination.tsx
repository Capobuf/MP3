import { Link } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import type { Pagination as Page } from './types';

export function Pagination({ page }: { page: Omit<Page<unknown>, 'data'> }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-muted-foreground">
            <span>
                {page.from ?? 0}–{page.to ?? 0} di {page.total} · pagina{' '}
                {page.current_page} di {page.last_page}
            </span>
            <div className="flex gap-2">
                {page.prev_page_url ? (
                    <Button variant="outline" size="sm" asChild>
                        <Link preserveScroll href={page.prev_page_url}>
                            Precedente
                        </Link>
                    </Button>
                ) : (
                    <Button disabled variant="outline" size="sm">
                        Precedente
                    </Button>
                )}
                {page.next_page_url ? (
                    <Button variant="outline" size="sm" asChild>
                        <Link preserveScroll href={page.next_page_url}>
                            Successiva
                        </Link>
                    </Button>
                ) : (
                    <Button disabled variant="outline" size="sm">
                        Successiva
                    </Button>
                )}
            </div>
        </div>
    );
}

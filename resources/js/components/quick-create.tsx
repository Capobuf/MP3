import { router, usePage } from '@inertiajs/react';
import {
    ChevronDown,
    FileText,
    FolderKanban,
    Handshake,
    Plus,
    Receipt,
    Tags,
} from 'lucide-react';
import { useState } from 'react';
import type { Expense, Filters, Kind } from '@/components/management/types';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';

type CreationKind = Kind | 'cost-centers';
const items = [
    { kind: 'expenses', label: 'Spesa', icon: Receipt },
    { kind: 'contracts', label: 'Contratto', icon: FileText },
    { kind: 'projects', label: 'Progetto', icon: FolderKanban },
    { kind: 'cost-centers', label: 'Centro di Costo', icon: Tags },
    { kind: 'vendors', label: 'Fornitore', icon: Handshake },
] as const;

export function QuickCreate() {
    const {
        currentTenant: tenant,
        filters,
        expense,
        year: pageYear,
    } = usePage<{
        filters?: Filters;
        expense?: Expense;
        year?: number | null;
    }>().props;
    const [loading, setLoading] = useState(false);
    const year =
        filters?.year ?? expense?.year ?? pageYear ?? new Date().getFullYear();

    function create(kind: CreationKind) {
        if (!tenant || loading) return;
        router.visit(`/t/${tenant.slug}/${kind}/create?year=${year}`, {
            onStart: () => setLoading(true),
            onFinish: () => setLoading(false),
        });
    }

    if (!tenant) return null;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        disabled={loading}
                        aria-label="Nuovo"
                        aria-busy={loading}
                    >
                        {loading ? (
                            <Spinner data-icon="inline-start" />
                        ) : (
                            <Plus data-icon="inline-start" />
                        )}
                        Nuovo
                        <ChevronDown data-icon="inline-end" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuGroup>
                        {items.map((item) => (
                            <DropdownMenuItem
                                key={item.kind}
                                onSelect={() => create(item.kind)}
                            >
                                <item.icon aria-hidden="true" />
                                {item.label}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}

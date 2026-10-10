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
import { lazy, Suspense, useState } from 'react';
import { toast } from 'sonner';
import { api, matchesExpenseFilters } from '@/components/management/helpers';
import type {
    Expense,
    Filters,
    Kind,
    Options,
    RecordData,
} from '@/components/management/types';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';

const EntitySheet = lazy(() =>
    import('@/components/management/entity-sheet').then((module) => ({
        default: module.EntitySheet,
    })),
);
const CostCenterSheet = lazy(() =>
    import('@/components/management/cost-center-sheet').then((module) => ({
        default: module.CostCenterSheet,
    })),
);

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
    const [sheet, setSheet] = useState<{
        kind: CreationKind;
        options: Options;
    } | null>(null);
    const year =
        filters?.year ?? expense?.year ?? pageYear ?? new Date().getFullYear();

    async function create(kind: CreationKind) {
        if (!tenant || loading) return;
        setLoading(true);
        try {
            const { options } = await api<{ options: Options }>(
                `/t/${tenant.slug}/creation-options`,
            );
            setSheet({ kind, options });
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Impossibile aprire il modulo. Riprova.',
            );
        } finally {
            setLoading(false);
        }
    }

    function saved(record: RecordData) {
        if (
            sheet?.kind === 'expenses' &&
            filters?.year !== undefined &&
            !matchesExpenseFilters(record, filters)
        ) {
            toast.info(
                'Spesa salvata. Non compare nella lista perché non corrisponde ai filtri correnti.',
            );
        }
        setSheet(null);
        router.reload();
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
                                onSelect={() => void create(item.kind)}
                            >
                                <item.icon aria-hidden="true" />
                                {item.label}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            <Suspense fallback={<Spinner aria-label="Caricamento modulo" />}>
                {sheet?.kind === 'cost-centers' ? (
                    <CostCenterSheet
                        tenant={tenant}
                        parents={sheet.options.cost_centers.filter(
                            (center) => center.parent_id === null,
                        )}
                        onClose={() => setSheet(null)}
                        onSaved={() => {
                            setSheet(null);
                            router.reload();
                        }}
                    />
                ) : sheet ? (
                    <EntitySheet
                        tenant={tenant}
                        kind={sheet.kind}
                        year={year}
                        options={sheet.options}
                        onClose={() => setSheet(null)}
                        onSaved={saved}
                    />
                ) : null}
            </Suspense>
        </>
    );
}

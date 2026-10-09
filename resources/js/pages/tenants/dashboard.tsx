import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { EntitySheet } from '@/components/management/entity-sheet';
import { matchesExpenseFilters } from '@/components/management/helpers';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EconomicChart } from '@/components/management/economic-chart';
import type { ChartRow } from '@/components/management/economic-chart';
import {
    applyFilters,
    ExpenseWorkspace,
} from '@/components/management/expense-workspace';
import { Summary } from '@/components/management/summary';
import type { ExpensePageProps } from '@/components/management/types';

export default function TenantDashboard(
    props: ExpensePageProps & {
        vendorChart: ChartRow[];
        projectChart: ChartRow[];
        expiringContracts: number;
    },
) {
    const { tenant, filters, totals, expiringContracts } = props;
    const [creating, setCreating] = useState(false);
    const [gridBusy, setGridBusy] = useState(false);
    return (
        <>
            <Head title={`Panoramica · ${tenant.name}`} />
            <div className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">
                            {tenant.name} · {filters.year}
                        </p>
                        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                            Panoramica
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Le tue spese, gli accordi e i progetti in un unico
                            spazio.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={String(filters.year)}
                            disabled={gridBusy}
                            onValueChange={(year) =>
                                applyFilters(`/t/${tenant.slug}/dashboard`, {
                                    ...filters,
                                    year: Number(year),
                                })
                            }
                        >
                            <SelectTrigger
                                className="w-28"
                                aria-label="Anno panoramica"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {props.years.map((year) => (
                                    <SelectItem key={year} value={String(year)}>
                                        {year}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            disabled={gridBusy}
                            onClick={() => setCreating(true)}
                        >
                            <Plus className="mr-2 size-4" />
                            Nuova spesa
                        </Button>
                        <Button variant="outline" disabled={gridBusy} asChild>
                            <Link
                                href={`/t/${tenant.slug}/contracts?expiring=1`}
                            >
                                <Badge variant="secondary" className="mr-2">
                                    {expiringContracts}
                                </Badge>
                                Contratti in scadenza entro 90 giorni
                            </Link>
                        </Button>
                    </div>
                </header>
                <Summary totals={totals} />
                <div className="grid gap-4 xl:grid-cols-2">
                    <EconomicChart
                        title="Allocato ed effettivo per fornitore"
                        rows={props.vendorChart}
                        onSelect={(id) =>
                            applyFilters(`/t/${tenant.slug}/dashboard`, {
                                ...filters,
                                vendor_id: String(id),
                            })
                        }
                    />
                    <EconomicChart
                        title="Spese per progetto"
                        rows={props.projectChart}
                        onSelect={(id) =>
                            applyFilters(`/t/${tenant.slug}/dashboard`, {
                                ...filters,
                                project_id: String(id),
                            })
                        }
                    />
                </div>
                <ExpenseWorkspace
                    key={JSON.stringify(filters)}
                    {...props}
                    dashboard
                    onCreate={() => setCreating(true)}
                    onBusyChange={setGridBusy}
                />
            </div>
            {creating && (
                <EntitySheet
                    tenant={tenant}
                    kind="expenses"
                    year={filters.year}
                    options={props.options}
                    onClose={() => setCreating(false)}
                    onSaved={(record) => {
                        setCreating(false);
                        if (!matchesExpenseFilters(record, filters))
                            toast.info(
                                'Spesa salvata. Non compare perché non corrisponde ai filtri correnti.',
                            );
                        router.reload();
                    }}
                />
            )}
        </>
    );
}
TenantDashboard.layout = {
    breadcrumbs: [{ title: 'Panoramica', href: '/dashboard' }],
};

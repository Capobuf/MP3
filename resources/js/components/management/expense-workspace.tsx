import { usePageRefresh } from '@/hooks/use-page-refresh';
import { router } from '@inertiajs/react';
import { useState } from 'react';
import { DashboardFilters, applyFilters } from './dashboard-filters';
import { ExpenseTable } from './expense-table';
import { Pagination } from './pagination';
import type { ExpensePageProps } from './types';

export { applyFilters } from './dashboard-filters';

export function ExpenseWorkspace({
    tenant,
    expenses,
    filters,
    years,
    options,
    dashboard = false,
    showFilters = true,
    onBusyChange,
}: ExpensePageProps & {
    dashboard?: boolean;
    showFilters?: boolean;
    onBusyChange?: (busy: boolean) => void;
}) {
    const [busy, setBusy] = useState(false);
    const path = `/t/${tenant.slug}/${dashboard ? 'dashboard' : 'expenses'}`;
    const year = filters.year;
    const refresh = usePageRefresh(path);
    return (
        <section
            aria-busy={busy || refresh.pending}
            aria-label="Gestione spese"
            className="flex min-w-0 flex-col gap-4"
        >
            {dashboard && (
                <h2 className="text-lg font-semibold">
                    Dettaglio delle spese · {year}
                </h2>
            )}
            {showFilters && (
                <DashboardFilters
                    tenant={tenant}
                    expenses={expenses}
                    filters={filters}
                    years={years}
                    options={options}
                    path={path}
                    busy={busy}
                    onCreate={
                        dashboard
                            ? undefined
                            : () =>
                                  router.visit(
                                      `/t/${tenant.slug}/expenses/create${year ? `?year=${year}` : ''}`,
                                  )
                    }
                />
            )}
            <ExpenseTable
                loading={refresh.visible}
                rows={expenses.data}
                slug={tenant.slug}
                filters={filters}
                onSort={(sort) =>
                    applyFilters(path, {
                        ...filters,
                        sort,
                        direction:
                            filters.sort === sort && filters.direction === 'asc'
                                ? 'desc'
                                : 'asc',
                    })
                }
                onEdit={(record) =>
                    router.visit(`/t/${tenant.slug}/expenses/${record.id}/edit`)
                }
                onBusyChange={(value) => {
                    setBusy(value);
                    onBusyChange?.(value);
                }}
            />
            <div
                onClickCapture={(event) => {
                    if (busy) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
            >
                <Pagination page={expenses} />
            </div>
        </section>
    );
}

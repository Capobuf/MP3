import { router } from '@inertiajs/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DashboardFilters, applyFilters } from './dashboard-filters';
import { EntitySheet } from './entity-sheet';
import { ExpenseTable } from './expense-table';
import { matchesExpenseFilters } from './helpers';
import { Pagination } from './pagination';
import type { Expense, ExpensePageProps, RecordData } from './types';

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
    const [sheet, setSheet] = useState<{ record?: Expense } | null>(null);
    const [busy, setBusy] = useState(false);
    const path = `/t/${tenant.slug}/${dashboard ? 'dashboard' : 'expenses'}`;
    const year = filters.year;
    function saved(record: RecordData) {
        setSheet(null);
        if (!matchesExpenseFilters(record, filters)) {
            toast.info(
                'Spesa salvata. Non compare nella lista perché non corrisponde ai filtri correnti.',
            );
        }
        router.reload();
    }

    return (
        <section aria-label="Gestione spese" className="min-w-0 space-y-4">
            {dashboard && (
                <h2 className="text-base font-semibold">Spese · {year}</h2>
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
                    onCreate={dashboard ? undefined : () => setSheet({})}
                />
            )}
            <ExpenseTable
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
                onEdit={(record) => setSheet({ record })}
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
            {sheet && (
                <EntitySheet
                    tenant={tenant}
                    kind="expenses"
                    record={sheet.record}
                    year={year}
                    options={options}
                    onClose={() => setSheet(null)}
                    onSaved={saved}
                />
            )}
        </section>
    );
}

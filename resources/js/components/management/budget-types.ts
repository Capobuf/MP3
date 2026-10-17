import { cents, decimal } from './analytics-helpers';
import type { SummaryAnalytics } from './dashboard-summary';
import type { Expense, Option, Options } from './types';
import type { Tenant } from '@/types';

export type BudgetType = 'contract' | 'project' | 'expense';
export const budgetLabels: Record<BudgetType, string> = {
    contract: 'Contratti',
    project: 'Progetti',
    expense: 'Spese singole',
};
export const budgetTypes = Object.keys(budgetLabels) as BudgetType[];
export type BudgetTotals = {
    allocated: string | null;
    actual: string | null;
    variance: string | null;
    count: number;
    incomplete: number;
    comparable_count: number;
    allocated_positive: string;
    allocated_negative: string;
    actual_positive: string;
    actual_negative: string;
};
export type BudgetEntry = Omit<
    BudgetTotals,
    'allocated' | 'actual' | 'variance' | 'count'
> & {
    id: number;
    type: BudgetType;
    source_id: number | null;
    description: string;
    included: boolean;
    position: number;
    allocated: string | null;
    actual: string | null;
    variance: string | null;
    cost_center_id: number | null;
    cost_center: Option | null;
    vendor: Option | null;
    notes: string | null;
    starts_on: string | null;
    ends_on: string | null;
    expenses: (Expense & { contributes: boolean; counted_in: string | null })[];
};
export type BudgetSnapshot = {
    entries: BudgetEntry[];
    totals: BudgetTotals;
    groups: Record<BudgetType, BudgetTotals>;
    cost_center_groups: Record<string, BudgetTotals>;
    vendor_groups: Record<string, BudgetTotals>;
    owners: Record<string, number>;
    has_missing_entries: boolean;
};
export type BudgetYear = {
    id: number;
    year: number;
    structure_copied?: boolean;
};
export type BudgetProps = {
    logoUrl: string | null;
    tenant: Tenant;
    selectedYear: number;
    budgetYear: BudgetYear | null;
    budget: BudgetSnapshot | null;
    options: Options;
    previousBudget: { year: number; totals: BudgetTotals } | null;
};
export type BudgetSuggestion = {
    key: string;
    type: BudgetType;
    source_id: number;
    entry_id: number | null;
    description: string;
    state: 'missing' | 'excluded' | 'removed';
    allocated: string | null;
    actual: string | null;
    expense_ids: number[];
};
export type BudgetChanges = {
    cost_center_id?: number | null;
};
export type BudgetMutate = (
    suffix: string,
    method: string,
    payload?: unknown,
) => Promise<boolean>;

export function budgetSummary(
    totals: BudgetTotals,
    previousBudget: BudgetProps['previousBudget'],
): SummaryAnalytics {
    const values = (totals: BudgetTotals) => ({
        ...totals,
        complete_percentage:
            totals.count > 0
                ? ((totals.count - totals.incomplete) * 100) / totals.count
                : null,
    });
    const current = values(totals);
    const previous = previousBudget
        ? { ...values(previousBudget.totals), year: previousBudget.year }
        : null;
    const compare = (metric: 'allocated' | 'actual' | 'variance') => {
        const beforeValue = previous?.[metric];
        const currentValue = current[metric];
        const before = beforeValue != null ? cents(beforeValue) : null;
        const difference =
            before !== null && currentValue !== null
                ? cents(currentValue) - before
                : null;
        return {
            difference: difference !== null ? decimal(difference) : null,
            percentage:
                metric !== 'variance' &&
                difference !== null &&
                before !== null &&
                before > 0
                    ? (difference * 100) / before
                    : null,
        };
    };
    return {
        current,
        previous,
        comparisons: {
            allocated: compare('allocated'),
            actual: compare('actual'),
            variance: compare('variance'),
            completeness: {
                points:
                    previous?.complete_percentage != null &&
                    current.complete_percentage !== null
                        ? current.complete_percentage -
                          previous.complete_percentage
                        : null,
            },
        },
    };
}

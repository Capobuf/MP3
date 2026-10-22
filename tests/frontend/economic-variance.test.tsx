import { describe, expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    ExpenseLines,
    draftLines,
} from '../../resources/js/components/management/expense-lines';
import {
    sumGroups,
    topGroups,
} from '../../resources/js/components/management/analytics-helpers';
import {
    money,
    varianceTextClass,
    decimalInput,
} from '../../resources/js/components/management/helpers';
import { budgetSummary } from '../../resources/js/components/management/budget-types';
import { DashboardSummary } from '../../resources/js/components/management/dashboard-summary';
import type { EconomicValues } from '../../resources/js/components/management/analytics-types';

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: { economicContext: { year: 2026 } } }),
}));
const empty: EconomicValues = {
    allocated: null,
    actual: null,
    variance: '0.00',
    count: 0,
    incomplete: 0,
    allocated_positive: '0.00',
    allocated_negative: '0.00',
    actual_positive: '0.00',
    actual_negative: '0.00',
};
const cases = [
    ['100.00', '80.00', -20],
    ['80.00', '100.00', 20],
    ['100.00', '100.00', 0],
    ['100.00', null, -100],
    [null, '80.00', 80],
    [null, null, 0],
    ['100.00', '0.00', -100],
    ['-20.00', '-15.00', 5],
    ['100.01', '80.02', -19.99],
] as const;

describe('Economic variance', () => {
    it.each(cases)(
        'previews %s / %s with signed cents and incomplete data',
        (allocated, actual, variance) => {
            const html = renderToStaticMarkup(
                <ExpenseLines
                    lines={draftLines({
                        id: 1,
                        allocated_amount: allocated,
                        actual_amount: actual,
                    })}
                    readOnly
                />,
            );
            const summary = html.slice(html.indexOf('Scostamento ('));
            expect(summary).toContain(money(variance));
            expect(summary).toContain(varianceTextClass(variance));
            expect(summary.includes('Dati incompleti')).toBe(
                allocated === null || actual === null,
            );
            expect(money(variance)).not.toContain('+');
            if (variance === 0) expect(money(variance)).not.toContain('-');
            if (variance < 0)
                expect(varianceTextClass(variance)).toBe('text-finance-saving');
            if (variance > 0)
                expect(varianceTextClass(variance)).toBe(
                    'text-finance-overrun',
                );
        },
    );
    it.each(['invalid', '1.001', '1,2.3', ''])(
        'keeps invalid draft price %s unavailable',
        (price) => {
            const lines = draftLines({
                id: 1,
                allocated_amount: '100.00',
                actual_amount: price,
            });
            const html = renderToStaticMarkup(
                <ExpenseLines lines={lines} readOnly />,
            );
            const summary = html.slice(html.indexOf('Scostamento ('));
            expect(summary).toContain('Da completare');
            expect(summary).not.toContain('-100,00');
        },
    );
    it('aggregates Other from independent sums and retains missing and zero counts', () => {
        const rows = [
            {
                ...empty,
                id: 1,
                name: 'Kept',
                allocated: '200.00',
                actual: '200.00',
                count: 1,
            },
            {
                ...empty,
                id: 2,
                name: 'Forecast',
                allocated: '100.01',
                variance: null,
                count: 1,
                incomplete: 1,
            },
            {
                ...empty,
                id: 3,
                name: 'Purchase',
                actual: '80.02',
                variance: null,
                count: 1,
                incomplete: 1,
            },
        ];
        expect(topGroups(rows, 1, 'actual')[1]).toMatchObject({
            id: 'others',
            allocated: '100.01',
            actual: '80.02',
            variance: '-19.99',
            count: 2,
            incomplete: 2,
        });
        expect(sumGroups([])).toEqual(empty);
        expect(
            sumGroups([
                { ...empty, allocated: '0.00', count: 1, incomplete: 1 },
            ]),
        ).toMatchObject({
            actual: null,
            allocated: '0.00',
            variance: '0.00',
            count: 1,
            incomplete: 1,
        });
    });
    it('keeps temporal deltas distinct from savings and missing previous years', () => {
        const totals = {
            ...empty,
            allocated: '100.00',
            actual: '80.00',
            variance: '-20.00',
            count: 2,
            incomplete: 2,
            comparable_count: 0,
        };
        expect(
            budgetSummary(totals, null).comparisons.variance.difference,
        ).toBeNull();
        const analytics = budgetSummary(totals, {
            year: 2025,
            totals: { ...totals, variance: '-50.00' },
        });
        expect(analytics.comparisons.variance).toEqual({
            difference: '30.00',
            percentage: null,
        });
        expect(
            budgetSummary(totals, {
                year: 2025,
                totals: { ...totals, variance: '0.00' },
            }).comparisons.variance.difference,
        ).toBe('-20.00');
        const html = renderToStaticMarkup(
            <DashboardSummary analytics={analytics} year={2026} />,
        );
        expect(html).toContain('In aumento: 30,00');
        expect(html).toContain('Dati incompleti: scostamento provvisorio.');
        expect(html).not.toContain('+30,00');
        expect(decimalInput('-1.234,56')).toBe('-1234.56');
        expect(money('-1234.56')).toContain('-1.234,56');
    });
});

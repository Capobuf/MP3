import { describe, expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { useState } from 'react';
import { ExpenseLinesCard } from '../../resources/js/components/management/expense-lines-card';
import type { DraftLine } from '../../resources/js/components/management/expense-lines';
import type { Expense } from '../../resources/js/components/management/types';
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

vi.mock('react', async (importOriginal) => {
    const react = await importOriginal<typeof import('react')>();
    return { ...react, useState: vi.fn(react.useState) };
});

function editorSummary(expense: Expense, draft = draftLines(expense)) {
    // SSR cannot click Manage lines: enter the card's editing state directly.
    vi.mocked(useState).mockImplementationOnce(() => [draft, vi.fn()]);
    const html = renderToStaticMarkup(
        <ExpenseLinesCard
            expense={expense}
            url="/expenses/1"
            onEditingChange={() => {}}
        />,
    );
    return html.slice(html.indexOf('<dl'));
}

function summaryField(html: string, label: string) {
    const summary = html.match(/<dl\b[^>]*>(.*?)<\/dl>/s)![1];
    const fields = [
        ...summary.matchAll(
            /<dt\b[^>]*>(.*?)<\/dt>\s*(<dd\b[^>]*>.*?<\/dd>)/gs,
        ),
    ];
    const field = fields.find((match) =>
        match[1].replace(/<[^>]*>/g, '').includes(label),
    );
    expect(field, `Summary field: ${label}`).toBeDefined();
    return {
        markup: field![2],
        text: field![2].replace(/<[^>]*>/g, '').trim(),
    };
}

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: { economicContext: { year: 2026 } } }),
}));
const empty: EconomicValues = {
    allocated: null,
    actual: null,
    variance: '0.00',
    count: 0,
    estimated_count: 0,
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
        'previews %s / %s with signed cents and optional amounts',
        (allocated, actual, variance) => {
            const expense: Expense = {
                id: 1,
                title: 'Importata',
                year: 2026,
                allocated_amount: allocated,
                actual_amount: actual,
                lines: [],
            };
            expect(draftLines(expense)).toEqual([]);
            const editor = editorSummary(expense);
            expect(summaryField(editor, 'Allocato').text).toBe(
                allocated === null ? 'Da completare' : money(allocated),
            );
            expect(summaryField(editor, 'Effettivo').text).toBe(
                actual === null ? 'Da completare' : money(actual),
            );
            expect(summaryField(editor, 'Scostamento').text).toBe(
                money(variance),
            );
            expect(editor).not.toContain('+');
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
            const summary = summaryField(html, 'Scostamento');
            expect(summary.text).toBe(money(variance));
            expect(summary.markup).toContain(varianceTextClass(variance));
            expect(html).not.toContain('scostamento provvisorio');
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
            const html = editorSummary(
                {
                    id: 1,
                    title: 'Importata',
                    year: 2026,
                    allocated_amount: '100.00',
                    actual_amount: '80.00',
                    lines: [],
                },
                lines,
            );
            const summary = summaryField(html, 'Scostamento');
            expect(summary.text).toBe('Da completare');
            expect(summary.text).not.toContain('-100,00');
        },
    );
    it('uses draft amounts and only restores direct amounts for originally empty lines', () => {
        const expense: Expense = {
            id: 1,
            title: 'Importata',
            year: 2026,
            allocated_amount: '100.00',
            actual_amount: '80.00',
            lines: [],
        };
        const draft: DraftLine[] = [
            {
                key: 'new',
                description: 'Nuova',
                type: 'actual',
                quantity: '1',
                unit_price: '0',
            },
        ];
        expect(editorSummary(expense, draft)).toContain(money(0));
        expect(editorSummary(expense, draft)).not.toContain(money(80));
        expect(editorSummary(expense, [])).toContain(money(-20));
        const deleted = editorSummary({ ...expense, lines: draft }, []);
        expect(deleted).toContain('Da completare');
        expect(summaryField(deleted, 'Scostamento').text).toBe(money(0));
        expect(deleted).not.toContain(money(80));
        expect(deleted).not.toContain(money(100));
    });
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
                estimated_count: 1,
            },
            {
                ...empty,
                id: 3,
                name: 'Purchase',
                actual: '80.02',
                variance: null,
                count: 1,
                estimated_count: 0,
            },
        ];
        expect(topGroups(rows, 1, 'actual')[1]).toMatchObject({
            id: 'others',
            allocated: '100.01',
            actual: '80.02',
            variance: '-19.99',
            count: 2,
            estimated_count: 1,
        });
        expect(sumGroups([])).toEqual(empty);
        expect(
            sumGroups([
                { ...empty, allocated: '0.00', count: 1, estimated_count: 1 },
            ]),
        ).toMatchObject({
            actual: null,
            allocated: '0.00',
            variance: '0.00',
            count: 1,
            estimated_count: 1,
        });
    });
    it('keeps temporal deltas distinct from savings and missing previous years', () => {
        const totals = {
            ...empty,
            allocated: '100.00',
            actual: '80.00',
            variance: '-20.00',
            count: 2,
            estimated_count: 1,
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
        expect(analytics.current.estimated_percentage).toBe(50);
        expect(analytics.comparisons.estimates.points).toBe(0);
        expect(
            budgetSummary({ ...totals, count: 0, estimated_count: 0 }, null)
                .current.estimated_percentage,
        ).toBeNull();
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
        expect(html).toContain('Voci solo stimate');
        expect(html).not.toContain('Completezza');
        expect(html).not.toContain('Dati incompleti: scostamento provvisorio.');
        expect(html).not.toContain('+30,00');
        expect(decimalInput('-1.234,56')).toBe('-1234.56');
        expect(money('-1234.56')).toContain('-1.234,56');
    });
});

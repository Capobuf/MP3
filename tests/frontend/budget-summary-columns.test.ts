import { describe, expect, it } from 'vite-plus/test';
import { budgetSummaryColumns } from '../../resources/js/components/management/budget-summary-columns';

describe('Budget summary alignment', () => {
    it('starts labels at the checkbox column without shifting amounts', () => {
        expect(
            budgetSummaryColumns(
                [
                    'select',
                    'expand',
                    'description',
                    'vendor',
                    'allocated',
                    'actual',
                    'variance',
                ].map((id) => ({ id })),
            ),
        ).toEqual([
            { id: 'description', colSpan: 3 },
            { id: 'vendor', colSpan: 1 },
            { id: 'allocated', colSpan: 1 },
            { id: 'actual', colSpan: 1 },
            { id: 'variance', colSpan: 1 },
        ]);
    });

    it('keeps reordered amounts in their own columns', () => {
        expect(
            budgetSummaryColumns(
                [
                    'select',
                    'actual',
                    'expand',
                    'vendor',
                    'description',
                    'variance',
                ].map((id) => ({ id })),
            ),
        ).toEqual([
            { id: 'select', colSpan: 1 },
            { id: 'actual', colSpan: 1 },
            { id: 'description', colSpan: 3 },
            { id: 'variance', colSpan: 1 },
        ]);
    });

    it('keeps the label when description is the first visible column', () => {
        expect(
            budgetSummaryColumns([{ id: 'description' }, { id: 'allocated' }]),
        ).toEqual([
            { id: 'description', colSpan: 1 },
            { id: 'allocated', colSpan: 1 },
        ]);
    });
});

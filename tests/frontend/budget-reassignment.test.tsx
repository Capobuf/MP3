import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { useState } from 'react';
import { toast } from 'sonner';
import {
    api,
    ApiError,
} from '../../resources/js/components/management/helpers';
import {
    InlineEdit,
    saveInlineRecord,
} from '../../resources/js/components/management/inline-edit';
import {
    BudgetReassignmentComparison,
    BudgetReassignmentRequired,
} from '../../resources/js/components/management/budget-reassignment';
import type { BudgetReassignmentPreview } from '../../resources/js/components/management/budget-reassignment';

const mocks = vi.hoisted(() => ({
    keyDown: vi.fn(),
    reload: vi.fn(),
    setters: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock('@inertiajs/react', () => ({ router: { reload: mocks.reload } }));
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock(
    '../../resources/js/components/management/helpers',
    async (original) => ({
        ...(await original<
            typeof import('../../resources/js/components/management/helpers')
        >()),
        api: vi.fn(),
    }),
);
vi.mock('react', async (original) => {
    const react = await original<typeof import('react')>();
    return { ...react, useState: vi.fn(react.useState) };
});
vi.mock('../../resources/js/components/ui/input', () => ({
    Input: (props: { onKeyDown: typeof mocks.keyDown }) => {
        mocks.keyDown = props.onKeyDown;
        return <input />;
    },
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.setters = [];
});

it('identifies only the structured conflict and retains the exact unsaved request', async () => {
    const data = { project_id: 5, title: 'Bozza', notes: 'Non perdere' };
    vi.mocked(api).mockRejectedValue(
        new ApiError(
            'Messaggio indipendente',
            {},
            'budget_reassignment_required',
        ),
    );
    await expect(
        saveInlineRecord('/t/alfa/expenses/4', data),
    ).rejects.toMatchObject({
        url: '/t/alfa/expenses/4',
        data,
    });
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    const ordinary = new ApiError('Questa spesa è già nel Budget.', {
        vendor_id: ['Non valido'],
    });
    vi.mocked(api).mockRejectedValue(ordinary);
    await expect(saveInlineRecord('/t/alfa/expenses/4', data)).rejects.toBe(
        ordinary,
    );
});

it('opens the inline dialog without setting a transient field error', async () => {
    const conflict = new BudgetReassignmentRequired('/t/alfa/expenses/4', {
        project_id: 5,
    });
    for (const value of [true, '5', false, '', null]) {
        const setter = vi.fn();
        mocks.setters.push(setter);
        vi.mocked(useState).mockImplementationOnce(() => [value, setter]);
    }
    const save = vi.fn().mockRejectedValue(conflict);
    renderToStaticMarkup(
        <InlineEdit value="" label="Progetto" onSave={save} />,
    );
    mocks.keyDown({ key: 'Enter', preventDefault: vi.fn() });
    await vi.waitFor(() =>
        expect(mocks.setters[4]).toHaveBeenCalledWith(conflict),
    );
    expect(mocks.setters[0]).toHaveBeenCalledWith(false);
    expect(mocks.setters[3].mock.calls).toEqual([['']]);
    expect(toast.error).not.toHaveBeenCalled();
});

const preview: BudgetReassignmentPreview = {
    expense: { id: 4, title: 'Servizio' },
    target: { id: 5, type: 'project', name: 'Nuova sede', year: 2026 },
    valid: true,
    problem: null,
    token: 'token',
    years: [
        {
            year: 2026,
            budget_id: 1,
            direct_entries: [{ id: 1, included: false }],
            destination: 'included',
            expense_before: {
                allocated: '-10.01',
                actual: null,
                variance: '10.01',
            },
            expense_after: {
                allocated: '-10.01',
                actual: null,
                variance: '10.01',
            },
            budget_before: {
                allocated: '0.00',
                actual: null,
                variance: '0.00',
            },
            budget_after: {
                allocated: '-10.01',
                actual: null,
                variance: '10.01',
            },
            difference: {
                allocated: '-10.01',
                actual: null,
                variance: '10.01',
            },
        },
    ],
};

it('shows the move and Budget impact with secondary details initially closed', () => {
    const html = renderToStaticMarkup(
        <BudgetReassignmentComparison preview={preview} />,
    );
    expect(html.indexOf('Prima')).toBeLessThan(html.indexOf('Dopo'));
    expect(html).toContain('Voce singola');
    expect(html).toContain('Esclusa');
    expect(html).toContain('Incluso');
    expect(html).toContain('Nuova sede');
    expect(html).toContain('Totale Budget');
    expect(html).toContain('0,00');
    expect(html).toContain('-10,01');
    expect(html).toContain('Variazione -10,01');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Dettagli economici');
    expect(html).not.toContain('Valore della spesa');
    expect(html).not.toContain('Scostamento');
    expect(html).not.toContain('voci dirette');
});

it.each(['missing', 'excluded'] as const)(
    'keeps the consequence of a %s destination visible',
    (destination) => {
        const html = renderToStaticMarkup(
            <BudgetReassignmentComparison
                preview={{
                    ...preview,
                    years: [{ ...preview.years[0], destination }],
                }}
            />,
        );
        expect(html).toContain(
            'La spesa non verrà conteggiata finché non lo includi.',
        );
        expect(html).toContain(
            destination === 'missing'
                ? 'non è nel Budget'
                : 'escluso dal Budget',
        );
    },
);

it('highlights unchanged totals without repeating zero differences', () => {
    const year = preview.years[0];
    const html = renderToStaticMarkup(
        <BudgetReassignmentComparison
            preview={{
                ...preview,
                years: [
                    {
                        ...year,
                        budget_after: year.budget_before,
                        difference: {
                            allocated: '0.00',
                            actual: null,
                            variance: '0.00',
                        },
                    },
                ],
            }}
        />,
    );
    expect(html).toContain('Totali invariati');
    expect(html).not.toContain('Variazione');
});

it('shows positive differences without calling them savings and keeps unknown values distinct from zero', () => {
    const html = renderToStaticMarkup(
        <BudgetReassignmentComparison
            preview={{
                ...preview,
                years: [
                    {
                        ...preview.years[0],
                        budget_after: {
                            allocated: '10.01',
                            actual: null,
                            variance: '-10.01',
                        },
                        difference: {
                            allocated: '10.01',
                            actual: null,
                            variance: '-10.01',
                        },
                    },
                ],
            }}
        />,
    );
    expect(html).toContain('Variazione +10,01');
    expect(html).toContain('0,00');
    expect(html).toContain('—');
    expect(html).not.toContain('risparmio');
});

it('does not announce a Budget result for an invalid preview', () => {
    const html = renderToStaticMarkup(
        <BudgetReassignmentComparison preview={{ ...preview, valid: false }} />,
    );
    expect(html).not.toContain('Totali invariati');
    expect(html).not.toContain('Variazione');
});

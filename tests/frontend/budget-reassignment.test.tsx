import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { useState, type ComponentProps } from 'react';
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
    detailsOpen: false,
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

vi.mock('../../resources/js/components/ui/collapsible', async (original) => {
    const components =
        await original<
            typeof import('../../resources/js/components/ui/collapsible')
        >();
    return {
        ...components,
        Collapsible: (props: ComponentProps<typeof components.Collapsible>) => (
            <components.Collapsible
                {...props}
                defaultOpen={mocks.detailsOpen}
            />
        ),
    };
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.setters = [];
    mocks.detailsOpen = false;
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
    expect(html).toContain('Variazione: ');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Dettagli economici');
    expect(html).not.toContain('Importi della spesa');
    expect(html).not.toContain('Effettivo');
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
    expect(html).toContain('Il totale resta invariato.');
    expect(html).not.toContain('Variazione');
    expect(html).not.toContain('<dl');
    expect(html).not.toContain('0,00');
});

it('shows positive differences and zero amounts while hiding unavailable metrics', () => {
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
    expect(html).toContain('+10,01');
    expect(html).toContain('0,00');
    expect(html).not.toContain('—');
    expect(html).not.toContain('Effettivo');
    expect(html).not.toContain('risparmio');
});

it('does not announce a Budget result for an invalid preview', () => {
    const html = renderToStaticMarkup(
        <BudgetReassignmentComparison preview={{ ...preview, valid: false }} />,
    );
    expect(html).not.toContain('Il totale resta invariato.');
    expect(html).not.toContain('<dl');
    expect(html).not.toContain('Variazione');
});

it('shows only the changed Budget metrics', () => {
    const year = preview.years[0];
    const html = renderToStaticMarkup(
        <BudgetReassignmentComparison
            preview={{
                ...preview,
                years: [
                    {
                        ...year,
                        budget_after: {
                            ...year.budget_after!,
                            variance: '0.00',
                        },
                    },
                ],
            }}
        />,
    );
    expect(html).toContain('Allocato');
    expect(html).not.toContain('Scostamento');
    expect(html).not.toContain('Il totale resta invariato.');
});

it.each([
    ['allocated', 'Allocato'],
    ['actual', 'Effettivo'],
    ['variance', 'Scostamento'],
] as const)(
    'omits unavailable %s from the expense details, retaining zero amounts once',
    (key, label) => {
        mocks.detailsOpen = true;
        const values = {
            allocated: '0.00',
            actual: '0.00',
            variance: '0.00',
            [key]: null,
        };
        const html = renderToStaticMarkup(
            <BudgetReassignmentComparison
                preview={{
                    ...preview,
                    years: [
                        {
                            ...preview.years[0],
                            expense_before: values,
                            expense_after: values,
                        },
                    ],
                }}
            />,
        );
        const detail = html.split('aria-label="Dettagli 2026"')[1];
        expect(detail).toContain('Importi della spesa');
        expect(detail).not.toContain(label);
        expect(detail.match(/0,00/g)).toHaveLength(2);
        expect(detail).not.toContain('Prima');
        expect(detail).not.toContain('Dopo');
        expect(detail).not.toContain('—');
    },
);

it('compares changed expense values and shows only the available side for incomplete data', () => {
    mocks.detailsOpen = true;
    const html = renderToStaticMarkup(
        <BudgetReassignmentComparison
            preview={{
                ...preview,
                years: [
                    {
                        ...preview.years[0],
                        expense_before: {
                            allocated: '10.00',
                            actual: null,
                            variance: '5.00',
                        },
                        expense_after: {
                            allocated: '20.00',
                            actual: '25.00',
                            variance: null,
                        },
                    },
                ],
            }}
        />,
    );
    const detail = html.split('aria-label="Dettagli 2026"')[1];
    expect(detail).toContain('Prima: ');
    expect(detail).toContain('Dopo: ');
    for (const amount of ['10,00', '20,00', '25,00', '5,00'])
        expect(detail).toContain(amount);
    expect(detail).not.toContain('—');
    expect(detail).not.toContain('Variazione');
});

it('hides empty economic details and does not call unknown totals unchanged', () => {
    const empty = { allocated: null, actual: null, variance: null };
    const html = renderToStaticMarkup(
        <BudgetReassignmentComparison
            preview={{
                ...preview,
                years: [
                    {
                        ...preview.years[0],
                        budget_before: empty,
                        budget_after: empty,
                        expense_before: null,
                        expense_after: empty,
                    },
                ],
            }}
        />,
    );
    expect(html).not.toContain('Dettagli economici');
    expect(html).not.toContain('Il totale resta invariato.');
    expect(html).not.toContain('<dt');
});

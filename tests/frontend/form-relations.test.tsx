import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    Children,
    useState,
    type ReactElement,
    type ReactNode,
    type ComponentProps,
    type FormEvent,
} from 'react';
import { DialogContent } from '../../resources/js/components/ui/dialog';
import { FormSurface } from '../../resources/js/components/management/form-surface';
import { Button } from '../../resources/js/components/ui/button';
import {
    api,
    ApiError,
} from '../../resources/js/components/management/helpers';
import { EntityForm } from '../../resources/js/components/management/entity-form';
import {
    applyFilters,
    DashboardFilters,
} from '../../resources/js/components/management/dashboard-filters';
import { RecordSelect } from '../../resources/js/components/management/record-select';
import { ExpenseLines } from '../../resources/js/components/management/expense-lines';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react', async (original) => {
    const react = await original<typeof import('react')>();
    return { ...react, useState: vi.fn(react.useState) };
});
vi.mock('@/components/ui/dialog', async (original) => ({
    ...(await original<
        typeof import('../../resources/js/components/ui/dialog')
    >()),
    DialogContent: vi.fn(() => null),
}));
vi.mock('@/components/management/form-surface', async (original) => {
    const module =
        await original<
            typeof import('../../resources/js/components/management/form-surface')
        >();
    return { ...module, FormSurface: vi.fn(module.FormSurface) };
});
vi.mock('@/components/ui/button', async (original) => {
    const module =
        await original<
            typeof import('../../resources/js/components/ui/button')
        >();
    return { ...module, Button: vi.fn(module.Button) };
});
vi.mock('@/components/management/helpers', async (original) => ({
    ...(await original<
        typeof import('../../resources/js/components/management/helpers')
    >()),
    api: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    router: { get: navigate },
    usePage: () => ({ props: { economicContext: { year: 2026 } } }),
}));
vi.mock('@/components/management/record-select', () => ({
    RecordSelect: vi.fn(() => null),
}));
vi.mock('@/components/management/table-view', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('../../resources/js/components/management/table-view')
    >()),
    TableFilters: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const tenant = { id: 1, name: 'Alfa', slug: 'alfa' };
const options = {
    vendors: [],
    contracts: [],
    projects: [],
    cost_centers: [],
    project_statuses: [],
};

beforeEach(() => vi.clearAllMocks());

describe('Record relation selectors', () => {
    it.each([
        ['contractContext', 'contracts'],
        ['projectContext', 'projects'],
    ] as const)('shows the prefilled selector for %s', (context, catalog) => {
        const related = { id: 202, name: 'Collegamento di partenza' };
        const html = renderToStaticMarkup(
            <EntityForm
                tenant={tenant}
                kind="expenses"
                options={options}
                {...{ [context]: related }}
                onClose={() => {}}
                onSaved={() => {}}
            />,
        );
        const selectors = vi
            .mocked(RecordSelect)
            .mock.calls.map(([props]) => props);
        expect(selectors.map(({ catalog }) => catalog)).toEqual([
            'vendors',
            catalog,
        ]);
        const selector = selectors.find((item) => item.catalog === catalog)!;
        expect(selector.value).toBe('202');
        expect(selector.disabled).toBe(false);
        expect(selector.options).toContainEqual(related);
        expect(html).not.toContain('Rimuovi prima il collegamento');
    });

    it.each([false, true])(
        'keeps column settings accessible (readOnly=%s)',
        (readOnly) => {
            const html = renderToStaticMarkup(
                <ExpenseLines
                    lines={[]}
                    onChange={() => {}}
                    readOnly={readOnly}
                />,
            );
            const header = html.slice(
                html.indexOf('<thead'),
                html.indexOf('</thead>'),
            );
            expect(html.match(/aria-label="Colonne"/g)).toHaveLength(1);
            expect(header).toContain('aria-label="Colonne"');
        },
    );

    it.each([
        ['expenses', undefined, ['vendors', 'contracts', 'projects']],
        ['expenses', { id: 1 }, ['vendors', 'contracts', 'projects']],
        ['contracts', undefined, ['vendors']],
        ['contracts', { id: 1 }, ['vendors']],
    ] as const)(
        'keeps the filter-only option out of the %s form (%j)',
        (kind, record, catalogs) => {
            renderToStaticMarkup(
                <EntityForm
                    tenant={tenant}
                    kind={kind}
                    record={record}
                    options={options}
                    onClose={() => {}}
                    onSaved={() => {}}
                />,
            );
            const selectors = vi
                .mocked(RecordSelect)
                .mock.calls.map(([props]) => props);
            expect(selectors.map(({ catalog }) => catalog)).toEqual(catalogs);
            expect(selectors.every(({ includeNone }) => !includeNone)).toBe(
                true,
            );
        },
    );

    it('preserves the unassigned option and its value in expense filters', () => {
        const filters = { year: 2026, vendor_id: 'none' };
        renderToStaticMarkup(
            <DashboardFilters
                tenant={tenant}
                options={options}
                path="/t/alfa/expenses"
                filters={filters}
                expenses={{
                    data: [],
                    current_page: 1,
                    last_page: 1,
                    total: 0,
                    from: null,
                    to: null,
                    prev_page_url: null,
                    next_page_url: null,
                    links: [],
                }}
            />,
        );
        const selectors = vi
            .mocked(RecordSelect)
            .mock.calls.map(([props]) => props);
        expect(selectors.map(({ catalog }) => catalog)).toEqual([
            'vendors',
            'contracts',
            'projects',
        ]);
        expect(selectors.every(({ includeNone }) => includeNone)).toBe(true);
        expect(selectors[0].value).toBe('none');
        applyFilters('/t/alfa/expenses', filters);
        expect(navigate).toHaveBeenCalledWith('/t/alfa/expenses', filters, {
            preserveState: true,
            preserveScroll: true,
        });
    });
});

it('associates line validation with each cell without adding error paragraphs to rows', () => {
    const html = renderToStaticMarkup(
        <ExpenseLines
            lines={[
                {
                    key: 'draft',
                    type: 'allocated',
                    description: 'Bozza',
                    unit_price: 'abc',
                    quantity: '-2',
                },
            ]}
            onChange={() => {}}
            errors={{
                'lines.0.description': ['Descrizione richiesta'],
                'lines.0.unit_price': ['Prezzo non valido'],
                'lines.0.quantity': ['Quantità non valida'],
            }}
        />,
    );
    for (const [field, label, message] of [
        ['description', 'Descrizione', 'Descrizione richiesta'],
        ['unit_price', 'Prezzo unitario', 'Prezzo non valido'],
        ['quantity', 'Quantità', 'Quantità non valida'],
    ]) {
        expect(html).toContain(`aria-label="Errore: ${label} riga 1"`);
        expect(html).toContain(
            `-draft-${field}" class="sr-only">${message}</span>`,
        );
        expect(html).toMatch(
            new RegExp(
                `aria-describedby="[^"]+-draft-${field}" aria-invalid="true"`,
            ),
        );
    }
    const rows = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
    expect(rows).not.toContain('role="alert"');
    expect(rows).toContain('value="Bozza"');
    expect(rows).toContain('value="abc"');
    expect(rows).toContain('value="-2"');
});

describe('Expense quick creation dialogs', () => {
    function renderForm(
        props: Partial<ComponentProps<typeof EntityForm>> = {},
        relation: {
            catalog: 'vendors' | 'contracts' | 'projects';
            field: string;
        } | null = null,
        startsOn?: string,
    ) {
        const setters = Array.from({ length: 10 }, () => vi.fn());
        setters.forEach((setter, index) => {
            vi.mocked(useState).mockImplementationOnce((initial) => {
                const value =
                    typeof initial === 'function' ? initial() : initial;
                if (index === 1 && startsOn) value.values.starts_on = startsOn;
                return [index === 0 ? relation : value, setter];
            });
        });
        const html = renderToStaticMarkup(
            <EntityForm
                tenant={tenant}
                kind="expenses"
                options={options}
                onClose={vi.fn()}
                onSaved={vi.fn()}
                {...props}
            />,
        );
        const form = vi.mocked(FormSurface).mock.lastCall![0]
            .children as ReactElement<ComponentProps<'form'>>;
        return {
            setters,
            html,
            submit: () =>
                form.props.onSubmit!({
                    preventDefault: vi.fn(),
                    stopPropagation: vi.fn(),
                } as unknown as FormEvent<HTMLFormElement>),
        };
    }

    it.each([
        ['vendors', 'vendor_id', 'Fornitore'],
        ['contracts', 'contract_id', 'Contratto'],
        ['projects', 'project_id', 'Progetto'],
    ] as const)(
        'opens %s without replacing or resetting the expense',
        (catalog, field, label) => {
            const { setters, html } = renderForm();
            const trigger = vi
                .mocked(Button)
                .mock.calls.find(
                    ([props]) =>
                        props['aria-label'] === `Crea ${label.toLowerCase()}`,
                )![0];
            trigger.onClick!({
                currentTarget: {},
            } as React.MouseEvent<HTMLButtonElement>);
            expect(setters[0]).toHaveBeenCalledExactlyOnceWith({
                catalog,
                field,
            });
            expect(
                setters
                    .slice(1)
                    .every((setter) => setter.mock.calls.length === 0),
            ).toBe(true);
            expect(html).toContain('Nuova spesa');
            expect(html).not.toContain('Torna al form precedente');
            expect(navigate).not.toHaveBeenCalled();
        },
    );

    it.each([
        ['vendors', 'vendor_id'],
        ['contracts', 'contract_id'],
        ['projects', 'project_id'],
    ] as const)(
        'selects the saved %s while preserving the parent draft',
        (catalog, field) => {
            const { setters } = renderForm({}, { catalog, field });
            const fragment = vi.mocked(DialogContent).mock.lastCall![0]
                .children as ReactElement<{ children: ReactNode }>;
            const child = Children.toArray(fragment.props.children).find(
                (element) => (element as ReactElement).type === EntityForm,
            ) as ReactElement<ComponentProps<typeof EntityForm>>;
            expect(child.props.quickCreate).toBe(true);
            const created = { id: 88, name: 'Nuovo collegamento' };
            child.props.onSaved(created);
            const draft = {
                values: {
                    title: 'Descrizione mia',
                    notes: 'Note mie',
                    vendor_id: '3',
                    year: '2025',
                },
                lines: [
                    {
                        key: 'one',
                        description: 'Riga mia',
                        unit_price: '123,45',
                        quantity: '2',
                    },
                ],
                costCenterIds: [7],
                detailed: true,
                original: 'snapshot originale',
            };
            const updated = setters[1].mock.calls[0][0](draft);
            expect(updated).toEqual({
                ...draft,
                values: { ...draft.values, [field]: '88' },
            });
            expect(setters[2].mock.calls[0][0](options)[catalog]).toEqual([
                created,
            ]);
            if (catalog === 'contracts') {
                expect(
                    setters[1].mock.calls[0][0]({
                        ...draft,
                        values: { title: '' },
                        lines: [{ description: '' }],
                    }),
                ).toMatchObject({
                    values: { title: created.name, contract_id: '88' },
                    lines: [{ description: created.name }],
                });
            }
            expect(setters[0]).toHaveBeenLastCalledWith(null);
            expect(navigate).not.toHaveBeenCalled();
        },
    );

    it('cancels only the secondary entity', () => {
        const close = vi.fn();
        const { setters } = renderForm(
            { onClose: close },
            { catalog: 'vendors', field: 'vendor_id' },
        );
        const fragment = vi.mocked(DialogContent).mock.lastCall![0]
            .children as ReactElement<{ children: ReactNode }>;
        const child = Children.toArray(fragment.props.children).find(
            (element) => (element as ReactElement).type === EntityForm,
        ) as ReactElement<ComponentProps<typeof EntityForm>>;
        child.props.onClose();
        expect(setters[0]).toHaveBeenCalledExactlyOnceWith(null);
        expect(
            setters.slice(1).every((setter) => setter.mock.calls.length === 0),
        ).toBe(true);
        expect(close).not.toHaveBeenCalled();
    });

    it.each([false, true])(
        'keeps the first expense only in standalone contract creation (quickCreate=%s)',
        (quickCreate) => {
            const { html } = renderForm({ kind: 'contracts', quickCreate });
            expect(html.includes('righe della prima spesa')).toBe(!quickCreate);
            expect(html.includes('Prezzo unitario riga 1')).toBe(!quickCreate);
        },
    );

    it.each([
        new ApiError('Nome non valido', { name: ['Nome non valido'] }),
        new Error('Rete non disponibile'),
    ])('keeps errors and the draft in the dialog: %s', async (error) => {
        vi.stubGlobal('requestAnimationFrame', vi.fn());
        vi.mocked(api).mockRejectedValueOnce(error);
        const saved = vi.fn();
        const close = vi.fn();
        const { setters, submit } = renderForm({
            kind: 'vendors',
            quickCreate: true,
            onSaved: saved,
            onClose: close,
        });
        submit();
        await vi.waitFor(() =>
            expect(setters[6]).toHaveBeenLastCalledWith(false),
        );
        expect(api).toHaveBeenCalledExactlyOnceWith(
            '/t/alfa/vendors',
            'POST',
            expect.any(Object),
        );
        expect(setters[5]).toHaveBeenLastCalledWith(
            expect.objectContaining({ _form: [error.message] }),
        );
        expect(setters[1]).not.toHaveBeenCalled();
        expect(saved).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it.each([false, true])(
        'handles a different contract start year without changing the standalone flow (quickCreate=%s)',
        async (quickCreate) => {
            vi.mocked(api).mockClear();
            vi.mocked(api).mockResolvedValueOnce({
                record: { id: 88, name: 'Contratto' },
            });
            const saved = vi.fn();
            const { setters, submit } = renderForm(
                { kind: 'contracts', quickCreate, onSaved: saved },
                null,
                '2027-01-01',
            );
            submit();
            if (quickCreate) {
                await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
                expect(api).toHaveBeenCalledExactlyOnceWith(
                    '/t/alfa/contracts',
                    'POST',
                    expect.objectContaining({
                        starts_on: '2027-01-01',
                        year: 2026,
                    }),
                );
                expect(vi.mocked(api).mock.calls[0][2]).not.toHaveProperty(
                    'initial_expense',
                );
                expect(setters[8]).not.toHaveBeenCalled();
                expect(navigate).not.toHaveBeenCalled();
            } else {
                expect(setters[8]).toHaveBeenCalledExactlyOnceWith(2027);
                expect(api).not.toHaveBeenCalled();
                expect(saved).not.toHaveBeenCalled();
            }
        },
    );

    it('gives coexisting forms unique field IDs and matching labels', () => {
        vi.mocked(RecordSelect).mockImplementation(({ id }) => (
            <input id={id} />
        ));
        const html = renderToStaticMarkup(
            <>
                <EntityForm
                    tenant={tenant}
                    kind="expenses"
                    options={options}
                    onClose={vi.fn()}
                    onSaved={vi.fn()}
                />
                <EntityForm
                    tenant={tenant}
                    kind="contracts"
                    quickCreate
                    options={options}
                    onClose={vi.fn()}
                    onSaved={vi.fn()}
                />
            </>,
        );
        const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(
            (match) => match[1],
        );
        expect(ids.length).toBeGreaterThan(10);
        expect(new Set(ids).size).toBe(ids.length);
        for (const [, id] of html.matchAll(/ for="([^"]+)"/g))
            expect(ids).toContain(id);
    });
});

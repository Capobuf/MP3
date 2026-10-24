import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { EntityForm } from '../../resources/js/components/management/entity-form';
import {
    applyFilters,
    DashboardFilters,
} from '../../resources/js/components/management/dashboard-filters';
import { RecordSelect } from '../../resources/js/components/management/record-select';
import { ExpenseLines } from '../../resources/js/components/management/expense-lines';

const navigate = vi.hoisted(() => vi.fn());

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

import { describe, expect, it } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    createTable,
    getCoreRowModel,
    getFilteredRowModel,
    getGroupedRowModel,
    getSortedRowModel,
    getExpandedRowModel,
    getPaginationRowModel,
} from '@tanstack/react-table';
import {
    BudgetReport,
    captureBudgetReport,
    defaultBudgetReportOptions,
} from '../../resources/js/components/management/budget-report';
import {
    budgetReportGroups,
    budgetReportVariances,
} from '../../resources/js/components/management/budget-report-charts';
import type {
    BudgetEntry,
    BudgetSnapshot,
    BudgetTotals,
} from '../../resources/js/components/management/budget-types';

const totals: BudgetTotals = {
    allocated: '0.00',
    actual: null,
    variance: null,
    count: 1,
    incomplete: 0,
    comparable_count: 0,
    allocated_positive: '0.00',
    allocated_negative: '0.00',
    actual_positive: '0.00',
    actual_negative: '0.00',
};
const entries: BudgetEntry[] = [3, 2, 1].map((id) => ({
    ...totals,
    id,
    type: 'expense',
    source_id: id,
    description: `Voce ${id} <script>`,
    included: id !== 3,
    position: id,
    cost_center_id: null,
    cost_center: null,
    vendor: null,
    notes: null,
    starts_on: null,
    ends_on: null,
    expenses: [],
}));
const summary: BudgetSnapshot = {
    entries,
    totals,
    groups: { contract: totals, project: totals, expense: totals },
    cost_center_groups: {},
    vendor_groups: {},
    owners: {},
    has_missing_entries: false,
};
function table(search = '', sorted = true) {
    return createTable({
        data: entries,
        columns: [
            { accessorKey: 'description' },
            { accessorKey: 'type' },
            { accessorKey: 'allocated' },
            { id: 'actions' },
        ],
        state: {
            sorting: sorted ? [{ id: 'description', desc: false }] : [],
            grouping: ['type'],
            expanded: {},
            globalFilter: search,
            columnOrder: ['allocated', 'description', 'type', 'actions'],
            columnVisibility: { type: false },
            pagination: { pageIndex: 0, pageSize: 1 },
        },
        groupedColumnMode: false,
        onStateChange: () => {},
        renderFallbackValue: null,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getGroupedRowModel: getGroupedRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });
}

describe('Budget report', () => {
    it('captures all sorted filtered leaves, including collapsed groups, without controls or pagination', () => {
        const report = captureBudgetReport(table(), summary, ['Tutte']);
        expect(report.budget.entries.map((entry) => entry.id)).toEqual([
            1, 2, 3,
        ]);
        expect(report.budget.totals).toBe(totals);
        expect(
            captureBudgetReport(
                table('', false),
                summary,
                [],
            ).budget.entries.map((entry) => entry.id),
        ).toEqual([3, 2, 1]);
        expect(
            captureBudgetReport(
                table('Voce 2'),
                summary,
                [],
            ).budget.entries.map((entry) => entry.id),
        ).toEqual([2]);
        expect(
            captureBudgetReport(table('absent'), summary, []).budget.entries,
        ).toEqual([]);
        expect(() =>
            captureBudgetReport(table(), { ...summary, entries: [] }, []),
        ).toThrow('Dati del Budget cambiati');
    });
    it('renders server amounts, zero/missing, excluded rows, column order and optional sections safely', () => {
        const data = captureBudgetReport(table(), summary, [
            'Voci incluse ed escluse',
        ]);
        const html = renderToStaticMarkup(
            <BudgetReport
                data={data}
                options={{
                    ...defaultBudgetReportOptions('Tenant'),
                    blocks: ['kpis', 'table', 'totals'],
                    title: 'Budget <2026>',
                    orientation: 'portrait',
                    columns: [
                        'allocated',
                        'description',
                        'actual',
                        'variance',
                        'status',
                    ],
                }}
                tenantName="Tenant"
                year={2026}
                createdAt="17/10/2026"
            />,
        );
        expect(html).toContain('Budget &lt;2026&gt;');
        expect(html).not.toContain('<script>');
        expect(html).toContain('0,00');
        expect(html).toContain('Da inserire');
        expect(html).toContain('Non confrontabile');
        expect(html).toContain('Esclusa');
        expect(html).not.toContain('Ripartizione del Budget');
        expect(html).not.toContain('<button');
        expect(html).not.toContain('Fornitore');
        expect(html.indexOf('data-column="allocated"')).toBeLessThan(
            html.indexOf('data-column="description"'),
        );
    });
    it('renders the empty set explicitly instead of the entire annual budget', () => {
        const html = renderToStaticMarkup(
            <BudgetReport
                data={captureBudgetReport(table('absent'), summary, [
                    'Ricerca: absent',
                ])}
                options={{
                    ...defaultBudgetReportOptions('Tenant'),
                    blocks: ['table'],
                    title: 'Vuoto',
                    orientation: 'landscape',
                    columns: ['description'],
                }}
                tenantName="Tenant"
                year={2027}
                createdAt="17/10/2026"
            />,
        );
        expect(html).toContain('Nessuna voce corrisponde');
        expect(html).not.toContain('data-entry-id');
        expect(html).not.toContain('Riepilogo economico');
        expect(html).toContain('2027');
    });
});

it('defaults to all blocks and columns except Status, supports independent scope, headings, totals and grouping', () => {
    const options = defaultBudgetReportOptions('Azienda');
    expect(options.hiddenBlocks).toEqual([]);
    expect(options.columns).not.toContain('status');
    const html = renderToStaticMarkup(
        <BudgetReport
            data={{ budget: summary, filters: ['Filtro segreto'] }}
            tenantName="Tenant"
            year={2027}
            createdAt="DATA"
            logoUrl="/logo.png"
            options={{
                ...options,
                title: 'Personalizzato',
                company: 'Azienda modificata',
                showScope: false,
                showYear: false,
                showDate: false,
                showLogo: false,
                blocks: ['table', 'kpis', 'totals'],
                hiddenBlocks: ['totals'],
                titles: {
                    ...options.titles,
                    table: 'Dettaglio personalizzato',
                },
            }}
        />,
    );
    expect(html).toContain('Azienda modificata');
    expect(html).toContain('Dettaglio personalizzato');
    expect(html).not.toContain('Filtro segreto');
    expect(html).not.toContain('righe nel report');
    expect(html).not.toContain('2027');
    expect(html).not.toContain('/logo.png');
    expect(html).not.toContain('DATA');
    expect(html).not.toContain('data-column="status"');
    expect(html).not.toContain('Totale delle voci incluse nel report');
    expect(html).toContain('Subtotale · Spese singole');
    expect(html.indexOf('data-report-block="table"')).toBeLessThan(
        html.indexOf('data-report-block="kpis"'),
    );
});
it('uses server vendor groups and included attributed source amounts for charts', () => {
    const vendorTotals = {
        ...totals,
        allocated: '10.10',
        actual: '1.00',
        variance: '-9.10',
        count: 2,
    };
    const snapshot = {
        ...summary,
        vendor_groups: { '8': vendorTotals },
        entries: [
            { ...entries[0], included: true, vendor: { id: 8, name: 'Uno' } },
            {
                ...entries[1],
                included: true,
                type: 'project' as const,
                allocated: '0.00',
                actual: null,
            },
            {
                ...entries[2],
                included: false,
                type: 'project' as const,
                actual: '900.00',
            },
        ],
    };
    expect(budgetReportGroups(snapshot, 'vendors')).toEqual([
        { ...vendorTotals, id: '8', name: 'Uno' },
    ]);
    expect(budgetReportGroups(snapshot, 'projects')).toHaveLength(1);
    expect(budgetReportGroups(snapshot, 'projects')[0]).toMatchObject({
        id: entries[1].id,
        allocated: '0.00',
        actual: null,
    });
});
it('groups the table by type using server subtotals, or keeps the original order when disabled', () => {
    const mixed = {
        ...summary,
        entries: [
            { ...entries[0], type: 'project' as const },
            { ...entries[1], type: 'contract' as const },
            entries[2],
        ],
        groups: {
            ...summary.groups,
            contract: { ...totals, allocated: '123.45' },
        },
    };
    const options = {
        ...defaultBudgetReportOptions('Tenant'),
        blocks: ['table'] as const,
    };
    const render = (groupByType: boolean, subtotals: boolean) =>
        renderToStaticMarkup(
            <BudgetReport
                tenantName="Tenant"
                year={2027}
                createdAt="date"
                data={{ budget: mixed, filters: [] }}
                options={{
                    ...options,
                    blocks: ['table'],
                    groupByType,
                    subtotals,
                }}
            />,
        );
    const grouped = render(true, true);
    expect(grouped.indexOf('data-entry-id="2"')).toBeLessThan(
        grouped.indexOf('data-entry-id="3"'),
    );
    expect(grouped).toContain('123,45');
    expect(render(true, false)).not.toContain('Subtotale');
    const ungrouped = render(false, true);
    expect(ungrouped.indexOf('data-entry-id="3"')).toBeLessThan(
        ungrouped.indexOf('data-entry-id="2"'),
    );
    expect(ungrouped).not.toContain('Subtotale');
});

it('keeps the overview selection of five overruns and five savings, omitting zero, missing and excluded rows', () => {
    const rows: BudgetEntry[] = Array.from({ length: 20 }, (_, index) => ({
        ...entries[0],
        id: index,
        included: true,
        variance: String(index - 10),
    }));
    rows.push(
        { ...entries[0], id: 30, included: false, variance: '999.00' },
        { ...entries[0], id: 31, included: true, variance: null },
    );
    const selected = budgetReportVariances({ ...summary, entries: rows });
    expect(selected.map((row) => row.id)).toEqual([
        19, 18, 17, 16, 15, 0, 1, 2, 3, 4,
    ]);
});

it('defaults to portrait, removes obsolete charts and places the editable date only in the footer', () => {
    const options = defaultBudgetReportOptions('Azienda');
    expect(options.orientation).toBe('portrait');
    expect(options.blocks).not.toContain('completeness');
    expect(options.blocks).not.toContain('vendors');
    expect(options.titles.distribution).toBe('Distribuzione Fornitore');
    const html = renderToStaticMarkup(
        <BudgetReport
            data={{ budget: summary, filters: [] }}
            options={{
                ...options,
                blocks: ['sankey', 'reconciliation'],
                sankeyMetric: 'actual',
                reconciliationMetric: 'allocated',
            }}
            tenantName="Azienda"
            year={2027}
            createdAt="DATA PERSONALIZZATA"
        />,
    );
    expect(html.indexOf('DATA PERSONALIZZATA')).toBeGreaterThan(
        html.indexOf('<footer'),
    );
    const sankey = html.slice(
        html.indexOf('data-report-block="sankey"'),
        html.indexOf('data-report-block="reconciliation"'),
    );
    expect(sankey).toContain('Effettivo');
    expect(sankey).not.toContain('Allocato');
    expect(html).toContain('Allocato netto');
    expect(html).not.toContain('Effettivo netto');
});
it('keeps known allocated amounts in the supplier bar chart when all actuals are missing, and distinguishes zero', () => {
    const budget = {
        ...summary,
        vendor_groups: {
            none: { ...totals, allocated: '63296.44', actual: null },
        },
    };
    const html = renderToStaticMarkup(
        <BudgetReport
            data={{ budget, filters: [] }}
            options={{
                ...defaultBudgetReportOptions('Azienda'),
                blocks: ['distribution'],
            }}
            tenantName="Azienda"
            year={2027}
            createdAt="DATA"
        />,
    );
    expect(html).toContain('63.296,44');
    expect(html).toContain('Da inserire');
    expect(html).not.toContain('Percentuale');
    const zero = renderToStaticMarkup(
        <BudgetReport
            data={{
                budget: {
                    ...budget,
                    vendor_groups: {
                        none: {
                            ...totals,
                            allocated: '63296.44',
                            actual: '0.00',
                        },
                    },
                },
                filters: [],
            }}
            options={{
                ...defaultBudgetReportOptions('Azienda'),
                blocks: ['distribution'],
            }}
            tenantName="Azienda"
            year={2027}
            createdAt="DATA"
        />,
    );
    expect(zero).not.toContain('Da inserire</td>');
    expect(zero).toContain('0,00');
});

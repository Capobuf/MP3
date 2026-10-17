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
} from '../../resources/js/components/management/budget-report';
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
        expect(report.columns).toEqual([
            { id: 'allocated', visible: true },
            { id: 'description', visible: true },
            { id: 'type', visible: false },
        ]);
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
                    title: 'Budget <2026>',
                    orientation: 'portrait',
                    kpis: true,
                    chart: false,
                    table: true,
                    columns: ['allocated', 'description', 'actual', 'variance'],
                    logo: null,
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
        expect(html.indexOf('scope="col">Allocato')).toBeLessThan(
            html.indexOf('scope="col">Descrizione'),
        );
    });
    it('renders the empty set explicitly instead of the entire annual budget', () => {
        const html = renderToStaticMarkup(
            <BudgetReport
                data={captureBudgetReport(table('absent'), summary, [
                    'Ricerca: absent',
                ])}
                options={{
                    title: 'Vuoto',
                    orientation: 'landscape',
                    kpis: false,
                    chart: false,
                    table: true,
                    columns: ['description'],
                    logo: null,
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

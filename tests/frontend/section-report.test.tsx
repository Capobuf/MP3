import { describe, expect, it } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    SectionReport,
    defaultSectionReportOptions,
} from '../../resources/js/components/management/section-report';
import type { SectionReportData } from '../../resources/js/components/management/section-report';

const expense = {
    id: 7,
    title: 'Spesa annuale',
    year: 2026,
    allocated_amount: '0.00',
    actual_amount: '-2.50',
    variance: '-2.50',
    notes: 'Nota spesa',
    contract: { id: 1, name: null, display_name: 'Contratto senza nome' },
    lines: [
        {
            id: 3,
            description: 'Rettifica',
            type: 'actual' as const,
            quantity: '1.0000',
            unit_price: '-2.50',
            total: '-2.50',
            position: 0,
            year: 2026,
        },
    ],
};
const data: SectionReportData = {
    resource: 'contracts',
    year: 2026,
    logoUrl: null,
    filters: ['Fornitore: Test'],
    totals: {
        allocated: '0.00',
        actual: '-2.50',
        variance: '-2.50',
        count: 1,
        estimated_count: 0,
    },
    records: [
        {
            id: 1,
            name: 'Contratto A',
            year: 2026,
            notes: '<script>nota</script>',
            linked_expenses: [expense],
        },
    ],
};
function render(
    source: SectionReportData,
    options = defaultSectionReportOptions(source, 'Azienda'),
) {
    return renderToStaticMarkup(
        <SectionReport
            data={source}
            options={options}
            tenantName="Azienda"
            createdAt="20/10/2026"
        />,
    );
}
describe('Section report', () => {
    it.each(['contracts', 'projects'] as const)(
        'shows linked expenses by default for %s and lets the user hide them',
        (resource) => {
            const source = { ...data, resource };
            const options = defaultSectionReportOptions(source, 'Azienda');
            const initial = render(source, options);
            expect(initial).toContain('Contratto A');
            expect(initial).toContain('Spesa annuale');
            expect(initial).not.toContain('Rettifica');
            expect(
                render(source, {
                    ...options,
                    hiddenBlocks: ['details', 'linked'],
                }),
            ).not.toContain('Spesa annuale');
            const full = render(source, { ...options, hiddenBlocks: [] });
            expect(full).toContain('Spesa annuale');
            expect(full).toContain('Rettifica');
            expect(full).toContain('&lt;script&gt;nota&lt;/script&gt;');
            expect(full).not.toContain('<script>nota');
        },
    );
    it('preserves null, zero and negative amounts in expense details', () => {
        const source = {
            ...data,
            resource: 'expenses' as const,
            records: [
                expense,
                {
                    ...expense,
                    id: 8,
                    actual_amount: null,
                    variance: '0.00',
                    lines: [],
                },
            ],
        };
        const options = defaultSectionReportOptions(source, 'Azienda');
        expect(options.blocks).not.toContain('linked');
        const html = render(source, { ...options, hiddenBlocks: [] });
        expect(html).toContain('Da inserire');
        expect(html).not.toContain('Dati incompleti: scostamento provvisorio.');
        expect(html).toContain('Contratto senza nome');
        expect(html).toContain('0,00');
        expect(html).toContain('-2,50');
        expect(html).toContain('Rettifica');
    });
    it('honors column selection, order, block visibility and the shared footer', () => {
        const options = defaultSectionReportOptions(data, 'Azienda');
        const html = render(data, {
            ...options,
            blocks: ['table'],
            columns: ['year', 'name'],
            showPageNumbers: true,
            numberFirstPage: false,
        });
        expect(html.indexOf('data-column="year"')).toBeLessThan(
            html.indexOf('data-column="name"'),
        );
        expect(html).not.toContain('data-column="vendor"');
        expect(html).not.toContain('data-report-block="kpis"');
        expect(html).toContain('budget-report-footer-logo');
        expect(html).toContain('class="budget-report-page-number"></p>');
    });
    it('keeps custom project statuses and legacy unclassified years visible', () => {
        const source = {
            ...data,
            resource: 'projects' as const,
            records: [
                { id: 1, name: 'Progetto', status_label: 'In revisione' },
            ],
        };
        expect(render(source)).toContain('In revisione');
        expect(render(source)).toContain('Non classificato');
    });
});

it.each([
    ['-19.99', '-19,99'],
    ['19.99', '19,99'],
    ['0.00', '0,00'],
])(
    'prints project variance %s without provisional text even without scope',
    (variance, formatted) => {
        const source = {
            ...data,
            resource: 'projects' as const,
            totals: { ...data.totals, variance, estimated_count: 2 },
        };
        const html = render(source, {
            ...defaultSectionReportOptions(source, 'Azienda'),
            blocks: ['kpis'],
            showScope: false,
        });
        expect(html).toContain(formatted);
        expect(html).not.toContain(`+${formatted}`);
        if (variance === '0.00') expect(html).not.toContain('-0,00');
        expect(html).not.toContain('Dati incompleti: scostamento provvisorio.');
    },
);

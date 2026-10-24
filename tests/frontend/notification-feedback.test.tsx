import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'sonner';
import { ReportPrintDialog } from '../../resources/js/components/management/report-print-dialog';
import {
    budgetReportBlocks,
    budgetReportColumns,
    budgetReportIcons,
    defaultBudgetReportOptions,
} from '../../resources/js/components/management/budget-report';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('react-to-print', () => ({ useReactToPrint: vi.fn(() => vi.fn()) }));

beforeEach(() => vi.clearAllMocks());

it('reports a print failure once without closing or resetting report options', () => {
    const onClose = vi.fn();
    renderToStaticMarkup(
        <ReportPrintDialog
            defaults={defaultBudgetReportOptions('Alfa')}
            columnLabels={budgetReportColumns}
            blockLabels={budgetReportBlocks}
            blockIcons={budgetReportIcons}
            label="Budget"
            tenantName="Alfa"
            year={2026}
            onClose={onClose}
            renderReport={() => null}
        />,
    );
    const options = vi.mocked(useReactToPrint).mock.calls[0][0];
    options.onPrintError?.(
        'onBeforePrint',
        new Error('Anteprima non disponibile.'),
    );
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        'Stampa non riuscita: Anteprima non disponibile.',
    );
    expect(onClose).not.toHaveBeenCalled();
});

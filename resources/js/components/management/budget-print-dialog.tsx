import {
    BudgetReport,
    budgetReportColumns,
    budgetReportBlocks,
    budgetReportIcons,
    defaultBudgetReportOptions,
} from './budget-report';
import type { BudgetReportData } from './budget-report';
import { ReportPrintDialog } from './report-print-dialog';

export function BudgetPrintDialog({
    data,
    tenantName,
    logoUrl,
    year,
    onClose,
}: {
    data: BudgetReportData;
    tenantName: string;
    logoUrl?: string | null;
    year: number;
    onClose: () => void;
}) {
    return (
        <ReportPrintDialog
            defaults={defaultBudgetReportOptions(tenantName)}
            columnLabels={budgetReportColumns}
            blockLabels={budgetReportBlocks}
            blockIcons={budgetReportIcons}
            label="Budget"
            tenantName={tenantName}
            logoUrl={logoUrl}
            year={year}
            onClose={onClose}
            budgetControls
            renderReport={(options, ref, createdAt) => (
                <BudgetReport
                    ref={ref}
                    data={data}
                    options={options}
                    tenantName={tenantName}
                    logoUrl={logoUrl}
                    year={year}
                    createdAt={createdAt}
                />
            )}
        />
    );
}

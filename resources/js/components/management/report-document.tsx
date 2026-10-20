import type { Ref, ReactNode } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';

export type PrintReportOptions<
    Block extends string = string,
    Column extends string = string,
> = {
    title: string;
    company: string;
    subtitle: string;
    orientation: 'portrait' | 'landscape';
    showCompany: boolean;
    showYear: boolean;
    showLogo: boolean;
    showScope: boolean;
    showDate: boolean;
    showBranding: boolean;
    showPageNumbers: boolean;
    numberFirstPage: boolean;
    blocks: Block[];
    hiddenBlocks: Block[];
    titles: Record<Block, string>;
    sankeyMetric: 'allocated' | 'actual' | 'both';
    reconciliationMetric: 'allocated' | 'actual' | 'both';
    groupByType: boolean;
    subtotals: boolean;
    columns: Column[];
};
export function defaultPrintReportOptions<
    Block extends string,
    Column extends string,
>(
    tenantName: string,
    title: string,
    columns: Record<Column, string>,
    blocks: Record<Block, string>,
): PrintReportOptions<Block, Column> {
    return {
        title,
        company: tenantName,
        subtitle: 'Report economico',
        orientation: 'portrait',
        showCompany: true,
        showYear: true,
        showLogo: true,
        showScope: true,
        showDate: true,
        showBranding: true,
        showPageNumbers: false,
        numberFirstPage: true,
        blocks: Object.keys(blocks) as Block[],
        hiddenBlocks: [],
        titles: { ...blocks },
        sankeyMetric: 'both',
        reconciliationMetric: 'both',
        groupByType: false,
        subtotals: true,
        columns: Object.keys(columns) as Column[],
    };
}

export function ReportDocument({
    options,
    tenantName,
    logoUrl,
    year,
    createdAt,
    ref,
    filters,
    counts,
    children,
    label,
}: {
    options: PrintReportOptions;
    tenantName: string;
    logoUrl?: string | null;
    year: number;
    createdAt: string;
    ref?: Ref<HTMLElement>;
    filters: string[];
    counts: ReactNode;
    children: ReactNode;
    label: string;
}) {
    return (
        <article
            ref={ref}
            className="budget-report"
            data-orientation={options.orientation}
            aria-label={`Anteprima report ${label}`}
        >
            <div className="budget-report-page-body">
                <div className="budget-report-page-content">
                    <header className="budget-report-header">
                        <div className="budget-report-heading">
                            {options.showCompany && (
                                <p className="budget-report-eyebrow">
                                    {options.company}
                                </p>
                            )}
                            <h1>{options.title}</h1>
                            <p className="budget-report-subtitle">
                                {options.subtitle}
                            </p>
                        </div>
                        <div className="budget-report-identity">
                            {options.showLogo && logoUrl && (
                                <img src={logoUrl} alt={`Logo ${tenantName}`} />
                            )}
                            {options.showYear && (
                                <p className="budget-report-year">
                                    <span>Esercizio</span>
                                    <strong>{year}</strong>
                                </p>
                            )}
                        </div>
                    </header>
                    {options.showScope && (
                        <div className="budget-report-scope">
                            <div className="budget-report-scope-heading">
                                <strong>Perimetro del report</strong>
                            </div>
                            <p>{filters.join(' · ')}</p>
                            <p className="budget-report-counts">{counts}</p>
                        </div>
                    )}
                    {children}
                </div>
            </div>
            <div className="budget-report-footer-space" aria-hidden="true">
                <div />
            </div>
            <footer
                className="budget-report-note budget-report-footer"
                aria-label="Piè di pagina"
            >
                {options.showBranding && (
                    <AppLogoIcon
                        variant="black"
                        className="budget-report-footer-logo"
                    />
                )}
                {options.showDate && (
                    <p className="budget-report-date">
                        Elaborato il {createdAt}
                    </p>
                )}
                {options.showPageNumbers && (
                    <p className="budget-report-page-number">
                        {options.numberFirstPage ? '1' : null}
                    </p>
                )}
            </footer>
        </article>
    );
}

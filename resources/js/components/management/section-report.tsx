import type { Ref } from 'react';
import {
    ChartNoAxesCombined,
    Table2,
    FileText,
    ReceiptText,
    Sigma,
} from 'lucide-react';
import { ReportDocument, defaultPrintReportOptions } from './report-document';
import type { PrintReportOptions } from './report-document';
import { ReportPrintDialog } from './report-print-dialog';
import { dateLabel, money } from './helpers';
import { labels } from './types';
import type { RecordData, Expense, Totals } from './types';

export type SectionReportData = {
    resource: 'contracts' | 'projects' | 'expenses';
    year: number;
    logoUrl: string | null;
    filters: string[];
    totals: Totals;
    records: (RecordData & {
        status_label?: string;
        linked_expenses?: Expense[];
    })[];
};
const columns = {
    name: 'Nome',
    title: 'Descrizione',
    year: 'Anno',
    vendor: 'Fornitore',
    contract: 'Contratto',
    project: 'Progetto',
    centers: 'Centri di costo',
    status: 'Stato',
    starts_on: 'Data iniziale',
    ends_on: 'Data finale',
    reference_amount: 'Importo di riferimento',
    period_starts_on: 'Periodo iniziale',
    period_ends_on: 'Periodo finale',
    allocated_amount: 'Allocato',
    actual_amount: 'Effettivo',
    variance: 'Scostamento',
    expenses_count: 'Spese collegate · storico',
};
type Column = keyof typeof columns;
const sectionColumns: Record<SectionReportData['resource'], Column[]> = {
    contracts: [
        'name',
        'year',
        'vendor',
        'centers',
        'starts_on',
        'ends_on',
        'reference_amount',
        'expenses_count',
    ],
    projects: [
        'name',
        'year',
        'status',
        'centers',
        'starts_on',
        'ends_on',
        'expenses_count',
    ],
    expenses: [
        'title',
        'year',
        'vendor',
        'contract',
        'project',
        'centers',
        'period_starts_on',
        'period_ends_on',
        'allocated_amount',
        'actual_amount',
        'variance',
    ],
};
const blocks = {
    kpis: 'Riepilogo economico',
    table: 'Elenco',
    details: 'Dettagli',
    linked: 'Spese collegate',
    totals: 'Totale',
};
type Block = keyof typeof blocks;
const icons = {
    kpis: ChartNoAxesCombined,
    table: Table2,
    details: FileText,
    linked: ReceiptText,
    totals: Sigma,
};
type Options = PrintReportOptions<Block, Column>;
export function defaultSectionReportOptions(
    data: SectionReportData,
    tenantName: string,
): Options {
    const defaults = defaultPrintReportOptions(
        tenantName,
        labels[data.resource],
        columns,
        blocks,
    );
    return {
        ...defaults,
        subtitle:
            data.resource === 'expenses'
                ? 'Report delle spese'
                : `Spese collegate nell’esercizio ${data.year}`,
        blocks: defaults.blocks.filter(
            (block) => data.resource !== 'expenses' || block !== 'linked',
        ),
        hiddenBlocks: ['details'],
        columns: sectionColumns[data.resource].filter(
            (column) =>
                ![
                    'expenses_count',
                    'period_starts_on',
                    'period_ends_on',
                    'centers',
                ].includes(column),
        ),
    };
}
function cell(record: SectionReportData['records'][number], column: Column) {
    switch (column) {
        case 'name':
            return record.display_name ?? record.name ?? 'Senza nome';
        case 'year':
            return record.year ?? 'Non classificato';
        case 'vendor':
            return record.vendor?.name ?? 'Senza fornitore';
        case 'contract':
            return (
                record.contract?.display_name ??
                record.contract?.name ??
                'Senza contratto'
            );
        case 'project':
            return record.project?.name ?? 'Senza progetto';
        case 'centers':
            return (
                record.cost_centers
                    ?.map((center) =>
                        center.parent
                            ? `${center.parent.name} / ${center.name}`
                            : center.name,
                    )
                    .join('; ') || 'Senza centro di costo'
            );
        case 'status':
            return record.status_label ?? 'Senza stato';
        case 'starts_on':
        case 'ends_on':
        case 'period_starts_on':
        case 'period_ends_on':
            return dateLabel(record[column]);
        case 'allocated_amount':
        case 'actual_amount':
        case 'reference_amount':
            return money(record[column]);
        case 'variance':
            return money(record.variance, 'Non confrontabile');
        default:
            return record[column] ?? '—';
    }
}
function ReportTable({
    records,
    visible,
}: {
    records: SectionReportData['records'];
    visible: Column[];
}) {
    if (!records.length)
        return (
            <p className="budget-report-note">
                Nessuna voce per i filtri selezionati.
            </p>
        );
    return (
        <table className="budget-report-table section-report-table">
            <thead>
                <tr>
                    {visible.map((column) => (
                        <th key={column} data-column={column}>
                            {columns[column]}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {records.map((record) => (
                    <tr key={record.id} data-entry-id={record.id}>
                        {visible.map((column) => (
                            <td key={column} data-column={column}>
                                {cell(record, column)}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
function Conditions({ expense }: { expense: RecordData }) {
    if (!expense.lines?.length) return null;
    return (
        <table className="budget-report-table">
            <thead>
                <tr>
                    <th>Condizione</th>
                    <th>Tipo</th>
                    <th>Periodo</th>
                    <th>Prezzo unitario</th>
                    <th>Quantità</th>
                    <th>Importo</th>
                </tr>
            </thead>
            <tbody>
                {expense.lines.map((line, index) => (
                    <tr key={line.id ?? index}>
                        <td>{line.description}</td>
                        <td>
                            {line.type === 'allocated'
                                ? 'Allocato'
                                : 'Effettivo'}
                        </td>
                        <td>
                            {dateLabel(line.period_starts_on)} –{' '}
                            {dateLabel(line.period_ends_on)}
                        </td>
                        <td>{money(line.unit_price)}</td>
                        <td>
                            {Number(line.quantity).toLocaleString('it-IT', {
                                maximumFractionDigits: 4,
                            })}
                        </td>
                        <td>{money(line.total)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
export function SectionReport({
    data,
    options,
    tenantName,
    createdAt,
    ref,
}: {
    data: SectionReportData;
    options: Options;
    tenantName: string;
    createdAt: string;
    ref?: Ref<HTMLElement>;
}) {
    const totals = (
        <dl className="budget-report-kpis">
            {(['allocated', 'actual', 'variance'] as const).map((metric) => (
                <div key={metric} data-metric={metric}>
                    <dt>
                        {metric === 'allocated'
                            ? 'Allocato'
                            : metric === 'actual'
                              ? 'Effettivo'
                              : 'Scostamento'}
                    </dt>
                    <dd>{money(data.totals[metric])}</dd>
                </div>
            ))}
        </dl>
    );
    function renderBlock(block: Block) {
        switch (block) {
            case 'kpis':
            case 'totals':
                return totals;
            case 'table':
                return (
                    <ReportTable
                        records={data.records}
                        visible={options.columns}
                    />
                );
            case 'details':
                return data.records.map((record) => (
                    <div key={record.id} className="section-report-detail">
                        <div className="budget-report-block">
                            <h3>
                                {record.title ??
                                    record.display_name ??
                                    record.name}
                            </h3>
                            <dl className="section-report-fields">
                                {sectionColumns[data.resource].map((column) => (
                                    <div key={column}>
                                        <dt>{columns[column]}</dt>
                                        <dd>{cell(record, column)}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                        {record.description && (
                            <p className="section-report-text">
                                {record.description}
                            </p>
                        )}
                        {record.notes && (
                            <p className="section-report-text">
                                {record.notes}
                            </p>
                        )}
                        <Conditions expense={record} />
                    </div>
                ));
            case 'linked':
                return data.records.map((record) => (
                    <div key={record.id} className="section-report-detail">
                        <h3>{record.display_name ?? record.name}</h3>
                        <ReportTable
                            records={record.linked_expenses ?? []}
                            visible={[
                                'title',
                                'vendor',
                                'allocated_amount',
                                'actual_amount',
                                'variance',
                            ]}
                        />
                        {!options.hiddenBlocks.includes('details') &&
                            record.linked_expenses?.map((expense) => (
                                <div
                                    key={expense.id}
                                    className="section-report-detail"
                                >
                                    <h3>{expense.title}</h3>
                                    {expense.notes && (
                                        <p className="section-report-text">
                                            {expense.notes}
                                        </p>
                                    )}
                                    <Conditions expense={expense} />
                                </div>
                            ))}
                    </div>
                ));
        }
    }
    return (
        <ReportDocument
            ref={ref}
            options={options}
            tenantName={tenantName}
            year={data.year}
            logoUrl={data.logoUrl}
            createdAt={createdAt}
            label={labels[data.resource]}
            filters={data.filters}
            counts={
                <>
                    <strong>{data.records.length}</strong> voci nel report ·{' '}
                    <strong>{data.totals.count}</strong> spese nei totali ·{' '}
                    <strong>{data.totals.incomplete}</strong> con dati
                    incompleti
                </>
            }
        >
            {options.blocks
                .filter((block) => !options.hiddenBlocks.includes(block))
                .map((block) => {
                    const Icon = icons[block];
                    return (
                        <section
                            key={block}
                            data-report-block={block}
                            aria-label={options.titles[block]}
                            className={
                                block === 'kpis' || block === 'totals'
                                    ? 'budget-report-block'
                                    : undefined
                            }
                        >
                            <h2>
                                <Icon aria-hidden="true" />
                                {options.titles[block]}
                            </h2>
                            {renderBlock(block)}
                        </section>
                    );
                })}
        </ReportDocument>
    );
}
export function SectionPrintDialog({
    data,
    tenantName,
    onClose,
}: {
    data: SectionReportData;
    tenantName: string;
    onClose: () => void;
}) {
    const columnLabels = Object.fromEntries(
        sectionColumns[data.resource].map((column) => [
            column,
            columns[column],
        ]),
    ) as Record<Column, string>;
    return (
        <ReportPrintDialog
            defaults={defaultSectionReportOptions(data, tenantName)}
            columnLabels={columnLabels}
            blockLabels={blocks}
            blockIcons={icons}
            label={labels[data.resource]}
            tenantName={tenantName}
            logoUrl={data.logoUrl}
            year={data.year}
            onClose={onClose}
            renderReport={(options, ref, createdAt) => (
                <SectionReport
                    ref={ref}
                    data={data}
                    options={options}
                    tenantName={tenantName}
                    createdAt={createdAt}
                />
            )}
        />
    );
}

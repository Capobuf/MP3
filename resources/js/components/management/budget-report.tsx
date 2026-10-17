import type { Ref } from 'react';
import type { Row, Table } from '@tanstack/react-table';
import { BudgetSankey } from './budget-sankey';
import { budgetLabels, budgetTypes } from './budget-types';
import type { BudgetEntry, BudgetSnapshot } from './budget-types';
import { money } from './helpers';

export const budgetReportColumns = {
    description: 'Descrizione',
    type: 'Tipo',
    vendor: 'Fornitore',
    center: 'Centro di costo',
    allocated: 'Allocato',
    actual: 'Effettivo',
    variance: 'Scostamento',
};
export type BudgetReportColumn = keyof typeof budgetReportColumns;
export type BudgetReportData = {
    budget: BudgetSnapshot;
    columns: { id: BudgetReportColumn; visible: boolean }[];
    filters: string[];
};
export type BudgetReportOptions = {
    title: string;
    orientation: 'portrait' | 'landscape';
    kpis: boolean;
    chart: boolean;
    table: boolean;
    columns: BudgetReportColumn[];
    logo: string | null;
};

export function captureBudgetReport(
    table: Table<BudgetEntry>,
    summary: BudgetSnapshot,
    filters: string[],
): BudgetReportData {
    const entries = new Map(summary.entries.map((entry) => [entry.id, entry]));
    // Sorted leaves include collapsed groups, independently of selection/pagination.
    const leaves = (rows: Row<BudgetEntry>[]): Row<BudgetEntry>[] =>
        rows.flatMap((row) =>
            row.getIsGrouped() ? leaves(row.subRows) : [row],
        );
    const rows = leaves(table.getSortedRowModel().rows);
    return {
        budget: {
            ...summary,
            entries: rows.map((row) => {
                const entry = entries.get(row.original.id);
                if (!entry)
                    throw new Error(
                        'Dati del Budget cambiati. Aggiorna il Budget prima di stampare.',
                    );
                return entry;
            }),
        },
        columns: table
            .getAllLeafColumns()
            .filter((column) => Object.hasOwn(budgetReportColumns, column.id))
            .map((column) => ({
                id: column.id as BudgetReportColumn,
                visible: column.getIsVisible(),
            })),
        filters,
    };
}

function amount(value: string | null, variance = false) {
    return value === null && variance ? 'Non confrontabile' : money(value);
}

function reportCell(entry: BudgetEntry, column: BudgetReportColumn) {
    switch (column) {
        case 'description':
            return entry.description;
        case 'type':
            return budgetLabels[entry.type];
        case 'vendor':
            return entry.vendor?.name ?? 'Senza fornitore';
        case 'center':
            return entry.cost_center?.name ?? 'Senza centro di costo';
        default:
            return amount(entry[column], column === 'variance');
    }
}

export function BudgetReport({
    data,
    options,
    tenantName,
    year,
    createdAt,
    ref,
}: {
    data: BudgetReportData;
    options: BudgetReportOptions;
    tenantName: string;
    year: number;
    createdAt: string;
    ref?: Ref<HTMLElement>;
}) {
    const { budget } = data;
    const { totals } = budget;
    const metrics = ['allocated', 'actual', 'variance'] as const;
    return (
        <article
            ref={ref}
            className="budget-report"
            data-orientation={options.orientation}
            aria-label="Anteprima report Budget"
        >
            <header className="budget-report-header">
                <div className="budget-report-heading">
                    <p className="budget-report-eyebrow">
                        <span className="budget-report-brand">MP3</span>
                        {tenantName}
                    </p>
                    <h1>{options.title}</h1>
                    <p className="budget-report-subtitle">
                        Report economico · Budget annuale
                    </p>
                </div>
                <div className="budget-report-identity">
                    {options.logo && (
                        <img src={options.logo} alt={`Logo ${tenantName}`} />
                    )}
                    <p className="budget-report-year">
                        <span>Esercizio</span>
                        <strong>{year}</strong>
                    </p>
                </div>
            </header>
            <div className="budget-report-scope">
                <div className="budget-report-scope-heading">
                    <strong>Perimetro del report</strong>
                    <span>Elaborato il {createdAt}</span>
                </div>
                <p>{data.filters.join(' · ')}</p>
                <p className="budget-report-counts">
                    <strong>{budget.entries.length}</strong> righe nel report ·{' '}
                    <strong>{totals.count}</strong> voci incluse nei totali ·{' '}
                    <strong>{totals.incomplete}</strong> con dati incompleti
                </p>
            </div>
            {options.kpis && (
                <section
                    className="budget-report-block"
                    aria-label="Riepilogo KPI"
                >
                    <h2>Riepilogo economico</h2>
                    <dl className="budget-report-kpis">
                        {metrics.map((metric) => (
                            <div key={metric} data-metric={metric}>
                                <dt>{budgetReportColumns[metric]}</dt>
                                <dd>
                                    {amount(
                                        totals[metric],
                                        metric === 'variance',
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}
            {options.chart && (
                <section
                    className="budget-report-block"
                    aria-label="Ripartizione Budget"
                >
                    <h2>Ripartizione del Budget · Allocato</h2>
                    <BudgetSankey
                        budget={budget}
                        printWidth={
                            options.orientation === 'portrait' ? 680 : 1008
                        }
                    />
                    <table
                        className="budget-report-distribution"
                        aria-label="Importi della ripartizione"
                    >
                        <thead>
                            <tr>
                                <th scope="col">Tipo</th>
                                <th scope="col">Flussi positivi</th>
                                <th scope="col">Rettifiche negative</th>
                                <th scope="col">Allocato netto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {budgetTypes.map((type) => (
                                <tr key={type}>
                                    <th scope="row">{budgetLabels[type]}</th>
                                    <td>
                                        {money(
                                            budget.groups[type]
                                                .allocated_positive,
                                        )}
                                    </td>
                                    <td>
                                        {money(
                                            budget.groups[type]
                                                .allocated_negative,
                                        )}
                                    </td>
                                    <td>
                                        {money(budget.groups[type].allocated)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="budget-report-note">
                        Il grafico rappresenta i soli flussi allocati positivi.
                        Rettifiche negative e importi mancanti non generano
                        flussi; i totali netti li rispettano secondo le regole
                        del Budget.
                    </p>
                </section>
            )}
            {options.table && (
                <section aria-label="Tabella analitica">
                    <h2>Voci del Budget</h2>
                    {budget.entries.length === 0 ? (
                        <p>Nessuna voce corrisponde ai filtri selezionati.</p>
                    ) : (
                        <table className="budget-report-entries">
                            <thead>
                                <tr>
                                    <th
                                        scope="col"
                                        className="budget-report-status"
                                    >
                                        Stato
                                    </th>
                                    {options.columns.map((column) => (
                                        <th
                                            scope="col"
                                            key={column}
                                            data-column={column}
                                        >
                                            {budgetReportColumns[column]}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {budget.entries.map((entry) => (
                                    <tr
                                        key={entry.id}
                                        data-entry-id={entry.id}
                                        data-included={entry.included}
                                    >
                                        <td>
                                            <span className="budget-report-status-label">
                                                {entry.included
                                                    ? 'Inclusa'
                                                    : 'Esclusa'}
                                            </span>
                                            {entry.incomplete > 0 && (
                                                <small>Dati incompleti</small>
                                            )}
                                        </td>
                                        {options.columns.map((column) => (
                                            <td
                                                key={column}
                                                data-column={column}
                                                className={
                                                    metrics.some(
                                                        (metric) =>
                                                            metric === column,
                                                    )
                                                        ? 'budget-report-money'
                                                        : undefined
                                                }
                                            >
                                                {reportCell(entry, column)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <div className="budget-report-block budget-report-totals">
                        <h3>Totale delle voci incluse nel report</h3>
                        <dl className="budget-report-kpis">
                            {metrics.map((metric) => (
                                <div key={metric} data-metric={metric}>
                                    <dt>{budgetReportColumns[metric]}</dt>
                                    <dd>
                                        {amount(
                                            totals[metric],
                                            metric === 'variance',
                                        )}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </section>
            )}
            <footer className="budget-report-note budget-report-footer">
                Le voci escluse non contribuiscono ai totali. «Da inserire»
                indica un importo mancante, distinto da zero. Le spese già
                attribuite ad altre voci non vengono conteggiate due volte.
                <p className="budget-report-signature">
                    <strong>MP3</strong>
                    <span>
                        {tenantName} · Budget {year}
                    </span>
                </p>
            </footer>
        </article>
    );
}

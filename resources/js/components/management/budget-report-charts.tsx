import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';
import { compactMoney, percent, topGroups } from './analytics-helpers';
import type { EconomicGroup } from './analytics-types';
import type { BudgetSnapshot } from './budget-types';
import { money } from './helpers';

export type BudgetReportChartKind =
    | 'completeness'
    | 'distribution'
    | 'vendors'
    | 'projects'
    | 'contracts'
    | 'variances';
const colors = [
    '#637fa9',
    '#aa7744',
    '#668570',
    '#9279a8',
    '#b58b56',
    '#668f98',
    '#8a8c99',
    '#9b6275',
];

// Vendor totals use the same server accounting as the Budget; source charts use its attributed entries.
export function budgetReportGroups(
    budget: BudgetSnapshot,
    kind: 'vendors' | 'projects' | 'contracts',
): EconomicGroup[] {
    if (kind === 'vendors')
        return Object.entries(budget.vendor_groups).map(([id, totals]) => ({
            ...totals,
            id,
            name:
                id === 'none'
                    ? 'Senza fornitore'
                    : budget.entries.find(
                          (entry) => String(entry.vendor?.id) === id,
                      )!.vendor!.name,
        }));
    return budget.entries
        .filter(
            (entry) =>
                entry.included &&
                entry.type === (kind === 'projects' ? 'project' : 'contract'),
        )
        .map((entry) => ({ ...entry, name: entry.description, count: 1 }));
}

export function budgetReportVariances(budget: BudgetSnapshot): EconomicGroup[] {
    const comparable = budget.entries.filter(
        (entry) => entry.included && entry.variance !== null,
    );
    return [
        ...comparable
            .filter((entry) => Number(entry.variance) > 0)
            .toSorted(
                (a, b) =>
                    Number(b.variance) - Number(a.variance) || a.id - b.id,
            )
            .slice(0, 5),
        ...comparable
            .filter((entry) => Number(entry.variance) < 0)
            .toSorted(
                (a, b) =>
                    Number(a.variance) - Number(b.variance) || a.id - b.id,
            )
            .slice(0, 5),
    ].map((entry) => ({ ...entry, name: entry.description, count: 1 }));
}

export function BudgetReportChart({
    kind,
    budget,
    width,
}: {
    kind: BudgetReportChartKind;
    budget: BudgetSnapshot;
    width: number;
}) {
    if (kind === 'completeness') {
        const rows = [
            {
                name: 'Voci complete',
                value: budget.totals.count - budget.totals.incomplete,
            },
            {
                name: 'Voci con dati incompleti',
                value: budget.totals.incomplete,
            },
        ];
        return budget.totals.count === 0 ? (
            <p>Nessuna voce inclusa nel report.</p>
        ) : (
            <div className="budget-report-block">
                <PieChart width={width} height={180}>
                    <Pie
                        data={rows}
                        dataKey="value"
                        innerRadius={40}
                        outerRadius={75}
                        isAnimationActive={false}
                    >
                        {rows.map((row, index) => (
                            <Cell key={row.name} fill={colors[index]} />
                        ))}
                    </Pie>
                </PieChart>
                <table className="budget-report-distribution">
                    <thead>
                        <tr>
                            <th scope="col">Completezza</th>
                            <th scope="col">Voci incluse</th>
                            <th scope="col">Percentuale</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={row.name}>
                                <th scope="row">
                                    <span
                                        className="budget-report-chart-key"
                                        style={{ background: colors[index] }}
                                    />
                                    {row.name}
                                </th>
                                <td>{row.value}</td>
                                <td>
                                    {percent(
                                        (row.value * 100) / budget.totals.count,
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    if (kind === 'distribution') {
        const rows = topGroups(
            budgetReportGroups(budget, 'vendors'),
            6,
            'actual',
            true,
        );
        const positive = Number(budget.totals.actual_positive);
        return positive <= 0 ? (
            <p>Nessun flusso effettivo positivo nel report.</p>
        ) : (
            <div className="budget-report-block">
                <h3>Effettivo · flussi positivi</h3>
                <PieChart width={width} height={180}>
                    <Pie
                        data={rows.map((row) => ({
                            ...row,
                            value: Number(row.actual_positive),
                        }))}
                        dataKey="value"
                        innerRadius={40}
                        outerRadius={75}
                        isAnimationActive={false}
                    >
                        {rows.map((row, index) => (
                            <Cell
                                key={row.id}
                                fill={colors[index % colors.length]}
                            />
                        ))}
                    </Pie>
                </PieChart>
                <table className="budget-report-distribution">
                    <thead>
                        <tr>
                            <th scope="col">Fornitore</th>
                            <th scope="col">Flussi positivi</th>
                            <th scope="col">Percentuale</th>
                            <th scope="col">Effettivo netto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={row.id}>
                                <th scope="row">
                                    <span
                                        className="budget-report-chart-key"
                                        style={{
                                            background:
                                                colors[index % colors.length],
                                        }}
                                    />
                                    {row.name}
                                </th>
                                <td>{money(row.actual_positive)}</td>
                                <td>
                                    {percent(
                                        (Number(row.actual_positive) * 100) /
                                            positive,
                                    )}
                                </td>
                                <td>{money(row.actual)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="budget-report-note">
                    Le percentuali rappresentano i flussi effettivi positivi;
                    gli importi netti comprendono le rettifiche negative.
                </p>
            </div>
        );
    }
    const rows =
        kind === 'variances'
            ? budgetReportVariances(budget)
            : topGroups(budgetReportGroups(budget, kind), 10, 'actual');
    if (!rows.length)
        return (
            <p>
                Nessuna voce{' '}
                {kind === 'variances'
                    ? 'con scostamento non nullo confrontabile'
                    : 'inclusa'}{' '}
                nel report.
            </p>
        );
    // Small chart batches remain intact on an A4 page; the table carries full labels and exact amounts.
    return (
        <>
            <p className="budget-report-note">
                {kind === 'variances'
                    ? 'Fino a 5 maggiori sforamenti e 5 maggiori risparmi, come nella panoramica.'
                    : 'Prime 10 voci per effettivo; le restanti sono aggregate in «Altri», come nella panoramica.'}
            </p>
            {Array.from({ length: Math.ceil(rows.length / 6) }, (_, page) => {
                const batch = rows.slice(page * 6, page * 6 + 6);
                const metrics =
                    kind === 'variances'
                        ? (['variance'] as const)
                        : (['allocated', 'actual'] as const);
                const data = batch.map((row, index) => ({
                    label: `${page * 6 + index + 1}`,
                    allocated:
                        row.allocated === null ? null : Number(row.allocated),
                    actual: row.actual === null ? null : Number(row.actual),
                    variance:
                        row.variance === null ? null : Number(row.variance),
                }));
                return (
                    <div className="budget-report-chart-batch" key={page}>
                        <p className="budget-report-note">
                            {kind === 'variances'
                                ? 'Scostamento confrontabile'
                                : 'Allocato (blu) · Effettivo (ocra)'}{' '}
                            · voci {page * 6 + 1}–{page * 6 + batch.length}
                        </p>
                        <div className="budget-report-block">
                            <BarChart
                                width={width}
                                height={batch.length * 30 + 40}
                                data={data}
                                layout="vertical"
                                margin={{
                                    left: 0,
                                    right: 30,
                                    top: 5,
                                    bottom: 5,
                                }}
                            >
                                <CartesianGrid
                                    horizontal={false}
                                    stroke="#dbe3ed"
                                />
                                <XAxis
                                    type="number"
                                    tickFormatter={compactMoney}
                                    tick={{ fill: '#52647d', fontSize: 11 }}
                                />
                                <YAxis
                                    dataKey="label"
                                    type="category"
                                    width={30}
                                    tick={{ fill: '#182841', fontSize: 11 }}
                                />
                                <ReferenceLine x={0} stroke="#52647d" />
                                {metrics.map((metric, index) => (
                                    <Bar
                                        key={metric}
                                        dataKey={metric}
                                        fill={colors[index]}
                                        isAnimationActive={false}
                                    />
                                ))}
                            </BarChart>
                        </div>
                        <table className="budget-report-distribution">
                            <thead>
                                <tr>
                                    <th scope="col">Voce</th>
                                    <th scope="col">Allocato</th>
                                    <th scope="col">Effettivo</th>
                                    {kind === 'variances' && (
                                        <th scope="col">Scostamento</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {batch.map((row, index) => (
                                    <tr key={row.id}>
                                        <th scope="row">
                                            {page * 6 + index + 1}. {row.name}
                                        </th>
                                        <td>{money(row.allocated)}</td>
                                        <td>{money(row.actual)}</td>
                                        {kind === 'variances' && (
                                            <td>
                                                {row.variance === null
                                                    ? 'Non confrontabile'
                                                    : money(row.variance)}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })}
        </>
    );
}

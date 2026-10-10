import { useState } from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import { cents, palette, percent, topGroups } from './analytics-helpers';
import type {
    EconomicGroup,
    EconomicValues,
    GroupId,
    Metric,
} from './analytics-types';
import {
    AnalyticsCard,
    EmptyChart,
    MetricSelect,
    Reconciliation,
} from './analytics-ui';
import { money } from './helpers';

export function DistributionChart({
    title,
    rows,
    values,
    vendorConcentration = false,
    onSelect,
}: {
    title: string;
    rows: EconomicGroup[];
    values: EconomicValues;
    vendorConcentration?: boolean;
    onSelect?: (id: GroupId) => void;
}) {
    const [metric, setMetric] = useState<Metric>('actual');
    const key = `${metric}_positive` as const;
    const total = cents(values[key]);
    const groups = (
        vendorConcentration ? topGroups(rows, 6, metric, true) : rows
    ).filter((row) => cents(row[key]) > 0);
    const data = groups.map((row, index) => ({
        ...row,
        value: Number(row[key]),
        fill: palette[index % palette.length],
    }));
    const concentration = rows
        .filter((row) => row.id !== 'none')
        .toSorted((a, b) => cents(b[key]) - cents(a[key]))
        .slice(0, 3)
        .reduce((sum, row) => sum + cents(row[key]), 0);
    const select = (id: GroupId) => {
        if (id !== 'others') onSelect?.(id);
    };
    return (
        <AnalyticsCard
            title={title}
            description="Quote sul totale positivo lordo della metrica selezionata. Le rettifiche sono riportate separatamente."
            controls={<MetricSelect value={metric} onChange={setMetric} />}
        >
            {total <= 0 ? (
                <EmptyChart>
                    Nessun importo positivo da rappresentare.
                </EmptyChart>
            ) : (
                <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <ChartContainer
                        className="h-64 w-full"
                        config={{
                            value: {
                                label:
                                    metric === 'actual'
                                        ? 'Effettivo positivo'
                                        : 'Allocato positivo',
                                color: 'var(--chart-1)',
                            },
                        }}
                    >
                        <PieChart>
                            <ChartTooltip
                                content={
                                    <ChartTooltipContent
                                        nameKey="name"
                                        hideLabel
                                        formatter={(value, name) => (
                                            <span>
                                                {name}: {money(Number(value))} ·{' '}
                                                {percent(
                                                    (Number(value) * 10000) /
                                                        total,
                                                )}
                                            </span>
                                        )}
                                    />
                                }
                            />
                            <Pie
                                data={data}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="58%"
                                outerRadius="85%"
                                paddingAngle={2}
                                onClick={(_row, index) =>
                                    select(data[index].id)
                                }
                                isAnimationActive={false}
                            >
                                {data.map((row) => (
                                    <Cell
                                        key={row.id}
                                        fill={row.fill}
                                        className={
                                            onSelect && row.id !== 'others'
                                                ? 'cursor-pointer'
                                                : ''
                                        }
                                    />
                                ))}
                            </Pie>
                        </PieChart>
                    </ChartContainer>
                    <dl className="space-y-3 text-xs">
                        {data.map((row) => (
                            <div
                                key={row.id}
                                className="flex items-start justify-between gap-2"
                            >
                                <dt className="flex min-w-0 items-start gap-2">
                                    <span
                                        className="mt-0.5 size-2.5 shrink-0 rounded-sm"
                                        style={{ background: row.fill }}
                                    />
                                    <button
                                        type="button"
                                        className="text-left break-words hover:underline disabled:no-underline"
                                        disabled={
                                            !onSelect || row.id === 'others'
                                        }
                                        onClick={() => select(row.id)}
                                    >
                                        {row.name}
                                    </button>
                                </dt>
                                <dd className="shrink-0 text-right">
                                    {money(row.value)}
                                    <br />
                                    <span className="text-muted-foreground">
                                        {percent(
                                            (cents(row[key]) * 100) / total,
                                        )}
                                    </span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
                Denominatore: {money(values[key])} di importi positivi.
                {vendorConcentration && total > 0 && (
                    <>
                        {' '}
                        Quota dei primi tre fornitori:{' '}
                        {percent((concentration * 100) / total)} (esclude «Senza
                        fornitore» dal numeratore).
                    </>
                )}
            </p>
            <Reconciliation values={values} metric={metric} />
        </AnalyticsCard>
    );
}

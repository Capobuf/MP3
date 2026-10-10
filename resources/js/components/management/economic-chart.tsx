import { useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
} from '@/components/ui/chart';
import { compactMoney, economicConfig, topGroups } from './analytics-helpers';
import type { EconomicGroup, GroupId, Metric } from './analytics-types';
import { AnalyticsCard, EmptyChart, MetricSelect } from './analytics-ui';
import { money, varianceTextClass } from './helpers';

export type ChartRow = EconomicGroup;
export function EconomicChart({
    title,
    rows,
    onSelect,
}: {
    title: string;
    rows: EconomicGroup[];
    onSelect: (id: GroupId) => void;
}) {
    const [metric, setMetric] = useState<Metric>('actual');
    const groups = topGroups(rows, 10, metric);
    const data = groups.map((row) => ({
        ...row,
        allocated: row.allocated === null ? null : Number(row.allocated),
        actual: row.actual === null ? null : Number(row.actual),
    }));
    const select = (id: GroupId) => {
        if (id !== 'others') onSelect(id);
    };
    return (
        <AnalyticsCard
            title={title}
            description="Primi 10 per la metrica selezionata, Altri e gruppi senza associazione. Clic per filtrare."
            controls={<MetricSelect value={metric} onChange={setMetric} />}
        >
            {data.every(
                (row) => row.allocated === null && row.actual === null,
            ) ? (
                <EmptyChart>
                    Nessun importo disponibile nel perimetro selezionato.
                </EmptyChart>
            ) : (
                <ChartContainer
                    className="w-full"
                    style={{ height: Math.max(320, data.length * 48 + 65) }}
                    config={economicConfig}
                >
                    <BarChart
                        accessibilityLayer
                        layout="vertical"
                        data={data}
                        margin={{ left: 0, right: 15 }}
                    >
                        <CartesianGrid horizontal={false} />
                        <XAxis
                            type="number"
                            tickFormatter={compactMoney}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            type="category"
                            dataKey="name"
                            width={130}
                            interval={0}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(name: string) =>
                                name.length > 23
                                    ? `${name.slice(0, 22)}…`
                                    : name
                            }
                        />
                        <ReferenceLine x={0} stroke="var(--muted-foreground)" />
                        <ChartTooltip
                            content={({ active, payload }) => {
                                const row = payload?.[0]?.payload as
                                    | (typeof data)[number]
                                    | undefined;
                                return active && row ? (
                                    <div className="chart-tooltip">
                                        <p className="mb-2 font-medium">
                                            {row.name}
                                        </p>
                                        <p>
                                            Allocato:{' '}
                                            {row.allocated === null
                                                ? 'Non disponibile'
                                                : money(row.allocated)}
                                        </p>
                                        <p>
                                            Effettivo:{' '}
                                            {row.actual === null
                                                ? 'Non disponibile'
                                                : money(row.actual)}
                                        </p>
                                        <p>
                                            Scostamento confrontabile:{' '}
                                            <span
                                                className={varianceTextClass(
                                                    row.variance,
                                                )}
                                            >
                                                {row.variance === null
                                                    ? 'Non disponibile'
                                                    : money(row.variance)}
                                            </span>
                                        </p>
                                        <p className="mt-2 text-muted-foreground">
                                            {row.count} spese · {row.incomplete}{' '}
                                            incomplete
                                        </p>
                                    </div>
                                ) : null;
                            }}
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        {(['allocated', 'actual'] as const).map((key) => (
                            <Bar
                                key={key}
                                dataKey={key}
                                fill={`var(--color-${key})`}
                                radius={3}
                                maxBarSize={14}
                                className="cursor-pointer"
                                onClick={(_row, index) =>
                                    select(data[index].id)
                                }
                                isAnimationActive="auto"
                                animationBegin={key === 'allocated' ? 60 : 140}
                                animationDuration={650}
                                animationEasing="cubic-bezier(0.22,1,0.36,1)"
                            />
                        ))}
                    </BarChart>
                </ChartContainer>
            )}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {groups
                    .filter((row) => row.id !== 'others')
                    .map((row) => (
                        <button
                            key={row.id}
                            type="button"
                            className="max-w-full rounded text-left break-words text-primary focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => select(row.id)}
                            title={row.name}
                        >
                            {row.name}
                        </button>
                    ))}
            </div>
        </AnalyticsCard>
    );
}

import { useState } from 'react';
import { ChartLabel } from './chart-label';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ReferenceLine,
    Rectangle,
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
import {
    AnalyticsCard,
    ChartReset,
    EmptyChart,
    MetricSelect,
} from './analytics-ui';
import { money, varianceTextClass } from './helpers';

export type ChartRow = EconomicGroup;
export function EconomicChart({
    title,
    rows,
    getHref,
}: {
    title: string;
    rows: EconomicGroup[];
    getHref: (id: GroupId) => string | undefined;
}) {
    const [metric, setMetric] = useState<Metric>('actual');
    const [selected, setSelected] = useState<GroupId | null>(null);
    const source =
        selected === null || selected === 'others'
            ? rows
            : rows.filter((row) => row.id === selected);
    const groups = topGroups(source, 10, metric);
    const data = groups
        .filter((row) => selected === null || row.id === selected)
        .map((row) => ({
            ...row,
            allocated: row.allocated === null ? null : Number(row.allocated),
            actual: row.actual === null ? null : Number(row.actual),
        }));
    const select = (id: GroupId) => {
        setSelected((current) => (current === id ? null : id));
    };
    return (
        <AnalyticsCard
            title={title}
            controls={
                <div className="flex items-center gap-2">
                    <MetricSelect value={metric} onChange={setMetric} />
                    {selected !== null && (
                        <ChartReset onReset={() => setSelected(null)} />
                    )}
                </div>
            }
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
                            tick={({ x, y, index, payload }) => {
                                const row = data[index];
                                if (!row || row.name !== payload.value)
                                    return <g />;
                                return (
                                    <g transform={`translate(${x},${y})`}>
                                        <ChartLabel
                                            x={-120}
                                            y={0}
                                            width={120}
                                            name={row.name}
                                            href={getHref(row.id)}
                                        />
                                    </g>
                                );
                            }}
                        />
                        <ReferenceLine x={0} stroke="var(--muted-foreground)" />
                        <ChartTooltip
                            shared={false}
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
                                onClick={(row) =>
                                    select((row.payload as ChartRow).id)
                                }
                                shape={(props) => {
                                    const row = props.payload as
                                        | ChartRow
                                        | undefined;
                                    if (!row) return <g />;
                                    return (
                                        <Rectangle
                                            {...props}
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={row.id === selected}
                                            aria-label={`Filtra ${row.name}`}
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === 'Enter' ||
                                                    event.key === ' '
                                                ) {
                                                    event.preventDefault();
                                                    select(row.id);
                                                }
                                            }}
                                        />
                                    );
                                }}
                                isAnimationActive="auto"
                                animationBegin={0}
                                animationDuration={650}
                                animationEasing="ease-out"
                            />
                        ))}
                    </BarChart>
                </ChartContainer>
            )}
        </AnalyticsCard>
    );
}

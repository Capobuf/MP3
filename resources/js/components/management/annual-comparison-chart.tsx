import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
} from '@/components/ui/chart';
import { compactMoney, economicConfig } from './analytics-helpers';
import type { AnnualRow } from './analytics-types';
import { AnalyticsCard, ChartReset, EmptyChart } from './analytics-ui';
import { money } from './helpers';

export function AnnualComparisonChart({
    rows,
    year,
}: {
    rows: AnnualRow[];
    year: number;
}) {
    const [selected, setSelected] = useState<number | null>(null);
    const onSelect = (year: number) =>
        setSelected((current) => (current === year ? null : year));
    const data = rows
        .filter((row) => selected === null || row.year === selected)
        .map((row) => ({
            ...row,
            allocated: row.allocated === null ? null : Number(row.allocated),
            actual: row.actual === null ? null : Number(row.actual),
        }));
    return (
        <AnalyticsCard
            title="Confronto economico annuale"
            controls={
                selected !== null && (
                    <ChartReset onReset={() => setSelected(null)} />
                )
            }
        >
            {data.every(
                (row) => row.allocated === null && row.actual === null,
            ) ? (
                <EmptyChart>
                    Nessun importo disponibile negli anni del perimetro.
                </EmptyChart>
            ) : (
                <ChartContainer className="h-80 w-full" config={economicConfig}>
                    <BarChart accessibilityLayer data={data}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="year"
                            tickLine={false}
                            axisLine={false}
                            interval={0}
                            tick={({ x, y, payload }) => (
                                <g
                                    transform={`translate(${x},${y})`}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Seleziona anno ${payload.value}`}
                                    aria-pressed={
                                        Number(payload.value) === selected
                                    }
                                    className="cursor-pointer outline-none focus:opacity-70"
                                    onClick={() =>
                                        onSelect(Number(payload.value))
                                    }
                                    onKeyDown={(event) => {
                                        if (
                                            event.key === 'Enter' ||
                                            event.key === ' '
                                        ) {
                                            event.preventDefault();
                                            onSelect(Number(payload.value));
                                        }
                                    }}
                                >
                                    <text
                                        textAnchor="middle"
                                        dy={12}
                                        fill="var(--muted-foreground)"
                                    >
                                        {payload.value}
                                    </text>
                                </g>
                            )}
                        />
                        <YAxis
                            tickFormatter={compactMoney}
                            width={78}
                            tickLine={false}
                            axisLine={false}
                        />
                        <ChartTooltip
                            content={(props) => {
                                const row = props.payload?.[0]?.payload as
                                    | (typeof data)[number]
                                    | undefined;
                                return props.active && row ? (
                                    <div className="chart-tooltip">
                                        <p className="font-medium">
                                            {row.year}
                                        </p>
                                        <p className="mt-2">
                                            Allocato:{' '}
                                            {row.allocated === null
                                                ? 'Non disponibile'
                                                : money(row.allocated)}{' '}
                                            · Effettivo:{' '}
                                            {row.actual === null
                                                ? 'Non disponibile'
                                                : money(row.actual)}
                                        </p>
                                        <p className="mt-1 text-muted-foreground">
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
                                radius={[4, 4, 0, 0]}
                                className="cursor-pointer"
                                onClick={(_row, index) =>
                                    onSelect(data[index].year)
                                }
                                isAnimationActive="auto"
                                animationBegin={0}
                                animationDuration={650}
                                animationEasing="ease-out"
                            >
                                {data.map((row) => (
                                    <Cell
                                        key={row.year}
                                        fillOpacity={
                                            row.year === (selected ?? year)
                                                ? 1
                                                : 0.45
                                        }
                                        stroke={
                                            row.year === (selected ?? year)
                                                ? `var(--color-${key})`
                                                : 'none'
                                        }
                                        strokeWidth={2}
                                    />
                                ))}
                            </Bar>
                        ))}
                    </BarChart>
                </ChartContainer>
            )}
        </AnalyticsCard>
    );
}
import { useState } from 'react';

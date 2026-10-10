import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import { compactMoney, economicConfig } from './analytics-helpers';
import type { AnnualRow } from './analytics-types';
import { AnalyticsCard, EmptyChart } from './analytics-ui';
import { money } from './helpers';

export function AnnualComparisonChart({
    rows,
    year,
    onSelect,
}: {
    rows: AnnualRow[];
    year: number;
    onSelect: (year: number) => void;
}) {
    const data = rows.map((row) => ({
        ...row,
        allocated: row.allocated === null ? null : Number(row.allocated),
        actual: row.actual === null ? null : Number(row.actual),
    }));
    return (
        <AnalyticsCard
            title="Confronto economico annuale"
            description={`Fino a sei anni disponibili, fino al ${year}. Stessi filtri economici; clic su un anno per selezionarlo.`}
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
                                    <div className="rounded-lg border bg-background p-3 text-xs shadow-md">
                                        <ChartTooltipContent
                                            active={props.active}
                                            payload={props.payload}
                                            labelFormatter={() =>
                                                String(row.year)
                                            }
                                            formatter={(value, name) => (
                                                <span>
                                                    {
                                                        economicConfig[
                                                            name as keyof typeof economicConfig
                                                        ]?.label
                                                    }
                                                    : {money(Number(value))}
                                                </span>
                                            )}
                                        />
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
                                isAnimationActive={false}
                            >
                                {data.map((row) => (
                                    <Cell
                                        key={row.year}
                                        fillOpacity={
                                            row.year === year ? 1 : 0.45
                                        }
                                        stroke={
                                            row.year === year
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
            <div className="mt-3 flex flex-wrap justify-center gap-2">
                {rows.map((row) => (
                    <button
                        type="button"
                        key={row.year}
                        aria-pressed={row.year === year}
                        className={`rounded-md border px-3 py-1 text-xs ${row.year === year ? 'bg-accent font-semibold' : 'text-muted-foreground'}`}
                        onClick={() => onSelect(row.year)}
                    >
                        {row.year}
                    </button>
                ))}
            </div>
        </AnalyticsCard>
    );
}

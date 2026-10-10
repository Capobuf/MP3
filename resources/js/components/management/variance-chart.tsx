import { router } from '@inertiajs/react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { compactMoney } from './analytics-helpers';
import type { VarianceRow } from './analytics-types';
import { AnalyticsCard, EmptyChart } from './analytics-ui';
import { money } from './helpers';

export function VarianceChart({
    rows,
    slug,
    disabled,
}: {
    rows: VarianceRow[];
    slug: string;
    disabled: boolean;
}) {
    const data = rows.map((row) => ({ ...row, value: Number(row.variance) }));
    const extent = Math.max(1, ...data.map((row) => Math.abs(row.value)));
    const open = (id: number) => {
        if (!disabled) router.get(`/t/${slug}/expenses/${id}`);
    };
    return (
        <AnalyticsCard
            title="Principali sforamenti e risparmi"
            description="Cinque maggiori sforamenti e cinque maggiori risparmi. Effettivo − allocato sulle sole spese con entrambi gli importi. Clic per aprire il dettaglio."
        >
            {data.length === 0 ? (
                <EmptyChart>
                    Nessuno scostamento non nullo confrontabile.
                </EmptyChart>
            ) : (
                <ChartContainer
                    className="w-full"
                    style={{ height: Math.max(320, rows.length * 40 + 50) }}
                    config={{
                        value: {
                            label: 'Scostamento',
                            color: 'var(--chart-1)',
                        },
                    }}
                >
                    <BarChart
                        accessibilityLayer
                        layout="vertical"
                        data={data}
                        margin={{ right: 20 }}
                    >
                        <CartesianGrid horizontal={false} />
                        <XAxis
                            type="number"
                            tickFormatter={compactMoney}
                            domain={[-extent, extent]}
                        />
                        <YAxis
                            type="category"
                            dataKey="title"
                            interval={0}
                            width={145}
                            tickFormatter={(title: string) =>
                                title.length > 25
                                    ? `${title.slice(0, 24)}…`
                                    : title
                            }
                            tickLine={false}
                            axisLine={false}
                        />
                        <ReferenceLine x={0} stroke="var(--muted-foreground)" />
                        <ChartTooltip
                            content={({ active, payload }) => {
                                const row = payload?.[0]?.payload as
                                    | VarianceRow
                                    | undefined;
                                return active && row ? (
                                    <div className="max-w-80 rounded-lg border bg-background p-3 font-sans text-xs tabular-nums shadow-md">
                                        <p className="mb-2 font-medium">
                                            {row.title}
                                        </p>
                                        <p>Fornitore: {row.vendor}</p>
                                        <p>Progetto: {row.project}</p>
                                        <p className="mt-2">
                                            Allocato: {money(row.allocated)}
                                        </p>
                                        <p>Effettivo: {money(row.actual)}</p>
                                        <p>
                                            Scostamento: {money(row.variance)}
                                        </p>
                                    </div>
                                ) : null;
                            }}
                        />
                        <Bar
                            dataKey="value"
                            radius={3}
                            maxBarSize={24}
                            className="cursor-pointer"
                            onClick={(_row, index) => open(data[index].id)}
                            isAnimationActive={false}
                        >
                            {data.map((row) => (
                                <Cell
                                    key={row.id}
                                    fill={
                                        row.value > 0
                                            ? 'var(--destructive)'
                                            : 'var(--chart-2)'
                                    }
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ChartContainer>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {rows.map((row) => (
                    <button
                        key={row.id}
                        type="button"
                        disabled={disabled}
                        className="max-w-full truncate text-muted-foreground hover:underline"
                        onClick={() => open(row.id)}
                        title={row.title}
                    >
                        {row.title}
                    </button>
                ))}
            </div>
        </AnalyticsCard>
    );
}

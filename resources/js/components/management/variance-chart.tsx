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
            description="Cinque maggiori sforamenti e risparmi. Seleziona una spesa per aprirla."
        >
            <p className="mb-3 text-sm text-muted-foreground">
                Effettivo − allocato sulle sole spese con entrambi gli importi.
            </p>
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
                                    <div className="chart-tooltip">
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
                            isAnimationActive="auto"
                            animationBegin={60}
                            animationDuration={650}
                            animationEasing="cubic-bezier(0.22,1,0.36,1)"
                        >
                            {data.map((row) => (
                                <Cell
                                    key={row.id}
                                    fill={
                                        row.value > 0
                                            ? 'var(--finance-overrun)'
                                            : 'var(--finance-saving)'
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
                        className="max-w-full rounded text-left break-words text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
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

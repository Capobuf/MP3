import { useState } from 'react';
import { Link } from '@inertiajs/react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ReferenceLine,
    Rectangle,
    XAxis,
    YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { compactMoney } from './analytics-helpers';
import type { VarianceRow } from './analytics-types';
import { AnalyticsCard, ChartReset, EmptyChart } from './analytics-ui';
import { money, varianceTextClass } from './helpers';

export function VarianceChart({
    rows,
    slug,
    disabled,
}: {
    rows: VarianceRow[];
    slug: string;
    disabled: boolean;
}) {
    const [selected, setSelected] = useState<VarianceRow['id'] | null>(null);
    const select = (id: VarianceRow['id']) =>
        setSelected((current) => (current === id ? null : id));
    const displayed = rows.filter(
        (row) => selected === null || row.id === selected,
    );
    const data = displayed.map((row) => ({
        ...row,
        value: Number(row.variance),
    }));
    const extent = Math.max(1, ...data.map((row) => Math.abs(row.value)));
    return (
        <AnalyticsCard
            title="Principali sforamenti e risparmi"
            controls={
                selected !== null && (
                    <ChartReset onReset={() => setSelected(null)} />
                )
            }
        >
            {data.length === 0 ? (
                <EmptyChart>
                    Nessuno scostamento non nullo confrontabile.
                </EmptyChart>
            ) : (
                <ChartContainer
                    className="w-full"
                    style={{ height: Math.max(320, data.length * 40 + 50) }}
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
                            tick={({ x, y, index, payload }) => {
                                const row = data[index];
                                if (!row || row.title !== payload.value)
                                    return <g />;
                                return (
                                    <g transform={`translate(${x},${y})`}>
                                        <Link
                                            href={`/t/${slug}/expenses/${row.id}`}
                                            aria-label={`Apri ${row.title}`}
                                            onClick={(event) => {
                                                if (disabled)
                                                    event.preventDefault();
                                            }}
                                        >
                                            <title>{row.title}</title>
                                            <text
                                                textAnchor="end"
                                                dominantBaseline="middle"
                                                fill="var(--muted-foreground)"
                                            >
                                                {row.title.length > 25
                                                    ? `${row.title.slice(0, 24)}…`
                                                    : row.title}
                                            </text>
                                        </Link>
                                    </g>
                                );
                            }}
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
                                            Scostamento:{' '}
                                            <span
                                                className={varianceTextClass(
                                                    row.variance,
                                                )}
                                            >
                                                {money(row.variance)}
                                            </span>
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
                            onClick={(row) =>
                                select((row.payload as VarianceRow).id)
                            }
                            shape={(props) => {
                                const row = props.payload as
                                    | VarianceRow
                                    | undefined;
                                if (!row) return <g />;
                                return (
                                    <Rectangle
                                        {...props}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Filtra ${row.title}`}
                                        aria-pressed={selected === row.id}
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
        </AnalyticsCard>
    );
}

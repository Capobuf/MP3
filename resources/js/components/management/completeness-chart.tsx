import { useState } from 'react';
import { Bar, BarChart, Rectangle, XAxis, YAxis } from 'recharts';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import { palette, percent } from './analytics-helpers';
import type { Completeness } from './analytics-types';
import { AnalyticsCard, ChartReset, EmptyChart } from './analytics-ui';
const labels = {
    complete: 'Entrambi presenti',
    allocated_only: 'Solo allocato',
    actual_only: 'Solo effettivo',
    missing: 'Nessun importo registrato',
};
export function CompletenessChart({ rows }: { rows: Completeness[] }) {
    const [selected, setSelected] = useState<Completeness['id'] | null>(null);
    const select = (id: Completeness['id']) =>
        setSelected((current) => (current === id ? null : id));
    const displayed = rows.filter(
        (row) => selected === null || row.id === selected,
    );
    const total = displayed.reduce((sum, row) => sum + row.count, 0);
    const config = Object.fromEntries(
        rows.map((row, index) => [
            row.id,
            { label: labels[row.id], color: palette[index] },
        ]),
    );
    return (
        <AnalyticsCard
            title="Importi registrati"
            controls={
                selected !== null && (
                    <ChartReset onReset={() => setSelected(null)} />
                )
            }
        >
            {total === 0 ? (
                <EmptyChart />
            ) : (
                <>
                    <ChartContainer className="h-20 w-full" config={config}>
                        <BarChart
                            accessibilityLayer
                            layout="vertical"
                            data={[
                                Object.fromEntries(
                                    displayed.map((row) => [row.id, row.count]),
                                ),
                            ]}
                        >
                            <XAxis type="number" hide domain={[0, total]} />
                            <YAxis type="category" hide />
                            <ChartTooltip
                                content={
                                    <ChartTooltipContent
                                        hideLabel
                                        formatter={(value, name) => (
                                            <span>
                                                {
                                                    labels[
                                                        name as Completeness['id']
                                                    ]
                                                }
                                                : {value} (
                                                {percent(
                                                    (Number(value) * 100) /
                                                        total,
                                                )}
                                                )
                                            </span>
                                        )}
                                    />
                                }
                            />
                            {displayed.map((row) => (
                                <Bar
                                    key={row.id}
                                    dataKey={row.id}
                                    stackId="complete"
                                    fill={`var(--color-${row.id})`}
                                    className="cursor-pointer"
                                    onClick={() => select(row.id)}
                                    shape={(props) => (
                                        <Rectangle
                                            {...props}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Filtra ${labels[row.id]}`}
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
                                    )}
                                    isAnimationActive="auto"
                                    animationBegin={0}
                                    animationDuration={650}
                                    animationEasing="ease-out"
                                />
                            ))}
                        </BarChart>
                    </ChartContainer>
                    <dl className="mt-5 flex flex-col gap-4 text-sm">
                        {displayed.map((row) => (
                            <div
                                key={row.id}
                                className="flex items-center justify-between gap-3"
                            >
                                <dt className="flex items-center gap-2">
                                    <span
                                        className="size-2.5 shrink-0 rounded-sm"
                                        style={{
                                            background: config[row.id].color,
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="rounded text-left focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-pressed={selected === row.id}
                                        onClick={() => select(row.id)}
                                    >
                                        {labels[row.id]}
                                    </button>
                                </dt>
                                <dd className="font-medium whitespace-nowrap">
                                    {row.count} ·{' '}
                                    {percent((row.count * 100) / total)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </>
            )}
        </AnalyticsCard>
    );
}

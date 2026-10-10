import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import { palette, percent } from './analytics-helpers';
import type { Completeness } from './analytics-types';
import { AnalyticsCard, EmptyChart } from './analytics-ui';
const labels = {
    complete: 'Entrambi presenti',
    allocated_only: 'Solo allocato',
    actual_only: 'Solo effettivo',
    missing: 'Entrambi mancanti',
};
export function CompletenessChart({ rows }: { rows: Completeness[] }) {
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const config = Object.fromEntries(
        rows.map((row, index) => [
            row.id,
            { label: labels[row.id], color: palette[index] },
        ]),
    );
    return (
        <AnalyticsCard
            title="Completezza dei dati"
            description="Presenza degli importi nelle spese filtrate. Zero è un valore presente."
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
                                    rows.map((row) => [row.id, row.count]),
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
                            {rows.map((row, index) => (
                                <Bar
                                    key={row.id}
                                    dataKey={row.id}
                                    stackId="complete"
                                    fill={`var(--color-${row.id})`}
                                    isAnimationActive="auto"
                                    animationBegin={60 + index * 60}
                                    animationDuration={650}
                                    animationEasing="cubic-bezier(0.22,1,0.36,1)"
                                />
                            ))}
                        </BarChart>
                    </ChartContainer>
                    <dl className="mt-5 flex flex-col gap-4 text-sm">
                        {rows.map((row, index) => (
                            <div
                                key={row.id}
                                className="flex items-center justify-between gap-3"
                            >
                                <dt className="flex items-center gap-2">
                                    <span
                                        className="size-2.5 shrink-0 rounded-sm"
                                        style={{ background: palette[index] }}
                                    />
                                    {labels[row.id]}
                                </dt>
                                <dd className="font-medium whitespace-nowrap">
                                    {row.count} · {percent(row.percentage)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <p className="mt-5 text-sm text-muted-foreground">
                        Percentuali su {total} spese.
                    </p>
                </>
            )}
        </AnalyticsCard>
    );
}

import { useState } from 'react';
import { Link } from '@inertiajs/react';
import { Bar, BarChart, Cell, Rectangle, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ContractExpiry } from './analytics-types';
import { AnalyticsCard, ChartReset, EmptyChart } from './analytics-ui';

export function ContractExpiryChart({
    expiry,
    slug,
}: {
    expiry: ContractExpiry;
    slug: string;
}) {
    const [selected, setSelected] = useState<
        ContractExpiry['groups'][number]['id'] | null
    >(null);
    const select = (id: ContractExpiry['groups'][number]['id']) =>
        setSelected((current) => (current === id ? null : id));
    const displayed = expiry.groups.filter(
        (row) => selected === null || row.id === selected,
    );
    const count = expiry.groups.reduce((sum, row) => sum + row.count, 0);
    return (
        <AnalyticsCard
            title="Scadenze contrattuali"
            controls={
                selected !== null && (
                    <ChartReset onReset={() => setSelected(null)} />
                )
            }
        >
            {count === 0 ? (
                <EmptyChart>
                    Nessun contratto scaduto o in scadenza entro 90 giorni.
                </EmptyChart>
            ) : (
                <ChartContainer
                    className="h-80 w-full"
                    config={{
                        count: { label: 'Contratti', color: 'var(--chart-1)' },
                    }}
                >
                    <BarChart
                        accessibilityLayer
                        data={displayed}
                        layout="vertical"
                        margin={{ right: 16 }}
                    >
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis
                            type="category"
                            dataKey="name"
                            width={120}
                            tickLine={false}
                            axisLine={false}
                        />
                        <ChartTooltip
                            content={<ChartTooltipContent labelKey="name" />}
                        />
                        <Bar
                            dataKey="count"
                            radius={3}
                            className="cursor-pointer"
                            onClick={(row) =>
                                select(
                                    (
                                        row.payload as ContractExpiry['groups'][number]
                                    ).id,
                                )
                            }
                            shape={(props) => {
                                const row = props.payload as
                                    | ContractExpiry['groups'][number]
                                    | undefined;
                                if (!row) return <g />;
                                return (
                                    <Rectangle
                                        {...props}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Filtra ${row.name}`}
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
                            {displayed.map((row) => (
                                <Cell
                                    key={row.id}
                                    fill={
                                        row.id === 'expired'
                                            ? 'var(--destructive)'
                                            : 'var(--chart-1)'
                                    }
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ChartContainer>
            )}
            <Button
                className="mt-3 max-w-full whitespace-normal"
                variant="outline"
                asChild
            >
                <Link href={`/t/${slug}/contracts?expiring=1`}>
                    {expiry.upcoming} contratti in scadenza entro 90 giorni
                </Link>
            </Button>
        </AnalyticsCard>
    );
}

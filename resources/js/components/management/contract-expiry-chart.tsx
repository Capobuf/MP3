import { Link } from '@inertiajs/react';
import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ContractExpiry } from './analytics-types';
import { AnalyticsCard, EmptyChart } from './analytics-ui';
import { dateLabel } from './helpers';

export function ContractExpiryChart({
    expiry,
    slug,
}: {
    expiry: ContractExpiry;
    slug: string;
}) {
    const count = expiry.groups.reduce((sum, row) => sum + row.count, 0);
    return (
        <AnalyticsCard
            title="Scadenze contrattuali"
            description={`Tutti i contratti, indipendentemente dai filtri economici. Al ${dateLabel(expiry.asOf)}.`}
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
                        data={expiry.groups}
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
                            isAnimationActive="auto"
                            animationBegin={60}
                            animationDuration={650}
                            animationEasing="cubic-bezier(0.22,1,0.36,1)"
                        >
                            {expiry.groups.map((row) => (
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
            <p className="mt-3 text-sm text-muted-foreground">
                {expiry.undated} contratti senza data finale.
            </p>
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

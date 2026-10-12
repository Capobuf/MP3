import { useState } from 'react';
import { Link } from '@inertiajs/react';
import { Cell, Pie, PieChart, Sector } from 'recharts';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { PieProps, PieSectorDataItem } from 'recharts';
import {
    cents,
    palette,
    percent,
    sumGroups,
    topGroups,
} from './analytics-helpers';
import type {
    EconomicGroup,
    EconomicValues,
    GroupId,
    Metric,
} from './analytics-types';
import {
    AnalyticsCard,
    ChartReset,
    EmptyChart,
    MetricSelect,
    Reconciliation,
} from './analytics-ui';
import { money } from './helpers';

export function DistributionChart({
    title,
    rows,
    values,
    vendorConcentration = false,
    getHref,
}: {
    title: string;
    rows: EconomicGroup[];
    values: EconomicValues;
    vendorConcentration?: boolean;
    getHref?: (id: GroupId) => string | undefined;
}) {
    const [metric, setMetric] = useState<Metric>('actual');
    const [selected, setSelected] = useState<GroupId | null>(null);
    const key = `${metric}_positive` as const;
    const source =
        selected === null || selected === 'others'
            ? rows
            : rows.filter((row) => row.id === selected);
    const groups = (
        vendorConcentration ? topGroups(source, 6, metric, true) : source
    ).filter((row) => cents(row[key]) > 0);
    const data = groups
        .map((row, index) => ({
            ...row,
            value: Number(row[key]),
            fill: palette[index % palette.length],
        }))
        .filter((row) => selected === null || row.id === selected);
    const displayedValues = selected === null ? values : sumGroups(data);
    const total = cents(displayedValues[key]);
    const select = (id: GroupId) => {
        setSelected((current) => (current === id ? null : id));
    };
    const renderSector = (props: PieSectorDataItem, active = false) => {
        const row = props.payload as EconomicGroup | undefined;
        if (!row) return <Sector {...props} />;
        return (
            <Sector
                {...props}
                outerRadius={(props.outerRadius ?? 0) + (active ? 5 : 0)}
                role="button"
                tabIndex={0}
                aria-label={`Filtra ${row.name}`}
                aria-pressed={row.id === selected}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        select(row.id);
                    }
                }}
            />
        );
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
            {total <= 0 ? (
                <EmptyChart>
                    Nessun importo positivo da rappresentare.
                </EmptyChart>
            ) : (
                <div className="grid min-w-0 grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <ChartContainer
                        className="aspect-auto h-64 w-full min-w-0"
                        config={{
                            value: {
                                label:
                                    metric === 'actual'
                                        ? 'Effettivo positivo'
                                        : 'Allocato positivo',
                                color: 'var(--chart-1)',
                            },
                        }}
                    >
                        <PieChart>
                            <ChartTooltip
                                content={
                                    <ChartTooltipContent
                                        nameKey="name"
                                        hideLabel
                                        formatter={(value, name) => (
                                            <span>
                                                {name}: {money(Number(value))} ·{' '}
                                                {percent(
                                                    (Number(value) * 10000) /
                                                        total,
                                                )}
                                            </span>
                                        )}
                                    />
                                }
                            />
                            <Pie
                                shape={(props) => renderSector(props)}
                                activeShape={(props) =>
                                    renderSector(props, true)
                                }
                                data={data}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="58%"
                                outerRadius="85%"
                                paddingAngle={2}
                                onClick={(row) =>
                                    select((row.payload as EconomicGroup).id)
                                }
                                isAnimationActive="auto"
                                animationBegin={60}
                                animationDuration={700}
                                // Pie's 3.8 types omit cubic-bezier; its runtime uses the same parser as Bar.
                                animationEasing={
                                    'cubic-bezier(0.22,1,0.36,1)' as PieProps['animationEasing']
                                }
                            >
                                {data.map((row) => (
                                    <Cell
                                        key={row.id}
                                        fill={row.fill}
                                        className="cursor-pointer"
                                    />
                                ))}
                            </Pie>
                        </PieChart>
                    </ChartContainer>
                    <dl className="flex flex-col gap-3 text-sm">
                        {data.map((row) => {
                            const href = getHref?.(row.id);
                            return (
                                <div
                                    key={row.id}
                                    className="flex flex-wrap items-start justify-between gap-2"
                                >
                                    <dt className="flex min-w-0 flex-1 basis-28 items-start gap-2">
                                        <span
                                            className="mt-0.5 size-2.5 shrink-0 rounded-sm"
                                            style={{ background: row.fill }}
                                        />
                                        {href ? (
                                            <Link
                                                href={href}
                                                className="min-w-0 rounded text-left break-words hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {row.name}
                                            </Link>
                                        ) : (
                                            <span className="min-w-0 break-words">
                                                {row.name}
                                            </span>
                                        )}
                                    </dt>
                                    <dd className="shrink-0 text-right financial-value">
                                        {money(row.value)}
                                        <br />
                                        <span className="text-muted-foreground">
                                            {percent(
                                                (cents(row[key]) * 100) / total,
                                            )}
                                        </span>
                                    </dd>
                                </div>
                            );
                        })}
                    </dl>
                </div>
            )}
            <Reconciliation values={displayedValues} metric={metric} />
        </AnalyticsCard>
    );
}

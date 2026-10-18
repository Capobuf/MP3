import { Link } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Rectangle,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';
import {
    addMonths,
    endOfYear,
    format,
    parseISO,
    startOfYear,
    subMonths,
} from 'date-fns';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { it } from 'date-fns/locale';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import { dateLabel } from './helpers';

export type TimelineContract = {
    id: number;
    display_name: string;
    year: number | null;
    starts_on: string | null;
    ends_on: string | null;
};

export function ContractTimeline({
    records,
    year,
    today,
    href,
    undatedHref,
}: {
    records: TimelineContract[];
    year: number;
    today: string;
    href: (record: TimelineContract) => string;
    undatedHref: string;
}) {
    const dated = records.filter((record) => record.ends_on !== null);
    const undated = records.filter((record) => record.ends_on === null);
    const todayDate = parseISO(today);
    const focusToday = year === todayDate.getFullYear();
    const recentStart = subMonths(todayDate, 1).getTime();
    const first = Math.min(
        focusToday ? recentStart : Infinity,
        startOfYear(new Date(year, 0, 1)).getTime(),
        ...dated.map((record) =>
            parseISO(record.starts_on ?? record.ends_on!).getTime(),
        ),
    );
    const last = Math.max(
        focusToday ? addMonths(todayDate, 3).getTime() : -Infinity,
        endOfYear(new Date(year, 0, 1)).getTime(),
        ...dated.map((record) => parseISO(record.ends_on!).getTime()),
    );
    const [window, setWindow] = useState<[number, number] | null>(null);
    const [start, end] = window ?? [focusToday ? recentStart : first, last];
    const span = end - start;
    const todayTime = parseISO(today).getTime();
    const chartRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{
        x: number;
        start: number;
        end: number;
        width: number;
        active: boolean;
        moved: boolean;
    } | null>(null);
    const move = useCallback(
        (nextStart: number, width: number) => {
            const boundedStart = Math.max(
                first,
                Math.min(last - width, nextStart),
            );
            setWindow([boundedStart, boundedStart + width]);
        },
        [first, last],
    );
    const zoom = useCallback(
        (factor: number, anchor = 0.5) => {
            const width = Math.min(
                last - first,
                Math.max(7 * 86400000, span * factor),
            );
            move(start + (span - width) * anchor, width);
        },
        [first, last, start, span, move],
    );

    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const wheel = (event: WheelEvent) => {
            const plot = chart
                .querySelector('.recharts-cartesian-grid')
                ?.getBoundingClientRect();
            if (
                !plot ||
                !plot.width ||
                event.clientX < plot.left ||
                event.clientX > plot.right ||
                event.clientY < plot.top ||
                event.clientY > plot.bottom
            )
                return;
            event.preventDefault();
            const delta =
                event.deltaY *
                (event.deltaMode === 1
                    ? 16
                    : event.deltaMode === 2
                      ? plot.height
                      : 1);
            zoom(
                Math.exp(Math.max(-100, Math.min(100, delta)) * 0.003),
                (event.clientX - plot.left) / plot.width,
            );
        };
        // React wheel handlers are passive: prevent page scrolling only over the plot.
        chart.addEventListener('wheel', wheel, { passive: false });
        return () => chart.removeEventListener('wheel', wheel);
    }, [zoom]);

    const data = dated.map((record) => {
        const finish = parseISO(record.ends_on!).getTime();
        const begin = record.starts_on
            ? parseISO(record.starts_on).getTime()
            : finish;
        return {
            ...record,
            interval: finish >= start && begin <= end ? [begin, finish] : null,
        };
    });

    return (
        <div className="flex min-w-0 flex-col gap-4">
            {dated.length > 0 && (
                <>
                    <span
                        className="text-sm text-muted-foreground"
                        role="status"
                        aria-label="Periodo visualizzato"
                    >
                        {format(start, 'dd MMM yyyy', { locale: it })} –{' '}
                        {format(end, 'dd MMM yyyy', { locale: it })}
                    </span>
                    <div
                        role="region"
                        aria-label="Timeline delle scadenze"
                        className="min-w-0 overflow-x-auto"
                    >
                        <ChartContainer
                            ref={chartRef}
                            tabIndex={0}
                            aria-label="Grafico scadenze: usa più e meno per lo zoom, frecce per spostarti, Home per ripristinare"
                            className="w-full min-w-[540px] cursor-grab select-none active:cursor-grabbing"
                            onKeyDown={(event) => {
                                if (event.target !== event.currentTarget)
                                    return;
                                if (
                                    [
                                        '+',
                                        '=',
                                        '-',
                                        'ArrowLeft',
                                        'ArrowRight',
                                        'Home',
                                    ].includes(event.key)
                                )
                                    event.preventDefault();
                                if (event.key === '+' || event.key === '=')
                                    zoom(0.8);
                                if (event.key === '-') zoom(1.25);
                                if (event.key === 'ArrowLeft')
                                    move(start - span / 4, span);
                                if (event.key === 'ArrowRight')
                                    move(start + span / 4, span);
                                if (event.key === 'Home') setWindow(null);
                            }}
                            onDoubleClick={(event) => {
                                if (!(event.target as Element).closest('a'))
                                    setWindow(null);
                            }}
                            onDragStart={(event) => event.preventDefault()}
                            onPointerDown={(event) => {
                                drag.current = null;
                                if (
                                    event.pointerType !== 'mouse' ||
                                    event.button !== 0
                                )
                                    return;
                                const plot = event.currentTarget
                                    .querySelector('.recharts-cartesian-grid')
                                    ?.getBoundingClientRect();
                                if (
                                    !plot ||
                                    !plot.width ||
                                    event.clientX < plot.left ||
                                    event.clientX > plot.right ||
                                    event.clientY < plot.top ||
                                    event.clientY > plot.bottom
                                )
                                    return;
                                drag.current = {
                                    x: event.clientX,
                                    start,
                                    end,
                                    width: plot.width,
                                    active: true,
                                    moved: false,
                                };
                            }}
                            onPointerMove={(event) => {
                                const current = drag.current;
                                if (!current?.active) return;
                                if (event.buttons !== 1) {
                                    current.active = false;
                                    return;
                                }
                                const distance = event.clientX - current.x;
                                if (!current.moved && Math.abs(distance) < 4)
                                    return;
                                current.moved = true;
                                event.currentTarget.setPointerCapture(
                                    event.pointerId,
                                );
                                const width = current.end - current.start;
                                move(
                                    current.start -
                                        (distance * width) / current.width,
                                    width,
                                );
                            }}
                            onPointerUp={() => {
                                if (drag.current) drag.current.active = false;
                            }}
                            onLostPointerCapture={() => {
                                if (drag.current) drag.current.active = false;
                            }}
                            onPointerCancel={() => {
                                drag.current = null;
                            }}
                            onClickCapture={(event) => {
                                if (drag.current?.moved) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    drag.current.moved = false;
                                }
                            }}
                            style={{
                                height: Math.max(220, dated.length * 52 + 70),
                            }}
                            config={{
                                interval: {
                                    label: 'Durata contratto',
                                    color: 'var(--chart-1)',
                                },
                            }}
                        >
                            <BarChart
                                accessibilityLayer
                                layout="vertical"
                                data={data}
                                margin={{
                                    top: 24,
                                    right: 24,
                                    bottom: 12,
                                    left: 8,
                                }}
                            >
                                <CartesianGrid horizontal={false} />
                                <XAxis
                                    type="number"
                                    scale="time"
                                    domain={[start, end]}
                                    allowDataOverflow
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={35}
                                    tickFormatter={(value: number) =>
                                        format(
                                            value,
                                            span > 180 * 86400000
                                                ? 'MMM yyyy'
                                                : 'dd MMM',
                                            { locale: it },
                                        )
                                    }
                                />
                                <YAxis
                                    type="category"
                                    dataKey="id"
                                    width={160}
                                    interval={0}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={({ x, y, payload }) => {
                                        const record = dated.find(
                                            (item) => item.id === payload.value,
                                        );
                                        if (!record) return <g />;
                                        return (
                                            <Link
                                                href={href(record)}
                                                aria-label={record.display_name}
                                            >
                                                <text
                                                    x={x}
                                                    y={y}
                                                    dy={4}
                                                    textAnchor="end"
                                                    fill="currentColor"
                                                >
                                                    <title>
                                                        {record.display_name}
                                                    </title>
                                                    {record.display_name
                                                        .length > 23
                                                        ? `${record.display_name.slice(0, 22)}…`
                                                        : record.display_name}
                                                </text>
                                            </Link>
                                        );
                                    }}
                                />
                                <ChartTooltip
                                    cursor={false}
                                    content={
                                        <ChartTooltipContent
                                            hideIndicator
                                            labelFormatter={(_, payload) =>
                                                payload[0]?.payload.display_name
                                            }
                                            formatter={(_, __, item) => (
                                                <span className="text-muted-foreground">
                                                    {item.payload.starts_on
                                                        ? dateLabel(
                                                              item.payload
                                                                  .starts_on,
                                                          )
                                                        : 'Inizio non indicato'}
                                                    {' → '}
                                                    {dateLabel(
                                                        item.payload.ends_on,
                                                    )}
                                                </span>
                                            )}
                                        />
                                    }
                                />
                                {todayTime >= start && todayTime <= end && (
                                    <ReferenceLine
                                        x={todayTime}
                                        stroke="var(--destructive)"
                                        strokeDasharray="4 4"
                                        label={{
                                            value: 'Oggi',
                                            position: 'top',
                                            fill: 'var(--destructive)',
                                        }}
                                    />
                                )}
                                <Bar
                                    dataKey="interval"
                                    fill="var(--color-interval)"
                                    radius={4}
                                    barSize={20}
                                    minPointSize={6}
                                    isAnimationActive={false}
                                    shape={(props) => {
                                        const record =
                                            props.payload as TimelineContract;
                                        return (
                                            <Link
                                                href={href(record)}
                                                aria-label={`${record.display_name}, scadenza ${dateLabel(record.ends_on)}`}
                                            >
                                                <Rectangle {...props} />
                                            </Link>
                                        );
                                    }}
                                />
                            </BarChart>
                        </ChartContainer>
                    </div>
                </>
            )}
            {undated.length > 0 && (
                <Button
                    variant="link"
                    size="sm"
                    className="self-start px-0"
                    asChild
                >
                    <Link href={undatedHref}>
                        Senza scadenza
                        <Badge variant="secondary">{undated.length}</Badge>
                        <ArrowUpRight
                            data-icon="inline-end"
                            aria-hidden="true"
                        />
                    </Link>
                </Button>
            )}
        </div>
    );
}

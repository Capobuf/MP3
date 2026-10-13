import { Link } from '@inertiajs/react';
import { useState } from 'react';
import { Sankey } from 'recharts';
import type { SankeyLinkProps, SankeyNodeProps } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { buildSankey, economicConfig, sumGroups } from './analytics-helpers';
import type {
    EntityFilter,
    ExpenseAnalytics,
    GroupId,
    Metric,
    SankeyNode,
    SankeyMode,
} from './analytics-types';
import {
    AnalyticsCard,
    ChartReset,
    EmptyChart,
    Reconciliation,
} from './analytics-ui';
import { money } from './helpers';

export function ExpenseSankey({
    analytics,
    getHref,
}: {
    analytics: ExpenseAnalytics;
    getHref: (field: EntityFilter, id: GroupId) => string | undefined;
}) {
    const [metric, setMetric] = useState<SankeyMode>('comparison');
    const [destination, setDestination] = useState<'projects' | 'contracts'>(
        'projects',
    );
    const [hovered, setHovered] = useState<
        | { type: 'node'; index: number; x: number; y: number; value: number }
        | { type: 'link'; index: number; x: number; y: number }
        | null
    >(null);
    const [selected, setSelected] = useState<{
        field: EntityFilter;
        id: GroupId;
    } | null>(null);
    const field = destination === 'projects' ? 'project_id' : 'contract_id';
    const pairs = analytics.pairs[destination].filter(
        (pair) =>
            selected === null ||
            (selected.field === 'vendor_id'
                ? pair.vendor_id
                : pair.destination_id) === selected.id,
    );
    const vendors =
        selected === null
            ? analytics.vendors
            : analytics.vendors.map((row) => ({
                  ...row,
                  ...sumGroups(
                      pairs.filter((pair) => pair.vendor_id === row.id),
                  ),
              }));
    const destinations =
        selected === null
            ? analytics[destination]
            : analytics[destination].map((row) => ({
                  ...row,
                  ...sumGroups(
                      pairs.filter((pair) => pair.destination_id === row.id),
                  ),
              }));
    const data = buildSankey(pairs, vendors, destinations, field);
    const isolate = (value: Metric) =>
        setMetric((current) => (current === value ? 'comparison' : value));
    const activeLinks = new Set<number>();
    if (hovered?.type === 'link' && data.links[hovered.index]) {
        const flow = data.links[hovered.index];
        const vendor = flow.source === 0 ? flow.target : flow.source;
        data.links.forEach((link, index) => {
            if (
                (link.source === 0 && link.target === vendor) ||
                (flow.source === 0
                    ? link.source === vendor
                    : index === hovered.index)
            )
                activeLinks.add(index);
        });
    } else if (hovered?.type === 'node' && data.nodes[hovered.index]) {
        const node = data.nodes[hovered.index];
        const vendors = new Set<number>();
        if (node.field === 'vendor_id') vendors.add(hovered.index);
        if (node.field === field) {
            data.links.forEach((link) => {
                if (link.target === hovered.index) vendors.add(link.source);
            });
        }
        data.links.forEach((link, index) => {
            if (
                hovered.index === 0 ||
                (link.source === 0 && vendors.has(link.target)) ||
                (vendors.has(link.source) &&
                    (node.field === 'vendor_id' ||
                        link.target === hovered.index))
            )
                activeLinks.add(index);
        });
    }
    const activeNodes = new Set(
        [...activeLinks].flatMap((index) => [
            data.links[index].source,
            data.links[index].target,
        ]),
    );
    const select = (node: SankeyNode) => {
        if (node.field && node.id !== undefined && node.id !== 'others') {
            setHovered(null);
            const selection = { field: node.field, id: node.id };
            setSelected((current) =>
                current?.field === selection.field &&
                current.id === selection.id
                    ? null
                    : selection,
            );
        }
    };
    const renderNode = ({
        x,
        y,
        width,
        height,
        index,
        payload,
    }: SankeyNodeProps) => {
        const node = data.nodes[index];
        if (!node) return <g />;
        const target = node.field === field;
        const actionable = !!node.field && node.id !== 'others';
        const href =
            node.field && node.id !== undefined
                ? getHref(node.field, node.id)
                : undefined;
        const explore = () =>
            setHovered({
                type: 'node',
                index,
                x: x + width / 2,
                y: y + height / 2,
                value: payload.value,
            });
        const label = (
            <text
                x={target ? x - 8 : x + width + 8}
                y={y + height / 2}
                textAnchor={target ? 'end' : 'start'}
                dominantBaseline="middle"
                fill="var(--foreground)"
                stroke="var(--card)"
                strokeWidth={3}
                strokeLinejoin="round"
                paintOrder="stroke"
                fontSize={12}
            >
                {node.name.length > 25
                    ? `${node.name.slice(0, 24)}…`
                    : node.name}
            </text>
        );
        return (
            <g
                onMouseEnter={explore}
                onMouseLeave={() => setHovered(null)}
                onFocus={explore}
                onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                        setHovered(null);
                }}
            >
                <title>
                    {node.name}: riferimento geometrico {money(payload.value)}
                </title>
                <rect
                    role={actionable ? 'button' : 'img'}
                    tabIndex={0}
                    aria-label={actionable ? `Filtra ${node.name}` : node.name}
                    aria-pressed={
                        actionable
                            ? selected?.field === node.field &&
                              selected?.id === node.id
                            : undefined
                    }
                    onClick={() => select(node)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') setHovered(null);
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            select(node);
                        }
                    }}
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={
                        node.field === 'vendor_id'
                            ? 'var(--chart-2)'
                            : 'var(--chart-1)'
                    }
                    rx={3}
                    stroke={
                        hovered && activeNodes.has(index)
                            ? 'var(--ring)'
                            : 'transparent'
                    }
                    strokeWidth={2}
                    opacity={hovered && !activeNodes.has(index) ? 0.4 : 1}
                    className={
                        actionable
                            ? 'cursor-pointer transition-[opacity,stroke] duration-200 outline-none focus:opacity-70 motion-reduce:transition-none'
                            : 'transition-[opacity,stroke] duration-200 motion-reduce:transition-none'
                    }
                />
                {href ? (
                    <Link href={href} aria-label={`Apri ${node.name}`}>
                        <title>{node.name}</title>
                        {label}
                    </Link>
                ) : (
                    label
                )}
            </g>
        );
    };
    const renderLink = ({
        sourceX,
        sourceY,
        sourceControlX,
        targetX,
        targetY,
        targetControlX,
        linkWidth,
        index,
    }: SankeyLinkProps) => {
        const flow = data.links[index];
        const metrics: Metric[] =
            metric === 'comparison' ? ['allocated', 'actual'] : [metric];
        // Recharts uses one global value-to-height ratio; each lane reserves half of it.
        const laneWidth = metric === 'comparison' ? linkWidth / 2 : linkWidth;
        const ribbon = (offset: number, width: number) => {
            const top = offset - width / 2;
            const bottom = offset + width / 2;
            return `M${sourceX},${sourceY + top} C${sourceControlX},${sourceY + top} ${targetControlX},${targetY + top} ${targetX},${targetY + top} L${targetX},${targetY + bottom} C${targetControlX},${targetY + bottom} ${sourceControlX},${sourceY + bottom} ${sourceX},${sourceY + bottom} Z`;
        };
        const highlighted = !hovered || activeLinks.has(index);
        const explore = () =>
            setHovered({
                type: 'link',
                index,
                x: (sourceX + targetX) / 2,
                y: (sourceY + targetY) / 2,
            });
        const metricLabel = (key: Metric) =>
            `${economicConfig[key].label} positivo: ${flow.values[key] === null ? 'Non disponibile' : money(flow.values[`${key}_positive`])}`;
        return (
            <g
                role="img"
                tabIndex={0}
                aria-label={`${data.nodes[flow.source].name} → ${data.nodes[flow.target].name}. ${metricLabel('allocated')}. ${metricLabel('actual')}. Scostamento confrontabile: ${flow.values.variance === null ? 'Non determinabile' : money(flow.values.variance)}`}
                onMouseEnter={explore}
                onMouseLeave={() => setHovered(null)}
                onFocus={explore}
                onBlur={() => setHovered(null)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') setHovered(null);
                }}
                className="outline-none focus-visible:[&>path:first-child]:stroke-[var(--ring)]"
            >
                <path
                    d={ribbon(0, linkWidth)}
                    fill="transparent"
                    stroke="transparent"
                    pointerEvents="all"
                />
                {metrics.map((key) => {
                    const amount = Number(flow.values[`${key}_positive`]);
                    if (amount <= 0) return null;
                    const offset =
                        metric === 'comparison'
                            ? ((key === 'allocated' ? -1 : 1) * linkWidth) / 4
                            : 0;
                    return (
                        <path
                            key={key}
                            className="recharts-sankey-link"
                            d={ribbon(
                                offset,
                                (laneWidth * amount) / flow.value,
                            )}
                            fill={economicConfig[key].color}
                            fillOpacity={highlighted ? 0.8 : 0.1}
                            pointerEvents="none"
                        />
                    );
                })}
            </g>
        );
    };
    return (
        <AnalyticsCard
            title="Flussi economici"
            controls={
                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={metric}
                        onValueChange={(value) => {
                            setHovered(null);
                            setMetric(value as SankeyMode);
                        }}
                    >
                        <SelectTrigger
                            className="w-32"
                            aria-label="Modalità dei flussi"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="comparison">
                                    Confronto
                                </SelectItem>
                                <SelectItem value="allocated">
                                    Allocato
                                </SelectItem>
                                <SelectItem value="actual">
                                    Effettivo
                                </SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    <Select
                        value={destination}
                        onValueChange={(value) => {
                            setHovered(null);
                            setSelected(null);
                            setDestination(value as 'projects' | 'contracts');
                        }}
                    >
                        <SelectTrigger
                            className="w-32"
                            aria-label="Destinazione dei flussi"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="projects">
                                    Progetti
                                </SelectItem>
                                <SelectItem value="contracts">
                                    Contratti
                                </SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    {selected !== null && (
                        <ChartReset
                            onReset={() => {
                                setSelected(null);
                                setHovered(null);
                            }}
                        />
                    )}
                </div>
            }
        >
            <div
                className="mb-3 flex flex-wrap justify-center gap-4"
                role="group"
                aria-label="Legenda dei flussi"
            >
                {(['allocated', 'actual'] as const).map((key) => (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={metric === key}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => isolate(key)}
                    >
                        <span
                            className="size-3 rounded-sm"
                            style={{
                                background: economicConfig[key].color,
                                opacity:
                                    metric === 'comparison' || metric === key
                                        ? 1
                                        : 0.3,
                            }}
                        />
                        {economicConfig[key].label}
                    </button>
                ))}
            </div>
            {data.links.length === 0 ||
            (metric !== 'comparison' &&
                !data.links.some(
                    (link) => Number(link.values[`${metric}_positive`]) > 0,
                )) ? (
                <EmptyChart>
                    Nessun flusso positivo nel perimetro selezionato.
                </EmptyChart>
            ) : (
                <div className="max-w-full overflow-x-auto">
                    <ChartContainer
                        className="h-[420px] w-full min-w-[820px]"
                        config={economicConfig}
                    >
                        <Sankey
                            data={data}
                            node={renderNode}
                            nodeWidth={14}
                            nodePadding={24}
                            margin={{
                                top: 16,
                                bottom: 16,
                                left: 12,
                                right: 12,
                            }}
                            link={renderLink}
                        >
                            <ChartTooltip
                                active={hovered !== null}
                                isAnimationActive={false}
                                position={
                                    hovered
                                        ? { x: hovered.x, y: hovered.y }
                                        : undefined
                                }
                                // Recharts has no mouse payload on SVG focus, so visibility follows exploration.
                                wrapperStyle={{
                                    visibility: hovered ? 'visible' : 'hidden',
                                }}
                                content={() => {
                                    const flow =
                                        hovered?.type === 'link' &&
                                        data.links[hovered.index]
                                            ? {
                                                  ...data.links[hovered.index],
                                                  source: data.nodes[
                                                      data.links[hovered.index]
                                                          .source
                                                  ],
                                                  target: data.nodes[
                                                      data.links[hovered.index]
                                                          .target
                                                  ],
                                              }
                                            : hovered?.type === 'node'
                                              ? {
                                                    name: data.nodes[
                                                        hovered.index
                                                    ]?.name,
                                                    value: hovered.value,
                                                    values: undefined,
                                                    source: undefined,
                                                    target: undefined,
                                                }
                                              : undefined;
                                    return flow ? (
                                        <div className="chart-tooltip">
                                            <p className="mb-1 font-medium">
                                                {flow.source && flow.target
                                                    ? `${flow.source.name} → ${flow.target.name}`
                                                    : flow.name}
                                            </p>
                                            {flow.values ? (
                                                <>
                                                    <p>
                                                        Allocato positivo:{' '}
                                                        {flow.values
                                                            .allocated === null
                                                            ? 'Non disponibile'
                                                            : money(
                                                                  flow.values
                                                                      .allocated_positive,
                                                              )}
                                                    </p>
                                                    <p>
                                                        Effettivo positivo:{' '}
                                                        {flow.values.actual ===
                                                        null
                                                            ? 'Non disponibile'
                                                            : money(
                                                                  flow.values
                                                                      .actual_positive,
                                                              )}
                                                    </p>
                                                    <p>
                                                        Scostamento
                                                        confrontabile:{' '}
                                                        {flow.values
                                                            .variance === null
                                                            ? 'Non determinabile'
                                                            : money(
                                                                  flow.values
                                                                      .variance,
                                                              )}
                                                    </p>
                                                </>
                                            ) : (
                                                <p>
                                                    Riferimento geometrico:{' '}
                                                    {money(flow.value)}
                                                </p>
                                            )}
                                        </div>
                                    ) : null;
                                }}
                            />
                        </Sankey>
                    </ChartContainer>
                </div>
            )}
            <Reconciliation
                values={
                    selected === null ? analytics.current : sumGroups(pairs)
                }
                metric={metric}
            />
        </AnalyticsCard>
    );
}

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
} from './analytics-types';
import {
    AnalyticsCard,
    ChartReset,
    EmptyChart,
    MetricSelect,
} from './analytics-ui';
import { money } from './helpers';

type FlowDestination = 'projects' | 'contracts' | 'vendors';

export function ExpenseSankey({
    analytics,
    getHref,
}: {
    analytics: ExpenseAnalytics;
    getHref: (field: EntityFilter, id: GroupId) => string | undefined;
}) {
    const [metric, setMetric] = useState<Metric>('actual');
    const color = economicConfig[metric].color;
    const [destination, setDestination] = useState<FlowDestination>('projects');
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);
    const [selected, setSelected] = useState<{
        field: EntityFilter;
        id: GroupId;
    } | null>(null);
    const field = {
        projects: 'project_id',
        contracts: 'contract_id',
        vendors: 'vendor_id',
    }[destination] as EntityFilter;
    const pairs = analytics.pairs[
        destination === 'vendors' ? 'projects' : destination
    ].filter(
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
        destination === 'vendors'
            ? []
            : selected === null
              ? analytics[destination]
              : analytics[destination].map((row) => ({
                    ...row,
                    ...sumGroups(
                        pairs.filter((pair) => pair.destination_id === row.id),
                    ),
                }));
    const data = buildSankey(pairs, vendors, destinations, metric, field);
    const activeKey = data.nodes.find((node) => node.key === hoveredKey)?.key;
    const select = (node: SankeyNode) => {
        if (node.field && node.id !== undefined && node.id !== 'others') {
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
        const label = (
            <text
                x={target ? x - 8 : x + width + 8}
                y={y + height / 2}
                textAnchor={target ? 'end' : 'start'}
                dominantBaseline="middle"
                fill="var(--foreground)"
                fontSize={12}
            >
                {node.name.length > 25
                    ? `${node.name.slice(0, 24)}…`
                    : node.name}
            </text>
        );
        return (
            <g
                onMouseEnter={() => setHoveredKey(node.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onFocus={() => setHoveredKey(node.key)}
                onBlur={() => setHoveredKey(null)}
            >
                <title>
                    {node.name}: {money(payload.value)}
                </title>
                <rect
                    role={actionable ? 'button' : undefined}
                    tabIndex={actionable ? 0 : undefined}
                    aria-label={actionable ? `Filtra ${node.name}` : node.name}
                    aria-pressed={
                        actionable
                            ? selected?.field === node.field &&
                              selected?.id === node.id
                            : undefined
                    }
                    onClick={() => select(node)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            select(node);
                        }
                    }}
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={color}
                    rx={3}
                    stroke={
                        activeKey === node.key ? 'var(--ring)' : 'transparent'
                    }
                    strokeWidth={2}
                    opacity={activeKey && activeKey !== node.key ? 0.7 : 1}
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
    }: SankeyLinkProps) => (
        <path
            className="recharts-sankey-link transition-[stroke-opacity] duration-200 motion-reduce:transition-none"
            d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
            fill="none"
            stroke={color}
            strokeWidth={linkWidth}
            strokeOpacity={
                activeKey
                    ? data.nodes[data.links[index].source].key === activeKey ||
                      data.nodes[data.links[index].target].key === activeKey
                        ? 0.5
                        : 0.08
                    : 0.25
            }
        />
    );
    return (
        <AnalyticsCard
            title="Flussi economici"
            controls={
                <div className="flex flex-wrap items-center gap-2">
                    <MetricSelect
                        value={metric}
                        onChange={(value) => {
                            setHoveredKey(null);
                            setMetric(value);
                        }}
                    />
                    <Select
                        value={destination}
                        onValueChange={(value) => {
                            setHoveredKey(null);
                            setSelected(null);
                            setDestination(value as FlowDestination);
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
                                <SelectItem value="vendors">
                                    Fornitori
                                </SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    {selected !== null && (
                        <ChartReset onReset={() => setSelected(null)} />
                    )}
                </div>
            }
        >
            {data.links.length === 0 ? (
                <EmptyChart>
                    Nessun flusso positivo nel perimetro selezionato.
                </EmptyChart>
            ) : (
                <div className="max-w-full overflow-x-auto">
                    <ChartContainer
                        className="h-[420px] w-full min-w-[820px]"
                        config={{
                            value: {
                                label: 'Volume positivo',
                                color,
                            },
                        }}
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
                                content={({ active, payload }) => {
                                    const item = payload?.[0]?.payload as
                                        | {
                                              payload?: {
                                                  name?: string;
                                                  value?: number;
                                                  source?: { name: string };
                                                  target?: { name: string };
                                              };
                                          }
                                        | undefined;
                                    const flow = item?.payload;
                                    return active && flow ? (
                                        <div className="chart-tooltip">
                                            <p className="mb-1 font-medium">
                                                {flow.source && flow.target
                                                    ? `${flow.source.name} → ${flow.target.name}`
                                                    : flow.name}
                                            </p>
                                            <p>{money(flow.value)}</p>
                                        </div>
                                    ) : null;
                                }}
                            />
                        </Sankey>
                    </ChartContainer>
                </div>
            )}
        </AnalyticsCard>
    );
}

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
    EconomicValues,
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
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);
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
                    {node.name}: riferimento geometrico {money(payload.value)}
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
                    fill={
                        node.field === 'vendor_id'
                            ? 'var(--chart-2)'
                            : 'var(--chart-1)'
                    }
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
    }: SankeyLinkProps) => {
        const flow = data.links[index];
        const metrics: Metric[] =
            metric === 'comparison' ? ['allocated', 'actual'] : [metric];
        const ordered = metrics.toSorted(
            (a, b) =>
                Number(flow.values[`${b}_positive`]) -
                Number(flow.values[`${a}_positive`]),
        );
        const d = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
        const highlighted =
            !activeKey ||
            data.nodes[flow.source].key === activeKey ||
            data.nodes[flow.target].key === activeKey;
        return (
            <g>
                {ordered.map((key, layer) => {
                    const amount = Number(flow.values[`${key}_positive`]);
                    if (amount <= 0) return null;
                    return (
                        <path
                            key={key}
                            role="button"
                            tabIndex={0}
                            aria-label={`${economicConfig[key].label}: ${data.nodes[flow.source].name} → ${data.nodes[flow.target].name}`}
                            aria-pressed={metric === key}
                            onClick={() => isolate(key)}
                            onKeyDown={(event) => {
                                if (
                                    event.key === 'Enter' ||
                                    event.key === ' '
                                ) {
                                    event.preventDefault();
                                    isolate(key);
                                }
                            }}
                            className="recharts-sankey-link cursor-pointer outline-none focus:stroke-[var(--ring)]"
                            d={d}
                            fill="none"
                            stroke={economicConfig[key].color}
                            strokeWidth={(linkWidth * amount) / flow.value}
                            // Equal widths use alternating strokes to keep both colors selectable.
                            strokeDasharray={
                                metric === 'comparison' &&
                                layer === 1 &&
                                flow.values.allocated_positive ===
                                    flow.values.actual_positive
                                    ? '8 8'
                                    : undefined
                            }
                            strokeOpacity={highlighted ? 0.65 : 0.08}
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
                            setHoveredKey(null);
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
                            setHoveredKey(null);
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
                        <ChartReset onReset={() => setSelected(null)} />
                    )}
                </div>
            }
        >
            <div
                className="mb-3 flex flex-wrap justify-center gap-4"
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
                                content={({ active, payload }) => {
                                    const item = payload?.[0]?.payload as
                                        | {
                                              payload?: {
                                                  name?: string;
                                                  value?: number;
                                                  values?: EconomicValues;
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
                                            {flow.values ? (
                                                <>
                                                    <p>
                                                        Allocato:{' '}
                                                        {money(
                                                            flow.values
                                                                .allocated,
                                                        )}
                                                    </p>
                                                    <p>
                                                        Effettivo:{' '}
                                                        {money(
                                                            flow.values.actual,
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

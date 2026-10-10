import { useState } from 'react';
import { Sankey } from 'recharts';
import type { SankeyNodeProps } from 'recharts';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { buildSankey } from './analytics-helpers';
import type {
    EntityFilter,
    ExpenseAnalytics,
    GroupId,
    Metric,
    SankeyNode,
} from './analytics-types';
import {
    AnalyticsCard,
    EmptyChart,
    MetricSelect,
    Reconciliation,
} from './analytics-ui';
import { money } from './helpers';

export function ExpenseSankey({
    analytics,
    onSelect,
}: {
    analytics: ExpenseAnalytics;
    onSelect: (field: EntityFilter, id: GroupId) => void;
}) {
    const [metric, setMetric] = useState<Metric>('actual');
    const [destination, setDestination] = useState<'projects' | 'contracts'>(
        'projects',
    );
    const field = destination === 'projects' ? 'project_id' : 'contract_id';
    const data = buildSankey(
        analytics.pairs[destination],
        analytics.vendors,
        analytics[destination],
        metric,
        field,
    );
    const select = (node: SankeyNode) => {
        if (node.field && node.id !== undefined && node.id !== 'others')
            onSelect(node.field, node.id);
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
        const target = node.field === field;
        const actionable = !!node.field && node.id !== 'others';
        return (
            <g
                role={actionable ? 'button' : undefined}
                tabIndex={actionable ? 0 : undefined}
                aria-label={actionable ? `Filtra ${node.name}` : node.name}
                className={
                    actionable
                        ? 'cursor-pointer outline-none focus:opacity-70'
                        : ''
                }
                onClick={() => select(node)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        select(node);
                    }
                }}
            >
                <title>
                    {node.name}: {money(payload.value)}
                </title>
                <rect
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
                />
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
            </g>
        );
    };
    return (
        <AnalyticsCard
            title="Flussi economici"
            description={`Spese → Fornitori → ${destination === 'projects' ? 'Progetti' : 'Contratti'}. Volume positivo lordo; ogni spesa contribuisce una volta per livello. Clic sui nodi per filtrare.`}
            controls={
                <div className="flex flex-wrap gap-2">
                    <MetricSelect value={metric} onChange={setMetric} />
                    <Select
                        value={destination}
                        onValueChange={(value) =>
                            setDestination(value as 'projects' | 'contracts')
                        }
                    >
                        <SelectTrigger
                            className="w-32"
                            aria-label="Destinazione dei flussi"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="projects">Progetti</SelectItem>
                            <SelectItem value="contracts">Contratti</SelectItem>
                        </SelectContent>
                    </Select>
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
                                color: 'var(--chart-1)',
                            },
                        }}
                    >
                        <Sankey
                            key={`${metric}:${destination}`}
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
                            link={{
                                stroke: 'var(--chart-1)',
                                strokeOpacity: 0.25,
                            }}
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
                                        <div className="max-w-80 rounded-lg border bg-background p-3 font-sans text-xs tabular-nums shadow-md">
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
            <Reconciliation values={analytics.current} metric={metric} />
            <p className="mt-3 text-xs text-muted-foreground">
                Totale netto = positivi − valore assoluto delle rettifiche.
                “Altri” raggruppa oltre i sei principali fornitori e
                destinazioni; i gruppi senza associazione restano distinti.
            </p>
        </AnalyticsCard>
    );
}

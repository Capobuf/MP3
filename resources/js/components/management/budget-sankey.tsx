import { useState } from 'react';
import { Sankey } from 'recharts';
import type { SankeyNodeProps, SankeyLinkProps } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
} from '@/components/ui/empty';
import { money } from './helpers';
import { budgetLabels, budgetTypes } from './budget-types';
import type { BudgetSnapshot, BudgetType } from './budget-types';
import { ChartReset } from './analytics-ui';
import { economicConfig } from './analytics-helpers';

export function BudgetSankey({
    budget,
    printWidth,
    printMetric,
}: {
    budget: BudgetSnapshot;
    printWidth?: number;
    printMetric?: 'allocated' | 'actual';
}) {
    const [selectedMetric, setMetric] = useState<'allocated' | 'actual'>(
        'allocated',
    );
    const metric = printMetric ?? selectedMetric;
    const color = economicConfig[metric].color;
    const [selected, setSelected] = useState<BudgetType | null>(null);
    const onSelect = (type: BudgetType) =>
        setSelected((current) => (current === type ? null : type));
    const positive = `${metric}_positive` as const;
    const categories = budgetTypes.filter(
        (type) =>
            Number(budget.groups[type][positive]) > 0 &&
            (selected === null || selected === type),
    );
    const data = {
        nodes: [
            { name: 'Budget · flussi positivi' },
            ...categories.map((type) => ({ name: budgetLabels[type] })),
        ],
        links: categories.map((type, index) => ({
            source: 0,
            target: index + 1,
            value: Number(budget.groups[type][positive]),
        })),
    };
    const node = ({ x, y, width, height, index }: SankeyNodeProps) => {
        const item = data.nodes[index];
        if (!item) return <g />;
        return (
            <g
                role={index > 0 && !printWidth ? 'button' : undefined}
                tabIndex={index > 0 && !printWidth ? 0 : undefined}
                aria-label={
                    index > 0 && !printWidth ? `Filtra ${item.name}` : undefined
                }
                aria-pressed={
                    index > 0 && !printWidth
                        ? selected === categories[index - 1]
                        : undefined
                }
                className={
                    index > 0 && !printWidth
                        ? 'cursor-pointer outline-none focus:opacity-70'
                        : ''
                }
                onClick={() => {
                    if (index > 0 && !printWidth)
                        onSelect(categories[index - 1]);
                }}
                onKeyDown={(event) => {
                    if (
                        index > 0 &&
                        !printWidth &&
                        (event.key === 'Enter' || event.key === ' ')
                    ) {
                        event.preventDefault();
                        onSelect(categories[index - 1]);
                    }
                }}
            >
                <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={3}
                    fill={color}
                />
                <text
                    x={index === 0 ? x + width + 8 : x - 8}
                    y={y + height / 2}
                    dominantBaseline="middle"
                    textAnchor={index === 0 ? 'start' : 'end'}
                    fill="var(--foreground)"
                    fontSize={12}
                >
                    {item.name}
                </text>
            </g>
        );
    };
    const link = ({
        sourceX,
        sourceY,
        sourceControlX,
        targetX,
        targetY,
        targetControlX,
        linkWidth,
    }: SankeyLinkProps) => (
        <path
            d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
            fill="none"
            stroke={color}
            strokeOpacity={0.35}
            strokeWidth={linkWidth}
        />
    );
    if (printWidth)
        return data.links.length ? (
            <Sankey
                width={printWidth}
                height={140}
                data={data}
                node={node}
                link={link}
                nodeWidth={12}
                nodePadding={32}
                margin={{ top: 12, bottom: 12, left: 8, right: 8 }}
            />
        ) : (
            <p>
                Nessun flusso positivo. Gli importi mancanti e le rettifiche non
                generano flussi.
            </p>
        );
    return (
        <Card className="min-w-0 gap-3">
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                <CardTitle>Ripartizione del Budget</CardTitle>
                <div className="flex items-center gap-2">
                    <ToggleGroup
                        type="single"
                        value={metric}
                        onValueChange={(value) => {
                            if (value) setMetric(value as typeof metric);
                        }}
                        variant="outline"
                        aria-label="Importi del Sankey"
                    >
                        <ToggleGroupItem value="allocated">
                            Allocato
                        </ToggleGroupItem>
                        <ToggleGroupItem value="actual">
                            Effettivo
                        </ToggleGroupItem>
                    </ToggleGroup>
                    {selected !== null && (
                        <ChartReset onReset={() => setSelected(null)} />
                    )}
                </div>
            </CardHeader>
            <CardContent className="min-w-0">
                {data.links.length ? (
                    <ChartContainer
                        className="h-56 w-full"
                        config={{
                            value: {
                                label: 'Flusso positivo',
                                color,
                            },
                        }}
                    >
                        <Sankey
                            data={data}
                            node={node}
                            link={link}
                            nodeWidth={12}
                            nodePadding={32}
                            margin={{ top: 12, bottom: 12, left: 8, right: 8 }}
                        >
                            <ChartTooltip
                                content={({ active, payload }) => {
                                    const item = payload?.[0]?.payload as
                                        | {
                                              payload?: {
                                                  value?: number;
                                                  name?: string;
                                                  source?: { name: string };
                                                  target?: { name: string };
                                              };
                                          }
                                        | undefined;
                                    const flow = item?.payload;
                                    return active && flow ? (
                                        <div className="chart-tooltip">
                                            <p>
                                                {flow.target?.name ?? flow.name}
                                            </p>
                                            <p>{money(flow.value)}</p>
                                        </div>
                                    ) : null;
                                }}
                            />
                        </Sankey>
                    </ChartContainer>
                ) : (
                    <Empty className="h-40">
                        <EmptyHeader>
                            <EmptyTitle>Nessun flusso positivo</EmptyTitle>
                            <EmptyDescription>
                                Gli importi mancanti e le rettifiche non
                                generano flussi.
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}
            </CardContent>
        </Card>
    );
}

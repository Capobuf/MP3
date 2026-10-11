import { useState } from 'react';
import { Sankey } from 'recharts';
import type { SankeyNodeProps, SankeyLinkProps } from 'recharts';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
} from '@/components/ui/card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
} from '@/components/ui/empty';
import { money } from './helpers';
import { budgetLabels, budgetTypes } from './budget-types';
import type { BudgetSnapshot, BudgetType } from './budget-types';

export function BudgetSankey({
    budget,
    onSelect,
}: {
    budget: BudgetSnapshot;
    onSelect: (type: BudgetType) => void;
}) {
    const [metric, setMetric] = useState<'allocated' | 'actual'>('allocated');
    const positive = `${metric}_positive` as const;
    const negative = `${metric}_negative` as const;
    const categories = budgetTypes.filter(
        (type) => Number(budget.groups[type][positive]) > 0,
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
    const node = ({ x, y, width, height, index }: SankeyNodeProps) => (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={3}
                fill={`var(--chart-${index + 1})`}
            />
            <text
                x={index === 0 ? x + width + 8 : x - 8}
                y={y + height / 2}
                dominantBaseline="middle"
                textAnchor={index === 0 ? 'start' : 'end'}
                fill="var(--foreground)"
                fontSize={12}
            >
                {data.nodes[index].name}
            </text>
        </g>
    );
    const link = ({
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
            d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
            fill="none"
            stroke={`var(--chart-${index + 2})`}
            strokeOpacity={0.35}
            strokeWidth={linkWidth}
        />
    );
    return (
        <Card className="min-w-0 gap-3">
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <CardTitle>Ripartizione del Budget</CardTitle>
                    <CardDescription>
                        Le stesse attribuzioni della tabella, sulle voci
                        incluse.
                    </CardDescription>
                </div>
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
                        Previsto
                    </ToggleGroupItem>
                    <ToggleGroupItem value="actual">Effettivo</ToggleGroupItem>
                </ToggleGroup>
            </CardHeader>
            <CardContent className="min-w-0">
                {data.links.length ? (
                    <ChartContainer
                        className="h-56 w-full"
                        config={{
                            value: {
                                label: 'Flusso positivo',
                                color: 'var(--chart-1)',
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
            <CardFooter className="flex flex-col items-start gap-3">
                <div className="flex flex-wrap gap-2">
                    {budgetTypes.map((type) => (
                        <Button
                            key={type}
                            size="sm"
                            variant="outline"
                            onClick={() => onSelect(type)}
                        >
                            {budgetLabels[type]} ·{' '}
                            {money(budget.groups[type][metric])}
                        </Button>
                    ))}
                </div>
                <p className="flex flex-wrap gap-x-5 gap-y-1 financial-value text-sm">
                    <span>
                        Positivi lordi: {money(budget.totals[positive])}
                    </span>
                    <span>Rettifiche: {money(budget.totals[negative])}</span>
                    <span>Totale netto: {money(budget.totals[metric])}</span>
                </p>
            </CardFooter>
        </Card>
    );
}

import { useState } from 'react';
import { Sankey } from 'recharts';
import type { SankeyLinkProps, SankeyNodeProps } from 'recharts';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
} from '@/components/ui/empty';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { detailCents } from './detail-breakdown';
import { money } from './helpers';
import type { DetailBreakdown } from './types';

const percentage = new Intl.NumberFormat('it-IT', {
    style: 'percent',
    maximumFractionDigits: 1,
});
const color = (index: number) => `var(--chart-${(index % 5) + 1})`;

export function DetailBreakdownChart({
    breakdown,
    description,
}: {
    breakdown: DetailBreakdown;
    description: string;
}) {
    const [selected, setSelected] = useState<'allocated' | 'actual'>('actual');
    const available = (metric: 'allocated' | 'actual') =>
        breakdown[metric].net !== null;
    const metric = available(selected)
        ? selected
        : available('actual')
          ? 'actual'
          : 'allocated';
    const current = breakdown[metric];
    const items = current.items;
    const gross = detailCents(current.positive);
    const negative = detailCents(current.negative);
    const showFlows =
        items.length > 0 &&
        current.net !== null &&
        detailCents(current.net) >= 0n;
    const share = (amount: string) =>
        gross > 0n
            ? percentage.format(Number(detailCents(amount)) / Number(gross))
            : '—';
    const source =
        negative < 0n
            ? 'Totale lordo positivo'
            : `Totale ${metric === 'actual' ? 'effettivo' : 'previsto'}`;
    const data = {
        nodes: [
            { name: source, amount: current.positive },
            ...items.map((item) => ({ name: item.name, amount: item.amount })),
        ],
        links: items.map((item, index) => ({
            source: 0,
            target: index + 1,
            value: Number(detailCents(item.amount)),
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
                fill={color(index === 0 ? 0 : index - 1)}
            />
            <text
                x={index === 0 ? x + width + 8 : x - 8}
                y={y + height / 2}
                dominantBaseline="middle"
                textAnchor={index === 0 ? 'start' : 'end'}
                fill="var(--foreground)"
                fontSize={11}
            >
                {index === 0
                    ? 'Totale'
                    : data.nodes[index].name.length > 20
                      ? `${data.nodes[index].name.slice(0, 19)}…`
                      : data.nodes[index].name}
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
            className="recharts-sankey-link"
            d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
            fill="none"
            stroke={color(index)}
            strokeOpacity={0.35}
            strokeWidth={linkWidth}
        />
    );
    return (
        <Card className="@container/breakdown min-w-0 detail-enter gap-4 self-start">
            <CardHeader className="gap-3 px-5">
                <div className="flex flex-col gap-1.5">
                    <CardTitle>Ripartizione economica</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={metric}
                    onValueChange={(value) => {
                        if (value === 'allocated' || value === 'actual')
                            setSelected(value);
                    }}
                    aria-label="Importi della ripartizione"
                    className="justify-self-start"
                >
                    <ToggleGroupItem
                        value="allocated"
                        disabled={!available('allocated')}
                    >
                        Previsto
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="actual"
                        disabled={!available('actual')}
                    >
                        Effettivo
                    </ToggleGroupItem>
                </ToggleGroup>
            </CardHeader>
            <CardContent
                className="flex min-w-0 flex-col gap-4 px-5"
                aria-live="polite"
            >
                <div>
                    <p className="text-xs text-muted-foreground">{source}</p>
                    <p className="mt-1 financial-value text-xl">
                        {money(current.net === null ? null : current.positive)}
                    </p>
                </div>
                {showFlows && items.length > 1 && (
                    <div
                        key={metric}
                        className="hidden detail-enter @sm/breakdown:block"
                        aria-hidden="true"
                    >
                        <ChartContainer
                            className="aspect-auto w-full"
                            style={{ height: Math.max(190, items.length * 35) }}
                            config={{
                                value: {
                                    label: source,
                                    color: 'var(--chart-1)',
                                },
                            }}
                        >
                            <Sankey
                                data={data}
                                node={node}
                                link={link}
                                nodeWidth={10}
                                nodePadding={18}
                                iterations={32}
                                margin={{
                                    top: 8,
                                    bottom: 8,
                                    left: 0,
                                    right: 0,
                                }}
                            >
                                <ChartTooltip
                                    isAnimationActive={false}
                                    content={({ active, payload }) => {
                                        const entry = payload?.[0]?.payload as
                                            | {
                                                  payload?: {
                                                      name?: string;
                                                      amount?: string;
                                                      target?: {
                                                          name: string;
                                                          amount: string;
                                                      };
                                                  };
                                              }
                                            | undefined;
                                        const flow = entry?.payload;
                                        const name =
                                            flow?.target?.name ?? flow?.name;
                                        const amount =
                                            flow?.target?.amount ??
                                            flow?.amount;
                                        return active && name && amount ? (
                                            <div className="chart-tooltip">
                                                <p>{name}</p>
                                                <p>
                                                    {money(amount)} ·{' '}
                                                    {share(amount)}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    dei flussi positivi
                                                </p>
                                            </div>
                                        ) : null;
                                    }}
                                />
                            </Sankey>
                        </ChartContainer>
                    </div>
                )}
                {!showFlows && (
                    <Empty className="min-w-0 px-0 py-5">
                        <EmptyHeader>
                            <EmptyTitle>
                                {current.net !== null &&
                                detailCents(current.net) < 0n
                                    ? 'Totale netto negativo'
                                    : 'Nessun flusso positivo'}
                            </EmptyTitle>
                            <EmptyDescription>
                                {current.net === null
                                    ? 'Non sono presenti importi per questa grandezza.'
                                    : 'Gli zeri e le rettifiche non generano flussi. I valori disponibili sono riportati sotto.'}
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}
                {items.length > 0 && (
                    <ol
                        aria-label="Voci positive in ordine di importo"
                        className="flex min-w-0 flex-col gap-3"
                    >
                        {items.map((item, index) => (
                            <li key={item.id} className="min-w-0">
                                <div className="flex items-start justify-between gap-3 text-sm">
                                    <span
                                        className="min-w-0 break-words"
                                        title={item.name}
                                    >
                                        {item.name}
                                    </span>
                                    <span className="shrink-0 text-right financial-value">
                                        {money(item.amount)}
                                        <span className="block text-xs text-muted-foreground">
                                            {share(item.amount)}
                                        </span>
                                    </span>
                                </div>
                                <div
                                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                                    aria-hidden="true"
                                >
                                    <div
                                        className="h-full rounded-full transition-[width] duration-300"
                                        style={{
                                            width: `${(Number(detailCents(item.amount)) / Number(gross)) * 100}%`,
                                            backgroundColor: color(index),
                                        }}
                                    />
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
                {negative < 0n && (
                    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-lg bg-muted/50 p-3 text-sm">
                        <dt>Positivi lordi</dt>
                        <dd className="text-right financial-value">
                            {money(current.positive)}
                        </dd>
                        <dt>Rettifiche</dt>
                        <dd className="text-right financial-value">
                            {money(current.negative)}
                        </dd>
                        <dt className="font-semibold">Totale netto</dt>
                        <dd className="text-right financial-value">
                            {money(current.net)}
                        </dd>
                    </dl>
                )}
                {(current.missing > 0 || current.zero > 0) && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        {current.missing > 0 &&
                            `${current.missing} voci con importo assente: ripartizione parziale. `}
                        {current.zero > 0 &&
                            `${current.zero} voci a zero, senza flussi.`}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

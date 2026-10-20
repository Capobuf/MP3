import { Link } from '@inertiajs/react';
import { useState } from 'react';
import { Sankey } from 'recharts';
import type { SankeyLinkProps, SankeyNodeProps } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
} from '@/components/ui/empty';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChartReset } from './analytics-ui';
import { economicConfig } from './analytics-helpers';
import { detailCents, detailDecimal } from './detail-breakdown';
import { money } from './helpers';
import type { DetailBreakdown } from './types';

const percentage = new Intl.NumberFormat('it-IT', {
    style: 'percent',
    maximumFractionDigits: 1,
});

export function DetailBreakdownChart({
    breakdown,
    getHref,
}: {
    breakdown: DetailBreakdown;
    getHref?: (id: string) => string | undefined;
}) {
    const [selected, setSelected] = useState<'allocated' | 'actual'>('actual');
    const [selectedItem, setSelectedItem] = useState<string | null>(null);
    const selectItem = (id: string) =>
        setSelectedItem((current) => (current === id ? null : id));
    const available = (metric: 'allocated' | 'actual') =>
        breakdown[metric].net !== null;
    const metric = available(selected)
        ? selected
        : available('actual')
          ? 'actual'
          : 'allocated';
    const color = economicConfig[metric].color;
    const current = breakdown[metric];
    const items = current.items.filter(
        (item) => selectedItem === null || item.id === selectedItem,
    );
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
            : `Totale ${metric === 'actual' ? 'effettivo' : 'allocato'}`;
    const data = {
        nodes: [
            {
                name: source,
                amount: detailDecimal(
                    items.reduce(
                        (sum, item) => sum + detailCents(item.amount),
                        0n,
                    ),
                ),
            },
            ...items.map((item) => ({ ...item })),
        ],
        links: items.map((item, index) => ({
            source: 0,
            target: index + 1,
            value: Number(detailCents(item.amount)),
        })),
    };
    const node = ({ x, y, width, height, index }: SankeyNodeProps) => {
        const item = items[index - 1];
        if (index !== 0 && !item) return <g />;
        const href = item && getHref?.(item.id);
        const label = (
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
                    : item.name.length > 20
                      ? `${item.name.slice(0, 19)}…`
                      : item.name}
            </text>
        );
        return (
            <g>
                <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={3}
                    fill={color}
                    className={item ? 'cursor-pointer' : undefined}
                    role={item ? 'button' : undefined}
                    tabIndex={item ? 0 : undefined}
                    aria-label={item ? `Filtra ${item.name}` : undefined}
                    aria-pressed={item ? selectedItem === item.id : undefined}
                    onClick={() => {
                        if (item) selectItem(item.id);
                    }}
                    onKeyDown={(event) => {
                        if (
                            item &&
                            (event.key === 'Enter' || event.key === ' ')
                        ) {
                            event.preventDefault();
                            selectItem(item.id);
                        }
                    }}
                />
                {href ? (
                    <Link href={href} aria-label={`Apri ${item.name}`}>
                        <title>{item.name}</title>
                        {label}
                    </Link>
                ) : (
                    label
                )}
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
        index,
    }: SankeyLinkProps) => (
        <path
            className="recharts-sankey-link cursor-pointer"
            onClick={() => {
                const item = items[index];
                if (item) selectItem(item.id);
            }}
            d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
            fill="none"
            stroke={color}
            strokeOpacity={0.35}
            strokeWidth={linkWidth}
        />
    );
    return (
        <Card className="@container/breakdown w-full min-w-0 gap-4 self-start">
            <CardHeader className="gap-3 px-5">
                <CardTitle>Ripartizione economica</CardTitle>
                <div className="flex items-center gap-2">
                    <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={metric}
                        onValueChange={(value) => {
                            if (value === 'allocated' || value === 'actual') {
                                setSelected(value);
                                setSelectedItem(null);
                            }
                        }}
                        aria-label="Importi della ripartizione"
                        className="justify-self-start"
                    >
                        <ToggleGroupItem
                            value="allocated"
                            disabled={!available('allocated')}
                        >
                            Allocato
                        </ToggleGroupItem>
                        <ToggleGroupItem
                            value="actual"
                            disabled={!available('actual')}
                        >
                            Effettivo
                        </ToggleGroupItem>
                    </ToggleGroup>
                    {selectedItem !== null && (
                        <ChartReset onReset={() => setSelectedItem(null)} />
                    )}
                </div>
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
                {showFlows && items.length > 0 && (
                    <div key={metric} className="hidden @sm/breakdown:block">
                        <ChartContainer
                            className="aspect-auto w-full"
                            style={{ height: Math.max(190, items.length * 35) }}
                            config={{
                                value: {
                                    label: source,
                                    color,
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
                        {items.map((item) => {
                            const href = getHref?.(item.id);
                            return (
                                <li key={item.id} className="min-w-0">
                                    <div className="flex items-start justify-between gap-3 text-sm">
                                        {href ? (
                                            <Link
                                                className="min-w-0 rounded break-words text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                                href={href}
                                                title={item.name}
                                                aria-label={`Apri ${item.name}`}
                                            >
                                                {item.name}
                                            </Link>
                                        ) : (
                                            <button
                                                type="button"
                                                className="min-w-0 rounded text-left break-words focus-visible:ring-2 focus-visible:ring-ring"
                                                title={item.name}
                                                aria-pressed={
                                                    selectedItem === item.id
                                                }
                                                onClick={() =>
                                                    selectItem(item.id)
                                                }
                                            >
                                                {item.name}
                                            </button>
                                        )}
                                        <span className="shrink-0 text-right financial-value">
                                            {money(item.amount)}
                                            <span className="block text-xs text-muted-foreground">
                                                {share(item.amount)}
                                            </span>
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="mt-1.5 block h-3 w-full overflow-hidden rounded-full bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-label={`Filtra ${item.name}`}
                                        aria-pressed={selectedItem === item.id}
                                        onClick={() => selectItem(item.id)}
                                    >
                                        <div
                                            className="h-full rounded-full transition-[width] duration-300"
                                            style={{
                                                width: `${(Number(detailCents(item.amount)) / Number(gross)) * 100}%`,
                                                backgroundColor: color,
                                            }}
                                        />
                                    </button>
                                </li>
                            );
                        })}
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
            </CardContent>
        </Card>
    );
}

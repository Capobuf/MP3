import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
} from '@/components/ui/chart';
import { money } from './helpers';

export type ChartRow = {
    id: number | 'none';
    name: string;
    allocated: string | null;
    actual: string | null;
    count: number;
    incomplete: number;
};
export function EconomicChart({
    title,
    rows,
    onSelect,
}: {
    title: string;
    rows: ChartRow[];
    onSelect: (id: number | 'none') => void;
}) {
    const data = rows.map((row) => ({
        ...row,
        allocated: row.allocated == null ? null : Number(row.allocated),
        actual: row.actual == null ? null : Number(row.actual),
    }));
    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>
                    Importi presenti · fino a 12 gruppi · clic su una barra per
                    filtrare
                </CardDescription>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                        Aggiungi spese per visualizzare il confronto.
                    </div>
                ) : (
                    <ChartContainer
                        className="h-64 w-full"
                        config={{
                            allocated: {
                                label: 'Allocato',
                                color: 'var(--chart-2)',
                            },
                            actual: {
                                label: 'Effettivo',
                                color: 'var(--chart-1)',
                            },
                        }}
                    >
                        <BarChart
                            accessibilityLayer
                            data={data}
                            margin={{ left: 4, right: 4 }}
                        >
                            <CartesianGrid vertical={false} />
                            <XAxis
                                dataKey="name"
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(name: string) =>
                                    name.length > 16
                                        ? `${name.slice(0, 15)}…`
                                        : name
                                }
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                width={65}
                                tickFormatter={(value: number) =>
                                    new Intl.NumberFormat('it-IT', {
                                        notation: 'compact',
                                    }).format(value)
                                }
                            />
                            <ChartTooltip
                                content={({ active, payload }) => {
                                    const row = payload?.[0]?.payload as
                                        | ChartRow
                                        | undefined;
                                    return active && row ? (
                                        <div className="rounded-lg border bg-background p-3 text-xs shadow-md">
                                            <p className="mb-2 font-medium">
                                                {row.name}
                                            </p>
                                            <p className="text-right text-sm font-medium tabular-nums">
                                                Allocato: {money(row.allocated)}
                                            </p>
                                            <p className="text-right text-sm font-medium tabular-nums">
                                                Effettivo: {money(row.actual)}
                                            </p>
                                            <p className="mt-2 text-muted-foreground">
                                                {row.count} spese ·{' '}
                                                {row.incomplete} incomplete
                                            </p>
                                        </div>
                                    ) : null;
                                }}
                            />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Bar
                                dataKey="allocated"
                                fill="var(--color-allocated)"
                                radius={[4, 4, 0, 0]}
                                className="cursor-pointer"
                                onClick={(entry) =>
                                    onSelect(entry.id as number | 'none')
                                }
                            />
                            <Bar
                                dataKey="actual"
                                fill="var(--color-actual)"
                                radius={[4, 4, 0, 0]}
                                className="cursor-pointer"
                                onClick={(entry) =>
                                    onSelect(entry.id as number | 'none')
                                }
                            />
                        </BarChart>
                    </ChartContainer>
                )}
            </CardContent>
        </Card>
    );
}

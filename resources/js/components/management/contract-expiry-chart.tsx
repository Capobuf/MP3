import { useState } from 'react';
import { Link } from '@inertiajs/react';
import { Bar, BarChart, Cell, Rectangle, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ContractExpiry } from './analytics-types';
import { AnalyticsCard, ChartReset, EmptyChart } from './analytics-ui';
import { dateLabel, money } from './helpers';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

export function ContractExpiryChart({
    expiry,
    slug,
}: {
    expiry: ContractExpiry;
    slug: string;
}) {
    const [selected, setSelected] = useState<
        ContractExpiry['groups'][number]['id'] | null
    >(null);
    const select = (id: ContractExpiry['groups'][number]['id']) =>
        setSelected((current) => (current === id ? null : id));
    const displayed = expiry.groups.filter(
        (row) => selected === null || row.id === selected,
    );
    const count = expiry.groups.reduce((sum, row) => sum + row.count, 0);
    return (
        <AnalyticsCard
            title="Scadenze contrattuali"
            controls={
                selected !== null && (
                    <ChartReset onReset={() => setSelected(null)} />
                )
            }
        >
            <p className="mb-3 text-sm text-muted-foreground">
                Tutti i contratti dell’ambiente al {dateLabel(expiry.asOf)}. Le
                scadenze sono indipendenti dai filtri sulle spese.
            </p>
            {count === 0 ? (
                <EmptyChart>
                    Nessun contratto scaduto o in scadenza entro 90 giorni.
                </EmptyChart>
            ) : (
                <ChartContainer
                    className="h-80 w-full"
                    config={{
                        count: { label: 'Contratti', color: 'var(--chart-1)' },
                    }}
                >
                    <BarChart
                        accessibilityLayer
                        data={displayed}
                        layout="vertical"
                        margin={{ right: 16 }}
                    >
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis
                            type="category"
                            dataKey="name"
                            width={120}
                            tickLine={false}
                            axisLine={false}
                        />
                        <ChartTooltip
                            content={<ChartTooltipContent labelKey="name" />}
                        />
                        <Bar
                            dataKey="count"
                            radius={3}
                            className="cursor-pointer"
                            onClick={(row) =>
                                select(
                                    (
                                        row.payload as ContractExpiry['groups'][number]
                                    ).id,
                                )
                            }
                            shape={(props) => {
                                const row = props.payload as
                                    | ContractExpiry['groups'][number]
                                    | undefined;
                                if (!row) return <g />;
                                return (
                                    <Rectangle
                                        {...props}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Filtra ${row.name}`}
                                        aria-pressed={selected === row.id}
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === 'Enter' ||
                                                event.key === ' '
                                            ) {
                                                event.preventDefault();
                                                select(row.id);
                                            }
                                        }}
                                    />
                                );
                            }}
                            isAnimationActive="auto"
                            animationBegin={60}
                            animationDuration={650}
                            animationEasing="cubic-bezier(0.22,1,0.36,1)"
                        >
                            {displayed.map((row) => (
                                <Cell
                                    key={row.id}
                                    fill={
                                        row.id === 'expired'
                                            ? 'var(--destructive)'
                                            : 'var(--chart-1)'
                                    }
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ChartContainer>
            )}
            {expiry.upcoming > 0 && (
                <Button
                    className="mt-3 max-w-full whitespace-normal"
                    variant="outline"
                    asChild
                >
                    <Link href={`/t/${slug}/contracts?expiring=1&sort=ends_on`}>
                        {expiry.upcoming} contratti in scadenza entro 90 giorni
                    </Link>
                </Button>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
                {selected !== null && (
                    <Button variant="outline" asChild>
                        <Link
                            href={`/t/${slug}/contracts?expiring=${selected}&sort=ends_on`}
                        >
                            Apri contratti ·{' '}
                            {
                                expiry.groups.find(
                                    (group) => group.id === selected,
                                )?.name
                            }
                        </Link>
                    </Button>
                )}
                {expiry.undated > 0 && (
                    <Button variant="outline" asChild>
                        <Link href={`/t/${slug}/contracts?expiring=undated`}>
                            {expiry.undated} senza scadenza
                        </Link>
                    </Button>
                )}
            </div>
            {expiry.next_contracts.length > 0 && (
                <div className="mt-5 flex flex-col gap-2">
                    <h3 className="text-sm font-medium">
                        Prossime scadenze · primi {expiry.next_contracts.length}{' '}
                        di {expiry.upcoming}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Importi registrati nel {expiry.year} per l’intero
                        contratto.
                    </p>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Contratto</TableHead>
                                <TableHead>Scadenza</TableHead>
                                <TableHead className="text-right">
                                    Allocato
                                </TableHead>
                                <TableHead className="text-right">
                                    Effettivo
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {expiry.next_contracts.map((contract) => (
                                <TableRow key={contract.id}>
                                    <TableCell className="whitespace-normal">
                                        <Link
                                            className="font-medium text-primary"
                                            href={`/t/${slug}/contracts/${contract.id}?year=${expiry.year}`}
                                        >
                                            {contract.name}
                                        </Link>
                                        <p className="text-xs text-muted-foreground">
                                            {contract.vendor ??
                                                'Senza fornitore'}
                                        </p>
                                        {contract.expense_count === 0 ? (
                                            <p className="text-xs text-muted-foreground">
                                                Nessuna spesa nell’anno
                                            </p>
                                        ) : contract.incomplete > 0 ? (
                                            <p className="text-xs text-muted-foreground">
                                                {contract.incomplete} spese con
                                                importi da completare
                                            </p>
                                        ) : null}
                                    </TableCell>
                                    <TableCell>
                                        {dateLabel(contract.ends_on)}
                                    </TableCell>
                                    <TableCell className="text-right financial-value">
                                        {money(contract.allocated)}
                                    </TableCell>
                                    <TableCell className="text-right financial-value">
                                        {money(contract.actual)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </AnalyticsCard>
    );
}

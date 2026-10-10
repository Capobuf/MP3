import { cn } from '@/lib/utils';
import {
    Card,
    CardContent,
    CardHeader,
    CardDescription,
} from '@/components/ui/card';
import { money } from './helpers';
import type { Totals } from './types';

export function Summary({ totals }: { totals: Totals }) {
    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-4 md:grid-cols-3">
                {[
                    {
                        label: 'Totale allocato',
                        value: totals.allocated,
                        hint: 'Importi previsti presenti',
                    },
                    {
                        label: 'Totale effettivo',
                        value: totals.actual,
                        hint: 'Costi reali registrati',
                    },
                    {
                        label: 'Scostamento confrontabile',
                        value: totals.variance,
                        hint: `${totals.count - totals.incomplete} spese con entrambi gli importi`,
                    },
                ].map((item) => (
                    <Card key={item.label} className="min-w-0 gap-3">
                        <CardHeader className="px-5">
                            <CardDescription>{item.label}</CardDescription>
                        </CardHeader>
                        <CardContent className="px-5">
                            <p
                                className={cn(
                                    'text-2xl font-semibold tracking-normal break-words tabular-nums',
                                    item.label.startsWith('Scostamento') &&
                                        (Number(item.value) > 0
                                            ? 'text-finance-overrun'
                                            : Number(item.value) < 0
                                              ? 'text-finance-saving'
                                              : ''),
                                )}
                            >
                                {money(item.value)}
                            </p>
                            <p className="mt-3 text-sm text-muted-foreground">
                                {item.hint}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <p className="text-sm text-muted-foreground">
                {totals.count} spese nel perimetro selezionato ·{' '}
                {totals.incomplete > 0
                    ? `${totals.incomplete} con importi da completare. Il confronto è parziale.`
                    : 'Tutti gli importi sono definiti.'}{' '}
                Lo scostamento è effettivo meno allocato.
            </p>
        </div>
    );
}

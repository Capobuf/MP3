import { Card, CardContent } from '@/components/ui/card';
import { money } from './helpers';
import type { Totals } from './types';

export function Summary({ totals }: { totals: Totals }) {
    return (
        <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-3">
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
                    <Card key={item.label}>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">
                                {item.label}
                            </p>
                            <p
                                className={`mt-2 text-2xl font-semibold tabular-nums ${item.label.startsWith('Scostamento') && Number(item.value) > 0 ? 'text-destructive' : ''}`}
                            >
                                {money(item.value)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
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

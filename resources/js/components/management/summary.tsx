import {
    Card,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { money } from './helpers';
import type { Totals } from './types';

export function Summary({ totals }: { totals: Totals }) {
    return (
        <div className="@container/summary flex flex-col gap-3">
            <div className="summary-grid @md/summary:grid-cols-2 @4xl/summary:grid-cols-3">
                {[
                    {
                        label: 'Totale allocato',
                        value: totals.allocated,
                        hint: 'Importi previsti presenti',
                        context: 'Budget delle spese nel perimetro',
                    },
                    {
                        label: 'Totale effettivo',
                        value: totals.actual,
                        hint: 'Costi reali registrati',
                        context: 'Importi effettivi presenti nel perimetro',
                    },
                    {
                        label: 'Scostamento confrontabile',
                        value: totals.variance,
                        hint: `${totals.count - totals.incomplete} spese con entrambi gli importi`,
                        context:
                            'Effettivo meno allocato sulle spese confrontabili',
                    },
                ].map((item) => (
                    <Card key={item.label} className="@container/card min-w-0">
                        <CardHeader>
                            <CardDescription>{item.label}</CardDescription>
                            <CardTitle
                                className={cn(
                                    'summary-value',
                                    item.label.startsWith('Scostamento') &&
                                        (Number(item.value) > 0
                                            ? 'text-finance-overrun'
                                            : Number(item.value) < 0
                                              ? 'text-finance-saving'
                                              : ''),
                                )}
                            >
                                {money(item.value)}
                            </CardTitle>
                        </CardHeader>
                        <CardFooter className="mt-auto flex-col items-start gap-1.5 text-sm">
                            <div className="font-medium">{item.hint}</div>
                            <div className="text-muted-foreground">
                                {item.context}
                            </div>
                        </CardFooter>
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

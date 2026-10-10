import { Card, CardContent } from '@/components/ui/card';
import type { ExpenseAnalytics } from './analytics-types';
import { percent } from './analytics-helpers';
import { money } from './helpers';

export function DashboardSummary({
    analytics,
    year,
}: {
    analytics: ExpenseAnalytics;
    year: number;
}) {
    const { current, previous, comparisons } = analytics;
    return (
        <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(['allocated', 'actual', 'variance'] as const).map(
                    (metric) => (
                        <Card key={metric}>
                            <CardContent className="pt-6 font-sans tabular-nums">
                                <p className="text-sm text-muted-foreground">
                                    {
                                        {
                                            allocated: 'Totale allocato',
                                            actual: 'Totale effettivo',
                                            variance:
                                                'Scostamento confrontabile',
                                        }[metric]
                                    }
                                </p>
                                <p
                                    className={`mt-2 text-2xl font-semibold ${metric === 'variance' && Number(current.variance) > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}
                                >
                                    {current[metric] === null
                                        ? '—'
                                        : money(current[metric])}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {!previous ? (
                                        'Nessun dato di confronto'
                                    ) : comparisons[metric].difference ===
                                      null ? (
                                        `Importi non disponibili per il confronto con ${year - 1}`
                                    ) : (
                                        <>
                                            {money(
                                                comparisons[metric].difference,
                                            )}{' '}
                                            {metric === 'variance'
                                                ? `di differenza sullo scostamento ${year - 1}`
                                                : `· ${percent(comparisons[metric].percentage)} rispetto al ${year - 1}`}
                                        </>
                                    )}
                                </p>
                                {metric === 'variance' && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {current.count - current.incomplete}{' '}
                                        spese confrontabili
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ),
                )}
                <Card>
                    <CardContent className="pt-6 font-sans tabular-nums">
                        <p className="text-sm text-muted-foreground">
                            Completezza delle spese
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                            {percent(current.complete_percentage)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {current.count - current.incomplete}/{current.count}{' '}
                            con entrambi gli importi
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                            {previous
                                ? `${comparisons.completeness.points === null ? '—' : new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(comparisons.completeness.points)} punti percentuali rispetto al ${year - 1}`
                                : 'Nessun dato di confronto'}
                        </p>
                    </CardContent>
                </Card>
            </div>
            <p className="text-sm text-muted-foreground">
                {current.count} spese nel perimetro · {current.incomplete}{' '}
                incomplete. Scostamento = effettivo − allocato, soltanto per
                importi entrambi presenti. Effettivo indica costi registrati.
            </p>
        </div>
    );
}

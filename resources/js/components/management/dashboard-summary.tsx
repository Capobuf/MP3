import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Card,
    CardContent,
    CardHeader,
    CardDescription,
} from '@/components/ui/card';
import type { ExpenseAnalytics } from './analytics-types';
import { percent } from './analytics-helpers';
import { money } from './helpers';

export function DashboardSummary({
    analytics,
    year,
    loading = false,
}: {
    analytics: ExpenseAnalytics;
    year: number;
    loading?: boolean;
}) {
    const { current, previous, comparisons } = analytics;
    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                {(['allocated', 'actual', 'variance'] as const).map(
                    (metric) => (
                        <Card key={metric} className="min-w-0 gap-3">
                            <CardHeader className="px-5">
                                <CardDescription>
                                    {
                                        {
                                            allocated: 'Totale allocato',
                                            actual: 'Totale effettivo',
                                            variance:
                                                'Scostamento confrontabile',
                                        }[metric]
                                    }
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="px-5 font-sans tracking-normal tabular-nums">
                                <div
                                    className={cn(
                                        'text-2xl font-semibold tracking-normal break-words',
                                        metric === 'variance' &&
                                            (Number(current.variance) > 0
                                                ? 'text-finance-overrun'
                                                : Number(current.variance) < 0
                                                  ? 'text-finance-saving'
                                                  : ''),
                                    )}
                                >
                                    {loading ? (
                                        <Skeleton className="h-8 w-3/4" />
                                    ) : current[metric] === null ? (
                                        '—'
                                    ) : (
                                        money(current[metric])
                                    )}
                                </div>
                                <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                                    {previous &&
                                        comparisons[metric].difference !==
                                            null &&
                                        (Number(
                                            comparisons[metric].difference,
                                        ) > 0 ? (
                                            <ArrowUpRight
                                                className="mt-0.5 size-4 shrink-0"
                                                aria-label="In aumento"
                                            />
                                        ) : Number(
                                              comparisons[metric].difference,
                                          ) < 0 ? (
                                            <ArrowDownRight
                                                className="mt-0.5 size-4 shrink-0"
                                                aria-label="In diminuzione"
                                            />
                                        ) : (
                                            <Minus
                                                className="mt-0.5 size-4 shrink-0"
                                                aria-label="Invariato"
                                            />
                                        ))}
                                    <span>
                                        {!previous ? (
                                            'Nessun dato di confronto'
                                        ) : comparisons[metric].difference ===
                                          null ? (
                                            `Importi non disponibili per il confronto con ${year - 1}`
                                        ) : (
                                            <>
                                                {money(
                                                    comparisons[metric]
                                                        .difference,
                                                )}{' '}
                                                {metric === 'variance'
                                                    ? `di differenza sullo scostamento ${year - 1}`
                                                    : `· ${percent(comparisons[metric].percentage)} rispetto al ${year - 1}`}
                                            </>
                                        )}
                                    </span>
                                </p>
                                {metric !== 'variance' && (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {metric === 'allocated'
                                            ? 'Importi previsti presenti'
                                            : 'Costi reali registrati'}
                                    </p>
                                )}
                                {metric === 'variance' && (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {current.count - current.incomplete}{' '}
                                        spese confrontabili
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ),
                )}
                <Card className="min-w-0 gap-3">
                    <CardHeader className="px-5">
                        <CardDescription>
                            Completezza delle spese
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-5 font-sans tracking-normal tabular-nums">
                        <div className="text-2xl font-semibold tracking-normal">
                            {loading ? (
                                <Skeleton className="h-8 w-24" />
                            ) : (
                                percent(current.complete_percentage)
                            )}
                        </div>
                        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
                            {previous &&
                                comparisons.completeness.points !== null &&
                                (comparisons.completeness.points > 0 ? (
                                    <ArrowUpRight
                                        className="mt-0.5 size-4 shrink-0"
                                        aria-label="In aumento"
                                    />
                                ) : comparisons.completeness.points < 0 ? (
                                    <ArrowDownRight
                                        className="mt-0.5 size-4 shrink-0"
                                        aria-label="In diminuzione"
                                    />
                                ) : (
                                    <Minus
                                        className="mt-0.5 size-4 shrink-0"
                                        aria-label="Invariato"
                                    />
                                ))}
                            <span>
                                {previous
                                    ? `${comparisons.completeness.points === null ? '—' : new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(comparisons.completeness.points)} punti percentuali rispetto al ${year - 1}`
                                    : 'Nessun dato di confronto'}
                            </span>
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {current.count - current.incomplete}/{current.count}{' '}
                            con entrambi gli importi
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

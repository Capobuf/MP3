import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardAction,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { percent } from './analytics-helpers';
import type { ExpenseAnalytics } from './analytics-types';
import { money, varianceTextClass } from './helpers';

const signedNumber = new Intl.NumberFormat('it-IT', {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
});

function ComparisonBadge({
    difference,
    label,
    year,
}: {
    difference: number;
    label: string;
    year: number;
}) {
    const Icon =
        difference > 0 ? ArrowUpRight : difference < 0 ? ArrowDownRight : Minus;
    const direction =
        difference > 0
            ? 'In aumento'
            : difference < 0
              ? 'In diminuzione'
              : 'Invariato';
    return (
        <CardAction className="row-span-1">
            <Badge
                variant="outline"
                className="rounded-full financial-value"
                aria-label={`${direction}: ${label} rispetto al ${year}`}
                title={`Rispetto al ${year}`}
            >
                <Icon aria-hidden="true" />
                {label}
            </Badge>
        </CardAction>
    );
}

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
    const previousYear = previous?.year ?? year - 1;
    const complete = current.count - current.incomplete;
    const points = comparisons.completeness.points;
    return (
        <div className="@container/summary flex flex-col gap-3">
            <div className="summary-grid @md/summary:grid-cols-2 @5xl/summary:grid-cols-4">
                {(['allocated', 'actual', 'variance'] as const).map(
                    (metric) => {
                        const comparison = comparisons[metric];
                        const comparable =
                            !!previous && comparison.difference !== null;
                        const badge =
                            metric === 'variance' ||
                            comparison.percentage === null
                                ? money(comparison.difference)
                                : `${signedNumber.format(comparison.percentage)}%`;
                        return (
                            <Card
                                key={metric}
                                className="@container/card min-w-0"
                            >
                                <CardHeader>
                                    <CardDescription className="min-w-0">
                                        {
                                            {
                                                allocated: 'Totale allocato',
                                                actual: 'Totale effettivo',
                                                variance:
                                                    'Scostamento confrontabile',
                                            }[metric]
                                        }
                                    </CardDescription>
                                    <CardTitle
                                        className={cn(
                                            'summary-value text-foreground',
                                            metric === 'variance' &&
                                                varianceTextClass(
                                                    current.variance,
                                                ),
                                        )}
                                    >
                                        {loading ? (
                                            <Skeleton className="skeleton-shimmer h-8 w-3/4" />
                                        ) : current[metric] === null ? (
                                            '—'
                                        ) : (
                                            money(current[metric])
                                        )}
                                    </CardTitle>
                                    {!loading && comparable && (
                                        <ComparisonBadge
                                            difference={Number(
                                                comparison.difference,
                                            )}
                                            label={badge}
                                            year={previousYear}
                                        />
                                    )}
                                </CardHeader>
                                <CardFooter className="mt-auto flex-col items-start gap-1.5 text-sm">
                                    <div className="font-medium">
                                        {comparable
                                            ? `${money(comparison.difference)} ${metric === 'variance' ? 'di differenza sullo scostamento' : 'rispetto al'} ${previousYear}`
                                            : previous
                                              ? `Confronto con ${previousYear} non disponibile`
                                              : 'Nessun dato di confronto'}
                                    </div>
                                    <div className="text-muted-foreground">
                                        {metric === 'allocated'
                                            ? 'Importi previsti presenti'
                                            : metric === 'actual'
                                              ? 'Costi reali registrati'
                                              : `${complete} spese con entrambi gli importi`}
                                    </div>
                                </CardFooter>
                            </Card>
                        );
                    },
                )}
                <Card className="@container/card min-w-0">
                    <CardHeader>
                        <CardDescription>
                            Completezza delle spese
                        </CardDescription>
                        <CardTitle className="summary-value">
                            {loading ? (
                                <Skeleton className="skeleton-shimmer h-8 w-24" />
                            ) : (
                                percent(current.complete_percentage)
                            )}
                        </CardTitle>
                        {!loading && previous && points !== null && (
                            <ComparisonBadge
                                difference={points}
                                label={`${signedNumber.format(points)} pp`}
                                year={previousYear}
                            />
                        )}
                    </CardHeader>
                    <CardFooter className="mt-auto flex-col items-start gap-1.5 text-sm">
                        <div className="font-medium">
                            {complete}/{current.count} spese complete
                        </div>
                        <div className="text-muted-foreground">
                            {previous && points !== null
                                ? `${signedNumber.format(points)} punti percentuali rispetto al ${previousYear}`
                                : 'Confronto annuale non disponibile'}
                        </div>
                    </CardFooter>
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

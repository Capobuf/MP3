import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardAction,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { percent } from './analytics-helpers';
import type { EconomicSummary, ExpenseAnalytics } from './analytics-types';
import { money, varianceTextClass } from './helpers';

const signedNumber = new Intl.NumberFormat('it-IT', {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
});

export function SummaryValue({ value }: { value: string }) {
    const element = useRef<HTMLSpanElement>(null);
    const previous = useRef(value);
    useEffect(() => {
        const changed = previous.current !== value;
        previous.current = value;
        if (
            !changed ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        )
            return;
        const animation = element.current?.animate(
            [{ opacity: 0.65 }, { opacity: 1 }],
            { duration: 180, easing: 'ease-out' },
        );
        return () => animation?.cancel();
    }, [value]);
    return <span ref={element}>{value}</span>;
}

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

type SummaryValues = Pick<
    EconomicSummary,
    | 'allocated'
    | 'actual'
    | 'variance'
    | 'count'
    | 'incomplete'
    | 'complete_percentage'
>;

export type SummaryAnalytics = {
    current: SummaryValues;
    previous: (SummaryValues & { year: number }) | null;
    comparisons: ExpenseAnalytics['comparisons'];
};

export function DashboardSummary({
    analytics,
    year,
    loading = false,
    scope = 'expenses',
}: {
    analytics: SummaryAnalytics;
    year: number;
    loading?: boolean;
    scope?: 'expenses' | 'budget' | 'project';
}) {
    const { current, previous, comparisons } = analytics;
    const previousYear = previous?.year ?? year - 1;
    const points = comparisons.completeness.points;
    const isBudget = scope === 'budget';
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
                                                allocated: isBudget
                                                    ? 'Budget allocato'
                                                    : 'Totale allocato',
                                                actual: isBudget
                                                    ? 'Spesa effettiva'
                                                    : 'Totale effettivo',
                                                variance:
                                                    scope === 'project'
                                                        ? 'Scostamento progetto'
                                                        : 'Scostamento confrontabile',
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
                                        ) : (
                                            <SummaryValue
                                                value={money(
                                                    current[metric],
                                                    '—',
                                                )}
                                            />
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
                            </Card>
                        );
                    },
                )}
                <Card className="@container/card min-w-0">
                    <CardHeader>
                        <CardDescription>
                            Completezza{' '}
                            {isBudget ? 'del Budget' : 'delle spese'}
                        </CardDescription>
                        <CardTitle className="summary-value">
                            {loading ? (
                                <Skeleton className="skeleton-shimmer h-8 w-24" />
                            ) : (
                                <SummaryValue
                                    value={percent(current.complete_percentage)}
                                />
                            )}
                        </CardTitle>
                        {!loading && previous && points !== null && (
                            <ComparisonBadge
                                difference={points}
                                label={`${signedNumber.format(points)}%`}
                                year={previousYear}
                            />
                        )}
                    </CardHeader>
                </Card>
            </div>
        </div>
    );
}

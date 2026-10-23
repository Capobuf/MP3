import { cn } from '@/lib/utils';
import { cents, percent } from './analytics-helpers';
import type { EconomicValues } from './analytics-types';
import { AnalyticsCard } from './analytics-ui';
import { money, varianceTextClass } from './helpers';

export function AllocatedUsage({
    values,
}: {
    values: Pick<EconomicValues, 'allocated' | 'actual'>;
}) {
    const allocated =
        values.allocated === null ? null : cents(values.allocated);
    const actual = values.actual === null ? null : cents(values.actual);
    const usage =
        allocated !== null && allocated > 0 && actual !== null
            ? (actual * 100) / allocated
            : null;
    const remaining =
        allocated !== null && actual !== null ? allocated - actual : null;
    const exceeded = remaining !== null && remaining < 0;

    return (
        <AnalyticsCard title="Utilizzo dell’allocato">
            <p className="summary-value">{percent(usage)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
                {usage !== null
                    ? 'Effettivo rispetto all’allocato'
                    : allocated === null || actual === null
                      ? 'Allocato o effettivo non disponibili.'
                      : 'Il rapporto richiede un allocato maggiore di zero.'}
            </p>
            <dl className="mt-6 flex flex-col gap-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Allocato</dt>
                    <dd className="financial-value">
                        {money(values.allocated, 'Non disponibile')}
                    </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Effettivo</dt>
                    <dd className="financial-value">
                        {money(values.actual, 'Non disponibile')}
                    </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t pt-4">
                    <dt className="text-muted-foreground">
                        {exceeded
                            ? 'Superamento dell’allocato'
                            : 'Residuo allocato'}
                    </dt>
                    <dd
                        className={cn(
                            'financial-value',
                            varianceTextClass(
                                remaining === null ? null : -remaining,
                            ),
                        )}
                    >
                        {remaining === null
                            ? 'Non disponibile'
                            : money(Math.abs(remaining) / 100)}
                    </dd>
                </div>
            </dl>
        </AnalyticsCard>
    );
}

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Card,
    CardAction,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Empty, EmptyHeader, EmptyDescription } from '@/components/ui/empty';
import { money } from './helpers';
import type { EconomicValues, Metric } from './analytics-types';

export const AnalyticsLoadingContext = createContext(false);

export function ChartReset({ onReset }: { onReset: () => void }) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onReset}
            aria-label="Mostra tutti"
            title="Mostra tutti"
        >
            <RotateCcw aria-hidden="true" />
        </Button>
    );
}

export function AnalyticsCard({
    title,
    controls,
    children,
}: {
    title: string;
    controls?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Card className="h-full min-w-0 gap-4">
            <CardHeader className="gap-2 px-4 sm:px-6">
                <CardTitle className="text-base leading-snug">
                    {title}
                </CardTitle>
                {controls && (
                    <CardAction className="col-start-1 row-span-1 row-start-2 justify-self-start @lg/card-header:col-start-2 @lg/card-header:row-start-1 @lg/card-header:justify-self-end">
                        {controls}
                    </CardAction>
                )}
            </CardHeader>
            <CardContent className="min-w-0 px-4 font-sans tracking-normal tabular-nums sm:px-6">
                {children}
            </CardContent>
        </Card>
    );
}
export function EmptyChart({
    children = 'Nessun dato nel perimetro selezionato.',
}: {
    children?: ReactNode;
}) {
    const loading = useContext(AnalyticsLoadingContext);
    if (loading)
        return (
            <div
                className="flex h-80 items-end gap-3 py-8"
                aria-label="Caricamento grafico"
            >
                {[40, 65, 50, 85, 70].map((height) => (
                    <Skeleton
                        key={height}
                        className="skeleton-shimmer flex-1"
                        style={{ height: `${height}%` }}
                    />
                ))}
            </div>
        );
    return (
        <Empty className="h-80">
            <EmptyHeader>
                <EmptyDescription>{children}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    );
}
export function MetricSelect({
    value,
    onChange,
}: {
    value: Metric;
    onChange: (metric: Metric) => void;
}) {
    return (
        <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={value}
            aria-label="Metrica economica"
            onValueChange={(next) => {
                if (next === 'actual' || next === 'allocated') onChange(next);
            }}
        >
            <ToggleGroupItem value="actual">Effettivo</ToggleGroupItem>
            <ToggleGroupItem value="allocated">Allocato</ToggleGroupItem>
        </ToggleGroup>
    );
}
export function Reconciliation({
    values,
    metric,
}: {
    values: EconomicValues;
    metric: Metric;
}) {
    return (
        <dl className="mt-4 grid gap-2 border-t pt-3 text-sm sm:grid-cols-3">
            {[
                ['Importi positivi', values[`${metric}_positive`]],
                ['Rettifiche negative', values[`${metric}_negative`]],
                ['Totale netto', values[metric]],
            ].map(([label, value]) => (
                <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-medium tracking-normal break-words tabular-nums">
                        {value === null ? 'Non disponibile' : money(value)}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

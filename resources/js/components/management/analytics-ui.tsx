import type { ReactNode } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { money } from './helpers';
import type { EconomicValues, Metric } from './analytics-types';

export function AnalyticsCard({
    title,
    description,
    controls,
    children,
}: {
    title: string;
    description: ReactNode;
    controls?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Card className="min-w-0">
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base">{title}</CardTitle>
                    {controls}
                </div>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 font-sans tabular-nums">
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
    return (
        <div className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">
            {children}
        </div>
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
        <Select
            value={value}
            onValueChange={(value) => onChange(value as Metric)}
        >
            <SelectTrigger className="w-32" aria-label="Metrica economica">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="actual">Effettivo</SelectItem>
                <SelectItem value="allocated">Allocato</SelectItem>
            </SelectContent>
        </Select>
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
        <dl className="mt-4 grid gap-2 border-t pt-3 text-xs sm:grid-cols-3">
            {[
                ['Importi positivi', values[`${metric}_positive`]],
                ['Rettifiche negative', values[`${metric}_negative`]],
                ['Totale netto', values[metric]],
            ].map(([label, value]) => (
                <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-medium">
                        {value === null ? 'Non disponibile' : money(value)}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

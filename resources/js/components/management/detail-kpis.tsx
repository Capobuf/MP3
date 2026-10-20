import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { money, varianceTextClass } from './helpers';
import { SummaryValue } from './dashboard-summary';

export function DetailKpis({
    allocated,
    actual,
    variance,
    count,
    aggregate = false,
}: {
    allocated: string | null | undefined;
    actual: string | null | undefined;
    variance: string | null | undefined;
    count: number;
    aggregate?: boolean;
}) {
    const cards = [
        {
            label: aggregate ? 'Totale allocato' : 'Allocato',
            value: money(allocated),
        },
        {
            label: aggregate ? 'Totale effettivo' : 'Effettivo',
            value: money(actual),
        },
        {
            label: aggregate ? 'Scostamento confrontabile' : 'Scostamento',
            value: variance == null ? 'Non determinabile' : money(variance),
        },
        {
            label: aggregate ? 'Voci economiche collegate' : 'Righe economiche',
            value: count.toLocaleString('it-IT'),
        },
    ];
    return (
        <section
            aria-label="Riepilogo economico"
            className="@container/summary"
        >
            <div className="summary-grid @md/summary:grid-cols-2 @5xl/summary:grid-cols-4">
                {cards.map((card, index) => (
                    <Card key={card.label} className="@container/card min-w-0">
                        <CardHeader>
                            <CardDescription>{card.label}</CardDescription>
                            <CardTitle
                                className={cn(
                                    'summary-value text-foreground',
                                    index === 2 && varianceTextClass(variance),
                                )}
                            >
                                <SummaryValue value={card.value} />
                            </CardTitle>
                        </CardHeader>
                    </Card>
                ))}
            </div>
        </section>
    );
}

import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { money, varianceTextClass } from './helpers';

export function DetailKpis({
    allocated,
    actual,
    variance,
    count,
    aggregate = false,
    incomplete = 0,
}: {
    allocated: string | null | undefined;
    actual: string | null | undefined;
    variance: string | null | undefined;
    count: number;
    aggregate?: boolean;
    incomplete?: number;
}) {
    const cards = [
        {
            label: aggregate ? 'Totale previsto' : 'Allocato / Previsto',
            value: money(allocated),
            hint: aggregate
                ? 'Importi previsti delle spese collegate'
                : 'Importo previsto della spesa',
        },
        {
            label: aggregate ? 'Totale effettivo' : 'Effettivo',
            value: money(actual),
            hint: 'Costi effettivi registrati',
        },
        {
            label: aggregate ? 'Scostamento confrontabile' : 'Scostamento',
            value: variance == null ? 'Non determinabile' : money(variance),
            hint: aggregate
                ? `${count - incomplete} voci confrontabili${incomplete ? ` · confronto parziale: ${incomplete} da completare` : ''}`
                : 'Effettivo meno previsto',
        },
        {
            label: aggregate ? 'Voci economiche collegate' : 'Righe economiche',
            value: count.toLocaleString('it-IT'),
            hint: aggregate
                ? 'Spese e imputazioni nel perimetro selezionato'
                : 'Righe previste ed effettive',
        },
    ];
    return (
        <section
            aria-label="Riepilogo economico"
            className="@container/detail-kpis"
        >
            <div className="summary-grid @md/detail-kpis:grid-cols-2 @5xl/detail-kpis:grid-cols-4">
                {cards.map((card, index) => (
                    <Card
                        key={card.label}
                        className="min-w-0 detail-enter gap-3 py-5 transition-shadow hover:shadow-md"
                        style={{ animationDelay: `${index * 45}ms` }}
                    >
                        <CardHeader className="gap-3 px-5">
                            <CardDescription>{card.label}</CardDescription>
                            <CardTitle
                                className={cn(
                                    'financial-value text-2xl break-words tabular-nums',
                                    index === 2 && varianceTextClass(variance),
                                    variance == null &&
                                        index === 2 &&
                                        'text-lg',
                                )}
                            >
                                {card.value}
                            </CardTitle>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {card.hint}
                            </p>
                        </CardHeader>
                    </Card>
                ))}
            </div>
        </section>
    );
}

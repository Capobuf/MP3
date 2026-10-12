import {
    Card,
    CardDescription,
    CardFooter,
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
            context: 'Importi previsti presenti',
            hint: aggregate
                ? 'Importi previsti delle spese collegate'
                : 'Importo previsto della spesa',
        },
        {
            label: aggregate ? 'Totale effettivo' : 'Effettivo',
            value: money(actual),
            context: 'Importi effettivi presenti',
            hint: 'Costi effettivi registrati',
        },
        {
            label: aggregate ? 'Scostamento confrontabile' : 'Scostamento',
            value: variance == null ? 'Non determinabile' : money(variance),
            context: aggregate
                ? 'Confronto sulle voci complete'
                : 'Confronto previsto / effettivo',
            hint: aggregate
                ? `${count - incomplete} voci confrontabili${incomplete ? ` · confronto parziale: ${incomplete} da completare` : ''}`
                : 'Effettivo meno previsto',
        },
        {
            label: aggregate ? 'Voci economiche collegate' : 'Righe economiche',
            value: count.toLocaleString('it-IT'),
            context: aggregate
                ? 'Perimetro selezionato'
                : 'Dettaglio della spesa',
            hint: aggregate
                ? 'Spese e imputazioni nel perimetro selezionato'
                : 'Righe previste ed effettive',
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
                                {card.value}
                            </CardTitle>
                        </CardHeader>
                        <CardFooter className="mt-auto flex-col items-start gap-1.5 text-sm">
                            <div className="font-medium">{card.context}</div>
                            <div className="text-muted-foreground">
                                {card.hint}
                            </div>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        </section>
    );
}

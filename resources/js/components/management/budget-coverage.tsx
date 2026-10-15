import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { BudgetSnapshot } from './budget-types';
import { money } from './helpers';

export function BudgetCoveragePanel({
    coverage,
    year,
    busy,
    onReview,
}: {
    coverage: BudgetSnapshot['coverage'];
    year: number;
    busy: boolean;
    onReview: () => void;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Copertura del Budget</CardTitle>
                <CardDescription>
                    {coverage.included.count} spese incluse su{' '}
                    {coverage.archive.count} registrate nel {year}. Ogni spesa è
                    conteggiata una sola volta, anche se collegata a più voci.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Spese dell’anno</TableHead>
                            <TableHead className="text-right">Numero</TableHead>
                            <TableHead className="text-right">
                                Allocato
                            </TableHead>
                            <TableHead className="text-right">
                                Effettivo
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(
                            [
                                ['archive', 'Totale in archivio'],
                                ['included', 'Incluse nel Budget'],
                                ['uncovered', 'Fuori dal Budget'],
                            ] as const
                        ).map(([key, label]) => (
                            <TableRow key={key}>
                                <TableCell>{label}</TableCell>
                                <TableCell className="text-right financial-value">
                                    {coverage[key].count}
                                </TableCell>
                                {(['allocated', 'actual'] as const).map(
                                    (metric) => (
                                        <TableCell
                                            key={metric}
                                            className="text-right"
                                        >
                                            <span className="financial-value">
                                                {money(coverage[key][metric])}
                                            </span>
                                            {coverage[key][
                                                `${metric}_missing`
                                            ] > 0 && (
                                                <p className="text-xs text-muted-foreground">
                                                    {coverage[key][metric] !==
                                                        null && 'Parziale · '}
                                                    {
                                                        coverage[key][
                                                            `${metric}_missing`
                                                        ]
                                                    }{' '}
                                                    da compilare
                                                </p>
                                            )}
                                        </TableCell>
                                    ),
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">
                    Le voci manuali del Budget non fanno parte dell’archivio. Le
                    spese fuori Budget comprendono anche quelle escluse o
                    rimosse: puoi verificarle senza reinserirle automaticamente.
                </p>
                {coverage.uncovered.count > 0 && (
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={onReview}
                    >
                        Verifica spese fuori Budget
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}

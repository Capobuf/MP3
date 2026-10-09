import { Link } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { dateLabel, money } from './helpers';
import type { Expense } from './types';

export function ExpenseTable({
    rows,
    slug,
    onEdit,
    showYear = false,
}: {
    rows: Expense[];
    slug: string;
    onEdit: (expense: Expense) => void;
    showYear?: boolean;
}) {
    if (!rows.length)
        return (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nessuna spesa in questo perimetro. Aggiungi una spesa oppure
                modifica i filtri.
            </div>
        );
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Descrizione</TableHead>
                    {showYear && <TableHead>Anno</TableHead>}
                    <TableHead>Fornitore / progetto</TableHead>
                    <TableHead className="text-right">Allocato</TableHead>
                    <TableHead className="text-right">Effettivo</TableHead>
                    <TableHead className="text-right">Scostamento</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead>Azioni</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((expense) => (
                    <TableRow key={expense.id}>
                        <TableCell className="font-medium">
                            <Link href={`/t/${slug}/expenses/${expense.id}`}>
                                {expense.title}
                            </Link>
                        </TableCell>
                        {showYear && <TableCell>{expense.year}</TableCell>}
                        <TableCell>
                            <p>{expense.vendor?.name ?? '—'}</p>
                            <p className="text-xs text-muted-foreground">
                                {expense.project?.name ?? 'Senza progetto'}
                            </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {money(expense.allocated_amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {money(expense.actual_amount)}
                        </TableCell>
                        <TableCell
                            className={`text-right tabular-nums ${Number(expense.variance) > 0 ? 'text-destructive' : ''}`}
                        >
                            {expense.variance == null
                                ? 'Non determinabile'
                                : money(expense.variance)}
                        </TableCell>
                        <TableCell>{dateLabel(expense.due_on)}</TableCell>
                        <TableCell>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onEdit(expense)}
                            >
                                Apri / modifica
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

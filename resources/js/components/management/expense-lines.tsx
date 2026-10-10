import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { dateLabel, decimalInput, money, varianceTextClass } from './helpers';
import { DateField } from './date-field';
import {
    ExpensePeriodFields,
    periodCrossesYears,
    periodYear,
} from './expense-period-fields';
import type { ExpenseLine, RecordData } from './types';

export type DraftLine = ExpenseLine & { key: string };

let nextLineKey = 0;
function lineKey(): string {
    return `expense-line-${++nextLineKey}`;
}

export function emptyDraftLine(
    type: ExpenseLine['type'] = 'allocated',
    description = '',
): DraftLine {
    return {
        key: lineKey(),
        description,
        type,
        quantity: '1',
        unit_price: '',
    };
}

export function draftLines(record?: RecordData): DraftLine[] {
    const lines = record?.lines?.length
        ? record.lines
        : (['allocated', 'actual'] as const).flatMap((type) => {
              const amount =
                  record?.[
                      type === 'allocated'
                          ? 'allocated_amount'
                          : 'actual_amount'
                  ];
              return amount == null
                  ? []
                  : [
                        {
                            description: record?.title ?? '',
                            type,
                            unit_price: amount,
                            quantity: '1',
                            period_starts_on: record?.period_starts_on,
                            period_ends_on: record?.period_ends_on,
                            year: record?.year,
                        },
                    ];
          });
    return lines.map((line) => ({
        ...line,
        year: line.year ?? record?.year,
        key: lineKey(),
    }));
}

// Integer arithmetic mirrors the server: round each price × quantity to cents.
export function lineCents(line: ExpenseLine): bigint | null {
    const price = decimalInput(line.unit_price) ?? '';
    const quantity = decimalInput(line.quantity) ?? '';
    if (
        !/^-?\d{1,12}(\.\d{1,2})?$/.test(price) ||
        !/^\d{1,6}(\.\d{1,4})?$/.test(quantity)
    )
        return null;
    const [whole, fraction = ''] = price.replace('-', '').split('.');
    const [units, partial = ''] = quantity.split('.');
    const scaled = BigInt(units) * 10000n + BigInt(partial.padEnd(4, '0'));
    if (scaled === 0n) return null;
    const product =
        (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * scaled;
    return ((product + 5000n) / 10000n) * (price.startsWith('-') ? -1n : 1n);
}

export function ExpenseLines({
    lines,
    onChange,
    disabled = false,
    readOnly = false,
    contractMode = false,
    defaultDescription = '',
    defaultPeriod,
    errors = {},
}: {
    lines: DraftLine[];
    onChange?: (lines: DraftLine[]) => void;
    disabled?: boolean;
    readOnly?: boolean;
    contractMode?: boolean;
    defaultDescription?: string;
    defaultPeriod?: Record<string, string>;
    errors?: Record<string, string[]>;
}) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [selected, setSelected] = useState<string[]>([]);
    const pendingFocus = useRef<string | null>(null);
    const visible = lines.filter(
        (line) =>
            (filter === 'all' || line.type === filter) &&
            line.description
                .toLocaleLowerCase('it')
                .includes(search.toLocaleLowerCase('it')),
    );
    const showYearColumn = contractMode && visible.some(periodCrossesYears);
    const selectedLines = lines.filter((line) => selected.includes(line.key));
    const visibleSelected = visible.filter((line) =>
        selected.includes(line.key),
    ).length;
    const filtered = filter !== 'all' || search !== '';
    const totals: Record<ExpenseLine['type'], bigint | null> = {
        allocated: contractMode ? null : 0n,
        actual: contractMode ? null : 0n,
    };
    const incomplete = new Set<ExpenseLine['type']>();
    for (const line of lines) {
        const cents = lineCents(line);
        if (cents === null) incomplete.add(line.type);
        else totals[line.type] = (totals[line.type] ?? 0n) + cents;
    }
    for (const type of ['allocated', 'actual'] as const) {
        if (contractMode ? incomplete.has(type) : incomplete.size > 0)
            totals[type] = null;
    }
    const variance =
        totals.allocated === null || totals.actual === null
            ? null
            : totals.actual - totals.allocated;
    const allocatedLabel = contractMode ? 'Previsto' : 'Allocato';
    function change(key: string, patch: Partial<ExpenseLine>) {
        onChange?.(
            lines.map((line) => {
                if (line.key !== key) return line;
                const next = { ...line, ...patch };
                if ('period_starts_on' in patch || 'period_ends_on' in patch)
                    next.year = periodYear(
                        {
                            year: String(
                                next.year ??
                                    defaultPeriod?.year ??
                                    new Date().getFullYear(),
                            ),
                            period_starts_on: next.period_starts_on ?? '',
                            period_ends_on: next.period_ends_on ?? '',
                        },
                        !line.period_starts_on || !line.period_ends_on,
                    );
                return next;
            }),
        );
    }
    function add() {
        if (lines.length >= 500) return;
        const line = emptyDraftLine(
            filter === 'actual' ? 'actual' : 'allocated',
            defaultDescription,
        );
        if (contractMode) {
            line.period_starts_on = defaultPeriod?.period_starts_on ?? '';
            line.period_ends_on = defaultPeriod?.period_ends_on ?? '';
            line.year = periodYear(
                {
                    ...defaultPeriod,
                    year:
                        defaultPeriod?.year ?? String(new Date().getFullYear()),
                },
                true,
            );
        }
        pendingFocus.current = line.key;
        setSearch('');
        onChange?.([...lines, line]);
    }
    function duplicate(keys: string[]) {
        const copies: string[] = [];
        onChange?.(
            lines.flatMap((line) => {
                if (!keys.includes(line.key)) return [line];
                const key = lineKey();
                copies.push(key);
                return [line, { ...line, key }];
            }),
        );
        setSelected(copies);
    }
    function remove(keys: string[]) {
        onChange?.(lines.filter((line) => !keys.includes(line.key)));
        setSelected((previous) =>
            previous.filter((key) => !keys.includes(key)),
        );
    }
    function move(index: number, offset: number) {
        const next = [...lines];
        [next[index], next[index + offset]] = [
            next[index + offset],
            next[index],
        ];
        onChange?.(next);
    }
    function resetFilters() {
        setSearch('');
        setFilter('all');
    }
    const format = (cents: bigint) => money(Number(cents) / 100);
    return (
        <section
            className="flex min-w-0 flex-col gap-3"
            aria-label={
                contractMode
                    ? 'Condizioni economiche'
                    : 'Righe economiche della spesa'
            }
        >
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto font-semibold">
                    {contractMode
                        ? 'Condizioni economiche'
                        : 'Righe economiche'}
                </h2>
                {!readOnly && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || lines.length >= 500}
                        onClick={add}
                    >
                        <Plus className="size-4" />{' '}
                        {contractMode
                            ? 'Aggiungi condizione economica'
                            : 'Aggiungi riga'}
                    </Button>
                )}
            </div>
            <div className="flex flex-wrap gap-2">
                <Input
                    aria-label={
                        contractMode
                            ? 'Cerca nelle condizioni economiche'
                            : 'Cerca nelle descrizioni delle righe'
                    }
                    placeholder={
                        contractMode
                            ? 'Cerca nelle condizioni…'
                            : 'Cerca nelle righe…'
                    }
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    disabled={disabled}
                    className="min-w-40 flex-1"
                />
                <NativeSelect
                    aria-label={
                        contractMode
                            ? 'Filtra condizioni per tipo'
                            : 'Filtra righe per tipo'
                    }
                    value={filter}
                    disabled={disabled}
                    onChange={(event) => setFilter(event.target.value)}
                >
                    <NativeSelectOption value="all">
                        Tutti i tipi
                    </NativeSelectOption>
                    <NativeSelectOption value="allocated">
                        {contractMode ? 'Previste' : 'Allocati'}
                    </NativeSelectOption>
                    <NativeSelectOption value="actual">
                        Effettivi
                    </NativeSelectOption>
                </NativeSelect>
                {filtered && (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={disabled}
                        onClick={resetFilters}
                    >
                        Azzera filtri
                    </Button>
                )}
            </div>
            <p className="text-sm text-muted-foreground">
                {visible.length} di {lines.length}{' '}
                {contractMode ? 'condizioni economiche' : 'righe'}.{' '}
                {!readOnly &&
                    'Modifica i campi direttamente nella tabella e usa le frecce per riordinare. Le modifiche saranno salvate con la spesa.'}
            </p>
            {errors.lines && (
                <p role="alert" className="text-sm text-destructive">
                    {errors.lines[0]}
                </p>
            )}
            {filtered &&
                Object.keys(errors).some((key) => key.startsWith('lines.')) && (
                    <p role="alert" className="text-sm text-destructive">
                        {contractMode
                            ? 'Ci sono condizioni economiche da correggere.'
                            : 'Ci sono righe da correggere.'}{' '}
                        <Button
                            type="button"
                            variant="link"
                            onClick={resetFilters}
                        >
                            {contractMode
                                ? 'Mostra tutte le condizioni'
                                : 'Mostra tutte le righe'}
                        </Button>
                    </p>
                )}
            {!readOnly && selectedLines.length > 0 && (
                <div
                    className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-sm"
                    aria-label={
                        contractMode
                            ? 'Operazioni sulle condizioni selezionate'
                            : 'Operazioni sulle righe selezionate'
                    }
                >
                    <span className="mr-auto" role="status">
                        {selectedLines.length}{' '}
                        {contractMode
                            ? 'condizioni selezionate'
                            : 'righe selezionate'}
                        {selectedLines.length > visibleSelected
                            ? ` (${selectedLines.length - visibleSelected} nascoste dai filtri)`
                            : ''}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={() =>
                            onChange?.(
                                lines.map((line) =>
                                    selected.includes(line.key)
                                        ? { ...line, type: 'allocated' }
                                        : line,
                                ),
                            )
                        }
                    >
                        {contractMode ? 'Imposta previste' : 'Imposta allocati'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={() =>
                            onChange?.(
                                lines.map((line) =>
                                    selected.includes(line.key)
                                        ? { ...line, type: 'actual' }
                                        : line,
                                ),
                            )
                        }
                    >
                        Imposta effettivi
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                            disabled ||
                            lines.length + selectedLines.length > 500
                        }
                        onClick={() => duplicate(selected)}
                    >
                        <Copy className="size-4" /> Duplica
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={() => remove(selected)}
                    >
                        <Trash2 className="size-4" /> Elimina
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() => setSelected([])}
                    >
                        Deseleziona
                    </Button>
                </div>
            )}
            <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {!readOnly && (
                                <TableHead className="w-10">
                                    <Checkbox
                                        aria-label={
                                            contractMode
                                                ? 'Seleziona tutte le condizioni visibili'
                                                : 'Seleziona tutte le righe visibili'
                                        }
                                        disabled={disabled || !visible.length}
                                        checked={
                                            visibleSelected ===
                                                visible.length &&
                                            visible.length > 0
                                                ? true
                                                : visibleSelected > 0
                                                  ? 'indeterminate'
                                                  : false
                                        }
                                        onCheckedChange={(checked) =>
                                            setSelected((previous) =>
                                                checked === true
                                                    ? [
                                                          ...new Set([
                                                              ...previous,
                                                              ...visible.map(
                                                                  (line) =>
                                                                      line.key,
                                                              ),
                                                          ]),
                                                      ]
                                                    : previous.filter(
                                                          (key) =>
                                                              !visible.some(
                                                                  (line) =>
                                                                      line.key ===
                                                                      key,
                                                              ),
                                                      ),
                                            )
                                        }
                                    />
                                </TableHead>
                            )}
                            {!readOnly && <TableHead>Ordine</TableHead>}
                            <TableHead>Tipo</TableHead>
                            <TableHead>Descrizione</TableHead>
                            <TableHead className="text-right">
                                Prezzo unitario (€)
                            </TableHead>
                            <TableHead className="text-right">
                                Quantità
                            </TableHead>
                            <TableHead className="text-right">Totale</TableHead>
                            {contractMode && (
                                <>
                                    <TableHead>Inizio</TableHead>
                                    <TableHead>Fine</TableHead>
                                    {showYearColumn && (
                                        <TableHead className="w-px whitespace-normal">
                                            Anno di imputazione
                                        </TableHead>
                                    )}
                                </>
                            )}
                            {!readOnly && (
                                <TableHead>
                                    <span className="sr-only">Azioni</span>
                                </TableHead>
                            )}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!visible.length && (
                            <TableRow>
                                <TableCell
                                    colSpan={
                                        (readOnly ? 5 : 8) +
                                        (contractMode ? 2 : 0) +
                                        (showYearColumn ? 1 : 0)
                                    }
                                    className="py-6 text-center text-muted-foreground"
                                >
                                    {lines.length
                                        ? contractMode
                                            ? 'Nessuna condizione corrisponde ai filtri.'
                                            : 'Nessuna riga corrisponde ai filtri.'
                                        : readOnly
                                          ? contractMode
                                              ? 'Non sono presenti condizioni economiche.'
                                              : 'Non sono presenti righe dettagliate.'
                                          : contractMode
                                            ? 'Aggiungi una condizione economica per inserire un importo.'
                                            : 'Nessuna riga. Aggiungi una riga per inserire un importo.'}
                                </TableCell>
                            </TableRow>
                        )}
                        {visible.map((line) => {
                            const index = lines.indexOf(line);
                            const cents = lineCents(line);
                            const fieldError = (field: string) =>
                                errors[`lines.${index}.${field}`]?.[0];
                            const label = `${contractMode ? 'condizione economica' : 'riga'} ${index + 1}`;
                            return (
                                <TableRow
                                    key={line.key}
                                    className="[&>td]:align-top"
                                    data-state={
                                        selected.includes(line.key)
                                            ? 'selected'
                                            : undefined
                                    }
                                >
                                    {!readOnly && (
                                        <TableCell>
                                            <Checkbox
                                                aria-label={`Seleziona ${label}`}
                                                className="mt-2"
                                                checked={selected.includes(
                                                    line.key,
                                                )}
                                                disabled={disabled}
                                                onCheckedChange={(checked) =>
                                                    setSelected((previous) =>
                                                        checked === true
                                                            ? [
                                                                  ...previous,
                                                                  line.key,
                                                              ]
                                                            : previous.filter(
                                                                  (key) =>
                                                                      key !==
                                                                      line.key,
                                                              ),
                                                    )
                                                }
                                            />
                                        </TableCell>
                                    )}
                                    {!readOnly && (
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <span className="w-5 text-xs tabular-nums">
                                                    {index + 1}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`Sposta su ${label}`}
                                                    disabled={
                                                        disabled ||
                                                        filtered ||
                                                        index === 0
                                                    }
                                                    onClick={() =>
                                                        move(index, -1)
                                                    }
                                                >
                                                    <ArrowUp />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`Sposta giù ${label}`}
                                                    disabled={
                                                        disabled ||
                                                        filtered ||
                                                        index ===
                                                            lines.length - 1
                                                    }
                                                    onClick={() =>
                                                        move(index, 1)
                                                    }
                                                >
                                                    <ArrowDown />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    )}
                                    <TableCell className="min-w-32">
                                        {readOnly ? (
                                            line.type === 'allocated' ? (
                                                allocatedLabel
                                            ) : (
                                                'Effettivo'
                                            )
                                        ) : (
                                            <NativeSelect
                                                aria-label={`Tipo ${label}`}
                                                aria-invalid={
                                                    !!fieldError('type')
                                                }
                                                value={line.type}
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    change(line.key, {
                                                        type: event.target
                                                            .value as ExpenseLine['type'],
                                                    })
                                                }
                                            >
                                                <NativeSelectOption value="allocated">
                                                    {allocatedLabel}
                                                </NativeSelectOption>
                                                <NativeSelectOption value="actual">
                                                    Effettivo
                                                </NativeSelectOption>
                                            </NativeSelect>
                                        )}
                                        {fieldError('type') && (
                                            <p
                                                role="alert"
                                                className="text-sm text-destructive"
                                            >
                                                {fieldError('type')}
                                            </p>
                                        )}
                                    </TableCell>
                                    <TableCell className="min-w-52 whitespace-normal">
                                        {readOnly ? (
                                            line.description
                                        ) : (
                                            <Input
                                                ref={(input) => {
                                                    if (
                                                        input &&
                                                        pendingFocus.current ===
                                                            line.key
                                                    ) {
                                                        pendingFocus.current =
                                                            null;
                                                        input.focus();
                                                        input.scrollIntoView({
                                                            block: 'nearest',
                                                            inline: 'nearest',
                                                        });
                                                    }
                                                }}
                                                aria-label={`Descrizione ${label}`}
                                                aria-invalid={
                                                    !!fieldError('description')
                                                }
                                                value={line.description}
                                                disabled={disabled}
                                                maxLength={255}
                                                onChange={(event) =>
                                                    change(line.key, {
                                                        description:
                                                            event.target.value,
                                                    })
                                                }
                                            />
                                        )}
                                        {fieldError('description') && (
                                            <p
                                                role="alert"
                                                className="mt-1 text-sm text-destructive"
                                            >
                                                {fieldError('description')}
                                            </p>
                                        )}
                                    </TableCell>
                                    <TableCell className="min-w-44 text-right font-medium tracking-normal tabular-nums">
                                        {readOnly ? (
                                            money(line.unit_price)
                                        ) : (
                                            <Input
                                                aria-label={`Prezzo unitario ${label}`}
                                                aria-invalid={
                                                    !!fieldError('unit_price')
                                                }
                                                inputMode="decimal"
                                                className="text-right font-medium tracking-normal tabular-nums"
                                                value={line.unit_price}
                                                disabled={disabled}
                                                placeholder="0,00"
                                                onChange={(event) =>
                                                    change(line.key, {
                                                        unit_price:
                                                            event.target.value,
                                                    })
                                                }
                                            />
                                        )}
                                        {fieldError('unit_price') && (
                                            <p
                                                role="alert"
                                                className="mt-1 text-sm text-destructive"
                                            >
                                                {fieldError('unit_price')}
                                            </p>
                                        )}
                                    </TableCell>
                                    <TableCell className="min-w-32 text-right font-medium tracking-normal tabular-nums">
                                        {readOnly ? (
                                            Number(
                                                line.quantity,
                                            ).toLocaleString('it-IT', {
                                                maximumFractionDigits: 4,
                                            })
                                        ) : (
                                            <Input
                                                aria-label={`Quantità ${label}`}
                                                aria-invalid={
                                                    !!fieldError('quantity')
                                                }
                                                inputMode="decimal"
                                                className="text-right font-medium tracking-normal tabular-nums"
                                                value={line.quantity}
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    change(line.key, {
                                                        quantity:
                                                            event.target.value,
                                                    })
                                                }
                                            />
                                        )}
                                        {fieldError('quantity') && (
                                            <p
                                                role="alert"
                                                className="mt-1 text-sm text-destructive"
                                            >
                                                {fieldError('quantity')}
                                            </p>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-medium tracking-normal tabular-nums">
                                        <output aria-label={`Totale ${label}`}>
                                            {cents === null
                                                ? 'Da completare'
                                                : format(cents)}
                                        </output>
                                    </TableCell>
                                    {contractMode &&
                                        (
                                            [
                                                'period_starts_on',
                                                'period_ends_on',
                                            ] as const
                                        ).map((field) => (
                                            <TableCell
                                                key={field}
                                                className="min-w-44"
                                            >
                                                {readOnly ? (
                                                    dateLabel(line[field])
                                                ) : (
                                                    <DateField
                                                        id={`${line.key}-${field}`}
                                                        aria-label={`${field === 'period_starts_on' ? 'Inizio' : 'Fine'} ${label}`}
                                                        value={
                                                            line[field] ?? ''
                                                        }
                                                        onChange={(value) =>
                                                            change(line.key, {
                                                                [field]: value,
                                                            })
                                                        }
                                                        disabled={disabled}
                                                        aria-invalid={
                                                            !!fieldError(field)
                                                        }
                                                        aria-describedby={
                                                            fieldError(field)
                                                                ? `${line.key}-${field}-error`
                                                                : undefined
                                                        }
                                                    />
                                                )}
                                                {fieldError(field) && (
                                                    <p
                                                        id={`${line.key}-${field}-error`}
                                                        role="alert"
                                                        className="text-sm text-destructive"
                                                    >
                                                        {fieldError(field)}
                                                    </p>
                                                )}
                                            </TableCell>
                                        ))}
                                    {showYearColumn && (
                                        <TableCell className="w-px">
                                            {readOnly ? (
                                                periodCrossesYears(line) ? (
                                                    line.year
                                                ) : null
                                            ) : (
                                                <ExpensePeriodFields
                                                    compact
                                                    values={{
                                                        period_starts_on:
                                                            line.period_starts_on ??
                                                            '',
                                                        period_ends_on:
                                                            line.period_ends_on ??
                                                            '',
                                                        year: String(
                                                            line.year ?? '',
                                                        ),
                                                    }}
                                                    onChange={(_, value) =>
                                                        change(line.key, {
                                                            year: value,
                                                        })
                                                    }
                                                    disabled={disabled}
                                                    errors={
                                                        fieldError('year')
                                                            ? {
                                                                  year: [
                                                                      fieldError(
                                                                          'year',
                                                                      )!,
                                                                  ],
                                                              }
                                                            : {}
                                                    }
                                                    showPeriod={false}
                                                    idPrefix={line.key}
                                                    yearLabel={`Anno ${label}`}
                                                />
                                            )}
                                        </TableCell>
                                    )}
                                    {!readOnly && (
                                        <TableCell>
                                            <div className="flex gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`Duplica ${label}`}
                                                    disabled={
                                                        disabled ||
                                                        lines.length >= 500
                                                    }
                                                    onClick={() =>
                                                        duplicate([line.key])
                                                    }
                                                >
                                                    <Copy />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`Elimina ${label}`}
                                                    disabled={disabled}
                                                    onClick={() =>
                                                        remove([line.key])
                                                    }
                                                >
                                                    <Trash2 />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
            {filtered && !readOnly && (
                <p className="text-sm text-muted-foreground">
                    {contractMode
                        ? 'Azzera i filtri per riordinare le condizioni.'
                        : 'Azzera i filtri per riordinare le righe.'}
                </p>
            )}
            <h3 className="font-semibold">Riepilogo</h3>
            <dl
                className="grid gap-3 rounded-md bg-muted/50 p-3 sm:grid-cols-3"
                aria-live="polite"
            >
                {(
                    [
                        [
                            contractMode ? 'Totale previsto' : allocatedLabel,
                            totals.allocated,
                        ],
                        [
                            contractMode ? 'Totale effettivo' : 'Effettivo',
                            totals.actual,
                        ],
                        [
                            `Scostamento (effettivo − ${allocatedLabel.toLowerCase()})`,
                            variance,
                        ],
                    ] as const
                ).map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-sm text-muted-foreground">
                            {label}
                        </dt>
                        <dd
                            className={cn(
                                'mt-1 font-semibold tracking-normal break-words text-foreground tabular-nums',
                                label.startsWith('Scostamento') &&
                                    varianceTextClass(value),
                            )}
                        >
                            {value === null ? 'Da completare' : format(value)}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

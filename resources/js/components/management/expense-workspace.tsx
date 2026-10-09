import { router } from '@inertiajs/react';
import { Plus, Search } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { EntitySheet } from './entity-sheet';
import { Pagination } from './pagination';
import { RecordSelect } from './record-select';
import { matchesExpenseFilters } from './helpers';
import type {
    Catalog,
    Expense,
    ExpensePageProps,
    Filters,
    RecordData,
} from './types';

const ExpenseGrid = lazy(() => import('./expense-grid'));
export function applyFilters(path: string, filters: Filters) {
    const query = Object.fromEntries(
        Object.entries(filters).filter(
            ([, value]) => value !== '' && value !== undefined,
        ),
    );
    router.get(path, query, { preserveState: true, preserveScroll: true });
}
export function ExpenseWorkspace({
    tenant,
    expenses,
    filters,
    years,
    options,
    dashboard = false,
    onCreate,
    onBusyChange,
}: ExpensePageProps & {
    dashboard?: boolean;
    onCreate?: () => void;
    onBusyChange?: (busy: boolean) => void;
}) {
    const [draft, setDraft] = useState(filters);
    const [sheet, setSheet] = useState<{ record?: Expense } | null>(null);
    const [busy, setBusy] = useState(false);
    const mobile = useIsMobile();
    const path = `/t/${tenant.slug}/${dashboard ? 'dashboard' : 'expenses'}`;
    const year = filters.year ?? new Date().getFullYear();
    function update(key: keyof Filters, value: string) {
        setDraft((previous) => ({ ...previous, [key]: value }));
    }
    function saved(record: RecordData) {
        setSheet(null);
        const excluded = !matchesExpenseFilters(record, filters);
        if (excluded)
            toast.info(
                'Spesa salvata. Non compare nella lista perché non corrisponde ai filtri correnti.',
            );
        router.reload();
    }
    return (
        <>
            <Card className="min-w-0">
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle>Spese · {year}</CardTitle>
                        <Button
                            disabled={busy}
                            onClick={() => {
                                if (onCreate) onCreate();
                                else setSheet({});
                            }}
                        >
                            <Plus className="mr-2 size-4" />
                            Nuova spesa
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <form
                        className="space-y-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            applyFilters(path, draft);
                        }}
                    >
                        <fieldset
                            disabled={busy}
                            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
                        >
                            <div className="relative">
                                <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
                                <Input
                                    aria-label="Cerca spese"
                                    className="pl-9"
                                    placeholder="Cerca una spesa…"
                                    value={draft.search ?? ''}
                                    onChange={(event) =>
                                        update('search', event.target.value)
                                    }
                                />
                            </div>
                            {(
                                [
                                    'vendors',
                                    'contracts',
                                    'projects',
                                ] as Catalog[]
                            ).map((catalog) => (
                                <RecordSelect
                                    key={catalog}
                                    slug={tenant.slug}
                                    catalog={catalog}
                                    value={String(
                                        draft[
                                            `${catalog.slice(0, -1)}_id` as keyof Filters
                                        ] ?? '',
                                    )}
                                    onChange={(value) =>
                                        update(
                                            `${catalog.slice(0, -1)}_id` as keyof Filters,
                                            value,
                                        )
                                    }
                                    options={[
                                        ...options[catalog],
                                        ...expenses.data.flatMap((expense) =>
                                            expense[
                                                catalog.slice(0, -1) as
                                                    | 'vendor'
                                                    | 'contract'
                                                    | 'project'
                                            ]
                                                ? [
                                                      expense[
                                                          catalog.slice(
                                                              0,
                                                              -1,
                                                          ) as
                                                              | 'vendor'
                                                              | 'contract'
                                                              | 'project'
                                                      ]!,
                                                  ]
                                                : [],
                                        ),
                                    ]}
                                    label={`Tutti i ${catalog === 'vendors' ? 'fornitori' : catalog === 'contracts' ? 'contratti' : 'progetti'}`}
                                    includeNone
                                    disabled={busy}
                                />
                            ))}
                            <Select
                                value={String(draft.year ?? year)}
                                onValueChange={(value) => update('year', value)}
                                disabled={busy}
                            >
                                <SelectTrigger aria-label="Anno di imputazione">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[...new Set([...years, 2025, 2026, year])]
                                        .sort((a, b) => b - a)
                                        .map((value) => (
                                            <SelectItem
                                                key={value}
                                                value={String(value)}
                                            >
                                                {value}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </fieldset>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select
                                value={draft.sort ?? 'title'}
                                onValueChange={(value) => update('sort', value)}
                                disabled={busy}
                            >
                                <SelectTrigger
                                    className="w-44"
                                    aria-label="Ordina spese"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="updated_at">
                                        Ultima modifica
                                    </SelectItem>
                                    <SelectItem value="title">
                                        Descrizione
                                    </SelectItem>
                                    <SelectItem value="allocated_amount">
                                        Allocato
                                    </SelectItem>
                                    <SelectItem value="actual_amount">
                                        Effettivo
                                    </SelectItem>
                                    <SelectItem value="due_on">
                                        Scadenza
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <Select
                                value={draft.direction ?? 'asc'}
                                onValueChange={(value) =>
                                    update('direction', value)
                                }
                                disabled={busy}
                            >
                                <SelectTrigger
                                    className="w-36"
                                    aria-label="Direzione ordinamento"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="asc">
                                        Crescente
                                    </SelectItem>
                                    <SelectItem value="desc">
                                        Decrescente
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                variant="secondary"
                                type="submit"
                                disabled={busy}
                            >
                                Applica filtri
                            </Button>
                            <Button
                                variant="ghost"
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                    const reset = { year };
                                    setDraft(reset);
                                    applyFilters(path, reset);
                                }}
                            >
                                Azzera filtri
                            </Button>
                        </div>
                    </form>
                    {expenses.data.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-10 text-center">
                            <p className="font-medium">
                                Nessuna spesa per questi filtri
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Crea la prima spesa oppure amplia la ricerca.
                            </p>
                            <Button
                                className="mt-4"
                                variant="outline"
                                onClick={() => {
                                    if (onCreate) onCreate();
                                    else setSheet({});
                                }}
                            >
                                Aggiungi spesa
                            </Button>
                        </div>
                    ) : mobile ? (
                        <div className="space-y-3">
                            {expenses.data.map((expense) => (
                                <div
                                    key={expense.id}
                                    className="rounded-lg border p-4"
                                >
                                    <p className="font-medium">
                                        {expense.title}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {expense.vendor?.name ??
                                            'Senza fornitore'}
                                    </p>
                                    <Button
                                        className="mt-3"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setSheet({ record: expense })
                                        }
                                    >
                                        Apri / modifica importi
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Suspense
                            fallback={<Skeleton className="h-96 w-full" />}
                        >
                            <ExpenseGrid
                                rows={expenses.data}
                                options={options}
                                slug={tenant.slug}
                                onOpen={(record) => setSheet({ record })}
                                onNew={() => {
                                    if (onCreate) onCreate();
                                    else setSheet({});
                                }}
                                onBusy={(value) => {
                                    setBusy(value);
                                    onBusyChange?.(value);
                                }}
                            />
                        </Suspense>
                    )}
                    <div
                        onClickCapture={(event) => {
                            if (busy) {
                                event.preventDefault();
                                event.stopPropagation();
                            }
                        }}
                    >
                        <Pagination page={expenses} />
                    </div>
                </CardContent>
            </Card>
            {sheet && (
                <EntitySheet
                    tenant={tenant}
                    kind="expenses"
                    record={sheet.record}
                    year={year}
                    options={options}
                    onClose={() => setSheet(null)}
                    onSaved={saved}
                />
            )}
        </>
    );
}

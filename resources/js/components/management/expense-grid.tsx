import DataEditor, { GridCellKind } from '@glideapps/glide-data-grid';
import type {
    EditableGridCell,
    GridCell,
    GridColumn,
    Item,
    Theme,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { router } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAppearance } from '@/hooks/use-appearance';
import { api, decimalInput, money } from './helpers';
import type { Catalog, Expense, Options } from './types';

const columns: GridColumn[] = [
    { title: 'Descrizione spesa', width: 270 },
    { title: 'Fornitore', width: 200 },
    { title: 'Contratto', width: 200 },
    { title: 'Progetto', width: 190 },
    { title: 'Allocato (€)', width: 140 },
    { title: 'Effettivo (€)', width: 140 },
    { title: 'Scostamento (€)', width: 160 },
    { title: 'Scadenza', width: 125 },
    { title: 'Azioni', width: 100 },
];
const fields = [
    'title',
    'vendor_id',
    'contract_id',
    'project_id',
    'allocated_amount',
    'actual_amount',
    'variance',
    'due_on',
    'actions',
] as const;
type Update = { id: number; [key: string]: string | number | null };
export default function ExpenseGrid({
    rows,
    options,
    slug,
    onOpen,
    onNew,
    onBusy,
}: {
    rows: Expense[];
    options: Options;
    slug: string;
    onOpen: (expense: Expense) => void;
    onNew: () => void;
    onBusy: (busy: boolean) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    const refreshing = useRef(false);
    const { resolvedAppearance } = useAppearance();
    const dark = resolvedAppearance === 'dark';
    const theme: Partial<Theme> = {
        bgCell: dark ? '#252525' : '#ffffff',
        bgCellMedium: dark ? '#303030' : '#f5f5f5',
        bgHeader: dark ? '#303030' : '#f5f5f5',
        bgHeaderHovered: dark ? '#404040' : '#ededed',
        bgHeaderHasFocus: dark ? '#454545' : '#e5e5e5',
        textDark: dark ? '#fafafa' : '#171717',
        textMedium: dark ? '#d4d4d4' : '#525252',
        textLight: dark ? '#a3a3a3' : '#737373',
        textHeader: dark ? '#fafafa' : '#171717',
        borderColor: dark ? '#404040' : '#e5e5e5',
        accentColor: dark ? '#7dd3fc' : '#0369a1',
        accentLight: dark ? '#164e63' : '#e0f2fe',
        accentFg: dark ? '#171717' : '#ffffff',
        fontFamily: 'Instrument Sans, sans-serif',
        baseFontStyle: '13px',
    };
    useEffect(() => {
        if (!busy) return;
        const leave = (event: BeforeUnloadEvent) => event.preventDefault();
        const stop = router.on('before', (event) => {
            if (refreshing.current) {
                refreshing.current = false;
                return;
            }
            if (lock.current) {
                event.preventDefault();
                toast.info('Attendi il salvataggio delle celle.');
            }
        });
        window.addEventListener('beforeunload', leave);
        return () => {
            stop();
            window.removeEventListener('beforeunload', leave);
        };
    }, [busy]);
    function content([col, row]: Item): GridCell {
        const expense = rows[row];
        if (!expense)
            return {
                kind: GridCellKind.Text,
                data: '',
                displayData: '',
                allowOverlay: false,
                readonly: true,
            };
        const field = fields[col];
        let data = '';
        let display = '';
        if (col >= 1 && col <= 3) {
            const relation = ['vendor', 'contract', 'project'][col - 1] as
                | 'vendor'
                | 'contract'
                | 'project';
            const linked = expense[relation];
            data = linked ? `${linked.name} [${linked.id}]` : '';
            display = linked?.name ?? '—';
        } else if (field === 'actions') {
            data = 'Apri';
            display = 'Apri / modifica';
        } else {
            data = String(expense[field] ?? '');
            display =
                col >= 4 && col <= 6
                    ? expense[field] == null
                        ? col === 6
                            ? 'Non determinabile'
                            : 'Da inserire'
                        : money(data)
                    : data;
        }
        return {
            kind: GridCellKind.Text,
            data,
            displayData: display,
            copyData: col >= 4 && col <= 6 ? data.replace('.', ',') : data,
            allowOverlay: col !== 6 && col !== 8 && !busy,
            readonly: busy || col === 6 || col === 8,
            contentAlign: col >= 4 && col <= 6 ? 'right' : 'left',
        };
    }
    function parse(col: number, text: string): string | number | null {
        if (col === 4 || col === 5) return decimalInput(text);
        if (col >= 1 && col <= 3) {
            if (!text.trim() || text.trim() === '—') return null;
            const catalog = ['vendors', 'contracts', 'projects'][
                col - 1
            ] as Catalog;
            const relation = ['vendor', 'contract', 'project'][col - 1] as
                | 'vendor'
                | 'contract'
                | 'project';
            const available = [
                ...new Map(
                    [
                        ...options[catalog],
                        ...rows.flatMap((row) =>
                            row[relation] ? [row[relation]!] : [],
                        ),
                    ].map((option) => [option.id, option]),
                ).values(),
            ];
            const id = text.match(/\[(\d+)\]$/)?.[1];
            const matches = available.filter((option) =>
                id
                    ? String(option.id) === id
                    : option.name.toLocaleLowerCase() ===
                      text.trim().toLocaleLowerCase(),
            );
            if (matches.length !== 1)
                throw new Error(
                    'Collegamento non riconosciuto o ambiguo. Copia una cella collegata o scegli il record dal pannello Apri / modifica.',
                );
            return matches[0].id;
        }
        if (col === 7) {
            if (!text.trim()) return null;
            const italian = text
                .trim()
                .match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
            return italian
                ? `${italian[3]}-${italian[2]}-${italian[1]}`
                : text.trim();
        }
        return text;
    }
    async function save(
        edits: readonly { location: Item; value: EditableGridCell }[],
    ) {
        if (lock.current) {
            toast.info(
                'Attendi il salvataggio prima di modificare altre celle.',
            );
            return;
        }
        const updates = new Map<number, Update>();
        let persisted = false;
        try {
            for (const {
                location: [col, row],
                value,
            } of edits) {
                if (
                    col === 6 ||
                    col === 8 ||
                    !rows[row] ||
                    value.kind !== GridCellKind.Text
                )
                    continue;
                const field = fields[col];
                const parsed = parse(col, value.data);
                const old =
                    rows[row][field as Exclude<typeof field, 'actions'>] ??
                    null;
                if (String(parsed ?? '') === String(old ?? '')) continue;
                const update = updates.get(rows[row].id) ?? {
                    id: rows[row].id,
                };
                update[field] = parsed;
                updates.set(update.id, update);
            }
            if (!updates.size) return;
            lock.current = true;
            setBusy(true);
            onBusy(true);
            setError('');
            await api(`/t/${slug}/expenses/batch`, 'PATCH', {
                updates: [...updates.values()],
            });
            persisted = true;
            refreshing.current = true;
            await new Promise<void>((resolve, reject) => {
                let refreshed = false;
                router.reload({
                    only: ['expenses', 'totals', 'vendorChart', 'projectChart'],
                    onSuccess: () => {
                        refreshed = true;
                        resolve();
                    },
                    onFinish: () => {
                        if (!refreshed)
                            reject(
                                new Error(
                                    'Aggiornamento della griglia non riuscito.',
                                ),
                            );
                    },
                    onHttpException: () => false,
                    onNetworkError: () => false,
                });
            });
            toast.success(
                `${updates.size} ${updates.size === 1 ? 'spesa aggiornata' : 'spese aggiornate'}.`,
            );
        } catch (failure) {
            const message =
                failure instanceof Error
                    ? failure.message
                    : 'Salvataggio non riuscito.';
            setError(
                persisted
                    ? 'Le modifiche sono salvate, ma la griglia non è stata aggiornata. Ricarica la pagina per vedere i valori aggiornati.'
                    : `${message} Salvataggio non confermato. Le celle mostrano gli ultimi valori verificati; puoi correggere e riprovare.`,
            );
            toast.error(message);
        } finally {
            lock.current = false;
            refreshing.current = false;
            setBusy(false);
            onBusy(false);
        }
    }
    return (
        <div className="space-y-2">
            <p aria-live="polite" className="text-xs text-muted-foreground">
                {busy
                    ? 'Salvataggio in corso…'
                    : 'Doppio clic o Invio per modificare · Tab e frecce per spostarti · Esc per annullare · Ctrl/Cmd+C e Ctrl/Cmd+V per intervalli'}{' '}
                · Importi vuoti = da inserire.
            </p>
            {error && (
                <p
                    role="alert"
                    className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
                >
                    {error}
                </p>
            )}
            <div className="overflow-hidden rounded-lg border">
                <DataEditor
                    width="100%"
                    height={Math.min(610, Math.max(280, rows.length * 36 + 90))}
                    columns={columns}
                    rows={rows.length}
                    getCellContent={content}
                    theme={theme}
                    rowHeight={36}
                    headerHeight={40}
                    rowMarkers="number"
                    freezeColumns={1}
                    getCellsForSelection={true}
                    rangeSelect="multi-rect"
                    cellActivationBehavior="double-click"
                    onPaste={(target, values) => {
                        if (lock.current) return false;
                        if (
                            target[1] + values.length > rows.length ||
                            target[0] +
                                Math.max(...values.map((row) => row.length)) >
                                8
                        ) {
                            toast.error(
                                'L’intervallo supera le righe della pagina o include Azioni. Aggiungi prima le righe e seleziona un intervallo valido.',
                            );
                            return false;
                        }
                        return true;
                    }}
                    onCellsEdited={(edits) => {
                        void save(edits);
                        return true;
                    }}
                    onRowAppended={() => {
                        if (!busy) onNew();
                    }}
                    trailingRowOptions={{
                        hint: '+ Nuova spesa',
                        sticky: true,
                        tint: true,
                    }}
                    onCellClicked={([col, row]) => {
                        if (col === 8 && rows[row] && !busy) onOpen(rows[row]);
                    }}
                    onCellActivated={([col, row]) => {
                        if (col === 8 && rows[row] && !busy) onOpen(rows[row]);
                    }}
                />
            </div>
        </div>
    );
}

import { router } from '@inertiajs/react';
import { useUnsavedNavigation } from '@/hooks/use-unsaved-navigation';
import { useId, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { fileSize, uploadTransfer } from './helpers';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import {
    TableFilters,
    TableViewCells,
    TableViewHeader,
    useTableView,
} from './table-view';
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table';

type Preview = {
    token: string;
    new?: number;
    duplicates?: number;
    counts?: Record<string, number>;
    meta?: { name: string; slug: string };
    preview?: {
        row: number;
        label: string;
        status: 'new' | 'duplicate' | 'error';
        values: Record<string, unknown>;
    }[];
    errors: { sheet: string; row: number; field: string; message: string }[];
    error_count: number;
};
const statusLabels = {
    new: 'Nuovo',
    duplicate: 'Duplicato: saltato',
    error: 'Errore',
};
const typeLabels: Record<string, string> = {
    vendor: 'Fornitori',
    contract: 'Contratti',
    project: 'Progetti',
    expense: 'Spese',
    'expense-line': 'Righe economiche',
    'cost-center': 'Centri di costo',
    'budget-year': 'Anni Budget',
    'budget-entry': 'Voci Budget',
};

function ImportCountsTable({
    counts,
    path,
    disabled,
}: {
    counts: Record<string, number>;
    path: string;
    disabled: boolean;
}) {
    'use no memo'; // TanStack v8 exposes mutable table and column instances.

    const [search, setSearch] = useState('');
    const rows = Object.entries(counts)
        .map(([type, count]) => ({
            type,
            count,
            label: typeLabels[type] ?? type,
        }))
        .filter((row) =>
            row.label
                .toLocaleLowerCase('it')
                .includes(search.toLocaleLowerCase('it')),
        );
    const view = useTableView({
        rows,
        storageKey: `mp3:table:v1:${path}:import-counts`,
        columns: [
            {
                id: 'type',
                label: 'Tipo',
                value: (row) => row.label,
                canHide: false,
            },
            {
                id: 'count',
                label: 'Record',
                value: (row) => row.count,
                className: 'text-right',
            },
        ],
    });
    return (
        <section
            aria-label="Riepilogo importazione"
            className="flex min-w-0 flex-col gap-3"
        >
            <div className="flex flex-wrap items-center gap-2">
                <TableFilters
                    title="Filtri riepilogo"
                    count={search ? 1 : 0}
                    disabled={disabled}
                >
                    <Input
                        disabled={disabled}
                        aria-label="Cerca tipo di record"
                        value={search}
                        placeholder="Cerca tipo…"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </TableFilters>
            </div>
            <div className="min-w-0 overflow-hidden rounded-lg border">
                <Table>
                    <TableViewHeader view={view} disabled={disabled} />
                    <TableBody>
                        {!rows.length && (
                            <TableRow>
                                <TableCell
                                    colSpan={
                                        view.table.getVisibleLeafColumns()
                                            .length
                                    }
                                >
                                    Nessun tipo corrisponde alla ricerca.
                                </TableCell>
                            </TableRow>
                        )}
                        {view.table
                            .getRowModel()
                            .rows.map(({ original: row }) => (
                                <TableRow key={row.type}>
                                    <TableViewCells table={view.table}>
                                        <TableCell key="type">
                                            {row.label}
                                        </TableCell>
                                        <TableCell
                                            key="count"
                                            className="text-right tabular-nums"
                                        >
                                            {row.count}
                                        </TableCell>
                                    </TableViewCells>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>
        </section>
    );
}
function ImportRecordsTable({
    rows,
    path,
    disabled,
}: {
    rows: NonNullable<Preview['preview']>;
    path: string;
    disabled: boolean;
}) {
    'use no memo'; // TanStack v8 exposes mutable table and column instances.

    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const visible = rows.filter(
        (row) =>
            (status === 'all' || row.status === status) &&
            [row.label, ...Object.values(row.values).map(String)]
                .join(' ')
                .toLocaleLowerCase('it')
                .includes(search.toLocaleLowerCase('it')),
    );
    const view = useTableView({
        rows: visible,
        storageKey: `mp3:table:v1:${path}:import-preview`,
        columns: [
            { id: 'row', label: 'Riga', value: (row) => row.row },
            {
                id: 'label',
                label: 'Record e valori',
                value: (row) => row.label,
                canHide: false,
            },
            {
                id: 'status',
                label: 'Esito',
                value: (row) => statusLabels[row.status],
            },
        ],
    });
    return (
        <section
            aria-label="Anteprima record importati"
            className="flex min-w-0 flex-col gap-3"
        >
            <div className="flex flex-wrap items-center gap-2">
                <TableFilters
                    title="Filtri anteprima"
                    count={(search ? 1 : 0) + (status !== 'all' ? 1 : 0)}
                    disabled={disabled}
                >
                    <div className="flex flex-col gap-3">
                        <Input
                            disabled={disabled}
                            aria-label="Cerca nei record da importare"
                            value={search}
                            placeholder="Cerca record…"
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        <NativeSelect
                            disabled={disabled}
                            aria-label="Filtra esito importazione"
                            value={status}
                            onChange={(event) => setStatus(event.target.value)}
                        >
                            <NativeSelectOption value="all">
                                Tutti gli esiti
                            </NativeSelectOption>
                            {Object.entries(statusLabels).map(
                                ([value, label]) => (
                                    <NativeSelectOption
                                        key={value}
                                        value={value}
                                    >
                                        {label}
                                    </NativeSelectOption>
                                ),
                            )}
                        </NativeSelect>
                        {(search || status !== 'all') && (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setSearch('');
                                    setStatus('all');
                                }}
                            >
                                Azzera filtri
                            </Button>
                        )}
                    </div>
                </TableFilters>
            </div>
            <div className="min-w-0 overflow-hidden rounded-lg border">
                <Table>
                    <TableViewHeader view={view} disabled={disabled} />
                    <TableBody>
                        {!visible.length && (
                            <TableRow>
                                <TableCell
                                    colSpan={
                                        view.table.getVisibleLeafColumns()
                                            .length
                                    }
                                >
                                    Nessun record corrisponde ai filtri.
                                </TableCell>
                            </TableRow>
                        )}
                        {view.table
                            .getRowModel()
                            .rows.map(({ original: row }) => (
                                <TableRow key={row.row}>
                                    <TableViewCells table={view.table}>
                                        <TableCell key="row">
                                            {row.row}
                                        </TableCell>
                                        <TableCell
                                            key="label"
                                            className="min-w-48 whitespace-normal"
                                        >
                                            <p className="font-medium break-words">
                                                {row.label}
                                            </p>
                                            <p className="text-xs break-words text-muted-foreground">
                                                {Object.values(row.values)
                                                    .filter(
                                                        (value) =>
                                                            value !== null &&
                                                            value !== row.label,
                                                    )
                                                    .map(String)
                                                    .join(' · ')}
                                            </p>
                                        </TableCell>
                                        <TableCell key="status">
                                            <Badge
                                                variant={
                                                    row.status === 'error'
                                                        ? 'destructive'
                                                        : 'secondary'
                                                }
                                            >
                                                {statusLabels[row.status]}
                                            </Badge>
                                        </TableCell>
                                    </TableViewCells>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>
        </section>
    );
}

export function DataImport({
    path,
    format,
    maxFileKb,
    maxRecords,
    disabled = false,
    onBusyChange,
}: {
    path: string;
    format: 'xlsx' | 'csv';
    maxFileKb: number;
    maxRecords: number;
    disabled?: boolean;
    onBusyChange?: (busy: boolean) => void;
}) {
    const inputId = useId();
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
    const navigation = useUnsavedNavigation(false, busy !== null);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    function select(next: File | null) {
        if (busy || disabled) return;
        setPreview(null);
        setResult(null);
        setError(null);
        setFile(null);
        if (!next) return;
        if (!next.name.toLowerCase().endsWith(`.${format}`)) {
            setError(`Seleziona un file .${format}.`);
            return;
        }
        if (next.size > maxFileKb * 1024) {
            setError(
                `Il file supera il limite di ${fileSize(maxFileKb * 1024)}.`,
            );
            return;
        }
        setFile(next);
    }
    async function submit(action: 'preview' | 'commit') {
        if (
            !file ||
            busy ||
            disabled ||
            (action === 'commit' && (!preview || preview.error_count > 0))
        )
            return;
        setBusy(action);
        onBusyChange?.(true);
        setError(null);
        setResult(null);
        try {
            if (action === 'preview') {
                setPreview(null);
                setPreview(
                    await uploadTransfer<Preview>(
                        `${path}/import/preview`,
                        file,
                    ),
                );
            } else {
                const response = await uploadTransfer<{ message: string }>(
                    `${path}/import/commit`,
                    file,
                    preview!.token,
                );
                setResult(response.message);
                setPreview(null);
                setFile(null);
                toast.success(response.message);
                navigation.allow();
                router.reload();
            }
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Importazione non riuscita.',
            );
            if (action === 'commit') setPreview(null);
        } finally {
            setBusy(null);
            onBusyChange?.(false);
        }
    }
    const canCommit =
        preview &&
        preview.error_count === 0 &&
        (format === 'csv' || (preview.new ?? 0) > 0);
    return (
        <div className="flex min-w-0 flex-col gap-4" aria-busy={busy !== null}>
            {format === 'xlsx' && (
                <Button asChild variant="outline" className="self-start">
                    <a href={`${path}/import-template.xlsx`}>
                        <Download data-icon="inline-start" />
                        Scarica modello Excel
                    </a>
                </Button>
            )}
            <div
                className="flex min-w-0 flex-col gap-3 rounded-lg border border-dashed p-4"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    event.preventDefault();
                    if (busy || disabled) return;
                    if (event.dataTransfer.files.length !== 1) {
                        select(null);
                        setError('Seleziona un solo file.');
                        return;
                    }
                    select(event.dataTransfer.files[0]);
                }}
            >
                <Label htmlFor={inputId}>
                    Seleziona o trascina un file {format.toUpperCase()}
                </Label>
                <Input
                    id={inputId}
                    type="file"
                    accept={`.${format}`}
                    disabled={disabled || busy !== null}
                    onChange={(event) => {
                        select(event.target.files?.[0] ?? null);
                        event.target.value = '';
                    }}
                />
                <p className="text-sm text-muted-foreground">
                    Massimo {fileSize(maxFileKb * 1024)} e{' '}
                    {maxRecords.toLocaleString('it-IT')}{' '}
                    {format === 'xlsx' ? 'righe' : 'record'}.{' '}
                    {format === 'xlsx'
                        ? 'Compila il foglio Dati. Correggi eventuali errori nel file e caricalo nuovamente.'
                        : 'L’azienda destinataria deve essere vuota.'}
                </p>
                {file && (
                    <p className="text-sm break-all">
                        {file.name} · {fileSize(file.size)}
                    </p>
                )}
            </div>
            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Operazione non riuscita</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {result && (
                <Alert>
                    <AlertTitle>Importazione completata</AlertTitle>
                    <AlertDescription>{result}</AlertDescription>
                </Alert>
            )}
            {preview && (
                <div className="flex min-w-0 flex-col gap-3" aria-live="polite">
                    {preview.meta && (
                        <p className="text-sm">
                            Origine: {preview.meta.name} ({preview.meta.slug}).
                            Il nome dell’azienda destinataria sarà conservato.
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {preview.new !== undefined && (
                            <Badge variant="secondary">
                                {preview.new} nuovi
                            </Badge>
                        )}
                        {preview.duplicates !== undefined && (
                            <Badge variant="outline">
                                {preview.duplicates} duplicati saltati
                            </Badge>
                        )}
                        <Badge
                            variant={
                                preview.error_count
                                    ? 'destructive'
                                    : 'secondary'
                            }
                        >
                            {preview.error_count} errori
                        </Badge>
                    </div>
                    {preview.counts && (
                        <ImportCountsTable
                            key={preview.token}
                            counts={preview.counts}
                            path={path}
                            disabled={disabled || busy !== null}
                        />
                    )}
                    {preview.preview && (
                        <>
                            <p className="text-sm font-medium">
                                Anteprima ({preview.preview.length} righe)
                            </p>
                            <ImportRecordsTable
                                key={preview.token}
                                rows={preview.preview}
                                path={path}
                                disabled={disabled || busy !== null}
                            />
                        </>
                    )}
                    {preview.errors.length > 0 && (
                        <Alert variant="destructive">
                            <AlertTitle>
                                Correggi il file prima di importare
                            </AlertTitle>
                            <AlertDescription>
                                <ul className="list-disc space-y-1 pl-4">
                                    {preview.errors.map((issue, index) => (
                                        <li key={index} className="break-words">
                                            {issue.sheet}, riga {issue.row},{' '}
                                            {issue.field}: {issue.message}
                                        </li>
                                    ))}
                                </ul>
                                {preview.error_count >
                                    preview.errors.length && (
                                    <p>
                                        Mostrati {preview.errors.length} di{' '}
                                        {preview.error_count} errori.
                                    </p>
                                )}
                            </AlertDescription>
                        </Alert>
                    )}
                    {canCommit && (
                        <p className="text-sm">
                            Confermando verranno inseriti i record validati.
                            Nessun dato è stato ancora salvato.
                        </p>
                    )}
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    disabled={!file || busy !== null || disabled}
                    onClick={() => void submit('preview')}
                >
                    {busy === 'preview' ? (
                        <Spinner />
                    ) : (
                        <Upload data-icon="inline-start" />
                    )}
                    {busy === 'preview'
                        ? 'Validazione…'
                        : 'Valida e mostra anteprima'}
                </Button>
                {preview && (
                    <Button
                        type="button"
                        disabled={!canCommit || busy !== null || disabled}
                        onClick={() => void submit('commit')}
                    >
                        {busy === 'commit' && <Spinner />}
                        {busy === 'commit'
                            ? 'Importazione…'
                            : 'Conferma importazione'}
                    </Button>
                )}
            </div>
        </div>
    );
}

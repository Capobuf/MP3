import { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TableColumnOrder } from './table-column-order';
import { BudgetReport, budgetReportColumns } from './budget-report';
import type {
    BudgetReportColumn,
    BudgetReportData,
    BudgetReportOptions,
} from './budget-report';

export function BudgetPrintDialog({
    data,
    tenantName,
    year,
    onClose,
}: {
    data: BudgetReportData;
    tenantName: string;
    year: number;
    onClose: () => void;
}) {
    const [options, setOptions] = useState<BudgetReportOptions>({
        title: `Budget ${year}`,
        orientation: 'landscape',
        kpis: true,
        chart: true,
        table: true,
        columns: data.columns
            .filter((column) => column.visible)
            .map((column) => column.id),
        logo: null,
    });
    const [order, setOrder] = useState(data.columns.map((column) => column.id));
    const [createdAt] = useState(() => new Date().toLocaleString('it-IT'));
    const [error, setError] = useState('');
    const [logoLoading, setLogoLoading] = useState(false);
    const [printing, setPrinting] = useState(false);
    const contentRef = useRef<HTMLElement>(null);
    const logoInput = useRef<HTMLInputElement>(null);
    const visibleColumns = order.filter((id) => options.columns.includes(id));
    const invalid =
        !options.title.trim() ||
        (!options.kpis && !options.chart && !options.table) ||
        (options.table && visibleColumns.length === 0);
    const print = useReactToPrint({
        contentRef,
        fonts: [
            {
                family: 'MP3 Report',
                source: 'url("/fonts/inter/InterVariable.woff2")',
                weight: '100 900',
                style: 'normal',
            },
        ],
        documentTitle: `${options.title} - ${tenantName}`,
        pageStyle: `@page { size: A4 ${options.orientation}; margin: 12mm; }`,
        onBeforePrint: async () => {
            if (!contentRef.current)
                throw new Error('Anteprima non disponibile.');
            const fonts = await document.fonts.load('400 12px "MP3 Report"');
            if (fonts.length === 0)
                throw new Error(
                    'Font del report non disponibile. Ricarica la pagina e riprova.',
                );
            await document.fonts.ready;
            await Promise.all(
                Array.from(contentRef.current.querySelectorAll('img')).map(
                    (img) => img.decode(),
                ),
            );
        },
        onAfterPrint: () => setPrinting(false),
        onPrintError: (_location, failure) => {
            setPrinting(false);
            setError(`Stampa non riuscita: ${failure.message}`);
        },
    });
    async function loadLogo(file?: File) {
        setOptions((current) => ({ ...current, logo: null }));
        setError('');
        if (!file) return;
        if (
            !['image/png', 'image/jpeg'].includes(file.type) ||
            file.size > 2 * 1024 * 1024
        ) {
            setError('Scegli un logo PNG o JPG di massimo 2 MB.');
            if (logoInput.current) logoInput.current.value = '';
            return;
        }
        setLogoLoading(true);
        const url = URL.createObjectURL(file);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    if (typeof reader.result === 'string')
                        resolve(reader.result);
                    else reject(new Error('Impossibile leggere il logo.'));
                };
                reader.onerror = () =>
                    reject(new Error('Impossibile leggere il logo.'));
                reader.readAsDataURL(file);
            });
            setOptions((current) => ({ ...current, logo: dataUrl }));
        } catch {
            setError(
                'Impossibile leggere il logo. Scegli un’immagine PNG o JPG valida.',
            );
            if (logoInput.current) logoInput.current.value = '';
        } finally {
            URL.revokeObjectURL(url);
            setLogoLoading(false);
        }
    }
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !printing) onClose();
            }}
        >
            <DialogContent
                className="flex max-h-[95dvh] flex-col overflow-hidden sm:max-w-[96vw]"
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Stampa report · Budget {year}</DialogTitle>
                    <DialogDescription>
                        Il report usa le righe risultanti dai filtri del Budget,
                        comprese quelle nei gruppi chiusi. In Chrome scegli
                        «Salva come PDF» come destinazione di stampa.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid min-h-0 gap-6 overflow-y-auto lg:grid-cols-[17rem_minmax(0,1fr)]">
                    <div className="flex flex-col gap-5 lg:overflow-y-auto">
                        <FieldGroup>
                            <Field>
                                <FieldLabel htmlFor="budget-report-title">
                                    Titolo del report
                                </FieldLabel>
                                <Input
                                    id="budget-report-title"
                                    value={options.title}
                                    maxLength={160}
                                    disabled={printing}
                                    onChange={(event) =>
                                        setOptions({
                                            ...options,
                                            title: event.target.value,
                                        })
                                    }
                                />
                                <FieldDescription>
                                    {tenantName} · Anno {year}
                                </FieldDescription>
                            </Field>
                            <Field>
                                <FieldLabel>Formato A4</FieldLabel>
                                <ToggleGroup
                                    type="single"
                                    variant="outline"
                                    value={options.orientation}
                                    disabled={printing}
                                    aria-label="Orientamento del report"
                                    onValueChange={(value) => {
                                        if (
                                            value === 'portrait' ||
                                            value === 'landscape'
                                        )
                                            setOptions({
                                                ...options,
                                                orientation: value,
                                            });
                                    }}
                                >
                                    <ToggleGroupItem value="portrait">
                                        Verticale
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="landscape">
                                        Orizzontale
                                    </ToggleGroupItem>
                                </ToggleGroup>
                            </Field>
                            <FieldSet>
                                <FieldLegend>Sezioni del report</FieldLegend>
                                <FieldGroup className="gap-3">
                                    {(
                                        [
                                            ['kpis', 'Riepilogo KPI'],
                                            [
                                                'chart',
                                                'Grafico ripartizione Budget',
                                            ],
                                            ['table', 'Tabella analitica'],
                                        ] as const
                                    ).map(([key, label]) => (
                                        <Field
                                            key={key}
                                            orientation="horizontal"
                                        >
                                            <Checkbox
                                                id={`report-${key}`}
                                                checked={options[key]}
                                                disabled={printing}
                                                onCheckedChange={(value) =>
                                                    setOptions({
                                                        ...options,
                                                        [key]: value === true,
                                                    })
                                                }
                                            />
                                            <FieldLabel
                                                htmlFor={`report-${key}`}
                                            >
                                                {label}
                                            </FieldLabel>
                                        </Field>
                                    ))}
                                </FieldGroup>
                            </FieldSet>
                            {options.table && (
                                <FieldSet>
                                    <FieldLegend>
                                        Colonne della tabella
                                    </FieldLegend>
                                    <FieldDescription>
                                        Trascina per riordinare; da tastiera usa
                                        Spazio e le frecce. Lo stato di
                                        inclusione è sempre indicato.
                                    </FieldDescription>
                                    <TableColumnOrder
                                        disabled={printing}
                                        columns={order.map((id) => ({
                                            id,
                                            label: budgetReportColumns[id],
                                            visible:
                                                options.columns.includes(id),
                                            canHide: true,
                                        }))}
                                        onOrderChange={(ids) =>
                                            setOrder(
                                                ids as BudgetReportColumn[],
                                            )
                                        }
                                        onVisibilityChange={(id, visible) =>
                                            setOptions({
                                                ...options,
                                                columns: visible
                                                    ? [
                                                          ...options.columns,
                                                          id as BudgetReportColumn,
                                                      ]
                                                    : options.columns.filter(
                                                          (column) =>
                                                              column !== id,
                                                      ),
                                            })
                                        }
                                    />
                                </FieldSet>
                            )}
                            <Field>
                                <FieldLabel htmlFor="budget-report-logo">
                                    Logo facoltativo
                                </FieldLabel>
                                <Input
                                    ref={logoInput}
                                    id="budget-report-logo"
                                    type="file"
                                    accept="image/png,image/jpeg"
                                    disabled={logoLoading || printing}
                                    onChange={(event) => {
                                        void loadLogo(event.target.files?.[0]);
                                    }}
                                />
                                <FieldDescription>
                                    PNG/JPG, massimo 2 MB. Usato solo per questo
                                    report, senza caricamento sul server.
                                </FieldDescription>
                                {options.logo && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={printing}
                                        onClick={() => {
                                            setOptions({
                                                ...options,
                                                logo: null,
                                            });
                                            if (logoInput.current)
                                                logoInput.current.value = '';
                                        }}
                                    >
                                        Rimuovi logo
                                    </Button>
                                )}
                            </Field>
                        </FieldGroup>
                    </div>
                    <div
                        className="min-w-0 overflow-auto rounded-md border bg-muted p-4"
                        aria-label="Documento da stampare"
                        tabIndex={0}
                    >
                        <BudgetReport
                            ref={contentRef}
                            data={data}
                            options={{ ...options, columns: visibleColumns }}
                            tenantName={tenantName}
                            year={year}
                            createdAt={createdAt}
                        />
                    </div>
                </div>
                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>Operazione non completata</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                        {invalid
                            ? 'Indica un titolo, almeno una sezione e almeno una colonna per la tabella.'
                            : 'Controlla l’impaginazione nell’anteprima di Chrome prima di salvare. Scala 100%, carta A4.'}
                    </p>
                    <Button
                        disabled={invalid || logoLoading || printing}
                        onClick={() => {
                            setError('');
                            setPrinting(true);
                            print();
                        }}
                    >
                        <Printer data-icon="inline-start" />
                        {printing ? 'Stampa in corso…' : 'Stampa / Salva PDF'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

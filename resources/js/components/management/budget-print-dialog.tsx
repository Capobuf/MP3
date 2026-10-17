import { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer, RotateCcw } from 'lucide-react';
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
import {
    BudgetReport,
    budgetReportColumns,
    budgetReportBlocks,
    defaultBudgetReportOptions,
} from './budget-report';
import type {
    BudgetReportColumn,
    BudgetReportBlock,
    BudgetReportData,
    BudgetReportOptions,
} from './budget-report';

export function BudgetPrintDialog({
    data,
    tenantName,
    logoUrl,
    tenantSlug,
    year,
    onClose,
}: {
    data: BudgetReportData;
    tenantName: string;
    logoUrl?: string | null;
    tenantSlug: string;
    year: number;
    onClose: () => void;
}) {
    const defaults = defaultBudgetReportOptions(tenantName);
    const [options, setOptions] = useState<BudgetReportOptions>(defaults);
    const [order, setOrder] = useState(
        Object.keys(budgetReportColumns) as BudgetReportColumn[],
    );
    const [createdAt] = useState(() => new Date().toLocaleString('it-IT'));
    const [error, setError] = useState('');
    const [printing, setPrinting] = useState(false);
    const contentRef = useRef<HTMLElement>(null);
    const visibleColumns = order.filter((id) => options.columns.includes(id));
    const invalid =
        !options.title.trim() ||
        options.blocks.every((block) => options.hiddenBlocks.includes(block)) ||
        (!options.hiddenBlocks.includes('table') &&
            visibleColumns.length === 0) ||
        options.blocks.some(
            (block) =>
                !options.hiddenBlocks.includes(block) &&
                !options.titles[block].trim(),
        );
    const print = useReactToPrint({
        contentRef,
        documentTitle: `${options.title} - ${tenantName}`,
        pageStyle: `@page { size: A4 ${options.orientation}; margin: 12mm; }`,
        onBeforePrint: async () => {
            if (!contentRef.current)
                throw new Error('Anteprima non disponibile.');
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
    function reset(label: string, action: () => void) {
        return (
            <Button
                variant="ghost"
                size="sm"
                disabled={printing}
                onClick={action}
                aria-label={`Reset ${label}`}
            >
                <RotateCcw data-icon="inline-start" />
                Reset
            </Button>
        );
    }
    function check(
        key:
            | 'showCompany'
            | 'showYear'
            | 'showLogo'
            | 'showScope'
            | 'showDate'
            | 'groupByType'
            | 'subtotals',
        label: string,
    ) {
        return (
            <Field orientation="horizontal" key={key}>
                <Checkbox
                    id={`report-${key}`}
                    checked={options[key]}
                    disabled={printing}
                    onCheckedChange={(value) =>
                        setOptions({ ...options, [key]: value === true })
                    }
                />
                <FieldLabel htmlFor={`report-${key}`}>{label}</FieldLabel>
            </Field>
        );
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
                            <FieldSet>
                                <FieldLegend>Intestazione</FieldLegend>
                                {reset('intestazione', () =>
                                    setOptions({
                                        ...options,
                                        title: defaults.title,
                                        company: defaults.company,
                                        subtitle: defaults.subtitle,
                                        showCompany: true,
                                        showYear: true,
                                        showLogo: true,
                                        showScope: true,
                                        showDate: true,
                                    }),
                                )}
                                <FieldGroup>
                                    {(
                                        [
                                            ['title', 'Titolo del report'],
                                            ['company', 'Nome azienda'],
                                            ['subtitle', 'Sottotitolo'],
                                        ] as const
                                    ).map(([key, label]) => (
                                        <Field key={key}>
                                            <FieldLabel
                                                htmlFor={`report-${key}`}
                                            >
                                                {label}
                                            </FieldLabel>
                                            <Input
                                                id={`report-${key}`}
                                                value={options[key]}
                                                disabled={printing}
                                                maxLength={150}
                                                onChange={(event) =>
                                                    setOptions({
                                                        ...options,
                                                        [key]: event.target
                                                            .value,
                                                    })
                                                }
                                            />
                                        </Field>
                                    ))}
                                    {check(
                                        'showCompany',
                                        'Mostra nome azienda',
                                    )}
                                    {check('showYear', 'Mostra anno')}
                                    {check('showLogo', 'Mostra logo azienda')}
                                    <FieldDescription>
                                        {logoUrl
                                            ? 'Logo dalle impostazioni del tenant.'
                                            : 'Nessun logo azienda configurato.'}{' '}
                                        <a
                                            href={`/t/${tenantSlug}/settings/identity`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="underline"
                                        >
                                            Impostazioni azienda
                                        </a>
                                    </FieldDescription>
                                    {check(
                                        'showScope',
                                        'Mostra filtri e conteggio voci',
                                    )}
                                    {check(
                                        'showDate',
                                        'Mostra data di elaborazione',
                                    )}
                                </FieldGroup>
                            </FieldSet>
                            <FieldSet>
                                <FieldLegend>Formato pagina</FieldLegend>
                                {reset('formato pagina', () =>
                                    setOptions({
                                        ...options,
                                        orientation: defaults.orientation,
                                    }),
                                )}
                                <ToggleGroup
                                    type="single"
                                    variant="outline"
                                    value={options.orientation}
                                    disabled={printing}
                                    aria-label="Orientamento A4"
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
                            </FieldSet>
                            <FieldSet>
                                <FieldLegend>Blocchi del documento</FieldLegend>
                                {reset('blocchi', () =>
                                    setOptions({
                                        ...options,
                                        blocks: defaults.blocks,
                                        hiddenBlocks: [],
                                    }),
                                )}
                                <FieldDescription>
                                    Seleziona e trascina i blocchi nell’ordine
                                    desiderato. Da tastiera: Spazio e frecce.
                                </FieldDescription>
                                <TableColumnOrder
                                    label="Ordine dei blocchi"
                                    disabled={printing}
                                    columns={options.blocks.map((id) => ({
                                        id,
                                        label: options.titles[id],
                                        visible:
                                            !options.hiddenBlocks.includes(id),
                                        canHide: true,
                                    }))}
                                    onOrderChange={(ids) =>
                                        setOptions({
                                            ...options,
                                            blocks: ids as BudgetReportBlock[],
                                        })
                                    }
                                    onVisibilityChange={(id, visible) =>
                                        setOptions({
                                            ...options,
                                            hiddenBlocks: visible
                                                ? options.hiddenBlocks.filter(
                                                      (block) => block !== id,
                                                  )
                                                : [
                                                      ...options.hiddenBlocks,
                                                      id as BudgetReportBlock,
                                                  ],
                                        })
                                    }
                                />
                            </FieldSet>
                            <FieldSet>
                                <FieldLegend>Titoli dei blocchi</FieldLegend>
                                {reset('titoli', () =>
                                    setOptions({
                                        ...options,
                                        titles: defaults.titles,
                                    }),
                                )}
                                <FieldGroup>
                                    {options.blocks
                                        .filter(
                                            (block) =>
                                                !options.hiddenBlocks.includes(
                                                    block,
                                                ),
                                        )
                                        .map((block) => (
                                            <Field key={block}>
                                                <FieldLabel
                                                    htmlFor={`report-title-${block}`}
                                                >
                                                    {budgetReportBlocks[block]}
                                                </FieldLabel>
                                                <Input
                                                    id={`report-title-${block}`}
                                                    value={
                                                        options.titles[block]
                                                    }
                                                    maxLength={150}
                                                    disabled={printing}
                                                    onChange={(event) =>
                                                        setOptions({
                                                            ...options,
                                                            titles: {
                                                                ...options.titles,
                                                                [block]:
                                                                    event.target
                                                                        .value,
                                                            },
                                                        })
                                                    }
                                                />
                                            </Field>
                                        ))}
                                </FieldGroup>
                            </FieldSet>
                            <FieldSet>
                                <FieldLegend>
                                    Importi della ripartizione
                                </FieldLegend>
                                {reset('ripartizione', () =>
                                    setOptions({
                                        ...options,
                                        sankeyMetric: defaults.sankeyMetric,
                                    }),
                                )}
                                <ToggleGroup
                                    type="single"
                                    variant="outline"
                                    value={options.sankeyMetric}
                                    disabled={printing}
                                    aria-label="Importi della ripartizione"
                                    onValueChange={(value) => {
                                        if (
                                            value === 'allocated' ||
                                            value === 'actual' ||
                                            value === 'both'
                                        )
                                            setOptions({
                                                ...options,
                                                sankeyMetric: value,
                                            });
                                    }}
                                >
                                    <ToggleGroupItem value="allocated">
                                        Allocato
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="actual">
                                        Effettivo
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="both">
                                        Entrambi
                                    </ToggleGroupItem>
                                </ToggleGroup>
                            </FieldSet>
                            <FieldSet>
                                <FieldLegend>Tabella</FieldLegend>
                                {reset('tabella', () => {
                                    setOptions({
                                        ...options,
                                        columns: defaults.columns,
                                        groupByType: defaults.groupByType,
                                        subtotals: defaults.subtotals,
                                    });
                                    setOrder(
                                        Object.keys(
                                            budgetReportColumns,
                                        ) as BudgetReportColumn[],
                                    );
                                })}
                                {check('groupByType', 'Raggruppa per tipo')}
                                {options.groupByType &&
                                    check(
                                        'subtotals',
                                        'Mostra subtotali per tipo',
                                    )}

                                <TableColumnOrder
                                    disabled={printing}
                                    columns={order.map((id) => ({
                                        id,
                                        label: budgetReportColumns[id],
                                        visible: options.columns.includes(id),
                                        canHide: true,
                                    }))}
                                    onOrderChange={(ids) =>
                                        setOrder(ids as BudgetReportColumn[])
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
                                                      (column) => column !== id,
                                                  ),
                                        })
                                    }
                                />
                            </FieldSet>
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
                            logoUrl={logoUrl}
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
                        disabled={invalid || printing}
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

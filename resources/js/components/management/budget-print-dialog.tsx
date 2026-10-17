import { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import {
    Printer,
    RotateCcw,
    PanelTop,
    PanelBottom,
    File,
    RectangleVertical,
    RectangleHorizontal,
    LayoutList,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
    budgetReportIcons,
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
    const [initialDate] = useState(() => new Date().toLocaleString('it-IT'));
    const [createdAt, setCreatedAt] = useState(initialDate);
    const [error, setError] = useState('');
    const [printing, setPrinting] = useState(false);
    const contentRef = useRef<HTMLElement>(null);
    const visibleColumns = order.filter((id) => options.columns.includes(id));
    const invalid =
        !options.title.trim() ||
        (options.showDate && !createdAt.trim()) ||
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
                size="icon"
                disabled={printing}
                onClick={action}
                title={`Reset ${label}`}
                aria-label={`Reset ${label}`}
            >
                <RotateCcw />
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
    function heading(Icon: LucideIcon, label: string, onReset: () => void) {
        return (
            <FieldLegend className="flex w-full items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {label}
                </span>
                {reset(label, onReset)}
            </FieldLegend>
        );
    }
    function metricChoice(key: 'sankeyMetric' | 'reconciliationMetric') {
        return (
            <Field>
                <FieldLabel>Importi</FieldLabel>
                <ToggleGroup
                    type="single"
                    variant="outline"
                    value={options[key]}
                    disabled={printing}
                    aria-label={
                        key === 'sankeyMetric'
                            ? 'Importi del Sankey'
                            : 'Importi della tabella di ripartizione'
                    }
                    onValueChange={(value) => {
                        if (
                            value === 'allocated' ||
                            value === 'actual' ||
                            value === 'both'
                        )
                            setOptions({ ...options, [key]: value });
                    }}
                >
                    <ToggleGroupItem value="allocated">
                        Allocato
                    </ToggleGroupItem>
                    <ToggleGroupItem value="actual">Effettivo</ToggleGroupItem>
                    <ToggleGroupItem value="both">Entrambi</ToggleGroupItem>
                </ToggleGroup>
            </Field>
        );
    }
    function resetBlock(block: BudgetReportBlock) {
        setOptions({
            ...options,
            titles: { ...options.titles, [block]: defaults.titles[block] },
            ...(block === 'sankey'
                ? { sankeyMetric: defaults.sankeyMetric }
                : {}),
            ...(block === 'reconciliation'
                ? { reconciliationMetric: defaults.reconciliationMetric }
                : {}),
            ...(block === 'table'
                ? {
                      columns: defaults.columns,
                      groupByType: defaults.groupByType,
                      subtotals: defaults.subtotals,
                  }
                : {}),
        });
        if (block === 'table')
            setOrder(Object.keys(budgetReportColumns) as BudgetReportColumn[]);
    }
    function blockOptions(block: BudgetReportBlock) {
        return (
            <FieldGroup className="gap-3 pb-4">
                <Field>
                    <FieldLabel htmlFor={`report-title-${block}`}>
                        Titolo
                    </FieldLabel>
                    <Input
                        id={`report-title-${block}`}
                        aria-label={`Titolo ${budgetReportBlocks[block]}`}
                        value={options.titles[block]}
                        maxLength={150}
                        disabled={printing}
                        onChange={(event) =>
                            setOptions({
                                ...options,
                                titles: {
                                    ...options.titles,
                                    [block]: event.target.value,
                                },
                            })
                        }
                    />
                </Field>
                {block === 'sankey' && metricChoice('sankeyMetric')}
                {block === 'reconciliation' &&
                    metricChoice('reconciliationMetric')}
                {block === 'table' && (
                    <>
                        {check('groupByType', 'Raggruppa per tipo')}
                        {options.groupByType &&
                            check('subtotals', 'Mostra subtotali per tipo')}
                        <FieldSet>
                            <FieldLegend variant="label">Colonne</FieldLegend>
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
                    </>
                )}
            </FieldGroup>
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
                <div className="grid min-h-0 gap-6 overflow-y-auto lg:grid-cols-[20rem_minmax(0,1fr)]">
                    <div className="flex flex-col gap-5 lg:overflow-y-auto">
                        <FieldGroup>
                            <FieldSet>
                                {heading(PanelTop, 'Intestazione', () =>
                                    setOptions({
                                        ...options,
                                        title: defaults.title,
                                        company: defaults.company,
                                        subtitle: defaults.subtitle,
                                        showCompany: true,
                                        showYear: true,
                                        showLogo: true,
                                        showScope: true,
                                    }),
                                )}
                                <FieldGroup className="gap-3">
                                    <Field>
                                        <FieldLabel htmlFor="report-title">
                                            Titolo del report
                                        </FieldLabel>
                                        <Input
                                            id="report-title"
                                            value={options.title}
                                            maxLength={150}
                                            disabled={printing}
                                            onChange={(event) =>
                                                setOptions({
                                                    ...options,
                                                    title: event.target.value,
                                                })
                                            }
                                        />
                                    </Field>
                                    <Field>
                                        <FieldLabel htmlFor="report-subtitle">
                                            Sottotitolo
                                        </FieldLabel>
                                        <Input
                                            id="report-subtitle"
                                            value={options.subtitle}
                                            maxLength={150}
                                            disabled={printing}
                                            onChange={(event) =>
                                                setOptions({
                                                    ...options,
                                                    subtitle:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                    </Field>
                                    {check(
                                        'showCompany',
                                        'Mostra nome azienda',
                                    )}
                                    {options.showCompany && (
                                        <Field>
                                            <FieldLabel htmlFor="report-company">
                                                Nome azienda
                                            </FieldLabel>
                                            <Input
                                                id="report-company"
                                                value={options.company}
                                                maxLength={150}
                                                disabled={printing}
                                                onChange={(event) =>
                                                    setOptions({
                                                        ...options,
                                                        company:
                                                            event.target.value,
                                                    })
                                                }
                                            />
                                        </Field>
                                    )}
                                    {check('showYear', 'Mostra anno')}
                                    {check('showLogo', 'Mostra logo azienda')}
                                    {options.showLogo && (
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
                                    )}
                                    {check(
                                        'showScope',
                                        'Mostra filtri e conteggio voci',
                                    )}
                                </FieldGroup>
                            </FieldSet>
                            <FieldSet>
                                {heading(File, 'Formato pagina', () =>
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
                                        <RectangleVertical data-icon="inline-start" />
                                        Verticale
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="landscape">
                                        <RectangleHorizontal data-icon="inline-start" />
                                        Orizzontale
                                    </ToggleGroupItem>
                                </ToggleGroup>
                            </FieldSet>
                            <FieldSet>
                                {heading(
                                    LayoutList,
                                    'Blocchi del documento',
                                    () =>
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
                                        label: budgetReportBlocks[id],
                                        icon: budgetReportIcons[id],
                                        visible:
                                            !options.hiddenBlocks.includes(id),
                                        canHide: true,
                                        actions: reset(
                                            budgetReportBlocks[id],
                                            () => resetBlock(id),
                                        ),
                                        content: blockOptions(id),
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
                                {heading(PanelBottom, 'Footer', () => {
                                    setOptions({ ...options, showDate: true });
                                    setCreatedAt(initialDate);
                                })}
                                {check(
                                    'showDate',
                                    'Mostra data di elaborazione',
                                )}
                                {options.showDate && (
                                    <Field>
                                        <FieldLabel htmlFor="report-date">
                                            Data di elaborazione
                                        </FieldLabel>
                                        <Input
                                            id="report-date"
                                            value={createdAt}
                                            maxLength={80}
                                            disabled={printing}
                                            onChange={(event) =>
                                                setCreatedAt(event.target.value)
                                            }
                                        />
                                    </Field>
                                )}
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
                            ? 'Compila i titoli e la data visibile; seleziona almeno un blocco e una colonna per la tabella.'
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

import { useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { useReactToPrint } from 'react-to-print';
import {
    Printer,
    Download,
    RotateCcw,
    PanelTop,
    PanelBottom,
    File,
    RectangleVertical,
    RectangleHorizontal,
    LayoutList,
    Eye,
    EyeOff,
    ChevronDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TableColumnOrder } from './table-column-order';
import type { PrintReportOptions } from './report-document';

export function ReportPrintDialog<Block extends string, Column extends string>({
    defaults,
    columnLabels,
    blockLabels,
    blockIcons,
    renderReport,
    label,
    tenantName,
    logoUrl,
    year,
    onClose,
    budgetControls = false,
}: {
    defaults: PrintReportOptions<Block, Column>;
    columnLabels: Record<Column, string>;
    blockLabels: Record<Block, string>;
    blockIcons: Record<Block, LucideIcon>;
    renderReport: (
        options: PrintReportOptions<Block, Column>,
        ref: Ref<HTMLElement>,
        createdAt: string,
    ) => ReactNode;
    label: string;
    tenantName: string;
    logoUrl?: string | null;
    year: number;
    onClose: () => void;
    budgetControls?: boolean;
}) {
    const [options, setOptions] =
        useState<PrintReportOptions<Block, Column>>(defaults);
    const [order, setOrder] = useState(Object.keys(columnLabels) as Column[]);
    const [createdAt] = useState(() => new Date().toLocaleString('it-IT'));
    const [printing, setPrinting] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const busy = printing || downloading;
    const contentRef = useRef<HTMLElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const visibleColumns = order.filter((id) => options.columns.includes(id));
    const invalid =
        !options.title.trim() ||
        options.blocks.every((block) => options.hiddenBlocks.includes(block)) ||
        (options.blocks.some(
            (block) =>
                block === 'table' && !options.hiddenBlocks.includes(block),
        ) &&
            visibleColumns.length === 0) ||
        options.blocks.some(
            (block) =>
                !options.hiddenBlocks.includes(block) &&
                !options.titles[block].trim(),
        );
    const print = useReactToPrint({
        contentRef,
        documentTitle: `${options.title} - ${tenantName}`,
        pageStyle: `
            @page {
                size: A4 ${options.orientation};
                margin: 12mm;
                @bottom-right {
                    content: ${options.showPageNumbers ? 'counter(page)' : 'none'};
                    font: 500 8pt/4mm Arial, sans-serif;
                    color: #52647d;
                    text-align: right;
                    vertical-align: top;
                    margin-top: -12mm;
                }
            }
            ${
                options.showPageNumbers && !options.numberFirstPage
                    ? '@page :first { counter-reset: page 0; @bottom-right { content: none; } }'
                    : ''
            }
        `,
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
            toast.error(`Stampa non riuscita: ${failure.message}`);
        },
    });
    async function download() {
        if (!contentRef.current || invalid || busy) return;
        setDownloading(true);
        try {
            const { downloadBudgetPdf } = await import('./budget-pdf');
            await downloadBudgetPdf(
                contentRef.current,
                `${options.title} - ${tenantName} - ${year}.pdf`,
                options,
            );
        } catch (failure) {
            toast.error(
                `Download non riuscito: ${failure instanceof Error ? failure.message : 'Riprova oppure usa Stampa.'}`,
            );
        } finally {
            setDownloading(false);
        }
    }
    function focusPreview(selector: string) {
        const preview = previewRef.current;
        if (!preview) return;
        const position = () => {
            const target = contentRef.current?.querySelector(selector);
            if (!target) return;
            const rect = target.getBoundingClientRect();
            const viewport = preview.getBoundingClientRect();
            return {
                top: preview.scrollTop + rect.top - viewport.top - 24,
                left: preview.scrollLeft + rect.left - viewport.left - 24,
            };
        };
        // Keep the former location available when the selected element is hidden.
        const previous = position();
        requestAnimationFrame(() => {
            if (!preview.isConnected) return;
            const next = position() ?? previous;
            if (next)
                preview.scrollTo({
                    ...next,
                    behavior: window.matchMedia(
                        '(prefers-reduced-motion: reduce)',
                    ).matches
                        ? 'instant'
                        : 'smooth',
                });
        });
    }
    function reset(label: string, action: () => void) {
        return (
            <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={action}
                title={`Reset ${label}`}
                aria-label={`Reset ${label}`}
            >
                <RotateCcw />
            </Button>
        );
    }
    function visibility(
        key:
            | 'showCompany'
            | 'showYear'
            | 'showLogo'
            | 'showScope'
            | 'showDate'
            | 'showBranding'
            | 'showPageNumbers'
            | 'subtotals',
        label: string,
    ) {
        return (
            <Field orientation="horizontal" key={key} data-disabled={busy}>
                <FieldLabel htmlFor={`report-${key}`} className="flex-1">
                    {label}
                </FieldLabel>
                <Toggle
                    id={`report-${key}`}
                    pressed={options[key]}
                    disabled={busy}
                    aria-label={label}
                    title={`${options[key] ? 'Nascondi' : 'Mostra'} ${label.toLowerCase()}`}
                    onPressedChange={(value) => {
                        focusPreview(
                            {
                                showCompany: '.budget-report-heading',
                                showYear: '.budget-report-identity',
                                showLogo: '.budget-report-identity',
                                showScope: '.budget-report-scope',
                                showDate: '.budget-report-footer',
                                showBranding: '.budget-report-footer',
                                showPageNumbers: '.budget-report-footer',
                                subtotals: '[data-report-block="table"]',
                            }[key],
                        );
                        setOptions({ ...options, [key]: value });
                    }}
                >
                    {options[key] ? (
                        <Eye aria-hidden="true" />
                    ) : (
                        <EyeOff aria-hidden="true" />
                    )}
                </Toggle>
            </Field>
        );
    }
    function check(key: 'numberFirstPage' | 'groupByType', label: string) {
        return (
            <Field orientation="horizontal" key={key} data-disabled={busy}>
                <Checkbox
                    id={`report-${key}`}
                    checked={options[key]}
                    disabled={busy}
                    onCheckedChange={(value) => {
                        focusPreview(
                            key === 'numberFirstPage'
                                ? '.budget-report-footer'
                                : '[data-report-block="table"]',
                        );
                        setOptions({ ...options, [key]: value === true });
                    }}
                />
                <FieldLabel htmlFor={`report-${key}`}>{label}</FieldLabel>
            </Field>
        );
    }
    function heading(Icon: LucideIcon, label: string, onReset: () => void) {
        return (
            <FieldLegend className="flex w-full items-center justify-between gap-2">
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="group min-w-0 flex-1 justify-start"
                    >
                        <Icon aria-hidden="true" />
                        {label}
                        <ChevronDown
                            className="ml-auto group-data-[state=open]:rotate-180"
                            aria-hidden="true"
                        />
                    </Button>
                </CollapsibleTrigger>
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
                    disabled={busy}
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
    function resetBlock(block: Block) {
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
        if (block === 'table') setOrder(Object.keys(columnLabels) as Column[]);
    }
    function blockOptions(block: Block) {
        return (
            <FieldGroup className="gap-3 pb-4">
                <Field>
                    <FieldLabel htmlFor={`report-title-${block}`}>
                        Titolo
                    </FieldLabel>
                    <Input
                        id={`report-title-${block}`}
                        aria-label={`Titolo ${blockLabels[block]}`}
                        value={options.titles[block]}
                        maxLength={150}
                        disabled={busy}
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
                {budgetControls &&
                    block === 'sankey' &&
                    metricChoice('sankeyMetric')}
                {budgetControls &&
                    block === 'reconciliation' &&
                    metricChoice('reconciliationMetric')}
                {block === 'table' && (
                    <>
                        {budgetControls &&
                            check('groupByType', 'Raggruppa per tipo')}
                        {budgetControls &&
                            options.groupByType &&
                            visibility('subtotals', 'Subtotali per tipo')}
                        <FieldSet>
                            <FieldLegend variant="label">Colonne</FieldLegend>
                            <TableColumnOrder
                                visibilityToggle
                                disabled={busy}
                                columns={order.map((id) => ({
                                    id,
                                    label: columnLabels[id],
                                    visible: options.columns.includes(id),
                                    canHide: true,
                                }))}
                                onOrderChange={(ids) =>
                                    setOrder(ids as Column[])
                                }
                                onVisibilityChange={(id, visible) => {
                                    focusPreview(
                                        `[data-report-block="table"] th[data-column="${id}"]`,
                                    );
                                    setOptions({
                                        ...options,
                                        columns: visible
                                            ? [...options.columns, id as Column]
                                            : options.columns.filter(
                                                  (column) => column !== id,
                                              ),
                                    });
                                }}
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
                if (!open && !busy) onClose();
            }}
        >
            <DialogContent
                className="flex max-h-[95dvh] flex-col overflow-hidden sm:max-w-[96vw]"
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>
                        Report {label} {year}
                    </DialogTitle>
                    <DialogDescription>
                        Report delle voci filtrate.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid min-h-0 gap-6 overflow-y-auto lg:grid-cols-[20rem_minmax(0,1fr)]">
                    <div className="flex flex-col gap-5 lg:overflow-y-auto">
                        <FieldGroup>
                            <Collapsible asChild disabled={busy}>
                                <FieldSet>
                                    {heading(File, 'Formato A4', () =>
                                        setOptions({
                                            ...options,
                                            orientation: defaults.orientation,
                                        }),
                                    )}
                                    <CollapsibleContent className="flex flex-col gap-3">
                                        <ToggleGroup
                                            type="single"
                                            variant="outline"
                                            value={options.orientation}
                                            disabled={busy}
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
                                    </CollapsibleContent>
                                </FieldSet>
                            </Collapsible>
                            <Collapsible
                                asChild
                                disabled={busy}
                                onOpenChange={(open) => {
                                    if (open)
                                        focusPreview('.budget-report-header');
                                }}
                            >
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
                                    <CollapsibleContent className="flex flex-col gap-3">
                                        <FieldGroup className="gap-3">
                                            {visibility(
                                                'showCompany',
                                                'Nome azienda',
                                            )}
                                            {options.showCompany && (
                                                <Field>
                                                    <Input
                                                        id="report-company"
                                                        aria-label="Nome azienda"
                                                        value={options.company}
                                                        maxLength={150}
                                                        disabled={busy}
                                                        onChange={(event) =>
                                                            setOptions({
                                                                ...options,
                                                                company:
                                                                    event.target
                                                                        .value,
                                                            })
                                                        }
                                                    />
                                                </Field>
                                            )}
                                            <Field>
                                                <FieldLabel htmlFor="report-title">
                                                    Titolo del report
                                                </FieldLabel>
                                                <Input
                                                    id="report-title"
                                                    value={options.title}
                                                    maxLength={150}
                                                    disabled={busy}
                                                    onChange={(event) =>
                                                        setOptions({
                                                            ...options,
                                                            title: event.target
                                                                .value,
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
                                                    disabled={busy}
                                                    onChange={(event) =>
                                                        setOptions({
                                                            ...options,
                                                            subtitle:
                                                                event.target
                                                                    .value,
                                                        })
                                                    }
                                                />
                                            </Field>
                                            {visibility(
                                                'showLogo',
                                                'Logo azienda',
                                            )}
                                            {options.showLogo && !logoUrl && (
                                                <FieldDescription>
                                                    Nessun logo configurato.
                                                </FieldDescription>
                                            )}
                                            {visibility('showYear', 'Anno')}
                                            {visibility(
                                                'showScope',
                                                'Filtri e conteggio voci',
                                            )}
                                        </FieldGroup>
                                    </CollapsibleContent>
                                </FieldSet>
                            </Collapsible>
                            <Collapsible
                                asChild
                                disabled={busy}
                                onOpenChange={(open) => {
                                    if (open)
                                        focusPreview('[data-report-block]');
                                }}
                            >
                                <FieldSet>
                                    {heading(LayoutList, 'Contenuto', () =>
                                        setOptions({
                                            ...options,
                                            blocks: defaults.blocks,
                                            hiddenBlocks: defaults.hiddenBlocks,
                                        }),
                                    )}
                                    <CollapsibleContent className="flex flex-col gap-3">
                                        <TableColumnOrder
                                            visibilityToggle
                                            label="Ordine dei blocchi"
                                            disabled={busy}
                                            columns={options.blocks.map(
                                                (id) => ({
                                                    id,
                                                    label: blockLabels[id],
                                                    icon: blockIcons[id],
                                                    visible:
                                                        !options.hiddenBlocks.includes(
                                                            id,
                                                        ),
                                                    canHide: true,
                                                    actions: reset(
                                                        blockLabels[id],
                                                        () => resetBlock(id),
                                                    ),
                                                    content: blockOptions(id),
                                                    onOpen: () =>
                                                        focusPreview(
                                                            `[data-report-block="${id}"]`,
                                                        ),
                                                }),
                                            )}
                                            onOrderChange={(ids) =>
                                                setOptions({
                                                    ...options,
                                                    blocks: ids as Block[],
                                                })
                                            }
                                            onVisibilityChange={(
                                                id,
                                                visible,
                                            ) => {
                                                focusPreview(
                                                    `[data-report-block="${id}"]`,
                                                );
                                                setOptions({
                                                    ...options,
                                                    hiddenBlocks: visible
                                                        ? options.hiddenBlocks.filter(
                                                              (block) =>
                                                                  block !== id,
                                                          )
                                                        : [
                                                              ...options.hiddenBlocks,
                                                              id as Block,
                                                          ],
                                                });
                                            }}
                                        />
                                    </CollapsibleContent>
                                </FieldSet>
                            </Collapsible>
                            <Collapsible
                                asChild
                                disabled={busy}
                                onOpenChange={(open) => {
                                    if (open)
                                        focusPreview('.budget-report-footer');
                                }}
                            >
                                <FieldSet>
                                    {heading(
                                        PanelBottom,
                                        'Piè di pagina',
                                        () => {
                                            setOptions({
                                                ...options,
                                                showBranding: true,
                                                showDate: true,
                                                showPageNumbers:
                                                    defaults.showPageNumbers,
                                                numberFirstPage:
                                                    defaults.numberFirstPage,
                                            });
                                        },
                                    )}
                                    <CollapsibleContent className="flex flex-col gap-3">
                                        {visibility(
                                            'showDate',
                                            'Data di elaborazione',
                                        )}
                                        {visibility(
                                            'showBranding',
                                            'Logo applicazione',
                                        )}
                                        {visibility(
                                            'showPageNumbers',
                                            'Numeri di pagina',
                                        )}
                                        {options.showPageNumbers && (
                                            <>
                                                {check(
                                                    'numberFirstPage',
                                                    'Includi la prima pagina',
                                                )}
                                                {!options.numberFirstPage && (
                                                    <FieldDescription>
                                                        Numerazione da 1 sulla
                                                        seconda pagina.
                                                    </FieldDescription>
                                                )}
                                            </>
                                        )}
                                    </CollapsibleContent>
                                </FieldSet>
                            </Collapsible>
                        </FieldGroup>
                    </div>
                    <div
                        ref={previewRef}
                        className="h-[55dvh] min-w-0 overflow-auto rounded-md border bg-muted p-4 lg:h-auto [&>.budget-report]:mx-auto"
                        aria-label="Documento da stampare"
                        tabIndex={0}
                    >
                        {renderReport(
                            { ...options, columns: visibleColumns },
                            contentRef,
                            createdAt,
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {invalid && (
                        <p className="text-sm text-muted-foreground">
                            Compila i titoli; seleziona almeno un blocco e una
                            colonna per la tabella.
                        </p>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        <Button
                            className="bg-black text-white hover:bg-black/90"
                            disabled={invalid || busy}
                            onClick={() => void download()}
                        >
                            <Download data-icon="inline-start" />
                            {downloading ? 'Preparazione PDF…' : 'Scarica PDF'}
                        </Button>
                        <Button
                            className="bg-orange-500 text-black hover:bg-orange-500/90"
                            disabled={invalid || busy}
                            onClick={() => {
                                setPrinting(true);
                                print();
                            }}
                        >
                            <Printer data-icon="inline-start" />
                            {printing ? 'Stampa in corso…' : 'Stampa'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

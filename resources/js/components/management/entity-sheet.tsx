import { router } from '@inertiajs/react';
import { DeleteRecord } from './delete-record';
import { Plus, ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Field,
    FieldGroup,
    FieldLabel,
    FieldError,
    FieldSet,
    FieldLegend,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { Tenant } from '@/types';
import { AttachmentsSection } from './attachments-section';
import { DateField } from './date-field';
import { draftLines, emptyDraftLine, ExpenseLines } from './expense-lines';
import { ExpensePeriodFields, periodYear } from './expense-period-fields';
import { dateLabel } from './helpers';
import type { DraftLine } from './expense-lines';
import { api, ApiError, decimalInput } from './helpers';
import { RecordSelect } from './record-select';
import { CostCenterSelect } from './cost-center-select';
import { CostCenterSheet } from './cost-center-sheet';
import { singular } from './types';
import type { Catalog, Kind, Options, RecordData } from './types';

type FormField = {
    key: Exclude<
        keyof RecordData,
        'vendor' | 'contract' | 'project' | 'lines' | 'cost_centers'
    >;
    label: string;
    type?: string;
    required?: boolean;
    catalog?: Catalog;
};
const fields: Record<Kind, FormField[]> = {
    vendors: [
        { key: 'name', label: 'Nome', required: true },
        { key: 'vat_number', label: 'Partita IVA' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'phone', label: 'Telefono', type: 'tel' },
        { key: 'notes', label: 'Note', type: 'textarea' },
    ],
    contracts: [
        { key: 'name', label: 'Nome', required: true },
        { key: 'vendor_id', label: 'Fornitore', catalog: 'vendors' },
        { key: 'starts_on', label: 'Data iniziale', type: 'date' },
        { key: 'ends_on', label: 'Data finale', type: 'date' },
        { key: 'notes', label: 'Note', type: 'textarea' },
    ],
    projects: [
        { key: 'name', label: 'Nome', required: true },
        { key: 'description', label: 'Descrizione', type: 'textarea' },
        { key: 'status', label: 'Stato', type: 'status', required: true },
        { key: 'starts_on', label: 'Data iniziale', type: 'date' },
        { key: 'ends_on', label: 'Data finale', type: 'date' },
    ],
    expenses: [
        { key: 'title', label: 'Descrizione spesa', required: true },
        { key: 'period_starts_on', label: 'Inizio periodo', type: 'date' },
        { key: 'period_ends_on', label: 'Fine periodo', type: 'date' },
        {
            key: 'year',
            label: 'Anno di imputazione',
            type: 'number',
            required: true,
        },
        { key: 'allocated_amount', label: 'Previsto (€)', type: 'money' },
        { key: 'actual_amount', label: 'Effettivo (€)', type: 'money' },
        { key: 'vendor_id', label: 'Fornitore', catalog: 'vendors' },
        { key: 'contract_id', label: 'Contratto', catalog: 'contracts' },
        { key: 'project_id', label: 'Progetto', catalog: 'projects' },
        { key: 'notes', label: 'Note', type: 'textarea' },
    ],
};
type InitialExpense = {
    enabled: boolean;
    values: Record<string, string>;
    lines: DraftLine[];
};
type Frame = {
    kind: Kind;
    record?: RecordData;
    values: Record<string, string>;
    lines: DraftLine[];
    detailed: boolean;
    costCenterIds: number[];
    original: string;
    returnField?: string;
    initialExpense?: InitialExpense;
};
function snapshot(
    item: Pick<
        Frame,
        'values' | 'lines' | 'costCenterIds' | 'detailed' | 'initialExpense'
    >,
): string {
    return JSON.stringify({
        values: item.values,
        lines: item.lines,
        costCenterIds: item.costCenterIds,
        detailed: item.detailed,
        initialExpense: item.initialExpense,
    });
}
function linePayload(lines: DraftLine[], defaultYear?: string) {
    return lines.map((line) => ({
        description: line.description,
        type: line.type,
        unit_price: decimalInput(line.unit_price),
        quantity: decimalInput(line.quantity),
        ...(defaultYear
            ? {
                  period_starts_on: line.period_starts_on || null,
                  period_ends_on: line.period_ends_on || null,
                  year: line.year ?? defaultYear,
              }
            : {}),
    }));
}
function frame(
    kind: Kind,
    year: number,
    record?: RecordData,
    returnField?: string,
): Frame {
    const values = Object.fromEntries(
        fields[kind].map((field) => [
            field.key,
            String(
                record?.[field.key] ??
                    (field.key === 'year'
                        ? year
                        : field.key === 'status'
                          ? 'pianificato'
                          : ''),
            ),
        ]),
    );
    const lines = kind === 'expenses' ? draftLines(record) : [];
    const detailed = kind === 'expenses' && (!record || !!record.lines?.length);
    const costCenterIds =
        record?.cost_centers?.map((center) => center.id) ?? [];
    const initialExpense =
        kind === 'contracts' && !record
            ? {
                  enabled: !returnField,
                  values: {
                      title: '',
                      year: String(year),
                      period_starts_on: '',
                      period_ends_on: '',
                  },
                  lines: [{ ...emptyDraftLine(), year: String(year) }],
              }
            : undefined;
    return {
        kind,
        record,
        values,
        lines,
        detailed,
        costCenterIds,
        initialExpense,
        original: snapshot({
            values,
            lines,
            costCenterIds,
            detailed,
            initialExpense,
        }),
        returnField,
    };
}
export function EntitySheet({
    tenant,
    kind,
    record,
    year = new Date().getFullYear(),
    options,
    contractContext,
    onClose,
    onSaved,
}: {
    tenant: Tenant;
    kind: Kind;
    record?: RecordData;
    year?: number;
    options: Options;
    contractContext?: RecordData;
    onClose: () => void;
    onSaved: (record: RecordData) => void;
}) {
    const [frames, setFrames] = useState<Frame[]>(() => {
        const initial = frame(kind, year, record);
        if (kind === 'expenses' && contractContext && !record) {
            initial.values.title = contractContext.name ?? '';
            initial.lines = [emptyDraftLine('allocated', contractContext.name)];
            initial.values.contract_id = String(contractContext.id);
            if (
                !contractContext.has_period_expenses &&
                contractContext.starts_on &&
                contractContext.ends_on
            ) {
                initial.values.period_starts_on =
                    contractContext.starts_on.slice(0, 10);
                initial.values.period_ends_on = contractContext.ends_on.slice(
                    0,
                    10,
                );
                initial.values.year = periodYear(initial.values, true);
            }
            initial.lines[0] = {
                ...initial.lines[0],
                period_starts_on: initial.values.period_starts_on,
                period_ends_on: initial.values.period_ends_on,
                year: initial.values.year,
            };
            initial.original = snapshot(initial);
        }
        return [initial];
    });
    const [localOptions, setLocalOptions] = useState(options);
    const [creatingCostCenter, setCreatingCostCenter] = useState<string | null>(
        null,
    );
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [busy, setBusy] = useState(false);
    const [attachmentsBusy, setAttachmentsBusy] = useState(false);
    const attachmentsChanged = useRef(false);
    const formBusy = busy || attachmentsBusy;
    const [discard, setDiscard] = useState<'close' | 'back' | null>(null);
    const current = frames[frames.length - 1];
    const initialExpense = current.initialExpense;
    const editingInitialExpense = !!initialExpense?.enabled;
    const contractLines =
        current.kind === 'expenses' &&
        (!!current.values.contract_id || !!current.record?.contract_id);
    const initialExpenseErrors = Object.fromEntries(
        Object.entries(errors)
            .filter(([key]) => key.startsWith('initial_expense.'))
            .map(([key, messages]) => [
                key.slice('initial_expense.'.length),
                messages,
            ]),
    );
    const dirty = frames.some((item) => snapshot(item) !== item.original);
    useEffect(() => {
        const listener = (event: BeforeUnloadEvent) => {
            if (dirty || formBusy) event.preventDefault();
        };
        window.addEventListener('beforeunload', listener);
        return () => window.removeEventListener('beforeunload', listener);
    }, [dirty, formBusy]);
    function change(key: string, value: string) {
        setFrames((previous) =>
            previous.map((item, index) => {
                if (index !== previous.length - 1) return item;
                const values = { ...item.values, [key]: value };
                let lines = item.lines;
                if (
                    item.kind === 'expenses' &&
                    key === 'contract_id' &&
                    !item.record
                ) {
                    const previousName =
                        localOptions.contracts.find(
                            (contract) =>
                                String(contract.id) === item.values.contract_id,
                        )?.name ?? '';
                    const name =
                        localOptions.contracts.find(
                            (contract) => String(contract.id) === value,
                        )?.name ?? '';
                    if (values.title === '' || values.title === previousName)
                        values.title = name;
                    lines = lines.map((line) =>
                        line.description === '' ||
                        line.description === previousName
                            ? { ...line, description: name }
                            : line,
                    );
                }
                if (item.kind === 'expenses' && key.startsWith('period_'))
                    values.year = periodYear(
                        values,
                        !item.record &&
                            (!item.values.period_starts_on ||
                                !item.values.period_ends_on),
                    );
                let initialExpense = item.initialExpense;
                if (initialExpense) {
                    const expenseKeys: Record<string, string> = {
                        name: 'title',
                        starts_on: 'period_starts_on',
                        ends_on: 'period_ends_on',
                    };
                    const expenseKey = expenseKeys[key];
                    if (
                        expenseKey &&
                        initialExpense.values[expenseKey] === item.values[key]
                    ) {
                        const expenseValues = {
                            ...initialExpense.values,
                            [expenseKey]: value,
                        };
                        if (expenseKey.startsWith('period_'))
                            expenseValues.year = periodYear(
                                expenseValues,
                                !initialExpense.values.period_starts_on ||
                                    !initialExpense.values.period_ends_on,
                            );
                        initialExpense = {
                            ...initialExpense,
                            values: expenseValues,
                        };
                    }
                    if (expenseKey) {
                        const lineField =
                            key === 'name' ? 'description' : expenseKey;
                        initialExpense = {
                            ...initialExpense,
                            lines: initialExpense.lines.map((line) => {
                                if (
                                    (line[lineField as keyof DraftLine] ??
                                        '') !== item.values[key]
                                )
                                    return line;
                                const next = { ...line, [lineField]: value };
                                if (key !== 'name')
                                    next.year = periodYear(
                                        {
                                            year: String(
                                                next.year ??
                                                    initialExpense!.values.year,
                                            ),
                                            period_starts_on:
                                                next.period_starts_on ?? '',
                                            period_ends_on:
                                                next.period_ends_on ?? '',
                                        },
                                        !line.period_starts_on ||
                                            !line.period_ends_on,
                                    );
                                return next;
                            }),
                        };
                    }
                }
                return { ...item, values, lines, initialExpense };
            }),
        );
    }
    function changeInitialExpense(key: string, value: string) {
        setFrames((previous) =>
            previous.map((item, index) => {
                if (index !== previous.length - 1 || !item.initialExpense)
                    return item;
                const values = { ...item.initialExpense.values, [key]: value };
                if (key.startsWith('period_'))
                    values.year = periodYear(
                        values,
                        !item.initialExpense.values.period_starts_on ||
                            !item.initialExpense.values.period_ends_on,
                    );
                return {
                    ...item,
                    initialExpense: { ...item.initialExpense, values },
                };
            }),
        );
    }
    function useDetailedLines() {
        setFrames((previous) =>
            previous.map((item, index) => {
                if (index !== previous.length - 1) return item;
                return {
                    ...item,
                    detailed: true,
                    lines: draftLines({
                        id: item.record?.id ?? 0,
                        title: item.values.title,
                        year: Number(item.values.year),
                        period_starts_on: item.values.period_starts_on || null,
                        period_ends_on: item.values.period_ends_on || null,
                        allocated_amount: decimalInput(
                            item.values.allocated_amount,
                        ),
                        actual_amount: decimalInput(item.values.actual_amount),
                    }),
                };
            }),
        );
    }
    function back() {
        setErrors({});
        setFrames((previous) => previous.slice(0, -1));
    }
    function requestClose() {
        if (formBusy) return;
        if (dirty) setDiscard('close');
        else close();
    }
    function close() {
        onClose();
        if (attachmentsChanged.current) router.reload();
    }
    async function save(event: React.SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (formBusy) return;
        setBusy(true);
        setErrors({});
        const payload: Record<string, unknown> = Object.fromEntries(
            fields[current.kind].map((field) => [
                field.key,
                field.type === 'money'
                    ? decimalInput(current.values[field.key])
                    : current.values[field.key] === ''
                      ? null
                      : current.values[field.key],
            ]),
        );
        if (current.kind === 'expenses') {
            if (current.detailed) {
                delete payload.allocated_amount;
                delete payload.actual_amount;
                payload.lines = linePayload(
                    current.lines,
                    contractLines ? current.values.year : undefined,
                );
            }
            if (contractContext) payload.contract_entry = true;
        }
        if (initialExpense?.enabled) {
            payload.initial_expense = {
                ...initialExpense.values,
                lines: linePayload(
                    initialExpense.lines,
                    initialExpense.values.year,
                ),
            };
        }
        if (current.kind !== 'vendors') {
            payload.cost_center_ids = current.costCenterIds;
        }
        try {
            const data = await api<{ record: RecordData }>(
                `/t/${tenant.slug}/${current.kind}${current.record ? `/${current.record.id}` : ''}`,
                current.record ? 'PATCH' : 'POST',
                payload,
            );
            toast.success(`${singular[current.kind]} salvato.`);
            if (frames.length > 1) {
                const catalog = current.kind as Catalog;
                setLocalOptions((previous) => ({
                    ...previous,
                    [catalog]: [
                        ...previous[catalog],
                        { id: data.record.id, name: data.record.name ?? '' },
                    ],
                }));
                setFrames((previous) =>
                    previous.slice(0, -1).map((item, index) =>
                        index === previous.length - 2
                            ? {
                                  ...item,
                                  values: {
                                      ...item.values,
                                      title:
                                          current.kind === 'contracts' &&
                                          !item.values.title
                                              ? (data.record.name ?? '')
                                              : item.values.title,
                                      [current.returnField!]: String(
                                          data.record.id,
                                      ),
                                  },
                                  lines:
                                      current.kind === 'contracts'
                                          ? item.lines.map((line) =>
                                                line.description === ''
                                                    ? {
                                                          ...line,
                                                          description:
                                                              data.record
                                                                  .name ?? '',
                                                      }
                                                    : line,
                                            )
                                          : item.lines,
                              }
                            : item,
                    ),
                );
            } else onSaved(data.record);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Salvataggio non riuscito.';
            setErrors(
                error instanceof ApiError
                    ? { ...error.errors, _form: [message] }
                    : { _form: [message] },
            );
            toast.error(message);
        } finally {
            setBusy(false);
        }
    }
    if (creatingCostCenter !== null) {
        return (
            <CostCenterSheet
                tenant={tenant}
                initialName={creatingCostCenter}
                parents={localOptions.cost_centers.filter(
                    (center) => center.parent_id === null,
                )}
                onClose={() => setCreatingCostCenter(null)}
                onSaved={(center) => {
                    setLocalOptions((previous) => ({
                        ...previous,
                        cost_centers: [...previous.cost_centers, center],
                    }));
                    setFrames((previous) =>
                        previous.map((item, index) =>
                            index === previous.length - 1
                                ? {
                                      ...item,
                                      costCenterIds: [
                                          ...item.costCenterIds,
                                          center.id,
                                      ],
                                  }
                                : item,
                        ),
                    );
                    setCreatingCostCenter(null);
                }}
            />
        );
    }

    return (
        <>
            <Sheet
                open
                onOpenChange={(open) => {
                    if (!open) requestClose();
                }}
            >
                <SheetContent
                    className={cn(
                        'w-full gap-0 overflow-hidden bg-popover',
                        current.kind === 'expenses' || editingInitialExpense
                            ? 'sm:max-w-5xl'
                            : 'sm:max-w-xl',
                    )}
                    closeDisabled={formBusy}
                    onEscapeKeyDown={(event) => {
                        event.preventDefault();
                        requestClose();
                    }}
                    onInteractOutside={(event) => {
                        event.preventDefault();
                        requestClose();
                    }}
                >
                    <SheetHeader className="shrink-0 border-b p-5 pr-14 sm:px-6">
                        <SheetTitle>
                            {current.record ? 'Modifica' : 'Nuovo elemento'} ·{' '}
                            {singular[current.kind]}
                        </SheetTitle>
                        <SheetDescription>
                            {current.kind === 'expenses'
                                ? current.detailed
                                    ? contractLines
                                        ? 'Modifica i dati della spesa e le condizioni economiche.'
                                        : 'Modifica i dati generali e le righe economiche della spesa.'
                                    : 'Inserisci il previsto, l’effettivo oppure entrambi. Un campo vuoto indica un importo non disponibile; zero è un importo valorizzato.'
                                : current.kind === 'contracts'
                                  ? current.record
                                      ? 'Modifica i dati del contratto. Le condizioni economiche sono nelle spese collegate.'
                                      : 'Inserisci il contratto e le condizioni economiche della prima spesa.'
                                  : `Dati di ${tenant.name}.`}
                        </SheetDescription>
                    </SheetHeader>
                    {frames.length > 1 && (
                        <Button
                            type="button"
                            variant="ghost"
                            className="mx-4 justify-start"
                            disabled={formBusy}
                            onClick={() => {
                                if (snapshot(current) !== current.original)
                                    setDiscard('back');
                                else back();
                            }}
                        >
                            <ArrowLeft className="mr-2 size-4" />
                            Torna al form precedente
                        </Button>
                    )}
                    <form
                        id="entity-form"
                        aria-busy={formBusy}
                        className="flex min-h-0 flex-1 flex-col"
                        onSubmit={(event) => {
                            void save(event);
                        }}
                    >
                        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
                            {errors._form && (
                                <p
                                    className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                                    role="alert"
                                >
                                    {errors._form[0]} I dati inseriti restano
                                    nel form.
                                </p>
                            )}
                            {current.kind === 'expenses' && (
                                <h2 className="font-semibold">
                                    Dati della spesa
                                </h2>
                            )}
                            {current.kind === 'expenses' && contractContext && (
                                <p className="text-sm text-muted-foreground">
                                    Contratto: {contractContext.name}. Date di
                                    riferimento:{' '}
                                    {dateLabel(contractContext.starts_on)} –{' '}
                                    {dateLabel(contractContext.ends_on)}. Puoi
                                    indicare anche un periodo diverso.
                                </p>
                            )}
                            <FieldGroup
                                className={
                                    current.kind === 'expenses'
                                        ? 'grid gap-4 sm:grid-cols-2'
                                        : 'gap-5'
                                }
                                role={
                                    current.kind === 'expenses'
                                        ? 'group'
                                        : undefined
                                }
                                aria-label={
                                    current.kind === 'expenses'
                                        ? 'Dati generali della spesa'
                                        : undefined
                                }
                            >
                                {fields[current.kind].map((field) => {
                                    if (current.kind === 'expenses') {
                                        if (
                                            [
                                                'period_starts_on',
                                                'period_ends_on',
                                            ].includes(field.key)
                                        )
                                            return null;
                                        if (field.key === 'year')
                                            if (
                                                current.detailed &&
                                                contractLines
                                            )
                                                return null;
                                        if (field.key === 'year')
                                            return (
                                                <ExpensePeriodFields
                                                    key={field.key}
                                                    values={current.values}
                                                    onChange={change}
                                                    disabled={formBusy}
                                                    errors={errors}
                                                    showPeriod={
                                                        !!current.values
                                                            .contract_id ||
                                                        !!current.values
                                                            .period_starts_on ||
                                                        !!current.values
                                                            .period_ends_on
                                                    }
                                                />
                                            );
                                        if (
                                            current.detailed &&
                                            [
                                                'allocated_amount',
                                                'actual_amount',
                                            ].includes(field.key)
                                        )
                                            return null;
                                        if (
                                            contractContext &&
                                            (field.key === 'contract_id' ||
                                                (!current.detailed &&
                                                    [
                                                        'vendor_id',
                                                        'project_id',
                                                        'notes',
                                                    ].includes(field.key)))
                                        )
                                            return null;
                                    }
                                    const value = current.values[field.key];
                                    const id = `field-${field.key}`;
                                    const selectOptions = field.catalog
                                        ? [
                                              ...localOptions[field.catalog],
                                              ...(current.record?.[
                                                  field.catalog.slice(0, -1) as
                                                      | 'vendor'
                                                      | 'contract'
                                                      | 'project'
                                              ]
                                                  ? [
                                                        current.record[
                                                            field.catalog.slice(
                                                                0,
                                                                -1,
                                                            ) as
                                                                | 'vendor'
                                                                | 'contract'
                                                                | 'project'
                                                        ]!,
                                                    ]
                                                  : []),
                                          ]
                                        : [];
                                    return (
                                        <Field
                                            key={field.key}
                                            data-invalid={!!errors[field.key]}
                                            data-disabled={formBusy}
                                            className={cn(
                                                'min-w-0 gap-2',
                                                current.kind === 'expenses' &&
                                                    ['title', 'notes'].includes(
                                                        field.key,
                                                    ) &&
                                                    'sm:col-span-2',
                                            )}
                                        >
                                            <FieldLabel htmlFor={id}>
                                                {field.label}
                                                {field.required && ' *'}
                                            </FieldLabel>
                                            {field.catalog ? (
                                                <div className="flex gap-2">
                                                    <RecordSelect
                                                        id={id}
                                                        aria-invalid={
                                                            !!errors[field.key]
                                                        }
                                                        aria-describedby={
                                                            errors[field.key]
                                                                ? `${id}-error`
                                                                : undefined
                                                        }
                                                        slug={tenant.slug}
                                                        catalog={field.catalog}
                                                        value={value}
                                                        options={selectOptions}
                                                        label={`Seleziona ${singular[field.catalog]}`}
                                                        onChange={(selected) =>
                                                            change(
                                                                field.key,
                                                                selected,
                                                            )
                                                        }
                                                        disabled={formBusy}
                                                    />
                                                    {current.kind ===
                                                        'expenses' && (
                                                        <Button
                                                            variant="outline"
                                                            type="button"
                                                            size="icon"
                                                            disabled={formBusy}
                                                            aria-label={`Crea ${singular[field.catalog]}`}
                                                            onClick={() => {
                                                                setErrors({});
                                                                setFrames(
                                                                    (
                                                                        previous,
                                                                    ) => [
                                                                        ...previous,
                                                                        frame(
                                                                            field.catalog!,
                                                                            year,
                                                                            undefined,
                                                                            field.key,
                                                                        ),
                                                                    ],
                                                                );
                                                            }}
                                                        >
                                                            <Plus className="size-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            ) : field.type === 'status' ? (
                                                <Select
                                                    value={value}
                                                    onValueChange={(selected) =>
                                                        change(
                                                            field.key,
                                                            selected,
                                                        )
                                                    }
                                                    disabled={formBusy}
                                                >
                                                    <SelectTrigger
                                                        id={id}
                                                        aria-invalid={
                                                            !!errors[field.key]
                                                        }
                                                        aria-describedby={
                                                            errors[field.key]
                                                                ? `${id}-error`
                                                                : undefined
                                                        }
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectGroup>
                                                            {[
                                                                'pianificato',
                                                                'attivo',
                                                                'completato',
                                                            ].map((status) => (
                                                                <SelectItem
                                                                    key={status}
                                                                    value={
                                                                        status
                                                                    }
                                                                >
                                                                    {status}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            ) : field.type === 'textarea' ? (
                                                <Textarea
                                                    aria-invalid={
                                                        !!errors[field.key]
                                                    }
                                                    id={id}
                                                    aria-describedby={
                                                        errors[field.key]
                                                            ? `${id}-error`
                                                            : undefined
                                                    }
                                                    value={value}
                                                    onChange={(event) =>
                                                        change(
                                                            field.key,
                                                            event.target.value,
                                                        )
                                                    }
                                                    disabled={formBusy}
                                                    rows={3}
                                                />
                                            ) : field.type === 'date' ? (
                                                <DateField
                                                    aria-invalid={
                                                        !!errors[field.key]
                                                    }
                                                    id={id}
                                                    aria-describedby={
                                                        errors[field.key]
                                                            ? `${id}-error`
                                                            : undefined
                                                    }
                                                    value={value}
                                                    onChange={(selected) =>
                                                        change(
                                                            field.key,
                                                            selected,
                                                        )
                                                    }
                                                    disabled={formBusy}
                                                />
                                            ) : (
                                                <Input
                                                    id={id}
                                                    aria-describedby={
                                                        errors[field.key]
                                                            ? `${id}-error`
                                                            : undefined
                                                    }
                                                    className={
                                                        field.type === 'money'
                                                            ? 'text-right font-medium tabular-nums'
                                                            : undefined
                                                    }
                                                    type={
                                                        field.type === 'money'
                                                            ? 'text'
                                                            : (field.type ??
                                                              'text')
                                                    }
                                                    inputMode={
                                                        field.type === 'money'
                                                            ? 'decimal'
                                                            : undefined
                                                    }
                                                    placeholder={
                                                        field.type === 'money'
                                                            ? 'Da inserire'
                                                            : undefined
                                                    }
                                                    value={value}
                                                    onChange={(event) =>
                                                        change(
                                                            field.key,
                                                            event.target.value,
                                                        )
                                                    }
                                                    required={field.required}
                                                    disabled={formBusy}
                                                    aria-invalid={
                                                        !!errors[field.key]
                                                    }
                                                />
                                            )}
                                            {errors[field.key] && (
                                                <FieldError id={`${id}-error`}>
                                                    {errors[field.key][0]}
                                                </FieldError>
                                            )}
                                        </Field>
                                    );
                                })}
                                {current.kind !== 'vendors' &&
                                    !(
                                        current.kind === 'expenses' &&
                                        contractContext &&
                                        !current.detailed
                                    ) && (
                                        <Field
                                            className={cn(
                                                'min-w-0 gap-2',
                                                current.kind === 'expenses' &&
                                                    'sm:col-span-2',
                                            )}
                                            data-invalid={
                                                !!errors.cost_center_ids ||
                                                Object.keys(errors).some(
                                                    (key) =>
                                                        key.startsWith(
                                                            'cost_center_ids.',
                                                        ),
                                                )
                                            }
                                        >
                                            <FieldLabel htmlFor="entity-cost-centers">
                                                Centri di Costo
                                            </FieldLabel>
                                            <CostCenterSelect
                                                id="entity-cost-centers"
                                                options={
                                                    localOptions.cost_centers
                                                }
                                                value={current.costCenterIds}
                                                onCreate={setCreatingCostCenter}
                                                disabled={formBusy}
                                                invalid={
                                                    !!errors.cost_center_ids ||
                                                    Object.keys(errors).some(
                                                        (key) =>
                                                            key.startsWith(
                                                                'cost_center_ids.',
                                                            ),
                                                    )
                                                }
                                                describedBy="entity-cost-centers-error"
                                                onChange={(costCenterIds) =>
                                                    setFrames((previous) =>
                                                        previous.map(
                                                            (item, index) =>
                                                                index ===
                                                                previous.length -
                                                                    1
                                                                    ? {
                                                                          ...item,
                                                                          costCenterIds,
                                                                      }
                                                                    : item,
                                                        ),
                                                    )
                                                }
                                            />
                                            <FieldError
                                                id="entity-cost-centers-error"
                                                errors={Object.entries(errors)
                                                    .filter(
                                                        ([key]) =>
                                                            key ===
                                                                'cost_center_ids' ||
                                                            key.startsWith(
                                                                'cost_center_ids.',
                                                            ),
                                                    )
                                                    .flatMap(([, messages]) =>
                                                        messages.map(
                                                            (message) => ({
                                                                message,
                                                            }),
                                                        ),
                                                    )}
                                            />
                                        </Field>
                                    )}
                            </FieldGroup>
                            {contractLines && current.detailed && (
                                <FieldError>
                                    {errors.period_starts_on?.[0] ??
                                        errors.period_ends_on?.[0] ??
                                        errors.year?.[0]}
                                </FieldError>
                            )}
                            {initialExpense && (
                                <FieldSet>
                                    <FieldLegend>
                                        Prima spesa collegata
                                    </FieldLegend>
                                    <FieldGroup className="grid gap-4 sm:grid-cols-2">
                                        <Field
                                            orientation="horizontal"
                                            className="sm:col-span-2"
                                        >
                                            <Checkbox
                                                id="include-initial-expense"
                                                checked={initialExpense.enabled}
                                                disabled={formBusy}
                                                onCheckedChange={(checked) =>
                                                    setFrames((previous) =>
                                                        previous.map(
                                                            (item, index) =>
                                                                index ===
                                                                    previous.length -
                                                                        1 &&
                                                                item.initialExpense
                                                                    ? {
                                                                          ...item,
                                                                          initialExpense:
                                                                              {
                                                                                  ...item.initialExpense,
                                                                                  enabled:
                                                                                      checked ===
                                                                                      true,
                                                                              },
                                                                      }
                                                                    : item,
                                                        ),
                                                    )
                                                }
                                            />
                                            <FieldLabel htmlFor="include-initial-expense">
                                                Registra la prima spesa insieme
                                                al contratto
                                            </FieldLabel>
                                        </Field>
                                        {initialExpense.enabled && (
                                            <>
                                                <p className="text-sm text-muted-foreground sm:col-span-2">
                                                    La spesa usa il fornitore e
                                                    i centri di costo del
                                                    contratto ed è inclusa nei
                                                    totali.
                                                </p>
                                                <Field
                                                    className="sm:col-span-2"
                                                    data-invalid={
                                                        !!initialExpenseErrors.title
                                                    }
                                                >
                                                    <FieldLabel htmlFor="initial-expense-title">
                                                        Descrizione spesa *
                                                    </FieldLabel>
                                                    <Input
                                                        id="initial-expense-title"
                                                        value={
                                                            initialExpense
                                                                .values.title
                                                        }
                                                        onChange={(event) =>
                                                            changeInitialExpense(
                                                                'title',
                                                                event.target
                                                                    .value,
                                                            )
                                                        }
                                                        required
                                                        disabled={formBusy}
                                                        aria-invalid={
                                                            !!initialExpenseErrors.title
                                                        }
                                                        aria-describedby={
                                                            initialExpenseErrors.title
                                                                ? 'initial-expense-title-error'
                                                                : undefined
                                                        }
                                                    />
                                                    <FieldError id="initial-expense-title-error">
                                                        {
                                                            initialExpenseErrors
                                                                .title?.[0]
                                                        }
                                                    </FieldError>
                                                </Field>
                                            </>
                                        )}
                                        <FieldError>
                                            {errors.initial_expense?.[0]}
                                        </FieldError>
                                    </FieldGroup>
                                </FieldSet>
                            )}
                            {current.kind === 'expenses' &&
                                !current.detailed && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={formBusy}
                                        onClick={useDetailedLines}
                                    >
                                        {contractLines
                                            ? 'Passa alle condizioni economiche'
                                            : 'Passa alle righe economiche'}
                                    </Button>
                                )}
                            {((current.kind === 'expenses' &&
                                current.detailed) ||
                                editingInitialExpense) && (
                                <ExpenseLines
                                    lines={
                                        editingInitialExpense
                                            ? initialExpense!.lines
                                            : current.lines
                                    }
                                    contractMode={
                                        editingInitialExpense ||
                                        !!current.values.contract_id ||
                                        !!current.record?.contract_id
                                    }
                                    defaultDescription={
                                        editingInitialExpense
                                            ? current.values.name
                                            : (contractContext?.name ??
                                              current.record?.contract?.name ??
                                              localOptions.contracts.find(
                                                  (contract) =>
                                                      String(contract.id) ===
                                                      current.values
                                                          .contract_id,
                                              )?.name)
                                    }
                                    defaultPeriod={
                                        editingInitialExpense
                                            ? initialExpense!.values
                                            : current.values
                                    }
                                    disabled={formBusy}
                                    errors={
                                        editingInitialExpense
                                            ? initialExpenseErrors
                                            : errors
                                    }
                                    onChange={(lines) => {
                                        setErrors((previous) =>
                                            Object.fromEntries(
                                                Object.entries(previous).filter(
                                                    ([key]) =>
                                                        !key.startsWith(
                                                            editingInitialExpense
                                                                ? 'initial_expense.lines'
                                                                : 'lines',
                                                        ),
                                                ),
                                            ),
                                        );
                                        setFrames((previous) =>
                                            previous.map((item, index) =>
                                                index === previous.length - 1
                                                    ? editingInitialExpense &&
                                                      item.initialExpense
                                                        ? {
                                                              ...item,
                                                              initialExpense: {
                                                                  ...item.initialExpense,
                                                                  lines,
                                                              },
                                                          }
                                                        : { ...item, lines }
                                                    : item,
                                            ),
                                        );
                                    }}
                                />
                            )}
                            {current.kind !== 'vendors' &&
                                (current.record ? (
                                    <div className="flex min-w-0 flex-col gap-2">
                                        <AttachmentsSection
                                            key={`${current.kind}-${current.record.id}`}
                                            tenant={tenant}
                                            resource={current.kind}
                                            recordId={current.record.id}
                                            id="sheet-attachments"
                                            disabled={busy}
                                            onBusyChange={setAttachmentsBusy}
                                            onChanged={() => {
                                                attachmentsChanged.current = true;
                                            }}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Gli allegati sono salvati subito.
                                            Annulla scarta solo le modifiche ai
                                            campi del form.
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        Salva l’elemento per aggiungere
                                        allegati.
                                    </p>
                                ))}
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-popover p-4 sm:px-6">
                            {current.kind === 'expenses' &&
                                current.record &&
                                frames.length === 1 && (
                                    <div className="mr-auto">
                                        <DeleteRecord
                                            url={`/t/${tenant.slug}/expenses/${current.record.id}`}
                                            label={
                                                current.record.title ??
                                                'questa spesa'
                                            }
                                            disabled={formBusy}
                                            onDeleted={() => {
                                                onClose();
                                                if (
                                                    window.location.pathname ===
                                                    `/t/${tenant.slug}/expenses/${current.record!.id}`
                                                )
                                                    router.visit(
                                                        `/t/${tenant.slug}/expenses?year=${current.record!.year}`,
                                                    );
                                                else router.reload();
                                            }}
                                        />
                                    </div>
                                )}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={requestClose}
                                disabled={formBusy}
                            >
                                Annulla
                            </Button>
                            <Button disabled={formBusy} type="submit">
                                {busy && <Spinner />}
                                {busy ? 'Salvataggio…' : 'Salva'}
                            </Button>
                        </div>
                    </form>
                </SheetContent>
            </Sheet>
            <AlertDialog
                open={discard !== null}
                onOpenChange={(open) => {
                    if (!open) setDiscard(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Scartare le modifiche?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Ci sono dati non salvati nel form. Puoi tornare a
                            modificarli.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            Continua a modificare
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                if (discard === 'close') close();
                                else back();
                                setDiscard(null);
                            }}
                        >
                            Scarta modifiche
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

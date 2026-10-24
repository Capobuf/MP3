import { router, usePage } from '@inertiajs/react';
import { DeleteRecord } from './delete-record';
import {
    BudgetReassignment,
    BudgetReassignmentRequired,
} from './budget-reassignment';
import { Plus } from 'lucide-react';
import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
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
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
    Field,
    FieldGroup,
    FieldLabel,
    FieldError,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useUnsavedNavigation } from '@/hooks/use-unsaved-navigation';
import { Textarea } from '@/components/ui/textarea';
import type { Tenant } from '@/types';
import { AttachmentsSection } from './attachments-section';
import { DateField } from './date-field';
import { MoneyField } from './money-field';
import { FormSurface } from './form-surface';
import { draftLines, emptyDraftLine, ExpenseLines } from './expense-lines';
import { ExpensePeriodFields } from './expense-period-fields';
import type { DraftLine } from './expense-lines';
import { api, ApiError, decimalInput } from './helpers';
import { RecordSelect } from './record-select';
import { CostCenterSelect } from './cost-center-select';
import { CostCenterForm } from './cost-center-form';
import { singular } from './types';
import { ProjectStatusSelect } from './project-status-select';
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
        { key: 'name', label: 'Nome' },
        { key: 'vendor_id', label: 'Fornitore', catalog: 'vendors' },
        { key: 'starts_on', label: 'Inizio contratto', type: 'date' },
        { key: 'ends_on', label: 'Fine contratto', type: 'date' },
        { key: 'notes', label: 'Note', type: 'textarea' },
    ],
    projects: [
        { key: 'name', label: 'Nome', required: true },
        { key: 'description', label: 'Descrizione', type: 'textarea' },
        { key: 'status', label: 'Stato', type: 'status' },
        { key: 'starts_on', label: 'Data iniziale', type: 'date' },
        { key: 'ends_on', label: 'Data finale', type: 'date' },
    ],
    expenses: [
        { key: 'title', label: 'Descrizione', required: true },
        { key: 'period_starts_on', label: 'Inizio periodo', type: 'date' },
        { key: 'period_ends_on', label: 'Fine periodo', type: 'date' },
        {
            key: 'year',
            label: 'Anno di imputazione',
            type: 'number',
            required: true,
        },
        { key: 'allocated_amount', label: 'Allocato', type: 'money' },
        { key: 'actual_amount', label: 'Effettivo', type: 'money' },
        { key: 'vendor_id', label: 'Fornitore', catalog: 'vendors' },
        { key: 'contract_id', label: 'Contratto', catalog: 'contracts' },
        { key: 'project_id', label: 'Progetto', catalog: 'projects' },
        { key: 'notes', label: 'Note', type: 'textarea' },
    ],
};
type InitialExpense = {
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
        ...('period_starts_on' in line || defaultYear
            ? { period_starts_on: line.period_starts_on || null }
            : {}),
        ...('period_ends_on' in line || defaultYear
            ? { period_ends_on: line.period_ends_on || null }
            : {}),
        ...('year' in line || defaultYear
            ? { year: line.year ?? defaultYear ?? null }
            : {}),
    }));
}
function frame(
    kind: Kind,
    year: number,
    record?: RecordData,
    quickCreate = false,
): Frame {
    const values = Object.fromEntries(
        fields[kind].map((field) => [
            field.key,
            String(record?.[field.key] ?? (field.key === 'year' ? year : '')),
        ]),
    );
    const lines = kind === 'expenses' ? draftLines(record) : [];
    const detailed = kind === 'expenses' && (!record || !!record.lines?.length);
    const costCenterIds =
        record?.cost_centers?.map((center) => center.id) ?? [];
    const initialExpense =
        kind === 'contracts' && !record && !quickCreate
            ? {
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
    };
}
export type EntityFormHandle = {
    requestClose: () => void;
};

export function EntityForm({
    ref,
    tenant,
    kind,
    record,
    year: providedYear,
    options,
    contractContext,
    projectContext,
    budgetYearId,
    onClose,
    onSaved,
    onBusyChange,
    quickCreate = false,
}: {
    ref?: Ref<EntityFormHandle>;
    tenant: Tenant;
    kind: Kind;
    record?: RecordData;
    year?: number;
    options: Options;
    contractContext?: RecordData;
    projectContext?: RecordData;
    budgetYearId?: number;
    onClose: () => void;
    onSaved: (record: RecordData) => void;
    onBusyChange?: (busy: boolean) => void;
    quickCreate?: boolean;
}) {
    const { economicContext } = usePage().props;
    const year = providedYear ?? record?.year ?? economicContext!.year;
    const formId = useId();
    const formElement = useRef<HTMLFormElement>(null);
    const relationForm = useRef<EntityFormHandle>(null);
    const relationTrigger = useRef<HTMLButtonElement | null>(null);
    const [creatingRelation, setCreatingRelation] = useState<{
        catalog: Catalog;
        field: string;
    } | null>(null);
    const [current, setCurrent] = useState(() => {
        const initial = frame(kind, year, record, quickCreate);
        if (kind === 'expenses' && contractContext && !record) {
            initial.values.title = contractContext.name ?? '';
            initial.lines = [
                emptyDraftLine('allocated', contractContext.name ?? ''),
            ];
            initial.values.contract_id = String(contractContext.id);
            initial.original = snapshot(initial);
        }
        if (kind === 'expenses' && projectContext && !record) {
            initial.values.project_id = String(projectContext.id);
            initial.original = snapshot(initial);
        }
        return initial;
    });
    const [localOptions, setLocalOptions] = useState(() => ({
        ...options,
        contracts: contractContext
            ? [
                  ...options.contracts,
                  { ...contractContext, name: contractContext.name ?? '' },
              ]
            : options.contracts,
        projects: projectContext
            ? [
                  ...options.projects,
                  { ...projectContext, name: projectContext.name ?? '' },
              ]
            : options.projects,
    }));
    const [creatingCostCenter, setCreatingCostCenter] = useState<string | null>(
        null,
    );
    const saveButton = useRef<HTMLButtonElement>(null);
    const [reassignment, setReassignment] =
        useState<BudgetReassignmentRequired | null>(null);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [busy, setBusy] = useState(false);
    const [attachmentsBusy, setAttachmentsBusy] = useState(false);
    const formBusy =
        busy ||
        attachmentsBusy ||
        reassignment !== null ||
        creatingRelation !== null;
    useEffect(() => {
        onBusyChange?.(formBusy);
        return () => onBusyChange?.(false);
    }, [formBusy, onBusyChange]);
    useImperativeHandle(ref, () => ({ requestClose }));
    const [confirmYear, setConfirmYear] = useState<number | null>(null);
    const [discard, setDiscard] = useState(false);
    const initialExpense = current.initialExpense;
    const editingInitialExpense = !!initialExpense;
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
    const dirty = snapshot(current) !== current.original;
    const navigation = useUnsavedNavigation(
        !quickCreate && dirty && !formBusy && creatingCostCenter === null,
        !quickCreate && formBusy,
    );
    useEffect(() => {
        if (!dirty && !formBusy) return;
        const listener = (event: BeforeUnloadEvent) => {
            event.preventDefault();
        };
        window.addEventListener('beforeunload', listener);
        return () => window.removeEventListener('beforeunload', listener);
    }, [dirty, formBusy]);
    function change(key: string, value: string) {
        setCurrent((item) => {
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
                    line.description === '' || line.description === previousName
                        ? { ...line, description: name }
                        : line,
                );
            }
            let initialExpense = item.initialExpense;
            if (initialExpense && key === 'name') {
                initialExpense = {
                    ...initialExpense,
                    values: {
                        ...initialExpense.values,
                        title:
                            initialExpense.values.title === item.values.name
                                ? value
                                : initialExpense.values.title,
                    },
                    lines: initialExpense.lines.map((line) =>
                        line.description === item.values.name
                            ? { ...line, description: value }
                            : line,
                    ),
                };
            }
            return { ...item, values, lines, initialExpense };
        });
    }
    function changeInitialExpense(key: string, value: string) {
        setCurrent((item) => {
            if (!item.initialExpense) return item;
            const values = { ...item.initialExpense.values, [key]: value };
            return {
                ...item,
                initialExpense: { ...item.initialExpense, values },
            };
        });
    }
    function useDetailedLines() {
        setCurrent((item) => {
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
        });
    }
    function requestClose() {
        if (formBusy) return;
        if (dirty) setDiscard(true);
        else close();
    }
    function close() {
        navigation.allow();
        onClose();
    }
    async function save(
        continuationYear = current.kind === 'contracts'
            ? economicContext!.year
            : year,
    ) {
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
        if (['contracts', 'projects'].includes(current.kind) && !current.record)
            payload.year = continuationYear;
        if (current.kind === 'expenses') {
            const original = JSON.parse(current.original) as Frame;
            if (current.record) {
                for (const field of [
                    'year',
                    'period_starts_on',
                    'period_ends_on',
                ]) {
                    if (current.values[field] === original.values[field])
                        delete payload[field];
                }
            }
            if (current.detailed) {
                delete payload.allocated_amount;
                delete payload.actual_amount;
                if (
                    !current.record ||
                    !original.detailed ||
                    JSON.stringify(current.lines) !==
                        JSON.stringify(original.lines)
                ) {
                    payload.lines = linePayload(
                        current.lines,
                        contractLines && !current.record
                            ? current.values.year
                            : undefined,
                    );
                }
            }
            if (contractContext && current.values.contract_id)
                payload.contract_entry = true;
            if (budgetYearId && !current.record)
                payload.budget_year_id = budgetYearId;
        }
        // Proposed descriptions and default quantities do not create a condition.
        const initialLines =
            initialExpense?.lines
                .map((line, index) => ({ line, index }))
                .filter(
                    ({ line }) =>
                        line.unit_price.trim() !== '' ||
                        !!line.period_starts_on ||
                        !!line.period_ends_on ||
                        (line.description.trim() !== '' &&
                            line.description !== current.values.name) ||
                        Number(decimalInput(line.quantity)) !== 1 ||
                        line.type !== 'allocated' ||
                        String(line.year ?? initialExpense.values.year) !==
                            initialExpense.values.year,
                ) ?? [];
        if (initialExpense && initialLines.length > 0) {
            payload.initial_expense = {
                ...initialExpense.values,
                year: continuationYear,
                lines: linePayload(
                    initialLines.map(({ line }) => ({
                        ...line,
                        year: line.yearEdited
                            ? line.year
                            : String(continuationYear),
                    })),
                    String(continuationYear),
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
            if (
                current.kind === 'contracts' &&
                !current.record &&
                continuationYear !== economicContext!.year
            ) {
                navigation.allow();
                router.visit(
                    `/t/${tenant.slug}/contracts/${data.record.id}?year=${continuationYear}`,
                );
            } else {
                navigation.allow();
                onSaved(data.record);
            }
        } catch (error) {
            if (
                current.kind === 'expenses' &&
                current.record &&
                error instanceof ApiError &&
                error.code === 'budget_reassignment_required'
            ) {
                setReassignment(
                    new BudgetReassignmentRequired(
                        `/t/${tenant.slug}/expenses/${current.record.id}`,
                        payload,
                    ),
                );
                return;
            }
            const message =
                error instanceof Error
                    ? error.message
                    : 'Salvataggio non riuscito.';
            const mappedErrors =
                error instanceof ApiError
                    ? Object.fromEntries(
                          Object.entries(error.errors).map(
                              ([key, messages]) => [
                                  key.replace(
                                      /^initial_expense\.lines\.(\d+)\./,
                                      (prefix, index) =>
                                          `initial_expense.lines.${initialLines[Number(index)]?.index ?? index}.`,
                                  ),
                                  messages,
                              ],
                          ),
                      )
                    : {};
            if (Object.keys(mappedErrors).length) {
                setErrors({ ...mappedErrors, _form: [message] });
                requestAnimationFrame(() =>
                    formElement.current
                        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
                        ?.focus(),
                );
            } else {
                if (quickCreate) setErrors({ _form: [message] });
                toast.error(message);
            }
        } finally {
            setBusy(false);
        }
    }
    if (creatingCostCenter !== null) {
        return (
            <CostCenterForm
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
                    setCurrent((item) => ({
                        ...item,
                        costCenterIds: [...item.costCenterIds, center.id],
                    }));
                    setCreatingCostCenter(null);
                }}
            />
        );
    }

    return (
        <>
            {reassignment && (
                <BudgetReassignment
                    request={reassignment}
                    onClose={() => setReassignment(null)}
                    returnFocus={() =>
                        requestAnimationFrame(() => saveButton.current?.focus())
                    }
                    onSaved={(saved) => {
                        setReassignment(null);
                        navigation.allow();
                        onSaved(saved);
                    }}
                />
            )}
            <FormSurface
                title={
                    <>
                        {current.record
                            ? 'Modifica'
                            : current.kind === 'expenses'
                              ? 'Nuova'
                              : 'Nuovo'}{' '}
                        {singular[current.kind]}
                    </>
                }
                description={
                    current.kind === 'expenses'
                        ? current.detailed
                            ? contractLines
                                ? null
                                : `${current.record ? 'Modifica' : 'Inserisci'} i dati generali e le righe economiche della spesa.`
                            : 'Inserisci il allocato, l’effettivo oppure entrambi. Un campo vuoto indica un importo non disponibile; zero è un importo valorizzato.'
                        : current.kind === 'contracts'
                          ? current.record
                              ? 'Modifica i dati del contratto. Gestisci gli importi dalle spese collegate.'
                              : quickCreate
                                ? 'Inserisci i dati del contratto.'
                                : 'Inserisci il contratto e le righe della prima spesa.'
                          : `Dati di ${tenant.name}.`
                }
            >
                <form
                    ref={formElement}
                    id={formId}
                    aria-busy={formBusy}
                    data-undo-dirty={dirty}
                    className="flex min-h-0 flex-1 flex-col"
                    onSubmit={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (formBusy) return;
                        const startYear = Number(
                            current.values.starts_on?.slice(0, 4),
                        );
                        if (
                            !quickCreate &&
                            current.kind === 'contracts' &&
                            !current.record &&
                            startYear &&
                            startYear !== economicContext!.year
                        ) {
                            setConfirmYear(startYear);
                        } else {
                            void save();
                        }
                    }}
                >
                    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
                        {errors._form && (
                            <p
                                className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                                role="alert"
                            >
                                {errors._form[0]} I dati inseriti restano nel
                                form.
                            </p>
                        )}
                        {current.kind === 'expenses' && (
                            <h2 className="font-semibold">Dati della spesa</h2>
                        )}
                        <FieldGroup
                            className={
                                current.kind === 'expenses' ||
                                current.kind === 'contracts'
                                    ? 'grid items-start gap-4 sm:grid-cols-2'
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
                                if (
                                    current.kind === 'contracts' &&
                                    field.key === 'notes'
                                )
                                    return null;
                                if (current.kind === 'expenses') {
                                    if (
                                        [
                                            'period_starts_on',
                                            'period_ends_on',
                                        ].includes(field.key)
                                    )
                                        return null;
                                    if (field.key === 'year')
                                        if (current.detailed && contractLines)
                                            return null;
                                    if (field.key === 'year')
                                        return (
                                            <ExpensePeriodFields
                                                key={field.key}
                                                values={current.values}
                                                idPrefix={formId}
                                                onChange={change}
                                                disabled={formBusy}
                                                errors={errors}
                                                showYear={
                                                    !current.detailed ||
                                                    current.lines.length === 0
                                                }
                                                showPeriod={
                                                    !contractLines &&
                                                    (!!current.values
                                                        .period_starts_on ||
                                                        !!current.values
                                                            .period_ends_on)
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
                                        projectContext &&
                                        field.key === 'contract_id'
                                    )
                                        return null;
                                    if (
                                        contractContext &&
                                        (field.key === 'project_id' ||
                                            (!current.detailed &&
                                                [
                                                    'vendor_id',
                                                    'project_id',
                                                    'notes',
                                                ].includes(field.key)))
                                    )
                                        return null;
                                }
                                const incompatible =
                                    current.kind === 'expenses' &&
                                    !current.values[field.key] &&
                                    ((field.key === 'contract_id' &&
                                        !!current.values.project_id) ||
                                        (field.key === 'project_id' &&
                                            !!current.values.contract_id) ||
                                        (!!budgetYearId &&
                                            [
                                                'contract_id',
                                                'project_id',
                                            ].includes(field.key)));
                                const value = current.values[field.key];
                                const id = `${formId}-field-${field.key}`;
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
                                            current.kind === 'contracts' &&
                                                field.key === 'name' &&
                                                'sm:col-span-2',
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
                                                    disabled={
                                                        formBusy || incompatible
                                                    }
                                                />
                                                {current.kind ===
                                                    'expenses' && (
                                                    <Button
                                                        variant="outline"
                                                        type="button"
                                                        size="icon"
                                                        disabled={
                                                            formBusy ||
                                                            incompatible
                                                        }
                                                        aria-label={`Crea ${singular[field.catalog]}`}
                                                        onClick={(event) => {
                                                            relationTrigger.current =
                                                                event.currentTarget;
                                                            setCreatingRelation(
                                                                {
                                                                    catalog:
                                                                        field.catalog!,
                                                                    field: field.key,
                                                                },
                                                            );
                                                        }}
                                                    >
                                                        <Plus className="size-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ) : field.type === 'status' ? (
                                            <ProjectStatusSelect
                                                id={id}
                                                statuses={
                                                    options.project_statuses
                                                }
                                                value={value}
                                                onChange={(selected) =>
                                                    change(field.key, selected)
                                                }
                                                disabled={formBusy}
                                                invalid={!!errors[field.key]}
                                                describedBy={
                                                    errors[field.key]
                                                        ? `${id}-error`
                                                        : undefined
                                                }
                                            />
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
                                                    change(field.key, selected)
                                                }
                                                disabled={formBusy}
                                            />
                                        ) : field.type === 'money' ? (
                                            <MoneyField
                                                id={id}
                                                aria-describedby={
                                                    errors[field.key]
                                                        ? `${id}-error`
                                                        : undefined
                                                }
                                                placeholder="0,00"
                                                value={value}
                                                onChange={(value) =>
                                                    change(field.key, value)
                                                }
                                                required={field.required}
                                                disabled={formBusy}
                                                aria-invalid={
                                                    !!errors[field.key]
                                                }
                                            />
                                        ) : (
                                            <Input
                                                id={id}
                                                aria-describedby={
                                                    errors[field.key]
                                                        ? `${id}-error`
                                                        : undefined
                                                }
                                                type={field.type ?? 'text'}
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
                                        {incompatible && (
                                            <p className="text-sm text-muted-foreground">
                                                {budgetYearId
                                                    ? 'Una voce singola del Budget deve restare autonoma.'
                                                    : 'Rimuovi prima il collegamento all’altro contenitore per cambiarlo.'}
                                            </p>
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
                                            Object.keys(errors).some((key) =>
                                                key.startsWith(
                                                    'cost_center_ids.',
                                                ),
                                            )
                                        }
                                    >
                                        <FieldLabel
                                            htmlFor={`${formId}-entity-cost-centers`}
                                        >
                                            Centri di Costo
                                        </FieldLabel>
                                        <CostCenterSelect
                                            id={`${formId}-entity-cost-centers`}
                                            options={localOptions.cost_centers}
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
                                            describedBy={`${formId}-entity-cost-centers-error`}
                                            onChange={(costCenterIds) =>
                                                setCurrent((item) => ({
                                                    ...item,
                                                    costCenterIds,
                                                }))
                                            }
                                        />
                                        <FieldError
                                            id={`${formId}-entity-cost-centers-error`}
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
                                                    messages.map((message) => ({
                                                        message,
                                                    })),
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
                            <FieldGroup>
                                <p className="text-sm text-muted-foreground">
                                    Compila le righe della spesa per registrare
                                    una spesa inclusa nei totali. Se le lasci
                                    vuote, viene creato solo il contratto.
                                </p>
                                <Field
                                    data-invalid={!!initialExpenseErrors.title}
                                >
                                    <FieldLabel
                                        htmlFor={`${formId}-initial-expense-title`}
                                    >
                                        Descrizione
                                    </FieldLabel>
                                    <Input
                                        id={`${formId}-initial-expense-title`}
                                        value={initialExpense.values.title}
                                        onChange={(event) =>
                                            changeInitialExpense(
                                                'title',
                                                event.target.value,
                                            )
                                        }
                                        disabled={formBusy}
                                        aria-invalid={
                                            !!initialExpenseErrors.title
                                        }
                                        aria-describedby={
                                            initialExpenseErrors.title
                                                ? `${formId}-initial-expense-title-error`
                                                : undefined
                                        }
                                    />
                                    <FieldError
                                        id={`${formId}-initial-expense-title-error`}
                                    >
                                        {initialExpenseErrors.title?.[0]}
                                    </FieldError>
                                </Field>
                                <FieldError>
                                    {errors.initial_expense?.[0]}
                                </FieldError>
                            </FieldGroup>
                        )}
                        {current.kind === 'expenses' && !current.detailed && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={formBusy}
                                onClick={useDetailedLines}
                            >
                                Passa alle righe della spesa
                            </Button>
                        )}
                        {((current.kind === 'expenses' && current.detailed) ||
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
                                        : (localOptions.contracts.find(
                                              (contract) =>
                                                  String(contract.id) ===
                                                  current.values.contract_id,
                                          )?.name ??
                                          (String(
                                              current.record?.contract?.id,
                                          ) === current.values.contract_id
                                              ? (current.record?.contract
                                                    ?.name ?? undefined)
                                              : undefined))
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
                                    setCurrent((item) =>
                                        editingInitialExpense &&
                                        item.initialExpense
                                            ? {
                                                  ...item,
                                                  initialExpense: {
                                                      ...item.initialExpense,
                                                      lines,
                                                  },
                                              }
                                            : { ...item, lines },
                                    );
                                }}
                            />
                        )}
                        {current.kind === 'contracts' && (
                            <FieldGroup>
                                <Field
                                    data-invalid={!!errors.notes}
                                    data-disabled={formBusy}
                                >
                                    <FieldLabel
                                        htmlFor={`${formId}-field-notes`}
                                    >
                                        Note
                                    </FieldLabel>
                                    <Textarea
                                        id={`${formId}-field-notes`}
                                        value={current.values.notes}
                                        onChange={(event) =>
                                            change('notes', event.target.value)
                                        }
                                        disabled={formBusy}
                                        aria-invalid={!!errors.notes}
                                        aria-describedby={
                                            errors.notes
                                                ? `${formId}-field-notes-error`
                                                : undefined
                                        }
                                    />
                                    <FieldError
                                        id={`${formId}-field-notes-error`}
                                    >
                                        {errors.notes?.[0]}
                                    </FieldError>
                                </Field>
                            </FieldGroup>
                        )}
                        {current.kind !== 'vendors' &&
                            (current.record ? (
                                <div className="flex min-w-0 flex-col gap-2">
                                    <AttachmentsSection
                                        key={`${current.kind}-${current.record.id}`}
                                        tenant={tenant}
                                        resource={current.kind}
                                        recordId={current.record.id}
                                        id={`${formId}-sheet-attachments`}
                                        disabled={busy}
                                        onBusyChange={setAttachmentsBusy}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Gli allegati sono salvati subito.
                                        Annulla scarta solo le modifiche ai
                                        campi del form.
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Salva l’elemento per aggiungere allegati.
                                </p>
                            ))}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-popover p-4 sm:px-6">
                        {['expenses', 'contracts', 'projects'].includes(
                            current.kind,
                        ) &&
                            current.record && (
                                <div className="mr-auto">
                                    <DeleteRecord
                                        url={`/t/${tenant.slug}/${current.kind}/${current.record.id}`}
                                        label={
                                            current.record.title ??
                                            current.record.display_name ??
                                            current.record.name ??
                                            'questo elemento'
                                        }
                                        disabled={formBusy}
                                        onDeleted={() => {
                                            navigation.allow();
                                            router.visit(
                                                current.kind === 'expenses'
                                                    ? contractContext
                                                        ? `/t/${tenant.slug}/contracts/${contractContext.id}`
                                                        : `/t/${tenant.slug}/expenses?year=${economicContext!.year}`
                                                    : `/t/${tenant.slug}/${current.kind}`,
                                            );
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
                        <Button
                            ref={saveButton}
                            disabled={formBusy}
                            type="submit"
                        >
                            {busy && <Spinner />}
                            {busy ? 'Salvataggio…' : 'Salva'}
                        </Button>
                    </div>
                </form>
            </FormSurface>
            <Dialog
                open={creatingRelation !== null}
                onOpenChange={(open) => {
                    if (!open) relationForm.current?.requestClose();
                }}
            >
                <DialogContent
                    className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-3xl"
                    aria-describedby={undefined}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        relationTrigger.current?.focus({ preventScroll: true });
                    }}
                >
                    {creatingRelation && (
                        <>
                            <DialogTitle className="sr-only">
                                Nuovo {singular[creatingRelation.catalog]}
                            </DialogTitle>
                            <EntityForm
                                ref={relationForm}
                                tenant={tenant}
                                kind={creatingRelation.catalog}
                                year={year}
                                options={localOptions}
                                quickCreate
                                onClose={() => setCreatingRelation(null)}
                                onSaved={(record) => {
                                    const { catalog, field } = creatingRelation;
                                    setLocalOptions((previous) => ({
                                        ...previous,
                                        [catalog]: [
                                            ...previous[catalog],
                                            {
                                                id: record.id,
                                                name:
                                                    record.display_name ??
                                                    record.name ??
                                                    '',
                                            },
                                        ],
                                    }));
                                    setCurrent((item) => ({
                                        ...item,
                                        values: {
                                            ...item.values,
                                            [field]: String(record.id),
                                            title:
                                                catalog === 'contracts' &&
                                                !item.values.title
                                                    ? (record.name ?? '')
                                                    : item.values.title,
                                        },
                                        lines:
                                            catalog === 'contracts'
                                                ? item.lines.map((line) =>
                                                      line.description === ''
                                                          ? {
                                                                ...line,
                                                                description:
                                                                    record.name ??
                                                                    '',
                                                            }
                                                          : line,
                                                  )
                                                : item.lines,
                                    }));
                                    setCreatingRelation(null);
                                }}
                            />
                        </>
                    )}
                </DialogContent>
            </Dialog>
            <AlertDialog
                open={confirmYear !== null}
                onOpenChange={(open) => !open && setConfirmYear(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Anno di lavoro del contratto
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Il contratto inizia nel {confirmYear}, ma stai
                            lavorando nel {economicContext!.year}. Vuoi salvare
                            e passare al {confirmYear}?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                            variant="outline"
                            onClick={() => void save()}
                        >
                            Salva restando nel {economicContext!.year}
                        </AlertDialogAction>
                        <AlertDialogAction
                            onClick={() => void save(confirmYear!)}
                        >
                            Salva e passa al {confirmYear}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog
                open={discard || navigation.pending !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDiscard(false);
                        navigation.cancel();
                    }
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
                                if (navigation.pending) navigation.confirm();
                                else close();
                                setDiscard(false);
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

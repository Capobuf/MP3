import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DateField } from './date-field';

export function periodYear(
    values: Record<string, string>,
    preferStart = false,
): string {
    const start = values.period_starts_on;
    const end = values.period_ends_on;
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') ||
        !/^\d{4}-\d{2}-\d{2}$/.test(end ?? '') ||
        end < start
    )
        return values.year;
    const first = start.slice(0, 4);
    const last = end.slice(0, 4);
    return !preferStart && [first, last].includes(values.year)
        ? values.year
        : first;
}

export function periodCrossesYears(values: {
    period_starts_on?: string | null;
    period_ends_on?: string | null;
}): boolean {
    const start = values.period_starts_on ?? '';
    const end = values.period_ends_on ?? '';
    return (
        /^\d{4}-\d{2}-\d{2}$/.test(start) &&
        /^\d{4}-\d{2}-\d{2}$/.test(end) &&
        end >= start &&
        start.slice(0, 4) !== end.slice(0, 4)
    );
}

export function ExpensePeriodFields({
    values,
    onChange,
    disabled,
    errors,
    showPeriod,
    idPrefix = 'entity',
    yearLabel = 'Anno di imputazione economica',
    compact = false,
}: {
    values: Record<string, string>;
    onChange: (key: string, value: string) => void;
    disabled: boolean;
    errors: Record<string, string[]>;
    showPeriod: boolean;
    idPrefix?: string;
    yearLabel?: string;
    compact?: boolean;
}) {
    const first = values.period_starts_on?.slice(0, 4);
    const last = values.period_ends_on?.slice(0, 4);
    const multipleYears = periodCrossesYears(values);
    return (
        <>
            {showPeriod &&
                (['period_starts_on', 'period_ends_on'] as const).map((key) => (
                    <Field
                        key={key}
                        className="min-w-0 gap-2"
                        data-invalid={!!errors[key]}
                        data-disabled={disabled}
                    >
                        <FieldLabel htmlFor={`${idPrefix}-${key}`}>
                            {key === 'period_starts_on'
                                ? 'Inizio periodo della spesa'
                                : 'Fine periodo della spesa'}
                        </FieldLabel>
                        <DateField
                            id={`${idPrefix}-${key}`}
                            value={values[key] ?? ''}
                            onChange={(value) => onChange(key, value)}
                            disabled={disabled}
                            aria-invalid={!!errors[key]}
                            aria-describedby={
                                errors[key]
                                    ? `${idPrefix}-${key}-error`
                                    : undefined
                            }
                        />
                        <FieldError id={`${idPrefix}-${key}-error`}>
                            {errors[key]?.[0]}
                        </FieldError>
                    </Field>
                ))}
            {multipleYears && (
                <Field
                    className="min-w-0 gap-2"
                    data-invalid={!!errors.year}
                    data-disabled={disabled}
                >
                    <FieldLabel
                        className={compact ? 'sr-only' : undefined}
                        id={`${idPrefix}-year-label`}
                    >
                        {yearLabel}
                    </FieldLabel>
                    <ToggleGroup
                        type="single"
                        variant="outline"
                        value={values.year}
                        onValueChange={(value) => {
                            if (value) onChange('year', value);
                        }}
                        disabled={disabled}
                        aria-labelledby={`${idPrefix}-year-label`}
                        aria-invalid={!!errors.year}
                        aria-describedby={
                            errors.year
                                ? `${idPrefix}-year-error`
                                : `${idPrefix}-year-description`
                        }
                    >
                        <ToggleGroupItem
                            value={first}
                            aria-label={`Anno iniziale · ${first}`}
                        >
                            {compact ? first : `Anno iniziale · ${first}`}
                        </ToggleGroupItem>
                        <ToggleGroupItem
                            value={last}
                            aria-label={`Anno finale · ${last}`}
                        >
                            {compact ? last : `Anno finale · ${last}`}
                        </ToggleGroupItem>
                    </ToggleGroup>
                    <p
                        id={`${idPrefix}-year-description`}
                        className="text-sm text-muted-foreground"
                        role="status"
                    >
                        {compact
                            ? `Imputato al ${values.year}`
                            : `Importo interamente imputato al ${values.year}.`}
                    </p>
                    <FieldError id={`${idPrefix}-year-error`}>
                        {errors.year?.[0]}
                    </FieldError>
                </Field>
            )}
            {!multipleYears && errors.year && (
                <FieldError>{errors.year[0]}</FieldError>
            )}
        </>
    );
}

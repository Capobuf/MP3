import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
    const validPeriod =
        /^\d{4}-\d{2}-\d{2}$/.test(values.period_starts_on ?? '') &&
        /^\d{4}-\d{2}-\d{2}$/.test(values.period_ends_on ?? '') &&
        values.period_ends_on >= values.period_starts_on;
    const multipleYears = validPeriod && first !== last;
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
            <Field
                className="min-w-0 gap-2"
                data-invalid={!!errors.year}
                data-disabled={disabled}
            >
                <FieldLabel
                    className={compact ? 'sr-only' : undefined}
                    id={`${idPrefix}-year-label`}
                    htmlFor={multipleYears ? undefined : `${idPrefix}-year`}
                >
                    {yearLabel}
                </FieldLabel>
                {multipleYears ? (
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
                ) : (
                    <Input
                        id={`${idPrefix}-year`}
                        type="number"
                        min={2000}
                        max={2100}
                        required
                        value={values.year}
                        onChange={(event) =>
                            onChange('year', event.target.value)
                        }
                        readOnly={validPeriod}
                        disabled={disabled}
                        aria-invalid={!!errors.year}
                        aria-describedby={
                            errors.year
                                ? `${idPrefix}-year-error`
                                : validPeriod
                                  ? `${idPrefix}-year-description`
                                  : undefined
                        }
                    />
                )}
                {validPeriod && (
                    <p
                        id={`${idPrefix}-year-description`}
                        className="text-sm text-muted-foreground"
                        role="status"
                    >
                        {compact
                            ? `Imputato al ${values.year}`
                            : `Importo interamente imputato al ${values.year}${multipleYears ? '.' : ' (anno del periodo).'}`}
                    </p>
                )}
                <FieldError id={`${idPrefix}-year-error`}>
                    {errors.year?.[0]}
                </FieldError>
            </Field>
        </>
    );
}

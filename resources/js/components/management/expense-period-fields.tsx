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
    if (!start || !end || end < start) return values.year;
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
}: {
    values: Record<string, string>;
    onChange: (key: string, value: string) => void;
    disabled: boolean;
    errors: Record<string, string[]>;
    showPeriod: boolean;
}) {
    const first = values.period_starts_on?.slice(0, 4);
    const last = values.period_ends_on?.slice(0, 4);
    const validPeriod =
        !!first && !!last && values.period_ends_on >= values.period_starts_on;
    const multipleYears = validPeriod && first !== last;
    return (
        <>
            {showPeriod &&
                (['period_starts_on', 'period_ends_on'] as const).map((key) => (
                    <Field
                        key={key}
                        data-invalid={!!errors[key]}
                        data-disabled={disabled}
                    >
                        <FieldLabel htmlFor={`entity-${key}`}>
                            {key === 'period_starts_on'
                                ? 'Inizio periodo della spesa'
                                : 'Fine periodo della spesa'}
                        </FieldLabel>
                        <DateField
                            id={`entity-${key}`}
                            value={values[key] ?? ''}
                            onChange={(value) => onChange(key, value)}
                            disabled={disabled}
                            aria-invalid={!!errors[key]}
                            aria-describedby={
                                errors[key] ? `entity-${key}-error` : undefined
                            }
                        />
                        <FieldError id={`entity-${key}-error`}>
                            {errors[key]?.[0]}
                        </FieldError>
                    </Field>
                ))}
            <Field data-invalid={!!errors.year} data-disabled={disabled}>
                <FieldLabel
                    id="expense-year-label"
                    htmlFor={multipleYears ? undefined : 'entity-year'}
                >
                    Anno di imputazione economica
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
                        aria-labelledby="expense-year-label"
                        aria-invalid={!!errors.year}
                        aria-describedby={
                            errors.year
                                ? 'expense-year-error'
                                : 'expense-year-description'
                        }
                    >
                        <ToggleGroupItem value={first}>
                            Anno iniziale · {first}
                        </ToggleGroupItem>
                        <ToggleGroupItem value={last}>
                            Anno finale · {last}
                        </ToggleGroupItem>
                    </ToggleGroup>
                ) : (
                    <Input
                        id="entity-year"
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
                                ? 'expense-year-error'
                                : validPeriod
                                  ? 'expense-year-description'
                                  : undefined
                        }
                    />
                )}
                {validPeriod && (
                    <p
                        id="expense-year-description"
                        className="text-sm text-muted-foreground"
                        role="status"
                    >
                        Importo interamente imputato al {values.year}
                        {multipleYears ? '.' : ' (anno del periodo).'}{' '}
                    </p>
                )}
                <FieldError id="expense-year-error">
                    {errors.year?.[0]}
                </FieldError>
            </Field>
        </>
    );
}

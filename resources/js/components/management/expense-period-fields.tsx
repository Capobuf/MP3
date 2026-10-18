import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { DateField } from './date-field';

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
                    htmlFor={`${idPrefix}-year`}
                >
                    {yearLabel}
                </FieldLabel>
                <Input
                    type="number"
                    min={2000}
                    max={2100}
                    required
                    id={`${idPrefix}-year`}
                    value={values.year}
                    onChange={(event) => onChange('year', event.target.value)}
                    disabled={disabled}
                    aria-labelledby={`${idPrefix}-year-label`}
                    aria-invalid={!!errors.year}
                    aria-describedby={
                        errors.year
                            ? `${idPrefix}-year-error`
                            : compact
                              ? undefined
                              : `${idPrefix}-year-description`
                    }
                />
                {!compact && (
                    <p
                        id={`${idPrefix}-year-description`}
                        className="text-sm text-muted-foreground"
                        role="status"
                    >
                        {`Importo interamente imputato al ${values.year}.`}
                    </p>
                )}
                <FieldError id={`${idPrefix}-year-error`}>
                    {errors.year?.[0]}
                </FieldError>
            </Field>
        </>
    );
}

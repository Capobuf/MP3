import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AriaAttributes } from 'react';
import { Calendar } from '@/components/ui/calendar';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from '@/components/ui/input-group';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

function normalizeDate(value: string): string | null {
    const text = value.trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const compact = text.match(/^(\d{2})(\d{2})(\d{4})$/);
    const separated = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    const parts = iso
        ? [iso[1], iso[2], iso[3]]
        : compact
          ? [compact[3], compact[2], compact[1]]
          : separated
            ? [separated[3], separated[2], separated[1]]
            : null;
    if (!parts) return null;
    const [year, month, day] = parts.map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    if (
        year < 1 ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    )
        return null;
    return `${parts[0]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function DateField({
    id,
    value,
    onChange,
    disabled,
    ...aria
}: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
} & Pick<AriaAttributes, 'aria-invalid' | 'aria-describedby' | 'aria-label'>) {
    const [open, setOpen] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const normalized = normalizeDate(value);
    const selected = normalized ? parseISO(normalized) : undefined;
    const display = normalized
        ? `${normalized.slice(8, 10)}/${normalized.slice(5, 7)}/${normalized.slice(0, 4)}`
        : value;
    const invalid = value !== '' && !normalized;
    return (
        <InputGroup data-disabled={disabled}>
            <InputGroupInput
                {...aria}
                id={id}
                ref={(element) => {
                    input.current = element;
                    element?.setCustomValidity(
                        invalid
                            ? 'Inserisci una data valida nel formato GG/MM/AAAA o GGMMAAAA.'
                            : '',
                    );
                }}
                aria-invalid={aria['aria-invalid'] || invalid}
                className="min-w-0 tabular-nums"
                type="text"
                inputMode="numeric"
                placeholder="GG/MM/AAAA"
                maxLength={10}
                value={display}
                onChange={(event) =>
                    onChange(
                        normalizeDate(event.target.value) ?? event.target.value,
                    )
                }
                onBlur={() => {
                    if (normalized && normalized !== value)
                        onChange(normalized);
                }}
                disabled={disabled}
            />
            <InputGroupAddon align="inline-end">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <InputGroupButton
                            size="icon-xs"
                            aria-label="Apri calendario"
                            disabled={disabled}
                        >
                            <CalendarIcon />
                        </InputGroupButton>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-auto p-0"
                        align="end"
                        onCloseAutoFocus={(event) => {
                            event.preventDefault();
                            input.current?.focus();
                        }}
                    >
                        <Calendar
                            mode="single"
                            locale={it}
                            captionLayout="dropdown"
                            startMonth={new Date(1900, 0)}
                            endMonth={new Date(2100, 11)}
                            formatters={{
                                formatMonthDropdown: (date) =>
                                    format(date, 'MMM', { locale: it }),
                            }}
                            selected={selected}
                            defaultMonth={selected}
                            onSelect={(date) => {
                                onChange(
                                    date ? format(date, 'yyyy-MM-dd') : '',
                                );
                                setOpen(false);
                            }}
                        />
                    </PopoverContent>
                </Popover>
            </InputGroupAddon>
        </InputGroup>
    );
}

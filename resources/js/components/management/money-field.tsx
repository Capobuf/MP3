import type { ComponentProps } from 'react';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    InputGroupText,
} from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const amount = new Intl.NumberFormat('it-IT', {
    useGrouping: 'always',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function EuroAddon() {
    return (
        <InputGroupAddon align="inline-end" className="gap-0 self-stretch p-0">
            <Separator orientation="vertical" />
            <InputGroupText className="px-2">€</InputGroupText>
        </InputGroupAddon>
    );
}

export function MoneyField({
    className,
    onChange,
    ...props
}: Omit<ComponentProps<'input'>, 'onChange'> & {
    onChange?: (value: string) => void;
}) {
    return (
        <InputGroup data-disabled={props.disabled}>
            <InputGroupInput
                type="text"
                inputMode="decimal"
                {...props}
                onChange={(event) =>
                    onChange?.(event.target.value.replace(/€/g, '').trim())
                }
                className={cn(
                    'min-w-0 text-right font-medium tracking-normal tabular-nums',
                    className,
                )}
            />
            <EuroAddon />
        </InputGroup>
    );
}

export function MoneyOutput({
    value,
    label,
}: {
    value: string | number | null;
    label: string;
}) {
    return (
        <InputGroup>
            <output
                aria-label={label}
                className="flex h-full min-w-0 flex-1 items-center justify-end px-2 text-right font-medium tracking-normal tabular-nums"
            >
                {value === null
                    ? 'Da completare'
                    : amount.format(Number(value))}
            </output>
            <EuroAddon />
        </InputGroup>
    );
}

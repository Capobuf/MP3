import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { projectStatusLabel } from './types';
import type { ProjectStatus } from './types';

export function ProjectStatusSelect({
    id,
    statuses,
    value,
    onChange,
    onCancel,
    disabled,
    invalid,
    describedBy,
    autoFocus = false,
}: {
    id?: string;
    statuses: ProjectStatus[];
    value?: string;
    onChange: (value: string) => void;
    onCancel?: () => void;
    disabled?: boolean;
    invalid?: boolean;
    describedBy?: string;
    autoFocus?: boolean;
}) {
    const [open, setOpen] = useState(autoFocus);
    const choose = (next: string) => {
        onChange(next);
        setOpen(false);
    };
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-label="Stato del progetto"
                    aria-expanded={open}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    disabled={disabled}
                    className="w-full min-w-0 justify-between"
                >
                    <span className="truncate">
                        {value === undefined
                            ? 'Seleziona uno stato'
                            : projectStatusLabel(value, statuses)}
                    </span>
                    <ChevronsUpDown data-icon="inline-end" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-80 max-w-[90vw] p-0"
                onEscapeKeyDown={(event) => {
                    if (onCancel) {
                        event.preventDefault();
                        setOpen(false);
                        onCancel();
                    }
                }}
            >
                <Command>
                    <CommandInput placeholder="Cerca uno stato…" />
                    <CommandList>
                        <CommandEmpty>Nessuno stato trovato.</CommandEmpty>
                        <CommandGroup>
                            {[
                                { key: '', name: 'Nessuno stato' },
                                ...statuses,
                            ].map((status) => (
                                <CommandItem
                                    key={status.key}
                                    value={status.name}
                                    disabled={disabled}
                                    onSelect={() => choose(status.key)}
                                >
                                    <Check
                                        className={cn(
                                            value !== status.key && 'opacity-0',
                                        )}
                                        aria-hidden="true"
                                    />
                                    {status.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

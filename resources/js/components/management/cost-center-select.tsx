import { defaultFilter } from 'cmdk';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
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
import { costCenterLabel, CostCenterTags } from './cost-center-tags';
import type { CostCenter } from './types';

export function CostCenterSelect({
    id,
    options,
    value,
    onChange,
    onCreate,
    disabled,
    invalid,
    describedBy,
}: {
    id: string;
    options: CostCenter[];
    value: number[];
    onChange: (value: number[]) => void;
    onCreate: (name: string) => void;
    disabled?: boolean;
    invalid?: boolean;
    describedBy?: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const query = search.trim();
    const results = options.filter(
        (center) => !query || defaultFilter(costCenterLabel(center), query) > 0,
    );
    const selected = options.filter((option) => value.includes(option.id));
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        aria-label="Seleziona Centri di Costo"
                        aria-expanded={open}
                        aria-invalid={invalid}
                        aria-describedby={describedBy}
                        className="w-full justify-between"
                    >
                        {value.length
                            ? `${value.length} selezionati`
                            : 'Seleziona Centri di Costo'}
                        <ChevronsUpDown data-icon="inline-end" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 max-w-[90vw] p-0" align="start">
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder="Cerca un Centro di Costo…"
                            value={search}
                            onValueChange={setSearch}
                        />
                        <CommandList>
                            <CommandEmpty>
                                Nessun Centro di Costo trovato.
                            </CommandEmpty>
                            <CommandGroup heading="Centri di Costo">
                                {results.map((center) => (
                                    <CommandItem
                                        key={center.id}
                                        value={`${costCenterLabel(center)} ${center.id}`}
                                        onSelect={() =>
                                            onChange(
                                                value.includes(center.id)
                                                    ? value.filter(
                                                          (id) =>
                                                              id !== center.id,
                                                      )
                                                    : [...value, center.id],
                                            )
                                        }
                                    >
                                        <Check
                                            aria-hidden="true"
                                            className={cn(
                                                value.includes(center.id)
                                                    ? 'opacity-100'
                                                    : 'opacity-0',
                                            )}
                                        />
                                        <span className="min-w-0 break-words whitespace-normal">
                                            {costCenterLabel(center)}
                                        </span>
                                        <span className="sr-only">
                                            {value.includes(center.id)
                                                ? 'Selezionato'
                                                : 'Non selezionato'}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                            {query && results.length === 0 && (
                                <CommandGroup heading="Nessun Centro di Costo trovato">
                                    <CommandItem
                                        value={`create-${query}`}
                                        disabled={disabled}
                                        onSelect={() => {
                                            setOpen(false);
                                            setSearch('');
                                            onCreate(query);
                                        }}
                                    >
                                        <Plus aria-hidden="true" />
                                        <span className="min-w-0 break-words whitespace-normal">
                                            Crea “{query}”
                                        </span>
                                    </CommandItem>
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            <CostCenterTags centers={selected} />
            {value.length > 0 && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    disabled={disabled}
                    onClick={() => onChange([])}
                >
                    Rimuovi tutti i Centri di Costo
                </Button>
            )}
        </div>
    );
}

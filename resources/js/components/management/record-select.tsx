import { Check, ChevronsUpDown } from 'lucide-react';
import type { AriaAttributes } from 'react';
import { useDelayedBusy } from '@/hooks/use-delayed-busy';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Command,
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
import { Skeleton } from '@/components/ui/skeleton';
import { api } from './helpers';
import type { Catalog, Option } from './types';

export function RecordSelect({
    id,
    slug,
    catalog,
    value,
    onChange,
    options,
    label,
    includeNone = false,
    disabled = false,
    ...aria
}: {
    id?: string;
    slug: string;
    catalog: Catalog;
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    label: string;
    includeNone?: boolean;
    disabled?: boolean;
} & Pick<AriaAttributes, 'aria-invalid' | 'aria-describedby'>) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Option[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const showLoading = useDelayedBusy(loading);
    const [chosen, setChosen] = useState<Option | null>(null);
    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoading(true);
        setError('');
        const timer = setTimeout(() => {
            void api<{ records: Option[] }>(
                `/t/${slug}/${catalog}/options?search=${encodeURIComponent(search)}`,
            )
                .then((data) => {
                    if (active) setResults(data.records);
                })
                .catch(() => {
                    if (active)
                        setError('Ricerca non riuscita. Chiudi e riprova.');
                })
                .finally(() => {
                    if (active) setLoading(false);
                });
        }, 200);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [search, open, slug, catalog]);
    const allOptions = [...options, ...results, ...(chosen ? [chosen] : [])];
    const selected = allOptions.find((option) => String(option.id) === value);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    {...aria}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    role="combobox"
                    aria-label={label}
                    aria-expanded={open}
                    className="w-full min-w-0 justify-between font-normal"
                >
                    <span className="truncate">
                        {selected?.name ??
                            (value === 'none'
                                ? 'Senza collegamento'
                                : value
                                  ? `Elemento #${value}`
                                  : label)}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[320px] max-w-[90vw] p-0"
                align="start"
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Cerca per nome…"
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList aria-busy={loading}>
                        {showLoading && results.length === 0 && (
                            <div
                                className="flex flex-col gap-2 p-3"
                                role="status"
                            >
                                <span className="sr-only">
                                    Ricerca in corso…
                                </span>
                                <Skeleton className="h-8" />
                                <Skeleton className="h-8" />
                                <Skeleton className="h-8" />
                            </div>
                        )}
                        {showLoading && results.length > 0 && (
                            <p
                                role="status"
                                className="px-3 py-2 text-sm text-muted-foreground"
                            >
                                Aggiornamento risultati…
                            </p>
                        )}
                        {error && (
                            <p
                                role="alert"
                                className="p-3 text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}
                        <CommandGroup>
                            <CommandItem
                                onSelect={() => {
                                    onChange('');
                                    setOpen(false);
                                }}
                            >
                                Nessuno / tutti
                            </CommandItem>
                            {includeNone && (
                                <CommandItem
                                    onSelect={() => {
                                        onChange('none');
                                        setOpen(false);
                                    }}
                                >
                                    Solo senza collegamento
                                </CommandItem>
                            )}
                            {!loading && !error && results.length === 0 && (
                                <p
                                    role="status"
                                    className="p-3 text-sm text-muted-foreground"
                                >
                                    Nessun risultato.
                                </p>
                            )}
                            {results.map((option) => (
                                <CommandItem
                                    disabled={loading || !!error}
                                    key={option.id}
                                    value={String(option.id)}
                                    onSelect={() => {
                                        setChosen(option);
                                        onChange(String(option.id));
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={`mr-2 size-4 ${value === String(option.id) ? 'opacity-100' : 'opacity-0'}`}
                                    />
                                    <span className="min-w-0 break-words">
                                        {option.name}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

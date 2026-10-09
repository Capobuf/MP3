import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
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
    slug,
    catalog,
    value,
    onChange,
    options,
    label,
    includeNone = false,
    disabled = false,
}: {
    slug: string;
    catalog: Catalog;
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    label: string;
    includeNone?: boolean;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Option[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [chosen, setChosen] = useState<Option | null>(null);
    useEffect(() => {
        if (!open) return;
        let active = true;
        const timer = setTimeout(() => {
            setLoading(true);
            setError('');
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
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    role="combobox"
                    aria-label={label}
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
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
                    <CommandList>
                        {loading && <Skeleton className="m-3 h-8" />}
                        {error && (
                            <p
                                role="alert"
                                className="p-3 text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}
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
                            <CommandEmpty>Nessun risultato.</CommandEmpty>
                        )}
                        {results.map((option) => (
                            <CommandItem
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
                                {option.name}
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

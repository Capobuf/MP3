import type { AriaAttributes } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useDelayedBusy } from '@/hooks/use-delayed-busy';
import {
    Combobox,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from '@/components/ui/combobox';
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
    excludeProjectId,
    ...aria
}: {
    id?: string;
    slug: string;
    catalog: Catalog | 'expenses';
    value: string;
    onChange: (value: string) => void;
    options: (Omit<Option, 'name'> & { name: string | null })[];
    label: string;
    includeNone?: boolean;
    disabled?: boolean;
    excludeProjectId?: number;
} & Pick<AriaAttributes, 'aria-invalid' | 'aria-describedby'>) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Option[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const showLoading = useDelayedBusy(loading);
    const [chosen, setChosen] = useState<Option | null>(null);
    const [popupContainer, setPopupContainer] = useState<HTMLElement | null>(
        null,
    );
    const setContainer = useCallback((node: HTMLDivElement | null) => {
        setPopupContainer(
            node?.closest<HTMLElement>('[role="dialog"]') ?? null,
        );
    }, []);
    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoading(true);
        setError('');
        const timer = setTimeout(() => {
            void api<{ records: Option[] }>(
                `/t/${slug}/${catalog}/options?search=${encodeURIComponent(search)}${excludeProjectId ? `&exclude_project_id=${excludeProjectId}` : ''}`,
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
    }, [search, open, slug, catalog, excludeProjectId]);
    const allOptions = [
        ...options.map((option) => ({
            ...option,
            name: option.display_name ?? option.name ?? '',
        })),
        ...results,
        ...(chosen ? [chosen] : []),
    ];
    const itemLabel = (id: string) =>
        id === 'none'
            ? 'Solo senza collegamento'
            : (allOptions.find((option) => String(option.id) === id)?.name ??
              `Elemento #${id}`);
    const items = [
        ...(includeNone ? ['none'] : []),
        ...results.map((option) => String(option.id)),
    ];
    return (
        <div
            ref={setContainer}
            className="w-full min-w-0"
            onKeyDown={(event) => {
                if (
                    (event.key === 'Enter' || event.key === ' ') &&
                    event.target instanceof Element &&
                    event.target.closest('[data-slot="combobox-clear"]')
                )
                    event.stopPropagation();
            }}
        >
            <Combobox
                items={items}
                value={value || null}
                filter={null}
                itemToStringLabel={itemLabel}
                disabled={disabled}
                open={open}
                onOpenChange={(nextOpen, details) => {
                    setOpen(nextOpen);
                    if (nextOpen && details.reason !== 'input-change')
                        setSearch('');
                }}
                onInputValueChange={(nextSearch, details) => {
                    if (details.reason === 'escape-key') {
                        details.cancel();
                        return;
                    }
                    if (details.reason === 'input-change')
                        setSearch(nextSearch);
                }}
                onValueChange={(nextValue, details) => {
                    if (details.reason === 'escape-key') {
                        details.cancel();
                        details.allowPropagation();
                        return;
                    }
                    setChosen(
                        allOptions.find(
                            (option) => String(option.id) === nextValue,
                        ) ?? null,
                    );
                    onChange(nextValue ?? '');
                    if (details.reason !== 'input-clear') {
                        setSearch('');
                        setOpen(false);
                    }
                }}
            >
                <ComboboxInput
                    id={id}
                    {...aria}
                    aria-label={label}
                    placeholder={label}
                    disabled={disabled}
                    className="w-full min-w-0"
                    showClear
                />
                <ComboboxContent container={popupContainer ?? undefined}>
                    {showLoading && results.length === 0 && (
                        <div className="flex flex-col gap-2 p-3" role="status">
                            <span className="sr-only">Ricerca in corso…</span>
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
                    {!loading && !error && results.length === 0 && (
                        <p
                            role="status"
                            className="p-3 text-sm text-muted-foreground"
                        >
                            Nessun risultato.
                        </p>
                    )}
                    <ComboboxList aria-busy={loading}>
                        {(item: string) => (
                            <ComboboxItem
                                key={item}
                                value={item}
                                disabled={
                                    item !== 'none' && (loading || !!error)
                                }
                            >
                                <span className="min-w-0 break-words">
                                    {itemLabel(item)}
                                </span>
                            </ComboboxItem>
                        )}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>
        </div>
    );
}

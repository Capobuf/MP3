import { defaultFilter } from 'cmdk';
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import {
    Combobox,
    ComboboxChip,
    ComboboxChips,
    ComboboxChipsInput,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxItem,
    ComboboxList,
    ComboboxValue,
    useComboboxAnchor,
} from '@/components/ui/combobox';
import { costCenterLabel } from './cost-center-tags';
import type { CostCenter } from './types';

type CenterValue = number | 'create';

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
    onCreate?: (name: string) => void;
    disabled?: boolean;
    invalid?: boolean;
    describedBy?: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const anchor = useComboboxAnchor();
    const [popupContainer, setPopupContainer] = useState<HTMLElement | null>(
        null,
    );
    const setContainer = useCallback((node: HTMLDivElement | null) => {
        setPopupContainer(
            node?.closest<HTMLElement>('[role="dialog"]') ?? null,
        );
    }, []);
    const query = search.trim();
    const results = options.filter(
        (center) => !query || defaultFilter(costCenterLabel(center), query) > 0,
    );
    const items: CenterValue[] = results.map((center) => center.id);
    if (onCreate && query && results.length === 0) items.push('create');
    const label = (item: CenterValue) => {
        if (item === 'create') return `Crea “${query}”`;
        const center = options.find((option) => option.id === item);
        return center ? costCenterLabel(center) : `Centro #${item}`;
    };
    return (
        <div
            ref={setContainer}
            className="w-full min-w-0"
            onKeyDown={(event) => {
                if (
                    (event.key === 'Enter' || event.key === ' ') &&
                    event.target instanceof Element &&
                    event.target.closest('[data-slot="combobox-chip-remove"]')
                )
                    event.stopPropagation();
            }}
        >
            <Combobox<CenterValue, true>
                multiple
                items={items}
                value={value}
                inputValue={search}
                filter={null}
                itemToStringLabel={label}
                disabled={disabled}
                open={open}
                onOpenChange={(nextOpen, details) => {
                    setOpen(nextOpen);
                    if (details.reason === 'escape-key')
                        details.allowPropagation();
                }}
                onInputValueChange={(nextSearch, details) => {
                    if (details.reason === 'escape-key') details.cancel();
                    else setSearch(nextSearch);
                }}
                onValueChange={(next, details) => {
                    if (details.reason === 'escape-key') {
                        details.cancel();
                        details.allowPropagation();
                        return;
                    }
                    if (next.includes('create')) {
                        setOpen(false);
                        setSearch('');
                        onCreate?.(query);
                        return;
                    }
                    onChange(
                        next.filter(
                            (item): item is number => typeof item === 'number',
                        ),
                    );
                    setSearch('');
                }}
            >
                <ComboboxChips ref={anchor} className="w-full min-w-0">
                    <ComboboxValue>
                        {value.map((item) => (
                            <ComboboxChip
                                key={item}
                                className="max-w-full"
                                removeLabel={`Rimuovi ${label(item)} dalla selezione`}
                            >
                                <span className="truncate" title={label(item)}>
                                    {label(item)}
                                </span>
                            </ComboboxChip>
                        ))}
                    </ComboboxValue>
                    <ComboboxChipsInput
                        id={id}
                        aria-label="Seleziona Centri di Costo"
                        aria-invalid={invalid}
                        aria-describedby={describedBy}
                        placeholder="Cerca un Centro di Costo…"
                        className="text-sm"
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                                event.preventBaseUIHandler();
                                setOpen(false);
                            }
                        }}
                    />
                </ComboboxChips>
                <ComboboxContent
                    anchor={anchor}
                    container={popupContainer ?? undefined}
                >
                    <ComboboxEmpty>
                        Nessun Centro di Costo trovato.
                    </ComboboxEmpty>
                    <ComboboxList>
                        {(item: CenterValue) => (
                            <ComboboxItem key={item} value={item}>
                                {item === 'create' && (
                                    <Plus aria-hidden="true" />
                                )}
                                <span className="min-w-0 break-words whitespace-normal">
                                    {label(item)}
                                </span>
                            </ComboboxItem>
                        )}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>
        </div>
    );
}

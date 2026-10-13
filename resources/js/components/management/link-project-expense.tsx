import { router } from '@inertiajs/react';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Combobox,
    ComboboxChip,
    ComboboxChips,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxValue,
    useComboboxAnchor,
} from '@/components/ui/combobox';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroupAddon } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { api } from './helpers';
import type { Option, RecordData } from './types';

export function LinkProjectExpense({
    slug,
    project,
    open,
    onOpenChange,
    onCloseAutoFocus,
}: {
    slug: string;
    project: RecordData;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCloseAutoFocus: (event: Event) => void;
}) {
    const [selected, setSelected] = useState<Option[]>([]);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Option[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const dialogRef = useRef<HTMLDivElement>(null);
    const anchor = useComboboxAnchor();

    useEffect(() => {
        if (!open) return;
        let active = true;
        setLoading(true);
        setSearchError('');
        const timer = setTimeout(() => {
            void api<{ records: Option[] }>(
                `/t/${slug}/expenses/options?search=${encodeURIComponent(search)}&exclude_project_id=${project.id}`,
            )
                .then((data) => {
                    if (active) setResults(data.records);
                })
                .catch((error) => {
                    if (active) {
                        setResults([]);
                        setSearchError(
                            error instanceof Error
                                ? error.message
                                : 'Ricerca non riuscita.',
                        );
                    }
                })
                .finally(() => {
                    if (active) setLoading(false);
                });
        }, 200);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [open, search, slug, project.id]);

    function close() {
        onOpenChange(false);
        setSelected([]);
        setSearch('');
        setResults([]);
        setError('');
        setSearchError('');
    }

    async function link() {
        if (!selected.length || busy) return;
        setBusy(true);
        setError('');
        try {
            await api(`/t/${slug}/expenses/batch`, 'PATCH', {
                updates: selected.map((expense) => ({
                    id: expense.id,
                    project_id: project.id,
                })),
            });
            toast.success(
                selected.length === 1
                    ? 'Spesa collegata al progetto.'
                    : `${selected.length} spese collegate al progetto.`,
            );
            router.reload({
                onFinish: () => {
                    setBusy(false);
                    close();
                },
            });
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : 'Collegamento non riuscito.',
            );
            setBusy(false);
        }
    }

    const items = [
        ...selected,
        ...results.filter(
            (result) => !selected.some((item) => item.id === result.id),
        ),
    ];

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (busy) return;
                if (next) onOpenChange(true);
                else close();
            }}
        >
            <DialogContent
                ref={dialogRef}
                aria-describedby={undefined}
                onCloseAutoFocus={onCloseAutoFocus}
            >
                <DialogHeader>
                    <DialogTitle>Collega spese esistenti</DialogTitle>
                </DialogHeader>
                <FieldGroup>
                    <Field data-disabled={busy}>
                        <FieldLabel htmlFor="link-project-expense">
                            Spese
                        </FieldLabel>
                        <Combobox
                            items={items}
                            multiple
                            value={selected}
                            inputValue={search}
                            filter={null}
                            itemToStringLabel={(item) => item.name}
                            isItemEqualToValue={(item, value) =>
                                item.id === value.id
                            }
                            disabled={busy}
                            onInputValueChange={setSearch}
                            onValueChange={(value) => {
                                setSelected(value);
                                setSearch('');
                                setError('');
                            }}
                        >
                            <div
                                ref={anchor}
                                className="flex min-w-0 flex-col gap-2"
                            >
                                {selected.length > 0 && (
                                    <ComboboxChips
                                        aria-label="Spese selezionate"
                                        className="max-h-40 overflow-y-auto"
                                    >
                                        <ComboboxValue>
                                            {selected.map((item) => (
                                                <ComboboxChip
                                                    key={item.id}
                                                    className="max-w-full"
                                                    removeLabel={`Rimuovi ${item.name} dalla selezione`}
                                                >
                                                    <span
                                                        className="truncate"
                                                        title={item.name}
                                                    >
                                                        {item.name}
                                                    </span>
                                                </ComboboxChip>
                                            ))}
                                        </ComboboxValue>
                                    </ComboboxChips>
                                )}
                                <ComboboxInput
                                    id="link-project-expense"
                                    className="w-full"
                                    placeholder="Cerca e seleziona spese…"
                                    showClear
                                    disabled={busy}
                                >
                                    <InputGroupAddon>
                                        <Search />
                                    </InputGroupAddon>
                                </ComboboxInput>
                            </div>
                            <ComboboxContent
                                anchor={anchor}
                                container={dialogRef}
                            >
                                {loading && (
                                    <p
                                        role="status"
                                        className="p-3 text-sm text-muted-foreground"
                                    >
                                        Ricerca in corso…
                                    </p>
                                )}
                                {searchError && (
                                    <p
                                        role="alert"
                                        className="p-3 text-sm text-destructive"
                                    >
                                        {searchError}
                                    </p>
                                )}
                                {!loading && !searchError && (
                                    <ComboboxEmpty>
                                        Nessuna spesa trovata.
                                    </ComboboxEmpty>
                                )}
                                <ComboboxList aria-busy={loading}>
                                    {(item: Option) => (
                                        <ComboboxItem
                                            key={item.id}
                                            value={item}
                                            disabled={loading || busy}
                                        >
                                            <span className="min-w-0 break-words">
                                                {item.name}
                                            </span>
                                        </ComboboxItem>
                                    )}
                                </ComboboxList>
                            </ComboboxContent>
                        </Combobox>
                    </Field>
                </FieldGroup>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={close}>
                        Annulla
                    </Button>
                    <Button
                        disabled={busy || !selected.length}
                        onClick={() => void link()}
                    >
                        {busy && <Spinner data-icon="inline-start" />}
                        {selected.length > 1
                            ? `Collega ${selected.length} spese`
                            : 'Collega spesa'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

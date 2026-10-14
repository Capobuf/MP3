import { router } from '@inertiajs/react';
import { DismissableLayer } from '@radix-ui/react-dismissable-layer';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Field, FieldError } from '@/components/ui/field';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api } from './helpers';
import { cn } from '@/lib/utils';

export function InlineEdit({
    value,
    label,
    as = 'div',
    display,
    multiline = false,
    type = 'text',
    options,
    choices,
    renderEditor,
    disabled = false,
    activation = 'doubleClick',
    className,
    onSave,
}: {
    value: string | null | undefined;
    label: string;
    as?: 'div' | 'h1';
    display?: ReactNode;
    multiline?: boolean;
    type?: 'text' | 'email' | 'date';
    options?: { value: string; label: string }[];
    choices?: { value: string; label: string }[];
    renderEditor?: (props: {
        value: string;
        onChange: (value: string) => void;
        disabled: boolean;
        invalid: boolean;
        onCancel: () => void;
    }) => ReactNode;
    disabled?: boolean;
    activation?: 'click' | 'doubleClick';
    className?: string;
    onSave: (value: string) => Promise<void>;
}) {
    const Tag = as;
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    const trigger = useRef<HTMLElement>(null);
    const keyboardHint = multiline
        ? 'Ctrl o ⌘ + Invio per salvare · Esc per annullare'
        : 'Invio per salvare · Esc per annullare';
    function start() {
        if (disabled || lock.current) return;
        setDraft(value ?? '');
        setError('');
        setEditing(true);
    }
    function cancel(restoreFocus = true) {
        if (lock.current) return;
        setEditing(false);
        setError('');
        if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
    }
    async function save(nextValue = draft, restoreFocus = true) {
        if (lock.current) return;
        if (nextValue === (value ?? '')) {
            cancel(restoreFocus);
            return;
        }
        lock.current = true;
        setSaving(true);
        setError('');
        try {
            await onSave(nextValue);
            setEditing(false);
            if (restoreFocus)
                requestAnimationFrame(() => trigger.current?.focus());
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Salvataggio non riuscito.',
            );
        } finally {
            lock.current = false;
            setSaving(false);
        }
    }
    return editing ? (
        <DismissableLayer
            asChild
            onPointerDownOutside={() => {
                void save(draft, false);
            }}
        >
            <Field
                data-invalid={!!error}
                data-disabled={saving}
                className={cn('min-w-28', className)}
                onKeyDown={(event) => {
                    if (event.defaultPrevented || event.nativeEvent.isComposing)
                        return;
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        cancel();
                    } else if (
                        event.key === 'Enter' &&
                        (!multiline || event.ctrlKey || event.metaKey)
                    ) {
                        event.preventDefault();
                        void save();
                    }
                }}
            >
                <div className="flex min-w-0 flex-col gap-2 [&>[data-slot=native-select-wrapper]]:w-full">
                    {renderEditor ? (
                        renderEditor({
                            value: draft,
                            onChange: (value) => {
                                setDraft(value);
                                setError('');
                            },
                            disabled: saving,
                            invalid: !!error,
                            onCancel: cancel,
                        })
                    ) : choices ? (
                        <NativeSelect
                            autoFocus
                            value={draft}
                            disabled={saving}
                            aria-label={label}
                            aria-invalid={!!error}
                            onChange={(event) => {
                                setDraft(event.target.value);
                                setError('');
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancel();
                                }
                            }}
                        >
                            {choices.map((choice) => (
                                <NativeSelectOption
                                    key={choice.value}
                                    value={choice.value}
                                >
                                    {choice.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    ) : options ? (
                        <ToggleGroup
                            type="single"
                            variant="outline"
                            value={draft}
                            disabled={saving}
                            aria-label={label}
                            className="flex-wrap"
                            onValueChange={(value) => {
                                if (value) {
                                    setDraft(value);
                                    setError('');
                                }
                            }}
                        >
                            {options.map((option) => (
                                <ToggleGroupItem
                                    key={option.value}
                                    value={option.value}
                                >
                                    {option.label}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    ) : multiline ? (
                        <Textarea
                            autoFocus
                            aria-label={label}
                            aria-description={keyboardHint}
                            title={keyboardHint}
                            aria-invalid={!!error}
                            value={draft}
                            disabled={saving}
                            rows={5}
                            onChange={(event) => {
                                setDraft(event.target.value);
                                setError('');
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancel();
                                }
                                if (
                                    event.key === 'Enter' &&
                                    (event.ctrlKey || event.metaKey)
                                ) {
                                    event.preventDefault();
                                    void save();
                                }
                            }}
                        />
                    ) : (
                        <Input
                            autoFocus
                            type={type}
                            aria-label={label}
                            aria-description={keyboardHint}
                            title={keyboardHint}
                            aria-invalid={!!error}
                            value={draft}
                            disabled={saving}
                            onChange={(event) => {
                                setDraft(event.target.value);
                                setError('');
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancel();
                                }
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void save();
                                }
                            }}
                        />
                    )}
                </div>
                {error && <FieldError role="alert">{error}</FieldError>}
            </Field>
        </DismissableLayer>
    ) : (
        <Tag
            ref={(node) => {
                trigger.current = node;
            }}
            role={as === 'h1' ? undefined : 'button'}
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            aria-label={
                as === 'h1' ? undefined : `Modifica ${label.toLowerCase()}`
            }
            title={`${activation === 'click' ? 'Clic' : 'Doppio clic'} per modificare · Invio o F2 da tastiera`}
            className={cn(
                'min-w-0 touch-manipulation rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                !disabled && 'hover:bg-accent/40',
                !disabled &&
                    (activation === 'click' ? 'cursor-pointer' : 'cursor-text'),
                className,
            )}
            onClick={activation === 'click' ? start : undefined}
            onDoubleClick={activation === 'doubleClick' ? start : undefined}
            onKeyDown={(event) => {
                if (
                    event.key === 'Enter' ||
                    event.key === 'F2' ||
                    event.key === ' '
                ) {
                    event.preventDefault();
                    start();
                }
            }}
        >
            {display ?? (value || 'Da inserire')}
        </Tag>
    );
}

export async function saveInlineRecord(
    url: string,
    data: Record<string, unknown>,
    beforeReload?: () => void,
) {
    await api(url, 'PATCH', data);
    beforeReload?.();
    await new Promise<void>((resolve, reject) => {
        let refreshed = false;
        router.reload({
            onSuccess: () => {
                refreshed = true;
                resolve();
            },
            onFinish: () => {
                if (!refreshed)
                    reject(
                        new Error(
                            'Modifica salvata, ma aggiornamento della pagina non riuscito. Ricarica la pagina.',
                        ),
                    );
            },
            onHttpException: () => false,
            onNetworkError: () => false,
        });
    });
}

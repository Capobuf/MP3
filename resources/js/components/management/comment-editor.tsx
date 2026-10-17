import type { JSONContent } from '@tiptap/react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import {
    Bold,
    Italic,
    Underline,
    List,
    ListOrdered,
    Link,
    Unlink,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Toggle } from '@/components/ui/toggle';
import {
    commentExtensions,
    emptyComment,
    isCommentUrl,
} from './comment-content';

export function CommentEditor({
    content = emptyComment,
    label = 'Nuovo commento',
    submitLabel = 'Pubblica commento',
    busy = false,
    onSave,
    onCancel,
}: {
    content?: JSONContent;
    label?: string;
    submitLabel?: string;
    busy?: boolean;
    onSave: (content: JSONContent) => Promise<void>;
    onCancel?: () => void;
}) {
    const id = useId();
    const [linkOpen, setLinkOpen] = useState(false);
    const [url, setUrl] = useState('');
    const [linkError, setLinkError] = useState('');
    const editor = useEditor({
        extensions: commentExtensions,
        content,
        editorProps: {
            attributes: {
                role: 'textbox',
                'aria-multiline': 'true',
                'aria-label': label,
                class: 'comment-rich-text min-h-28 p-3 outline-none',
            },
        },
    });
    const state = useEditorState({
        editor,
        selector: ({ editor }) => {
            let length = 0;
            editor?.state.doc.descendants((node) => {
                if (node.isText) length += Array.from(node.text ?? '').length;
            });
            return {
                bold: editor?.isActive('bold') ?? false,
                italic: editor?.isActive('italic') ?? false,
                underline: editor?.isActive('underline') ?? false,
                bulletList: editor?.isActive('bulletList') ?? false,
                orderedList: editor?.isActive('orderedList') ?? false,
                link: editor?.isActive('link') ?? false,
                length,
                empty:
                    !editor ||
                    !editor.getText().replace(/[\s\p{Z}\p{C}]/gu, ''),
            };
        },
    });
    useEffect(() => {
        editor?.setEditable(!busy);
    }, [editor, busy]);
    const disabled = busy || !editor;
    return (
        <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
                event.preventDefault();
                if (
                    editor &&
                    !busy &&
                    !linkOpen &&
                    !state?.empty &&
                    (state?.length ?? 0) <= 5000
                )
                    void onSave(editor.getJSON());
            }}
        >
            <FieldGroup>
                <Field>
                    <FieldLabel id={`${id}-label`}>{label}</FieldLabel>
                    <div className="overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
                        <div
                            className="flex flex-wrap items-center gap-1 border-b p-1"
                            role="toolbar"
                            aria-label="Formattazione commento"
                        >
                            <Toggle
                                size="sm"
                                aria-label="Grassetto"
                                title="Grassetto"
                                pressed={state?.bold}
                                disabled={disabled}
                                onPressedChange={() =>
                                    editor?.chain().focus().toggleBold().run()
                                }
                            >
                                <Bold />
                            </Toggle>
                            <Toggle
                                size="sm"
                                aria-label="Corsivo"
                                title="Corsivo"
                                pressed={state?.italic}
                                disabled={disabled}
                                onPressedChange={() =>
                                    editor?.chain().focus().toggleItalic().run()
                                }
                            >
                                <Italic />
                            </Toggle>
                            <Toggle
                                size="sm"
                                aria-label="Sottolineato"
                                title="Sottolineato"
                                pressed={state?.underline}
                                disabled={disabled}
                                onPressedChange={() =>
                                    editor
                                        ?.chain()
                                        .focus()
                                        .toggleUnderline()
                                        .run()
                                }
                            >
                                <Underline />
                            </Toggle>
                            <Separator
                                orientation="vertical"
                                className="mx-1 h-5"
                            />
                            <Toggle
                                size="sm"
                                aria-label="Lista puntata"
                                title="Lista puntata"
                                pressed={state?.bulletList}
                                disabled={disabled}
                                onPressedChange={() =>
                                    editor
                                        ?.chain()
                                        .focus()
                                        .toggleBulletList()
                                        .run()
                                }
                            >
                                <List />
                            </Toggle>
                            <Toggle
                                size="sm"
                                aria-label="Lista numerata"
                                title="Lista numerata"
                                pressed={state?.orderedList}
                                disabled={disabled}
                                onPressedChange={() =>
                                    editor
                                        ?.chain()
                                        .focus()
                                        .toggleOrderedList()
                                        .run()
                                }
                            >
                                <ListOrdered />
                            </Toggle>
                            <Separator
                                orientation="vertical"
                                className="mx-1 h-5"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Inserisci o modifica link"
                                title="Inserisci o modifica link"
                                disabled={disabled}
                                aria-expanded={linkOpen}
                                onClick={() => {
                                    setUrl(
                                        String(
                                            editor?.getAttributes('link')
                                                .href ?? '',
                                        ),
                                    );
                                    setLinkError('');
                                    setLinkOpen(!linkOpen);
                                }}
                            >
                                <Link />
                            </Button>
                            {state?.link && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Rimuovi link"
                                    title="Rimuovi link"
                                    disabled={disabled}
                                    onClick={() =>
                                        editor
                                            ?.chain()
                                            .focus()
                                            .unsetLink()
                                            .run()
                                    }
                                >
                                    <Unlink />
                                </Button>
                            )}
                        </div>
                        <EditorContent editor={editor} />
                    </div>
                    <FieldDescription aria-live="polite">
                        {state?.length ?? 0} / 5.000 caratteri
                    </FieldDescription>
                </Field>
                {linkOpen && (
                    <Field data-invalid={!!linkError}>
                        <FieldLabel htmlFor={`${id}-url`}>
                            URL del link
                        </FieldLabel>
                        <div className="flex flex-wrap gap-2">
                            <Input
                                id={`${id}-url`}
                                type="url"
                                placeholder="https://esempio.it"
                                value={url}
                                disabled={busy}
                                aria-invalid={!!linkError}
                                onChange={(event) => setUrl(event.target.value)}
                                className="min-w-0 flex-1"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                disabled={disabled}
                                onClick={() => {
                                    if (!isCommentUrl(url)) {
                                        setLinkError(
                                            'Inserisci un URL completo con http:// o https://.',
                                        );
                                        return;
                                    }
                                    editor
                                        ?.chain()
                                        .focus()
                                        .extendMarkRange('link')
                                        .setLink({ href: url })
                                        .run();
                                    setLinkOpen(false);
                                    setLinkError('');
                                }}
                            >
                                Applica link
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => setLinkOpen(false)}
                            >
                                Annulla link
                            </Button>
                        </div>
                        {linkError && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {linkError}
                            </p>
                        )}
                    </Field>
                )}
            </FieldGroup>
            <div className="flex flex-wrap justify-end gap-2">
                {onCancel && (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        Annulla
                    </Button>
                )}
                <Button
                    type="submit"
                    disabled={
                        disabled ||
                        state?.empty ||
                        (state?.length ?? 0) > 5000 ||
                        linkOpen
                    }
                >
                    {busy && <Spinner />}
                    {submitLabel}
                </Button>
            </div>
        </form>
    );
}

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { InlineEdit } from './inline-edit';
import { cn } from '@/lib/utils';

export function DetailNotes({
    text,
    title = 'Note',
    onSave,
    disabled,
}: {
    text: string;
    title?: string;
    onSave?: (value: string) => Promise<void>;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Collapsible
            open={open}
            onOpenChange={setOpen}
            className="min-w-0 rounded-xl border bg-card px-5 py-4"
        >
            <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">{title}</h2>
                <CollapsibleTrigger asChild>
                    <Button size="sm" variant="ghost">
                        {open ? 'Riduci' : 'Mostra tutto'}
                        <ChevronDown
                            data-icon="inline-end"
                            className={cn(
                                'transition-transform',
                                open && 'rotate-180',
                            )}
                        />
                    </Button>
                </CollapsibleTrigger>
            </div>
            {onSave ? (
                <InlineEdit
                    value={text}
                    label={title}
                    multiline
                    disabled={disabled}
                    onSave={onSave}
                    className="mt-2"
                    display={
                        <p
                            className={cn(
                                'text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-muted-foreground',
                                !open && 'line-clamp-3',
                            )}
                        >
                            {text || `Aggiungi ${title.toLowerCase()}`}
                        </p>
                    }
                />
            ) : (
                <>
                    {!open && (
                        <p className="mt-2 line-clamp-3 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-muted-foreground">
                            {text}
                        </p>
                    )}
                    <CollapsibleContent className="detail-collapse">
                        <p className="pt-2 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-muted-foreground">
                            {text}
                        </p>
                    </CollapsibleContent>
                </>
            )}
        </Collapsible>
    );
}

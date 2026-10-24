import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

export function CellError({
    id,
    label,
    message,
}: {
    id: string;
    label: string;
    message?: string;
}) {
    if (!message) return null;
    return (
        <>
            <span id={id} className="sr-only">
                {message}
            </span>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-0 right-0"
                        aria-label={`Errore: ${label}`}
                        aria-describedby={id}
                        onKeyDown={(event) => event.stopPropagation()}
                    >
                        <CircleAlert className="text-destructive" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    onKeyDown={(event) => event.stopPropagation()}
                    className="text-sm whitespace-normal"
                    aria-label={`Errore: ${label}`}
                >
                    <p className="font-medium">{label}</p>
                    <p>{message}</p>
                </PopoverContent>
            </Popover>
        </>
    );
}

import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

export function DateField({
    id,
    value,
    onChange,
    disabled,
}: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex gap-2">
            <Input
                id={id}
                type="date"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
            />
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Apri calendario"
                        disabled={disabled}
                    >
                        <CalendarIcon className="size-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        mode="single"
                        locale={it}
                        selected={value ? parseISO(value) : undefined}
                        defaultMonth={value ? parseISO(value) : undefined}
                        onSelect={(date) =>
                            onChange(date ? format(date, 'yyyy-MM-dd') : '')
                        }
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}

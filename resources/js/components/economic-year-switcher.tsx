import { router, usePage } from '@inertiajs/react';
import { CalendarDays, ChevronsUpDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { usePageRefresh } from '@/hooks/use-page-refresh';
import { changeEconomicYear } from '@/lib/economic-year';

export function EconomicYearSwitcher() {
    const { props, url } = usePage();
    const { economicContext: context, currentTenant: tenant } = props;
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const { pending } = usePageRefresh(url.split('?')[0]);

    // History restores Inertia props without a request. Carry that restored year
    // into subsequent tenant visits, including links that omit the parameter.
    useEffect(() => {
        if (!tenant || !context) return;
        return router.on('before', ({ detail }) => {
            const visit = detail.visit;
            if (
                visit.method === 'get' &&
                visit.url.pathname.startsWith(`/t/${tenant.slug}/`) &&
                !visit.url.searchParams.has('year')
            ) {
                visit.url.searchParams.set('year', String(context.year));
            }
        });
    }, [tenant, context]);

    if (!tenant || !context) return null;
    function select(year: number) {
        if (pending) return;
        if (year === context!.year) {
            setOpen(false);
            return;
        }
        changeEconomicYear(year, () => setOpen(false));
    }
    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-10 gap-1 rounded-lg px-1 sm:gap-2 sm:px-2 xl:w-56 xl:justify-start"
                        disabled={pending}
                        aria-busy={pending}
                        aria-label={`Anno di lavoro: ${context.year}. Cambia anno`}
                    >
                        <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg border bg-muted sm:flex">
                            <CalendarDays aria-hidden="true" />
                        </span>
                        <span className="flex flex-1 flex-col items-start">
                            <span className="tabular-nums">{context.year}</span>
                            <span className="hidden text-xs text-muted-foreground lg:block">
                                Anno di lavoro
                            </span>
                        </span>
                        <span className="shrink-0">
                            {pending ? (
                                <Spinner data-icon="inline-end" />
                            ) : (
                                <ChevronsUpDown
                                    data-icon="inline-end"
                                    aria-hidden="true"
                                />
                            )}
                        </span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>Anno di lavoro</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                            value={String(context.year)}
                            onValueChange={(value) => select(Number(value))}
                            className="max-h-64 overflow-y-auto"
                        >
                            {context.years.map((year) => (
                                <DropdownMenuRadioItem
                                    key={year}
                                    value={String(year)}
                                    disabled={pending}
                                    className="tabular-nums data-[state=checked]:bg-accent"
                                >
                                    {year}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                        <DropdownMenuItem
                            disabled={pending}
                            onSelect={() => {
                                setDraft(String(context.year));
                                setError('');
                                setOpen(true);
                            }}
                        >
                            Vai a un altro anno…
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Vai a un altro anno</DialogTitle>
                        <DialogDescription>
                            Scegli un anno dal 2000 al 2100, anche senza dati.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const year = Number(draft);
                            if (
                                !/^\d{4}$/.test(draft) ||
                                !Number.isInteger(year) ||
                                year < 2000 ||
                                year > 2100
                            ) {
                                setError(
                                    'Inserisci un anno intero dal 2000 al 2100.',
                                );
                                return;
                            }
                            // Close before invoking guards so their confirmation dialog receives focus.
                            setOpen(false);
                            select(year);
                        }}
                    >
                        <FieldGroup>
                            <Field data-invalid={!!error}>
                                <FieldLabel htmlFor="economic-year">
                                    Anno
                                </FieldLabel>
                                <Input
                                    id="economic-year"
                                    type="number"
                                    min={2000}
                                    max={2100}
                                    step={1}
                                    required
                                    autoFocus
                                    value={draft}
                                    disabled={pending}
                                    className="tabular-nums"
                                    aria-invalid={!!error}
                                    aria-describedby={
                                        error
                                            ? 'economic-year-error'
                                            : undefined
                                    }
                                    onChange={(event) => {
                                        setDraft(event.target.value);
                                        setError('');
                                    }}
                                />
                                {error && (
                                    <FieldError id="economic-year-error">
                                        {error}
                                    </FieldError>
                                )}
                            </Field>
                        </FieldGroup>
                        <Button type="submit" disabled={pending}>
                            Vai all’anno
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}

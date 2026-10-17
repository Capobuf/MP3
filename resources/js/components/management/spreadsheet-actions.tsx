import { usePage } from '@inertiajs/react';
import {
    Download,
    FileOutput,
    FileSpreadsheet,
    Printer,
    Upload,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataImport } from './data-import';

export function SpreadsheetActions({
    slug,
    resource,
    label,
    filters = {},
    disabled = false,
    exportOnly = false,
    onPrintReport,
}: {
    slug: string;
    resource: string;
    label: string;
    filters?: object;
    disabled?: boolean;
    exportOnly?: boolean;
    onPrintReport?: () => void;
}) {
    const { transferLimits, economicContext } = usePage<{
        transferLimits: { xlsxMaxKb: number; xlsxMaxRows: number };
    }>().props;
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const path = `/t/${slug}/${resource}`;
    const query = new URLSearchParams(
        Object.entries(filters)
            .filter(
                ([, value]) =>
                    value !== undefined && value !== null && value !== '',
            )
            .map(([key, value]) => [key, String(value)]),
    );
    if (
        economicContext &&
        ['expenses', 'budget', 'contracts', 'projects'].includes(resource)
    ) {
        query.set('year', String(economicContext.year));
    }
    const menuLabel = onPrintReport
        ? 'Importa, esporta e stampa'
        : 'Opzioni Excel';
    const MenuIcon = onPrintReport ? FileOutput : FileSpreadsheet;
    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={disabled || busy}
                        aria-label={`${menuLabel} · ${label}`}
                        title={menuLabel}
                    >
                        <MenuIcon aria-hidden="true" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                        {!exportOnly && (
                            <DropdownMenuItem
                                disabled={disabled || busy}
                                onSelect={() => setOpen(true)}
                            >
                                <Upload aria-hidden="true" />
                                Importa Excel
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem disabled={disabled || busy} asChild>
                            <a
                                href={`${path}/export.xlsx?${query}`}
                                onClick={(event) => {
                                    if (disabled || busy)
                                        event.preventDefault();
                                }}
                            >
                                <Download aria-hidden="true" />
                                Esporta Excel
                            </a>
                        </DropdownMenuItem>
                        {onPrintReport && (
                            <DropdownMenuItem
                                disabled={disabled || busy}
                                onSelect={onPrintReport}
                            >
                                <Printer aria-hidden="true" />
                                Stampa report
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            <Dialog
                open={open}
                onOpenChange={(value) => {
                    if (!busy) setOpen(value);
                }}
            >
                <DialogContent
                    className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
                    onEscapeKeyDown={(event) => {
                        if (busy) event.preventDefault();
                    }}
                    onInteractOutside={(event) => {
                        if (busy) event.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Importa Excel · {label}</DialogTitle>
                        <DialogDescription>
                            Usa il modello dedicato per creare nuovi record. I
                            duplicati certi vengono saltati; gli errori bloccano
                            l’intero file.
                        </DialogDescription>
                    </DialogHeader>
                    {open && (
                        <DataImport
                            path={path}
                            format="xlsx"
                            maxFileKb={transferLimits.xlsxMaxKb}
                            maxRecords={transferLimits.xlsxMaxRows}
                            onBusyChange={setBusy}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

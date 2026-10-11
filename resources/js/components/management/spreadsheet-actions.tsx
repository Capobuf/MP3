import { usePage } from '@inertiajs/react';
import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { DataImport } from './data-import';

export function SpreadsheetActions({
    slug,
    resource,
    label,
    filters = {},
    disabled = false,
    exportOnly = false,
}: {
    slug: string;
    resource: string;
    label: string;
    filters?: object;
    disabled?: boolean;
    exportOnly?: boolean;
}) {
    const { transferLimits } = usePage<{
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
    return (
        <div className="flex flex-wrap gap-2">
            {!exportOnly && (
                <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                >
                    <Upload data-icon="inline-start" />
                    Importa Excel
                </Button>
            )}
            <Button type="button" variant="outline" disabled={disabled} asChild>
                <a
                    href={`${path}/export.xlsx?${query}`}
                    onClick={(event) => {
                        if (disabled) event.preventDefault();
                    }}
                >
                    <Download data-icon="inline-start" />
                    Esporta Excel
                </a>
            </Button>
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
        </div>
    );
}

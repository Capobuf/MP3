import { router } from '@inertiajs/react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { api } from './helpers';
import type { DeletionResult } from './types';

export function DeleteRecord({
    url,
    redirect,
    label,
    onDeleted,
    disabled = false,
    open: controlledOpen,
    onOpenChange,
}: {
    url: string;
    redirect?: string;
    label: string;
    onDeleted?: () => void;
    disabled?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen ?? internalOpen;
    const setOpen = (value: boolean) => {
        setInternalOpen(value);
        onOpenChange?.(value);
    };
    const [busy, setBusy] = useState(false);
    async function remove() {
        setBusy(true);
        try {
            const result = await api<DeletionResult>(url, 'DELETE');
            if (result.cleanup_failed) toast.error(result.message);
            else toast.success(result.message);
            setOpen(false);
            if (onDeleted) onDeleted();
            else if (redirect) router.visit(redirect);
            else router.reload();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Eliminazione non riuscita.',
            );
        } finally {
            setBusy(false);
        }
    }
    return (
        <AlertDialog
            open={open}
            onOpenChange={(value) => {
                if (!busy) setOpen(value);
            }}
        >
            {controlledOpen === undefined && (
                <AlertDialogTrigger asChild>
                    <Button
                        type="button"
                        disabled={disabled}
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                    >
                        Elimina
                    </Button>
                </AlertDialogTrigger>
            )}
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Eliminare {label}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        L’operazione è definitiva. Gli elementi con spese o
                        contratti collegati devono prima essere scollegati.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>
                        Annulla
                    </AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={busy}
                        onClick={(event) => {
                            event.preventDefault();
                            void remove();
                        }}
                    >
                        {busy ? 'Eliminazione…' : 'Elimina'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

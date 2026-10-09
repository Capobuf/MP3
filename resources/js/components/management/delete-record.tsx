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

export function DeleteRecord({
    url,
    redirect,
    label,
    onDeleted,
    disabled = false,
}: {
    url: string;
    redirect?: string;
    label: string;
    onDeleted?: () => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    async function remove() {
        setBusy(true);
        try {
            await api(url, 'DELETE');
            toast.success('Elemento eliminato.');
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

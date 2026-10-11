import { router, usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import { Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/components/management/helpers';
import { Button } from '@/components/ui/button';
import {
    clearLocalUndo,
    recordLocalUndo,
    setUndoing,
    takeLocalUndo,
    undoBusy,
    undoVersion,
    useUndoBusy,
} from '@/lib/undo-state';

type Result = {
    action_id: number;
    message: string;
    label: string;
    expires_at: string | null;
    seconds: number;
    href: string;
};

export function UndoControls() {
    const { auth, currentTenant } = usePage().props;
    const busy = useUndoBusy();
    const inertiaBusy = useRef(false);
    const popupIds = useRef<(string | number)[]>([]);
    const scope = currentTenant ? `/t/${currentTenant.slug}` : '';
    const path = `${scope}/undo`;
    const seconds = Number(auth.user.undo_popup_seconds ?? 10);
    useEffect(() => {
        const start = router.on('start', () => {
            inertiaBusy.current = true;
        });
        const finish = router.on('finish', () => {
            inertiaBusy.current = false;
        });
        return () => {
            start();
            finish();
        };
    }, []);
    useEffect(() => {
        return () => {
            clearLocalUndo();
            popupIds.current.forEach((id) => toast.dismiss(id));
            popupIds.current = [];
        };
    }, [auth.user.id]);

    async function restore(result: Result, toastId: string | number) {
        if (undoBusy() || inertiaBusy.current || hasDraft()) return;
        setUndoing(true);
        try {
            const restored = await api<Result>(`${path}/restore`, 'POST', {
                action_id: result.action_id,
            });
            toast.dismiss(toastId);
            toast.success(restored.message);
            router.visit(restored.href, { preserveScroll: true });
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Ripristino non riuscito.',
            );
        } finally {
            setUndoing(false);
        }
    }
    function hasDraft() {
        if (
            document.querySelector(
                'form[data-undo-dirty="true"], form[aria-busy="true"]',
            )
        ) {
            toast.info(
                'Salva o scarta le modifiche del form prima di annullare un’operazione salvata.',
            );
            return true;
        }
        return false;
    }
    function rememberPopup(id: string | number) {
        popupIds.current.push(id);
        if (popupIds.current.length > 50) {
            toast.dismiss(popupIds.current.shift());
        }
    }
    async function undo() {
        if (undoBusy() || inertiaBusy.current || hasDraft()) return;
        const local = takeLocalUndo(scope);
        if (local) {
            local.undo();
            const deadline = Date.now() + seconds * 1000;
            const version = undoVersion();
            const id = toast.success('Modifica annullata.', {
                description: `${local.label} · Puoi ripristinare entro ${seconds} secondi.`,
                duration: seconds * 1000,
                action: {
                    label: 'Ripristina',
                    onClick: () => {
                        if (undoBusy() || inertiaBusy.current) return;
                        if (
                            Date.now() >= deadline ||
                            undoVersion() !== version
                        ) {
                            toast.error('Il ripristino non è più disponibile.');
                            return;
                        }
                        local.redo();
                        recordLocalUndo(local);
                        toast.success('Modifica ripristinata.');
                    },
                },
            });
            rememberPopup(id);
            return;
        }
        setUndoing(true);
        try {
            const result = await api<Result>(path, 'POST');
            const duration = Math.max(
                0,
                Date.parse(result.expires_at ?? '') - Date.now(),
            );
            const id = toast.success(result.message, {
                description: `${result.label} · Puoi ripristinare entro ${result.seconds} secondi.`,
                duration,
                action: {
                    label: 'Ripristina',
                    onClick: (event) => {
                        event.preventDefault();
                        void restore(result, id);
                    },
                },
            });
            rememberPopup(id);
            router.visit(result.href, { preserveScroll: true });
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Annullamento non riuscito.',
            );
        } finally {
            setUndoing(false);
        }
    }
    useEffect(() => {
        const listener = (event: KeyboardEvent) => {
            if (
                !(event.ctrlKey || event.metaKey) ||
                event.altKey ||
                event.shiftKey ||
                event.key.toLowerCase() !== 'z' ||
                event.repeat ||
                event.defaultPrevented
            )
                return;
            const target = event.target;
            if (
                target instanceof HTMLElement &&
                target.closest(
                    'input, textarea, select, [contenteditable="true"], [role="textbox"]',
                )
            )
                return;
            // Escape/keyboard drag cancellation belongs to the active dialog or drag.
            if (
                document.querySelector(
                    '[aria-roledescription="sortable"][aria-pressed="true"], [role="alertdialog"]',
                )
            )
                return;
            event.preventDefault();
            void undo();
        };
        document.addEventListener('keydown', listener);
        return () => document.removeEventListener('keydown', listener);
    });
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label="Annulla ultima modifica"
            title="Annulla ultima modifica (Ctrl+Z / ⌘Z)"
            onClick={() => {
                void undo();
            }}
        >
            <Undo2 />
        </Button>
    );
}

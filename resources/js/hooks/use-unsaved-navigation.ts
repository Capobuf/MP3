import type { PendingVisit } from '@inertiajs/core';
import { router } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';

export function useUnsavedNavigation(enabled: boolean, blocked = false) {
    const [pending, setPending] = useState<PendingVisit | null>(null);
    const allowed = useRef(false);
    useEffect(() => {
        if (!enabled && !blocked) return;
        return router.on('before', (event) => {
            if (allowed.current) {
                allowed.current = false;
                return;
            }
            event.preventDefault();
            if (blocked) return;
            setPending(event.detail.visit);
        });
    }, [enabled, blocked]);
    function allow() {
        allowed.current = true;
    }
    function confirm() {
        if (!pending) return;
        allow();
        setPending(null);
        // Discard also resets local state when resuming a same-page reload.
        router.visit(pending.url, { ...pending, preserveState: false });
    }
    return { pending, allow, confirm, cancel: () => setPending(null) };
}

import type { PendingVisit } from '@inertiajs/core';
import { router } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';

export function useUnsavedNavigation(enabled: boolean) {
    const [pending, setPending] = useState<PendingVisit | null>(null);
    const allowed = useRef(false);
    useEffect(() => {
        if (!enabled) return;
        return router.on('before', (event) => {
            if (allowed.current) {
                allowed.current = false;
                return;
            }
            event.preventDefault();
            setPending(event.detail.visit);
        });
    }, [enabled]);
    function allow() {
        allowed.current = true;
    }
    function confirm() {
        if (!pending) return;
        allow();
        setPending(null);
        router.visit(pending.url, pending);
    }
    return { pending, allow, confirm, cancel: () => setPending(null) };
}

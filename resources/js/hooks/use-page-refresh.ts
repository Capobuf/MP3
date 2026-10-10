import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { useDelayedBusy } from './use-delayed-busy';

export function usePageRefresh(path: string) {
    const [pending, setPending] = useState(false);
    useEffect(() => {
        const start = router.on('start', ({ detail }) => {
            if (
                detail.visit.method === 'get' &&
                detail.visit.url.pathname === path
            )
                setPending(true);
        });
        const finish = router.on('finish', () => setPending(false));
        return () => {
            start();
            finish();
        };
    }, [path]);
    return { pending, visible: useDelayedBusy(pending) };
}

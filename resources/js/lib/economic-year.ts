import { router } from '@inertiajs/react';

/** A full Inertia visit lets existing navigation guards run and clears old page state. */
export function changeEconomicYear(year: number, onSuccess?: () => void) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return;
    const url = new URL(window.location.href);
    url.searchParams.set('year', String(year));
    const pagination = Array.from(url.searchParams.keys()).filter(
        (key) => key === 'page' || key.endsWith('_page'),
    );
    for (const key of pagination) url.searchParams.delete(key);
    router.visit(`${url.pathname}${url.search}${url.hash}`, {
        method: 'get',
        preserveState: false,
        preserveScroll: true,
        onSuccess,
    });
}

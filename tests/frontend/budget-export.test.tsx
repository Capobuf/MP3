import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { SpreadsheetActions } from '../../resources/js/components/management/spreadsheet-actions';
import { DropdownMenuItem } from '../../resources/js/components/ui/dropdown-menu';

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({
        props: { transferLimits: {}, economicContext: { year: 2025 } },
    }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/components/ui/dropdown-menu', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('../../resources/js/components/ui/dropdown-menu')
    >()),
    DropdownMenuContent: ({ children }: { children: ReactNode }) => (
        <>{children}</>
    ),
    DropdownMenuItem: vi.fn(({ children }: { children: ReactNode }) => (
        <>{children}</>
    )),
}));

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('Budget spreadsheet download', () => {
    it.each(['2,3', ''])(
        'reads the current selection at click time, including %j',
        async (ids) => {
            let filters = { year: 2026, entry_ids: '1' };
            renderToStaticMarkup(
                <SpreadsheetActions
                    slug="alfa"
                    resource="budget"
                    label="Budget"
                    exportOnly
                    getExportFilters={() => filters}
                />,
            );
            filters = { year: 2027, entry_ids: ids };
            const fetch = vi.fn().mockResolvedValue(
                new Response('xlsx', {
                    headers: {
                        'Content-Type':
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'Content-Disposition': ids
                            ? 'attachment; filename="obake_budget.xlsx"'
                            : 'attachment; filename=obake_budget.xlsx',
                    },
                }),
            );
            vi.stubGlobal('fetch', fetch);
            const link = { href: '', download: '', click: vi.fn() };
            vi.stubGlobal('document', { createElement: () => link });
            vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
            const revoke = vi
                .spyOn(URL, 'revokeObjectURL')
                .mockImplementation(() => {});
            vi.mocked(DropdownMenuItem).mock.calls[0][0].onSelect?.(
                {} as Event,
            );
            await vi.waitFor(() => expect(link.click).toHaveBeenCalledOnce());
            const url = new URL(fetch.mock.calls[0][0], 'http://localhost');
            expect(url.searchParams.get('year')).toBe('2027');
            expect(url.searchParams.get('entry_ids')).toBe(ids);
            expect(link.download).toBe('obake_budget.xlsx');
            expect(revoke).toHaveBeenCalledWith('blob:export');
        },
    );

    it.each([422, 200])(
        'shows an error instead of downloading invalid data (%s)',
        async (status) => {
            renderToStaticMarkup(
                <SpreadsheetActions
                    slug="alfa"
                    resource="budget"
                    label="Budget"
                    exportOnly
                    getExportFilters={() => ({ year: 2026, entry_ids: '9' })}
                />,
            );
            const create = vi.spyOn(URL, 'createObjectURL');
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    new Response(
                        status === 422
                            ? JSON.stringify({
                                  message: 'Selezione non disponibile',
                              })
                            : '<html>Login</html>',
                        { status },
                    ),
                ),
            );
            vi.mocked(DropdownMenuItem).mock.calls[0][0].onSelect?.(
                {} as Event,
            );
            await vi.waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
            expect(create).not.toHaveBeenCalled();
        },
    );

    it('preserves the native expense export link and its filters', () => {
        const html = renderToStaticMarkup(
            <SpreadsheetActions
                slug="alfa"
                resource="expenses"
                label="Spese"
                exportOnly
                filters={{ year: 2025, search: 'Canone', vendor_id: 'none' }}
            />,
        );
        expect(html).toContain(
            '/t/alfa/expenses/export.xlsx?year=2025&amp;search=Canone&amp;vendor_id=none',
        );
    });
});

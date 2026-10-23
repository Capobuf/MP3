import { expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { useUnsavedNavigation } from '../../resources/js/hooks/use-unsaved-navigation';

const mocks = vi.hoisted(() => ({
    visit: vi.fn(),
    setPending: vi.fn(),
}));
const pending = {
    url: new URL('https://example.test/t/alfa/expenses/create?year=2026'),
    method: 'get',
    preserveState: true,
    preserveScroll: true,
    headers: { 'Cache-Control': 'no-cache' },
};

vi.mock('@inertiajs/react', () => ({ router: { visit: mocks.visit } }));
vi.mock('react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react')>()),
    useState: () => [pending, mocks.setPending],
}));

it('discards local form state when confirming a pending reload', () => {
    let confirm: () => void = () => {};
    function Probe() {
        confirm = useUnsavedNavigation(true).confirm;
        return null;
    }
    renderToStaticMarkup(<Probe />);
    confirm();

    expect(mocks.setPending).toHaveBeenCalledWith(null);
    expect(mocks.visit).toHaveBeenCalledExactlyOnceWith(pending.url, {
        ...pending,
        preserveState: false,
    });
});

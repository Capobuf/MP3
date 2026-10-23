import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    TableViewHeader,
    useTableView,
} from '../../resources/js/components/management/table-view';

function Example({
    actions = false,
    disabled = false,
}: {
    actions?: boolean;
    disabled?: boolean;
}) {
    const view = useTableView({
        rows: [],
        storageKey: 'column-settings-test',
        columns: [
            { id: 'name', label: 'Nome', canHide: false },
            { id: 'amount', label: 'Importo' },
            ...(actions
                ? [{ id: 'actions', label: 'Azioni', canHide: false }]
                : []),
        ],
    });
    return (
        <table>
            <TableViewHeader view={view} disabled={disabled} />
        </table>
    );
}

afterEach(() => vi.unstubAllGlobals());

describe('Column settings in table headers', () => {
    it.each([
        {
            actions: true,
            order: ['name', 'amount', 'actions'],
            visibility: {},
            index: 2,
            count: 3,
        },
        {
            actions: true,
            order: ['actions', 'name', 'amount'],
            visibility: {},
            index: 0,
            count: 3,
        },
        {
            actions: false,
            order: ['name', 'amount'],
            visibility: {},
            index: 1,
            count: 2,
        },
        {
            actions: false,
            order: ['name', 'amount'],
            visibility: { amount: false },
            index: 0,
            count: 1,
        },
        {
            actions: false,
            order: ['amount', 'name'],
            visibility: {},
            index: 1,
            count: 2,
        },
    ])(
        'keeps one accessible control with preferences %j',
        ({ actions, order, visibility, index, count }) => {
            vi.stubGlobal('localStorage', {
                getItem: () => JSON.stringify({ order, visibility }),
            });
            const html = renderToStaticMarkup(<Example actions={actions} />);
            const headers = html.match(/<th(?:\s[^>]*)?>[\s\S]*?<\/th>/g)!;
            expect(headers).toHaveLength(count);
            expect(html.match(/aria-label="Colonne"/g)).toHaveLength(1);
            expect(headers[index]).toContain('aria-label="Colonne"');
            expect(html).toContain('Nome');
        },
    );

    it('disables settings while the table is busy', () => {
        const html = renderToStaticMarkup(<Example disabled />);
        expect(html).toMatch(
            /<button[^>]*disabled=""[^>]*aria-label="Colonne"/,
        );
    });
});

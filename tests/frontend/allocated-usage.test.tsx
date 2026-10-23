import { describe, expect, it } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AllocatedUsage } from '../../resources/js/components/management/allocated-usage';
import { money } from '../../resources/js/components/management/helpers';

describe('Utilizzo dell’allocato', () => {
    it.each([
        ['100.00', '80.00', '80%', 'Residuo allocato', '20.00'],
        ['100.00', '120.00', '120%', 'Superamento dell’allocato', '20.00'],
        ['100.00', '0.00', '0%', 'Residuo allocato', '100.00'],
        ['100.00', '-20.00', '-20%', 'Residuo allocato', '120.00'],
        ['100.01', '80.02', '80%', 'Residuo allocato', '19.99'],
    ])(
        'shows %s allocated and %s actual without capping the ratio',
        (allocated, actual, usage, label, remaining) => {
            const html = renderToStaticMarkup(
                <AllocatedUsage values={{ allocated, actual }} />,
            );
            expect(html).toContain(`>${usage}</p>`);
            expect(html).toContain(label);
            expect(html).toContain(money(remaining));
        },
    );

    it.each([
        [null, '80.00'],
        ['100.00', null],
        [null, null],
        ['0.00', '80.00'],
        ['0.00', '0.00'],
        ['-100.00', '80.00'],
    ])(
        'keeps the ratio unavailable for %s allocated and %s actual',
        (allocated, actual) => {
            const html = renderToStaticMarkup(
                <AllocatedUsage values={{ allocated, actual }} />,
            );
            expect(html).toContain('>—</p>');
            expect(html).not.toContain('NaN');
            expect(html).not.toContain('Infinity');
            if (allocated === null || actual === null) {
                expect(html).toContain('Allocato o effettivo non disponibili.');
                expect(html).not.toContain('>0%</p>');
            } else {
                expect(html).toContain(
                    'Il rapporto richiede un allocato maggiore di zero.',
                );
            }
        },
    );
});

import { describe, expect, it } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertError from '../../resources/js/components/alert-error';
import { Calendar } from '../../resources/js/components/ui/calendar';
import { passkeyError } from '../../resources/js/lib/passkey-error';

describe('Italian localization', () => {
    it.each([
        [
            'The passkey operation was cancelled.',
            'L’operazione con la passkey è stata annullata.',
        ],
        [
            'This device is already registered as a passkey.',
            'Questo dispositivo è già registrato come passkey.',
        ],
        [
            'Request failed with status 429',
            'Richiesta non riuscita (stato HTTP 429).',
        ],
        [
            "Passkeys can't be used on example.test. For local development, use localhost.",
            'Le passkey non possono essere usate su example.test. Per lo sviluppo locale, usa localhost.',
        ],
        [
            "Passkeys can't be used on this domain. For local development, use localhost.",
            'Le passkey non possono essere usate su questo dominio. Per lo sviluppo locale, usa localhost.',
        ],
        [
            'The RP ID "example.test" is invalid for this domain',
            'L’ID RP "example.test" non è valido per questo dominio.',
        ],
        ['toString', 'toString'],
        ['__proto__', '__proto__'],
        ['Device diagnostic E123', 'Device diagnostic E123'],
        ['Errore del server', 'Errore del server'],
    ])(
        'translates known passkey errors without losing identifiers: %s',
        (message, expected) => {
            expect(passkeyError(message)).toBe(expected);
        },
    );

    it('renders an Italian fallback alert and accessible calendar in an English runtime', () => {
        expect(
            renderToStaticMarkup(<AlertError errors={['Dettaglio']} />),
        ).toContain('Si è verificato un problema.');
        const calendar = renderToStaticMarkup(
            <Calendar
                defaultMonth={new Date(2026, 0, 15)}
                captionLayout="dropdown"
            />,
        );
        expect(calendar).toContain('gen');
        expect(calendar).toContain('Vai al mese successivo');
        expect(calendar).toContain('Vai al mese precedente');
        expect(calendar).toContain('Scegli il mese');
        expect(calendar).not.toContain('Go to');
    });
});

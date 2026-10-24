import { expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { usePasskeyVerify } from '@laravel/passkeys/react';
import PasskeyVerify from '../../resources/js/components/passkey-verify';

vi.mock('@laravel/passkeys/react', () => ({
    usePasskeyVerify: vi.fn(() => ({ isSupported: false })),
}));

it.each([false, true])(
    'passes remember=%s to the official hook',
    (remember) => {
        renderToStaticMarkup(<PasskeyVerify remember={remember} />);
        expect(usePasskeyVerify).toHaveBeenLastCalledWith(
            expect.objectContaining({ remember }),
        );
    },
);

it('keeps remember disabled for callers that omit it', () => {
    renderToStaticMarkup(<PasskeyVerify />);
    expect(usePasskeyVerify).toHaveBeenLastCalledWith(
        expect.objectContaining({ remember: false }),
    );
});

// Credit: https://usehooks-ts.com/
import { useState } from 'react';

export type CopiedValue = string | null;
export type CopyFn = (text: string) => Promise<boolean>;
export type UseClipboardReturn = [CopiedValue, CopyFn];

export function useClipboard(): UseClipboardReturn {
    const [copiedText, setCopiedText] = useState<CopiedValue>(null);

    const copy: CopyFn = async (text) => {
        setCopiedText(null);
        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(text);
            } else {
                // The LAN installation uses HTTP, where the Clipboard API is unavailable.
                const input = document.createElement('textarea');
                const focused = document.activeElement;
                input.value = text;
                input.style.position = 'fixed';
                input.style.opacity = '0';
                document.body.appendChild(input);
                try {
                    input.select();
                    if (!document.execCommand('copy')) return false;
                } finally {
                    input.remove();
                    if (focused instanceof HTMLElement) focused.focus();
                }
            }
            setCopiedText(text);
            return true;
        } catch (error) {
            console.warn('Copy failed', error);
            setCopiedText(null);
            return false;
        }
    };

    return [copiedText, copy];
}

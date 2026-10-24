import { toast } from 'sonner';
import { beginMutation, clearLocalUndo } from '@/lib/undo-state';

const euro = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    useGrouping: 'always',
    currency: 'EUR',
});

export function money(
    value: string | number | null | undefined,
    emptyValue = 'Da inserire',
): string {
    return value === null || value === undefined
        ? emptyValue
        : euro.format(Number(value) === 0 ? 0 : Number(value));
}

export function varianceTextClass(
    value: string | number | bigint | null | undefined,
): string {
    if (value == null) return 'text-muted-foreground';
    const amount = Number(value);
    if (amount > 0) return 'text-finance-overrun';
    if (amount < 0) return 'text-finance-saving';
    return 'text-foreground';
}

export function dateLabel(value: string | null | undefined): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('it-IT').format(
        new Date(`${value.slice(0, 10)}T12:00:00`),
    );
}
export function decimalInput(value: string): string | null {
    const trimmed = value.trim().replace(/\s/g, '').replace(/€/g, '');
    if (trimmed === '') return null;
    if (trimmed.includes(',') && trimmed.includes('.')) {
        // With both separators, the last one is decimal; groups must have 3 digits.
        const decimalComma =
            trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.');
        const grouped = decimalComma
            ? /^-?\d{1,3}(?:\.\d{3})+,\d+$/
            : /^-?\d{1,3}(?:,\d{3})+\.\d+$/;
        if (!grouped.test(trimmed)) return trimmed;
        return decimalComma
            ? trimmed.replace(/\./g, '').replace(',', '.')
            : trimmed.replace(/,/g, '');
    }
    return trimmed.replace(',', '.');
}
export class ApiError extends Error {
    constructor(
        message: string,
        public errors: Record<string, string[]> = {},
        public code?: string,
    ) {
        super(message);
    }
}
export async function api<T>(
    url: string,
    method = 'GET',
    data?: unknown,
): Promise<T> {
    const finish = method.toUpperCase() === 'GET' ? () => {} : beginMutation();
    try {
        return await requestJson<T>(url, method, data);
    } finally {
        finish();
    }
}

async function requestJson<T>(
    url: string,
    method: string,
    data?: unknown,
): Promise<T> {
    const token = document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
        ?.slice(11);
    const response = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Undo-Location':
                window.location.pathname + window.location.search,
            ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    if (!response.ok) {
        const error = (await response.json().catch(() => ({
            message:
                response.status === 419
                    ? 'Sessione scaduta. Ricarica la pagina dopo aver copiato le modifiche.'
                    : 'Salvataggio non riuscito. Riprova.',
        }))) as {
            message?: string;
            errors?: Record<string, string[]>;
            code?: string;
        };
        throw new ApiError(
            Object.values(error.errors ?? {}).flat()[0] ??
                error.message ??
                'Operazione non riuscita.',
            error.errors,
            error.code,
        );
    }
    return readJson<T>(response);
}

export async function uploadAttachment<T>(url: string, file: File): Promise<T> {
    const finish = beginMutation();
    try {
        return await uploadFile<T>(url, file);
    } finally {
        finish();
    }
}

export async function uploadTransfer<T>(
    url: string,
    file: File,
    token?: string,
): Promise<T> {
    const finish = token ? beginMutation() : () => {};
    try {
        return await uploadFile<T>(url, file, token);
    } finally {
        finish();
    }
}

async function uploadFile<T>(
    url: string,
    file: File,
    previewToken?: string,
): Promise<T> {
    const token = document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
        ?.slice(11);
    const body = new FormData();
    body.append('file', file);
    if (previewToken) body.append('token', previewToken);
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
        },
        body,
    });
    if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as {
            message?: string;
            errors?: Record<string, string[]>;
        };
        throw new ApiError(
            Object.values(error.errors ?? {}).flat()[0] ??
                (response.status === 419
                    ? 'Sessione scaduta. Ricarica la pagina.'
                    : response.status === 413
                      ? 'Il file supera il limite di caricamento del server.'
                      : (error.message ?? 'Caricamento non riuscito.')),
            error.errors,
        );
    }
    return readJson<T>(response);
}

export function fileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const unit = bytes < 1024 * 1024 ? 'KB' : 'MB';
    const value = bytes / (unit === 'KB' ? 1024 : 1024 * 1024);
    return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

async function readJson<T>(response: Response): Promise<T> {
    if (response.headers.has('X-Undo-Action')) clearLocalUndo();
    const result = (await response.json()) as T & { warnings?: string[] };
    result.warnings?.forEach((message) => toast.warning(message));
    return result;
}

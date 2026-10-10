const euro = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    useGrouping: 'always',
    currency: 'EUR',
});

export function money(value: string | number | null | undefined): string {
    return value === null || value === undefined
        ? 'Da inserire'
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
    return trimmed.includes(',')
        ? trimmed.replace(/\./g, '').replace(',', '.')
        : trimmed;
}
export class ApiError extends Error {
    constructor(
        message: string,
        public errors: Record<string, string[]> = {},
    ) {
        super(message);
    }
}
export async function api<T>(
    url: string,
    method = 'GET',
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
        }))) as { message?: string; errors?: Record<string, string[]> };
        throw new ApiError(
            Object.values(error.errors ?? {}).flat()[0] ??
                error.message ??
                'Operazione non riuscita.',
            error.errors,
        );
    }
    return response.json() as Promise<T>;
}

export function matchesExpenseFilters(
    record: import('./types').RecordData,
    filters: import('./types').Filters,
): boolean {
    return (
        record.year === filters.year &&
        (!filters.search ||
            !!record.title
                ?.toLocaleLowerCase()
                .includes(filters.search.toLocaleLowerCase())) &&
        (['vendor_id', 'contract_id', 'project_id'] as const).every((key) => {
            const value = filters[key];
            return (
                !value ||
                (value === 'none'
                    ? record[key] == null
                    : String(record[key]) === value)
            );
        })
    );
}

export async function uploadAttachment<T>(url: string, file: File): Promise<T> {
    const token = document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
        ?.slice(11);
    const body = new FormData();
    body.append('file', file);
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
    return response.json() as Promise<T>;
}

export function fileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const unit = bytes < 1024 * 1024 ? 'KB' : 'MB';
    const value = bytes / (unit === 'KB' ? 1024 : 1024 * 1024);
    return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

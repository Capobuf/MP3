export function money(value: string | number | null | undefined): string {
    return value === null || value === undefined
        ? 'Da inserire'
        : new Intl.NumberFormat('it-IT', {
              style: 'currency',
              useGrouping: 'always',
              currency: 'EUR',
          }).format(Number(value));
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

import type {
    EconomicGroup,
    EconomicValues,
    EntityFilter,
    GroupId,
    Metric,
    SankeyData,
    SankeyPair,
} from './analytics-types';

export const economicConfig = {
    allocated: { label: 'Allocato', color: 'var(--chart-2)' },
    actual: { label: 'Effettivo', color: 'var(--chart-1)' },
};
export const palette = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
];
export const compactMoney = (value: number) =>
    new Intl.NumberFormat('it-IT', {
        notation: 'compact',
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 1,
    }).format(value);
export const percent = (value: number | null) =>
    value === null
        ? '—'
        : `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(value)}%`;
export function cents(value: string): number {
    const [whole, fraction = ''] = value.replace('-', '').split('.');
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return value.startsWith('-') ? -amount : amount;
}
export const decimal = (value: number) => (value / 100).toFixed(2);
const amountKeys = [
    'allocated',
    'actual',
    'variance',
    'allocated_positive',
    'actual_positive',
    'allocated_negative',
    'actual_negative',
] as const;

export function sumGroups(rows: EconomicValues[]): EconomicValues {
    const result: EconomicValues = {
        allocated: null,
        actual: null,
        variance: null,
        allocated_positive: '0.00',
        actual_positive: '0.00',
        allocated_negative: '0.00',
        actual_negative: '0.00',
        count: 0,
        incomplete: 0,
    };
    for (const key of amountKeys) {
        const present = rows
            .map((row) => row[key])
            .filter((value) => value !== null);
        if (present.length)
            result[key] = decimal(
                present.reduce((total, value) => total + cents(value), 0),
            );
    }
    result.count = rows.reduce((sum, row) => sum + row.count, 0);
    result.incomplete = rows.reduce((sum, row) => sum + row.incomplete, 0);
    return result;
}

export function topGroups(
    rows: EconomicGroup[],
    limit: number,
    metric: Metric,
    positive = false,
): EconomicGroup[] {
    const key = positive ? (`${metric}_positive` as const) : metric;
    const associated = rows
        .filter((row) => row.id !== 'none')
        .toSorted(
            (a, b) =>
                Number(b[key] ?? 0) - Number(a[key] ?? 0) ||
                String(a.id).localeCompare(String(b.id)),
        );
    const others = associated.slice(limit);
    return [
        ...associated.slice(0, limit),
        ...(others.length
            ? [{ id: 'others' as const, name: 'Altri', ...sumGroups(others) }]
            : []),
        ...rows.filter((row) => row.id === 'none'),
    ];
}

export function buildSankey(
    pairs: SankeyPair[],
    vendors: EconomicGroup[],
    destinations: EconomicGroup[],
    metric: Metric,
    destination: EntityFilter,
): SankeyData {
    const key = `${metric}_positive` as const;
    const vendorGroups = topGroups(vendors, 6, metric, true).filter(
        (row) => cents(row[key]) > 0,
    );
    const destinationGroups = topGroups(destinations, 6, metric, true).filter(
        (row) => cents(row[key]) > 0,
    );
    const nodes: SankeyData['nodes'] = [{ key: 'origin', name: 'Spese' }];
    const index = new Map<string, number>([['origin', 0]]);
    const add = (row: EconomicGroup, field: EntityFilter) => {
        const nodeKey = `${field}:${row.id}`;
        index.set(nodeKey, nodes.length);
        nodes.push({ key: nodeKey, name: row.name, id: row.id, field });
    };
    vendorGroups.forEach((row) => add(row, 'vendor_id'));
    destinationGroups.forEach((row) => add(row, destination));
    const keptVendors = new Set<GroupId>(vendorGroups.map((row) => row.id));
    const keptDestinations = new Set<GroupId>(
        destinationGroups.map((row) => row.id),
    );
    const links = new Map<
        string,
        { source: number; target: number; cents: number }
    >();
    const link = (source: number, target: number, value: number) => {
        const key = `${source}:${target}`;
        const previous = links.get(key);
        links.set(key, {
            source,
            target,
            cents: (previous?.cents ?? 0) + value,
        });
    };
    for (const pair of pairs) {
        const value = cents(pair[key]);
        if (value <= 0) continue;
        const vendor = keptVendors.has(pair.vendor_id)
            ? pair.vendor_id
            : 'others';
        const target = keptDestinations.has(pair.destination_id)
            ? pair.destination_id
            : 'others';
        const vendorIndex = index.get(`vendor_id:${vendor}`)!;
        const destinationIndex = index.get(`${destination}:${target}`)!;
        link(0, vendorIndex, value);
        link(vendorIndex, destinationIndex, value);
    }
    return {
        nodes: links.size ? nodes : [],
        links: [...links.values()].map(({ source, target, cents }) => ({
            source,
            target,
            value: cents / 100,
        })),
    };
}

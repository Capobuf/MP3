import type { DetailBreakdown, ExpenseLine } from './types';

// Read server decimal totals as integer cents; never recompute price × quantity.
export function detailCents(amount: string): bigint {
    const [whole, fraction = ''] = amount.replace('-', '').split('.');
    return (
        (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) *
        (amount.startsWith('-') ? -1n : 1n)
    );
}

export function detailDecimal(cents: bigint): string {
    const absolute = cents < 0n ? -cents : cents;
    return `${cents < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function expenseBreakdown(lines: ExpenseLine[]): DetailBreakdown {
    const result = {} as DetailBreakdown;
    for (const metric of ['allocated', 'actual'] as const) {
        let positive = 0n;
        let negative = 0n;
        let missing = 0;
        let zero = 0;
        const items = lines
            .filter((line) => line.type === metric)
            .flatMap((line, index) => {
                if (line.total == null) {
                    missing++;
                    return [];
                }
                const cents = detailCents(line.total);
                if (cents < 0n) negative += cents;
                if (cents === 0n) zero++;
                if (cents <= 0n) return [];
                positive += cents;
                return [
                    {
                        id: String(line.id ?? index),
                        name: line.description,
                        amount: line.total,
                    },
                ];
            });
        items.sort((left, right) => {
            const difference =
                detailCents(right.amount) - detailCents(left.amount);
            return difference > 0n ? 1 : difference < 0n ? -1 : 0;
        });
        const shown = items.slice(0, 7);
        const remainder = items
            .slice(7)
            .reduce((sum, item) => sum + detailCents(item.amount), 0n);
        if (remainder > 0n)
            shown.push({
                id: 'other',
                name: 'Altre voci',
                amount: detailDecimal(remainder),
            });
        result[metric] = {
            items: shown,
            positive: detailDecimal(positive),
            negative: detailDecimal(negative),
            net: lines.some(
                (line) => line.type === metric && line.total != null,
            )
                ? detailDecimal(positive + negative)
                : null,
            missing,
            zero,
        };
    }
    return result;
}

import { Link } from '@inertiajs/react';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ContractExpiry } from './analytics-types';
import { AnalyticsCard, EmptyChart } from './analytics-ui';
import { ContractTimeline } from './contract-timeline';

export function ContractExpiryChart({
    expiry,
    slug,
    year,
}: {
    expiry: ContractExpiry;
    slug: string;
    year: number;
}) {
    return (
        <AnalyticsCard
            title="Scadenze Contrattuali"
            controls={
                <Button variant="outline" size="sm" asChild>
                    <Link
                        href={`/t/${slug}/scadenzario?year=${year}`}
                        aria-label="Apri scadenzario"
                    >
                        Apri
                        <ArrowUpRight
                            data-icon="inline-end"
                            aria-hidden="true"
                        />
                    </Link>
                </Button>
            }
        >
            {expiry.records.length === 0 ? (
                <EmptyChart>Nessun contratto nell’anno selezionato.</EmptyChart>
            ) : (
                <div className="max-h-112 overflow-y-auto">
                    <ContractTimeline
                        records={expiry.records}
                        year={year}
                        today={expiry.asOf}
                        undatedHref={`/t/${slug}/scadenzario?year=${year}&period=undated`}
                        href={(record) =>
                            `/t/${slug}/contracts/${record.id}?year=${record.year ?? year}`
                        }
                    />
                </div>
            )}
        </AnalyticsCard>
    );
}

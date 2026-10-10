import { Head, router } from '@inertiajs/react';
import { CostCenterForm } from '@/components/management/cost-center-form';
import { EntityForm } from '@/components/management/entity-form';
import { labels, singular } from '@/components/management/types';
import type {
    CostCenter,
    Kind,
    Options,
    RecordData,
} from '@/components/management/types';
import type { Tenant } from '@/types';

export default function CreateRecord({
    tenant,
    kind,
    year,
    options,
    contractContext,
    parentId,
    record,
}: {
    tenant: Tenant;
    kind: Kind | 'cost-centers';
    year: number;
    options: Options;
    contractContext: RecordData | null;
    parentId: number | null;
    record: RecordData | null;
}) {
    const path = `/t/${tenant.slug}/${kind}`;
    const returnPath = contractContext
        ? `/t/${tenant.slug}/contracts/${contractContext.id}`
        : record && kind !== 'cost-centers'
          ? `${path}/${record.id}`
          : kind === 'expenses'
            ? `${path}?year=${year}`
            : path;
    const close = () => router.visit(returnPath);
    return (
        <>
            <Head
                title={`${record ? 'Modifica' : kind === 'expenses' ? 'Nuova' : 'Nuovo'} ${kind === 'cost-centers' ? 'Centro di Costo' : singular[kind]} · ${tenant.name}`}
            />
            <div className="page-shell">
                <p className="text-sm text-muted-foreground">
                    {tenant.name} /{' '}
                    {kind === 'cost-centers' ? 'Centri di Costo' : labels[kind]}
                </p>
                {kind === 'cost-centers' ? (
                    <CostCenterForm
                        record={(record ?? undefined) as CostCenter | undefined}
                        tenant={tenant}
                        parents={options.cost_centers.filter(
                            (center) => center.parent_id === null,
                        )}
                        parentId={parentId ?? undefined}
                        onClose={close}
                        onSaved={close}
                    />
                ) : (
                    <EntityForm
                        record={record ?? undefined}
                        tenant={tenant}
                        kind={kind}
                        year={year}
                        options={options}
                        contractContext={contractContext ?? undefined}
                        onClose={close}
                        onSaved={(record) =>
                            router.visit(
                                kind === 'vendors' ||
                                    kind === 'contracts' ||
                                    kind === 'projects'
                                    ? `${path}/${record.id}`
                                    : contractContext
                                      ? returnPath
                                      : `${path}?year=${record.year ?? year}`,
                            )
                        }
                    />
                )}
            </div>
        </>
    );
}
CreateRecord.layout = {
    breadcrumbs: [{ title: 'Gestionale', href: '/dashboard' }],
};

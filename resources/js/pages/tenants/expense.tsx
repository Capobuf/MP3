import { Head, Link, router } from '@inertiajs/react';
import { AttachmentsSection } from '@/components/management/attachments-section';
import { DeleteRecord } from '@/components/management/delete-record';
import { CostCenterTags } from '@/components/management/cost-center-tags';
import { expenseBreakdown } from '@/components/management/detail-breakdown';
import { DetailBreakdownChart } from '@/components/management/detail-breakdown-chart';
import { DetailKpis } from '@/components/management/detail-kpis';
import { DetailNotes } from '@/components/management/detail-notes';
import { ExpenseLines } from '@/components/management/expense-lines';
import { dateLabel } from '@/components/management/helpers';
import type { Expense } from '@/components/management/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import type { Tenant } from '@/types';

export default function ExpenseDetail({
    tenant,
    expense,
}: {
    tenant: Tenant;
    expense: Expense;
}) {
    const path = `/t/${tenant.slug}/expenses`;
    const lines = expense.lines ?? [];
    const years =
        expense.contract_id && lines.length
            ? [...new Set(lines.map((line) => line.year ?? expense.year))]
                  .sort((a, b) => Number(a) - Number(b))
                  .join(', ')
            : String(expense.year);
    return (
        <>
            <Head title={`${expense.title} · ${tenant.name}`} />
            <div className="@container/detail page-shell">
                <header className="flex detail-enter flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                        <Link
                            href={`${path}?year=${expense.year}`}
                            className="text-sm text-muted-foreground hover:text-foreground"
                        >
                            {tenant.name} / Spese / {expense.year}
                        </Link>
                        <h1 className="mt-2 page-title [overflow-wrap:anywhere]">
                            {expense.title}
                        </h1>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="secondary">
                                Imputazione {years}
                            </Badge>
                            {expense.period_starts_on &&
                                expense.period_ends_on && (
                                    <span>
                                        {dateLabel(expense.period_starts_on)} –{' '}
                                        {dateLabel(expense.period_ends_on)}
                                    </span>
                                )}
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                            onClick={() =>
                                router.visit(`${path}/${expense.id}/edit`)
                            }
                        >
                            Modifica spesa
                        </Button>
                        <DeleteRecord
                            url={`${path}/${expense.id}`}
                            redirect={`${path}?year=${expense.year}`}
                            label={expense.title}
                        />
                    </div>
                </header>
                <DetailKpis
                    allocated={expense.allocated_amount}
                    actual={expense.actual_amount}
                    variance={expense.variance}
                    count={lines.length}
                />
                <div className="grid min-w-0 items-start gap-6 @5xl/detail:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                    <Card className="min-w-0 detail-enter gap-4">
                        <CardHeader className="px-5">
                            <CardTitle>Righe economiche</CardTitle>
                            <CardDescription>
                                Importi previsti ed effettivi della spesa ·{' '}
                                {lines.length} righe
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="min-w-0 px-5">
                            <ExpenseLines
                                readOnly
                                showSummary={false}
                                showHeading={false}
                                contractMode={!!expense.contract_id}
                                lines={lines.map((line, index) => ({
                                    ...line,
                                    key: String(line.id ?? index),
                                }))}
                            />
                        </CardContent>
                    </Card>
                    <DetailBreakdownChart
                        breakdown={expenseBreakdown(lines)}
                        description="Il totale si distribuisce tra le righe della grandezza selezionata."
                    />
                </div>
                <section
                    aria-labelledby="expense-info"
                    className="min-w-0 detail-enter rounded-xl border bg-card px-5 py-5"
                >
                    <h2 id="expense-info" className="mb-4 font-semibold">
                        Informazioni
                    </h2>
                    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                            <dt className="text-xs text-muted-foreground">
                                Anno di imputazione
                            </dt>
                            <dd className="mt-1 text-sm font-medium">
                                {years}
                            </dd>
                        </div>
                        {expense.period_starts_on && expense.period_ends_on && (
                            <div>
                                <dt className="text-xs text-muted-foreground">
                                    Periodo coperto
                                </dt>
                                <dd className="mt-1 text-sm">
                                    {dateLabel(expense.period_starts_on)} –{' '}
                                    {dateLabel(expense.period_ends_on)}
                                </dd>
                            </div>
                        )}
                        {(['vendor', 'contract', 'project'] as const).map(
                            (relation) =>
                                expense[relation] && (
                                    <div key={relation}>
                                        <dt className="text-xs text-muted-foreground">
                                            {relation === 'vendor'
                                                ? 'Fornitore'
                                                : relation === 'contract'
                                                  ? 'Contratto'
                                                  : 'Progetto'}
                                        </dt>
                                        <dd className="mt-1 text-sm [overflow-wrap:anywhere]">
                                            <Link
                                                className="text-primary hover:underline"
                                                href={`/t/${tenant.slug}/${relation}s/${expense[relation]!.id}`}
                                            >
                                                {expense[relation]!.name}
                                            </Link>
                                        </dd>
                                    </div>
                                ),
                        )}
                        {!!expense.cost_centers?.length && (
                            <div className="sm:col-span-2">
                                <dt className="mb-2 text-xs text-muted-foreground">
                                    Centri di Costo
                                </dt>
                                <dd>
                                    <CostCenterTags
                                        centers={expense.cost_centers}
                                    />
                                </dd>
                            </div>
                        )}
                    </dl>
                </section>
                {expense.notes && (
                    <DetailNotes key={expense.id} text={expense.notes} />
                )}
                <AttachmentsSection
                    compact
                    key={`${tenant.id}:${expense.id}`}
                    tenant={tenant}
                    resource="expenses"
                    recordId={expense.id}
                />
            </div>
        </>
    );
}
ExpenseDetail.layout = {
    breadcrumbs: [{ title: 'Spesa', href: '/dashboard' }],
};

import { CommentsSection } from '@/components/management/comments-section';
import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { RecordMoreActions } from '@/components/management/record-more-actions';
import { Head, Link } from '@inertiajs/react';
import { AttachmentsSection } from '@/components/management/attachments-section';
import { DeleteRecord } from '@/components/management/delete-record';
import { CostCenterTags } from '@/components/management/cost-center-tags';
import { expenseBreakdown } from '@/components/management/detail-breakdown';
import { DetailBreakdownChart } from '@/components/management/detail-breakdown-chart';
import { DetailKpis } from '@/components/management/detail-kpis';
import { DetailNotes } from '@/components/management/detail-notes';
import { ExpenseLinesCard } from '@/components/management/expense-lines-card';
import {
    InlineEdit,
    saveInlineRecord,
} from '@/components/management/inline-edit';
import { dateLabel } from '@/components/management/helpers';
import type { Expense, Options } from '@/components/management/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Tenant } from '@/types';

export default function ExpenseDetail({
    tenant,
    expense,
    options,
}: {
    tenant: Tenant;
    expense: Expense;
    options: Options;
}) {
    const path = `/t/${tenant.slug}/expenses`;
    const save = (field: string, value: unknown) =>
        saveInlineRecord(`${path}/${expense.id}`, { [field]: value });
    const lines = expense.lines ?? [];
    const [editingLines, setEditingLines] = useState(false);
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
                        <InlineEdit
                            value={expense.title}
                            label="Titolo della spesa"
                            disabled={editingLines}
                            as="h1"
                            className="mt-2 page-title [overflow-wrap:anywhere]"
                            onSave={(value) => save('title', value)}
                        />
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
                        <RecordMoreActions
                            href={`${path}/${expense.id}/edit`}
                            disabled={editingLines}
                        />
                        <DeleteRecord
                            url={`${path}/${expense.id}`}
                            redirect={`${path}?year=${expense.year}`}
                            label={expense.title}
                            disabled={editingLines}
                        />
                    </div>
                </header>
                <DetailKpis
                    allocated={expense.allocated_amount}
                    actual={expense.actual_amount}
                    variance={expense.variance}
                    count={lines.length}
                />
                <DetailBreakdownChart
                    key={JSON.stringify([
                        expense.id,
                        lines.map((line) => line.id),
                    ])}
                    breakdown={expenseBreakdown(lines)}
                />
                <ExpenseLinesCard
                    key={`lines:${expense.id}`}
                    expense={expense}
                    url={`${path}/${expense.id}`}
                    onEditingChange={setEditingLines}
                />
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
                                {expense.contract_id ? (
                                    years
                                ) : (
                                    <InlineEdit
                                        value={String(expense.year)}
                                        label="Anno di imputazione"
                                        disabled={editingLines}
                                        onSave={(value) => save('year', value)}
                                    />
                                )}
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
                            (relation) => {
                                const label =
                                    relation === 'vendor'
                                        ? 'Fornitore'
                                        : relation === 'contract'
                                          ? 'Contratto'
                                          : 'Progetto';
                                const related = expense[relation];
                                const choices =
                                    options[
                                        relation === 'vendor'
                                            ? 'vendors'
                                            : relation === 'contract'
                                              ? 'contracts'
                                              : 'projects'
                                    ];
                                return (
                                    <div key={relation}>
                                        <dt className="text-xs text-muted-foreground">
                                            {label}
                                        </dt>
                                        <dd className="mt-1 flex items-center gap-2 text-sm [overflow-wrap:anywhere]">
                                            <InlineEdit
                                                value={
                                                    expense[`${relation}_id`] ==
                                                    null
                                                        ? ''
                                                        : String(
                                                              expense[
                                                                  `${relation}_id`
                                                              ],
                                                          )
                                                }
                                                label={label}
                                                disabled={editingLines}
                                                display={
                                                    related?.display_name ??
                                                    related?.name ??
                                                    'Nessuno'
                                                }
                                                choices={[
                                                    {
                                                        value: '',
                                                        label: 'Nessuno',
                                                    },
                                                    ...choices.map((item) => ({
                                                        value: String(item.id),
                                                        label: item.name,
                                                    })),
                                                ]}
                                                onSave={(value) =>
                                                    save(
                                                        `${relation}_id`,
                                                        value
                                                            ? Number(value)
                                                            : null,
                                                    )
                                                }
                                            />
                                            {related && (
                                                <Button
                                                    asChild
                                                    variant="ghost"
                                                    size="icon"
                                                >
                                                    <Link
                                                        aria-label={`Apri ${related.display_name ?? related.name}`}
                                                        href={`/t/${tenant.slug}/${relation}s/${related.id}`}
                                                    >
                                                        <ArrowUpRight />
                                                    </Link>
                                                </Button>
                                            )}
                                        </dd>
                                    </div>
                                );
                            },
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
                <DetailNotes
                    key={`notes:${expense.id}`}
                    text={expense.notes ?? ''}
                    onSave={(value) => save('notes', value || null)}
                    disabled={editingLines}
                />
                <CommentsSection
                    key={`comments:${tenant.id}:${expense.id}`}
                    tenant={tenant}
                    resource="expenses"
                    recordId={expense.id}
                />
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

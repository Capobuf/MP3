import { CommentsSection } from '@/components/management/comments-section';
import { SpreadsheetActions } from '@/components/management/spreadsheet-actions';
import { ExpenseAllocation } from '@/components/management/expense-allocation';
import type { Allocation } from '@/components/management/expense-allocation';
import { ArrowUpRight, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { Head, Link } from '@inertiajs/react';
import { AttachmentsSection } from '@/components/management/attachments-section';
import { CostCenterTags } from '@/components/management/cost-center-tags';
import { expenseBreakdown } from '@/components/management/detail-breakdown';
import { DetailBreakdownChart } from '@/components/management/detail-breakdown-chart';
import { DetailKpis } from '@/components/management/detail-kpis';
import {
    DetailHero,
    DetailEditAction,
} from '@/components/management/detail-hero';
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
    allocation,
}: {
    tenant: Tenant;
    expense: Expense;
    options: Options;
    allocation: Allocation;
}) {
    const path = `/t/${tenant.slug}/expenses`;
    const save = (field: string, value: unknown) =>
        saveInlineRecord(`${path}/${expense.id}`, { [field]: value });
    const lines = expense.lines ?? [];
    const [editingLines, setEditingLines] = useState(false);
    const years = lines.length
        ? [...new Set(lines.map((line) => line.year ?? expense.year))]
              .sort((a, b) => Number(a) - Number(b))
              .join(', ')
        : String(expense.year);
    return (
        <>
            <Head title={`${expense.title} · ${tenant.name}`} />
            <div className="@container/detail page-shell detail-enter">
                <DetailHero
                    icon={ReceiptText}
                    actions={
                        <>
                            <Badge
                                variant="secondary"
                                aria-label={`Anno di imputazione: ${years}`}
                            >
                                {years}
                            </Badge>
                            <DetailEditAction
                                href={`${path}/${expense.id}/edit`}
                                label="Modifica spesa"
                                disabled={editingLines}
                            />
                            <SpreadsheetActions
                                slug={tenant.slug}
                                resource="expenses"
                                label="Spesa"
                                filters={{ record: expense.id }}
                                printOnly
                                disabled={editingLines}
                            />
                        </>
                    }
                >
                    <InlineEdit
                        value={expense.title}
                        label="Titolo della spesa"
                        disabled={editingLines}
                        as="h1"
                        className="page-title [overflow-wrap:anywhere]"
                        onSave={(value) => save('title', value)}
                    />
                    <Link
                        href={`${path}?year=${expense.year}`}
                        className="mt-2 inline-block text-sm text-muted-foreground hover:text-foreground"
                    >
                        {tenant.name} / Spese / {expense.year}
                    </Link>
                    {!expense.contract_id &&
                        expense.period_starts_on &&
                        expense.period_ends_on && (
                            <div className="mt-3 text-sm text-muted-foreground">
                                {dateLabel(expense.period_starts_on)} –{' '}
                                {dateLabel(expense.period_ends_on)}
                            </div>
                        )}
                </DetailHero>
                <ExpenseAllocation
                    key={allocation.token}
                    slug={tenant.slug}
                    expenseId={expense.id}
                    allocation={allocation}
                    imported={expense.source_expense_id != null}
                    disabled={editingLines}
                />
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
                    className="min-w-0 rounded-xl border bg-card px-5 py-5"
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
                                {lines.length ? (
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
                        {!expense.contract_id &&
                            expense.period_starts_on &&
                            expense.period_ends_on && (
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

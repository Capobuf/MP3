import type { Tenant } from '@/types';

export type Catalog = 'vendors' | 'contracts' | 'projects';
export type Kind = Catalog | 'expenses';
export type Option = { id: number; name: string };
export type CostCenter = Option & {
    parent_id: number | null;
    parent?: Option | null;
    children?: CostCenter[];
    expenses_count?: number;
    projects_count?: number;
    contracts_count?: number;
};
export type Options = Record<Catalog, Option[]> & {
    cost_centers: CostCenter[];
};
export type ExpenseLine = {
    id?: number;
    description: string;
    type: 'allocated' | 'actual';
    unit_price: string;
    quantity: string;
    total?: string;
    position?: number;
    period_starts_on?: string | null;
    period_ends_on?: string | null;
    year?: number | string | null;
};
export type RecordData = {
    id: number;
    name?: string;
    title?: string;
    year?: number;
    vendor_id?: number | null;
    contract_id?: number | null;
    project_id?: number | null;
    vendor?: Option | null;
    contract?: Option | null;
    project?: Option | null;
    vat_number?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    description?: string | null;
    status?: string;
    reference_amount?: string | null;
    allocated_amount?: string | null;
    actual_amount?: string | null;
    variance?: string | null;
    starts_on?: string | null;
    ends_on?: string | null;
    period_starts_on?: string | null;
    period_ends_on?: string | null;
    has_period_expenses?: boolean;
    expenses_count?: number;
    lines?: ExpenseLine[];
    cost_centers?: CostCenter[];
};
export type Expense = RecordData & { title: string; year: number };
export type Pagination<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    prev_page_url: string | null;
    next_page_url: string | null;
};
export type Totals = {
    allocated: string;
    actual: string;
    variance: string;
    count: number;
    incomplete: number;
};
export type Filters = {
    year?: number;
    search?: string;
    vendor_id?: string;
    contract_id?: string;
    project_id?: string;
    sort?: string;
    direction?: string;
    status?: string;
    expiring?: string;
    linked?: string;
};
export type ExpensePageProps = {
    tenant: Tenant;
    expenses: Pagination<Expense>;
    totals: Totals;
    filters: Filters;
    years: number[];
    options: Options;
};
export const labels: Record<Kind, string> = {
    vendors: 'Fornitori',
    contracts: 'Contratti',
    projects: 'Progetti',
    expenses: 'Spese',
};
export const singular: Record<Kind, string> = {
    vendors: 'fornitore',
    contracts: 'contratto',
    projects: 'progetto',
    expenses: 'spesa',
};

export type AttachmentResource = 'contracts' | 'expenses' | 'projects';
export type Attachment = {
    id: number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    created_at: string;
    can_preview: boolean;
};
export type AttachmentLimits = {
    max_size_bytes: number;
    max_files: number;
    extensions: string[];
};
export type DeletionResult = { message: string; cleanup_failed?: boolean };

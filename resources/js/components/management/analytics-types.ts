export type Metric = 'actual' | 'allocated';
export type GroupId =
    | number
    | 'none'
    | 'others'
    | 'pianificato'
    | 'attivo'
    | 'completato';
export type EconomicValues = {
    allocated: string | null;
    actual: string | null;
    variance: string | null;
    allocated_positive: string;
    actual_positive: string;
    allocated_negative: string;
    actual_negative: string;
    count: number;
    incomplete: number;
};
export type EconomicGroup = EconomicValues & {
    id: GroupId;
    name: string;
    status?: string;
};
export type Completeness = {
    id: 'complete' | 'allocated_only' | 'actual_only' | 'missing';
    count: number;
    percentage: number | null;
};
export type EconomicSummary = EconomicValues & {
    completeness: Completeness[];
    complete_percentage: number | null;
};
export type AnnualRow = EconomicSummary & { year: number };
export type KpiComparison = {
    difference: string | null;
    percentage: number | null;
};
export type SankeyPair = EconomicValues & {
    vendor_id: number | 'none';
    destination_id: number | 'none';
};
export type EntityFilter = 'vendor_id' | 'project_id' | 'contract_id';
export type SankeyNode = {
    key: string;
    name: string;
    id?: GroupId;
    field?: EntityFilter;
};
export type SankeyData = {
    nodes: SankeyNode[];
    links: { source: number; target: number; value: number }[];
};
export type VarianceRow = {
    id: number;
    title: string;
    vendor: string;
    project: string;
    allocated: string;
    actual: string;
    variance: string;
};
export type ContractExpiry = {
    asOf: string;
    groups: { id: string; name: string; count: number }[];
    undated: number;
    upcoming: number;
};
export type ExpenseAnalytics = {
    current: EconomicSummary;
    previous: AnnualRow | null;
    comparisons: Record<'allocated' | 'actual' | 'variance', KpiComparison> & {
        completeness: { points: number | null };
    };
    annual: AnnualRow[];
    vendors: EconomicGroup[];
    projects: EconomicGroup[];
    contracts: EconomicGroup[];
    projectStatuses: EconomicGroup[];
    pairs: { projects: SankeyPair[]; contracts: SankeyPair[] };
    variances: VarianceRow[];
    expiry: ContractExpiry;
};

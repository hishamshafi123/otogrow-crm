export type BusinessKind =
  | 'CONVERSATION'
  | 'AD_REPORT'
  | 'BUDGET'
  | 'FINANCE'
  | 'CONTENT'
  | 'COMPETITOR'
  | 'RELEASE';
export type BusinessRecord = {
  id: string;
  revision: number;
  kind: BusinessKind;
  projectId: string | null;
  title: string;
  status: string;
  createdBy: string;
  taskId: string | null;
  history: { at: string; actorId: string; action: string; note: string }[];
  [key: string]: unknown;
};
export type FinanceSummary = {
  currency: string;
  cash: number;
  income30: number;
  expense30: number;
  netBurn: number;
  runwayMonths: number | null;
  revenueGrowth: number | null;
  spendingGrowth: number | null;
  receivables: number;
  overdue: number;
  projects: {
    projectId: string | null;
    revenue: number;
    costs: number;
    cashContribution: number;
    margin: number | null;
  }[];
};
export type AdvertisingInsight = {
  id: string;
  date: string;
  goal: string;
  outcomes: number;
  costPerOutcome: number | null;
  attributedRoas: number | null;
  targetCost: number;
  excessSpend: number | null;
  ageDays: number;
  stale: boolean;
  signal: string;
};
export type BusinessSnapshot = {
  advertising?: AdvertisingInsight[];
  records: BusinessRecord[];
  inbox: {
    id: string;
    conversationId: string;
    createdAt: string;
    authorId: string;
    kind: string;
    text: string;
    sourceUrl: string | null;
    sourceIds: string[];
  }[];
  seen: Record<string, string>;
  finance: FinanceSummary[];
  connections: { channel: string; status: string }[];
};

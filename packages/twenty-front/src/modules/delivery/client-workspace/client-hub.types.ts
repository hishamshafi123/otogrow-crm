export const DELIVERY_CURRENCIES = [
  'INR',
  'USD',
  'QAR',
  'AED',
  'EUR',
  'GBP',
  'SGD',
  'AUD',
  'CAD',
] as const;

export type DeliveryCurrency = (typeof DELIVERY_CURRENCIES)[number];

export const CLIENT_FEE_CADENCES = [
  'MONTHLY',
  'QUARTERLY',
  'ONE_TIME',
] as const;

export type ClientFeeCadence = (typeof CLIENT_FEE_CADENCES)[number];

export type ClientHubFee = {
  amount: number;
  currency: DeliveryCurrency;
  cadence: ClientFeeCadence;
  notes: string;
  updatedAt: string;
};

export type ClientHubDueTask = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  status: string;
  priority: string;
  service: string;
  dueAt: string | null;
  scheduledDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  isOverdue: boolean;
  isDueSoon: boolean;
};

export type ClientHubCurrencyTotal = {
  currency: string;
  amount: number;
  count: number;
};

export type ClientHubPaymentDateTarget =
  | { kind: 'BUSINESS_RECORD'; id: string; revision: number }
  | { kind: 'FINANCE_V2_JOURNAL'; id: string };

export type ClientHubPaymentItem = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  target: ClientHubPaymentDateTarget;
};

export type ClientHubFinanceEntry = {
  id: string;
  revision: number;
  title: string;
  category: 'INCOME' | 'RECEIVABLE';
  status: string;
  currency: string;
  amount: number;
  date: string;
  paidDate?: string | null;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
  externalReference: string;
  notes: string;
  paymentTarget?: ClientHubPaymentDateTarget | null;
  payments?: ClientHubPaymentItem[];
};

export type ProjectedMrrStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'ONE_TIME';

export type ProjectedMrrCurrencyBreakdown = {
  currency: DeliveryCurrency;
  projectedMrrMinor: number;
  projectedMrrMicros: string;
  projectedMrrAedMicros: string;
  clientCount: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
};

export type ProjectedMrrOneTimeCurrencyBreakdown = {
  currency: DeliveryCurrency;
  amountMinor: number;
  amountMicros: string;
  aedMicros: string;
  clientCount: number;
};

export type ProjectedMrrClientRow = {
  companyId: string;
  companyName: string;
  cadence: ClientFeeCadence;
  currency: DeliveryCurrency;
  agreedFeeMinor: number;
  agreedFeeMicros: string;
  monthlyEquivalentMinor: number;
  monthlyEquivalentMicros: string;
  monthlyEquivalentAedMicros: string;
  collectedThisMonthAedMicros: string;
  collectedInFeeCurrencyMinor: number;
  collectedInFeeCurrencyMicros: string;
  collectedTowardMrrAedMicros: string;
  remainingAedMicros: string;
  collectionPercent: number;
  status: ProjectedMrrStatus;
  notes: string;
};

export type ProjectedMrrSnapshot = {
  month: string;
  baseCurrency: DeliveryCurrency;
  exchangeRates: Record<string, string>;
  projectedMrrAedMicros: string;
  collectedTowardMrrAedMicros: string;
  totalCollectedThisMonthAedMicros: string;
  remainingAedMicros: string;
  collectionPercent: number;
  mrrClientCount: number;
  paidClientCount: number;
  partialClientCount: number;
  unpaidClientCount: number;
  byCurrency: ProjectedMrrCurrencyBreakdown[];
  oneTime: {
    clientCount: number;
    totalAedMicros: string;
    byCurrency: ProjectedMrrOneTimeCurrencyBreakdown[];
    clients: ProjectedMrrClientRow[];
  };
  clients: ProjectedMrrClientRow[];
};

export type ClientHubFinanceSnapshot = {
  canManage: boolean;
  fee: ClientHubFee | null;
  currentMonthMrr?: ProjectedMrrClientRow | null;
  openReceivablesByCurrency: ClientHubCurrencyTotal[];
  overdueReceivablesCount: number;
  collectedByCurrency: ClientHubCurrencyTotal[];
  entries: ClientHubFinanceEntry[];
};

export type ClientHubProject = {
  id: string;
  name: string;
  memberIds: string[];
  memberNames: string[];
  openTasksCount: number;
  overdueTasksCount: number;
};

export type ClientHubServicePlan = {
  id: string;
  projectId: string;
  name: string;
  services: string[];
  billing: string;
  contact: string;
  activePortalLinksCount: number;
  pendingSubmissionsCount: number;
  totalSubmissionsCount: number;
  openSharesCount: number;
};

export const CLIENT_TAG_PRESETS = [
  'Clothing Brand',
  'E-commerce',
  'Beauty & Skincare',
  'Food & Beverage',
  'SaaS',
  'Local Business',
] as const;

export type ClientHubItem = {
  id: string;
  name: string;
  domainName: string | null;
  sourceToken: string;
  isExplicitClient: boolean;
  hasDeliveryWork: boolean;
  needsAttention: boolean;
  tags?: string[];
  projects: ClientHubProject[];
  services: string[];
  billingModes: string[];
  servicePlans: ClientHubServicePlan[];
  tasksSummary: {
    openCount: number;
    overdueCount: number;
    dueSoonCount: number;
    inReviewCount: number;
    blockedCount: number;
    changesRequestedCount: number;
    completedCount: number;
  };
  dueTasks: ClientHubDueTask[];
  portal: {
    activeLinksCount: number;
    pendingSubmissionsCount: number;
    pendingClientReviewsCount: number;
  };
  finance: ClientHubFinanceSnapshot | null;
};

export type ClientHubSummary = {
  totalClients: number;
  clientsNeedingAttention: number;
  totalActiveProjects: number;
  totalOpenTasks: number;
  totalOverdueTasks: number;
  totalDueSoonTasks: number;
  totalInReviewTasks: number;
  totalBlockedTasks: number;
  totalPendingOnboarding: number;
  canReadFinance: boolean;
  canManageFinance: boolean;
  totalOpenReceivablesByCurrency: ClientHubCurrencyTotal[];
  projectedMrr?: ProjectedMrrSnapshot | null;
};

export type ClientHubSnapshot = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  observedAt: string;
  rosterConfigured: boolean;
  includedCompanyIds: string[];
  excludedCompanyIds: string[];
  summary: ClientHubSummary;
  clients: ClientHubItem[];
};

export type ClientDirectoryCandidate = {
  id: string;
  name: string;
  domainName: string | null;
  sourceToken: string;
  isClient: boolean;
  isExplicitClient: boolean;
  hasDeliveryWork: boolean;
  projectsCount: number;
};

export type ClientDirectoryCandidatesSnapshot = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  search: string;
  hasMore: boolean;
  companies: ClientDirectoryCandidate[];
};

export type ClientRosterUpdateInput =
  | { action: 'add'; companyIds: string[] }
  | { action: 'remove'; companyIds: string[] }
  | { action: 'set'; addIds: string[]; removeIds: string[] }
  | {
      action: 'setFee';
      companyId: string;
      amount: number;
      currency: DeliveryCurrency;
      cadence: ClientFeeCadence;
      notes?: string;
    }
  | { action: 'clearFee'; companyId: string }
  | { action: 'setTags'; companyId: string; tags: string[] };

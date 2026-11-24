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

export type ClientHubFinanceEntry = {
  id: string;
  revision: number;
  title: string;
  category: 'INCOME' | 'RECEIVABLE';
  status: string;
  currency: string;
  amount: number;
  date: string;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
  externalReference: string;
  notes: string;
};

export type ClientHubFinanceSnapshot = {
  canManage: boolean;
  fee: ClientHubFee | null;
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

export type ClientHubItem = {
  id: string;
  name: string;
  domainName: string | null;
  sourceToken: string;
  isExplicitClient: boolean;
  hasDeliveryWork: boolean;
  needsAttention: boolean;
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
  | { action: 'clearFee'; companyId: string };

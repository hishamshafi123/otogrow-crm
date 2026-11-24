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
  finance: {
    openReceivablesByCurrency: ClientHubCurrencyTotal[];
    overdueReceivablesCount: number;
    collectedByCurrency: ClientHubCurrencyTotal[];
  } | null;
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
  | { action: 'set'; addIds: string[]; removeIds: string[] };

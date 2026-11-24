import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { type ClientDirectoryCompany } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import {
  type ClientEngagement,
  type ClientShare,
} from 'src/modules/delivery/clients/delivery-clients.types';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';

const identifier = z.uuid();
const MAX_ROSTER_IDS = 2000;
const DUE_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ClientRosterState = {
  includedIds: string[];
  excludedIds: string[];
};

export const clientRosterUpdateSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('add'),
      companyIds: z.array(identifier).min(1).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('remove'),
      companyIds: z.array(identifier).min(1).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('set'),
      addIds: z.array(identifier).max(200),
      removeIds: z.array(identifier).max(200),
    })
    .strict(),
]);

export type ClientRosterUpdateCommand = z.infer<
  typeof clientRosterUpdateSchema
>;

export const parseClientRosterUpdate = (
  input: unknown,
): ClientRosterUpdateCommand => {
  const parsed = clientRosterUpdateSchema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Choose valid client companies before updating your client list.',
    );
  return parsed.data;
};

export const normalizeClientRoster = (
  roster?: Partial<ClientRosterState> | null,
): ClientRosterState => ({
  includedIds: [...new Set(roster?.includedIds ?? [])],
  excludedIds: [...new Set(roster?.excludedIds ?? [])],
});

export const resolveEffectiveClientCompanyIds = (
  roster: Partial<ClientRosterState> | null | undefined,
  projectCompanyIds: (string | null | undefined)[],
  engagementCompanyIds: (string | null | undefined)[],
): string[] => {
  const normalized = normalizeClientRoster(roster);
  const excluded = new Set(normalized.excludedIds);
  const effective = new Set<string>();
  for (const id of normalized.includedIds) {
    if (!excluded.has(id)) effective.add(id);
  }
  for (const id of projectCompanyIds) {
    if (id && !excluded.has(id)) effective.add(id);
  }
  for (const id of engagementCompanyIds) {
    if (id && !excluded.has(id)) effective.add(id);
  }
  return [...effective].sort();
};

export const applyClientRosterUpdate = (
  current: Partial<ClientRosterState> | null | undefined,
  command: ClientRosterUpdateCommand,
): ClientRosterState => {
  const normalized = normalizeClientRoster(current);
  const included = new Set(normalized.includedIds);
  const excluded = new Set(normalized.excludedIds);

  const addIds =
    command.action === 'add'
      ? command.companyIds
      : command.action === 'set'
        ? command.addIds
        : [];
  const removeIds =
    command.action === 'remove'
      ? command.companyIds
      : command.action === 'set'
        ? command.removeIds
        : [];

  for (const id of addIds) {
    included.add(id);
    excluded.delete(id);
  }
  for (const id of removeIds) {
    included.delete(id);
    excluded.add(id);
  }

  if (included.size > MAX_ROSTER_IDS || excluded.size > MAX_ROSTER_IDS)
    throw new BadRequestException(
      'The workspace client roster supports up to 2,000 companies.',
    );

  return {
    includedIds: [...included].sort(),
    excludedIds: [...excluded].sort(),
  };
};

export type ClientHubProjectSource = {
  id: string;
  name: string;
  companyId: string | null;
  memberIds: string[];
};

export type ClientHubTaskSource = {
  id: string;
  title: string;
  projectId: string;
  assigneeId: string | null;
  dueAt: string | Date | null;
  details: DeliveryDetails;
};

export type ClientHubLinkSource = {
  id: string;
  engagementId: string;
  expiresAt: string;
  revokedAt: string | null;
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

export type ClientHubItem = {
  id: string;
  name: string;
  domainName: string | null;
  sourceToken: string;
  isExplicitClient: boolean;
  hasDeliveryWork: boolean;
  needsAttention: boolean;
  projects: {
    id: string;
    name: string;
    memberIds: string[];
    memberNames: string[];
    openTasksCount: number;
    overdueTasksCount: number;
  }[];
  services: string[];
  billingModes: string[];
  servicePlans: {
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
  }[];
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

const toIsoOrNull = (
  value: string | Date | null | undefined,
): string | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toCurrencyList = (
  map: Map<string, { amount: number; count: number }>,
): ClientHubCurrencyTotal[] =>
  [...map.entries()]
    .map(([currency, totals]) => ({
      currency,
      amount: totals.amount,
      count: totals.count,
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));

export const buildClientHubSnapshot = ({
  companies,
  roster,
  projects,
  tasks,
  engagements,
  links,
  shares,
  businessRecords,
  memberNamesById,
  canReadFinance,
  now = new Date(),
}: {
  companies: ClientDirectoryCompany[];
  roster?: Partial<ClientRosterState> | null;
  projects: ClientHubProjectSource[];
  tasks: ClientHubTaskSource[];
  engagements: ClientEngagement[];
  links: ClientHubLinkSource[];
  shares: ClientShare[];
  businessRecords: BusinessRecord[];
  memberNamesById: Map<string, string>;
  canReadFinance: boolean;
  now?: Date;
}): { clients: ClientHubItem[]; summary: ClientHubSummary } => {
  const normalizedRoster = normalizeClientRoster(roster);
  const includedSet = new Set(normalizedRoster.includedIds);
  const nowMs = now.getTime();
  const soonCutoffMs = nowMs + DUE_SOON_WINDOW_MS;
  const todayDate = now.toISOString().slice(0, 10);

  const projectsByCompany = new Map<string, ClientHubProjectSource[]>();
  const projectById = new Map<string, ClientHubProjectSource>();
  for (const project of projects) {
    projectById.set(project.id, project);
    if (!project.companyId) continue;
    const bucket = projectsByCompany.get(project.companyId) ?? [];
    bucket.push(project);
    projectsByCompany.set(project.companyId, bucket);
  }

  const tasksByProject = new Map<string, ClientHubTaskSource[]>();
  for (const task of tasks) {
    const bucket = tasksByProject.get(task.projectId) ?? [];
    bucket.push(task);
    tasksByProject.set(task.projectId, bucket);
  }

  const engagementsByCompany = new Map<string, ClientEngagement[]>();
  for (const engagement of engagements) {
    const bucket = engagementsByCompany.get(engagement.companyId) ?? [];
    bucket.push(engagement);
    engagementsByCompany.set(engagement.companyId, bucket);
  }

  const activeLinksByEngagement = new Map<string, number>();
  for (const link of links) {
    if (link.revokedAt) continue;
    const expiresMs = Date.parse(link.expiresAt);
    if (!Number.isNaN(expiresMs) && expiresMs < nowMs) continue;
    activeLinksByEngagement.set(
      link.engagementId,
      (activeLinksByEngagement.get(link.engagementId) ?? 0) + 1,
    );
  }

  const sharesByEngagement = new Map<string, ClientShare[]>();
  for (const share of shares) {
    if (share.withdrawnAt) continue;
    const bucket = sharesByEngagement.get(share.engagementId) ?? [];
    bucket.push(share);
    sharesByEngagement.set(share.engagementId, bucket);
  }

  const financeByCompany = new Map<
    string,
    {
      openReceivables: Map<string, { amount: number; count: number }>;
      collected: Map<string, { amount: number; count: number }>;
      overdueReceivablesCount: number;
    }
  >();

  const totalOpenReceivables = new Map<
    string,
    { amount: number; count: number }
  >();

  if (canReadFinance) {
    for (const record of businessRecords) {
      if (record.kind !== 'FINANCE' || record.status === 'VOID') continue;
      if (!record.projectId) continue;
      const project = projectById.get(record.projectId);
      if (!project?.companyId) continue;

      let bucket = financeByCompany.get(project.companyId);
      if (!bucket) {
        bucket = {
          openReceivables: new Map(),
          collected: new Map(),
          overdueReceivablesCount: 0,
        };
        financeByCompany.set(project.companyId, bucket);
      }

      if (record.category === 'RECEIVABLE' && record.status !== 'PAID') {
        const entry = bucket.openReceivables.get(record.currency) ?? {
          amount: 0,
          count: 0,
        };
        entry.amount += record.amount;
        entry.count += 1;
        bucket.openReceivables.set(record.currency, entry);

        const totalEntry = totalOpenReceivables.get(record.currency) ?? {
          amount: 0,
          count: 0,
        };
        totalEntry.amount += record.amount;
        totalEntry.count += 1;
        totalOpenReceivables.set(record.currency, totalEntry);

        if (record.dueDate && record.dueDate < todayDate) {
          bucket.overdueReceivablesCount += 1;
        }
      } else if (
        record.category === 'INCOME' ||
        (record.category === 'RECEIVABLE' && record.status === 'PAID')
      ) {
        const entry = bucket.collected.get(record.currency) ?? {
          amount: 0,
          count: 0,
        };
        entry.amount += record.amount;
        entry.count += 1;
        bucket.collected.set(record.currency, entry);
      }
    }
  }

  let clientsNeedingAttention = 0;
  let totalActiveProjects = 0;
  let totalOpenTasks = 0;
  let totalOverdueTasks = 0;
  let totalDueSoonTasks = 0;
  let totalInReviewTasks = 0;
  let totalBlockedTasks = 0;
  let totalPendingOnboarding = 0;

  const clients: ClientHubItem[] = companies.map((company) => {
    const companyProjects = projectsByCompany.get(company.id) ?? [];
    const companyEngagements = engagementsByCompany.get(company.id) ?? [];

    let openCount = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;
    let inReviewCount = 0;
    let blockedCount = 0;
    let changesRequestedCount = 0;
    let completedCount = 0;

    const allOpenTasks: ClientHubDueTask[] = [];

    const projectSummaries = companyProjects.map((project) => {
      const projectTasks = tasksByProject.get(project.id) ?? [];
      let projectOpen = 0;
      let projectOverdue = 0;

      for (const task of projectTasks) {
        const status = task.details.state;
        if (status === 'APPROVED') {
          completedCount += 1;
          continue;
        }
        openCount += 1;
        projectOpen += 1;
        if (status === 'IN_REVIEW') inReviewCount += 1;
        if (status === 'BLOCKED') blockedCount += 1;
        if (status === 'CHANGES_REQUESTED') changesRequestedCount += 1;

        const dueIso = toIsoOrNull(task.dueAt);
        const dueMs = dueIso ? Date.parse(dueIso) : Number.NaN;
        const isOverdue = !Number.isNaN(dueMs) && dueMs < nowMs;
        const isDueSoon =
          !isOverdue && !Number.isNaN(dueMs) && dueMs <= soonCutoffMs;

        if (isOverdue) {
          overdueCount += 1;
          projectOverdue += 1;
        } else if (isDueSoon) {
          dueSoonCount += 1;
        }

        allOpenTasks.push({
          id: task.id,
          title: task.title,
          projectId: project.id,
          projectName: project.name,
          status,
          priority: task.details.priority,
          service: task.details.service,
          dueAt: dueIso,
          scheduledDate: task.details.scheduledDate ?? null,
          assigneeId: task.assigneeId,
          assigneeName: task.assigneeId
            ? (memberNamesById.get(task.assigneeId) ?? null)
            : null,
          isOverdue,
          isDueSoon,
        });
      }

      return {
        id: project.id,
        name: project.name,
        memberIds: project.memberIds,
        memberNames: project.memberIds
          .map((memberId) => memberNamesById.get(memberId))
          .filter((name): name is string => Boolean(name)),
        openTasksCount: projectOpen,
        overdueTasksCount: projectOverdue,
      };
    });

    allOpenTasks.sort((left, right) => {
      if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1;
      if (left.dueAt && right.dueAt) {
        const diff = Date.parse(left.dueAt) - Date.parse(right.dueAt);
        if (diff !== 0) return diff;
      } else if (left.dueAt || right.dueAt) {
        return left.dueAt ? -1 : 1;
      }
      if (left.priority !== right.priority) {
        if (left.priority === 'HIGH') return -1;
        if (right.priority === 'HIGH') return 1;
      }
      return left.title.localeCompare(right.title);
    });

    const serviceSet = new Set<string>();
    const billingSet = new Set<string>();
    let activeLinksCount = 0;
    let pendingSubmissionsCount = 0;
    let pendingClientReviewsCount = 0;

    const servicePlans = companyEngagements.map((engagement) => {
      for (const service of engagement.services) serviceSet.add(service);
      billingSet.add(engagement.billing);

      const activePlanLinks = activeLinksByEngagement.get(engagement.id) ?? 0;
      const pendingPlanSubmissions = engagement.submissions.filter(
        (submission) => !submission.acceptedBy,
      ).length;
      const planShares = sharesByEngagement.get(engagement.id) ?? [];
      const waitingShares = planShares.filter(
        (share) =>
          !share.reviews.some((review) => review.decision === 'APPROVED'),
      ).length;

      activeLinksCount += activePlanLinks;
      pendingSubmissionsCount += pendingPlanSubmissions;
      pendingClientReviewsCount += waitingShares;

      return {
        id: engagement.id,
        projectId: engagement.projectId,
        name: engagement.name,
        services: engagement.services,
        billing: engagement.billing,
        contact: engagement.contact,
        activePortalLinksCount: activePlanLinks,
        pendingSubmissionsCount: pendingPlanSubmissions,
        totalSubmissionsCount: engagement.submissions.length,
        openSharesCount: waitingShares,
      };
    });

    const financeBucket = canReadFinance
      ? financeByCompany.get(company.id)
      : undefined;
    const overdueReceivablesCount = financeBucket?.overdueReceivablesCount ?? 0;
    const finance = canReadFinance
      ? {
          openReceivablesByCurrency: financeBucket
            ? toCurrencyList(financeBucket.openReceivables)
            : [],
          overdueReceivablesCount,
          collectedByCurrency: financeBucket
            ? toCurrencyList(financeBucket.collected)
            : [],
        }
      : null;

    const needsAttention =
      overdueCount > 0 ||
      blockedCount > 0 ||
      changesRequestedCount > 0 ||
      pendingSubmissionsCount > 0 ||
      overdueReceivablesCount > 0;

    if (needsAttention) clientsNeedingAttention += 1;
    totalActiveProjects += projectSummaries.length;
    totalOpenTasks += openCount;
    totalOverdueTasks += overdueCount;
    totalDueSoonTasks += dueSoonCount;
    totalInReviewTasks += inReviewCount;
    totalBlockedTasks += blockedCount;
    totalPendingOnboarding += pendingSubmissionsCount;

    return {
      id: company.id,
      name: company.name,
      domainName: company.domainName,
      sourceToken: company.sourceToken,
      isExplicitClient: includedSet.has(company.id),
      hasDeliveryWork:
        projectSummaries.length > 0 || companyEngagements.length > 0,
      needsAttention,
      projects: projectSummaries,
      services: [...serviceSet].sort(),
      billingModes: [...billingSet].sort(),
      servicePlans,
      tasksSummary: {
        openCount,
        overdueCount,
        dueSoonCount,
        inReviewCount,
        blockedCount,
        changesRequestedCount,
        completedCount,
      },
      dueTasks: allOpenTasks.slice(0, 6),
      portal: {
        activeLinksCount,
        pendingSubmissionsCount,
        pendingClientReviewsCount,
      },
      finance,
    };
  });

  clients.sort((left, right) => {
    if (left.tasksSummary.overdueCount !== right.tasksSummary.overdueCount) {
      return right.tasksSummary.overdueCount - left.tasksSummary.overdueCount;
    }
    if (left.needsAttention !== right.needsAttention) {
      return left.needsAttention ? -1 : 1;
    }
    if (left.tasksSummary.openCount !== right.tasksSummary.openCount) {
      return right.tasksSummary.openCount - left.tasksSummary.openCount;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    clients,
    summary: {
      totalClients: clients.length,
      clientsNeedingAttention,
      totalActiveProjects,
      totalOpenTasks,
      totalOverdueTasks,
      totalDueSoonTasks,
      totalInReviewTasks,
      totalBlockedTasks,
      totalPendingOnboarding,
      canReadFinance,
      totalOpenReceivablesByCurrency: canReadFinance
        ? toCurrencyList(totalOpenReceivables)
        : [],
    },
  };
};

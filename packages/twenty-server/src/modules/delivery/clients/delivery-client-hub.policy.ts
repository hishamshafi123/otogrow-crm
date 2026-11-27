import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { type ClientDirectoryCompany } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import {
  type ClientEngagement,
  type ClientShare,
} from 'src/modules/delivery/clients/delivery-clients.types';
import {
  deliveryCurrencySchema,
  deliveryMoneySchema,
  type BusinessRecord,
} from 'src/modules/delivery/business/delivery-business.types';
import { type ClientFeeSetting } from 'src/modules/delivery/operations/delivery-operations.types';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import {
  CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX,
  CLIENT_BUSINESS_PAYMENT_REF_TYPE,
  deterministicClientReceivableInvoiceId,
  microsToMinorUnits,
} from 'src/modules/delivery/finance-v2/finance-v2-client-sync.util';
import {
  computeProjectedMrrSnapshot,
  type ProjectedMrrClientRow,
  type ProjectedMrrSnapshot,
} from 'src/modules/delivery/finance-v2/finance-v2-mrr.util';

const identifier = z.uuid();
const MAX_ROSTER_IDS = 2000;
const DUE_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ClientRosterState = {
  includedIds: string[];
  excludedIds: string[];
};

export const CLIENT_TAG_PRESETS = [
  'Clothing Brand',
  'E-commerce',
  'Beauty & Skincare',
  'Food & Beverage',
  'SaaS',
  'Local Business',
] as const;

export const normalizeClientTags = (tags?: string[] | null): string[] => {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const clean = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= 12) break;
  }
  return result;
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
  z
    .object({
      action: z.literal('setFee'),
      companyId: identifier,
      amount: deliveryMoneySchema.refine((value) => value > 0, {
        message: 'Fee amount must be greater than zero.',
      }),
      currency: deliveryCurrencySchema,
      cadence: z.enum(['MONTHLY', 'QUARTERLY', 'ONE_TIME']),
      notes: z.string().trim().max(500).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('clearFee'),
      companyId: identifier,
    })
    .strict(),
  z
    .object({
      action: z.literal('setTags'),
      companyId: identifier,
      tags: z.array(z.string().trim().min(1).max(40)).max(12),
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
  if (!parsed.success) {
    const action =
      typeof input === 'object' && input !== null && 'action' in input
        ? (input as { action?: unknown }).action
        : null;
    if (action === 'setFee' || action === 'clearFee') {
      throw new BadRequestException(
        'Enter a valid positive agreed fee amount, currency, and billing cadence.',
      );
    }
    if (action === 'setTags') {
      throw new BadRequestException(
        'Provide up to 12 short client tags (1–40 characters each).',
      );
    }
    throw new BadRequestException(
      'Choose valid client companies before updating your client list.',
    );
  }
  return parsed.data;
};

export const normalizeClientRoster = (
  roster?: Partial<ClientRosterState> | null,
): ClientRosterState => ({
  includedIds: [...new Set(roster?.includedIds ?? [])],
  excludedIds: [...new Set(roster?.excludedIds ?? [])],
});

// Effective clients include explicitly added companies plus companies with
// delivery projects or client engagements, while always honoring explicit
// exclusions ("Not a client"). General CRM / Gmail-synced companies without
// delivery work remain out automatically.
export const resolveEffectiveClientCompanyIds = (
  roster: Partial<ClientRosterState> | null | undefined,
  projectCompanyIds: (string | null | undefined)[] = [],
  engagementCompanyIds: (string | null | undefined)[] = [],
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

export const includeCompanyInClientRoster = (
  current: Partial<ClientRosterState> | null | undefined,
  companyId: string,
  options?: { forceReinclude?: boolean },
): { roster: ClientRosterState; changed: boolean } => {
  const normalized = normalizeClientRoster(current);
  const forceReinclude = options?.forceReinclude ?? true;
  const included = new Set(normalized.includedIds);
  const excluded = new Set(normalized.excludedIds);

  if (excluded.has(companyId) && !forceReinclude) {
    return { roster: normalized, changed: false };
  }

  const wasIncluded = included.has(companyId);
  const wasExcluded = excluded.has(companyId);
  if (wasIncluded && !wasExcluded) {
    return { roster: normalized, changed: false };
  }

  if (!wasIncluded && included.size >= MAX_ROSTER_IDS) {
    return { roster: normalized, changed: false };
  }

  included.add(companyId);
  excluded.delete(companyId);
  return {
    roster: {
      includedIds: [...included].sort(),
      excludedIds: [...excluded].sort(),
    },
    changed: true,
  };
};

export const applyClientRosterUpdate = (
  current: Partial<ClientRosterState> | null | undefined,
  command: ClientRosterUpdateCommand,
): ClientRosterState => {
  const normalized = normalizeClientRoster(current);
  if (
    command.action === 'setFee' ||
    command.action === 'clearFee' ||
    command.action === 'setTags'
  ) {
    return normalized;
  }
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

export type ClientHubFinanceSnapshot = {
  canManage: boolean;
  fee: ClientFeeSetting | null;
  currentMonthMrr: ProjectedMrrClientRow | null;
  openReceivablesByCurrency: ClientHubCurrencyTotal[];
  overdueReceivablesCount: number;
  collectedByCurrency: ClientHubCurrencyTotal[];
  entries: ClientHubFinanceEntry[];
};

export type ClientHubItem = {
  id: string;
  name: string;
  domainName: string | null;
  sourceToken: string;
  isExplicitClient: boolean;
  hasDeliveryWork: boolean;
  needsAttention: boolean;
  tags: string[];
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
  projectedMrr: ProjectedMrrSnapshot | null;
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

export type ClientHubFinanceV2InvoiceSource = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  projectId: string | null;
  currency: string;
  issueDate: string;
  dueDate: string;
  totalMicros: string;
  paidMicros: string;
  status: string;
  notes: string;
};

export type ClientHubFinanceV2PaymentJournalSource = {
  id: string;
  entryDate: string;
  title: string;
  notes: string;
  currency: string;
  amountMicros: string;
  aedAmountMicros?: string | null;
  projectId: string | null;
  sourceRefType: string | null;
  sourceRefId: string | null;
  status: string;
  reversed?: boolean;
};

export const buildClientHubSnapshot = ({
  workspaceId,
  companies,
  roster,
  clientFees,
  clientTags,
  projects,
  tasks,
  engagements,
  links,
  shares,
  businessRecords,
  financeV2Invoices = [],
  financeV2PaymentJournals = [],
  exchangeRates,
  timeZone,
  memberNamesById,
  canReadFinance,
  canManageFinance = false,
  now = new Date(),
}: {
  workspaceId?: string;
  companies: ClientDirectoryCompany[];
  roster?: Partial<ClientRosterState> | null;
  clientFees?: Record<string, ClientFeeSetting> | null;
  clientTags?: Record<string, string[]> | null;
  projects: ClientHubProjectSource[];
  tasks: ClientHubTaskSource[];
  engagements: ClientEngagement[];
  links: ClientHubLinkSource[];
  shares: ClientShare[];
  businessRecords: BusinessRecord[];
  financeV2Invoices?: ClientHubFinanceV2InvoiceSource[];
  financeV2PaymentJournals?: ClientHubFinanceV2PaymentJournalSource[];
  exchangeRates?: Record<string, string> | null;
  timeZone?: string | null;
  memberNamesById: Map<string, string>;
  canReadFinance: boolean;
  canManageFinance?: boolean;
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
      entries: ClientHubFinanceEntry[];
    }
  >();

  const totalOpenReceivables = new Map<
    string,
    { amount: number; count: number }
  >();

  const getOrCreateFinanceBucket = (companyId: string) => {
    let bucket = financeByCompany.get(companyId);
    if (!bucket) {
      bucket = {
        openReceivables: new Map(),
        collected: new Map(),
        overdueReceivablesCount: 0,
        entries: [],
      };
      financeByCompany.set(companyId, bucket);
    }
    return bucket;
  };

  const addCurrencyTotal = (
    map: Map<string, { amount: number; count: number }>,
    currency: string,
    amount: number,
  ) => {
    const existing = map.get(currency) ?? { amount: 0, count: 0 };
    existing.amount += amount;
    existing.count += 1;
    map.set(currency, existing);
  };

  if (canReadFinance) {
    const companyNameCounts = new Map<string, number>();
    for (const company of companies) {
      const normalized = company.name.trim().toLocaleLowerCase();
      if (!normalized) continue;
      companyNameCounts.set(
        normalized,
        (companyNameCounts.get(normalized) ?? 0) + 1,
      );
    }
    const companyIdByUniqueName = new Map<string, string>();
    for (const company of companies) {
      const normalized = company.name.trim().toLocaleLowerCase();
      if (normalized && companyNameCounts.get(normalized) === 1) {
        companyIdByUniqueName.set(normalized, company.id);
      }
    }

    const financeV2InvoiceById = new Map(
      financeV2Invoices.map((invoice) => [invoice.id, invoice]),
    );
    const inactiveSyncedJournalRefs = new Set<string>();
    const activeSyncedJournalRefs = new Set<string>();
    const activeJournalBySyncKey = new Map<
      string,
      ClientHubFinanceV2PaymentJournalSource
    >();
    const activePaymentJournalsByInvoiceId = new Map<
      string,
      ClientHubFinanceV2PaymentJournalSource[]
    >();
    for (const journal of financeV2PaymentJournals) {
      if (!journal.sourceRefType || !journal.sourceRefId) continue;
      const key = `${journal.sourceRefType}::${journal.sourceRefId}`;
      if (journal.status === 'POSTED' && !journal.reversed) {
        activeSyncedJournalRefs.add(key);
        activeJournalBySyncKey.set(key, journal);
        if (journal.sourceRefType === 'INVOICE_PAYMENT') {
          const [invoiceId] = journal.sourceRefId.split(':');
          if (invoiceId) {
            const list = activePaymentJournalsByInvoiceId.get(invoiceId) ?? [];
            list.push(journal);
            activePaymentJournalsByInvoiceId.set(invoiceId, list);
          }
        }
      } else {
        inactiveSyncedJournalRefs.add(key);
      }
    }
    for (const list of activePaymentJournalsByInvoiceId.values()) {
      list.sort((left, right) => right.entryDate.localeCompare(left.entryDate));
    }

    const activeFinanceRecords = businessRecords.filter(
      (record): record is Extract<BusinessRecord, { kind: 'FINANCE' }> =>
        record.kind === 'FINANCE' && record.status !== 'VOID',
    );
    const activeFinanceRecordById = new Map(
      activeFinanceRecords.map((record) => [record.id, record]),
    );
    const businessRecordIds = new Set(
      businessRecords
        .filter((record) => record.kind === 'FINANCE')
        .map((record) => record.id),
    );
    const isIncomeRecordVoidedInV2 = (
      record: Extract<BusinessRecord, { kind: 'FINANCE' }>,
    ): boolean => {
      let syncKey: string | null = null;
      if (record.externalReference.startsWith('receivable:') && workspaceId) {
        const recId = record.externalReference.slice('receivable:'.length);
        const linkedInvId = deterministicClientReceivableInvoiceId(
          workspaceId,
          recId,
        );
        syncKey = `INVOICE_PAYMENT::${linkedInvId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${record.id}`;
      } else {
        syncKey = `${CLIENT_BUSINESS_PAYMENT_REF_TYPE}::${record.id}`;
      }
      return Boolean(
        syncKey &&
          inactiveSyncedJournalRefs.has(syncKey) &&
          !activeSyncedJournalRefs.has(syncKey),
      );
    };

    const linkedReceiptReceivableIds = new Set<string>();
    const activeReceiptByReceivableId = new Map<
      string,
      Extract<BusinessRecord, { kind: 'FINANCE' }>
    >();
    const receivableIds = new Set<string>();
    for (const record of activeFinanceRecords) {
      if (record.category === 'RECEIVABLE') {
        receivableIds.add(record.id);
      }
      if (
        record.category === 'INCOME' &&
        record.externalReference.startsWith('receivable:') &&
        !isIncomeRecordVoidedInV2(record)
      ) {
        const receivableId = record.externalReference.slice(
          'receivable:'.length,
        );
        linkedReceiptReceivableIds.add(receivableId);
        activeReceiptByReceivableId.set(receivableId, record);
      }
    }

    const buildPaymentsForInvoiceId = (
      invoiceId: string,
    ): ClientHubPaymentItem[] => {
      const journals = activePaymentJournalsByInvoiceId.get(invoiceId) ?? [];
      return journals
        .map((journal): ClientHubPaymentItem | null => {
          const amountMinor = microsToMinorUnits(journal.amountMicros);
          if (amountMinor <= 0) return null;
          let target: ClientHubPaymentDateTarget = {
            kind: 'FINANCE_V2_JOURNAL',
            id: journal.id,
          };
          if (journal.sourceRefId) {
            const [, suffix] = journal.sourceRefId.split(':');
            if (suffix?.startsWith(CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX)) {
              const linkedRecId = suffix.slice(
                CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX.length,
              );
              const linkedRec = activeFinanceRecordById.get(linkedRecId);
              if (linkedRec) {
                target = {
                  kind: 'BUSINESS_RECORD',
                  id: linkedRec.id,
                  revision: linkedRec.revision,
                };
              }
            }
          }
          return {
            id: journal.id,
            date: journal.entryDate,
            amount: amountMinor,
            currency: journal.currency,
            target,
          };
        })
        .filter((item): item is ClientHubPaymentItem => item !== null);
    };

    const syncedBusinessInvoiceIds = new Set<string>();

    for (const record of activeFinanceRecords) {
      if (record.category !== 'RECEIVABLE' && record.category !== 'INCOME')
        continue;
      const project = record.projectId
        ? projectById.get(record.projectId)
        : undefined;
      const targetCompanyId = project?.companyId ?? record.companyId ?? null;
      if (!targetCompanyId) continue;

      let incomeSyncedJournal: ClientHubFinanceV2PaymentJournalSource | null =
        null;
      if (record.category === 'INCOME') {
        if (isIncomeRecordVoidedInV2(record)) {
          continue;
        }
        if (record.externalReference.startsWith('receivable:') && workspaceId) {
          const recId = record.externalReference.slice('receivable:'.length);
          const linkedInvId = deterministicClientReceivableInvoiceId(
            workspaceId,
            recId,
          );
          incomeSyncedJournal =
            activeJournalBySyncKey.get(
              `INVOICE_PAYMENT::${linkedInvId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${record.id}`,
            ) ??
            activeJournalBySyncKey.get(
              `${CLIENT_BUSINESS_PAYMENT_REF_TYPE}::${record.id}`,
            ) ??
            null;
        } else {
          incomeSyncedJournal =
            activeJournalBySyncKey.get(
              `${CLIENT_BUSINESS_PAYMENT_REF_TYPE}::${record.id}`,
            ) ?? null;
        }
      }

      const linkedV2Invoice =
        record.category === 'RECEIVABLE' && workspaceId
          ? financeV2InvoiceById.get(
              deterministicClientReceivableInvoiceId(workspaceId, record.id),
            )
          : undefined;
      if (linkedV2Invoice) {
        syncedBusinessInvoiceIds.add(linkedV2Invoice.id);
        if (linkedV2Invoice.status === 'VOID') {
          continue;
        }
      }

      const bucket = getOrCreateFinanceBucket(targetCompanyId);

      const isAutoReceiptForVisibleReceivable =
        record.category === 'INCOME' &&
        record.externalReference.startsWith('receivable:') &&
        receivableIds.has(record.externalReference.slice('receivable:'.length));

      if (
        record.category === 'RECEIVABLE' &&
        record.status !== 'PAID' &&
        linkedV2Invoice
      ) {
        const totalMinor = microsToMinorUnits(linkedV2Invoice.totalMicros);
        const paidMinor = microsToMinorUnits(linkedV2Invoice.paidMicros);
        const remainingMinor = Math.max(0, totalMinor - paidMinor);

        if (paidMinor > 0) {
          addCurrencyTotal(bucket.collected, record.currency, paidMinor);
        }
        if (remainingMinor > 0) {
          addCurrencyTotal(
            bucket.openReceivables,
            record.currency,
            remainingMinor,
          );
          addCurrencyTotal(
            totalOpenReceivables,
            record.currency,
            remainingMinor,
          );
          if (record.dueDate && record.dueDate < todayDate) {
            bucket.overdueReceivablesCount += 1;
          }
        }
        const entryPayments = buildPaymentsForInvoiceId(linkedV2Invoice.id);
        bucket.entries.push({
          id: record.id,
          revision: record.revision,
          title: record.title,
          category: record.category,
          status:
            remainingMinor === 0
              ? 'PAID'
              : paidMinor > 0
                ? 'PARTIALLY_PAID'
                : record.status,
          currency: record.currency,
          amount: remainingMinor > 0 ? remainingMinor : totalMinor,
          date: record.date,
          paidDate: entryPayments[0]?.date ?? null,
          dueDate: record.dueDate ?? null,
          projectId: record.projectId ?? null,
          projectName: project?.name ?? null,
          externalReference:
            record.externalReference || linkedV2Invoice.invoiceNumber,
          notes: record.notes,
          paymentTarget:
            entryPayments.length === 1 ? entryPayments[0].target : null,
          payments: entryPayments,
        });
        continue;
      }

      if (!isAutoReceiptForVisibleReceivable) {
        let entryDate = record.date;
        let paidDate: string | null = null;
        let paymentTarget: ClientHubPaymentDateTarget | null = null;
        let entryPayments: ClientHubPaymentItem[] = [];

        if (record.category === 'INCOME') {
          const resolvedDate = incomeSyncedJournal?.entryDate ?? record.date;
          entryDate = resolvedDate;
          paidDate = resolvedDate;
          paymentTarget = {
            kind: 'BUSINESS_RECORD',
            id: record.id,
            revision: record.revision,
          };
          entryPayments = [
            {
              id: record.id,
              date: resolvedDate,
              amount: record.amount,
              currency: record.currency,
              target: paymentTarget,
            },
          ];
        } else if (
          record.category === 'RECEIVABLE' &&
          record.status === 'PAID'
        ) {
          const activeReceipt = activeReceiptByReceivableId.get(record.id);
          if (activeReceipt) {
            const linkedInvId = workspaceId
              ? deterministicClientReceivableInvoiceId(workspaceId, record.id)
              : null;
            const receiptJournal =
              (linkedInvId
                ? activeJournalBySyncKey.get(
                    `INVOICE_PAYMENT::${linkedInvId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${activeReceipt.id}`,
                  )
                : undefined) ??
              activeJournalBySyncKey.get(
                `${CLIENT_BUSINESS_PAYMENT_REF_TYPE}::${activeReceipt.id}`,
              ) ??
              null;
            paidDate = receiptJournal?.entryDate ?? activeReceipt.date;
            paymentTarget = {
              kind: 'BUSINESS_RECORD',
              id: activeReceipt.id,
              revision: activeReceipt.revision,
            };
            entryPayments = [
              {
                id: activeReceipt.id,
                date: paidDate,
                amount: activeReceipt.amount,
                currency: activeReceipt.currency,
                target: paymentTarget,
              },
            ];
          } else {
            const invoicePayments = linkedV2Invoice
              ? buildPaymentsForInvoiceId(linkedV2Invoice.id)
              : [];
            if (invoicePayments.length > 0) {
              entryPayments = invoicePayments;
              paidDate = invoicePayments[0].date;
              paymentTarget =
                invoicePayments.length === 1 ? invoicePayments[0].target : null;
            } else {
              paidDate = record.date;
              paymentTarget = {
                kind: 'BUSINESS_RECORD',
                id: record.id,
                revision: record.revision,
              };
              entryPayments = [
                {
                  id: record.id,
                  date: record.date,
                  amount: record.amount,
                  currency: record.currency,
                  target: paymentTarget,
                },
              ];
            }
          }
        }

        bucket.entries.push({
          id: record.id,
          revision: record.revision,
          title: record.title,
          category: record.category,
          status: record.status,
          currency: record.currency,
          amount: record.amount,
          date: entryDate,
          paidDate,
          dueDate: record.dueDate ?? null,
          projectId: record.projectId ?? null,
          projectName: project?.name ?? null,
          externalReference: record.externalReference,
          notes: record.notes,
          paymentTarget,
          payments: entryPayments,
        });
      }

      if (record.category === 'RECEIVABLE' && record.status !== 'PAID') {
        addCurrencyTotal(bucket.openReceivables, record.currency, record.amount);
        addCurrencyTotal(totalOpenReceivables, record.currency, record.amount);
        if (record.dueDate && record.dueDate < todayDate) {
          bucket.overdueReceivablesCount += 1;
        }
      } else if (
        record.category === 'INCOME' ||
        (record.category === 'RECEIVABLE' &&
          record.status === 'PAID' &&
          !linkedReceiptReceivableIds.has(record.id))
      ) {
        addCurrencyTotal(bucket.collected, record.currency, record.amount);
      }
    }

    // Merge native Finance V2 invoices created in Business → Finance that belong to a client.
    const matchedFinanceV2InvoiceIds = new Set<string>();
    for (const invoice of financeV2Invoices) {
      if (invoice.status === 'VOID') continue;
      if (syncedBusinessInvoiceIds.has(invoice.id)) continue;

      const project = invoice.projectId
        ? projectById.get(invoice.projectId)
        : undefined;
      const targetCompanyId =
        project?.companyId ??
        companyIdByUniqueName.get(invoice.clientName.trim().toLocaleLowerCase()) ??
        null;
      if (!targetCompanyId) continue;

      matchedFinanceV2InvoiceIds.add(invoice.id);
      const bucket = getOrCreateFinanceBucket(targetCompanyId);
      const totalMinor = microsToMinorUnits(invoice.totalMicros);
      const paidMinor = microsToMinorUnits(invoice.paidMicros);
      const remainingMinor = Math.max(0, totalMinor - paidMinor);

      if (paidMinor > 0) {
        addCurrencyTotal(bucket.collected, invoice.currency, paidMinor);
      }
      if (remainingMinor > 0) {
        addCurrencyTotal(
          bucket.openReceivables,
          invoice.currency,
          remainingMinor,
        );
        addCurrencyTotal(totalOpenReceivables, invoice.currency, remainingMinor);
        if (invoice.dueDate && invoice.dueDate < todayDate) {
          bucket.overdueReceivablesCount += 1;
        }
      }

      const invoicePayments = buildPaymentsForInvoiceId(invoice.id);
      bucket.entries.push({
        id: invoice.id,
        revision: 0,
        title: invoice.clientName
          ? `${invoice.invoiceNumber} · ${invoice.clientName}`
          : invoice.invoiceNumber,
        category: 'RECEIVABLE',
        status:
          remainingMinor === 0
            ? 'PAID'
            : paidMinor > 0
              ? 'PARTIALLY_PAID'
              : 'OPEN',
        currency: invoice.currency,
        amount: remainingMinor > 0 ? remainingMinor : totalMinor,
        date: invoice.issueDate,
        paidDate: invoicePayments[0]?.date ?? null,
        dueDate: invoice.dueDate ?? null,
        projectId: invoice.projectId ?? null,
        projectName: project?.name ?? null,
        externalReference: invoice.invoiceNumber,
        notes: invoice.notes,
        paymentTarget:
          invoicePayments.length === 1 ? invoicePayments[0].target : null,
        payments: invoicePayments,
      });
    }

    // Merge any standalone project-linked Finance V2 payment journals not already covered above.
    for (const journal of financeV2PaymentJournals) {
      if (journal.status !== 'POSTED' || journal.reversed) continue;
      if (
        journal.sourceRefType === CLIENT_BUSINESS_PAYMENT_REF_TYPE &&
        journal.sourceRefId &&
        businessRecordIds.has(journal.sourceRefId)
      ) {
        continue;
      }
      if (journal.sourceRefType === 'INVOICE_PAYMENT' && journal.sourceRefId) {
        const [invoiceId, suffix] = journal.sourceRefId.split(':');
        if (
          syncedBusinessInvoiceIds.has(invoiceId) ||
          matchedFinanceV2InvoiceIds.has(invoiceId) ||
          suffix?.startsWith(CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX)
        ) {
          continue;
        }
      }
      const project = journal.projectId
        ? projectById.get(journal.projectId)
        : undefined;
      const targetCompanyId = project?.companyId ?? null;
      if (!targetCompanyId) continue;

      const amountMinor = microsToMinorUnits(journal.amountMicros);
      if (amountMinor <= 0) continue;
      const bucket = getOrCreateFinanceBucket(targetCompanyId);
      addCurrencyTotal(bucket.collected, journal.currency, amountMinor);
      const paymentTarget: ClientHubPaymentDateTarget = {
        kind: 'FINANCE_V2_JOURNAL',
        id: journal.id,
      };
      bucket.entries.push({
        id: journal.id,
        revision: 0,
        title: journal.title,
        category: 'INCOME',
        status: 'POSTED',
        currency: journal.currency,
        amount: amountMinor,
        date: journal.entryDate,
        paidDate: journal.entryDate,
        dueDate: null,
        projectId: journal.projectId ?? null,
        projectName: project?.name ?? null,
        externalReference: '',
        notes: journal.notes,
        paymentTarget,
        payments: [
          {
            id: journal.id,
            date: journal.entryDate,
            amount: amountMinor,
            currency: journal.currency,
            target: paymentTarget,
          },
        ],
      });
    }

    for (const bucket of financeByCompany.values()) {
      bucket.entries.sort((left, right) => {
        const leftOpen =
          left.category === 'RECEIVABLE' && left.status !== 'PAID';
        const rightOpen =
          right.category === 'RECEIVABLE' && right.status !== 'PAID';
        if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
        const leftDate = left.paidDate ?? left.date;
        const rightDate = right.paidDate ?? right.date;
        const dateDiff = rightDate.localeCompare(leftDate);
        if (dateDiff !== 0) return dateDiff;
        return left.title.localeCompare(right.title);
      });
    }
  }

  const projectedMrr = canReadFinance
    ? computeProjectedMrrSnapshot({
        workspaceId,
        activeClients: companies.map((company) => ({
          id: company.id,
          name: company.name,
        })),
        clientFees,
        projects: projects.map((project) => ({
          id: project.id,
          companyId: project.companyId,
        })),
        businessRecords,
        financeV2Invoices: financeV2Invoices.map((invoice) => ({
          id: invoice.id,
          clientName: invoice.clientName,
          projectId: invoice.projectId,
          currency: invoice.currency,
          status: invoice.status,
        })),
        financeV2PaymentJournals: financeV2PaymentJournals.map((journal) => ({
          id: journal.id,
          entryDate: journal.entryDate,
          currency: journal.currency,
          amountMicros: journal.amountMicros,
          aedAmountMicros: journal.aedAmountMicros ?? null,
          projectId: journal.projectId,
          sourceRefType: journal.sourceRefType,
          sourceRefId: journal.sourceRefId,
          status: journal.status,
          reversed: journal.reversed,
        })),
        exchangeRates,
        timeZone,
        now,
      })
    : null;

  const mrrRowByCompanyId = new Map<string, ProjectedMrrClientRow>();
  if (projectedMrr) {
    for (const row of projectedMrr.clients) {
      mrrRowByCompanyId.set(row.companyId, row);
    }
    for (const row of projectedMrr.oneTime.clients) {
      mrrRowByCompanyId.set(row.companyId, row);
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
    const clientFee = clientFees?.[company.id] ?? null;
    const finance = canReadFinance
      ? {
          canManage: canManageFinance,
          fee: clientFee,
          currentMonthMrr: mrrRowByCompanyId.get(company.id) ?? null,
          openReceivablesByCurrency: financeBucket
            ? toCurrencyList(financeBucket.openReceivables)
            : [],
          overdueReceivablesCount,
          collectedByCurrency: financeBucket
            ? toCurrencyList(financeBucket.collected)
            : [],
          entries: (financeBucket?.entries ?? []).slice(0, 50),
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
      tags: normalizeClientTags(clientTags?.[company.id]),
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
      canManageFinance: canReadFinance && canManageFinance,
      totalOpenReceivablesByCurrency: canReadFinance
        ? toCurrencyList(totalOpenReceivables)
        : [],
      projectedMrr,
    },
  };
};

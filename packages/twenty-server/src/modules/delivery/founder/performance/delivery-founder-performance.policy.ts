import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { Temporal } from 'temporal-polyfill';
import { getValidTimeZoneOrUndefined } from 'twenty-shared/utils';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';
import { DELIVERY_STATES } from 'src/modules/delivery/delivery.types';
import {
  deliveryFinanceAmountSchema,
  deliveryFinanceMonthSchema,
  financeAllocationTotal,
} from 'src/modules/delivery/finance/delivery-finance.policy';
import { type FinanceForecastCashRead } from 'src/modules/delivery/finance/read-delivery-forecast-cash';
import {
  type DeliveryFounderPerformanceClientDTO,
  type DeliveryFounderPerformanceClientFinanceDTO,
  type DeliveryFounderPerformanceCurrencyDTO,
  type DeliveryFounderPerformanceEmployeeDTO,
  type DeliveryFounderPerformanceOperationsDTO,
  type DeliveryFounderPerformanceSnapshotDTO,
} from 'src/modules/delivery/founder/performance/delivery-founder-performance.dto';

export const FOUNDER_PERFORMANCE_PAGE_SIZE = 25;
export const FOUNDER_PERFORMANCE_SOURCE_LIMIT = 12000;
export const founderPerformanceSchema = z
  .object({
    month: deliveryFinanceMonthSchema,
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => getValidTimeZoneOrUndefined(value) !== undefined),
    currency: deliveryCurrencySchema
      .nullish()
      .transform((value) => value ?? null),
    afterProjectId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
    afterMemberId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? null),
  })
  .strict();
export type FounderPerformanceQuery = z.infer<typeof founderPerformanceSchema>;
export const parseFounderPerformance = (input: unknown) => {
  const result = founderPerformanceSchema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      'Choose a valid performance month, timezone, currency and page.',
    );
  return result.data;
};
export const previousPerformanceMonth = (month: string) => {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return monthNumber === 1
    ? `${String(year - 1).padStart(4, '0')}-12`
    : `${String(year).padStart(4, '0')}-${String(monthNumber - 1).padStart(2, '0')}`;
};
export const performancePeriod = (month: string, timezone: string) => {
  try {
    const start = Temporal.PlainDateTime.from(`${month}-01T00:00:00`)
      .toZonedDateTime(timezone, { disambiguation: 'reject' })
      .toInstant();
    const end = Temporal.PlainDateTime.from(`${month}-01T00:00:00`)
      .toZonedDateTime(timezone, { disambiguation: 'reject' })
      .add({ months: 1 })
      .toInstant();
    return {
      periodStart: new Date(start.epochMilliseconds).toISOString(),
      periodEnd: new Date(end.epochMilliseconds).toISOString(),
    };
  } catch {
    throw new BadRequestException(
      'Choose a valid performance month and reporting timezone.',
    );
  }
};

export type PerformanceProject = {
  id: string;
  name: string;
  companyId: string | null;
  memberIds: string[];
};
export type PerformanceMember = { id: string; name: string; roleLabel: string };
export type PerformanceEntry = {
  id: string;
  month: string;
  currency: string;
  kind: string;
  category: string;
  status: string;
  amountMicros: string;
  sourceType: string;
  sourceMemberId: string | null;
};
export type PerformanceAllocation = {
  entryId: string;
  projectId: string | null;
  amountMicros: string;
};
export type PerformanceTask = {
  id: string;
  projectId: string;
  assigneeId: string | null;
  state: string;
  dueAt: string | null;
  submissions: unknown;
};
export type PerformanceRevision = {
  taskId: string;
  projectId: string;
  cause: string;
  createdAt: string;
};
export type PerformanceCalculationInput = {
  month: string;
  previousMonth: string;
  periodStart: string;
  periodEnd: string;
  currency: string | null;
  canReadFinance: boolean;
  periodStatus: string;
  projects: PerformanceProject[];
  members: PerformanceMember[];
  entries: PerformanceEntry[];
  allocations: PerformanceAllocation[];
  tasks: PerformanceTask[];
  revisions: PerformanceRevision[];
  cash: Record<string, FinanceForecastCashRead>;
  cashReporting: Record<string, { businessDate: string; confirmed: boolean }>;
  afterProjectId: string | null;
  afterMemberId: string | null;
  now: Date;
};
export type PerformanceCalculationResult = Pick<
  DeliveryFounderPerformanceSnapshotDTO,
  | 'operations'
  | 'currencies'
  | 'clients'
  | 'clientTotal'
  | 'nextProjectId'
  | 'employees'
  | 'employeeTotal'
  | 'nextMemberId'
  | 'warnings'
>;

type Money = { revenue: bigint; cost: bigint; salary: bigint };
type ClientAccumulator = DeliveryFounderPerformanceClientDTO & {
  financeByCurrency: Map<string, DeliveryFounderPerformanceClientFinanceDTO>;
};
const ZERO = BigInt(0);
const emptyOperations = (): DeliveryFounderPerformanceOperationsDTO => ({
  openTaskCount: 0,
  overdueTaskCount: 0,
  blockedTaskCount: 0,
  waitingReviewCount: 0,
  approvedTaskCount: 0,
  dueTaskCount: 0,
  onTimeApprovedTaskCount: 0,
  reviewedTaskCount: 0,
  firstPassApprovedTaskCount: 0,
  revisionCount: 0,
  internalRevisionCount: 0,
});
const emptyMoney = (): Money => ({ revenue: ZERO, cost: ZERO, salary: ZERO });
const moneyValues = (money: Money) => ({
  revenueMicros: money.revenue.toString(),
  costMicros: money.cost.toString(),
  resultMicros: (money.revenue - money.cost).toString(),
});
const increment = (
  target: DeliveryFounderPerformanceOperationsDTO,
  field: keyof DeliveryFounderPerformanceOperationsDTO,
) => {
  target[field]++;
};
const addMoney = (
  target: Map<string, bigint>,
  currency: string,
  amount: bigint,
) => target.set(currency, (target.get(currency) ?? ZERO) + amount);
const moneyList = (values: Map<string, bigint>) =>
  [...values].map(([currency, amount]) => ({
    currency,
    amountMicros: amount.toString(),
  }));
const page = <TValue extends { id: string }>(
  values: TValue[],
  afterId: string | null,
  label: string,
) => {
  const start = afterId
    ? values.findIndex((value) => value.id === afterId)
    : -1;
  if (afterId && start < 0)
    throw new BadRequestException(
      `This ${label} page is no longer available. Return to the first page.`,
    );
  const rows = values.slice(
    start + 1,
    start + 1 + FOUNDER_PERFORMANCE_PAGE_SIZE,
  );
  return {
    rows,
    next:
      values.length > start + 1 + FOUNDER_PERFORMANCE_PAGE_SIZE && rows.length
        ? rows[rows.length - 1].id
        : null,
  };
};
const submissionSchema = z.array(
  z
    .object({
      version: z.number().int().positive(),
      decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']).nullish(),
      reviewedAt: z.string().nullish(),
    })
    .strict(),
);
const timestamp = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const inMonth = (value: number, start: number, end: number) =>
  value >= start && value < end;

export const calculateFounderPerformance = (
  input: PerformanceCalculationInput,
): PerformanceCalculationResult => {
  const warnings = new Set<string>([
    'COST_COMPLETENESS_NOT_VERIFIED',
    'CURRENT_ASSIGNMENT_HISTORY',
  ]);
  const companyOperations = emptyOperations();
  const projects = new Map(
    input.projects.map((project) => [project.id, project]),
  );
  const members = new Map(input.members.map((member) => [member.id, member]));
  const clientOperations = new Map(
    input.projects.map((project) => [project.id, emptyOperations()]),
  );
  const employeeOperations = new Map(
    input.members.map((member) => [member.id, emptyOperations()]),
  );
  const operationTargets = (projectId: string, memberId: string | null) =>
    [
      companyOperations,
      clientOperations.get(projectId),
      memberId ? employeeOperations.get(memberId) : undefined,
    ].filter((target) => target !== undefined);
  const periodStartMs = timestamp(input.periodStart)!;
  const periodEndMs = timestamp(input.periodEnd)!;
  const revisionTask = new Map(input.tasks.map((task) => [task.id, task]));
  for (const task of input.tasks) {
    if (
      !projects.has(task.projectId) ||
      !DELIVERY_STATES.includes(task.state as (typeof DELIVERY_STATES)[number])
    ) {
      warnings.add('INVALID_TASK_SOURCE');
      continue;
    }
    const targets = operationTargets(task.projectId, task.assigneeId);
    if (task.assigneeId && !members.has(task.assigneeId))
      warnings.add('UNAVAILABLE_TASK_OWNER');
    if (task.state !== 'APPROVED') {
      for (const target of targets) increment(target, 'openTaskCount');
      if (task.state === 'BLOCKED')
        for (const target of targets) increment(target, 'blockedTaskCount');
      if (task.state === 'IN_REVIEW')
        for (const target of targets) increment(target, 'waitingReviewCount');
      const dueAt = timestamp(task.dueAt);
      if (dueAt !== null && dueAt < input.now.getTime())
        for (const target of targets) increment(target, 'overdueTaskCount');
    }
    const parsed = submissionSchema.safeParse(task.submissions);
    const versions = parsed.success
      ? parsed.data.map((submission) => submission.version)
      : [];
    if (
      !parsed.success ||
      new Set(versions).size !== versions.length ||
      parsed.data.some(
        (submission) =>
          submission.decision && timestamp(submission.reviewedAt) === null,
      )
    ) {
      warnings.add('INVALID_SUBMISSION_HISTORY');
      continue;
    }
    const submissions = [...parsed.data].sort(
      (left, right) => left.version - right.version,
    );
    const reviewed = submissions.flatMap((submission) => {
      const reviewedAt = timestamp(submission.reviewedAt);
      return submission.decision && reviewedAt !== null
        ? [{ ...submission, reviewedAt }]
        : [];
    });
    if (
      reviewed.some((submission) => submission.reviewedAt > input.now.getTime())
    ) {
      warnings.add('INVALID_SUBMISSION_HISTORY');
      continue;
    }
    const approvals = reviewed.filter(
      (submission) => submission.decision === 'APPROVED',
    );
    if (
      approvals.some((submission) =>
        inMonth(submission.reviewedAt, periodStartMs, periodEndMs),
      )
    )
      for (const target of targets) increment(target, 'approvedTaskCount');
    const firstReview = reviewed[0];
    if (
      firstReview &&
      inMonth(firstReview.reviewedAt, periodStartMs, periodEndMs)
    ) {
      for (const target of targets) increment(target, 'reviewedTaskCount');
      if (firstReview.decision === 'APPROVED')
        for (const target of targets)
          increment(target, 'firstPassApprovedTaskCount');
    }
    const dueAt = timestamp(task.dueAt);
    if (task.dueAt !== null && dueAt === null) {
      warnings.add('INVALID_TASK_SOURCE');
    } else if (
      dueAt !== null &&
      inMonth(dueAt, periodStartMs, periodEndMs) &&
      dueAt < input.now.getTime()
    ) {
      for (const target of targets) increment(target, 'dueTaskCount');
      if (approvals.some((submission) => submission.reviewedAt <= dueAt))
        for (const target of targets)
          increment(target, 'onTimeApprovedTaskCount');
    }
  }
  for (const revision of input.revisions) {
    const createdAt = timestamp(revision.createdAt);
    const task = revisionTask.get(revision.taskId);
    if (
      createdAt === null ||
      !inMonth(createdAt, periodStartMs, periodEndMs) ||
      !projects.has(revision.projectId) ||
      (task && task.projectId !== revision.projectId)
    ) {
      if (createdAt !== null && inMonth(createdAt, periodStartMs, periodEndMs))
        warnings.add('INVALID_REVISION_SOURCE');
      continue;
    }
    const targets = operationTargets(
      revision.projectId,
      task?.assigneeId ?? null,
    );
    for (const target of targets) increment(target, 'revisionCount');
    if (revision.cause === 'INTERNAL_DEFECT')
      for (const target of targets) increment(target, 'internalRevisionCount');
  }

  const current = new Map<string, Money>();
  const previous = new Map<string, Money>();
  const financeClients = new Map<
    string,
    Map<string, { current: Money; previous: Money }>
  >();
  const salaryByMember = new Map<string, Map<string, bigint>>();
  const draftCounts = new Map<string, number>();
  const postedCounts = new Map<string, number>();
  const validPostedEntryIds = new Set<string>();
  const financeComplete = new Map<string, boolean>();
  const projectFinance = (projectId: string | null, currency: string) => {
    const key = projectId ?? 'COMPANY';
    const currencies = financeClients.get(key) ?? new Map();
    const values = currencies.get(currency) ?? {
      current: emptyMoney(),
      previous: emptyMoney(),
    };
    currencies.set(currency, values);
    financeClients.set(key, currencies);
    return values;
  };
  for (const entry of input.entries) {
    if (
      (input.currency && entry.currency !== input.currency) ||
      ![input.month, input.previousMonth].includes(entry.month)
    )
      continue;
    const target = entry.month === input.month ? current : previous;
    const money = target.get(entry.currency) ?? emptyMoney();
    target.set(entry.currency, money);
    if (entry.status === 'DRAFT') {
      if (entry.month === input.month)
        draftCounts.set(
          entry.currency,
          (draftCounts.get(entry.currency) ?? 0) + 1,
        );
      continue;
    }
    if (entry.status !== 'POSTED') continue;
    const allocations = input.allocations.filter(
      (allocation) => allocation.entryId === entry.id,
    );
    let valid =
      deliveryCurrencySchema.safeParse(entry.currency).success &&
      deliveryFinanceAmountSchema.safeParse(entry.amountMicros).success &&
      ['REVENUE', 'COST'].includes(entry.kind) &&
      allocations.every(
        (allocation) =>
          deliveryFinanceAmountSchema.safeParse(allocation.amountMicros)
            .success &&
          (allocation.projectId === null || projects.has(allocation.projectId)),
      );
    try {
      valid =
        valid &&
        financeAllocationTotal(allocations) === BigInt(entry.amountMicros);
    } catch {
      valid = false;
    }
    if (!valid) {
      financeComplete.set(entry.currency, false);
      warnings.add('INVALID_MONTHLY_SOURCE');
      continue;
    }
    validPostedEntryIds.add(entry.id);
    if (entry.month === input.month)
      postedCounts.set(
        entry.currency,
        (postedCounts.get(entry.currency) ?? 0) + 1,
      );
    const amount = BigInt(entry.amountMicros);
    if (entry.kind === 'REVENUE') money.revenue += amount;
    else money.cost += amount;
    if (entry.kind === 'COST' && entry.category === 'SALARY')
      money.salary += amount;
    for (const allocation of allocations) {
      const client = projectFinance(allocation.projectId, entry.currency);
      const clientMoney =
        entry.month === input.month ? client.current : client.previous;
      const allocationAmount = BigInt(allocation.amountMicros);
      if (entry.kind === 'REVENUE') clientMoney.revenue += allocationAmount;
      else clientMoney.cost += allocationAmount;
      if (
        entry.month === input.month &&
        entry.kind === 'COST' &&
        entry.category === 'SALARY'
      ) {
        clientMoney.salary += allocationAmount;
        if (entry.sourceType === 'PLAN' && entry.sourceMemberId) {
          const employee =
            salaryByMember.get(entry.sourceMemberId) ?? new Map();
          addMoney(employee, entry.currency, allocationAmount);
          salaryByMember.set(entry.sourceMemberId, employee);
        }
      }
    }
  }
  if (
    input.canReadFinance &&
    !input.entries.some(
      (entry) =>
        entry.month === input.month &&
        (!input.currency || entry.currency === input.currency),
    )
  )
    warnings.add('NO_MONTHLY_ENTRIES');
  if ([...draftCounts.values()].some((count) => count > 0))
    warnings.add('MONTHLY_DRAFTS_EXCLUDED');

  const cashCollected = new Map<string, bigint>();
  const receivables = new Map<string, bigint>();
  const overdueReceivables = new Map<string, bigint>();
  const clientCash = new Map<string, Map<string, bigint>>();
  const clientReceivables = new Map<string, Map<string, bigint>>();
  const cashComplete = new Map<string, boolean>();
  const addClientMoney = (
    target: Map<string, Map<string, bigint>>,
    projectId: string | null,
    currency: string,
    amount: bigint,
  ) => {
    if (!projectId || !projects.has(projectId)) return;
    const values = target.get(projectId) ?? new Map();
    addMoney(values, currency, amount);
    target.set(projectId, values);
  };
  for (const [currency, data] of Object.entries(input.cash)) {
    if (input.currency && currency !== input.currency) continue;
    if (data.anomalies.length) {
      cashComplete.set(currency, false);
      warnings.add('CASH_SOURCE_WARNINGS');
    }
    const businessDate = input.cashReporting[currency]?.businessDate;
    for (const source of data.cash) {
      if (
        !source.eligible ||
        source.snapshot.category !== 'INCOME' ||
        !source.snapshot.date.startsWith(input.month)
      )
        continue;
      const amount = BigInt(source.snapshot.amountMicros);
      addMoney(cashCollected, currency, amount);
      addClientMoney(clientCash, source.snapshot.projectId, currency, amount);
    }
    for (const source of data.receivables) {
      if (
        !source.eligible ||
        source.snapshot.status === 'VOID' ||
        source.outstandingMicros === null
      )
        continue;
      const amount = BigInt(source.outstandingMicros);
      addMoney(receivables, currency, amount);
      addClientMoney(
        clientReceivables,
        source.snapshot.projectId,
        currency,
        amount,
      );
      if (
        businessDate &&
        source.snapshot.dueDate &&
        source.snapshot.dueDate < businessDate &&
        amount > ZERO
      )
        addMoney(overdueReceivables, currency, amount);
    }
  }
  const currencyKeys = [
    ...new Set([
      ...current.keys(),
      ...previous.keys(),
      ...Object.keys(input.cash).filter(
        (currency) => !input.currency || currency === input.currency,
      ),
    ]),
  ].sort();
  const currencies: DeliveryFounderPerformanceCurrencyDTO[] = currencyKeys.map(
    (currency) => {
      const currentMoney = current.get(currency) ?? emptyMoney();
      const previousMoney = previous.get(currency) ?? emptyMoney();
      const currentEntries = input.entries.filter(
        (entry) =>
          entry.month === input.month &&
          entry.currency === currency &&
          validPostedEntryIds.has(entry.id),
      );
      const salaryCostMicros = currentMoney.salary.toString();
      const overheadCostMicros = currentEntries
        .filter(
          (entry) => entry.kind === 'COST' && entry.category === 'OVERHEAD',
        )
        .reduce((sum, entry) => sum + BigInt(entry.amountMicros), ZERO)
        .toString();
      const aiCostMicros = currentEntries
        .filter(
          (entry) =>
            entry.kind === 'COST' &&
            (entry.sourceType === 'AI_SPEND' ||
              entry.category === 'OS production AI'),
        )
        .reduce((sum, entry) => sum + BigInt(entry.amountMicros), ZERO)
        .toString();
      const otherCostMicros = (
        currentMoney.cost -
        BigInt(salaryCostMicros) -
        BigInt(overheadCostMicros) -
        BigInt(aiCostMicros)
      ).toString();
      return {
        currency,
        ...moneyValues(currentMoney),
        previousRevenueMicros: previousMoney.revenue.toString(),
        previousCostMicros: previousMoney.cost.toString(),
        previousResultMicros: (
          previousMoney.revenue - previousMoney.cost
        ).toString(),
        salaryCostMicros,
        overheadCostMicros,
        aiCostMicros,
        otherCostMicros,
        unassignedRevenueMicros:
          financeClients
            .get('COMPANY')
            ?.get(currency)
            ?.current.revenue.toString() ?? '0',
        unassignedCostMicros:
          financeClients
            .get('COMPANY')
            ?.get(currency)
            ?.current.cost.toString() ?? '0',
        cashCollectedMicros: (cashCollected.get(currency) ?? ZERO).toString(),
        receivablesMicros: (receivables.get(currency) ?? ZERO).toString(),
        overdueReceivablesMicros: (
          overdueReceivables.get(currency) ?? ZERO
        ).toString(),
        draftEntryCount: draftCounts.get(currency) ?? 0,
        postedEntryCount: postedCounts.get(currency) ?? 0,
        periodStatus: input.periodStatus,
        financeComplete: financeComplete.get(currency) !== false,
        cashReportingConfirmed:
          input.cashReporting[currency]?.confirmed ?? false,
        cashComplete: cashComplete.get(currency) !== false,
      };
    },
  );
  if (
    currencies.some(
      (summary) =>
        summary.unassignedRevenueMicros !== '0' ||
        summary.unassignedCostMicros !== '0',
    )
  )
    warnings.add('UNASSIGNED_FINANCE');

  const clientAccumulators = new Map<string, ClientAccumulator>();
  for (const project of input.projects) {
    const financeByCurrency: ClientAccumulator['financeByCurrency'] = new Map();
    const financeRows =
      financeClients.get(project.id) ??
      new Map<string, { current: Money; previous: Money }>();
    for (const [currency, values] of financeRows) {
      financeByCurrency.set(currency, {
        currency,
        ...moneyValues(values.current),
        previousRevenueMicros: values.previous.revenue.toString(),
        previousCostMicros: values.previous.cost.toString(),
        previousResultMicros: (
          values.previous.revenue - values.previous.cost
        ).toString(),
        salaryCostMicros: values.current.salary.toString(),
        cashCollectedMicros: (
          clientCash.get(project.id)?.get(currency) ?? ZERO
        ).toString(),
        receivablesMicros: (
          clientReceivables.get(project.id)?.get(currency) ?? ZERO
        ).toString(),
      });
    }
    for (const currency of new Set([
      ...Array.from(clientCash.get(project.id)?.keys() ?? []),
      ...Array.from(clientReceivables.get(project.id)?.keys() ?? []),
    ])) {
      if (financeByCurrency.has(currency)) continue;
      financeByCurrency.set(currency, {
        currency,
        ...moneyValues(emptyMoney()),
        previousRevenueMicros: '0',
        previousCostMicros: '0',
        previousResultMicros: '0',
        salaryCostMicros: '0',
        cashCollectedMicros: (
          clientCash.get(project.id)?.get(currency) ?? ZERO
        ).toString(),
        receivablesMicros: (
          clientReceivables.get(project.id)?.get(currency) ?? ZERO
        ).toString(),
      });
    }
    clientAccumulators.set(project.id, {
      projectId: project.id,
      projectName: project.name,
      companyId: project.companyId,
      teamCount: project.memberIds.filter((memberId) => members.has(memberId))
        .length,
      operations: clientOperations.get(project.id) ?? emptyOperations(),
      financeByCurrency,
      finance: [],
    });
  }
  const sortedClients = [...clientAccumulators.values()].sort(
    (left, right) =>
      left.projectName.localeCompare(right.projectName) ||
      left.projectId.localeCompare(right.projectId),
  );
  const clientPage = page(
    sortedClients.map((client) => ({ ...client, id: client.projectId })),
    input.afterProjectId,
    'client',
  );
  const clients = clientPage.rows.map(({ financeByCurrency, ...client }) => ({
    ...client,
    finance: [...financeByCurrency.values()].sort((left, right) =>
      left.currency.localeCompare(right.currency),
    ),
  }));
  const memberClients = new Map<string, Set<string>>();
  for (const project of input.projects)
    for (const memberId of project.memberIds) {
      const clients = memberClients.get(memberId) ?? new Set<string>();
      clients.add(project.id);
      memberClients.set(memberId, clients);
    }
  for (const task of input.tasks) {
    if (!task.assigneeId || !projects.has(task.projectId)) continue;
    const clients = memberClients.get(task.assigneeId) ?? new Set<string>();
    clients.add(task.projectId);
    memberClients.set(task.assigneeId, clients);
  }
  const sortedMembers = [...input.members].sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  );
  const memberPage = page(
    sortedMembers.map((member) => ({ ...member, id: member.id })),
    input.afterMemberId,
    'employee',
  );
  const employees: DeliveryFounderPerformanceEmployeeDTO[] =
    memberPage.rows.map((member) => ({
      memberId: member.id,
      name: member.name,
      roleLabel: member.roleLabel,
      clientCount: memberClients.get(member.id)?.size ?? 0,
      operations: employeeOperations.get(member.id) ?? emptyOperations(),
      salaryCosts: moneyList(salaryByMember.get(member.id) ?? new Map()),
    }));
  return {
    operations: companyOperations,
    currencies,
    clients,
    clientTotal: sortedClients.length,
    nextProjectId: clientPage.next,
    employees,
    employeeTotal: sortedMembers.length,
    nextMemberId: memberPage.next,
    warnings: [...warnings].sort(),
  };
};

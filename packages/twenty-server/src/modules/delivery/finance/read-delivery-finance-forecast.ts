import { type EntityManager, In } from 'typeorm';
import {
  type DeliveryFinanceForecastAnchorDTO,
  type DeliveryFinanceForecastItemDTO,
  type DeliveryFinanceForecastOwnerDTO,
  type DeliveryFinanceForecastRealizationDTO,
  type DeliveryFinanceForecastSourceDTO,
} from 'src/modules/delivery/finance/delivery-finance-forecast.dto';
import { DeliveryFinanceForecastAnchorEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-anchor.entity';
import { DeliveryFinanceForecastItemEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-item.entity';
import { type DeliveryFinanceForecastRealizationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-realization.entity';
import { DeliveryFinancePlanEntity } from 'src/modules/delivery/finance/entities/delivery-finance-plan.entity';
import { financeForecastBusinessDate } from 'src/modules/delivery/finance/delivery-finance-forecast.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { financeDueDate } from 'src/modules/delivery/finance/delivery-finance.policy';
import { readFinanceForecastCash } from 'src/modules/delivery/finance/read-delivery-forecast-cash';

export type FinanceForecastApplicationTotal = {
  itemId: string;
  cashId: string;
  amount: string;
  version: string;
};
export type FinanceForecastState = {
  anchor: DeliveryFinanceForecastAnchorEntity | null;
  businessDate: string | null;
  cashData: Awaited<ReturnType<typeof readFinanceForecastCash>>;
  items: DeliveryFinanceForecastItemEntity[];
  plans: DeliveryFinancePlanEntity[];
  totals: FinanceForecastApplicationTotal[];
  owners: DeliveryFinanceForecastOwnerDTO[];
};
export const forecastAmountTotal = (rows: { amount: string }[]) =>
  rows.reduce((sum, row) => sum + BigInt(row.amount), BigInt(0));
export const forecastNonnegative = (amount: bigint) =>
  (amount > BigInt(0) ? amount : BigInt(0)).toString();
export const forecastAnchorDTO = (
  anchor: DeliveryFinanceForecastAnchorEntity,
): DeliveryFinanceForecastAnchorDTO => ({
  id: anchor.id,
  revision: anchor.revision,
  currency: anchor.currency,
  amountMicros: anchor.amountMicros,
  closingDate: anchor.closingDate,
  timezone: anchor.timezone,
  note: anchor.note,
  evidenceUrl: anchor.evidenceUrl,
  changedBy: anchor.changedBy,
  changedByName: anchor.changedByName,
  changedAt: anchor.changedAt.toISOString(),
});
export const forecastPlanSnapshot = (
  plan: DeliveryFinancePlanEntity,
  month: string,
) => ({
  id: plan.id,
  revision: plan.revision,
  type: plan.type,
  name: plan.name,
  currency: plan.currency,
  amountMicros: plan.monthlyAmountMicros,
  memberId: plan.memberId,
  startMonth: plan.startMonth,
  endMonth: plan.endMonth,
  dueDay: plan.dueDay,
  active: plan.active,
  month,
});
export const forecastPlanSource = (
  plan: DeliveryFinancePlanEntity,
  month: string,
  occurrenceItemId: string | null,
): DeliveryFinanceForecastSourceDTO => {
  const warnings = [
    ...(!plan.active ? ['PLAN_INACTIVE'] : []),
    ...(month < plan.startMonth ||
    (plan.endMonth !== null && month > plan.endMonth)
      ? ['PLAN_OUTSIDE_MONTH']
      : []),
  ];
  return {
    id: plan.id,
    sourceType: 'PLAN',
    title: plan.name,
    category: plan.type,
    currency: plan.currency,
    date: null,
    dueDate: null,
    projectId: null,
    projectName: null,
    amountMicros: plan.monthlyAmountMicros,
    remainingMicros: plan.monthlyAmountMicros,
    planMonth: month,
    suggestedDate: financeDueDate(month, plan.dueDay),
    occurrenceItemId,
    sourceReviewToken: financeReviewToken(forecastPlanSnapshot(plan, month)),
    eligible: warnings.length === 0,
    warnings,
  };
};
export const readFinanceForecastState = async (
  manager: EntityManager,
  workspaceId: string,
  currency: string,
  owners: DeliveryFinanceForecastOwnerDTO[],
): Promise<FinanceForecastState> => {
  const anchor = await manager
    .getRepository(DeliveryFinanceForecastAnchorEntity)
    .findOneBy({ workspaceId, currency });
  const businessDate = anchor
    ? financeForecastBusinessDate(anchor.timezone)
    : null;
  const cashData = await readFinanceForecastCash(
    manager,
    workspaceId,
    currency,
    businessDate,
  );
  const items = await manager
    .getRepository(DeliveryFinanceForecastItemEntity)
    .find({ where: { workspaceId, currency }, order: { id: 'ASC' } });
  const planIds = [
    ...new Set(items.flatMap((item) => (item.planId ? [item.planId] : []))),
  ];
  const plans = planIds.length
    ? await manager
        .getRepository(DeliveryFinancePlanEntity)
        .findBy({ workspaceId, id: In(planIds) })
    : [];
  const totals: FinanceForecastApplicationTotal[] = await manager.query(
    'SELECT "itemId","cashId",SUM(CASE WHEN status=\'ACTIVE\' THEN "amountMicros" ELSE 0 END)::text AS amount,md5(string_agg(id::text||\':\'||revision::text,\',\' ORDER BY id)) AS version FROM core."deliveryFinanceForecastRealization" WHERE "workspaceId"=$1 AND currency=$2 GROUP BY "itemId","cashId" ORDER BY "itemId","cashId"',
    [workspaceId, currency],
  );
  return { anchor, businessDate, cashData, items, plans, totals, owners };
};
export const forecastCashSource = (
  state: FinanceForecastState,
  cashId: string,
): DeliveryFinanceForecastSourceDTO | null => {
  const cash = state.cashData.cash.find(
    (row) =>
      row.snapshot.id === cashId &&
      ['EXPENSE', 'SALARY'].includes(row.snapshot.category),
  );
  if (!cash) return null;
  const totals = state.totals.filter((row) => row.cashId === cashId);
  const applied = forecastAmountTotal(totals);
  return {
    id: cashId,
    sourceType: 'CASH',
    title: cash.snapshot.title,
    category: cash.snapshot.category,
    currency: cash.snapshot.currency,
    date: cash.snapshot.date,
    dueDate: null,
    projectId: cash.snapshot.projectId,
    projectName: cash.snapshot.projectName,
    amountMicros: cash.snapshot.amountMicros,
    remainingMicros: cash.eligible
      ? forecastNonnegative(BigInt(cash.snapshot.amountMicros) - applied)
      : null,
    planMonth: null,
    suggestedDate: null,
    occurrenceItemId: null,
    sourceReviewToken: financeReviewToken({
      sourceToken: cash.sourceToken,
      businessDate: state.businessDate,
      eligible: cash.eligible,
      totals,
    }),
    eligible: cash.eligible,
    warnings: cash.warnings,
  };
};
export const forecastReceivableSource = (
  state: FinanceForecastState,
  receivableId: string,
): DeliveryFinanceForecastSourceDTO | null => {
  const row = state.cashData.receivables.find(
    (candidate) => candidate.snapshot.id === receivableId,
  );
  if (!row) return null;
  return {
    id: receivableId,
    sourceType: 'RECEIVABLE',
    title: row.snapshot.title,
    category: row.snapshot.category,
    currency: row.snapshot.currency,
    date: row.snapshot.date,
    dueDate: row.snapshot.dueDate,
    projectId: row.snapshot.projectId,
    projectName: row.snapshot.projectName,
    amountMicros: row.snapshot.amountMicros,
    remainingMicros: row.outstandingMicros,
    planMonth: null,
    suggestedDate: null,
    occurrenceItemId:
      state.items.find((item) => item.receivableId === receivableId)?.id ??
      null,
    sourceReviewToken: row.sourceToken,
    eligible: row.eligible,
    warnings: row.warnings,
  };
};
export const forecastItemDTO = (
  item: DeliveryFinanceForecastItemEntity,
  state: FinanceForecastState,
): DeliveryFinanceForecastItemDTO => {
  const source = item.receivableId
    ? forecastReceivableSource(state, item.receivableId)
    : item.planId && item.planMonth
      ? (() => {
          const plan = state.plans.find(
            (candidate) => candidate.id === item.planId,
          );
          return plan
            ? forecastPlanSource(plan, item.planMonth!, item.id)
            : null;
        })()
      : null;
  const totals = state.totals.filter((row) => row.itemId === item.id);
  const applied = forecastAmountTotal(totals);
  const ownerEligible = state.owners.some((owner) => owner.id === item.ownerId);
  const remaining =
    item.kind === 'COLLECTION'
      ? (source?.remainingMicros ?? null)
      : forecastNonnegative(BigInt(item.amountMicros) - applied);
  const warnings =
    item.status === 'CANCELLED'
      ? []
      : [
          ...new Set([
            ...(!ownerEligible ? ['OWNER_INELIGIBLE'] : []),
            ...(!state.businessDate ? ['REPORTING_DATE_NOT_SET'] : []),
            ...(item.sourceType !== 'MANUAL' && !source
              ? ['MISSING_SOURCE']
              : []),
            ...(source && source.sourceReviewToken !== item.sourceToken
              ? ['SOURCE_CHANGED']
              : []),
            ...(source?.warnings ?? []),
            ...(!item.expectedDate ? ['UNDATED_EXPECTATION'] : []),
            ...(remaining !== null &&
            BigInt(remaining) > BigInt(0) &&
            item.expectedDate &&
            state.businessDate &&
            item.expectedDate < state.businessDate
              ? ['OVERDUE_EXPECTATION']
              : []),
            ...(state.businessDate &&
            item.nextActionDate < state.businessDate &&
            (remaining === null || BigInt(remaining) > BigInt(0))
              ? ['NEXT_ACTION_OVERDUE']
              : []),
            ...(applied > BigInt(item.amountMicros) ? ['OVER_APPLIED'] : []),
          ]),
        ];
  const sourceAcknowledged =
    source !== null &&
    source.warnings.every(
      (warning) =>
        Array.isArray(item.sourceSnapshot?.acknowledgedWarnings) &&
        item.sourceSnapshot.acknowledgedWarnings.includes(warning),
    );
  const eligible =
    item.status === 'ACTIVE' &&
    ownerEligible &&
    state.businessDate !== null &&
    item.expectedDate !== null &&
    item.expectedDate >= state.businessDate &&
    (item.sourceType === 'MANUAL' ||
      (source !== null &&
        (source.eligible ||
          (item.sourceType === 'PLAN' && sourceAcknowledged)) &&
        source.sourceReviewToken === item.sourceToken)) &&
    remaining !== null &&
    applied <= BigInt(item.amountMicros);
  return {
    id: item.id,
    revision: item.revision,
    status: item.status,
    kind: item.kind,
    sourceType: item.sourceType,
    sourceId: item.receivableId ?? item.planId,
    planMonth: item.planMonth,
    title: item.title,
    currency: item.currency,
    amountMicros: item.amountMicros,
    remainingMicros: item.status === 'CANCELLED' ? '0' : remaining,
    appliedMicros: applied.toString(),
    expectedDate: item.expectedDate,
    contractualDueDate: source?.dueDate ?? null,
    ownerId: item.ownerId,
    ownerName:
      state.owners.find((owner) => owner.id === item.ownerId)?.name ??
      item.ownerName,
    ownerEligible,
    nextActionDate: item.nextActionDate,
    note: item.note,
    sourceReviewToken: source?.sourceReviewToken ?? null,
    reviewToken: financeReviewToken({
      id: item.id,
      revision: item.revision,
      totals,
      sourceToken: source?.sourceReviewToken ?? null,
      sourceEligible: source?.eligible ?? null,
      businessDate: state.businessDate,
      ownerEligible,
    }),
    eligible,
    warnings,
    changedAt: item.changedAt.toISOString(),
    changedByName: item.changedByName,
  };
};
export const forecastRealizationDTO = (
  row: DeliveryFinanceForecastRealizationEntity,
): DeliveryFinanceForecastRealizationDTO => ({
  id: row.id,
  revision: row.revision,
  itemId: row.itemId,
  cashId: row.cashId,
  cashTitle: row.cashTitle,
  targetTitle: row.targetTitle,
  currency: row.currency,
  amountMicros: row.amountMicros,
  status: row.status,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
  createdByName: row.createdByName,
  reversedAt: row.reversedAt?.toISOString() ?? null,
  reversedByName: row.reversedByName,
  reversalReason: row.reversalReason,
});

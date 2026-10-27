import { BadRequestException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { DeliveryFinanceEventEntity } from 'src/modules/delivery/finance/entities/delivery-finance-event.entity';
import { readFinancePeriod } from 'src/modules/delivery/finance/delivery-finance-period.helpers';
import { FINANCE_PERIOD_LIMITATIONS } from 'src/modules/delivery/finance/delivery-finance-period.policy';
import { DELIVERY_FINANCE_PAGE_SIZE } from 'src/modules/delivery/finance/delivery-finance.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import {
  type DeliveryFinancePeriodBlockerDTO,
  type DeliveryFinancePeriodCurrencySummaryDTO,
  type DeliveryFinancePeriodProjectSummaryDTO,
} from 'src/modules/delivery/finance/delivery-finance-period.dto';

const BLOCKERS = `SELECT entry.id AS "entryId",entry.month,entry.title,entry."sourceType",entry.revision,'DRAFT_ENTRY'::text AS reason FROM core."deliveryFinanceEntry" entry WHERE entry."workspaceId"=$1 AND entry.month=$2 AND entry.status='DRAFT'
UNION ALL
SELECT replacement.id AS "entryId",replacement.month,replacement.title,replacement."sourceType",replacement.revision,'CROSS_MONTH_CORRECTION'::text AS reason FROM core."deliveryFinanceAiClaim" claim JOIN core."deliveryFinanceEntry" original ON original."workspaceId"=claim."workspaceId" AND original.id=claim."currentEntryId" JOIN core."deliveryFinanceEntry" replacement ON replacement."workspaceId"=claim."workspaceId" AND replacement.id=claim."replacementEntryId" WHERE claim."workspaceId"=$1 AND original.month=$2 AND original.status='POSTED' AND replacement.status='DRAFT' AND replacement.month<>$2`;

export const readFinancePeriodReview = async (
  manager: EntityManager,
  workspaceId: string,
  month: string,
  afterBlockerId: string | null = null,
) => {
  const period = await readFinancePeriod(manager, workspaceId, month);
  const currencyRows: Omit<
    DeliveryFinancePeriodCurrencySummaryDTO,
    'resultMicros' | 'projects'
  >[] = await manager.query(
    `SELECT currency,COALESCE(SUM("amountMicros") FILTER(WHERE status='POSTED' AND kind='REVENUE'),0)::text AS "revenueMicros",COALESCE(SUM("amountMicros") FILTER(WHERE status='POSTED' AND kind='COST'),0)::text AS "costMicros",COUNT(*) FILTER(WHERE status='DRAFT')::int AS "draftCount",COUNT(*) FILTER(WHERE status='POSTED')::int AS "postedCount",COUNT(*) FILTER(WHERE status='VOID')::int AS "voidCount" FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND month=$2 GROUP BY currency ORDER BY currency`,
    [workspaceId, month],
  );
  const projectRows: (Omit<
    DeliveryFinancePeriodProjectSummaryDTO,
    'resultMicros'
  > & { currency: string })[] = await manager.query(
    `SELECT entry.currency,allocation."projectId",MAX(allocation."projectName") AS "projectName",COALESCE(SUM(allocation."amountMicros") FILTER(WHERE entry.kind='REVENUE'),0)::text AS "revenueMicros",COALESCE(SUM(allocation."amountMicros") FILTER(WHERE entry.kind='COST'),0)::text AS "costMicros",COUNT(DISTINCT entry.id)::int AS "postedCount" FROM core."deliveryFinanceEntry" entry JOIN core."deliveryFinanceAllocation" allocation ON allocation."workspaceId"=entry."workspaceId" AND allocation."entryId"=entry.id WHERE entry."workspaceId"=$1 AND entry.month=$2 AND entry.status='POSTED' GROUP BY entry.currency,allocation."projectId" ORDER BY entry.currency,allocation."projectId" NULLS LAST`,
    [workspaceId, month],
  );
  const summaries: DeliveryFinancePeriodCurrencySummaryDTO[] = currencyRows.map(
    (row) => ({
      ...row,
      resultMicros: (
        BigInt(row.revenueMicros) - BigInt(row.costMicros)
      ).toString(),
      projects: projectRows
        .filter((project) => project.currency === row.currency)
        .map(({ currency: _currency, ...project }) => ({
          ...project,
          resultMicros: (
            BigInt(project.revenueMicros) - BigInt(project.costMicros)
          ).toString(),
        })),
    }),
  );
  const [recognition]: { entries: string; allocations: string }[] =
    await manager.query(
      `SELECT (SELECT md5(COALESCE(jsonb_agg(to_jsonb(entry) ORDER BY entry.id)::text,'[]')) FROM core."deliveryFinanceEntry" entry WHERE entry."workspaceId"=$1 AND entry.month=$2) AS entries,(SELECT md5(COALESCE(jsonb_agg(to_jsonb(allocation) ORDER BY allocation."entryId",allocation.bucket)::text,'[]')) FROM core."deliveryFinanceAllocation" allocation JOIN core."deliveryFinanceEntry" entry ON entry."workspaceId"=allocation."workspaceId" AND entry.id=allocation."entryId" WHERE entry."workspaceId"=$1 AND entry.month=$2) AS allocations`,
      [workspaceId, month],
    );
  const recognitionHash = financeReviewToken([
    workspaceId,
    month,
    recognition.entries,
    recognition.allocations,
    summaries,
  ]);
  const [blocking]: { count: number; version: string }[] = await manager.query(
    `WITH blockers AS (${BLOCKERS}) SELECT COUNT(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(blockers) ORDER BY "entryId")::text,'[]')) AS version FROM blockers`,
    [workspaceId, month],
  );
  if (afterBlockerId) {
    const [cursor]: { entryId: string }[] = await manager.query(
      `WITH blockers AS (${BLOCKERS}) SELECT "entryId" FROM blockers WHERE "entryId"=$3`,
      [workspaceId, month, afterBlockerId],
    );
    if (!cursor)
      throw new BadRequestException(
        'This blocker cursor is not valid for the selected month.',
      );
  }
  const blockerRows: DeliveryFinancePeriodBlockerDTO[] = await manager.query(
    `WITH blockers AS (${BLOCKERS}) SELECT "entryId",month,title,"sourceType",reason FROM blockers WHERE ($3::uuid IS NULL OR "entryId">$3) ORDER BY "entryId" LIMIT $4`,
    [workspaceId, month, afterBlockerId, DELIVERY_FINANCE_PAGE_SIZE + 1],
  );
  const blockers = blockerRows.slice(0, DELIVERY_FINANCE_PAGE_SIZE);
  const limitations = [
    ...FINANCE_PERIOD_LIMITATIONS,
    ...(summaries.every((summary) => summary.postedCount === 0)
      ? ['EMPTY_RECORDED_RESULTS']
      : []),
  ];
  if (period.status === 'LOCKED' && period.id) {
    const lastLock = await manager
      .getRepository(DeliveryFinanceEventEntity)
      .findOne({
        where: {
          workspaceId,
          sourceType: 'PERIOD',
          sourceId: period.id,
          action: 'FINANCE_PERIOD_LOCKED',
        },
        order: { revision: 'DESC' },
      });
    if (!lastLock) limitations.push('LOCK_HISTORY_UNAVAILABLE');
    else if (lastLock.after.recognitionHash !== recognitionHash)
      limitations.push('LOCKED_RECOGNITION_CHANGED');
  }
  return {
    period,
    summaries,
    recognitionHash,
    previewToken: financeReviewToken([
      workspaceId,
      month,
      period,
      recognitionHash,
      blocking.count,
      blocking.version,
      limitations,
    ]),
    blockerCount: blocking.count,
    blockers,
    nextBlockerId:
      blockerRows.length > DELIVERY_FINANCE_PAGE_SIZE
        ? blockers[blockers.length - 1].entryId
        : null,
    limitations,
  };
};

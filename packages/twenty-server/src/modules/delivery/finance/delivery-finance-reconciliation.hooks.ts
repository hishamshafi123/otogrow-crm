import { BadRequestException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';
import { DeliveryFinanceSettlementEntity } from 'src/modules/delivery/finance/entities/delivery-finance-settlement.entity';
import { DeliveryFinanceCashMatchEntity } from 'src/modules/delivery/finance/entities/delivery-finance-cash-match.entity';
import { DeliveryFinanceEventEntity } from 'src/modules/delivery/finance/entities/delivery-finance-event.entity';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { financeCashSnapshot } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { reverseFinanceForecastCashRealizations } from 'src/modules/delivery/finance/delivery-finance-forecast.hooks';

type FinanceRelation =
  | DeliveryFinanceSettlementEntity
  | DeliveryFinanceCashMatchEntity;
export const financeRelationEvent = async (
  manager: EntityManager,
  workspaceId: string,
  actorId: string,
  actorName: string,
  kind: 'SETTLEMENT' | 'MATCH',
  relation: FinanceRelation,
  reason: string,
  before: Record<string, unknown> | null,
) => {
  await manager.getRepository(DeliveryFinanceEventEntity).save({
    workspaceId,
    sourceType: kind,
    sourceId: relation.id,
    actorId,
    actorName,
    action:
      relation.status === 'ACTIVE'
        ? `FINANCE_${kind}_CREATED`
        : `FINANCE_${kind}_REVERSED`,
    revision: relation.revision,
    reason,
    before,
    after: { ...relation },
  });
  await recordOtogrowActivity(manager, {
    workspaceId,
    actorId,
    category: 'BUSINESS',
    sourceType: 'finance-payment',
    sourceId: relation.cashId,
    projectId: relation.projectId,
    outcome: 'RECORDED',
    action:
      relation.status === 'ACTIVE'
        ? `FINANCE_${kind}_CREATED`
        : `FINANCE_${kind}_REVERSED`,
    summary:
      kind === 'SETTLEMENT'
        ? 'Updated an explicit payment-to-receivable settlement.'
        : 'Updated an explicit payment-to-monthly-entry match.',
    changes: [
      {
        field: 'state',
        before: before ? String(before.status) : null,
        after: relation.status,
      },
      {
        field: 'revision',
        before: before ? String(before.revision) : null,
        after: String(relation.revision),
      },
    ],
  });
};
export const reverseFinanceRelation = async (
  manager: EntityManager,
  workspaceId: string,
  actorId: string,
  actorName: string,
  relation: FinanceRelation,
  reason: string,
) => {
  const before = { ...relation };
  relation.status = 'REVERSED';
  relation.revision++;
  relation.reversedBy = actorId;
  relation.reversedByName = actorName;
  relation.reversedAt = new Date();
  relation.reversalReason = reason;
  if ('receivableId' in relation)
    await manager.getRepository(DeliveryFinanceSettlementEntity).save(relation);
  else
    await manager.getRepository(DeliveryFinanceCashMatchEntity).save(relation);
  await financeRelationEvent(
    manager,
    workspaceId,
    actorId,
    actorName,
    'receivableId' in relation ? 'SETTLEMENT' : 'MATCH',
    relation,
    reason,
    before,
  );
};
export const reverseFinanceCashRelations = async (
  manager: EntityManager,
  workspaceId: string,
  cashId: string,
  actorId: string,
  actorName: string,
  reason: string,
) => {
  const settlements = await manager
    .getRepository(DeliveryFinanceSettlementEntity)
    .findBy({ workspaceId, cashId, status: 'ACTIVE' });
  const matches = await manager
    .getRepository(DeliveryFinanceCashMatchEntity)
    .findBy({ workspaceId, cashId, status: 'ACTIVE' });
  for (const relation of [...settlements, ...matches])
    await reverseFinanceRelation(
      manager,
      workspaceId,
      actorId,
      actorName,
      relation,
      `Cash entry voided: ${reason}`,
    );
  await reverseFinanceForecastCashRealizations(
    manager,
    workspaceId,
    cashId,
    actorId,
    actorName,
    reason,
  );
};
export const reverseFinanceMonthlyMatches = async (
  manager: EntityManager,
  workspaceId: string,
  entryId: string,
  actorId: string,
  actorName: string,
  reason: string,
) => {
  const matches = await manager
    .getRepository(DeliveryFinanceCashMatchEntity)
    .findBy({ workspaceId, entryId, status: 'ACTIVE' });
  for (const relation of matches)
    await reverseFinanceRelation(
      manager,
      workspaceId,
      actorId,
      actorName,
      relation,
      `Monthly entry voided: ${reason}`,
    );
};
export const financeLegacyReceiptTarget = (
  records: BusinessRecord[],
  receipt: BusinessRecord,
) => {
  if (
    receipt.kind !== 'FINANCE' ||
    receipt.category !== 'INCOME' ||
    receipt.status === 'VOID' ||
    !financeCashSnapshot(receipt, []) ||
    !receipt.externalReference.startsWith('receivable:')
  )
    return null;
  const target = records.find(
    (record) =>
      record.id === receipt.externalReference.slice('receivable:'.length),
  );
  if (
    !target ||
    target.kind !== 'FINANCE' ||
    target.category !== 'RECEIVABLE' ||
    target.status === 'VOID' ||
    !financeCashSnapshot(target, []) ||
    target.currency !== receipt.currency ||
    (receipt.projectId && target.projectId !== receipt.projectId)
  )
    return null;
  return target;
};
export const financeReceivableBalances = (
  records: BusinessRecord[],
  totals: ReadonlyMap<string, bigint>,
) => {
  const balances: {
    id: string;
    settledMicros: string;
    outstandingMicros: string;
    sourceWarnings: string[];
  }[] = [];
  for (const record of records) {
    if (record.kind !== 'FINANCE' || record.category !== 'RECEIVABLE') continue;
    const source = financeCashSnapshot(record, []);
    if (!source) continue;
    const legacy = records.filter(
      (receipt) =>
        receipt.kind === 'FINANCE' &&
        receipt.category === 'INCOME' &&
        receipt.status !== 'VOID' &&
        receipt.externalReference === `receivable:${record.id}`,
    );
    const settled = totals.get(record.id) ?? BigInt(0);
    const outstanding = BigInt(source.amountMicros) - settled;
    balances.push({
      id: record.id,
      settledMicros: settled.toString(),
      outstandingMicros: (outstanding > BigInt(0)
        ? outstanding
        : BigInt(0)
      ).toString(),
      sourceWarnings: [
        ...(settled > BigInt(source.amountMicros) ? ['OVER_SETTLED'] : []),
        ...(legacy.some(
          (receipt) => !financeLegacyReceiptTarget(records, receipt),
        )
          ? ['LEGACY_RECEIPT_MISMATCH']
          : []),
        ...(record.status === 'PAID' &&
        !legacy.some((receipt) => financeLegacyReceiptTarget(records, receipt))
          ? ['LEGACY_PAID_WITHOUT_RECEIPT']
          : []),
      ],
    });
  }
  return balances;
};
export const financeReceivableSettledTotals = async (
  manager: EntityManager,
  workspaceId: string,
  records: BusinessRecord[],
) => {
  const rows: { receivableId: string; amount: string }[] = await manager.query(
    'SELECT "receivableId",SUM("amountMicros")::text AS amount FROM core."deliveryFinanceSettlement" WHERE "workspaceId"=$1 AND status=\'ACTIVE\' GROUP BY "receivableId"',
    [workspaceId],
  );
  const totals = new Map(
    rows.map((row) => [row.receivableId, BigInt(row.amount)]),
  );
  for (const record of records) {
    const target = financeLegacyReceiptTarget(records, record);
    if (target && record.kind === 'FINANCE') {
      const id = target.id;
      totals.set(
        id,
        (totals.get(id) ?? BigInt(0)) + BigInt(record.amount) * BigInt(10000),
      );
    }
  }
  for (const record of records) {
    if (
      record.kind === 'FINANCE' &&
      record.category === 'RECEIVABLE' &&
      record.status === 'PAID' &&
      financeCashSnapshot(record, []) &&
      !records.some(
        (receipt) =>
          financeLegacyReceiptTarget(records, receipt)?.id === record.id,
      )
    )
      totals.set(
        record.id,
        (totals.get(record.id) ?? BigInt(0)) +
          BigInt(record.amount) * BigInt(10000),
      );
  }
  return totals;
};
export const assertFinanceReceivableUnsettled = async (
  manager: EntityManager,
  workspaceId: string,
  records: BusinessRecord[],
  receivableId: string,
) => {
  const totals = await financeReceivableSettledTotals(
    manager,
    workspaceId,
    records,
  );
  if ((totals.get(receivableId) ?? BigInt(0)) > BigInt(0))
    throw new BadRequestException(
      'Reverse the existing payment settlements before changing or voiding this receivable.',
    );
};

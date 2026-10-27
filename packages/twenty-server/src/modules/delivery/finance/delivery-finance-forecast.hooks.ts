import { type EntityManager } from 'typeorm';
import { z } from 'zod';
import { DeliveryFinanceEventEntity } from 'src/modules/delivery/finance/entities/delivery-finance-event.entity';
import { DeliveryFinanceForecastRealizationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-realization.entity';
import { DeliveryFinanceSourceEntity } from 'src/modules/delivery/finance/entities/delivery-finance-source.entity';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

export const financeForecastEvent = async (
  manager: EntityManager,
  workspaceId: string,
  actorId: string,
  actorName: string,
  sourceType: 'FORECAST_ANCHOR' | 'FORECAST_ITEM' | 'FORECAST_REALIZATION',
  sourceId: string,
  revision: number,
  action: string,
  reason: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
) => {
  await manager.getRepository(DeliveryFinanceEventEntity).save({
    workspaceId,
    actorId,
    actorName,
    sourceType,
    sourceId,
    revision,
    action,
    reason,
    before,
    after,
  });
  await recordOtogrowActivity(manager, {
    workspaceId,
    actorId,
    category: 'BUSINESS',
    sourceType: 'finance-forecast',
    sourceId,
    outcome: 'RECORDED',
    action,
    summary: 'Updated a reviewed cash forecast.',
    changes: [
      {
        field: 'state',
        before: typeof before?.status === 'string' ? before.status : null,
        after: typeof after.status === 'string' ? after.status : 'REVIEWED',
      },
      {
        field: 'revision',
        before:
          before && typeof before.revision === 'number'
            ? String(before.revision)
            : null,
        after: String(revision),
      },
    ],
  });
};
export const reverseFinanceForecastRealization = async (
  manager: EntityManager,
  workspaceId: string,
  actorId: string,
  actorName: string,
  row: DeliveryFinanceForecastRealizationEntity,
  reason: string,
) => {
  const creation = await manager
    .getRepository(DeliveryFinanceEventEntity)
    .findOneBy({
      workspaceId,
      sourceType: 'FORECAST_REALIZATION',
      sourceId: row.id,
      action: 'FINANCE_FORECAST_REALIZATION_CREATED',
    });
  const stored = await manager
    .getRepository(DeliveryFinanceSourceEntity)
    .findOneBy({ workspaceId, id: row.cashId, kind: 'CASH' });
  const originalDate = z.iso.date().safeParse(creation?.after.cashDate);
  const storedDate = z.iso.date().safeParse(stored?.snapshot?.date);
  const cashDate = originalDate.success
    ? originalDate.data
    : storedDate.success
      ? storedDate.data
      : null;
  const before = { ...row };
  row.status = 'REVERSED';
  row.revision++;
  row.reversedBy = actorId;
  row.reversedByName = actorName;
  row.reversedAt = new Date();
  row.reversalReason = reason;
  await manager
    .getRepository(DeliveryFinanceForecastRealizationEntity)
    .save(row);
  await financeForecastEvent(
    manager,
    workspaceId,
    actorId,
    actorName,
    'FORECAST_REALIZATION',
    row.id,
    row.revision,
    'FINANCE_FORECAST_REALIZATION_REVERSED',
    reason,
    before,
    { ...row, cashDate },
  );
};
export const reverseFinanceForecastCashRealizations = async (
  manager: EntityManager,
  workspaceId: string,
  cashId: string,
  actorId: string,
  actorName: string,
  reason: string,
) => {
  const rows = await manager
    .getRepository(DeliveryFinanceForecastRealizationEntity)
    .find({
      where: { workspaceId, cashId, status: 'ACTIVE' },
      order: { itemId: 'ASC', id: 'ASC' },
    });
  for (const row of rows)
    await reverseFinanceForecastRealization(
      manager,
      workspaceId,
      actorId,
      actorName,
      row,
      `Cash entry voided: ${reason}`,
    );
};

import { ConflictException } from '@nestjs/common';
import { In, type EntityManager } from 'typeorm';
import { DeliveryFinancePeriodEntity } from 'src/modules/delivery/finance/entities/delivery-finance-period.entity';
import { type DeliveryFinancePeriodDTO } from 'src/modules/delivery/finance/delivery-finance-period.dto';

export const projectFinancePeriod = (
  month: string,
  row: DeliveryFinancePeriodEntity | null,
): DeliveryFinancePeriodDTO => ({
  id: row?.id ?? null,
  month,
  status: row?.status ?? 'OPEN',
  revision: row?.revision ?? 0,
  changedBy: row?.changedBy ?? null,
  changedByName: row?.changedByName ?? null,
  changedAt: row?.changedAt.toISOString() ?? null,
  reason: row?.reason ?? null,
});
export const readFinancePeriod = async (
  manager: EntityManager,
  workspaceId: string,
  month: string,
) =>
  projectFinancePeriod(
    month,
    await manager
      .getRepository(DeliveryFinancePeriodEntity)
      .findOneBy({ workspaceId, month }),
  );
export const lockFinancePeriods = async (
  manager: EntityManager,
  workspaceId: string,
  months: string[],
  shared = false,
) => {
  for (const month of [...new Set(months)].sort())
    await manager.query(
      `SELECT pg_advisory_xact_lock${shared ? '_shared' : ''}(hashtextextended($1,0))`,
      [`finance-period:${workspaceId}:${month}`],
    );
};
export const lockAndAssertFinancePeriodsOpen = async (
  manager: EntityManager,
  workspaceId: string,
  months: string[],
) => {
  await lockFinancePeriods(manager, workspaceId, months);
  const locked = await manager.getRepository(DeliveryFinancePeriodEntity).find({
    where: { workspaceId, month: In([...new Set(months)]), status: 'LOCKED' },
    order: { month: 'ASC' },
  });
  if (locked.length)
    throw new ConflictException(
      `Monthly results for ${locked.map((period) => period.month).join(', ')} are locked. Reopen each affected month with a reason before changing recognition. Cash and payment matching remain available.`,
    );
};

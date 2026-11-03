import { type EntityManager } from 'typeorm';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';
import { DeliveryFinanceForecastAnchorEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-anchor.entity';
import {
  financeReportingClock,
  projectFinanceReportingClocks,
  readFinanceReportingClocks,
} from 'src/modules/delivery/finance/delivery-finance-reporting-date';

const WORKSPACE_ID = '79b4a356-2049-418f-8c81-b309be582449';
const anchor = (currency: string, timezone: string) =>
  Object.assign(new DeliveryFinanceForecastAnchorEntity(), {
    workspaceId: WORKSPACE_ID,
    currency,
    timezone,
    amountMicros: '123000000',
    note: 'Private starting-cash evidence',
    evidenceUrl: 'https://example.invalid/private-closing-evidence',
  });
const managerWith = (anchors: DeliveryFinanceForecastAnchorEntity[]) => {
  const findBy = jest.fn().mockResolvedValue(anchors);
  const getRepository = jest.fn((entity: unknown) => {
    expect(entity).toBe(DeliveryFinanceForecastAnchorEntity);
    return { findBy };
  });
  return { manager: { getRepository } as unknown as EntityManager, findBy };
};

it('gives a Qatar-day payment the same current calendar as mutation validation while UTC is still the prior day', async () => {
  const { manager, findBy } = managerWith([anchor('USD', 'Asia/Qatar')]);
  const clocks = await readFinanceReportingClocks(
    manager,
    WORKSPACE_ID,
    new Date('2026-10-28T23:30:00.000Z'),
  );
  expect(findBy).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID });
  expect(financeReportingClock(clocks, 'USD')).toEqual({
    timezone: 'Asia/Qatar',
    businessDate: '2026-10-29',
    confirmed: true,
  });
  expect(
    projectFinanceReportingClocks(clocks).find(
      (clock) => clock.currency === 'USD',
    ),
  ).toEqual({ currency: 'USD', ...financeReportingClock(clocks, 'USD') });
  expect(financeReportingClock(clocks, 'EUR')).toEqual({
    timezone: 'UTC',
    businessDate: '2026-10-28',
    confirmed: false,
  });
});

it('retains a reporting calendar behind UTC instead of admitting tomorrow through the fallback calendar', async () => {
  const { manager } = managerWith([anchor('EUR', 'America/Los_Angeles')]);
  const clocks = await readFinanceReportingClocks(
    manager,
    WORKSPACE_ID,
    new Date('2026-10-28T01:30:00.000Z'),
  );
  expect(financeReportingClock(clocks, 'EUR')).toEqual({
    timezone: 'America/Los_Angeles',
    businessDate: '2026-10-27',
    confirmed: true,
  });
  expect(financeReportingClock(clocks, 'USD')).toEqual({
    timezone: 'UTC',
    businessDate: '2026-10-28',
    confirmed: false,
  });
});

it('provides exactly one explicit calendar for every supported payment currency even when only one has an anchor', async () => {
  const { manager } = managerWith([anchor('USD', 'Asia/Qatar')]);
  const clocks = await readFinanceReportingClocks(
    manager,
    WORKSPACE_ID,
    new Date('2026-10-28T23:30:00.000Z'),
  );
  const projection = projectFinanceReportingClocks(clocks);
  expect(projection.map((clock) => clock.currency)).toEqual(
    deliveryCurrencySchema.options,
  );
  expect(new Set(projection.map((clock) => clock.currency)).size).toBe(
    deliveryCurrencySchema.options.length,
  );
  expect(
    projection
      .filter((clock) => clock.confirmed)
      .map((clock) => clock.currency),
  ).toEqual(['USD']);
  for (const clock of projection)
    expect(Object.keys(clock).sort()).toEqual([
      'businessDate',
      'confirmed',
      'currency',
      'timezone',
    ]);
  expect(JSON.stringify(projection)).not.toContain(
    'Private starting-cash evidence',
  );
  expect(JSON.stringify(projection)).not.toContain('private-closing-evidence');
});

it('uses a known UTC date with confirmed false for all currencies before any starting-cash review', async () => {
  const { manager } = managerWith([]);
  const clocks = await readFinanceReportingClocks(
    manager,
    WORKSPACE_ID,
    new Date('2026-12-31T23:59:59.000Z'),
  );
  const projection = projectFinanceReportingClocks(clocks);
  expect(projection).toHaveLength(deliveryCurrencySchema.options.length);
  for (const clock of projection)
    expect(clock).toMatchObject({
      timezone: 'UTC',
      businessDate: '2026-12-31',
      confirmed: false,
    });
});

it('keeps the manager clock used by payment checks unchanged when its public projection is edited', async () => {
  const { manager } = managerWith([anchor('USD', 'Asia/Qatar')]);
  const clocks = await readFinanceReportingClocks(
    manager,
    WORKSPACE_ID,
    new Date('2026-10-28T23:30:00.000Z'),
  );
  const projection = projectFinanceReportingClocks(clocks);
  projection[0].businessDate = '2099-01-01';
  projection[0].confirmed = false;
  expect(financeReportingClock(clocks, 'USD')).toEqual({
    timezone: 'Asia/Qatar',
    businessDate: '2026-10-29',
    confirmed: true,
  });
});

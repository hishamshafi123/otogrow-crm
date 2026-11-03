import { type EntityManager } from 'typeorm';
import { DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';
import { DeliveryFinanceAllocationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-allocation.entity';
import { readFinanceExportRecognition } from 'src/modules/delivery/finance/export/read-delivery-finance-export';
import { type FinanceExportSelection } from 'src/modules/delivery/finance/export/delivery-finance-export.policy';

const WORKSPACE_ID = '53a79212-041e-4ac7-87c2-717cdb62ca83';
const ENTRY_ID = '2e25cadc-1eb3-4dda-92ed-722fe02a66f1';
const PROJECT_ID = '102848d9-2cc7-44a0-be93-cdbd48236b72';
const selection: FinanceExportSelection = {
  profileId: PROJECT_ID,
  currency: 'USD',
  dateFrom: null,
  dateTo: null,
  serviceMonth: '2026-10',
  accountingDate: '2026-11-03',
};
const entry = (amountMicros = '10') =>
  Object.assign(new DeliveryFinanceEntryEntity(), {
    id: ENTRY_ID,
    workspaceId: WORKSPACE_ID,
    revision: 1,
    month: '2026-10',
    currency: 'USD' as const,
    amountMicros,
    status: 'POSTED' as const,
    title: 'Reviewed recorded service cost',
    category: 'OVERHEAD',
    kind: 'COST' as const,
    sourceType: 'MANUAL' as const,
    planId: null,
    sourceAiSpend: null,
    evidenceUrl: null,
  });
const allocation = (amountMicros: string, projectId: string | null = null) =>
  Object.assign(new DeliveryFinanceAllocationEntity(), {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    entryId: ENTRY_ID,
    bucket: projectId ?? 'COMPANY',
    projectId,
    projectName: projectId ? 'Client project' : null,
    amountMicros,
  });
const managerFor = (
  source: DeliveryFinanceEntryEntity,
  allocations: DeliveryFinanceAllocationEntity[],
) =>
  ({
    getRepository: (entity: unknown) => {
      if (entity === DeliveryFinanceEntryEntity)
        return { find: jest.fn().mockResolvedValue([source]) };
      if (entity === DeliveryFinanceAllocationEntity)
        return { find: jest.fn().mockResolvedValue(allocations) };
      throw new Error('Unexpected source repository');
    },
    query: jest.fn().mockResolvedValue([{ count: allocations.length }]),
  }) as unknown as EntityManager;

it('blocks a nonzero posted source with missing allocation instead of fabricating a zero row', async () => {
  const read = await readFinanceExportRecognition(
    managerFor(entry(), []),
    WORKSPACE_ID,
    selection,
  );
  expect(read.rows).toEqual([]);
  expect(read.exclusions).toMatchObject([
    {
      sourceId: ENTRY_ID,
      amountMicros: '10',
      code: 'UNKNOWN_ALLOCATION',
      blocking: true,
    },
  ]);
});
it('retains an explicitly zero posted source without pretending an allocation was recorded', async () => {
  const read = await readFinanceExportRecognition(
    managerFor(entry('0'), []),
    WORKSPACE_ID,
    selection,
  );
  expect(read.rows).toMatchObject([
    {
      amountMicros: '0',
      bucket: 'UNALLOCATED_ZERO',
      warnings: ['ZERO_ENTRY_WITHOUT_ALLOCATION'],
      date: '2026-11-03',
      serviceMonth: '2026-10',
    },
  ]);
  expect(read.exclusions).toEqual([]);
});
it('preserves exact multi-project allocations and their original attribution', async () => {
  const read = await readFinanceExportRecognition(
    managerFor(entry(), [allocation('4'), allocation('6', PROJECT_ID)]),
    WORKSPACE_ID,
    selection,
  );
  expect(read.rows.map((row) => row.amountMicros).sort()).toEqual(['4', '6']);
  expect(
    read.rows.find((row) => row.projectId === PROJECT_ID)?.projectName,
  ).toBe('Client project');
  expect(
    read.rows.reduce((sum, row) => sum + BigInt(row.amountMicros), BigInt(0)),
  ).toBe(BigInt(10));
});
it.each(['bad', '-1', '9223372036854775808'])(
  'quarantines unsupported allocation amount %s without a raw BigInt failure',
  async (amount) => {
    const read = await readFinanceExportRecognition(
      managerFor(entry(), [allocation(amount)]),
      WORKSPACE_ID,
      selection,
    );
    expect(read.rows).toEqual([]);
    expect(read.exclusions[0]).toMatchObject({
      code: 'UNKNOWN_ALLOCATION',
      blocking: true,
      amountMicros: '10',
    });
  },
);
it('quarantines a nonconserving or foreign-workspace allocation', async () => {
  for (const allocations of [
    [allocation('9')],
    [{ ...allocation('10'), workspaceId: PROJECT_ID }],
  ]) {
    const read = await readFinanceExportRecognition(
      managerFor(entry(), allocations),
      WORKSPACE_ID,
      selection,
    );
    expect(read.rows).toEqual([]);
    expect(read.exclusions[0].code).toBe('UNKNOWN_ALLOCATION');
  }
});
it('keeps malformed source amounts unknown and excludes drafts/voids from recognized totals', async () => {
  const invalid = await readFinanceExportRecognition(
    managerFor(entry('bad'), []),
    WORKSPACE_ID,
    selection,
  );
  expect(invalid.exclusions[0]).toMatchObject({
    code: 'INVALID_SOURCE',
    amountMicros: null,
    blocking: true,
  });
  for (const status of ['DRAFT', 'VOID'] as const) {
    const read = await readFinanceExportRecognition(
      managerFor({ ...entry(), status }, []),
      WORKSPACE_ID,
      selection,
    );
    expect(read.rows).toEqual([]);
    expect(read.exclusions[0]).toMatchObject({
      code: status === 'VOID' ? 'VOID_SOURCE' : 'DRAFT_SOURCE',
      blocking: false,
      amountMicros: '10',
    });
  }
});

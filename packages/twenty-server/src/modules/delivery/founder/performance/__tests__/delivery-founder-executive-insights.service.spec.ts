import { ForbiddenException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryFounderExecutiveInsightsService } from 'src/modules/delivery/founder/performance/delivery-founder-executive-insights.service';

const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const MEMBER_ID = '2a3587de-498f-48bf-a1a8-9939109f877a';
const MEMBERSHIP_ID = '3516f2eb-0554-49db-a56c-306e3273cb16';
const PROJECT_ID = 'dc95aebb-52a0-4aa0-bc8f-f93b24b11689';

const workspace = {
  id: WORKSPACE_ID,
  databaseSchema: 'workspace_exec_insights_test',
} as WorkspaceEntity;

const adminActor = {
  memberId: MEMBER_ID,
  isAdmin: true,
  isManager: true,
  capabilities: ['workspace.admin'],
  roleIds: [],
};

const setup = () => {
  const query = jest.fn(async (sql: string): Promise<unknown[]> => {
    if (sql.includes('pg_advisory_xact_lock')) return [];
    if (sql.includes('FROM core."deliveryFinanceEntry"')) {
      return [
        {
          month: '2026-11',
          currency: 'QAR',
          kind: 'REVENUE',
          status: 'POSTED',
          amountMicros: '15000000000',
        },
      ];
    }
    if (sql.includes('FROM core."deliveryCommitmentPeriod"')) {
      return [
        {
          periodId: '11111111-1111-4111-8111-111111111111',
          projectId: PROJECT_ID,
          projectName: 'Client Doha',
          companyId: null,
          label: 'Nov Retainer',
          billing: 'RETAINER',
          endDateExclusive: '2026-11-28',
          state: 'ACTIVE',
        },
      ];
    }
    if (sql.includes('FROM core."deliveryInboxBinding"')) {
      return [{ count: 3 }];
    }
    if (sql.includes('FROM core."deliveryInboxReply"')) {
      return [
        {
          replyId: '22222222-2222-4222-8222-222222222222',
          conversationId: '33333333-3333-4333-8333-333333333333',
          projectId: PROJECT_ID,
          projectName: 'Client Doha',
          status: 'DRAFT',
          createdAt: '2026-11-17T12:00:00.000Z',
          problem: null,
        },
      ];
    }
    return [];
  });

  const manager = { query } as unknown as EntityManager;
  const dataSource = {
    transaction: (read: (em: EntityManager) => Promise<unknown>) =>
      read(manager),
  } as unknown as DataSource;
  const authorize = jest.fn().mockResolvedValue(adminActor);
  const delivery = {
    actor: authorize,
    schema: () => '"workspace_exec_insights_test"',
  } as unknown as DeliveryService;
  const orm = {
    executeInWorkspaceContext: jest.fn(),
    getRepository: jest.fn(),
  } as unknown as GlobalWorkspaceOrmManager;

  return {
    service: new DeliveryFounderExecutiveInsightsService(
      dataSource,
      delivery,
      orm,
    ),
    authorize,
    query,
  };
};

describe('DeliveryFounderExecutiveInsightsService', () => {
  it('forbids non-admin actors before querying any source table', async () => {
    const { service, authorize, query } = setup();
    authorize.mockResolvedValue({ ...adminActor, isAdmin: false });
    await expect(
      service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
        month: '2026-11',
        timezone: 'Asia/Qatar',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(
      query.mock.calls.some(([sql]) => sql.includes('deliveryFinanceEntry')),
    ).toBe(false);
  });

  it('rejects administrator revocation mid-collection', async () => {
    const { service, authorize } = setup();
    authorize
      .mockResolvedValueOnce(adminActor)
      .mockResolvedValueOnce({ ...adminActor, isAdmin: false });
    await expect(
      service.snapshot(
        workspace,
        MEMBER_ID,
        MEMBERSHIP_ID,
        { month: '2026-11', timezone: 'Asia/Qatar' },
        null,
        new Date('2026-11-18T12:00:00.000Z'),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns 6-month currency trends, renewals and inbox SLA for authorized finance admins', async () => {
    const { service } = setup();
    const result = await service.snapshot(
      workspace,
      MEMBER_ID,
      MEMBERSHIP_ID,
      { month: '2026-11', timezone: 'Asia/Qatar', currency: 'QAR' },
      null,
      new Date('2026-11-18T12:00:00.000Z'),
    );
    expect(result.canReadFinance).toBe(true);
    expect(result.trendMonths).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(result.trends).toHaveLength(1);
    expect(result.trends[0].currency).toBe('QAR');
    const lastPoint =
      result.trends[0].points[result.trends[0].points.length - 1];
    expect(lastPoint?.revenueMicros).toBe('15000000000');
    expect(result.salesFunnel.restricted).toBe(true);
    expect(result.renewals[0].projectName).toBe('Client Doha');
    expect(result.inboxSla.connectedThreadsCount).toBe(3);
  });
});

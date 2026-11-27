import { randomUUID } from 'node:crypto';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryFinanceV2InvoiceEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-invoice.entity';
import { DeliveryFinanceV2JournalEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-journal.entity';
import { DeliveryFinanceV2ProfileEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-profile.entity';
import { DeliveryClientHubService } from 'src/modules/delivery/clients/delivery-client-hub.service';
import { newDeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';
import { OtogrowActivityEventEntity } from 'src/modules/otogrow-activity/entities/otogrow-activity-event.entity';

const makeAuth = (workspaceId: string): WorkspaceAuthContext =>
  ({
    type: 'user',
    workspace: { id: workspaceId },
    workspaceMemberId: randomUUID(),
    userWorkspaceId: randomUUID(),
  }) as unknown as WorkspaceAuthContext;

describe('DeliveryClientHubService', () => {
  const buildService = ({
    projects = [],
    operationsState = newDeliveryOperations(),
    companiesById = {},
    searchDirectoryResult = { companies: [], hasMore: false },
    financeV2Invoices = [],
    financeV2Journals = [],
    financeV2Profile = null,
  }: {
    projects?: {
      id: string;
      name: string;
      companyId: string | null;
      memberIds: string[];
    }[];
    operationsState?: ReturnType<typeof newDeliveryOperations>;
    companiesById?: Record<
      string,
      {
        id: string;
        name: string;
        domainName: string | null;
        updatedAt: string;
        sourceToken: string;
      }
    >;
    searchDirectoryResult?: {
      companies: {
        id: string;
        name: string;
        domainName: string | null;
        updatedAt: string;
        sourceToken: string;
      }[];
      hasMore: boolean;
    };
    financeV2Invoices?: Partial<DeliveryFinanceV2InvoiceEntity>[];
    financeV2Journals?: Partial<DeliveryFinanceV2JournalEntity>[];
    financeV2Profile?: Partial<DeliveryFinanceV2ProfileEntity> | null;
  }) => {
    const workspaceId = randomUUID();
    const workspace = {
      id: workspaceId,
      databaseSchema: 'workspace_test',
    };
    const operationsRecord = {
      workspaceId,
      state: operationsState,
    };
    const activityInserts: Record<string, unknown>[] = [];

    const manager = {
      queryRunner: { isTransactionActive: true },
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WorkspaceEntity) {
          return { findOneByOrFail: jest.fn().mockResolvedValue(workspace) };
        }
        if (entity === DeliveryOperationsEntity) {
          return {
            findOneBy: jest.fn().mockResolvedValue(operationsRecord),
            create: jest.fn((value: unknown) => value),
            save: jest.fn(async (value: typeof operationsRecord) => {
              operationsRecord.state = value.state;
              return operationsRecord;
            }),
          };
        }
        if (entity === DeliveryProjectEntity) {
          return {
            find: jest.fn().mockResolvedValue(projects),
          };
        }
        if (entity === DeliveryFinanceV2InvoiceEntity) {
          return {
            find: jest.fn().mockResolvedValue(financeV2Invoices),
          };
        }
        if (entity === DeliveryFinanceV2JournalEntity) {
          return {
            find: jest.fn().mockResolvedValue(financeV2Journals),
          };
        }
        if (entity === DeliveryFinanceV2ProfileEntity) {
          return {
            findOneBy: jest.fn().mockResolvedValue(financeV2Profile),
          };
        }
        if (entity === OtogrowActivityEventEntity) {
          return {
            insert: jest.fn(async (event: Record<string, unknown>) => {
              activityInserts.push(event);
              return undefined;
            }),
          };
        }
        throw new Error(`Unexpected repository: ${String(entity)}`);
      }),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest.fn(
        async (
          _isolationOrCb: unknown,
          maybeCb?: (m: EntityManager) => unknown,
        ) => {
          const cb =
            typeof _isolationOrCb === 'function' ? _isolationOrCb : maybeCb!;
          return cb(manager);
        },
      ),
    } as unknown as DataSource;

    const delivery = {
      actor: jest.fn().mockResolvedValue({
        isManager: true,
        isAdmin: true,
        capabilities: ['delivery.manage', 'finance.read', 'finance.manage'],
      }),
      schema: jest.fn().mockReturnValue('"workspace_test"'),
    };
    const nativeTasks = {
      visibility: jest.fn().mockResolvedValue(null),
      query: jest.fn().mockResolvedValue([]),
      predicate: jest.fn().mockReturnValue('TRUE'),
    };
    const access = {
      listActiveMembers: jest.fn().mockResolvedValue([]),
    };
    const companies = {
      listByIds: jest.fn(async (_auth: unknown, ids: string[]) =>
        ids
          .map((id) => companiesById[id])
          .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      ),
      searchDirectory: jest.fn().mockResolvedValue(searchDirectoryResult),
    };

    const service = new DeliveryClientHubService(
      dataSource,
      delivery as never,
      nativeTasks as never,
      access as never,
      companies as never,
    );

    return {
      service,
      auth: makeAuth(workspaceId),
      companies,
      activityInserts,
    };
  };

  it('surfaces a manually created client with 2 projects even when clientRoster is empty', async () => {
    const hokuroId = randomUUID();
    const projectOneId = randomUUID();
    const projectTwoId = randomUUID();

    const { service, auth } = buildService({
      projects: [
        {
          id: projectOneId,
          name: 'Hokuro Growth',
          companyId: hokuroId,
          memberIds: [],
        },
        {
          id: projectTwoId,
          name: 'Hokuro Brand',
          companyId: hokuroId,
          memberIds: [],
        },
      ],
      companiesById: {
        [hokuroId]: {
          id: hokuroId,
          name: 'Belfort Entity Hokuro',
          domainName: 'hokuro.io',
          updatedAt: '2026-11-26T00:00:00.000Z',
          sourceToken: 'a'.repeat(64),
        },
      },
    });

    const result = await service.hub(auth);

    expect(result.clients).toHaveLength(1);
    expect(result.clients[0]?.id).toBe(hokuroId);
    expect(result.clients[0]?.name).toBe('Belfort Entity Hokuro');
    expect(result.clients[0]?.projects.map((project) => project.id)).toEqual([
      projectOneId,
      projectTwoId,
    ]);
    expect(result.summary.totalClients).toBe(1);
    expect(result.summary.totalActiveProjects).toBe(2);
  });

  it('still hides a project-backed company when explicitly excluded as Not a client', async () => {
    const excludedCompanyId = randomUUID();
    const operationsState = newDeliveryOperations();
    operationsState.clientRoster = {
      includedIds: [],
      excludedIds: [excludedCompanyId],
    };

    const { service, auth } = buildService({
      operationsState,
      projects: [
        {
          id: randomUUID(),
          name: 'Internal Sandbox',
          companyId: excludedCompanyId,
          memberIds: [],
        },
      ],
      companiesById: {
        [excludedCompanyId]: {
          id: excludedCompanyId,
          name: 'Excluded Org',
          domainName: null,
          updatedAt: '2026-11-26T00:00:00.000Z',
          sourceToken: 'b'.repeat(64),
        },
      },
    });

    const result = await service.hub(auth);

    expect(result.clients).toHaveLength(0);
    expect(result.summary.totalClients).toBe(0);
  });

  it('merges project-backed companies into directoryCandidates even when omitted from the first 100 alphabetical rows', async () => {
    const alphaId = randomUUID();
    const hokuroId = randomUUID();

    const { service, auth } = buildService({
      projects: [
        {
          id: randomUUID(),
          name: 'Hokuro Project 1',
          companyId: hokuroId,
          memberIds: [],
        },
        {
          id: randomUUID(),
          name: 'Hokuro Project 2',
          companyId: hokuroId,
          memberIds: [],
        },
      ],
      searchDirectoryResult: {
        hasMore: true,
        companies: [
          {
            id: alphaId,
            name: 'AAA Gmail Synced Lead',
            domainName: 'aaa.example',
            updatedAt: '2026-11-26T00:00:00.000Z',
            sourceToken: 'c'.repeat(64),
          },
        ],
      },
      companiesById: {
        [hokuroId]: {
          id: hokuroId,
          name: 'Hokuro',
          domainName: 'hokuro.io',
          updatedAt: '2026-11-26T00:00:00.000Z',
          sourceToken: 'd'.repeat(64),
        },
      },
    });

    const result = await service.directoryCandidates(auth, '');

    expect(result.companies.map((company) => company.id)).toEqual([
      hokuroId,
      alphaId,
    ]);
    expect(result.companies[0]).toMatchObject({
      id: hokuroId,
      isClient: true,
      hasDeliveryWork: true,
      projectsCount: 2,
    });
    expect(result.companies[1]).toMatchObject({
      id: alphaId,
      isClient: false,
      hasDeliveryWork: false,
      projectsCount: 0,
    });
  });

  it('saves and clears agreed fees with structural activity logging and computes current-month Projected MRR', async () => {
    const monthlyClientId = randomUUID();
    const monthlyProjectId = randomUUID();
    const quarterlyClientId = randomUUID();
    const oneTimeClientId = randomUUID();
    const currentMonthDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dubai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const { service, auth, activityInserts } = buildService({
      projects: [
        {
          id: monthlyProjectId,
          name: 'Apex Retainer',
          companyId: monthlyClientId,
          memberIds: [],
        },
        {
          id: randomUUID(),
          name: 'Beta Quarterly',
          companyId: quarterlyClientId,
          memberIds: [],
        },
        {
          id: randomUUID(),
          name: 'Gamma Launch',
          companyId: oneTimeClientId,
          memberIds: [],
        },
      ],
      companiesById: {
        [monthlyClientId]: {
          id: monthlyClientId,
          name: 'Apex Studio',
          domainName: 'apex.ae',
          updatedAt: '2026-11-26T00:00:00.000Z',
          sourceToken: 'e'.repeat(64),
        },
        [quarterlyClientId]: {
          id: quarterlyClientId,
          name: 'Beta Global',
          domainName: 'beta.com',
          updatedAt: '2026-11-26T00:00:00.000Z',
          sourceToken: 'f'.repeat(64),
        },
        [oneTimeClientId]: {
          id: oneTimeClientId,
          name: 'Gamma OneTime',
          domainName: 'gamma.io',
          updatedAt: '2026-11-26T00:00:00.000Z',
          sourceToken: '1'.repeat(64),
        },
      },
      financeV2Profile: {
        timezone: 'Asia/Dubai',
        exchangeRates: { AED: '1', USD: '3.6725' },
      },
      financeV2Journals: [
        {
          id: randomUUID(),
          entryType: 'INVOICE_PAYMENT',
          status: 'POSTED',
          entryDate: currentMonthDate,
          currency: 'AED',
          amountMicros: '5000000000',
          aedAmountMicros: '5000000000',
          projectId: monthlyProjectId,
          sourceRefType: 'CLIENT_BUSINESS_PAYMENT',
          sourceRefId: 'pay-1',
        },
      ],
    });

    await service.updateRoster(auth, {
      action: 'setFee',
      companyId: monthlyClientId,
      amount: 1000000, // 10,000.00 AED (minor units)
      currency: 'AED',
      cadence: 'MONTHLY',
    });
    await service.updateRoster(auth, {
      action: 'setFee',
      companyId: quarterlyClientId,
      amount: 300000, // 3,000.00 USD / 3 = 1,000 USD/mo
      currency: 'USD',
      cadence: 'QUARTERLY',
    });
    await service.updateRoster(auth, {
      action: 'setFee',
      companyId: oneTimeClientId,
      amount: 400000, // 4,000.00 AED one-time
      currency: 'AED',
      cadence: 'ONE_TIME',
    });

    expect(activityInserts).toHaveLength(3);
    expect(activityInserts[0]).toMatchObject({
      category: 'CLIENT',
      action: 'CLIENT_FEE_UPDATED',
    });

    const hub = await service.hub(auth);
    const projectedMrr = hub.summary.projectedMrr;
    expect(projectedMrr).not.toBeNull();

    // 10,000 AED + (3,000 USD / 3 = 1,000 USD * 3.6725 = 3,672.5 AED) = 13,672.5 AED
    expect(projectedMrr?.projectedMrrAedMicros).toBe('13672500000');
    expect(projectedMrr?.collectedTowardMrrAedMicros).toBe('5000000000');
    expect(projectedMrr?.remainingAedMicros).toBe('8672500000');
    expect(projectedMrr?.mrrClientCount).toBe(2);
    expect(projectedMrr?.oneTime.clientCount).toBe(1);
    expect(projectedMrr?.oneTime.totalAedMicros).toBe('4000000000');
    expect(projectedMrr?.paidClientCount).toBe(0);
    expect(projectedMrr?.partialClientCount).toBe(1);
    expect(projectedMrr?.unpaidClientCount).toBe(1);

    const apex = hub.clients.find((client) => client.id === monthlyClientId);
    expect(apex?.finance?.fee).toMatchObject({
      amount: 1000000,
      currency: 'AED',
      cadence: 'MONTHLY',
    });
    expect(apex?.finance?.currentMonthMrr).toMatchObject({
      status: 'PARTIAL',
      collectedTowardMrrAedMicros: '5000000000',
      remainingAedMicros: '5000000000',
      collectionPercent: 50,
    });

    const gamma = hub.clients.find((client) => client.id === oneTimeClientId);
    expect(gamma?.finance?.currentMonthMrr).toMatchObject({
      status: 'ONE_TIME',
      monthlyEquivalentAedMicros: '0',
    });

    // Clearing the monthly fee should succeed and drop MRR to Beta only
    await service.updateRoster(auth, {
      action: 'clearFee',
      companyId: monthlyClientId,
    });

    const afterClear = await service.hub(auth);
    expect(afterClear.summary.projectedMrr?.projectedMrrAedMicros).toBe(
      '3672500000',
    );
    expect(afterClear.summary.projectedMrr?.mrrClientCount).toBe(1);
    expect(
      afterClear.clients.find((client) => client.id === monthlyClientId)
        ?.finance?.fee,
    ).toBeNull();
  });

  it('persists client tags via setTags, records activity, and returns tags in hub snapshot', async () => {
    const belfortId = randomUUID();
    const { service, auth, activityInserts } = buildService({
      operationsState: {
        ...newDeliveryOperations(),
        clientRoster: {
          includedIds: [belfortId],
          excludedIds: [],
        },
      },
      companiesById: {
        [belfortId]: {
          id: belfortId,
          name: 'Belfort',
          domainName: 'belfort.example',
          updatedAt: '2026-04-01T00:00:00.000Z',
          sourceToken: 'tok-belfort',
        },
      },
    });

    await service.updateRoster(auth, {
      action: 'setTags',
      companyId: belfortId,
      tags: ['Clothing Brand'],
    });

    expect(activityInserts).toHaveLength(1);
    expect(activityInserts[0]).toMatchObject({
      category: 'CLIENT',
      action: 'CLIENT_ROSTER_UPDATED',
      changes: [
        {
          field: 'clientTags',
          before: null,
          after: 'Clothing Brand',
        },
      ],
    });

    const hub = await service.hub(auth);
    const belfort = hub.clients.find((client) => client.id === belfortId);
    expect(belfort?.tags).toEqual(['Clothing Brand']);

    await service.updateRoster(auth, {
      action: 'setTags',
      companyId: belfortId,
      tags: [],
    });

    const clearedHub = await service.hub(auth);
    expect(
      clearedHub.clients.find((client) => client.id === belfortId)?.tags,
    ).toEqual([]);
  });
});


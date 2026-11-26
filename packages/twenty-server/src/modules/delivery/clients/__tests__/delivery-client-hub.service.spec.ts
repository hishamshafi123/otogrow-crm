import { randomUUID } from 'node:crypto';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryClientHubService } from 'src/modules/delivery/clients/delivery-client-hub.service';
import { newDeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';

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
  }) => {
    const workspaceId = randomUUID();
    const workspace = {
      id: workspaceId,
      databaseSchema: 'workspace_test',
    };

    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WorkspaceEntity) {
          return { findOneByOrFail: jest.fn().mockResolvedValue(workspace) };
        }
        if (entity === DeliveryOperationsEntity) {
          return {
            findOneBy: jest.fn().mockResolvedValue({
              workspaceId,
              state: operationsState,
            }),
          };
        }
        if (entity === DeliveryProjectEntity) {
          return {
            find: jest.fn().mockResolvedValue(projects),
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

    return { service, auth: makeAuth(workspaceId), companies };
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
});

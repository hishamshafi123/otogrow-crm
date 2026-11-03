import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';

import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { OtogrowActivityEventEntity } from 'src/modules/otogrow-activity/entities/otogrow-activity-event.entity';
import { OtogrowActivityService } from 'src/modules/otogrow-activity/otogrow-activity.service';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const MEMBER_ID = '10000000-0000-4000-8000-000000000002';
const USER_WORKSPACE_ID = '10000000-0000-4000-8000-000000000003';
const OTHER_MEMBER_ID = '10000000-0000-4000-8000-000000000004';
const PROJECT_ID = '10000000-0000-4000-8000-000000000005';
const CLIENT_ID = '10000000-0000-4000-8000-000000000006';
const ROLE_ID = '10000000-0000-4000-8000-000000000007';
const workspace = { id: WORKSPACE_ID } as WorkspaceEntity;
type StoredEvent = { entity: OtogrowActivityEventEntity; exactAt: string };
const storedEvent = (
  suffix: string,
  exactAt: string,
  overrides: Partial<OtogrowActivityEventEntity> = {},
): StoredEvent => ({
  exactAt,
  entity: Object.assign(new OtogrowActivityEventEntity(), {
    id: `20000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    workspaceId: WORKSPACE_ID,
    occurredAt: new Date(exactAt),
    recordedAt: new Date('2026-11-01T00:00:00Z'),
    actorId: MEMBER_ID,
    actorName: 'Amna',
    actorType: 'HUMAN',
    subjectMemberId: null,
    subjectName: null,
    category: 'DELIVERY',
    action: 'TASK_REVIEWED',
    outcome: 'APPROVED',
    summary: 'Reviewed a submitted task.',
    projectId: PROJECT_ID,
    projectName: 'Brand project',
    clientId: CLIENT_ID,
    clientName: 'Brand',
    taskId: null,
    taskName: null,
    agentName: null,
    sourceType: 'project',
    sourceId: PROJECT_ID,
    changes: [],
    ...overrides,
  }),
});
const setup = (events: StoredEvent[]) => {
  const access: OtogrowAccess = {
    workspaceId: WORKSPACE_ID,
    memberId: MEMBER_ID,
    userWorkspaceId: USER_WORKSPACE_ID,
    nativeAdministrator: false,
    roleIds: [ROLE_ID],
    capabilities: ['workspace.admin', 'delivery.manage'],
    grants: [],
  };
  const state = { active: true, access, events };
  const queries: { sql: string; parameters: unknown[] }[] = [];
  const selections: { sql: string; alias: string }[] = [];
  const pageParameters: Record<string, string>[] = [];
  const getRepository = jest.fn((entity: unknown) => {
    if (entity !== OtogrowActivityEventEntity)
      throw new Error('Activity reads must not hydrate other records.');
    return {
      createQueryBuilder: () => {
        const parameters: Record<string, string> = {};
        let take = 0;
        const query = {
          where: (sql: string, values: Record<string, string>) => {
            queries.push({ sql, parameters: Object.values(values) });
            Object.assign(parameters, values);
            return query;
          },
          andWhere: (sql: string, values: Record<string, string>) => {
            queries.push({ sql, parameters: Object.values(values) });
            Object.assign(parameters, values);
            return query;
          },
          addSelect: (sql: string, alias: string) => {
            selections.push({ sql, alias });
            return query;
          },
          orderBy: () => query,
          addOrderBy: () => query,
          take: (limit: number) => {
            take = limit;
            return query;
          },
          getRawAndEntities: async () => {
            pageParameters.push({ ...parameters });
            const selected = state.events
              .filter(({ entity, exactAt }) => {
                if (entity.workspaceId !== parameters.workspaceId) return false;
                if (
                  parameters.personId &&
                  entity.actorId !== parameters.personId &&
                  entity.subjectMemberId !== parameters.personId
                )
                  return false;
                for (const field of [
                  'projectId',
                  'clientId',
                  'category',
                  'action',
                  'outcome',
                ] as const)
                  if (parameters[field] && entity[field] !== parameters[field])
                    return false;
                if (parameters.from && exactAt < parameters.from) return false;
                if (parameters.through && exactAt >= parameters.through)
                  return false;
                return (
                  !parameters.at ||
                  exactAt < parameters.at ||
                  (exactAt === parameters.at && entity.id < parameters.id)
                );
              })
              .sort(
                (left, right) =>
                  right.exactAt.localeCompare(left.exactAt) ||
                  right.entity.id.localeCompare(left.entity.id),
              )
              .slice(0, take);
            return {
              entities: selected.map(({ entity }) => entity),
              raw: selected
                .map(({ entity, exactAt }) => ({
                  activityCursorId: entity.id,
                  activityCursorAt: exactAt,
                }))
                .reverse(),
            };
          },
        };
        return query;
      },
    };
  });
  const manager = {
    getRepository,
    query: async (sql: string, parameters: unknown[] = []) => {
      queries.push({ sql, parameters });
      if (sql.includes('pg_advisory_xact_lock_shared')) return [];
      if (sql.includes('AS "validRange"'))
        return [{ validRange: String(parameters[0]) < String(parameters[1]) }];
      if (sql.includes('min("recordedAt")'))
        return [{ start: new Date('2026-11-01T00:00:00Z') }];
      if (sql.includes('SELECT DISTINCT ON')) return [];
      throw new Error('Only existing read-only activity queries are allowed.');
    },
  };
  const accessForUser = jest.fn(
    async (
      requestedWorkspace: string,
      requestedMember: string,
      requestedUserWorkspace: string,
      transactionManager: EntityManager,
    ) => {
      expect(transactionManager).toBe(manager);
      if (
        !state.active ||
        requestedWorkspace !== state.access.workspaceId ||
        requestedMember !== state.access.memberId ||
        requestedUserWorkspace !== state.access.userWorkspaceId
      )
        throw new ForbiddenException('Active workspace identity is required.');
      return state.access;
    },
  );
  const service = new OtogrowActivityService(
    {
      transaction: (callback: (manager: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
    } as unknown as DataSource,
    { accessForUser } as unknown as OtogrowAccessService,
  );
  const feed = (input: unknown = {}) =>
    service.feed(
      workspace,
      state.access.memberId,
      state.access.userWorkspaceId,
      input,
    );
  return {
    feed,
    service,
    state,
    queries,
    selections,
    pageParameters,
    getRepository,
    accessForUser,
  };
};
const closeEvents = () => [
  storedEvent('1', '2026-11-01T00:00:00.123999Z'),
  storedEvent('9', '2026-11-01T00:00:00.123456Z'),
  storedEvent('4', '2026-11-01T00:00:00.123456Z'),
  storedEvent('8', '2026-11-01T00:00:00.123455Z'),
  storedEvent('3', '2026-11-01T00:00:00.123001Z'),
];

describe('company activity paging', () => {
  it('returns every microsecond-ordered and tied event exactly once', async () => {
    const { feed, state, pageParameters, selections } = setup(closeEvents());
    const first = await feed({ limit: 2 });
    state.events.push(storedEvent('7', '2026-11-01T00:00:00.124000Z'));
    const second = await feed({ limit: 2, cursor: first.nextCursor });
    const third = await feed({ limit: 2, cursor: second.nextCursor });
    const ids = [...first.events, ...second.events, ...third.events].map(
      (event) => event.id,
    );
    expect(ids).toEqual(closeEvents().map(({ entity }) => entity.id));
    expect(new Set(ids).size).toBe(5);
    expect(third.nextCursor).toBeNull();
    expect(pageParameters[1].at).toBe('2026-11-01T00:00:00.123456Z');
    expect(pageParameters[1].id).toBe(closeEvents()[1].entity.id);
    expect(first.events[0].occurredAt).toBe('2026-11-01T00:00:00.123Z');
    expect(selections).toContainEqual({
      sql: expect.stringContaining('HH24:MI:SS.US'),
      alias: 'activityCursorAt',
    });
  });

  it('retains date bounds and actor-or-subject filtering with all other filters', async () => {
    const events = [
      storedEvent('1', '2026-10-31T00:00:00.000000Z'),
      storedEvent('2', '2026-11-01T00:00:00.000000Z'),
      storedEvent('3', '2026-11-01T00:00:00.123456Z', {
        actorId: OTHER_MEMBER_ID,
        subjectMemberId: MEMBER_ID,
      }),
      storedEvent('4', '2026-11-01T00:00:00.500000Z', {
        actorId: OTHER_MEMBER_ID,
      }),
      storedEvent('5', '2026-11-01T00:00:00.750000Z', {
        action: 'TASK_CREATED',
      }),
      storedEvent('6', '2026-11-02T00:00:00.000000Z'),
    ];
    const { feed } = setup(events);
    const result = await feed({
      personId: MEMBER_ID,
      projectId: PROJECT_ID,
      clientId: CLIENT_ID,
      category: 'DELIVERY',
      action: 'TASK_REVIEWED',
      outcome: 'APPROVED',
      from: '2026-11-01T00:00:00.000000Z',
      through: '2026-11-02T00:00:00.000000Z',
    });
    expect(result.events.map((event) => event.id)).toEqual([
      events[2].entity.id,
      events[1].entity.id,
    ]);
  });

  it('uses database-precision range validation and preserves microsecond boundary events', async () => {
    const { feed, queries } = setup(closeEvents());
    const result = await feed({
      from: '2026-11-01T00:00:00.123455Z',
      through: '2026-11-01T00:00:00.123456Z',
    });
    expect(result.events.map((event) => event.id)).toEqual([
      closeEvents()[3].entity.id,
    ]);
    expect(queries).toContainEqual({
      sql: 'SELECT $1::timestamptz < $2::timestamptz AS "validRange"',
      parameters: [
        '2026-11-01T00:00:00.123455Z',
        '2026-11-01T00:00:00.123456Z',
      ],
    });
    for (const through of [
      '2026-11-01T00:00:00.123455Z',
      '2026-11-01T00:00:00.123454Z',
    ])
      await expect(
        feed({ from: '2026-11-01T00:00:00.123455Z', through }),
      ).rejects.toThrow('The end of the activity range must follow its start.');
  });

  it.each([
    'member',
    'userWorkspace',
    'role',
    'capability',
    'nativeAdministrator',
  ])(
    'requires a fresh page after the current %s scope changes',
    async (change) => {
      const { feed, state, getRepository } = setup(closeEvents());
      const first = await feed({ limit: 1 });
      getRepository.mockClear();
      if (change === 'member') state.access.memberId = OTHER_MEMBER_ID;
      if (change === 'userWorkspace') state.access.userWorkspaceId = ROLE_ID;
      if (change === 'role') state.access.roleIds = [OTHER_MEMBER_ID];
      if (change === 'capability') state.access.capabilities.push('phone.use');
      if (change === 'nativeAdministrator')
        state.access.nativeAdministrator = true;
      await expect(feed({ cursor: first.nextCursor })).rejects.toThrow(
        'Reload activity after your account or permissions change.',
      );
      expect(getRepository).not.toHaveBeenCalled();
    },
  );

  it('does not invalidate a page solely because grants were returned in a different order', async () => {
    const { feed, state } = setup(closeEvents());
    state.access.roleIds.push(OTHER_MEMBER_ID);
    const first = await feed({ limit: 1 });
    state.access.roleIds.reverse();
    state.access.capabilities.reverse();
    const next = await feed({ limit: 1, cursor: first.nextCursor });
    expect(next.events[0].id).toBe(closeEvents()[1].entity.id);
  });

  it('rejects old, malformed and differently filtered cursors with a reset action', async () => {
    const { feed } = setup(closeEvents());
    const first = await feed({ limit: 1 });
    const cursor = JSON.parse(
      Buffer.from(first.nextCursor!, 'base64url').toString(),
    ) as Record<string, unknown>;
    for (const invalid of [
      { ...cursor, version: 1 },
      { ...cursor, at: '2026-11-01T00:00:00.123Z' },
      { ...cursor, at: '2026-02-30T00:00:00.123456Z' },
      { ...cursor, workspaceId: OTHER_MEMBER_ID },
    ])
      await expect(
        feed({
          cursor: Buffer.from(JSON.stringify(invalid)).toString('base64url'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      feed({ cursor: first.nextCursor, personId: OTHER_MEMBER_ID }),
    ).rejects.toThrow('Reload activity after changing filters or workspace.');
  });

  it.each(['inactive', 'nonadmin', 'identity'])(
    'checks current %s authorization before returning rows or filter options',
    async (change) => {
      const { feed, service, state, getRepository, queries } =
        setup(closeEvents());
      const first = await feed({ limit: 1 });
      getRepository.mockClear();
      queries.length = 0;
      if (change === 'inactive') state.active = false;
      if (change === 'nonadmin')
        state.access.capabilities = ['delivery.manage'];
      const result =
        change === 'identity'
          ? service.feed(workspace, MEMBER_ID, ROLE_ID, {
              cursor: first.nextCursor,
            })
          : feed({ cursor: first.nextCursor });
      await expect(result).rejects.toBeInstanceOf(ForbiddenException);
      expect(getRepository).not.toHaveBeenCalled();
      expect(queries).toHaveLength(1);
      expect(queries[0].sql).toContain('pg_advisory_xact_lock_shared');
    },
  );

  it('applies current finance access to the legacy feed without changing its cursor or source records', async () => {
    const event = storedEvent('1', '2026-11-01T00:00:00.123456Z', {
      summary: 'Recorded private charge SECRET_CHARGE_98765.',
      changes: [
        { field: 'state', before: 'IN_REVIEW', after: 'APPROVED' },
        {
          field: 'revisionInternalCost',
          before: null,
          after: 'SECRET_COST_54321',
        },
        {
          field: 'revisionProposedCharge',
          before: '0',
          after: 'SECRET_CHARGE_98765',
        },
      ],
    });
    const { feed, state } = setup([
      event,
      storedEvent('2', '2026-11-01T00:00:00.123455Z'),
    ]);
    const original = JSON.stringify(state.events);
    const redacted = await feed({ limit: 1 });
    expect(redacted.events[0].summary).toContain('finance access');
    expect(redacted.events[0].changes).toEqual([
      { field: 'state', before: 'IN_REVIEW', after: 'APPROVED' },
    ]);
    expect(JSON.stringify(redacted)).not.toContain('SECRET_');
    expect(redacted.events[0].occurredAt).toBe('2026-11-01T00:00:00.123Z');
    const cursor = JSON.parse(
      Buffer.from(redacted.nextCursor!, 'base64url').toString(),
    ) as { at: string };
    expect(cursor.at).toBe('2026-11-01T00:00:00.123456Z');
    state.access.capabilities.push('finance.read');
    const permitted = await feed({ limit: 1 });
    expect(permitted.events[0].changes).toEqual(event.entity.changes);
    expect(permitted.events[0].summary).toContain('SECRET_CHARGE_98765');
    state.access.capabilities = state.access.capabilities.filter(
      (capability) => capability !== 'finance.read',
    );
    const revoked = await feed({ limit: 1 });
    expect(JSON.stringify(revoked)).not.toContain('SECRET_');
    expect(JSON.stringify(state.events)).toBe(original);
  });

  it('repeated first and subsequent pages leave source records unchanged', async () => {
    const { feed, state, queries, accessForUser } = setup(closeEvents());
    const before = JSON.stringify(state.events);
    const first = await feed({ limit: 1 });
    await feed({ limit: 1 });
    await feed({ limit: 1, cursor: first.nextCursor });
    expect(JSON.stringify(state.events)).toBe(before);
    expect(accessForUser).toHaveBeenCalledTimes(3);
    expect(
      queries.every(
        ({ sql }) => !/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(sql),
      ),
    ).toBe(true);
  });
});

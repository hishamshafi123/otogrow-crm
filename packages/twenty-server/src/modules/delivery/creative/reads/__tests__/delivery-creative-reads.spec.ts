import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { newCreativeDocument } from 'src/modules/delivery/creative/delivery-creative.types';
import {
  DeliveryCreativeReadsService,
  creativeDocumentProjection,
  creativeTaskSummary,
} from 'src/modules/delivery/creative/reads/delivery-creative-reads.service';
import {
  creativeReadHash,
  creativeReadCursor,
  readCreativeCursor,
  creativeTasksSchema,
  parseCreativeRead,
} from 'src/modules/delivery/creative/reads/delivery-creative-reads.policy';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const userWorkspaceId = '33333333-3333-4333-8333-333333333333';
const taskId = '44444444-4444-4444-8444-444444444444';
const projectId = '55555555-5555-4555-8555-555555555555';
const actor = {
  memberId,
  isAdmin: false,
  isManager: false,
  roleIds: [],
  capabilities: [],
};
const row = {
  id: taskId,
  title: 'Produce the next concept',
  projectId,
  projectName: 'Brand',
  projectRevision: 2,
  revision: 3,
  assigneeId: memberId,
  assigneeName: 'Editor',
  assignmentKey: `${memberId}:legacy`,
  dueAt: null,
  state: 'IN_PROGRESS',
  service: 'VIDEO',
  hasProduction: true,
  canEdit: false,
  createdAtKey: '2026-11-03T06:00:00.123456Z',
};

const fixture = (answers: unknown[]) => {
  const calls: { sql: string; parameters: unknown[] }[] = [];
  const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
    calls.push({ sql, parameters });
    if (sql.includes('pg_advisory_xact_lock_shared')) return [];
    if (sql.includes('jsonb_build_array(p.id,p.revision)'))
      return [{ fingerprint: 'current-projects' }];
    return answers.shift();
  });
  const manager = { query } as unknown as EntityManager;
  const source = {
    transaction: (work: (manager: EntityManager) => Promise<unknown>) =>
      work(manager),
  } as unknown as DataSource;
  const delivery = {
    actor: jest.fn(async () => actor),
    schema: () => '"workspace_test"',
  } as unknown as DeliveryService;
  return {
    calls,
    delivery,
    service: new DeliveryCreativeReadsService(source, delivery),
    workspace: { id: workspaceId } as WorkspaceEntity,
  };
};

describe('Creative production reads', () => {
  it('preserves the exact microsecond cursor and rejects identity, filter and kind changes', () => {
    const scope = creativeReadHash({ actor: memberId, filter: 'STARTED' });
    const cursor = creativeReadCursor(scope, 'TASK', row.createdAtKey, taskId);
    expect(readCreativeCursor(cursor, scope, 'TASK')).toMatchObject({
      key: row.createdAtKey,
      id: taskId,
    });
    expect(() =>
      readCreativeCursor(
        cursor,
        creativeReadHash({ actor: memberId, filter: 'ALL' }),
        'TASK',
      ),
    ).toThrow(BadRequestException);
    expect(() => readCreativeCursor(cursor, scope, 'PROJECT')).toThrow(
      BadRequestException,
    );
    expect(() =>
      readCreativeCursor(
        creativeReadCursor(scope, 'TASK', 'invalid', taskId),
        scope,
        'TASK',
      ),
    ).toThrow(BadRequestException);
  });
  it('bounds pages and never accepts an unrecognized production filter', () => {
    expect(() => parseCreativeRead(creativeTasksSchema, { limit: 51 })).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseCreativeRead(creativeTasksSchema, { production: 'SECRET' }),
    ).toThrow(BadRequestException);
    expect(
      parseCreativeRead(creativeTasksSchema, {
        limit: 25,
        mine: true,
        production: 'NOT_STARTED',
      }),
    ).toEqual({ limit: 25, mine: true, production: 'NOT_STARTED' });
  });
  it('distinguishes editing authority from visibility and final approval', () => {
    expect(creativeTaskSummary(row, actor).canEdit).toBe(true);
    expect(
      creativeTaskSummary({ ...row, assigneeId: null }, actor).canEdit,
    ).toBe(false);
    expect(
      creativeTaskSummary(
        { ...row, state: 'APPROVED' },
        { ...actor, isManager: true },
      ).canEdit,
    ).toBe(false);
    expect(
      creativeTaskSummary({ ...row, state: 'IN_REVIEW' }, actor).canEdit,
    ).toBe(false);
  });
  it('redacts financial fields without changing stored production', () => {
    const document = newCreativeDocument();
    document.revisionCharge = 125;
    expect(creativeDocumentProjection(document, actor)?.revisionCharge).toBe(0);
    expect(document.revisionCharge).toBe(125);
    expect(
      creativeDocumentProjection(document, {
        ...actor,
        capabilities: ['finance.read'],
      })?.revisionCharge,
    ).toBe(125);
  });
  it('context checks current authority and contains no task document', async () => {
    const { service, workspace, calls, delivery } = fixture([]);
    const result = await service.context(workspace, memberId, userWorkspaceId);
    expect(result.actor).toEqual(actor);
    expect(delivery.actor).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty('tasks');
    expect(calls.every(({ sql }) => sql.startsWith('SELECT'))).toBe(true);
    expect(calls[0].parameters).toEqual([`delivery:${workspaceId}`]);
  });
  it('state omits production JSON and excludes deleted native tasks before exact selection', async () => {
    const { service, workspace, calls } = fixture([[row]]);
    const result = await service.state(workspace, memberId, userWorkspaceId, {
      taskId,
    });
    expect(result.task.id).toBe(taskId);
    expect(result).not.toHaveProperty('document');
    const exact = calls[calls.length - 1];
    expect(exact.sql).toContain('n."deletedAt" IS NULL');
    expect(exact.sql).toContain('p."memberIds" @> $3::jsonb');
    expect(exact.sql).not.toContain(' AS document');
    expect(exact.parameters).toEqual([
      workspaceId,
      false,
      JSON.stringify([memberId]),
      taskId,
    ]);
  });
  it('denies inaccessible exact tasks rather than returning an empty editable document', async () => {
    const { service, workspace } = fixture([[]]);
    await expect(
      service.detail(workspace, memberId, userWorkspaceId, { taskId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('loads only the requested creative document with current finance projection', async () => {
    const document = newCreativeDocument();
    document.revisionCharge = 123;
    const { service, workspace, calls } = fixture([[{ ...row, document }]]);
    const result = await service.detail(workspace, memberId, userWorkspaceId, {
      taskId,
    });
    expect(result.document?.briefVersion).toBe(1);
    expect(result.document?.revisionCharge).toBe(0);
    expect(calls[calls.length - 1].sql).toContain(
      "d.details->'creative' AS document",
    );
    expect(calls[calls.length - 1].sql).not.toContain('d.details AS');
  });
  it('returns exact scoped counts and a bounded first page without per-task reads', async () => {
    const { service, workspace, calls } = fixture([
      [{ totalCount: 70, fingerprint: 'tasks' }],
      [row, { ...row, id: projectId }],
    ]);
    const result = await service.tasks(workspace, memberId, userWorkspaceId, {
      limit: 1,
      mine: true,
      production: 'STARTED',
      search: '%_',
    });
    expect(result.totalCount).toBe(70);
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
    expect(calls).toHaveLength(4);
    expect(calls[3].parameters[4]).toBe('%\\%\\_%');
    expect(calls[3].parameters[6]).toBe(memberId);
    expect(calls[3].parameters[calls[3].parameters.length - 1]).toBe(2);
    expect(calls[3].sql).not.toContain(' AS document');
  });
  it('same-project references are filtered before count and never include rejected or hidden sources', async () => {
    const { service, workspace, calls } = fixture([
      [row],
      [{ totalCount: 0, fingerprint: 'references' }],
      [],
    ]);
    const result = await service.references(
      workspace,
      memberId,
      userWorkspaceId,
      { taskId },
    );
    expect(result.totalCount).toBe(0);
    expect(result.items).toEqual([]);
    const count = calls[3];
    expect(count.sql).toContain('d."projectId"=$4');
    expect(count.sql).toContain("->-1->>'decision'='APPROVED'");
    expect(count.sql).toContain('n."deletedAt" IS NULL');
    expect(count.parameters.slice(3, 5)).toEqual([projectId, taskId]);
    expect(calls.every(({ sql }) => !/INSERT|UPDATE|DELETE/.test(sql))).toBe(
      true,
    );
  });
});

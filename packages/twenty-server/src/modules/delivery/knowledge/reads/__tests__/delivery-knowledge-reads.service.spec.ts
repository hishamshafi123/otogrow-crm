import { type DataSource } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryKnowledgeReadsService } from 'src/modules/delivery/knowledge/reads/delivery-knowledge-reads.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const memberId = '00000000-0000-4000-8000-000000000002';
const projectId = '00000000-0000-4000-8000-000000000003';
const sourceId = '00000000-0000-4000-8000-000000000004';
const workspace = { id: workspaceId } as WorkspaceEntity;
const project = {
  id: projectId,
  name: 'Brand',
  revision: 3,
  memberIds: [memberId],
};
const actor = {
  memberId,
  isAdmin: false,
  isManager: false,
  roleIds: [],
  capabilities: [],
};
const source = {
  id: sourceId,
  revision: 2,
  createdBy: memberId,
  currentVersion: 2,
  publishedVersion: 1,
  publishedAt: '2026-10-30T01:00:00.000000Z',
  title: 'Meeting',
  category: 'MEETING',
  meetingDate: '2026-10-30',
  version: 2,
  canEdit: true,
  createdAtKey: '2026-10-30T01:00:00.000123Z',
};
const prepare = () => {
  const results: unknown[][] = [];
  const query = jest.fn(async (sql: string) =>
    sql.includes('pg_advisory_xact_lock') ? [] : (results.shift() ?? []),
  );
  const findOne = jest.fn().mockResolvedValue(project);
  const repository = {
    findOne,
    save: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const manager = { query, getRepository: jest.fn(() => repository) };
  const dataSource = {
    transaction: jest.fn(
      async (callback: (value: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  } as unknown as DataSource;
  const currentActor = jest.fn().mockResolvedValue(actor);
  const delivery = {
    actor: currentActor,
    snapshot: jest.fn(() => {
      throw new Error('Legacy snapshot must not run');
    }),
  } as unknown as DeliveryService;
  return {
    reads: new DeliveryKnowledgeReadsService(dataSource, delivery),
    results,
    query,
    findOne,
    currentActor,
    repository,
  };
};

it('loads only the exact current project for context, and denies revoked project membership before any source query', async () => {
  const fixture = prepare();
  expect(
    await fixture.reads.context(workspace, memberId, memberId, { projectId }),
  ).toMatchObject({
    workspaceId,
    memberId,
    selectedProject: { id: projectId, name: 'Brand', revision: 3 },
    canPublish: false,
  });
  expect(
    fixture.query.mock.calls.every(([sql]) =>
      sql.includes('pg_advisory_xact_lock'),
    ),
  ).toBe(true);
  fixture.findOne.mockResolvedValue({ ...project, memberIds: [] });
  await expect(
    fixture.reads.state(workspace, memberId, memberId, { projectId, sourceId }),
  ).rejects.toThrow('project is unavailable');
  expect(fixture.repository.save).not.toHaveBeenCalled();
});

it('returns complete scoped counts and projected list pages without hydrating private content or running per-row lookups', async () => {
  const fixture = prepare();
  fixture.results.push(
    [{ totalCount: 70, fingerprint: 'one' }],
    Array.from({ length: 26 }, (_, index) => ({
      ...source,
      id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
    })),
  );
  const result = await fixture.reads.list(workspace, memberId, memberId, {
    projectId,
    search: 'published',
  });
  expect(result.totalCount).toBe(70);
  expect(result.items).toHaveLength(25);
  expect(result.nextCursor).not.toBeNull();
  expect(result.items[0]).not.toHaveProperty('createdAtKey');
  expect(result.items[0]).not.toHaveProperty('transcript');
  expect(fixture.findOne).toHaveBeenCalledTimes(1);
  const selects = fixture.query.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => !sql.includes('pg_advisory_xact_lock'));
  expect(selects).toHaveLength(2);
  const pageProjection = selects[1].split('FROM')[0];
  for (const privateField of [
    'v.transcript',
    'v.knowledge',
    'v."sourceUrl"',
    'SELECT *',
  ])
    expect(pageProjection).not.toContain(privateField);
  expect(selects[0]).toContain('s."publishedVersion"');
  expect(selects[0]).not.toContain('transcript');
  expect(selects[1]).toContain('LIMIT $9');
});

it('keeps selected-source polling metadata-only and historical detail opt-in', async () => {
  const fixture = prepare();
  fixture.results.push([source]);
  const state = await fixture.reads.state(workspace, memberId, memberId, {
    projectId,
    sourceId,
    version: 1,
  });
  expect(state.source).toMatchObject({ id: sourceId, currentVersion: 2 });
  const sql = fixture.query.mock.calls[fixture.query.mock.calls.length - 1][0];
  expect(sql).not.toContain('transcript');
  expect(sql).not.toContain('v.knowledge');
  expect(sql).not.toContain('v."sourceUrl"');
  fixture.results.push([
    {
      ...source,
      transcript: 'Private raw notes',
      sourceUrl: 'https://source.invalid',
      knowledge: 'Reviewed text',
    },
  ]);
  const detail = await fixture.reads.detail(workspace, memberId, memberId, {
    projectId,
    sourceId,
    version: 1,
  });
  expect(detail.detail?.transcript).toBe('Private raw notes');
});

it('never returns private evidence for a non-editing published reader and uses null for inaccessible exact sources', async () => {
  const fixture = prepare();
  fixture.results.push([
    {
      ...source,
      canEdit: false,
      version: 1,
      transcript: 'Do not disclose',
      sourceUrl: 'https://private.invalid',
      knowledge: 'Approved facts',
    },
  ]);
  const result = await fixture.reads.detail(workspace, memberId, memberId, {
    projectId,
    sourceId,
  });
  expect(result.detail).toMatchObject({
    sourceUrl: '',
    transcript: null,
    knowledge: 'Approved facts',
    canEdit: false,
  });
  fixture.results.push([]);
  expect(
    (
      await fixture.reads.state(workspace, memberId, memberId, {
        projectId,
        sourceId,
      })
    ).source,
  ).toBeNull();
  fixture.results.push([]);
  expect(
    (
      await fixture.reads.detail(workspace, memberId, memberId, {
        projectId,
        sourceId,
      })
    ).detail,
  ).toBeNull();
});

it('returns a bounded project directory rather than manufacturing a whole workspace', async () => {
  const fixture = prepare();
  fixture.results.push(
    [{ totalCount: 55, fingerprint: 'projects' }],
    Array.from({ length: 26 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
      name: `Project ${index}`,
      revision: 1,
    })),
  );
  const result = await fixture.reads.projects(
    workspace,
    memberId,
    memberId,
    {},
  );
  expect(result.totalCount).toBe(55);
  expect(result.items).toHaveLength(25);
  expect(result.nextCursor).not.toBeNull();
  expect(fixture.findOne).not.toHaveBeenCalled();
  expect(result).not.toHaveProperty('tasks');
  expect(result).not.toHaveProperty('companies');
});

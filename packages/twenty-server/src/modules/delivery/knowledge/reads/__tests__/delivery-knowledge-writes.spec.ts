import { DataSource, QueryFailedError } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryKnowledgeService } from 'src/modules/delivery/knowledge/delivery-knowledge.service';
import { DeliveryKnowledgeSourceEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-source.entity';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn().mockResolvedValue(undefined),
}));
const workspaceId = '00000000-0000-4000-8000-000000000001';
const memberId = '00000000-0000-4000-8000-000000000002';
const projectId = '00000000-0000-4000-8000-000000000003';
const id = '00000000-0000-4000-8000-000000000004';
const workspace = { id: workspaceId } as WorkspaceEntity;
const input = {
  projectId,
  id,
  revision: 0,
  title: 'Meeting evidence',
  category: 'MEETING',
  meetingDate: '2026-10-31',
  sourceUrl: '',
  transcript: 'Confirmed meeting notes',
  knowledge: 'Reviewed facts',
};
const existing = {
  id,
  workspaceId,
  projectId,
  createdBy: memberId,
  currentVersion: 1,
  revision: 1,
  publishedVersion: null,
  publishedBy: null,
  publishedAt: null,
};
const prepare = () => {
  const sourceRepository = {
    findOneBy: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: object) => value),
    insert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    save: jest.fn(() => {
      throw new Error('Source upsert is forbidden');
    }),
  };
  const versionRepository = {
    findOneByOrFail: jest.fn().mockResolvedValue({ ...input, version: 1 }),
    insert: jest.fn().mockResolvedValue({}),
  };
  const projectRepository = {
    findOneBy: jest
      .fn()
      .mockResolvedValue({ id: projectId, memberIds: [memberId] }),
  };
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: unknown) =>
      entity === DeliveryKnowledgeSourceEntity
        ? sourceRepository
        : entity === DeliveryProjectEntity
          ? projectRepository
          : versionRepository,
    ),
  };
  let rolledBack = false;
  const dataSource = {
    transaction: async (
      callback: (value: typeof manager) => Promise<unknown>,
    ) => {
      try {
        return await callback(manager);
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    },
  } as unknown as DataSource;
  const actor = jest.fn().mockResolvedValue({ memberId, isManager: true });
  const service = new DeliveryKnowledgeService(dataSource, {
    actor,
  } as unknown as DeliveryService);
  return {
    service,
    sourceRepository,
    versionRepository,
    rolledBack: () => rolledBack,
  };
};
beforeEach(() => jest.clearAllMocks());

it('strictly inserts a new ID and reports a concurrent global collision only after rollback', async () => {
  const fixture = prepare();
  fixture.sourceRepository.insert.mockRejectedValue(
    new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('Private foreign row details'), {
        code: '23505',
      }),
    ),
  );
  await expect(
    fixture.service.save(workspace, memberId, memberId, input),
  ).rejects.toThrow('Check the exact source');
  expect(fixture.rolledBack()).toBe(true);
  expect(fixture.sourceRepository.save).not.toHaveBeenCalled();
  expect(fixture.sourceRepository.update).not.toHaveBeenCalled();
  expect(fixture.versionRepository.insert).not.toHaveBeenCalled();
  expect(recordOtogrowActivity).not.toHaveBeenCalled();
});

it('refuses an existing foreign ID rather than transferring its project or workspace', async () => {
  const fixture = prepare();
  fixture.sourceRepository.findOneBy.mockResolvedValue({
    ...existing,
    workspaceId: '00000000-0000-4000-8000-000000000099',
  });
  await expect(
    fixture.service.save(workspace, memberId, memberId, input),
  ).rejects.toThrow();
  expect(fixture.sourceRepository.insert).not.toHaveBeenCalled();
  expect(fixture.sourceRepository.update).not.toHaveBeenCalled();
  expect(fixture.sourceRepository.save).not.toHaveBeenCalled();
});

it('requires exact revision for a repeated create and never automatically creates another version', async () => {
  const fixture = prepare();
  fixture.sourceRepository.findOneBy.mockResolvedValue({ ...existing });
  await expect(
    fixture.service.save(workspace, memberId, memberId, input),
  ).rejects.toThrow('Reload it before saving');
  expect(fixture.versionRepository.insert).not.toHaveBeenCalled();
  expect(fixture.sourceRepository.update).not.toHaveBeenCalled();
});

it.each([null, '987654321'])(
  'retains meeting origin %s and updates only the exact workspace/project/revision, failing atomically if that row changed',
  async (fathomRecordingId) => {
    const fixture = prepare();
    fixture.sourceRepository.findOneBy.mockResolvedValue({
      ...existing,
      fathomRecordingId,
    });
    fixture.sourceRepository.update.mockResolvedValue({ affected: 0 });
    await expect(
      fixture.service.save(workspace, memberId, memberId, {
        ...input,
        revision: 1,
      }),
    ).rejects.toThrow('Reload it before saving');
    expect(fixture.sourceRepository.update).toHaveBeenCalledWith(
      { id, workspaceId, projectId, revision: 1 },
      { revision: 2, currentVersion: 2, fathomRecordingId },
    );
    expect(fixture.versionRepository.insert).not.toHaveBeenCalled();
    expect(fixture.rolledBack()).toBe(true);
  },
);

it('retains the publication check and uses an exact scoped revision update without source upsert', async () => {
  const fixture = prepare();
  fixture.sourceRepository.findOneBy.mockResolvedValue({ ...existing });
  await expect(
    fixture.service.publish(workspace, memberId, memberId, {
      projectId,
      id,
      revision: 1,
      publish: true,
    }),
  ).resolves.toBe(true);
  expect(fixture.sourceRepository.update).toHaveBeenCalledWith(
    { id, workspaceId, projectId, revision: 1 },
    expect.objectContaining({
      publishedVersion: 1,
      publishedBy: memberId,
      revision: 2,
    }),
  );
  expect(fixture.sourceRepository.save).not.toHaveBeenCalled();
});

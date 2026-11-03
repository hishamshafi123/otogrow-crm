import { randomUUID } from 'node:crypto';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryKnowledgeSourceEntity } from 'src/modules/delivery/knowledge/entities/delivery-knowledge-source.entity';
import { DeliveryFathomConnectionEntity } from 'src/modules/delivery/knowledge/fathom/entities/delivery-fathom-connection.entity';
import { DeliveryFathomService } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.service';
import { type DeliveryFathomAdapter } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.adapter';
import { fathomHash } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.policy';

const workspace = {
  id: '00000000-0000-4000-8000-000000000001',
} as WorkspaceEntity;
const memberId = '00000000-0000-4000-8000-000000000002';
const projectId = '00000000-0000-4000-8000-000000000003';
const sourceId = '00000000-0000-4000-8000-000000000004';
const companyId = '00000000-0000-4000-8000-000000000005';
const userWorkspaceId = '00000000-0000-4000-8000-000000000006';
const prepare = () => {
  const state = {
    active: false,
    isAdmin: true,
    connection: { revision: 1, enabled: true, apiKey: 'encrypted-key' },
    project: {
      id: projectId,
      workspaceId: workspace.id,
      companyId,
      revision: 1,
    },
    source: null as {
      id: string;
      workspaceId: string;
      projectId: string;
      fathomRecordingId: string | null;
    } | null,
    duplicate: null as { id: string } | null,
  };
  const queryRunner = {
    get isTransactionActive() {
      return state.active;
    },
  };
  const builder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => ({ ...state.connection })),
  };
  const sourceRepository = {
    findOneBy: jest.fn(async (where: { fathomRecordingId?: string }) =>
      where.fathomRecordingId ? state.duplicate : state.source,
    ),
  };
  const manager = {
    queryRunner,
    query: jest.fn(async () => []),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === DeliveryFathomConnectionEntity)
        return { createQueryBuilder: () => builder };
      if (entity === DeliveryProjectEntity)
        return { findOneBy: async () => ({ ...state.project }) };
      if (entity === DeliveryKnowledgeSourceEntity) return sourceRepository;
      throw new Error('Unexpected repository');
    }),
  } as unknown as EntityManager;
  const source = {
    transaction: async (
      callback: (manager: EntityManager) => Promise<unknown>,
    ) => {
      state.active = true;
      try {
        return await callback(manager);
      } finally {
        state.active = false;
      }
    },
  } as unknown as DataSource;
  const actor = jest.fn(async () => ({
    memberId,
    isAdmin: state.isAdmin,
    isManager: state.isAdmin,
    roleIds: [],
    capabilities: [],
  }));
  const sealed = new Map<string, { value: string; workspaceId: string }>();
  const encryption = {
    encryptVersioned: (value: string, options: { workspaceId: string }) => {
      const token = randomUUID();
      sealed.set(token, { value, workspaceId: options.workspaceId });
      return token;
    },
    decryptVersionedOrThrow: (
      token: string,
      options: { workspaceId: string },
    ) => {
      if (token === 'encrypted-key') return 'never-return-this-key';
      const found = sealed.get(token);
      if (!found || found.workspaceId !== options.workspaceId)
        throw new Error('Invalid envelope');
      return found.value;
    },
  } as unknown as SecretEncryptionService;
  const transcript = '[00:00:01] Amna: Confirmed product claim.';
  const adapter = {
    transcript: jest.fn(async () => {
      expect(state.active).toBe(false);
      return {
        transcript,
        transcriptHash: fathomHash(transcript),
        segmentCount: 1,
      };
    }),
    meetings: jest.fn(async () => {
      expect(state.active).toBe(false);
      return {
        items: [
          {
            recordingId: '123',
            title: 'Original provider title',
            recordedAt: '2026-11-01T12:00:00Z',
            sourceUrl: 'https://fathom.video/calls/999',
          },
        ],
        nextCursor: null,
        scannedCount: 1,
      };
    }),
  };
  const service = new DeliveryFathomService(
    source,
    { actor } as unknown as DeliveryService,
    encryption,
    adapter as unknown as DeliveryFathomAdapter,
  );
  const preview = () =>
    service.preview(workspace, memberId, userWorkspaceId, {
      projectId,
      sourceId,
      recordingId: '123',
    });
  const verify = async (
    value: Awaited<ReturnType<typeof preview>>,
    changes: Partial<Parameters<DeliveryFathomService['verifyImport']>[4]> = {},
    actorId = memberId,
  ) => {
    state.active = true;
    try {
      return await service.verifyImport(
        manager,
        workspace,
        actorId,
        userWorkspaceId,
        {
          projectId,
          id: sourceId,
          transcript: value.transcript,
          fathomImportProof: value.proof,
          fathomImportHash: value.proofHash,
          ...changes,
        },
      );
    } finally {
      state.active = false;
    }
  };
  return { state, manager, service, adapter, preview, verify, sealed };
};

it('performs provider IO outside the workspace transaction and returns only verified private metadata', async () => {
  const fixture = prepare();
  const settings = await fixture.service.settings(
    workspace,
    memberId,
    userWorkspaceId,
  );
  expect(settings).toMatchObject({ credentialConfigured: true, enabled: true });
  expect(JSON.stringify(settings)).not.toContain('never-return-this-key');
  const meetings = await fixture.service.meetings(
    workspace,
    memberId,
    userWorkspaceId,
    {
      projectId,
      sourceId,
      createdAfter: '2026-11-01T00:00:00Z',
      createdBefore: '2026-11-03T00:00:00Z',
    },
  );
  const preview = await fixture.service.preview(
    workspace,
    memberId,
    userWorkspaceId,
    {
      projectId,
      sourceId,
      recordingId: '123',
      meetingProof: meetings.items[0].proof,
    },
  );
  expect(preview.meeting).toMatchObject({
    title: 'Original provider title',
    recordingId: '123',
    sourceUrl: 'https://fathom.video/calls/999',
  });
  expect(await fixture.verify(preview)).toMatchObject({
    provider: 'FATHOM',
    recordingId: '123',
    companyId,
    humanEdited: false,
  });
  expect(
    await fixture.verify(preview, { transcript: 'A human correction' }),
  ).toMatchObject({ title: 'Original provider title', humanEdited: true });
});
it('keeps unknown direct-ID metadata unknown instead of inventing a call link or meeting date', async () => {
  const value = await prepare().preview();
  expect(value.meeting).toMatchObject({
    title: null,
    recordedAt: null,
    sourceUrl: null,
  });
});
it('denies nonadministrators and foreign source IDs before provider access', async () => {
  const fixture = prepare();
  fixture.state.isAdmin = false;
  await expect(fixture.preview()).rejects.toThrow('administrators');
  fixture.state.isAdmin = true;
  fixture.state.source = {
    id: sourceId,
    workspaceId: randomUUID(),
    projectId,
    fathomRecordingId: null,
  };
  await expect(fixture.preview()).rejects.toThrow('source is unavailable');
  expect(fixture.adapter.transcript).not.toHaveBeenCalled();
});
it('rejects connection revocation during IO and rechecks it again when importing', async () => {
  const fixture = prepare();
  const value = await fixture.preview();
  fixture.state.connection.enabled = false;
  await expect(fixture.verify(value)).rejects.toThrow('disabled');
  fixture.state.connection.enabled = true;
  fixture.adapter.transcript.mockImplementationOnce(async () => {
    fixture.state.connection.enabled = false;
    return {
      transcript: value.transcript,
      transcriptHash: fathomHash(value.transcript),
      segmentCount: 1,
    };
  });
  await expect(fixture.preview()).rejects.toThrow('disabled');
});
it('binds import evidence to the exact actor, source, project/client and connection revision', async () => {
  const fixture = prepare();
  const value = await fixture.preview();
  await expect(fixture.verify(value, {}, randomUUID())).rejects.toThrow(
    'changed',
  );
  await expect(fixture.verify(value, { id: randomUUID() })).rejects.toThrow(
    'changed',
  );
  await expect(
    fixture.verify(value, { fathomImportHash: 'a'.repeat(64) }),
  ).rejects.toThrow('evidence');
  fixture.state.project.companyId = randomUUID();
  await expect(fixture.verify(value)).rejects.toThrow('changed');
  fixture.state.project.companyId = companyId;
  fixture.state.connection.revision += 1;
  await expect(fixture.verify(value)).rejects.toThrow('changed');
});
it('rejects expired evidence and duplicate or different-recording source identity', async () => {
  const fixture = prepare();
  const value = await fixture.preview();
  fixture.state.duplicate = { id: randomUUID() };
  await expect(fixture.verify(value)).rejects.toThrow('already imported');
  fixture.state.duplicate = null;
  fixture.state.source = {
    id: sourceId,
    projectId,
    workspaceId: workspace.id,
    fathomRecordingId: '456',
  };
  await expect(fixture.verify(value)).rejects.toThrow(
    'another Fathom recording',
  );
  fixture.state.source = null;
  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now + 16 * 60000);
  try {
    await expect(fixture.verify(value)).rejects.toThrow('expired');
  } finally {
    jest.restoreAllMocks();
  }
});

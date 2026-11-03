import { randomUUID } from 'node:crypto';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { newCreativeDocument } from 'src/modules/delivery/creative/delivery-creative.types';
import { type OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import { OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';
import { DeliveryAtlasJobEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-job.entity';
import { DeliveryAtlasService } from 'src/modules/delivery/creative/atlas/delivery-atlas.service';
import {
  type DeliveryAtlasAdapter,
  type AtlasPrediction,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.adapter';
import { type DeliveryAtlasConnectionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-connection.service';
import { type DeliveryAtlasProductionService } from 'src/modules/delivery/creative/atlas/delivery-atlas-production.service';
import {
  ATLAS_PROFILES,
  ATLAS_SCHEMA_REVISION,
  normalizeAtlasParameters,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.catalog';

const WORKSPACE_ID = randomUUID(),
  MEMBER_ID = randomUUID(),
  MEMBERSHIP_ID = randomUUID(),
  TASK_ID = randomUUID(),
  PROJECT_ID = randomUUID();
const workspace = {
  id: WORKSPACE_ID,
  databaseSchema: 'synthetic_workspace',
} as WorkspaceEntity;
const setup = () => {
  const profile = ATLAS_PROFILES[0];
  let job: DeliveryAtlasJobEntity = Object.assign(
    new DeliveryAtlasJobEntity(),
    {
      id: randomUUID(),
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      projectId: PROJECT_ID,
      actorId: MEMBER_ID,
      userWorkspaceId: MEMBERSHIP_ID,
      requestId: randomUUID(),
      credentialId: randomUUID(),
      configurationRevision: 1,
      revision: 1,
      requestHash: 'a'.repeat(64),
      quoteToken: 'b'.repeat(64),
      status: 'QUOTED',
      request: {
        profileId: profile.id,
        familyId: profile.familyId,
        modelLabel: profile.label,
        kind: 'IMAGE',
        operation: profile.operation,
        schemaRevision: ATLAS_SCHEMA_REVISION,
        taskRevision: 1,
        briefVersion: 1,
        productionVersion: 1,
        assemblyVersion: 1,
        settingsVersion: 1,
        target: 'BRIEF',
        shotId: null,
        shotVersion: null,
        prompt: 'Explicit synthetic image',
        referenceAssetIds: [],
        parameters: normalizeAtlasParameters(profile, {}),
      },
      referenceUrls: [],
      reservationLimit: {
        id: randomUUID(),
        revision: 1,
        profileId: profile.id,
        maximumCostUsd: '0.500000',
        source: 'Synthetic checked finite bound',
        verifiedAt: '2026-10-28T00:00:00.000Z',
      },
      quotedCostUsd: '0.100000',
      quoteEstimated: false,
      quotedAt: new Date(),
      providerPredictionId: null,
      providerStatus: null,
      outputUrl: null,
      publicationCancelled: false,
      assetId: null,
      costState: 'UNRESERVED',
      error: null,
      leaseToken: null,
      leaseUntil: null,
      nextAttemptAt: null,
      attempts: 0,
      submittedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  );
  const document = newCreativeDocument();
  document.mediaSettings = {
    version: 1,
    enabled: true,
    modelIds: [`atlascloud/${profile.id}`],
    roles: ['ADMIN'],
    dailyRunLimit: 5,
    allowUnknownCost: false,
  };
  const scope = {
    actor: { isAdmin: true, isManager: true },
    task: {
      taskId: TASK_ID,
      revision: 1,
      projectId: PROJECT_ID,
      details: { creative: document },
    },
    assigneeId: MEMBER_ID,
  } as unknown as Awaited<ReturnType<DeliveryCreativeService['scope']>>;
  let spend: Pick<
    OtogrowAiSpendEntity,
    'sourceRunId' | 'state' | 'actualMicroUsd'
  > | null = null;
  const events: string[] = [];
  const count = jest.fn(async () => 0);
  const builder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => [structuredClone(job)]),
    getCount: count,
  };
  const jobs = {
    findOneBy: jest.fn(async () => structuredClone(job)),
    save: jest.fn(async (next: DeliveryAtlasJobEntity) => {
      events.push(`job:${next.status}:${next.providerPredictionId ?? 'none'}`);
      job = structuredClone(next);
      return structuredClone(job);
    }),
    createQueryBuilder: () => builder,
  };
  const spends = {
    find: jest.fn(async () => (spend ? [spend] : [])),
    createQueryBuilder: () => builder,
  };
  const manager = {
    query: jest.fn(async () => []),
    getRepository: (entity: unknown) =>
      entity === DeliveryAtlasJobEntity
        ? jobs
        : entity === OtogrowAiSpendEntity
          ? spends
          : {
              findOneBy: async () => workspace,
              findOneByOrFail: async () => workspace,
            },
  } as unknown as EntityManager;
  const source = {
    transaction: async (work: (manager: EntityManager) => Promise<unknown>) =>
      work(manager),
  } as DataSource;
  const connection = { credentialId: job.credentialId, revision: 1 };
  const validate = jest.fn(async () => ({ scope, document, connection }));
  const secret = jest.fn(async () => 'test-only-key');
  const connections = {
    lock: jest.fn(async () => undefined),
    secret,
    limit: () => job.reservationLimit,
  } as unknown as DeliveryAtlasConnectionService;
  const submit = jest.fn<Promise<AtlasPrediction>, []>(async () => ({
    id: 'accepted-prediction',
    status: 'processing',
  }));
  const poll = jest.fn<Promise<AtlasPrediction>, []>(async () => ({
    id: 'accepted-prediction',
    status: 'processing',
  }));
  const download = jest.fn(async () => ({
    bytes: Buffer.from('synthetic'),
    extension: 'png',
    mimeType: 'image/png',
  }));
  const budget = {
    reserveMedia: jest.fn(async () => {
      spend = { sourceRunId: job.id, state: 'RESERVED', actualMicroUsd: null };
      return spend;
    }),
    authorizeMediaDispatch: jest.fn(
      async (
        _manager: EntityManager,
        _source: unknown,
        _membership: string,
        authorize: (manager: EntityManager) => Promise<unknown>,
      ) => {
        await authorize(manager);
        spend = {
          sourceRunId: job.id,
          state: 'DISPATCHED',
          actualMicroUsd: null,
        };
        return spend;
      },
    ),
    recordMediaPrediction: jest.fn(async () => {
      events.push('accepted-id');
      return spend;
    }),
    markMediaUncertain: jest.fn(async () => {
      if (spend?.state !== 'SETTLED')
        spend = {
          sourceRunId: job.id,
          state: 'UNCERTAIN',
          actualMicroUsd: null,
        };
      return spend;
    }),
    confirmMediaFailure: jest.fn(async () => {
      if (spend?.state !== 'SETTLED')
        spend = { sourceRunId: job.id, state: 'SETTLED', actualMicroUsd: '0' };
      return spend!;
    }),
    stop: jest.fn(async () => {
      spend = { sourceRunId: job.id, state: 'RELEASED', actualMicroUsd: null };
      return spend;
    }),
  };
  const addAsset = jest.fn(
    async (...arguments_: Parameters<DeliveryCreativeService['addAsset']>) => {
      await arguments_[7]?.validate(document, scope, manager);
      await arguments_[6]();
      await arguments_[7]?.validate(document, scope, manager);
      await arguments_[7]?.complete(document, scope, manager);
    },
  );
  const queue = { add: jest.fn(async () => undefined) };
  const service = new DeliveryAtlasService(
    source,
    {
      scope: jest.fn(async () => scope),
      addAsset,
    } as unknown as DeliveryCreativeService,
    connections,
    { validate } as unknown as DeliveryAtlasProductionService,
    {
      submit,
      poll,
      download,
      body: () => ({ model: profile.id }),
    } as unknown as DeliveryAtlasAdapter,
    {
      getCurrentDriver: () => ({ writeFile: async () => undefined }),
    } as unknown as FileStorageDriverFactory,
    budget as unknown as OtogrowAiBudgetService,
    queue as unknown as MessageQueueService,
  );
  const read = () =>
    service.run(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      taskId: TASK_ID,
      runId: job.id,
    });
  const start = () =>
    service.start(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      taskId: TASK_ID,
      runId: job.id,
      requestId: job.requestId,
      quoteToken: job.quoteToken,
    });
  const cancel = () =>
    service.cancel(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      taskId: TASK_ID,
      runId: job.id,
    });
  const resume = () =>
    service.resume(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      taskId: TASK_ID,
      runId: job.id,
    });
  return {
    service,
    manager,
    jobs,
    spends,
    builder,
    budget,
    submit,
    poll,
    download,
    queue,
    validate,
    secret,
    addAsset,
    scope,
    document,
    connection,
    events,
    read,
    start,
    cancel,
    resume,
    job: () => job,
    patch: (values: Partial<DeliveryAtlasJobEntity>) =>
      Object.assign(job, values),
    settle: (amount: string) => {
      spend = { sourceRunId: job.id, state: 'SETTLED', actualMicroUsd: amount };
    },
  };
};
describe('Atlas durable paid request lifecycle', () => {
  it('reserves once, queues once and returns the same saved run on repeated start', async () => {
    const test = setup();
    expect((await test.start()).costState).toBe('RESERVED');
    await test.start();
    expect(test.budget.reserveMedia).toHaveBeenCalledTimes(1);
    expect(test.queue.add).toHaveBeenCalledTimes(2);
  });
  it('never resubmits a POST after an ambiguous provider error', async () => {
    const test = setup();
    await test.start();
    test.submit.mockRejectedValue(new Error('private provider transport'));
    await test.service.execute(WORKSPACE_ID, test.job().id);
    expect(test.job().status).toBe('UNCERTAIN');
    expect(test.job().providerPredictionId).toBeNull();
    await test.service.execute(WORKSPACE_ID, test.job().id);
    await expect(test.resume()).rejects.toThrow(
      'Only a saved Atlas prediction',
    );
    expect(test.submit).toHaveBeenCalledTimes(1);
    expect((await test.read()).error).toBe('SUBMISSION_UNCERTAIN');
  });
  it('persists the accepted identity before polling and uses its original rotated credential', async () => {
    const test = setup();
    await test.start();
    await test.service.execute(WORKSPACE_ID, test.job().id);
    expect(test.events.indexOf('accepted-id')).toBeLessThan(
      test.events.indexOf('job:POLLING:accepted-prediction'),
    );
    test.connection.credentialId = randomUUID();
    test.patch({ nextAttemptAt: new Date(0) });
    await test.service.execute(WORKSPACE_ID, test.job().id);
    expect(test.submit).toHaveBeenCalledTimes(1);
    expect(test.poll).toHaveBeenCalledTimes(1);
    expect(test.secret).toHaveBeenLastCalledWith(
      test.manager,
      WORKSPACE_ID,
      test.job().credentialId,
    );
  });
  it('requires semantic current dispatch permission but ignores pure default configuration revisions', async () => {
    const test = setup();
    await test.start();
    test.connection.revision = 9;
    await test.service.execute(WORKSPACE_ID, test.job().id);
    expect(test.submit).toHaveBeenCalledTimes(1);
    const revoked = setup();
    await revoked.start();
    revoked.validate.mockRejectedValue(new Error('source revoked'));
    await revoked.service.execute(WORKSPACE_ID, revoked.job().id);
    expect(revoked.submit).not.toHaveBeenCalled();
    expect(revoked.budget.stop).toHaveBeenCalledTimes(1);
  });
  it('releases only a never-dispatched cancellation and keeps actual charge unknown', async () => {
    const test = setup();
    await test.start();
    const cancelled = await test.cancel();
    expect(cancelled).toEqual(
      expect.objectContaining({
        publicationCancelled: true,
        status: 'CANCELLED',
        costState: 'RELEASED',
        actualCostUsd: null,
      }),
    );
    await test.service.execute(WORKSPACE_ID, test.job().id);
    expect(test.submit).not.toHaveBeenCalled();
  });
  it('does not publish READY after cancellation during output download and keeps the cost hold visible', async () => {
    const test = setup();
    await test.start();
    test.submit.mockResolvedValue({
      id: 'accepted-prediction',
      status: 'completed',
      outputs: ['https://cdn.example.com/result.png'],
    });
    test.download.mockImplementation(async () => {
      await test.cancel();
      return {
        bytes: Buffer.from('synthetic'),
        extension: 'png',
        mimeType: 'image/png',
      };
    });
    await test.service.execute(WORKSPACE_ID, test.job().id);
    expect(test.job().status).toBe('UNCERTAIN');
    const result = await test.read();
    expect(result).toEqual(
      expect.objectContaining({
        status: 'CANCELLED',
        publicationCancelled: true,
        assetId: null,
        costState: 'UNCERTAIN',
        actualCostUsd: null,
        providerPredictionId: 'accepted-prediction',
      }),
    );
  });
  it('shows current scoped ledger reconciliation rather than cached job state, including settled zero', async () => {
    const test = setup();
    test.patch({
      status: 'UNCERTAIN',
      costState: 'RELEASED',
      publicationCancelled: true,
    });
    test.settle('123456');
    expect(await test.read()).toEqual(
      expect.objectContaining({
        costState: 'SETTLED',
        actualCostUsd: '0.123456',
        publicationCancelled: true,
      }),
    );
    test.settle('0');
    expect((await test.read()).actualCostUsd).toBe('0.000000');
    expect(test.spends.find).toHaveBeenLastCalledWith(
      expect.objectContaining({
        select: { sourceRunId: true, state: true, actualMicroUsd: true },
        where: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          taskId: TASK_ID,
          sourceKind: 'MEDIA',
        }),
        take: 1,
      }),
    );
  });
  it('retains a previously reconciled nonzero cost when Atlas later reports failure', async () => {
    const test = setup();
    await test.start();
    test.settle('200000');
    test.patch({
      status: 'POLLING',
      providerPredictionId: 'accepted-prediction',
    });
    test.poll.mockResolvedValue({
      id: 'accepted-prediction',
      status: 'failed',
    });
    await test.service.execute(WORKSPACE_ID, test.job().id);
    expect(test.job().costState).toBe('SETTLED');
    expect(await test.read()).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        costState: 'SETTLED',
        actualCostUsd: '0.200000',
      }),
    );
  });
  it('counts starts by actual reservation day, preserving cancellation in the daily quota', async () => {
    const test = setup();
    test.patch({ createdAt: new Date('2026-01-01T23:59:00Z') });
    await test.start();
    expect(test.builder.andWhere).toHaveBeenCalledWith(
      'spend."createdAt">=:day',
      expect.any(Object),
    );
    expect(test.builder.innerJoin).toHaveBeenCalledWith(
      DeliveryAtlasJobEntity,
      'job',
      expect.stringContaining('spend."sourceRunId"'),
    );
  });
});

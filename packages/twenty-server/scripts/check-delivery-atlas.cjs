const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  createReviewFixture,
  alterDetails,
  sourceFingerprint,
  denied,
  copy,
} = require('./check-delivery-creative-review-support.cjs');
const { buildServices } = require('./check-delivery-reconciliation.cjs');
const {
  SecretEncryptionService,
} = require('../dist/engine/core-modules/secret-encryption/secret-encryption.service');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryAtlasConnectionService,
} = require('../dist/modules/delivery/creative/atlas/delivery-atlas-connection.service');
const {
  DeliveryAtlasProductionService,
} = require('../dist/modules/delivery/creative/atlas/delivery-atlas-production.service');
const {
  DeliveryAtlasService,
} = require('../dist/modules/delivery/creative/atlas/delivery-atlas.service');
const {
  DeliveryAtlasAdapter,
} = require('../dist/modules/delivery/creative/atlas/delivery-atlas.adapter');
const {
  OtogrowAiBudgetService,
} = require('../dist/modules/otogrow-ai-budget/otogrow-ai-budget.service');
const {
  DeliveryAtlasJobEntity,
} = require('../dist/modules/delivery/creative/atlas/entities/delivery-atlas-job.entity');
const {
  OtogrowAiSpendEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity');

const PROFILE = 'google/nano-banana-pro/text-to-image';
const EDIT_PROFILE = 'google/nano-banana-pro/edit';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQXkAAAAASUVORK5CYII=',
  'base64',
);
async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This checker only runs in an outer rollback.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const originalHttp = require('node:http').request;
  const originalHttps = require('node:https').request;
  const originalFetch = globalThis.fetch;
  const forbidNetwork = () => {
    throw new Error(
      'Actual HTTP and model calls are forbidden in this checker.',
    );
  };
  require('node:http').request = forbidNetwork;
  require('node:https').request = forbidNetwork;
  globalThis.fetch = forbidNetwork;
  try {
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const fixture = await createReviewFixture(runner.manager);
    const { workspace, workspaceId, taskId, people } = fixture;
    const admin = people.admin;
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (work) => runner.manager.transaction(work),
    };
    const services = buildServices(source, fixture);
    const files = new Map();
    const storage = {
      getCurrentDriver: () => ({
        writeFile: async ({ filePath, sourceFile }) => {
          assert(
            filePath.startsWith(`${workspaceId}/delivery-creative/${taskId}/`),
          );
          files.set(filePath, Buffer.from(sourceFile));
        },
        readFile: async ({ filePath }) => {
          assert(
            filePath.startsWith(`${workspaceId}/delivery-creative/${taskId}/`),
          );
          assert(files.has(filePath));
          return require('node:stream').Readable.from([files.get(filePath)]);
        },
        delete: async () => {
          throw new Error('Unexpected storage deletion.');
        },
      }),
    };
    const creative = new DeliveryCreativeService(
      source,
      services.delivery,
      storage,
      createIsolatedNativeTaskAccess(),
    );
    const budget = new OtogrowAiBudgetService(source, services.access);
    const key = randomBytes(32).toString('hex');
    const encryption = new SecretEncryptionService({
      get: (name) => (name === 'ENCRYPTION_KEY' ? key : undefined),
    });
    const transport = new DeliveryAtlasAdapter();
    const calls = { calculate: 0, upload: 0, submit: 0, poll: 0, download: 0 };
    const usedKeys = [];
    let calculateHook = null,
      submitHook = null,
      pollHook = null,
      downloadHook = null;
    const adapter = {
      body: (...arguments_) => transport.body(...arguments_),
      calculate: async (_key, body) => {
        calls.calculate++;
        if (calculateHook) await calculateHook(body);
        return { costUsd: '0.100000', estimated: false };
      },
      upload: async (_key, bytes, mimeType) => {
        calls.upload++;
        assert(bytes.equals(PNG));
        assert.equal(mimeType, 'image/png');
        return 'https://synthetic.invalid/reference.png';
      },
      submit: async (credential, bodyProfile, body) => {
        calls.submit++;
        usedKeys.push(credential);
        assert.equal(body.model, bodyProfile.id);
        return submitHook
          ? submitHook(body)
          : {
              id: `synthetic-prediction-${calls.submit}`,
              model: body.model,
              status: 'processing',
            };
      },
      poll: async (credential, predictionId, profileId) => {
        calls.poll++;
        usedKeys.push(credential);
        return pollHook
          ? pollHook(predictionId)
          : { id: predictionId, model: profileId, status: 'processing' };
      },
      download: async () => {
        calls.download++;
        if (downloadHook) await downloadHook();
        return { bytes: PNG, mimeType: 'image/png', extension: 'png' };
      },
    };
    const connections = new DeliveryAtlasConnectionService(
      source,
      services.delivery,
      encryption,
      adapter,
    );
    const production = new DeliveryAtlasProductionService(
      source,
      creative,
      connections,
    );
    const queued = [];
    const atlas = new DeliveryAtlasService(
      source,
      creative,
      connections,
      production,
      adapter,
      storage,
      budget,
      { add: async (_name, payload) => queued.push(payload) },
    );
    await alterDetails(runner.manager, fixture, (details) => {
      details.state = 'IN_PROGRESS';
      details.creative.mediaSettings = {
        version: 1,
        enabled: true,
        roles: ['ADMIN', 'MEMBER'],
        modelIds: [
          `atlascloud/${PROFILE}`,
          `atlascloud/${EDIT_PROFILE}`,
          'google/synthetic-inspection',
        ],
        dailyRunLimit: 50,
        allowUnknownCost: false,
      };
    });
    const frozenBefore = await sourceFingerprint(runner.manager, fixture);
    const [originalTask] = await runner.query(
      'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [workspaceId, taskId],
    );
    const finalBefore = {
      submissions: copy(originalTask.details.submissions),
      finalAssetId: originalTask.details.creative.finalAssetId,
      state: originalTask.details.state,
    };
    await budget.saveBudget(workspace, admin.memberId, admin.userWorkspaceId, {
      scope: 'WORKSPACE',
      scopeId: workspaceId,
      revision: 0,
      capUsd: '20',
      enabled: true,
      openingSpentUsd: '0',
      confirmOpeningBalance: true,
    });
    const settingsInput = {
      revision: 0,
      apiKey: 'synthetic-atlas-key-one',
      enabled: true,
      enabledProfileIds: [PROFILE, EDIT_PROFILE],
      defaultImageFamilyId: null,
      defaultClipProfileId: null,
      reservationLimits: [PROFILE, EDIT_PROFILE].map((profileId) => ({
        profileId,
        maximumCostUsd: '0.5',
        source: 'Synthetic manually verified finite maximum',
        verifiedAt: '2026-10-28T00:00:00+03:00',
      })),
    };
    let settings = await connections.save(
      workspace,
      admin.memberId,
      admin.userWorkspaceId,
      settingsInput,
    );
    assert.equal(settings.defaultImageFamilyId, null);
    assert(!JSON.stringify(settings).includes(settingsInput.apiKey));
    const [credential] = await runner.query(
      'SELECT id,"apiKey" FROM core."deliveryAtlasCredential" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    assert.match(credential.apiKey, /^enc:v2:/);
    assert(!credential.apiKey.includes(settingsInput.apiKey));
    await connections.verify(workspace, admin.memberId, admin.userWorkspaceId, {
      revision: settings.revision,
    });
    const [savedConnection] = await runner.query(
      'SELECT "reservationLimits" FROM core."deliveryAtlasConnection" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    const originalLimits = copy(savedConnection.reservationLimits);
    settings = await connections.save(
      workspace,
      admin.memberId,
      admin.userWorkspaceId,
      {
        ...settingsInput,
        revision: settings.revision,
        apiKey: null,
        defaultImageFamilyId: 'nano-banana-pro',
        reservationLimits: settingsInput.reservationLimits.map((limit) => ({
          ...limit,
          maximumCostUsd: '0.500000',
          verifiedAt: '2026-10-27T21:00:00Z',
        })),
      },
    );
    const [sameLimits] = await runner.query(
      'SELECT "reservationLimits" FROM core."deliveryAtlasConnection" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    assert.deepEqual(sameLimits.reservationLimits, originalLimits);
    const task = async () =>
      (
        await runner.query(
          'SELECT revision,details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
          [workspaceId, taskId],
        )
      )[0];
    const quoteInput = async (prompt, extra = {}) => ({
      taskId,
      taskRevision: (await task()).revision,
      requestId: randomUUID(),
      profileId: PROFILE,
      target: 'BRIEF',
      shotId: null,
      prompt,
      referenceAssetIds: [],
      parameters: {},
      ...extra,
    });
    const quote = async (prompt, extra = {}) =>
      atlas.quote(
        workspace,
        admin.memberId,
        admin.userWorkspaceId,
        await quoteInput(prompt, extra),
      );
    const start = (receipt) =>
      atlas.start(workspace, admin.memberId, admin.userWorkspaceId, {
        taskId,
        runId: receipt.runId,
        requestId: receipt.requestId,
        quoteToken: receipt.quoteToken,
      });
    const read = (id, person = admin, targetWorkspace = workspace) =>
      atlas.run(targetWorkspace, person.memberId, person.userWorkspaceId, {
        taskId,
        runId: id,
      });
    const job = (id) =>
      runner.manager
        .getRepository(DeliveryAtlasJobEntity)
        .findOneByOrFail({ workspaceId, id });
    const due = (id) =>
      runner.query(
        'UPDATE core."deliveryAtlasJob" SET "nextAttemptAt"=$3,"leaseUntil"=NULL,"leaseToken"=NULL WHERE "workspaceId"=$1 AND id=$2',
        [workspaceId, id, new Date(0)],
      );
    const cancel = (id) =>
      atlas.cancel(workspace, admin.memberId, admin.userWorkspaceId, {
        taskId,
        runId: id,
      });
    const retryInput = await quoteInput('Exact identity preview');
    const q1 = await atlas.quote(
      workspace,
      admin.memberId,
      admin.userWorkspaceId,
      retryInput,
    );
    const calculations = calls.calculate;
    assert.equal(
      (
        await atlas.quote(
          workspace,
          admin.memberId,
          admin.userWorkspaceId,
          retryInput,
        )
      ).runId,
      q1.runId,
    );
    assert.equal(calls.calculate, calculations);
    await denied(
      () =>
        atlas.quote(workspace, admin.memberId, admin.userWorkspaceId, {
          ...retryInput,
          prompt: 'Changed inputs',
        }),
      [409],
    );
    await denied(() => read(q1.runId, people.outsider));
    await denied(() => read(q1.runId, admin, fixture.foreignWorkspace));
    await start(q1);
    await start(q1);
    assert.equal(
      (
        await runner.query(
          'SELECT id FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND "sourceRunId"=$2',
          [workspaceId, q1.runId],
        )
      ).length,
      1,
    );
    submitHook = async () => {
      throw new Error('Synthetic ambiguous transport');
    };
    await atlas.execute(workspaceId, q1.runId);
    const submitted = calls.submit;
    assert.equal((await read(q1.runId)).status, 'UNCERTAIN');
    await atlas.execute(workspaceId, q1.runId);
    assert.equal(calls.submit, submitted);
    await denied(
      () =>
        atlas.resume(workspace, admin.memberId, admin.userWorkspaceId, {
          taskId,
          runId: q1.runId,
        }),
      [409],
    );
    assert.equal((await read(q1.runId)).costState, 'UNCERTAIN');
    submitHook = null;
    const accepted = await quote('Accepted ID and original credential');
    await start(accepted);
    await atlas.execute(workspaceId, accepted.runId);
    const acceptedJob = await job(accepted.runId);
    assert(acceptedJob.providerPredictionId);
    assert.equal(acceptedJob.status, 'POLLING');
    assert(
      (
        await runner.query(
          'SELECT id FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 AND "after"->>\'providerPredictionId\'=$2',
          [workspaceId, acceptedJob.providerPredictionId],
        )
      ).length > 0,
    );
    settings = await connections.save(
      workspace,
      admin.memberId,
      admin.userWorkspaceId,
      {
        ...settingsInput,
        revision: settings.revision,
        apiKey: 'synthetic-atlas-key-two',
        defaultImageFamilyId: 'nano-banana-pro',
      },
    );
    await connections.verify(workspace, admin.memberId, admin.userWorkspaceId, {
      revision: settings.revision,
    });
    assert.equal(
      (
        await runner.query(
          'SELECT id FROM core."deliveryAtlasCredential" WHERE "workspaceId"=$1 AND "revokedAt" IS NULL',
          [workspaceId],
        )
      ).length,
      2,
    );
    await due(accepted.runId);
    await atlas.execute(workspaceId, accepted.runId);
    assert.equal(usedKeys.at(-1), 'synthetic-atlas-key-one');
    assert.equal(calls.submit, submitted + 1);
    const cancelled = await quote('Cancel before dispatch');
    await start(cancelled);
    const cancelReceipt = await cancel(cancelled.runId);
    assert.equal(cancelReceipt.costState, 'RELEASED');
    assert.equal(cancelReceipt.actualCostUsd, null);
    await atlas.execute(workspaceId, cancelled.runId);
    assert.equal(calls.submit, submitted + 1);
    const race = await quote('Accepted response after local lease expiry');
    await start(race);
    submitHook = async (body) => {
      await source.transaction(async (manager) => {
        await budget.markMediaUncertain(
          manager,
          { workspaceId, sourceKind: 'MEDIA', sourceRunId: race.runId },
          'Synthetic lease expired before response persistence.',
        );
        await manager.query(
          'UPDATE core."deliveryAtlasJob" SET status=\'UNCERTAIN\',"leaseToken"=NULL,"leaseUntil"=NULL WHERE "workspaceId"=$1 AND id=$2',
          [workspaceId, race.runId],
        );
      });
      return {
        id: 'synthetic-late-accepted',
        model: body.model,
        status: 'processing',
      };
    };
    await atlas.execute(workspaceId, race.runId);
    assert.equal(
      (await job(race.runId)).providerPredictionId,
      'synthetic-late-accepted',
    );
    assert.equal((await job(race.runId)).status, 'POLLING');
    const racePosts = calls.submit;
    await due(race.runId);
    await atlas.execute(workspaceId, race.runId);
    assert.equal(calls.submit, racePosts);
    submitHook = async (body) => ({
      id: 'synthetic-cancelled-output',
      model: body.model,
      status: 'completed',
      outputs: ['https://synthetic.invalid/result.png'],
    });
    const beforeAssets = (await task()).details.creative.assets.length;
    const stopDownload = await quote('Stop publication during download');
    await start(stopDownload);
    downloadHook = async () => cancel(stopDownload.runId);
    await atlas.execute(workspaceId, stopDownload.runId);
    downloadHook = null;
    const stopped = await read(stopDownload.runId);
    assert.equal(stopped.status, 'CANCELLED');
    assert.equal(stopped.publicationCancelled, true);
    assert.equal(stopped.assetId, null);
    assert.equal(stopped.costState, 'UNCERTAIN');
    assert.equal((await task()).details.creative.assets.length, beforeAssets);
    submitHook = async (body) => ({
      id: 'synthetic-success',
      model: body.model,
      status: 'completed',
      outputs: ['https://synthetic.invalid/result.png'],
    });
    const success = await quote('Real service imported static output');
    await start(success);
    await atlas.execute(workspaceId, success.runId);
    const succeeded = await read(success.runId);
    assert.equal(succeeded.status, 'SUCCEEDED');
    assert(succeeded.assetId);
    assert.equal(succeeded.costState, 'UNCERTAIN');
    assert.equal(succeeded.actualCostUsd, null);
    const imported = (await task()).details.creative.assets.find(
      (asset) => asset.id === succeeded.assetId,
    );
    assert.equal(imported.kind, 'FINAL');
    assert.equal(imported.shotId, null);
    assert.equal(imported.storageState, 'READY');
    assert.equal(imported.reviews.length, 0);
    assert(
      files.has(
        `${workspaceId}/delivery-creative/${taskId}/${succeeded.assetId}`,
      ),
    );
    const spend = await runner.manager
      .getRepository(OtogrowAiSpendEntity)
      .findOneByOrFail({
        workspaceId,
        sourceKind: 'MEDIA',
        sourceRunId: success.runId,
      });
    await budget.reconcile(workspace, admin.memberId, admin.userWorkspaceId, {
      spendId: spend.id,
      revision: spend.revision,
      actualUsd: '0.123456',
      evidenceReference: 'Synthetic attributable charge evidence',
      reason: 'Rollback-only manual reconciliation proof',
    });
    assert.equal((await read(success.runId)).actualCostUsd, '0.123456');
    assert.equal((await read(success.runId)).costState, 'SETTLED');
    const list = await atlas.runs(
      workspace,
      admin.memberId,
      admin.userWorkspaceId,
      { taskId },
    );
    assert(list.items.length <= 25);
    assert.equal(
      list.items.find((row) => row.id === success.runId).actualCostUsd,
      '0.123456',
    );
    assert(!JSON.stringify(list).includes('synthetic-atlas-key'));
    const scoped = await production.read(
      workspace,
      admin.memberId,
      admin.userWorkspaceId,
      { taskId },
    );
    await production.configure(
      workspace,
      admin.memberId,
      admin.userWorkspaceId,
      {
        taskId,
        taskRevision: scoped.taskRevision,
        enabled: true,
        roles: ['ADMIN', 'MEMBER'],
        profileIds: [PROFILE],
        dailyRunLimit: 50,
      },
    );
    assert(
      (await task()).details.creative.mediaSettings.modelIds.includes(
        'google/synthetic-inspection',
      ),
    );
    await connections.remove(workspace, admin.memberId, admin.userWorkspaceId, {
      revision: settings.revision,
    });
    assert.equal(
      (
        await runner.query(
          'SELECT id FROM core."deliveryAtlasCredential" WHERE "workspaceId"=$1 AND "revokedAt" IS NULL',
          [workspaceId],
        )
      ).length,
      0,
    );
    await due(accepted.runId);
    const polls = calls.poll;
    await atlas.execute(workspaceId, accepted.runId);
    assert.equal(calls.poll, polls);
    const after = await sourceFingerprint(runner.manager, fixture);
    const mutable = new Set([
      'deliveryTask',
      'otogrowAiSpend',
      'otogrowAiSpendEvent',
      'otogrowAiBudget',
    ]);
    for (const [name, digest] of Object.entries(frozenBefore))
      if (!mutable.has(name))
        assert.equal(
          after[name],
          digest,
          `Atlas generation must preserve ${name}.`,
        );
    const final = (await task()).details;
    assert.deepEqual(
      {
        submissions: final.submissions,
        finalAssetId: final.creative.finalAssetId,
        state: final.state,
      },
      finalBefore,
      'Generation never signs off, submits, fulfills or changes selected final assets.',
    );
    console.log(
      JSON.stringify({
        result: 'PASS',
        rollbackOnly: true,
        paidCalls: 0,
        actualNetworkCalls: 0,
        scopedRuns: list.items.length,
        mockedSubmissions: calls.submit,
        mockedPolls: calls.poll,
        currentLedgerPresentation: true,
        immutableFinancialAndDeliverySources: true,
      }),
    );
  } finally {
    require('node:http').request = originalHttp;
    require('node:https').request = originalHttps;
    globalThis.fetch = originalFetch;
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

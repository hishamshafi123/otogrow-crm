const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { promisify } = require('node:util');
const { Readable } = require('node:stream');
const { MockLanguageModelV3 } = require('ai/test');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  createFixture,
  buildServices,
} = require('./check-delivery-reconciliation.cjs');
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const {
  originalDigest,
  deny,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');
const {
  DeliveryMediaService,
} = require('../dist/modules/delivery/creative/delivery-media.service');
const {
  DeliveryVideoQaService,
} = require('../dist/modules/delivery/creative/video-qa/delivery-video-qa.service');
const {
  DeliveryVideoQaAdapter,
} = require('../dist/modules/delivery/creative/video-qa/delivery-video-qa.adapter');
const {
  DeliveryVideoQaReportEntity,
} = require('../dist/modules/delivery/creative/video-qa/entities/delivery-video-qa-report.entity');
const {
  VIDEO_QA_MODEL,
} = require('../dist/modules/delivery/creative/video-qa/delivery-video-qa.types');
const {
  OtogrowAiPriceEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-price.entity');
const {
  OtogrowAiSpendEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');

async function fixtureMedia(directory) {
  const video = join(directory, 'defects.mp4');
  const silent = join(directory, 'no-audio.mp4');
  const reference = join(directory, 'reference.jpg');
  const execute = promisify(execFile);
  await execute(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-threads',
      '2',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=320x240:r=12:d=2',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=320x240:r=12:d=2',
      '-f',
      'lavfi',
      '-i',
      'aevalsrc=if(lt(t\\,2)\\,0.2*sin(2*PI*440*t)\\,0):s=16000:d=4',
      '-filter_complex',
      '[0:v][1:v]concat=n=2:v=1:a=0[v]',
      '-map',
      '[v]',
      '-map',
      '2:a',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      video,
    ],
    { timeout: 30000, maxBuffer: 1000000 },
  );
  await execute(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      video,
      '-c:v',
      'copy',
      '-an',
      silent,
    ],
    { timeout: 15000, maxBuffer: 1000000 },
  );
  await execute(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x240',
      '-frames:v',
      '1',
      reference,
    ],
    { timeout: 15000, maxBuffer: 1000000 },
  );
  return {
    video: await readFile(video),
    silent: await readFile(silent),
    reference: await readFile(reference),
  };
}
async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Mock SDK and rollback only; no live or browser mode.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const beforeFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Network is forbidden in video QA acceptance.');
  };
  const directory = await mkdtemp(join(tmpdir(), 'otogrow-video-qa-check-'));
  let runner;
  let baseline;
  let calls = 0;
  let assertions = 0;
  try {
    const mediaBytes = await fixtureMedia(directory);
    const adapter = new DeliveryVideoQaAdapter();
    const prepared = await adapter.prepare(mediaBytes.video);
    assert(prepared.preparation.hasAudio);
    assert(prepared.preparation.frames.length >= 4);
    for (const code of ['BLACK_INTERVAL', 'FROZEN_INTERVAL', 'SILENT_INTERVAL'])
      assert(
        prepared.preparation.technicalFindings.some(
          (finding) => finding.code === code,
        ),
        `Real FFmpeg fixture must expose ${code}.`,
      );
    assert(
      (
        await adapter.prepare(mediaBytes.silent)
      ).preparation.technicalFindings.some(
        (finding) => finding.code === 'NO_AUDIO',
      ),
    );
    await deny(adapter.prepare(Buffer.from('not video')), [400]);
    assertions += 5;
    await connectionSource.initialize();
    baseline = await originalDigest((...arguments_) =>
      connectionSource.query(...arguments_),
    );
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const originalQuery = runner.query.bind(runner);
    let readOnly = false;
    let failActivity = false;
    let light = false;
    runner.query = async (...arguments_) => {
      const sql = arguments_[0];
      if (readOnly)
        assert(
          !/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql),
          'Reads may not mutate state.',
        );
      if (
        light &&
        /^SELECT/i.test(sql) &&
        sql.includes('deliveryVideoQaReport')
      )
        assert(
          !/"[^"]+"\."result"/.test(sql),
          'State must not hydrate model result/transcript.',
        );
      if (
        failActivity &&
        /^INSERT/i.test(sql) &&
        sql.includes('otogrowActivityEvent')
      )
        throw new Error('FIXTURE atomic activity failure');
      return originalQuery(...arguments_);
    };
    await runner.query("SET LOCAL lock_timeout='5s'");
    const fixture = await createFixture(runner.manager, 'video_qa_check');
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (operation) => runner.manager.transaction(operation),
    };
    const { access, delivery } = buildServices(scoped, fixture);
    const taskId = randomUUID();
    await runner.query(
      `CREATE TABLE "${fixture.schemaName}".task (id uuid PRIMARY KEY,title text,"assigneeId" uuid,"deletedAt" timestamptz)`,
    );
    await runner.query(
      `INSERT INTO "${fixture.schemaName}".task (id,title,"assigneeId") VALUES ($1,'FIXTURE video QA',$2)`,
      [taskId, fixture.people.writer.memberId],
    );
    const assetId = randomUUID();
    const referenceId = randomUUID();
    const document = newCreativeDocument();
    document.approvedBriefVersion = 1;
    document.brief.productFacts =
      'FIXTURE product reference is blue. Source contains deliberate black/red visual defects.';
    document.brief.cta = 'FIXTURE ask a human to inspect the video.';
    document.mediaSettings = {
      version: 1,
      enabled: true,
      modelIds: [VIDEO_QA_MODEL],
      roles: ['ADMIN', 'MANAGER', 'MEMBER'],
      dailyRunLimit: 50,
      allowUnknownCost: false,
    };
    document.assets = [
      [assetId, 'FINAL', 'video/mp4', mediaBytes.video],
      [referenceId, 'REFERENCE', 'image/jpeg', mediaBytes.reference],
    ].map(([id, kind, mimeType, bytes]) => ({
      id,
      name: `FIXTURE ${kind}`,
      kind,
      mimeType,
      size: bytes.length,
      createdAt: new Date().toISOString(),
      uploadedBy: fixture.people.writer.memberId,
      briefVersion: 1,
      productionVersion: 1,
      assemblyVersion: 1,
      shotId: null,
      shotVersion: null,
      parentAssetId: null,
      storageState: 'READY',
      reviews: [
        {
          memberId: fixture.people.admin.memberId,
          at: new Date().toISOString(),
          decision: 'APPROVED',
          notes: 'FIXTURE',
        },
      ],
    }));
    await runner.manager.getRepository(DeliveryTaskEntity).save({
      workspaceId: fixture.workspaceId,
      taskId,
      projectId: fixture.projects.first,
      revision: 1,
      details: {
        state: 'PLANNED',
        service: 'VIDEO',
        events: [],
        submissions: [],
        creative: document,
      },
    });
    const files = new Map([
      [
        `${fixture.workspaceId}/delivery-creative/${taskId}/${assetId}`,
        mediaBytes.video,
      ],
      [
        `${fixture.workspaceId}/delivery-creative/${taskId}/${referenceId}`,
        mediaBytes.reference,
      ],
    ]);
    const driver = {
      readFile: async ({ filePath }) => {
        assert(files.has(filePath), 'Only exact owned bytes may be read.');
        return Readable.from([files.get(filePath)]);
      },
      writeFile: async ({ filePath, sourceFile }) => {
        assert(
          filePath.startsWith(
            `${fixture.workspaceId}/delivery-creative/${taskId}/video-qa/`,
          ),
        );
        files.set(filePath, Buffer.from(sourceFile));
      },
      delete: async ({ folderPath }) => {
        assert(
          folderPath.startsWith(
            `${fixture.workspaceId}/delivery-creative/${taskId}/video-qa/`,
          ),
        );
        for (const key of files.keys())
          if (key.startsWith(folderPath)) files.delete(key);
      },
    };
    const storage = { getCurrentDriver: () => driver };
    let allowed = true;
    let behavior = 'VALID';
    let providerHook = null;
    const output = () => ({
      summary: 'FIXTURE model response; not a real inference.',
      transcript: [
        {
          startMs: 0,
          endMs: 1000,
          text: 'FIXTURE synthetic observed speech; mock only.',
        },
      ],
      visibleText: [],
      findings: [
        {
          category: 'PRODUCT',
          severity: 'POSSIBLE_ISSUE',
          startMs: 2000,
          endMs: 3000,
          frameIndexes: [2, 3],
          referenceAssetIds: [referenceId],
          evidence: 'FIXTURE red frame differs from blue product reference.',
          correction: 'Human should inspect intended color.',
          uncertainty: 'Mocked assessment is not model-quality acceptance.',
        },
      ],
      limitations:
        'FIXTURE only. Static1FPS misses fast motion; final human review is mandatory.',
    });
    const model = new MockLanguageModelV3({
      doGenerate: async (request) => {
        calls++;
        const content = request.prompt.flatMap((message) =>
          Array.isArray(message.content) ? message.content : [],
        );
        assert(
          content.some(
            (part) => part.type === 'file' && part.mediaType === 'video/mp4',
          ),
          'Actual video bytes must reach the SDK; thumbnails alone are insufficient.',
        );
        assert(
          content.some(
            (part) => part.type === 'file' && part.mediaType === 'image/jpeg',
          ),
        );
        assert(JSON.stringify(request.prompt).includes('MANUAL_UNVERIFIED'));
        if (providerHook) await providerHook();
        if (behavior === 'UNKNOWN')
          throw new Error('FIXTURE private provider failure must not escape.');
        return {
          content: [
            {
              type: 'text',
              text:
                behavior === 'INVALID'
                  ? 'invalid-json'
                  : JSON.stringify(output()),
            },
          ],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 100,
              noCache: 100,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 40, text: 30, reasoning: 10 },
          },
          warnings: [],
        };
      },
    });
    const registry = {
      validateModelAvailability: () => {
        if (!allowed) throw new Error('FIXTURE model disabled');
      },
      getModel: (id) =>
        id === VIDEO_QA_MODEL
          ? {
              model,
              modelId: id,
              sdkPackage: '@ai-sdk/google',
              providerName: 'google',
            }
          : null,
    };
    const providers = {
      getResolvedProviders: () => ({
        google: { apiKey: 'FIXTURE-NOT-A-REAL-KEY' },
      }),
    };
    const budget = await makeBudgetFixture(scoped, access, fixture.workspace, [
      { modelId: VIDEO_QA_MODEL, kind: 'VIDEO_QA' },
    ]);
    const priceRepository = runner.manager.getRepository(OtogrowAiPriceEntity);
    const price = await priceRepository.findOneByOrFail({
      workspaceId: fixture.workspaceId,
      kind: 'VIDEO_QA',
    });
    price.source =
      'https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite';
    price.pricing = {
      ...price.pricing,
      inputUsdPerMillionTokens: '0.30',
      outputUsdPerMillionTokens: '2.50',
      reasoningUsdPerMillionTokens: '2.50',
      cacheReadUsdPerMillionTokens: '0.03',
      cacheWriteUsdPerMillionTokens: '0.30',
      maxInputTokens: 1048576,
      maxOutputTokens: 8192,
      maxReasoningTokens: 8192,
    };
    await priceRepository.save(price);
    const creative = new DeliveryCreativeService(scoped, delivery, storage);
    const qa = new DeliveryVideoQaService(
      scoped,
      creative,
      registry,
      storage,
      adapter,
      budget,
      providers,
    );
    const queue = { add: async () => {} };
    const media = new DeliveryMediaService(
      scoped,
      creative,
      providers,
      registry,
      {},
      storage,
      queue,
      {},
      budget,
      qa,
    );
    const admin = fixture.people.admin;
    const call = (method, input, person = admin) =>
      qa[method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const taskRepository = runner.manager.getRepository(DeliveryTaskEntity);
    const reportRepository = runner.manager.getRepository(
      DeliveryVideoQaReportEntity,
    );
    const spendRepository = runner.manager.getRepository(OtogrowAiSpendEntity);
    const task = () =>
      taskRepository.findOneByOrFail({
        workspaceId: fixture.workspaceId,
        taskId,
      });
    const prepare = async (person = admin) =>
      call(
        'preview',
        {
          taskId,
          revision: (await task()).revision,
          assetId,
          referenceAssetIds: [referenceId],
          modelId: VIDEO_QA_MODEL,
          manualTranscript:
            'FIXTURE supplemental human notes, not actual audio proof.',
        },
        person,
      );
    const startInput = (preview) => ({
      taskId,
      revision: preview.taskRevision,
      assetId,
      referenceAssetIds: [referenceId],
      modelId: VIDEO_QA_MODEL,
      manualTranscript: preview.manualTranscript,
      requestId: randomUUID(),
      sourceFingerprint: preview.sourceFingerprint,
      preparationFingerprint: preview.preparationFingerprint,
      pricingRevision: preview.pricingRevision,
      confirm: true,
    });
    const run = async (person = admin) =>
      call('start', startInput(await prepare(person)), person);
    const spend = (runId) =>
      spendRepository.findOneByOrFail({
        workspaceId: fixture.workspaceId,
        sourceKind: 'MEDIA',
        sourceRunId: runId,
      });
    readOnly = true;
    const preview = await prepare();
    readOnly = false;
    assert(preview.budgetReady && preview.maximumCostUsd !== null);
    assert.equal(calls, 0);
    await deny(
      call(
        'preview',
        {
          taskId,
          revision: 1,
          assetId,
          referenceAssetIds: [],
          modelId: VIDEO_QA_MODEL,
        },
        fixture.people.outsider,
      ),
    );
    const command = startInput(preview);
    const receipt = await call('start', command);
    assert.equal((await call('start', command)).runId, receipt.runId);
    await deny(call('start', { ...command, manualTranscript: 'Changed' }));
    await deny(
      call(
        'receipt',
        { taskId, requestId: command.requestId },
        fixture.people.writer,
      ),
      [404],
    );
    await media.execute(fixture.workspaceId, taskId, receipt.runId);
    assert.equal(calls, 1);
    const detail = await call('detail', { taskId, runId: receipt.runId });
    assert.equal(detail.status, 'SUCCEEDED');
    assert.equal(detail.result.findings[0].referenceAssetIds[0], referenceId);
    assert.equal((await task()).details.creative.version, document.version);
    assert.equal((await task()).details.state, 'PLANNED');
    assert.equal((await spend(receipt.runId)).state, 'SETTLED');
    await media.execute(fixture.workspaceId, taskId, receipt.runId);
    assert.equal(calls, 1, 'Duplicate queue delivery cannot repeat inference.');
    readOnly = true;
    light = true;
    assert.equal(
      (await call('state', { taskId, runId: receipt.runId })).status,
      'SUCCEEDED',
    );
    light = false;
    readOnly = false;
    const evidence = await qa.evidence(
      fixture.workspace,
      admin.memberId,
      admin.userWorkspaceId,
      taskId,
      receipt.runId,
      'frame-2.jpg',
    );
    assert(evidence.bytes.length > 0);
    const evidenceKey = `${fixture.workspaceId}/delivery-creative/${taskId}/video-qa/${receipt.runId}/frame-2.jpg`;
    const savedFrame = files.get(evidenceKey);
    files.set(evidenceKey, Buffer.from('tampered'));
    await deny(
      qa.evidence(
        fixture.workspace,
        admin.memberId,
        admin.userWorkspaceId,
        taskId,
        receipt.runId,
        'frame-2.jpg',
      ),
      [409],
    );
    files.set(evidenceKey, savedFrame);
    await deny(
      qa.evidence(
        fixture.workspace,
        fixture.people.outsider.memberId,
        fixture.people.outsider.userWorkspaceId,
        taskId,
        receipt.runId,
        'proxy.mp4',
      ),
    );
    assertions += 14;
    behavior = 'INVALID';
    const invalid = await run();
    await media.execute(fixture.workspaceId, taskId, invalid.runId);
    assert.equal(
      (await call('state', { taskId, runId: invalid.runId })).status,
      'FAILED',
    );
    assert.equal(
      (await spend(invalid.runId)).state,
      'SETTLED',
      'Known paid schema failure remains charged.',
    );
    behavior = 'UNKNOWN';
    const unknown = await run();
    await media.execute(fixture.workspaceId, taskId, unknown.runId);
    assert.equal((await spend(unknown.runId)).state, 'UNCERTAIN');
    assert.equal(
      (await reportRepository.findOneByOrFail({ id: unknown.runId })).result,
      null,
    );
    behavior = 'VALID';
    const queued = await run();
    const cancelledInput = {
      taskId,
      runId: queued.runId,
      requestId: randomUUID(),
    };
    const cancellation = await call('cancel', cancelledInput);
    assert.equal(cancellation.action, 'CANCELLED');
    assert.equal(
      (await call('cancel', cancelledInput)).inputHash,
      cancellation.inputHash,
    );
    assert.equal(
      (await call('receipt', { taskId, requestId: cancelledInput.requestId }))
        .action,
      'CANCELLED',
    );
    assert.equal((await spend(queued.runId)).state, 'RELEASED');
    const beforeCancelled = calls;
    await media.execute(fixture.workspaceId, taskId, queued.runId);
    assert.equal(calls, beforeCancelled);
    const inflight = await run();
    providerHook = async () => {
      await call('cancel', {
        taskId,
        runId: inflight.runId,
        requestId: randomUUID(),
      });
    };
    await media.execute(fixture.workspaceId, taskId, inflight.runId);
    providerHook = null;
    assert.equal(
      (await call('state', { taskId, runId: inflight.runId })).status,
      'CANCELLED',
    );
    assert.equal((await spend(inflight.runId)).state, 'SETTLED');
    assert.equal(
      (await reportRepository.findOneByOrFail({ id: inflight.runId })).result,
      null,
    );
    assertions += 12;
    const changed = await run();
    providerHook = async () => {
      const current = await task();
      current.details.creative.brief.cta = 'FIXTURE changed after dispatch';
      current.details.creative.briefVersion++;
      current.details.creative.approvedBriefVersion = null;
      await taskRepository.save(current);
    };
    await media.execute(fixture.workspaceId, taskId, changed.runId);
    providerHook = null;
    assert.equal((await spend(changed.runId)).state, 'SETTLED');
    assert.equal(
      (await call('state', { taskId, runId: changed.runId })).status,
      'FAILED',
    );
    const restored = await task();
    restored.details.creative.brief = document.brief;
    restored.details.creative.briefVersion = 1;
    restored.details.creative.approvedBriefVersion = 1;
    await taskRepository.save(restored);
    const disabled = await run();
    providerHook = async () => {
      allowed = false;
    };
    await media.execute(fixture.workspaceId, taskId, disabled.runId);
    providerHook = null;
    allowed = true;
    assert.equal((await spend(disabled.runId)).state, 'SETTLED');
    assert.equal(
      (await call('state', { taskId, runId: disabled.runId })).status,
      'FAILED',
    );
    const tampered = await run();
    const sourceKey = `${fixture.workspaceId}/delivery-creative/${taskId}/${assetId}`;
    const originalVideo = files.get(sourceKey);
    providerHook = async () => {
      const changed = Buffer.from(originalVideo);
      changed[changed.length - 1] ^= 1;
      files.set(sourceKey, changed);
    };
    await media.execute(fixture.workspaceId, taskId, tampered.runId);
    providerHook = null;
    files.set(sourceKey, originalVideo);
    assert.equal((await spend(tampered.runId)).state, 'SETTLED');
    assert.equal(
      (await call('state', { taskId, runId: tampered.runId })).status,
      'FAILED',
    );
    assert.equal(
      (await reportRepository.findOneByOrFail({ id: tampered.runId })).result,
      null,
    );
    const revoked = await run(fixture.people.writer);
    providerHook = async () => {
      await runner.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
        [fixture.people.writer.userWorkspaceId],
      );
    };
    await media.execute(fixture.workspaceId, taskId, revoked.runId);
    providerHook = null;
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
      [fixture.people.writer.userWorkspaceId],
    );
    assert.equal((await spend(revoked.runId)).state, 'SETTLED');
    assert.equal(
      (await call('state', { taskId, runId: revoked.runId })).status,
      'FAILED',
    );
    assert.equal(
      (await reportRepository.findOneByOrFail({ id: revoked.runId })).result,
      null,
    );
    const fresh = startInput(await prepare());
    const beforeAtomic = {
      reports: await reportRepository.countBy({
        workspaceId: fixture.workspaceId,
      }),
      spends: await spendRepository.countBy({
        workspaceId: fixture.workspaceId,
      }),
      task: await task(),
    };
    failActivity = true;
    await assert.rejects(call('start', fresh), /atomic activity failure/);
    failActivity = false;
    assert.equal(
      await reportRepository.countBy({ workspaceId: fixture.workspaceId }),
      beforeAtomic.reports,
    );
    assert.equal(
      await spendRepository.countBy({ workspaceId: fixture.workspaceId }),
      beforeAtomic.spends,
    );
    assert.deepEqual(await task(), beforeAtomic.task);
    assertions += 13;
    assert.equal((await task()).details.state, 'PLANNED');
    assert.equal((await task()).details.submissions.length, 0);
    assert(
      !JSON.stringify((await task()).details.creative.mediaRuns).includes(
        'FIXTURE synthetic observed speech',
      ),
      'Large/private QA results remain normalized, not in production snapshots.',
    );
  } finally {
    try {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      if (runner && !runner.isReleased) await runner.release();
      try {
        if (baseline)
          assert.equal(
            await originalDigest((...arguments_) =>
              connectionSource.query(...arguments_),
            ),
            baseline,
            'All original core/native rows and inventory must survive unchanged.',
          );
      } finally {
        if (connectionSource.isInitialized) await connectionSource.destroy();
        global.fetch = beforeFetch;
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
  console.log(
    `PASS video QA actual FFmpeg+service+mock SDK rollback: ${assertions} workflow/evidence/usage/privacy checks, ${calls} synthetic model calls; no real provider, task approval or retained fixture.`,
  );
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

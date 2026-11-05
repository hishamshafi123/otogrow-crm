const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
// Default mode rolls back synthetic data; --browser-fixture creates temporary UI records for the companion cleanup script.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MockLanguageModelV3 } = require('ai/test');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');

async function main() {
  const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const { execFileSync } = require('node:child_process');
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'creative-fixture-'));
  let videoFixture;
  try {
    const path = join(fixtureDirectory, 'clip.mp4');
    execFileSync(
      'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=64x64:r=24',
        '-t',
        '1',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        path,
      ],
      { timeout: 15000 },
    );
    videoFixture = readFileSync(path);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }

  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const [workspace] = await runner.query(
      process.argv.includes('--browser-fixture')
        ? `SELECT w.* FROM core.workspace w JOIN core."userWorkspace" uw ON uw."workspaceId"=w.id JOIN core."user" u ON u.id=uw."userId" WHERE u.email='tim@apple.dev' LIMIT 1`
        : `SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL AND "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
    const schema = `"${workspace.databaseSchema}"`;
    const admin = randomUUID(),
      editor = randomUUID(),
      outsider = randomUUID();
    for (const memberId of [admin, editor, outsider]) {
      const userId = randomUUID();
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        userId,
        `${userId}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [memberId, userId, workspace.id],
      );
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,'Agent test','fixture')`,
        [memberId, userId, `${userId}@example.invalid`],
      );
    }
    let failAfterTransaction = false;
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) =>
        runner.manager.transaction(async (manager) => {
          const result = await callback(manager);
          if (failAfterTransaction) {
            failAfterTransaction = false;
            throw new Error(
              'Synthetic failure after creative and activity writes',
            );
          }
          return result;
        }),
    };
    const access = new OtogrowAccessService(scoped, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        userWorkspaceId === admin,
    });
    const delivery = new DeliveryService(
      scoped,
      access,
      createIsolatedNativeTaskAccess(),
    );
    const mutateTask = (actor, input) =>
      delivery.command(workspace, actor, actor, input);
    let state = await mutateTask(admin, {
      action: 'project',
      name: 'Agent verification fixture',
      companyId: null,
      memberIds: [editor],
    });
    const project = state.projects.find(
      (item) => item.name === 'Agent verification fixture',
    );
    state = await mutateTask(admin, {
      action: 'create',
      projectId: project.id,
      fields: {
        title: 'Copy fixture',
        brief: 'Offer is 20% off. Do not claim 50%.',
        service: 'Static ad',
        priority: 'NORMAL',
        scheduledDate: null,
        dueAt: null,
        assigneeId: editor,
        reviewerId: admin,
        checklist: [],
        evidence: [],
      },
    });
    const task = state.tasks.find((item) => item.projectId === project.id);
    const confidential = `PRIVATE-CREATIVE-${randomUUID()}`;
    const activity = () =>
      runner.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "taskId"=$2 ORDER BY "recordedAt",id',
        [workspace.id, task.id],
      );
    const checkedOperation = async (operation) => {
      const before = await activity();
      try {
        return await operation();
      } catch (error) {
        assert.deepEqual(
          await activity(),
          before,
          'Denied creative changes must not record successful activity',
        );
        throw error;
      }
    };
    const {
      DeliveryCreativeService,
    } = require('../dist/modules/delivery/creative/delivery-creative.service');
    const {
      DeliveryMediaService,
    } = require('../dist/modules/delivery/creative/delivery-media.service');
    const {
      DeliveryCreativeFilesController,
    } = require('../dist/modules/delivery/creative/delivery-creative-files.controller');
    const { Readable } = require('node:stream');
    const files = new Map();
    const driver = {
      writeFile: async ({ filePath, sourceFile }) =>
        files.set(filePath, sourceFile),
      readFile: async ({ filePath }) => Readable.from([files.get(filePath)]),
      checkFileExists: async ({ filePath }) => files.has(filePath),
      delete: async ({ folderPath, filename }) =>
        files.delete(`${folderPath}/${filename}`),
    };
    const storage = { getCurrentDriver: () => driver };
    const creative = new DeliveryCreativeService(
      scoped,
      delivery,
      storage,
      createIsolatedNativeTaskAccess(),
    );
    const controller = new DeliveryCreativeFilesController(creative, storage);
    const read = () => creative.read(workspace, editor, editor, task.id);
    const change = async (actor, input) =>
      checkedOperation(async () =>
        creative.command(workspace, actor, actor, {
          taskId: task.id,
          revision: (await read()).revision,
          ...input,
        }),
      );
    await assert.rejects(creative.read(workspace, outsider, outsider, task.id));
    await change(editor, { action: 'initialize' });
    let current = await read();
    const beforeReads = await activity();
    await read();
    assert.deepEqual(
      await activity(),
      beforeReads,
      'Creative reads and export preparation must not claim completed work',
    );
    failAfterTransaction = true;
    await assert.rejects(
      change(admin, {
        action: 'brief',
        brief: {
          ...current.document.brief,
          concept: 'Discarded',
          productFacts: confidential,
        },
      }),
      /Synthetic failure/,
    );
    assert.deepEqual(await read(), current);
    await assert.rejects(change(editor, { action: 'approveBrief' }));
    await change(admin, {
      action: 'brief',
      brief: {
        ...current.document.brief,
        concept: '20% offer product demo',
        productFacts: '20% off; blue cotton shirt',
        mandatoryClaims: confidential,
      },
    });
    await change(admin, { action: 'approveBrief' });
    await change(editor, {
      action: 'reference',
      fields: {
        title: 'Reference',
        url: `https://example.com/${confidential}`,
        assetId: null,
        summary: 'Synthetic',
        angle: 'Offer',
        tags: [],
      },
    });
    const reference = (await read()).document.references[0];
    await assert.rejects(
      change(editor, {
        action: 'reviewReferences',
        ids: [reference.id],
        decision: 'APPROVED',
        notes: '',
      }),
    );
    await change(admin, {
      action: 'reviewReferences',
      ids: [reference.id],
      decision: 'APPROVED',
      notes: '',
    });
    const fields = {
      title: 'Product shot',
      imagePrompt: 'A blue cotton shirt',
      animationPrompt: 'Slow camera move',
      duration: 5,
      subject: 'Product',
      product: 'Shirt',
      location: 'Studio',
      notes: confidential,
      referenceId: reference.id,
    };
    await change(editor, { action: 'shot', fields });
    const shot = (await read()).document.shots[0];
    if (process.argv.includes('--browser-fixture')) {
      const userRows = await runner.query(
        'SELECT "userId" FROM core."userWorkspace" WHERE id = ANY($1::uuid[])',
        [[admin, editor, outsider]],
      );
      require('node:fs').writeFileSync(
        '/tmp/otogrow-phase3-browser.json',
        JSON.stringify({
          workspaceId: workspace.id,
          schema: workspace.databaseSchema,
          taskId: task.id,
          projectId: project.id,
          memberIds: [admin, editor, outsider],
          userIds: userRows.map((row) => row.userId),
        }),
        { mode: 0o600 },
      );
      await runner.commitTransaction();
      process.stdout.write(
        'Temporary synthetic browser fixture created. Cleanup identifiers saved in /tmp/otogrow-phase3-browser.json.\n',
      );
      return;
    }

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQXkAAAAASUVORK5CYII=',
      'base64',
    );
    await assert.rejects(
      controller.upload(
        workspace,
        outsider,
        outsider,
        task.id,
        { revision: (await read()).revision, kind: 'IMAGE', shotId: shot.id },
        { buffer: png, originalname: 'fixture.png', size: png.length },
      ),
    );
    assert.equal(files.size, 0);
    await assert.rejects(
      controller.upload(
        workspace,
        editor,
        editor,
        task.id,
        { revision: (await read()).revision, kind: 'IMAGE', shotId: shot.id },
        {
          buffer: Buffer.from('<script>bad</script>'),
          originalname: 'fake.png',
          size: 20,
        },
      ),
    );
    await controller.upload(
      workspace,
      editor,
      editor,
      task.id,
      { revision: (await read()).revision, kind: 'IMAGE', shotId: shot.id },
      { buffer: png, originalname: 'fixture.png', size: png.length },
    );
    let image = (await read()).document.assets[0];
    assert.equal(image.storageState, 'READY');
    await change(editor, {
      action: 'reviewAsset',
      assetId: image.id,
      decision: 'ESCALATED',
      notes: 'Please inspect',
    });
    await assert.rejects(
      change(editor, {
        action: 'reviewAsset',
        assetId: image.id,
        decision: 'APPROVED',
        notes: '',
      }),
    );
    await change(admin, {
      action: 'reviewAsset',
      assetId: image.id,
      decision: 'APPROVED',
      notes: '',
    });
    await change(editor, { action: 'selectAsset', assetId: image.id });
    const add = async (kind, shotId = null) => {
      const id = randomUUID();
      await creative.addAsset(
        workspace,
        editor,
        editor,
        task.id,
        (await read()).revision,
        {
          id,
          name: kind,
          kind,
          shotId,
          mimeType: 'video/mp4',
          size: 10,
          createdAt: new Date().toISOString(),
          uploadedBy: editor,
        },
        async () =>
          files.set(
            `${workspace.id}/delivery-creative/${task.id}/${id}`,
            videoFixture,
          ),
      );
      return id;
    };
    const clipId = await add('CLIP', shot.id);
    await change(editor, {
      action: 'reviewAsset',
      assetId: clipId,
      decision: 'APPROVED',
      notes: '',
    });
    await change(editor, { action: 'selectAsset', assetId: clipId });
    const baseId = await add('BASE');
    const hookId = await add('HOOK');
    const ctaId = await add('CTA');
    for (const assetId of [baseId, hookId, ctaId])
      await change(editor, {
        action: 'reviewAsset',
        assetId,
        decision: 'APPROVED',
        notes: '',
      });
    await change(editor, {
      action: 'variants',
      baseId,
      hookIds: [hookId],
      ctaIds: [ctaId],
    });
    assert.equal((await read()).document.variants.length, 1);
    const variantId = (await read()).document.variants[0].id;
    await change(editor, { action: 'selectVariants', ids: [] });
    await change(editor, { action: 'selectVariants', ids: [variantId] });
    const finalId = await add('FINAL');
    await assert.rejects(
      change(editor, {
        action: 'reviewAsset',
        assetId: finalId,
        decision: 'APPROVED',
        notes: '',
      }),
    );
    await change(editor, { action: 'selectAsset', assetId: finalId });
    const submittedCreativeState = await mutateTask(editor, {
      action: 'submit',
      taskId: task.id,
      revision: (await read()).revision,
      description: 'Final synthetic creative',
      evidence: [],
    });
    const submittedCreative = submittedCreativeState.tasks.find((item) => item.id === task.id).details.submissions.at(-1);
    const exactCreativeReview = { selectedSubmissionVersion: submittedCreative.version, creativeVersion: submittedCreative.creativeVersion, finalAssetId: submittedCreative.finalAssetId };
    await assert.rejects(change(editor, { action: 'shot', fields }));
    await assert.rejects(
      mutateTask(editor, {
        action: 'review',
        ...exactCreativeReview,
        taskId: task.id,
        revision: (await read()).revision,
        decision: 'APPROVED',
        feedback: '',
      }),
    );
    await mutateTask(admin, {
      action: 'review',
      ...exactCreativeReview,
      taskId: task.id,
      revision: (await read()).revision,
      decision: 'APPROVED',
      feedback: 'Verified fixture',
    });
    await assert.rejects(change(admin, {action:'reopen', notes:'Ambiguous legacy amount', revisionCharge:10}));
    await change(admin, {
      action: 'reopen',
      notes: 'New client revision',
      revisionCharge: 0,
    });
    const [creativeRevision] = await runner.query('SELECT source, reason, "proposedCharge" FROM core."deliveryRevision" WHERE "taskId"=$1 ORDER BY round DESC LIMIT 1',[task.id]);
    assert.equal(creativeRevision.source,'CREATIVE_REOPEN');assert.equal(creativeRevision.reason,'New client revision');assert.equal(creativeRevision.proposedCharge,'0');
    await change(editor, {
      action: 'shot',
      id: shot.id,
      fields: { ...fields, imagePrompt: 'Revised blue shirt' },
    });
    current = await read();
    assert.equal(current.document.shots[0].imageId, null);
    assert.equal(current.document.finalAssetId, null);
    assert.equal(current.document.variants.length, 0);
    await assert.rejects(
      change(editor, { action: 'selectAsset', assetId: finalId }),
    );
    await assert.rejects(
      change(editor, { action: 'selectAsset', assetId: clipId }),
    );
    await assert.rejects(
      mutateTask(editor, {
        action: 'submit',
        taskId: task.id,
        revision: current.revision,
        description: 'Invalid',
        evidence: [],
      }),
    );
    const beforeFiles = files.size;
    const failedId = randomUUID();
    await assert.rejects(
      creative.addAsset(
        workspace,
        editor,
        editor,
        task.id,
        current.revision,
        {
          id: failedId,
          name: 'Failure',
          kind: 'IMAGE',
          shotId: shot.id,
          mimeType: 'image/png',
          size: png.length,
          createdAt: new Date().toISOString(),
          uploadedBy: editor,
        },
        async () => {
          files.set(
            `${workspace.id}/delivery-creative/${task.id}/${failedId}`,
            png,
          );
          throw new Error('Upload fixture failure');
        },
      ),
    );
    assert.equal(files.size, beforeFiles);
    assert.equal(
      (await read()).document.assets.find((asset) => asset.id === failedId)
        .storageState,
      'FAILED',
    );
    const failedUploadEvents = (await activity()).filter((event) =>
      event.changes.some(
        (change) => change.field === 'assetId' && change.after === failedId,
      ),
    );
    assert.deepEqual(failedUploadEvents.map((event) => event.action).sort(), [
      'CREATIVE_UPLOAD_FAILED',
      'CREATIVE_UPLOAD_STARTED',
    ]);
    assert(
      failedUploadEvents.some(
        (event) =>
          event.outcome === 'FAILED' &&
          event.actorType === 'SYSTEM' &&
          event.actorId === null,
      ),
    );
    let providerCalls = 0;
    let enteredProvider;
    let releaseProvider;
    let pause = false;
    const adapter = {
      generate: async () => {
        providerCalls++;
        if (pause) {
          enteredProvider();
          await new Promise((resolve) => {
            releaseProvider = resolve;
          });
        }
        return {
          bytes: png,
          mimeType: 'image/png',
          extension: 'png',
          providerJobId: 'synthetic-provider-id',
        };
      },
    };
    let inspectionAssetId = '';
    const inspectionModel = new MockLanguageModelV3({
      doGenerate: async (request) => {
        assert(JSON.stringify(request.prompt).includes('image'));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                summary: 'Synthetic image inspection',
                findings: [
                  {
                    assetId: inspectionAssetId,
                    evidence: 'Fixture region only',
                    correction: 'Human review required',
                  },
                ],
                limitations:
                  'Only supplied still images; no motion or audio inspected.',
              }),
            },
          ],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 10, text: 10, reasoning: 0 },
          },
          warnings: [],
        };
      },
    });
    let modelAllowed = true;
    const registry = {
      getModel: () => ({
        providerName: 'google',
        sdkPackage: '@ai-sdk/google',
        model: inspectionModel,
      }),
      getModelConfig: () => ({ modalities: ['image'] }),
      validateModelAvailability: () => {
        if (!modelAllowed) throw new Error('Disabled model');
      },
      getAdminFilteredModels: () => [
        { modelId: 'google/gemini-3.1-flash-image' },
      ],
    };
    const budget = await makeBudgetFixture(scoped, access, workspace, [
      { modelId: 'google/gemini-3.1-flash-image', kind: 'IMAGE' },
      { modelId: 'google/gemini-3.5-flash-lite', kind: 'INSPECTION' },
    ]);
    const media = new DeliveryMediaService(
      scoped,
      creative,
      { getResolvedProviders: () => ({ google: { apiKey: 'FIXTURE_ONLY' } }) },
      registry,
      adapter,
      storage,
      { add: async () => undefined },
      new (require('../dist/modules/delivery/creative/delivery-assembly.adapter').DeliveryAssemblyAdapter)(),
      budget,
    );
    const mediaChange = async (actor, input) =>
      checkedOperation(async () =>
        media.command(workspace, actor, actor, {
          taskId: task.id,
          revision: (await read()).revision,
          ...input,
        }),
      );
    const configuration = {
      action: 'configure',
      enabled: true,
      modelIds: ['google/gemini-3.1-flash-image'],
      roles: ['ADMIN', 'MANAGER', 'MEMBER'],
      dailyRunLimit: 10,
      allowUnknownCost: true,
    };
    await assert.rejects(mediaChange(editor, configuration));
    await mediaChange(admin, configuration);
    const generation = () => ({
      action: 'generate',
      requestId: randomUUID(),
      modelId: 'google/gemini-3.1-flash-image',
      shotId: shot.id,
      kind: 'IMAGE',
      referenceAssetIds: [],
      confirm: true,
    });
    const first = generation();
    await mediaChange(editor, first);
    await mediaChange(editor, first);
    let run = (await read()).document.mediaRuns[0];
    assert.equal((await read()).document.mediaRuns.length, 1);
    await media.execute(workspace.id, task.id, run.id);
    await media.execute(workspace.id, task.id, run.id);
    assert.equal(providerCalls, 1);
    assert.equal((await read()).document.mediaRuns[0].status, 'SUCCEEDED');
    const runEvents = (runId) =>
      activity().then((events) =>
        events.filter((event) =>
          event.changes.some(
            (change) => change.field === 'mediaRunId' && change.after === runId,
          ),
        ),
      );
    const completedEvents = await runEvents(run.id);
    assert.deepEqual(completedEvents.map((event) => event.action).sort(), [
      'MEDIA_QUEUED',
      'MEDIA_RUNNING',
      'MEDIA_SUCCEEDED',
    ]);
    assert.equal(
      completedEvents.find((event) => event.action === 'MEDIA_QUEUED')
        .actorType,
      'HUMAN',
    );
    assert.equal(
      completedEvents.find((event) => event.action === 'MEDIA_SUCCEEDED')
        .actorType,
      'AGENT',
    );
    assert.equal(
      completedEvents.find((event) => event.action === 'MEDIA_SUCCEEDED')
        .actorId,
      editor,
    );
    current = await read();
    const generated = current.document.assets.find(
      (asset) => asset.id === current.document.mediaRuns[0].assetId,
    );
    assert.equal(generated.reviews.length, 0);
    await change(editor, {
      action: 'reviewAsset',
      assetId: generated.id,
      decision: 'APPROVED',
      notes: '',
    });
    await change(editor, { action: 'selectAsset', assetId: generated.id });
    const assemblyClip = await add('CLIP', shot.id);
    await change(editor, {
      action: 'reviewAsset',
      assetId: assemblyClip,
      decision: 'APPROVED',
      notes: '',
    });
    await change(editor, { action: 'selectAsset', assetId: assemblyClip });
    await change(editor, {
      action: 'assembly',
      assetIds: [assemblyClip],
      audioId: null,
      overlayText: '',
      notes: '',
    });
    await mediaChange(editor, {
      action: 'render',
      requestId: randomUUID(),
      confirm: true,
    });
    const renderRun = (await read()).document.mediaRuns.at(-1);
    await media.execute(workspace.id, task.id, renderRun.id);
    const rendered = (await read()).document.mediaRuns.at(-1);
    assert.equal(rendered.status, 'SUCCEEDED');
    assert.equal(
      (
        await runner.query(
          'SELECT id FROM core."otogrowAiSpend" WHERE "sourceRunId"=$1',
          [renderRun.id],
        )
      ).length,
      0,
      'Local FFmpeg must not reserve paid AI money',
    );
    const renderEvents = await runEvents(renderRun.id);
    assert.equal(
      renderEvents.find((event) => event.action === 'MEDIA_SUCCEEDED')
        .actorType,
      'SYSTEM',
    );
    assert.equal(
      renderEvents.find((event) => event.action === 'MEDIA_SUCCEEDED').actorId,
      null,
    );
    const renderedAsset = (await read()).document.assets.find(
      (item) => item.id === rendered.assetId,
    );
    assert.equal(renderedAsset.kind, 'FINAL');
    assert.equal(renderedAsset.reviews.length, 0);
    assert(
      files.get(
        `${workspace.id}/delivery-creative/${task.id}/${renderedAsset.id}`,
      ).length > 0,
    );

    await controller.upload(
      workspace,
      editor,
      editor,
      task.id,
      { revision: (await read()).revision, kind: 'IMAGE', shotId: shot.id },
      { buffer: png, originalname: 'inspection.png', size: png.length },
    );
    inspectionAssetId = (await read()).document.assets.at(-1).id;
    await mediaChange(admin, {
      ...configuration,
      modelIds: [...configuration.modelIds, 'google/gemini-3.5-flash-lite'],
    });
    await mediaChange(editor, {
      ...generation(),
      modelId: 'google/gemini-3.5-flash-lite',
      kind: 'INSPECTION',
      referenceAssetIds: [inspectionAssetId],
    });
    const inspectionRun = (await read()).document.mediaRuns.at(-1);
    await media.execute(workspace.id, task.id, inspectionRun.id);
    const inspected = (await read()).document.mediaRuns.at(-1);
    assert.equal(inspected.status, 'SUCCEEDED');
    const [inspectionSpend] = await runner.query(
      'SELECT state,"actualMicroUsd" FROM core."otogrowAiSpend" WHERE "sourceRunId"=$1',
      [inspectionRun.id],
    );
    assert.equal(inspectionSpend.state, 'SETTLED');
    assert.equal(inspectionSpend.actualMicroUsd, '20');
    assert.equal(
      (await runEvents(inspectionRun.id)).filter(
        (event) => event.action === 'MEDIA_SUCCEEDED',
      ).length,
      1,
    );
    assert.equal(inspected.inspection.findings[0].assetId, inspectionAssetId);
    assert.equal(
      (await read()).document.assets.find(
        (item) => item.id === inspectionAssetId,
      ).reviews.length,
      0,
    );
    for (const changeDuringRun of ['cancel', 'brief', 'model']) {
      pause = true;
      await mediaChange(editor, generation());
      const latestRun = (await read()).document.mediaRuns.at(-1);
      const entered = new Promise((resolve) => {
        enteredProvider = resolve;
      });
      const executing = media.execute(workspace.id, task.id, latestRun.id);
      await entered;
      if (changeDuringRun === 'cancel')
        await mediaChange(editor, { action: 'cancel', runId: latestRun.id });
      if (changeDuringRun === 'brief')
        await change(admin, {
          action: 'brief',
          brief: {
            ...(await read()).document.brief,
            concept: 'Changed during generation',
          },
        });
      if (changeDuringRun === 'model') modelAllowed = false;
      releaseProvider();
      await executing;
      const completed = (await read()).document.mediaRuns.at(-1);
      assert.equal(
        completed.status,
        changeDuringRun === 'cancel' ? 'CANCELLED' : 'FAILED',
      );
      assert.equal(completed.assetId, null);
      const interruptedEvents = await runEvents(latestRun.id);
      assert(
        !interruptedEvents.some((event) => event.action === 'MEDIA_SUCCEEDED'),
      );
      assert.equal(
        interruptedEvents.filter(
          (event) =>
            event.action ===
            (changeDuringRun === 'cancel' ? 'MEDIA_CANCELLED' : 'MEDIA_FAILED'),
        ).length,
        1,
      );
      modelAllowed = true;
      if (changeDuringRun === 'brief')
        await change(admin, { action: 'approveBrief' });
    }
    await mediaChange(admin, { ...configuration, dailyRunLimit: 1 });
    await assert.rejects(mediaChange(editor, generation()), /limit/);
    const events = await activity();
    for (const action of [
      'CREATIVE_INITIALIZED',
      'CREATIVE_BRIEF_UPDATED',
      'CREATIVE_BRIEF_APPROVED',
      'CREATIVE_REFERENCE_ADDED',
      'CREATIVE_REFERENCES_REVIEWED',
      'CREATIVE_SHOT_CREATED',
      'CREATIVE_SHOT_UPDATED',
      'CREATIVE_ASSET_ESCALATED',
      'CREATIVE_ASSET_REVIEWED',
      'CREATIVE_ASSET_SELECTED',
      'CREATIVE_ASSEMBLY_UPDATED',
      'CREATIVE_VARIANTS_CREATED',
      'CREATIVE_VARIANTS_SELECTED',
      'CREATIVE_REOPENED',
      'CREATIVE_UPLOAD_STARTED',
      'CREATIVE_UPLOAD_COMPLETED',
      'CREATIVE_UPLOAD_FAILED',
      'MEDIA_CONFIGURED',
    ])
      assert(
        events.some((event) => event.action === action),
        `Missing ${action}`,
      );
    const finalReview = events.filter(
      (event) =>
        event.action === 'TASK_REVIEWED' && event.outcome === 'APPROVED',
    );
    assert.equal(finalReview.length, 1);
    assert.equal(finalReview[0].actorId, admin);
    assert.equal(finalReview[0].subjectMemberId, editor);
    assert(
      events.some(
        (event) =>
          event.action === 'CREATIVE_ASSET_REVIEWED' &&
          event.actorId === admin &&
          event.outcome === 'APPROVED',
      ),
    );
    const serializedActivity = JSON.stringify(events);
    for (const value of [
      confidential,
      'A blue cotton shirt',
      'Slow camera move',
      'FIXTURE_ONLY',
      'synthetic-provider-id',
      'Fixture region only',
      'Upload fixture failure',
      '20% off; blue cotton shirt',
    ])
      assert(
        !serializedActivity.includes(value),
        'Activity must not retain private creative contents, prompts or provider details',
      );
    await mutateTask(admin, {
      action: 'project',
      id: project.id,
      revision: project.revision,
      name: project.name,
      companyId: null,
      memberIds: [],
    });
    await assert.rejects(creative.read(workspace, editor, editor, task.id));
    await assert.rejects(
      controller.download(workspace, editor, editor, task.id, image.id, {}),
    );
    process.stdout.write(
      'PASS: scoped creative workflow and durable milestones; atomic denied/failed writes, upload success/failure, named review/variant actions, idempotent media lifecycle and actor attribution, secret exclusion and independent final approval. All synthetic records rolled back; no provider calls.\n',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});

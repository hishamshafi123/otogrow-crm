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
const {
  DeliveryAgentService,
} = require('../dist/modules/delivery/agents/delivery-agent.service');
const {
  DeliveryAgentEntity,
} = require('../dist/modules/delivery/entities/delivery-agent.entity');
const {
  DeliveryAgentRunEntity,
} = require('../dist/modules/delivery/entities/delivery-agent-run.entity');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');

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
        : 'SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL LIMIT 1',
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
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) => callback(runner.manager),
    };
    const delivery = new DeliveryService(scoped, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        userWorkspaceId === admin,
    });
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
    const creative = new DeliveryCreativeService(scoped, delivery, storage);
    const controller = new DeliveryCreativeFilesController(creative, storage);
    const read = () => creative.read(workspace, editor, editor, task.id);
    const change = async (actor, input) =>
      creative.command(workspace, actor, actor, {
        taskId: task.id,
        revision: (await read()).revision,
        ...input,
      });
    await assert.rejects(creative.read(workspace, outsider, outsider, task.id));
    await change(editor, { action: 'initialize' });
    let current = await read();
    await assert.rejects(change(editor, { action: 'approveBrief' }));
    await change(admin, {
      action: 'brief',
      brief: {
        ...current.document.brief,
        concept: '20% offer product demo',
        productFacts: '20% off; blue cotton shirt',
      },
    });
    await change(admin, { action: 'approveBrief' });
    await change(editor, {
      action: 'reference',
      fields: {
        title: 'Reference',
        url: 'https://example.com/ref',
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
      notes: '',
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
      console.log(
        'Temporary synthetic browser fixture created. Cleanup identifiers saved in /tmp/otogrow-phase3-browser.json.',
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
    await mutateTask(editor, {
      action: 'submit',
      taskId: task.id,
      revision: (await read()).revision,
      description: 'Final synthetic creative',
      evidence: [],
    });
    await assert.rejects(change(editor, { action: 'shot', fields }));
    await assert.rejects(
      mutateTask(editor, {
        action: 'review',
        taskId: task.id,
        revision: (await read()).revision,
        decision: 'APPROVED',
        feedback: '',
      }),
    );
    await mutateTask(admin, {
      action: 'review',
      taskId: task.id,
      revision: (await read()).revision,
      decision: 'APPROVED',
      feedback: 'Verified fixture',
    });
    await change(admin, {
      action: 'reopen',
      notes: 'New client revision',
      revisionCharge: 0,
    });
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
    const media = new DeliveryMediaService(
      scoped,
      creative,
      { getResolvedProviders: () => ({ google: { apiKey: 'FIXTURE_ONLY' } }) },
      registry,
      adapter,
      storage,
      { add: async () => undefined },
      new (require('../dist/modules/delivery/creative/delivery-assembly.adapter').DeliveryAssemblyAdapter)(),
    );
    const mediaChange = async (actor, input) =>
      media.command(workspace, actor, actor, {
        taskId: task.id,
        revision: (await read()).revision,
        ...input,
      });
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
      modelAllowed = true;
      if (changeDuringRun === 'brief')
        await change(admin, { action: 'approveBrief' });
    }
    await mediaChange(admin, { ...configuration, dailyRunLimit: 1 });
    await assert.rejects(mediaChange(editor, generation()), /limit/);
    await mutateTask(admin, {
      action: 'project',
      id: project.id,
      name: project.name,
      companyId: null,
      memberIds: [],
    });
    await assert.rejects(creative.read(workspace, editor, editor, task.id));
    await assert.rejects(
      controller.download(workspace, editor, editor, task.id, image.id, {}),
    );
    console.log(
      'PASS: scoped creative workflow, references, briefs, shot lineage, upload validation/cleanup, escalation, final approval, revisions, variants, generation idempotency/cancellation/stale inputs/model revocation/limits, and revoked downloads. All synthetic records rolled back; no provider calls.',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

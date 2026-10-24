// Live mode is opt-in; database records are rolled back in either mode.
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
  const live = process.argv.includes('--live');
  if (live) assert(process.env.DELIVERY_TEST_GEMINI_KEY, 'Missing test key');
  const modelId = live ? 'gemini-3.5-flash-lite' : 'fixture-model';
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
      'SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL LIMIT 1',
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
    let providerCalls = 0;
    let behavior = 'success';
    let releaseProvider;
    let enteredProvider;
    const fixtureModel = new MockLanguageModelV3({
      doGenerate: async (request) => {
        const isBrief = JSON.stringify(request.prompt).includes(
          'Check for missing requirements',
        );
        providerCalls++;
        if (behavior === 'failure')
          throw new Error(
            'Fixture provider failed (secret must not be echoed)',
          );
        if (behavior === 'timeout') {
          return new Promise((resolve, reject) => {
            if (request.abortSignal.aborted)
              reject(new Error('Fixture timeout'));
            else
              request.abortSignal.addEventListener(
                'abort',
                () => reject(new Error('Fixture timeout')),
                { once: true },
              );
          });
        }
        if (behavior === 'cancel') {
          enteredProvider();
          await new Promise((resolve) => {
            releaseProvider = resolve;
          });
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                summary: 'FIXTURE: Copy contradicts the approved discount.',
                findings: [
                  {
                    severity: 'error',
                    evidence: 'FIXTURE: Brief says 20%; copy says 50%.',
                    correction: 'Use 20% off.',
                  },
                ],
                suggestedBrief: isBrief
                  ? 'Offer is 20% off. Add approved CTA and audience.'
                  : null,
                suggestedCopy: 'Get 20% off today.',
              }),
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
            outputTokens: { total: 40, text: 40, reasoning: 0 },
          },
          warnings: [],
        };
      },
    });
    const model = live
      ? require('ai').wrapLanguageModel({
          model: require('@ai-sdk/google').createGoogleGenerativeAI({
            apiKey: process.env.DELIVERY_TEST_GEMINI_KEY,
          })(modelId),
          middleware: {
            specificationVersion: 'v3',
            wrapGenerate: async ({ doGenerate }) => {
              try {
                return await doGenerate();
              } catch (error) {
                console.log(
                  JSON.stringify({
                    providerError: String(error.message)
                      .split(process.env.DELIVERY_TEST_GEMINI_KEY)
                      .join('[REDACTED]'),
                    statusCode: error.statusCode,
                  }),
                );
                throw error;
              }
            },
          },
        })
      : fixtureModel;
    let modelAllowed = true;
    const registry = {
      getModel: (id) => (id === modelId ? { model, modelId: id } : undefined),
      validateModelAvailability: () => {
        if (!modelAllowed) throw new Error('Disabled model');
      },
      getAdminFilteredModels: () => [{ modelId, model }],
    };
    let enqueues = 0;
    const service = new DeliveryAgentService(scoped, delivery, registry, {
      add: async () => {
        enqueues++;
      },
    });
    const command = (actor, input) =>
      service.command(workspace, actor, actor, input);
    const configuration = {
      name: 'FIXTURE copy checker',
      purpose: 'Rollback-only verification',
      kind: 'COPY',
      enabled: true,
      instructions: live
        ? 'Compare discounts accurately.'
        : 'Compare discounts. Fixture only.',
      requiredInputs: ['brief', 'copy'],
      outputFormat: 'findings_and_edits',
      tools: [],
      modelId,
      projectIds: [project.id],
      roles: ['ADMIN', 'MANAGER', 'MEMBER'],
      dailyRunLimit: 30,
      maxOutputTokens: live ? 2048 : 512,
      humanConfirmation: true,
    };
    await assert.rejects(
      command(editor, { type: 'save', configuration }),
      /Only admins/,
    );
    const saved = await command(admin, { type: 'save', configuration });
    const agentId = saved.saved;
    const inputs = { copy: 'Get 50% off today.', requirements: '' };
    const previewInput = { type: 'preview', taskId: task.id, agentId, inputs };
    await assert.rejects(command(outsider, previewInput), /unavailable/);
    const preview = await command(editor, previewInput);
    assert.equal(preview.context.brief, task.details.brief);
    const makeStart = () => ({
      type: 'start',
      taskId: task.id,
      agentId,
      inputs,
      requestId: randomUUID(),
      taskRevision: task.revision,
      agentVersion: 1,
    });
    if (live) {
      for (const kind of process.argv.includes('--brief-only')
        ? ['BRIEF']
        : ['COPY', 'BRIEF']) {
        const selectedAgent =
          kind === 'COPY'
            ? agentId
            : (
                await command(admin, {
                  type: 'save',
                  configuration: {
                    ...configuration,
                    name: 'Live synthetic brief check',
                    kind: 'BRIEF',
                    instructions:
                      'Identify missing audience, channel and CTA. Preserve the approved discount.',
                    requiredInputs: ['brief'],
                  },
                })
              ).saved;
        const started = await command(admin, {
          ...makeStart(),
          agentId: selectedAgent,
        });
        await service.execute(started.runId);
        const result = await runner.manager
          .getRepository(DeliveryAgentRunEntity)
          .findOneByOrFail({ id: started.runId });
        console.log(
          JSON.stringify({
            kind,
            modelId,
            status: result.status,
            result: result.result,
            usage: result.usage,
            error: result.error,
          }),
        );
        assert.equal(result.status, 'WAITING_REVIEW');
        assert(result.result.findings.length > 0);
        if (kind === 'COPY') {
          assert.match(JSON.stringify(result.result.findings), /50/);
          assert.match(result.result.suggestedCopy, /20/);
        } else {
          assert.match(result.result.suggestedBrief, /NEEDS CONFIRMATION/);
          assert(!result.result.suggestedBrief.includes('General consumers'));
        }
        const field = kind === 'COPY' ? 'copy' : 'brief';
        assert(
          result.result[kind === 'COPY' ? 'suggestedCopy' : 'suggestedBrief'],
        );
        await command(admin, {
          type: 'decide',
          runId: result.id,
          action: 'ACCEPT',
          field,
        });
        const updated = await runner.manager
          .getRepository(DeliveryTaskEntity)
          .findOneByOrFail({ taskId: task.id, workspaceId: workspace.id });
        assert.equal(updated.details.state, 'PLANNED');
        assert.equal(
          updated.details[field === 'copy' ? 'draftCopy' : 'brief'],
          result.result[field === 'copy' ? 'suggestedCopy' : 'suggestedBrief'],
        );
        task.revision = updated.revision;
      }
      console.log(
        'PASS: selected live Gemini checks, persisted structured findings, human edit acceptance and unchanged delivery approval. Synthetic data rolled back.',
      );
      return;
    }
    const firstInput = makeStart();
    const first = await command(editor, firstInput);
    assert.equal((await command(editor, firstInput)).runId, first.runId);
    await service.execute(first.runId);
    await service.execute(first.runId);
    assert.equal(
      providerCalls,
      1,
      'Duplicate worker delivery must not call the provider twice',
    );
    let persisted = await runner.manager
      .getRepository(DeliveryAgentRunEntity)
      .findOneByOrFail({ id: first.runId });
    assert.equal(persisted.status, 'WAITING_REVIEW');
    assert.equal(persisted.usage.cost, null);
    assert.equal(persisted.usage.inputTokens, 100);
    assert.equal(
      persisted.configuration.instructions,
      configuration.instructions,
    );
    assert.equal(
      (await service.snapshot(workspace, outsider, outsider)).runs.length,
      0,
    );
    await assert.rejects(
      command(outsider, {
        type: 'decide',
        runId: first.runId,
        action: 'ACCEPT',
        field: 'copy',
      }),
      /unavailable/,
    );
    await command(editor, {
      type: 'decide',
      runId: first.runId,
      action: 'ACCEPT',
      field: 'copy',
    });
    let storedTask = await runner.manager
      .getRepository(DeliveryTaskEntity)
      .findOneByOrFail({ taskId: task.id, workspaceId: workspace.id });
    assert.equal(storedTask.details.draftCopy, 'Get 20% off today.');
    assert.equal(storedTask.details.state, 'PLANNED');
    const acceptedRevision = storedTask.revision;
    await command(editor, {
      type: 'decide',
      runId: first.runId,
      action: 'ACCEPT',
      field: 'copy',
    });
    assert.equal(
      (
        await runner.manager
          .getRepository(DeliveryTaskEntity)
          .findOneByOrFail({ id: storedTask.id })
      ).revision,
      acceptedRevision,
    );
    task.revision = acceptedRevision;
    const rejected = await command(editor, makeStart());
    await service.execute(rejected.runId);
    await command(editor, {
      type: 'decide',
      runId: rejected.runId,
      action: 'REJECT',
      field: null,
    });
    assert.equal(
      (
        await runner.manager
          .getRepository(DeliveryTaskEntity)
          .findOneByOrFail({ id: storedTask.id })
      ).revision,
      acceptedRevision,
    );
    behavior = 'failure';
    const failed = await command(editor, makeStart());
    await service.execute(failed.runId);
    persisted = await runner.manager
      .getRepository(DeliveryAgentRunEntity)
      .findOneByOrFail({ id: failed.runId });
    assert.equal(persisted.status, 'FAILED');
    assert(!persisted.error.includes('secret'));
    behavior = 'success';
    const cancelled = await command(editor, makeStart());
    await command(editor, { type: 'cancel', runId: cancelled.runId });
    const beforeCancelCalls = providerCalls;
    await service.execute(cancelled.runId);
    assert.equal(providerCalls, beforeCancelCalls);
    behavior = 'cancel';
    const inFlight = await command(editor, makeStart());
    const entered = new Promise((resolve) => {
      enteredProvider = resolve;
    });
    const executing = service.execute(inFlight.runId);
    await entered;
    await command(editor, { type: 'cancel', runId: inFlight.runId });
    releaseProvider();
    await executing;
    persisted = await runner.manager
      .getRepository(DeliveryAgentRunEntity)
      .findOneByOrFail({ id: inFlight.runId });
    assert.equal(persisted.status, 'CANCELLED');
    assert.equal(persisted.result, null);
    const changedDuringRun = await command(editor, makeStart());
    const enteredChangedRun = new Promise((resolve) => {
      enteredProvider = resolve;
    });
    const executingChangedRun = service.execute(changedDuringRun.runId);
    await enteredChangedRun;
    await runner.manager
      .getRepository(DeliveryTaskEntity)
      .increment({ id: storedTask.id }, 'revision', 1);
    releaseProvider();
    await executingChangedRun;
    persisted = await runner.manager
      .getRepository(DeliveryAgentRunEntity)
      .findOneByOrFail({ id: changedDuringRun.runId });
    assert.equal(persisted.status, 'FAILED');
    assert.match(persisted.error, /Task changed during execution/);
    assert.equal(persisted.result, null);
    task.revision++;
    behavior = 'success';
    const stale = await command(editor, makeStart());
    await runner.manager
      .getRepository(DeliveryTaskEntity)
      .increment({ id: storedTask.id }, 'revision', 1);
    await service.execute(stale.runId);
    assert.equal(
      (
        await runner.manager
          .getRepository(DeliveryAgentRunEntity)
          .findOneByOrFail({ id: stale.runId })
      ).status,
      'FAILED',
    );
    task.revision++;
    const revoke = await command(editor, makeStart());
    await mutateTask(admin, {
      action: 'project',
      id: project.id,
      name: project.name,
      companyId: null,
      memberIds: [],
    });
    await service.execute(revoke.runId);
    assert.equal(
      (
        await runner.manager
          .getRepository(DeliveryAgentRunEntity)
          .findOneByOrFail({ id: revoke.runId })
      ).status,
      'FAILED',
    );
    await mutateTask(admin, {
      action: 'project',
      id: project.id,
      name: project.name,
      companyId: null,
      memberIds: [editor],
    });
    modelAllowed = false;
    await assert.rejects(command(editor, makeStart()), /Disabled model/);
    modelAllowed = true;
    await command(admin, {
      type: 'save',
      id: agentId,
      version: 1,
      configuration: { ...configuration, enabled: false },
    });
    await assert.rejects(
      command(editor, { ...makeStart(), agentVersion: 2 }),
      /not enabled/,
    );
    await command(admin, {
      type: 'save',
      id: agentId,
      version: 2,
      configuration: { ...configuration, dailyRunLimit: 1 },
    });
    await assert.rejects(
      command(editor, { ...makeStart(), agentVersion: 3 }),
      /limit reached/,
    );
    const recoveryAgent = await command(admin, { type: 'save', configuration });
    const recoveryInput = {
      ...makeStart(),
      agentId: recoveryAgent.saved,
      agentVersion: 1,
    };
    const interrupted = await command(editor, recoveryInput);
    await runner.query(
      'UPDATE core."deliveryAgentRun" SET status = \'RUNNING\', "updatedAt" = now() - interval \'10 minutes\' WHERE id = $1',
      [interrupted.runId],
    );
    const unqueued = await command(editor, {
      ...recoveryInput,
      requestId: randomUUID(),
    });
    const beforeRecovery = enqueues;
    await service.recover();
    assert(
      enqueues > beforeRecovery,
      'Recovery must retry pending outbox jobs',
    );
    assert.equal(
      (
        await runner.manager
          .getRepository(DeliveryAgentRunEntity)
          .findOneByOrFail({ id: interrupted.runId })
      ).status,
      'FAILED',
    );
    await command(editor, { type: 'cancel', runId: unqueued.runId });

    const { Queue, Worker, QueueEvents } = require('bullmq');
    const Redis = require('ioredis');
    const {
      DeliveryAgentJob,
    } = require('../dist/modules/delivery/agents/delivery-agent.job');
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    const queueName = `delivery-verification-${randomUUID()}`;
    const queue = new Queue(queueName, { connection: redis });
    const events = new QueueEvents(queueName, { connection: redis });
    let actualJob;
    const queuedService = new DeliveryAgentService(scoped, delivery, registry, {
      add: async (name, data) => {
        actualJob = await queue.add(name, data);
      },
    });
    const handler = new DeliveryAgentJob(queuedService);
    const worker = new Worker(queueName, (job) => handler.handle(job.data), {
      connection: redis,
    });
    try {
      await events.waitUntilReady();
      await worker.waitUntilReady();
      const queued = await queuedService.command(workspace, editor, editor, {
        ...recoveryInput,
        requestId: randomUUID(),
      });
      await actualJob.waitUntilFinished(events, 15000);
      assert.equal(
        (
          await runner.manager
            .getRepository(DeliveryAgentRunEntity)
            .findOneByOrFail({ id: queued.runId })
        ).status,
        'WAITING_REVIEW',
      );
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await redis.quit();
    }
    const timedOut = await command(editor, {
      ...recoveryInput,
      requestId: randomUUID(),
    });
    behavior = 'timeout';
    const originalTimeout = AbortSignal.timeout;
    try {
      AbortSignal.timeout = () => originalTimeout(10);
      await service.execute(timedOut.runId);
      assert.equal(
        (
          await runner.manager
            .getRepository(DeliveryAgentRunEntity)
            .findOneByOrFail({ id: timedOut.runId })
        ).status,
        'FAILED',
      );
    } finally {
      AbortSignal.timeout = originalTimeout;
      behavior = 'success';
    }
    const briefAgent = await command(admin, {
      type: 'save',
      configuration: {
        ...configuration,
        kind: 'BRIEF',
        name: 'FIXTURE brief checker',
        requiredInputs: ['brief'],
      },
    });
    const briefRun = await command(admin, {
      ...makeStart(),
      agentId: briefAgent.saved,
      agentVersion: 1,
      inputs: { copy: '', requirements: 'Need audience and CTA' },
    });
    await service.execute(briefRun.runId);
    const briefResult = await runner.manager
      .getRepository(DeliveryAgentRunEntity)
      .findOneByOrFail({ id: briefRun.runId });
    assert.equal(briefResult.status, 'WAITING_REVIEW');
    assert.equal(briefResult.result.suggestedCopy, null);
    assert(briefResult.result.suggestedBrief.includes('CTA'));
    await command(admin, {
      type: 'decide',
      runId: briefRun.runId,
      action: 'ACCEPT',
      field: 'brief',
    });
    assert.equal(
      (
        await runner.manager
          .getRepository(DeliveryTaskEntity)
          .findOneByOrFail({ id: storedTask.id })
      ).details.brief,
      briefResult.result.suggestedBrief,
    );
    assert(enqueues > 0);
    console.log(
      'PASS: fixture SDK execution, persisted review, scoped permissions, revoked access/model, idempotency, accept/reject, failure, queued/in-flight cancellation, stale revision, daily limits, aborted timeouts, outbox recovery and real Redis queue processing. All fixtures rolled back.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(
    process.argv.includes('--live')
      ? 'Live check failed; inspect the sanitized run output above.'
      : error,
  );
  process.exitCode = 1;
});

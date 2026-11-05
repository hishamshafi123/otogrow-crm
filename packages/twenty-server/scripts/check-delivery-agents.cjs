const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const report = (message) => process.stdout.write(`${message}\n`);
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
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
const {
  OtogrowActivityEventEntity,
} = require('../dist/modules/otogrow-activity/entities/otogrow-activity-event.entity');

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
      `SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL AND "activationStatus"='ACTIVE' LIMIT 1`,
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
      transaction: (callback) => runner.manager.transaction(callback),
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
    let providerCalls = 0;
    let behavior = 'success';
    let modelHook = null;
    let releaseProvider;
    let enteredProvider;
    const fixtureModel = new MockLanguageModelV3({
      doGenerate: async (request) => {
        const isBrief = JSON.stringify(request.prompt).includes(
          'Check for missing requirements',
        );
        providerCalls++;
        if (modelHook) await modelHook();
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
              text:
                behavior === 'invalid-output'
                  ? '{invalid JSON'
                  : JSON.stringify({
                      summary:
                        'FIXTURE: Copy contradicts the approved discount.',
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
                report(
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
    const budget = await makeBudgetFixture(scoped, access, workspace, [
      { modelId, kind: 'TEXT' },
    ]);
    let enqueues = 0;
    const service = new DeliveryAgentService(
      scoped,
      delivery,
      registry,
      {
        add: async () => {
          enqueues++;
        },
      },
      budget,
      access,
    );
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
      pricingRevision: 1,
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
        report(
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
      report(
        'PASS: selected live Gemini checks, persisted structured findings, human edit acceptance and unchanged delivery approval. Synthetic data rolled back.',
      );
      return;
    }
    const firstInput = makeStart();
    const withoutPricing = { ...firstInput };
    delete withoutPricing.pricingRevision;
    await assert.rejects(command(editor, withoutPricing), /Preview/);
    await assert.rejects(
      command(editor, { ...firstInput, pricingRevision: 999 }),
      /pricing changed/,
    );
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
    assert.equal(persisted.usage.cost, 0.00014);
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
    behavior = 'invalid-output';
    const invalidOutput = await command(editor, makeStart());
    await service.execute(invalidOutput.runId);
    assert.equal(
      (
        await runner.manager
          .getRepository(DeliveryAgentRunEntity)
          .findOneByOrFail({ id: invalidOutput.runId })
      ).status,
      'FAILED',
    );
    const [invalidOutputSpend] = await runner.query(
      'SELECT state,"actualMicroUsd" FROM core."otogrowAiSpend" WHERE "sourceRunId"=$1',
      [invalidOutput.runId],
    );
    assert.equal(
      invalidOutputSpend.state,
      'SETTLED',
      'Invalid structured output still has known provider usage',
    );
    assert.equal(invalidOutputSpend.actualMicroUsd, '140');
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
      revision: project.revision,
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
      revision: project.revision + 1,
      name: project.name,
      companyId: null,
      memberIds: [editor],
    });
    const beforeDispatchRace = providerCalls;
    const dispatchRace = await command(editor, makeStart());
    const originalDispatch = budget.dispatch.bind(budget);
    try {
      budget.dispatch = async (source, identity, authorize) => {
        await mutateTask(admin, {
          action: 'project',
          id: project.id,
          revision: project.revision + 2,
          name: project.name,
          companyId: null,
          memberIds: [],
        });
        return originalDispatch(source, identity, authorize);
      };
      await service.execute(dispatchRace.runId);
    } finally {
      budget.dispatch = originalDispatch;
      await mutateTask(admin, {
        action: 'project',
        id: project.id,
        revision: project.revision + 3,
        name: project.name,
        companyId: null,
        memberIds: [editor],
      });
    }
    assert.equal(
      providerCalls,
      beforeDispatchRace,
      'Revocation at paid dispatch must prevent provider work',
    );
    const [blockedSpend] = await runner.query(
      'SELECT state FROM core."otogrowAiSpend" WHERE "sourceRunId"=$1',
      [dispatchRace.runId],
    );
    assert.equal(blockedSpend.state, 'RELEASED');
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
    const queuedService = new DeliveryAgentService(
      scoped,
      delivery,
      registry,
      {
        add: async (name, data) => {
          actualJob = await queue.add(name, data);
        },
      },
      budget,
      access,
    );
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
    const configurationEvents = await runner.query(
      `SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"='agent' AND "sourceId"=$2`,
      [workspace.id, agentId],
    );
    assert.deepEqual(configurationEvents.map((event) => event.action).sort(), [
      'AGENT_CREATED',
      'AGENT_UPDATED',
      'AGENT_UPDATED',
    ]);
    assert(
      configurationEvents.every(
        (event) => event.actorId === admin && event.actorType === 'HUMAN',
      ),
    );
    assert(
      configurationEvents.some((event) =>
        event.changes.some(
          (change) =>
            change.field === 'enabled' &&
            change.before === 'true' &&
            change.after === 'false',
        ),
      ),
    );
    assert(
      configurationEvents.some((event) =>
        event.changes.some(
          (change) =>
            change.field === 'dailyRunLimit' &&
            change.before === '30' &&
            change.after === '1',
        ),
      ),
    );
    assert(
      !JSON.stringify(configurationEvents).includes(configuration.instructions),
    );
    await assert.rejects(
      command(admin, { type: 'save', id: agentId, version: 1, configuration }),
      /Agent changed/,
    );
    assert.equal(
      (
        await runner.query(
          `SELECT id FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"='agent' AND "sourceId"=$2`,
          [workspace.id, agentId],
        )
      ).length,
      configurationEvents.length,
    );
    const runEvents = (runId) =>
      runner.query(
        `SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"='agent-run' AND "sourceId"=$2`,
        [workspace.id, runId],
      );
    const assertActions = async (runId, expected) => {
      const rows = await runEvents(runId);
      assert.deepEqual(
        rows.map((event) => event.action).sort(),
        [...expected].sort(),
      );
      for (const event of rows) {
        assert.equal(event.category, 'AGENT');
        assert.equal(event.taskId, task.id);
        assert.equal(event.projectId, project.id);
        assert.equal(event.projectName, project.name);
        assert(
          event.subjectName,
          'Initiating member identity must be retained',
        );
      }
      return rows;
    };
    const successActions = [
      'AGENT_RUN_QUEUED',
      'AGENT_RUN_STARTED',
      'AGENT_RUN_COMPLETED',
    ];
    const firstEvents = await assertActions(first.runId, [
      ...successActions,
      'AGENT_RESULT_ACCEPTED',
    ]);
    for (const event of firstEvents) {
      assert.equal(event.actorId, editor);
      assert.equal(event.subjectMemberId, editor);
      assert.equal(event.taskName, task.title);
      assert.equal(event.agentName, configuration.name);
      assert.equal(
        event.actorType,
        ['AGENT_RUN_STARTED', 'AGENT_RUN_COMPLETED'].includes(event.action)
          ? 'AGENT'
          : 'HUMAN',
      );
    }
    const completion = firstEvents.find(
      (event) => event.action === 'AGENT_RUN_COMPLETED',
    );
    assert.equal(completion.outcome, 'SUCCEEDED');
    assert(
      completion.changes.some(
        (change) =>
          change.field === 'runStatus' && change.after === 'WAITING_REVIEW',
      ),
    );
    assert(
      completion.changes.some(
        (change) => change.field === 'inputTokens' && change.after === '100',
      ),
    );
    assert(
      firstEvents
        .find((event) => event.action === 'AGENT_RESULT_ACCEPTED')
        .changes.some(
          (change) =>
            change.field === 'appliedField' && change.after === 'copy',
        ),
    );
    await assertActions(rejected.runId, [
      ...successActions,
      'AGENT_RESULT_REJECTED',
    ]);
    for (const run of [failed, stale, revoke, changedDuringRun, timedOut]) {
      const rows = await assertActions(run.runId, [
        'AGENT_RUN_QUEUED',
        'AGENT_RUN_STARTED',
        'AGENT_RUN_FAILED',
      ]);
      assert.equal(
        rows.find((event) => event.action === 'AGENT_RUN_FAILED').actorType,
        'AGENT',
      );
    }
    await assertActions(cancelled.runId, [
      'AGENT_RUN_QUEUED',
      'AGENT_RUN_CANCELLED',
    ]);
    await assertActions(inFlight.runId, [
      'AGENT_RUN_QUEUED',
      'AGENT_RUN_STARTED',
      'AGENT_RUN_CANCELLED',
    ]);
    const interruptedEvents = await assertActions(interrupted.runId, [
      'AGENT_RUN_QUEUED',
      'AGENT_RUN_INTERRUPTED',
    ]);
    const interruption = interruptedEvents.find(
      (event) => event.action === 'AGENT_RUN_INTERRUPTED',
    );
    assert.equal(interruption.actorType, 'SYSTEM');
    assert.equal(interruption.actorId, null);
    await assertActions(unqueued.runId, [
      'AGENT_RUN_QUEUED',
      'AGENT_RUN_CANCELLED',
    ]);
    const briefEvents = await assertActions(briefRun.runId, [
      ...successActions,
      'AGENT_RESULT_ACCEPTED',
    ]);
    assert(
      briefEvents
        .find((event) => event.action === 'AGENT_RESULT_ACCEPTED')
        .changes.some(
          (change) =>
            change.field === 'appliedField' && change.after === 'brief',
        ),
    );
    for (const event of briefEvents) {
      assert.equal(
        event.actorId,
        admin,
        'Preserve the manager who initiated or accepted the run',
      );
      assert.equal(
        event.subjectMemberId,
        editor,
        'Attribute the affected assignment to its editor',
      );
      assert.equal(
        event.actorType,
        ['AGENT_RUN_STARTED', 'AGENT_RUN_COMPLETED'].includes(event.action)
          ? 'AGENT'
          : 'HUMAN',
      );
    }
    const activityPayload = JSON.stringify(
      await runner.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2',
        [workspace.id, project.id],
      ),
    );
    for (const privateText of [
      configuration.instructions,
      inputs.copy,
      'Offer is 20% off.',
      'FIXTURE: Copy contradicts',
      'secret must not be echoed',
      'Need audience and CTA',
    ]) {
      assert(
        !activityPayload.includes(privateText),
        'Activity must exclude instructions, task content, results and errors',
      );
    }
    const taskBeforeFailedAcceptance = await runner.manager
      .getRepository(DeliveryTaskEntity)
      .findOneByOrFail({ id: storedTask.id });
    const atomicResult = await command(admin, {
      ...makeStart(),
      agentId: briefAgent.saved,
      agentVersion: 1,
      taskRevision: taskBeforeFailedAcceptance.revision,
      inputs: { copy: '', requirements: 'Atomic fixture' },
    });
    await service.execute(atomicResult.runId);
    // A failed activity write must roll configuration, acceptance and queue changes back.
    const requestId = randomUUID();
    const enqueueCount = enqueues;
    const originalGetRepository = runner.manager.getRepository.bind(
      runner.manager,
    );
    try {
      runner.manager.getRepository = (entity) => {
        const repository = originalGetRepository(entity);
        return entity === OtogrowActivityEventEntity
          ? new Proxy(repository, {
              get: (target, property) =>
                property === 'insert'
                  ? async () => {
                      throw new Error('Fixture activity write failure');
                    }
                  : Reflect.get(target, property),
            })
          : repository;
      };
      await assert.rejects(
        command(admin, {
          type: 'decide',
          runId: atomicResult.runId,
          action: 'ACCEPT',
          field: 'brief',
        }),
        /Fixture activity write failure/,
      );
      const taskAfterFailedAcceptance = await originalGetRepository(
        DeliveryTaskEntity,
      ).findOneByOrFail({ id: storedTask.id });
      assert.equal(
        taskAfterFailedAcceptance.revision,
        taskBeforeFailedAcceptance.revision,
      );
      assert.equal(
        taskAfterFailedAcceptance.details.brief,
        taskBeforeFailedAcceptance.details.brief,
      );
      assert.equal(
        (
          await originalGetRepository(DeliveryAgentRunEntity).findOneByOrFail({
            id: atomicResult.runId,
          })
        ).status,
        'WAITING_REVIEW',
      );
      await assertActions(atomicResult.runId, successActions);
      await assert.rejects(
        command(admin, {
          type: 'save',
          id: agentId,
          version: 3,
          configuration,
        }),
        /Fixture activity write failure/,
      );
      assert.equal(
        (
          await originalGetRepository(DeliveryAgentEntity).findOneByOrFail({
            id: agentId,
          })
        ).version,
        3,
      );
      await assert.rejects(
        command(admin, {
          ...makeStart(),
          agentId: briefAgent.saved,
          agentVersion: 1,
          requestId,
          taskRevision: (
            await originalGetRepository(DeliveryTaskEntity).findOneByOrFail({
              id: storedTask.id,
            })
          ).revision,
          inputs: { copy: '', requirements: '' },
        }),
        /Fixture activity write failure/,
      );
    } finally {
      runner.manager.getRepository = originalGetRepository;
    }
    assert.equal(
      await runner.manager
        .getRepository(DeliveryAgentRunEntity)
        .countBy({ workspaceId: workspace.id, requestId }),
      0,
    );
    assert.equal(enqueues, enqueueCount);
    const ledger = async (run) =>
      (
        await runner.query(
          'SELECT * FROM core."otogrowAiSpend" WHERE "sourceRunId"=$1',
          [run.runId],
        )
      )[0];
    assert.equal((await ledger(first)).state, 'SETTLED');
    assert.equal((await ledger(first)).actualMicroUsd, '140');
    assert.equal((await ledger(failed)).state, 'UNCERTAIN');
    assert.equal((await ledger(cancelled)).state, 'RELEASED');
    assert.equal((await ledger(inFlight)).state, 'SETTLED');
    assert.equal(
      (await ledger(changedDuringRun)).state,
      'SETTLED',
      'Discarded paid output must still be charged',
    );
    assert.equal((await ledger(stale)).state, 'RELEASED');
    assert.equal((await ledger(revoke)).state, 'RELEASED');
    // Named roles narrow run rights without widening project access or administrator run rights.
    const makeRole = async (name) => (await access.saveRole(workspace.id, admin, admin, {
      name, description: '', capabilities: [],
    })).roles.find((role) => role.name === name);
    const productionRole = await makeRole('Agent production fixture');
    const seoRole = await makeRole('Agent SEO fixture');
    const assign = async (memberId, roleIds) => {
      const directory = await access.directory(workspace.id, admin, admin);
      return access.assignRoles(workspace.id, admin, admin, {
        memberId, roleIds,
        revision: directory.members.find((member) => member.memberId === memberId).revision,
        roleRevisions: directory.roles.filter((role) => roleIds.includes(role.id)).map(({ id, revision }) => ({ id, revision })),
      });
    };
    const namedConfiguration = { ...configuration, name: 'Named role assistant fixture', roleIds: [productionRole.id], dailyRunLimit: 50 };
    await assert.rejects(command(admin, { type: 'save', configuration: {...namedConfiguration, roleIds: [randomUUID()]}}), /unique roles/);
    await assert.rejects(command(admin, { type: 'save', configuration: {...namedConfiguration, roleIds: [productionRole.id, productionRole.id]}}), /unique roles/);
    await assert.rejects(command(admin, { type: 'save', configuration: {...namedConfiguration, roleIds: []}}));
    const namedAgent = await command(admin, { type: 'save', configuration: namedConfiguration });
    const namedPreview = { ...previewInput, agentId: namedAgent.saved };
    await assert.rejects(command(admin, namedPreview), /role and project/);
    await assign(editor, [seoRole.id]);
    await assert.rejects(command(editor, namedPreview), /role and project/);
    await assign(editor, [seoRole.id, productionRole.id]);
    assert((await command(editor, namedPreview)).context);
    await assign(outsider, [productionRole.id]);
    await assert.rejects(command(outsider, namedPreview), /unavailable/);
    const adminCatalog = await service.snapshot(workspace, admin, admin);
    assert(adminCatalog.agents.some((agent) => agent.id === namedAgent.saved));
    assert(!adminCatalog.runnableAgentIds.includes(namedAgent.saved));
    const editorCatalog = await service.snapshot(workspace, editor, editor);
    assert(editorCatalog.runnableAgentIds.includes(namedAgent.saved));
    assert.deepEqual(editorCatalog.actor, { workspaceId: workspace.id, memberId: editor, userWorkspaceId: editor });
    const currentNamedAgent = () => runner.manager.getRepository(DeliveryAgentEntity).findOneByOrFail({ id: namedAgent.saved });
    const startNamed = async () => command(editor, { ...makeStart(), agentId: namedAgent.saved,
      agentVersion: (await currentNamedAgent()).version,
      taskRevision: (await runner.manager.getRepository(DeliveryTaskEntity).findOneByOrFail({ id: storedTask.id })).revision,
    });
    const queuedRevocation = await startNamed();
    await assign(editor, [seoRole.id]);
    const callsBeforeQueuedRevocation = providerCalls;
    await service.execute(queuedRevocation.runId);
    assert.equal(providerCalls, callsBeforeQueuedRevocation);
    assert.equal((await ledger(queuedRevocation)).state, 'RELEASED');
    const revokedCatalog = await service.snapshot(workspace, editor, editor);
    assert(!revokedCatalog.agents.some((agent) => agent.id === namedAgent.saved));
    assert(revokedCatalog.runs.some((run) => run.id === queuedRevocation.runId), 'Keep permitted task history for accountability');
    await assign(editor, [productionRole.id]);
    const dispatchRevocation = await startNamed();
    const namedRoleDispatch = budget.dispatch.bind(budget);
    budget.dispatch = async (...args) => { await assign(editor, []); return namedRoleDispatch(...args); };
    try { await service.execute(dispatchRevocation.runId); } finally { budget.dispatch = namedRoleDispatch; }
    assert.equal(providerCalls, callsBeforeQueuedRevocation);
    assert.equal((await ledger(dispatchRevocation)).state, 'RELEASED');
    await assign(editor, [productionRole.id]);
    behavior = 'success';
    const completionRevocation = await startNamed();
    modelHook = () => assign(editor, []);
    await service.execute(completionRevocation.runId);
    modelHook = null;
    const completionRun = await runner.manager.getRepository(DeliveryAgentRunEntity).findOneByOrFail({ id: completionRevocation.runId });
    assert.equal(completionRun.status, 'FAILED');
    assert.equal(completionRun.result, null);
    assert.equal((await ledger(completionRevocation)).state, 'SETTLED');
    await assign(editor, [productionRole.id]);
    const reviewRevocation = await startNamed();
    await service.execute(reviewRevocation.runId);
    await assign(editor, []);
    await assert.rejects(command(editor, { type: 'decide', runId: reviewRevocation.runId, action: 'ACCEPT', field: 'copy' }), /role and project/);
    await assert.rejects(command(admin, { type: 'decide', runId: reviewRevocation.runId, action: 'ACCEPT', field: null }), /role and project/);
    await command(admin, { type: 'decide', runId: reviewRevocation.runId, action: 'REJECT', field: null });
    await command(admin, { type: 'save', id: namedAgent.saved, version: 1, configuration: { ...configuration, name: namedConfiguration.name } });
    assert.deepEqual((await currentNamedAgent()).configuration.roleIds, [productionRole.id], 'Older saves preserve named role boundaries');
    const namedEvents = await runner.query(`SELECT changes FROM core."otogrowActivityEvent" WHERE "sourceType"='agent' AND "sourceId"=$1`, [namedAgent.saved]);
    assert(namedEvents.some((event) => event.changes.some((change) => change.field === 'agentRoles' && change.after === productionRole.name)));
    await command(admin, { type: 'save', id: namedAgent.saved, version: 2, configuration: { ...namedConfiguration, roleIds: null } });
    assert((await command(editor, namedPreview)).context, 'Explicit legacy mode remains supported');
    const { DeliveryKnowledgeService } = require('../dist/modules/delivery/knowledge/delivery-knowledge.service');
    const knowledge = new DeliveryKnowledgeService(scoped, delivery);
    const meeting = { id: randomUUID(), projectId: project.id, revision: 0, title: 'Meeting fixture', meetingDate: '2026-10-26', sourceUrl: 'https://fathom.video/share/synthetic', transcript: 'Raw private meeting evidence', knowledge: 'Approved brand decision: focus on booked calls.' };
    await knowledge.save(workspace, admin, admin, meeting);
    await knowledge.publish(workspace, admin, admin, { projectId: project.id, id: meeting.id, revision: 1, publish: true });
    const meetingPreview = await command(editor, namedPreview);
    assert.equal(meetingPreview.context.brandKnowledge.sources[0].sourceId, meeting.id);
    assert(!JSON.stringify(meetingPreview.context).includes(meeting.transcript));
    const startWithKnowledge = async () => {
      const fresh = await command(editor, namedPreview);
      return command(editor, { ...makeStart(), agentId: namedAgent.saved, taskRevision: fresh.taskRevision, agentVersion: fresh.agentVersion, knowledgeFingerprint: fresh.context.brandKnowledge.fingerprint });
    };
    const queuedKnowledge = await startWithKnowledge();
    await knowledge.save(workspace, admin, admin, { ...meeting, revision: 2, knowledge: 'Approved new decision: webinar registration.' });
    await knowledge.publish(workspace, admin, admin, { projectId: project.id, id: meeting.id, revision: 3, publish: true });
    await assert.rejects(command(editor, { ...makeStart(), agentId: namedAgent.saved, taskRevision: meetingPreview.taskRevision, agentVersion: meetingPreview.agentVersion, knowledgeFingerprint: meetingPreview.context.brandKnowledge.fingerprint }), /knowledge changed after preview/);
    const beforeKnowledgeCalls = providerCalls;
    await service.execute(queuedKnowledge.runId);
    assert.equal(providerCalls, beforeKnowledgeCalls);
    assert.equal((await ledger(queuedKnowledge)).state, 'RELEASED');
    const reviewKnowledge = await startWithKnowledge();
    await service.execute(reviewKnowledge.runId);
    await knowledge.publish(workspace, admin, admin, { projectId: project.id, id: meeting.id, revision: 4, publish: false });
    await assert.rejects(command(editor, { type: 'decide', runId: reviewKnowledge.runId, action: 'ACCEPT', field: 'copy' }), /brand knowledge changed/);
    await command(editor, { type: 'decide', runId: reviewKnowledge.runId, action: 'REJECT', field: null });
    await knowledge.publish(workspace, admin, admin, { projectId: project.id, id: meeting.id, revision: 5, publish: true });
    const inFlightKnowledge = await startWithKnowledge();
    modelHook = () => knowledge.publish(workspace, admin, admin, { projectId: project.id, id: meeting.id, revision: 6, publish: false });
    try { await service.execute(inFlightKnowledge.runId); } finally { modelHook = null; }
    const discardedKnowledge = await runner.manager.getRepository(DeliveryAgentRunEntity).findOneByOrFail({ id: inFlightKnowledge.runId });
    assert.equal(discardedKnowledge.status, 'FAILED');
    assert.equal(discardedKnowledge.result, null);
    assert.equal((await ledger(inFlightKnowledge)).state, 'SETTLED');
    assert(enqueues > 0);
    report(
      'PASS: meeting context inclusion and raw-note exclusion, preview/queued/in-flight/acceptance freshness; named-role unions, project/admin boundaries, queued/dispatch/completion/acceptance revocation, legacy preservation, role activity; fixture SDK execution, persisted review, scoped permissions, revoked access/model, idempotency, accept/reject, failure, queued/in-flight cancellation, stale revision, daily limits, aborted timeouts, outbox recovery, real Redis queue processing, safe transactional activity, initiator/agent/system attribution and rollback on activity-write failure. All fixtures rolled back.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  report(
    process.argv.includes('--live')
      ? 'Live check failed; inspect the sanitized run output above.'
      : error,
  );
  process.exitCode = 1;
});

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MockLanguageModelV3 } = require('ai/test');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  originalDigest,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const { createFixture } = require('./check-delivery-reconciliation.cjs');
const {
  seedCurrentWorkFixture,
  syntheticCurrentWork,
} = require('./check-otogrow-activity-current-work-support.cjs');
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryNativeTaskAccessService,
} = require('../dist/modules/delivery/delivery-native-task-access.service');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryAgentService,
} = require('../dist/modules/delivery/agents/delivery-agent.service');
const {
  DeliveryAssistantsService,
} = require('../dist/modules/delivery/agents/reads/delivery-assistants.service');
const {
  DeliveryAgentRunEntity,
} = require('../dist/modules/delivery/entities/delivery-agent-run.entity');

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This proof has no live or persistent mode.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  let runner, original, schema;
  let providerCalls = 0;
  const checks = [];
  try {
    await connectionSource.initialize();
    original = await originalDigest((...args) =>
      connectionSource.query(...args),
    );
    schema = await schemaFingerprint(connectionSource);
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const manager = runner.manager;
    const fixture = await createFixture(manager, 'native_agents_rollback');
    await seedCurrentWorkFixture(manager, fixture);
    await manager.query(
      `ALTER TABLE "${fixture.schemaName}".task ADD COLUMN "createdAt" timestamptz NOT NULL DEFAULT now()`,
    );
    for (const [key, taskId] of Object.entries(fixture.currentTasks)) {
      await manager.query(
        'UPDATE core."deliveryTask" SET details=$2 WHERE "taskId"=$1',
        [
          taskId,
          {
            brief: `FIXTURE ${key} private brief`,
            service: 'Design',
            priority: 'NORMAL',
            scheduledDate: null,
            reviewerId: fixture.people.reader.memberId,
            state: 'PLANNED',
            blocker: '',
            checklist: [],
            evidence: [],
            submissions: [],
            events: [],
          },
        ],
      );
    }
    const source = {
      manager,
      query: (...args) => manager.query(...args),
      getRepository: (entity) => manager.getRepository(entity),
      transaction: (operation) => manager.transaction(operation),
    };
    const access = new OtogrowAccessService(source, {
      userHasWorkspaceSettingPermission: async ({
        workspaceId,
        userWorkspaceId,
      }) =>
        workspaceId === fixture.workspaceId &&
        userWorkspaceId === fixture.people.admin.userWorkspaceId,
    });
    const native = syntheticCurrentWork(access, fixture);
    const metadata = native.native;
    const createdAtId = randomUUID();
    metadata.taskFields.push({
      ...metadata.taskFields[1],
      id: createdAtId,
      universalIdentifier: createdAtId,
      name: 'createdAt',
      type: 'DATE_TIME',
    });
    metadata.taskObject.fieldIds.push(createdAtId);
    metadata.taskObject.fieldUniversalIdentifiers.push(createdAtId);
    metadata.data.flatFieldMetadataMaps = metadata.maps([
      ...metadata.taskFields,
      ...metadata.memberFields,
    ]);
    const permission = () =>
      metadata.data.rolesPermissions[fixture.nativeRoleId][
        metadata.taskObject.id
      ];
    const adapter = new DeliveryNativeTaskAccessService(
      native.workspaceOrm,
      native.cache,
    );
    const delivery = new DeliveryService(source, access, adapter);
    const modelId = 'fixture/native-assistants';
    let providerHook = null;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        providerCalls++;
        if (providerHook) await providerHook();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                summary: 'FIXTURE reviewed supplied text only',
                findings: [],
                suggestedBrief: 'FIXTURE proposed brief',
                suggestedCopy: null,
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
    const registry = {
      getModel: (id) => (id === modelId ? { modelId, model } : undefined),
      getAdminFilteredModels: () => [
        { modelId, providerName: 'Isolated SDK fixture' },
      ],
      validateModelAvailability: (id) => assert.equal(id, modelId),
    };
    const budget = await makeBudgetFixture(source, access, fixture.workspace, [
      { modelId, kind: 'TEXT' },
    ]);
    let enqueues = 0;
    const agents = new DeliveryAgentService(
      source,
      delivery,
      registry,
      {
        add: async () => {
          enqueues++;
        },
      },
      budget,
      access,
      adapter,
    );
    const reads = new DeliveryAssistantsService(
      source,
      delivery,
      agents,
      registry,
      adapter,
    );
    const admin = fixture.people.admin;
    const writer = fixture.people.writer;
    const visible = fixture.currentTasks.inProgress;
    const hidden = fixture.currentTasks.hidden;
    const command = (input, person = admin) =>
      agents.command(
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const call = (method, input, person = admin) =>
      reads[method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
        manager,
      );
    const configuration = {
      name: 'FIXTURE native brief assistant',
      purpose: 'Rollback-only native access proof',
      kind: 'BRIEF',
      enabled: true,
      instructions: 'Use only fixture evidence.',
      requiredInputs: ['brief'],
      outputFormat: 'findings_and_edits',
      tools: [],
      modelId,
      projectIds: [fixture.projects.first],
      roles: ['ADMIN', 'MANAGER', 'MEMBER'],
      roleIds: null,
      dailyRunLimit: 100,
      maxOutputTokens: 512,
      humanConfirmation: true,
    };
    const saved = await command({
      type: 'save',
      createId: randomUUID(),
      configuration,
    });
    const agentId = saved.saved;
    const history = [];
    for (const [index, taskId] of [
      visible,
      visible,
      hidden,
      hidden,
      fixture.currentTasks.deleted,
    ].entries()) {
      const run = await manager.getRepository(DeliveryAgentRunEntity).save({
        workspaceId: fixture.workspaceId,
        id: randomUUID(),
        requestId: randomUUID(),
        taskId,
        agentId,
        initiatorId: admin.memberId,
        userWorkspaceId: admin.userWorkspaceId,
        taskRevision: 1,
        agentVersion: 1,
        configuration,
        context: {
          title:
            taskId === hidden ? 'PRIVATE_HIDDEN_RUN' : 'FIXTURE visible run',
          brief: 'PRIVATE_RUN_BRIEF',
          service: 'Design',
          checklist: [],
          submittedCopy: '',
          evidenceLinks: [],
          inputs: { copy: '', requirements: '' },
        },
        status: 'WAITING_REVIEW',
        result: {
          summary: 'PRIVATE_RUN_RESULT',
          findings: [],
          suggestedBrief: 'FIXTURE proposed brief',
          suggestedCopy: null,
        },
        activity: [],
        usage: null,
        error: null,
        decision: null,
        createdAt: new Date(
          `2020-02-${String(20 + index).padStart(2, '0')}T09:00:00Z`,
        ),
      });
      history.push(run);
    }
    const start = async (person = writer) => {
      const input = {
        taskId: visible,
        agentId,
        inputs: { copy: '', requirements: '' },
      };
      const preview = await command({ type: 'preview', ...input }, person);
      assert.equal(preview.budget.budgetReady, true);
      return command(
        {
          type: 'start',
          ...input,
          requestId: randomUUID(),
          taskRevision: preview.taskRevision,
          agentVersion: preview.agentVersion,
          pricingRevision: preview.budget.pricingRevision,
          knowledgeFingerprint: preview.context.brandKnowledge?.fingerprint,
        },
        person,
      );
    };
    const readRun = (runId) =>
      manager
        .getRepository(DeliveryAgentRunEntity)
        .findOneByOrFail({ workspaceId: fixture.workspaceId, id: runId });
    const ledger = async (runId) => {
      const [spend] = await manager.query(
        'SELECT * FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND "sourceKind"=\'TASK_AGENT\' AND "sourceRunId"=$2',
        [fixture.workspaceId, runId],
      );
      assert(spend);
      return spend;
    };
    const originalDispatch = budget.dispatch.bind(budget);
    const isolated = async (operation) => {
      await manager.query('SAVEPOINT native_assistants_case');
      const originalData = structuredClone(metadata.data);
      try {
        await operation();
      } finally {
        await manager.query('ROLLBACK TO SAVEPOINT native_assistants_case');
        await manager.query('RELEASE SAVEPOINT native_assistants_case');
        for (const key of Object.keys(metadata.data))
          metadata.data[key] = originalData[key];
        native.state.changingHash = false;
        providerHook = null;
        budget.dispatch = originalDispatch;
      }
    };
    const check = async (name, operation) => {
      await isolated(operation);
      checks.push(name);
    };
    const deniedUnchanged = async (
      operation,
      message = /native|task|access|permission|changed|first page/i,
    ) => {
      const before = await originalDigest((...args) => manager.query(...args));
      await assert.rejects(operation, message);
      assert.equal(
        await originalDigest((...args) => manager.query(...args)),
        before,
        'Denied access changed database rows.',
      );
    };

    await check(
      'Real native row filters precede history totals, status counts and paging',
      async () => {
        const first = await call('runs', { limit: 1 });
        assert.equal(first.totalCount, 2);
        assert.deepEqual(first.byStatus, [
          { status: 'WAITING_REVIEW', count: 2 },
        ]);
        assert.equal(first.items.length, 1);
        assert(first.nextCursor);
        const second = await call('runs', {
          limit: 1,
          after: first.nextCursor,
        });
        assert.equal(second.items.length, 1);
        assert.notEqual(first.items[0].id, second.items[0].id);
        assert.equal(second.nextCursor, null);
        assert.deepEqual(
          new Set([...first.items, ...second.items].map(({ id }) => id)),
          new Set(history.slice(0, 2).map(({ id }) => id)),
        );
        assert(!JSON.stringify(first).includes('PRIVATE_'));
        const legacy = await agents.snapshot(
          fixture.workspace,
          admin.memberId,
          admin.userWorkspaceId,
        );
        assert.deepEqual(
          new Set(legacy.runs.map(({ id }) => id)),
          new Set(history.slice(0, 2).map(({ id }) => id)),
        );
        assert(!JSON.stringify(legacy).includes('PRIVATE_HIDDEN_RUN'));
      },
    );
    await check(
      'Exact task, hidden run and request recovery cannot bypass native rows',
      async () => {
        assert.equal(
          (await call('context', { taskId: visible })).selectedTask.id,
          visible,
        );
        assert.equal(
          (await call('run', { runId: history[0].id })).context.brief,
          'PRIVATE_RUN_BRIEF',
        );
        assert.equal(
          (await call('request', { requestId: history[0].requestId })).receipt
            .runId,
          history[0].id,
        );
        await deniedUnchanged(() => call('context', { taskId: hidden }));
        await deniedUnchanged(() => call('run', { runId: history[2].id }));
        assert.equal(
          (await call('request', { requestId: history[2].requestId })).receipt,
          null,
        );
        await deniedUnchanged(() =>
          command({ type: 'preview', taskId: hidden, agentId, inputs: {} }),
        );
      },
    );
    await check(
      'Native object denial closes task-bearing reads and decisions while taskless setup stays usable',
      async () => {
        permission().canReadObjectRecords = false;
        assert.equal((await call('context', {})).selectedTask, null);
        assert.equal((await call('configuration', { agentId })).id, agentId);
        assert.equal((await call('catalog', {})).items.length, 1);
        for (const [method, input] of [
          ['context', { taskId: visible }],
          ['runs', {}],
          ['run', { runId: history[0].id }],
          ['request', { requestId: history[0].requestId }],
        ]) {
          await deniedUnchanged(() => call(method, input));
        }
        await deniedUnchanged(() =>
          command({
            type: 'decide',
            runId: history[0].id,
            action: 'ACCEPT',
            field: 'brief',
          }),
        );
      },
    );
    await check(
      'Native title-field denial blocks context, history and exact request receipts',
      async () => {
        permission().restrictedFields[
          metadata.taskFields.find(({ name }) => name === 'title').id
        ] = { canRead: false, canUpdate: false };
        for (const [method, input] of [
          ['context', { taskId: visible }],
          ['runs', {}],
          ['run', { runId: history[0].id }],
          ['request', { requestId: history[0].requestId }],
        ])
          await deniedUnchanged(() => call(method, input));
      },
    );
    await check(
      'Native policy changes invalidate a history cursor before serving the next page',
      async () => {
        const first = await call('runs', { limit: 1 });
        assert(first.nextCursor);
        const predicate = Object.values(
          metadata.data.flatRowLevelPermissionPredicateMaps
            .byUniversalIdentifier,
        )[0];
        predicate.value = 'Visible FIXTURE';
        await deniedUnchanged(() =>
          call('runs', { limit: 1, after: first.nextCursor }),
        );
      },
    );
    await check(
      'A stale native role cache is an error, never an empty accessible history',
      async () => {
        metadata.data.userWorkspaceRoleMap[admin.userWorkspaceId] =
          randomUUID();
        await deniedUnchanged(() => call('runs', {}));
      },
    );
    await check(
      'Worker uses its recorded initiator, not a still-authorized administrator',
      async () => {
        const started = await start();
        const before = providerCalls;
        await manager.query(
          'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
          [writer.userWorkspaceId],
        );
        assert.equal(
          (await call('context', { taskId: visible })).selectedTask.id,
          visible,
        );
        await agents.execute(started.runId);
        assert.equal(providerCalls, before);
        assert.equal((await readRun(started.runId)).status, 'FAILED');
        assert.equal((await ledger(started.runId)).state, 'RELEASED');
      },
    );
    await check(
      'Native revocation before execution releases reservation without SDK transport',
      async () => {
        const started = await start();
        const before = providerCalls;
        permission().canReadObjectRecords = false;
        await agents.execute(started.runId);
        const result = await readRun(started.runId);
        assert.equal(providerCalls, before);
        assert.equal(result.status, 'FAILED');
        assert.equal(result.result, null);
        assert.equal((await ledger(started.runId)).state, 'RELEASED');
      },
    );
    await check(
      'Native revocation at paid dispatch prevents SDK work and releases its reservation',
      async () => {
        const started = await start();
        const before = providerCalls;
        budget.dispatch = async (...args) => {
          permission().canReadObjectRecords = false;
          return originalDispatch(...args);
        };
        await agents.execute(started.runId);
        assert.equal(providerCalls, before);
        assert.equal((await readRun(started.runId)).status, 'FAILED');
        assert.equal((await ledger(started.runId)).state, 'RELEASED');
      },
    );
    await check(
      'Native revocation after SDK completion preserves actual accounting and withholds output',
      async () => {
        const started = await start();
        const before = providerCalls;
        providerHook = async () => {
          permission().canReadObjectRecords = false;
        };
        await agents.execute(started.runId);
        assert.equal(providerCalls, before + 1);
        const result = await readRun(started.runId);
        assert.equal(result.status, 'FAILED');
        assert.equal(result.result, null);
        assert.equal((await ledger(started.runId)).state, 'SETTLED');
        assert.equal((await ledger(started.runId)).actualMicroUsd, '140');
        await deniedUnchanged(() =>
          call('run', { runId: started.runId }, writer),
        );
      },
    );
    await check(
      'Exact typed cancellation commits once after native revocation while its receipt stays private',
      async () => {
        const started = await start();
        const run = await readRun(started.runId);
        permission().canReadObjectRecords = false;
        await assert.rejects(
          () => call('cancel', { runId: started.runId }, writer),
          /native|task|permission/i,
        );
        assert.equal((await readRun(started.runId)).status, 'CANCELLED');
        const spend = await ledger(started.runId);
        assert.equal(spend.state, 'RELEASED');
        const [stops] = await manager.query(
          'SELECT count(*)::int AS count FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 AND "spendId"=$2 AND action=\'RELEASED\'',
          [fixture.workspaceId, spend.id],
        );
        assert.equal(stops.count, 1);
        await deniedUnchanged(() =>
          call('request', { requestId: run.requestId }, writer),
        );
        await deniedUnchanged(() => call('run', { runId: run.id }, writer));
      },
    );
    await check(
      'In-flight cancellation under native revocation settles usage without reviving output',
      async () => {
        const started = await start();
        providerHook = async () => {
          permission().canReadObjectRecords = false;
          await assert.rejects(
            () => call('cancel', { runId: started.runId }, writer),
            /native|task|permission/i,
          );
        };
        await agents.execute(started.runId);
        const result = await readRun(started.runId);
        assert.equal(result.status, 'CANCELLED');
        assert.equal(result.result, null);
        assert.equal((await ledger(started.runId)).state, 'SETTLED');
        assert.equal((await ledger(started.runId)).actualMicroUsd, '140');
      },
    );
    await check(
      'Allowed SDK completion produces a reviewable result with separate human acceptance',
      async () => {
        permission().canUpdateObjectRecords = false;
        const started = await start();
        await agents.execute(started.runId);
        const result = await call('run', { runId: started.runId });
        assert.equal(result.run.status, 'WAITING_REVIEW');
        assert.equal(result.result.suggestedBrief, 'FIXTURE proposed brief');
        assert.equal(result.decision, null);
        await command({
          type: 'decide',
          runId: started.runId,
          action: 'ACCEPT',
          field: 'brief',
        });
        const [task] = await manager.query(
          'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
          [fixture.workspaceId, visible],
        );
        assert.equal(task.details.brief, 'FIXTURE proposed brief');
        assert.equal(task.details.state, 'PLANNED');
        assert.equal((await ledger(started.runId)).state, 'SETTLED');
      },
    );
    assert.equal(providerCalls, 3);
    assert.equal(enqueues, 7);
    await runner.rollbackTransaction();
  } finally {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
    try {
      if (connectionSource.isInitialized && original)
        assert.equal(
          await originalDigest((...args) => connectionSource.query(...args)),
          original,
          'Original database rows changed.',
        );
      if (connectionSource.isInitialized && schema)
        assert.equal(
          await schemaFingerprint(connectionSource),
          schema,
          'Original schema changed.',
        );
    } finally {
      if (connectionSource.isInitialized) await connectionSource.destroy();
    }
  }
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        checks: checks.length,
        evidence: checks,
        mockedSdkCalls: providerCalls,
        preservation:
          'Real native permission engine and PostgreSQL; isolated native cache and SDK transport only. All fixture data/schema rolled back and originals preserved. No provider, network or shared-cache writes. One-connection serialized proof; no cross-session race claim.',
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

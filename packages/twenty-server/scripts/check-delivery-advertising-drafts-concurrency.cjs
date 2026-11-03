const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { dirname } = require('node:path');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  TABLES,
  seedAdvertisingFixture,
  advertisingServices,
  newReviewInput,
} = require('./check-delivery-advertising-support.cjs');
const {
  REVIEW_TABLES,
  SOURCE_TABLES,
  cleanupReviewFixture,
} = require('./check-delivery-creative-review-support.cjs');

const { MockLanguageModelV3 } = require('ai/test');
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const {
  DeliveryAdvertisingDraftService,
} = require('../dist/modules/delivery/advertising/drafts/delivery-advertising-draft.service');
const {
  DeliveryAgentEntity,
} = require('../dist/modules/delivery/entities/delivery-agent.entity');
const {
  OtogrowAiBudgetService,
} = require('../dist/modules/otogrow-ai-budget/otogrow-ai-budget.service');
const {
  usdToMicro,
} = require('../dist/modules/otogrow-ai-budget/otogrow-ai-budget.policy');
const FILE = '/tmp/otogrow-advertising-drafts-concurrency-fixture.json';
const OWNED_TABLES = [
  'otogrowAiSpendEvent',
  'otogrowAiSpend',
  'otogrowAiBudget',
  'otogrowAiPrice',
  'deliveryAdvertisingDraftRun',
  'deliveryAgent',
];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PROTECTED_TABLES = [
  ...new Set([
    ...OWNED_TABLES,
    ...TABLES,
    ...REVIEW_TABLES,
    ...SOURCE_TABLES,
    'deliveryOperations',
    'otogrowActivityEvent',
    'otogrowRole',
    'otogrowRoleAssignment',
    'otogrowMemberAccess',
    'otogrowAccessEvent',
    'userWorkspace',
  ]),
];
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function bounded(promise, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(label)), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
function syncDirectory(path) {
  const descriptor = openSync(dirname(path), 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function journal(value, destination = FILE, initial = false) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(value));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    if (initial) {
      linkSync(temporary, destination);
      unlinkSync(temporary);
    } else renameSync(temporary, destination);
    syncDirectory(destination);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}
function readJournal() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, 'advertising-drafts-concurrency-v1');
  for (const value of [
    fixture.workspaceId,
    fixture.foreignWorkspaceId,
    fixture.taskId,
    fixture.otherTaskId,
    fixture.foreignTaskId,
    ...Object.values(fixture.people).flatMap((person) => [
      person.userId,
      person.memberId,
      person.userWorkspaceId,
    ]),
  ])
    assert.match(value, UUID);
  assert.equal(
    fixture.schemaName,
    `creative_review_rollback_${fixture.workspaceId.replaceAll('-', '_')}`,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  assert.match(fixture.agentId, UUID);
  assert.match(fixture.budgetId, UUID);
  assert.match(fixture.priceId, UUID);
  assert.equal(
    fixture.modelId,
    `synthetic-advertising-race-${fixture.workspaceId}`,
  );
  assert(Array.isArray(fixture.plannedRuns));
  for (const planned of fixture.plannedRuns) {
    assert.match(planned.id, UUID);
    assert.match(planned.requestId, UUID);
    assert.match(planned.initiatorId, UUID);
  }
  assert.equal(
    new Set(fixture.plannedRuns.map((run) => run.id)).size,
    fixture.plannedRuns.length,
  );
  return fixture;
}
async function protectedRows(manager, fixture) {
  const result = {};
  for (const table of PROTECTED_TABLES) {
    const row =
      table === 'deliveryOperations'
        ? `(to_jsonb(t)-'updatedAt') #- '{state,metaReporting,workerSeenAt}'`
        : 'to_jsonb(t)';
    [result[table]] = await manager.query(
      `SELECT count(*)::text AS count,md5(coalesce(string_agg(row::text,E'\\n' ORDER BY row::text),'')) AS hash FROM (SELECT ${row} AS row FROM core."${table}" t WHERE "workspaceId"<>ALL($1::uuid[])) rows`,
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
  }
  for (const table of ['workspace', 'user']) {
    const ids =
      table === 'workspace'
        ? [fixture.workspaceId, fixture.foreignWorkspaceId]
        : Object.values(fixture.people).map((person) => person.userId);
    [result[table]] = await manager.query(
      `SELECT count(*)::text AS count,md5(coalesce(string_agg(row::text,E'\\n' ORDER BY row::text),'')) AS hash FROM (SELECT to_jsonb(t) AS row FROM core."${table}" t WHERE id<>ALL($1::uuid[])) rows`,
      [ids],
    );
  }
  return result;
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='5s'");
    await manager.query("SET LOCAL statement_timeout='30s'");
    const ids = [fixture.workspaceId, fixture.foreignWorkspaceId];
    for (const id of [...ids].sort())
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${id}`],
      );
    const rows = await manager.query(
      'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
      [ids],
    );
    if (rows.length) {
      assert.equal(rows.length, 2);
      for (const row of rows) {
        assert.equal(row.displayName, fixture.sentinel);
        assert.equal(row.databaseSchema, fixture.schemaName);
      }
      const [schema] = await manager.query(
        "SELECT obj_description(oid,'pg_namespace') AS sentinel FROM pg_namespace WHERE nspname=$1",
        [fixture.schemaName],
      );
      assert.equal(schema?.sentinel, fixture.sentinel);
      const runs = await manager.query(
        'SELECT id,"requestId","initiatorId","agentId",agent FROM core."deliveryAdvertisingDraftRun" WHERE "workspaceId"=ANY($1::uuid[])',
        [ids],
      );
      for (const run of runs) {
        const planned = fixture.plannedRuns.find(
          (value) => value.id === run.id,
        );
        assert(planned, 'Refuse cleanup of an unjournalled AI run.');
        assert.equal(run.requestId, planned.requestId);
        assert.equal(run.initiatorId, planned.initiatorId);
        assert.equal(run.agentId, fixture.agentId);
        assert.equal(run.agent.modelId, fixture.modelId);
      }
      const spends = await manager.query(
        'SELECT id,"sourceKind","sourceRunId",price FROM core."otogrowAiSpend" WHERE "workspaceId"=ANY($1::uuid[])',
        [ids],
      );
      for (const spend of spends) {
        assert.equal(spend.sourceKind, 'ADVERTISING_DRAFT');
        assert(
          runs.some((run) => run.id === spend.sourceRunId),
          'Spend must belong to an owned run.',
        );
        assert.equal(spend.price.modelId, fixture.modelId);
      }
      const spendIds = new Set(spends.map((spend) => spend.id));
      const events = await manager.query(
        'SELECT "spendId" FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=ANY($1::uuid[])',
        [ids],
      );
      assert(
        events.every((event) => event.spendId && spendIds.has(event.spendId)),
        'Unexpected standalone financial event in fixture.',
      );
      for (const [table, expectedId] of [
        ['deliveryAgent', fixture.agentId],
        ['otogrowAiBudget', fixture.budgetId],
        ['otogrowAiPrice', fixture.priceId],
      ]) {
        const actual = await manager.query(
          `SELECT id FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
          [ids],
        );
        assert.deepEqual(
          actual.map((row) => row.id),
          [expectedId],
          `Unexpected ${table} row in fixture.`,
        );
      }
      const tasks = await manager.query(
        'SELECT "taskId" FROM core."deliveryAdvertisingAction" WHERE "workspaceId"=ANY($1::uuid[]) AND "taskId" IS NOT NULL',
        [ids],
      );
      const expectedIds = new Set([
        fixture.taskId,
        fixture.otherTaskId,
        fixture.foreignTaskId,
        ...tasks.map((task) => task.taskId),
      ]);
      const native = await manager.query(
        `SELECT id FROM "${fixture.schemaName}".task`,
      );
      assert.equal(
        native.length,
        expectedIds.size,
        'Refusing cleanup of untracked native tasks.',
      );
      assert(native.every((task) => expectedIds.has(task.id)));
      for (const table of [...OWNED_TABLES, ...TABLES])
        await manager.query(
          `DELETE FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
          [ids],
        );
      await manager.query(
        'DELETE FROM core."deliveryMetaReport" WHERE "workspaceId"=ANY($1::uuid[])',
        [ids],
      );
      await manager.query(
        'DELETE FROM core."deliveryTask" WHERE "workspaceId"=ANY($1::uuid[]) AND "taskId"=ANY($2::uuid[])',
        [ids, tasks.map((task) => task.taskId)],
      );
      await cleanupReviewFixture(manager, fixture);
    }
    for (const table of PROTECTED_TABLES) {
      const [{ count }] = await manager.query(
        `SELECT count(*)::int AS count FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
        [ids],
      );
      assert.equal(count, 0, `Cleanup left ${table}.`);
    }
    assert.equal(
      (
        await manager.query('SELECT to_regnamespace($1)::text AS schema', [
          fixture.schemaName,
        ])
      )[0].schema,
      null,
    );
    assert.equal(
      (
        await manager.query(
          'SELECT count(*)::int AS count FROM core."user" WHERE id=ANY($1::uuid[])',
          [Object.values(fixture.people).map((person) => person.userId)],
        )
      )[0].count,
      0,
    );
    if (fixture.protectedBefore)
      assert.deepEqual(
        await protectedRows(manager, fixture),
        fixture.protectedBefore,
        'Unrelated workspace, staff, financial or delivery rows changed.',
      );
  });
  const receipt = `${FILE}.${fixture.workspaceId}.cleaned.json`;
  const value = {
    checker: fixture.checker,
    workspaceId: fixture.workspaceId,
    foreignWorkspaceId: fixture.foreignWorkspaceId,
    schemaName: fixture.schemaName,
    sentinel: fixture.sentinel,
    cleaned: true,
  };
  if (existsSync(receipt))
    assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), value);
  else journal(value, receipt, true);
  if (existsSync(FILE)) {
    assert.equal(readJournal().workspaceId, fixture.workspaceId);
    unlinkSync(FILE);
    syncDirectory(FILE);
  }
}

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Local database only.',
  );
  if (process.argv.length === 3) {
    assert.equal(process.argv[2], 'cleanup');
    await connectionSource.initialize();
    try {
      await cleanup(readJournal());
      console.log(
        'Recovered only the ownership-verified advertising draft concurrency fixture.',
      );
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  assert.equal(process.argv.length, 2);
  assert(
    !existsSync(FILE),
    `Recover ${FILE} with this checker’s cleanup command first.`,
  );
  const name = `advertising-draft-race:${randomUUID()}`;
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${name}:${index}`,
        },
      }),
  );
  const pending = [],
    blockers = [],
    sessions = [null, null],
    locks = [[], []];
  let fixture,
    barrier = null,
    providerHold = null,
    providerCalls = 0,
    networkCalls = 0;
  const queueJobs = new Map();
  const originalFetch = global.fetch;
  global.fetch = async () => {
    networkCalls++;
    throw new Error(
      'Network is forbidden in advertising draft concurrency acceptance.',
    );
  };
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const scoped = sources.map((source, index) => ({
    manager: source.manager,
    query: (...arguments_) => source.query(...arguments_),
    getRepository: (entity) => source.getRepository(entity),
    transaction: (operation) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='10s'");
        await manager.query("SET LOCAL statement_timeout='20s'");
        [sessions[index]] = await manager.query(
          'SELECT pg_backend_pid() AS pid,txid_current()::text AS transaction',
        );
        const query = manager.query.bind(manager);
        manager.query = async (...arguments_) => {
          if (arguments_[0].includes('pg_advisory_xact_lock'))
            locks[index].push(arguments_[0]);
          return query(...arguments_);
        };
        const current = barrier;
        if (current) {
          current.arrivals.set(index, { ...sessions[index] });
          if (current.arrivals.size === 2) {
            barrier = null;
            current.ready.resolve();
          }
          await bounded(
            current.ready.promise,
            'Both independent sessions must reach the transaction barrier.',
          );
        }
        try {
          return await operation(manager);
        } finally {
          manager.query = query;
        }
      }),
  }));
  const paired = async (first, second) => {
    locks[0] = [];
    locks[1] = [];
    const current = { arrivals: new Map(), ready: deferred() };
    barrier = current;
    const result = await bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Independent drafting commands did not settle.',
    );
    assert.equal(current.arrivals.size, 2);
    assert.notEqual(current.arrivals.get(0).pid, current.arrivals.get(1).pid);
    assert.notEqual(
      current.arrivals.get(0).transaction,
      current.arrivals.get(1).transaction,
    );
    for (const log of locks)
      assert(
        log[0]?.includes('pg_advisory_xact_lock('),
        'Mutation acquires the exclusive workspace lock before budget/knowledge locks.',
      );
    return result;
  };
  const waitForBlocked = async (index, blockerPid) => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      if (sessions[index]) {
        const [state] = await connectionSource.query(
          'SELECT wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',
          [sessions[index].pid],
        );
        if (
          state?.wait_event === 'advisory' &&
          state.blockers.includes(blockerPid)
        )
          return;
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(
      'The command did not demonstrably wait behind the workspace lock.',
    );
  };
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    const [{ count: active }] = await connectionSource.query(
      "SELECT count(*)::integer AS count FROM core.\"deliveryAdvertisingDraftRun\" WHERE status IN ('QUEUED','RUNNING')",
    );
    assert.equal(
      active,
      0,
      'Pause workers and finish original active advertising runs before this isolated acceptance proof.',
    );
    await connectionSource.transaction(async (manager) => {
      fixture = await seedAdvertisingFixture(manager);
      fixture.checker = 'advertising-drafts-concurrency-v1';
      fixture.modelId = `synthetic-advertising-race-${fixture.workspaceId}`;
      fixture.agentId = randomUUID();
      fixture.plannedRuns = [];
      const seedSource = {
        manager,
        getRepository: (entity) => manager.getRepository(entity),
        query: (...arguments_) => manager.query(...arguments_),
        transaction: (operation) => manager.transaction(operation),
      };
      const services = advertisingServices(seedSource, fixture);
      await makeBudgetFixture(seedSource, services.access, fixture.workspace, [
        { modelId: fixture.modelId, kind: 'TEXT' },
      ]);
      const [budget] = await manager.query(
        'SELECT id FROM core."otogrowAiBudget" WHERE "workspaceId"=$1',
        [fixture.workspaceId],
      );
      const [price] = await manager.query(
        'SELECT id FROM core."otogrowAiPrice" WHERE "workspaceId"=$1',
        [fixture.workspaceId],
      );
      fixture.budgetId = budget.id;
      fixture.priceId = price.id;
      await manager.getRepository(DeliveryAgentEntity).insert({
        id: fixture.agentId,
        workspaceId: fixture.workspaceId,
        version: 1,
        configuration: {
          name: 'Synthetic concurrent advertising suggestions',
          purpose: 'In-process model acceptance only',
          kind: 'ADVERTISING',
          enabled: true,
          instructions:
            'Use only supplied account totals; every claim is for human review.',
          requiredInputs: ['report'],
          outputFormat: 'recommendations',
          tools: [],
          modelId: fixture.modelId,
          projectIds: [fixture.projects.first],
          roles: ['ADMIN', 'MANAGER'],
          roleIds: null,
          dailyRunLimit: 200,
          maxOutputTokens: 1024,
          humanConfirmation: true,
        },
      });
      fixture.protectedBefore = await protectedRows(manager, fixture);
      // The private durable ownership record precedes commit, including an unknown commit outcome.
      journal(fixture, FILE, true);
    });
    const model = new MockLanguageModelV3({
      doGenerate: async (request) => {
        providerCalls++;
        assert(JSON.stringify(request.prompt).includes('ACCOUNT_TOTALS_ONLY'));
        assert(!JSON.stringify(request.prompt).includes('marketerId'));
        const hold = providerHold;
        if (hold) {
          hold.entered.resolve();
          await bounded(
            hold.release.promise,
            'Synthetic inference was not released.',
          );
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                summary: 'Synthetic evidence review proposal.',
                limitations: ['Account totals cannot identify a winning ad.'],
                citations: ['report:scope'],
                noChangeReason: null,
                suggestions: [
                  {
                    title: 'Inspect the offer evidence',
                    rationale: 'Review a proposed test with the manager.',
                    expectedResult:
                      'Gather later observed results without predicting a lift.',
                    evidence: 'Only the supplied account report was reviewed.',
                    citations: ['report:scope'],
                  },
                ],
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
      getModel: (id) =>
        id === fixture.modelId ? { model, modelId: id } : undefined,
      validateModelAvailability: (id, workspace) => {
        assert.equal(id, fixture.modelId);
        assert.equal(workspace.id, fixture.workspaceId);
      },
    };
    const queue = {
      add: async (job, input, options) => {
        assert.equal(job, 'delivery-advertising-draft');
        assert.equal(options.id, `advertising-draft-${input.runId}`);
        assert(
          fixture.plannedRuns.some((run) => run.id === input.runId),
          'Only a prejournalled run can enter the mock queue.',
        );
        const [saved] = await connectionSource.query(
          'SELECT id FROM core."deliveryAdvertisingDraftRun" WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, input.runId],
        );
        assert(saved, 'Enqueue occurs after the run and reservation commit.');
        queueJobs.set(options.id, input.runId);
      },
    };
    const services = scoped.map((source) =>
      advertisingServices(source, fixture),
    );
    const budgets = scoped.map(
      (source, index) =>
        new OtogrowAiBudgetService(source, services[index].access),
    );
    const drafts = scoped.map(
      (source, index) =>
        new DeliveryAdvertisingDraftService(
          source,
          services[index].delivery,
          services[index].sources,
          registry,
          queue,
          budgets[index],
          services[index].access,
        ),
    );
    const call = (index, method, input, person = fixture.people.admin) =>
      drafts[index][method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const plan = (command, person) => {
      assert(!fixture.plannedRuns.some((run) => run.id === command.id));
      fixture.plannedRuns.push({
        id: command.id,
        requestId: command.requestId,
        initiatorId: person.memberId,
      });
      journal(fixture);
      return command;
    };
    const prepare = async (reportIndex, person = fixture.people.admin) => {
      const source = await services[0].workbench.source(
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        { kind: 'META', id: fixture.metaReports[reportIndex].id },
      );
      const body = {
        sourceKind: 'META',
        sourceId: source.source.id,
        sourceFingerprint: source.fingerprint,
        agentId: fixture.agentId,
        goal: newReviewInput(fixture, source).goal,
        instructions: 'Synthetic account-total recommendations.',
      };
      const preview = await call(0, 'preview', body, person);
      assert.equal(preview.budget.budgetReady, true);
      const command = {
        ...body,
        id: randomUUID(),
        requestId: randomUUID(),
        bodyFingerprint: preview.bodyFingerprint,
        contextFingerprint: preview.contextFingerprint,
        agentVersion: preview.agent.version,
        knowledgeFingerprint: preview.knowledgeFingerprint,
        pricingRevision: preview.budget.pricingRevision,
      };
      return { command: plan(command, person), preview };
    };
    const stored = async (id) =>
      (
        await connectionSource.query(
          'SELECT * FROM core."deliveryAdvertisingDraftRun" WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, id],
        )
      )[0];
    const spend = async (id) =>
      (
        await connectionSource.query(
          'SELECT * FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND "sourceKind"=\'ADVERTISING_DRAFT\' AND "sourceRunId"=$2',
          [fixture.workspaceId, id],
        )
      )[0];
    const eventCount = async (id, action) =>
      (
        await connectionSource.query(
          'SELECT count(*)::integer AS count FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 AND "spendId"=$2 AND action=$3',
          [fixture.workspaceId, (await spend(id)).id, action],
        )
      )[0].count;
    const nativeBefore = await connectionSource.query(
      `SELECT to_jsonb(task)::text AS value FROM "${fixture.schemaName}".task task ORDER BY id`,
    );
    const operationsBefore = await connectionSource.query(
      'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    const reportsBefore = await connectionSource.query(
      'SELECT id,status,report FROM core."deliveryMetaReport" WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );

    const identical = await prepare(0);
    const same = await paired(
      () => call(0, 'start', identical.command),
      () => call(1, 'start', identical.command),
    );
    assert(
      same.every((result) => result.status === 'fulfilled'),
      String(same.find((result) => result.status === 'rejected')?.reason),
    );
    assert.deepEqual(same[0].value.receipt, same[1].value.receipt);
    assert.equal(
      (
        await connectionSource.query(
          'SELECT count(*)::integer AS count FROM core."deliveryAdvertisingDraftRun" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].count,
      1,
    );
    assert.equal(await eventCount(identical.command.id, 'RESERVED'), 1);
    assert.equal(
      queueJobs.size,
      1,
      'Retrying enqueue addresses the same stable queue job.',
    );
    const recovered = await call(1, 'request', {
      requestId: identical.command.requestId,
      action: 'STARTED',
    });
    assert.deepEqual(
      recovered.receipt,
      same[0].value.receipt,
      'A fresh connection recovers the immutable receipt after a lost reply.',
    );
    const beforeDispatch = providerCalls;
    const workerClaims = await paired(
      () => drafts[0].execute(identical.command.id),
      () => drafts[1].execute(identical.command.id),
    );
    assert(workerClaims.every((result) => result.status === 'fulfilled'));
    assert.equal(
      providerCalls,
      beforeDispatch + 1,
      'Two real worker sessions dispatch one mocked inference.',
    );
    assert.equal(await eventCount(identical.command.id, 'DISPATCHED'), 1);
    assert.equal(await eventCount(identical.command.id, 'SETTLED'), 1);
    assert.equal((await stored(identical.command.id)).status, 'SUCCEEDED');
    assert.deepEqual(
      (await call(0, 'start', identical.command)).receipt,
      recovered.receipt,
    );
    assert.equal(providerCalls, beforeDispatch + 1);

    const reserved = usdToMicro(identical.preview.budget.maximumCostUsd);
    const actual = BigInt((await spend(identical.command.id)).actualMicroUsd);
    const changeCap = async (cap) =>
      connectionSource.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        await manager.query(
          'UPDATE core."otogrowAiBudget" SET "capMicroUsd"=$3,revision=revision+1 WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, fixture.budgetId, cap.toString()],
        );
      });
    await changeCap(actual + reserved);
    const left = await prepare(1),
      right = await prepare(2);
    const limited = await paired(
      () => call(0, 'start', left.command),
      () => call(1, 'start', right.command),
    );
    assert.equal(
      limited.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      limited
        .find((result) => result.status === 'rejected')
        .reason.getStatus?.(),
      400,
    );
    const winner = limited.find((result) => result.status === 'fulfilled').value
      .run;
    const loser = winner.id === left.command.id ? right.command : left.command;
    assert.equal(
      await stored(loser.id),
      undefined,
      'Rejected capacity reservation rolls back the attempted run.',
    );
    assert.equal(await spend(loser.id), undefined);
    assert.equal(await eventCount(winner.id, 'RESERVED'), 1);
    await call(0, 'cancel', {
      id: winner.id,
      requestId: randomUUID(),
      revision: winner.revision,
    });
    assert.equal((await spend(winner.id)).state, 'RELEASED');
    await changeCap(100000000n);

    const revoke = async (prepared, mutate, person, statuses) => {
      const blocker = connectionSource.createQueryRunner();
      blockers.push(blocker);
      await blocker.connect();
      await blocker.startTransaction();
      await blocker.query("SET LOCAL lock_timeout='5s'");
      await blocker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${fixture.workspaceId}`],
      );
      const [{ pid }] = await blocker.query('SELECT pg_backend_pid() AS pid');
      const waiting = track(call(0, 'start', prepared.command, person));
      await waitForBlocked(0, pid);
      await mutate(blocker.manager);
      await blocker.commitTransaction();
      await blocker.release();
      await assert.rejects(
        () => bounded(waiting, 'Revoked start did not settle.'),
        (error) => statuses.includes(error.getStatus?.()),
      );
      assert.equal(await stored(prepared.command.id), undefined);
      assert.equal(await spend(prepared.command.id), undefined);
      assert(!queueJobs.has(`advertising-draft-${prepared.command.id}`));
    };
    const changedSource = await prepare(3);
    await revoke(
      changedSource,
      (manager) =>
        manager.query(
          'UPDATE core."deliveryProject" SET revision=revision+1 WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, fixture.projects.first],
        ),
      fixture.people.admin,
      [409],
    );
    const changedRole = await prepare(4, fixture.people.reader);
    await revoke(
      changedRole,
      (manager) =>
        manager.query(
          'UPDATE core."otogrowRole" SET capabilities=$3,revision=revision+1 WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, fixture.roles.reader, []],
        ),
      fixture.people.reader,
      [403, 404],
    );
    await connectionSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${fixture.workspaceId}`],
      );
      await manager.query(
        'UPDATE core."otogrowRole" SET capabilities=$3,revision=revision+1 WHERE "workspaceId"=$1 AND id=$2',
        [fixture.workspaceId, fixture.roles.reader, ['delivery.manage']],
      );
    });

    const cancelling = await prepare(5);
    await call(0, 'start', cancelling.command);
    const hold = { entered: deferred(), release: deferred() };
    providerHold = hold;
    const running = track(drafts[0].execute(cancelling.command.id));
    await bounded(
      hold.entered.promise,
      'The mocked provider did not enter its in-flight barrier.',
    );
    const beforeCancel = await stored(cancelling.command.id);
    assert.equal(beforeCancel.status, 'RUNNING');
    assert.equal((await spend(cancelling.command.id)).state, 'DISPATCHED');
    const cancellation = {
      id: beforeCancel.id,
      requestId: randomUUID(),
      revision: beforeCancel.revision,
    };
    const cancelled = await call(1, 'cancel', cancellation);
    assert.equal(cancelled.run.status, 'CANCELLED');
    assert.equal(
      (await spend(cancelling.command.id)).state,
      'DISPATCHED',
      'Cancellation cannot release an in-flight reservation.',
    );
    hold.release.resolve();
    providerHold = null;
    await bounded(running, 'The cancelled run did not reconcile known usage.');
    assert.equal((await stored(cancelling.command.id)).status, 'CANCELLED');
    assert.equal(
      (await stored(cancelling.command.id)).result,
      null,
      'Cancelled result must never become reusable.',
    );
    assert.equal((await spend(cancelling.command.id)).state, 'SETTLED');
    assert.equal(await eventCount(cancelling.command.id, 'DISPATCHED'), 1);
    assert.equal(await eventCount(cancelling.command.id, 'SETTLED'), 1);
    assert.deepEqual(
      (
        await call(0, 'request', {
          requestId: cancellation.requestId,
          action: 'CANCELLED',
        })
      ).receipt,
      cancelled.receipt,
    );
    assert.deepEqual(
      (await call(1, 'cancel', cancellation)).receipt,
      cancelled.receipt,
    );
    assert.equal(
      (
        await connectionSource.query(
          'SELECT count(*)::integer AS count FROM core."deliveryAdvertisingDraftRun" WHERE "workspaceId"=$1 AND status IN (\'QUEUED\',\'RUNNING\')',
          [fixture.workspaceId],
        )
      )[0].count,
      0,
    );
    assert.deepEqual(
      await connectionSource.query(
        `SELECT to_jsonb(task)::text AS value FROM "${fixture.schemaName}".task task ORDER BY id`,
      ),
      nativeBefore,
      'AI drafting does not manufacture delivery tasks.',
    );
    assert.deepEqual(
      await connectionSource.query(
        'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id',
        [[fixture.workspaceId, fixture.foreignWorkspaceId]],
      ),
      operationsBefore,
    );
    assert.deepEqual(
      await connectionSource.query(
        'SELECT id,status,report FROM core."deliveryMetaReport" WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id',
        [[fixture.workspaceId, fixture.foreignWorkspaceId]],
      ),
      reportsBefore,
      'Suggestions do not approve or assign source reports.',
    );
    assert.equal(networkCalls, 0);
    assert.deepEqual(
      await protectedRows(connectionSource.manager, fixture),
      fixture.protectedBefore,
    );
    console.log(
      `PASS independent advertising draft sessions: one receipt/reservation/queue job and one mocked dispatch for identical starts/double worker claims; one winner under a shared spending cap; exact lost-reply recovery; serialized source/role revocation; in-flight cancellation retains exposure then settles without publishing. ${providerCalls} in-process model calls; no provider requests.`,
    );
  } finally {
    barrier?.ready.resolve();
    barrier = null;
    providerHold?.release.resolve();
    providerHold = null;
    for (const blocker of blockers) {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      if (!blocker.isReleased) await blocker.release();
    }
    await Promise.allSettled(pending);
    await Promise.all(
      sources
        .filter((source) => source.isInitialized)
        .map((source) => source.destroy()),
    );
    try {
      if (connectionSource.isInitialized) {
        try {
          if (fixture && existsSync(FILE)) {
            const owned = readJournal();
            assert.equal(
              owned.workspaceId,
              fixture.workspaceId,
              'Refuse cleanup of another concurrent checker’s journal.',
            );
            await cleanup(owned);
          }
        } finally {
          await connectionSource.destroy();
        }
      }
    } finally {
      global.fetch = originalFetch;
    }
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    console.error(
      `Retain ${FILE} if present; its private ownership journal supports exact recovery.`,
    );
    process.exitCode = 1;
  });

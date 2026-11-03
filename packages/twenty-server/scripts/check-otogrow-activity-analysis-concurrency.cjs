const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const { cleanupFixture } = require('./check-delivery-reconciliation.cjs');
const {
  writeJournal,
  syncDirectory,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const {
  startActivityAnalysisSchema,
  cancelActivityAnalysisSchema,
} = require('../dist/modules/otogrow-activity/analysis/otogrow-activity-analysis.types');
const {
  usdToMicro,
} = require('../dist/modules/otogrow-ai-budget/otogrow-ai-budget.policy');
const {
  deny,
  deferred,
  bounded,
  quote,
  originalDigest,
  configurationFor,
  seedActivityFixture,
  activityServices,
  mockRuntime,
  prepareInput,
  startInput,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  seedCurrentWorkFixture,
  syntheticCurrentWork,
} = require('./check-otogrow-activity-current-work-support.cjs');

const FILE = '/tmp/otogrow-activity-analysis-concurrency-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const journal = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
function readJournal() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, 'activity-analysis-concurrency-v1');
  for (const id of [
    fixture.workspaceId,
    fixture.foreignWorkspaceId,
    fixture.agentId,
    fixture.budgetId,
    fixture.priceId,
    ...(fixture.nativeRoleId
      ? [
          fixture.nativeRoleId,
          ...Object.values(fixture.currentTasks),
          ...Object.values(fixture.currentManagedIds),
          ...Object.values(fixture.currentAssignmentIds),
        ]
      : []),
    ...Object.values(fixture.people).flatMap((person) => [
      person.userId,
      person.memberId,
      person.userWorkspaceId,
    ]),
    ...fixture.eventIds,
    fixture.foreignEventId,
  ])
    assert.match(id, UUID);
  assert.equal(
    fixture.schemaName,
    `activity_analysis_race_${fixture.workspaceId.replaceAll('-', '_')}`,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  assert.equal(fixture.modelId, `synthetic-activity-${fixture.workspaceId}`);
  assert.match(fixture.protectedBefore, /^[a-f0-9]{64}$/);
  for (const plan of fixture.plannedStarts) {
    assert.deepEqual(startActivityAnalysisSchema.parse(plan.input), plan.input);
    assert.equal(plan.hash, advertisingHash(plan.input));
    assert(
      [fixture.people.admin.memberId, fixture.people.reader.memberId].includes(
        plan.memberId,
      ),
    );
  }
  for (const plan of fixture.plannedCancels) {
    assert.deepEqual(
      cancelActivityAnalysisSchema.parse(plan.input),
      plan.input,
    );
    assert.equal(plan.hash, advertisingHash(plan.input));
  }
  return fixture;
}
async function ownRows(manager, fixture) {
  const descriptors = await manager.query(
    `SELECT tables.table_schema AS schema,tables.table_name AS name,bool_or(columns.column_name='workspaceId') AS scoped FROM information_schema.tables tables JOIN information_schema.columns columns ON columns.table_schema=tables.table_schema AND columns.table_name=tables.table_name WHERE tables.table_type='BASE TABLE' AND tables.table_schema IN ('core',$1) GROUP BY tables.table_schema,tables.table_name ORDER BY tables.table_schema,tables.table_name`,
    [fixture.schemaName],
  );
  const tables = [];
  for (const table of descriptors) {
    let condition;
    let values;
    if (table.schema === fixture.schemaName) {
      condition = 'true';
      values = [];
    } else if (table.name === 'workspace') {
      condition = 'record.id=ANY($1::uuid[])';
      values = [[fixture.workspaceId, fixture.foreignWorkspaceId]];
    } else if (table.name === 'user') {
      condition = 'record.id=ANY($1::uuid[])';
      values = [Object.values(fixture.people).map((person) => person.userId)];
    } else if (table.scoped) {
      condition = 'record."workspaceId"=ANY($1::uuid[])';
      values = [[fixture.workspaceId, fixture.foreignWorkspaceId]];
    } else continue;
    const rows = await manager.query(
      `SELECT to_jsonb(record)->>'id' AS id,md5(to_jsonb(record)::text) AS hash FROM ${quote(table.schema)}.${quote(table.name)} record WHERE ${condition} ORDER BY to_jsonb(record)->>'id'`,
      values,
    );
    tables.push({ schema: table.schema, name: table.name, rows });
  }
  return tables;
}
async function authorizeCleanup(manager, fixture) {
  assert.equal(
    await originalDigest(
      (...arguments_) => manager.query(...arguments_),
      fixture,
    ),
    fixture.protectedBefore,
    'Original core/native inventory or rows changed; preserve the fixture.',
  );
  const workspaces = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  if (!workspaces.length) {
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
          'SELECT id FROM core."user" WHERE id=ANY($1::uuid[])',
          [Object.values(fixture.people).map((person) => person.userId)],
        )
      ).length,
      0,
    );
    return false;
  }
  assert.equal(workspaces.length, 2);
  for (const workspace of workspaces) {
    assert.equal(workspace.displayName, fixture.sentinel);
    assert.equal(workspace.databaseSchema, fixture.schemaName);
  }
  const [namespace] = await manager.query(
    "SELECT obj_description(oid,'pg_namespace') AS sentinel FROM pg_namespace WHERE nspname=$1",
    [fixture.schemaName],
  );
  assert.equal(namespace?.sentinel, fixture.sentinel);
  const runs = await manager.query(
    'SELECT * FROM core."otogrowActivityAnalysisRun" WHERE "workspaceId"=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  for (const run of runs) {
    const plan = fixture.plannedStarts.find((item) => item.input.id === run.id);
    assert(plan, 'Only prejournalled run identities may be removed.');
    assert.equal(run.workspaceId, fixture.workspaceId);
    assert.equal(run.requestId, plan.input.requestId);
    assert.equal(run.initiatorId, plan.memberId);
    assert.equal(run.userWorkspaceId, plan.userWorkspaceId);
    assert.equal(run.agentId, fixture.agentId);
    assert.equal(run.agent.modelId, fixture.modelId);
    assert.deepEqual(run.configuration, configurationFor(fixture));
    assert.equal(run.inputHash, plan.hash);
    assert.equal(advertisingHash(run.input), plan.hash);
    assert.equal(run.startReceipt.inputHash, plan.hash);
    if (run.cancelReceipt) {
      const cancellation = fixture.plannedCancels.find(
        (item) => item.input.requestId === run.cancelRequestId,
      );
      assert(cancellation);
      assert.equal(cancellation.input.id, run.id);
      assert.equal(run.cancelInputHash, cancellation.hash);
      assert.equal(run.cancelReceipt.actorId, cancellation.memberId);
    }
  }
  const spends = await manager.query(
    'SELECT id,"sourceKind","sourceRunId",price FROM core."otogrowAiSpend" WHERE "workspaceId"=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  for (const spend of spends) {
    assert.equal(spend.sourceKind, 'ACTIVITY_ANALYSIS');
    assert(runs.some((run) => run.id === spend.sourceRunId));
    assert.equal(spend.price.modelId, fixture.modelId);
  }
  const spendEvents = await manager.query(
    'SELECT id,"spendId" FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  assert(
    spendEvents.every((event) =>
      spends.some((spend) => spend.id === event.spendId),
    ),
  );
  const activity = await manager.query(
    'SELECT id,"sourceType","sourceId",action FROM core."otogrowActivityEvent" WHERE "workspaceId"=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  const sourceIds = new Set([...fixture.eventIds, fixture.foreignEventId]);
  for (const event of activity.filter((event) => !sourceIds.has(event.id))) {
    assert.equal(event.sourceType, 'activity-analysis');
    assert(runs.some((run) => run.id === event.sourceId));
    assert(
      [
        'ACTIVITY_ANALYSIS_QUEUED',
        'ACTIVITY_ANALYSIS_STARTED',
        'ACTIVITY_ANALYSIS_COMPLETED',
        'ACTIVITY_ANALYSIS_CANCELLED',
        'ACTIVITY_ANALYSIS_FAILED',
        'ACTIVITY_ANALYSIS_INTERRUPTED',
      ].includes(event.action),
    );
  }
  const dynamic = {
    otogrowActivityAnalysisRun: runs,
    otogrowAiSpend: spends,
    otogrowAiSpendEvent: spendEvents,
    otogrowActivityEvent: activity.filter((event) => !sourceIds.has(event.id)),
  };
  const current = await ownRows(manager, fixture);
  assert.deepEqual(
    current.map(({ schema, name }) => ({ schema, name })),
    fixture.seedTables.map(({ schema, name }) => ({ schema, name })),
    'Owned schema inventory changed.',
  );
  for (const table of current) {
    const seed = fixture.seedTables.find(
      (item) => item.schema === table.schema && item.name === table.name,
    );
    const dynamicRows =
      table.schema === 'core' ? (dynamic[table.name] ?? []) : [];
    assert.deepEqual(
      table.rows.map((row) => row.id).sort(),
      [
        ...seed.rows.map((row) => row.id),
        ...dynamicRows.map((row) => row.id),
      ].sort(),
      `Unexpected ${table.schema}.${table.name}; no broad cleanup.`,
    );
    for (const row of seed.rows) {
      const actual = table.rows.find((item) => item.id === row.id);
      const allowed = fixture.mutableHashes[
        `${table.schema}.${table.name}:${row.id}`
      ] ?? [row.hash];
      assert(
        allowed.includes(actual.hash),
        `Owned seed ${table.schema}.${table.name} changed outside the exact fixture plan.`,
      );
    }
  }
  return true;
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='10s'");
    await manager.query("SET LOCAL statement_timeout='30s'");
    for (const id of [fixture.workspaceId, fixture.foreignWorkspaceId].sort())
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${id}`],
      );
    if (await authorizeCleanup(manager, fixture)) {
      for (const table of [
        'otogrowAiSpendEvent',
        'otogrowAiSpend',
        'otogrowActivityAnalysisRun',
        'deliveryAgent',
        'otogrowAiBudget',
        'otogrowAiPrice',
        'deliveryReviewAssignment',
        'deliveryTask',
        'roleTarget',
        'role',
      ])
        await manager.query(
          `DELETE FROM core.${quote(table)} WHERE "workspaceId"=ANY($1::uuid[])`,
          [[fixture.workspaceId, fixture.foreignWorkspaceId]],
        );
      await cleanupFixture(manager, fixture);
    }
    assert.equal(
      await originalDigest((...arguments_) => manager.query(...arguments_)),
      fixture.protectedBefore,
      'Whole original core/native inventory or rows were not preserved.',
    );
  });
  const receipt = `${FILE}.${fixture.workspaceId}.cleaned.json`;
  const value = {
    checker: fixture.checker,
    workspaceId: fixture.workspaceId,
    foreignWorkspaceId: fixture.foreignWorkspaceId,
    schemaName: fixture.schemaName,
    cleaned: true,
  };
  if (existsSync(receipt))
    assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), value);
  else writeJournal(value, receipt, true);
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
  assert.equal(
    process.env.OTOGROW_ACTIVITY_ANALYSIS_CHECK_ISOLATED,
    '1',
    'Stop the local API/analysis workers before this committed scratch-fixture proof; acknowledge isolation explicitly.',
  );
  if (process.argv.length === 3) {
    assert.equal(process.argv[2], 'cleanup');
    await connectionSource.initialize();
    try {
      await cleanup(readJournal());
    } finally {
      await connectionSource.destroy();
    }
    console.log(
      'Recovered only the exact owned activity-analysis concurrency fixture.',
    );
    return;
  }
  assert.equal(process.argv.length, 2);
  assert(
    !existsSync(FILE),
    `Recover ${FILE} with cleanup before starting another proof.`,
  );
  const originalFetch = global.fetch;
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error('Network is forbidden in activity-analysis races.');
  };
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `activity-analysis-race:${randomUUID()}:${index}`,
        },
      }),
  );
  const sessions = [null, null];
  const pending = [];
  let fixture;
  let barrier = null;
  let afterOperationHold = null;
  let completed = false;
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const scoped = sources.map((source, index) => ({
    manager: source.manager,
    getRepository: (entity) => source.getRepository(entity),
    query: (...arguments_) => source.query(...arguments_),
    transaction: (operation) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='10s'");
        await manager.query("SET LOCAL statement_timeout='20s'");
        [sessions[index]] = await manager.query(
          'SELECT pg_backend_pid() AS pid,txid_current()::text AS transaction',
        );
        const current = barrier;
        if (current) {
          current.arrivals.set(index, { ...sessions[index] });
          if (current.arrivals.size === 2) current.entered.resolve();
          await bounded(current.release.promise);
        }
        const result = await operation(manager);
        const hold = afterOperationHold;
        if (hold && hold.index === index) {
          afterOperationHold = null;
          hold.entered.resolve();
          await bounded(hold.release.promise);
        }
        return result;
      }),
  }));
  const pair = async (first, second) => {
    const current = {
      arrivals: new Map(),
      entered: deferred(),
      release: deferred(),
    };
    barrier = current;
    const left = track(first());
    const right = track(second());
    try {
      await bounded(current.entered.promise);
      assert.notEqual(current.arrivals.get(0).pid, current.arrivals.get(1).pid);
      assert.notEqual(
        current.arrivals.get(0).transaction,
        current.arrivals.get(1).transaction,
      );
      barrier = null;
      current.release.resolve();
      return await bounded(Promise.allSettled([left, right]));
    } finally {
      barrier = null;
      current.release.resolve();
    }
  };
  const waitBlocked = async (index, blocker) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (sessions[index]) {
        const [state] = await connectionSource.query(
          'SELECT pg_blocking_pids($1) AS blockers',
          [sessions[index].pid],
        );
        if (state.blockers.includes(blocker)) return;
      }
      await pause(10);
    }
    throw new Error(
      'The independent session did not wait on the expected activity lock.',
    );
  };
  const allResources = [];
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    const protectedBefore = await originalDigest((...arguments_) =>
      connectionSource.query(...arguments_),
    );
    const [{ count }] = await connectionSource.query(
      "SELECT count(*)::integer AS count FROM core.\"otogrowActivityAnalysisRun\" WHERE status IN ('QUEUED','RUNNING')",
    );
    assert.equal(count, 0, 'Do not touch original active analysis work.');
    const runtime = mockRuntime();
    await connectionSource.transaction(async (manager) => {
      fixture = await seedActivityFixture(manager, 'activity_analysis_race');
      await seedCurrentWorkFixture(manager, fixture);
      fixture.checker = 'activity-analysis-concurrency-v1';
      fixture.protectedBefore = protectedBefore;
      fixture.plannedStarts = [];
      fixture.plannedCancels = [];
      fixture.mutableHashes = {};
      await manager.query(
        `COMMENT ON SCHEMA ${quote(fixture.schemaName)} IS '${fixture.sentinel}'`,
      );
      const source = {
        manager,
        getRepository: (entity) => manager.getRepository(entity),
        transaction: (operation) => manager.transaction(operation),
      };
      const services = activityServices(
        source,
        fixture,
        runtime.registryFor(fixture),
        {
          add: async () => {
            throw new Error('Seeding cannot queue.');
          },
        },
      );
      await makeBudgetFixture(source, services.access, fixture.workspace, [
        { modelId: fixture.modelId, kind: 'TEXT' },
      ]);
      fixture.budgetId = (
        await manager.query(
          'SELECT id FROM core."otogrowAiBudget" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].id;
      fixture.priceId = (
        await manager.query(
          'SELECT id FROM core."otogrowAiPrice" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].id;
      fixture.seedTables = await ownRows(manager, fixture);
      journal(fixture, true);
    });
    const queueJobs = new Map();
    const queue = {
      add: async (name, input, options) => {
        assert.equal(name, 'otogrow-activity-analysis');
        assert.equal(options.id, `activity-analysis-${input.runId}`);
        assert(
          fixture.plannedStarts.some((plan) => plan.input.id === input.runId),
        );
        assert.equal(
          (
            await connectionSource.query(
              'SELECT id FROM core."otogrowActivityAnalysisRun" WHERE "workspaceId"=$1 AND id=$2',
              [fixture.workspaceId, input.runId],
            )
          ).length,
          1,
          'Queue handoff happens after commit.',
        );
        queueJobs.set(options.id, input.runId);
      },
    };
    let sharedNative;
    const services = scoped.map((source) =>
      activityServices(
        source,
        fixture,
        runtime.registryFor(fixture),
        queue,
        (access) => {
          const native = syntheticCurrentWork(access, fixture, sharedNative);
          sharedNative ??= native.native;
          return native.currentWork;
        },
      ),
    );
    const call = (index, method, input, person = fixture.people.admin) =>
      services[index].analysis[method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const prepare = async (
      index = 0,
      person = fixture.people.admin,
      question = 'FIXTURE: Describe recorded changes and explicit unknowns.',
      overrides = {},
    ) => {
      const input = prepareInput(fixture, { question, ...overrides });
      const preview = await call(index, 'preview', input, person);
      assert.equal(preview.canStart, true);
      runtime.state.citation = preview.context.citations[0].id;
      const command = startActivityAnalysisSchema.parse(
        startInput(input, preview),
      );
      fixture.plannedStarts.push({
        input: command,
        hash: advertisingHash(command),
        memberId: person.memberId,
        userWorkspaceId: person.userWorkspaceId,
      });
      journal(fixture);
      return { input, preview, command };
    };
    const cancel = async (index, id, person = fixture.people.admin) => {
      const state = await call(index, 'state', { id }, person);
      const input = cancelActivityAnalysisSchema.parse({
        id,
        requestId: randomUUID(),
        revision: state.run.revision,
      });
      fixture.plannedCancels.push({
        input,
        hash: advertisingHash(input),
        memberId: person.memberId,
      });
      journal(fixture);
      return call(index, 'cancel', input, person);
    };
    const spend = async (id) =>
      (
        await connectionSource.query(
          'SELECT * FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND "sourceRunId"=$2 AND "sourceKind"=\'ACTIVITY_ANALYSIS\'',
          [fixture.workspaceId, id],
        )
      )[0];
    const mutable = async (manager, name, id) => {
      const [row] = await manager.query(
        `SELECT md5(to_jsonb(record)::text) AS hash FROM core.${quote(name)} record WHERE id=$1 AND "workspaceId"=$2`,
        [id, fixture.workspaceId],
      );
      const key = `core.${name}:${id}`;
      fixture.mutableHashes[key] ??= [];
      const seed = fixture.seedTables
        .find((table) => table.schema === 'core' && table.name === name)
        .rows.find((item) => item.id === id);
      if (!fixture.mutableHashes[key].includes(seed.hash))
        fixture.mutableHashes[key].push(seed.hash);
      if (!fixture.mutableHashes[key].includes(row.hash))
        fixture.mutableHashes[key].push(row.hash);
      journal(fixture);
    };
    const setBudget = async (cap) =>
      connectionSource.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        await manager.query(
          'UPDATE core."otogrowAiBudget" SET "capMicroUsd"=$2,revision=revision+1 WHERE id=$1 AND "workspaceId"=$3',
          [fixture.budgetId, cap, fixture.workspaceId],
        );
        await mutable(manager, 'otogrowAiBudget', fixture.budgetId);
      });
    const setReader = async (capabilities, index = 1) =>
      scoped[index].transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        await manager.query(
          'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1 AND "workspaceId"=$3',
          [fixture.roles.reader, capabilities, fixture.workspaceId],
        );
        await mutable(manager, 'otogrowRole', fixture.roles.reader);
      });

    const first = await prepare();
    const starts = await pair(
      () => call(0, 'start', first.command),
      () => call(1, 'start', first.command),
    );
    assert(starts.every((result) => result.status === 'fulfilled'));
    assert.deepEqual(starts[0].value.receipt, starts[1].value.receipt);
    assert.equal(
      (
        await connectionSource.query(
          'SELECT id FROM core."otogrowActivityAnalysisRun" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      ).length,
      1,
    );
    assert.equal(
      (
        await connectionSource.query(
          'SELECT id FROM core."otogrowAiSpend" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      ).length,
      1,
    );
    assert.equal(queueJobs.size, 1);
    const workers = await pair(
      () => services[0].analysis.execute(first.command.id),
      () => services[1].analysis.execute(first.command.id),
    );
    assert(workers.every((result) => result.status === 'fulfilled'));
    assert.equal(runtime.state.calls, 1);
    assert.equal(
      (await call(0, 'state', { id: first.command.id })).run.status,
      'SUCCEEDED',
    );
    assert.equal((await spend(first.command.id)).state, 'SETTLED');
    assert.deepEqual(
      (
        await call(1, 'request', {
          requestId: first.command.requestId,
          action: 'STARTED',
        })
      ).receipt,
      starts[0].value.receipt,
    );
    await deny(
      () => call(1, 'start', first.command, fixture.people.reader),
      [409],
    );

    const second = await prepare(
      0,
      fixture.people.admin,
      'FIXTURE shared budget candidate one.',
    );
    const third = await prepare(
      1,
      fixture.people.admin,
      'FIXTURE shared budget candidate two.',
    );
    const [{ exposure }] = await connectionSource.query(
      'SELECT COALESCE(sum(CASE WHEN state=\'RELEASED\' THEN 0 WHEN state=\'SETTLED\' THEN COALESCE("actualMicroUsd","reservedMicroUsd") ELSE GREATEST("reservedMicroUsd",COALESCE("actualMicroUsd",0)) END),0)::text AS exposure FROM core."otogrowAiSpend" WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    await setBudget(
      (
        BigInt(exposure) + usdToMicro(second.preview.budget.maximumCostUsd)
      ).toString(),
    );
    const limited = await pair(
      () => call(0, 'start', second.command),
      () => call(1, 'start', third.command),
    );
    assert.equal(
      limited.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const failed = limited.find((result) => result.status === 'rejected');
    assert.equal(failed.reason.getStatus?.(), 400);
    const winner = limited.find(
      (result) => result.status === 'fulfilled',
    ).value;
    await cancel(0, winner.run.id);
    assert.equal((await spend(winner.run.id)).state, 'RELEASED');
    await setBudget('100000000');

    const ordered = await prepare(
      0,
      fixture.people.reader,
      'FIXTURE authorized start must commit before a queued revocation.',
    );
    const hold = { index: 0, entered: deferred(), release: deferred() };
    afterOperationHold = hold;
    allResources.push(hold.release);
    const allowed = track(
      call(0, 'start', ordered.command, fixture.people.reader),
    );
    await bounded(hold.entered.promise);
    const startingPid = sessions[0].pid;
    const revoke = track(setReader([]));
    await waitBlocked(1, startingPid);
    hold.release.resolve();
    await bounded(allowed);
    await bounded(revoke);
    await deny(
      () =>
        call(1, 'detail', { id: ordered.command.id }, fixture.people.reader),
      [403],
    );
    await setReader(['workspace.admin']);
    await cancel(0, ordered.command.id);
    const revoked = await prepare(
      0,
      fixture.people.reader,
      'FIXTURE revocation wins before this start.',
    );
    const blocker = connectionSource.createQueryRunner();
    allResources.push(blocker);
    await blocker.connect();
    await blocker.startTransaction();
    const [{ pid: blockerPid }] = await blocker.query(
      'SELECT pg_backend_pid() AS pid',
    );
    await blocker.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`delivery:${fixture.workspaceId}`],
    );
    const rejected = track(
      call(0, 'start', revoked.command, fixture.people.reader),
    );
    await waitBlocked(0, blockerPid);
    await blocker.query(
      'UPDATE core."otogrowRole" SET capabilities=\'{}\'::text[] WHERE id=$1 AND "workspaceId"=$2',
      [fixture.roles.reader, fixture.workspaceId],
    );
    await mutable(blocker.manager, 'otogrowRole', fixture.roles.reader);
    await blocker.commitTransaction();
    await blocker.release();
    await deny(() => rejected, [403]);
    assert.equal(
      (
        await connectionSource.query(
          'SELECT id FROM core."otogrowActivityAnalysisRun" WHERE id=$1',
          [revoked.command.id],
        )
      ).length,
      0,
    );
    await setReader(['workspace.admin']);

    const running = await prepare();
    await call(0, 'start', running.command);
    runtime.state.behavior = 'HOLD_SUCCESS';
    runtime.state.entered = deferred();
    runtime.state.release = deferred();
    allResources.push(runtime.state.release);
    const execution = track(services[0].analysis.execute(running.command.id));
    await bounded(runtime.state.entered.promise);
    assert.equal((await spend(running.command.id)).state, 'DISPATCHED');
    await cancel(1, running.command.id);
    assert.equal((await spend(running.command.id)).state, 'DISPATCHED');
    runtime.state.release.resolve();
    await bounded(execution);
    const ended = await call(1, 'detail', { id: running.command.id });
    assert.equal(ended.run.status, 'CANCELLED');
    assert.equal(ended.result, null);
    assert.equal((await spend(running.command.id)).state, 'SETTLED');
    assert.equal(runtime.state.calls, 2);

    runtime.state.behavior = 'SUCCESS';
    const currentOverrides = {
      includeCurrentWork: true,
      filters: {
        from: '2020-02-20T00:00:00.000Z',
        through: '2020-02-22T00:00:00.000Z',
        projectId: fixture.projects.first,
      },
    };
    const changeTask = async (manager, state, revision) => {
      await manager.query(
        'UPDATE core."deliveryTask" SET details=jsonb_set(details,\'{state}\',to_jsonb($3::text)),revision=$4 WHERE "workspaceId"=$1 AND id=$2',
        [
          fixture.workspaceId,
          fixture.currentManagedIds.activeBackup,
          state,
          revision,
        ],
      );
      await mutable(
        manager,
        'deliveryTask',
        fixture.currentManagedIds.activeBackup,
      );
    };
    const setTask = async (state, revision, index = 1) =>
      scoped[index].transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        await changeTask(manager, state, revision);
      });
    const sourceOrdered = await prepare(
      0,
      fixture.people.admin,
      'FIXTURE captured tasks before a queued source change.',
      currentOverrides,
    );
    const sourceHold = { index: 0, entered: deferred(), release: deferred() };
    afterOperationHold = sourceHold;
    allResources.push(sourceHold.release);
    const accepted = track(call(0, 'start', sourceOrdered.command));
    await bounded(sourceHold.entered.promise);
    const mutation = track(setTask('BLOCKED', 2));
    await waitBlocked(1, sessions[0].pid);
    sourceHold.release.resolve();
    await bounded(accepted);
    await bounded(mutation);
    const sourceCalls = runtime.state.calls;
    await services[0].analysis.execute(sourceOrdered.command.id);
    assert.equal(
      runtime.state.calls,
      sourceCalls,
      'Changed queued current-work evidence prevents a model dispatch.',
    );
    assert.equal(
      (await call(1, 'state', { id: sourceOrdered.command.id })).run.status,
      'FAILED',
    );
    assert.equal((await spend(sourceOrdered.command.id)).state, 'RELEASED');
    await setTask('IN_REVIEW', 1);

    const sourceBefore = await prepare(
      0,
      fixture.people.admin,
      'FIXTURE source mutation wins before start.',
      currentOverrides,
    );
    const sourceBlocker = connectionSource.createQueryRunner();
    allResources.push(sourceBlocker);
    await sourceBlocker.connect();
    await sourceBlocker.startTransaction();
    const [{ pid: sourceBlockerPid }] = await sourceBlocker.query(
      'SELECT pg_backend_pid() AS pid',
    );
    await sourceBlocker.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`delivery:${fixture.workspaceId}`],
    );
    const sourceRejected = track(call(0, 'start', sourceBefore.command));
    await waitBlocked(0, sourceBlockerPid);
    await changeTask(sourceBlocker.manager, 'CHANGES_REQUESTED', 2);
    await sourceBlocker.commitTransaction();
    await sourceBlocker.release();
    await deny(() => sourceRejected, [409]);
    assert.equal(
      (
        await connectionSource.query(
          'SELECT id FROM core."otogrowActivityAnalysisRun" WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, sourceBefore.command.id],
        )
      ).length,
      0,
    );
    assert.equal(await spend(sourceBefore.command.id), undefined);
    await setTask('IN_REVIEW', 1);

    const reviewerInFlight = await prepare(
      0,
      fixture.people.admin,
      'FIXTURE reviewer changes during a model call.',
      currentOverrides,
    );
    await call(0, 'start', reviewerInFlight.command);
    runtime.state.citation = `current-task:${fixture.currentTasks.activeBackup}`;
    runtime.state.behavior = 'HOLD_SUCCESS';
    runtime.state.entered = deferred();
    runtime.state.release = deferred();
    allResources.push(runtime.state.release);
    const reviewerExecution = track(
      services[0].analysis.execute(reviewerInFlight.command.id),
    );
    await bounded(runtime.state.entered.promise);
    assert.equal(
      (await spend(reviewerInFlight.command.id)).state,
      'DISPATCHED',
    );
    const assignmentId =
      fixture.currentAssignmentIds[`${fixture.currentTasks.activeBackup}:2`];
    const setReviewer = (reviewerId, revision) =>
      scoped[1].transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        await manager.query(
          'UPDATE core."deliveryReviewAssignment" SET "reviewerId"=$3,revision=$4 WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, assignmentId, reviewerId, revision],
        );
        await mutable(manager, 'deliveryReviewAssignment', assignmentId);
      });
    await setReviewer(fixture.people.reader.memberId, 2);
    runtime.state.release.resolve();
    await bounded(reviewerExecution);
    const rejectedOutput = await call(1, 'detail', {
      id: reviewerInFlight.command.id,
    });
    assert.equal(rejectedOutput.run.status, 'FAILED');
    assert.equal(rejectedOutput.result, null);
    assert.equal(
      (await spend(reviewerInFlight.command.id)).state,
      'SETTLED',
      'An independent reviewer reassignment discards stale output after charging known usage.',
    );
    await setReviewer(fixture.people.secondWriter.memberId, 1);
    assert.equal(runtime.state.calls, sourceCalls + 1);
    assert.equal(networkCalls, 0);
    completed = true;
    console.log(
      `PASS independent activity-analysis sessions: duplicate receipt/reservation/mock queue, one dispatch/shared-cap winner, revocation locking, cancellation settlement, both current-source lock orderings and changed-reviewer in-flight output discarded after known usage. ${runtime.state.calls} in-process model calls; no provider requests.`,
    );
  } finally {
    barrier?.release.resolve();
    afterOperationHold?.release.resolve();
    for (const resource of allResources)
      if (resource?.resolve) resource.resolve();
    await Promise.allSettled(pending);
    for (const resource of allResources)
      if (resource?.isTransactionActive) await resource.rollbackTransaction();
    for (const resource of allResources)
      if (
        resource?.release &&
        typeof resource.release === 'function' &&
        !resource.isReleased
      )
        await resource.release();
    await Promise.allSettled(
      sources
        .filter((source) => source.isInitialized)
        .map((source) => source.destroy()),
    );
    try {
      if (connectionSource.isInitialized && fixture && existsSync(FILE)) {
        const owned = readJournal();
        assert.equal(owned.workspaceId, fixture.workspaceId);
        await cleanup(owned);
      }
    } finally {
      try {
        if (connectionSource.isInitialized) await connectionSource.destroy();
      } finally {
        global.fetch = originalFetch;
      }
    }
  }
  assert(completed);
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(
      `Retain ${FILE} if present; use this checker's isolated cleanup command for exact recovery.`,
    );
    process.exitCode = 1;
  });

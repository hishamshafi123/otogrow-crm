const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const { DataSource } = require('typeorm');
const { isDeepStrictEqual } = require('node:util');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  originalDigest,
  deferred,
  bounded,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  writeJournal,
  syncDirectory,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const { ownedRows } = require('./check-delivery-content-concurrency-guard.cjs');
const {
  seed,
  harness,
} = require('./check-delivery-native-commitments-support.cjs');
const {
  commitmentCleanupRequestHash,
} = require('../dist/modules/delivery/commitments/delivery-commitments.policy');
const {
  syncDeliveryCommitment,
} = require('../dist/modules/delivery/commitments/record-delivery-commitment');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');

const FILE = '/tmp/otogrow-native-commitments-race.json';
const CHECKER = 'native-commitments-race-v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const copy = (value) => JSON.parse(JSON.stringify(value));
const save = (fixture, initial = false) => writeJournal(fixture, FILE, initial);
const readJournal = () => {
  const info = lstatSync(FILE);
  assert(
    info.isFile() &&
      !info.isSymbolicLink() &&
      (info.mode & 0o077) === 0 &&
      info.uid === process.getuid(),
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, CHECKER);
  assert.match(fixture.workspaceId, UUID);
  assert.match(fixture.foreignWorkspaceId, UUID);
  assert.equal(
    fixture.schemaName,
    `native_commit_race_${fixture.workspaceId.replaceAll('-', '_')}`,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  return fixture;
};

async function allOwnedRows(manager, fixture) {
  const tables = await ownedRows(manager, fixture);
  for (const table of tables) {
    assert(table.rows.every((row) => row.id && UUID.test(row.id)));
    if (table.rows.length) {
      const rows = await manager.query(
        `SELECT to_jsonb(record) AS body FROM "${table.schema}"."${table.name}" record WHERE id=ANY($1::uuid[]) ORDER BY id`,
        [table.rows.map((row) => row.id)],
      );
      for (const row of table.rows)
        row.body = rows.find((item) => item.body.id === row.id).body;
    }
  }
  return tables;
}

async function validate(manager, fixture) {
  assert.equal(
    await originalDigest((...args) => manager.query(...args), fixture),
    fixture.original,
    'Original data changed; retain the journal.',
  );
  const workspace = await manager.query(
    'SELECT id FROM core.workspace WHERE id=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  if (!workspace.length) {
    assert.equal(await schemaFingerprint(manager), fixture.originalSchema);
    assert.equal(
      (
        await manager.query('SELECT to_regnamespace($1)::text AS name', [
          fixture.schemaName,
        ])
      )[0].name,
      null,
    );
    return null;
  }
  assert.equal(workspace.length, 2);
  assert.equal(await schemaFingerprint(manager), fixture.seedSchema);
  const actual = await allOwnedRows(manager, fixture);
  assert.deepEqual(
    actual.map(({ schema, name }) => ({ schema, name })),
    fixture.seed.map(({ schema, name }) => ({ schema, name })),
  );
  const events = actual.find(
    (table) =>
      table.schema === 'core' && table.name === 'deliveryCommitmentEvent',
  ).rows;
  const baseEventIds = fixture.seed
    .find(
      (table) =>
        table.schema === 'core' && table.name === 'deliveryCommitmentEvent',
    )
    .rows.map((row) => row.id);
  const addedEvents = events.filter((row) => !baseEventIds.includes(row.id));
  const committed = new Map();
  for (const row of addedEvents) {
    const command = fixture.commands.find(
      (item) => item.input.requestId === row.id,
    );
    assert(command && command.maySucceed, 'Unplanned cleanup event.');
    const allocation = fixture.seed
      .find(
        (table) =>
          table.schema === 'core' &&
          table.name === 'deliveryCommitmentAllocation',
      )
      .rows.find((item) => item.id === command.input.allocationId).body;
    const event = { ...row.body };
    const cancelled = command.terminal === 'CANCELLED';
    assert(Date.parse(event.createdAt) >= Date.parse(command.declaredAt));
    delete event.createdAt;
    assert.deepEqual(event, {
      id: command.input.requestId,
      workspaceId: fixture.workspaceId,
      periodId: fixture.periodId,
      actorId: fixture.people.reader.memberId,
      actorType: 'HUMAN',
      actorName: `reader ${fixture.sentinel}`,
      action: cancelled
        ? 'COMMITMENT_ORPHAN_CLEANUP_CANCELLED'
        : 'COMMITMENT_ORPHAN_REMOVED',
      taskId: null,
      taskName: null,
      reason: cancelled
        ? 'Cancelled this unavailable-source cleanup request before removal. No allocation was changed.'
        : 'Removed an unavailable-source allocation from this commitment. Promised quantities and delivery history are unchanged.',
      changes: [
        {
          field: 'state',
          before: cancelled ? null : allocation.state,
          after: cancelled ? 'CANCELLED' : 'REMOVED',
        },
        {
          field: 'requestHash',
          before: null,
          after: commitmentCleanupRequestHash(
            {
              workspaceId: fixture.workspaceId,
              memberId: fixture.people.reader.memberId,
              userWorkspaceId: fixture.people.reader.userWorkspaceId,
            },
            command.input,
          ),
        },
      ],
    });
    if (!cancelled) {
      assert(!committed.has(command.input.allocationId));
      committed.set(command.input.allocationId, command);
    }
  }
  const activities = actual.find(
    (table) => table.schema === 'core' && table.name === 'otogrowActivityEvent',
  ).rows;
  assert.equal(
    activities.length,
    addedEvents.length,
    'Each exact cleanup has one activity.',
  );
  for (const action of [
    'COMMITMENT_ORPHAN_REMOVED',
    'COMMITMENT_ORPHAN_CLEANUP_CANCELLED',
  ])
    assert.equal(
      activities.filter((row) => row.body.action === action).length,
      addedEvents.filter((row) => row.body.action === action).length,
    );
  const project = fixture.seed
    .find(
      (table) => table.schema === 'core' && table.name === 'deliveryProject',
    )
    .rows.find((row) => row.id === fixture.projects.first).body;
  const company = fixture.seed
    .find(
      (table) =>
        table.schema === fixture.schemaName && table.name === 'company',
    )
    .rows.find((row) => row.id === fixture.companyId).body;
  for (const row of activities) {
    const activity = { ...row.body };
    assert(Date.parse(activity.occurredAt) >= Date.parse(fixture.createdAt));
    assert(
      Date.parse(activity.recordedAt) >= Date.parse(fixture.databaseCreatedAt),
    );
    delete activity.id;
    delete activity.occurredAt;
    delete activity.recordedAt;
    assert.deepEqual(activity, {
      workspaceId: fixture.workspaceId,
      actorId: fixture.people.reader.memberId,
      actorName: `reader ${fixture.sentinel}`,
      actorType: 'HUMAN',
      subjectMemberId: null,
      subjectName: null,
      category: 'CLIENT',
      action: activity.action,
      outcome: 'RECORDED',
      summary: 'Updated a structured service commitment.',
      projectId: project.id,
      projectName: project.name,
      clientId: company.id,
      clientName: company.name,
      taskId: null,
      taskName: null,
      agentName: null,
      sourceType: 'client-engagement',
      sourceId: fixture.engagementId,
      changes: [],
    });
  }
  for (const table of actual) {
    const original = fixture.seed.find(
      (item) => item.schema === table.schema && item.name === table.name,
    );
    const inserted = fixture.rowChanges.filter(
      (item) =>
        item.schema === table.schema &&
        item.table === table.name &&
        item.before === null,
    );
    const extras =
      table.name === 'deliveryCommitmentEvent' && table.schema === 'core'
        ? addedEvents
        : table.name === 'otogrowActivityEvent' && table.schema === 'core'
          ? activities
          : [];
    const allowedIds = new Set([
      ...original.rows.map((row) => row.id),
      ...inserted.map((row) => row.after.id),
      ...extras.map((row) => row.id),
    ]);
    for (const row of table.rows) {
      assert(
        allowedIds.has(row.id),
        `Unexpected row ${table.schema}.${table.name}.`,
      );
      if (extras.some((item) => item.id === row.id)) continue;
      const previous = original.rows.find((item) => item.id === row.id);
      const declared = fixture.rowChanges.filter(
        (item) =>
          item.schema === table.schema &&
          item.table === table.name &&
          item.after.id === row.id,
      );
      const accepted = [
        previous?.body,
        ...declared.map((item) => item.after),
      ].filter(Boolean);
      if (
        table.schema === 'core' &&
        table.name === 'deliveryCommitmentAllocation' &&
        committed.has(row.id)
      ) {
        const command = committed.get(row.id);
        const expected = {
          ...previous.body,
          state: 'REMOVED',
          revision: command.input.allocationRevision + 1,
        };
        assert(
          Date.parse(row.body.updatedAt) >=
            Date.parse(fixture.databaseCreatedAt),
        );
        expected.updatedAt = row.body.updatedAt;
        assert.deepEqual(row.body, expected);
      } else
        assert(
          accepted.some((body) => isDeepStrictEqual(body, row.body)),
          `Unplanned mutation ${table.schema}.${table.name}:${row.id}`,
        );
    }
    for (const previous of original.rows)
      assert(
        table.rows.some((row) => row.id === previous.id),
        'An original fixture row disappeared.',
      );
  }
  return actual;
}

async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    for (const id of [fixture.workspaceId, fixture.foreignWorkspaceId].sort())
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${id}`],
      );
    const exists = await manager.query(
      'SELECT id FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    if (exists.length)
      for (const name of ['task', 'company', 'workspaceMember'])
        await manager.query(
          `LOCK TABLE "${fixture.schemaName}"."${name}" IN ACCESS EXCLUSIVE MODE`,
        );
    const rows = await validate(manager, fixture);
    if (!rows) return;
    const order = [
      'deliveryCommitmentEvent',
      'deliveryCommitmentAllocation',
      'deliveryCommitmentLine',
      'deliveryCommitmentPeriod',
      'deliveryReviewAssignment',
      'deliveryTask',
      'otogrowActivityEvent',
      'deliveryOperations',
      'roleTarget',
      'role',
      'otogrowRoleAssignment',
      'otogrowMemberAccess',
      'otogrowAccessEvent',
      'otogrowRole',
      'deliveryProject',
      'userWorkspace',
      'user',
      'workspace',
    ];
    for (const table of rows.filter(
      (item) => item.schema === 'core' && item.rows.length,
    ))
      assert(
        order.includes(table.name),
        `No cleanup is declared for ${table.name}`,
      );
    for (const name of order) {
      const table = rows.find(
        (item) => item.schema === 'core' && item.name === name,
      );
      const ids = table?.rows.map((row) => row.id) ?? [];
      if (!ids.length) continue;
      await manager.query(
        `SELECT id FROM core."${name}" WHERE id=ANY($1::uuid[]) FOR UPDATE`,
        [ids],
      );
      const removed = await manager.query(
        `WITH removed AS (DELETE FROM core."${name}" WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
        [ids],
      );
      assert.deepEqual(removed.map((row) => row.id).sort(), ids.sort());
    }
    const remaining = await ownedRows(manager, fixture);
    assert(
      remaining
        .filter((item) => item.schema === 'core')
        .every((table) => table.rows.length === 0),
      'Unexpected owned rows remain; preserve them.',
    );
    assert.equal(await schemaFingerprint(manager), fixture.seedSchema);
    await manager.query(`DROP SCHEMA "${fixture.schemaName}" CASCADE`);
    assert.equal(
      await originalDigest((...args) => manager.query(...args)),
      fixture.original,
    );
    assert.equal(await schemaFingerprint(manager), fixture.originalSchema);
    if (process.env.OTOGROW_NATIVE_COMMITMENTS_FAILURE === 'CLEANUP_PRECOMMIT')
      throw new Error('Injected CLEANUP_PRECOMMIT failure');
  });
  const receipt = `${FILE}.${fixture.workspaceId}.cleaned.json`;
  const evidence = {
    checker: CHECKER,
    workspaceId: fixture.workspaceId,
    original: fixture.original,
    originalSchema: fixture.originalSchema,
    checks: fixture.checks,
    cleaned: true,
  };
  if (existsSync(receipt))
    assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), evidence);
  else writeJournal(evidence, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
}

async function main() {
  assert.equal(process.env.OTOGROW_NATIVE_COMMITMENTS_SERVICES_STOPPED, '1');
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const mode = process.argv[2] ?? 'run';
  assert(
    ['run', 'inspect', 'cleanup'].includes(mode) && process.argv.length <= 3,
  );
  if (mode === 'run')
    assert(!existsSync(FILE), 'Inspect the retained exact journal first.');
  await connectionSource.initialize();
  if (mode !== 'run') {
    try {
      const fixture = readJournal();
      if (mode === 'cleanup') await cleanup(fixture);
      else
        await connectionSource.transaction((manager) =>
          validate(manager, fixture),
        );
      console.log(`PASS native commitment race ${mode}`);
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  const sessions = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 2,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 2,
          application_name: `otogrow-native-commitment-race-${index}`,
        },
      }),
  );
  const releases = [],
    pending = [];
  let fixture;
  const gates = [null, null];
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const hold = () => {
    const entered = deferred(),
      release = deferred();
    releases.push(release);
    return {
      entered,
      release,
      run: async () => {
        entered.resolve();
        await bounded(release.promise);
      },
    };
  };
  const sourceFor = (source, index) => ({
    manager: source.manager,
    query: (...args) => source.query(...args),
    getRepository: (entity) => source.getRepository(entity),
    transaction: (operation) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL statement_timeout='12s'");
        const value = await operation(manager);
        const gate = gates[index];
        gates[index] = null;
        if (gate) await gate.run();
        return value;
      }),
  });
  const waitBlocked = (pid, expected) =>
    bounded(
      (async () => {
        while (true) {
          const [state] = await connectionSource.query(
            'SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1',
            [pid],
          );
          if (state?.wait_event_type === 'Lock') {
            assert(
              expected.includes(state.wait_event),
              `Unexpected lock wait ${state.wait_event}.`,
            );
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      })(),
      'The independent session never waited for the expected database lock.',
    );
  try {
    await Promise.all(sessions.map((source) => source.initialize()));
    const original = await originalDigest((...args) =>
      connectionSource.query(...args),
    );
    const originalSchema = await schemaFingerprint(connectionSource);
    await connectionSource.transaction(async (manager) => {
      fixture = await seed(manager, 'native_commit_race');
      fixture.races = {};
      for (const [key, base] of [
        ['restoreAfter', 'deleted'],
        ['moveAfter', 'moved'],
        ['sameRequest', 'deleted'],
        ['insertAfter', 'missing'],
        ['lockTimeout', 'missing'],
        ['closedPeriod', 'deleted'],
        ['cancelFirst', 'deleted'],
        ['removeFirst', 'deleted'],
      ]) {
        const taskId = randomUUID(),
          allocationId = randomUUID();
        fixture.tasks[key] = taskId;
        fixture.allocations[key] = allocationId;
        if (base !== 'missing') {
          await manager.query(
            `INSERT INTO "${fixture.schemaName}".task SELECT $1,title,"assigneeId","dueAt","deletedAt" FROM "${fixture.schemaName}".task WHERE id=$2`,
            [taskId, fixture.tasks[base]],
          );
          await manager.query(
            'INSERT INTO core."deliveryTask"("workspaceId","taskId","projectId",details,revision) SELECT "workspaceId",$1,"projectId",details,revision FROM core."deliveryTask" WHERE "workspaceId"=$3 AND "taskId"=$2',
            [taskId, fixture.tasks[base], fixture.workspaceId],
          );
        }
        await manager.query(
          'INSERT INTO core."deliveryCommitmentAllocation"(id,"workspaceId","periodId","lineId","taskId","taskName","parentTaskId",state,revision,"creditedCycle","creditedSubmissionVersion","fulfilledAt","createdAt","updatedAt") SELECT $1,"workspaceId","periodId","lineId",$2,"taskName",NULL,state,revision,"creditedCycle","creditedSubmissionVersion","fulfilledAt","createdAt","updatedAt" FROM core."deliveryCommitmentAllocation" WHERE id=$3',
          [allocationId, taskId, fixture.allocations[base]],
        );
      }
      fixture = {
        ...fixture,
        checker: CHECKER,
        createdAt: new Date().toISOString(),
        databaseCreatedAt: (
          await manager.query('SELECT now() AS at')
        )[0].at.toISOString(),
        original,
        originalSchema,
        commands: [],
        rowChanges: [],
        checks: [],
      };
      fixture.seed = await allOwnedRows(manager, fixture);
      fixture.seedSchema = await schemaFingerprint(manager);
      save(fixture, true);
      if (process.env.OTOGROW_NATIVE_COMMITMENTS_FAILURE === 'CREATE_PRECOMMIT')
        throw new Error('Injected CREATE_PRECOMMIT failure');
    });
    const tests = sessions.map((source, index) =>
      harness(sourceFor(source, index), fixture),
    );
    const declareCommand = (key, maySucceed, terminal = 'REMOVED') => {
      const input = tests[0].cleanupInput(key);
      fixture.commands.push({
        input,
        maySucceed,
        terminal,
        declaredAt: new Date().toISOString(),
      });
      save(fixture);
      return input;
    };
    const declareRow = (schema, table, id, patch, insert = null) => {
      const before =
        fixture.seed
          .find((entry) => entry.schema === schema && entry.name === table)
          .rows.find((row) => row.id === id)?.body ?? null;
      assert(before || insert);
      fixture.rowChanges.push({
        schema,
        table,
        before,
        after: before ? { ...before, ...patch } : insert,
      });
      save(fixture);
    };
    const nativeRestore = (key) =>
      declareRow(fixture.schemaName, 'task', fixture.tasks[key], {
        deletedAt: null,
      });
    const managedReturn = (key) => {
      const row = fixture.seed
        .find(
          (entry) => entry.schema === 'core' && entry.name === 'deliveryTask',
        )
        .rows.find((item) => item.body.taskId === fixture.tasks[key]);
      declareRow('core', 'deliveryTask', row.id, {
        projectId: fixture.projects.first,
      });
    };
    const insertBody = (key) => ({
      id: fixture.tasks[key],
      title: `Visible FIXTURE inserted ${key}`,
      assigneeId: fixture.people.writer.memberId,
      dueAt: null,
      deletedAt: null,
    });
    const declareInsert = (key) =>
      declareRow(
        fixture.schemaName,
        'task',
        fixture.tasks[key],
        {},
        insertBody(key),
      );
    const insert = (manager, key) =>
      manager.query(
        `INSERT INTO "${fixture.schemaName}".task(id,title,"assigneeId","dueAt","deletedAt") VALUES ($1,$2,$3,NULL,NULL)`,
        [
          fixture.tasks[key],
          insertBody(key).title,
          fixture.people.writer.memberId,
        ],
      );
    const raw = async (index, operation, gate = null) =>
      sessions[index].transaction(async (manager) => {
        await manager.query("SET LOCAL statement_timeout='12s'");
        const [{ pid }] = await manager.query('SELECT pg_backend_pid() AS pid');
        const result = await operation(manager, pid);
        if (gate) await gate.run();
        return result;
      });
    const servicePid = (index) =>
      bounded(
        (async () => {
          while (true) {
            const rows = await connectionSource.query(
              "SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND state<>'idle' ORDER BY query_start DESC",
              [`otogrow-native-commitment-race-${index}`],
            );
            assert(rows.length <= 1);
            if (rows.length) return rows[0].pid;
            await new Promise((resolve) => setTimeout(resolve, 15));
          }
        })(),
        'The independent service session did not start.',
      );
    const assertCase = async (name) => {
      await connectionSource.transaction((manager) =>
        validate(manager, fixture),
      );
      fixture.checks.push(name);
      save(fixture);
    };
    const beginCleanup = (index, input, method = 'removeOrphanAllocation') =>
      track(tests[index].call(method, input));

    for (const [key, kind] of [
      ['deleted', 'restore'],
      ['moved', 'move'],
      ['missing', 'insert'],
    ]) {
      const input = declareCommand(key, false);
      if (kind === 'restore') nativeRestore(key);
      if (kind === 'move') managedReturn(key);
      if (kind === 'insert') declareInsert(key);
      const gate = hold();
      const first = track(
        raw(
          0,
          async (manager) => {
            if (kind === 'restore')
              await manager.query(
                `UPDATE "${fixture.schemaName}".task SET "deletedAt"=NULL WHERE id=$1`,
                [fixture.tasks[key]],
              );
            if (kind === 'move') {
              await manager.query(
                'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
                [`delivery:${fixture.workspaceId}`],
              );
              await manager.query(
                'UPDATE core."deliveryTask" SET "projectId"=$2 WHERE "workspaceId"=$3 AND "taskId"=$1',
                [
                  fixture.tasks[key],
                  fixture.projects.first,
                  fixture.workspaceId,
                ],
              );
            }
            if (kind === 'insert') await insert(manager, key);
          },
          gate,
        ),
      );
      await bounded(gate.entered.promise);
      const second = beginCleanup(1, input);
      await waitBlocked(
        await servicePid(1),
        kind === 'move'
          ? ['advisory']
          : kind === 'insert'
            ? ['relation']
            : ['transactionid', 'tuple'],
      );
      gate.release.resolve();
      await bounded(first);
      await assert.rejects(
        () => bounded(second),
        (error) => error.status === 409,
      );
      await assertCase(
        `${kind} wins first; cleanup waits and rejects the fresh live source`,
      );
    }

    for (const [key, kind] of [
      ['restoreAfter', 'restore'],
      ['moveAfter', 'move'],
      ['insertAfter', 'insert'],
    ]) {
      const input = declareCommand(key, true);
      if (kind === 'restore') nativeRestore(key);
      if (kind === 'move') managedReturn(key);
      if (kind === 'insert') declareInsert(key);
      const gate = hold();
      gates[0] = gate;
      const first = beginCleanup(0, input);
      await bounded(gate.entered.promise);
      let pid;
      const entered = deferred();
      const second = track(
        raw(1, async (manager, processId) => {
          pid = processId;
          entered.resolve();
          if (kind === 'restore')
            await manager.query(
              `UPDATE "${fixture.schemaName}".task SET "deletedAt"=NULL WHERE id=$1`,
              [fixture.tasks[key]],
            );
          if (kind === 'move') {
            await manager.query(
              'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
              [`delivery:${fixture.workspaceId}`],
            );
            await manager.query(
              'UPDATE core."deliveryTask" SET "projectId"=$2 WHERE "workspaceId"=$3 AND "taskId"=$1',
              [fixture.tasks[key], fixture.projects.first, fixture.workspaceId],
            );
          }
          if (kind === 'insert') await insert(manager, key);
        }),
      );
      await bounded(entered.promise);
      await waitBlocked(
        pid,
        kind === 'move'
          ? ['advisory']
          : kind === 'insert'
            ? ['relation']
            : ['transactionid', 'tuple'],
      );
      gate.release.resolve();
      assert.equal((await bounded(first)).state, 'REMOVED');
      await bounded(second);
      assert.equal((await tests[0].allocation(key)).state, 'REMOVED');
      if (kind === 'restore')
        await sessions[0].transaction(async (manager) => {
          const current = await manager
            .getRepository(DeliveryTaskEntity)
            .findOneByOrFail({
              workspaceId: fixture.workspaceId,
              taskId: fixture.tasks[key],
            });
          const state = (
            await manager
              .getRepository(DeliveryOperationsEntity)
              .findOneByOrFail({ workspaceId: fixture.workspaceId })
          ).state;
          await syncDeliveryCommitment(
            manager,
            fixture.workspaceId,
            current.taskId,
            current.details,
            state.fulfilments.find((row) => row.taskId === current.taskId),
            { actorId: null, actorType: 'SYSTEM' },
          );
        });
      await assertCase(
        `cleanup wins first; ${kind} waits and cannot reverse its contract removal`,
      );
    }

    {
      const input = declareCommand('sameRequest', true);
      const gate = hold();
      gates[0] = gate;
      const first = beginCleanup(0, input);
      await bounded(gate.entered.promise);
      const second = beginCleanup(1, input);
      await waitBlocked(await servicePid(1), ['advisory']);
      gate.release.resolve();
      assert.deepEqual(await bounded(first), await bounded(second));
      await assertCase(
        'Two sessions replay one fixed request with one event and one activity',
      );
    }

    {
      const input = declareCommand('lockTimeout', false);
      const gate = hold();
      const holder = track(
        raw(
          0,
          async (manager) =>
            manager.query(
              `LOCK TABLE "${fixture.schemaName}".task IN ROW EXCLUSIVE MODE`,
            ),
          gate,
        ),
      );
      await bounded(gate.entered.promise);
      const operation = beginCleanup(1, input);
      await waitBlocked(await servicePid(1), ['relation']);
      await assert.rejects(
        () => bounded(operation),
        (error) =>
          error.status === 409 && /current source safely/i.test(error.message),
      );
      gate.release.resolve();
      await bounded(holder);
      await assertCase(
        'Absent-source table-lock timeout rolls the entire cleanup back',
      );
    }

    for (const [key, method, terminal] of [
      ['cancelFirst', 'cancelOrphanCleanup', 'CANCELLED'],
      ['removeFirst', 'removeOrphanAllocation', 'REMOVED'],
    ]) {
      const input = declareCommand(key, true, terminal);
      const before = await tests[0].allocation(key);
      const gate = hold();
      gates[0] = gate;
      const first = beginCleanup(0, input, method);
      await bounded(gate.entered.promise);
      const second = beginCleanup(
        1,
        input,
        method === 'cancelOrphanCleanup'
          ? 'removeOrphanAllocation'
          : 'cancelOrphanCleanup',
      );
      await waitBlocked(await servicePid(1), ['advisory']);
      gate.release.resolve();
      const winner = await bounded(first);
      assert.equal(winner.state, terminal);
      assert.deepEqual(await bounded(second), winner);
      assert.deepEqual(
        await tests[0].call('orphanCleanupReceipt', input),
        winner,
      );
      if (terminal === 'CANCELLED')
        assert.deepEqual(await tests[0].allocation(key), before);
      else assert.equal((await tests[0].allocation(key)).state, 'REMOVED');
      await assertCase(
        `${terminal} wins the exact request; the opposite late action returns that historical result once`,
      );
    }

    {
      const input = declareCommand('closedPeriod', false);
      declareRow('core', 'deliveryCommitmentPeriod', fixture.periodId, {
        state: 'CLOSED',
        revision: 4,
      });
      const gate = hold();
      const closing = track(
        raw(
          0,
          async (manager) => {
            await manager.query(
              'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
              [`delivery:${fixture.workspaceId}`],
            );
            await manager.query(
              'UPDATE core."deliveryCommitmentPeriod" SET state=\'CLOSED\',revision=4 WHERE id=$1',
              [fixture.periodId],
            );
          },
          gate,
        ),
      );
      await bounded(gate.entered.promise);
      const operation = beginCleanup(1, input);
      await waitBlocked(await servicePid(1), ['advisory']);
      gate.release.resolve();
      await bounded(closing);
      await assert.rejects(
        () => bounded(operation),
        (error) => error.status === 409,
      );
      await assertCase(
        'Period closure wins its shared delivery lock; stale cleanup has no effects',
      );
    }
    await cleanup(fixture);
    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          checks: fixture.checks.length,
          evidence: fixture.checks,
          preservation:
            'Independent PostgreSQL sessions and actual Commitments service; raw source restore/insert/project movement exercises the database lock contract. Isolated native metadata, exact predeclared mutations and immutable receipts, complete original data/schema restoration. No API, worker, shared-cache, provider or message.',
        },
        null,
        2,
      ),
    );
  } finally {
    for (const release of releases) release.resolve();
    await Promise.allSettled(pending);
    for (const source of sessions)
      if (source.isInitialized) await source.destroy();
    if (connectionSource.isInitialized) await connectionSource.destroy();
  }
}

main().catch((error) => {
  console.error(error.stack);
  console.error(`Preserve ${FILE}; use its guarded inspect/cleanup commands.`);
  process.exitCode = 1;
});

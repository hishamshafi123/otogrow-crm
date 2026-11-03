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
  advertisingHarness,
  newReviewInput,
} = require('./check-delivery-advertising-support.cjs');
const {
  REVIEW_TABLES,
  SOURCE_TABLES,
  cleanupReviewFixture,
} = require('./check-delivery-creative-review-support.cjs');

const FILE = '/tmp/otogrow-advertising-concurrency-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PROTECTED_TABLES = [
  ...new Set([
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
  assert.equal(fixture.checker, 'advertising-concurrency-v1');
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
      for (const table of TABLES)
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
  );
  if (process.argv.length === 3) {
    assert.equal(process.argv[2], 'cleanup');
    await connectionSource.initialize();
    try {
      await cleanup(readJournal());
      console.log(
        'Recovered only the ownership-verified advertising concurrency fixture.',
      );
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  assert.equal(process.argv.length, 2);
  assert(
    !existsSync(FILE),
    `Recover ${FILE} with this checker\'s cleanup command first.`,
  );
  const name = `advertising-race:${randomUUID()}`;
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
    afterRead = [null, null],
    sessions = [null, null],
    locks = [[], []];
  let fixture,
    barrier = null,
    networkCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    networkCalls++;
    throw new Error(
      'Network is forbidden in advertising concurrency acceptance.',
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
    transaction: (callback) =>
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
          current.arrivals.add(index);
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
          const result = await callback(manager);
          if (afterRead[index]) {
            afterRead[index].entered.resolve();
            await bounded(
              afterRead[index].release.promise,
              'Held read was not released.',
            );
          }
          return result;
        } finally {
          manager.query = query;
        }
      }),
  }));
  const paired = async (first, second) => {
    locks[0] = [];
    locks[1] = [];
    barrier = { arrivals: new Set(), ready: deferred() };
    const result = await bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Independent assignment commands did not settle.',
    );
    assert.notEqual(sessions[0].pid, sessions[1].pid);
    assert.notEqual(sessions[0].transaction, sessions[1].transaction);
    for (const log of locks)
      assert(
        log[0]?.includes('pg_advisory_xact_lock('),
        'Assignment must acquire the exclusive workspace lock before nested reads/task creation.',
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
      'Command did not demonstrably wait behind the workspace lock.',
    );
  };
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    await connectionSource.transaction(async (manager) => {
      fixture = await seedAdvertisingFixture(manager);
      fixture.checker = 'advertising-concurrency-v1';
      fixture.protectedBefore = await protectedRows(manager, fixture);
      journal(fixture, FILE, true);
    });
    const calls = scoped.map((source) =>
      advertisingHarness(advertisingServices(source, fixture), fixture),
    );
    const tasks = async () =>
      (
        await connectionSource.query(
          `SELECT id FROM "${fixture.schemaName}".task ORDER BY id`,
        )
      ).map((row) => row.id);
    const countReceipt = async (requestId) =>
      (
        await connectionSource.query(
          'SELECT count(*)::int AS count FROM core."deliveryAdvertisingEvent" WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, requestId],
        )
      )[0].count;
    const prepare = async (index, person = fixture.people.admin) => {
      const source = await calls[0](
        'source',
        { kind: 'META', id: fixture.metaReports[index].id },
        person,
      );
      const input = newReviewInput(fixture, source);
      input.actions.push({
        ...input.actions[0],
        id: randomUUID(),
        ownerId: fixture.people.secondWriter.memberId,
        title: 'A second independent recommendation',
      });
      const saved = await calls[0]('save', input, person);
      return {
        input,
        command: {
          requestId: randomUUID(),
          id: input.id,
          revision: saved.receipt.revision,
          sourceFingerprint: source.fingerprint,
        },
      };
    };
    const one = await prepare(0);
    const before = await tasks();
    const identical = await paired(
      () => calls[0]('assign', one.command),
      () => calls[1]('assign', one.command),
    );
    assert(
      identical.every((result) => result.status === 'fulfilled'),
      String(identical.find((result) => result.status === 'rejected')?.reason),
    );
    assert.deepEqual(identical[0].value.receipt, identical[1].value.receipt);
    assert.equal(await countReceipt(one.command.requestId), 1);
    assert.equal((await tasks()).length, before.length + 2);
    assert.equal(
      new Set(identical[0].value.receipt.actionTasks.map((task) => task.taskId))
        .size,
      2,
    );
    const receipt = (
      await calls[1]('receipt', { requestId: one.command.requestId })
    ).receipt;
    assert.deepEqual(
      receipt,
      identical[0].value.receipt,
      'A separate connection can recover a committed result after a lost reply.',
    );
    assert.deepEqual((await calls[1]('assign', one.command)).receipt, receipt);
    assert.equal((await tasks()).length, before.length + 2);

    const two = await prepare(1);
    const otherCommand = { ...two.command, requestId: randomUUID() };
    const beforeDifferent = await tasks();
    const competing = await paired(
      () => calls[0]('assign', two.command),
      () => calls[1]('assign', otherCommand),
    );
    assert.equal(
      competing.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      competing
        .find((result) => result.status === 'rejected')
        .reason.getStatus?.(),
      409,
    );
    assert.equal(
      (await countReceipt(two.command.requestId)) +
        (await countReceipt(otherCommand.requestId)),
      1,
    );
    assert.equal((await tasks()).length, beforeDifferent.length + 2);

    const revoke = async (prepared, mutate, person, statuses) => {
      const beforeTasks = await tasks();
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
      const waiting = track(calls[0]('assign', prepared.command, person));
      await waitForBlocked(0, pid);
      await mutate(blocker.manager);
      await blocker.commitTransaction();
      await blocker.release();
      await assert.rejects(
        () => bounded(waiting, 'Revoked assignment did not settle.'),
        (error) => statuses.includes(error.getStatus?.()),
      );
      assert.deepEqual(await tasks(), beforeTasks);
      assert.equal(await countReceipt(prepared.command.requestId), 0);
      const [packet] = await connectionSource.query(
        'SELECT state,revision FROM core."deliveryAdvertisingReview" WHERE "workspaceId"=$1 AND id=$2',
        [fixture.workspaceId, prepared.input.id],
      );
      assert.deepEqual(packet, { state: 'DRAFT', revision: 1 });
      const [source] = await connectionSource.query(
        'SELECT status FROM core."deliveryMetaReport" WHERE "workspaceId"=$1 AND id=$2',
        [fixture.workspaceId, prepared.input.sourceId],
      );
      assert.equal(source.status, 'REVIEW');
    };
    const project = await prepare(2);
    await revoke(
      project,
      (manager) =>
        manager.query(
          'UPDATE core."deliveryProject" SET "memberIds"=$3,revision=revision+1 WHERE "workspaceId"=$1 AND id=$2',
          [
            fixture.workspaceId,
            fixture.projects.first,
            JSON.stringify([fixture.people.secondWriter.memberId]),
          ],
        ),
      fixture.people.admin,
      [403, 409],
    );
    await connectionSource.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$3,revision=revision+1 WHERE "workspaceId"=$1 AND id=$2',
      [
        fixture.workspaceId,
        fixture.projects.first,
        JSON.stringify([
          fixture.people.writer.memberId,
          fixture.people.secondWriter.memberId,
        ]),
      ],
    );
    const role = await prepare(3, fixture.people.reader);
    await revoke(
      role,
      (manager) =>
        manager.query(
          'UPDATE core."otogrowRole" SET capabilities=$3,revision=revision+1 WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, fixture.roles.reader, []],
        ),
      fixture.people.reader,
      [403, 404],
    );
    await connectionSource.query(
      'UPDATE core."otogrowRole" SET capabilities=$3,revision=revision+1 WHERE "workspaceId"=$1 AND id=$2',
      [fixture.workspaceId, fixture.roles.reader, ['delivery.manage']],
    );

    const ordered = await prepare(4);
    afterRead[0] = { entered: deferred(), release: deferred() };
    locks[0] = [];
    locks[1] = [];
    const reading = track(
      calls[0]('source', {
        kind: 'META',
        id: ordered.input.sourceId,
        metadataOnly: true,
      }),
    );
    await bounded(
      afterRead[0].entered.promise,
      'The independent shared read did not complete.',
    );
    assert(locks[0][0]?.includes('pg_advisory_xact_lock_shared('));
    const assigning = track(calls[1]('assign', ordered.command));
    await waitForBlocked(1, sessions[0].pid);
    afterRead[0].release.resolve();
    afterRead[0] = null;
    const [, result] = await bounded(
      Promise.all([reading, assigning]),
      'Shared reader and exclusive task assignment deadlocked.',
    );
    assert(locks[1][0]?.includes('pg_advisory_xact_lock('));
    assert.equal(result.receipt.actionTasks.length, 2);
    assert.equal(await countReceipt(ordered.command.requestId), 1);
    assert.equal(networkCalls, 0);
    assert.deepEqual(
      await protectedRows(connectionSource.manager, fixture),
      fixture.protectedBefore,
    );
    console.log(
      'PASS independent advertising sessions: one receipt/task set for identical assignments, one conflict for competing commands, exact lost-reply recovery, serialized project/role revocation, and shared-read/exclusive-write ordering without deadlock. No provider calls.',
    );
  } finally {
    barrier?.ready.resolve();
    barrier = null;
    for (const hold of afterRead) hold?.release.resolve();
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
    if (connectionSource.isInitialized) {
      try {
        if (fixture && existsSync(FILE)) await cleanup(readJournal());
      } finally {
        await connectionSource.destroy();
      }
    }
    global.fetch = originalFetch;
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

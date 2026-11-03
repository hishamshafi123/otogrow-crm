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
  REVIEW_TABLES,
  SOURCE_TABLES,
  createReviewFixture,
  cleanupReviewFixture,
  buildReviewServices,
  reviewHarness,
  sourceFingerprint,
  alterDetails,
  correction,
} = require('./check-delivery-creative-review-support.cjs');

const FILE = '/tmp/otogrow-creative-review-concurrency-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
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
function writeJournal(value, destination = FILE, initial = false) {
  const temporary = `${destination}.${randomUUID()}.tmp`,
    descriptor = openSync(temporary, 'wx', 0o600);
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
  for (const value of [
    fixture.workspaceId,
    fixture.foreignWorkspaceId,
    fixture.taskId,
    fixture.otherTaskId,
    fixture.foreignTaskId,
  ])
    assert.match(value, UUID);
  assert.match(fixture.schemaName, /^creative_review_race_[a-f0-9_]{36}$/);
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  return fixture;
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='5s'");
    await manager.query("SET LOCAL statement_timeout='30s'");
    const rows = await manager.query(
      'SELECT id FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    if (rows.length) await cleanupReviewFixture(manager, fixture);
    else {
      for (const name of [
        ...SOURCE_TABLES,
        ...REVIEW_TABLES,
        'deliveryOperations',
        'otogrowActivityEvent',
        'otogrowRole',
        'otogrowRoleAssignment',
        'otogrowMemberAccess',
        'otogrowAccessEvent',
        'userWorkspace',
      ]) {
        const [{ count }] = await manager.query(
          `SELECT count(*)::int AS count FROM core."${name}" WHERE "workspaceId"=ANY($1::uuid[])`,
          [[fixture.workspaceId, fixture.foreignWorkspaceId]],
        );
        assert.equal(count, 0, `Interrupted cleanup left ${name}.`);
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
    }
  });
  const receipt = `${FILE}.${fixture.workspaceId}.cleaned.json`,
    value = {
      workspaceId: fixture.workspaceId,
      foreignWorkspaceId: fixture.foreignWorkspaceId,
      schemaName: fixture.schemaName,
      sentinel: fixture.sentinel,
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
  );
  if (process.argv.length === 3) {
    assert.equal(process.argv[2], 'cleanup');
    await connectionSource.initialize();
    try {
      await cleanup(readJournal());
      console.log(
        'Recovered only the ownership-verified creative review concurrency fixture.',
      );
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  assert.equal(process.argv.length, 2);
  assert(
    !existsSync(FILE),
    `Recover ${FILE} with this checker's cleanup command first.`,
  );
  const sessionName = `creative-review-qa:${randomUUID()}`;
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${sessionName}:${index}`,
        },
      }),
  );
  let fixture,
    barrier = null;
  const pending = [],
    blockers = [];
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
        const current = barrier;
        if (current) {
          current.arrivals.add(index);
          if (current.arrivals.size === 2) {
            barrier = null;
            current.ready.resolve();
          }
          await bounded(
            current.ready.promise,
            'Independent review sessions did not reach the barrier.',
          );
        }
        return callback(manager);
      }),
  }));
  const paired = async (first, second) => {
    const before = await sourceFingerprint(connectionSource.manager, fixture);
    barrier = { arrivals: new Set(), ready: deferred() };
    const result = await bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Creative review race did not settle.',
    );
    assert.deepEqual(
      await sourceFingerprint(connectionSource.manager, fixture),
      before,
      'Concurrent annotations changed production or financial sources.',
    );
    return result;
  };
  const values = (results) =>
    results.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    });
  const oneConflict = (results) => {
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      results.find((result) => result.status === 'rejected').reason.getStatus(),
      409,
    );
  };
  const blocked = async (operation, mutate, expectedStatus) => {
    const blocker = connectionSource.createQueryRunner();
    blockers.push(blocker);
    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`delivery:${fixture.workspaceId}`],
    );
    const waiting = track(operation());
    await mutate(blocker.manager);
    await blocker.commitTransaction();
    await blocker.release();
    await assert.rejects(
      () =>
        bounded(
          waiting,
          'The waiting command did not settle after the serialized source change.',
        ),
      (error) => error.getStatus?.() === expectedStatus,
    );
  };
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    await connectionSource.transaction(async (manager) => {
      fixture = await createReviewFixture(manager, 'creative_review_race');
      writeJournal(fixture, FILE, true);
    });
    const tests = scoped.map((source) =>
      reviewHarness(buildReviewServices(source, fixture), fixture),
    );
    const v1 = (await tests[0].read({ submissionVersion: 1 })).selected,
      v2 = (await tests[0].read()).selected;
    const commandId = randomUUID(),
      command = { commandId, body: 'Concurrent stable feedback command' };
    const created = values(
      await paired(
        () => tests[0].create(v1, command, fixture.people.reader),
        () => tests[1].create(v1, command, fixture.people.reader),
      ),
    );
    assert.deepEqual(created.map((result) => result.replayed).sort(), [
      false,
      true,
    ]);
    assert.equal(created[0].feedback.id, created[1].feedback.id);
    let feedback = created[0].feedback;
    const replyId = randomUUID(),
      reply = { commandId: replyId, body: 'Concurrent stable reply command' };
    const replied = values(
      await paired(
        () => tests[0].change(feedback, 'REPLY', reply, fixture.people.writer),
        () => tests[1].change(feedback, 'REPLY', reply, fixture.people.writer),
      ),
    );
    assert.deepEqual(replied.map((result) => result.replayed).sort(), [
      false,
      true,
    ]);
    feedback = replied[0].feedback;
    assert.equal((await tests[0].history(feedback.id)).events.length, 2);
    const separate = values(
      await paired(
        () =>
          tests[0].create(
            v2,
            { body: 'First independent concurrent note' },
            fixture.people.reader,
          ),
        () =>
          tests[1].create(
            v2,
            { body: 'Second independent concurrent note' },
            fixture.people.writer,
          ),
      ),
    );
    assert.notEqual(separate[0].feedback.id, separate[1].feedback.id);
    assert.equal((await tests[0].read()).feedbackCount, 2);
    oneConflict(
      await paired(
        () => tests[0].change(feedback, 'RESOLVED', correction(v2)),
        () =>
          tests[1].change(
            feedback,
            'REPLY',
            { body: 'Competing editor reply' },
            fixture.people.writer,
          ),
      ),
    );
    const fresh = (
      await tests[0].read({
        submissionVersion: 1,
        selectedFeedbackId: feedback.id,
      })
    ).selectedFeedback;
    assert.equal(fresh.revision, feedback.revision + 1);
    assert.equal((await tests[0].history(feedback.id)).events.length, 3);
    await blocked(
      () =>
        tests[0].create(
          v2,
          { body: 'Revoked reader may not comment' },
          fixture.people.reader,
        ),
      (manager) =>
        manager.query(
          'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE "workspaceId"=$1 AND id=$3',
          [
            fixture.workspaceId,
            JSON.stringify([fixture.people.writer.memberId]),
            fixture.projects.first,
          ],
        ),
      404,
    );
    await connectionSource.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE "workspaceId"=$1 AND id=$3',
      [
        fixture.workspaceId,
        JSON.stringify([
          fixture.people.writer.memberId,
          fixture.people.reader.memberId,
        ]),
        fixture.projects.first,
      ],
    );
    await blocked(
      () =>
        tests[0].create(v2, {
          body: 'Old token cannot follow changed bytes metadata',
        }),
      (manager) =>
        alterDetails(manager, fixture, (details) => {
          details.creative.assets.find(
            (asset) => asset.id === fixture.assets.image,
          ).name = 'Changed synthetic image metadata';
        }),
      409,
    );
    const renewed = (await tests[0].read()).selected;
    const independent = await tests[0].create(renewed, {
      body: 'Independent reviewer revocation race',
    });
    await blocked(
      () =>
        tests[0].change(independent.feedback, 'RESOLVED', correction(renewed)),
      (manager) =>
        alterDetails(manager, fixture, (details) => {
          details.reviewerId = fixture.people.writer.memberId;
        }),
      403,
    );
    await alterDetails(connectionSource.manager, fixture, (details) => {
      details.reviewerId = fixture.people.admin.memberId;
    });
    await blocked(
      () => tests[0].create(v1, command, fixture.people.reader),
      (manager) =>
        manager.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
          fixture.people.reader.userId,
        ]),
      403,
    );
    await connectionSource.query(
      'UPDATE core."user" SET disabled=false WHERE id=$1',
      [fixture.people.reader.userId],
    );
    assert.equal(
      (await tests[0].read({ submissionVersion: 1 })).selected.assetId,
      fixture.assets.video,
      'A newer source must not retarget historical feedback.',
    );
    console.log(
      'PASS isolated creative review independent-session races: one stable create/reply receipt, concurrent notes, optimistic conflict, current membership/reviewer revocation, old exact-source token rejection and no production/financial writes. No media/provider/network call.',
    );
  } finally {
    barrier?.ready.resolve();
    barrier = null;
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
        if (fixture && existsSync(FILE)) await cleanup(fixture);
      } finally {
        await connectionSource.destroy();
      }
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

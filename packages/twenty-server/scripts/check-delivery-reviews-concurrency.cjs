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
  REVIEW_TABLES,
  SOURCE_TABLES,
  createReviewsFixture,
  cleanupReviewsFixture,
  buildReviewsServices,
  reviewsHarness,
  sourceFingerprint,
  alterDetails,
  reviewNotices,
} = require('./check-delivery-reviews-support.cjs');

const FILE = '/tmp/otogrow-reviews-concurrency-fixture.json';
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
    ...fixture.queueTasks.map((row) => row.taskId),
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
    if (rows.length) await cleanupReviewsFixture(manager, fixture);
    else {
      for (const name of [
        ...SOURCE_TABLES,
        ...REVIEW_TABLES,
        ...TABLES,
        'deliveryRevision',
        'deliveryReminderOutbox',
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
        'Recovered only the ownership-verified review-assignment concurrency fixture.',
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
  const sessionName = `reviews-qa:${randomUUID()}`;
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
  const paired = async (first, second, allowDecision = false) => {
    const before = await sourceFingerprint(connectionSource.manager, fixture);
    barrier = { arrivals: new Set(), ready: deferred() };
    const result = await bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Creative review race did not settle.',
    );
    const after = await sourceFingerprint(connectionSource.manager, fixture);
    if (!allowDecision)
      assert.deepEqual(
        after,
        before,
        'Delegation must not alter source production/ownership/finance.',
      );
    else
      for (const [name, value] of Object.entries(before))
        if (!['deliveryTask', 'nativeTasks'].includes(name))
          assert.equal(
            after[name],
            value,
            'An explicit decision may not alter finance/fulfilment/ownership.',
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
      fixture = await createReviewsFixture(manager, true);
      writeJournal(fixture, FILE, true);
    });
    const tests = scoped.map((source) =>
      reviewsHarness(buildReviewsServices(source, fixture), fixture),
    );
    const { people } = fixture;
    const original = (
      await connectionSource.query(
        'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, fixture.taskId],
      )
    )[0].details;
    const primary = await tests[0].task(),
      commandId = randomUUID();
    const assigned = values(
      await paired(
        () => tests[0].assign(primary, { commandId }),
        () => tests[1].assign(primary, { commandId }),
      ),
    );
    assert.deepEqual(assigned.map((result) => result.replayed).sort(), [
      false,
      true,
    ]);
    assert.equal(assigned[0].assignment.id, assigned[1].assignment.id);
    assert.equal((await tests[0].history()).events.length, 1);
    const recipient = await tests[0].task({}, people.reader);
    const receiptRace = await paired(
      () => tests[0].seen(recipient, {}, people.reader),
      () =>
        tests[1].assign(recipient, {
          reviewerId: people.secondWriter.memberId,
          reason: 'Reassign while the old recipient opens the review',
        }),
    );
    assert.equal(receiptRace[1].status, 'fulfilled');
    if (receiptRace[0].status === 'rejected')
      assert.equal(receiptRace[0].reason.getStatus(), 409);
    const handoffs = await reviewNotices(connectionSource.manager, fixture),
      currentNotices = handoffs.filter((notice) => !notice.cancelled);
    assert.equal(currentNotices.length, 1);
    assert.equal(currentNotices[0].recipientId, people.secondWriter.memberId);
    assert.equal(currentNotices[0].seenAt, null);
    assert.equal(
      handoffs.find((notice) => notice.id === recipient.assignmentNotice.id)
        .cancelled,
      true,
    );
    let current = await tests[0].task();
    oneConflict(
      await paired(
        () =>
          tests[0].assign(current, {
            reviewerId: people.secondWriter.memberId,
            reason: 'First competing backup',
          }),
        () =>
          tests[1].assign(current, {
            mode: 'PRIMARY',
            reviewerId: null,
            reason: 'Competing primary restore',
          }),
      ),
    );
    assert.equal((await tests[0].history()).events.length, 3);
    current = await tests[0].task();
    await tests[0].assign(current, { reviewerId: people.reader.memberId });
    let backup = await tests[0].task({}, people.reader);
    const conflict = await paired(
      () => tests[0].decide(backup, {}, people.reader),
      () =>
        tests[1].assign(backup, {
          reviewerId: people.secondWriter.memberId,
          reason: 'Reassign while prior reviewer decides',
        }),
      true,
    );
    oneConflict(conflict);
    const stored = (
      await connectionSource.query(
        'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, fixture.taskId],
      )
    )[0].details;
    assert.equal(stored.reviewerId, people.admin.memberId);
    if (stored.state === 'APPROVED')
      assert.equal(stored.submissions[1].reviewedBy, people.reader.memberId);
    else assert.equal(stored.state, 'IN_REVIEW');
    await alterDetails(connectionSource.manager, fixture, (details) =>
      Object.assign(details, original),
    );
    await connectionSource.query(
      `UPDATE "${fixture.schemaName}".task SET status='IN_PROGRESS',"assigneeId"=$2 WHERE id=$1`,
      [fixture.taskId, people.writer.memberId],
    );
    current = await tests[0].task();
    await tests[0].assign(current, { reviewerId: people.reader.memberId });
    backup = await tests[0].task({}, people.reader);
    await blocked(
      () => tests[0].decide(backup, {}, people.reader),
      (manager) =>
        manager.query(
          'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
          [fixture.roles.reader, []],
        ),
      403,
    );
    assert.equal((await tests[0].task()).pending.reviewerState, 'UNAVAILABLE');
    assert.equal(
      (await tests[0].task({}, people.reader)).canReviewSubmission,
      false,
    );
    await connectionSource.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, ['delivery.review']],
    );
    backup = await tests[0].task({}, people.reader);
    await blocked(
      () => tests[0].decide(backup, {}, people.reader),
      (manager) =>
        manager.query(
          'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
          [
            fixture.projects.first,
            JSON.stringify([
              people.writer.memberId,
              people.secondWriter.memberId,
            ]),
          ],
        ),
      404,
    );
    await connectionSource.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
      [
        fixture.projects.first,
        JSON.stringify([
          people.writer.memberId,
          people.reader.memberId,
          people.secondWriter.memberId,
        ]),
      ],
    );
    current = await tests[0].task();
    await blocked(
      () =>
        tests[0].assign(current, { reviewerId: people.secondWriter.memberId }),
      (manager) =>
        alterDetails(manager, fixture, (details) =>
          details.submissions.push({
            ...details.submissions.at(-1),
            version: 3,
          }),
        ),
      409,
    );
    const next = await tests[0].task();
    assert.equal(next.assignment.revision, 0);
    assert.equal(next.assignment.mode, 'PRIMARY');
    assert.equal(next.pending.effectiveReviewerId, people.admin.memberId);
    await alterDetails(connectionSource.manager, fixture, (details) =>
      Object.assign(details, original),
    );
    backup = await tests[0].task({}, people.reader);
    await blocked(
      () => tests[0].decide(backup, {}, people.reader),
      (manager) =>
        manager.query(
          `UPDATE "${fixture.schemaName}".task SET "assigneeId"=$2 WHERE id=$1`,
          [fixture.taskId, people.reader.memberId],
        ),
      403,
    );
    assert.equal((await tests[0].task()).pending.reviewerState, 'SELF_REVIEW');
    await connectionSource.query(
      `UPDATE "${fixture.schemaName}".task SET "assigneeId"=$2 WHERE id=$1`,
      [fixture.taskId, people.writer.memberId],
    );
    current = await tests[0].task();
    await blocked(
      () => tests[0].assign(primary, { commandId }),
      (manager) =>
        manager.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
          people.admin.userId,
        ]),
      403,
    );
    await connectionSource.query(
      'UPDATE core."user" SET disabled=false WHERE id=$1',
      [people.admin.userId],
    );
    const before = await sourceFingerprint(connectionSource.manager, fixture);
    backup = await tests[0].task({}, people.reader);
    await tests[0].decide(backup, {}, people.reader);
    const after = await sourceFingerprint(connectionSource.manager, fixture);
    for (const [name, value] of Object.entries(before))
      if (!['deliveryTask', 'nativeTasks'].includes(name))
        assert.equal(after[name], value);
    const final = await tests[0].task();
    assert.equal(final.state, 'APPROVED');
    assert.equal(final.assignment.reviewerId, people.reader.memberId);
    assert.equal(
      (await tests[0].creative.read({}, people.reader)).canResolve,
      true,
      'Same latest submission backup authority remains for advisory feedback after approval.',
    );
    console.log(
      'PASS isolated independent review-assignment sessions: stable command replay, competing backups, reassignment-versus-final approval, role/project/assignee/manager revocation and new-submission races; canonical delivery owner and financial/fulfilment sources preserved. No provider or message.',
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

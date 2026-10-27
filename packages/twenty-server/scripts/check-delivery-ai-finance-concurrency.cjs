const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  MONTH,
  NEXT_MONTH,
  TABLES,
  createAiFixture,
  cleanupAiFixture,
  buildAiServices,
  seedSpend,
  aiHarness,
} = require('./check-delivery-ai-finance.cjs');

const FILE = '/tmp/otogrow-ai-finance-concurrency-fixture.json';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function bounded(promise, label, milliseconds = 10000) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(label)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
function writeJournal(fixture) {
  const temporary = `${FILE}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(fixture));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, FILE);
}
async function cleanCommittedFixture(fixture) {
  await connectionSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='5s'");
    const workspaces = await manager.query(
      'SELECT id FROM core.workspace WHERE id=ANY($1::uuid[])',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    if (!workspaces.length) {
      for (const table of [
        ...TABLES,
        'deliveryProject',
        'userWorkspace',
        'otogrowRole',
        'otogrowRoleAssignment',
        'otogrowMemberAccess',
        'otogrowAccessEvent',
      ]) {
        const [{ count }] = await manager.query(
          `SELECT count(*)::int AS count FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
          [[fixture.workspaceId, fixture.foreignWorkspaceId]],
        );
        assert.equal(
          count,
          0,
          `No ${table} fixture rows may survive completed cleanup.`,
        );
      }
      const [{ schema }] = await manager.query(
        'SELECT to_regnamespace($1)::text AS schema',
        [fixture.schemaName],
      );
      assert.equal(schema, null);
      const [{ count: accounts }] = await manager.query(
        'SELECT count(*)::int AS count FROM core."user" WHERE id=ANY($1::uuid[])',
        [Object.values(fixture.people).map((person) => person.userId)],
      );
      assert.equal(accounts, 0);
      return;
    }
    await cleanupAiFixture(manager, fixture);
  });
  if (existsSync(FILE)) {
    const saved = JSON.parse(readFileSync(FILE, 'utf8'));
    assert.equal(saved.workspaceId, fixture.workspaceId);
    assert.equal(saved.foreignWorkspaceId, fixture.foreignWorkspaceId);
    assert.equal(saved.schemaName, fixture.schemaName);
    assert.equal(saved.sentinel, fixture.sentinel);
    unlinkSync(FILE);
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
      await cleanCommittedFixture(JSON.parse(readFileSync(FILE, 'utf8')));
      console.log(
        'Recovered exact disposable AI-finance concurrency fixtures; no provider or real account data changed.',
      );
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  assert.equal(process.argv.length, 2);
  assert(
    !existsSync(FILE),
    `Recover the prior disposable fixture with this checker’s cleanup command: ${FILE}`,
  );
  const sentinel = `otogrow-ai-finance-concurrency:${randomUUID()}`;
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${sentinel}:${index}`,
        },
      }),
  );
  let fixture;
  let startBarrier = null;
  const pending = [];
  const blockers = [];
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const scoped = sources.map((source, index) => ({
    manager: source.manager,
    getRepository: (entity) => source.getRepository(entity),
    query: (...arguments_) => source.query(...arguments_),
    transaction: (callback) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='10s'");
        await manager.query("SET LOCAL statement_timeout='15s'");
        const barrier = startBarrier;
        if (barrier) {
          barrier.arrivals.add(index);
          if (barrier.arrivals.size === 2) {
            startBarrier = null;
            barrier.ready.resolve();
          }
          await bounded(
            barrier.ready.promise,
            'Both independent AI-finance sessions must reach the start barrier.',
          );
        }
        return callback(manager);
      }),
  }));
  const paired = async (first, second) => {
    startBarrier = { arrivals: new Set(), ready: deferred() };
    return bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Concurrent AI-finance operations did not settle.',
    );
  };
  const oneWinner = (results, statuses = [409]) => {
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert(
      statuses.includes(rejected[0].reason.status),
      `Unexpected concurrent rejection: ${rejected[0].reason}`,
    );
  };
  const holdLock = async (key) => {
    const runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const blocker = { runner, released: false };
    blockers.push(blocker);
    await runner.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      key,
    ]);
    return blocker;
  };
  const releaseLock = async (blocker) => {
    if (blocker.released) return;
    try {
      if (blocker.runner.isTransactionActive)
        await blocker.runner.rollbackTransaction();
    } finally {
      if (!blocker.runner.isReleased) await blocker.runner.release();
      blocker.released = true;
    }
  };
  const waitForLock = async (pid, key) => {
    const [{ hash }] = await connectionSource.query(
      'SELECT hashtextextended($1,0)::text AS hash',
      [key],
    );
    const unsigned = BigInt.asUintN(64, BigInt(hash));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [{ waiting }] = await connectionSource.query(
        "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted AND classid::text=$2 AND objid::text=$3 AND objsubid=1) AS waiting",
        [
          pid,
          (unsigned >> 32n).toString(),
          (unsigned & 0xffffffffn).toString(),
        ],
      );
      if (waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail(`Independent fixture session did not wait on lock ${key}`);
  };
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    fixture = await connectionSource.transaction(async (manager) => {
      const created = await createAiFixture(manager, 'ai_finance_concurrency');
      // A process interruption after commit must retain the exact disposable identities.
      writeJournal(created);
      return created;
    });
    if (process.env.OTOGROW_AI_FINANCE_CONCURRENCY_TEST_FAILURE === '1')
      throw new Error('Injected AI-finance concurrency cleanup failure');
    const services = scoped.map((source) => buildAiServices(source, fixture));
    const tests = services.map((service, index) =>
      aiHarness(scoped[index], service, fixture),
    );
    const [{ pid: firstPid }] = await sources[0].query(
      'SELECT pg_backend_pid() AS pid',
    );
    const [{ pid: secondPid }] = await sources[1].query(
      'SELECT pg_backend_pid() AS pid',
    );
    assert.notEqual(firstPid, secondPid);
    const seed = (fields) =>
      connectionSource.transaction((manager) =>
        seedSpend(manager, fixture, fields),
      );
    const claim = async (spendId) => {
      const rows = await connectionSource.query(
        'SELECT * FROM core."deliveryFinanceAiClaim" WHERE "workspaceId"=$1 AND "spendId"=$2',
        [fixture.workspaceId, spendId],
      );
      assert.equal(rows.length, 1, 'Each source has one serialized claim row.');
      return rows[0];
    };
    const assertCurrent = async (spendId, expectedId) => {
      const current = await claim(spendId);
      assert.equal(current.currentEntryId, expectedId);
      assert.equal(current.replacementEntryId, null);
      assert.equal((await tests[0].entry(expectedId)).status, 'POSTED');
      const [{ active }] = await connectionSource.query(
        'SELECT count(*)::int AS active FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND "sourceType"=\'AI_SPEND\' AND "sourceAiSpend"->>\'spendId\'=$2 AND status=\'POSTED\'',
        [fixture.workspaceId, spendId],
      );
      assert.equal(
        active,
        1,
        'One AI charge can contribute at most one posted recognition.',
      );
      const [{ invalid }] = await connectionSource.query(
        'SELECT count(*)::int AS invalid FROM core."deliveryFinanceCashMatch" relation JOIN core."deliveryFinanceEntry" entry ON entry.id=relation."entryId" AND entry."workspaceId"=relation."workspaceId" WHERE relation."workspaceId"=$1 AND relation.status=\'ACTIVE\' AND entry.status<>\'POSTED\'',
        [fixture.workspaceId],
      );
      assert.equal(
        invalid,
        0,
        'No active match can survive a voided recognition.',
      );
    };

    const original = await seed();
    const first = await tests[0].prepareInput(
      original.spend.id,
      original.event.id,
    );
    const second = { ...first, id: randomUUID(), month: NEXT_MONTH };
    const competing = await paired(
      () => tests[0].prepare(first),
      () => tests[1].prepare(second),
    );
    oneWinner(competing);
    const currentClaim = await claim(original.spend.id);
    const firstEntryId = currentClaim.currentEntryId;
    assert([first.id, second.id].includes(firstEntryId));
    assert.equal((await tests[0].entry(firstEntryId)).amountMicros, '2000000');
    const originalPost = await tests[0].postInput(firstEntryId);
    const posts = await paired(
      () => tests[0].post(originalPost),
      () => tests[1].post(originalPost),
    );
    assert(posts.some((result) => result.status === 'fulfilled'));
    assert(
      posts.every(
        (result) =>
          result.status === 'fulfilled' ||
          [400, 409].includes(result.reason.status),
      ),
    );
    await assertCurrent(original.spend.id, firstEntryId);

    const retrySource = await seed({ actualMicroUsd: '10000' });
    const retryInput = await tests[0].prepareInput(
      retrySource.spend.id,
      retrySource.event.id,
    );
    const retries = await paired(
      () => tests[0].prepare(retryInput),
      () => tests[1].prepare(retryInput),
    );
    assert(
      retries.every(
        (result) =>
          result.status === 'fulfilled' &&
          result.value.entryId === retryInput.id,
      ),
    );
    const [{ events: retryEvents }] = await connectionSource.query(
      'SELECT count(*)::int AS events FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceId"=$2',
      [fixture.workspaceId, retryInput.id],
    );
    assert.equal(retryEvents, 1);

    const expenseId = await tests[0].payment(
      tests[0].paymentInput({ category: 'EXPENSE', amountMicros: '2000000' }),
    );
    await tests[0].match(
      await tests[0].matchInput(expenseId, firstEntryId, '1000000'),
    );
    const lower = await tests[0].late(original.spend.id, '1000000');
    const correction = await tests[0].correctionInput(
      original.spend.id,
      lower.id,
    );
    const correctionOther = {
      ...correction,
      id: randomUUID(),
      month: NEXT_MONTH,
    };
    oneWinner(
      await paired(
        () => tests[0].prepare(correction),
        () => tests[1].prepare(correctionOther),
      ),
    );
    const pendingClaim = await claim(original.spend.id);
    assert.equal(pendingClaim.currentEntryId, firstEntryId);
    const replacementId = pendingClaim.replacementEntryId;
    assert([correction.id, correctionOther.id].includes(replacementId));
    const replacementPost = await tests[0].postInput(replacementId);
    const originalEntry = await tests[0].entry(firstEntryId);
    const replacementVoidRace = await paired(
      () => tests[0].post(replacementPost),
      () =>
        services[1].finance.voidEntry(...tests[1].argumentsFor(), {
          id: firstEntryId,
          revision: originalEntry.revision,
          reason: 'Concurrent explicit correction fixture.',
        }),
    );
    assert.equal(replacementVoidRace[0].status, 'fulfilled');
    assert.equal(replacementVoidRace[1].status, 'rejected');
    assert([400, 409].includes(replacementVoidRace[1].reason.status));
    await assertCurrent(original.spend.id, replacementId);
    assert.equal((await tests[0].cash(expenseId)).matchedMicros, '0');
    assert.equal((await tests[0].cash(expenseId)).status, 'POSTED');

    const higher = await tests[0].late(original.spend.id, '3000000');
    const higherInput = await tests[0].correctionInput(
      original.spend.id,
      higher.id,
    );
    await tests[0].prepare(higherInput);
    const higherPost = await tests[0].postInput(higherInput.id);
    const lateRace = await paired(
      () => tests[0].post(higherPost),
      () => tests[1].late(original.spend.id, '4000000'),
    );
    assert.equal(lateRace[1].status, 'fulfilled');
    if (lateRace[0].status === 'rejected') {
      assert.equal(lateRace[0].reason.status, 409);
      await tests[0].post(await tests[0].postInput(higherInput.id));
    }
    await assertCurrent(original.spend.id, higherInput.id);
    assert.equal(
      (await tests[0].entry(higherInput.id)).amountMicros,
      '3000000',
      'Later evidence cannot silently replace a deliberately reviewed amount.',
    );

    const matchCorrection = await tests[0].correctionInput(
      original.spend.id,
      lower.id,
    );
    await tests[0].prepare(matchCorrection);
    const beforeMatchPost = await tests[0].postInput(matchCorrection.id);
    const addedMatch = await tests[1].matchInput(
      expenseId,
      higherInput.id,
      '10000',
    );
    const matchRace = await paired(
      () => tests[0].post(beforeMatchPost),
      () => tests[1].match(addedMatch),
    );
    assert(matchRace.some((result) => result.status === 'fulfilled'));
    if (matchRace[0].status === 'rejected') {
      assert.equal(matchRace[0].reason.status, 409);
      await tests[0].post(await tests[0].postInput(matchCorrection.id));
    }
    if (matchRace[1].status === 'rejected')
      assert([400, 409].includes(matchRace[1].reason.status));
    await assertCurrent(original.spend.id, matchCorrection.id);
    assert.equal((await tests[0].cash(expenseId)).matchedMicros, '0');

    const directory = () =>
      services[1].access.directory(
        fixture.workspaceId,
        fixture.people.admin.memberId,
        fixture.people.admin.userWorkspaceId,
      );
    const memberAccess = async () =>
      (await directory()).members.find(
        (member) => member.memberId === fixture.people.writer.memberId,
      );
    const revoke = (revision) =>
      services[1].access.assignRoles(
        fixture.workspaceId,
        fixture.people.admin.memberId,
        fixture.people.admin.userWorkspaceId,
        {
          memberId: fixture.people.writer.memberId,
          roleIds: [],
          roleRevisions: [],
          revision,
        },
      );
    const restore = async () => {
      const current = await directory();
      const member = current.members.find(
        (value) => value.memberId === fixture.people.writer.memberId,
      );
      const role = current.roles.find(
        (value) => value.id === fixture.roles.writer,
      );
      assert(member && role);
      await services[1].access.assignRoles(
        fixture.workspaceId,
        fixture.people.admin.memberId,
        fixture.people.admin.userWorkspaceId,
        {
          memberId: member.memberId,
          roleIds: [role.id],
          roleRevisions: [{ id: role.id, revision: role.revision }],
          revision: member.revision,
        },
      );
    };
    const accessKey = `delivery:${fixture.workspaceId}`;
    const deniedSource = await seed({ actualMicroUsd: '10000' });
    const deniedInput = await tests[0].prepareInput(
      deniedSource.spend.id,
      deniedSource.event.id,
    );
    const beforeRevoke = await memberAccess();
    assert(beforeRevoke);
    const accessBlocker = await holdLock(accessKey);
    const revocation = track(revoke(beforeRevoke.revision));
    await waitForLock(secondPid, accessKey);
    const deniedWrite = track(tests[0].prepare(deniedInput));
    await waitForLock(firstPid, accessKey);
    await releaseLock(accessBlocker);
    await bounded(revocation, 'Queued role revocation did not finish.');
    await assert.rejects(
      bounded(deniedWrite, 'Revoked AI import did not finish.'),
      { status: 403 },
    );
    const [{ rejectedEntries }] = await connectionSource.query(
      'SELECT count(*)::int AS "rejectedEntries" FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND id=$2',
      [fixture.workspaceId, deniedInput.id],
    );
    assert.equal(rejectedEntries, 0);
    await restore();

    const orderedSource = await seed({ actualMicroUsd: '10000' });
    const orderedInput = await tests[0].prepareInput(
      orderedSource.spend.id,
      orderedSource.event.id,
    );
    const currentMember = await memberAccess();
    const periodKey = `finance-period:${fixture.workspaceId}:${MONTH}`;
    const periodBlocker = await holdLock(periodKey);
    const authorizedWrite = track(tests[0].prepare(orderedInput));
    await waitForLock(firstPid, periodKey);
    const orderedRevocation = track(revoke(currentMember.revision));
    await waitForLock(secondPid, accessKey);
    await releaseLock(periodBlocker);
    await bounded(
      authorizedWrite,
      'Already-authorized import must complete before queued revocation.',
    );
    await bounded(orderedRevocation, 'Serialized revocation did not finish.');
    assert.equal((await tests[0].entry(orderedInput.id)).status, 'DRAFT');
    await assert.rejects(tests[0].prepare(orderedInput), { status: 403 });
    console.log(
      'PASS independent-session AI finance: unique cross-month claims, exact retries, pending correction conflicts, atomic lower/higher posting, current void/match/late-evidence races and ordered current-role revocation. Disposable fixtures only; no providers, real budgets or payments.',
    );
  } finally {
    startBarrier?.ready.resolve();
    startBarrier = null;
    try {
      for (const blocker of blockers) await releaseLock(blocker);
      await bounded(
        Promise.allSettled(pending),
        'Pending AI-finance fixture operations did not settle for cleanup.',
        16000,
      );
    } finally {
      for (const source of sources)
        if (source.isInitialized) await source.destroy();
      try {
        if (fixture && connectionSource.isInitialized) {
          await cleanCommittedFixture(fixture);
          console.log(
            'Removed exact disposable AI-finance workspaces, schema, accounts, ledger/evidence, claims, recognition, matches and activity; recovery journal removed.',
          );
        }
      } finally {
        if (connectionSource.isInitialized) await connectionSource.destroy();
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  console.error(
    `If interrupted, recover only this disposable fixture with the cleanup command; journal: ${FILE}`,
  );
  process.exitCode = 1;
});

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
const { seedSpend } = require('./check-delivery-ai-finance.cjs');
const {
  MONTH,
  NEXT_MONTH,
  TABLES,
  createPeriodFixture,
  cleanupPeriodFixture,
  buildPeriodServices,
  periodHarness,
} = require('./check-delivery-finance-period.cjs');

const FILE = '/tmp/otogrow-finance-period-concurrency-fixture.json';
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
async function cleanup(fixture) {
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
          `Completed cleanup cannot leave ${table} fixture rows.`,
        );
      }
      const [{ schema }] = await manager.query(
        'SELECT to_regnamespace($1)::text AS schema',
        [fixture.schemaName],
      );
      assert.equal(schema, null);
      const [{ count }] = await manager.query(
        'SELECT count(*)::int AS count FROM core."user" WHERE id=ANY($1::uuid[])',
        [Object.values(fixture.people).map((person) => person.userId)],
      );
      assert.equal(count, 0);
      return;
    }
    await cleanupPeriodFixture(manager, fixture);
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
      await cleanup(JSON.parse(readFileSync(FILE, 'utf8')));
      console.log(
        'Recovered only exact disposable period concurrency fixtures.',
      );
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  assert.equal(process.argv.length, 2);
  assert(
    !existsSync(FILE),
    `Use this checker's cleanup command to recover ${FILE} first.`,
  );
  const sessionName = `otogrow-period-concurrency:${randomUUID()}`;
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
  const pending = [];
  const blockers = [];
  let fixture;
  let startBarrier = null;
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
            'Both independent period sessions must reach the start barrier.',
          );
        }
        return callback(manager);
      }),
  }));
  const paired = async (first, second) => {
    startBarrier = { arrivals: new Set(), ready: deferred() };
    return bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Concurrent result-period operations did not settle.',
    );
  };
  const oneWinner = (results) => {
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const failures = results.filter((result) => result.status === 'rejected');
    assert.equal(failures.length, 1);
    assert(
      [400, 409].includes(failures[0].reason.status),
      `Unexpected period race rejection: ${failures[0].reason}`,
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
    assert.fail(`Period fixture session did not wait on ${key}.`);
  };
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    fixture = await connectionSource.transaction(async (manager) => {
      const created = await createPeriodFixture(
        manager,
        'ai_finance_period_race',
      );
      // Exact fixture identities must survive interruption after the creation transaction commits.
      writeJournal(created);
      return created;
    });
    if (process.env.OTOGROW_FINANCE_PERIOD_CONCURRENCY_TEST_FAILURE === '1')
      throw new Error('Injected period concurrency cleanup failure');
    const services = scoped.map((source) =>
      buildPeriodServices(source, fixture),
    );
    const tests = services.map((service, index) =>
      periodHarness(scoped[index], service, fixture),
    );
    const [{ pid: firstPid }] = await sources[0].query(
      'SELECT pg_backend_pid() AS pid',
    );
    const [{ pid: secondPid }] = await sources[1].query(
      'SELECT pg_backend_pid() AS pid',
    );
    assert.notEqual(firstPid, secondPid);
    const manualInput = tests[0].monthlyInput({ month: MONTH });
    const lockInput = await tests[1].commandInput(MONTH, 'LOCKED');
    const saveLockRace = await paired(
      () =>
        services[0].finance.saveEntry(...tests[0].argumentsFor(), manualInput),
      () => tests[1].change(lockInput),
    );
    oneWinner(saveLockRace);
    const afterSaveLock = await tests[0].readPeriod();
    if (afterSaveLock.period.status === 'LOCKED') {
      assert.equal(afterSaveLock.blockerCount, 0);
      const [{ count }] = await connectionSource.query(
        'SELECT count(*)::int AS count FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND id=$2',
        [fixture.workspaceId, manualInput.id],
      );
      assert.equal(count, 0);
    } else {
      assert.equal((await tests[0].entry(manualInput.id)).status, 'DRAFT');
      assert.equal(afterSaveLock.blockerCount, 1);
    }

    const firstLock = await tests[0].commandInput(NEXT_MONTH, 'LOCKED');
    const duplicatePeriod = { ...firstLock, id: randomUUID() };
    oneWinner(
      await paired(
        () => tests[0].change(firstLock),
        () => tests[1].change(duplicatePeriod),
      ),
    );
    const [{ periods }] = await connectionSource.query(
      'SELECT count(*)::int AS periods FROM core."deliveryFinancePeriod" WHERE "workspaceId"=$1 AND month=$2',
      [fixture.workspaceId, NEXT_MONTH],
    );
    assert.equal(periods, 1);
    const retryMonth = '2020-05';
    const exact = await tests[0].commandInput(retryMonth, 'LOCKED');
    const exactRetries = await paired(
      () => tests[0].change(exact),
      () => tests[1].change(exact),
    );
    assert(
      exactRetries.every(
        (result) =>
          result.status === 'fulfilled' &&
          result.value.period.status === 'LOCKED',
      ),
    );
    const [{ events }] = await connectionSource.query(
      'SELECT count(*)::int AS events FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'PERIOD\' AND "after"->>\'commandId\'=$2',
      [fixture.workspaceId, exact.id],
    );
    assert.equal(events, 1);
    await tests[0].change(await tests[0].commandInput(retryMonth, 'OPEN'));
    await tests[0].change(await tests[0].commandInput(retryMonth, 'LOCKED'));
    const oldRetries = await paired(
      () => tests[0].change(exact),
      () => tests[1].change(exact),
    );
    assert(
      oldRetries.every(
        (result) =>
          result.status === 'fulfilled' &&
          result.value.replayed &&
          result.value.period.status === 'LOCKED' &&
          result.value.period.revision === 3,
      ),
    );

    const postMonth = '2020-06';
    const postDraft = tests[0].monthlyInput({ month: postMonth });
    await services[0].finance.saveEntry(...tests[0].argumentsFor(), postDraft);
    const beforePostLock = await tests[1].commandInput(postMonth, 'LOCKED');
    const postRace = await paired(
      () =>
        services[0].finance.postEntry(...tests[0].argumentsFor(), {
          id: postDraft.id,
          revision: 1,
        }),
      () => tests[1].change(beforePostLock),
    );
    assert.equal(postRace[0].status, 'fulfilled');
    assert.equal(postRace[1].status, 'rejected');
    assert([400, 409].includes(postRace[1].reason.status));
    await tests[0].change(await tests[0].commandInput(postMonth, 'LOCKED'));

    const seed = (fields) =>
      connectionSource.transaction((manager) =>
        seedSpend(manager, fixture, fields),
      );
    const originalMonth = '2020-08';
    const replacementMonth = '2020-09';
    const ai = await seed();
    const imported = await tests[0].prepareInput(ai.spend.id, ai.event.id, {
      month: originalMonth,
    });
    await tests[0].prepare(imported);
    await tests[0].post(await tests[0].postInput(imported.id));
    const lower = await tests[0].late(ai.spend.id, '1000000');
    const correction = await tests[0].correctionInput(ai.spend.id, lower.id, {
      month: replacementMonth,
    });
    const originalLock = await tests[1].commandInput(originalMonth, 'LOCKED');
    const correctionLockRace = await paired(
      () => tests[0].prepare(correction),
      () => tests[1].change(originalLock),
    );
    oneWinner(correctionLockRace);
    if (correctionLockRace[0].status === 'rejected') {
      assert.equal(
        (await tests[0].readPeriod(originalMonth)).period.status,
        'LOCKED',
      );
      await tests[0].change(await tests[0].commandInput(originalMonth, 'OPEN'));
      await tests[0].prepare(
        await tests[0].correctionInput(ai.spend.id, lower.id, {
          id: correction.id,
          month: replacementMonth,
        }),
      );
    } else {
      const openOriginal = await tests[0].readPeriod(originalMonth);
      assert.equal(openOriginal.period.status, 'OPEN');
      assert(
        openOriginal.blockers.some(
          (blocker) =>
            blocker.entryId === correction.id &&
            blocker.reason === 'CROSS_MONTH_CORRECTION',
        ),
      );
    }
    const correctionPost = await tests[0].postInput(correction.id);
    const withPendingLock = await tests[1].commandInput(
      originalMonth,
      'LOCKED',
    );
    const pendingPostRace = await paired(
      () => tests[0].post(correctionPost),
      () => tests[1].change(withPendingLock),
    );
    assert.equal(pendingPostRace[0].status, 'fulfilled');
    assert.equal(pendingPostRace[1].status, 'rejected');
    assert([400, 409].includes(pendingPostRace[1].reason.status));
    assert.equal((await tests[0].entry(imported.id)).status, 'VOID');
    assert.equal((await tests[0].entry(correction.id)).status, 'POSTED');
    await tests[0].change(await tests[0].commandInput(originalMonth, 'LOCKED'));

    const blockedMonth = '2022-01';
    const independentMonth = '2022-02';
    const periodKey = `finance-period:${fixture.workspaceId}:${blockedMonth}`;
    const heldPeriod = await holdLock(periodKey);
    const blockedInput = tests[0].monthlyInput({ month: blockedMonth });
    const blockedWrite = track(
      services[0].finance.saveEntry(...tests[0].argumentsFor(), blockedInput),
    );
    await waitForLock(firstPid, periodKey);
    const independentInput = tests[1].monthlyInput({ month: independentMonth });
    await bounded(
      track(
        services[1].finance.saveEntry(
          ...tests[1].argumentsFor(),
          independentInput,
        ),
      ),
      'An unrelated month must remain editable while another normalized month waits on its lock.',
      5000,
    );
    await releaseLock(heldPeriod);
    await bounded(
      blockedWrite,
      'Blocked month write did not finish after lock release.',
    );

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
    const deniedMonth = '2023-01';
    const deniedInput = await tests[0].commandInput(deniedMonth, 'LOCKED');
    const beforeRevoke = await memberAccess();
    const heldAccess = await holdLock(accessKey);
    const revocation = track(revoke(beforeRevoke.revision));
    await waitForLock(secondPid, accessKey);
    const deniedWrite = track(tests[0].change(deniedInput));
    await waitForLock(firstPid, accessKey);
    await releaseLock(heldAccess);
    await bounded(revocation, 'Queued revocation did not finish.');
    await assert.rejects(bounded(deniedWrite, 'Revoked lock did not finish.'), {
      status: 403,
    });
    assert.equal((await tests[0].readPeriod(deniedMonth)).period.id, null);
    await restore();
    const orderedMonth = '2023-02';
    const orderedInput = await tests[0].commandInput(orderedMonth, 'LOCKED');
    const orderedMember = await memberAccess();
    const orderedKey = `finance-period:${fixture.workspaceId}:${orderedMonth}`;
    const orderedBlocker = await holdLock(orderedKey);
    const authorizedLock = track(tests[0].change(orderedInput));
    await waitForLock(firstPid, orderedKey);
    const laterRevocation = track(revoke(orderedMember.revision));
    await waitForLock(secondPid, accessKey);
    await releaseLock(orderedBlocker);
    await bounded(
      authorizedLock,
      'Already-authorized lock must finish before queued role revocation.',
    );
    await bounded(laterRevocation, 'Ordered revocation did not finish.');
    assert.equal(
      (await tests[0].readPeriod(orderedMonth)).period.status,
      'LOCKED',
    );
    await assert.rejects(tests[0].change(orderedInput), { status: 403 });
    console.log(
      'PASS independent-session result periods: absent-row save/lock serialization, unique month rows and command retries/current-state replay, post/lock and cross-month correction races, independent-month writes, and ordered current-role revocation. No providers or real financial data.',
    );
  } finally {
    startBarrier?.ready.resolve();
    startBarrier = null;
    try {
      for (const blocker of blockers) await releaseLock(blocker);
      await bounded(
        Promise.allSettled(pending),
        'Pending period fixture operations did not settle for cleanup.',
        16000,
      );
    } finally {
      for (const source of sources)
        if (source.isInitialized) await source.destroy();
      try {
        if (fixture && connectionSource.isInitialized) {
          await cleanup(fixture);
          console.log(
            'Removed exact disposable period workspaces, schema, accounts, ledger/claims, recognition/period history and activity; recovery journal removed.',
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
  if (existsSync(FILE))
    console.error(
      `Use the cleanup command after an interruption; exact fixture journal: ${FILE}`,
    );
  process.exitCode = 1;
});

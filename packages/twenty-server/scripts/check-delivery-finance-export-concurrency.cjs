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
  TABLES,
  createExportFixture,
  cleanupExportFixture,
  buildExportServices,
  exportHarness,
} = require('./check-delivery-finance-export.cjs');
const {
  financialFingerprint,
  checksum,
} = require('./check-delivery-finance-export-support.cjs');

const FILE = '/tmp/otogrow-finance-export-concurrency-fixture.json';

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
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  assert.match(fixture.schemaName, /^ai_finance_export_race_[a-f0-9_]{36}$/);
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
    } else await cleanupExportFixture(manager, fixture);
  });
  if (existsSync(FILE)) {
    const saved = JSON.parse(readFileSync(FILE, 'utf8'));
    for (const field of [
      'workspaceId',
      'foreignWorkspaceId',
      'schemaName',
      'sentinel',
    ])
      assert.equal(saved[field], fixture[field]);
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
        'Recovered only exact disposable accountant-export fixtures.',
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
  const sessionName = `otogrow-export-concurrency:${randomUUID()}`;
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
  const blockers = [];
  const pending = [];
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
            'Both independent export sessions must reach their start barrier.',
          );
        }
        return callback(manager);
      }),
  }));
  const paired = async (first, second, preserveLedgers = true) => {
    const before = preserveLedgers
      ? await financialFingerprint(connectionSource.manager, fixture)
      : null;
    startBarrier = { arrivals: new Set(), ready: deferred() };
    const results = await bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Concurrent export operations did not settle.',
    );
    if (preserveLedgers)
      assert.deepEqual(
        await financialFingerprint(connectionSource.manager, fixture),
        before,
      );
    return results;
  };
  const oneWinner = (results) => {
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const [failure] = results.filter((result) => result.status === 'rejected');
    assert(
      [400, 409].includes(failure.reason.status),
      `Unexpected export race rejection: ${failure.reason}`,
    );
    return results.findIndex((result) => result.status === 'fulfilled');
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
    assert.fail(`Export fixture session did not wait on ${key}.`);
  };

  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    fixture = await connectionSource.transaction(async (manager) => {
      const created = await createExportFixture(
        manager,
        'ai_finance_export_race',
      );
      // Ownership must remain recoverable if the process stops immediately after commit.
      writeJournal(created);
      return created;
    });
    if (process.env.OTOGROW_FINANCE_EXPORT_CONCURRENCY_TEST_FAILURE === '1')
      throw new Error('Injected export concurrency cleanup failure');
    const services = scoped.map((source) =>
      buildExportServices(source, fixture),
    );
    const tests = services.map((service, index) =>
      exportHarness(scoped[index], service, fixture),
    );
    const [{ pid: firstPid }] = await sources[0].query(
      'SELECT pg_backend_pid() AS pid',
    );
    const [{ pid: secondPid }] = await sources[1].query(
      'SELECT pg_backend_pid() AS pid',
    );
    assert.notEqual(firstPid, secondPid);
    const profile = tests[0].profileInput();
    const profileRetries = await paired(
      () => tests[0].saveProfile(profile),
      () => tests[1].saveProfile(profile),
    );
    assert(profileRetries.every((result) => result.status === 'fulfilled'));
    assert.equal(
      profileRetries.filter((result) => result.value.replayed).length,
      1,
    );
    await tests[0].payment();
    const selection = tests[0].cashSelection(profile.id);
    const batchInput = await tests[0].batchInput(selection);
    const batchRetries = await paired(
      () => tests[0].createBatch(batchInput),
      () => tests[1].createBatch(batchInput),
    );
    assert(batchRetries.every((result) => result.status === 'fulfilled'));
    assert.equal(
      batchRetries.filter((result) => result.value.replayed).length,
      1,
    );
    const batch = batchRetries[0].value.batch;
    const download = await tests[0].download(batch.id);
    assert.equal(download.checksum, checksum(download.csv));
    assert.deepEqual(await tests[1].download(batch.id), download);
    const [{ batchEvents }] = await connectionSource.query(
      'SELECT count(*)::int AS "batchEvents" FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'EXPORT_BATCH\' AND "sourceId"=$2',
      [fixture.workspaceId, batch.id],
    );
    assert.equal(batchEvents, 1);

    await tests[0].payment(tests[0].paymentInput({ date: '2020-03-20' }));
    const march = tests[0].cashSelection(profile.id, {
      dateFrom: '2020-03-01',
      dateTo: '2020-03-31',
    });
    const marchBatch = await tests[0].batchInput(march);
    const conflictingBatch = { ...marchBatch, id: randomUUID() };
    oneWinner(
      await paired(
        () => tests[0].createBatch(marchBatch),
        () => tests[1].createBatch(conflictingBatch),
      ),
    );
    const [{ marchBatches }] = await connectionSource.query(
      'SELECT count(*)::int AS "marchBatches" FROM core."deliveryFinanceExportBatch" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
      [fixture.workspaceId, [marchBatch.id, conflictingBatch.id]],
    );
    assert.equal(marchBatches, 1);

    const confirmations = [0, 1].map((index) => ({
      commandId: randomUUID(),
      batchId: batch.id,
      revision: batch.revision,
      status: 'CONFIRMED',
      reference: `Synthetic concurrent manual confirmation ${index}`,
      evidenceUrl: null,
      reason: 'Reviewed synthetic handoff; no external import.',
    }));
    const confirmationResults = await paired(
      () => tests[0].changeImportStatus(confirmations[0]),
      () => tests[1].changeImportStatus(confirmations[1]),
    );
    const confirmedBy = oneWinner(confirmationResults);
    const confirmed = confirmationResults[confirmedBy].value.batch;
    const confirmationRetry = await tests[0].changeImportStatus(
      confirmations[confirmedBy],
    );
    assert.equal(confirmationRetry.replayed, true);
    assert.equal(confirmationRetry.batch.revision, confirmed.revision);
    assert.deepEqual(await tests[0].download(batch.id), download);

    await tests[0].payment(tests[0].paymentInput({ date: '2020-04-20' }));
    const april = tests[0].cashSelection(profile.id, {
      dateFrom: '2020-04-01',
      dateTo: '2020-04-30',
    });
    const staleProfileBatch = await tests[0].batchInput(april);
    const accessKey = `delivery:${fixture.workspaceId}`;
    const profileBlocker = await holdLock(accessKey);
    const profileUpdate = track(
      tests[1].saveProfile({
        ...profile,
        commandId: randomUUID(),
        revision: 1,
        name: 'Explicitly revised handoff configuration',
      }),
    );
    await waitForLock(secondPid, accessKey);
    const staleProfileWrite = track(tests[0].createBatch(staleProfileBatch));
    await waitForLock(firstPid, accessKey);
    await releaseLock(profileBlocker);
    await bounded(profileUpdate, 'Queued profile update did not finish.');
    await assert.rejects(
      bounded(staleProfileWrite, 'Stale profile batch did not finish.'),
      { status: 409 },
    );

    const recognitionProfile = tests[0].profileInput({ basis: 'RECOGNITION' });
    await tests[0].saveProfile(recognitionProfile);
    const entryId = await tests[0].monthly();
    const recognition = {
      profileId: recognitionProfile.id,
      currency: 'USD',
      serviceMonth: '2020-02',
      accountingDate: '2020-02-29',
    };
    const staleSourceBatch = await tests[0].batchInput(recognition);
    const sourceBlocker = await holdLock(accessKey);
    const sourceVoid = track(
      services[1].finance.voidEntry(...tests[1].argumentsFor(), {
        id: entryId,
        revision: 2,
        reason: 'Synthetic source correction racing with export review.',
      }),
    );
    await waitForLock(secondPid, accessKey);
    const staleSourceWrite = track(tests[0].createBatch(staleSourceBatch));
    await waitForLock(firstPid, accessKey);
    await releaseLock(sourceBlocker);
    await bounded(sourceVoid, 'Queued recognition source void did not finish.');
    await assert.rejects(
      bounded(staleSourceWrite, 'Stale source batch did not finish.'),
      { status: 409 },
    );

    const directory = await services[1].access.directory(
      fixture.workspaceId,
      fixture.people.admin.memberId,
      fixture.people.admin.userWorkspaceId,
    );
    const reader = directory.members.find(
      (member) => member.memberId === fixture.people.reader.memberId,
    );
    assert(reader);
    const revocationBlocker = await holdLock(accessKey);
    const revocation = track(
      services[1].access.assignRoles(
        fixture.workspaceId,
        fixture.people.admin.memberId,
        fixture.people.admin.userWorkspaceId,
        {
          memberId: reader.memberId,
          roleIds: [],
          roleRevisions: [],
          revision: reader.revision,
        },
      ),
    );
    await waitForLock(secondPid, accessKey);
    const revokedDownload = track(tests[0].download(batch.id));
    await waitForLock(firstPid, accessKey);
    await releaseLock(revocationBlocker);
    await bounded(revocation, 'Queued reader revocation did not finish.');
    await assert.rejects(
      bounded(revokedDownload, 'Revoked export download did not finish.'),
      { status: 403 },
    );
    await assert.rejects(() => tests[0].createBatch(batchInput), {
      status: 403,
    });
    const [{ staleBatches }] = await connectionSource.query(
      'SELECT count(*)::int AS "staleBatches" FROM core."deliveryFinanceExportBatch" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
      [fixture.workspaceId, [staleProfileBatch.id, staleSourceBatch.id]],
    );
    assert.equal(staleBatches, 0);
    console.log(
      'PASS independent-session accountant export: profile and batch command retries, competing repeated-source export claims, optimistic manual import confirmation, stale template and recognition-source races, and queued permission revocation. CSV originals/checksums and existing ledgers preserved; no providers or real accounting data.',
    );
  } finally {
    startBarrier?.ready.resolve();
    startBarrier = null;
    try {
      for (const blocker of blockers) await releaseLock(blocker);
      await bounded(
        Promise.allSettled(pending),
        'Pending export operations did not settle before cleanup.',
        16000,
      );
    } finally {
      for (const source of sources)
        if (source.isInitialized) await source.destroy();
      try {
        if (fixture && connectionSource.isInitialized) {
          await cleanup(fixture);
          console.log(
            'Removed exact export workspaces, schema, accounts and histories; recovery journal removed.',
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
    console.error(`Exact cleanup recovery journal: ${FILE}`);
  process.exitCode = 1;
});

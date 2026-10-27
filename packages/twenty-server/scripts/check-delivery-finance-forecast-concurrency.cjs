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
  createForecastFixture,
  cleanupForecastFixture,
  buildForecastServices,
  forecastHarness,
} = require('./check-delivery-finance-forecast.cjs');
const {
  dateShift,
  businessDate,
} = require('./check-delivery-finance-forecast-support.cjs');

const FILE = '/tmp/otogrow-finance-forecast-concurrency-fixture.json';
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
  assert(!existsSync(FILE), 'A previous forecast fixture needs exact recovery.');
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
        assert.equal(count, 0, `Recovered fixture left ${table} records.`);
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
    await cleanupForecastFixture(manager, fixture);
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
      console.log('Recovered only exact disposable cash-forecast fixtures.');
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  assert.equal(process.argv.length, 2);
  assert(!existsSync(FILE), `Recover ${FILE} with this checker's cleanup first.`);
  const sessionName = `otogrow-forecast-concurrency:${randomUUID()}`;
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
            'Both independent forecast sessions must reach the start barrier.',
          );
        }
        return callback(manager);
      }),
  }));
  const paired = async (first, second) => {
    startBarrier = { arrivals: new Set(), ready: deferred() };
    return bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Concurrent cash-forecast operations did not settle.',
    );
  };
  const oneWinner = (results) => {
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const failures = results.filter((result) => result.status === 'rejected');
    assert.equal(failures.length, 1);
    assert(
      [400, 409].includes(failures[0].reason.status),
      `Unexpected forecast race rejection: ${failures[0].reason}`,
    );
  };
  const holdLock = async (key) => {
    const runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const blocker = { runner, released: false };
    blockers.push(blocker);
    await runner.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
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
        [pid, (unsigned >> 32n).toString(), (unsigned & 0xffffffffn).toString()],
      );
      if (waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail(`Forecast fixture session did not wait on ${key}.`);
  };
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    fixture = await connectionSource.transaction(async (manager) => {
      const created = await createForecastFixture(manager, 'ai_finance_forecast_race');
      // Creation ownership must be recoverable even if the process ends immediately after commit.
      writeJournal(created);
      return created;
    });
    if (process.env.OTOGROW_FINANCE_FORECAST_CONCURRENCY_TEST_FAILURE === '1')
      throw new Error('Injected forecast concurrency cleanup failure');
    const services = scoped.map((source) => buildForecastServices(source, fixture));
    const tests = services.map((service, index) => forecastHarness(scoped[index], service, fixture));
    const [{ pid: firstPid }] = await sources[0].query('SELECT pg_backend_pid() AS pid');
    const [{ pid: secondPid }] = await sources[1].query('SELECT pg_backend_pid() AS pid');
    assert.notEqual(firstPid, secondPid);
    const today = businessDate();
    const tomorrow = dateShift(today, 1);
    const anchor = await tests[0].anchorInput();
    const anchorRetries = await paired(
      () => tests[0].saveAnchor(anchor),
      () => tests[1].saveAnchor(anchor),
    );
    assert(anchorRetries.every((result) => result.status === 'fulfilled'));
    assert.equal(anchorRetries.filter((result) => result.value.replayed).length, 1);
    const [{ anchorEvents }] = await connectionSource.query('SELECT count(*)::int AS "anchorEvents" FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'FORECAST_ANCHOR\' AND "after"->>\'commandId\'=$2', [fixture.workspaceId, anchor.id]);
    assert.equal(anchorEvents, 1);
    const invoiceId = await tests[0].saveCash({ date: dateShift(today, -10), dueDate: tomorrow });
    const firstSchedule = await tests[0].sourceItemInput('RECEIVABLE', invoiceId);
    const otherSchedule = { ...firstSchedule, id: randomUUID(), commandId: randomUUID() };
    oneWinner(await paired(
      () => tests[0].saveItem(firstSchedule),
      () => tests[1].saveItem(otherSchedule),
    ));
    const [{ invoiceItems }] = await connectionSource.query('SELECT count(*)::int AS "invoiceItems" FROM core."deliveryFinanceForecastItem" WHERE "workspaceId"=$1 AND "receivableId"=$2', [fixture.workspaceId, invoiceId]);
    assert.equal(invoiceItems, 1);

    const exactItem = tests[0].manualItemInput({ amountMicros: '1000000000' });
    const itemRetries = await paired(
      () => tests[0].saveItem(exactItem),
      () => tests[1].saveItem(exactItem),
    );
    assert(itemRetries.every((result) => result.status === 'fulfilled'));
    assert.equal(itemRetries.filter((result) => result.value.replayed).length, 1);
    await tests[0].saveItem(await tests[0].revisedItemInput(exactItem.id, { note: 'A later reviewed expectation revision.' }));
    const oldItemRetries = await paired(
      () => tests[0].saveItem(exactItem),
      () => tests[1].saveItem(exactItem),
    );
    assert(oldItemRetries.every((result) => result.status === 'fulfilled' && result.value.replayed && result.value.item.revision === 2));

    const cashId = await tests[0].payment(tests[0].paymentInput({ category: 'EXPENSE', amountMicros: '1000000000', date: today }));
    const secondItem = tests[0].manualItemInput({ amountMicros: '1000000000' });
    await tests[0].saveItem(secondItem);
    const cashRaceInputs = await Promise.all([
      tests[0].realizationInput(exactItem.id, cashId, '700000000'),
      tests[1].realizationInput(secondItem.id, cashId, '700000000'),
    ]);
    oneWinner(await paired(
      () => tests[0].realize(cashRaceInputs[0]),
      () => tests[1].realize(cashRaceInputs[1]),
    ));
    const [{ cashApplied }] = await connectionSource.query('SELECT COALESCE(sum("amountMicros"),0)::text AS "cashApplied" FROM core."deliveryFinanceForecastRealization" WHERE "workspaceId"=$1 AND "cashId"=$2 AND status=\'ACTIVE\'', [fixture.workspaceId, cashId]);
    assert.equal(cashApplied, '700000000');
    assert.equal((await tests[0].forecastSource('CASH', cashId)).remainingMicros, '300000000');

    const sharedTarget = tests[0].manualItemInput({ amountMicros: '1000000000' });
    await tests[0].saveItem(sharedTarget);
    const targetCashIds = [];
    for (let index = 0; index < 2; index++)
      targetCashIds.push(await tests[index].payment(tests[index].paymentInput({ category: 'SALARY', amountMicros: '700000000', date: today })));
    const targetRaceInputs = await Promise.all([
      tests[0].realizationInput(sharedTarget.id, targetCashIds[0], '700000000'),
      tests[1].realizationInput(sharedTarget.id, targetCashIds[1], '700000000'),
    ]);
    oneWinner(await paired(
      () => tests[0].realize(targetRaceInputs[0]),
      () => tests[1].realize(targetRaceInputs[1]),
    ));
    assert.equal((await tests[0].selectedForecastItem(sharedTarget.id)).remainingMicros, '300000000');

    const retryItem = tests[0].manualItemInput({ amountMicros: '400000000' });
    await tests[0].saveItem(retryItem);
    const retryCash = await tests[0].payment(tests[0].paymentInput({ category: 'EXPENSE', amountMicros: '500000000', date: today }));
    const exactRealization = await tests[0].realizationInput(retryItem.id, retryCash, '100000000');
    const exactRealizations = await paired(
      () => tests[0].realize(exactRealization),
      () => tests[1].realize(exactRealization),
    );
    assert(exactRealizations.every((result) => result.status === 'fulfilled'));
    assert.equal(exactRealizations.filter((result) => result.value.replayed).length, 1);
    const reverse = { id: exactRealization.id, revision: 1, reason: 'One explicit reversal from two independent retries.' };
    const reverseRetries = await paired(
      () => tests[0].reverseRealization(reverse),
      () => tests[1].reverseRealization(reverse),
    );
    assert(reverseRetries.every((result) => result.status === 'fulfilled' && result.value.realization.status === 'REVERSED' && result.value.realization.revision === 2));
    const [{ reversalEvents }] = await connectionSource.query('SELECT count(*)::int AS "reversalEvents" FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'FORECAST_REALIZATION\' AND "sourceId"=$2 AND action=\'FINANCE_FORECAST_REALIZATION_REVERSED\'', [fixture.workspaceId, exactRealization.id]);
    assert.equal(reversalEvents, 1);

    const voidItem = tests[0].manualItemInput({ amountMicros: '100000000' });
    await tests[0].saveItem(voidItem);
    const voidCash = await tests[0].payment(tests[0].paymentInput({ category: 'EXPENSE', amountMicros: '100000000', date: today }));
    const voidApplication = await tests[0].realizationInput(voidItem.id, voidCash, '100000000');
    const voidCashRevision = (await tests[1].rawCash(voidCash)).revision;
    const voidRace = await paired(
      () => tests[0].realize(voidApplication),
      () => services[1].business.command(...tests[1].argumentsFor(), { action: 'transition', id: voidCash, revision: voidCashRevision, status: 'VOID', note: 'Synthetic concurrent cash void reverses its forecast applications.', evidence: 'https://example.invalid/forecast-void' }),
    );
    assert.equal(voidRace[1].status, 'fulfilled');
    assert(voidRace[0].status === 'fulfilled' || [400, 409].includes(voidRace[0].reason.status));
    const [{ activeAfterVoid }] = await connectionSource.query('SELECT count(*)::int AS "activeAfterVoid" FROM core."deliveryFinanceForecastRealization" WHERE "workspaceId"=$1 AND "cashId"=$2 AND status=\'ACTIVE\'', [fixture.workspaceId, voidCash]);
    assert.equal(activeAfterVoid, 0);
    assert.equal((await tests[0].selectedForecastItem(voidItem.id)).remainingMicros, '100000000');
    assert.equal((await tests[0].rawCash(voidCash)).status, 'VOID');

    const cancelItem = tests[0].manualItemInput({ amountMicros: '100000000' });
    await tests[0].saveItem(cancelItem);
    const cancelCash = await tests[0].payment(tests[0].paymentInput({ category: 'EXPENSE', amountMicros: '100000000', date: today }));
    const cancelApplication = await tests[0].realizationInput(cancelItem.id, cancelCash, '100000000');
    const cancelInput = await tests[1].revisedItemInput(cancelItem.id, { status: 'CANCELLED', reason: 'Cancel only the remaining cash expectation.' });
    const cancelRace = await paired(
      () => tests[0].realize(cancelApplication),
      () => tests[1].saveItem(cancelInput),
    );
    assert.equal(cancelRace[1].status, 'fulfilled');
    assert(cancelRace[0].status === 'fulfilled' || [400, 409].includes(cancelRace[0].reason.status));
    const cancelled = await tests[0].selectedForecastItem(cancelItem.id);
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.remainingMicros, '0');
    assert.equal(cancelled.appliedMicros, cancelRace[0].status === 'fulfilled' ? '100000000' : '0');

    const liveInvoice = await tests[0].saveCash({ date: dateShift(today, -10), dueDate: tomorrow });
    const liveCollection = await tests[0].sourceItemInput('RECEIVABLE', liveInvoice);
    await tests[0].saveItem(liveCollection);
    const liveStructuralToken = (await tests[0].forecastSource('RECEIVABLE', liveInvoice)).sourceReviewToken;
    const liveReceipt = await tests[0].payment(tests[0].paymentInput({ amountMicros: '400000000', date: today }));
    const liveSettlement = await tests[1].settlementInput(liveReceipt, liveInvoice, '400000000');
    const liveEdit = await tests[0].revisedItemInput(liveCollection.id, { note: 'Routine receipt concurrent with a schedule edit.' });
    const livePaymentRace = await paired(
      () => tests[0].saveItem(liveEdit),
      () => tests[1].settle(liveSettlement),
    );
    assert.equal(livePaymentRace[1].status, 'fulfilled');
    if (livePaymentRace[0].status === 'rejected') {
      assert.equal(livePaymentRace[0].reason.status, 409);
      assert.match(livePaymentRace[0].reason.message, /outstanding balance|remaining amount/i);
    }
    const liveItem = await tests[0].selectedForecastItem(liveCollection.id);
    assert.equal(liveItem.remainingMicros, '600000000');
    assert(!liveItem.warnings.includes('SOURCE_CHANGED'));
    assert.equal((await tests[0].forecastSource('RECEIVABLE', liveInvoice)).sourceReviewToken, liveStructuralToken);
    await tests[0].saveItem(await tests[0].revisedItemInput(liveCollection.id, { note: 'Refreshed live balance without structural reapproval.' }));

    const directory = () => services[1].access.directory(fixture.workspaceId, fixture.people.admin.memberId, fixture.people.admin.userWorkspaceId);
    const revoke = (person, revision) => services[1].access.assignRoles(fixture.workspaceId, fixture.people.admin.memberId, fixture.people.admin.userWorkspaceId, { memberId: person.memberId, roleIds: [], roleRevisions: [], revision });
    const accessKey = `delivery:${fixture.workspaceId}`;
    const ownerInput = tests[0].manualItemInput({ ownerId: fixture.people.secondWriter.memberId });
    const ownerAccess = (await directory()).members.find((member) => member.memberId === fixture.people.secondWriter.memberId);
    assert(ownerAccess);
    const ownerBlocker = await holdLock(accessKey);
    const ownerRevocation = track(revoke(fixture.people.secondWriter, ownerAccess.revision));
    await waitForLock(secondPid, accessKey);
    const ownerWrite = track(tests[0].saveItem(ownerInput));
    await waitForLock(firstPid, accessKey);
    await releaseLock(ownerBlocker);
    await bounded(ownerRevocation, 'Queued owner role revocation did not finish.');
    await assert.rejects(bounded(ownerWrite, 'Owner-invalid forecast write did not finish.'), { status: 400 });

    const plan = { id: randomUUID(), revision: 0, type: 'OVERHEAD', name: 'Synthetic concurrent plan source', currency: 'USD', monthlyAmountMicros: '100000000', memberId: null, startMonth: '2020-01', endMonth: null, dueDay: 31, active: true };
    await services[0].finance.savePlan(...tests[0].argumentsFor(), plan);
    const stalePlanItem = await tests[0].sourceItemInput('PLAN', plan.id, { planMonth: today.slice(0, 7) });
    const planBlocker = await holdLock(accessKey);
    const planUpdate = track(services[1].finance.savePlan(...tests[1].argumentsFor(), { ...plan, revision: 1, monthlyAmountMicros: '200000000' }));
    await waitForLock(secondPid, accessKey);
    const stalePlanWrite = track(tests[0].saveItem(stalePlanItem));
    await waitForLock(firstPid, accessKey);
    await releaseLock(planBlocker);
    await bounded(planUpdate, 'Queued source plan update did not finish.');
    await assert.rejects(bounded(stalePlanWrite, 'Stale plan expectation did not finish.'), { status: 409 });

    const writerAccess = (await directory()).members.find((member) => member.memberId === fixture.people.writer.memberId);
    assert(writerAccess);
    const revokedInput = tests[0].manualItemInput();
    const accessBlocker = await holdLock(accessKey);
    const writerRevocation = track(revoke(fixture.people.writer, writerAccess.revision));
    await waitForLock(secondPid, accessKey);
    const revokedWrite = track(tests[0].saveItem(revokedInput));
    await waitForLock(firstPid, accessKey);
    await releaseLock(accessBlocker);
    await bounded(writerRevocation, 'Queued current-actor revocation did not finish.');
    await assert.rejects(bounded(revokedWrite, 'Revoked forecast write did not finish.'), { status: 403 });
    const [{ forbiddenItems }] = await connectionSource.query('SELECT count(*)::int AS "forbiddenItems" FROM core."deliveryFinanceForecastItem" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])', [fixture.workspaceId, [ownerInput.id, stalePlanItem.id, revokedInput.id]]);
    assert.equal(forbiddenItems, 0);
    console.log('PASS independent-session cash forecast: unique invoice schedules and command retries/current-state replay, conserved actual payment and expected-item capacity, realization/reversal retries, void/cancel races, routine receipt updates versus structural review, ordered plan changes and owner/current-role revocation. No providers or real financial data.');
  } finally {
    startBarrier?.ready.resolve();
    startBarrier = null;
    try {
      for (const blocker of blockers) await releaseLock(blocker);
      await bounded(
        Promise.allSettled(pending),
        'Pending forecast operations did not settle for cleanup.',
        16000,
      );
    } finally {
      for (const source of sources)
        if (source.isInitialized) await source.destroy();
      try {
        if (fixture && connectionSource.isInitialized) {
          await cleanup(fixture);
          console.log('Removed exact disposable forecast workspaces, schema, accounts, financial records and histories; recovery journal removed.');
        }
      } finally {
        if (connectionSource.isInitialized) await connectionSource.destroy();
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  if (existsSync(FILE)) console.error(`Exact cleanup recovery journal: ${FILE}`);
  process.exitCode = 1;
});

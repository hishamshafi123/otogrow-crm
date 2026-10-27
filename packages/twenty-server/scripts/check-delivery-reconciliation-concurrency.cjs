const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  createFixture,
  cleanupFixture,
  buildServices,
  harness,
  MONTH,
} = require('./check-delivery-reconciliation.cjs');

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

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This script only uses exact disposable local fixtures.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const sentinel = `otogrow-reconciliation-concurrency:${randomUUID()}`;
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
            'Both reconciliation sessions did not reach the start barrier.',
          );
        }
        return callback(manager);
      }),
  }));
  const paired = async (first, second) => {
    startBarrier = { arrivals: new Set(), ready: deferred() };
    return bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Concurrent reconciliation operations did not settle.',
    );
  };
  const oneWinner = (results, statuses = [409]) => {
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const failures = results.filter((result) => result.status === 'rejected');
    assert.equal(failures.length, 1);
    assert(
      statuses.includes(failures[0].reason.status),
      `Unexpected concurrent rejection: ${failures[0].reason}`,
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
    const classId = (unsigned >> 32n).toString();
    const objectId = (unsigned & 0xffffffffn).toString();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [{ waiting }] = await connectionSource.query(
        "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted AND classid::text=$2 AND objid::text=$3 AND objsubid=1) AS waiting",
        [pid, classId, objectId],
      );
      if (waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail(`Fixture session did not wait on expected lock ${key}`);
  };
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    fixture = await connectionSource.transaction((manager) =>
      createFixture(manager, 'recon_concurrency'),
    );
    if (process.env.OTOGROW_RECONCILIATION_CONCURRENCY_TEST_FAILURE === '1')
      throw new Error('Injected reconciliation concurrency cleanup failure');
    const services = scoped.map((source) => buildServices(source, fixture));
    const tests = services.map((service) => harness(service, fixture));
    const [{ pid: firstPid }] = await sources[0].query(
      'SELECT pg_backend_pid() AS pid',
    );
    const [{ pid: secondPid }] = await sources[1].query(
      'SELECT pg_backend_pid() AS pid',
    );
    assert.notEqual(
      firstPid,
      secondPid,
      'Concurrency checks require independent database sessions.',
    );
    const activeRelations = async (table, fields) => {
      assert(
        ['deliveryFinanceSettlement', 'deliveryFinanceCashMatch'].includes(
          table,
        ),
      );
      const rows = await connectionSource.query(
        `SELECT * FROM core."${table}" WHERE "workspaceId"=$1 AND status='ACTIVE'`,
        [fixture.workspaceId],
      );
      return rows.filter((row) =>
        Object.entries(fields).every(([name, value]) => row[name] === value),
      );
    };
    const assertCapacity = (relations, limit) =>
      assert(
        relations.reduce(
          (total, relation) => total + BigInt(relation.amountMicros),
          0n,
        ) <= BigInt(limit),
      );

    const cash = await tests[0].payment();
    const firstInvoice = await tests[0].saveCash();
    const secondInvoice = await tests[0].saveCash();
    const firstSettlement = await tests[0].settlementInput(
      cash,
      firstInvoice,
      '600000000',
    );
    const secondSettlement = await tests[0].settlementInput(
      cash,
      secondInvoice,
      '600000000',
    );
    oneWinner(
      await paired(
        () => tests[0].settle(firstSettlement),
        () => tests[1].settle(secondSettlement),
      ),
    );
    const settled = await activeRelations('deliveryFinanceSettlement', {
      cashId: cash,
    });
    assert.equal(settled.length, 1);
    assertCapacity(settled, '1000000000');
    assert.equal(
      (await tests[0].cash(cash)).remainingSettlementMicros,
      '400000000',
    );

    const sharedInvoice = await tests[0].saveCash();
    const firstReceipt = await tests[0].payment();
    const secondReceipt = await tests[0].payment();
    const invoiceFirst = await tests[0].settlementInput(
      firstReceipt,
      sharedInvoice,
      '600000000',
    );
    const invoiceSecond = await tests[0].settlementInput(
      secondReceipt,
      sharedInvoice,
      '600000000',
    );
    oneWinner(
      await paired(
        () => tests[0].settle(invoiceFirst),
        () => tests[1].settle(invoiceSecond),
      ),
    );
    assert.equal(
      (await tests[0].receivable(sharedInvoice)).outstandingMicros,
      '400000000',
    );
    assertCapacity(
      await activeRelations('deliveryFinanceSettlement', {
        receivableId: sharedInvoice,
      }),
      '1000000000',
    );

    const monthly = await tests[0].monthly();
    const matchCashA = await tests[0].payment();
    const matchCashB = await tests[0].payment();
    const matchA = await tests[0].matchInput(matchCashA, monthly, '600000000');
    const matchB = await tests[0].matchInput(matchCashB, monthly, '600000000');
    oneWinner(
      await paired(
        () => tests[0].match(matchA),
        () => tests[1].match(matchB),
      ),
    );
    assertCapacity(
      await activeRelations('deliveryFinanceCashMatch', { entryId: monthly }),
      '1000000000',
    );
    assert.equal(
      (await tests[0].entry(monthly)).allocations[0].remainingMatchMicros,
      '400000000',
    );
    const monthlyA = await tests[0].monthly();
    const monthlyB = await tests[0].monthly();
    const sharedCash = await tests[0].payment();
    const cashMatchA = await tests[0].matchInput(
      sharedCash,
      monthlyA,
      '600000000',
    );
    const cashMatchB = await tests[0].matchInput(
      sharedCash,
      monthlyB,
      '600000000',
    );
    oneWinner(
      await paired(
        () => tests[0].match(cashMatchA),
        () => tests[1].match(cashMatchB),
      ),
    );
    assertCapacity(
      await activeRelations('deliveryFinanceCashMatch', { cashId: sharedCash }),
      '1000000000',
    );

    const retryPayment = tests[0].paymentInput();
    const paymentRetries = await paired(
      () => tests[0].payment(retryPayment),
      () => tests[1].payment(retryPayment),
    );
    assert(
      paymentRetries.every(
        (result) =>
          result.status === 'fulfilled' && result.value === retryPayment.id,
      ),
    );
    const retryInvoice = await tests[0].saveCash();
    const retryInput = await tests[0].settlementInput(
      retryPayment.id,
      retryInvoice,
      '1000000000',
    );
    const retries = await paired(
      () => tests[0].settle(retryInput),
      () => tests[1].settle(retryInput),
    );
    assert(
      retries.every(
        (result) =>
          result.status === 'fulfilled' && result.value === retryInput.id,
      ),
    );
    assert.equal(
      (
        await activeRelations('deliveryFinanceSettlement', {
          cashId: retryPayment.id,
        })
      ).length,
      1,
    );
    const [{ count: retryEvents }] = await connectionSource.query(
      'SELECT count(*)::int AS count FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceId"=$2',
      [fixture.workspaceId, retryInput.id],
    );
    assert.equal(
      retryEvents,
      1,
      'A concurrent exact retry must preserve a single audit event.',
    );
    oneWinner(
      await paired(
        () => tests[0].reverse(retryInput.id, 'SETTLEMENT'),
        () =>
          tests[1].reverse(
            retryInput.id,
            'SETTLEMENT',
            1,
            fixture.people.writer,
            'Different independently reviewed correction.',
          ),
      ),
      [400, 409],
    );
    assert.equal(
      (await tests[0].receivable(retryInvoice)).outstandingMicros,
      '1000000000',
    );

    const legacyInvoice = await tests[0].saveCash();
    const legacyCash = await tests[0].payment();
    const legacySettlement = await tests[0].settlementInput(
      legacyCash,
      legacyInvoice,
      '600000000',
    );
    oneWinner(
      await paired(
        () => tests[0].settle(legacySettlement),
        () => tests[1].transition(legacyInvoice, 'PAID'),
      ),
      [400, 409],
    );
    const legacyState = await tests[0].receivable(legacyInvoice);
    assert(['0', '400000000'].includes(legacyState.outstandingMicros));
    assert(
      BigInt(legacyState.settledMicros) <= BigInt(legacyState.amountMicros),
    );

    const voidCash = await tests[0].payment();
    const voidInvoice = await tests[0].saveCash();
    const voidSettlement = await tests[0].settlementInput(
      voidCash,
      voidInvoice,
      '500000000',
    );
    const voidCashRace = await paired(
      () => tests[0].settle(voidSettlement),
      () => tests[1].transition(voidCash, 'VOID'),
    );
    assert.equal(voidCashRace[1].status, 'fulfilled');
    if (voidCashRace[0].status === 'rejected')
      assert([400, 409].includes(voidCashRace[0].reason.status));
    assert.equal((await tests[0].cash(voidCash)).status, 'VOID');
    assert.equal(
      (await activeRelations('deliveryFinanceSettlement', { cashId: voidCash }))
        .length,
      0,
    );
    assert.equal(
      (await tests[0].receivable(voidInvoice)).outstandingMicros,
      '1000000000',
    );
    const voidMatchCash = await tests[0].payment();
    const voidMatchEntry = await tests[0].monthly();
    const voidMatch = await tests[0].matchInput(
      voidMatchCash,
      voidMatchEntry,
      '500000000',
    );
    const monthlyVoidRace = await paired(
      () => tests[0].match(voidMatch),
      () =>
        services[1].finance.voidEntry(...tests[1].argumentsFor(), {
          id: voidMatchEntry,
          revision: 2,
          reason: 'Concurrent recognition correction fixture.',
        }),
    );
    assert.equal(monthlyVoidRace[1].status, 'fulfilled');
    if (monthlyVoidRace[0].status === 'rejected')
      assert([400, 409].includes(monthlyVoidRace[0].reason.status));
    assert.equal((await tests[0].entry(voidMatchEntry)).status, 'VOID');
    assert.equal(
      (
        await activeRelations('deliveryFinanceCashMatch', {
          entryId: voidMatchEntry,
        })
      ).length,
      0,
    );
    assert.equal((await tests[0].cash(voidMatchCash)).status, 'POSTED');
    assert.equal(
      (await tests[0].cash(voidMatchCash)).remainingMatchMicros,
      '1000000000',
    );

    const accessKey = `delivery:${fixture.workspaceId}`;
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
      const state = await directory();
      const member = state.members.find(
        (value) => value.memberId === fixture.people.writer.memberId,
      );
      const role = state.roles.find(
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
    const deniedCash = await tests[0].payment();
    const deniedInvoice = await tests[0].saveCash();
    const deniedSettlement = await tests[0].settlementInput(
      deniedCash,
      deniedInvoice,
      '100000000',
    );
    const beforeRevoke = await memberAccess();
    assert(beforeRevoke);
    const accessBlocker = await holdLock(accessKey);
    const revocation = track(revoke(beforeRevoke.revision));
    await waitForLock(secondPid, accessKey);
    const deniedWrite = track(tests[0].settle(deniedSettlement));
    await waitForLock(firstPid, accessKey);
    await releaseLock(accessBlocker);
    await bounded(
      revocation,
      'Queued reconciliation role revocation did not finish.',
    );
    await assert.rejects(
      bounded(deniedWrite, 'Revoked settlement did not finish.'),
      { status: 403 },
    );
    assert.equal(
      (
        await activeRelations('deliveryFinanceSettlement', {
          cashId: deniedCash,
        })
      ).length,
      0,
    );
    await restore();

    const orderedCash = await tests[0].payment();
    const orderedEntry = await tests[0].monthly();
    const orderedMatch = await tests[0].matchInput(
      orderedCash,
      orderedEntry,
      '100000000',
    );
    const beforeOrderedRevocation = await memberAccess();
    const periodKey = `finance-period:${fixture.workspaceId}:${MONTH}`;
    const periodBlocker = await holdLock(periodKey);
    const authorizedMatch = track(tests[0].match(orderedMatch));
    await waitForLock(firstPid, periodKey);
    const orderedRevocation = track(revoke(beforeOrderedRevocation.revision));
    await waitForLock(secondPid, accessKey);
    await releaseLock(periodBlocker);
    await bounded(
      authorizedMatch,
      'Already-authorized match did not complete before queued revocation.',
    );
    await bounded(orderedRevocation, 'Serialized revocation did not finish.');
    assert.equal(
      (
        await activeRelations('deliveryFinanceCashMatch', {
          cashId: orderedCash,
        })
      ).length,
      1,
    );
    await assert.rejects(tests[0].payment(), { status: 403 });
    console.log(
      'PASS: independent-session conserved cash and invoice/monthly balances, exact retry uniqueness, reversal and legacy-payment races, cash/monthly void races and ordered current-role revocation. Disposable fixtures only; no providers or real payments.',
    );
  } finally {
    startBarrier?.ready.resolve();
    startBarrier = null;
    try {
      for (const blocker of blockers) await releaseLock(blocker);
      await bounded(
        Promise.allSettled(pending),
        'Pending reconciliation fixture operations did not settle for cleanup.',
        16000,
      );
    } finally {
      for (const source of sources)
        if (source.isInitialized) await source.destroy();
      try {
        if (fixture && connectionSource.isInitialized) {
          await connectionSource.transaction(async (manager) => {
            await manager.query("SET LOCAL lock_timeout='5s'");
            await cleanupFixture(manager, fixture);
          });
          console.log(
            'Removed exact disposable reconciliation workspaces, schema, users, cash, links, monthly entries and activity.',
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
  process.exitCode = 1;
});

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  MONTH,
  NEXT_MONTH,
  TABLES: AI_TABLES,
  createAiFixture,
  cleanupAiFixture,
  buildAiServices,
  seedSpend,
  aiHarness,
} = require('./check-delivery-ai-finance.cjs');

const TABLES = [...AI_TABLES, 'deliveryFinancePeriod'];
const GUARD_MONTH = '2020-04';
const HISTORY_MONTH = '2021-01';
const PAGING_MONTH = '2021-02';

const createPeriodFixture = (manager, prefix = 'ai_finance_period_test') =>
  createAiFixture(manager, prefix);

async function cleanupPeriodFixture(manager, fixture) {
  const workspaces = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  assert.equal(workspaces.length, 2);
  for (const workspace of workspaces) {
    assert.equal(workspace.displayName, fixture.sentinel);
    assert.equal(workspace.databaseSchema, fixture.schemaName);
  }
  await manager.query(
    'DELETE FROM core."deliveryFinanceEvent" WHERE "workspaceId"=ANY($1::uuid[]) AND "sourceType"=\'PERIOD\'',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  await manager.query(
    'DELETE FROM core."deliveryFinancePeriod" WHERE "workspaceId"=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  await cleanupAiFixture(manager, fixture);
}

function buildPeriodServices(source, fixture) {
  const {
    DeliveryFinancePeriodService,
  } = require('../dist/modules/delivery/finance/delivery-finance-period.service');
  const services = buildAiServices(source, fixture);
  return {
    ...services,
    periods: new DeliveryFinancePeriodService(
      source,
      services.delivery,
      services.access,
    ),
  };
}

function periodHarness(source, services, fixture) {
  const tests = aiHarness(source, services, fixture);
  const readPeriod = (
    month = MONTH,
    person = fixture.people.reader,
    input = {},
    workspace = fixture.workspace,
  ) =>
    services.periods.snapshot(...tests.argumentsFor(person, workspace), {
      month,
      ...input,
    });
  const commandInput = async (month, status, fields = {}) => {
    const current = await readPeriod(month);
    return {
      id: randomUUID(),
      month,
      revision: current.period.revision,
      expectedPreviewToken: current.previewToken,
      status,
      reason:
        'Synthetic reviewed management result period; no tax or accounting-close claim.',
      acknowledgeLimitations: true,
      ...fields,
    };
  };
  const change = (input, person = fixture.people.writer) =>
    services.periods.change(...tests.argumentsFor(person), input);
  const history = (month = MONTH, input = {}, person = fixture.people.reader) =>
    services.periods.history(...tests.argumentsFor(person), {
      month,
      ...input,
    });
  const fingerprint = (tables = TABLES) => tests.fingerprint(tables);
  return { ...tests, readPeriod, commandInput, change, history, fingerprint };
}

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This actual-service period checker always rolls back.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const fixture = await createPeriodFixture(runner.manager);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const services = buildPeriodServices(source, fixture);
    const tests = periodHarness(source, services, fixture);
    const { people, projects, workspaceId } = fixture;
    const denied = async (operation, statuses = [400, 403, 404, 409]) => {
      const before = await tests.fingerprint();
      await assert.rejects(operation, (error) =>
        statuses.includes(error.status),
      );
      assert.deepEqual(
        await tests.fingerprint(),
        before,
        'Denied period/recognition changes must not write.',
      );
    };
    const pristine = await tests.fingerprint();
    const absent = await tests.readPeriod();
    assert.equal(absent.workspaceId, workspaceId);
    assert.equal(absent.memberId, people.reader.memberId);
    assert.equal(absent.userWorkspaceId, people.reader.userWorkspaceId);
    assert.equal(absent.canManage, false);
    assert.equal(absent.period.id, null);
    assert.equal(absent.period.status, 'OPEN');
    assert.equal(absent.period.revision, 0);
    assert.deepEqual(absent.summaries, []);
    assert.equal(absent.blockerCount, 0);
    assert.deepEqual((await tests.history()).events, []);
    assert.deepEqual(
      await tests.fingerprint(),
      pristine,
      'Missing OPEN periods must remain read-only.',
    );
    assert.equal(
      (await tests.readPeriod(MONTH, people.writer)).canManage,
      true,
    );
    await denied(() => tests.readPeriod(MONTH, people.outsider), [403]);
    await denied(
      () =>
        tests.readPeriod(MONTH, people.writer, {}, fixture.foreignWorkspace),
      [403],
    );
    await denied(
      () =>
        services.periods.snapshot(
          fixture.workspace,
          people.reader.memberId,
          people.writer.userWorkspaceId,
          { month: MONTH },
        ),
      [403],
    );
    const emptyLock = await tests.commandInput(HISTORY_MONTH, 'LOCKED');
    await denied(() => tests.change(emptyLock, people.reader), [403]);
    await denied(() => tests.change({ ...emptyLock, reason: ' ' }), [400]);
    await denied(
      () => tests.change({ ...emptyLock, acknowledgeLimitations: false }),
      [400],
    );

    const draftId = await tests.monthly(
      {
        kind: 'COST',
        amountMicros: '2500000',
        allocations: [{ projectId: projects.first, amountMicros: '2500000' }],
      },
      false,
    );
    const draftPreview = await tests.readPeriod();
    assert.equal(draftPreview.blockerCount, 1);
    assert(
      draftPreview.blockers.some(
        (blocker) =>
          blocker.entryId === draftId && blocker.reason === 'DRAFT_ENTRY',
      ),
    );
    await denied(
      async () => tests.change(await tests.commandInput(MONTH, 'LOCKED')),
      [400, 409],
    );
    await services.finance.postEntry(...tests.argumentsFor(), {
      id: draftId,
      revision: 1,
    });
    await tests.monthly({
      kind: 'REVENUE',
      amountMicros: '5000000',
      allocations: [{ projectId: projects.first, amountMicros: '5000000' }],
    });
    await tests.monthly({
      kind: 'COST',
      currency: 'EUR',
      amountMicros: '1000000',
      allocations: [{ projectId: null, amountMicros: '1000000' }],
    });
    await tests.monthly({
      kind: 'COST',
      amountMicros: '0',
      allocations: [{ projectId: null, amountMicros: '0' }],
    });
    const ai = await seedSpend(runner.manager, fixture);
    const initialAi = await tests.prepareInput(ai.spend.id, ai.event.id);
    await tests.prepare(initialAi);
    const initialAiPost = await tests.postInput(initialAi.id);
    await tests.post(initialAiPost);
    const lower = await tests.late(ai.spend.id, '1000000');
    const crossMonth = await tests.correctionInput(ai.spend.id, lower.id, {
      month: NEXT_MONTH,
    });
    await tests.prepare(crossMonth);
    const withCrossMonth = await tests.readPeriod();
    assert(
      withCrossMonth.blockers.some(
        (blocker) =>
          blocker.entryId === crossMonth.id &&
          blocker.month === NEXT_MONTH &&
          blocker.reason === 'CROSS_MONTH_CORRECTION',
      ),
    );
    assert(
      (await tests.readPeriod(NEXT_MONTH)).blockers.some(
        (blocker) =>
          blocker.entryId === crossMonth.id && blocker.reason === 'DRAFT_ENTRY',
      ),
    );
    await denied(
      async () => tests.change(await tests.commandInput(MONTH, 'LOCKED')),
      [400, 409],
    );
    await denied(
      async () => tests.change(await tests.commandInput(NEXT_MONTH, 'LOCKED')),
      [400, 409],
    );
    await services.finance.voidEntry(...tests.argumentsFor(), {
      id: crossMonth.id,
      revision: 1,
      reason: 'Resolve the pending cross-month correction before locking.',
    });

    const preview = await tests.readPeriod();
    const usd = preview.summaries.find((summary) => summary.currency === 'USD');
    const euro = preview.summaries.find(
      (summary) => summary.currency === 'EUR',
    );
    assert.equal(usd.revenueMicros, '5000000');
    assert.equal(usd.costMicros, '4500000');
    assert.equal(usd.resultMicros, '500000');
    assert.equal(euro.costMicros, '1000000');
    assert.equal(euro.resultMicros, '-1000000');
    const lock = await tests.commandInput(MONTH, 'LOCKED');
    const locked = await tests.change(lock);
    assert.equal(locked.period.status, 'LOCKED');
    assert.equal(locked.period.revision, 1);
    const afterLock = await tests.fingerprint();
    assert.equal((await tests.change(lock)).replayed, true);
    assert.deepEqual(await tests.fingerprint(), afterLock);
    await denied(
      () => tests.change({ ...lock, reason: 'Another command body.' }),
      [409],
    );
    await denied(() => tests.change(lock, people.secondWriter), [409]);
    const lockedFacts = await tests.readPeriod();
    assert.equal(lockedFacts.recognitionHash, preview.recognitionHash);
    assert.equal(lockedFacts.blockerCount, 0);
    assert.equal(
      (
        await services.finance.snapshot(...tests.argumentsFor(people.reader), {
          month: MONTH,
        })
      ).period.status,
      'LOCKED',
    );

    await denied(
      () =>
        services.finance.saveEntry(
          ...tests.argumentsFor(),
          tests.monthlyInput({ id: randomUUID(), month: MONTH }),
        ),
      [409],
    );
    await denied(
      () =>
        services.finance.prepareMonth(...tests.argumentsFor(), {
          month: MONTH,
        }),
      [409],
    );
    const postedManual = await tests.entry(draftId);
    await denied(
      () =>
        services.finance.voidEntry(...tests.argumentsFor(), {
          id: draftId,
          revision: postedManual.revision,
          reason: 'A locked recognized result cannot be voided.',
        }),
      [409],
    );
    const newAi = await seedSpend(runner.manager, fixture, {
      actualMicroUsd: '10000',
    });
    const newImport = await tests.prepareInput(newAi.spend.id, newAi.event.id);
    await denied(() => tests.prepare(newImport), [409]);
    const closedOriginalCorrection = await tests.correctionInput(
      ai.spend.id,
      lower.id,
      { month: NEXT_MONTH },
    );
    await denied(() => tests.prepare(closedOriginalCorrection), [409]);
    const otherAi = await seedSpend(runner.manager, fixture, {
      actualMicroUsd: '10000',
    });
    const otherImport = await tests.prepareInput(
      otherAi.spend.id,
      otherAi.event.id,
      { month: NEXT_MONTH },
    );
    await tests.prepare(otherImport);
    await tests.post(await tests.postInput(otherImport.id));
    const targetClosed = await tests.correctionInput(
      otherAi.spend.id,
      otherAi.event.id,
      { month: MONTH },
    );
    await denied(() => tests.prepare(targetClosed), [409]);
    const noOpBefore = await tests.fingerprint();
    assert.equal((await tests.prepare(initialAi)).replayed, true);
    assert.equal((await tests.post(initialAiPost)).replayed, true);
    assert.deepEqual(
      await tests.fingerprint(),
      noOpBefore,
      'Authorized read-only retries must not alter a locked result.',
    );

    const plan = {
      id: randomUUID(),
      revision: 0,
      type: 'OVERHEAD',
      name: 'Synthetic period plan',
      currency: 'USD',
      monthlyAmountMicros: '10000',
      memberId: null,
      startMonth: MONTH,
      endMonth: null,
      dueDay: 31,
      active: true,
    };
    await services.finance.savePlan(...tests.argumentsFor(), plan);
    const expenseId = await tests.payment(
      tests.paymentInput({ category: 'EXPENSE', amountMicros: '2500000' }),
    );
    const invoiceId = await tests.saveCash();
    const receiptId = await tests.payment(
      tests.paymentInput({ amountMicros: '400000000' }),
    );
    await tests.settle(
      await tests.settlementInput(receiptId, invoiceId, '400000000'),
    );
    const monthlyMatch = await tests.matchInput(expenseId, draftId, '500000');
    await tests.match(monthlyMatch);
    await tests.reverse(monthlyMatch.id, 'MATCH');
    await tests.match(await tests.matchInput(expenseId, draftId, '500000'));
    await tests.transition(expenseId, 'VOID');
    assert.equal(
      (await tests.receivable(invoiceId)).outstandingMicros,
      '600000000',
    );
    assert.equal((await tests.entry(draftId)).status, 'POSTED');
    await tests.late(ai.spend.id, '3000000');
    const liveReconciliation = await tests.readPeriod();
    assert.equal(
      liveReconciliation.recognitionHash,
      lockedFacts.recognitionHash,
    );
    assert.equal(
      liveReconciliation.previewToken,
      lockedFacts.previewToken,
      'Cash links, plans and incoming ledger evidence do not change recognition facts or period review.',
    );

    const reopen = await tests.commandInput(MONTH, 'OPEN');
    await tests.change(reopen);
    assert.equal((await tests.readPeriod()).period.status, 'OPEN');
    const correction = await tests.correctionInput(ai.spend.id, lower.id);
    await tests.prepare(correction);
    await tests.post(await tests.postInput(correction.id));
    const relock = await tests.commandInput(MONTH, 'LOCKED');
    await tests.change(relock);
    const replayBefore = await tests.fingerprint();
    for (const oldCommand of [lock, reopen]) {
      const replay = await tests.change(oldCommand);
      assert.equal(replay.replayed, true);
      assert.equal(replay.period.status, 'LOCKED');
      assert.equal(replay.period.revision, 3);
    }
    assert.deepEqual(
      await tests.fingerprint(),
      replayBefore,
      'An old command replay cannot undo a later reopen/relock.',
    );
    const transitionHistory = await tests.history();
    assert.equal(transitionHistory.events.length, 3);
    assert(
      transitionHistory.events.some(
        (event) =>
          event.afterStatus === 'LOCKED' &&
          event.recognitionHash === preview.recognitionHash,
      ),
    );

    // A legacy locked-state fixture exercises individual guards even though normal locking refuses drafts.
    const manualGuard = await tests.monthly({ month: GUARD_MONTH }, false);
    const guardedAiSource = await seedSpend(runner.manager, fixture, {
      actualMicroUsd: '1',
    });
    const guardedAi = await tests.prepareInput(
      guardedAiSource.spend.id,
      guardedAiSource.event.id,
      {
        month: GUARD_MONTH,
        allocations: [{ projectId: null, amountMicros: '1' }],
      },
    );
    await tests.prepare(guardedAi);
    const {
      DeliveryFinancePeriodEntity,
    } = require('../dist/modules/delivery/finance/entities/delivery-finance-period.entity');
    await runner.manager
      .getRepository(DeliveryFinancePeriodEntity)
      .save({
        workspaceId,
        month: GUARD_MONTH,
        status: 'LOCKED',
        revision: 1,
        changedBy: people.writer.memberId,
        changedByName: 'Synthetic reviewer',
        reason: 'Synthetic legacy guard fixture, never real data.',
      });
    const existingDraft = await tests.entry(manualGuard);
    await denied(
      () =>
        services.finance.saveEntry(
          ...tests.argumentsFor(),
          tests.monthlyInput({
            id: manualGuard,
            revision: existingDraft.revision,
            month: GUARD_MONTH,
          }),
        ),
      [409],
    );
    await denied(
      () =>
        services.finance.postEntry(...tests.argumentsFor(), {
          id: manualGuard,
          revision: existingDraft.revision,
        }),
      [409],
    );
    await denied(
      () =>
        services.finance.voidEntry(...tests.argumentsFor(), {
          id: manualGuard,
          revision: existingDraft.revision,
          reason: 'Closed legacy draft guard.',
        }),
      [409],
    );
    await denied(
      async () => tests.post(await tests.postInput(guardedAi.id)),
      [409],
    );
    await tests.change(await tests.commandInput(GUARD_MONTH, 'OPEN'));
    await services.finance.postEntry(...tests.argumentsFor(), {
      id: manualGuard,
      revision: existingDraft.revision,
    });
    await tests.post(await tests.postInput(guardedAi.id));

    const {
      OtogrowActivityEventEntity,
    } = require('../dist/modules/otogrow-activity/entities/otogrow-activity-event.entity');
    const repositoryFor = runner.manager.getRepository.bind(runner.manager);
    let failActivity = false;
    runner.manager.getRepository = (entity) => {
      const repository = repositoryFor(entity);
      if (entity !== OtogrowActivityEventEntity) return repository;
      return new Proxy(repository, {
        get(target, property) {
          if (property === 'insert')
            return async (input) => {
              if (failActivity)
                throw new Error('Injected period audit failure');
              return target.insert(input);
            };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const atomicInput = await tests.commandInput(HISTORY_MONTH, 'LOCKED');
    const beforeAtomic = await tests.fingerprint();
    failActivity = true;
    try {
      await assert.rejects(
        () => tests.change(atomicInput),
        /Injected period audit failure/,
      );
    } finally {
      failActivity = false;
    }
    assert.deepEqual(
      await tests.fingerprint(),
      beforeAtomic,
      'Period state, immutable event and activity must roll back together.',
    );
    for (let index = 0; index < 11; index++) {
      await tests.change(await tests.commandInput(HISTORY_MONTH, 'LOCKED'));
      await tests.change(await tests.commandInput(HISTORY_MONTH, 'OPEN'));
    }
    const historyPage = await tests.history(HISTORY_MONTH);
    assert(historyPage.nextBeforeId);
    const historyNext = await tests.history(HISTORY_MONTH, {
      beforeId: historyPage.nextBeforeId,
    });
    assert.equal(historyNext.nextBeforeId, null);
    assert.equal(
      new Set(
        [...historyPage.events, ...historyNext.events].map((event) => event.id),
      ).size,
      22,
    );
    await denied(
      () => tests.history(MONTH, { beforeId: historyPage.events[0].id }),
      [400],
    );
    for (let index = 0; index < 51; index++)
      await tests.monthly({ month: PAGING_MONTH }, false);
    const blockerPage = await tests.readPeriod(PAGING_MONTH);
    assert.equal(blockerPage.blockerCount, 51);
    assert.equal(blockerPage.blockers.length, 50);
    assert(blockerPage.nextBlockerId);
    const blockerNext = await tests.readPeriod(PAGING_MONTH, people.reader, {
      afterBlockerId: blockerPage.nextBlockerId,
    });
    assert.equal(blockerNext.blockers.length, 1);
    assert.equal(blockerNext.previewToken, blockerPage.previewToken);
    await denied(
      async () =>
        tests.change(await tests.commandInput(PAGING_MONTH, 'LOCKED')),
      [400, 409],
    );
    const beforeReads = await tests.fingerprint();
    await tests.readPeriod();
    await tests.history();
    assert.deepEqual(await tests.fingerprint(), beforeReads);
    const stale = await tests.commandInput(HISTORY_MONTH, 'LOCKED');
    await tests.monthly({ month: HISTORY_MONTH });
    await denied(() => tests.change(stale), [409]);
    const revoked = await tests.commandInput(HISTORY_MONTH, 'LOCKED');
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.writer.userId,
    ]);
    await denied(() => tests.change(revoked), [403]);
    await denied(() => tests.readPeriod(MONTH, people.writer), [403]);
    console.log(
      'PASS rollback-only result periods: missing-OPEN reads, draft/cross-month blockers, exact multi-currency results, all recognition guards, current-role authority, live cash/matching/AI evidence preservation, reasoned reopen/relock, stable current-state retries, immutable history/paging and atomic audit. No providers or persisted fixtures.',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
module.exports = {
  MONTH,
  NEXT_MONTH,
  TABLES,
  createPeriodFixture,
  cleanupPeriodFixture,
  buildPeriodServices,
  periodHarness,
};

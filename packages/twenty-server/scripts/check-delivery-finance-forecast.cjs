const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  TABLES: PERIOD_TABLES,
  createPeriodFixture,
  cleanupPeriodFixture,
  buildPeriodServices,
  periodHarness,
} = require('./check-delivery-finance-period.cjs');
const {
  dateShift,
  businessDate,
  withClock,
  assertFixture,
  mutateFixtureCash,
  financialFingerprint,
} = require('./check-delivery-finance-forecast-support.cjs');

const FORECAST_TABLES = [
  'deliveryFinanceForecastRealization',
  'deliveryFinanceForecastItem',
  'deliveryFinanceForecastAnchor',
];
const TABLES = [...PERIOD_TABLES, ...FORECAST_TABLES];
const EVENT_SOURCE_TYPES = [
  'FORECAST_ANCHOR',
  'FORECAST_ITEM',
  'FORECAST_REALIZATION',
];

const createForecastFixture = (manager, prefix = 'ai_finance_forecast') =>
  createPeriodFixture(manager, prefix);

async function cleanupForecastFixture(manager, fixture) {
  await assertFixture(manager, fixture);
  const workspaceIds = [fixture.workspaceId, fixture.foreignWorkspaceId];
  await manager.query(
    'DELETE FROM core."deliveryFinanceEvent" WHERE "workspaceId"=ANY($1::uuid[]) AND "sourceType"=ANY($2::text[])',
    [workspaceIds, EVENT_SOURCE_TYPES],
  );
  for (const table of FORECAST_TABLES)
    await manager.query(
      `DELETE FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
      [workspaceIds],
    );
  await cleanupPeriodFixture(manager, fixture);
}

function buildForecastServices(source, fixture) {
  const {
    DeliveryFinanceForecastService,
  } = require('../dist/modules/delivery/finance/delivery-finance-forecast.service');
  const services = buildPeriodServices(source, fixture);
  return {
    ...services,
    forecast: new DeliveryFinanceForecastService(
      source,
      services.delivery,
      services.access,
    ),
  };
}

function forecastHarness(source, services, fixture) {
  const tests = periodHarness(source, services, fixture);
  const forecast = (
    input = {},
    person = fixture.people.reader,
    workspace = fixture.workspace,
  ) =>
    services.forecast.snapshot(...tests.argumentsFor(person, workspace), {
      currency: 'USD',
      horizonDays: 30,
      ...input,
    });
  const forecastSources = (
    input = {},
    person = fixture.people.reader,
    workspace = fixture.workspace,
  ) =>
    services.forecast.sources(...tests.argumentsFor(person, workspace), {
      currency: 'USD',
      kind: 'RECEIVABLE',
      ...input,
    });
  const saveAnchor = (input, person = fixture.people.writer) =>
    services.forecast.saveAnchor(...tests.argumentsFor(person), input);
  const saveItem = (input, person = fixture.people.writer) =>
    services.forecast.saveItem(...tests.argumentsFor(person), input);
  const realize = (input, person = fixture.people.writer) =>
    services.forecast.realize(...tests.argumentsFor(person), input);
  const reverseRealization = (input, person = fixture.people.writer) =>
    services.forecast.reverseRealization(...tests.argumentsFor(person), input);
  const history = (input, person = fixture.people.reader) =>
    services.forecast.history(...tests.argumentsFor(person), input);
  const fingerprint = () => tests.fingerprint(TABLES);
  const financiallyUnchanged = async (operation) => {
    const before = await financialFingerprint(source.manager, fixture);
    const result = await operation();
    assert.deepEqual(
      await financialFingerprint(source.manager, fixture),
      before,
      'Forecast changes must preserve actual cash, recognition, periods, settlements, monthly matches and budgets.',
    );
    return result;
  };
  const denied = async (operation, statuses = [400, 403, 404, 409]) => {
    const before = await fingerprint();
    await assert.rejects(operation, (error) => statuses.includes(error.status));
    assert.deepEqual(
      await fingerprint(),
      before,
      'Denied forecast operations must not write.',
    );
  };
  const selectedForecastItem = async (id, currency = 'USD') => {
    const selected = (await forecast({ currency, selectedItemId: id }))
      .selectedItem;
    assert(selected, 'Expected a selected synthetic forecast item.');
    return selected;
  };
  const forecastSource = async (kind, id, fields = {}) => {
    const selected = (
      await forecastSources({ kind, selectedId: id, ...fields })
    ).selectedSource;
    assert(selected, 'Expected a selected synthetic forecast source.');
    return selected;
  };
  const anchorInput = async (fields = {}) => {
    const currency = fields.currency ?? 'USD';
    const timezone = fields.timezone ?? 'UTC';
    const current = await forecast({ currency });
    return {
      id: randomUUID(),
      revision: current.anchor?.revision ?? 0,
      currency,
      amountMicros: '0',
      closingDate: dateShift(businessDate(timezone), -2),
      timezone,
      note: 'Synthetic confirmed closing cash; no bank or provider connection.',
      evidenceUrl: 'https://example.invalid/forecast-closing-cash',
      acknowledgeCoverage: true,
      reason: 'Synthetic reviewed closing balance for acceptance.',
      ...fields,
    };
  };
  const manualItemInput = (fields = {}) => {
    const today = businessDate();
    return {
      commandId: randomUUID(),
      id: randomUUID(),
      revision: 0,
      status: 'ACTIVE',
      sourceType: 'MANUAL',
      sourceId: null,
      planMonth: null,
      currency: 'USD',
      title: 'Synthetic reviewed one-off cash expectation',
      amountMicros: '1000000000',
      expectedDate: dateShift(today, 1),
      ownerId: fixture.people.reader.memberId,
      nextActionDate: today,
      note: 'Synthetic accountable payment expectation, not a payment or recognized cost.',
      expectedSourceReviewToken: null,
      acknowledgeSourceWarnings: false,
      reason: 'Synthetic reviewed expectation.',
      ...fields,
    };
  };
  const sourceItemInput = async (kind, id, fields = {}) => {
    const current = await forecastSource(kind, id, {
      currency: fields.currency ?? 'USD',
      ...(kind === 'PLAN' ? { month: fields.planMonth } : {}),
    });
    return manualItemInput({
      sourceType: kind,
      sourceId: id,
      planMonth: current.planMonth,
      currency: current.currency,
      title: current.title,
      amountMicros:
        kind === 'RECEIVABLE' ? current.remainingMicros : current.amountMicros,
      expectedSourceReviewToken: current.sourceReviewToken,
      ...fields,
    });
  };
  const revisedItemInput = async (id, fields = {}) => {
    const item = await selectedForecastItem(id, fields.currency ?? 'USD');
    return manualItemInput({
      id,
      revision: item.revision,
      status: item.status,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      planMonth: item.planMonth,
      currency: item.currency,
      title: item.title,
      amountMicros:
        item.kind === 'COLLECTION' ? item.remainingMicros : item.amountMicros,
      expectedDate: item.expectedDate,
      ownerId: item.ownerId,
      nextActionDate: item.nextActionDate,
      note: item.note,
      expectedSourceReviewToken: item.sourceReviewToken,
      ...fields,
    });
  };
  const realizationInput = async (
    itemId,
    cashId,
    amountMicros,
    fields = {},
  ) => {
    const currency = fields.currency ?? 'USD';
    const item = await selectedForecastItem(itemId, currency);
    const cash = await forecastSource('CASH', cashId, { currency });
    const { currency: _currency, ...inputFields } = fields;
    return {
      id: randomUUID(),
      itemId,
      cashId,
      amountMicros,
      expectedCashReviewToken: cash.sourceReviewToken,
      expectedItemReviewToken: item.reviewToken,
      note: 'Explicitly applying already recorded synthetic cash; no new payment.',
      ...inputFields,
    };
  };
  return {
    ...tests,
    forecast,
    forecastSources,
    saveAnchor,
    saveItem,
    realize,
    reverseRealization,
    history,
    fingerprint,
    financiallyUnchanged,
    denied,
    selectedForecastItem,
    forecastSource,
    anchorInput,
    manualItemInput,
    sourceItemInput,
    revisedItemInput,
    realizationInput,
  };
}

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This actual-service cash-forecast checker always rolls back.',
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
    const fixture = await createForecastFixture(runner.manager);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const services = buildForecastServices(source, fixture);
    const tests = forecastHarness(source, services, fixture);
    const { people, projects, workspaceId } = fixture;
    const today = businessDate();
    const tomorrow = dateShift(today, 1);
    const closingDate = dateShift(today, -2);
    const hasException = (snapshot, code, fields = {}) =>
      snapshot.exceptions.some(
        (exception) =>
          exception.code === code &&
          Object.entries(fields).every(
            ([key, value]) => exception[key] === value,
          ),
      );
    const unchanged = (operation) => tests.financiallyUnchanged(operation);
    const pristine = await tests.fingerprint();
    const empty = await tests.forecast();
    assert.equal(empty.workspaceId, workspaceId);
    assert.equal(empty.memberId, people.reader.memberId);
    assert.equal(empty.userWorkspaceId, people.reader.userWorkspaceId);
    assert.equal(empty.canManage, false);
    assert.equal(empty.anchor, null);
    assert.equal(empty.currentCashMicros, null);
    assert.equal(empty.endingCashMicros, null);
    assert.equal(empty.projectionComplete, false);
    assert.deepEqual(empty.timeline, []);
    assert.equal((await tests.forecast({}, people.writer)).canManage, true);
    assert(empty.owners.some((owner) => owner.id === people.reader.memberId));
    assert(
      !empty.owners.some((owner) => owner.id === people.outsider.memberId),
    );
    await tests.forecastSources();
    assert.deepEqual(
      await tests.fingerprint(),
      pristine,
      'Forecast reads may not initialize rows or history.',
    );
    await tests.denied(() => tests.forecast({}, people.outsider), [403]);
    await tests.denied(
      () => tests.forecast({}, people.writer, fixture.foreignWorkspace),
      [403],
    );
    await tests.denied(
      () =>
        services.forecast.snapshot(
          fixture.workspace,
          people.reader.memberId,
          people.writer.userWorkspaceId,
          { currency: 'USD', horizonDays: 30 },
        ),
      [403],
    );
    await tests.denied(() => tests.forecast({ horizonDays: 31 }), [400]);
    const anchor = await tests.anchorInput({ closingDate });
    await tests.denied(() => tests.saveAnchor(anchor, people.reader), [403]);
    await tests.denied(
      () => tests.saveAnchor({ ...anchor, timezone: 'Invalid/Not_A_Zone' }),
      [400],
    );
    await tests.denied(
      () => tests.saveAnchor({ ...anchor, closingDate: today }),
      [400],
    );
    await tests.denied(
      () => tests.saveAnchor({ ...anchor, acknowledgeCoverage: false }),
      [400],
    );
    await tests.denied(() => tests.saveAnchor({ ...anchor, note: '' }), [400]);
    await tests.denied(
      () =>
        tests.saveAnchor({ ...anchor, amountMicros: '-9223372036854775809' }),
      [400],
    );
    const savedAnchor = await unchanged(() => tests.saveAnchor(anchor));
    assert.equal(savedAnchor.anchor.amountMicros, '0');
    const afterAnchor = await tests.fingerprint();
    assert.equal((await tests.saveAnchor(anchor)).replayed, true);
    assert.deepEqual(await tests.fingerprint(), afterAnchor);
    await tests.denied(
      () => tests.saveAnchor({ ...anchor, note: 'Another command body.' }),
      [409],
    );
    await tests.denied(
      () => tests.saveAnchor(anchor, people.secondWriter),
      [409],
    );
    assert.equal((await tests.forecast()).currentCashMicros, '0');

    await tests.saveCash({
      category: 'OPENING_BALANCE',
      amount: 500000,
      date: dateShift(closingDate, -20),
      dueDate: null,
    });
    await tests.payment(
      tests.paymentInput({
        date: dateShift(closingDate, -1),
        amountMicros: '100000000',
      }),
    );
    await tests.payment(
      tests.paymentInput({
        date: closingDate,
        category: 'EXPENSE',
        amountMicros: '50000000',
      }),
    );
    assert.equal(
      (await tests.forecast()).currentCashMicros,
      '0',
      'Opening cash and movements through the anchor date are already covered.',
    );
    const invoiceId = await tests.saveCash({
      date: dateShift(today, -10),
      dueDate: dateShift(today, -1),
    });
    const invoiceSource = await tests.forecastSource('RECEIVABLE', invoiceId);
    assert.equal(invoiceSource.remainingMicros, '1000000000');
    const collection = await tests.sourceItemInput('RECEIVABLE', invoiceId, {
      expectedDate: tomorrow,
    });
    await tests.denied(() => tests.saveItem(collection, people.reader), [403]);
    await tests.denied(
      () =>
        tests.saveItem({ ...collection, ownerId: people.outsider.memberId }),
      [400, 403],
    );
    await unchanged(() => tests.saveItem(collection));
    const afterCollection = await tests.fingerprint();
    assert.equal((await tests.saveItem(collection)).replayed, true);
    assert.deepEqual(await tests.fingerprint(), afterCollection);
    await tests.denied(
      () => tests.saveItem({ ...collection, note: 'Changed same request.' }),
      [409],
    );
    await tests.denied(
      () =>
        tests.saveItem({
          ...collection,
          commandId: randomUUID(),
          id: randomUUID(),
        }),
      [409],
    );
    const beforeReceipt = await tests.forecast();
    assert.equal(beforeReceipt.expectedInflowMicros, '1000000000');
    assert.equal(beforeReceipt.endingCashMicros, '1000000000');
    const receiptId = await tests.payment(
      tests.paymentInput({ date: today, amountMicros: '400000000' }),
    );
    const settlement = await tests.settlementInput(
      receiptId,
      invoiceId,
      '400000000',
    );
    await tests.settle(settlement);
    const afterReceipt = await tests.forecast();
    const receivedCollection = await tests.selectedForecastItem(collection.id);
    assert.equal(afterReceipt.currentCashMicros, '400000000');
    assert.equal(afterReceipt.actualInflowMicros, '400000000');
    assert.equal(afterReceipt.expectedInflowMicros, '600000000');
    assert.equal(afterReceipt.endingCashMicros, '1000000000');
    assert.equal(receivedCollection.remainingMicros, '600000000');
    assert.equal(receivedCollection.contractualDueDate, dateShift(today, -1));
    assert.equal(receivedCollection.expectedDate, tomorrow);
    assert(!receivedCollection.warnings.includes('SOURCE_CHANGED'));
    assert.equal(
      (await tests.forecastSource('RECEIVABLE', invoiceId)).sourceReviewToken,
      invoiceSource.sourceReviewToken,
      'Routine settlement must not alter the structural source token.',
    );
    const monthlyRevenue = await tests.monthly();
    const match = await tests.matchInput(
      receiptId,
      monthlyRevenue,
      '300000000',
    );
    await tests.match(match);
    const afterMonthlyMatch = await tests.forecast();
    assert.equal(afterMonthlyMatch.currentCashMicros, '400000000');
    assert.equal(afterMonthlyMatch.expectedInflowMicros, '600000000');
    assert.equal(afterMonthlyMatch.endingCashMicros, '1000000000');
    await tests.reverse(match.id, 'MATCH');
    await tests.reverse(settlement.id, 'SETTLEMENT');
    assert.equal(
      (await tests.selectedForecastItem(collection.id)).remainingMicros,
      '1000000000',
    );
    await tests.settle(
      await tests.settlementInput(receiptId, invoiceId, '400000000'),
    );
    await tests.transition(receiptId, 'VOID');
    assert.equal((await tests.forecast()).currentCashMicros, '0');
    assert.equal(
      (await tests.selectedForecastItem(collection.id)).remainingMicros,
      '1000000000',
    );
    assert.equal((await tests.entry(monthlyRevenue)).status, 'POSTED');
    await tests.payment(
      tests.paymentInput({ date: closingDate, amountMicros: '30000000' }),
    );
    assert.equal(
      (await tests.forecast()).currentCashMicros,
      '0',
      'Later backdated records through closing are still covered by the confirmed anchor.',
    );

    for (const amountMicros of [
      '-9223372036854775808',
      '-1',
      '0',
      '9223372036854775807',
    ]) {
      await unchanged(async () =>
        tests.saveAnchor(
          await tests.anchorInput({ currency: 'EUR', amountMicros }),
        ),
      );
      const result = await tests.forecast({ currency: 'EUR' });
      assert.equal(result.currentCashMicros, amountMicros);
      assert.equal(result.endingCashMicros, amountMicros);
      assert.equal(
        result.firstNegativeDate,
        amountMicros.startsWith('-') ? today : null,
      );
      assert.equal((await tests.forecast()).currentCashMicros, '0');
    }
    await tests.denied(
      async () =>
        tests.saveAnchor(
          await tests.anchorInput({ amountMicros: '9223372036854775808' }),
        ),
      [400],
    );
    await withClock('2026-10-28T23:30:00.000Z', async () => {
      const zoneAnchor = await tests.anchorInput({
        currency: 'GBP',
        timezone: 'Asia/Qatar',
        closingDate: '2026-10-28',
      });
      await unchanged(() => tests.saveAnchor(zoneAnchor));
      const east = await tests.forecast({ currency: 'GBP' });
      assert.equal(east.businessDate, '2026-10-29');
      assert.equal(east.timezone, 'Asia/Qatar');
      const clockInvoice = await tests.saveCash({
        currency: 'GBP',
        amount: 10000,
        date: '2026-10-28',
        dueDate: '2026-10-30',
      });
      const clockPayment = await tests.payment(
        tests.paymentInput({
          currency: 'GBP',
          amountMicros: '100000000',
          date: '2026-10-29',
        }),
      );
      assert(
        !(await tests.cash(clockPayment)).sourceWarnings.includes(
          'FUTURE_CASH_DATE',
        ),
      );
      await tests.settle(
        await tests.settlementInput(clockPayment, clockInvoice, '100000000'),
      );
      await tests.denied(
        () =>
          tests.payment(
            tests.paymentInput({
              currency: 'GBP',
              amountMicros: '10000',
              date: '2026-10-30',
            }),
          ),
        [400],
      );
      const clockLegacyInvoice = await tests.saveCash({
        currency: 'GBP',
        amount: 5000,
        date: '2026-10-28',
        dueDate: '2026-10-30',
      });
      const legacyClockResult = await tests.transition(
        clockLegacyInvoice,
        'PAID',
      );
      const clockLegacyReceipt = legacyClockResult.records.find(
        (record) =>
          record.kind === 'FINANCE' &&
          record.category === 'INCOME' &&
          record.externalReference === `receivable:${clockLegacyInvoice}`,
      );
      assert(clockLegacyReceipt);
      assert.equal(
        clockLegacyReceipt.date,
        '2026-10-29',
        'A legacy PAID receipt uses the confirmed business day, not the UTC day covered by the anchor.',
      );
      assert.equal(
        (await tests.forecast({ currency: 'GBP' })).currentCashMicros,
        '150000000',
      );
      await tests.denied(
        async () =>
          tests.saveAnchor(
            await tests.anchorInput({
              currency: 'GBP',
              timezone: 'America/Los_Angeles',
              closingDate: '2026-10-28',
            }),
          ),
        [400],
      );
      await unchanged(async () =>
        tests.saveAnchor(
          await tests.anchorInput({
            currency: 'GBP',
            timezone: 'America/Los_Angeles',
            closingDate: '2026-10-27',
          }),
        ),
      );
      assert.equal(
        (await tests.forecast({ currency: 'GBP' })).businessDate,
        '2026-10-28',
      );
    });

    const manual = tests.manualItemInput({ amountMicros: '500000000' });
    await unchanged(() => tests.saveItem(manual));
    const expenseId = await tests.payment(
      tests.paymentInput({
        category: 'EXPENSE',
        amountMicros: '250000000',
        date: today,
      }),
    );
    const monthlyCost = await tests.monthly({
      kind: 'COST',
      amountMicros: '250000000',
      allocations: [{ projectId: projects.first, amountMicros: '250000000' }],
    });
    await tests.change(await tests.commandInput('2020-02', 'LOCKED'));
    const firstApplication = await tests.realizationInput(
      manual.id,
      expenseId,
      '100000000',
    );
    await tests.denied(
      () => tests.realize(firstApplication, people.reader),
      [403],
    );
    await tests.denied(
      () => tests.realize({ ...firstApplication, id: anchor.id }),
      [409],
    );
    await unchanged(() => tests.realize(firstApplication));
    const afterApplication = await tests.fingerprint();
    assert.equal((await tests.realize(firstApplication)).replayed, true);
    assert.deepEqual(await tests.fingerprint(), afterApplication);
    await tests.denied(
      () =>
        tests.realize({ ...firstApplication, note: 'Another same-id body.' }),
      [409],
    );
    assert.equal(
      (await tests.selectedForecastItem(manual.id)).remainingMicros,
      '400000000',
    );
    assert.equal(
      (await tests.forecastSource('CASH', expenseId)).remainingMicros,
      '150000000',
    );
    const beforeExpenseMatch = await tests.forecast();
    const beforeCashToken = (await tests.forecastSource('CASH', expenseId))
      .sourceReviewToken;
    const expenseMatch = await tests.matchInput(
      expenseId,
      monthlyCost,
      '125000000',
    );
    await tests.match(expenseMatch);
    const afterExpenseMatch = await tests.forecast();
    assert.equal(
      afterExpenseMatch.currentCashMicros,
      beforeExpenseMatch.currentCashMicros,
    );
    assert.equal(
      afterExpenseMatch.expectedOutflowMicros,
      beforeExpenseMatch.expectedOutflowMicros,
    );
    assert.equal(
      (await tests.forecastSource('CASH', expenseId)).sourceReviewToken,
      beforeCashToken,
      'Monthly matching cannot consume forecast realization capacity or stale its cash token.',
    );
    await tests.denied(
      async () =>
        tests.saveItem(
          await tests.revisedItemInput(manual.id, { amountMicros: '50000000' }),
        ),
      [400, 409],
    );
    await tests.denied(
      async () =>
        tests.realize({
          ...(await tests.realizationInput(manual.id, expenseId, '10000')),
          cashId: receiptId,
        }),
      [400, 404, 409],
    );
    const secondApplication = await tests.realizationInput(
      manual.id,
      expenseId,
      '100000000',
    );
    await unchanged(() => tests.realize(secondApplication));
    assert.equal(
      (await tests.selectedForecastItem(manual.id)).remainingMicros,
      '300000000',
    );
    await tests.denied(
      async () =>
        tests.realize(
          await tests.realizationInput(manual.id, expenseId, '50000001'),
        ),
      [400, 409],
    );
    const reversal = {
      id: firstApplication.id,
      revision: 1,
      reason: 'Correct only the explicit forecast application.',
    };
    await unchanged(() => tests.reverseRealization(reversal));
    assert.equal(
      (await tests.selectedForecastItem(manual.id)).remainingMicros,
      '400000000',
    );
    const afterReversal = await tests.fingerprint();
    assert.equal((await tests.reverseRealization(reversal)).replayed, true);
    assert.deepEqual(await tests.fingerprint(), afterReversal);
    await tests.denied(
      () =>
        tests.reverseRealization({
          ...reversal,
          reason: 'Different reverse body.',
        }),
      [409],
    );
    await tests.transition(expenseId, 'VOID');
    assert.equal(
      (await tests.selectedForecastItem(manual.id)).remainingMicros,
      '500000000',
    );
    const [voidedApplication] = await runner.query(
      'SELECT status,revision FROM core."deliveryFinanceForecastRealization" WHERE "workspaceId"=$1 AND id=$2',
      [workspaceId, secondApplication.id],
    );
    assert.equal(voidedApplication.status, 'REVERSED');
    assert.equal(voidedApplication.revision, 2);
    assert.equal((await tests.entry(monthlyCost)).status, 'POSTED');
    assert.equal((await tests.readPeriod()).period.status, 'LOCKED');
    const afterCashVoid = await tests.fingerprint();
    const oldApplicationReplay = await tests.realize(secondApplication);
    assert.equal(oldApplicationReplay.replayed, true);
    assert.equal(oldApplicationReplay.realization.status, 'REVERSED');
    assert.deepEqual(
      await tests.fingerprint(),
      afterCashVoid,
      'Retrying a realized-then-voided payment must never reactivate its application.',
    );

    const plan = {
      id: randomUUID(),
      revision: 0,
      type: 'OVERHEAD',
      name: 'Synthetic month-end expected payment',
      currency: 'INR',
      monthlyAmountMicros: '1000001',
      memberId: null,
      startMonth: '2028-02',
      endMonth: '2028-02',
      dueDay: 31,
      active: true,
    };
    await services.finance.savePlan(...tests.argumentsFor(), plan);
    await unchanged(async () =>
      tests.saveAnchor(await tests.anchorInput({ currency: 'INR' })),
    );
    const planSource = await tests.forecastSource('PLAN', plan.id, {
      currency: 'INR',
      month: '2028-02',
    });
    assert.equal(planSource.suggestedDate, '2028-02-29');
    assert.equal(planSource.amountMicros, '1000001');
    const planItem = await tests.sourceItemInput('PLAN', plan.id, {
      currency: 'INR',
      planMonth: '2028-02',
      expectedDate: tomorrow,
    });
    await unchanged(() => tests.saveItem(planItem));
    assert.equal(
      (await tests.forecast({ currency: 'INR' })).expectedOutflowMicros,
      '1000001',
    );
    assert.equal(
      (
        await tests.forecastSource('PLAN', plan.id, {
          currency: 'INR',
          month: '2028-02',
        })
      ).occurrenceItemId,
      planItem.id,
    );
    await tests.denied(
      () =>
        tests.saveItem({
          ...planItem,
          commandId: randomUUID(),
          id: randomUUID(),
        }),
      [409],
    );
    await services.finance.prepareMonth(...tests.argumentsFor(), {
      month: '2028-02',
      currency: 'INR',
    });
    assert.equal(
      (await tests.forecast({ currency: 'INR' })).itemCount,
      1,
      'Preparing recognition must not create a second planned payment.',
    );
    assert.equal(
      (await tests.forecast({ currency: 'INR' })).expectedOutflowMicros,
      '1000001',
    );
    const stalePlan = await tests.revisedItemInput(planItem.id, {
      currency: 'INR',
      note: 'Review captured before plan change.',
    });
    await services.finance.savePlan(...tests.argumentsFor(), {
      ...plan,
      revision: 1,
      monthlyAmountMicros: '2000001',
    });
    const changedPlan = await tests.selectedForecastItem(planItem.id, 'INR');
    assert.equal(changedPlan.eligible, false);
    assert(changedPlan.warnings.includes('SOURCE_CHANGED'));
    assert.equal(
      (await tests.forecast({ currency: 'INR' })).expectedOutflowMicros,
      '0',
    );
    await tests.denied(() => tests.saveItem(stalePlan), [409]);
    const freshPlan = await tests.forecastSource('PLAN', plan.id, {
      currency: 'INR',
      month: '2028-02',
    });
    await unchanged(async () =>
      tests.saveItem(
        await tests.revisedItemInput(planItem.id, {
          currency: 'INR',
          amountMicros: freshPlan.amountMicros,
          expectedSourceReviewToken: freshPlan.sourceReviewToken,
        }),
      ),
    );
    assert.equal(
      (await tests.forecast({ currency: 'INR' })).expectedOutflowMicros,
      '2000001',
    );
    await services.finance.savePlan(...tests.argumentsFor(), {
      ...plan,
      revision: 2,
      monthlyAmountMicros: '2000001',
      active: false,
    });
    await tests.denied(
      async () =>
        tests.saveItem(
          await tests.revisedItemInput(planItem.id, { currency: 'INR' }),
        ),
      [400],
    );
    await unchanged(async () =>
      tests.saveItem(
        await tests.revisedItemInput(planItem.id, {
          currency: 'INR',
          acknowledgeSourceWarnings: true,
          reason:
            'Explicitly retain the already confirmed obligation after plan deactivation.',
        }),
      ),
    );
    const retainedPayable = await tests.selectedForecastItem(
      planItem.id,
      'INR',
    );
    assert.equal(retainedPayable.eligible, true);
    assert(retainedPayable.warnings.includes('PLAN_INACTIVE'));
    assert.equal(
      (await tests.forecast({ currency: 'INR' })).expectedOutflowMicros,
      '2000001',
      'Deactivating a plan does not silently erase an explicitly retained existing payable.',
    );
    await unchanged(async () =>
      tests.saveItem(
        await tests.revisedItemInput(planItem.id, {
          currency: 'INR',
          status: 'CANCELLED',
          reason: 'Cancel only the reviewed cash expectation.',
        }),
      ),
    );
    assert.equal(
      (await tests.forecast({ currency: 'INR' })).expectedOutflowMicros,
      '0',
    );
    await services.finance.savePlan(...tests.argumentsFor(), {
      ...plan,
      revision: 3,
      monthlyAmountMicros: '2000001',
      active: true,
    });
    await tests.denied(
      async () =>
        tests.saveItem(
          await tests.sourceItemInput('PLAN', plan.id, {
            currency: 'INR',
            planMonth: '2028-02',
            expectedDate: tomorrow,
          }),
        ),
      [409],
    );

    const zero = tests.manualItemInput({ currency: 'AUD', amountMicros: '0' });
    await unchanged(async () =>
      tests.saveAnchor(await tests.anchorInput({ currency: 'AUD' })),
    );
    await unchanged(() => tests.saveItem(zero));
    const subcent = tests.manualItemInput({
      currency: 'AUD',
      amountMicros: '1',
    });
    await unchanged(() => tests.saveItem(subcent));
    const exactSmall = await tests.forecast({ currency: 'AUD' });
    assert.equal(exactSmall.expectedOutflowMicros, '1');
    assert.equal(exactSmall.endingCashMicros, '-1');
    assert.equal(
      (await tests.selectedForecastItem(zero.id, 'AUD')).remainingMicros,
      '0',
    );
    assert.equal(
      (await tests.selectedForecastItem(subcent.id, 'AUD')).remainingMicros,
      '1',
    );
    const undated = tests.manualItemInput({
      currency: 'AUD',
      amountMicros: '3',
      expectedDate: null,
    });
    const overdue = tests.manualItemInput({
      currency: 'AUD',
      amountMicros: '5',
      expectedDate: dateShift(today, -1),
    });
    await unchanged(() => tests.saveItem(undated));
    await unchanged(() => tests.saveItem(overdue));
    const unresolved = await tests.forecast({ currency: 'AUD' });
    assert.equal(unresolved.expectedOutflowMicros, '1');
    assert.equal(unresolved.knownUnscheduledOutflowMicros, '8');
    assert.equal(unresolved.projectionComplete, false);
    assert(
      hasException(unresolved, 'UNDATED_EXPECTATION', { itemId: undated.id }),
    );
    assert(
      hasException(unresolved, 'OVERDUE_EXPECTATION', { itemId: overdue.id }),
    );

    await unchanged(async () =>
      tests.saveAnchor(await tests.anchorInput({ currency: 'CAD' })),
    );
    const owned = tests.manualItemInput({
      currency: 'CAD',
      amountMicros: '11',
      ownerId: people.secondWriter.memberId,
    });
    await unchanged(() => tests.saveItem(owned));
    const directory = await services.access.directory(
      workspaceId,
      people.admin.memberId,
      people.admin.userWorkspaceId,
    );
    const ownedMember = directory.members.find(
      (member) => member.memberId === people.secondWriter.memberId,
    );
    assert(ownedMember);
    await services.access.assignRoles(
      workspaceId,
      people.admin.memberId,
      people.admin.userWorkspaceId,
      {
        memberId: people.secondWriter.memberId,
        roleIds: [],
        roleRevisions: [],
        revision: ownedMember.revision,
      },
    );
    const lostOwner = await tests.selectedForecastItem(owned.id, 'CAD');
    assert.equal(lostOwner.ownerEligible, false);
    assert.equal(lostOwner.eligible, false);
    assert(lostOwner.warnings.includes('OWNER_INELIGIBLE'));
    assert.equal(
      (await tests.forecast({ currency: 'CAD' })).expectedOutflowMicros,
      '0',
    );
    await tests.denied(
      async () =>
        tests.saveItem(
          await tests.revisedItemInput(owned.id, {
            currency: 'CAD',
            note: 'Still ineligible.',
          }),
        ),
      [400, 403],
    );
    await unchanged(async () =>
      tests.saveItem(
        await tests.revisedItemInput(owned.id, {
          currency: 'CAD',
          ownerId: people.reader.memberId,
        }),
      ),
    );
    assert.equal(
      (await tests.forecast({ currency: 'CAD' })).expectedOutflowMicros,
      '11',
    );

    const currentInvoice = await tests.rawCash(invoiceId);
    const staleInvoiceReview = await tests.revisedItemInput(collection.id, {
      note: 'Captured before structural source amendment.',
    });
    await mutateFixtureCash(runner.manager, fixture, invoiceId, {
      title: 'Synthetic amended invoice source',
      amount: 120000,
      revision: currentInvoice.revision + 1,
    });
    const amendedInvoiceItem = await tests.selectedForecastItem(collection.id);
    assert.equal(amendedInvoiceItem.eligible, false);
    assert(amendedInvoiceItem.warnings.includes('SOURCE_CHANGED'));
    await tests.denied(() => tests.saveItem(staleInvoiceReview), [400, 409]);
    await mutateFixtureCash(runner.manager, fixture, invoiceId, {
      title: currentInvoice.title,
      amount: currentInvoice.amount,
      revision: currentInvoice.revision,
    });
    assert.equal(
      (await tests.selectedForecastItem(collection.id)).eligible,
      true,
    );

    await unchanged(async () =>
      tests.saveAnchor(await tests.anchorInput({ currency: 'AED' })),
    );
    const futureInvoice = await tests.saveCash({
      currency: 'AED',
      amount: 100000,
      date: dateShift(today, -10),
      dueDate: tomorrow,
    });
    const futureCollection = await tests.sourceItemInput(
      'RECEIVABLE',
      futureInvoice,
      { currency: 'AED', expectedDate: tomorrow },
    );
    await unchanged(() => tests.saveItem(futureCollection));
    await tests.denied(
      () =>
        tests.payment(
          tests.paymentInput({
            currency: 'AED',
            date: tomorrow,
            amountMicros: '100000000',
          }),
        ),
      [400],
    );
    const futureReceipt = await tests.payment(
      tests.paymentInput({
        currency: 'AED',
        date: today,
        amountMicros: '100000000',
      }),
    );
    await mutateFixtureCash(runner.manager, fixture, futureReceipt, {
      date: tomorrow,
    });
    const {
      DeliveryFinanceSourceEntity,
    } = require('../dist/modules/delivery/finance/entities/delivery-finance-source.entity');
    const cashSources = runner.manager.getRepository(
      DeliveryFinanceSourceEntity,
    );
    await assertFixture(runner.manager, fixture);
    const importedSource = await cashSources.findOneByOrFail({
      workspaceId,
      id: futureReceipt,
    });
    assert.equal(importedSource.kind, 'CASH');
    assert.equal(importedSource.snapshot.date, today);
    const importedDate = await cashSources.update(
      { workspaceId, id: futureReceipt },
      { snapshot: { ...importedSource.snapshot, date: tomorrow } },
    );
    assert.equal(importedDate.affected, 1);
    const refusedFutureSettlement = await tests.settlementInput(
      futureReceipt,
      futureInvoice,
      '100000000',
    );
    await tests.denied(() => tests.settle(refusedFutureSettlement), [409]);
    // Imported legacy associations still need quarantine even though today's settlement API refuses future cash.
    const {
      DeliveryFinanceSettlementEntity,
    } = require('../dist/modules/delivery/finance/entities/delivery-finance-settlement.entity');
    await assertFixture(runner.manager, fixture);
    await runner.manager.getRepository(DeliveryFinanceSettlementEntity).save({
      id: randomUUID(),
      workspaceId,
      revision: 1,
      cashId: futureReceipt,
      receivableId: futureInvoice,
      cashTitle: 'Synthetic future-dated legacy receipt',
      targetTitle: 'Synthetic future-linked invoice',
      currency: 'AED',
      amountMicros: '100000000',
      status: 'ACTIVE',
      projectId: projects.first,
      projectName: 'Synthetic fixture client',
      requestHash: 'a'.repeat(64),
      createdBy: people.writer.memberId,
      createdByName: 'Synthetic fixture reviewer',
      reversedBy: null,
      reversedByName: null,
      reversedAt: null,
      reversalReason: null,
    });
    const futureFacts = await tests.forecast({ currency: 'AED' });
    const futureDatedItem = await tests.selectedForecastItem(
      futureCollection.id,
      'AED',
    );
    assert.equal(futureFacts.currentCashMicros, '0');
    assert.equal(futureFacts.expectedInflowMicros, '0');
    assert.equal(futureFacts.projectionComplete, false);
    assert.equal(futureDatedItem.eligible, false);
    assert.equal(
      futureDatedItem.remainingMicros,
      null,
      'A future-dated settlement cannot silently become a reliable current collection balance.',
    );
    assert(futureFacts.unknownCollectionCount > 0);
    assert(
      futureFacts.exceptions.some(
        (exception) =>
          exception.sourceId === futureReceipt ||
          exception.sourceId === futureInvoice,
      ),
    );
    const validLegacyInvoice = await tests.saveCash({
      currency: 'AED',
      amount: 20000,
      date: dateShift(today, -10),
      dueDate: tomorrow,
    });
    const validLegacyCollection = await tests.sourceItemInput(
      'RECEIVABLE',
      validLegacyInvoice,
      { currency: 'AED' },
    );
    await unchanged(() => tests.saveItem(validLegacyCollection));
    await tests.transition(validLegacyInvoice, 'PAID');
    const paidLegacyItem = await tests.selectedForecastItem(
      validLegacyCollection.id,
      'AED',
    );
    assert.equal(paidLegacyItem.remainingMicros, '0');
    assert(
      !paidLegacyItem.warnings.includes('SOURCE_CHANGED'),
      'A legitimate legacy full receipt must not be mistaken for a source amendment.',
    );
    const unknownPaidInvoice = await tests.saveCash({
      currency: 'AED',
      amount: 30000,
      date: dateShift(today, -10),
      dueDate: tomorrow,
    });
    const unknownPaidCollection = await tests.sourceItemInput(
      'RECEIVABLE',
      unknownPaidInvoice,
      { currency: 'AED' },
    );
    await unchanged(() => tests.saveItem(unknownPaidCollection));
    const knownActualCash = (await tests.forecast({ currency: 'AED' }))
      .currentCashMicros;
    await mutateFixtureCash(runner.manager, fixture, unknownPaidInvoice, {
      status: 'PAID',
    });
    const unknownPaidItem = await tests.selectedForecastItem(
      unknownPaidCollection.id,
      'AED',
    );
    assert.equal(unknownPaidItem.remainingMicros, null);
    assert.equal(unknownPaidItem.eligible, false);
    assert(unknownPaidItem.warnings.includes('LEGACY_PAID_WITHOUT_RECEIPT'));
    assert.equal(
      (await tests.forecast({ currency: 'AED' })).currentCashMicros,
      knownActualCash,
      'Legacy paid status is not evidence of an actual cash movement.',
    );
    const invalidInvoice = await tests.saveCash({
      currency: 'AED',
      amount: 40000,
      date: dateShift(today, -10),
      dueDate: tomorrow,
    });
    const invalidCollection = await tests.sourceItemInput(
      'RECEIVABLE',
      invalidInvoice,
      { currency: 'AED' },
    );
    await unchanged(() => tests.saveItem(invalidCollection));
    await mutateFixtureCash(runner.manager, fixture, invalidInvoice, {
      amount: -1,
    });
    const invalidItem = await tests.selectedForecastItem(
      invalidCollection.id,
      'AED',
    );
    assert.equal(invalidItem.remainingMicros, null);
    assert.equal(invalidItem.eligible, false);
    assert.equal(
      (await tests.forecast({ currency: 'AED' })).projectionComplete,
      false,
    );

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
                throw new Error('Injected forecast audit failure');
              return target.insert(input);
            };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const failedAnchor = await tests.anchorInput({ amountMicros: '13' });
    const failedItem = tests.manualItemInput({
      currency: 'CAD',
      amountMicros: '17',
    });
    for (const operation of [
      () => tests.saveAnchor(failedAnchor),
      () => tests.saveItem(failedItem),
    ]) {
      const beforeFailure = await tests.fingerprint();
      failActivity = true;
      try {
        await assert.rejects(operation, /Injected forecast audit failure/);
      } finally {
        failActivity = false;
      }
      assert.deepEqual(
        await tests.fingerprint(),
        beforeFailure,
        'Forecast state and immutable event must roll back with a failed activity insertion.',
      );
    }

    for (let index = 0; index < 21; index++)
      await unchanged(async () =>
        tests.saveItem(
          await tests.revisedItemInput(zero.id, {
            currency: 'AUD',
            note: `Synthetic immutable history revision ${index}.`,
          }),
        ),
      );
    const firstHistory = await tests.history({
      sourceType: 'ITEM',
      sourceId: zero.id,
    });
    assert.equal(firstHistory.events.length, 20);
    assert(firstHistory.nextBeforeId);
    const nextHistory = await tests.history({
      sourceType: 'ITEM',
      sourceId: zero.id,
      beforeId: firstHistory.nextBeforeId,
    });
    assert.equal(nextHistory.events.length, 2);
    assert.equal(nextHistory.nextBeforeId, null);
    assert.equal(
      new Set(
        [...firstHistory.events, ...nextHistory.events].map(
          (event) => event.id,
        ),
      ).size,
      22,
    );
    assert(
      firstHistory.events.every(
        (event) =>
          event.actorId === people.writer.memberId && event.reason.length > 0,
      ),
    );
    await tests.denied(
      () =>
        tests.history({
          sourceType: 'ITEM',
          sourceId: subcent.id,
          beforeId: firstHistory.events[0].id,
        }),
      [400],
    );
    const oldCreateReplayBefore = await tests.fingerprint();
    const oldCreateReplay = await tests.saveItem(zero);
    assert.equal(oldCreateReplay.replayed, true);
    assert.equal(oldCreateReplay.item.revision, 22);
    assert.deepEqual(
      await tests.fingerprint(),
      oldCreateReplayBefore,
      'Old request replay cannot restore an earlier forecast item revision.',
    );

    await unchanged(async () =>
      tests.saveAnchor(await tests.anchorInput({ currency: 'SGD' })),
    );
    for (let index = 0; index < 51; index++)
      await unchanged(() =>
        tests.saveItem(
          tests.manualItemInput({
            currency: 'SGD',
            amountMicros: index === 50 ? '7' : '1',
            expectedDate: index === 50 ? dateShift(today, 30) : tomorrow,
          }),
        ),
      );
    const firstItems = await tests.forecast({ currency: 'SGD' });
    assert.equal(firstItems.itemCount, 51);
    assert.equal(firstItems.items.length, 50);
    assert(firstItems.nextItemId);
    const nextItems = await tests.forecast({
      currency: 'SGD',
      afterItemId: firstItems.nextItemId,
    });
    assert.equal(nextItems.items.length, 1);
    assert.equal(nextItems.nextItemId, null);
    assert.equal(firstItems.expectedOutflowMicros, '50');
    assert.equal(nextItems.expectedOutflowMicros, '50');
    const ninetyDays = await tests.forecast({
      currency: 'SGD',
      horizonDays: 90,
    });
    assert.equal(ninetyDays.timeline.length, 90);
    assert.equal(ninetyDays.expectedOutflowMicros, '57');
    assert.equal(ninetyDays.endingCashMicros, '-57');
    assert.equal(ninetyDays.firstNegativeDate, tomorrow);
    assert.equal(ninetyDays.timeline[30].date, dateShift(today, 30));
    assert.equal(ninetyDays.timeline[30].outflowMicros, '7');
    await tests.denied(
      () => tests.forecast({ currency: 'SGD', afterItemId: collection.id }),
      [400],
    );
    const beforeReads = await tests.fingerprint();
    await tests.forecast({ currency: 'SGD' });
    await tests.forecastSources({ kind: 'CASH' });
    await tests.history({
      sourceType: 'ANCHOR',
      sourceId: savedAnchor.anchor.id,
    });
    assert.deepEqual(await tests.fingerprint(), beforeReads);
    const revokedInput = tests.manualItemInput({ amountMicros: '19' });
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.writer.userId,
    ]);
    await tests.denied(() => tests.saveItem(revokedInput), [403]);
    await tests.denied(() => tests.saveAnchor(anchor), [403]);
    await tests.denied(() => tests.forecast({}, people.writer), [403]);

    console.log(
      'PASS rollback-only reviewed cash forecast: unknown/zero/signed exact anchors, timezone/calendar coverage, partial and legacy collections, independent monthly matching, confirmed plan occurrences/manual outflows, partial realizations/reversal/cash void under result locks, structural review versus routine payments, eligible owners/current identity, source quarantine, immutable paging/retries and atomic audit. Cash/recognition/budget preserved by forecast-only writes; no providers or persisted fixtures.',
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
  TABLES,
  FORECAST_TABLES,
  EVENT_SOURCE_TYPES,
  createForecastFixture,
  cleanupForecastFixture,
  buildForecastServices,
  forecastHarness,
};

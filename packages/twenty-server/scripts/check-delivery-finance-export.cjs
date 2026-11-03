const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  buildPeriodServices,
  periodHarness,
} = require('./check-delivery-finance-period.cjs');
const { seedSpend } = require('./check-delivery-ai-finance.cjs');
const {
  TABLES,
  createExportFixture,
  cleanupExportFixture,
  fingerprint,
  financialFingerprint,
  checksum,
  parseCsv,
} = require('./check-delivery-finance-export-support.cjs');

const MONTH = '2020-02';
const DATE = '2020-02-20';
const PRIVATE_MARKER = 'PRIVATE_AI_FINANCE_FIXTURE_PAYLOAD';

function buildExportServices(source, fixture) {
  const {
    DeliveryFinanceExportService,
  } = require('../dist/modules/delivery/finance/export/delivery-finance-export.service');
  const services = buildPeriodServices(source, fixture);
  return {
    ...services,
    exports: new DeliveryFinanceExportService(
      source,
      services.delivery,
      services.access,
    ),
  };
}

function exportHarness(source, services, fixture) {
  const tests = periodHarness(source, services, fixture);
  const readExports = (
    input = {},
    person = fixture.people.reader,
    workspace = fixture.workspace,
  ) =>
    services.exports.snapshot(...tests.argumentsFor(person, workspace), input);
  const saveProfile = (input, person = fixture.people.writer) =>
    services.exports.saveProfile(...tests.argumentsFor(person), input);
  const preview = (input, person = fixture.people.reader) =>
    services.exports.preview(...tests.argumentsFor(person), input);
  const createBatch = (input, person = fixture.people.reader) =>
    services.exports.createBatch(...tests.argumentsFor(person), input);
  const download = (batchId, person = fixture.people.reader) =>
    services.exports.download(...tests.argumentsFor(person), { batchId });
  const changeImportStatus = (input, person = fixture.people.writer) =>
    services.exports.changeImportStatus(...tests.argumentsFor(person), input);
  const exportHistory = (
    sourceType,
    sourceId,
    person = fixture.people.reader,
    fields = {},
  ) =>
    services.exports.history(...tests.argumentsFor(person), {
      sourceType,
      sourceId,
      ...fields,
    });
  const profileInput = (fields = {}) => ({
    commandId: randomUUID(),
    id: randomUUID(),
    revision: 0,
    name: 'Synthetic accountant handoff',
    basis: 'CASH',
    active: true,
    columns: [
      { header: 'Date', field: 'DATE' },
      { header: 'Amount', field: 'AMOUNT' },
      { header: 'Currency', field: 'CURRENCY' },
      { header: 'Source', field: 'SOURCE_ID' },
      { header: 'Kind', field: 'KIND' },
      { header: 'Exact micros', field: 'AMOUNT_MICROS' },
      { header: 'Review title', field: 'TITLE' },
      { header: 'Original reference', field: 'SOURCE_REFERENCE' },
    ],
    mappings: [],
    delimiter: 'COMMA',
    precision: 2,
    dateFormat: 'ISO',
    includeBom: false,
    reason:
      'Synthetic reviewed handoff; no tax policy or native provider format.',
    ...fields,
  });
  const cashSelection = (profileId, fields = {}) => ({
    profileId,
    currency: 'USD',
    dateFrom: '2020-02-01',
    dateTo: '2020-02-29',
    ...fields,
  });
  const batchInput = async (
    selection,
    fields = {},
    person = fixture.people.reader,
  ) => ({
    id: randomUUID(),
    ...selection,
    expectedPreviewToken: (await preview(selection, person)).previewToken,
    acknowledgeRepeatedSources: false,
    reexportReason: null,
    ...fields,
  });
  const protectedOperation = async (operation) => {
    const before = await financialFingerprint(source.manager, fixture);
    const result = await operation();
    assert.deepEqual(
      await financialFingerprint(source.manager, fixture),
      before,
      'Export operations must not alter cash, recognition, allocations, periods, source ledgers, budgets or forecasts.',
    );
    return result;
  };
  const denied = async (operation, statuses = [400, 403, 404, 409]) => {
    const before = await fingerprint(source.manager, fixture);
    await assert.rejects(operation, (error) => statuses.includes(error.status));
    assert.deepEqual(
      await fingerprint(source.manager, fixture),
      before,
      'Denied export operations must not persist batch, mapping or history changes.',
    );
  };
  const allPreviewRows = async (selection) => {
    const rows = [];
    const tokens = new Set();
    let afterRowKey = null;
    do {
      const page = await preview({ ...selection, afterRowKey });
      rows.push(...page.rows);
      tokens.add(page.previewToken);
      if (page.nextRowKey) assert.notEqual(page.nextRowKey, afterRowKey);
      afterRowKey = page.nextRowKey;
    } while (afterRowKey);
    assert.equal(
      tokens.size,
      1,
      'Pagination must retain one full-source review token.',
    );
    assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
    return rows;
  };
  return {
    ...tests,
    readExports,
    saveProfile,
    preview,
    createBatch,
    download,
    changeImportStatus,
    exportHistory,
    profileInput,
    cashSelection,
    batchInput,
    protectedOperation,
    denied,
    allPreviewRows,
    exportFingerprint: () => fingerprint(source.manager, fixture),
  };
}

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This export checker always rolls back.',
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
    const fixture = await createExportFixture(runner.manager);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const services = buildExportServices(source, fixture);
    const tests = exportHarness(source, services, fixture);
    const { people, projects, workspaceId } = fixture;
    const beforeReads = await tests.exportFingerprint();
    const empty = await tests.readExports();
    assert.equal(empty.workspaceId, workspaceId);
    assert.equal(empty.memberId, people.reader.memberId);
    assert.equal(empty.userWorkspaceId, people.reader.userWorkspaceId);
    assert.equal(empty.canManage, false);
    assert.deepEqual(empty.profiles, []);
    assert.deepEqual(empty.batches, []);
    assert.deepEqual(await tests.exportFingerprint(), beforeReads);
    await tests.denied(() => tests.readExports({}, people.outsider), [403]);
    await tests.denied(
      () => tests.readExports({}, people.reader, fixture.foreignWorkspace),
      [403],
    );
    const originalProfile = tests.profileInput();
    await tests.denied(
      () => tests.saveProfile(originalProfile, people.reader),
      [403],
    );
    await tests.denied(
      () =>
        tests.saveProfile(
          tests.profileInput({
            columns: [{ header: '=Formula header', field: 'AMOUNT' }],
          }),
        ),
      [400],
    );
    const saved = await tests.protectedOperation(() =>
      tests.saveProfile(originalProfile),
    );
    assert.equal(saved.profile.revision, 1);
    assert.equal(saved.replayed, false);
    const beforeRetry = await tests.exportFingerprint();
    assert.equal((await tests.saveProfile(originalProfile)).replayed, true);
    assert.deepEqual(await tests.exportFingerprint(), beforeRetry);
    const selection = tests.cashSelection(originalProfile.id);
    assert.equal((await tests.preview(selection)).totals.rowCount, 0);

    const receiptId = await tests.payment(
      tests.paymentInput({ amountMicros: '1000000000', date: DATE }),
    );
    await tests.payment(
      tests.paymentInput({
        category: 'EXPENSE',
        amountMicros: '25250000',
        date: DATE,
      }),
    );
    await tests.payment(
      tests.paymentInput({
        currency: 'AED',
        amountMicros: '7000000',
        date: DATE,
      }),
    );
    for (let index = 0; index < 51; index++)
      await tests.payment(
        tests.paymentInput({
          title:
            index === 0
              ? '=HYPERLINK("https://example.invalid","fixture")\nSecond line'
              : `Synthetic cash source ${index}`,
          amountMicros: '10000',
          date: DATE,
        }),
      );
    const invoiceId = await tests.saveCash();
    const openingId = await tests.saveCash({
      category: 'OPENING_BALANCE',
      amount: 12345,
      dueDate: null,
    });
    const voidId = await tests.saveCash({
      category: 'INCOME',
      amount: 12345,
      dueDate: null,
    });
    await tests.transition(voidId, 'VOID');
    const futureId = await tests.saveCash({
      category: 'INCOME',
      date: '9999-12-31',
      amount: 12345,
      dueDate: null,
    });
    const futureSelection = tests.cashSelection(originalProfile.id, {
      dateTo: '9999-12-31',
    });
    const futurePreview = await tests.preview(futureSelection);
    assert(
      futurePreview.exclusions.some(
        (row) => row.sourceId === futureId && row.code === 'FUTURE_CASH',
      ),
    );
    assert(!futurePreview.rows.some((row) => row.sourceId === futureId));
    const cashPreview = await tests.protectedOperation(() =>
      tests.preview(selection),
    );
    assert.equal(cashPreview.canCreate, true);
    assert.equal(cashPreview.totals.sourceCount, 53);
    assert.equal(cashPreview.totals.rowCount, 53);
    assert.equal(cashPreview.totals.incomingMicros, '1000510000');
    assert.equal(cashPreview.totals.outgoingMicros, '25250000');
    assert.equal(cashPreview.totals.netMicros, '975260000');
    assert.equal(cashPreview.rows.length, 50);
    assert(cashPreview.nextRowKey);
    const allCashRows = await tests.allPreviewRows(selection);
    assert.equal(allCashRows.length, 53);
    assert(allCashRows.every((row) => row.currency === 'USD'));
    assert(
      allCashRows.every(
        (row) => ![invoiceId, openingId, voidId].includes(row.sourceId),
      ),
    );
    assert(cashPreview.exclusions.some((row) => row.sourceId === invoiceId));
    assert(cashPreview.exclusions.some((row) => row.sourceId === openingId));
    assert(cashPreview.exclusions.some((row) => row.sourceId === voidId));
    const aed = await tests.preview(
      tests.cashSelection(originalProfile.id, { currency: 'AED' }),
    );
    assert.equal(aed.totals.incomingMicros, '7000000');
    assert.equal(aed.totals.rowCount, 1);
    await tests.denied(
      () => tests.preview({ ...selection, dateFrom: '2020-03-01' }),
      [400],
    );

    const firstBatchInput = await tests.batchInput(selection);
    const first = await tests.protectedOperation(() =>
      tests.createBatch(firstBatchInput),
    );
    assert.equal(first.replayed, false);
    assert.equal(first.batch.totals.rowCount, 53);
    const exported = await tests.protectedOperation(() =>
      tests.download(first.batch.id),
    );
    assert.equal(exported.checksum, checksum(exported.csv));
    assert.equal(exported.byteLength, Buffer.byteLength(exported.csv, 'utf8'));
    assert.equal(first.batch.checksum, exported.checksum);
    const parsed = parseCsv(exported.csv);
    assert.equal(parsed.length, 54);
    assert.equal(parsed[0][6], 'Review title');
    const hostile = parsed.slice(1).find((row) => row[6].includes('HYPERLINK'));
    assert(hostile);
    assert(hostile[6].startsWith("'"));
    assert(hostile[6].includes('\nSecond line'));
    assert(!exported.csv.includes(PRIVATE_MARKER));
    const beforeBatchRetry = await tests.exportFingerprint();
    const retried = await tests.createBatch(firstBatchInput);
    assert.equal(retried.replayed, true);
    assert.equal(retried.batch.id, first.batch.id);
    assert.deepEqual(await tests.download(first.batch.id), exported);
    assert.deepEqual(await tests.exportFingerprint(), beforeBatchRetry);
    await tests.denied(
      () => tests.createBatch({ ...firstBatchInput, currency: 'AED' }),
      [409],
    );
    const repeated = await tests.preview(selection);
    assert.equal(repeated.totals.repeatedSourceCount, 53);
    const reexport = await tests.batchInput(selection);
    await tests.denied(() => tests.createBatch(reexport), [400, 409]);
    await tests.denied(
      () =>
        tests.createBatch({
          ...reexport,
          acknowledgeRepeatedSources: true,
          reexportReason: '',
        }),
      [400],
    );
    const second = await tests.protectedOperation(() =>
      tests.createBatch({
        ...reexport,
        acknowledgeRepeatedSources: true,
        reexportReason:
          'Accountant requested a second reviewed handoff; import is still manual.',
      }),
    );
    assert.notEqual(second.batch.id, first.batch.id);
    assert.equal((await tests.download(second.batch.id)).csv, exported.csv);

    const beforeProfileChange = await tests.batchInput(selection, {
      acknowledgeRepeatedSources: true,
      reexportReason: 'Synthetic stale-template review.',
    });
    const changedProfile = {
      ...originalProfile,
      commandId: randomUUID(),
      revision: 1,
      name: 'Revised synthetic handoff',
    };
    await tests.protectedOperation(() => tests.saveProfile(changedProfile));
    await tests.denied(() => tests.createBatch(beforeProfileChange), [409]);
    const beforeSourceChange = await tests.batchInput(selection, {
      acknowledgeRepeatedSources: true,
      reexportReason: 'Synthetic stale-source review.',
    });
    await tests.transition(receiptId, 'VOID');
    await tests.denied(() => tests.createBatch(beforeSourceChange), [409]);
    const historical = (
      await tests.readExports({ selectedBatchId: first.batch.id })
    ).selectedBatch;
    assert(historical);
    assert(historical.currentWarnings.includes('SOURCE_CHANGED_SINCE_EXPORT'));
    assert.equal(historical.profile.name, originalProfile.name);
    const historicalRows = [...historical.rows];
    let afterBatchRowKey = historical.nextRowKey;
    while (afterBatchRowKey) {
      const page = (
        await tests.readExports({
          selectedBatchId: first.batch.id,
          afterBatchRowKey,
        })
      ).selectedBatch;
      assert(page);
      historicalRows.push(...page.rows);
      assert.notEqual(page.nextRowKey, afterBatchRowKey);
      afterBatchRowKey = page.nextRowKey;
    }
    assert.equal(historicalRows.length, 53);
    const changedReceipt = historicalRows.find(
      (row) => row.sourceId === receiptId,
    );
    assert(changedReceipt?.sourceChanged);
    assert.equal(changedReceipt.currentStatus, 'VOID');
    const profileHistory = await tests.exportHistory(
      'PROFILE',
      originalProfile.id,
    );
    assert.equal(
      profileHistory.events.find((event) => event.profile?.revision === 1)
        ?.profile.name,
      originalProfile.name,
    );
    assert.deepEqual(await tests.download(first.batch.id), exported);

    const mappingProfile = tests.profileInput({
      columns: [
        ...originalProfile.columns,
        { header: 'Account', field: 'ACCOUNT' },
        { header: 'Payment account', field: 'PAYMENT_ACCOUNT' },
        { header: 'Counterparty', field: 'COUNTERPARTY' },
      ],
    });
    await tests.protectedOperation(() => tests.saveProfile(mappingProfile));
    const mappingSelection = tests.cashSelection(mappingProfile.id);
    const missing = await tests.preview(mappingSelection);
    assert.equal(missing.canCreate, false);
    assert(missing.totals.errorCount > 0);
    await tests.denied(async () =>
      tests.createBatch(await tests.batchInput(mappingSelection)),
    );
    const sourceMappedId = allCashRows.find(
      (row) => row.sourceId !== receiptId,
    ).sourceId;
    await tests.protectedOperation(() =>
      tests.saveProfile({
        ...mappingProfile,
        commandId: randomUUID(),
        revision: 1,
        mappings: [
          {
            target: 'ACCOUNT',
            scope: 'DEFAULT',
            key: null,
            value: 'Reviewed general account',
          },
          {
            target: 'PAYMENT_ACCOUNT',
            scope: 'DEFAULT',
            key: null,
            value: 'Reviewed payment account',
          },
          {
            target: 'COUNTERPARTY',
            scope: 'DEFAULT',
            key: null,
            value: 'Reviewed counterparty',
          },
          {
            target: 'ACCOUNT',
            scope: 'PROJECT',
            key: projects.first,
            value: 'Reviewed project account',
          },
          {
            target: 'ACCOUNT',
            scope: 'SOURCE',
            key: sourceMappedId,
            value: 'Reviewed source account',
          },
        ],
      }),
    );
    const mapped = await tests.preview(mappingSelection);
    assert.equal(mapped.canCreate, true);
    assert(
      mapped.rows.every(
        (row) => row.account && row.paymentAccount && row.counterparty,
      ),
    );
    const mappedRows = await tests.allPreviewRows(mappingSelection);
    assert.equal(
      mappedRows.find((row) => row.sourceId === sourceMappedId).account,
      'Reviewed source account',
    );
    assert(
      mappedRows.some(
        (row) =>
          row.sourceId !== sourceMappedId &&
          row.account === 'Reviewed project account',
      ),
    );
    assert.equal(
      mapped.totals.repeatedSourceCount,
      53,
      'Prior handoffs, including a now-voided source, must remain visible across profiles of the same basis.',
    );

    await tests.monthly({
      amountMicros: '9007199254740993',
      allocations: [
        { projectId: projects.first, amountMicros: '9007199254740000' },
        { projectId: projects.otherClient, amountMicros: '993' },
      ],
    });
    const costEntryId = await tests.monthly({
      kind: 'COST',
      amountMicros: '2500000',
      allocations: [{ projectId: null, amountMicros: '2500000' }],
    });
    await tests.monthly({
      amountMicros: '0',
      allocations: [{ projectId: null, amountMicros: '0' }],
    });
    const draftId = await tests.monthly({}, false);
    const voidEntryId = await tests.monthly();
    await services.finance.voidEntry(...tests.argumentsFor(), {
      id: voidEntryId,
      revision: 2,
      reason: 'Synthetic voided recognition.',
    });
    await tests.monthly({ currency: 'EUR' });
    await tests.monthly({ month: '2020-03' });
    const spend = await seedSpend(runner.manager, fixture);
    const aiInput = await tests.prepareInput(spend.spend.id, spend.event.id);
    await tests.prepare(aiInput);
    await tests.post(await tests.postInput(aiInput.id));
    const recognitionProfile = tests.profileInput({ basis: 'RECOGNITION' });
    await tests.protectedOperation(() => tests.saveProfile(recognitionProfile));
    const recognitionSelection = {
      profileId: recognitionProfile.id,
      currency: 'USD',
      serviceMonth: MONTH,
      accountingDate: '2020-02-29',
    };
    await tests.denied(
      () => tests.preview({ ...recognitionSelection, accountingDate: null }),
      [400],
    );
    const imprecise = await tests.preview(recognitionSelection);
    assert.equal(imprecise.canCreate, false);
    assert(imprecise.totals.errorCount > 0);
    await tests.protectedOperation(() =>
      tests.saveProfile({
        ...recognitionProfile,
        commandId: randomUUID(),
        revision: 1,
        precision: 6,
      }),
    );
    const recognized = await tests.protectedOperation(() =>
      tests.preview(recognitionSelection),
    );
    assert.equal(recognized.canCreate, true);
    assert.equal(recognized.totals.sourceCount, 4);
    assert.equal(recognized.totals.rowCount, 5);
    assert.equal(recognized.totals.incomingMicros, '9007199254740993');
    assert.equal(recognized.totals.outgoingMicros, '4500000');
    assert.equal(recognized.totals.repeatedSourceCount, 0);
    assert(recognized.rows.some((row) => row.amountMicros === '0'));
    assert(
      recognized.rows.every(
        (row) => row.date === '2020-02-29' && row.serviceMonth === MONTH,
      ),
    );
    assert(recognized.exclusions.some((row) => row.sourceId === draftId));
    assert(recognized.exclusions.some((row) => row.sourceId === voidEntryId));
    assert(!JSON.stringify(recognized).includes(PRIVATE_MARKER));
    const recognitionBatch = await tests.protectedOperation(async () =>
      tests.createBatch(await tests.batchInput(recognitionSelection)),
    );
    const recognitionDownload = await tests.download(recognitionBatch.batch.id);
    assert.equal(
      recognitionDownload.checksum,
      checksum(recognitionDownload.csv),
    );
    assert(recognitionDownload.csv.includes('9007199254.740000'));
    assert(recognitionDownload.csv.includes('0.000993'));
    assert(!recognitionDownload.csv.includes(PRIVATE_MARKER));
    const beforeMalformedAllocation = await tests.exportFingerprint();
    await runner.query(
      'UPDATE core."deliveryFinanceAllocation" SET "amountMicros"=2500001 WHERE "workspaceId"=$1 AND "entryId"=$2',
      [workspaceId, costEntryId],
    );
    const malformedAllocation = await tests.preview(recognitionSelection);
    assert.equal(malformedAllocation.canCreate, false);
    assert(
      malformedAllocation.exclusions.some(
        (row) =>
          row.sourceId === costEntryId &&
          row.code === 'UNKNOWN_ALLOCATION' &&
          row.blocking,
      ),
    );
    await runner.query(
      'UPDATE core."deliveryFinanceAllocation" SET "amountMicros"=2500000 WHERE "workspaceId"=$1 AND "entryId"=$2',
      [workspaceId, costEntryId],
    );
    assert.deepEqual(
      await tests.exportFingerprint(),
      beforeMalformedAllocation,
    );

    const alternateProfile = tests.profileInput({
      delimiter: 'SEMICOLON',
      dateFormat: 'DMY',
      includeBom: true,
      columns: [
        { header: 'Date', field: 'DATE' },
        { header: 'Amount', field: 'AMOUNT' },
        { header: 'Literal note', field: 'CONSTANT', constant: ' =SUM(1,2)' },
      ],
    });
    await tests.protectedOperation(() => tests.saveProfile(alternateProfile));
    const alternateSelection = tests.cashSelection(alternateProfile.id, {
      currency: 'AED',
    });
    const alternate = await tests.protectedOperation(async () =>
      tests.createBatch(await tests.batchInput(alternateSelection)),
    );
    const alternateDownload = await tests.download(alternate.batch.id);
    assert(alternateDownload.csv.startsWith('\uFEFF'));
    assert(alternateDownload.csv.includes('20/02/2020'));
    assert(alternateDownload.csv.includes(';'));
    assert(alternateDownload.csv.includes("' =SUM(1,2)"));
    assert.equal(alternateDownload.checksum, checksum(alternateDownload.csv));
    assert.equal(
      alternateDownload.byteLength,
      Buffer.byteLength(alternateDownload.csv, 'utf8'),
    );

    const confirm = {
      commandId: randomUUID(),
      batchId: first.batch.id,
      revision: first.batch.revision,
      status: 'CONFIRMED',
      reference: 'Synthetic accountant import confirmation',
      evidenceUrl: 'https://example.invalid/accountant-import',
      reason:
        'Manually confirmed only; this test contacts no external account.',
    };
    const beforeImportChange = await tests.batchInput(selection, {
      acknowledgeRepeatedSources: true,
      reexportReason:
        'Synthetic review before manual import confirmation changes.',
    });
    await tests.denied(
      () => tests.changeImportStatus(confirm, people.reader),
      [403],
    );
    const confirmed = await tests.protectedOperation(() =>
      tests.changeImportStatus(confirm),
    );
    assert.equal(confirmed.batch.importStatus, 'CONFIRMED');
    await tests.denied(() => tests.createBatch(beforeImportChange), [409]);
    assert.equal((await tests.changeImportStatus(confirm)).replayed, true);
    const reverse = {
      ...confirm,
      commandId: randomUUID(),
      revision: confirmed.batch.revision,
      status: 'REVERSED',
      reference: null,
      evidenceUrl: null,
      reason: 'Synthetic correction to an incorrectly confirmed import.',
    };
    const reversed = await tests.protectedOperation(() =>
      tests.changeImportStatus(reverse),
    );
    assert.equal(reversed.batch.importStatus, 'REVERSED');
    assert.equal((await tests.changeImportStatus(reverse)).replayed, true);
    assert.equal(
      (await tests.changeImportStatus(confirm)).batch.importStatus,
      'REVERSED',
    );
    const importHistory = await tests.exportHistory('BATCH', first.batch.id);
    assert(
      importHistory.events.some((event) => event.importStatus === 'CONFIRMED'),
    );
    assert(
      importHistory.events.some((event) => event.importStatus === 'REVERSED'),
    );
    assert.deepEqual(await tests.download(first.batch.id), exported);

    const {
      OtogrowActivityEventEntity,
    } = require('../dist/modules/otogrow-activity/entities/otogrow-activity-event.entity');
    await tests.payment(tests.paymentInput({ date: '2020-04-20' }));
    const atomicBatchInput = await tests.batchInput(
      tests.cashSelection(originalProfile.id, {
        dateFrom: '2020-04-01',
        dateTo: '2020-04-30',
      }),
    );
    const originalGetRepository = runner.manager.getRepository.bind(
      runner.manager,
    );
    let failActivity = true;
    runner.manager.getRepository = (entity) => {
      const repository = originalGetRepository(entity);
      if (entity !== OtogrowActivityEventEntity) return repository;
      return new Proxy(repository, {
        get(target, property) {
          if (property === 'insert')
            return async (input) => {
              if (failActivity)
                throw new Error('Injected export audit failure');
              return target.insert(input);
            };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const atomicInput = tests.profileInput();
    const beforeAtomic = await tests.exportFingerprint();
    try {
      await assert.rejects(
        () => tests.saveProfile(atomicInput),
        /Injected export audit failure/,
      );
      assert.deepEqual(await tests.exportFingerprint(), beforeAtomic);
      await assert.rejects(
        () => tests.createBatch(atomicBatchInput),
        /Injected export audit failure/,
      );
      assert.deepEqual(await tests.exportFingerprint(), beforeAtomic);
      await assert.rejects(
        () =>
          tests.changeImportStatus({
            ...confirm,
            commandId: randomUUID(),
            revision: reversed.batch.revision,
          }),
        /Injected export audit failure/,
      );
      assert.deepEqual(await tests.exportFingerprint(), beforeAtomic);
    } finally {
      failActivity = false;
      runner.manager.getRepository = originalGetRepository;
    }
    await tests.protectedOperation(() => tests.saveProfile(atomicInput));
    await tests.protectedOperation(() => tests.createBatch(atomicBatchInput));
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.reader.userId,
    ]);
    await tests.denied(() => tests.download(first.batch.id), [403]);
    await tests.denied(() => tests.preview(selection), [403]);
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      people.reader.userId,
    ]);
    await runner.query(
      'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1 AND "workspaceMemberId"=$2',
      [workspaceId, people.reader.memberId],
    );
    await tests.denied(() => tests.download(first.batch.id), [403]);
    await tests.denied(
      async () =>
        tests.createBatch(await tests.batchInput(selection, {}, people.writer)),
      [403],
    );
    console.log(
      'PASS rollback-only accountant export: full server-selected cash/recognition sources, exact multi-page totals/currencies/allocations, explicit dates and precision, mapped fields and exclusions, stable profile/batch retries and immutable CSV hashes, repeat acknowledgement, stale source/profile detection, import confirmation/reversal history, current identity, safe CSV and private-payload exclusion. Existing financial ledgers unchanged by export operations; no external imports or persisted fixtures.',
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
  DATE,
  TABLES,
  createExportFixture,
  cleanupExportFixture,
  buildExportServices,
  exportHarness,
};

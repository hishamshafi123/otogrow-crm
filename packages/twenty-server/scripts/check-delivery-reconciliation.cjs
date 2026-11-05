const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');

const MONTH = '2020-02';
const DATE = '2020-02-20';
const TABLES = [
  'deliveryFinanceCashMatch',
  'deliveryFinanceSettlement',
  'deliveryFinanceSource',
  'deliveryFinanceAllocation',
  'deliveryFinanceEvent',
  'deliveryFinanceEntry',
  'deliveryFinancePlan',
  'otogrowActivityEvent',
  'deliveryOperations',
];

async function createFixture(manager, prefix = 'recon_rollback') {
  const [existing] = await manager.query(
    `SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"='ACTIVE' LIMIT 1`,
  );
  assert(existing, 'An initialized local workspace is required.');
  const workspaceId = randomUUID();
  const foreignWorkspaceId = randomUUID();
  const schemaName = `${prefix}_${workspaceId.replaceAll('-', '_')}`;
  assert.match(schemaName, /^[a-z_]+[a-f0-9_]{36}$/);
  assert(schemaName.length <= 63);
  const sentinel = `otogrow-reconciliation-fixture:${workspaceId}`;
  const schema = `"${schemaName}"`;
  await manager.query(`CREATE SCHEMA ${schema}`);
  await manager.query(
    `CREATE TABLE ${schema}."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
  );
  await manager.query(
    `CREATE TABLE ${schema}.company (id uuid PRIMARY KEY,name text,"deletedAt" timestamptz)`,
  );
  for (const id of [workspaceId, foreignWorkspaceId])
    await manager.query(
      `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6)`,
      [
        id,
        sentinel,
        `reconciliation-${id}`,
        schemaName,
        existing.workspaceCustomApplicationId,
        existing.defaultRoleId,
      ],
    );
  const [workspace] = await manager.query(
    'SELECT * FROM core.workspace WHERE id=$1',
    [workspaceId],
  );
  const [foreignWorkspace] = await manager.query(
    'SELECT * FROM core.workspace WHERE id=$1',
    [foreignWorkspaceId],
  );
  const people = Object.fromEntries(
    ['admin', 'reader', 'writer', 'secondWriter', 'outsider'].map((name) => [
      name,
      {
        name,
        memberId: randomUUID(),
        userWorkspaceId: randomUUID(),
        userId: randomUUID(),
      },
    ]),
  );
  const roles = {};
  for (const person of Object.values(people)) {
    person.email = `${person.userId}+reconciliation@example.invalid`;
    await manager.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
      person.userId,
      person.email,
    ]);
    await manager.query(
      'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
      [person.userWorkspaceId, person.userId, workspaceId],
    );
    await manager.query(
      `INSERT INTO ${schema}."workspaceMember" (id,"userId","nameFirstName","nameLastName") VALUES ($1,$2,$3,$4)`,
      [person.memberId, person.userId, person.name, sentinel],
    );
    if (['reader', 'writer', 'secondWriter'].includes(person.name)) {
      const roleId = randomUUID();
      roles[person.name] = roleId;
      await manager.query(
        `INSERT INTO core."otogrowRole" (id,"workspaceId",name,description,capabilities,revision) VALUES ($1,$2,$3,$4,$5,1)`,
        [
          roleId,
          workspaceId,
          `${person.name} reconciliation fixture`,
          sentinel,
          [person.name === 'reader' ? 'finance.read' : 'finance.manage'],
        ],
      );
      await manager.query(
        'INSERT INTO core."otogrowMemberAccess" ("workspaceId","workspaceMemberId",revision) VALUES ($1,$2,1)',
        [workspaceId, person.memberId],
      );
      await manager.query(
        'INSERT INTO core."otogrowRoleAssignment" ("workspaceId","workspaceMemberId","roleId") VALUES ($1,$2,$3)',
        [workspaceId, person.memberId, roleId],
      );
    }
  }
  const companies = [randomUUID(), randomUUID()];
  for (const [index, id] of companies.entries())
    await manager.query(
      `INSERT INTO ${schema}.company (id,name) VALUES ($1,$2)`,
      [id, `Reconciliation client ${index}`],
    );
  const projects = {
    first: randomUUID(),
    sameClient: randomUUID(),
    otherClient: randomUUID(),
    foreign: randomUUID(),
  };
  for (const [name, id] of Object.entries(projects))
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES ($1,$2,$3,$4,$5)',
      [
        id,
        name === 'foreign' ? foreignWorkspaceId : workspaceId,
        `Reconciliation ${name} fixture`,
        name === 'otherClient' ? companies[1] : companies[0],
        JSON.stringify([people.writer.memberId]),
      ],
    );
  return {
    workspaceId,
    foreignWorkspaceId,
    workspace,
    foreignWorkspace,
    schemaName,
    sentinel,
    people,
    roles,
    projects,
  };
}

function buildServices(source, fixture) {
  const {
    OtogrowAccessService,
  } = require('../dist/modules/otogrow-access/otogrow-access.service');
  const {
    DeliveryService,
  } = require('../dist/modules/delivery/delivery.service');
  const {
    DeliveryFinanceService,
  } = require('../dist/modules/delivery/finance/delivery-finance.service');
  const {
    DeliveryBusinessService,
  } = require('../dist/modules/delivery/business/delivery-business.service');
  const {
    DeliveryFinanceReconciliationService,
  } = require('../dist/modules/delivery/finance/delivery-finance-reconciliation.service');
  const access = new OtogrowAccessService(source, {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) =>
      workspaceId === fixture.workspaceId &&
      userWorkspaceId === fixture.people.admin.userWorkspaceId,
  });
  const delivery = new DeliveryService(
    source,
    access,
    createIsolatedNativeTaskAccess(),
  );
  const forbiddenProvider = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error(
          'Provider calls are forbidden in reconciliation acceptance.',
        );
      },
    },
  );
  return {
    access,
    delivery,
    finance: new DeliveryFinanceService(source, delivery, access),
    business: new DeliveryBusinessService(
      source,
      delivery,
      forbiddenProvider,
      forbiddenProvider,
      access,
    ),
    payments: new DeliveryFinanceReconciliationService(
      source,
      delivery,
      access,
    ),
  };
}

async function cleanupFixture(manager, fixture) {
  const { workspaceId, foreignWorkspaceId, schemaName, sentinel, people } =
    fixture;
  const workspaces = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
    [[workspaceId, foreignWorkspaceId]],
  );
  assert.equal(workspaces.length, 2);
  for (const workspace of workspaces) {
    assert.equal(
      workspace.displayName,
      sentinel,
      'Refusing cleanup of an unexpected workspace.',
    );
    assert.equal(workspace.databaseSchema, schemaName);
  }
  const nativeMembers = await manager.query(
    `SELECT id,"userId","nameFirstName","nameLastName" FROM "${schemaName}"."workspaceMember"`,
  );
  assert.equal(nativeMembers.length, Object.keys(people).length);
  for (const person of Object.values(people)) {
    const native = nativeMembers.find(
      (member) => member.id === person.memberId,
    );
    assert.equal(native?.userId, person.userId);
    assert.equal(native?.nameFirstName, person.name);
    assert.equal(native?.nameLastName, sentinel);
    const [account] = await manager.query(
      'SELECT email FROM core."user" WHERE id=$1',
      [person.userId],
    );
    assert.equal(account?.email, person.email);
  }
  for (const table of [
    ...TABLES,
    'otogrowAccessEvent',
    'otogrowRoleAssignment',
    'otogrowMemberAccess',
    'otogrowRole',
    'deliveryProject',
  ])
    await manager.query(
      `DELETE FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
      [[workspaceId, foreignWorkspaceId]],
    );
  await manager.query(
    'DELETE FROM core."userWorkspace" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
    [
      workspaceId,
      Object.values(people).map((person) => person.userWorkspaceId),
    ],
  );
  for (const person of Object.values(people))
    await manager.query('DELETE FROM core."user" WHERE id=$1 AND email=$2', [
      person.userId,
      person.email,
    ]);
  await manager.query(
    'DELETE FROM core.workspace WHERE id=ANY($1::uuid[]) AND "displayName"=$2 AND "databaseSchema"=$3',
    [[workspaceId, foreignWorkspaceId], sentinel, schemaName],
  );
  await manager.query(`DROP SCHEMA "${schemaName}" CASCADE`);
}

function harness(services, fixture) {
  const { workspace, projects, people } = fixture;
  const argumentsFor = (
    person = people.writer,
    targetWorkspace = workspace,
  ) => [targetWorkspace, person.memberId, person.userWorkspaceId];
  const read = (
    input = {},
    person = people.reader,
    targetWorkspace = workspace,
  ) =>
    services.payments.snapshot(...argumentsFor(person, targetWorkspace), input);
  const cash = async (id) => {
    const value = (await read({ selectedCashId: id })).selectedCash;
    assert(value, 'Expected a selected payment.');
    return value;
  };
  const receivable = async (id) => {
    const value = (await read({ selectedReceivableId: id })).selectedReceivable;
    assert(value, 'Expected a selected receivable.');
    return value;
  };
  const entry = async (id) => {
    const value = (await read({ selectedEntryId: id })).selectedEntry;
    assert(value, 'Expected a selected monthly entry.');
    return value;
  };
  const paymentInput = (fields = {}) => ({
    id: randomUUID(),
    title: 'Actual historical fixture payment',
    category: 'INCOME',
    currency: 'USD',
    amountMicros: '1000000000',
    date: DATE,
    projectId: projects.first,
    note: 'Synthetic receipt evidence, no actual payment.',
    evidenceUrl: 'https://example.invalid/receipt',
    ...fields,
  });
  const payment = (input = paymentInput(), person = people.writer) =>
    services.payments.recordPayment(...argumentsFor(person), input);
  const saveCash = async (fields = {}, person = people.writer) => {
    const externalReference = `fixture:${randomUUID()}`;
    const result = await services.business.command(...argumentsFor(person), {
      action: 'save',
      record: {
        revision: 0,
        kind: 'FINANCE',
        projectId: projects.first,
        title: 'Fixture legacy cash record',
        currency: 'USD',
        amount: 100000,
        date: DATE,
        category: 'RECEIVABLE',
        dueDate: '2020-02-29',
        externalReference,
        evidenceUrl: null,
        notes: 'Synthetic obligation evidence.',
        ...fields,
      },
    });
    const record = result.records.find(
      (candidate) => candidate.externalReference === externalReference,
    );
    assert(record);
    return record.id;
  };
  const rawCash = async (id) => {
    const result = await services.business.snapshot(
      ...argumentsFor(people.reader),
    );
    const record = result.records.find((candidate) => candidate.id === id);
    assert(record);
    return record;
  };
  const transition = async (id, status) => {
    const value = await rawCash(id);
    return services.business.command(...argumentsFor(), {
      action: 'transition',
      id,
      revision: value.revision,
      status,
      note: 'Synthetic reviewed transition.',
      evidence: 'https://example.invalid/reconciliation-receipt',
    });
  };
  const monthlyInput = (fields = {}) => ({
    id: randomUUID(),
    revision: 0,
    month: MONTH,
    kind: 'REVENUE',
    category: 'Service delivery',
    title: 'Explicit service-month fixture',
    currency: 'USD',
    amountMicros: '1000000000',
    note: 'Synthetic reviewed recognition evidence.',
    evidenceUrl: null,
    allocations: [{ projectId: projects.first, amountMicros: '1000000000' }],
    ...fields,
  });
  const monthly = async (fields = {}, post = true) => {
    const input = monthlyInput(fields);
    await services.finance.saveEntry(...argumentsFor(), input);
    if (post)
      await services.finance.postEntry(...argumentsFor(), {
        id: input.id,
        revision: 1,
      });
    return input.id;
  };
  const settlementInput = async (
    cashId,
    receivableId,
    amountMicros,
    fields = {},
  ) => ({
    id: randomUUID(),
    cashId,
    receivableId,
    amountMicros,
    expectedCashToken: (await cash(cashId)).sourceReviewToken,
    expectedReceivableToken: (await receivable(receivableId)).sourceReviewToken,
    ...fields,
  });
  const matchInput = async (cashId, entryId, amountMicros, fields = {}) => ({
    id: randomUUID(),
    cashId,
    entryId,
    projectId: projects.first,
    amountMicros,
    expectedCashToken: (await cash(cashId)).sourceReviewToken,
    expectedEntryToken: (await entry(entryId)).sourceReviewToken,
    ...fields,
  });
  const settle = (input, person = people.writer) =>
    services.payments.settleReceivable(...argumentsFor(person), input);
  const match = (input, person = people.writer) =>
    services.payments.matchCash(...argumentsFor(person), input);
  const reverse = (
    id,
    kind,
    revision = 1,
    person = people.writer,
    reason = 'Synthetic correction preserving audit history.',
  ) =>
    services.payments.reverseRelation(...argumentsFor(person), {
      id,
      kind,
      revision,
      reason,
    });
  return {
    argumentsFor,
    read,
    cash,
    receivable,
    entry,
    paymentInput,
    payment,
    saveCash,
    rawCash,
    transition,
    monthlyInput,
    monthly,
    settlementInput,
    matchInput,
    settle,
    match,
    reverse,
  };
}

async function main() {
  assert.equal(process.argv.length, 2, 'This script is rollback-only.');
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
    const fixture = await createFixture(runner.manager);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const services = buildServices(source, fixture);
    const tests = harness(services, fixture);
    const {
      workspaceId,
      workspace,
      foreignWorkspace,
      people,
      projects,
      schemaName,
    } = fixture;
    const fingerprint = async () =>
      Object.fromEntries(
        await Promise.all(
          TABLES.map(async (table) => {
            const rows = await runner.query(
              `SELECT to_jsonb(t) AS value FROM core."${table}" t WHERE "workspaceId"=$1 ORDER BY id`,
              [workspaceId],
            );
            return [table, rows];
          }),
        ),
      );
    let observingRead = false;
    let readWrites = 0;
    const originalQuery = runner.query.bind(runner);
    runner.query = async (sql, ...arguments_) => {
      if (
        observingRead &&
        /^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(
          sql,
        )
      ) {
        readWrites++;
        assert.fail('Payment reconciliation read issued a write.');
      }
      return originalQuery(sql, ...arguments_);
    };
    const observeRead = async (callback) => {
      observingRead = true;
      try {
        return await callback();
      } finally {
        observingRead = false;
      }
    };
    const denied = async (callback, statuses = [400, 403, 404, 409]) =>
      assert.rejects(callback, (error) => statuses.includes(error.status));

    const pristine = await fingerprint();
    const initial = await observeRead(() => tests.read());
    assert.equal(initial.memberId, people.reader.memberId);
    assert.equal(initial.userWorkspaceId, people.reader.userWorkspaceId);
    assert.equal(initial.canManage, false);
    assert.deepEqual(initial.cash, []);
    assert.deepEqual(initial.receivables, []);
    assert.deepEqual(initial.entries, []);
    assert.equal((await tests.read({}, people.admin)).canManage, true);
    await denied(() => tests.read({}, people.outsider), [403]);
    await denied(
      () =>
        services.payments.snapshot(
          workspace,
          people.reader.memberId,
          people.writer.userWorkspaceId,
          {},
        ),
      [403],
    );
    await denied(() => tests.read({}, people.writer, foreignWorkspace), [403]);
    await denied(
      () => tests.payment(tests.paymentInput(), people.reader),
      [403],
    );
    assert.deepEqual(await fingerprint(), pristine);

    const input = tests.paymentInput();
    const cashId = await tests.payment(input);
    assert.equal(cashId, input.id);
    const recorded = await tests.cash(cashId);
    assert.equal(recorded.amountMicros, '1000000000');
    assert.equal(recorded.date, DATE);
    assert.equal(recorded.status, 'POSTED');
    assert.deepEqual(
      recorded.sourceWarnings,
      [],
      'Persisting an ordinary payment must not manufacture source-change warnings.',
    );
    assert.equal((await tests.rawCash(cashId)).amount, 100000);
    const afterPayment = await fingerprint();
    assert.equal(await tests.payment(input), cashId);
    assert.deepEqual(
      await fingerprint(),
      afterPayment,
      'Exact payment retry must not add events or cash.',
    );
    await denied(
      () => tests.payment({ ...input, amountMicros: '2000000000' }),
      [409],
    );
    await denied(() => tests.payment(input, people.secondWriter), [409]);
    for (const amountMicros of [
      '0',
      '1',
      '-10000',
      '1e6',
      'NaN',
      '10001',
      '9223372036854775808',
    ])
      await denied(
        () => tests.payment(tests.paymentInput({ amountMicros })),
        [400],
      );
    await denied(
      () => tests.payment(tests.paymentInput({ date: '2020-02-30' })),
      [400],
    );
    await denied(
      () => tests.payment(tests.paymentInput({ date: '9999-12-31' })),
      [400],
    );
    await denied(
      () => tests.payment(tests.paymentInput({ note: '', evidenceUrl: null })),
      [400],
    );
    await denied(
      () => tests.payment(tests.paymentInput({ projectId: projects.foreign })),
      [400, 403, 404],
    );

    const invoiceId = await tests.saveCash();
    const entryId = await tests.monthly();
    const settlement = await tests.settlementInput(
      cashId,
      invoiceId,
      '400000000',
    );
    const beforeLinks = await fingerprint();
    await tests.settle(settlement);
    assert.equal(
      (await tests.receivable(invoiceId)).outstandingMicros,
      '600000000',
    );
    assert.equal(
      (await tests.cash(cashId)).remainingSettlementMicros,
      '600000000',
    );
    assert.equal((await tests.cash(cashId)).remainingMatchMicros, '1000000000');
    const afterSettlement = await fingerprint();
    assert.equal(await tests.settle(settlement), settlement.id);
    assert.deepEqual(await fingerprint(), afterSettlement);
    await denied(
      () => tests.settle({ ...settlement, id: randomUUID() }),
      [409],
    );
    await denied(
      () => tests.settle({ ...settlement, amountMicros: '300000000' }),
      [409],
    );
    await denied(() => tests.transition(invoiceId, 'PAID'), [400, 409]);
    await denied(() => tests.transition(invoiceId, 'VOID'), [400, 409]);
    const match = await tests.matchInput(cashId, entryId, '750000000');
    await tests.match(match);
    assert.equal((await tests.cash(cashId)).remainingMatchMicros, '250000000');
    assert.equal(
      (await tests.cash(cashId)).remainingSettlementMicros,
      '600000000',
    );
    assert.equal(
      (await tests.entry(entryId)).allocations[0].remainingMatchMicros,
      '250000000',
    );
    const afterMatch = await fingerprint();
    assert.equal(await tests.match(match), match.id);
    assert.deepEqual(await fingerprint(), afterMatch);
    assert.deepEqual(
      afterMatch.deliveryFinanceEntry,
      beforeLinks.deliveryFinanceEntry,
      'Linking cash must not recognize another monthly amount.',
    );
    assert.deepEqual(
      afterMatch.deliveryFinanceAllocation,
      beforeLinks.deliveryFinanceAllocation,
    );
    assert.deepEqual(
      afterMatch.deliveryOperations,
      beforeLinks.deliveryOperations,
      'Links must not manufacture a second cash movement.',
    );
    const businessSummary = await services.business.snapshot(
      ...tests.argumentsFor(people.reader),
    );
    const usd = businessSummary.finance.find(
      (summary) => summary.currency === 'USD',
    );
    assert(usd, 'Expected the existing cash summary.');
    assert.equal(
      usd.receivables,
      60000,
      'Legacy cash view must show the partial outstanding balance.',
    );
    await denied(
      async () =>
        tests.settle(
          await tests.settlementInput(cashId, invoiceId, '600010000'),
        ),
      [400, 409],
    );
    await denied(
      async () =>
        tests.match(await tests.matchInput(cashId, entryId, '250000001')),
      [400, 409],
    );
    await tests.settle(
      await tests.settlementInput(cashId, invoiceId, '600000000'),
    );
    assert.equal((await tests.receivable(invoiceId)).outstandingMicros, '0');
    assert.equal((await tests.cash(cashId)).remainingSettlementMicros, '0');
    assert.equal((await tests.cash(cashId)).remainingMatchMicros, '250000000');
    const afterCapacityChanged = await fingerprint();
    assert.equal(await tests.settle(settlement), settlement.id);
    assert.equal(await tests.match(match), match.id);
    assert.deepEqual(
      await fingerprint(),
      afterCapacityChanged,
      'An exact original request retry must remain idempotent after other links consume capacity.',
    );
    const secondPayment = await tests.payment(
      tests.paymentInput({ amountMicros: '10000' }),
    );
    const microEntry = await tests.monthly({
      amountMicros: '1',
      allocations: [{ projectId: projects.first, amountMicros: '1' }],
    });
    await tests.match(await tests.matchInput(secondPayment, microEntry, '1'));
    assert.equal(
      (await tests.cash(secondPayment)).remainingMatchMicros,
      '9999',
    );
    assert.equal(
      (await tests.entry(microEntry)).allocations[0].remainingMatchMicros,
      '0',
    );

    const euroInvoice = await tests.saveCash({ currency: 'EUR' });
    const otherInvoice = await tests.saveCash({
      projectId: projects.otherClient,
    });
    const expense = await tests.payment(
      tests.paymentInput({ category: 'EXPENSE' }),
    );
    const euroEntry = await tests.monthly({ currency: 'EUR' });
    const costEntry = await tests.monthly({ kind: 'COST' });
    const otherEntry = await tests.monthly({
      allocations: [
        { projectId: projects.otherClient, amountMicros: '1000000000' },
      ],
    });
    const draftEntry = await tests.monthly({}, false);
    for (const [targetCash, targetInvoice] of [
      [expense, invoiceId],
      [secondPayment, euroInvoice],
      [secondPayment, otherInvoice],
    ])
      await denied(
        async () =>
          tests.settle(
            await tests.settlementInput(targetCash, targetInvoice, '10000'),
          ),
        [400, 409],
      );
    for (const [targetCash, targetEntry, projectId] of [
      [secondPayment, euroEntry, projects.first],
      [secondPayment, costEntry, projects.first],
      [secondPayment, otherEntry, projects.otherClient],
      [secondPayment, draftEntry, projects.first],
    ])
      await denied(
        async () =>
          tests.match(
            await tests.matchInput(targetCash, targetEntry, '100', {
              projectId,
            }),
          ),
        [400, 409],
      );
    await tests.match(await tests.matchInput(expense, costEntry, '1000000'));
    const sameClientInvoice = await tests.saveCash({
      projectId: projects.sameClient,
      amount: 1,
    });
    await denied(
      async () =>
        tests.settle(
          await tests.settlementInput(
            secondPayment,
            sameClientInvoice,
            '10000',
          ),
        ),
      [400],
    );
    const unassigned = await tests.payment(
      tests.paymentInput({ projectId: null, amountMicros: '20000' }),
    );
    const unassignedInvoice = await tests.saveCash({ amount: 1 });
    await denied(
      async () =>
        tests.settle(
          await tests.settlementInput(unassigned, unassignedInvoice, '10000'),
        ),
      [400, 409],
    );
    await tests.settle(
      await tests.settlementInput(unassigned, unassignedInvoice, '10000', {
        acknowledgeUnassignedCash: true,
      }),
    );
    const unassignedEntry = await tests.monthly({
      amountMicros: '10000',
      allocations: [{ projectId: projects.first, amountMicros: '10000' }],
    });
    await denied(
      async () =>
        tests.match(
          await tests.matchInput(unassigned, unassignedEntry, '10000'),
        ),
      [400, 409],
    );
    await tests.match(
      await tests.matchInput(unassigned, unassignedEntry, '10000', {
        acknowledgeUnassignedCash: true,
      }),
    );
    const companyPayment = await tests.payment(
      tests.paymentInput({
        category: 'EXPENSE',
        projectId: null,
        amountMicros: '3330000',
      }),
    );
    const companyEntry = await tests.monthly({
      kind: 'COST',
      amountMicros: '3330000',
      allocations: [{ projectId: null, amountMicros: '3330000' }],
    });
    await tests.match(
      await tests.matchInput(companyPayment, companyEntry, '3330000', {
        projectId: null,
      }),
    );
    assert.equal((await tests.cash(companyPayment)).remainingMatchMicros, '0');
    await denied(
      () =>
        services.payments.settleReceivable(
          ...tests.argumentsFor(people.writer, foreignWorkspace),
          settlement,
        ),
      [403],
    );
    assert.equal(
      (await tests.read({ selectedCashId: randomUUID() })).selectedCash,
      null,
    );
    assert.equal(
      (await tests.read({ selectedReceivableId: randomUUID() }))
        .selectedReceivable,
      null,
    );
    assert.equal(
      (await tests.read({ selectedEntryId: randomUUID() })).selectedEntry,
      null,
    );

    await tests.reverse(match.id, 'MATCH');
    assert.equal((await tests.cash(cashId)).remainingMatchMicros, '1000000000');
    const reversedHistory = (
      await tests.read({ selectedCashId: cashId })
    ).matches.find((relation) => relation.id === match.id);
    assert.equal(reversedHistory.status, 'REVERSED');
    assert.equal(reversedHistory.revision, 2);
    assert.equal(reversedHistory.reversedBy, people.writer.memberId);
    assert(reversedHistory.reversalReason);
    const afterReversal = await fingerprint();
    assert.equal(await tests.match(match), match.id);
    assert.deepEqual(
      await fingerprint(),
      afterReversal,
      'Retrying the original match must not resurrect a reversed relation.',
    );
    assert.equal(await tests.reverse(match.id, 'MATCH'), match.id);
    assert.deepEqual(
      await fingerprint(),
      afterReversal,
      'An exact reversal retry must retain a single reversal event.',
    );
    await denied(
      () => tests.reverse(match.id, 'MATCH', 1, people.secondWriter),
      [409],
    );
    await denied(
      () =>
        tests.reverse(
          match.id,
          'MATCH',
          1,
          people.writer,
          'Different stale correction reason.',
        ),
      [409],
    );
    await denied(
      () => tests.reverse(settlement.id, 'SETTLEMENT', 1, people.reader),
      [403],
    );
    const oldHistory = await tests.read({ selectedReceivableId: invoiceId });
    const remainingSettlement = oldHistory.settlements.find(
      (relation) =>
        relation.status === 'ACTIVE' && relation.id !== settlement.id,
    );
    assert(remainingSettlement);
    await tests.reverse(settlement.id, 'SETTLEMENT');
    await tests.reverse(remainingSettlement.id, 'SETTLEMENT');
    assert.equal(
      (await tests.receivable(invoiceId)).outstandingMicros,
      '1000000000',
    );

    const voidCash = await tests.payment();
    const voidInvoice = await tests.saveCash();
    const voidEntryId = await tests.monthly();
    const voidSettlement = await tests.settlementInput(
      voidCash,
      voidInvoice,
      '100000000',
    );
    const voidMatch = await tests.matchInput(
      voidCash,
      voidEntryId,
      '200000000',
    );
    await tests.settle(voidSettlement);
    await tests.match({
      ...voidMatch,
      expectedCashToken: (await tests.cash(voidCash)).sourceReviewToken,
    });
    await tests.transition(voidCash, 'VOID');
    assert.equal((await tests.cash(voidCash)).status, 'VOID');
    assert.equal(
      (await tests.receivable(voidInvoice)).outstandingMicros,
      '1000000000',
    );
    assert.equal((await tests.entry(voidEntryId)).status, 'POSTED');
    const voidRelations = await tests.read({ selectedCashId: voidCash });
    assert(
      voidRelations.settlements.every(
        (relation) => relation.status === 'REVERSED',
      ),
    );
    assert(
      voidRelations.matches.every((relation) => relation.status === 'REVERSED'),
    );
    const monthlyVoidCash = await tests.payment();
    const monthlyVoidInvoice = await tests.saveCash();
    const monthlyVoidEntry = await tests.monthly();
    await tests.settle(
      await tests.settlementInput(
        monthlyVoidCash,
        monthlyVoidInvoice,
        '100000000',
      ),
    );
    await tests.match(
      await tests.matchInput(monthlyVoidCash, monthlyVoidEntry, '200000000'),
    );
    const monthlyBeforeVoid = await tests.entry(monthlyVoidEntry);
    await services.finance.voidEntry(...tests.argumentsFor(), {
      id: monthlyVoidEntry,
      revision: monthlyBeforeVoid.revision,
      reason: 'Synthetic recognition correction only.',
    });
    assert.equal((await tests.cash(monthlyVoidCash)).status, 'POSTED');
    assert.equal(
      (await tests.cash(monthlyVoidCash)).remainingMatchMicros,
      '1000000000',
    );
    assert.equal(
      (await tests.receivable(monthlyVoidInvoice)).outstandingMicros,
      '900000000',
    );

    const legacyInvoice = await tests.saveCash({ amount: 12345 });
    await tests.transition(legacyInvoice, 'PAID');
    const legacyRecords = (
      await services.business.snapshot(...tests.argumentsFor(people.reader))
    ).records;
    const legacyReceipt = legacyRecords.find(
      (record) => record.externalReference === `receivable:${legacyInvoice}`,
    );
    assert(legacyReceipt);
    assert.equal(
      (await tests.receivable(legacyInvoice)).outstandingMicros,
      '0',
    );
    assert.equal(
      (await tests.cash(legacyReceipt.id)).remainingSettlementMicros,
      '0',
    );
    const legacyRelation = (
      await tests.read({ selectedReceivableId: legacyInvoice })
    ).settlements.find((relation) => relation.legacy);
    assert(legacyRelation);
    assert.equal(legacyRelation.canReverse, false);
    assert.equal(legacyRelation.amountMicros, '123450000');
    await denied(
      () => tests.reverse(legacyRelation.id, 'SETTLEMENT'),
      [400, 404, 409],
    );
    const legacyEntry = await tests.monthly({
      amountMicros: '123450000',
      allocations: [{ projectId: projects.first, amountMicros: '123450000' }],
    });
    await tests.match(
      await tests.matchInput(legacyReceipt.id, legacyEntry, '123450000'),
    );
    await tests.transition(legacyReceipt.id, 'VOID');
    assert.equal(
      (await tests.receivable(legacyInvoice)).outstandingMicros,
      '123450000',
    );
    assert.equal(
      (await tests.entry(legacyEntry)).allocations[0].remainingMatchMicros,
      '123450000',
    );

    const changedCash = await tests.payment();
    const changedEntry = await tests.monthly();
    const [{ state: originalState }] = await runner.query(
      'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    const changedState = structuredClone(originalState);
    changedState.business.records.find(
      (record) => record.id === changedCash,
    ).title = 'Unexpected historical source mutation fixture';
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [workspaceId, JSON.stringify(changedState)],
    );
    const changedSource = await tests.cash(changedCash);
    assert(changedSource.sourceWarnings.includes('SOURCE_CHANGED'));
    await denied(
      async () =>
        tests.match(
          await tests.matchInput(changedCash, changedEntry, '1000000'),
        ),
      [409],
    );
    const [storedSource] = await runner.query(
      'SELECT snapshot FROM core."deliveryFinanceSource" WHERE id=$1',
      [changedCash],
    );
    assert.notEqual(
      storedSource.snapshot.title,
      changedSource.title,
      'A read must not rewrite the immutable source snapshot to hide an unexpected mutation.',
    );
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [workspaceId, JSON.stringify(originalState)],
    );
    const orphanPaidInvoice = await tests.saveCash({ amount: 900 });
    const [{ state: beforeLegacyMutation }] = await runner.query(
      'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    const paidWithoutReceipt = structuredClone(beforeLegacyMutation);
    paidWithoutReceipt.business.records.find(
      (record) => record.id === orphanPaidInvoice,
    ).status = 'PAID';
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [workspaceId, JSON.stringify(paidWithoutReceipt)],
    );
    const unsupportedLegacy = await tests.receivable(orphanPaidInvoice);
    assert(
      unsupportedLegacy.sourceWarnings.includes('LEGACY_PAID_WITHOUT_RECEIPT'),
    );
    assert.equal(unsupportedLegacy.outstandingMicros, '0');
    assert.equal(unsupportedLegacy.settledMicros, '9000000');
    assert.equal(
      (await tests.read({ selectedReceivableId: orphanPaidInvoice }))
        .settlements.length,
      0,
      'An ambiguous historical PAID status must not manufacture receipt evidence.',
    );
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [workspaceId, JSON.stringify(beforeLegacyMutation)],
    );
    const invalidLegacy = structuredClone(beforeLegacyMutation);
    invalidLegacy.business.records.push({
      ...invalidLegacy.business.records.find((record) => record.id === cashId),
      id: randomUUID(),
      amount: '100',
      title: 'Invalid historical cash fixture',
    });
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [workspaceId, JSON.stringify(invalidLegacy)],
    );
    const invalidLegacyRead = await tests.read();
    assert.equal(invalidLegacyRead.rejectedCashCount, 1);
    assert(
      !invalidLegacyRead.cash.some(
        (record) => record.title === 'Invalid historical cash fixture',
      ),
    );
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [workspaceId, JSON.stringify(beforeLegacyMutation)],
    );

    const malformedReference = structuredClone(beforeLegacyMutation);
    malformedReference.business.records.push({
      ...malformedReference.business.records.find(
        (record) => record.id === cashId,
      ),
      id: randomUUID(),
      externalReference: 123,
      title: 'Invalid legacy reference fixture',
    });
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [workspaceId, JSON.stringify(malformedReference)],
    );
    const malformedReferenceRead = await tests.read();
    assert.equal(malformedReferenceRead.rejectedCashCount, 1);
    assert(
      !malformedReferenceRead.cash.some(
        (record) => record.title === 'Invalid legacy reference fixture',
      ),
    );
    await services.business.snapshot(...tests.argumentsFor(people.reader));
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [workspaceId, JSON.stringify(beforeLegacyMutation)],
    );

    const pagingCash = await tests.payment(
      tests.paymentInput({ amountMicros: '1000000' }),
    );
    const pagingInvoice = await tests.saveCash({ amount: 100 });
    for (let index = 0; index < 55; index++)
      await tests.settle(
        await tests.settlementInput(pagingCash, pagingInvoice, '10000'),
      );
    const firstRelationPage = await tests.read({ selectedCashId: pagingCash });
    assert.equal(firstRelationPage.settlementTotal, 55);
    assert.equal(firstRelationPage.settlements.length, 50);
    assert(firstRelationPage.nextSettlementId);
    assert.equal(firstRelationPage.selectedCash.settledMicros, '550000');
    assert.equal(
      firstRelationPage.selectedCash.remainingSettlementMicros,
      '450000',
    );
    const secondRelationPage = await tests.read({
      selectedCashId: pagingCash,
      afterSettlementId: firstRelationPage.nextSettlementId,
    });
    assert.equal(secondRelationPage.settlements.length, 5);
    assert.equal(secondRelationPage.nextSettlementId, null);
    assert.equal(
      new Set(
        [
          ...firstRelationPage.settlements,
          ...secondRelationPage.settlements,
        ].map((relation) => relation.id),
      ).size,
      55,
    );
    assert.equal(
      secondRelationPage.selectedCash.settledMicros,
      '550000',
      'Conservation totals must include relations beyond the current history page.',
    );
    await denied(
      () =>
        tests.read({ selectedCashId: pagingCash, afterSettlementId: match.id }),
      [400],
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
                throw new Error('Injected reconciliation activity failure');
              return target.insert(input);
            };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const atomicCash = await tests.payment();
    const atomicInvoice = await tests.saveCash();
    const atomicEntry = await tests.monthly();
    const atomicSettlement = await tests.settlementInput(
      atomicCash,
      atomicInvoice,
      '100000000',
    );
    const atomicMatch = await tests.matchInput(
      atomicCash,
      atomicEntry,
      '100000000',
    );
    for (const operation of [
      () => tests.payment(),
      () => tests.settle(atomicSettlement),
      () => tests.match(atomicMatch),
    ]) {
      const before = await fingerprint();
      failActivity = true;
      try {
        await assert.rejects(
          operation,
          /Injected reconciliation activity failure/,
        );
      } finally {
        failActivity = false;
      }
      assert.deepEqual(
        await fingerprint(),
        before,
        'Cash, links, source references and audit must roll back together.',
      );
    }
    await tests.match(atomicMatch);
    for (const operation of [
      () => tests.reverse(atomicMatch.id, 'MATCH'),
      () => tests.transition(atomicCash, 'VOID'),
      () =>
        services.finance.voidEntry(...tests.argumentsFor(), {
          id: atomicEntry,
          revision: 2,
          reason: 'Atomic fixture correction.',
        }),
    ]) {
      const before = await fingerprint();
      failActivity = true;
      try {
        await assert.rejects(
          operation,
          /Injected reconciliation activity failure/,
        );
      } finally {
        failActivity = false;
      }
      assert.deepEqual(await fingerprint(), before);
    }

    const beforeReads = await fingerprint();
    for (const input of [
      {},
      { currency: 'USD' },
      { selectedCashId: cashId },
      { selectedReceivableId: invoiceId },
      { selectedEntryId: entryId },
    ])
      await observeRead(() => tests.read(input));
    await observeRead(() =>
      services.business.snapshot(...tests.argumentsFor(people.reader)),
    );
    await observeRead(() =>
      services.finance.snapshot(...tests.argumentsFor(people.reader), {
        month: MONTH,
      }),
    );
    assert.equal(readWrites, 0);
    assert.deepEqual(await fingerprint(), beforeReads);
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.writer.userId,
    ]);
    await denied(() => tests.read({}, people.writer), [403]);
    await denied(() => tests.payment(), [403]);
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      people.writer.userId,
    ]);
    await runner.query(
      `UPDATE "${schemaName}"."workspaceMember" SET "deletedAt"=now() WHERE id=$1`,
      [people.writer.memberId],
    );
    await denied(() => tests.payment(), [403]);
    await runner.query(
      `UPDATE "${schemaName}"."workspaceMember" SET "deletedAt"=NULL WHERE id=$1`,
      [people.writer.memberId],
    );
    await runner.query(
      'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1 AND "workspaceMemberId"=$2',
      [workspaceId, people.writer.memberId],
    );
    await denied(() => tests.read({}, people.writer), [403]);
    await denied(() => tests.payment(), [403]);
    console.log(
      'PASS: rollback-only actual-service payment dates, exact partial settlements and independent monthly matches, legacy receipts, stale reviews/idempotency, currency/client/direction boundaries, reversals/voids, permission revocation, atomic audit and read-only snapshots. No real payments, providers or persisted fixtures.',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}

module.exports = {
  createFixture,
  cleanupFixture,
  buildServices,
  harness,
  MONTH,
  DATE,
  TABLES,
};
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

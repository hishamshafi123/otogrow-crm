const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  createFixture,
  cleanupFixture,
  buildServices,
  harness,
} = require('./check-delivery-reconciliation.cjs');

const MONTH = '2020-02';
const NEXT_MONTH = '2020-03';
const PRIVATE_MARKER = 'PRIVATE_AI_FINANCE_FIXTURE_PAYLOAD';
const TABLES = [
  'deliveryFinanceAiClaim',
  'deliveryFinanceCashMatch',
  'deliveryFinanceSettlement',
  'deliveryFinanceSource',
  'deliveryFinanceAllocation',
  'deliveryFinanceEvent',
  'deliveryFinanceEntry',
  'deliveryFinancePlan',
  'otogrowAiSpend',
  'otogrowAiSpendEvent',
  'otogrowAiBudget',
  'otogrowAiPrice',
  'otogrowActivityEvent',
  'deliveryReminderOutbox',
  'deliveryOperations',
];

async function createAiFixture(manager, prefix = 'ai_finance_rollback') {
  const fixture = await createFixture(manager, prefix);
  await manager.query(
    `CREATE TABLE "${fixture.schemaName}".task (id uuid PRIMARY KEY,title text,"deletedAt" timestamptz)`,
  );
  const [project] = await manager.query(
    'SELECT "companyId" FROM core."deliveryProject" WHERE "workspaceId"=$1 AND id=$2',
    [fixture.workspaceId, fixture.projects.first],
  );
  fixture.clientId = project.companyId;
  return fixture;
}

async function cleanupAiFixture(manager, fixture) {
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  assert.match(fixture.schemaName, /^ai_finance_[a-z_]+[a-f0-9_]{36}$/);
  const workspaceIds = [fixture.workspaceId, fixture.foreignWorkspaceId];
  const workspaces = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
    [workspaceIds],
  );
  assert.equal(workspaces.length, 2);
  for (const workspace of workspaces) {
    assert.equal(workspace.displayName, fixture.sentinel);
    assert.equal(workspace.databaseSchema, fixture.schemaName);
  }
  for (const table of [
    'deliveryFinanceAiClaim',
    'otogrowAiSpendEvent',
    'otogrowAiSpend',
  ])
    await manager.query(
      `DELETE FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
      [workspaceIds],
    );
  await cleanupFixture(manager, fixture);
}

function buildAiServices(source, fixture) {
  const {
    DeliveryFinanceAiCostService,
  } = require('../dist/modules/delivery/finance/delivery-finance-ai-cost.service');
  const {
    OtogrowAiBudgetService,
  } = require('../dist/modules/otogrow-ai-budget/otogrow-ai-budget.service');
  const services = buildServices(source, fixture);
  return {
    ...services,
    aiCosts: new DeliveryFinanceAiCostService(
      source,
      services.delivery,
      services.access,
      services.finance,
    ),
    aiBudget: new OtogrowAiBudgetService(source, services.access),
  };
}

async function seedSpend(manager, fixture, fields = {}) {
  const {
    OtogrowAiSpendEntity,
  } = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity');
  const {
    OtogrowAiSpendEventEntity,
  } = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-spend-event.entity');
  const state = fields.state ?? 'SETTLED';
  const amount =
    fields.actualMicroUsd === undefined ? '2000000' : fields.actualMicroUsd;
  const spend = await manager.getRepository(OtogrowAiSpendEntity).save({
    id: randomUUID(),
    workspaceId: fixture.workspaceId,
    revision: 2,
    sourceKind: 'TASK_AGENT',
    sourceRunId: randomUUID(),
    actorId: fixture.people.writer.memberId,
    projectId: fixture.projects.first,
    clientId: fields.projectId === null ? null : fixture.clientId,
    clientName: null,
    taskId: null,
    taskName: PRIVATE_MARKER,
    state,
    reservedMicroUsd: '100000000',
    actualMicroUsd: amount,
    price: {
      profileId: randomUUID(),
      revision: 1,
      modelId: 'synthetic-finance-model',
      kind: 'TEXT',
      source: PRIVATE_MARKER,
      verifiedAt: '2020-02-01T00:00:00.000Z',
      inputTokenBound: 10000000,
      outputTokenBound: 60000,
      reasoningTokenBound: 0,
      boundSource: 'MODEL_CONTEXT',
      providerSecret: PRIVATE_MARKER,
      pricing: {
        inputUsdPerMillionTokens: '1',
        outputUsdPerMillionTokens: '1',
        reasoningUsdPerMillionTokens: '1',
        cacheReadUsdPerMillionTokens: '1',
        cacheWriteUsdPerMillionTokens: '1',
        maxInputTokens: 10000000,
        maxOutputTokens: 60000,
        maxReasoningTokens: 0,
        outputIncludesReasoning: true,
        longContextThresholdTokens: null,
        longInputUsdPerMillionTokens: null,
        longOutputUsdPerMillionTokens: null,
        longReasoningUsdPerMillionTokens: null,
        longCacheReadUsdPerMillionTokens: null,
        longCacheWriteUsdPerMillionTokens: null,
      },
    },
    usage: { privatePayload: PRIVATE_MARKER },
    attentionReason: PRIVATE_MARKER,
    dispatchedAt:
      state === 'RESERVED' ? null : new Date('2020-02-20T00:00:00.000Z'),
    settledAt:
      state === 'SETTLED' ? new Date('2020-02-20T01:00:00.000Z') : null,
    ...fields,
  });
  const event = await manager.getRepository(OtogrowAiSpendEventEntity).save({
    workspaceId: spend.workspaceId,
    spendId: spend.id,
    actorId: null,
    action: state,
    before: {
      state: 'DISPATCHED',
      revision: 1,
      privatePayload: PRIVATE_MARKER,
    },
    after: {
      state,
      revision: spend.revision,
      actualMicroUsd: spend.actualMicroUsd,
      reservedMicroUsd: spend.reservedMicroUsd,
      providerResponse: PRIVATE_MARKER,
    },
    evidenceReference: null,
    reason: null,
  });
  return { spend, event };
}

function aiHarness(source, services, fixture) {
  const cashTests = harness(services, fixture);
  const argumentsFor = (
    person = fixture.people.writer,
    workspace = fixture.workspace,
  ) => [workspace, person.memberId, person.userWorkspaceId];
  const read = (
    input = {},
    person = fixture.people.reader,
    workspace = fixture.workspace,
  ) => services.aiCosts.snapshot(...argumentsFor(person, workspace), input);
  const selected = async (id, person = fixture.people.reader) => {
    const result = (await read({ selectedSpendId: id }, person)).selectedSource;
    assert(result, 'The synthetic AI charge must remain selectable.');
    return result;
  };
  const entry = async (id) => {
    const [row] = await source.query(
      'SELECT * FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND id=$2',
      [fixture.workspaceId, id],
    );
    assert(row, 'Expected a synthetic recognition entry.');
    return row;
  };
  const prepareInput = async (spendId, evidenceEventId, fields = {}) => {
    const current = await selected(spendId);
    const evidence = current.evidenceOptions.find(
      (option) => option.id === evidenceEventId,
    );
    assert(
      evidence,
      'The selected synthetic evidence must be on the current detail page.',
    );
    return {
      id: randomUUID(),
      spendId,
      evidenceEventId,
      expectedSourceReviewToken: current.sourceReviewToken,
      expectedClaimRevision: current.claim.revision,
      month: MONTH,
      title: 'Synthetic reviewed AI cost',
      note: 'Synthetic recognition review; no provider call or real payment.',
      allocations: [
        {
          projectId: fixture.projects.first,
          amountMicros: evidence.amountMicros,
        },
      ],
      acknowledgeSourceWarnings: true,
      acknowledgeNoDuplicateCost: true,
      replacesEntryId: null,
      expectedReplacedEntryRevision: null,
      correctionReason: null,
      ...fields,
    };
  };
  const prepare = (input, person = fixture.people.writer) =>
    services.aiCosts.prepare(...argumentsFor(person), input);
  const postInput = async (id, fields = {}) => {
    const current = await entry(id);
    const spend = await selected(current.sourceAiSpend.spendId);
    return {
      id,
      revision: current.revision,
      expectedClaimRevision: spend.claim.revision,
      expectedSourceReviewToken: spend.sourceReviewToken,
      acknowledgeSourceWarnings: true,
      acknowledgeReplacement: Boolean(current.sourceAiSpend.replacesEntryId),
      ...fields,
    };
  };
  const post = (input, person = fixture.people.writer) =>
    services.aiCosts.post(...argumentsFor(person), input);
  const correctionInput = async (spendId, eventId, fields = {}) => {
    const current = await selected(spendId);
    assert(current.claim.currentEntry);
    return prepareInput(spendId, eventId, {
      replacesEntryId: current.claim.currentEntry.id,
      expectedReplacedEntryRevision: current.claim.currentEntry.revision,
      correctionReason:
        'Explicitly reviewed replacement from immutable financial evidence.',
      ...fields,
    });
  };
  const late = async (spendId, amountMicros) => {
    const [spend] = await source.query(
      'SELECT * FROM core."otogrowAiSpend" WHERE id=$1',
      [spendId],
    );
    await services.aiBudget.settle(
      {
        workspaceId: spend.workspaceId,
        sourceKind: spend.sourceKind,
        sourceRunId: spend.sourceRunId,
      },
      {
        inputTokens: Number(amountMicros),
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    );
    const [event] = await source.query(
      'SELECT * FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 AND "spendId"=$2 AND action=\'LATE_PROVIDER_USAGE\' AND after->>\'reportedActualMicroUsd\'=$3 ORDER BY "createdAt" DESC,id DESC LIMIT 1',
      [fixture.workspaceId, spendId, amountMicros],
    );
    assert(event, 'Expected immutable synthetic late provider evidence.');
    return event;
  };
  const fingerprint = async (tables = TABLES) => {
    const result = {};
    for (const table of tables) {
      const rows = await source.query(
        `SELECT to_jsonb(fixture_row)::text AS value FROM core."${table}" fixture_row WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id`,
        [[fixture.workspaceId, fixture.foreignWorkspaceId]],
      );
      result[table] = {
        count: rows.length,
        hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
      };
    }
    return result;
  };
  return {
    ...cashTests,
    argumentsFor,
    read,
    selected,
    entry,
    prepareInput,
    prepare,
    postInput,
    post,
    correctionInput,
    late,
    fingerprint,
  };
}

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This actual-service checker is rollback-only.',
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
    const fixture = await createAiFixture(runner.manager);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const services = buildAiServices(source, fixture);
    const tests = aiHarness(source, services, fixture);
    const { people, projects, workspaceId } = fixture;
    const denied = async (operation, statuses = [400, 403, 404, 409]) => {
      const before = await tests.fingerprint();
      await assert.rejects(operation, (error) =>
        statuses.includes(error.status),
      );
      assert.deepEqual(
        await tests.fingerprint(),
        before,
        'Denied finance operations cannot write.',
      );
    };
    const pristine = await tests.fingerprint();
    const empty = await tests.read();
    assert.equal(empty.workspaceId, workspaceId);
    assert.equal(empty.memberId, people.reader.memberId);
    assert.equal(empty.userWorkspaceId, people.reader.userWorkspaceId);
    assert.equal(empty.canManage, false);
    assert.equal(empty.canReadBudget, false);
    assert.deepEqual(empty.sources, []);
    assert.equal((await tests.read({}, people.writer)).canManage, true);
    await denied(() => tests.read({}, people.outsider), [403]);
    await denied(
      () => tests.read({}, people.writer, fixture.foreignWorkspace),
      [403],
    );
    await denied(
      () =>
        services.aiCosts.snapshot(
          fixture.workspace,
          people.reader.memberId,
          people.writer.userWorkspaceId,
          {},
        ),
      [403],
    );
    await denied(
      () =>
        services.aiBudget.snapshot(...tests.argumentsFor(people.writer), {}),
      [403],
    );
    assert.deepEqual(await tests.fingerprint(), pristine);

    const original = await seedSpend(runner.manager, fixture);
    const zero = await seedSpend(runner.manager, fixture, {
      actualMicroUsd: '0',
    });
    const micro = await seedSpend(runner.manager, fixture, {
      actualMicroUsd: '1',
      projectId: null,
    });
    const unknowns = [];
    for (const state of ['RESERVED', 'DISPATCHED', 'UNCERTAIN', 'RELEASED'])
      unknowns.push(
        await seedSpend(runner.manager, fixture, {
          state,
          actualMicroUsd: null,
        }),
      );
    unknowns.push(
      await seedSpend(runner.manager, fixture, { actualMicroUsd: null }),
    );
    unknowns.push(
      await seedSpend(runner.manager, fixture, { actualMicroUsd: '-1' }),
    );
    const malformedModel = await seedSpend(runner.manager, fixture, {
      price: { modelId: { privatePayload: PRIVATE_MARKER } },
    });
    const malformedSource = await tests.selected(malformedModel.spend.id);
    assert.equal(malformedSource.eligible, false);
    assert.equal(malformedSource.modelId, '');
    assert(malformedSource.sourceWarnings.includes('SOURCE_MODEL_UNAVAILABLE'));
    assert(!JSON.stringify(malformedSource).includes(PRIVATE_MARKER));
    const foreign = await seedSpend(runner.manager, fixture, {
      workspaceId: fixture.foreignWorkspaceId,
      projectId: projects.foreign,
    });
    const current = await tests.selected(original.spend.id);
    assert.equal(current.eligible, true);
    assert.deepEqual(current.sourceWarnings, []);
    assert.equal(current.currency, 'USD');
    assert.equal(current.settledAmountMicros, '2000000');
    assert(
      current.evidenceOptions.some(
        (option) =>
          option.id === original.event.id && option.amountMicros === '2000000',
      ),
    );
    for (const privateField of [
      'reservedMicroUsd',
      'reservedUsd',
      'chargedUsd',
      'usage',
      'price',
      'taskName',
      'taskId',
      'sourceRunId',
      'attentionReason',
    ])
      assert(
        !(privateField in current),
        `Finance source projection cannot include ${privateField}.`,
      );
    for (const option of current.evidenceOptions)
      assert.deepEqual(Object.keys(option).sort(), [
        'amountMicros',
        'basis',
        'id',
        'recordedAt',
      ]);
    assert(!JSON.stringify(await tests.read()).includes(PRIVATE_MARKER));
    assert(!JSON.stringify(current).includes(PRIVATE_MARKER));
    for (const state of ['RESERVED', 'DISPATCHED', 'UNCERTAIN', 'RELEASED'])
      assert(
        (await tests.read()).sources.some((row) => row.state === state),
        `The catalog must explain ${state} usage instead of hiding it as an empty queue.`,
      );
    assert(
      (await tests.read({ filter: 'UNRECOGNIZED' })).sources.some(
        (row) => row.id === original.spend.id,
      ),
    );
    assert(
      (await tests.read({ filter: 'NEEDS_REVIEW' })).sources.some(
        (row) => row.id === original.spend.id,
      ),
    );
    assert.equal(
      (await tests.read({ selectedSpendId: foreign.spend.id })).selectedSource,
      null,
    );
    for (const { spend } of unknowns) {
      const value = await tests.selected(spend.id);
      assert.equal(value.eligible, false);
      assert.deepEqual(value.evidenceOptions, []);
    }
    const reorderedEvidence = await seedSpend(runner.manager, fixture, {
      actualMicroUsd: '10000',
    });
    const beforeTimestamp = await tests.selected(reorderedEvidence.spend.id);
    await runner.query(
      'UPDATE core."otogrowAiSpendEvent" SET "createdAt"="createdAt"+interval \'1 microsecond\' WHERE id=$1 AND "workspaceId"=$2',
      [reorderedEvidence.event.id, workspaceId],
    );
    const afterTimestamp = await tests.selected(reorderedEvidence.spend.id);
    assert.notEqual(
      afterTimestamp.sourceReviewToken,
      beforeTimestamp.sourceReviewToken,
      'Evidence timestamp/order changes must invalidate review below JavaScript millisecond precision.',
    );
    const timestampInput = await tests.prepareInput(
      reorderedEvidence.spend.id,
      reorderedEvidence.event.id,
      { expectedSourceReviewToken: beforeTimestamp.sourceReviewToken },
    );
    await denied(() => tests.prepare(timestampInput), [409]);

    const expenseId = await tests.payment(
      tests.paymentInput({ category: 'EXPENSE', amountMicros: '2000000' }),
    );
    const invoiceId = await tests.saveCash();
    const unchangedCash = await tests.fingerprint(['deliveryOperations']);
    const prepare = await tests.prepareInput(
      original.spend.id,
      original.event.id,
      {
        allocations: [
          { projectId: projects.first, amountMicros: '1500000' },
          { projectId: null, amountMicros: '500000' },
        ],
      },
    );
    await denied(() => tests.prepare(prepare, people.reader), [403]);
    await denied(
      () => tests.prepare({ ...prepare, acknowledgeNoDuplicateCost: false }),
      [400],
    );
    await denied(
      () =>
        tests.prepare({
          ...prepare,
          allocations: [
            { projectId: projects.foreign, amountMicros: '2000000' },
          ],
        }),
      [400, 403, 404],
    );
    await denied(() => tests.prepare({ ...prepare, currency: 'EUR' }), [400]);
    const prepared = await tests.prepare(prepare);
    assert.equal(prepared.entryId, prepare.id);
    assert.equal((await tests.entry(prepare.id)).status, 'DRAFT');
    const afterPrepared = await tests.fingerprint();
    assert(
      (await tests.read({ filter: 'RECOGNIZED' })).sources.some(
        (row) => row.id === original.spend.id,
      ),
    );
    assert(
      (await tests.read({ filter: 'NEEDS_REVIEW' })).sources.some(
        (row) => row.id === original.spend.id,
      ),
    );
    const retry = await tests.prepare(prepare);
    assert.equal(retry.entryId, prepare.id);
    assert.equal(retry.replayed, true);
    assert.deepEqual(await tests.fingerprint(), afterPrepared);
    await denied(
      () => tests.prepare({ ...prepare, id: randomUUID(), month: NEXT_MONTH }),
      [409],
    );
    await denied(
      () => tests.prepare({ ...prepare, title: 'Different request body' }),
      [409],
    );
    await denied(() => tests.prepare(prepare, people.secondWriter), [409]);
    await denied(
      () =>
        services.finance.postEntry(...tests.argumentsFor(), {
          id: prepare.id,
          revision: 1,
        }),
      [400, 409],
    );
    await denied(
      () =>
        services.finance.saveEntry(...tests.argumentsFor(), {
          id: prepare.id,
          revision: 1,
          month: MONTH,
          kind: 'REVENUE',
          category: 'AI',
          title: prepare.title,
          currency: 'USD',
          amountMicros: '2000000',
          note: prepare.note,
          evidenceUrl: null,
          allocations: prepare.allocations,
        }),
      [400, 409],
    );
    const beforeEditPost = await tests.postInput(prepare.id);
    const editing = await tests.entry(prepare.id);
    await services.finance.saveEntry(...tests.argumentsFor(), {
      id: editing.id,
      revision: editing.revision,
      month: editing.month,
      kind: editing.kind,
      category: editing.category,
      title: 'Explicitly reviewed synthetic AI cost',
      currency: editing.currency,
      amountMicros: editing.amountMicros,
      note: 'Finance-specific review note; private budget notes stay private.',
      evidenceUrl: null,
      allocations: prepare.allocations,
    });
    await denied(() => tests.post(beforeEditPost), [409]);
    await tests.post(await tests.postInput(prepare.id));
    assert.equal((await tests.entry(prepare.id)).status, 'POSTED');
    assert(
      !(await tests.read({ filter: 'NEEDS_REVIEW' })).sources.some(
        (row) => row.id === original.spend.id,
      ),
    );
    assert.deepEqual(
      await tests.fingerprint(['deliveryOperations']),
      unchangedCash,
    );
    const originalOrigin = structuredClone(
      (await tests.entry(prepare.id)).sourceAiSpend,
    );
    assert.equal(originalOrigin.evidenceEventId, original.event.id);
    assert.equal(originalOrigin.amountMicros, '2000000');
    assert(!JSON.stringify(originalOrigin).includes(PRIVATE_MARKER));
    const match = await tests.matchInput(expenseId, prepare.id, '1000000');
    await tests.match(match);

    const lower = await tests.late(original.spend.id, '1000000');
    assert(
      (await tests.read({ filter: 'NEEDS_REVIEW' })).sources.some(
        (row) => row.id === original.spend.id,
      ),
    );
    const lowerInput = await tests.correctionInput(
      original.spend.id,
      lower.id,
      {
        allocations: [
          { projectId: projects.first, amountMicros: '600000' },
          { projectId: null, amountMicros: '400000' },
        ],
      },
    );
    await tests.prepare(lowerInput);
    assert.equal((await tests.entry(prepare.id)).status, 'POSTED');
    assert.equal((await tests.entry(lowerInput.id)).status, 'DRAFT');
    assert.equal(
      (await tests.selected(original.spend.id)).claim.currentEntry.id,
      prepare.id,
    );
    assert.equal((await tests.cash(expenseId)).matchedMicros, '1000000');
    const pendingOriginal = await tests.entry(prepare.id);
    await denied(
      () =>
        services.finance.voidEntry(...tests.argumentsFor(), {
          id: prepare.id,
          revision: pendingOriginal.revision,
          reason: 'Cannot abandon a pending correction.',
        }),
      [400, 409],
    );
    const stalePost = await tests.postInput(lowerInput.id);
    await tests.match(await tests.matchInput(expenseId, prepare.id, '10000'));
    await denied(() => tests.post(stalePost), [409]);
    await denied(
      async () =>
        tests.post(
          await tests.postInput(lowerInput.id, {
            acknowledgeReplacement: false,
          }),
        ),
      [400, 409],
    );
    await tests.post(await tests.postInput(lowerInput.id));
    const old = await tests.entry(prepare.id);
    assert.equal(old.status, 'VOID');
    assert.equal(old.amountMicros, '2000000');
    assert.deepEqual(old.sourceAiSpend, originalOrigin);
    assert.equal((await tests.entry(lowerInput.id)).amountMicros, '1000000');
    assert.equal((await tests.entry(lowerInput.id)).status, 'POSTED');
    assert(
      !(await tests.read({ filter: 'NEEDS_REVIEW' })).sources.some(
        (row) => row.id === original.spend.id,
      ),
    );
    assert.equal(
      (await tests.entry(lowerInput.id)).sourceAiSpend.basis,
      'LATE_PRICED_USAGE',
    );
    assert.equal((await tests.cash(expenseId)).status, 'POSTED');
    assert.equal((await tests.cash(expenseId)).matchedMicros, '0');
    assert.equal(
      (await tests.receivable(invoiceId)).outstandingMicros,
      '1000000000',
    );
    const relations = await runner.query(
      'SELECT status FROM core."deliveryFinanceCashMatch" WHERE "workspaceId"=$1 AND "entryId"=$2',
      [workspaceId, prepare.id],
    );
    assert(
      relations.length === 2 &&
        relations.every((row) => row.status === 'REVERSED'),
    );
    assert.deepEqual(
      await tests.fingerprint(['deliveryOperations']),
      unchangedCash,
    );

    const higher = await tests.late(original.spend.id, '3000000');
    const cancelled = await tests.correctionInput(original.spend.id, higher.id);
    await tests.prepare(cancelled);
    await services.finance.voidEntry(...tests.argumentsFor(), {
      id: cancelled.id,
      revision: 1,
      reason: 'Cancel an unsent recognition correction.',
    });
    assert.equal((await tests.entry(lowerInput.id)).status, 'POSTED');
    assert.equal(
      (await tests.selected(original.spend.id)).claim.replacementEntry,
      null,
    );
    const beforeCancelledRetry = await tests.fingerprint();
    assert.equal((await tests.prepare(cancelled)).entryId, cancelled.id);
    assert.deepEqual(await tests.fingerprint(), beforeCancelledRetry);
    const higherInput = await tests.correctionInput(
      original.spend.id,
      higher.id,
    );
    await tests.prepare(higherInput);

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
                throw new Error('Injected AI finance audit failure');
              return target.insert(input);
            };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const atomicPost = await tests.postInput(higherInput.id);
    const beforeAtomic = await tests.fingerprint();
    failActivity = true;
    try {
      await assert.rejects(
        () => tests.post(atomicPost),
        /Injected AI finance audit failure/,
      );
    } finally {
      failActivity = false;
    }
    assert.deepEqual(
      await tests.fingerprint(),
      beforeAtomic,
      'Replacement, matches, claim and audit must roll back together.',
    );
    await tests.post(await tests.postInput(higherInput.id));
    assert.equal((await tests.entry(lowerInput.id)).status, 'VOID');
    assert.equal((await tests.entry(higherInput.id)).amountMicros, '3000000');
    const [settlement] = await runner.query(
      'SELECT "actualMicroUsd" FROM core."otogrowAiSpend" WHERE id=$1',
      [original.spend.id],
    );
    assert.equal(
      settlement.actualMicroUsd,
      '2000000',
      'Financial replacement cannot rewrite the AI settlement or its budget exposure.',
    );

    const staleSource = await tests.correctionInput(
      original.spend.id,
      original.event.id,
    );
    await tests.late(original.spend.id, '4000000');
    await denied(() => tests.prepare(staleSource), [409]);
    const reviewedOriginal = await tests.correctionInput(
      original.spend.id,
      original.event.id,
    );
    await denied(
      () =>
        tests.prepare({
          ...reviewedOriginal,
          expectedClaimRevision: reviewedOriginal.expectedClaimRevision - 1,
        }),
      [409],
    );
    await denied(
      () =>
        tests.prepare({
          ...reviewedOriginal,
          expectedReplacedEntryRevision:
            reviewedOriginal.expectedReplacedEntryRevision - 1,
        }),
      [409],
    );
    await denied(
      () =>
        tests.prepare({
          ...reviewedOriginal,
          acknowledgeSourceWarnings: false,
        }),
      [400, 409],
    );
    await tests.prepare(reviewedOriginal);
    const beforeNewEvidencePost = await tests.postInput(reviewedOriginal.id);
    await tests.late(original.spend.id, '5000000');
    await denied(() => tests.post(beforeNewEvidencePost), [409]);
    await denied(
      async () =>
        tests.post(
          await tests.postInput(reviewedOriginal.id, {
            acknowledgeSourceWarnings: false,
          }),
        ),
      [400, 409],
    );
    await services.finance.voidEntry(...tests.argumentsFor(), {
      id: reviewedOriginal.id,
      revision: 1,
      reason: 'Keep the reviewed USD3 cost while preserving later evidence.',
    });
    assert.equal((await tests.entry(higherInput.id)).status, 'POSTED');

    for (const seeded of [zero, micro]) {
      const allocations = [
        { projectId: null, amountMicros: seeded.spend.actualMicroUsd },
      ];
      const input = await tests.prepareInput(seeded.spend.id, seeded.event.id, {
        allocations: seeded.spend.actualMicroUsd === '0' ? [] : allocations,
      });
      await tests.prepare(input);
      if (seeded.spend.actualMicroUsd === '0') {
        await denied(
          async () => tests.post(await tests.postInput(input.id)),
          [400],
        );
        const draft = await tests.entry(input.id);
        await services.finance.saveEntry(...tests.argumentsFor(), {
          id: draft.id,
          revision: draft.revision,
          month: draft.month,
          kind: draft.kind,
          category: draft.category,
          title: draft.title,
          currency: draft.currency,
          amountMicros: draft.amountMicros,
          note: draft.note,
          evidenceUrl: null,
          allocations,
        });
      }
      await tests.post(await tests.postInput(input.id));
      assert.equal(
        (await tests.entry(input.id)).amountMicros,
        seeded.spend.actualMicroUsd,
      );
    }
    const uncertain = unknowns.find(
      (value) => value.spend.state === 'UNCERTAIN',
    );
    await denied(
      () =>
        services.aiBudget.reconcile(...tests.argumentsFor(), {
          spendId: uncertain.spend.id,
          revision: 2,
          actualUsd: '0.000001',
          evidenceReference: PRIVATE_MARKER,
          reason: PRIVATE_MARKER,
        }),
      [403],
    );
    await services.aiBudget.reconcile(...tests.argumentsFor(people.admin), {
      spendId: uncertain.spend.id,
      revision: 2,
      actualUsd: '0.000001',
      evidenceReference: PRIVATE_MARKER,
      reason: PRIVATE_MARKER,
    });
    const manuallySettled = await tests.selected(uncertain.spend.id);
    assert.equal(manuallySettled.settledAmountMicros, '1');
    assert(
      !JSON.stringify(manuallySettled).includes(PRIVATE_MARKER),
      'Private administrator evidence/reason must remain outside the finance projection.',
    );
    assert(
      manuallySettled.evidenceOptions.some(
        (option) => option.amountMicros === '1',
      ),
    );
    const manualEvidence = manuallySettled.evidenceOptions.find(
      (option) => option.basis === 'MANUAL_EVIDENCE',
    );
    assert(manualEvidence);
    const manualInput = await tests.prepareInput(
      uncertain.spend.id,
      manualEvidence.id,
      { allocations: [{ projectId: null, amountMicros: '1' }] },
    );
    await tests.prepare(manualInput);
    await tests.post(await tests.postInput(manualInput.id));
    assert.equal(
      (await tests.entry(manualInput.id)).sourceAiSpend.basis,
      'MANUAL_EVIDENCE',
    );
    const unavailableProject = await seedSpend(runner.manager, fixture, {
      projectId: randomUUID(),
      actualMicroUsd: '10000',
    });
    const orphan = await tests.selected(unavailableProject.spend.id);
    assert(orphan.sourceWarnings.length > 0);
    const orphanInput = await tests.prepareInput(
      unavailableProject.spend.id,
      unavailableProject.event.id,
      { allocations: [{ projectId: null, amountMicros: '10000' }] },
    );
    await denied(
      () => tests.prepare({ ...orphanInput, acknowledgeSourceWarnings: false }),
      [400, 409],
    );
    await tests.prepare(orphanInput);
    await tests.post(await tests.postInput(orphanInput.id));

    const { spend: pageSpend, event: pageOriginal } = await seedSpend(
      runner.manager,
      fixture,
      { actualMicroUsd: '1' },
    );
    await runner.query(
      'INSERT INTO core."otogrowAiSpendEvent" ("workspaceId","spendId",action,"before","after") SELECT $1,$2,\'LATE_PROVIDER_USAGE\',\'{}\'::jsonb,jsonb_build_object(\'reportedActualMicroUsd\',sequence::text,\'providerPayload\',$3::text) FROM generate_series(1,55) sequence',
      [workspaceId, pageSpend.id, PRIVATE_MARKER],
    );
    await runner.query(
      'INSERT INTO core."otogrowAiSpendEvent" ("workspaceId","spendId",action,"before","after") VALUES ($1,$2,\'LATE_PROVIDER_USAGE\',\'{}\'::jsonb,$3::jsonb)',
      [
        workspaceId,
        pageSpend.id,
        JSON.stringify({
          reportedActualMicroUsd: 'NaN',
          privatePayload: PRIVATE_MARKER,
        }),
      ],
    );
    const firstEvidence = await tests.read({ selectedSpendId: pageSpend.id });
    assert(firstEvidence.selectedSource.nextEvidenceId);
    const secondEvidence = await tests.read({
      selectedSpendId: pageSpend.id,
      afterEvidenceId: firstEvidence.selectedSource.nextEvidenceId,
    });
    assert.equal(secondEvidence.selectedSource.nextEvidenceId, null);
    const evidenceRows = [
      ...firstEvidence.selectedSource.evidenceOptions,
      ...secondEvidence.selectedSource.evidenceOptions,
    ];
    assert.equal(evidenceRows.length, 56);
    assert.equal(new Set(evidenceRows.map((row) => row.id)).size, 56);
    assert(evidenceRows.some((row) => row.id === pageOriginal.id));
    assert(!JSON.stringify(evidenceRows).includes(PRIVATE_MARKER));
    assert.equal(
      firstEvidence.selectedSource.sourceReviewToken,
      secondEvidence.selectedSource.sourceReviewToken,
    );
    assert(secondEvidence.selectedSource.evidenceOptions.length > 0);
    const laterPageEvidence = secondEvidence.selectedSource.evidenceOptions[0];
    const pageInput = {
      ...prepare,
      id: randomUUID(),
      spendId: pageSpend.id,
      evidenceEventId: laterPageEvidence.id,
      expectedSourceReviewToken:
        secondEvidence.selectedSource.sourceReviewToken,
      expectedClaimRevision: secondEvidence.selectedSource.claim.revision,
      allocations: [
        { projectId: null, amountMicros: laterPageEvidence.amountMicros },
      ],
    };
    await tests.prepare(pageInput);
    await tests.post(await tests.postInput(pageInput.id));
    assert.equal(
      (await tests.entry(pageInput.id)).amountMicros,
      laterPageEvidence.amountMicros,
    );
    await denied(
      () =>
        tests.read({
          selectedSpendId: original.spend.id,
          afterEvidenceId: pageOriginal.id,
        }),
      [400],
    );
    await denied(() => tests.read({ afterEvidenceId: pageOriginal.id }), [400]);
    for (let index = 0; index < 51; index++)
      await seedSpend(runner.manager, fixture, { actualMicroUsd: '1' });
    const firstSourcePage = await tests.read();
    assert.equal(firstSourcePage.sources.length, 50);
    assert(firstSourcePage.nextSpendId);
    const secondSourcePage = await tests.read({
      afterSpendId: firstSourcePage.nextSpendId,
    });
    assert.equal(secondSourcePage.nextSpendId, null);
    const allSourceIds = [
      ...firstSourcePage.sources,
      ...secondSourcePage.sources,
    ].map((row) => row.id);
    assert.equal(new Set(allSourceIds).size, allSourceIds.length);
    assert(allSourceIds.includes(original.spend.id));
    const offPageId = firstSourcePage.sources[0].id;
    const deepSource = await tests.read({
      afterSpendId: firstSourcePage.nextSpendId,
      selectedSpendId: offPageId,
    });
    assert(!deepSource.sources.some((row) => row.id === offPageId));
    assert.equal(deepSource.selectedSource.id, offPageId);
    await denied(() => tests.read({ afterSpendId: foreign.spend.id }), [400]);

    const beforeRead = await tests.fingerprint();
    for (const filter of ['ALL', 'UNRECOGNIZED', 'RECOGNIZED', 'NEEDS_REVIEW'])
      assert(
        !JSON.stringify(await tests.read({ filter })).includes(PRIVATE_MARKER),
      );
    await tests.read({ selectedSpendId: original.spend.id });
    const safeMonthly = await services.finance.snapshot(
      ...tests.argumentsFor(people.reader),
      { month: MONTH, selectedEntryId: higherInput.id },
    );
    assert(safeMonthly.selectedEntry?.sourceAiSpend);
    assert(!('requestHash' in safeMonthly.selectedEntry.sourceAiSpend));
    assert(!JSON.stringify(safeMonthly).includes(PRIVATE_MARKER));
    assert.deepEqual(
      await tests.fingerprint(),
      beforeRead,
      'Finance source/history reads must not write.',
    );
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.writer.userId,
    ]);
    await denied(() => tests.read({}, people.writer), [403]);
    await denied(() => tests.prepare(higherInput), [403]);
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      people.writer.userId,
    ]);
    await runner.query(
      'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1 AND "workspaceMemberId"=$2',
      [workspaceId, people.writer.memberId],
    );
    await denied(() => tests.prepare(higherInput), [403]);
    console.log(
      'PASS rollback-only AI finance: safe finance-role projection, exact zero/sub-cent recognized amounts, original/manual/late evidence, conserved claims/retries, lower/higher pending corrections, atomic post/match reversals, unchanged cash/invoices/AI settlement, current identity/revocation and read-only queries. No providers, budgets enabled or persisted fixtures.',
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
  PRIVATE_MARKER,
  TABLES,
  createAiFixture,
  cleanupAiFixture,
  buildAiServices,
  seedSpend,
  aiHarness,
};

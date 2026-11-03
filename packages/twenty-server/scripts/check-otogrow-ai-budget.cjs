const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  checkAtlasMediaBudget,
} = require('./helpers/check-atlas-media-budget.cjs');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  OtogrowAiBudgetService,
} = require('../dist/modules/otogrow-ai-budget/otogrow-ai-budget.service');
const {
  DeliveryProjectEntity,
} = require('../dist/modules/delivery/entities/delivery-project.entity');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');
const {
  OtogrowAiSpendEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity');
const {
  OtogrowAiPriceEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-price.entity');
const {
  OtogrowAiBudgetEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-budget.entity');
const {
  OtogrowAiSpendEventEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-spend-event.entity');

async function main() {
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
    const [existing] = await runner.query(
      `SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(existing);
    const createWorkspace = async () => {
      const id = randomUUID(),
        databaseSchema = `budget_fixture_${id.replaceAll('-', '_')}`;
      await runner.query(`CREATE SCHEMA "${databaseSchema}"`);
      await runner.query(
        `CREATE TABLE "${databaseSchema}"."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"userEmail" text,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
      );
      await runner.query(
        `CREATE TABLE "${databaseSchema}".company (id uuid PRIMARY KEY,name text,"deletedAt" timestamptz)`,
      );
      await runner.query(
        `CREATE TABLE "${databaseSchema}".task (id uuid PRIMARY KEY,title text,"deletedAt" timestamptz)`,
      );
      const [workspace] = await runner.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,'Budget rollback fixture',$2,$3,'ACTIVE',$4,$5) RETURNING *`,
        [
          id,
          `budget-fixture-${id}`,
          databaseSchema,
          existing.workspaceCustomApplicationId,
          existing.defaultRoleId,
        ],
      );
      return workspace;
    };
    const member = async (workspace) => {
      const id = randomUUID(),
        userId = randomUUID();
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        userId,
        `${userId}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [id, userId, workspace.id],
      );
      await runner.query(
        `INSERT INTO "${workspace.databaseSchema}"."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,'Budget','fixture')`,
        [id, userId, `${userId}@example.invalid`],
      );
      return { id, userId };
    };
    const workspace = await createWorkspace(),
      foreign = await createWorkspace();
    const founder = await member(workspace),
      editor = await member(workspace),
      outsider = await member(foreign);
    const admins = new Set([founder.id, outsider.id]);
    let failAfterWrite = false;
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) =>
        runner.manager.transaction(async (manager) => {
          const result = await callback(manager);
          if (failAfterWrite) {
            failAfterWrite = false;
            throw new Error('Synthetic atomicity failure');
          }
          return result;
        }),
    };
    const access = new OtogrowAccessService(scoped, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        admins.has(userWorkspaceId),
    });
    const service = new OtogrowAiBudgetService(scoped, access);
    const clientId = randomUUID(),
      taskId = randomUUID();
    await runner.query(
      `INSERT INTO "${workspace.databaseSchema}".company (id,name) VALUES ($1,'Budget client')`,
      [clientId],
    );
    await runner.query(
      `INSERT INTO "${workspace.databaseSchema}".task (id,title) VALUES ($1,'Budget task')`,
      [taskId],
    );
    const project = await runner.manager
      .getRepository(DeliveryProjectEntity)
      .save({
        workspaceId: workspace.id,
        name: 'Budget project',
        companyId: clientId,
        memberIds: [editor.id],
      });
    await runner.manager.getRepository(DeliveryTaskEntity).save({
      workspaceId: workspace.id,
      taskId,
      projectId: project.id,
      details: {},
      revision: 1,
    });
    const snapshot = (input = {}, actor = founder, target = workspace) =>
      service.snapshot(target, actor.id, actor.id, input);
    const saveBudget = (input, actor = founder) =>
      service.saveBudget(workspace, actor.id, actor.id, input);
    const savePrice = (input, actor = founder) =>
      service.savePrice(workspace, actor.id, actor.id, input);
    const reconcile = (input, actor = founder) =>
      service.reconcile(workspace, actor.id, actor.id, input);
    const allRows = async () => ({
      policies: await runner.manager
        .getRepository(OtogrowAiBudgetEntity)
        .find(),
      prices: await runner.manager.getRepository(OtogrowAiPriceEntity).find(),
      spend: await runner.manager.getRepository(OtogrowAiSpendEntity).find(),
      events: await runner.manager
        .getRepository(OtogrowAiSpendEventEntity)
        .find(),
    });
    const denied = async (operation) => {
      const before = await allRows();
      await assert.rejects(operation);
      assert.deepEqual(await allRows(), before);
    };
    const source = (request) => ({
      workspaceId: request.workspaceId,
      sourceKind: request.sourceKind,
      sourceRunId: request.sourceRunId,
    });
    const request = (overrides = {}) => ({
      workspaceId: workspace.id,
      actorId: editor.id,
      sourceKind: 'TASK_AGENT',
      sourceRunId: randomUUID(),
      projectId: project.id,
      taskId,
      modelId: 'fixture-model',
      kind: 'TEXT',
      maxOutputTokens: 1000,
      ...overrides,
    });
    const reserve = (input) =>
      scoped.transaction((manager) => service.reserve(manager, input));
    const stop = (input, cancel = false) =>
      scoped.transaction((manager) =>
        service.stop(manager, source(input), cancel),
      );
    const getSpend = (id) =>
      runner.manager
        .getRepository(OtogrowAiSpendEntity)
        .findOneByOrFail({ id });
    const prices = {
      modelId: 'fixture-model',
      kind: 'TEXT',
      revision: 0,
      enabled: true,
      source: 'Synthetic rollback tariff only',
      verifiedAt: '2026-01-01T00:00:00.000Z',
      pricing: {
        inputUsdPerMillionTokens: '1',
        outputUsdPerMillionTokens: '2',
        reasoningUsdPerMillionTokens: '2',
        cacheReadUsdPerMillionTokens: '1',
        cacheWriteUsdPerMillionTokens: '1',
        maxInputTokens: 1000,
        maxOutputTokens: 1000,
        maxReasoningTokens: 0,
        outputIncludesReasoning: true,
        longContextThresholdTokens: null,
        longInputUsdPerMillionTokens: null,
        longOutputUsdPerMillionTokens: null,
        longReasoningUsdPerMillionTokens: null,
        longCacheReadUsdPerMillionTokens: null,
        longCacheWriteUsdPerMillionTokens: null,
      },
    };
    const initial = await snapshot();
    assert.equal(initial.configured, false);
    assert.equal(initial.chargedUsd, '0.000000');
    assert.equal(initial.coverageStartedAt, null);
    assert.equal((await allRows()).policies.length, 0);
    await denied(() => snapshot({}, editor));
    await denied(() => snapshot({}, outsider));
    await denied(() => service.snapshot(workspace, founder.id, editor.id, {}));
    await denied(() => reserve(request()));
    await denied(() => savePrice(prices, editor));
    await denied(() => savePrice({ ...prices, kind: 'IMAGE' }));
    await denied(() => savePrice({ ...prices, kind: 'CLIP' }));
    await savePrice(prices);
    await denied(() => reserve(request()));
    await denied(() =>
      saveBudget({
        scope: 'WORKSPACE',
        scopeId: workspace.id,
        revision: 0,
        enabled: true,
        capUsd: '0.01',
        confirmOpeningBalance: false,
      }),
    );
    const workspacePolicy = {
      scope: 'WORKSPACE',
      scopeId: workspace.id,
      revision: 0,
      enabled: true,
      capUsd: '0.01',
      openingSpentUsd: '0.001',
      confirmOpeningBalance: true,
    };
    await saveBudget(workspacePolicy);
    assert.equal((await snapshot()).chargedUsd, '0.001000');
    await denied(() =>
      saveBudget({ ...workspacePolicy, revision: 1, openingSpentUsd: '0' }),
    );
    await denied(() => saveBudget({ ...workspacePolicy, scopeId: foreign.id }));
    await denied(() =>
      saveBudget({
        ...workspacePolicy,
        scope: 'CLIENT',
        scopeId: randomUUID(),
      }),
    );
    const quote = await scoped.transaction((manager) =>
      service.quote(manager, request()),
    );
    assert.equal(quote.maximumCostUsd, '0.003000');
    assert.equal(quote.budgetReady, true);
    const first = request();
    const firstSpend = await reserve(first);
    assert.equal((await reserve(first)).id, firstSpend.id);
    assert.equal((await snapshot()).heldUsd, '0.003000');
    const second = request({ sourceKind: 'INBOX_DRAFT', taskId: null });
    const secondSpend = await reserve(second);
    const third = request({ sourceKind: 'MEDIA', kind: 'TEXT' });
    await reserve(third);
    await denied(() => reserve(request()));
    await stop(third, true);
    assert.equal((await snapshot()).heldUsd, '0.006000');
    assert.equal((await getSpend(firstSpend.id)).state, 'RESERVED');
    await service.dispatch(source(first), editor.id, async () => {});
    await denied(() =>
      service.dispatch(source(first), editor.id, async () => {}),
    );
    await stop(first, true);
    assert.equal((await getSpend(firstSpend.id)).state, 'DISPATCHED');
    await denied(() =>
      reconcile({
        spendId: firstSpend.id,
        revision: 2,
        actualUsd: '0',
        evidenceReference: 'Provider invoice',
        reason: 'Confirmed no charge',
      }),
    );
    await service.settle(source(first), {
      inputTokens: 100,
      outputTokens: 100,
    });
    assert.equal((await getSpend(firstSpend.id)).actualMicroUsd, '300');
    assert.equal((await snapshot()).chargedUsd, '0.001300');
    await service.settle(source(first), {
      inputTokens: 100,
      outputTokens: 100,
    });
    assert.equal((await getSpend(firstSpend.id)).actualMicroUsd, '300');
    await denied(() =>
      reconcile({
        spendId: firstSpend.id,
        revision: 3,
        actualUsd: '0',
        evidenceReference: 'Provider invoice',
        reason: 'Do not overwrite settled actuals',
      }),
    );
    await service.dispatch(source(second), editor.id, async () => {});
    await service.fail(source(second));
    let uncertain = await getSpend(secondSpend.id);
    assert.equal(uncertain.state, 'UNCERTAIN');
    assert.equal((await snapshot()).heldUsd, '0.003000');
    await denied(() =>
      reconcile({
        spendId: uncertain.id,
        revision: uncertain.revision,
        actualUsd: '0.0002',
        evidenceReference: '',
        reason: 'Missing evidence',
      }),
    );
    await denied(() =>
      reconcile({
        spendId: uncertain.id,
        revision: uncertain.revision - 1,
        actualUsd: '0.0002',
        evidenceReference: 'Invoice #1',
        reason: 'Verified provider usage',
      }),
    );
    await reconcile({
      spendId: uncertain.id,
      revision: uncertain.revision,
      actualUsd: '0.0002',
      evidenceReference: 'Invoice #1',
      reason: 'Verified provider usage',
    });
    assert.equal((await snapshot()).heldUsd, '0.000000');
    assert.equal((await getSpend(secondSpend.id)).reservedMicroUsd, '3000');
    const events = await runner.manager
      .getRepository(OtogrowAiSpendEventEntity)
      .findBy({ spendId: secondSpend.id });
    const adjustment = events.find(
      (event) => event.action === 'MANUALLY_RECONCILED',
    );
    assert.equal(adjustment.before.state, 'UNCERTAIN');
    assert.equal(adjustment.before.reservedMicroUsd, '3000');
    assert.equal(adjustment.after.actualMicroUsd, '200');
    assert.equal(adjustment.evidenceReference, 'Invoice #1');
    // Optional subcaps restrict new spending; removing them is not an exposed reset path.
    await saveBudget({
      scope: 'CLIENT',
      scopeId: clientId,
      revision: 0,
      enabled: false,
      capUsd: '1',
      openingSpentUsd: '0',
      confirmOpeningBalance: true,
    });
    await denied(() => reserve(request()));
    await saveBudget({
      scope: 'CLIENT',
      scopeId: clientId,
      revision: 1,
      enabled: true,
      capUsd: '0.003',
      confirmOpeningBalance: false,
    });
    await denied(() => reserve(request()));
    await saveBudget({
      scope: 'CLIENT',
      scopeId: clientId,
      revision: 2,
      enabled: true,
      capUsd: '1',
      confirmOpeningBalance: false,
    });
    await saveBudget({
      scope: 'TASK',
      scopeId: taskId,
      revision: 0,
      enabled: true,
      capUsd: '0.003',
      openingSpentUsd: '0',
      confirmOpeningBalance: true,
    });
    await denied(() => reserve(request()));
    await saveBudget({
      scope: 'TASK',
      scopeId: taskId,
      revision: 1,
      enabled: true,
      capUsd: '1',
      confirmOpeningBalance: false,
    });
    const stale = request();
    await reserve(stale);
    const profile = (await snapshot()).priceProfiles[0];
    await savePrice({ ...prices, id: profile.id, revision: profile.revision });
    await denied(() => reserve(request({ pricingRevision: profile.revision })));
    await denied(() =>
      service.dispatch(source(stale), editor.id, async () => {}),
    );
    await stop(stale);
    assert.equal((await snapshot()).heldUsd, '0.000000');
    const inactive = request();
    await reserve(inactive);
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [editor.id],
    );
    await denied(() =>
      service.dispatch(source(inactive), editor.id, async () => {}),
    );
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
      [editor.id],
    );
    await stop(inactive);
    const overflow = request();
    const overflowSpend = await reserve(overflow);
    await service.dispatch(source(overflow), editor.id, async () => {});
    await service.settle(source(overflow), {
      inputTokens: 10000,
      outputTokens: 10000,
    });
    assert.equal((await getSpend(overflowSpend.id)).actualMicroUsd, '30000');
    assert((await getSpend(overflowSpend.id)).attentionReason);
    await denied(() => reserve(request()));
    await saveBudget({ ...workspacePolicy, revision: 1, capUsd: '1' });
    failAfterWrite = true;
    await denied(() => reserve(request()));
    const incomplete = request();
    const incompleteSpend = await reserve(incomplete);
    await service.dispatch(source(incomplete), editor.id, async () => {});
    await service.settle(source(incomplete), null);
    assert.equal((await getSpend(incompleteSpend.id)).state, 'UNCERTAIN');
    assert(
      (await snapshot({ needsAttention: true })).recentSpend.some(
        (item) => item.id === incompleteSpend.id,
      ),
    );
    const unknown = await getSpend(incompleteSpend.id);
    await reconcile({
      spendId: unknown.id,
      revision: unknown.revision,
      actualUsd: '0',
      evidenceReference: 'Provider preliminary invoice',
      reason: 'Evidence reviewed after the failed run',
    });
    const beforeLate = await snapshot();
    await service.settle(source(incomplete), {
      inputTokens: 10000,
      outputTokens: 100,
    });
    assert.equal(
      (await getSpend(incompleteSpend.id)).actualMicroUsd,
      '0',
      'Late evidence must not overwrite the immutable settlement',
    );
    const afterLate = await snapshot();
    assert.equal(
      afterLate.recentSpend.find((item) => item.id === incompleteSpend.id)
        .reportedActualUsd,
      '0.010200',
    );
    assert(
      Number(afterLate.chargedUsd) > Number(beforeLate.chargedUsd),
      'Higher late usage must count against spending caps',
    );
    const beforeDuplicateEvidence = await allRows();
    await service.settle(source(incomplete), {
      inputTokens: 10000,
      outputTokens: 100,
    });
    assert.deepEqual(await allRows(), beforeDuplicateEvidence);
    assert(
      (await snapshot({ needsAttention: true })).recentSpend.some(
        (item) => item.id === incompleteSpend.id,
      ),
      'Late settled discrepancy must remain discoverable',
    );
    await snapshot({ cursor: null, limit: null, needsAttention: null });
    const page = await snapshot({ limit: 2 });
    assert(page.nextCursor);
    await denied(() =>
      snapshot({ cursor: page.nextCursor, needsAttention: true }),
    );
    await denied(() =>
      snapshot({ cursor: page.nextCursor }, outsider, foreign),
    );
    await denied(() => snapshot({ cursor: 'not a valid cursor' }));
    await denied(() => snapshot({ limit: 101 }));
    const seen = new Set(page.recentSpend.map((item) => item.id));
    let cursor = page.nextCursor;
    while (cursor) {
      const next = await snapshot({ limit: 2, cursor });
      for (const item of next.recentSpend) {
        assert(!seen.has(item.id));
        seen.add(item.id);
      }
      cursor = next.nextCursor;
    }
    assert.equal(seen.size, (await allRows()).spend.length);
    await checkAtlasMediaBudget({
      service,
      runner,
      workspace,
      actor: editor,
      project,
      taskId,
      allRows,
      denied,
    });
    const beforeRead = await allRows();
    await snapshot();
    assert.deepEqual(await allRows(), beforeRead);
    await runner.query(
      `DELETE FROM "${workspace.databaseSchema}".task WHERE id=$1`,
      [taskId],
    );
    await runner.query(
      `DELETE FROM "${workspace.databaseSchema}".company WHERE id=$1`,
      [clientId],
    );
    assert.equal((await snapshot()).recentSpend[0].taskName, 'Budget task');
    assert.equal((await snapshot()).recentSpend[0].clientName, 'Budget client');
    admins.delete(founder.id);
    await denied(() => snapshot());
    admins.add(founder.id);
    const serialized = JSON.stringify(await allRows());
    assert(!serialized.includes('apiKey'));
    assert(!serialized.includes('prompt'));
    assert(!serialized.includes('messageBody'));
    process.stdout.write(
      'OS AI budget rollback regression passed: scope caps, exact money, idempotency, reserved/dispatch/settle/uncertain/manual evidence, no reset, overrun, fresh authorization, atomicity and filtered pagination. No provider calls.\n',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
// Independent sessions require committed fixtures; only this sentinel workspace and its users/schema are removed.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const { ForbiddenException } = require('@nestjs/common');
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
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryProjectEntity,
} = require('../dist/modules/delivery/entities/delivery-project.entity');
const {
  OtogrowAiSpendEntity,
} = require('../dist/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity');

const WORKSPACE_ID = randomUUID();
const SCHEMA = `budget_concurrency_${WORKSPACE_ID.replaceAll('-', '_')}`;
const SENTINEL = `otogrow-budget-concurrency:${WORKSPACE_ID}`;
const MEMBERS = ['Founder', 'Editor'].map((name) => ({
  name,
  memberId: randomUUID(),
  userId: randomUUID(),
  userWorkspaceId: randomUUID(),
}));
const [FOUNDER, EDITOR] = MEMBERS;
const emailFor = (member) =>
  `${member.userId}+budget-concurrency@example.invalid`;
const MODEL_ID = `synthetic-budget-${WORKSPACE_ID}`;
const PRICING = {
  inputUsdPerMillionTokens: '1',
  outputUsdPerMillionTokens: '0',
  reasoningUsdPerMillionTokens: '0',
  cacheReadUsdPerMillionTokens: '1',
  cacheWriteUsdPerMillionTokens: '1',
  maxInputTokens: 500000,
  maxOutputTokens: 2048,
  maxReasoningTokens: 0,
  outputIncludesReasoning: true,
  longContextThresholdTokens: null,
  longInputUsdPerMillionTokens: null,
  longOutputUsdPerMillionTokens: null,
  longReasoningUsdPerMillionTokens: null,
  longCacheReadUsdPerMillionTokens: null,
  longCacheWriteUsdPerMillionTokens: null,
};
const usage = (inputTokens) => ({
  inputTokens,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const bounded = async (promise, label) => {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(label)), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert.match(SCHEMA, /^budget_concurrency_[a-f0-9_]{36}$/);
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${SENTINEL}:${index}`,
        },
      }),
  );
  let startBarrier = null;
  const commitHooks = [null, null];
  const gates = [];
  const pending = [];
  const gate = () => {
    const item = deferred();
    gates.push(item);
    return item;
  };
  const hold = () => {
    const entered = gate(),
      release = gate();
    return {
      entered,
      release,
      run: async () => {
        entered.resolve();
        await release.promise;
      },
    };
  };
  const scoped = sources.map((source, index) => ({
    manager: source.manager,
    query: (...args) => source.query(...args),
    getRepository: (entity) => source.getRepository(entity),
    transaction: (callback) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='4s'");
        await manager.query("SET LOCAL statement_timeout='10s'");
        const barrier = startBarrier;
        if (barrier) {
          barrier.arrivals.add(index);
          if (barrier.arrivals.size === 2) {
            startBarrier = null;
            barrier.ready.resolve();
          }
          await bounded(
            barrier.ready.promise,
            'Both budget sessions must reach the transaction barrier',
          );
        }
        const result = await callback(manager);
        const hook = commitHooks[index];
        commitHooks[index] = null;
        if (hook) await hook();
        return result;
      }),
  }));
  let founderAdminEnabled = true;
  const permissions = {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) =>
      founderAdminEnabled &&
      workspaceId === WORKSPACE_ID &&
      userWorkspaceId === FOUNDER.userWorkspaceId,
  };
  const access = scoped.map(
    (source) => new OtogrowAccessService(source, permissions),
  );
  const budgets = scoped.map(
    (source, index) => new OtogrowAiBudgetService(source, access[index]),
  );
  const deliveries = scoped.map(
    (source, index) =>
      new DeliveryService(
        source,
        access[index],
        createIsolatedNativeTaskAccess(),
      ),
  );
  const sourceOf = (spend) => ({
    workspaceId: WORKSPACE_ID,
    sourceKind: spend.sourceKind,
    sourceRunId: spend.sourceRunId,
  });
  let workspace;
  let committed = false;
  let complete = false;
  const snapshot = (index) =>
    budgets[index ?? 0].snapshot(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      { limit: 100 },
    );
  const spend = (request) =>
    sources[0].getRepository(OtogrowAiSpendEntity).findOneBy(sourceOf(request));
  const events = async (action, spendId) => {
    const rows = await connectionSource.query(
      'SELECT * FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 ORDER BY "createdAt",id',
      [WORKSPACE_ID],
    );
    return rows.filter(
      (row) =>
        (!action || row.action === action) &&
        (!spendId || row.spendId === spendId),
    );
  };
  const settlePromise = (promise) => {
    const safe = promise.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    );
    pending.push(safe);
    return safe;
  };
  const simultaneous = async (actions) => {
    startBarrier = { arrivals: new Set(), ready: gate() };
    return Promise.all(actions.map((action) => settlePromise(action())));
  };
  const oneWinner = (outcomes) => {
    const wins = outcomes.filter((item) => item.status === 'fulfilled'),
      losses = outcomes.filter((item) => item.status === 'rejected');
    assert.equal(wins.length, 1);
    assert.equal(losses.length, 1);
    return { winner: wins[0].value, loser: losses[0].reason };
  };
  const saveCap = async (scope, scopeId, capUsd, enabled = true, index = 0) => {
    const existing = (await snapshot(index)).budgets.find(
      (item) => item.scope === scope && item.scopeId === scopeId,
    );
    return budgets[index].saveBudget(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        scope,
        scopeId,
        capUsd,
        enabled,
        revision: existing?.revision ?? 0,
        confirmOpeningBalance: true,
        ...(!existing ? { openingSpentUsd: '0' } : {}),
      },
    );
  };
  const savePrice = async (index = 0, revision) => {
    const existing = (await snapshot(index)).priceProfiles.find(
      (item) => item.modelId === MODEL_ID,
    );
    return budgets[index].savePrice(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        ...(existing ? { id: existing.id } : {}),
        revision: revision ?? existing?.revision ?? 0,
        modelId: MODEL_ID,
        kind: 'TEXT',
        source: 'Synthetic concurrency regression, not a provider quote',
        verifiedAt: new Date(Date.now() - 1000).toISOString(),
        enabled: true,
        pricing: PRICING,
      },
    );
  };
  const request = (project, taskId, actor = FOUNDER) => ({
    workspaceId: WORKSPACE_ID,
    actorId: actor.memberId,
    sourceKind: 'TASK_AGENT',
    sourceRunId: randomUUID(),
    projectId: project.id,
    taskId,
    modelId: MODEL_ID,
    kind: 'TEXT',
    maxOutputTokens: 1,
  });
  const reserve = (index, input) =>
    scoped[index].transaction((manager) =>
      budgets[index].reserve(manager, input),
    );
  const release = (input) =>
    scoped[0].transaction((manager) =>
      budgets[0].stop(manager, sourceOf(input), true),
    );
  const dispatch = (
    index,
    input,
    actor = FOUNDER,
    authorize = async () => {},
  ) =>
    budgets[index].dispatch(sourceOf(input), actor.userWorkspaceId, authorize);
  const waitBlocked = async (pid) =>
    bounded(
      (async () => {
        while (true) {
          const [row] = await connectionSource.query(
            'SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1',
            [pid],
          );
          if (row?.wait_event_type === 'Lock' && row.wait_event === 'advisory')
            return;
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      })(),
      'Expected budget advisory lock wait',
    );
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    await connectionSource.transaction(async (manager) => {
      const [existing] = await manager.query(
        `SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"='ACTIVE' AND "deletedAt" IS NULL LIMIT 1`,
      );
      assert(existing);
      await manager.query(`CREATE SCHEMA "${SCHEMA}"`);
      await manager.query(`COMMENT ON SCHEMA "${SCHEMA}" IS '${SENTINEL}'`);
      await manager.query(
        `CREATE TABLE "${SCHEMA}"."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"userEmail" text,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
      );
      await manager.query(
        `CREATE TABLE "${SCHEMA}".company (id uuid PRIMARY KEY,name text,"deletedAt" timestamptz)`,
      );
      await manager.query(
        `CREATE TABLE "${SCHEMA}".task (id uuid PRIMARY KEY,title text,"assigneeId" uuid,"dueAt" timestamptz,status text,"deletedAt" timestamptz,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now())`,
      );
      [workspace] = await manager.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6) RETURNING *`,
        [
          WORKSPACE_ID,
          SENTINEL,
          `budget-race-${WORKSPACE_ID}`,
          SCHEMA,
          existing.workspaceCustomApplicationId,
          existing.defaultRoleId,
        ],
      );
      for (const member of MEMBERS) {
        await manager.query(
          'INSERT INTO core."user" (id,email) VALUES ($1,$2)',
          [member.userId, emailFor(member)],
        );
        await manager.query(
          'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
          [member.userWorkspaceId, member.userId, WORKSPACE_ID],
        );
        await manager.query(
          `INSERT INTO "${SCHEMA}"."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,$4,'fixture')`,
          [member.memberId, member.userId, emailFor(member), member.name],
        );
      }
    });
    committed = true;
    const [{ pid: secondPid }] = await sources[1].query(
      'SELECT pg_backend_pid() AS pid',
    );
    const clientIds = [randomUUID(), randomUUID()];
    for (const [index, id] of clientIds.entries())
      await sources[0].query(
        `INSERT INTO "${SCHEMA}".company (id,name) VALUES ($1,$2)`,
        [id, `Budget client ${index}`],
      );
    const taskFields = {
      title: 'Budget task',
      brief: 'Private budget fixture brief',
      service: 'SEO',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: EDITOR.memberId,
      reviewerId: FOUNDER.memberId,
      checklist: [],
      evidence: [],
    };
    const projects = [];
    const tasks = [];
    for (const [index, companyId] of clientIds.entries()) {
      const result = await deliveries[0].command(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          action: 'project',
          name: `Budget project ${index}`,
          companyId,
          memberIds: [EDITOR.memberId],
        },
      );
      projects.push(
        result.projects.find((item) => item.companyId === companyId),
      );
    }
    for (const project of [projects[0], projects[0], projects[1]]) {
      const title = `Budget task ${tasks.length}`;
      const result = await deliveries[0].command(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          action: 'create',
          projectId: project.id,
          fields: { ...taskFields, title },
        },
      );
      tasks.push(result.tasks.find((item) => item.title === title));
    }
    await saveCap('WORKSPACE', WORKSPACE_ID, '0.75');
    await savePrice();
    assert.equal((await snapshot()).recentSpend.length, 0);

    // Different clients cannot reserve against the same workspace balance simultaneously.
    let pair = [
      request(projects[0], tasks[0].id),
      { ...request(projects[1], null), sourceKind: 'INBOX_DRAFT' },
    ];
    let outcome = oneWinner(
      await simultaneous(pair.map((item, index) => () => reserve(index, item))),
    );
    assert.equal(outcome.loser.status, 400);
    assert.equal(outcome.winner.reservedMicroUsd, '500000');
    assert.equal((await snapshot()).heldUsd, '0.500000');
    assert.equal((await events('RESERVED')).length, 1);
    await release(outcome.winner);

    await saveCap('WORKSPACE', WORKSPACE_ID, '100');
    await saveCap('CLIENT', clientIds[0], '0.75');
    pair = [
      request(projects[0], tasks[0].id),
      { ...request(projects[0], null), sourceKind: 'INBOX_DRAFT' },
    ];
    outcome = oneWinner(
      await simultaneous(pair.map((item, index) => () => reserve(index, item))),
    );
    assert.equal(outcome.loser.status, 400);
    assert.match(outcome.loser.message, /Budget client 0/);
    await release(outcome.winner);

    await saveCap('CLIENT', clientIds[0], '100');
    await saveCap('TASK', tasks[0].id, '0.75');
    pair = [
      request(projects[0], tasks[0].id),
      { ...request(projects[0], tasks[0].id), sourceKind: 'MEDIA' },
    ];
    outcome = oneWinner(
      await simultaneous(pair.map((item, index) => () => reserve(index, item))),
    );
    assert.equal(outcome.loser.status, 400);
    assert.match(outcome.loser.message, /Budget task 0/);
    await release(outcome.winner);
    await saveCap('TASK', tasks[0].id, '100');

    pair = [
      request(projects[0], tasks[1].id),
      request(projects[1], tasks[2].id),
    ];
    const allowed = await simultaneous(
      pair.map((item, index) => () => reserve(index, item)),
    );
    assert(allowed.every((item) => item.status === 'fulfilled'));
    assert.equal((await snapshot()).heldUsd, '1.000000');
    for (const item of pair) await release(item);

    const duplicate = request(projects[0], tasks[0].id);
    const duplicates = await simultaneous([
      () => reserve(0, duplicate),
      () => reserve(1, duplicate),
    ]);
    assert(duplicates.every((item) => item.status === 'fulfilled'));
    assert.equal(duplicates[0].value.id, duplicates[1].value.id);
    assert.equal((await events('RESERVED', duplicates[0].value.id)).length, 1);
    await release(duplicate);

    // A source failure and its reservation roll back together.
    const rolledBack = request(projects[0], tasks[0].id);
    const beforeEvents = (await events()).length;
    await assert.rejects(
      scoped[0].transaction(async (manager) => {
        await budgets[0].reserve(manager, rolledBack);
        await manager.query(
          `UPDATE "${SCHEMA}".task SET title='Must roll back' WHERE id=$1`,
          [tasks[0].id],
        );
        throw new Error('Fixture source rollback');
      }),
      /Fixture source rollback/,
    );
    assert.equal(await spend(rolledBack), null);
    assert.equal((await events()).length, beforeEvents);
    assert.equal(
      (
        await sources[0].query(
          `SELECT title FROM "${SCHEMA}".task WHERE id=$1`,
          [tasks[0].id],
        )
      )[0].title,
      tasks[0].title,
    );

    const policy = (await snapshot()).budgets.find(
      (item) => item.scope === 'WORKSPACE',
    );
    const basePolicy = {
      scope: 'WORKSPACE',
      scopeId: WORKSPACE_ID,
      revision: policy.revision,
      enabled: true,
      confirmOpeningBalance: true,
    };
    const beforePolicyEvents = (await events('BUDGET_CONFIGURED')).length;
    outcome = oneWinner(
      await simultaneous(
        ['98', '99'].map(
          (capUsd, index) => () =>
            budgets[index].saveBudget(
              workspace,
              FOUNDER.memberId,
              FOUNDER.userWorkspaceId,
              { ...basePolicy, capUsd },
            ),
        ),
      ),
    );
    assert.equal(outcome.loser.status, 409);
    assert.equal(
      (await events('BUDGET_CONFIGURED')).length,
      beforePolicyEvents + 1,
    );
    const profile = (await snapshot()).priceProfiles[0];
    const priceInput = {
      id: profile.id,
      revision: profile.revision,
      modelId: MODEL_ID,
      kind: 'TEXT',
      source: profile.source,
      verifiedAt: profile.verifiedAt,
      enabled: true,
      pricing: PRICING,
    };
    const beforePriceEvents = (await events('PRICE_CONFIGURED')).length;
    outcome = oneWinner(
      await simultaneous(
        [0, 1].map(
          (index) => () =>
            budgets[index].savePrice(
              workspace,
              FOUNDER.memberId,
              FOUNDER.userWorkspaceId,
              priceInput,
            ),
        ),
      ),
    );
    assert.equal(outcome.loser.status, 409);
    assert.equal(
      (await events('PRICE_CONFIGURED')).length,
      beforePriceEvents + 1,
    );

    const stalePrice = request(projects[0], tasks[0].id);
    await reserve(0, stalePrice);
    await savePrice();
    await assert.rejects(dispatch(0, stalePrice), { status: 409 });
    assert.equal((await spend(stalePrice)).state, 'RESERVED');
    await release(stalePrice);

    const paused = request(projects[0], tasks[0].id);
    await reserve(0, paused);
    const pause = hold();
    const pausePolicy = (await snapshot()).budgets.find(
      (item) => item.scope === 'WORKSPACE',
    );
    commitHooks[0] = pause.run;
    const pausing = settlePromise(
      budgets[0].saveBudget(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          scope: 'WORKSPACE',
          scopeId: WORKSPACE_ID,
          revision: pausePolicy.revision,
          capUsd: pausePolicy.capUsd,
          enabled: false,
          confirmOpeningBalance: true,
        },
      ),
    );
    await bounded(pause.entered.promise, 'Budget pause did not start');
    const pausedDispatch = settlePromise(dispatch(1, paused));
    await waitBlocked(secondPid);
    pause.release.resolve();
    assert.equal((await pausing).status, 'fulfilled');
    assert.equal((await pausedDispatch).reason.status, 400);
    assert.equal((await spend(paused)).state, 'RESERVED');
    assert.equal(
      (await events('DISPATCHED', (await spend(paused)).id)).length,
      0,
    );
    await release(paused);
    await saveCap('WORKSPACE', WORKSPACE_ID, '100');

    const revoked = request(projects[1], tasks[2].id, EDITOR);
    await reserve(0, revoked);
    const revoke = hold();
    commitHooks[0] = revoke.run;
    const revoking = settlePromise(
      deliveries[0].command(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          action: 'project',
          id: projects[1].id,
          revision: projects[1].revision,
          name: projects[1].name,
          companyId: clientIds[1],
          memberIds: [],
        },
      ),
    );
    await bounded(revoke.entered.promise, 'Project revocation did not start');
    const denied = settlePromise(
      dispatch(1, revoked, EDITOR, async (manager) => {
        const actor = await deliveries[1].actor(
          workspace,
          EDITOR.memberId,
          EDITOR.userWorkspaceId,
          manager,
        );
        const project = await manager
          .getRepository(DeliveryProjectEntity)
          .findOneBy({ workspaceId: WORKSPACE_ID, id: projects[1].id });
        if (!actor.isManager && !project.memberIds.includes(EDITOR.memberId))
          throw new ForbiddenException('Revoked before provider dispatch');
      }),
    );
    await waitBlocked(secondPid);
    revoke.release.resolve();
    assert.equal((await revoking).status, 'fulfilled');
    assert.equal((await denied).reason.status, 403);
    assert.equal((await spend(revoked)).state, 'RESERVED');
    assert.equal(
      (await events('DISPATCHED', (await spend(revoked)).id)).length,
      0,
    );
    await release(revoked);

    const cancelled = request(projects[0], tasks[0].id);
    await reserve(0, cancelled);
    const cancel = hold();
    commitHooks[0] = cancel.run;
    const cancelling = settlePromise(release(cancelled));
    await bounded(cancel.entered.promise, 'Cancellation did not start');
    const afterCancel = settlePromise(dispatch(1, cancelled));
    await waitBlocked(secondPid);
    cancel.release.resolve();
    assert.equal((await cancelling).status, 'fulfilled');
    assert.equal((await afterCancel).reason.status, 409);
    assert.equal((await spend(cancelled)).state, 'RELEASED');

    await saveCap('WORKSPACE', WORKSPACE_ID, '0.75');
    const inFlight = request(projects[0], tasks[0].id);
    await reserve(0, inFlight);
    outcome = oneWinner(
      await simultaneous([
        () => dispatch(0, inFlight),
        () => dispatch(1, inFlight),
      ]),
    );
    assert.equal(outcome.loser.status, 409);
    await release(inFlight);
    assert.equal(
      (await spend(inFlight)).state,
      'DISPATCHED',
      'Cancellation after dispatch cannot release exposure',
    );
    await assert.rejects(reserve(0, request(projects[0], tasks[0].id)), {
      status: 400,
    });
    await budgets[0].settle(sourceOf(inFlight), usage(200000));
    assert.equal((await spend(inFlight)).actualMicroUsd, '200000');
    assert.equal((await snapshot()).heldUsd, '0.000000');
    await budgets[1].settle(sourceOf(inFlight), usage(200000));
    assert.equal(
      (await events('SETTLED', (await spend(inFlight)).id)).length,
      1,
    );

    const uncertain = request(projects[0], tasks[0].id);
    await reserve(0, uncertain);
    await dispatch(0, uncertain);
    await budgets[0].settle(sourceOf(uncertain), null);
    await budgets[1].fail(sourceOf(uncertain));
    assert.equal((await spend(uncertain)).state, 'UNCERTAIN');
    assert.equal((await snapshot()).heldUsd, '0.500000');
    await assert.rejects(reserve(1, request(projects[0], tasks[0].id)), {
      status: 400,
    });
    await budgets[1].settle(sourceOf(uncertain), usage(100000));
    assert.equal(
      (await spend(uncertain)).state,
      'SETTLED',
      'Late usage settles even if source result was failed/discarded',
    );
    assert.equal((await snapshot()).chargedUsd, '0.300000');

    await saveCap('WORKSPACE', WORKSPACE_ID, '0.85');
    const overshoot = request(projects[0], tasks[0].id);
    await reserve(0, overshoot);
    await dispatch(0, overshoot);
    await budgets[0].settle(sourceOf(overshoot), usage(1000000));
    assert.equal((await spend(overshoot)).actualMicroUsd, '1000000');
    assert.match((await spend(overshoot)).attentionReason, /exceeded/);
    assert.equal(
      (await snapshot()).budgets.find((item) => item.scope === 'WORKSPACE')
        .remainingUsd,
      '-0.450000',
    );
    await assert.rejects(reserve(1, request(projects[0], tasks[0].id)), {
      status: 400,
    });
    await saveCap('WORKSPACE', WORKSPACE_ID, '100');

    // Manual reconciliation cannot erase later higher provider evidence.
    const late = request(projects[0], tasks[0].id);
    await reserve(0, late);
    await dispatch(0, late);
    await budgets[0].fail(sourceOf(late));
    let lateSpend = await spend(late);
    await budgets[0].reconcile(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        spendId: lateSpend.id,
        revision: lateSpend.revision,
        actualUsd: '0',
        evidenceReference: 'Fixture provisional invoice',
        reason: 'Fixture delayed usage test',
      },
    );
    await budgets[1].settle(sourceOf(late), usage(400000));
    lateSpend = await spend(late);
    const lateSnapshot = await snapshot();
    assert.equal(
      lateSpend.actualMicroUsd,
      '0',
      'Preserve the original reconciliation evidence',
    );
    assert.equal(
      lateSnapshot.chargedUsd,
      '1.700000',
      'Higher late usage remains in budget exposure',
    );
    await budgets[0].settle(sourceOf(late), usage(400000));
    assert.equal(
      (await events('LATE_PROVIDER_USAGE', lateSpend.id)).length,
      1,
      'Repeated late evidence is idempotent',
    );

    const unknown = {
      ...request(projects[0], tasks[0].id),
      modelId: 'unknown-fixture-model',
    };
    await assert.rejects(reserve(0, unknown), { status: 400 });
    assert.equal(await spend(unknown), null);
    await assert.rejects(
      budgets[0].snapshot(
        workspace,
        EDITOR.memberId,
        EDITOR.userWorkspaceId,
        {},
      ),
      { status: 403 },
    );
    const publicSnapshot = JSON.stringify(await snapshot());
    for (const secret of [
      'Private budget fixture brief',
      'Fixture provisional invoice',
      'Fixture delayed usage test',
    ])
      assert(!publicSnapshot.includes(secret));
    // Paging is bounded in SQL, while exact aggregates include rows outside the visible page.
    const beforeDataset = await snapshot();
    const seed = await spend(late);
    const entries = Array.from({ length: 45 }, (_unused, index) => {
      const state = [
        'RESERVED',
        'DISPATCHED',
        'UNCERTAIN',
        'SETTLED',
        'RELEASED',
      ][index % 5];
      return {
        ...seed,
        id: randomUUID(),
        sourceRunId: randomUUID(),
        revision: 1,
        state,
        reservedMicroUsd: '101',
        actualMicroUsd:
          state === 'SETTLED'
            ? index === 3
              ? '9007199254740993'
              : '97'
            : null,
        usage: null,
        attentionReason:
          state === 'UNCERTAIN' || index === 3
            ? 'Synthetic attention fixture'
            : null,
        createdAt: new Date('2030-01-01T00:00:00.123Z'),
        updatedAt: new Date('2030-01-01T00:00:00.123Z'),
      };
    });
    await sources[0].getRepository(OtogrowAiSpendEntity).insert(entries);
    for (const [index, entry] of entries.entries())
      await sources[0].query(
        'UPDATE core."otogrowAiSpend" SET "createdAt"=$1::timestamptz WHERE id=$2 AND "workspaceId"=$3',
        [
          `2030-01-01T00:00:00.${123000 + Math.floor(index / 3)}Z`,
          entry.id,
          WORKSPACE_ID,
        ],
      );
    const extraCharged = entries.reduce(
      (total, entry) => total + BigInt(entry.actualMicroUsd ?? '0'),
      0n,
    );
    const extraHeld = entries.reduce(
      (total, entry) =>
        total +
        (['RESERVED', 'DISPATCHED', 'UNCERTAIN'].includes(entry.state)
          ? BigInt(entry.reservedMicroUsd)
          : 0n),
      0n,
    );
    const toMicro = (value) => BigInt(value.replace('.', ''));
    const fingerprint = async () =>
      (
        await sources[0].query(
          'SELECT md5(jsonb_agg(to_jsonb(record) ORDER BY id)::text) AS digest FROM core."otogrowAiSpend" record WHERE "workspaceId"=$1',
          [WORKSPACE_ID],
        )
      )[0].digest;
    const beforePaging = await fingerprint();
    const firstPage = await budgets[0].snapshot(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      { limit: 7 },
    );
    assert.equal(firstPage.recentSpend.length, 7);
    assert(firstPage.nextCursor);
    assert.match(
      JSON.parse(Buffer.from(firstPage.nextCursor, 'base64url').toString()).at,
      /\.\d{6}Z$/,
    );
    assert.equal(
      toMicro(firstPage.chargedUsd),
      toMicro(beforeDataset.chargedUsd) + extraCharged,
      'SQL totals retain micro-USD beyond JavaScript safe integer precision',
    );
    assert.equal(
      toMicro(firstPage.heldUsd),
      toMicro(beforeDataset.heldUsd) + extraHeld,
    );
    assert.equal(
      firstPage.unresolvedCount,
      beforeDataset.unresolvedCount +
        entries.filter((entry) => entry.attentionReason !== null).length,
    );
    for (const before of beforeDataset.budgets) {
      const after = firstPage.budgets.find((item) => item.id === before.id);
      const includesDataset =
        before.scope === 'WORKSPACE' ||
        (before.scope === 'CLIENT' && before.scopeId === clientIds[0]) ||
        (before.scope === 'TASK' && before.scopeId === tasks[0].id);
      assert.equal(
        toMicro(after.chargedUsd),
        toMicro(before.chargedUsd) + (includesDataset ? extraCharged : 0n),
      );
      assert.equal(
        toMicro(after.heldUsd),
        toMicro(before.heldUsd) + (includesDataset ? extraHeld : 0n),
      );
    }
    const expectedIds = (
      await sources[0].query(
        'SELECT id FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 ORDER BY "createdAt" DESC,id DESC',
        [WORKSPACE_ID],
      )
    ).map((item) => item.id);
    const seenIds = firstPage.recentSpend.map((item) => item.id);
    let cursor = firstPage.nextCursor;
    while (cursor) {
      const page = await budgets[1].snapshot(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        { limit: 7, cursor },
      );
      assert(page.recentSpend.length <= 7);
      seenIds.push(...page.recentSpend.map((item) => item.id));
      cursor = page.nextCursor;
    }
    assert.deepEqual(
      seenIds,
      expectedIds,
      'Equal timestamps and sub-millisecond timestamps neither skip nor duplicate rows',
    );
    const expectedAttention = (
      await sources[0].query(
        `SELECT id FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND (state='UNCERTAIN' OR "attentionReason" IS NOT NULL) ORDER BY "createdAt" DESC,id DESC`,
        [WORKSPACE_ID],
      )
    ).map((item) => item.id);
    const attentionIds = [];
    cursor = undefined;
    do {
      const page = await budgets[0].snapshot(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        { limit: 3, needsAttention: true, cursor },
      );
      attentionIds.push(...page.recentSpend.map((item) => item.id));
      assert.equal(page.unresolvedCount, expectedAttention.length);
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(attentionIds, expectedAttention);
    await assert.rejects(
      budgets[0].snapshot(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        { needsAttention: true, cursor: firstPage.nextCursor },
      ),
      { status: 400 },
    );
    await assert.rejects(
      budgets[0].snapshot(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        { limit: 101 },
      ),
      { status: 400 },
    );
    assert.equal(
      await fingerprint(),
      beforePaging,
      'Budget paging does not mutate ledger rows',
    );
    // Individual charge history exposes financial evidence without leaking provider/source payloads.
    const history = (input = {}, member = FOUNDER) =>
      budgets[0].spendHistory(
        workspace,
        member.memberId,
        member.userWorkspaceId,
        { spendId: lateSpend.id, ...input },
      );
    const actualHistory = await history();
    assert.equal(actualHistory.workspaceId, WORKSPACE_ID);
    assert.equal(actualHistory.memberId, FOUNDER.memberId);
    assert.equal(actualHistory.userWorkspaceId, FOUNDER.userWorkspaceId);
    assert.equal(actualHistory.sourceRunId, late.sourceRunId);
    assert.equal(actualHistory.modelId, MODEL_ID);
    assert.equal(actualHistory.events.length, 5);
    const manual = actualHistory.events.find(
      (event) => event.action === 'MANUALLY_RECONCILED',
    );
    assert.equal(manual.actorId, FOUNDER.memberId);
    assert.equal(manual.actorName, 'Founder fixture');
    assert.equal(manual.actorAttribution, 'ADMINISTRATOR');
    assert.equal(manual.evidenceReference, 'Fixture provisional invoice');
    assert.equal(manual.reason, 'Fixture delayed usage test');
    assert.equal(manual.before.state, 'UNCERTAIN');
    assert.equal(manual.after.actualUsd, '0.000000');
    const reported = actualHistory.events.find(
      (event) => event.action === 'LATE_PROVIDER_USAGE',
    );
    assert.equal(reported.actorAttribution, 'SYSTEM');
    assert.equal(reported.actorId, null);
    assert.equal(reported.after.reportedActualUsd, '0.400000');
    assert.equal(reported.after.actualUsd, '0.000000');
    const reserved = actualHistory.events.find(
      (event) => event.action === 'RESERVED',
    );
    assert.equal(reserved.actorAttribution, 'INITIATOR');
    assert.equal(reserved.actorId, FOUNDER.memberId);
    assert.equal(reserved.before.state, null);
    assert.equal(reserved.after.reservedUsd, '0.500000');
    for (const item of actualHistory.events.filter(
      (event) => event.action !== 'MANUALLY_RECONCILED',
    )) {
      assert.equal(item.evidenceReference, null);
      assert.equal(item.reason, null);
    }
    const secretMarker = `private-financial-history-${randomUUID()}`;
    for (let index = 0; index < 24; index++) {
      await sources[0].query(
        `INSERT INTO core."otogrowAiSpendEvent" (id,"workspaceId","spendId","actorId",action,"before","after","evidenceReference",reason,"createdAt") VALUES ($1,$2,$3,$4,'RESERVED',$5::jsonb,$6::jsonb,$7,$7,$8::timestamptz)`,
        [
          randomUUID(),
          WORKSPACE_ID,
          lateSpend.id,
          index === 0 ? randomUUID() : FOUNDER.memberId,
          JSON.stringify({
            state: 'RESERVED',
            revision: 1,
            reservedMicroUsd: '500000',
            prompt: secretMarker,
          }),
          JSON.stringify({
            state: 'DISPATCHED',
            revision: 2,
            reservedMicroUsd: '500000',
            rawError: secretMarker,
            accessToken: secretMarker,
            usage: { prompt: secretMarker },
          }),
          secretMarker,
          `2031-01-01T00:00:00.123${Math.floor(index / 3)
            .toString()
            .padStart(3, '0')}Z`,
        ],
      );
    }
    const historyFingerprint = async () =>
      (
        await sources[0].query(
          `SELECT md5(jsonb_agg(to_jsonb(event) ORDER BY id)::text) AS digest FROM core."otogrowAiSpendEvent" event WHERE "workspaceId"=$1`,
          [WORKSPACE_ID],
        )
      )[0].digest;
    const historyBefore = await historyFingerprint();
    const expectedHistory = (
      await sources[0].query(
        `SELECT id FROM core."otogrowAiSpendEvent" WHERE "workspaceId"=$1 AND "spendId"=$2 ORDER BY "createdAt" DESC,id DESC`,
        [WORKSPACE_ID, lateSpend.id],
      )
    ).map((event) => event.id);
    const seenEvents = [];
    let historyCursor;
    do {
      const page = await history({ limit: 4, cursor: historyCursor });
      assert(page.events.length <= 4);
      assert(!JSON.stringify(page).includes(secretMarker));
      seenEvents.push(...page.events.map((event) => event.id));
      historyCursor = page.nextCursor ?? undefined;
      if (historyCursor)
        assert.match(
          JSON.parse(Buffer.from(historyCursor, 'base64url').toString()).at,
          /\.\d{6}Z$/,
        );
    } while (historyCursor);
    assert.deepEqual(seenEvents, expectedHistory);
    const firstHistory = await history({ limit: 1 });
    assert(firstHistory.nextCursor);
    await assert.rejects(
      history({ cursor: firstHistory.nextCursor, spendId: entries[0].id }),
      { status: 400 },
    );
    await assert.rejects(history({ cursor: 'bad-cursor' }), { status: 400 });
    await assert.rejects(history({ limit: 101 }), { status: 400 });
    await assert.rejects(history({ spendId: randomUUID() }), { status: 404 });
    await assert.rejects(history({}, EDITOR), { status: 403 });
    await assert.rejects(
      history({}, { memberId: randomUUID(), userWorkspaceId: randomUUID() }),
      { status: 403 },
    );
    await assert.rejects(
      history(
        {},
        { memberId: FOUNDER.memberId, userWorkspaceId: EDITOR.userWorkspaceId },
      ),
      { status: 403 },
    );
    founderAdminEnabled = false;
    try {
      await assert.rejects(history({ cursor: firstHistory.nextCursor }), {
        status: 403,
      });
    } finally {
      founderAdminEnabled = true;
    }
    await sources[0].query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      FOUNDER.userId,
    ]);
    try {
      await assert.rejects(history({ cursor: firstHistory.nextCursor }), {
        status: 403,
      });
    } finally {
      await sources[0].query(
        'UPDATE core."user" SET disabled=false WHERE id=$1',
        [FOUNDER.userId],
      );
    }
    await sources[0].query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [FOUNDER.userWorkspaceId],
    );
    try {
      await assert.rejects(history(), { status: 403 });
    } finally {
      await sources[0].query(
        'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
        [FOUNDER.userWorkspaceId],
      );
    }
    const rollbackForeign = new Error(
      'Roll back only the temporary foreign-spend fixture',
    );
    await assert.rejects(
      sources[0].transaction(async (manager) => {
        const foreignWorkspaceId = randomUUID();
        await manager.query(
          `INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,$2,$3,'ACTIVE',$4,$5)`,
          [
            foreignWorkspaceId,
            `${SENTINEL}:foreign`,
            `budget-foreign-${foreignWorkspaceId}`,
            workspace.workspaceCustomApplicationId,
            workspace.defaultRoleId,
          ],
        );
        const foreignSpend = await manager
          .getRepository(OtogrowAiSpendEntity)
          .save({
            ...seed,
            id: randomUUID(),
            workspaceId: foreignWorkspaceId,
            sourceRunId: randomUUID(),
          });
        const temporary = {
          transaction: (callback) => manager.transaction(callback),
        };
        const temporaryService = new OtogrowAiBudgetService(
          temporary,
          access[0],
        );
        await assert.rejects(
          temporaryService.spendHistory(
            workspace,
            FOUNDER.memberId,
            FOUNDER.userWorkspaceId,
            { spendId: foreignSpend.id },
          ),
          { status: 404 },
        );
        throw rollbackForeign;
      }),
      (error) => error === rollbackForeign,
    );
    assert.equal(
      await historyFingerprint(),
      historyBefore,
      'History pages and rejected reads leave all financial events unchanged',
    );
    assert.equal(
      await fingerprint(),
      beforePaging,
      'History reads do not mutate charges',
    );
    complete = true;
  } finally {
    for (const item of gates) item.resolve();
    await Promise.allSettled(pending);
    try {
      if (committed) {
        await connectionSource.transaction(async (manager) => {
          const [saved] = await manager.query(
            'SELECT "displayName","databaseSchema" FROM core.workspace WHERE id=$1 FOR UPDATE',
            [WORKSPACE_ID],
          );
          const [schema] = await manager.query(
            "SELECT obj_description(oid,'pg_namespace') AS sentinel FROM pg_namespace WHERE nspname=$1",
            [SCHEMA],
          );
          assert.equal(saved?.displayName, SENTINEL);
          assert.equal(saved?.databaseSchema, SCHEMA);
          assert.equal(schema?.sentinel, SENTINEL);
          for (const member of MEMBERS) {
            const [user] = await manager.query(
              'SELECT email FROM core."user" WHERE id=$1',
              [member.userId],
            );
            assert.equal(user?.email, emailFor(member));
            const [{ outside }] = await manager.query(
              'SELECT count(*)::int AS outside FROM core."userWorkspace" WHERE "userId"=$1 AND "workspaceId"<>$2',
              [member.userId, WORKSPACE_ID],
            );
            assert.equal(outside, 0);
          }
          await manager.query(
            'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1',
            [WORKSPACE_ID],
          );
          await manager.query(
            'DELETE FROM core."userWorkspace" WHERE "workspaceId"=$1',
            [WORKSPACE_ID],
          );
          await manager.query(
            'DELETE FROM core.workspace WHERE id=$1 AND "displayName"=$2 AND "databaseSchema"=$3',
            [WORKSPACE_ID, SENTINEL, SCHEMA],
          );
          for (const member of MEMBERS)
            await manager.query(
              'DELETE FROM core."user" WHERE id=$1 AND email=$2',
              [member.userId, emailFor(member)],
            );
          await manager.query(`DROP SCHEMA "${SCHEMA}" CASCADE`);
        });
        assert.equal(
          (
            await connectionSource.query(
              'SELECT id FROM core.workspace WHERE id=$1',
              [WORKSPACE_ID],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await connectionSource.query(
              'SELECT id FROM core."otogrowAiSpend" WHERE "workspaceId"=$1',
              [WORKSPACE_ID],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await connectionSource.query(
              'SELECT nspname FROM pg_namespace WHERE nspname=$1',
              [SCHEMA],
            )
          ).length,
          0,
        );
      }
    } finally {
      await Promise.all(
        sources
          .filter((source) => source.isInitialized)
          .map((source) => source.destroy()),
      );
      if (connectionSource.isInitialized) await connectionSource.destroy();
    }
  }
  assert(complete);
  console.log(
    'PASS: independent PostgreSQL sessions enforce shared workspace/client/task caps, idempotent reservation and single dispatch, atomic source rollback, stale policy/price revisions, price changes, paused budget/project revocation/cancel races, retained post-dispatch holds, late settlement and overshoot/late evidence accounting, bounded keyset pages with microsecond ties and exact SQL totals, typed charge history/evidence projection and fresh admin/identity/foreign-scope denial. Exact disposable workspace/schema/users removed; no provider calls.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

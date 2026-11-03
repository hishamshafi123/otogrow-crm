const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const {
  DeliveryAgentEntity,
} = require('../dist/modules/delivery/entities/delivery-agent.entity');
const {
  DeliveryAgentRunEntity,
} = require('../dist/modules/delivery/entities/delivery-agent-run.entity');
const {
  OtogrowActivityAnalysisRunEntity,
} = require('../dist/modules/otogrow-activity/analysis/entities/otogrow-activity-analysis-run.entity');
const {
  DeliveryAdvertisingDraftRunEntity,
} = require('../dist/modules/delivery/advertising/drafts/entities/delivery-advertising-draft-run.entity');
const {
  countDeliveryAgentRunsForUtcDay,
} = require('../dist/modules/delivery/agents/count-delivery-agent-runs-for-utc-day');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const {
  activityAnalysisBody,
  activityAnalysisContextFingerprint,
} = require('../dist/modules/otogrow-activity/analysis/otogrow-activity-analysis.policy');
const {
  FROM,
  THROUGH,
  copy,
  deny,
  deferred,
  bounded,
  fingerprint,
  quote,
  originalDigest,
  configurationFor,
  appendEvent,
  seedActivityFixture,
  activityServices,
  mockRuntime,
  prepareInput,
  startInput,
  assertLegacyActivityCompatibility,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  proveCurrentWork,
} = require('./check-otogrow-activity-current-work-proof.cjs');

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Mock-only rollback proof; no live or browser mode.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Local database only.',
  );
  const originalFetch = global.fetch;
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error('Network is forbidden in activity-analysis acceptance.');
  };
  let runner;
  let baseline;
  let proof;
  try {
    await connectionSource.initialize();
    baseline = await originalDigest((...arguments_) =>
      connectionSource.query(...arguments_),
    );
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const originalQuery = runner.query.bind(runner);
    let reading = false;
    let light = false;
    let failActivity = false;
    let modelEnqueue = true;
    const enqueues = [];
    runner.query = async (...arguments_) => {
      const sql = arguments_[0];
      if (reading)
        assert(
          !/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|MERGE)\b/i.test(
            sql,
          ),
          'Read endpoint attempted a write.',
        );
      if (
        light &&
        /^\s*SELECT/i.test(sql) &&
        sql.includes('otogrowActivityAnalysisRun')
      )
        assert(
          !/"(?:context|input|configuration|result|usage)"\s+AS|SELECT\s+\*/i.test(
            sql,
          ),
          'Metadata endpoint hydrated private evidence.',
        );
      if (
        failActivity &&
        /^\s*INSERT/i.test(sql) &&
        sql.includes('otogrowActivityEvent')
      ) {
        failActivity = false;
        throw new Error('Synthetic analysis activity failure');
      }
      return originalQuery(...arguments_);
    };
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const [active] = await runner.query(
      "SELECT count(*)::integer AS count FROM core.\"otogrowActivityAnalysisRun\" WHERE status IN ('QUEUED','RUNNING')",
    );
    assert.equal(
      active.count,
      0,
      'Global recovery must not touch original active analyses.',
    );
    const fixture = await seedActivityFixture(runner.manager);
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (operation) => runner.manager.transaction(operation),
    };
    const runtime = mockRuntime();
    const repository = runner.manager.getRepository(
      OtogrowActivityAnalysisRunEntity,
    );
    const agents = runner.manager.getRepository(DeliveryAgentEntity);
    const queue = {
      add: async (name, input, options) => {
        assert.equal(name, 'otogrow-activity-analysis');
        assert.equal(options.id, `activity-analysis-${input.runId}`);
        assert(
          await repository.existsBy({
            id: input.runId,
            workspaceId: fixture.workspaceId,
          }),
        );
        if (!modelEnqueue) throw new Error('Synthetic queue unavailable');
        enqueues.push(input.runId);
      },
    };
    const services = activityServices(
      scoped,
      fixture,
      runtime.registryFor(fixture),
      queue,
    );
    await makeBudgetFixture(scoped, services.access, fixture.workspace, [
      { modelId: fixture.modelId, kind: 'TEXT' },
    ]);
    const person = fixture.people.admin;
    const call = (
      method,
      input,
      actor = person,
      workspace = fixture.workspace,
    ) =>
      services.analysis[method](
        workspace,
        actor.memberId,
        actor.userWorkspaceId,
        input,
      );
    const read = async (
      method,
      input,
      actor = person,
      metadataOnly = false,
    ) => {
      assert(!reading);
      reading = true;
      light = metadataOnly;
      try {
        return await call(method, input, actor);
      } finally {
        reading = false;
        light = false;
      }
    };
    const prepare = async (overrides = {}, actor = person) => {
      const input = prepareInput(fixture, overrides);
      const preview = await read('preview', input, actor);
      if (preview.context.citations.length)
        runtime.state.citation = preview.context.citations[0].id;
      return { input, preview, start: startInput(input, preview) };
    };
    const stored = (id) =>
      repository.findOneByOrFail({ workspaceId: fixture.workspaceId, id });
    const spend = async (id) =>
      (
        await runner.query(
          'SELECT * FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND "sourceKind"=\'ACTIVITY_ANALYSIS\' AND "sourceRunId"=$2',
          [fixture.workspaceId, id],
        )
      )[0];
    const moneyHash = async () =>
      fingerprint(
        await runner.query(
          'SELECT id,state,revision,"reservedMicroUsd","actualMicroUsd" FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 ORDER BY id',
          [fixture.workspaceId],
        ),
      );
    const runHash = async () =>
      fingerprint(
        await runner.query(
          'SELECT id,status,revision,"requestId","cancelRequestId" FROM core."otogrowActivityAnalysisRun" WHERE "workspaceId"=$1 ORDER BY id',
          [fixture.workspaceId],
        ),
      );
    const domainHash = async () =>
      fingerprint(
        await runner.query(
          'SELECT id,"projectId",revision,details FROM core."deliveryTask" WHERE "workspaceId"=$1 ORDER BY id',
          [fixture.workspaceId],
        ),
      );
    const originalDomain = await domainHash();
    const activityContext = await services.activity.context(
      fixture.workspace,
      person.memberId,
      person.userWorkspaceId,
    );
    const firstPage = await services.activity.page(
      fixture.workspace,
      person.memberId,
      person.userWorkspaceId,
      { filters: { from: FROM, through: THROUGH }, limit: 3 },
    );
    assert.equal(firstPage.scope, activityContext.scope);
    assert.equal(firstPage.events.length, 3);
    assert.equal(firstPage.totalCount, fixture.eventIds.length);
    const people = await services.activity.options(
      fixture.workspace,
      person.memberId,
      person.userWorkspaceId,
      { kind: 'PERSON', limit: 2 },
    );
    assert.equal(people.scope, activityContext.scope);

    const prepared = await prepare();
    const legacy = assertLegacyActivityCompatibility(
      prepared.preview,
      prepared.start,
      configurationFor(fixture),
    );
    assert.equal(legacy.bodyFingerprint, prepared.preview.bodyFingerprint);
    assert.equal(prepared.preview.context.totalCount, fixture.eventIds.length);
    assert.equal(
      prepared.preview.context.includedCount,
      fixture.eventIds.length,
    );
    assert.equal(prepared.preview.context.omittedCount, 0);
    assert.equal(
      prepared.preview.context.truncatedFieldCount,
      0,
      'Short ordinary fields must not claim truncation from JSON spacing.',
    );
    assert.equal(prepared.preview.canStart, true);
    assert.match(prepared.preview.context.capturedAt, /\.\d{6}Z$/);
    assert(
      prepared.preview.context.events.every((event) =>
        fixture.eventIds.includes(event.id),
      ),
    );
    assert(
      !JSON.stringify(prepared.preview.context).includes(
        'FOREIGN_ACTIVITY_MUST_NOT_LEAK',
      ),
    );
    assert(
      prepared.preview.context.events.some(
        (event) => event.actorType === 'AGENT',
      ),
    );
    assert(
      prepared.preview.context.events.some(
        (event) => event.actorType === 'SYSTEM',
      ),
    );
    assert(
      prepared.preview.context.limitations.some((value) =>
        /current.*unknown/i.test(value),
      ),
    );
    assert.equal(
      (
        await runner.query(
          'SELECT id FROM core."otogrowAiSpend" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      ).length,
      0,
      'Preview has no reservation.',
    );
    const affected = await prepare({
      filters: {
        from: FROM,
        through: THROUGH,
        personId: fixture.people.reader.memberId,
      },
    });
    assert.equal(affected.preview.context.includedCount, 1);
    assert.equal(
      affected.preview.context.events[0].subjectMemberId,
      fixture.people.reader.memberId,
    );
    assert.notEqual(
      affected.preview.context.events[0].actorId,
      fixture.people.reader.memberId,
    );
    await deny(
      () => read('preview', prepared.input, fixture.people.writer),
      [403],
    );
    await deny(
      () => read('preview', { ...prepared.input, filters: {} }),
      [400],
    );
    await deny(
      () =>
        read('preview', {
          ...prepared.input,
          filters: { from: THROUGH, through: FROM },
        }),
      [400],
    );
    const empty = await prepare({
      filters: {
        from: '1990-01-01T00:00:00.000Z',
        through: '1990-01-02T00:00:00.000Z',
      },
    });
    assert.equal(empty.preview.context.totalCount, 0);
    assert.equal(empty.preview.canStart, false);
    await deny(() => call('start', empty.start), [400]);

    const started = await call('start', prepared.start);
    assert.equal(started.run.status, 'QUEUED');
    assert.equal((await spend(started.run.id)).projectId, null);
    assert.equal((await spend(started.run.id)).taskId, null);
    assert.equal(
      (await spend(started.run.id)).clientId,
      null,
      'Company analysis is workspace overhead, never an invented client charge.',
    );
    assert.equal((await spend(started.run.id)).state, 'RESERVED');
    const beforeRetry = await moneyHash();
    assert.deepEqual(
      (await call('start', prepared.start)).receipt,
      started.receipt,
    );
    assert.deepEqual(
      (await call('start', { ...prepared.start, includeCurrentWork: false }))
        .receipt,
      started.receipt,
      'Old request recovery accepts explicit false without rewriting the immutable receipt.',
    );
    assert.equal(await moneyHash(), beforeRetry);
    await deny(
      () =>
        call('start', {
          ...prepared.start,
          question: 'Different body under this same identity.',
        }),
      [409],
    );
    await deny(
      () => call('start', { ...prepared.start, requestId: randomUUID() }),
      [409],
    );
    await deny(
      () => call('start', prepared.start, fixture.people.reader),
      [409],
    );
    assert.equal(
      (
        await read(
          'request',
          { requestId: prepared.start.requestId, action: 'STARTED' },
          fixture.people.reader,
          true,
        )
      ).receipt,
      null,
    );
    assert.deepEqual(
      (
        await read(
          'request',
          { requestId: prepared.start.requestId, action: 'STARTED' },
          person,
          true,
        )
      ).receipt,
      started.receipt,
    );
    await appendEvent(runner.manager, fixture, {
      summary:
        'FIXTURE appended after snapshot; must not silently replace earlier captured evidence.',
    });
    await services.analysis.execute(started.run.id);
    await services.analysis.execute(started.run.id);
    assert.equal(runtime.state.calls, 1);
    const successful = await stored(started.run.id);
    assert.equal(successful.status, 'SUCCEEDED');
    assert.equal(successful.context.includedCount, fixture.eventIds.length);
    assert.equal((await spend(successful.id)).state, 'SETTLED');
    assert(BigInt((await spend(successful.id)).actualMicroUsd) > 0n);
    const detail = await read('detail', { id: successful.id });
    assert(
      detail.result.summaryCitationIds.every((id) =>
        detail.context.citations.some((citation) => citation.id === id),
      ),
    );
    assert(
      detail.result.limitations.some((value) =>
        /current.*unknown/i.test(value),
      ),
    );
    assert(
      !JSON.stringify(
        await read('state', { id: successful.id }, person, true),
      ).includes('PRIVATE_ACTIVITY_CONFIGURATION'),
    );
    await deny(
      () => read('detail', { id: successful.id }, fixture.people.writer),
      [403],
    );
    await deny(
      () =>
        call('detail', { id: successful.id }, person, fixture.foreignWorkspace),
      [403, 404],
    );
    assert.equal(await domainHash(), originalDomain);
    const currentWorkProof = await proveCurrentWork({
      runner,
      fixture,
      runtime,
      queue,
      readOperation: async (operation) => {
        assert(!reading);
        reading = true;
        try {
          return await operation();
        } finally {
          reading = false;
        }
      },
    });
    assert.equal(
      await domainHash(),
      originalDomain,
      'Current-work proof savepoint leaves no task fixture behind.',
    );

    modelEnqueue = false;
    const queuedCase = await prepare();
    const queued = await call('start', queuedCase.start);
    assert.equal((await stored(queued.run.id)).status, 'QUEUED');
    modelEnqueue = true;
    await services.analysis.recover();
    assert(enqueues.includes(queued.run.id));
    await services.analysis.execute(queued.run.id);
    assert.equal((await stored(queued.run.id)).status, 'SUCCEEDED');
    const cancellation = await prepare();
    const pending = await call('start', cancellation.start);
    const cancelInput = {
      id: pending.run.id,
      requestId: randomUUID(),
      revision: pending.run.revision,
    };
    const cancelled = await call('cancel', cancelInput);
    assert.equal(cancelled.run.status, 'CANCELLED');
    assert.equal((await spend(pending.run.id)).state, 'RELEASED');
    assert.deepEqual(
      (await call('cancel', cancelInput)).receipt,
      cancelled.receipt,
    );
    await deny(
      () => call('cancel', { ...cancelInput, requestId: randomUUID() }),
      [409],
    );
    assert.deepEqual(
      (
        await read(
          'request',
          { requestId: cancelInput.requestId, action: 'CANCELLED' },
          person,
          true,
        )
      ).receipt,
      cancelled.receipt,
    );
    const beforeCancelledWorker = runtime.state.calls;
    await services.analysis.execute(pending.run.id);
    assert.equal(runtime.state.calls, beforeCancelledWorker);

    for (const behavior of [
      'INVALID_CITATION',
      'INVALID_JSON',
      'UNKNOWN_ERROR',
    ]) {
      runtime.state.behavior = behavior;
      const item = await prepare();
      const response = await call('start', item.start);
      await services.analysis.execute(response.run.id);
      const run = await stored(response.run.id);
      assert.equal(run.status, 'FAILED');
      assert.equal(run.result, null);
      assert(!String(run.error).includes('PRIVATE_PROVIDER_SECRET'));
      const charge = await spend(run.id);
      assert.equal(
        charge.state,
        behavior === 'UNKNOWN_ERROR' ? 'UNCERTAIN' : 'SETTLED',
      );
      if (behavior !== 'UNKNOWN_ERROR')
        assert(BigInt(charge.actualMicroUsd) > 0n);
    }
    runtime.state.behavior = 'SUCCESS';
    const inflightCase = await prepare();
    const inflight = await call('start', inflightCase.start);
    runtime.state.behavior = 'HOLD_SUCCESS';
    runtime.state.entered = deferred();
    runtime.state.release = deferred();
    const executing = services.analysis.execute(inflight.run.id);
    await bounded(runtime.state.entered.promise);
    assert.equal((await spend(inflight.run.id)).state, 'DISPATCHED');
    await call('cancel', {
      id: inflight.run.id,
      requestId: randomUUID(),
      revision: (await stored(inflight.run.id)).revision,
    });
    assert.equal((await spend(inflight.run.id)).state, 'DISPATCHED');
    runtime.state.release.resolve();
    await bounded(executing);
    assert.equal((await stored(inflight.run.id)).status, 'CANCELLED');
    assert.equal((await stored(inflight.run.id)).result, null);
    assert.equal((await spend(inflight.run.id)).state, 'SETTLED');
    runtime.state.behavior = 'SUCCESS';

    const interruptedCase = await prepare();
    const interrupted = await call('start', interruptedCase.start);
    runtime.state.behavior = 'HOLD_ERROR';
    runtime.state.entered = deferred();
    runtime.state.release = deferred();
    const interruptedExecution = services.analysis.execute(interrupted.run.id);
    await bounded(runtime.state.entered.promise);
    await runner.query(
      'UPDATE core."otogrowActivityAnalysisRun" SET "updatedAt"=now()-interval \'6 minutes\' WHERE id=$1 AND "workspaceId"=$2',
      [interrupted.run.id, fixture.workspaceId],
    );
    await services.analysis.recover();
    assert.equal((await stored(interrupted.run.id)).status, 'FAILED');
    assert.equal((await spend(interrupted.run.id)).state, 'UNCERTAIN');
    runtime.state.release.resolve();
    await bounded(interruptedExecution);
    const callsAfterInterruption = runtime.state.calls;
    await services.analysis.execute(interrupted.run.id);
    assert.equal(runtime.state.calls, callsAfterInterruption);
    runtime.state.behavior = 'SUCCESS';

    const stale = await prepare();
    await agents.update(
      { id: fixture.agentId, workspaceId: fixture.workspaceId },
      { version: 2 },
    );
    await deny(() => call('start', stale.start), [409]);
    assert.equal(
      (await read('detail', { id: successful.id })).run.status,
      'SUCCEEDED',
      'Current assistant edits do not erase an authorized immutable historical answer.',
    );
    await agents.update(
      { id: fixture.agentId, workspaceId: fixture.workspaceId },
      { version: 1 },
    );
    await deny(
      () =>
        call('start', {
          ...stale.start,
          capturedAt: '2099-01-01T00:00:00.000000Z',
        }),
      [400],
    );
    const changedEvidence = await prepare();
    const [originalEvent] = await runner.query(
      'SELECT summary FROM core."otogrowActivityEvent" WHERE id=$1',
      [fixture.eventIds[0]],
    );
    await runner.query(
      'UPDATE core."otogrowActivityEvent" SET summary=\'FIXTURE corrected captured evidence\' WHERE id=$1',
      [fixture.eventIds[0]],
    );
    await deny(() => call('start', changedEvidence.start), [409]);
    await runner.query(
      'UPDATE core."otogrowActivityEvent" SET summary=$2 WHERE id=$1',
      [fixture.eventIds[0], originalEvent.summary],
    );
    for (const loss of ['ROLE', 'CONFIGURATION', 'MODEL']) {
      const actor = loss === 'ROLE' ? fixture.people.reader : person;
      const item = await prepare({}, actor);
      const response = await call('start', item.start, actor);
      const calls = runtime.state.calls;
      if (loss === 'ROLE')
        await runner.query(
          'UPDATE core."otogrowRole" SET capabilities=\'{}\'::text[] WHERE id=$1 AND "workspaceId"=$2',
          [fixture.roles.reader, fixture.workspaceId],
        );
      if (loss === 'CONFIGURATION')
        await agents.update(
          { id: fixture.agentId, workspaceId: fixture.workspaceId },
          { version: 2 },
        );
      if (loss === 'MODEL') runtime.state.modelAllowed = false;
      await services.analysis.execute(response.run.id);
      assert.equal(runtime.state.calls, calls);
      assert.equal((await stored(response.run.id)).status, 'FAILED');
      assert.equal((await spend(response.run.id)).state, 'RELEASED');
      if (loss === 'ROLE')
        await runner.query(
          'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1 AND "workspaceId"=$3',
          [fixture.roles.reader, ['workspace.admin'], fixture.workspaceId],
        );
      if (loss === 'CONFIGURATION')
        await agents.update(
          { id: fixture.agentId, workspaceId: fixture.workspaceId },
          { version: 1 },
        );
      runtime.state.modelAllowed = true;
    }
    const completionCase = await prepare({}, fixture.people.reader);
    const completion = await call(
      'start',
      completionCase.start,
      fixture.people.reader,
    );
    runtime.state.hook = () =>
      runner.query(
        'UPDATE core."otogrowRole" SET capabilities=\'{}\'::text[] WHERE id=$1 AND "workspaceId"=$2',
        [fixture.roles.reader, fixture.workspaceId],
      );
    await services.analysis.execute(completion.run.id);
    runtime.state.hook = null;
    assert.equal((await stored(completion.run.id)).status, 'FAILED');
    assert.equal((await stored(completion.run.id)).result, null);
    assert.equal((await spend(completion.run.id)).state, 'SETTLED');
    await deny(
      () => read('detail', { id: successful.id }, fixture.people.reader),
      [403],
    );
    await runner.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1 AND "workspaceId"=$3',
      [fixture.roles.reader, ['workspace.admin'], fixture.workspaceId],
    );

    const atomicCase = await prepare();
    const beforeRuns = await runHash();
    const beforeMoney = await moneyHash();
    const beforeQueue = enqueues.length;
    failActivity = true;
    await assert.rejects(
      () => call('start', atomicCase.start),
      /Synthetic analysis activity failure/,
    );
    assert.equal(await runHash(), beforeRuns);
    assert.equal(await moneyHash(), beforeMoney);
    assert.equal(enqueues.length, beforeQueue);

    await appendEvent(runner.manager, fixture, {
      category: 'BUSINESS',
      action: 'FINANCE_RECORDED',
      sourceType: 'finance',
      summary:
        'FIXTURE recorded an expense category; no accounting amount is inferred.',
      changes: [{ field: 'financeCategory', before: null, after: 'EXPENSE' }],
    });
    const financial = await prepare({
      filters: { from: FROM, through: THROUGH, action: 'FINANCE_RECORDED' },
    });
    assert.equal(financial.preview.context.containsFinance, true);
    assert.equal(financial.preview.context.includedCount, 1);
    const financialRun = await call('start', financial.start);
    await services.analysis.execute(financialRun.run.id);
    assert.equal(
      (await stored(financialRun.run.id)).basis.containsFinance,
      true,
    );
    assert.equal(
      (await read('detail', { id: financialRun.run.id })).context
        .containsFinance,
      true,
    );

    const boundedAction = 'FIXTURE_BOUND_RECORD';
    for (let index = 0; index < 205; index++)
      await appendEvent(runner.manager, fixture, { action: boundedAction });
    const overBound = await prepare({
      filters: { from: FROM, through: THROUGH, action: boundedAction },
    });
    assert.equal(overBound.preview.context.totalCount, 205);
    assert(overBound.preview.context.includedCount <= 200);
    assert(overBound.preview.context.omittedCount >= 5);
    assert.equal(overBound.preview.canStart, false);
    await deny(() => call('start', overBound.start), [400]);
    const longEventId = await appendEvent(runner.manager, fixture, {
      action: 'FIXTURE_LONG_RECORD',
      changes: [
        {
          field: 'state',
          before: null,
          after: `${'x'.repeat(9000)}PRIVATE_TRUNCATED_TAIL`,
        },
      ],
    });
    const long = await prepare({
      filters: { from: FROM, through: THROUGH, action: 'FIXTURE_LONG_RECORD' },
    });
    assert(long.preview.context.truncatedFieldCount > 0);
    assert(long.preview.context.omittedBytes > 0);
    assert(
      !JSON.stringify(long.preview.context).includes('PRIVATE_TRUNCATED_TAIL'),
    );
    assert(
      Buffer.byteLength(JSON.stringify(long.preview.context.events)) <
        96 * 1024,
    );
    const boundedPage = await services.activity.page(
      fixture.workspace,
      person.memberId,
      person.userWorkspaceId,
      {
        filters: {
          from: FROM,
          through: THROUGH,
          action: 'FIXTURE_LONG_RECORD',
        },
        limit: 3,
      },
    );
    assert.equal(boundedPage.scope, activityContext.scope);
    assert.equal(boundedPage.events[0].detailsTruncated, true);
    assert(
      !JSON.stringify(boundedPage.events).includes('PRIVATE_TRUNCATED_TAIL'),
    );
    const exactLong = await services.activity.event(
      fixture.workspace,
      person.memberId,
      person.userWorkspaceId,
      { id: longEventId },
    );
    assert.equal(exactLong.scope, activityContext.scope);
    assert(
      exactLong.event.changes[0].after.includes('PRIVATE_TRUNCATED_TAIL'),
      'Deliberate exact event lookup preserves authorized original evidence.',
    );

    const limitedAgentId = randomUUID();
    const limitedConfiguration = configurationFor(fixture, {
      dailyRunLimit: 4,
    });
    await agents.insert({
      id: limitedAgentId,
      workspaceId: fixture.workspaceId,
      configuration: limitedConfiguration,
      version: 1,
    });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const yesterday = new Date(today.getTime() - 1);
    const copyConfiguration = {
      ...limitedConfiguration,
      kind: 'COPY',
      requiredInputs: ['brief'],
      outputFormat: 'findings',
      projectIds: [fixture.projects.first],
    };
    for (const createdAt of [today, yesterday, tomorrow]) {
      await runner.manager.getRepository(DeliveryAgentRunEntity).insert({
        id: randomUUID(),
        requestId: randomUUID(),
        workspaceId: fixture.workspaceId,
        taskId: randomUUID(),
        agentId: limitedAgentId,
        initiatorId: person.memberId,
        userWorkspaceId: person.userWorkspaceId,
        taskRevision: 1,
        agentVersion: 1,
        configuration: copyConfiguration,
        context: {
          title: 'FIXTURE old task allowance',
          brief: '',
          service: 'COPY',
          checklist: [],
          submittedCopy: '',
          evidenceLinks: [],
          inputs: { copy: '', requirements: '' },
        },
        status: 'FAILED',
        activity: [],
        result: null,
        usage: null,
        error: null,
        decision: null,
        createdAt,
        updatedAt: createdAt,
      });
    }
    await runner.query(
      'INSERT INTO core."deliveryOperations" ("workspaceId",state) VALUES($1,$2)',
      [
        fixture.workspaceId,
        {
          business: {
            agentRuns: [today, yesterday, tomorrow].map((at) => ({
              id: randomUUID(),
              agentId: limitedAgentId,
              createdAt: at.toISOString(),
              status: 'FAILED',
            })),
          },
        },
      ],
    );
    const adConfiguration = {
      ...limitedConfiguration,
      kind: 'ADVERTISING',
      projectIds: [fixture.projects.first],
      requiredInputs: ['report'],
      outputFormat: 'recommendations',
    };
    for (const createdAt of [today, yesterday, tomorrow]) {
      const id = randomUUID();
      const requestId = randomUUID();
      await runner.manager
        .getRepository(DeliveryAdvertisingDraftRunEntity)
        .insert({
          id,
          requestId,
          workspaceId: fixture.workspaceId,
          projectId: fixture.projects.first,
          companyId: null,
          sourceKind: 'MANUAL',
          sourceId: randomUUID(),
          initiatorId: person.memberId,
          initiatorName: 'FIXTURE allowance',
          userWorkspaceId: person.userWorkspaceId,
          agentId: limitedAgentId,
          agentVersion: 1,
          revision: 1,
          status: 'CANCELLED',
          inputHash: 'a'.repeat(64),
          bodyFingerprint: 'a'.repeat(64),
          contextFingerprint: 'a'.repeat(64),
          input: {},
          configuration: adConfiguration,
          agent: {
            id: limitedAgentId,
            name: limitedConfiguration.name,
            version: 1,
            modelId: fixture.modelId,
            maxOutputTokens: 1024,
          },
          basis: {},
          context: {},
          startReceipt: {},
          result: null,
          usage: null,
          error: 'FIXTURE terminal count only',
          cancelRequestId: null,
          cancelInputHash: null,
          cancelReceipt: null,
          createdAt,
          updatedAt: createdAt,
          startedAt: null,
          finishedAt: createdAt,
        });
      const template = copy(successful);
      template.id = randomUUID();
      template.requestId = randomUUID();
      template.agentId = limitedAgentId;
      template.agent.id = limitedAgentId;
      template.configuration = limitedConfiguration;
      template.status = 'CANCELLED';
      template.result = null;
      template.usage = null;
      template.revision = 1;
      template.createdAt = createdAt;
      template.updatedAt = createdAt;
      template.startedAt = null;
      template.finishedAt = createdAt;
      template.cancelRequestId = null;
      template.cancelInputHash = null;
      template.cancelReceipt = null;
      template.input = {
        ...template.input,
        id: template.id,
        requestId: template.requestId,
        agentId: limitedAgentId,
      };
      template.bodyFingerprint = advertisingHash(
        activityAnalysisBody(template.input),
      );
      template.contextFingerprint = activityAnalysisContextFingerprint(
        template.context,
        { id: limitedAgentId, version: 1, configuration: limitedConfiguration },
      );
      template.input.bodyFingerprint = template.bodyFingerprint;
      template.input.contextFingerprint = template.contextFingerprint;
      template.inputHash = advertisingHash(template.input);
      template.startReceipt = {
        ...template.startReceipt,
        runId: template.id,
        requestId: template.requestId,
        bodyFingerprint: template.bodyFingerprint,
        inputHash: template.inputHash,
        createdAt: createdAt.toISOString(),
      };
      await repository.insert(template);
    }
    assert.equal(
      await countDeliveryAgentRunsForUtcDay(
        runner.manager,
        fixture.workspaceId,
        limitedAgentId,
      ),
      4,
      'Task, inbox, ad and activity runs share one UTC day, including failures/cancellation; adjacent days excluded.',
    );
    const limited = await prepare({
      agentId: limitedAgentId,
      filters: { from: FROM, through: THROUGH, action: 'TASK_PROGRESS' },
    });
    assert.equal(limited.preview.canStart, false);
    await deny(() => call('start', limited.start), [400]);
    await agents.update(
      { id: limitedAgentId, workspaceId: fixture.workspaceId },
      { configuration: copyConfiguration, version: 2 },
    );
    assert.equal(
      await countDeliveryAgentRunsForUtcDay(
        runner.manager,
        fixture.workspaceId,
        limitedAgentId,
      ),
      4,
      'Changing assistant kind cannot reset its allowance.',
    );

    let after = null;
    const history = [];
    do {
      const page = await read('runs', { after, limit: 3 }, person, true);
      assert.equal(page.scope, activityContext.scope);
      assert(page.items.length <= 3);
      assert(!JSON.stringify(page).includes('PRIVATE_ACTIVITY_CONFIGURATION'));
      history.push(...page.items.map((run) => run.id));
      after = page.nextCursor;
    } while (after);
    assert.equal(new Set(history).size, history.length);
    assert.equal(
      history.length,
      await repository.countBy({ workspaceId: fixture.workspaceId }),
    );
    assert.equal(await domainHash(), originalDomain);
    assert.equal(networkCalls, 0);
    proof = {
      modelCalls: runtime.state.calls,
      currentWork: currentWorkProof,
      runs: history.length,
      ownedEvents: (
        await runner.query(
          'SELECT count(*)::integer AS count FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].count,
    };
  } finally {
    try {
      try {
        if (runner?.isTransactionActive) await runner.rollbackTransaction();
      } finally {
        if (runner && !runner.isReleased) await runner.release();
      }
      if (baseline)
        assert.equal(
          await originalDigest((...arguments_) =>
            connectionSource.query(...arguments_),
          ),
          baseline,
          'Original whole core/native inventory or rows changed after rollback.',
        );
    } finally {
      try {
        if (connectionSource.isInitialized) await connectionSource.destroy();
      } finally {
        global.fetch = originalFetch;
      }
    }
  }
  console.log(
    `PASS: activity analysis actual service/SDK/budget proof; ${proof.modelCalls} in-process calls, ${proof.runs} unique metadata summaries, ${proof.ownedEvents} owned events. All fixtures rolled back and original core/native digests unchanged; no provider, queue, task, employee decision or live action.`,
  );
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });

const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { BadRequestException } = require('@nestjs/common');
const { MockLanguageModelV3 } = require('ai/test');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  seedAdvertisingFixture,
  advertisingServices,
  newReviewInput,
  copy,
} = require('./check-delivery-advertising-support.cjs');
const {
  makeBudgetFixture,
} = require('./helpers/otogrow-ai-budget-fixture.cjs');
const {
  DeliveryAdvertisingDraftService,
} = require('../dist/modules/delivery/advertising/drafts/delivery-advertising-draft.service');
const {
  DeliveryAdvertisingDraftRunEntity,
} = require('../dist/modules/delivery/advertising/drafts/entities/delivery-advertising-draft-run.entity');
const {
  DeliveryAgentEntity,
} = require('../dist/modules/delivery/entities/delivery-agent.entity');
const {
  DeliveryAgentRunEntity,
} = require('../dist/modules/delivery/entities/delivery-agent-run.entity');
const {
  DeliveryAgentService,
} = require('../dist/modules/delivery/agents/delivery-agent.service');
const {
  DeliveryBusinessService,
} = require('../dist/modules/delivery/business/delivery-business.service');
const {
  countDeliveryAgentRunsForUtcDay,
} = require('../dist/modules/delivery/agents/count-delivery-agent-runs-for-utc-day');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const {
  advertisingDraftBody,
  advertisingDraftContextFingerprint,
} = require('../dist/modules/delivery/advertising/drafts/delivery-advertising-draft.policy');

const MODEL_ID = 'fixture-advertising-model';
const PRIVATE_INSTRUCTIONS = 'PRIVATE_ADVERTISING_DRAFT_CONFIGURATION';
const PRIVATE_TRANSCRIPT = 'PRIVATE_MEETING_TRANSCRIPT_NOT_MODEL_CONTEXT';
const failure = (message) => {
  throw new Error(message);
};
const quote = (value) => {
  assert(/^[a-zA-Z0-9_]+$/.test(value));
  return `"${value}"`;
};
const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const bounded = async (promise) => {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Synthetic provider barrier timed out.')),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};
const deny = (operation, statuses = [400, 403, 404, 409]) =>
  assert.rejects(
    operation,
    (error) => statuses.includes(error?.getStatus?.()),
    'Expected a scoped, safe rejection.',
  );
const originalDigest = async (query) => {
  const schemas = (
    await query(
      'SELECT "databaseSchema" AS schema FROM core.workspace WHERE "databaseSchema" IS NOT NULL',
    )
  ).map((row) => row.schema);
  const tables = await query(
    "SELECT table_schema AS schema,table_name AS name FROM information_schema.tables WHERE table_type='BASE TABLE' AND (table_schema='core' OR table_schema=ANY($1::text[])) ORDER BY table_schema,table_name",
    [schemas],
  );
  const result = [];
  for (const table of tables) {
    const [row] = await query(
      `SELECT count(*)::text AS count,md5(COALESCE(string_agg(md5(to_jsonb(record)::text),'' ORDER BY md5(to_jsonb(record)::text)),'')) AS hash FROM ${quote(table.schema)}.${quote(table.name)} record`,
    );
    result.push({ ...table, ...row });
  }
  return digest(result);
};

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This checker is mock-only and always rolls back; no live/browser mode exists.',
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
    throw new Error('Network is forbidden in advertising draft acceptance.');
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
    let readOnly = false;
    let lightRead = false;
    let failActivity = false;
    let readStatements = [];
    runner.query = async (...arguments_) => {
      const sql = arguments_[0];
      if (readOnly) {
        assert(
          !/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|MERGE)\b/i.test(
            sql,
          ),
          'Advertising query attempted a write.',
        );
        readStatements.push(sql);
      }
      if (
        lightRead &&
        /^\s*SELECT/i.test(sql) &&
        sql.includes('deliveryAdvertisingDraftRun')
      )
        assert(
          !/"(?:context|input|configuration|result|usage)"\s+AS|SELECT\s+\*/i.test(
            sql,
          ),
          'Light history/state read loaded private run evidence.',
        );
      if (
        failActivity &&
        /^\s*INSERT/i.test(sql) &&
        sql.includes('otogrowActivityEvent')
      ) {
        failActivity = false;
        throw new Error('Synthetic advertising-draft activity failure');
      }
      return originalQuery(...arguments_);
    };
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const [active] = await runner.query(
      "SELECT count(*)::integer AS count FROM core.\"deliveryAdvertisingDraftRun\" WHERE status IN ('QUEUED','RUNNING')",
    );
    assert.equal(
      active.count,
      0,
      'Do not let global worker recovery touch original active advertising runs.',
    );
    const fixture = await seedAdvertisingFixture(runner.manager);
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (operation) => runner.manager.transaction(operation),
    };
    const services = advertisingServices(scoped, fixture);
    const budget = await makeBudgetFixture(
      scoped,
      services.access,
      fixture.workspace,
      [{ modelId: MODEL_ID, kind: 'TEXT' }],
    );
    const repository = runner.manager.getRepository(
      DeliveryAdvertisingDraftRunEntity,
    );
    const agentRepository = runner.manager.getRepository(DeliveryAgentEntity);
    const administrator = fixture.people.admin;
    const sourceRef = { kind: 'META', id: fixture.metaReports[0].id };
    const sources = (reference = sourceRef, person = administrator) =>
      services.workbench.source(
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        reference,
      );
    const source = await sources();
    const goal = newReviewInput(fixture, source).goal;
    const knowledgeId = randomUUID();
    await runner.query(
      'INSERT INTO core."deliveryKnowledgeSource" (id,"workspaceId","projectId","createdBy",revision,"currentVersion","publishedVersion","publishedBy","publishedAt") VALUES($1,$2,$3,$4,1,1,1,$4,now())',
      [
        knowledgeId,
        fixture.workspaceId,
        fixture.projects.first,
        administrator.memberId,
      ],
    );
    await runner.query(
      'INSERT INTO core."deliveryKnowledgeVersion" ("workspaceId","sourceId",version,title,category,"meetingDate","sourceUrl",transcript,knowledge,"createdBy") VALUES($1,$2,1,\'FIXTURE approved brand facts\',\'BRAND_FACTS\',\'2020-02-20\',\'\',$3,\'FIXTURE: approved offer is 20%. No unsupported performance claim.\',$4)',
      [
        fixture.workspaceId,
        knowledgeId,
        PRIVATE_TRANSCRIPT,
        administrator.memberId,
      ],
    );
    const configuration = {
      name: 'FIXTURE advertising recommendations',
      purpose: 'Mock-only rollback acceptance',
      kind: 'ADVERTISING',
      enabled: true,
      instructions: PRIVATE_INSTRUCTIONS,
      requiredInputs: ['report'],
      outputFormat: 'recommendations',
      tools: [],
      modelId: MODEL_ID,
      projectIds: [fixture.projects.first],
      roles: ['ADMIN', 'MANAGER'],
      roleIds: null,
      dailyRunLimit: 200,
      maxOutputTokens: 1024,
      humanConfirmation: true,
    };
    const agentId = randomUUID();
    await agentRepository.insert({
      id: agentId,
      workspaceId: fixture.workspaceId,
      configuration,
      version: 1,
    });
    let behavior = 'SUCCESS';
    let providerCalls = 0;
    let providerHook = null;
    let entered = null;
    let release = null;
    let modelAllowed = true;
    let enqueueAllowed = true;
    let enqueues = [];
    let prompts = [];
    const fixtureOutput = () => ({
      summary: 'FIXTURE: Prepare one deliberate creative test.',
      limitations: [
        'FIXTURE: Account totals do not establish causation or a winning ad.',
      ],
      citations: ['report:scope'],
      noChangeReason:
        behavior === 'NO_CHANGE'
          ? 'FIXTURE: Existing reviewed work covers this report.'
          : null,
      suggestions:
        behavior === 'NO_CHANGE'
          ? []
          : [
              {
                title: 'FIXTURE clarify the product demonstration',
                rationale:
                  'FIXTURE: Review this proposed test against the report.',
                expectedResult:
                  'FIXTURE: Observe later purchases; no result is promised.',
                evidence: 'FIXTURE: Use only the supplied report scope.',
                citations: [
                  behavior === 'INVALID_CITATION'
                    ? 'invented:evidence'
                    : 'report:scope',
                ],
              },
            ],
    });
    const model = new MockLanguageModelV3({
      doGenerate: async (request) => {
        providerCalls++;
        prompts.push(JSON.stringify(request.prompt));
        if (providerHook) await providerHook();
        if (behavior === 'UNKNOWN_ERROR')
          throw new Error('PRIVATE_PROVIDER_SECRET must never be echoed');
        if (behavior === 'HOLD_SUCCESS' || behavior === 'HOLD_ERROR') {
          entered.resolve();
          await bounded(release.promise);
          if (behavior === 'HOLD_ERROR')
            throw new Error('Synthetic provider lost its response');
        }
        return {
          content: [
            {
              type: 'text',
              text:
                behavior === 'INVALID_JSON'
                  ? '{invalid JSON'
                  : JSON.stringify(fixtureOutput()),
            },
          ],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 100,
              noCache: 100,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 40, text: 40, reasoning: 0 },
          },
          warnings: [],
        };
      },
    });
    const registry = {
      getModel: (id) => (id === MODEL_ID ? { model, modelId: id } : undefined),
      validateModelAvailability: () => {
        if (!modelAllowed)
          throw new BadRequestException('Synthetic model is unavailable.');
      },
      getAdminFilteredModels: () => [{ model, modelId: MODEL_ID }],
    };
    const queue = {
      add: async (name, input, options) => {
        assert.equal(name, 'delivery-advertising-draft');
        assert.equal(options.id, `advertising-draft-${input.runId}`);
        assert(
          await repository.existsBy({
            id: input.runId,
            workspaceId: fixture.workspaceId,
          }),
          'Only owned fixture runs may be queued.',
        );
        if (!enqueueAllowed) throw new Error('Synthetic queue outage');
        enqueues.push(input.runId);
      },
    };
    const drafts = new DeliveryAdvertisingDraftService(
      scoped,
      services.delivery,
      services.sources,
      registry,
      queue,
      budget,
      services.access,
    );
    const call = (
      method,
      input,
      person = administrator,
      workspace = fixture.workspace,
    ) =>
      drafts[method](workspace, person.memberId, person.userWorkspaceId, input);
    const read = async (
      method,
      input,
      person = administrator,
      light = false,
    ) => {
      assert(!readOnly);
      readOnly = true;
      lightRead = light;
      try {
        return await call(method, input, person);
      } finally {
        readOnly = false;
        lightRead = false;
      }
    };
    const preparation = (changes = {}) => ({
      sourceKind: 'META',
      sourceId: sourceRef.id,
      sourceFingerprint: source.fingerprint,
      agentId,
      goal: copy(goal),
      instructions: 'FIXTURE: preserve the approved offer.',
      ...changes,
    });
    const startInput = (input, preview) => ({
      ...input,
      id: randomUUID(),
      requestId: randomUUID(),
      bodyFingerprint: preview.bodyFingerprint,
      contextFingerprint: preview.contextFingerprint,
      agentVersion: preview.agent.version,
      knowledgeFingerprint: preview.knowledgeFingerprint,
      pricingRevision: preview.budget.pricingRevision,
    });
    const prepareStart = async (changes = {}, person = administrator) => {
      const input = preparation(changes);
      const preview = await read('preview', input, person);
      return { input, preview, start: startInput(input, preview) };
    };
    const stored = (id) =>
      repository.findOneByOrFail({ workspaceId: fixture.workspaceId, id });
    const spend = async (id) =>
      (
        await runner.query(
          'SELECT * FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND "sourceKind"=\'ADVERTISING_DRAFT\' AND "sourceRunId"=$2',
          [fixture.workspaceId, id],
        )
      )[0];
    const stateHash = async () =>
      digest(
        await runner.query(
          'SELECT id,status,revision,"requestId","cancelRequestId" FROM core."deliveryAdvertisingDraftRun" WHERE "workspaceId"=$1 ORDER BY id',
          [fixture.workspaceId],
        ),
      );
    const moneyHash = async () =>
      digest(
        await runner.query(
          'SELECT id,state,revision,"reservedMicroUsd","actualMicroUsd" FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 ORDER BY id',
          [fixture.workspaceId],
        ),
      );
    const nativeHash = async () =>
      digest(
        await runner.query(
          `SELECT to_jsonb(task)::text AS value FROM ${quote(fixture.schemaName)}.task task ORDER BY id`,
        ),
      );
    const originalNative = await nativeHash();
    const originalOperations = digest(
      (
        await runner.query(
          'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].state,
    );
    const prepared = await prepareStart();
    assert.equal(prepared.preview.context.coverage, 'ACCOUNT_TOTALS_ONLY');
    assert.equal(prepared.preview.context.goal.value, '0');
    assert(
      !prepared.preview.context.metrics.some((metric) =>
        metric.goalKinds.includes('QUALIFIED_LEADS'),
      ),
      'Raw Meta lead events never become qualified lead evidence.',
    );
    assert(
      prepared.preview.context.references.some(
        (reference) => reference.id === `knowledge:${knowledgeId}:1`,
      ),
    );
    assert(
      !JSON.stringify(prepared.preview.context).includes(PRIVATE_TRANSCRIPT),
    );
    assert(!Object.hasOwn(prepared.preview.context, 'ads'));
    assert.equal(prepared.preview.budget.budgetReady, true);
    assert.equal(
      (
        await runner.query(
          'SELECT id FROM core."otogrowAiSpend" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      ).length,
      0,
      'Preview reserves no funds.',
    );
    await deny(() => read('preview', preparation(), fixture.people.writer));
    await deny(
      () =>
        read('preview', preparation({ goal: { ...goal, metricAdId: '1000' } })),
      [400],
    );
    const queued = await call('start', prepared.start);
    assert.equal(queued.run.status, 'QUEUED');
    assert.equal(enqueues.length, 1);
    assert.equal((await spend(queued.run.id)).state, 'RESERVED');
    assert.equal((await spend(queued.run.id)).taskId, null);
    const receipt = await read(
      'request',
      { requestId: prepared.start.requestId, action: 'STARTED' },
      administrator,
      true,
    );
    assert.deepEqual(receipt.receipt, queued.receipt);
    const beforeReplay = await moneyHash();
    assert.deepEqual(
      (await call('start', prepared.start)).receipt,
      queued.receipt,
    );
    assert.equal(await moneyHash(), beforeReplay);
    await deny(
      () =>
        call('start', {
          ...prepared.start,
          instructions: 'Different body under same identity.',
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
    await drafts.execute(queued.run.id);
    await drafts.execute(queued.run.id);
    assert.equal(
      providerCalls,
      1,
      `Expected fixture dispatch; persisted status: ${JSON.stringify({
        status: (await stored(queued.run.id)).status,
        error: (await stored(queued.run.id)).error,
      })}`,
    );
    const success = await stored(queued.run.id);
    assert.equal(success.status, 'SUCCEEDED');
    assert.equal(success.result.suggestions.length, 1);
    assert(
      success.result.limitations.some((value) =>
        value.includes('Account totals'),
      ),
    );
    assert.equal((await spend(success.id)).state, 'SETTLED');
    assert(BigInt((await spend(success.id)).actualMicroUsd) > 0n);
    assert(prompts[0].includes('ACCOUNT_TOTALS_ONLY'));
    assert(!prompts[0].includes('Synthetic ad 0'));
    assert(!prompts[0].includes(PRIVATE_TRANSCRIPT));
    assert.equal(await nativeHash(), originalNative);
    assert.equal(
      digest(
        (
          await runner.query(
            'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
            [fixture.workspaceId],
          )
        )[0].state,
      ),
      originalOperations,
    );
    assert.equal((await read('detail', { id: success.id })).canUseResult, true);
    assert(
      (
        await read('detail', { id: success.id })
      ).run.context.assistantInstructions.includes(PRIVATE_INSTRUCTIONS),
    );
    const managerPreview = await read(
      'preview',
      preparation(),
      fixture.people.reader,
    );
    assert.equal(managerPreview.context.assistantInstructions, null);
    assert.equal(
      managerPreview.contextFingerprint,
      prepared.preview.contextFingerprint,
      'Public instruction redaction does not change the frozen execution basis.',
    );
    const managerDetail = await read(
      'detail',
      { id: success.id },
      fixture.people.reader,
    );
    assert.equal(managerDetail.run.context.assistantInstructions, null);
    assert(!JSON.stringify(managerDetail).includes(PRIVATE_INSTRUCTIONS));
    const light = await read('state', { id: success.id }, administrator, true);
    assert(!JSON.stringify(light).includes(PRIVATE_INSTRUCTIONS));
    assert(!Object.hasOwn(light.run, 'context'));
    assert(!Object.hasOwn(light.run, 'result'));
    await deny(() => read('detail', { id: success.id }, fixture.people.writer));
    await deny(() =>
      call(
        'detail',
        { id: success.id },
        fixture.people.admin,
        fixture.foreignWorkspace,
      ),
    );

    const manualSource = await sources({
      kind: 'MANUAL',
      id: fixture.manualReports[0].id,
    });
    const manualGoal = newReviewInput(fixture, manualSource).goal;
    const manualCase = await prepareStart({
      sourceKind: 'MANUAL',
      sourceId: manualSource.source.id,
      sourceFingerprint: manualSource.fingerprint,
      goal: manualGoal,
    });
    assert.equal(manualCase.preview.context.source.accountId, null);
    assert(
      manualCase.preview.context.metrics.some(
        (metric) => metric.value === null,
      ),
    );
    const manualRun = await call('start', manualCase.start);
    await drafts.execute(manualRun.run.id);
    assert.equal((await stored(manualRun.run.id)).status, 'SUCCEEDED');
    assert.equal(
      (await sources({ kind: 'MANUAL', id: fixture.manualReports[0].id }))
        .source.sourceStatus,
      'REVIEW',
      'AI recommendations never approve their source report.',
    );
    assert.equal(await nativeHash(), originalNative);

    enqueueAllowed = false;
    const queueCase = await prepareStart();
    const queueStart = await call('start', queueCase.start);
    assert.equal((await stored(queueStart.run.id)).status, 'QUEUED');
    enqueueAllowed = true;
    const enqueuesBefore = enqueues.length;
    await drafts.recover();
    assert(enqueues.length > enqueuesBefore);
    assert(enqueues.includes(queueStart.run.id));
    await drafts.execute(queueStart.run.id);
    assert.equal((await stored(queueStart.run.id)).status, 'SUCCEEDED');
    const cancelCase = await prepareStart();
    const cancelStart = await call('start', cancelCase.start);
    const cancelInput = {
      id: cancelStart.run.id,
      revision: cancelStart.run.revision,
      requestId: randomUUID(),
    };
    const cancelled = await call('cancel', cancelInput);
    assert.equal(cancelled.run.status, 'CANCELLED');
    assert.equal((await spend(cancelStart.run.id)).state, 'RELEASED');
    assert.deepEqual(
      (await call('cancel', cancelInput)).receipt,
      cancelled.receipt,
    );
    await deny(
      () => call('cancel', { ...cancelInput, requestId: randomUUID() }),
      [409],
    );
    const callsBeforeCancel = providerCalls;
    await drafts.execute(cancelStart.run.id);
    assert.equal(providerCalls, callsBeforeCancel);
    assert.equal(
      (
        await read(
          'request',
          { requestId: cancelInput.requestId, action: 'CANCELLED' },
          administrator,
          true,
        )
      ).receipt.runId,
      cancelStart.run.id,
    );
    for (const invalidBehavior of [
      'INVALID_CITATION',
      'INVALID_JSON',
      'UNKNOWN_ERROR',
      'NO_CHANGE',
    ]) {
      behavior = invalidBehavior;
      const item = await prepareStart();
      const response = await call('start', item.start);
      await drafts.execute(response.run.id);
      const result = await stored(response.run.id);
      const charge = await spend(response.run.id);
      if (invalidBehavior === 'NO_CHANGE') {
        assert.equal(result.status, 'SUCCEEDED');
        assert.equal(result.result.suggestions.length, 0);
        assert(result.result.noChangeReason.startsWith('FIXTURE:'));
      } else {
        assert.equal(result.status, 'FAILED');
        assert.equal(result.result, null);
        assert(!String(result.error).includes('PRIVATE_PROVIDER_SECRET'));
      }
      if (invalidBehavior === 'UNKNOWN_ERROR') {
        assert.equal(charge.state, 'UNCERTAIN');
        assert(BigInt(charge.reservedMicroUsd) > 0n);
      } else {
        assert.equal(charge.state, 'SETTLED');
        assert(BigInt(charge.actualMicroUsd) > 0n);
      }
    }
    behavior = 'SUCCESS';
    const runningCase = await prepareStart();
    const running = await call('start', runningCase.start);
    behavior = 'HOLD_SUCCESS';
    entered = deferred();
    release = deferred();
    const runningExecution = drafts.execute(running.run.id);
    await bounded(entered.promise);
    const runningState = await stored(running.run.id);
    assert.equal((await spend(running.run.id)).state, 'DISPATCHED');
    await call('cancel', {
      id: running.run.id,
      revision: runningState.revision,
      requestId: randomUUID(),
    });
    assert.equal(
      (await spend(running.run.id)).state,
      'DISPATCHED',
      'Cancellation does not claim a provider refund.',
    );
    release.resolve();
    await bounded(runningExecution);
    assert.equal((await stored(running.run.id)).status, 'CANCELLED');
    assert.equal((await stored(running.run.id)).result, null);
    assert.equal((await spend(running.run.id)).state, 'SETTLED');
    behavior = 'SUCCESS';
    const interruptedCase = await prepareStart();
    const interrupted = await call('start', interruptedCase.start);
    behavior = 'HOLD_ERROR';
    entered = deferred();
    release = deferred();
    const interruptedExecution = drafts.execute(interrupted.run.id);
    await bounded(entered.promise);
    await runner.query(
      'UPDATE core."deliveryAdvertisingDraftRun" SET "updatedAt"=now()-interval \'6 minutes\' WHERE "workspaceId"=$1 AND id=$2',
      [fixture.workspaceId, interrupted.run.id],
    );
    await drafts.recover();
    assert.equal((await stored(interrupted.run.id)).status, 'FAILED');
    assert.equal((await spend(interrupted.run.id)).state, 'UNCERTAIN');
    const interruptedCalls = providerCalls;
    release.resolve();
    await bounded(interruptedExecution);
    await drafts.execute(interrupted.run.id);
    assert.equal(providerCalls, interruptedCalls);
    behavior = 'SUCCESS';

    const versionCase = await prepareStart();
    await agentRepository.update(
      { id: agentId, workspaceId: fixture.workspaceId },
      { version: 2 },
    );
    await deny(() => call('start', versionCase.start), [409]);
    await agentRepository.update(
      { id: agentId, workspaceId: fixture.workspaceId },
      { version: 1 },
    );
    const goalCase = await prepareStart();
    await deny(
      () =>
        call('start', {
          ...goalCase.start,
          goal: { ...goalCase.start.goal, targetCostMicros: '30000000' },
        }),
      [409],
    );
    const knowledgeCase = await prepareStart();
    await runner.query(
      'UPDATE core."deliveryKnowledgeSource" SET "publishedVersion"=NULL WHERE "workspaceId"=$1 AND id=$2',
      [fixture.workspaceId, knowledgeId],
    );
    await deny(() => call('start', knowledgeCase.start), [409]);
    await runner.query(
      'UPDATE core."deliveryKnowledgeSource" SET "publishedVersion"=1 WHERE "workspaceId"=$1 AND id=$2',
      [fixture.workspaceId, knowledgeId],
    );
    const sourceCase = await prepareStart();
    await runner.query(
      'UPDATE core."deliveryProject" SET revision=revision+1 WHERE id=$1 AND "workspaceId"=$2',
      [fixture.projects.first, fixture.workspaceId],
    );
    await deny(() => call('start', sourceCase.start), [409]);
    await runner.query(
      'UPDATE core."deliveryProject" SET revision=revision-1 WHERE id=$1 AND "workspaceId"=$2',
      [fixture.projects.first, fixture.workspaceId],
    );
    for (const invalidate of [
      'ROLE',
      'CONFIG',
      'KNOWLEDGE',
      'SOURCE',
      'MODEL',
    ]) {
      const person =
        invalidate === 'ROLE' ? fixture.people.reader : administrator;
      const item = await prepareStart({}, person);
      const started = await call('start', item.start, person);
      const callsBefore = providerCalls;
      if (invalidate === 'ROLE')
        await runner.query(
          'UPDATE core."otogrowRole" SET capabilities=\'{}\'::text[] WHERE id=$1 AND "workspaceId"=$2',
          [fixture.roles.reader, fixture.workspaceId],
        );
      if (invalidate === 'CONFIG')
        await agentRepository.update(
          { id: agentId, workspaceId: fixture.workspaceId },
          { version: 2 },
        );
      if (invalidate === 'KNOWLEDGE')
        await runner.query(
          'UPDATE core."deliveryKnowledgeSource" SET "publishedVersion"=NULL WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, knowledgeId],
        );
      if (invalidate === 'SOURCE')
        await runner.query(
          'UPDATE core."deliveryProject" SET revision=revision+1 WHERE id=$1 AND "workspaceId"=$2',
          [fixture.projects.first, fixture.workspaceId],
        );
      if (invalidate === 'MODEL') modelAllowed = false;
      await drafts.execute(started.run.id);
      assert.equal(providerCalls, callsBefore);
      assert.equal((await stored(started.run.id)).status, 'FAILED');
      assert.equal((await spend(started.run.id)).state, 'RELEASED');
      if (invalidate === 'ROLE')
        await runner.query(
          'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1 AND "workspaceId"=$3',
          [fixture.roles.reader, ['delivery.manage'], fixture.workspaceId],
        );
      if (invalidate === 'CONFIG')
        await agentRepository.update(
          { id: agentId, workspaceId: fixture.workspaceId },
          { version: 1 },
        );
      if (invalidate === 'KNOWLEDGE')
        await runner.query(
          'UPDATE core."deliveryKnowledgeSource" SET "publishedVersion"=1 WHERE "workspaceId"=$1 AND id=$2',
          [fixture.workspaceId, knowledgeId],
        );
      if (invalidate === 'SOURCE')
        await runner.query(
          'UPDATE core."deliveryProject" SET revision=revision-1 WHERE id=$1 AND "workspaceId"=$2',
          [fixture.projects.first, fixture.workspaceId],
        );
      modelAllowed = true;
    }
    const completionCase = await prepareStart({}, fixture.people.reader);
    const completion = await call(
      'start',
      completionCase.start,
      fixture.people.reader,
    );
    providerHook = () =>
      runner.query(
        'UPDATE core."otogrowRole" SET capabilities=\'{}\'::text[] WHERE id=$1 AND "workspaceId"=$2',
        [fixture.roles.reader, fixture.workspaceId],
      );
    await drafts.execute(completion.run.id);
    providerHook = null;
    assert.equal((await stored(completion.run.id)).status, 'FAILED');
    assert.equal((await stored(completion.run.id)).result, null);
    assert.equal((await spend(completion.run.id)).state, 'SETTLED');
    await runner.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1 AND "workspaceId"=$3',
      [fixture.roles.reader, ['delivery.manage'], fixture.workspaceId],
    );
    const atomicCase = await prepareStart();
    const beforeAtomic = await stateHash();
    const beforeMoney = await moneyHash();
    const beforeQueue = enqueues.length;
    failActivity = true;
    await assert.rejects(
      () => call('start', atomicCase.start),
      /Synthetic advertising-draft activity failure/,
    );
    assert.equal(await stateHash(), beforeAtomic);
    assert.equal(await moneyHash(), beforeMoney);
    assert.equal(enqueues.length, beforeQueue);

    const suggestion = success.result.suggestions[0];
    const reviewInput = newReviewInput(fixture, await sources());
    const manualText =
      'FIXTURE: Preserve this independently written manager action.';
    reviewInput.actions[0].title = manualText;
    reviewInput.actions.push({
      ...reviewInput.actions[0],
      id: randomUUID(),
      title: `Edited ${suggestion.title}`,
      rationale: suggestion.rationale,
      expectedResult: suggestion.expectedResult,
      evidence: suggestion.evidence,
      origin: { runId: success.id, suggestionId: suggestion.id },
    });
    const saved = await services.workbench.save(
      fixture.workspace,
      administrator.memberId,
      administrator.userWorkspaceId,
      reviewInput,
    );
    const detail = await services.workbench.review(
      fixture.workspace,
      administrator.memberId,
      administrator.userWorkspaceId,
      { id: reviewInput.id },
    );
    assert.equal(detail.review.actions[0].title, manualText);
    assert.equal(detail.review.actions[1].origin.runId, success.id);
    assert.equal(detail.review.actions[1].origin.suggestionId, suggestion.id);
    assert.equal(detail.review.actions[1].origin.humanEdited, true);
    assert.equal(await nativeHash(), originalNative);
    const staleOrigin = {
      ...copy(reviewInput),
      requestId: randomUUID(),
      revision: saved.receipt.revision,
    };
    await agentRepository.update(
      { id: agentId, workspaceId: fixture.workspaceId },
      { version: 2 },
    );
    await deny(
      () =>
        services.workbench.save(
          fixture.workspace,
          administrator.memberId,
          administrator.userWorkspaceId,
          staleOrigin,
        ),
      [409],
    );
    await agentRepository.update(
      { id: agentId, workspaceId: fixture.workspaceId },
      { version: 1 },
    );
    const wrongGoal = {
      ...copy(staleOrigin),
      requestId: randomUUID(),
      goal: { ...goal, targetCostMicros: '30000000' },
    };
    await deny(
      () =>
        services.workbench.save(
          fixture.workspace,
          administrator.memberId,
          administrator.userWorkspaceId,
          wrongGoal,
        ),
      [409],
    );

    const limitAgentId = randomUUID();
    const limitConfiguration = {
      ...copy(configuration),
      name: 'FIXTURE shared daily allowance',
      dailyRunLimit: 3,
    };
    await agentRepository.insert({
      id: limitAgentId,
      workspaceId: fixture.workspaceId,
      configuration: limitConfiguration,
      version: 1,
    });
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(day);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const yesterday = new Date(day.getTime() - 1);
    const oldConfiguration = {
      ...copy(limitConfiguration),
      kind: 'COPY',
      requiredInputs: ['brief', 'copy'],
      outputFormat: 'findings_and_edits',
    };
    const seedTaskRun = async (createdAt) =>
      runner.manager.getRepository(DeliveryAgentRunEntity).insert({
        id: randomUUID(),
        workspaceId: fixture.workspaceId,
        requestId: randomUUID(),
        taskId: fixture.taskId,
        agentId: limitAgentId,
        initiatorId: administrator.memberId,
        userWorkspaceId: administrator.userWorkspaceId,
        taskRevision: 1,
        agentVersion: 1,
        configuration: oldConfiguration,
        context: {
          title: 'FIXTURE previous task run',
          brief: 'FIXTURE brief',
          service: 'COPY',
          checklist: [],
          submittedCopy: '',
          evidenceLinks: [],
          inputs: { copy: '', requirements: '' },
        },
        status: 'FAILED',
        result: null,
        activity: [],
        usage: null,
        error: 'FIXTURE historical failure',
        decision: null,
        createdAt,
        updatedAt: createdAt,
      });
    await seedTaskRun(day);
    await seedTaskRun(yesterday);
    await seedTaskRun(tomorrow);
    const operations = (
      await runner.query(
        'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
        [fixture.workspaceId],
      )
    )[0].state;
    operations.business.agentRuns = [day, yesterday, tomorrow].map((at) => ({
      id: randomUUID(),
      agentId: limitAgentId,
      conversationId: randomUUID(),
      memberId: administrator.memberId,
      createdAt: at.toISOString(),
      status: 'FAILED',
      inputTokens: null,
      outputTokens: null,
    }));
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [fixture.workspaceId, operations],
    );
    const clone = copy(success);
    const seedDraft = async (createdAt) => {
      const id = randomUUID();
      const requestId = randomUUID();
      const input = {
        ...copy(clone.input),
        id,
        requestId,
        agentId: limitAgentId,
      };
      const context = copy(clone.context);
      const bodyFingerprint = advertisingHash(advertisingDraftBody(input));
      const contextFingerprint = advertisingDraftContextFingerprint(context, {
        id: limitAgentId,
        version: 1,
        configuration: limitConfiguration,
      });
      input.bodyFingerprint = bodyFingerprint;
      input.contextFingerprint = contextFingerprint;
      await repository.insert({
        ...clone,
        id,
        requestId,
        agentId: limitAgentId,
        agent: {
          ...clone.agent,
          id: limitAgentId,
          name: limitConfiguration.name,
        },
        configuration: limitConfiguration,
        input,
        inputHash: advertisingHash(input),
        bodyFingerprint,
        contextFingerprint,
        status: 'CANCELLED',
        result: null,
        usage: null,
        error: 'FIXTURE cancelled historical request',
        revision: 1,
        startReceipt: {
          ...clone.startReceipt,
          createdAt: createdAt.toISOString(),
          runId: id,
          requestId,
          inputHash: advertisingHash(input),
          bodyFingerprint,
        },
        createdAt,
        updatedAt: createdAt,
        startedAt: null,
        finishedAt: createdAt,
        cancelRequestId: null,
        cancelInputHash: null,
        cancelReceipt: null,
      });
    };
    await seedDraft(day);
    await seedDraft(yesterday);
    await seedDraft(tomorrow);
    assert.equal(
      await countDeliveryAgentRunsForUtcDay(
        runner.manager,
        fixture.workspaceId,
        limitAgentId,
        new Date(),
      ),
      3,
      'Failed task, failed inbox and cancelled advertising runs share one UTC day; adjacent days excluded.',
    );
    const limited = await prepareStart({ agentId: limitAgentId });
    assert.equal(limited.preview.budget.budgetReady, false);
    await deny(() => call('start', limited.start), [400]);
    await agentRepository.update(
      { id: limitAgentId, workspaceId: fixture.workspaceId },
      { configuration: oldConfiguration, version: 2 },
    );
    const taskAgents = new DeliveryAgentService(
      scoped,
      services.delivery,
      registry,
      { add: async () => failure('Quota denial must not enqueue a task run.') },
      budget,
      services.access,
    );
    const taskPreview = await taskAgents.command(
      fixture.workspace,
      administrator.memberId,
      administrator.userWorkspaceId,
      {
        type: 'preview',
        agentId: limitAgentId,
        taskId: fixture.taskId,
        inputs: { copy: 'FIXTURE copy', requirements: '' },
      },
    );
    await deny(
      () =>
        taskAgents.command(
          fixture.workspace,
          administrator.memberId,
          administrator.userWorkspaceId,
          {
            type: 'start',
            agentId: limitAgentId,
            taskId: fixture.taskId,
            inputs: { copy: 'FIXTURE copy', requirements: '' },
            requestId: randomUUID(),
            taskRevision: taskPreview.taskRevision,
            agentVersion: 2,
            knowledgeFingerprint:
              taskPreview.context.brandKnowledge.fingerprint,
            pricingRevision: 1,
          },
        ),
      [400],
    );
    const conversationId = randomUUID();
    const inboundId = randomUUID();
    const updated = (
      await runner.query(
        'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
        [fixture.workspaceId],
      )
    )[0].state;
    updated.business.records.push({
      id: conversationId,
      revision: 1,
      kind: 'CONVERSATION',
      projectId: fixture.projects.first,
      title: 'FIXTURE quota inbox',
      channel: 'EMAIL',
      sourceUrl: null,
      ownerId: administrator.memberId,
      private: false,
      grants: [],
      roleGrants: [],
      createdBy: administrator.memberId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'OPEN',
      decisionBy: null,
      evidence: null,
      taskId: null,
      history: [],
    });
    updated.business.inbox.push({
      id: inboundId,
      conversationId,
      authorId: fixture.people.writer.memberId,
      createdAt: new Date().toISOString(),
      text: 'FIXTURE inbound evidence',
      kind: 'INBOUND_NOTE',
      sourceUrl: null,
      sourceIds: [],
    });
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [fixture.workspaceId, updated],
    );
    const inbox = new DeliveryBusinessService(
      scoped,
      services.delivery,
      registry,
      budget,
      services.access,
    );
    await deny(
      () =>
        inbox.command(
          fixture.workspace,
          administrator.memberId,
          administrator.userWorkspaceId,
          {
            action: 'aiDraft',
            id: conversationId,
            revision: 1,
            agentId: limitAgentId,
            sourceIds: [inboundId],
          },
        ),
      [400],
    );
    assert.equal(
      await countDeliveryAgentRunsForUtcDay(
        runner.manager,
        fixture.workspaceId,
        limitAgentId,
      ),
      3,
      'Changing kind cannot reset the shared allowance.',
    );
    let after = null;
    const historyIds = [];
    do {
      const page = await read(
        'runs',
        { sourceKind: 'META', sourceId: sourceRef.id, limit: 3, after },
        administrator,
        true,
      );
      assert(page.items.length <= 3);
      assert(!JSON.stringify(page).includes(PRIVATE_INSTRUCTIONS));
      assert(!JSON.stringify(page).includes(PRIVATE_TRANSCRIPT));
      historyIds.push(...page.items.map((item) => item.id));
      after = page.nextCursor;
    } while (after);
    assert.equal(new Set(historyIds).size, historyIds.length);
    assert.equal(
      historyIds.length,
      await repository.countBy({
        workspaceId: fixture.workspaceId,
        sourceKind: 'META',
        sourceId: sourceRef.id,
        projectId: fixture.projects.first,
      }),
    );
    assert.equal(await nativeHash(), originalNative);
    assert.equal(networkCalls, 0);
    assert(readStatements.length > 0);
    proof = {
      providerCalls,
      runs: await repository.countBy({ workspaceId: fixture.workspaceId }),
      history: historyIds.length,
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
          'Original core/native inventory and row hashes changed after rollback.',
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
    `PASS: actual advertising draft service/SDK/budget proof; ${proof.providerCalls} in-process model calls, ${proof.runs} owned runs and ${proof.history} uniquely paged summaries. All fixture state rolled back; original core/native digests unchanged. No live provider, real queue, message, job, ad or budget policy action.`,
  );
}
main().catch((error) => {
  console.error(
    error?.code === 'ERR_ASSERTION'
      ? error.stack
      : error instanceof Error
        ? error.message
        : String(error),
  );
  process.exitCode = 1;
});

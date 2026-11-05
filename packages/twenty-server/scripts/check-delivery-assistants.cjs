const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  createReviewFixture,
  copy,
  denied,
} = require('./check-delivery-creative-review-support.cjs');
const {
  sourceFingerprint,
} = require('./check-delivery-task-reads-support.cjs');
const { buildServices } = require('./check-delivery-reconciliation.cjs');
const {
  DeliveryAgentService,
} = require('../dist/modules/delivery/agents/delivery-agent.service');
const {
  DeliveryAssistantsService,
} = require('../dist/modules/delivery/agents/reads/delivery-assistants.service');
const {
  OtogrowAiBudgetService,
} = require('../dist/modules/otogrow-ai-budget/otogrow-ai-budget.service');

const OLD_AT = '2020-02-20T09:00:00.000001Z';
const OTHER_AT = '2020-02-22T09:00:00.123999Z';
const PRIVATE_CONFIGURATION = 'PRIVATE_ASSISTANT_CONFIGURATION';
const PRIVATE_CONTEXT = 'PRIVATE_ASSISTANT_RUN_CONTEXT';
const PRIVATE_RESULT = 'PRIVATE_ASSISTANT_RUN_RESULT';
const PRIVATE_ACTIVITY = 'PRIVATE_ASSISTANT_RUN_ACTIVITY';
const OTHER_COUNT = 501;
const TIED_COUNT = 79;

async function seed(manager, fixture) {
  const { workspaceId, foreignWorkspaceId, people, projects, schemaName } =
    fixture;
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$3 WHERE "workspaceId"=$1 AND id=$2',
    [
      workspaceId,
      projects.otherClient,
      JSON.stringify([people.secondWriter.memberId]),
    ],
  );
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$3 WHERE "workspaceId"=$1 AND id=$2',
    [
      foreignWorkspaceId,
      projects.foreign,
      JSON.stringify([people.outsider.memberId]),
    ],
  );
  fixture.foreignPerson = { ...people.outsider, userWorkspaceId: randomUUID() };
  await manager.query(
    'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES($1,$2,$3)',
    [
      fixture.foreignPerson.userWorkspaceId,
      fixture.foreignPerson.userId,
      foreignWorkspaceId,
    ],
  );
  const details = {
    brief: 'PRIVATE_SELECTED_TASK_BRIEF: explicit source only',
    draftCopy: 'PRIVATE_SELECTED_TASK_DRAFT: retain this exact copy',
    service: 'SEO',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: people.admin.memberId,
    state: 'IN_PROGRESS',
    blocker: '',
    checklist: [],
    evidence: [],
    events: [],
    submissions: [],
  };
  await manager.query(
    'UPDATE core."deliveryTask" SET details=$3,revision=7 WHERE "workspaceId"=$1 AND "taskId"=$2',
    [workspaceId, fixture.taskId, details],
  );
  fixture.agentId = randomUUID();
  fixture.activeAgentId = randomUUID();
  fixture.previewAgentId = randomUUID();
  fixture.namedAgentId = randomUUID();
  fixture.foreignAgentId = randomUUID();
  fixture.configuration = {
    name: 'Historical disabled assistant',
    purpose: 'Synthetic scoped terminal history',
    kind: 'SEO',
    enabled: false,
    instructions: `${PRIVATE_CONFIGURATION}: ${fixture.sentinel}`,
    requiredInputs: [],
    outputFormat: 'findings',
    tools: ['public_page_check'],
    modelId: null,
    projectIds: [projects.first],
    roles: ['ADMIN', 'MANAGER', 'MEMBER'],
    dailyRunLimit: 20,
    maxOutputTokens: 256,
    humanConfirmation: true,
  };
  const activeConfiguration = {
    ...fixture.configuration,
    name: 'Current eligible copy assistant',
    kind: 'COPY',
    enabled: true,
    tools: [],
    modelId: 'fixture/text',
  };
  const previewConfiguration = {
    ...fixture.configuration,
    name: 'Current deterministic SEO preview',
    enabled: true,
  };
  const configurations = [
    [fixture.agentId, workspaceId, fixture.configuration],
    [fixture.activeAgentId, workspaceId, activeConfiguration],
    [fixture.previewAgentId, workspaceId, previewConfiguration],
    [
      fixture.foreignAgentId,
      foreignWorkspaceId,
      {
        ...fixture.configuration,
        name: 'DO_NOT_LEAK_FOREIGN_PRIVATE_AGENT',
        projectIds: [projects.foreign],
      },
    ],
    [
      fixture.namedAgentId,
      workspaceId,
      {
        ...previewConfiguration,
        name: 'Named-role verifier',
        roleIds: [fixture.roles.reader],
      },
    ],
    ...Array.from({ length: 61 }, (_, index) => [
      randomUUID(),
      workspaceId,
      {
        ...fixture.configuration,
        name: `Catalog proof ${String(index).padStart(3, '0')}`,
        enabled: index % 2 === 0,
      },
    ]),
  ];
  fixture.catalogIds = configurations
    .filter(([, workspace]) => workspace === workspaceId)
    .map(([id]) => id);
  for (const [id, targetWorkspaceId, configuration] of configurations)
    await manager.query(
      'INSERT INTO core."deliveryAgent" (id,"workspaceId",configuration,version,"createdAt","updatedAt") VALUES($1,$2,$3,1,$4,$4)',
      [id, targetWorkspaceId, configuration, '2020-02-19T09:00:00.123900Z'],
    );
  fixture.runs = Array.from(
    { length: OTHER_COUNT + TIED_COUNT + 1 },
    (_, index) => {
      const other = index < OTHER_COUNT;
      const old = index === OTHER_COUNT + TIED_COUNT;
      return {
        id: randomUUID(),
        requestId: randomUUID(),
        taskId: fixture.taskId,
        workspaceId,
        agentId: fixture.agentId,
        initiatorId: other ? people.reader.memberId : people.writer.memberId,
        userWorkspaceId: other
          ? people.reader.userWorkspaceId
          : people.writer.userWorkspaceId,
        configuration: fixture.configuration,
        createdAt: other
          ? OTHER_AT
          : old
            ? OLD_AT
            : [
                '2020-02-21T09:00:00.123100Z',
                '2020-02-21T09:00:00.123450Z',
                '2020-02-21T09:00:00.123900Z',
              ][(index - OTHER_COUNT) % 3],
        status: 'SUCCEEDED',
        decision: {
          memberId: people.admin.memberId,
          at: OLD_AT,
          action: 'REJECT',
          field: null,
        },
      };
    },
  );
  fixture.oldOwnRun = fixture.runs.at(-1);
  fixture.otherInitiatorRun = fixture.runs[0];
  fixture.waitingRun = {
    ...fixture.oldOwnRun,
    id: randomUUID(),
    requestId: randomUUID(),
    agentId: fixture.activeAgentId,
    configuration: activeConfiguration,
    createdAt: '2020-02-23T09:00:00.123900Z',
    status: 'WAITING_REVIEW',
    decision: null,
  };
  fixture.nonmemberRun = {
    ...fixture.oldOwnRun,
    id: randomUUID(),
    requestId: randomUUID(),
    taskId: fixture.otherTaskId,
  };
  fixture.foreignRun = {
    ...fixture.oldOwnRun,
    id: randomUUID(),
    requestId: randomUUID(),
    taskId: fixture.foreignTaskId,
    workspaceId: foreignWorkspaceId,
    agentId: fixture.foreignAgentId,
    configuration: configurations[3][2],
    initiatorId: fixture.foreignPerson.memberId,
    userWorkspaceId: fixture.foreignPerson.userWorkspaceId,
  };
  fixture.runs.push(
    fixture.waitingRun,
    fixture.nonmemberRun,
    fixture.foreignRun,
  );
  for (const run of fixture.runs) await insertRun(manager, fixture, run);
}
async function insertRun(manager, fixture, run) {
  const context = {
    title: 'Synthetic assistant task',
    brief: PRIVATE_CONTEXT,
    service: 'SEO',
    checklist: [],
    submittedCopy: '',
    evidenceLinks: [],
    inputs: { copy: '', requirements: fixture.sentinel },
  };
  const result = {
    summary: PRIVATE_RESULT,
    findings: [
      {
        severity: 'info',
        evidence: fixture.sentinel,
        correction: 'Synthetic evidence only',
      },
    ],
    suggestedBrief: 'Synthetic proposed brief',
    suggestedCopy: 'Synthetic proposed copy',
  };
  await manager.query(
    'INSERT INTO core."deliveryAgentRun" (id,"workspaceId","requestId","taskId","agentId","initiatorId","userWorkspaceId","taskRevision","agentVersion",configuration,context,status,result,activity,usage,error,decision,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,7,1,$8,$9,$10,$11,$12,NULL,NULL,$13,$14,$14)',
    [
      run.id,
      run.workspaceId,
      run.requestId,
      run.taskId,
      run.agentId,
      run.initiatorId,
      run.userWorkspaceId,
      run.configuration,
      context,
      run.status,
      result,
      JSON.stringify([{ at: run.createdAt, message: PRIVATE_ACTIVITY }]),
      run.decision,
      run.createdAt,
    ],
  );
}

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This actual-service checker always rolls back.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Local database only.',
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const query = runner.query.bind(runner);
  let readOnly = false;
  let summaryOnly = false;
  const captured = [];
  runner.query = async (...arguments_) => {
    const [sql] = arguments_;
    if (readOnly) {
      assert(
        !/^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql),
        'An assistant read attempted to mutate data.',
      );
      if (summaryOnly)
        assert(
          !/\bFROM\s+core\."deliveryOperations"/i.test(sql),
          'Summary reads must not load Operations state.',
        );
    }
    const result = await query(...arguments_);
    if (readOnly) captured.push({ sql, parameters: arguments_[1], result });
    return result;
  };
  try {
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const fixture = await createReviewFixture(runner.manager);
    await seed(runner.manager, fixture);
    const { workspace, workspaceId, foreignWorkspace, people, schemaName } =
      fixture;
    let transactionTail = Promise.resolve();
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      // One outer rollback cannot be shared safely by concurrent nested QueryRunner savepoints.
      transaction: (work) => {
        const result = transactionTail.then(() =>
          runner.manager.transaction(work),
        );
        transactionTail = result.catch(() => undefined);
        return result;
      },
    };
    const services = buildServices(source, fixture);
    const unavailable = () => {
      throw new Error(
        'No provider or queue operation is permitted in this rollback checker.',
      );
    };
    let queueCalls = 0;
    const queue = new Proxy(
      {},
      {
        get: () => () => {
          queueCalls++;
          return unavailable();
        },
      },
    );
    let modelAvailable = true;
    const models = {
      getAdminFilteredModels: () => [
        { modelId: 'fixture/text', providerName: 'Synthetic metadata only' },
      ],
      getModel: (id) =>
        id === 'fixture/text' && modelAvailable ? { modelId: id } : undefined,
      validateModelAvailability: () => {
        if (!modelAvailable)
          throw new Error('Synthetic model temporarily unavailable.');
      },
      getLanguageModel: unavailable,
    };
    const engine = new DeliveryAgentService(
      source,
      services.delivery,
      models,
      queue,
      new OtogrowAiBudgetService(source, services.access),
      services.access,
      createIsolatedNativeTaskAccess(),
    );
    engine.snapshot = unavailable;
    services.delivery.snapshot = unavailable;
    const reads = new DeliveryAssistantsService(
      source,
      services.delivery,
      engine,
      models,
      createIsolatedNativeTaskAccess(),
    );
    const call = (
      method,
      input = {},
      person = people.writer,
      targetWorkspace = workspace,
    ) =>
      reads[method](
        targetWorkspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const baseline = await sourceFingerprint(runner.manager, fixture);
    const readonly = async (work, summary = false) => {
      const start = captured.length;
      readOnly = true;
      summaryOnly = summary;
      try {
        const value = await work();
        if (summary) {
          for (const observation of captured.slice(start)) {
            const serialized = JSON.stringify(observation.result);
            for (const privateValue of [
              PRIVATE_CONFIGURATION,
              PRIVATE_CONTEXT,
              PRIVATE_RESULT,
              PRIVATE_ACTIVITY,
            ])
              assert(
                !serialized.includes(privateValue),
                `Summary SQL transferred ${privateValue}.`,
              );
            assert(
              !/\b(?:run|agent)\s*\.\s*\*/i.test(observation.sql),
              'A summary SQL projection selected an entire private entity.',
            );
          }
        }
        return value;
      } finally {
        readOnly = false;
        summaryOnly = false;
      }
    };
    const originalSnapshot = async () =>
      assert.deepEqual(
        await sourceFingerprint(runner.manager, fixture),
        baseline,
        'All original native/core/finance/access/Operations/provider sources must remain unchanged.',
      );
    const isolate = async (name, work) => {
      assert.match(name, /^[a-z_]+$/);
      await runner.query(`SAVEPOINT ${name}`);
      try {
        await work();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
      await originalSnapshot();
    };

    const context = await readonly(() => call('context'), true);
    assert.equal(context.canConfigure, false);
    assert.deepEqual(context.projects, []);
    assert.deepEqual(context.models, []);
    assert.equal(context.selectedTask, null);
    assert(
      !('tasks' in context) &&
        !('companies' in context) &&
        !('members' in context),
    );
    const adminContext = await readonly(
      () => call('context', {}, people.admin),
      true,
    );
    assert.equal(adminContext.canConfigure, true);
    assert(
      adminContext.projects.some(
        (project) => project.id === fixture.projects.first,
      ),
    );
    assert.equal(adminContext.models.length, 1);
    const selectedTask = await readonly(() =>
      call('context', { taskId: fixture.taskId }),
    );
    assert.equal(selectedTask.selectedTask.id, fixture.taskId);
    assert.equal(selectedTask.selectedTask.revision, 7);
    assert.equal(
      selectedTask.selectedTask.draftCopy,
      'PRIVATE_SELECTED_TASK_DRAFT: retain this exact copy',
    );
    assert(!('details' in selectedTask.selectedTask));

    const catalog = await readonly(() => call('catalog', { limit: 25 }), true);
    assert.equal(catalog.totalCount, 33);
    assert.equal(catalog.items.length, 25);
    assert(catalog.items.every((agent) => agent.enabled && agent.canRun));
    assert(!catalog.items.some((agent) => agent.id === fixture.agentId));
    await denied(() =>
      call('configuration', { agentId: fixture.activeAgentId }),
    );
    const configuration = await readonly(() =>
      call('configuration', { agentId: fixture.agentId }, people.admin),
    );
    assert.equal(configuration.configuration.enabled, false);
    assert(
      configuration.configuration.instructions.includes(PRIVATE_CONFIGURATION),
    );
    const catalogPages = [];
    let after;
    do {
      const page = await readonly(
        () => call('catalog', { limit: 25, after }, people.admin),
        true,
      );
      assert.equal(page.totalCount, fixture.catalogIds.length);
      catalogPages.push(page);
      after = page.nextCursor;
    } while (after);
    assert.equal(catalogPages.length, 3);
    assert.deepEqual(
      catalogPages.flatMap((page) => page.items.map((item) => item.id)).sort(),
      [...fixture.catalogIds].sort(),
    );
    const literalSearch = await readonly(
      () =>
        call(
          'catalog',
          { search: 'Catalog proof 00', kind: 'SEO' },
          people.admin,
        ),
      true,
    );
    assert.equal(literalSearch.totalCount, 10);
    await denied(() => call('assistant', { agentId: fixture.agentId }));
    await denied(() => call('assistant', { agentId: fixture.namedAgentId }));
    assert.equal(
      (
        await readonly(
          () =>
            call('assistant', { agentId: fixture.namedAgentId }, people.reader),
          true,
        )
      ).assistant.canRun,
      true,
    );
    assert.equal(
      (
        await readonly(
          () =>
            call('assistant', { agentId: fixture.namedAgentId }, people.admin),
          true,
        )
      ).assistant.canRun,
      false,
    );
    await denied(() =>
      call('assistant', { agentId: fixture.foreignAgentId }, people.admin),
    );

    const expected = await runner.query(
      'SELECT id FROM core."deliveryAgentRun" WHERE "workspaceId"=$1 AND "taskId"=$2 AND "initiatorId"=$3 ORDER BY "createdAt" DESC,id DESC',
      [workspaceId, fixture.taskId, people.writer.memberId],
    );
    assert.equal(expected.length, TIED_COUNT + 2);
    const ownPages = [];
    after = undefined;
    do {
      const page = await readonly(
        () => call('runs', { taskId: fixture.taskId, limit: 25, after }),
        true,
      );
      assert.equal(page.totalCount, expected.length);
      assert.deepEqual(
        Object.fromEntries(
          page.byStatus.map((entry) => [entry.status, entry.count]),
        ),
        { SUCCEEDED: 80, WAITING_REVIEW: 1 },
      );
      ownPages.push(page);
      after = page.nextCursor;
    } while (after);
    assert.equal(ownPages.length, 4);
    const historyRead = captured.find((entry) =>
      entry.sql.includes(
        'WITH source AS MATERIALIZED (SELECT run.id,run.status',
      ),
    );
    assert(historyRead, 'Capture the actual scoped history statement.');
    const explained = await runner.query(
      `EXPLAIN (ANALYZE, VERBOSE, FORMAT JSON) ${historyRead.sql}`,
      historyRead.parameters,
    );
    const planNodes = [];
    const collectPlan = (plan) => {
      planNodes.push(plan);
      for (const child of plan.Plans ?? []) collectPlan(child);
    };
    collectPlan(explained[0]['QUERY PLAN'][0].Plan);
    const primitiveSource = planNodes.find(
      (plan) => plan['Subplan Name'] === 'CTE source',
    );
    const projectedPage = planNodes.find(
      (plan) => plan['Subplan Name'] === 'CTE page',
    );
    assert(primitiveSource && projectedPage);
    assert.equal(primitiveSource['Actual Rows'], expected.length);
    assert(
      !/configuration|context|result|activity|decision|to_char/i.test(
        JSON.stringify(primitiveSource.Output),
      ),
      'Full-history counts must materialize only primitive columns.',
    );
    assert.equal(
      projectedPage['Actual Rows'],
      26,
      'Result metadata must be projected only after the 25-row page plus lookahead limit.',
    );
    const actualIds = ownPages.flatMap((page) =>
      page.items.map((item) => item.id),
    );
    assert.deepEqual(
      actualIds,
      expected.map((row) => row.id),
      'Microsecond-distinct and exact-tied rows must have no pagination gaps or duplicates.',
    );
    assert.equal(new Set(actualIds).size, expected.length);
    assert(
      actualIds.includes(fixture.oldOwnRun.id),
      'Own history older than 501 unrelated newer runs must remain reachable.',
    );
    const cursor = JSON.parse(
      Buffer.from(ownPages[0].nextCursor, 'base64url').toString(),
    );
    assert.match(
      cursor.createdAt,
      /\.\d{6}Z$/,
      'Postgres microseconds must survive the public cursor.',
    );
    await denied(
      () =>
        call(
          'runs',
          { taskId: fixture.taskId, after: ownPages[0].nextCursor, limit: 25 },
          people.reader,
        ),
      [400, 409],
    );
    await denied(
      () =>
        call('runs', {
          taskId: fixture.taskId,
          status: 'FAILED',
          after: ownPages[0].nextCursor,
          limit: 25,
        }),
      [400, 409],
    );
    const terminal = await readonly(
      () =>
        call('runs', {
          taskId: fixture.taskId,
          status: 'SUCCEEDED',
          agentId: fixture.agentId,
          limit: 25,
        }),
      true,
    );
    assert.equal(terminal.totalCount, 80);
    assert.deepEqual(terminal.byStatus, [{ status: 'SUCCEEDED', count: 80 }]);
    const readerHistory = await readonly(
      () => call('runs', { taskId: fixture.taskId, limit: 25 }, people.reader),
      true,
    );
    assert.equal(readerHistory.totalCount, OTHER_COUNT);
    assert(
      readerHistory.items.every(
        (run) => run.initiatorId === people.reader.memberId,
      ),
    );
    const adminHistory = await readonly(
      () => call('runs', { taskId: fixture.taskId, limit: 25 }, people.admin),
      true,
    );
    assert.equal(adminHistory.totalCount, OTHER_COUNT + TIED_COUNT + 2);
    assert.equal(
      (await readonly(() => call('runs', { limit: 25 }, people.outsider), true))
        .totalCount,
      0,
    );
    const foreignHistory = await readonly(
      () =>
        call('runs', { limit: 25 }, fixture.foreignPerson, foreignWorkspace),
      true,
    );
    assert.equal(foreignHistory.totalCount, 1);
    assert.equal(foreignHistory.items[0].id, fixture.foreignRun.id);
    await denied(() => call('run', { runId: fixture.otherInitiatorRun.id }));
    await denied(() => call('run', { runId: fixture.nonmemberRun.id }));
    await denied(() =>
      call('run', { runId: fixture.foreignRun.id }, people.admin),
    );
    await denied(() =>
      call('run', { runId: fixture.oldOwnRun.id }, people.outsider),
    );
    const oldDetail = await readonly(() =>
      call('run', { runId: fixture.oldOwnRun.id }),
    );
    assert.equal(oldDetail.configuration.enabled, false);
    assert.equal(oldDetail.context.brief, PRIVATE_CONTEXT);
    assert.equal(oldDetail.result.summary, PRIVATE_RESULT);
    assert.equal(oldDetail.canAcceptFindings, false);
    const waiting = await readonly(() =>
      call('run', { runId: fixture.waitingRun.id }),
    );
    assert.equal(waiting.canReject, true);
    assert.equal(waiting.canAcceptFindings, true);
    assert.equal(waiting.canAcceptBrief, false);
    assert.equal(waiting.canAcceptCopy, true);
    const request = await readonly(() =>
      call('request', { requestId: fixture.oldOwnRun.requestId }),
    );
    assert.equal(request.receipt.runId, fixture.oldOwnRun.id);
    assert.equal(
      (
        await readonly(() =>
          call(
            'request',
            { requestId: fixture.oldOwnRun.requestId },
            people.reader,
          ),
        )
      ).receipt,
      null,
    );
    assert.equal(
      (await readonly(() => call('request', { requestId: randomUUID() })))
        .receipt,
      null,
    );
    await originalSnapshot();

    await isolate('watermark', async () => {
      const first = await readonly(
        () => call('runs', { taskId: fixture.taskId, limit: 25 }),
        true,
      );
      const added = {
        ...fixture.oldOwnRun,
        id: randomUUID(),
        requestId: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      await insertRun(runner.manager, fixture, added);
      await runner.query(
        'UPDATE core."deliveryAgentRun" SET "createdAt"=$2::timestamptz+interval \'1 microsecond\',"updatedAt"=$2::timestamptz+interval \'1 microsecond\' WHERE id=$1',
        [added.id, first.observedAt],
      );
      const next = await readonly(
        () =>
          call('runs', {
            taskId: fixture.taskId,
            limit: 25,
            after: first.nextCursor,
          }),
        true,
      );
      assert.equal(next.totalCount, first.totalCount);
      assert.equal(next.observedAt, first.observedAt);
      assert(!next.items.some((run) => run.id === added.id));
      await runner.query('SELECT pg_sleep(0.01)');
      const fresh = await readonly(
        () => call('runs', { taskId: fixture.taskId, limit: 25 }),
        true,
      );
      assert.equal(fresh.totalCount, first.totalCount + 1);
      assert.equal(fresh.items[0].id, added.id);
    });
    await isolate('project_revocation', async () => {
      const prior = await readonly(() => call('runs', { limit: 25 }), true);
      await runner.query(
        'UPDATE core."deliveryProject" SET "memberIds"=$3,revision=revision+1 WHERE "workspaceId"=$1 AND id=$2',
        [
          workspaceId,
          fixture.projects.first,
          JSON.stringify([people.reader.memberId]),
        ],
      );
      await denied(
        () => call('runs', { after: prior.nextCursor, limit: 25 }),
        [400, 409],
      );
      await denied(() => call('runs', { taskId: fixture.taskId }));
      await denied(() => call('run', { runId: fixture.oldOwnRun.id }));
    });
    await isolate('role_revocation', async () => {
      await runner.query(
        'UPDATE core."otogrowRole" SET capabilities=$2,revision=revision+1 WHERE id=$1',
        [fixture.roles.writer, ['delivery.manage']],
      );
      await denied(
        () =>
          call('runs', {
            taskId: fixture.taskId,
            after: ownPages[0].nextCursor,
            limit: 25,
          }),
        [400, 409],
      );
      const managerHistory = await readonly(
        () => call('runs', { taskId: fixture.taskId }),
        true,
      );
      assert.equal(managerHistory.totalCount, adminHistory.totalCount);
    });
    await isolate('named_role_revocation', async () => {
      const before = await readonly(
        () => call('catalog', { limit: 25 }, people.reader),
        true,
      );
      assert.equal(before.totalCount, 34);
      await runner.query(
        'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1 AND "workspaceMemberId"=$2 AND "roleId"=$3',
        [workspaceId, people.reader.memberId, fixture.roles.reader],
      );
      await denied(
        () =>
          call(
            'catalog',
            { limit: 25, after: before.nextCursor },
            people.reader,
          ),
        [400, 409],
      );
      await denied(() =>
        call('assistant', { agentId: fixture.namedAgentId }, people.reader),
      );
      assert.equal(
        (
          await readonly(
            () => call('runs', { taskId: fixture.taskId }, people.reader),
            true,
          )
        ).totalCount,
        OTHER_COUNT,
        'Existing history is independent of current runnable named-role access.',
      );
    });
    await isolate('deleted_native_task', async () => {
      await runner.query(
        `UPDATE "${schemaName}".task SET "deletedAt"=now() WHERE id=$1`,
        [fixture.taskId],
      );
      await denied(() => call('context', { taskId: fixture.taskId }));
      await denied(() => call('run', { runId: fixture.oldOwnRun.id }));
      assert.equal(
        (await readonly(() => call('runs', {}, people.writer), true))
          .totalCount,
        0,
      );
    });
    await isolate('membership_revocation', async () => {
      await runner.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
        [people.writer.userWorkspaceId],
      );
      await denied(() => call('context'));
      await denied(() => call('run', { runId: fixture.oldOwnRun.id }));
      await denied(() =>
        call('request', { requestId: fixture.oldOwnRun.requestId }),
      );
    });

    const saveAs = (input, person = people.admin) =>
      call('save', input, person);
    const eventCount = async (agentId) =>
      (
        await runner.query(
          'SELECT count(*)::int AS count FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceId"=$2 AND action IN (\'AGENT_CREATED\',\'AGENT_UPDATED\')',
          [workspaceId, agentId],
        )
      )[0].count;
    await isolate('stable_create_replay', async () => {
      const createId = randomUUID();
      const input = {
        createId,
        configuration: {
          ...fixture.configuration,
          name: 'Stable synthetic create',
        },
      };
      const receipts = await Promise.all([saveAs(input), saveAs(copy(input))]);
      assert(
        receipts.every(
          (receipt) => receipt.saved === createId && receipt.version === 1,
        ),
      );
      assert.deepEqual(receipts.map((receipt) => receipt.replayed).sort(), [
        false,
        true,
      ]);
      assert.equal(
        (
          await runner.query(
            'SELECT count(*)::int AS count FROM core."deliveryAgent" WHERE id=$1',
            [createId],
          )
        )[0].count,
        1,
      );
      assert.equal(await eventCount(createId), 1);
      assert.deepEqual(
        Object.keys(receipts[0]).sort(),
        [
          'memberId',
          'replayed',
          'saved',
          'userWorkspaceId',
          'version',
          'workspaceId',
        ].sort(),
      );
      await denied(
        () =>
          saveAs({
            ...input,
            configuration: {
              ...input.configuration,
              purpose: 'Different body',
            },
          }),
        [409],
      );
      assert.equal(await eventCount(createId), 1);
      const updated = await saveAs({
        id: createId,
        version: 1,
        configuration: {
          ...input.configuration,
          name: 'Reviewed second version',
        },
      });
      assert.equal(updated.version, 2);
      assert.equal(await eventCount(createId), 2);
      await denied(() => saveAs(input), [409]);
      await denied(
        () =>
          saveAs({
            id: createId,
            version: 1,
            configuration: input.configuration,
          }),
        [409],
      );
      await denied(() => saveAs({ ...input, id: createId }), [400]);
      await denied(
        () =>
          saveAs({
            ...input,
            configuration: {
              ...input.configuration,
              projectIds: [fixture.projects.foreign],
            },
            createId: randomUUID(),
          }),
        [400],
      );
      await denied(
        () =>
          saveAs({
            ...input,
            configuration: { ...input.configuration, roleIds: [randomUUID()] },
            createId: randomUUID(),
          }),
        [400],
      );
    });
    await isolate('replay_without_provider', async () => {
      const input = {
        createId: randomUUID(),
        configuration: {
          ...fixture.configuration,
          name: 'Stable enabled text source',
          enabled: true,
          kind: 'COPY',
          tools: [],
          modelId: 'fixture/text',
        },
      };
      const created = await saveAs(input);
      modelAvailable = false;
      try {
        const replay = await saveAs(copy(input));
        assert.equal(replay.saved, created.saved);
        assert.equal(replay.replayed, true);
        assert.equal(await eventCount(created.saved), 1);
        await denied(
          () => saveAs({ ...input, createId: randomUUID() }),
          [400, 403],
        );
      } finally {
        modelAvailable = true;
      }
    });
    await isolate('replay_after_role_loss', async () => {
      await runner.query(
        'UPDATE core."otogrowRole" SET capabilities=$2,revision=revision+1 WHERE id=$1',
        [fixture.roles.writer, ['workspace.admin']],
      );
      const input = {
        createId: randomUUID(),
        configuration: {
          ...fixture.configuration,
          name: 'Synthetic role-owned setup',
        },
      };
      await saveAs(input, people.writer);
      await runner.query(
        'UPDATE core."otogrowRole" SET capabilities=$2,revision=revision+1 WHERE id=$1',
        [fixture.roles.writer, ['finance.manage']],
      );
      await denied(() => saveAs(input, people.writer));
      await denied(() =>
        call('configuration', { agentId: input.createId }, people.writer),
      );
      assert.equal(await eventCount(input.createId), 1);
    });
    await isolate('global_pk_collision', async () => {
      const before = await runner.query(
        'SELECT to_jsonb(agent)::text AS value FROM core."deliveryAgent" agent WHERE id=$1',
        [fixture.foreignAgentId],
      );
      await assert.rejects(
        () =>
          saveAs({
            createId: fixture.foreignAgentId,
            configuration: fixture.configuration,
          }),
        (error) => {
          assert([400, 409].includes(error.getStatus?.()));
          assert(
            !String(error.message).includes(
              'DO_NOT_LEAK_FOREIGN_PRIVATE_AGENT',
            ),
          );
          return true;
        },
      );
      assert.deepEqual(
        await runner.query(
          'SELECT to_jsonb(agent)::text AS value FROM core."deliveryAgent" agent WHERE id=$1',
          [fixture.foreignAgentId],
        ),
        before,
        'A supplied global primary key must never update or transfer a foreign workspace agent.',
      );
      assert.equal(await eventCount(fixture.foreignAgentId), 0);
    });
    await isolate('preview_only', async () => {
      const before = await sourceFingerprint(runner.manager, fixture);
      const preview = await call('preview', {
        taskId: fixture.taskId,
        agentId: fixture.previewAgentId,
        inputs: {
          copy: '',
          requirements: '',
          sourceUrl: 'https://example.com/evidence',
          targetUrl: 'https://example.com/brand',
        },
      });
      assert.equal(preview.taskId, fixture.taskId);
      assert.equal(preview.budget.maximumCostUsd, '0.000000');
      assert.equal(preview.budget.budgetReady, true);
      assert.equal(
        preview.context.brief,
        'PRIVATE_SELECTED_TASK_BRIEF: explicit source only',
      );
      assert.deepEqual(
        await sourceFingerprint(runner.manager, fixture),
        before,
        'A deterministic SEO preview must not fetch a page, enqueue work or persist a run.',
      );
    });
    await originalSnapshot();
    assert.equal(queueCalls, 0);
    console.log(
      JSON.stringify({
        result: 'PASS',
        rollbackOnly: true,
        newerOtherRuns: OTHER_COUNT,
        ownHistoricalRuns: TIED_COUNT + 1,
        microsecondAndExactTiePages: ownPages.length,
        scopedCatalogPages: catalogPages.length,
        summarySqlPrivateBodies: false,
        historyPlanPrimitiveSourceRows: primitiveSource['Actual Rows'],
        historyPlanProjectedSummaryRows: projectedPage['Actual Rows'],
        sourceWritesDuringReads: false,
        stableCreateReplay:
          'Controlled overlapping calls serialized in one outer rollback; one row and one activity. Not an independent-session race.',
        foreignGlobalPrimaryKeyPreserved: true,
        queueCalls,
        actualNetworkCalls: 0,
        paidCalls: 0,
      }),
    );
  } finally {
    runner.query = query;
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

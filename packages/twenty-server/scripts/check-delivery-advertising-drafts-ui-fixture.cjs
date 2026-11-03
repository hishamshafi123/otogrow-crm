const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const { isAbsolute } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  WORKSPACE_ID,
  additions,
  exactIds,
  fingerprint,
  isAuthenticationLifecycleTable,
  locked,
  noNativeAutomation,
  operations,
  quote,
  readTables,
  syncDirectory,
  withoutHeartbeat,
  writeJournal,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const {
  advertisingServices,
  manualReport,
} = require('./check-delivery-advertising-support.cjs');
const {
  saveAdvertisingReviewSchema,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.types');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const {
  deliveryAgentConfigurationSchema,
} = require('../dist/modules/delivery/agents/delivery-agent.types');
const {
  readDeliveryKnowledgeContext,
} = require('../dist/modules/delivery/knowledge/delivery-knowledge-context');
const {
  advertisingDraftBody,
  advertisingDraftContextFingerprint,
  buildAdvertisingDraftContext,
  validateAdvertisingDraftOutput,
} = require('../dist/modules/delivery/advertising/drafts/delivery-advertising-draft.policy');
const {
  startAdvertisingDraftSchema,
} = require('../dist/modules/delivery/advertising/drafts/delivery-advertising-draft.types');
const {
  DeliveryAdvertisingDraftRunEntity,
} = require('../dist/modules/delivery/advertising/drafts/entities/delivery-advertising-draft-run.entity');
const {
  DeliveryAgentEntity,
} = require('../dist/modules/delivery/entities/delivery-agent.entity');

const FILE = '/tmp/otogrow-advertising-drafts-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const WHEN = '2020-02-21T09:00:00.123Z';
const SOURCES = [
  'deliveryoperations',
  'deliveryadvertisingdraftrun',
  'deliveryadvertisingreview',
  'deliveryadvertisingaction',
  'deliveryadvertisingobservation',
  'deliveryadvertisingevent',
  'otogrowactivityevent',
];
const copy = (value) => JSON.parse(JSON.stringify(value));
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const fault = (stage) => {
  if (process.env.OTOGROW_ADVERTISING_DRAFTS_UI_TEST_FAILURE === stage)
    throw new Error(`Injected advertising-drafts fixture ${stage}`);
};
const modelIdFor = (fixture) => `__fixture_unregistered__/${fixture.nonce}`;
const configurationFor = (fixture) =>
  deliveryAgentConfigurationSchema.parse({
    name: `${fixture.title} historical suggestion archive`,
    purpose: `${fixture.marker}: synthetic browser evidence only; no inference occurred.`,
    kind: 'ADVERTISING',
    enabled: true,
    instructions: `${fixture.marker}: FIXTURE historical text only. This model is intentionally unregistered and must never dispatch.`,
    requiredInputs: ['report'],
    outputFormat: 'recommendations',
    tools: [],
    modelId: modelIdFor(fixture),
    projectIds: [fixture.projectId],
    roles: ['ADMIN', 'MANAGER'],
    roleIds: null,
    dailyRunLimit: 1,
    maxOutputTokens: 512,
    humanConfirmation: true,
  });
const recordFor = (fixture) =>
  manualReport(
    {
      projects: { first: fixture.projectId },
      people: { writer: fixture.people[0] },
    },
    {
      id: fixture.reportId,
      title: `${fixture.title} manually recorded report`,
      recommendation: `${fixture.marker}: FIXTURE manually recorded account evidence; no platform sync or model inference occurred.`,
      sourceUrl: `https://example.invalid/${fixture.marker}/report`,
      goal: 'PURCHASES',
      targetCost: 2500,
      createdAt: WHEN,
      updatedAt: WHEN,
    },
  );
const strippedOperations = (state, fixture) => {
  const value = copy(state);
  assert(Array.isArray(value.business?.records));
  value.business.records = value.business.records.filter(
    (record) => record.id !== fixture.reportId,
  );
  return value;
};
const seedEntries = (fixture) => [
  { schema: 'core', name: 'deliveryProject', ids: [fixture.projectId] },
  { schema: 'core', name: 'deliveryAgent', ids: [fixture.agentId] },
  { schema: 'core', name: 'deliveryAdvertisingDraftRun', ids: [fixture.runId] },
  { schema: fixture.schema, name: 'company', ids: [fixture.companyId] },
  {
    schema: 'core',
    name: 'user',
    ids: fixture.people.map((person) => person.userId),
  },
  {
    schema: 'core',
    name: 'userWorkspace',
    ids: fixture.people.map((person) => person.userWorkspaceId),
  },
  {
    schema: fixture.schema,
    name: 'workspaceMember',
    ids: fixture.people.map((person) => person.memberId),
  },
];

function read() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  assert.equal(new Date(fixture.createdAt).toISOString(), fixture.createdAt);
  assert.equal(fixture.marker, `advertising-drafts-ui:${fixture.nonce}`);
  assert.equal(
    fixture.title,
    `Disposable AI suggestions ${fixture.nonce.slice(0, 8)}`,
  );
  assert(
    ['CREATING', 'PREPARED', 'READY', 'CLEANUP_PREPARED', 'CLEANED'].includes(
      fixture.status,
    ),
  );
  assert.equal(fixture.people.length, 2);
  assert.equal(fixture.suggestionIds.length, 2);
  assert(Array.isArray(fixture.plans) && fixture.plans.length <= 5);
  assert(Array.isArray(fixture.cleanupAttempts));
  const ids = [
    'nonce',
    'companyId',
    'projectId',
    'agentId',
    'reportId',
    'runId',
    'startRequestId',
  ].map((key) => fixture[key]);
  ids.push(...fixture.suggestionIds);
  for (const person of fixture.people)
    ids.push(person.memberId, person.userId, person.userWorkspaceId);
  for (const id of ids) assert.match(id, UUID);
  assert.equal(new Set(ids).size, ids.length);
  if (fixture.schema) quote(fixture.schema);
  if (fixture.baseline) {
    for (const key of ['actorId', 'actorUserId', 'userWorkspaceId'])
      assert.match(fixture[key], UUID);
    assert.match(fixture.baseline.operations.id, UUID);
    assert.match(fixture.baseline.operations.hash, /^[a-f0-9]{64}$/);
    assert(Array.isArray(fixture.baseline.tables));
  }
  const requests = new Set();
  for (const plan of fixture.plans) {
    assert.equal(plan.operation, 'SAVE');
    assert.deepEqual(saveAdvertisingReviewSchema.parse(plan.input), plan.input);
    assert.equal(plan.hash, advertisingHash(plan.input));
    assert.equal(plan.definitionHash, fingerprint(plan.definition));
    assert(!requests.has(plan.input.requestId));
    requests.add(plan.input.requestId);
    validateInput(fixture, plan.input);
  }
  return fixture;
}
async function currentAdministrator(manager, fixture) {
  const administrators = await manager.query(
    `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
    [WORKSPACE_ID],
  );
  assert.equal(
    administrators.length,
    1,
    'Use the unchanged original native administrator.',
  );
  const administrator = administrators[0];
  if (fixture.actorId) {
    assert.equal(administrator.memberId, fixture.actorId);
    assert.equal(administrator.userId, fixture.actorUserId);
    assert.equal(administrator.userWorkspaceId, fixture.userWorkspaceId);
  }
  return administrator;
}
async function sourceContext(manager, fixture) {
  await currentAdministrator(manager, fixture);
  const [workspace] = await manager.query(
    'SELECT * FROM core.workspace WHERE id=$1',
    [WORKSPACE_ID],
  );
  const scoped = {
    manager,
    getRepository: (entity) => manager.getRepository(entity),
    transaction: (operation) => manager.transaction(operation),
  };
  const services = advertisingServices(scoped, {
    workspaceId: WORKSPACE_ID,
    people: {
      admin: {
        memberId: fixture.actorId,
        userWorkspaceId: fixture.userWorkspaceId,
      },
    },
  });
  const source = await services.sources.read(
    manager,
    workspace,
    fixture.actorId,
    fixture.userWorkspaceId,
    { kind: 'MANUAL', id: fixture.reportId },
    0,
    null,
    false,
  );
  assert(source.actor.isAdmin && source.canManageDraft);
  assert.equal(source.source.projectId, fixture.projectId);
  assert.equal(source.source.companyId, fixture.companyId);
  return { services, source };
}
function validateInput(fixture, input) {
  assert.equal(input.sourceKind, 'MANUAL');
  assert.equal(input.sourceId, fixture.reportId);
  assert.equal(input.goal.metricAdId, null);
  assert.equal(input.legacyHandling.mode, 'NONE');
  assert.equal(input.legacyHandling.taskId, null);
  assert(
    input.actions.length > 0,
    'This browser proof saves deliberate draft actions only.',
  );
  for (const action of input.actions) {
    assert(fixture.people.some((person) => person.memberId === action.ownerId));
    assert.equal(action.reviewerId, fixture.actorId);
    assert.equal(action.assistantId, null);
    assert.equal(action.adoptTaskId, null);
    if (action.origin) {
      assert.equal(action.origin.runId, fixture.runId);
      assert(fixture.suggestionIds.includes(action.origin.suggestionId));
    }
  }
  assert(
    input.actions.some((action) => action.origin),
    'Save at least one explicitly inserted fixture suggestion.',
  );
}
async function expectedDefinition(manager, fixture, input) {
  const { services, source } = await sourceContext(manager, fixture);
  assert.equal(input.sourceFingerprint, source.fingerprint);
  const goal = services.sources.validateGoal(source, input.goal);
  const run = await manager
    .getRepository(DeliveryAdvertisingDraftRunEntity)
    .findOneByOrFail({ id: fixture.runId, workspaceId: WORKSPACE_ID });
  assert.equal(advertisingHash(goal), run.basis.goalFingerprint);
  return {
    source: source.source,
    goal,
    note: input.note,
    noChangeReason: input.noChangeReason,
    legacyHandling: input.legacyHandling,
    actions: input.actions.map((action) => {
      if (!action.origin) return { ...action, origin: null };
      const suggestion = run.result.suggestions.find(
        (item) => item.id === action.origin.suggestionId,
      );
      assert(suggestion);
      return {
        ...action,
        origin: {
          ...action.origin,
          humanEdited: [
            'title',
            'rationale',
            'expectedResult',
            'evidence',
          ].some((field) => action[field] !== suggestion[field]),
        },
      };
    }),
  };
}
async function descendants(manager, fixture) {
  const query = (sql) => manager.query(sql, [WORKSPACE_ID, fixture.projectId]);
  return {
    reviews: await query(
      'SELECT * FROM core."deliveryAdvertisingReview" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY id',
    ),
    actions: await query(
      'SELECT action.* FROM core."deliveryAdvertisingAction" action JOIN core."deliveryAdvertisingReview" review ON review.id=action."reviewId" AND review."workspaceId"=action."workspaceId" WHERE review."workspaceId"=$1 AND review."projectId"=$2 ORDER BY action."reviewId",position',
    ),
    events: await query(
      'SELECT event.* FROM core."deliveryAdvertisingEvent" event JOIN core."deliveryAdvertisingReview" review ON review.id=event."reviewId" AND review."workspaceId"=event."workspaceId" WHERE review."workspaceId"=$1 AND review."projectId"=$2 ORDER BY (event.result->>\'revision\')::integer,event.id',
    ),
    observations: await query(
      'SELECT observation.* FROM core."deliveryAdvertisingObservation" observation JOIN core."deliveryAdvertisingReview" review ON review.id=observation."reviewId" AND review."workspaceId"=observation."workspaceId" WHERE review."workspaceId"=$1 AND review."projectId"=$2',
    ),
    tasks: await query(
      'SELECT id FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "projectId"=$2',
    ),
    runs: await query(
      'SELECT * FROM core."deliveryAdvertisingDraftRun" WHERE "workspaceId"=$1 AND "projectId"=$2',
    ),
    activity: await query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY "recordedAt",id',
    ),
  };
}
const duringFixture = (fixture, value) => {
  const at = value instanceof Date ? value.getTime() : Date.parse(value);
  assert(at >= Date.parse(fixture.createdAt) && at <= Date.now() + 1000);
};
async function validate(manager, fixture) {
  await noNativeAutomation(manager, fixture, SOURCES);
  const current = await operations(manager);
  assert.equal(current.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(withoutHeartbeat(strippedOperations(current.state, fixture))),
    fixture.baseline.operations.hash,
    'Unrelated Operations, access, cash, schedules, reports, notices and transports changed.',
  );
  const tables = await readTables(manager, fixture);
  const extra = additions(tables, fixture);
  const rows = await descendants(manager, fixture);
  const hasSeed =
    extra.find(
      (table) => table.schema === 'core' && table.name === 'deliveryProject',
    ).rows.length > 0;
  const expected = hasSeed ? seedEntries(fixture).map(copy) : [];
  const add = (name, records) =>
    expected.push({
      schema: 'core',
      name,
      ids: records.map((record) => record.id),
    });
  if (hasSeed) {
    await currentAdministrator(manager, fixture);
    exactIds(
      current.state.business.records.filter(
        (record) => record.id === fixture.reportId,
      ),
      [fixture.reportId],
    );
    assert.deepEqual(
      current.state.business.records.find(
        (record) => record.id === fixture.reportId,
      ),
      recordFor(fixture),
      'Draft saves cannot approve or edit the manual report.',
    );
    exactIds(rows.runs, [fixture.runId]);
    assert.equal(
      rows.tasks.length,
      0,
      'This proof permits no assignment or native task creation.',
    );
    assert.equal(rows.observations.length, 0);
    for (const event of rows.events) {
      const plan = fixture.plans.find(
        (item) => item.input.requestId === event.id,
      );
      assert(plan, 'Only an exact body journalled before Save is owned.');
      assert.equal(event.action, 'SAVED');
      assert.equal(event.actorId, fixture.actorId);
      assert.equal(event.reviewId, plan.input.id);
      assert.equal(event.inputHash, plan.hash);
      assert.deepEqual(event.definition, plan.definition);
      assert.deepEqual(event.result, {
        reviewId: plan.input.id,
        revision: plan.input.revision + 1,
        state: 'DRAFT',
        actionTasks: [],
        observationId: null,
      });
      duringFixture(fixture, event.createdAt);
    }
    exactIds(rows.reviews, [
      ...new Set(rows.events.map((event) => event.reviewId)),
    ]);
    for (const review of rows.reviews) {
      const events = rows.events.filter(
        (event) => event.reviewId === review.id,
      );
      const latest = events.at(-1);
      assert(latest);
      assert.deepEqual(
        events.map((event) => event.result.revision),
        events.map((_event, index) => index + 1),
      );
      assert.equal(review.state, 'DRAFT');
      assert.equal(review.revision, events.length);
      assert.equal(review.createdBy, fixture.actorId);
      assert.equal(review.assignedBy, null);
      assert.equal(review.assignedAt, null);
      assert.equal(review.sourceKind, 'MANUAL');
      assert.equal(review.sourceId, fixture.reportId);
      assert.equal(review.projectId, fixture.projectId);
      for (const field of [
        'source',
        'goal',
        'note',
        'noChangeReason',
        'legacyHandling',
      ])
        assert.deepEqual(review[field], latest.definition[field]);
      const actions = rows.actions.filter(
        (action) => action.reviewId === review.id,
      );
      exactIds(
        actions,
        latest.definition.actions.map((action) => action.id),
      );
      for (const [index, action] of actions.entries()) {
        assert.equal(action.position, index);
        assert.deepEqual(action.definition, latest.definition.actions[index]);
        assert.equal(action.taskId, null);
        assert.equal(action.assistantName, null);
        assert.equal(action.assistantVersion, null);
      }
    }
    assert.equal(rows.activity.length, rows.events.length);
    const revisions = new Set();
    for (const event of rows.events)
      revisions.add(String(event.result.revision));
    for (const activity of rows.activity) {
      assert.equal(activity.actorId, fixture.actorId);
      assert.equal(activity.actorType, 'HUMAN');
      assert.equal(activity.category, 'ADVERTISING');
      assert.equal(activity.action, 'ADVERTISING_WORK_SAVED');
      assert.equal(activity.sourceType, 'ad-report');
      assert.equal(activity.sourceId, fixture.reportId);
      assert.equal(activity.taskId, null);
      assert.equal(activity.clientId, fixture.companyId);
      assert.equal(activity.outcome, 'RECORDED');
      assert.deepEqual(
        activity.changes.find((change) => change.field === 'state'),
        { field: 'state', before: null, after: 'DRAFT' },
      );
      const revision = activity.changes.find(
        (change) => change.field === 'revision',
      );
      assert.equal(revision.before, null);
      assert(
        revisions.delete(revision.after),
        'Each exact saved revision has one structural activity event.',
      );
      duringFixture(fixture, activity.recordedAt);
    }
    assert.equal(revisions.size, 0);
    add('deliveryAdvertisingReview', rows.reviews);
    add('deliveryAdvertisingAction', rows.actions);
    add('deliveryAdvertisingEvent', rows.events);
    add('otogrowActivityEvent', rows.activity);
  } else {
    assert.equal(
      current.state.business.records.filter(
        (record) => record.id === fixture.reportId,
      ).length,
      0,
    );
    for (const records of Object.values(rows))
      assert.equal(
        records.length,
        0,
        'No partial seed or descendant can survive rollback/cleanup.',
      );
  }
  for (const table of extra) {
    const entry = expected.find(
      (item) => item.schema === table.schema && item.name === table.name,
    );
    exactIds(
      table.rows,
      entry?.ids ?? [],
      `Unexpected ${table.schema}.${table.name}; refuse broad cleanup.`,
    );
    if (
      hasSeed &&
      seedEntries(fixture).some(
        (item) => item.schema === table.schema && item.name === table.name,
      )
    )
      for (const row of table.rows)
        assert.equal(
          row.hash,
          fixture.seed[`${table.schema}.${table.name}:${row.id}`],
          'Owned seed was edited; do not infer cleanup ownership.',
        );
  }
  return { tables, extra, hasSeed };
}

async function seedHistoricalRun(manager, fixture) {
  const configuration = configurationFor(fixture);
  await manager
    .getRepository(DeliveryAgentEntity)
    .insert({
      id: fixture.agentId,
      workspaceId: WORKSPACE_ID,
      version: 1,
      configuration,
    });
  const { services, source } = await sourceContext(manager, fixture);
  const metric = source.metrics.find(
    (item) => item.goalKinds.includes('PURCHASES') && item.unit === 'COUNT',
  );
  assert(
    metric && metric.value === '0',
    'An explicit recorded purchase zero is required.',
  );
  const goalInput = {
    kind: 'PURCHASES',
    metricKey: metric.key,
    metricAdId: null,
    provenance: 'REPORT',
    value: metric.value,
    evidence: '',
    targetCostMicros: '25000000',
  };
  const goal = services.sources.validateGoal(source, goalInput);
  const knowledge = await readDeliveryKnowledgeContext(
    manager,
    WORKSPACE_ID,
    fixture.projectId,
  );
  assert.equal(
    knowledge.totalSources,
    0,
    'The disposable project must not borrow existing brand knowledge.',
  );
  const preparation = {
    sourceKind: 'MANUAL',
    sourceId: fixture.reportId,
    sourceFingerprint: source.fingerprint,
    agentId: fixture.agentId,
    goal: goalInput,
    instructions: `${fixture.marker}: FIXTURE historical archive for browser interactions. No AI inference, provider, charge or funding exists.`,
  };
  const agent = { id: fixture.agentId, version: 1, configuration };
  const context = buildAdvertisingDraftContext(
    preparation,
    source,
    goal,
    agent,
    knowledge,
  );
  const bodyFingerprint = advertisingHash(advertisingDraftBody(preparation));
  const contextFingerprint = advertisingDraftContextFingerprint(context, agent);
  const input = startAdvertisingDraftSchema.parse({
    ...preparation,
    id: fixture.runId,
    requestId: fixture.startRequestId,
    bodyFingerprint,
    contextFingerprint,
    agentVersion: 1,
    knowledgeFingerprint: knowledge.fingerprint,
    pricingRevision: 1,
  });
  const inputHash = advertisingHash(input);
  const result = validateAdvertisingDraftOutput(
    {
      summary: `${fixture.marker}: FIXTURE historical suggestions, authored for this browser proof. No model was called and no performance conclusion is verified.`,
      limitations: [
        'FIXTURE: A single manually recorded account report does not establish a trend, causal effect or winning creative. No media, website or ad account was inspected. No provider usage or cost exists for this archive.',
      ],
      citations: ['report:scope'],
      noChangeReason: null,
      suggestions: [
        {
          title: 'FIXTURE review a clearer product demonstration',
          rationale:
            'FIXTURE proposal: consider a deliberate product-demonstration test after a human reviews the supplied account evidence.',
          expectedResult:
            'FIXTURE proposal: record later purchases without promising uplift.',
          evidence:
            'FIXTURE: Only the cited manually recorded account scope was supplied. No individual creative was analyzed.',
          citations: ['report:scope'],
        },
        {
          title: 'FIXTURE prepare one alternative opening hook',
          rationale:
            'FIXTURE proposal: draft an alternative hook as a test hypothesis, not as an observed winning idea.',
          expectedResult:
            'FIXTURE proposal: compare a later explicit observation after assignment and delivery.',
          evidence:
            'FIXTURE: The account report cannot identify the cause of its recorded results.',
          citations: ['report:scope'],
        },
      ],
    },
    context,
  );
  result.suggestions.forEach((suggestion, index) => {
    suggestion.id = fixture.suggestionIds[index];
  });
  const administrator = await currentAdministrator(manager, fixture);
  await manager.getRepository(DeliveryAdvertisingDraftRunEntity).insert({
    id: fixture.runId,
    workspaceId: WORKSPACE_ID,
    requestId: fixture.startRequestId,
    projectId: fixture.projectId,
    companyId: fixture.companyId,
    sourceKind: 'MANUAL',
    sourceId: fixture.reportId,
    initiatorId: fixture.actorId,
    initiatorName: administrator.name,
    userWorkspaceId: fixture.userWorkspaceId,
    agentId: fixture.agentId,
    agentVersion: 1,
    revision: 3,
    status: 'SUCCEEDED',
    inputHash,
    bodyFingerprint,
    contextFingerprint,
    input,
    configuration,
    agent: {
      id: fixture.agentId,
      name: configuration.name,
      version: 1,
      modelId: configuration.modelId,
      maxOutputTokens: configuration.maxOutputTokens,
    },
    basis: {
      sourceFingerprint: source.fingerprint,
      evidenceFingerprint: source.evidenceFingerprint,
      goalFingerprint: advertisingHash(goal),
      knowledgeFingerprint: knowledge.fingerprint,
      promptVersion: context.promptVersion,
      outputVersion: context.outputVersion,
    },
    context,
    startReceipt: {
      action: 'STARTED',
      requestId: fixture.startRequestId,
      runId: fixture.runId,
      actorId: fixture.actorId,
      userWorkspaceId: fixture.userWorkspaceId,
      inputHash,
      bodyFingerprint,
      createdAt: WHEN,
      revision: 1,
      status: 'QUEUED',
    },
    result,
    usage: null,
    error: null,
    cancelRequestId: null,
    cancelInputHash: null,
    cancelReceipt: null,
    createdAt: new Date(WHEN),
    updatedAt: new Date(WHEN),
    startedAt: new Date(WHEN),
    finishedAt: new Date(WHEN),
  });
  fixture.goal = goalInput;
  fixture.sourceFingerprint = source.fingerprint;
}
async function create() {
  assert(
    !existsSync(FILE),
    'Recover the active advertising-drafts fixture first.',
  );
  const nonce = randomUUID();
  const fixture = {
    version: 1,
    workspaceId: WORKSPACE_ID,
    nonce,
    createdAt: new Date().toISOString(),
    marker: `advertising-drafts-ui:${nonce}`,
    title: `Disposable AI suggestions ${nonce.slice(0, 8)}`,
    status: 'CREATING',
    companyId: randomUUID(),
    projectId: randomUUID(),
    agentId: randomUUID(),
    reportId: randomUUID(),
    runId: randomUUID(),
    startRequestId: randomUUID(),
    suggestionIds: [randomUUID(), randomUUID()],
    people: Array.from({ length: 2 }, () => ({
      memberId: randomUUID(),
      userId: randomUUID(),
      userWorkspaceId: randomUUID(),
    })),
    plans: [],
    seed: {},
    cleanupAttempts: [],
  };
  write(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT "databaseSchema","activationStatus" FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert.equal(workspace?.activationStatus, 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    quote(fixture.schema);
    const administrator = await currentAdministrator(manager, fixture);
    fixture.actorId = administrator.memberId;
    fixture.actorUserId = administrator.userId;
    fixture.userWorkspaceId = administrator.userWorkspaceId;
    const original = await operations(manager);
    assert(Array.isArray(original.state.business?.records));
    assert(
      !original.state.business.records.some(
        (record) => record.id === fixture.reportId,
      ),
    );
    await noNativeAutomation(manager, fixture, SOURCES);
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      operations: {
        id: original.id,
        hash: fingerprint(withoutHeartbeat(original.state)),
      },
    };
    assert(
      fixture.baseline.tables.length >= 176,
      'Protect the complete current workspace/core/native inventory.',
    );
    fixture.status = 'PREPARED';
    write(fixture);
    for (const [index, person] of fixture.people.entries()) {
      const email = `${person.userId}+advertising-drafts-ui@example.invalid`;
      await manager.query(
        'INSERT INTO core."user" (id,email,disabled) VALUES($1,$2,false)',
        [person.userId, email],
      );
      await manager.query(
        'INSERT INTO core."userWorkspace" (id,"workspaceId","userId") VALUES($1,$2,$3)',
        [person.userWorkspaceId, WORKSPACE_ID, person.userId],
      );
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES($1,$2,$3,$4,$5)`,
        [
          person.memberId,
          person.userId,
          email,
          `AI suggestion test owner ${index + 1}`,
          nonce.slice(0, 8),
        ],
      );
    }
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.company (id,name) VALUES($1,$2)`,
      [fixture.companyId, fixture.title],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,$4,$5)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.title,
        fixture.companyId,
        JSON.stringify(fixture.people.map((person) => person.memberId)),
      ],
    );
    const next = copy(original.state);
    next.business.records.push(recordFor(fixture));
    assert(JSON.stringify(next).length < 10000000);
    await manager.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
      [original.id, next],
    );
    await seedHistoricalRun(manager, fixture);
    const seeded = await readTables(manager, fixture);
    for (const entry of seedEntries(fixture))
      for (const id of entry.ids) {
        const row = seeded
          .find(
            (table) =>
              table.schema === entry.schema && table.name === entry.name,
          )
          .rows.find((row) => row.id === id);
        assert(row);
        fixture.seed[`${entry.schema}.${entry.name}:${id}`] = row.hash;
      }
    write(fixture);
    await validate(manager, fixture);
    fault('create-before-commit');
  });
  fault('create-after-commit');
  fixture.status = 'READY';
  write(fixture);
  print(fixture);
}
function print(fixture) {
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        status: fixture.status,
        title: fixture.title,
        projectId: fixture.projectId,
        reportId: fixture.reportId,
        runId: fixture.runId,
        agentId: fixture.agentId,
        actorId: fixture.actorId,
        people: fixture.people.map((person) => ({ memberId: person.memberId })),
        suggestionIds: fixture.suggestionIds,
        goal: fixture.goal,
        plans: fixture.plans.map((plan) => ({
          operation: plan.operation,
          requestId: plan.input.requestId,
          id: plan.input.id,
        })),
        urls: {
          historicalResult: `http://apple.localhost:3001/delivery?view=ads&adSource=MANUAL&adReport=${fixture.reportId}&adDraftRun=${fixture.runId}`,
        },
        allowed:
          'Inspect the explicitly synthetic historical result. Use the real Prepare recommendations button, choose the matching account PURCHASES goal, preserve manual text and explicitly insert proposals. Only an exact pre-journalled draft SAVE is permitted. No Assign, observed result, native task, model preview/start, cancellation, assistant edit, budget/pricing, provider, access/login/invite, transport or finance action.',
        model:
          'Intentionally nonregistered. No inference, pricing, funding or recorded usage exists for this synthetic archive. Do not repair model setup for this fixture.',
      },
      null,
      2,
    ),
  );
}
async function inspect(fixture) {
  const observation = await connectionSource.transaction(async (manager) => {
    await locked(manager);
    return validate(manager, fixture);
  });
  if (observation.hasSeed && fixture.status === 'PREPARED')
    fixture.status = 'READY';
  fixture.inspection = {
    at: new Date().toISOString(),
    hasSeed: observation.hasSeed,
  };
  write(fixture);
  print(fixture);
}
async function plan(fixture, path) {
  assert.equal(fixture.status, 'READY');
  assert(isAbsolute(path));
  const file = lstatSync(path);
  assert(
    file.isFile() &&
      !file.isSymbolicLink() &&
      (file.mode & 0o077) === 0 &&
      file.size <= 1048576,
  );
  const supplied = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(Object.keys(supplied).sort(), ['input', 'operation']);
  assert.equal(
    supplied.operation,
    'SAVE',
    'The browser fixture permits no assignment, execution or observations.',
  );
  const input = saveAdvertisingReviewSchema.parse(supplied.input);
  validateInput(fixture, input);
  const existing = fixture.plans.find(
    (item) => item.input.requestId === input.requestId,
  );
  if (existing) {
    assert.deepEqual(existing.input, input);
    print(fixture);
    return;
  }
  assert(fixture.plans.length < 5);
  if (fixture.plans.length)
    assert.equal(
      input.id,
      fixture.plans[0].input.id,
      'Only one owned recommendation draft is permitted.',
    );
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const observation = await validate(manager, fixture);
    assert(observation.hasSeed);
    assert.equal(
      (
        await manager.query(
          'SELECT id FROM core."deliveryAdvertisingEvent" WHERE id=$1',
          [input.requestId],
        )
      ).length,
      0,
      'Journal before Save writes.',
    );
    const [review] = await manager.query(
      'SELECT * FROM core."deliveryAdvertisingReview" WHERE id=$1',
      [input.id],
    );
    if (input.revision === 0) assert.equal(review, undefined);
    else {
      assert(
        review &&
          review.workspaceId === WORKSPACE_ID &&
          review.projectId === fixture.projectId &&
          review.sourceId === fixture.reportId &&
          review.state === 'DRAFT',
      );
      assert.equal(input.revision, review.revision);
    }
    const definition = await expectedDefinition(manager, fixture, input);
    fixture.plans.push({
      operation: 'SAVE',
      input,
      hash: advertisingHash(input),
      definition,
      definitionHash: fingerprint(definition),
      plannedAt: new Date().toISOString(),
    });
    write(fixture);
  });
  print(fixture);
}
async function assertNoSeed(manager, fixture) {
  for (const [table, id] of [
    ['deliveryProject', fixture.projectId],
    ['deliveryAgent', fixture.agentId],
    ['deliveryAdvertisingDraftRun', fixture.runId],
    ...fixture.people.flatMap((person) => [
      ['user', person.userId],
      ['userWorkspace', person.userWorkspaceId],
    ]),
  ])
    assert.equal(
      (
        await manager.query(`SELECT id FROM core.${quote(table)} WHERE id=$1`, [
          id,
        ])
      ).length,
      0,
      'An unjournalled seed requires manual review.',
    );
  if (fixture.schema) {
    assert.equal(
      (
        await manager.query(
          `SELECT id FROM ${quote(fixture.schema)}.company WHERE id=$1`,
          [fixture.companyId],
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await manager.query(
          `SELECT id FROM ${quote(fixture.schema)}."workspaceMember" WHERE id=ANY($1::uuid[])`,
          [fixture.people.map((person) => person.memberId)],
        )
      ).length,
      0,
    );
  }
  const current = await operations(manager);
  assert(
    !current.state.business.records.some(
      (record) => record.id === fixture.reportId,
    ),
  );
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      await assertNoSeed(manager, fixture);
      fixture.noCommittedSeed = true;
      return;
    }
    const observation = await validate(manager, fixture);
    const authentication = observation.tables.filter(
      isAuthenticationLifecycleTable,
    );
    if (observation.hasSeed) {
      fixture.status = 'CLEANUP_PREPARED';
      fixture.cleanupAttempts.push({
        preparedAt: new Date().toISOString(),
        rows: observation.extra.filter((table) => table.rows.length),
        authenticationLifecycle: authentication,
      });
      assert(fixture.cleanupAttempts.length <= 20);
      write(fixture);
      const order = [
        'deliveryAdvertisingEvent',
        'deliveryAdvertisingAction',
        'deliveryAdvertisingReview',
        'otogrowActivityEvent',
        'deliveryAdvertisingDraftRun',
        'deliveryAgent',
        'deliveryProject',
        'company',
        'workspaceMember',
        'userWorkspace',
        'user',
      ];
      for (const table of observation.extra
        .filter((table) => table.rows.length)
        .sort(
          (left, right) => order.indexOf(left.name) - order.indexOf(right.name),
        )) {
        assert(order.includes(table.name));
        const ids = table.rows.map((row) => row.id);
        const removed = await manager.query(
          `WITH removed AS(DELETE FROM ${quote(table.schema)}.${quote(table.name)} WHERE id=ANY($1::uuid[]) RETURNING id)SELECT id FROM removed`,
          [ids],
        );
        exactIds(removed, ids);
      }
      const current = await operations(manager);
      const restored = strippedOperations(current.state, fixture);
      assert.equal(
        fingerprint(withoutHeartbeat(restored)),
        fixture.baseline.operations.hash,
      );
      await manager.query(
        'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
        [current.id, restored],
      );
    } else
      fixture.cleanupRecoveredAfterCommit = fixture.cleanupAttempts.length > 0;
    const after = await readTables(manager, fixture);
    for (const [index, table] of after.entries())
      assert.equal(
        table.hash,
        isAuthenticationLifecycleTable(table)
          ? authentication.find((item) => item.name === table.name).hash
          : fixture.baseline.tables[index].hash,
        `Original ${table.schema}.${table.name} was not restored exactly.`,
      );
    assert.equal(
      fingerprint(withoutHeartbeat((await operations(manager)).state)),
      fixture.baseline.operations.hash,
    );
    fixture.recoveryAuthenticationLifecycle = authentication.map((table) => ({
      table: table.name,
      beforeHash: table.hash,
      afterHash: after.find((item) => item.name === table.name).hash,
    }));
    write(fixture);
    fault('cleanup-before-commit');
  });
  fault('cleanup-after-commit');
  fixture.status = 'CLEANED';
  write(fixture);
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  if (existsSync(receipt))
    assert.equal(
      fingerprint(JSON.parse(readFileSync(receipt, 'utf8'))),
      fingerprint(fixture),
    );
  else writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    `Removed only exact owned synthetic archive/report/assistant/company/project/teammates and planned draft receipts/actions/activity. Original protected tables, current authentication lifecycle and Operations were preserved. No native task, provider, queue, spend, budget or pricing row was created. Private receipt: ${receipt}`,
  );
}
async function main() {
  const command = process.argv[2];
  assert(['create', 'inspect', 'plan', 'cleanup'].includes(command));
  assert.equal(process.argv.length, command === 'plan' ? 4 : 3);
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Local database only.',
  );
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error(
      'Provider/network access is forbidden in this synthetic browser fixture.',
    );
  };
  try {
    await connectionSource.initialize();
    if (command === 'create') await create();
    else {
      const fixture = read();
      if (command === 'inspect') await inspect(fixture);
      else if (command === 'plan') await plan(fixture, process.argv[3]);
      else await cleanup(fixture);
    }
  } finally {
    try {
      if (connectionSource.isInitialized) await connectionSource.destroy();
    } finally {
      global.fetch = originalFetch;
    }
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`Preserve ${FILE}; no unverified cleanup is permitted.`);
    process.exitCode = 1;
  });

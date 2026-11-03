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
  insight,
  metaReport,
  manualReport,
} = require('./check-delivery-advertising-support.cjs');
const {
  saveAdvertisingReviewSchema,
  assignAdvertisingReviewSchema,
  observeAdvertisingActionSchema,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.types');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');

const FILE = '/tmp/otogrow-advertising-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const META_COUNT = 30;
const MANUAL_COUNT = 25;
const WHEN = '2020-02-21T09:00:00.123Z';
const SOURCE_TABLES = [
  'deliveryoperations',
  'deliverymetareport',
  'deliveryadvertisingreview',
  'deliveryadvertisingaction',
  'deliveryadvertisingobservation',
  'deliveryadvertisingevent',
  'otogrowactivityevent',
];
const COMMANDS = {
  SAVE: { schema: saveAdvertisingReviewSchema, action: 'SAVED' },
  ASSIGN: { schema: assignAdvertisingReviewSchema, action: 'ASSIGNED' },
  OBSERVE: { schema: observeAdvertisingActionSchema, action: 'OBSERVED' },
};
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const copy = (value) => JSON.parse(JSON.stringify(value));
const without = (value, keys) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
const fault = (stage) => {
  if (process.env.OTOGROW_ADVERTISING_UI_TEST_FAILURE === stage)
    throw new Error(`Injected advertising fixture ${stage}`);
};
const sourceIds = (fixture) => [...fixture.metaIds, ...fixture.manualIds];
const sourceKind = (fixture, id) =>
  fixture.metaIds.includes(id)
    ? 'META'
    : fixture.manualIds.includes(id)
      ? 'MANUAL'
      : null;
const at = (value) => (value instanceof Date ? value.toISOString() : value);
const duringFixture = (fixture, value) => {
  assert(Date.parse(at(value)) >= Date.parse(fixture.createdAt));
  assert(Date.parse(at(value)) <= Date.now() + 1000);
};
const recordFor = (fixture, index) =>
  manualReport(
    {
      projects: { first: fixture.projectId },
      people: { writer: fixture.people[0] },
    },
    {
      id: fixture.manualIds[index],
      title: `${fixture.title} manual ${String(index).padStart(2, '0')}`,
      date: index === 24 ? '2020-02-22' : '2020-02-20',
      recommendation: `${fixture.marker}: manually recorded evidence; no platform sync.`,
      sourceUrl: `https://example.invalid/${fixture.marker}/manual-${index}`,
      targetCost: index === 0 ? 2500 : 0,
      createdAt: WHEN,
      updatedAt: WHEN,
    },
  );
const reportFor = (fixture, index) =>
  metaReport(
    {
      projects: { first: fixture.projectId },
      people: {
        reader: { memberId: fixture.actorId },
        writer: fixture.people[0],
      },
    },
    {
      id: fixture.metaIds[index],
      date: index === 29 ? '2020-02-22' : '2020-02-20',
      note: `${fixture.marker}: synthetic stored Meta evidence; no provider access.`,
      ads:
        index === 0
          ? Array.from({ length: 55 }, (_, adIndex) =>
              insight({
                ad_id: String(900000 + adIndex),
                ad_name: `${fixture.title} ad ${String(adIndex).padStart(2, '0')}`,
                campaign_id: '9000',
                campaign_name: `${fixture.title} campaign`,
                reportedFields: {
                  spend: true,
                  impressions: true,
                  clicks: true,
                  actions: true,
                  action_values: true,
                },
              }),
            )
          : [],
      account: insight({
        reportedFields: {
          spend: true,
          impressions: true,
          clicks: true,
          actions: true,
          action_values: true,
        },
      }),
    },
  );

function read() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  assert.equal(new Date(fixture.createdAt).toISOString(), fixture.createdAt);
  assert.equal(fixture.marker, `advertising-ui:${fixture.nonce}`);
  assert.equal(
    fixture.title,
    `Disposable Advertising ${fixture.nonce.slice(0, 8)}`,
  );
  assert(
    ['CREATING', 'PREPARED', 'READY', 'CLEANUP_PREPARED', 'CLEANED'].includes(
      fixture.status,
    ),
  );
  assert.equal(fixture.metaIds.length, META_COUNT);
  assert.equal(fixture.manualIds.length, MANUAL_COUNT);
  assert.equal(fixture.people.length, 2);
  assert(
    Array.isArray(fixture.plans) && Array.isArray(fixture.cleanupAttempts),
  );
  const ids = [
    fixture.nonce,
    fixture.companyId,
    fixture.projectId,
    ...sourceIds(fixture),
  ];
  for (const person of fixture.people)
    ids.push(person.memberId, person.userId, person.userWorkspaceId);
  for (const id of ids) assert.match(id, UUID);
  assert.equal(new Set(ids).size, ids.length);
  if (fixture.schema) quote(fixture.schema);
  if (fixture.baseline) {
    for (const key of ['actorId', 'actorUserId', 'userWorkspaceId'])
      assert.match(fixture[key], UUID);
    assert.match(fixture.baseline.operations.hash, /^[a-f0-9]{64}$/);
  }
  const requests = new Set();
  for (const plan of fixture.plans) {
    assert(COMMANDS[plan.operation]);
    assert.deepEqual(
      COMMANDS[plan.operation].schema.parse(plan.input),
      plan.input,
    );
    assert.equal(plan.hash, advertisingHash(plan.input));
    assert(!requests.has(plan.input.requestId));
    requests.add(plan.input.requestId);
  }
  return fixture;
}

function strippedOperations(state, fixture) {
  const value = copy(state);
  assert(
    Array.isArray(value.business?.records),
    'Preserve the existing business container.',
  );
  value.business.records = value.business.records.filter(
    (record) => !fixture.manualIds.includes(record.id),
  );
  return value;
}
async function owned(manager, fixture) {
  const project = [WORKSPACE_ID, fixture.projectId];
  const query = (sql, values = project) => manager.query(sql, values);
  return {
    reviews: await query(
      'SELECT * FROM core."deliveryAdvertisingReview" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY "createdAt",id',
    ),
    actions: await query(
      'SELECT action.* FROM core."deliveryAdvertisingAction" action JOIN core."deliveryAdvertisingReview" review ON review."workspaceId"=action."workspaceId" AND review.id=action."reviewId" WHERE review."workspaceId"=$1 AND review."projectId"=$2 ORDER BY action."reviewId",position',
    ),
    observations: await query(
      'SELECT observation.* FROM core."deliveryAdvertisingObservation" observation JOIN core."deliveryAdvertisingReview" review ON review."workspaceId"=observation."workspaceId" AND review.id=observation."reviewId" WHERE review."workspaceId"=$1 AND review."projectId"=$2 ORDER BY observation."createdAt",observation.id',
    ),
    events: await query(
      'SELECT event.* FROM core."deliveryAdvertisingEvent" event JOIN core."deliveryAdvertisingReview" review ON review."workspaceId"=event."workspaceId" AND review.id=event."reviewId" WHERE review."workspaceId"=$1 AND review."projectId"=$2 ORDER BY event."createdAt",event.id',
    ),
    deliveryTasks: await query(
      'SELECT * FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY id',
    ),
    nativeTasks: await query(
      `SELECT task.* FROM ${quote(fixture.schema)}.task task JOIN core."deliveryTask" delivery ON delivery."taskId"=task.id WHERE delivery."workspaceId"=$1 AND delivery."projectId"=$2 ORDER BY task.id`,
    ),
    activity: await query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY "recordedAt",id',
    ),
    meta: await query(
      'SELECT * FROM core."deliveryMetaReport" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) ORDER BY id',
      [WORKSPACE_ID, fixture.metaIds],
    ),
  };
}
const seedEntries = (fixture) => [
  { schema: 'core', name: 'deliveryProject', ids: [fixture.projectId] },
  { schema: fixture.schema, name: 'company', ids: [fixture.companyId] },
  { schema: 'core', name: 'deliveryMetaReport', ids: fixture.metaIds },
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
function validateCommand(fixture, operation, input) {
  assert(COMMANDS[operation]);
  if (operation === 'SAVE') {
    assert.equal(sourceKind(fixture, input.sourceId), input.sourceKind);
    assert.equal(input.legacyHandling.mode, 'NONE');
    assert.equal(input.legacyHandling.taskId, null);
    for (const action of input.actions) {
      assert(
        fixture.people.some((person) => person.memberId === action.ownerId),
      );
      assert.equal(action.reviewerId, fixture.actorId);
      assert.equal(
        action.assistantId,
        null,
        'No inference, assistant or provider action is permitted.',
      );
      assert.equal(
        action.adoptTaskId,
        null,
        'These sources do not have a legacy task.',
      );
    }
  } else {
    const reviewId = operation === 'ASSIGN' ? input.id : input.reviewId;
    assert(
      fixture.plans.some(
        (plan) => plan.operation === 'SAVE' && plan.input.id === reviewId,
      ),
    );
    if (operation === 'OBSERVE') {
      assert(
        fixture.plans.some(
          (plan) =>
            plan.operation === 'SAVE' &&
            plan.input.id === reviewId &&
            plan.input.actions.some((action) => action.id === input.actionId),
        ),
      );
      if (input.sourceId)
        assert(sourceKind(fixture, input.sourceId) === input.sourceKind);
      if (input.correctsId)
        assert(
          fixture.plans.some(
            (plan) =>
              plan.operation === 'OBSERVE' &&
              plan.input.id === input.correctsId,
          ),
        );
    }
  }
}
function assertDefinition(definition, input, fixture) {
  assert.equal(definition.source.kind, input.sourceKind);
  assert.equal(definition.source.id, input.sourceId);
  assert.equal(definition.source.projectId, fixture.projectId);
  assert.equal(definition.source.companyId, fixture.companyId);
  assert.equal(definition.source.fingerprint, input.sourceFingerprint);
  assert.deepEqual(
    without(definition.goal, [
      'metricLabel',
      'metricProvenance',
      'metricReason',
      'metricUnit',
      'currency',
      'fromDate',
      'throughDate',
      'sourceFingerprint',
      'timezone',
    ]),
    input.goal,
  );
  assert.equal(definition.note, input.note);
  assert.equal(definition.noChangeReason, input.noChangeReason);
  assert.deepEqual(definition.legacyHandling, input.legacyHandling);
  assert.deepEqual(definition.actions, input.actions);
}

async function validate(manager, fixture) {
  await noNativeAutomation(manager, fixture, SOURCE_TABLES);
  const currentOperations = await operations(manager);
  assert.equal(currentOperations.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(
      withoutHeartbeat(strippedOperations(currentOperations.state, fixture)),
    ),
    fixture.baseline.operations.hash,
    'All unrelated Operations, cash, access, schedules, transports, reports and notices must remain unchanged.',
  );
  const tables = await readTables(manager, fixture);
  const extra = additions(tables, fixture);
  const rows = await owned(manager, fixture);
  const projectExtra = extra.find(
    (table) => table.schema === 'core' && table.name === 'deliveryProject',
  ).rows;
  const hasSeed = projectExtra.length > 0;
  const expected = hasSeed ? seedEntries(fixture).map(copy) : [];
  const add = (schema, name, records) =>
    expected.push({ schema, name, ids: records.map((record) => record.id) });
  const assignments = [];
  if (hasSeed) {
    exactIds(projectExtra, [fixture.projectId]);
    for (const event of rows.events) {
      const plan = fixture.plans.find(
        (item) => item.input.requestId === event.id,
      );
      assert(
        plan,
        'Every committed command must have its exact body journalled before writing.',
      );
      validateCommand(fixture, plan.operation, plan.input);
      assert.equal(event.inputHash, plan.hash);
      assert.equal(event.action, COMMANDS[plan.operation].action);
      assert.equal(event.actorId, fixture.actorId);
      assert.equal(
        event.reviewId,
        plan.operation === 'OBSERVE' ? plan.input.reviewId : plan.input.id,
      );
      duringFixture(fixture, event.createdAt);
      if (plan.operation === 'SAVE')
        assertDefinition(event.definition, plan.input, fixture);
      else if (plan.operation === 'ASSIGN') assignments.push(event);
      else {
        assert.equal(event.definition, null);
        const observation = rows.observations.find(
          (item) => item.id === plan.input.id,
        );
        assert(observation);
        assert.deepEqual(observation.observation, plan.input);
        assert.equal(observation.actorId, fixture.actorId);
        assert.equal(observation.actionId, plan.input.actionId);
        assert.equal(event.result.observationId, observation.id);
      }
    }
    const plannedReviewIds = [
      ...new Set(
        rows.events
          .filter((event) => event.action === 'SAVED')
          .map((event) => event.reviewId),
      ),
    ];
    exactIds(rows.reviews, plannedReviewIds);
    for (const review of rows.reviews) {
      const events = rows.events.filter(
        (event) => event.reviewId === review.id && event.action !== 'OBSERVED',
      );
      const saved = events.filter((event) => event.action === 'SAVED').at(-1);
      assert(saved);
      const assigned = events.filter((event) => event.action === 'ASSIGNED');
      assert(assigned.length <= 1);
      assert.equal(review.state, assigned.length ? 'ASSIGNED' : 'DRAFT');
      assert.equal(review.revision, events.length);
      assert.equal(review.createdBy, fixture.actorId);
      assert.equal(review.assignedBy, assigned.length ? fixture.actorId : null);
      if (assigned.length) duringFixture(fixture, review.assignedAt);
      else assert.equal(review.assignedAt, null);
      assert.deepEqual(review.source, saved.definition.source);
      assert.deepEqual(review.goal, saved.definition.goal);
      assert.equal(review.note, saved.definition.note);
      assert.equal(review.noChangeReason, saved.definition.noChangeReason);
      assert.deepEqual(review.legacyHandling, saved.definition.legacyHandling);
      assert.equal(review.sourceId, review.source.id);
      assert.equal(review.sourceKind, review.source.kind);
      const actions = rows.actions.filter(
        (action) => action.reviewId === review.id,
      );
      exactIds(
        actions,
        saved.definition.actions.map((action) => action.id),
      );
      for (const [index, action] of actions.entries()) {
        assert.equal(action.position, index);
        assert.deepEqual(action.definition, saved.definition.actions[index]);
        assert.equal(action.assistantVersion, null);
        assert.equal(action.assistantName, null);
        if (!assigned.length) assert.equal(action.taskId, null);
        else {
          const task = rows.nativeTasks.find(
            (task) => task.id === action.taskId,
          );
          const delivery = rows.deliveryTasks.find(
            (task) => task.taskId === action.taskId,
          );
          assert(task && delivery);
          assert.equal(delivery.projectId, fixture.projectId);
          assert.equal(delivery.revision, 1);
          assert.equal(delivery.details.state, 'PLANNED');
          assert.equal(task.title, action.definition.title);
          assert.equal(task.assigneeId, action.definition.ownerId);
          assert.equal(task.status, 'TODO');
          assert.equal(task.deletedAt, null);
          assert.equal(
            at(task.dueAt),
            `${action.definition.dueDate}T23:59:00.000Z`,
          );
          assert.equal(delivery.details.reviewerId, fixture.actorId);
          assert.equal(delivery.details.service, 'PERFORMANCE_MARKETING');
          assert.equal(
            delivery.details.scheduledDate,
            action.definition.dueDate,
          );
          assert.deepEqual(delivery.details.submissions, []);
          assert.deepEqual(delivery.details.evidence, []);
          assert.deepEqual(
            assigned[0].result.actionTasks.find(
              (link) => link.actionId === action.id,
            ),
            { actionId: action.id, taskId: action.taskId },
          );
        }
      }
      if (assigned.length)
        assert.deepEqual(assigned[0].definition, saved.definition);
    }
    exactIds(
      rows.observations,
      rows.events
        .filter((event) => event.action === 'OBSERVED')
        .map((event) => event.result.observationId),
    );
    const assignedTasks = rows.actions.filter((action) => action.taskId);
    exactIds(
      rows.nativeTasks,
      assignedTasks.map((action) => action.taskId),
    );
    exactIds(
      rows.deliveryTasks.map((task) => ({ id: task.taskId })),
      assignedTasks.map((action) => action.taskId),
    );
    const approved = new Map();
    for (const event of assignments)
      if (!approved.has(event.definition.source.id))
        approved.set(event.definition.source.id, event);
    const manual = currentOperations.state.business.records.filter((record) =>
      fixture.manualIds.includes(record.id),
    );
    exactIds(manual, fixture.manualIds);
    for (const [index, id] of fixture.manualIds.entries()) {
      const current = manual.find((record) => record.id === id);
      const original = recordFor(fixture, index);
      const decision = approved.get(id);
      if (!decision) assert.deepEqual(current, original);
      else {
        assert.deepEqual(
          without(current, [
            'revision',
            'updatedAt',
            'status',
            'decisionBy',
            'history',
          ]),
          without(original, [
            'revision',
            'updatedAt',
            'status',
            'decisionBy',
            'history',
          ]),
        );
        assert.equal(current.revision, 2);
        assert.equal(current.status, 'APPROVED');
        assert.equal(current.decisionBy, fixture.actorId);
        assert.equal(current.history.length, 1);
        assert.deepEqual(current.history[0], {
          at: current.updatedAt,
          actorId: fixture.actorId,
          action: 'APPROVED',
          note: decision.definition.note,
        });
        duringFixture(fixture, current.updatedAt);
      }
    }
    exactIds(rows.meta, fixture.metaIds);
    for (const row of rows.meta) {
      const decision = approved.get(row.id);
      const immutable = copy(row);
      if (decision) {
        assert.equal(row.status, 'APPROVED');
        assert.equal(row.report.status, 'APPROVED');
        assert.equal(row.report.reviewedBy, fixture.actorId);
        assert.equal(row.report.note, decision.definition.note);
        duringFixture(fixture, row.report.reviewedAt);
        immutable.status = 'REVIEW';
        immutable.report.status = 'REVIEW';
        immutable.report.reviewedBy = null;
        immutable.report.reviewedAt = null;
        immutable.report.note = reportFor(
          fixture,
          fixture.metaIds.indexOf(row.id),
        ).note;
      }
      assert.equal(fingerprint(immutable), fixture.metaSeed[row.id]);
    }
    const expectedActivity = [
      ...rows.events.map((event) => ({
        action: `ADVERTISING_WORK_${event.action}`,
        sourceId:
          event.definition?.source.id ??
          rows.reviews.find((review) => review.id === event.reviewId).sourceId,
        sourceType:
          (event.definition?.source.kind ??
            rows.reviews.find((review) => review.id === event.reviewId)
              .sourceKind) === 'META'
            ? 'meta-report'
            : 'ad-report',
        taskId: null,
      })),
      ...[...approved].map(([id]) => ({
        action:
          sourceKind(fixture, id) === 'META'
            ? 'META_REPORT_REVIEWED'
            : 'AD_REPORT_APPROVED',
        sourceId: id,
        sourceType:
          sourceKind(fixture, id) === 'META' ? 'meta-report' : 'ad-report',
        taskId: null,
      })),
      ...assignedTasks.map((action) => ({
        action: 'TASK_CREATED',
        sourceId: action.taskId,
        sourceType: 'task',
        taskId: action.taskId,
      })),
    ];
    assert.equal(rows.activity.length, expectedActivity.length);
    for (const activity of rows.activity) {
      assert.equal(activity.actorId, fixture.actorId);
      assert.equal(activity.actorType, 'HUMAN');
      assert.equal(activity.projectId, fixture.projectId);
      assert.equal(activity.clientId, fixture.companyId);
      const index = expectedActivity.findIndex((expected) =>
        Object.entries(expected).every(
          ([key, value]) => activity[key] === value,
        ),
      );
      assert(
        index >= 0,
        'Only exact planned receipts, source reviews and linked task creation activity are owned.',
      );
      expectedActivity.splice(index, 1);
      duringFixture(fixture, activity.recordedAt);
    }
    add('core', 'deliveryAdvertisingReview', rows.reviews);
    add('core', 'deliveryAdvertisingAction', rows.actions);
    add('core', 'deliveryAdvertisingObservation', rows.observations);
    add('core', 'deliveryAdvertisingEvent', rows.events);
    add('core', 'deliveryTask', rows.deliveryTasks);
    add(fixture.schema, 'task', rows.nativeTasks);
    add('core', 'otogrowActivityEvent', rows.activity);
  } else {
    assert.equal(
      currentOperations.state.business.records.filter((record) =>
        fixture.manualIds.includes(record.id),
      ).length,
      0,
    );
    for (const records of Object.values(rows))
      assert.equal(
        records.length,
        0,
        'Seed rollback/cleanup cannot leave a descendant.',
      );
  }
  for (const table of extra) {
    const entry = expected.find(
      (entry) => entry.schema === table.schema && entry.name === table.name,
    );
    exactIds(
      table.rows,
      entry?.ids ?? [],
      `Unexpected ${table.schema}.${table.name}; refuse broad cleanup.`,
    );
    if (
      hasSeed &&
      entry &&
      ![
        'deliveryMetaReport',
        'deliveryAdvertisingReview',
        'deliveryAdvertisingAction',
        'deliveryAdvertisingObservation',
        'deliveryAdvertisingEvent',
        'deliveryTask',
        'task',
        'otogrowActivityEvent',
      ].includes(table.name)
    )
      for (const row of table.rows)
        assert.equal(
          row.hash,
          fixture.seed[`${table.schema}.${table.name}:${row.id}`],
        );
  }
  return { tables, extra, hasSeed };
}

async function create() {
  assert(!existsSync(FILE), 'Recover the active advertising fixture first.');
  const nonce = randomUUID();
  const fixture = {
    version: 1,
    workspaceId: WORKSPACE_ID,
    nonce,
    createdAt: new Date().toISOString(),
    marker: `advertising-ui:${nonce}`,
    title: `Disposable Advertising ${nonce.slice(0, 8)}`,
    status: 'CREATING',
    companyId: randomUUID(),
    projectId: randomUUID(),
    people: Array.from({ length: 2 }, () => ({
      memberId: randomUUID(),
      userId: randomUUID(),
      userWorkspaceId: randomUUID(),
    })),
    metaIds: Array.from({ length: META_COUNT }, () => randomUUID()),
    manualIds: Array.from({ length: MANUAL_COUNT }, () => randomUUID()),
    plans: [],
    seed: {},
    metaSeed: {},
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
    const admins = await manager.query(
      `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId" FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(
      admins.length,
      1,
      'Use the unchanged original native administrator.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorUserId = admins[0].userId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    const original = await operations(manager);
    assert(
      Array.isArray(original.state.business?.records),
      'Existing business state is required; do not create unrelated containers.',
    );
    assert.equal(
      original.state.metaReporting?.reports?.length,
      0,
      'Legacy Meta reports must already be normalized; do not migrate unrelated sources in this fixture.',
    );
    await noNativeAutomation(manager, fixture, SOURCE_TABLES);
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      operations: {
        id: original.id,
        hash: fingerprint(withoutHeartbeat(original.state)),
      },
    };
    fixture.status = 'PREPARED';
    write(fixture);
    for (const [index, person] of fixture.people.entries()) {
      await manager.query(
        'INSERT INTO core."user" (id,email,disabled) VALUES($1,$2,false)',
        [person.userId, `${person.userId}+advertising-ui@example.invalid`],
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
          `${person.userId}+advertising-ui@example.invalid`,
          `Advertising test owner ${index + 1}`,
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
    for (const [index, id] of fixture.metaIds.entries()) {
      const report = reportFor(fixture, index);
      await manager.query(
        'INSERT INTO core."deliveryMetaReport" (id,"workspaceId","accountId",date,"projectId","managerId","marketerId",status,report,"checkedAt","archivedAt") VALUES($1,$2,$3,$4,$5,$6,$7,\'REVIEW\',$8,$9,NULL)',
        [
          id,
          WORKSPACE_ID,
          report.accountId,
          report.date,
          fixture.projectId,
          fixture.actorId,
          fixture.people[0].memberId,
          report,
          WHEN,
        ],
      );
    }
    const next = copy(original.state);
    next.business.records.push(
      ...fixture.manualIds.map((_id, index) => recordFor(fixture, index)),
    );
    assert(JSON.stringify(next).length < 10000000);
    await manager.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
      [original.id, next],
    );
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
    for (const row of (await owned(manager, fixture)).meta)
      fixture.metaSeed[row.id] = fingerprint(row);
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
        companyId: fixture.companyId,
        actorId: fixture.actorId,
        people: fixture.people.map((person) => ({ memberId: person.memberId })),
        metaId: fixture.metaIds[0],
        manualId: fixture.manualIds[0],
        laterMetaId: fixture.metaIds.at(-1),
        laterManualId: fixture.manualIds.at(-1),
        sourceCount: META_COUNT + MANUAL_COUNT,
        firstMetaAdCount: 55,
        plans: fixture.plans.map((plan) => ({
          operation: plan.operation,
          requestId: plan.input.requestId,
          id: plan.input.id,
        })),
        urls: {
          workbench: `http://apple.localhost:3001/delivery?view=ads&adSource=META&adReport=${fixture.metaIds[0]}`,
        },
        allowed:
          'Read/filter/page/evidence, exact pre-journalled Save/Assign/Observe commands, and read-only linked tasks. No task submit/edit/Seen/approve, member/access/login/invite, assistant, provider, transport, budget or finance action.',
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
  assert(COMMANDS[supplied.operation]);
  const input = COMMANDS[supplied.operation].schema.parse(supplied.input);
  validateCommand(fixture, supplied.operation, input);
  const existing = fixture.plans.find(
    (plan) => plan.input.requestId === input.requestId,
  );
  if (existing) {
    assert.equal(existing.operation, supplied.operation);
    assert.deepEqual(existing.input, input);
    print(fixture);
    return;
  }
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    await validate(manager, fixture);
    const collision = await manager.query(
      'SELECT id FROM core."deliveryAdvertisingEvent" WHERE id=$1',
      [input.requestId],
    );
    assert.equal(collision.length, 0, 'Journal before the command writes.');
    if (supplied.operation === 'SAVE' && input.revision === 0) {
      const rows = await manager.query(
        'SELECT id FROM core."deliveryAdvertisingReview" WHERE id=$1',
        [input.id],
      );
      assert.equal(rows.length, 0);
    }
    if (supplied.operation === 'SAVE' && input.revision > 0) {
      const [review] = await manager.query(
        'SELECT * FROM core."deliveryAdvertisingReview" WHERE id=$1 AND "workspaceId"=$2',
        [input.id, WORKSPACE_ID],
      );
      assert(
        review &&
          review.projectId === fixture.projectId &&
          review.sourceId === input.sourceId &&
          review.sourceKind === input.sourceKind,
      );
    }
    if (supplied.operation !== 'SAVE') {
      const reviewId =
        supplied.operation === 'ASSIGN' ? input.id : input.reviewId;
      const [review] = await manager.query(
        'SELECT * FROM core."deliveryAdvertisingReview" WHERE id=$1 AND "workspaceId"=$2',
        [reviewId, WORKSPACE_ID],
      );
      assert(
        review &&
          review.projectId === fixture.projectId &&
          sourceKind(fixture, review.sourceId) === review.sourceKind,
      );
    }
    fixture.plans.push({
      operation: supplied.operation,
      input,
      hash: advertisingHash(input),
      plannedAt: new Date().toISOString(),
    });
    write(fixture);
  });
  print(fixture);
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      assert.equal(
        (
          await manager.query(
            'SELECT id FROM core."deliveryProject" WHERE id=$1',
            [fixture.projectId],
          )
        ).length,
        0,
      );
      for (const person of fixture.people)
        assert.equal(
          (
            await manager.query('SELECT id FROM core."user" WHERE id=$1', [
              person.userId,
            ])
          ).length,
          0,
        );
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
        'deliveryAdvertisingObservation',
        'deliveryAdvertisingEvent',
        'deliveryAdvertisingAction',
        'deliveryAdvertisingReview',
        'otogrowActivityEvent',
        'deliveryTask',
        'task',
        'deliveryMetaReport',
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
    `Removed only exact owned advertising sources and journalled descendants; protected original tables and Operations restored. Private receipt: ${receipt}`,
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
  await connectionSource.initialize();
  try {
    if (command === 'create') await create();
    else {
      const fixture = read();
      if (command === 'inspect') await inspect(fixture);
      else if (command === 'plan') await plan(fixture, process.argv[3]);
      else await cleanup(fixture);
    }
  } finally {
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    console.error(`Preserve ${FILE}; no unverified cleanup is permitted.`);
    process.exitCode = 1;
  });

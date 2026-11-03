const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  createFixture,
  cleanupFixture,
  buildServices,
} = require('./check-delivery-reconciliation.cjs');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');

const SOURCE_TABLES = [
  'deliveryProject',
  'deliveryTask',
  'deliveryCommitmentPeriod',
  'deliveryCommitmentLine',
  'deliveryCommitmentAllocation',
  'deliveryCommitmentEvent',
  'deliveryFinancePlan',
  'deliveryFinanceEntry',
  'deliveryFinanceAllocation',
  'deliveryFinanceEvent',
  'deliveryFinanceSource',
  'deliveryFinanceSettlement',
  'deliveryFinanceCashMatch',
  'deliveryFinanceAiClaim',
  'deliveryFinancePeriod',
  'deliveryFinanceForecastAnchor',
  'deliveryFinanceForecastItem',
  'deliveryFinanceForecastRealization',
  'deliveryFinanceExportProfile',
  'deliveryFinanceExportBatch',
  'otogrowAiSpend',
  'otogrowAiSpendEvent',
  'otogrowAiBudget',
  'otogrowAiPrice',
  'deliveryMetaReport',
];
const NOW = new Date('2026-10-28T10:00:00.000Z');
const ESCALATION_TABLES = [
  'deliveryFounderEscalationNotice',
  'deliveryFounderEscalationEpisode',
  'deliveryFounderEscalationRule',
];
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = (value) => JSON.parse(JSON.stringify(value));

async function createEscalationFixture(
  manager,
  prefix = 'founder_alert_rollback',
) {
  const fixture = await createFixture(manager, prefix);
  const { workspaceId, schemaName, people, projects } = fixture;
  await manager.query(
    `COMMENT ON SCHEMA "${schemaName}" IS '${fixture.sentinel}'`,
  );
  await manager.query(`CREATE TABLE "${schemaName}".task
    (id uuid PRIMARY KEY,title text NOT NULL,"assigneeId" uuid,"dueAt" timestamptz,
     "updatedAt" timestamptz NOT NULL DEFAULT now(),"deletedAt" timestamptz)`);
  fixture.taskIds = Array.from({ length: 53 }, () => randomUUID());
  fixture.otherTaskId = randomUUID();
  const operations = newDeliveryOperations();
  operations.enabled = true;
  operations.telegramEnabled = true;
  operations.founderId = people.admin.memberId;
  operations.connections[people.admin.memberId] = {
    chatId: '424242',
    linkedAt: NOW.toISOString(),
  };
  operations.connections[people.reader.memberId] = {
    chatId: '434343',
    linkedAt: NOW.toISOString(),
  };
  operations.business = { records: [], inbox: [], seen: {} };
  operations.clients = { engagements: [], shares: [], links: [], audit: [] };
  fixture.manualAlertIds = Object.fromEntries(
    ['CLIENT', 'CONTRACT', 'BUDGET'].map((category) => [
      category,
      randomUUID(),
    ]),
  );
  for (const [category, id] of Object.entries(fixture.manualAlertIds))
    operations.alerts.push({
      id,
      taskId: fixture.otherTaskId,
      category,
      severity: 'URGENT',
      reason: `PRIVATE_MANUAL_${category}_CONCERN`,
      ownerId: people.admin.memberId,
      createdAt: NOW.toISOString(),
      acknowledgedAt: null,
      resolvedAt: null,
    });
  for (const [index, taskId] of [
    ...fixture.taskIds,
    fixture.otherTaskId,
  ].entries()) {
    const dueAt = new Date('2020-01-01T00:00:00.000Z');
    await manager.query(
      `INSERT INTO "${schemaName}".task
      (id,title,"assigneeId","dueAt","updatedAt") VALUES($1,$2,$3,$4,'2020-01-01')`,
      [
        taskId,
        `PRIVATE_ESCALATION_TASK ${index}`,
        people.writer.memberId,
        dueAt,
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,1)',
      [
        workspaceId,
        taskId,
        index < fixture.taskIds.length ? projects.first : projects.otherClient,
        {
          state: 'BLOCKED',
          reviewerId: people.admin.memberId,
          submissions: [],
          events: [],
          brief: 'PRIVATE_ESCALATION_BRIEF',
          service: 'SEO',
          blocker: 'PRIVATE_BLOCKER',
          priority: 'NORMAL',
          scheduledDate: null,
          checklist: [],
          evidence: [],
        },
      ],
    );
    // Existing worker guards prevent this disposable evidence from generating unrelated legacy pings.
    operations.assignments[taskId] = `${people.writer.memberId}:legacy`;
    operations.alerts.push({
      id: randomUUID(),
      taskId,
      category: 'LATE',
      sourceKey: `${taskId}:${dueAt}:0`,
      severity: 'NORMAL',
      reason: fixture.sentinel,
      ownerId: people.admin.memberId,
      createdAt: NOW.toISOString(),
      acknowledgedAt: NOW.toISOString(),
      resolvedAt: NOW.toISOString(),
    });
  }
  await manager.query(
    'INSERT INTO core."deliveryOperations" ("workspaceId",state) VALUES($1,$2)',
    [workspaceId, operations],
  );
  fixture.clock = NOW.toISOString();
  return fixture;
}
async function readOperations(manager, fixture) {
  const [row] = await manager.query(
    'SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
    [fixture.workspaceId],
  );
  assert(row);
  return row;
}
async function updateOperations(manager, fixture, change) {
  const row = await readOperations(manager, fixture);
  const proposed = copy(row.state);
  change(proposed);
  const changed = await manager.query(
    'WITH updated AS (UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1 AND "workspaceId"=$3 RETURNING id) SELECT id FROM updated',
    [row.id, proposed, fixture.workspaceId],
  );
  assert.equal(changed.length, 1);
}
async function setTask(manager, fixture, taskId, { state, title, dueAt } = {}) {
  assert([...fixture.taskIds, fixture.otherTaskId].includes(taskId));
  if (state)
    await manager.query(
      'UPDATE core."deliveryTask" SET details=jsonb_set(details,\'{state}\',to_jsonb($3::text)),revision=revision+1,"updatedAt"=now() WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, taskId, state],
    );
  if (title)
    await manager.query(
      `UPDATE "${fixture.schemaName}".task SET title=$2,"updatedAt"=now() WHERE id=$1`,
      [taskId, title],
    );
  if (dueAt)
    await manager.query(
      `UPDATE "${fixture.schemaName}".task SET "dueAt"=$2,"updatedAt"=now() WHERE id=$1`,
      [taskId, dueAt],
    );
}
async function setRole(manager, fixture, personName, capabilities) {
  assert(fixture.roles[personName]);
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2,revision=revision+1 WHERE id=$1 AND "workspaceId"=$3',
    [fixture.roles[personName], capabilities, fixture.workspaceId],
  );
}
async function sourceFingerprint(manager, fixture) {
  const output = {};
  for (const name of SOURCE_TABLES)
    output[name] = hash(
      await manager.query(
        `SELECT to_jsonb(record)::text AS value FROM core."${name}" record
      WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id`,
        [[fixture.workspaceId, fixture.foreignWorkspaceId]],
      ),
    );
  output.nativeTasks = hash(
    await manager.query(
      `SELECT to_jsonb(record)::text AS value FROM "${fixture.schemaName}".task record ORDER BY id`,
    ),
  );
  const operations = await readOperations(manager, fixture);
  output.operationsSources = hash(
    Object.fromEntries(
      [
        'business',
        'clients',
        'fulfilments',
        'alerts',
        'assignments',
        'templates',
        'timezone',
        'enabled',
        'telegramEnabled',
        'founderId',
        'connections',
        'linkTokens',
      ].map((key) => [key, operations.state[key]]),
    ),
  );
  return output;
}
function buildEscalationServices(source, fixture) {
  const {
    DeliveryFounderService,
  } = require('../dist/modules/delivery/founder/delivery-founder.service');
  const {
    DeliveryFounderEscalationService,
  } = require('../dist/modules/delivery/founder/escalation/delivery-founder-escalation.service');
  const services = buildServices(source, fixture);
  const founder = new DeliveryFounderService(
    source,
    services.delivery,
    services.access,
  );
  const transport = { botActive: true };
  const telegram = {
    findByWorkspaceId: async (workspaceId) => {
      assert.equal(
        workspaceId,
        fixture.workspaceId,
        'No real bot lookup is allowed.',
      );
      return { isActive: transport.botActive, botUsername: 'fixture_bot' };
    },
    decryptBotToken: () => 'fixture-founder-token',
  };
  const config = { get: () => 'http://localhost:3001' };
  const escalation = new DeliveryFounderEscalationService(
    source,
    services.delivery,
    services.access,
    founder,
    telegram,
    config,
  );
  return { ...services, founder, escalation, transport, telegram, config };
}
const draftOf = (rule) =>
  Object.fromEntries(
    [
      'id',
      'revision',
      'name',
      'condition',
      'recipientId',
      'priority',
      'projectScope',
      'projectIds',
      'includeCompany',
      'currency',
      'serviceMonth',
      'repeatMode',
      'repeatHours',
      'maxSends',
    ].map((field) => [field, rule[field]]),
  );
const ruleDraft = (fixture, fields = {}) => ({
  id: randomUUID(),
  revision: 0,
  name: 'Synthetic reviewed overdue delivery',
  condition: 'TASK_OVERDUE',
  recipientId: fixture.people.admin.memberId,
  priority: 'URGENT',
  projectScope: 'SELECTED',
  projectIds: [fixture.projects.otherClient],
  includeCompany: false,
  currency: null,
  serviceMonth: null,
  repeatMode: 'ONCE',
  repeatHours: null,
  maxSends: 1,
  ...fields,
});
function escalationHarness(services, fixture) {
  const call = (
    method,
    input,
    person = fixture.people.admin,
    workspace = fixture.workspace,
  ) =>
    services.escalation[method](
      workspace,
      person.memberId,
      person.userWorkspaceId,
      input,
    );
  return {
    read: (input = {}, person, workspace) =>
      call('snapshot', input, person, workspace),
    preview: (draft, person) => call('preview', draftOf(draft), person),
    save: (draft, person, commandId = randomUUID()) =>
      call(
        'saveRule',
        {
          ...draftOf(draft),
          commandId,
          reason: 'Synthetic reviewed rule configuration',
        },
        person,
      ),
    change: (rule, fields, person, commandId = randomUUID()) =>
      call(
        'changeRule',
        {
          commandId,
          ruleId: rule.id,
          revision: rule.revision,
          enabled: false,
          previewToken: null,
          adoptLegacyRouting: false,
          reason: 'Synthetic explicit rule state change',
          ...fields,
        },
        person,
      ),
    acknowledge: (episode, person, commandId = randomUUID()) =>
      call(
        'acknowledge',
        {
          commandId,
          episodeId: episode.id,
          revision: episode.revision,
          reason: 'Synthetic acknowledgement; source remains unresolved',
        },
        person,
      ),
  };
}
async function outboxForRule(manager, fixture, ruleId) {
  return manager.query(
    `SELECT outbox.* FROM core."deliveryReminderOutbox" outbox
    JOIN core."deliveryFounderEscalationNotice" notice ON notice.id=outbox."noticeId"
      AND notice."workspaceId"=outbox."workspaceId"
    WHERE outbox."workspaceId"=$1 AND notice."ruleId"=$2 ORDER BY outbox."createdAt",outbox.id`,
    [fixture.workspaceId, ruleId],
  );
}
async function assertEscalationFixture(manager, fixture) {
  assert.match(
    fixture.schemaName,
    /^founder_alert_(rollback|race)_[a-f0-9_]{36}$/,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  const rows = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.displayName, fixture.sentinel);
    assert.equal(row.databaseSchema, fixture.schemaName);
  }
  const [schema] = await manager.query(
    "SELECT obj_description(oid,'pg_namespace') AS comment FROM pg_namespace WHERE nspname=$1",
    [fixture.schemaName],
  );
  assert.equal(schema?.comment, fixture.sentinel);
  const tasks = await manager.query(
    `SELECT id FROM "${fixture.schemaName}".task ORDER BY id`,
  );
  assert.deepEqual(
    tasks.map((task) => task.id).sort(),
    [...fixture.taskIds, fixture.otherTaskId].sort(),
  );
}
async function cleanupEscalationFixture(manager, fixture) {
  await assertEscalationFixture(manager, fixture);
  const workspaceIds = [fixture.workspaceId, fixture.foreignWorkspaceId];
  await manager.query(
    'DELETE FROM core."deliveryReminderOutbox" WHERE "workspaceId"=ANY($1::uuid[])',
    [workspaceIds],
  );
  for (const table of ESCALATION_TABLES)
    await manager.query(
      `DELETE FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
      [workspaceIds],
    );
  await cleanupFixture(manager, fixture);
}
const denied = (operation, statuses = [403]) =>
  assert.rejects(
    operation,
    (error) => statuses.includes(error.getStatus?.()),
    'The operation must fail with its scoped domain rejection.',
  );

module.exports = {
  SOURCE_TABLES,
  NOW,
  hash,
  copy,
  createEscalationFixture,
  readOperations,
  updateOperations,
  setTask,
  setRole,
  sourceFingerprint,
  denied,
  buildServices,
  ESCALATION_TABLES,
  buildEscalationServices,
  draftOf,
  ruleDraft,
  escalationHarness,
  outboxForRule,
  assertEscalationFixture,
  cleanupEscalationFixture,
};

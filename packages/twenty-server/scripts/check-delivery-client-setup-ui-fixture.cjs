const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { dirname } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const FILE = '/tmp/otogrow-client-setup-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const OWNED_IDS = [
  'nonce',
  'companyId',
  'editorId',
  'editorUserId',
  'editorMembershipId',
];
const canonical = (value) =>
  value instanceof Date
    ? value.toISOString()
    : Array.isArray(value)
      ? value.map(canonical)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
const fingerprint = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const copy = (value) => JSON.parse(JSON.stringify(value));
const markerFor = (nonce) => `client-setup-ui:${nonce}`;
const titleFor = (nonce) => `Disposable Client Setup ${nonce.slice(0, 8)}`;
const timestamp = (value, label) => {
  assert(
    value instanceof Date || typeof value === 'string',
    `${label} must be a database Date or serialized timestamp.`,
  );
  // Date.parse(Date) coerces through toString(), which discards milliseconds.
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  assert(Number.isFinite(result), `${label} must be a valid timestamp.`);
  return result;
};
const quote = (identifier) => {
  assert(/^[a-zA-Z0-9_]+$/.test(identifier));
  return `"${identifier}"`;
};
const isAuthenticationLifecycleTable = (table) =>
  table.schema === 'core' && ['appToken', 'userSession'].includes(table.name);
const withoutHeartbeat = (state) => {
  const value = copy(state);
  // The reporting worker may advance its heartbeat during read-only inspection.
  if (value.metaReporting && typeof value.metaReporting === 'object')
    delete value.metaReporting.workerSeenAt;
  return value;
};
function syncDirectory(path) {
  const descriptor = openSync(dirname(path), 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function writeJournal(value, destination = FILE, initial = false) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(value, null, 2));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    if (initial) {
      linkSync(temporary, destination);
      unlinkSync(temporary);
    } else renameSync(temporary, destination);
    syncDirectory(destination);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function readJournal() {
  const metadata = lstatSync(FILE);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o077) === 0,
    'Keep the ownership journal private.',
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const key of OWNED_IDS) assert.match(fixture[key], UUID);
  assert.equal(fixture.marker, markerFor(fixture.nonce));
  assert.equal(fixture.title, titleFor(fixture.nonce));
  assert(
    ['CREATING', 'PREPARED', 'READY', 'CLEANUP_PREPARED', 'CLEANED'].includes(
      fixture.status,
    ),
  );
  assert(Array.isArray(fixture.cleanupAttempts));
  assert(
    !fixture.uiCompanyId,
    'This database-only fixture cannot authorize a native company commit or its Redis descendants.',
  );
  assert(Array.isArray(fixture.validatedOwned ?? []));
  if (fixture.baseline) {
    quote(fixture.schema);
    for (const key of ['actorId', 'actorUserId', 'userWorkspaceId'])
      assert.match(fixture[key], UUID);
    assert.match(fixture.baseline.operations.id, UUID);
    assert.match(fixture.editorUserId, UUID);
    assert.match(fixture.baseline.operations.hash, HASH);
    for (const table of fixture.baseline.tables) {
      quote(table.schema);
      quote(table.name);
      assert(
        ['NATIVE', 'WORKSPACE', 'WORKSPACE_ROW', 'USERS'].includes(table.scope),
      );
      assert.match(table.hash, HASH);
      for (const row of table.rows) {
        assert.match(row.id, UUID);
        assert.match(row.hash, /^[a-f0-9]{32}$/);
      }
    }
  }
  return fixture;
}

async function locked(manager, cleanup = false) {
  await manager.query("SET LOCAL lock_timeout='5s'");
  await manager.query("SET LOCAL statement_timeout='30s'");
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `delivery:${WORKSPACE_ID}`,
  ]);
  if (cleanup)
    for (const name of ['appToken', 'userSession'])
      await manager.query(`LOCK TABLE core.${quote(name)} IN SHARE MODE`);
}

async function operations(manager) {
  const rows = await manager.query(
    'SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1 FOR UPDATE',
    [WORKSPACE_ID],
  );
  assert.equal(rows.length, 1, 'Use the initialized local dev workspace.');
  assert.equal(
    rows[0].state.enabled,
    false,
    'Existing delivery automation must already be disabled.',
  );
  assert.equal(
    rows[0].state.telegramEnabled,
    false,
    'Existing Telegram transport must already be disabled.',
  );
  return rows[0];
}

async function descriptors(manager, schema) {
  const rows = await manager.query(
    `SELECT tables.table_schema AS schema,tables.table_name AS name,
    bool_or(columns.column_name='workspaceId') AS scoped,bool_or(columns.column_name='id') AS identified
    FROM information_schema.tables tables JOIN information_schema.columns columns ON columns.table_schema=tables.table_schema AND columns.table_name=tables.table_name
    WHERE tables.table_type='BASE TABLE' AND tables.table_schema IN ('core',$1)
    GROUP BY tables.table_schema,tables.table_name ORDER BY tables.table_schema,tables.table_name`,
    [schema],
  );
  return rows
    .filter(
      (row) =>
        (row.schema === schema ||
          row.scoped ||
          ['workspace', 'user'].includes(row.name)) &&
        row.name !== 'deliveryOperations',
    )
    .map((row) => {
      assert(
        row.identified,
        `Cannot protect ${row.schema}.${row.name} without an identity.`,
      );
      return {
        schema: row.schema,
        name: row.name,
        scope:
          row.schema === schema
            ? 'NATIVE'
            : row.name === 'workspace'
              ? 'WORKSPACE_ROW'
              : row.name === 'user'
                ? 'USERS'
                : 'WORKSPACE',
      };
    });
}

async function readTables(manager, fixture) {
  const tables = [];
  for (const table of await descriptors(manager, fixture.schema)) {
    const condition =
      table.scope === 'NATIVE'
        ? 'true'
        : table.scope === 'WORKSPACE_ROW'
          ? 'record.id=$1'
          : table.scope === 'USERS'
            ? 'record.id IN (SELECT "userId" FROM core."userWorkspace" WHERE "workspaceId"=$1)'
            : 'record."workspaceId"=$1';
    const auth = isAuthenticationLifecycleTable(table);
    const lifecycle = !auth
      ? ''
      : table.name === 'appToken'
        ? `,record."userId"=$2 AND record.type='REFRESH_TOKEN' AND record.context IS NULL AS lifecycle,md5((to_jsonb(record)-ARRAY['updatedAt','revokedAt','deletedAt','expiresAt'])::text) AS "stableHash",record."expiresAt" AS expires`
        : `,record."userId"=$2 AND record."userWorkspaceId"=$3 AND record."isImpersonating"=false AND record."impersonatorUserWorkspaceId" IS NULL AND record."impersonatedUserWorkspaceId" IS NULL AS lifecycle,md5((to_jsonb(record)-ARRAY['updatedAt','lastActiveAt','revokedAt','revokedReason','expiresAt'])::text) AS "stableHash",record."expiresAt" AS expires`;
    // Only hashes and authentication lifecycle metadata enter the private journal.
    const rows = await manager.query(
      `SELECT record.id::text AS id,md5(to_jsonb(record)::text) AS hash${lifecycle}
      FROM ${quote(table.schema)}.${quote(table.name)} record WHERE ${condition} ORDER BY record.id`,
      table.scope === 'NATIVE'
        ? []
        : auth
          ? table.name === 'appToken'
            ? [WORKSPACE_ID, fixture.actorUserId]
            : [WORKSPACE_ID, fixture.actorUserId, fixture.userWorkspaceId]
          : [WORKSPACE_ID],
    );
    tables.push({ ...table, rows, hash: fingerprint(rows) });
  }
  return tables;
}

const identity = ({ schema, name, scope }) => ({ schema, name, scope });
const without = (value, keys) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
const exactIds = (rows, ids, label) =>
  assert.deepEqual(rows.map((row) => row.id).sort(), [...ids].sort(), label);

function additions(tables, fixture) {
  assert.deepEqual(
    tables.map(identity),
    fixture.baseline.tables.map(identity),
    'Protected table inventory changed; preserve the fixture.',
  );
  return tables.map((table, index) => {
    const baseline = fixture.baseline.tables[index];
    if (isAuthenticationLifecycleTable(table)) {
      assert.equal(
        fingerprint(table.rows.filter((row) => !row.lifecycle)),
        fingerprint(baseline.rows.filter((row) => !row.lifecycle)),
        'Another person or non-refresh authentication source changed.',
      );
      for (const original of baseline.rows.filter((row) => row.lifecycle)) {
        const current = table.rows.find((row) => row.id === original.id);
        if (!current)
          assert(
            timestamp(original.expires, 'Expired login source') <= Date.now(),
            'An unexpired original login source disappeared.',
          );
        else {
          assert.equal(current.lifecycle, true);
          assert.equal(
            current.stableHash,
            original.stableHash,
            'Authentication identity/secret/source changed outside ordinary expiry, revocation and activity.',
          );
        }
      }
      return { ...table, rows: [] };
    }
    const originalIds = new Set(baseline.rows.map((row) => row.id));
    assert.equal(
      fingerprint(table.rows.filter((row) => originalIds.has(row.id))),
      baseline.hash,
      `Preexisting ${table.schema}.${table.name} changed; refusing cleanup.`,
    );
    return {
      ...table,
      rows: table.rows.filter((row) => !originalIds.has(row.id)),
    };
  });
}

const setupHash = fingerprint;
const fieldsFor = (fixture) => ({
  projectName: `${fixture.title} project`,
  planName: `${fixture.title} service plan`,
  scope: `${fixture.marker}: explicit synthetic SEO delivery scope`,
  taskTitle: `${fixture.title} first task`,
  taskBrief: `${fixture.marker}: synthetic first work`,
  uiCompanyName: `${fixture.title} native company`,
});
const timeOwned = (value, fixture, label) => {
  const time = timestamp(value, label);
  assert(
    time >= timestamp(fixture.createdAt, 'Fixture creation') &&
      time <= Date.now() + 5000,
    `${label} is outside the owned fixture window.`,
  );
};
async function row(manager, schema, name, id) {
  const rows = await manager.query(
    `SELECT * FROM ${quote(schema)}.${quote(name)} WHERE id=$1`,
    [id],
  );
  assert.equal(rows.length, 1, `Expected exact owned ${name}.`);
  return rows[0];
}
async function noNativeAutomation(manager, fixture) {
  await manager.query(
    `LOCK TABLE ${quote(fixture.schema)}."workflowVersion",${quote(fixture.schema)}."workflowAutomatedTrigger",core."workflowVersion" IN SHARE MODE`,
  );
  const nativeVersions =
    await manager.query(`SELECT id,"workflowId",status,md5(to_jsonb(version)::text) AS hash,
    "trigger"->>'type' AS type,"trigger"->'settings'->>'eventName' AS "eventName"
    FROM ${quote(fixture.schema)}."workflowVersion" version WHERE "deletedAt" IS NULL ORDER BY id`);
  const automatedTriggers =
    await manager.query(`SELECT id,"workflowId",type,settings->>'eventName' AS "eventName",md5(to_jsonb(automation)::text) AS hash
    FROM ${quote(fixture.schema)}."workflowAutomatedTrigger" automation WHERE "deletedAt" IS NULL ORDER BY id`);
  const coreVersions = await manager.query(
    `SELECT id,"workflowId",status,md5(to_jsonb(version)::text) AS hash,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('type',item->>'type','eventName',item->'settings'->>'eventName')) FROM jsonb_array_elements(COALESCE(triggers,'[]'::jsonb)) item),'[]'::jsonb) AS triggers
    FROM core."workflowVersion" version WHERE "workspaceId"=$1 ORDER BY id`,
    [WORKSPACE_ID],
  );
  const relevant = new Set([
    'company',
    'task',
    'workspacemember',
    'userworkspace',
    'user',
    'project',
    'deliveryproject',
    'clientengagement',
    'deliveryclientsetup',
  ]);
  const safe = (trigger, label) => {
    if (['MANUAL', 'WEBHOOK'].includes(trigger.type)) return;
    assert.equal(
      trigger.type,
      'DATABASE_EVENT',
      `${label}: unknown or scheduled automation requires separate review; do not change it for this fixture.`,
    );
    assert(
      typeof trigger.eventName === 'string' &&
        /^[A-Za-z][A-Za-z0-9]*\.(created|updated|deleted|upserted|restored)$/.test(
          trigger.eventName,
        ),
      `${label}: unidentified database event source.`,
    );
    assert(
      !relevant.has(trigger.eventName.split('.')[0].toLowerCase()),
      `${label}: active automation can react to an owned company/task/member/setup source. Use draft/rollback-only acceptance.`,
    );
  };
  for (const version of nativeVersions.filter(
    (item) => item.status === 'ACTIVE',
  ))
    safe(version, `Native active workflow ${version.id}`);
  for (const trigger of automatedTriggers)
    safe(trigger, `Native automated trigger ${trigger.id}`);
  for (const version of coreVersions.filter(
    (item) => item.status === 'ACTIVE',
  )) {
    assert(Array.isArray(version.triggers));
    for (const trigger of version.triggers)
      safe(trigger, `Core active workflow ${version.id}`);
  }
  const observation = { nativeVersions, automatedTriggers, coreVersions };
  if (fixture.automationBaseline)
    assert.deepEqual(
      observation,
      fixture.automationBaseline,
      'Workflow definitions changed during acceptance; preserve fixture and original automation.',
    );
  else fixture.automationBaseline = observation;
}
function removeOwnedClients(state, engagementIds, fixture) {
  const value = copy(state);
  assert(
    value.clients &&
      Array.isArray(value.clients.engagements) &&
      Array.isArray(value.clients.audit),
  );
  value.clients.engagements = value.clients.engagements.filter(
    (plan) => !engagementIds.includes(plan.id),
  );
  value.clients.audit = value.clients.audit.filter((event) => {
    if (!engagementIds.includes(event.targetId)) return true;
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.action, 'engagement');
    timeOwned(event.at, fixture, 'Client setup audit');
    return false;
  });
  return value;
}
async function companyGeneration(manager, fixture) {
  return manager.query(
    `SELECT column_name AS name,generation_expression AS expression FROM information_schema.columns WHERE table_schema=$1 AND table_name='company' AND is_generated='ALWAYS' ORDER BY column_name`,
    [fixture.schema],
  );
}
function expectedTask(details, fixture) {
  assert.equal(details.state, 'PLANNED');
  assert.equal(details.brief, fieldsFor(fixture).taskBrief);
  assert.equal(details.service, 'SEO');
  assert.equal(details.priority, 'NORMAL');
  assert.equal(details.scheduledDate, null);
  assert.equal(details.reviewerId, fixture.actorId);
  assert.equal(details.blocker, '');
  assert.deepEqual(details.checklist, []);
  assert.deepEqual(details.evidence, []);
  assert.deepEqual(details.submissions, []);
  assert.equal(details.events.length, 1);
  const event = details.events[0];
  assert.match(event.id, UUID);
  assert.equal(event.actorId, fixture.actorId);
  assert.equal(event.action, 'CREATED');
  assert.equal(event.text, fieldsFor(fixture).taskTitle);
  timeOwned(event.at, fixture, 'Task creation event');
  timeOwned(details.assignmentAt, fixture, 'Task assignment');
  assert.deepEqual(
    Object.keys(details).sort(),
    [
      'assignmentAt',
      'brief',
      'service',
      'priority',
      'scheduledDate',
      'reviewerId',
      'state',
      'blocker',
      'checklist',
      'evidence',
      'submissions',
      'events',
    ].sort(),
  );
}
async function validate(manager, fixture) {
  await noNativeAutomation(manager, fixture);
  assert.deepEqual(
    await companyGeneration(manager, fixture),
    fixture.companyGeneration,
    'Native generated-column definitions changed during acceptance.',
  );
  const tables = await readTables(manager, fixture),
    extra = additions(tables, fixture),
    state = await operations(manager);
  assert.equal(state.id, fixture.baseline.operations.id);
  const extras = (schema, name) =>
    extra.find((table) => table.schema === schema && table.name === name).rows;
  const fixed = [
    ['core', 'user', fixture.editorUserId],
    ['core', 'userWorkspace', fixture.editorMembershipId],
    [fixture.schema, 'workspaceMember', fixture.editorId],
    [fixture.schema, 'company', fixture.companyId],
  ];
  const hasSeed = extras('core', 'user').some(
    (item) => item.id === fixture.editorUserId,
  );
  for (const [schema, name, id] of fixed) {
    assert.equal(
      extras(schema, name).some((item) => item.id === id),
      hasSeed,
      'Partial committed seed cannot be cleaned automatically.',
    );
    if (hasSeed)
      assert.equal(
        fingerprint(await row(manager, schema, name, id)),
        fixture.seed[`${schema}.${name}:${id}`],
        `Owned seed ${name} is immutable.`,
      );
  }
  const receipts = extras('core', 'deliveryClientSetup').length
    ? await manager.query(
        'SELECT * FROM core."deliveryClientSetup" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) ORDER BY "createdAt",id',
        [
          WORKSPACE_ID,
          extras('core', 'deliveryClientSetup').map((item) => item.id),
        ],
      )
    : [];
  assert(
    receipts.length <= 2,
    'At most two explicitly reviewed setup requests belong to this fixture.',
  );
  const primary = receipts.filter(
    (receipt) => !receipt.reusedProject && !receipt.reusedEngagement,
  );
  assert(
    primary.length <= 1,
    'Only one new project/service-plan pair is owned.',
  );
  if (receipts.length)
    assert.equal(
      primary.length,
      1,
      'A reuse receipt requires its exact original setup receipt.',
    );
  const projectIds = primary.map((receipt) => receipt.projectId),
    engagementIds = primary.map((receipt) => receipt.engagementId),
    taskIds = primary.map((receipt) => receipt.taskId);
  assert(
    taskIds.every((id) => typeof id === 'string' && UUID.test(id)),
    'The primary fixture setup must create its explicit first task.',
  );
  const ownedCompanies = [fixture.companyId];
  const uiCompanies = extras(fixture.schema, 'company').filter(
    (item) => item.id !== fixture.companyId,
  );
  exactIds(
    uiCompanies,
    [],
    'Native company commits are outside this database-only fixture; preserve the journal and inspect Redis descendants before any cleanup.',
  );
  const plans =
    state.state.clients?.engagements.filter((plan) =>
      engagementIds.includes(plan.id),
    ) ?? [];
  assert.equal(plans.length, engagementIds.length);
  for (const plan of plans) {
    assert.equal(plan.name, fieldsFor(fixture).planName);
    assert.equal(plan.projectId, projectIds[0]);
    assert(ownedCompanies.includes(plan.companyId));
    assert.equal(plan.revision, 1);
    assert.deepEqual(plan.services, ['SEO']);
    assert.equal(plan.billing, 'RETAINER');
    assert.equal(plan.scope, fieldsFor(fixture).scope);
    assert.equal(plan.allowance, '');
    assert.equal(plan.contact, '');
    assert.equal(plan.advertising, null);
    assert.deepEqual(plan.submissions, []);
    assert.deepEqual(plan.assets, []);
    assert.equal(plan.fields.length, 3);
    assert.equal(new Set(plan.fields.map((field) => field.id)).size, 3);
    assert.deepEqual(
      plan.fields.map((field) => field.label),
      [
        'Website link',
        'Logo and brand guideline links',
        'Brand goals and notes',
      ],
    );
    for (const field of plan.fields) {
      assert.match(field.id, UUID);
      assert.equal(field.required, true);
      assert.deepEqual(Object.keys(field).sort(), ['id', 'label', 'required']);
    }
    assert.deepEqual(
      Object.keys(plan).sort(),
      [
        'id',
        'revision',
        'projectId',
        'companyId',
        'name',
        'services',
        'billing',
        'scope',
        'allowance',
        'contact',
        'fields',
        'advertising',
        'submissions',
        'assets',
      ].sort(),
    );
  }
  const audit =
    state.state.clients?.audit.filter((event) =>
      engagementIds.includes(event.targetId),
    ) ?? [];
  assert.equal(
    audit.length,
    plans.length,
    'Exactly one existing Clients audit event belongs to the new service plan.',
  );
  const protectedOperations = removeOwnedClients(
    state.state,
    engagementIds,
    fixture,
  );
  assert.equal(
    fingerprint(withoutHeartbeat(protectedOperations)),
    fixture.baseline.operations.hash,
    'Only the exact owned engagement and its one attributed audit may differ; routing, notices, Seen state, bots and all other Operations data stay protected.',
  );
  const projects = projectIds.length
    ? await manager.query(
        'SELECT * FROM core."deliveryProject" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
        [WORKSPACE_ID, projectIds],
      )
    : [];
  const tasks = taskIds.length
    ? await manager.query(
        'SELECT * FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=ANY($2::uuid[])',
        [WORKSPACE_ID, taskIds],
      )
    : [];
  assert.equal(projects.length, projectIds.length);
  assert.equal(tasks.length, taskIds.length);
  for (const project of projects) {
    assert.equal(project.name, fieldsFor(fixture).projectName);
    assert.equal(project.revision, 1);
    assert.deepEqual(project.memberIds, [fixture.editorId]);
    assert.equal(project.companyId, primary[0].companyId);
    timeOwned(project.createdAt, fixture, 'Project creation');
  }
  for (const task of tasks) {
    assert.equal(task.projectId, projectIds[0]);
    assert.equal(task.revision, 1);
    expectedTask(task.details, fixture);
    for (const key of ['createdAt', 'updatedAt'])
      timeOwned(task[key], fixture, `Delivery task ${key}`);
    const native = await row(manager, fixture.schema, 'task', task.taskId);
    assert.equal(native.title, fieldsFor(fixture).taskTitle);
    assert.equal(native.assigneeId, fixture.editorId);
    assert.equal(native.status, 'TODO');
    assert.equal(native.dueAt, null);
    assert.equal(native.deletedAt, null);
    for (const key of ['createdAt', 'updatedAt'])
      timeOwned(native[key], fixture, `Native task ${key}`);
  }
  for (const receipt of receipts) {
    assert.equal(receipt.actorId, fixture.actorId);
    assert.equal(receipt.userWorkspaceId, fixture.userWorkspaceId);
    assert(ownedCompanies.includes(receipt.companyId));
    assert.equal(receipt.projectId, projectIds[0]);
    assert.equal(receipt.engagementId, engagementIds[0]);
    assert.equal(receipt.workspaceId, WORKSPACE_ID);
    assert.match(receipt.requestId, UUID);
    assert.match(receipt.requestHash, HASH);
    timeOwned(receipt.createdAt, fixture, 'Setup receipt');
    const company = await row(
      manager,
      fixture.schema,
      'company',
      receipt.companyId,
    );
    const companySource = {
      id: company.id,
      name: company.name ?? '',
      updatedAt: new Date(company.updatedAt).toISOString(),
    };
    assert.deepEqual(receipt.source, {
      companyName: company.name,
      companySourceToken: setupHash(companySource),
      projectRevision: receipt.reusedProject ? 1 : null,
      engagementRevision: receipt.reusedEngagement ? 1 : null,
    });
    if (receipt !== primary[0]) {
      assert.equal(receipt.reusedProject, true);
      assert.equal(receipt.reusedEngagement, true);
      assert.equal(receipt.taskId, null);
      assert.equal(receipt.companyId, primary[0].companyId);
    }
    const plan = plans[0];
    const command = {
      requestId: receipt.requestId,
      companyId: receipt.companyId,
      companySourceToken: receipt.source.companySourceToken,
      projectId: receipt.reusedProject ? receipt.projectId : null,
      projectRevision: receipt.source.projectRevision,
      projectName: receipt.reusedProject
        ? null
        : fieldsFor(fixture).projectName,
      memberIds: receipt.reusedProject ? [] : [fixture.editorId],
      engagementId: receipt.reusedEngagement ? receipt.engagementId : null,
      engagementRevision: receipt.source.engagementRevision,
      plan: receipt.reusedEngagement
        ? null
        : {
            name: plan.name,
            services: plan.services,
            billing: plan.billing,
            scope: plan.scope,
            allowance: plan.allowance,
            contact: plan.contact,
            fields: plan.fields,
            advertising: plan.advertising,
          },
      firstTask: receipt.taskId
        ? {
            title: fieldsFor(fixture).taskTitle,
            brief: fieldsFor(fixture).taskBrief,
            service: 'SEO',
            assigneeId: fixture.editorId,
            reviewerId: fixture.actorId,
            priority: 'NORMAL',
            scheduledDate: null,
            dueAt: null,
            checklist: [],
            evidence: [],
          }
        : null,
    };
    assert.equal(
      receipt.requestHash,
      setupHash(command),
      'Receipt hash must reconstruct the complete exact permitted UI command.',
    );
  }
  const activityIds = extras('core', 'otogrowActivityEvent').map(
    (item) => item.id,
  );
  const activity = activityIds.length
    ? await manager.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) ORDER BY "occurredAt",id',
        [WORKSPACE_ID, activityIds],
      )
    : [];
  assert.equal(
    activity.length,
    primary.length * 3 + receipts.length,
    'Only exact project, plan, task and per-request setup activity is owned.',
  );
  const actions = {
    PROJECT_CREATED: 'project',
    CLIENT_ENGAGEMENT_CREATED: 'client-engagement',
    TASK_CREATED: 'task',
    CLIENT_SETUP_CREATED: 'client-engagement',
  };
  for (const event of activity) {
    assert(Object.hasOwn(actions, event.action));
    assert.equal(event.sourceType, actions[event.action]);
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.actorName, fixture.actorName);
    assert.equal(event.actorType, 'HUMAN');
    assert.equal(event.outcome, 'RECORDED');
    assert.equal(event.workspaceId, WORKSPACE_ID);
    assert.equal(event.projectId, projectIds[0]);
    assert.equal(event.clientId, primary[0].companyId);
    assert.equal(
      event.sourceId,
      event.action === 'PROJECT_CREATED'
        ? projectIds[0]
        : event.action === 'TASK_CREATED'
          ? taskIds[0]
          : engagementIds[0],
    );
    if (event.action === 'TASK_CREATED') {
      assert.equal(event.taskId, taskIds[0]);
      assert.equal(event.subjectMemberId, fixture.editorId);
    } else if (event.action === 'CLIENT_SETUP_CREATED')
      assert(event.taskId === null || event.taskId === taskIds[0]);
    else {
      assert.equal(event.taskId, null);
      assert.equal(event.subjectMemberId, null);
    }
    for (const key of ['occurredAt', 'recordedAt'])
      timeOwned(event[key], fixture, `Activity ${key}`);
  }
  for (const action of [
    'PROJECT_CREATED',
    'CLIENT_ENGAGEMENT_CREATED',
    'TASK_CREATED',
  ])
    assert.equal(
      activity.filter((event) => event.action === action).length,
      primary.length,
    );
  assert.equal(
    activity.filter((event) => event.action === 'CLIENT_SETUP_CREATED').length,
    receipts.length,
  );
  const permitted = new Map([
    [`core.user`, hasSeed ? [fixture.editorUserId] : []],
    [`core.userWorkspace`, hasSeed ? [fixture.editorMembershipId] : []],
    [`${fixture.schema}.workspaceMember`, hasSeed ? [fixture.editorId] : []],
    [
      `${fixture.schema}.company`,
      [
        ...(hasSeed ? [fixture.companyId] : []),
        ...uiCompanies.map((item) => item.id),
      ],
    ],
    [`core.deliveryProject`, projectIds],
    [`core.deliveryTask`, tasks.map((task) => task.id)],
    [`${fixture.schema}.task`, taskIds],
    [`core.deliveryClientSetup`, receipts.map((receipt) => receipt.id)],
    [`core.otogrowActivityEvent`, activityIds],
  ]);
  for (const table of extra)
    exactIds(
      table.rows,
      permitted.get(`${table.schema}.${table.name}`) ?? [],
      `Unexpected ${table.schema}.${table.name}: native audit/timeline/outbox and all unidentified mutations remain protected.`,
    );
  if (!hasSeed) {
    assert.equal(receipts.length, 0);
    assert.equal(uiCompanies.length, 0);
  }
  const observed = extra.flatMap((table) =>
    table.rows.map((item) => ({
      schema: table.schema,
      name: table.name,
      id: item.id,
      hash: item.hash,
    })),
  );
  for (const prior of fixture.validatedOwned ?? []) {
    const present = observed.find(
      (item) =>
        item.schema === prior.schema &&
        item.name === prior.name &&
        item.id === prior.id,
    );
    if (hasSeed)
      assert.equal(
        present?.hash,
        prior.hash,
        `Previously validated owned ${prior.name} changed.`,
      );
  }
  return {
    tables,
    extra,
    hasSeed,
    receipts,
    projects,
    tasks,
    engagementIds,
    activity,
    protectedOperations,
    observed,
  };
}

function printFixture(fixture) {
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        status: fixture.status,
        marker: fixture.marker,
        actorId: fixture.actorId,
        editorId: fixture.editorId,
        editorLabel: `Synthetic setup editor ${fixture.nonce.slice(0, 8)}`,
        existingCompanyId: fixture.companyId,
        existingCompanyName: fixture.title,
        nativeCompanyCommitAllowed: false,
        fields: fieldsFor(fixture),
        url: `http://apple.localhost:3001/delivery?view=onboarding&setupCompany=${fixture.companyId}`,
      },
      null,
      2,
    ),
  );
  console.log(
    'Allowed journeys: inspect existing nonce company; native-company preparation may be inspected during a real API outage only. Do NOT restore/retry the native Create company mutation: record its recovery UUID, restore the API and use exact fresh NOT_FOUND checking only, then deliberately leave that draft. No native Company commit or Redis descendant is authorized; allow-company refuses. Use the seeded company to create ONE nonce project with ONLY synthetic editor member, ONE explicit SEO/RETAINER service plan with unchanged three default required questions, and ONE first task assigned to synthetic editor/reviewed by current admin, no dates/checklist/references. Use printed exact names/scope/brief. Optionally make ONE second receipt reusing the same project+plan with no first task. Read exact sources/receipts, draft/back/outage/resume only. No project/plan/task edits, progress/Seen/approval/fulfilment, links, invites, role changes, finance, provider, ad or transport actions. Unidentified native audit/timeline/outbox effects preserve this journal for review.',
  );
}
async function createFixture() {
  assert(!existsSync(FILE), 'Recover the active client setup fixture first.');
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    ...Object.fromEntries(OWNED_IDS.map((key) => [key, randomUUID()])),
    createdAt: new Date().toISOString(),
    baseline: null,
    seed: {},
    validatedOwned: [],
    cleanupAttempts: [],
  };
  fixture.marker = markerFor(fixture.nonce);
  fixture.title = titleFor(fixture.nonce);
  writeJournal(fixture, FILE, true);
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
      `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(
      admins.length,
      1,
      'Use the current single admin; never grant real access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorUserId = admins[0].userId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    fixture.actorName = admins[0].name;
    const currentOperations = await operations(manager);
    await noNativeAutomation(manager, fixture);
    fixture.companyGeneration = await companyGeneration(manager, fixture);
    const collisions = await manager.query(
      `SELECT id FROM ${quote(fixture.schema)}.company WHERE name LIKE 'Disposable Client Setup %' LIMIT 1`,
    );
    assert.equal(
      collisions.length,
      0,
      'Recover an earlier client setup fixture first.',
    );
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      operations: {
        id: currentOperations.id,
        hash: fingerprint(withoutHeartbeat(currentOperations.state)),
      },
    };
    fixture.status = 'PREPARED';
    writeJournal(fixture);
    await manager.query('INSERT INTO core."user" (id,email) VALUES($1,$2)', [
      fixture.editorUserId,
      `${fixture.editorUserId}+client-setup@example.invalid`,
    ]);
    await manager.query(
      'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES($1,$2,$3)',
      [fixture.editorMembershipId, fixture.editorUserId, WORKSPACE_ID],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}."workspaceMember" (id,"userId","nameFirstName","nameLastName") VALUES($1,$2,'Synthetic setup editor',$3)`,
      [fixture.editorId, fixture.editorUserId, fixture.nonce.slice(0, 8)],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.company (id,name) VALUES($1,$2)`,
      [fixture.companyId, fixture.title],
    );
    for (const [schema, name, id] of [
      ['core', 'user', fixture.editorUserId],
      ['core', 'userWorkspace', fixture.editorMembershipId],
      [fixture.schema, 'workspaceMember', fixture.editorId],
      [fixture.schema, 'company', fixture.companyId],
    ])
      fixture.seed[`${schema}.${name}:${id}`] = fingerprint(
        await row(manager, schema, name, id),
      );
    fixture.companySeed = await row(
      manager,
      fixture.schema,
      'company',
      fixture.companyId,
    );
    writeJournal(fixture);
    await validate(manager, fixture);
    if (
      process.env.OTOGROW_CLIENT_SETUP_UI_TEST_FAILURE ===
      'create-before-commit'
    )
      throw new Error('Injected client setup fixture before commit');
  });
  if (
    process.env.OTOGROW_CLIENT_SETUP_UI_TEST_FAILURE === 'create-after-commit'
  )
    throw new Error('Injected client setup fixture after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
}
async function allowCompany() {
  throw new Error(
    'Native company commits are not authorized by this database-only fixture. Inspect draft/outage/exact-NOT_FOUND recovery only; Redis webhook/function/timeline descendants need isolated acceptance. No authorization was recorded.',
  );
}
async function inspectFixture() {
  const fixture = readJournal();
  assert(fixture.baseline, 'No baseline was prepared; use cleanup recovery.');
  const observation = await connectionSource.transaction(async (manager) => {
    await locked(manager);
    return validate(manager, fixture);
  });
  fixture.validatedOwned = observation.observed;
  if (observation.hasSeed && fixture.status === 'PREPARED') {
    fixture.status = 'READY';
    fixture.recoveredAfterCreateCommit = true;
  }
  fixture.inspection = {
    observedAt: new Date().toISOString(),
    receiptIds: observation.receipts.map((receipt) => receipt.id),
    requestIds: observation.receipts.map((receipt) => receipt.requestId),
    projectIds: observation.projects.map((project) => project.id),
    taskIds: observation.tasks.map((task) => task.taskId),
  };
  writeJournal(fixture);
  printFixture(fixture);
  console.log('Protected owned-state inspection passed.');
}
async function cleanupFixture() {
  const fixture = readJournal();
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      for (const [schema, name, id] of [
        ['core', 'user', fixture.editorUserId],
        ['core', 'userWorkspace', fixture.editorMembershipId],
        ...(fixture.schema
          ? [
              [fixture.schema, 'workspaceMember', fixture.editorId],
              [fixture.schema, 'company', fixture.companyId],
            ]
          : []),
      ])
        assert.equal(
          (
            await manager.query(
              `SELECT count(*)::int AS count FROM ${quote(schema)}.${quote(name)} WHERE id=$1`,
              [id],
            )
          )[0].count,
          0,
          'An unjournaled owned seed exists; preserve the journal.',
        );
      fixture.noCommittedSeed = true;
      return;
    }
    const observation = await validate(manager, fixture),
      authentication = observation.tables.filter(
        isAuthenticationLifecycleTable,
      );
    if (observation.hasSeed) {
      assert(fixture.cleanupAttempts.length < 20);
      fixture.cleanupAttempts.push({
        preparedAt: new Date().toISOString(),
        rows: observation.extra
          .filter((table) => table.rows.length)
          .map(({ schema, name, rows }) => ({ schema, name, rows })),
        engagementIds: observation.engagementIds,
        authenticationLifecycle: authentication,
      });
      fixture.status = 'CLEANUP_PREPARED';
      writeJournal(fixture);
      if (observation.engagementIds.length) {
        const restored = await manager.query(
          'WITH restored AS (UPDATE core."deliveryOperations" SET state=$3 WHERE id=$1 AND "workspaceId"=$2 RETURNING id) SELECT id FROM restored',
          [
            fixture.baseline.operations.id,
            WORKSPACE_ID,
            observation.protectedOperations,
          ],
        );
        assert.equal(restored.length, 1);
      }
      for (const [schema, name] of [
        ['core', 'otogrowActivityEvent'],
        ['core', 'deliveryClientSetup'],
        ['core', 'deliveryTask'],
        [fixture.schema, 'task'],
        ['core', 'deliveryProject'],
        [fixture.schema, 'company'],
        [fixture.schema, 'workspaceMember'],
        ['core', 'userWorkspace'],
        ['core', 'user'],
      ]) {
        const ids = observation.extra
          .find((table) => table.schema === schema && table.name === name)
          .rows.map((item) => item.id);
        if (!ids.length) continue;
        const removed = await manager.query(
          `WITH removed AS (DELETE FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
          [ids],
        );
        exactIds(removed, ids, `Remove only exact validated ${name} rows.`);
      }
    } else {
      fixture.cleanupRecoveredAfterCommit = fixture.cleanupAttempts.length > 0;
      fixture.noCommittedSeed = fixture.cleanupAttempts.length === 0;
    }
    const after = await readTables(manager, fixture);
    for (let index = 0; index < after.length; index++)
      assert.equal(
        after[index].hash,
        isAuthenticationLifecycleTable(after[index])
          ? authentication.find((table) => table.name === after[index].name)
              .hash
          : fixture.baseline.tables[index].hash,
        `Protected ${after[index].schema}.${after[index].name} changed during cleanup.`,
      );
    assert.equal(
      fingerprint(withoutHeartbeat((await operations(manager)).state)),
      fixture.baseline.operations.hash,
    );
    fixture.recoveryAuthenticationLifecycle = authentication.map((table) => ({
      table: table.name,
      originalHash: fixture.baseline.tables.find(
        (item) => item.schema === table.schema && item.name === table.name,
      ).hash,
      beforeHash: table.hash,
      afterHash: after.find(
        (item) => item.schema === table.schema && item.name === table.name,
      ).hash,
    }));
    writeJournal(fixture);
    if (
      process.env.OTOGROW_CLIENT_SETUP_UI_TEST_FAILURE ===
      'cleanup-before-commit'
    )
      throw new Error('Injected client setup cleanup before commit');
  });
  if (
    process.env.OTOGROW_CLIENT_SETUP_UI_TEST_FAILURE === 'cleanup-after-commit'
  )
    throw new Error('Injected client setup cleanup after commit');
  fixture.status = 'CLEANED';
  writeJournal(fixture);
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
    `Removed only exact owned company/editor/setup/project/plan/task/receipt/activity rows. All original core/native/financial/access/transport/routing/Operations data and locked current login lifecycle were preserved. No native Company API write or Redis job cleanup was performed or claimed; native audit/timeline/outbox were never broadly waived. Private receipt: ${receipt}`,
  );
}
async function main() {
  const command = process.argv[2];
  assert(['create', 'inspect', 'cleanup', 'allow-company'].includes(command));
  assert.equal(process.argv.length, command === 'allow-company' ? 4 : 3);
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Local database only.',
  );
  await connectionSource.initialize();
  try {
    if (command === 'create') await createFixture();
    else if (command === 'inspect') await inspectFixture();
    else if (command === 'allow-company') await allowCompany(process.argv[3]);
    else await cleanupFixture();
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

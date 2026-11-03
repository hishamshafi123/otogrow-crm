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
const FILE = '/tmp/otogrow-assistants-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const OWNED_IDS = ['nonce', 'projectId', 'agentId'];
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
const markerFor = (nonce) => `assistants-ui:${nonce}`;
const titleFor = (nonce) => `Disposable Assistants ${nonce.slice(0, 8)}`;
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
  assert.equal(fixture.people.length, 2);
  assert.equal(fixture.tasks.length, 3);
  assert.equal(fixture.runs.length, 581);
  const ids = [...OWNED_IDS.map((key) => fixture[key])];
  for (const person of fixture.people)
    for (const key of ['memberId', 'userId', 'userWorkspaceId']) {
      assert.match(person[key], UUID);
      ids.push(person[key]);
    }
  for (const task of fixture.tasks)
    for (const key of ['id', 'deliveryTaskId']) {
      assert.match(task[key], UUID);
      ids.push(task[key]);
    }
  for (const run of fixture.runs)
    for (const key of ['id', 'requestId']) {
      assert.match(run[key], UUID);
      ids.push(run[key]);
    }
  assert.equal(
    fixture.runs.filter((run) => run.kind === 'NEW_OTHER').length,
    501,
  );
  assert.equal(
    fixture.runs.filter((run) => run.kind === 'TIED_OWN').length,
    79,
  );
  assert.equal(fixture.runs.filter((run) => run.kind === 'OLD_OWN').length, 1);
  assert.equal(
    new Set(ids).size,
    ids.length,
    'Every synthetic identity is distinct.',
  );
  assert(Array.isArray(fixture.validatedOwned ?? []));
  if (fixture.baseline) {
    quote(fixture.schema);
    for (const key of ['actorId', 'actorUserId', 'userWorkspaceId'])
      assert.match(fixture[key], UUID);
    assert.match(fixture.baseline.operations.id, UUID);
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

async function noNativeAutomation(manager, fixture, additionalSources = []) {
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
    'deliveryagent',
    'deliveryagentrun',
    ...additionalSources,
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

const TERMINAL_COUNT = 581;
const OTHER_COUNT = 501;
const TIED_OWN_COUNT = 79;
const OLD_CREATED_AT = '2020-02-20T09:00:00.000Z';
const TIED_CREATED_AT = '2020-02-21T09:00:00.123Z';
const OTHER_CREATED_AT = '2020-02-22T09:00:00.123Z';
const seedEntries = (fixture) => [
  { schema: 'core', name: 'deliveryProject', ids: [fixture.projectId] },
  { schema: 'core', name: 'deliveryAgent', ids: [fixture.agentId] },
  {
    schema: 'core',
    name: 'deliveryAgentRun',
    ids: fixture.runs.map((run) => run.id),
  },
  {
    schema: 'core',
    name: 'deliveryTask',
    ids: fixture.tasks.map((task) => task.deliveryTaskId),
  },
  {
    schema: fixture.schema,
    name: 'task',
    ids: fixture.tasks.map((task) => task.id),
  },
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
const agentConfiguration = (fixture) => ({
  name: `${fixture.title} disabled SEO verifier`,
  purpose: `${fixture.marker}: synthetic read-only history; never run this assistant.`,
  kind: 'SEO',
  enabled: false,
  instructions: `${fixture.marker}: PRIVATE_ASSISTANT_CONFIGURATION ${'i'.repeat(1600)}`,
  requiredInputs: [],
  outputFormat: 'findings',
  tools: ['public_page_check'],
  modelId: null,
  projectIds: [fixture.projectId],
  roles: ['ADMIN', 'MANAGER', 'MEMBER'],
  dailyRunLimit: 1,
  maxOutputTokens: 256,
  humanConfirmation: true,
});
const taskDetails = (fixture) => ({
  brief: `${fixture.marker}: PRIVATE_TASK_BRIEF ${'b'.repeat(1000)}`,
  draftCopy: `${fixture.marker}: selected task draft copy`,
  service: 'SEO',
  priority: 'NORMAL',
  scheduledDate: null,
  reviewerId: fixture.actorId,
  state: 'PLANNED',
  blocker: '',
  checklist: [],
  evidence: [],
  events: [],
  submissions: [],
});
const runContext = (fixture) => ({
  title: `${fixture.title} synthetic pinned task`,
  brief: `${fixture.marker}: PRIVATE_RUN_CONTEXT ${'c'.repeat(2400)}`,
  service: 'SEO',
  checklist: [],
  submittedCopy: `${fixture.marker}: historical synthetic copy`,
  evidenceLinks: [],
  inputs: {
    copy: '',
    requirements: `${fixture.marker}: synthetic sources only`,
  },
});
const runResult = (fixture, index) => ({
  summary: `${fixture.marker}: exact historical run ${index + 1}; no provider request occurred.`,
  findings: [
    {
      severity: 'info',
      evidence: `${fixture.marker}: PRIVATE_RUN_FINDINGS ${'e'.repeat(1800)}`,
      correction: 'Synthetic fixture evidence, not a checked public backlink.',
    },
  ],
  suggestedBrief: null,
  suggestedCopy: null,
});

async function validate(manager, fixture) {
  await noNativeAutomation(manager, fixture);
  const tables = await readTables(manager, fixture);
  const extra = additions(tables, fixture);
  const currentOperations = await operations(manager);
  assert.equal(currentOperations.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(withoutHeartbeat(currentOperations.state)),
    fixture.baseline.operations.hash,
    'Operations, reminders, Seen receipts, links and all other state must remain unchanged.',
  );
  const expected = seedEntries(fixture);
  const owned = extra.filter((table) => table.rows.length > 0);
  const hasSeed = owned.length > 0;
  for (const table of extra) {
    const permitted = hasSeed
      ? (expected.find(
          (entry) => entry.schema === table.schema && entry.name === table.name,
        )?.ids ?? [])
      : [];
    exactIds(
      table.rows,
      permitted,
      `Unexpected ${table.schema}.${table.name}; preserve the journal and all data.`,
    );
    for (const current of table.rows) {
      const key = `${table.schema}.${table.name}:${current.id}`;
      assert.equal(
        current.hash,
        fixture.seed[key],
        `Owned ${key} changed; this fixture permits read-only acceptance only.`,
      );
    }
  }
  if (hasSeed) {
    assert.equal(
      Object.keys(fixture.seed).length,
      expected.reduce((count, entry) => count + entry.ids.length, 0),
    );
    const summaries = await manager.query(
      `SELECT count(*)::int AS total,
      count(*) FILTER(WHERE "initiatorId"=$3)::int AS own,
      count(*) FILTER(WHERE "taskId"=$4)::int AS tied,
      count(*) FILTER(WHERE status<>'SUCCEEDED')::int AS unsafe
      FROM core."deliveryAgentRun" WHERE "workspaceId"=$1 AND "agentId"=$2`,
      [WORKSPACE_ID, fixture.agentId, fixture.actorId, fixture.tasks[0].id],
    );
    assert.deepEqual(summaries, [
      {
        total: TERMINAL_COUNT,
        own: TIED_OWN_COUNT + 1,
        tied: TIED_OWN_COUNT,
        unsafe: 0,
      },
    ]);
    const oldRun = fixture.runs.at(-1);
    assert.equal(oldRun.kind, 'OLD_OWN');
    const newer = await manager.query(
      `SELECT count(*)::int AS count FROM core."deliveryAgentRun" WHERE "workspaceId"=$1 AND "agentId"=$2 AND "createdAt">$3`,
      [WORKSPACE_ID, fixture.agentId, OLD_CREATED_AT],
    );
    assert.equal(newer[0].count, TERMINAL_COUNT - 1);
    const people = await manager.query(
      'SELECT id,disabled FROM core."user" WHERE id=ANY($1::uuid[]) ORDER BY id',
      [fixture.people.map((person) => person.userId)],
    );
    assert.equal(people.length, 2);
    assert(
      people.every((person) => person.disabled === true),
      'Synthetic accounts must remain unable to sign in.',
    );
  }
  return { tables, extra, hasSeed };
}

function printFixture(fixture) {
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        status: fixture.status,
        marker: fixture.marker,
        projectId: fixture.projectId,
        projectName: fixture.title,
        agentId: fixture.agentId,
        agentName: `${fixture.title} disabled SEO verifier`,
        actorId: fixture.actorId,
        taskIds: fixture.tasks.map((task) => task.id),
        tiedTaskId: fixture.tasks[0].id,
        tiedRunCount: TIED_OWN_COUNT,
        newestOtherRunCount: OTHER_COUNT,
        ownRunCount: TIED_OWN_COUNT + 1,
        totalRunCount: TERMINAL_COUNT,
        oldestOwnRunId: fixture.runs.at(-1).id,
        tiedExactRunId: fixture.runs[OTHER_COUNT].id,
        urls: {
          catalog:
            'http://apple.localhost:3001/delivery?view=agents&agentView=assistants',
          task: `http://apple.localhost:3001/delivery?view=agents&agentView=assistants&task=${fixture.tasks[0].id}&panel=agents`,
        },
        allowed:
          'Read-only catalog/history filters, pagination, exact details, selected task assistance context and configuration drafts with Back/Keep/Cancel/outage recovery. No configuration save/duplicate/enable, run start/preview/cancel/decision, task edit/Seen, member/role/login/invite, provider, transport, finance or budget action.',
      },
      null,
      2,
    ),
  );
}

async function createFixture() {
  assert(!existsSync(FILE), 'Recover the active assistants fixture first.');
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    ...Object.fromEntries(OWNED_IDS.map((key) => [key, randomUUID()])),
    people: Array.from({ length: 2 }, () => ({
      memberId: randomUUID(),
      userId: randomUUID(),
      userWorkspaceId: randomUUID(),
    })),
    tasks: Array.from({ length: 3 }, () => ({
      id: randomUUID(),
      deliveryTaskId: randomUUID(),
    })),
    runs: Array.from({ length: TERMINAL_COUNT }, (_, index) => ({
      id: randomUUID(),
      requestId: randomUUID(),
      kind:
        index < OTHER_COUNT
          ? 'NEW_OTHER'
          : index < OTHER_COUNT + TIED_OWN_COUNT
            ? 'TIED_OWN'
            : 'OLD_OWN',
    })),
    createdAt: new Date().toISOString(),
    baseline: null,
    seed: {},
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
      `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name
      FROM ${quote(fixture.schema)}."workspaceMember" member
      JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1
      JOIN core."user" account ON account.id=membership."userId"
      JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1
      JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1
      WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(
      admins.length,
      1,
      'Use the existing administrator without changing access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorUserId = admins[0].userId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    fixture.actorName = admins[0].name;
    const currentOperations = await operations(manager);
    await noNativeAutomation(manager, fixture);
    const collisions = await manager.query(
      'SELECT id FROM core."deliveryProject" WHERE "workspaceId"=$1 AND name LIKE \'Disposable Assistants %\' LIMIT 1',
      [WORKSPACE_ID],
    );
    assert.equal(
      collisions.length,
      0,
      'Recover an earlier assistants fixture first.',
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
    for (const [index, person] of fixture.people.entries()) {
      await manager.query(
        'INSERT INTO core."user" (id,email,disabled) VALUES($1,$2,true)',
        [person.userId, `${person.userId}+assistants-ui@example.invalid`],
      );
      await manager.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES($1,$2,$3)',
        [person.userWorkspaceId, person.userId, WORKSPACE_ID],
      );
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}."workspaceMember" (id,"userId","nameFirstName","nameLastName") VALUES($1,$2,$3,$4)`,
        [
          person.memberId,
          person.userId,
          `Disabled synthetic assistant ${index + 1}`,
          fixture.nonce.slice(0, 8),
        ],
      );
    }
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.title,
        JSON.stringify(fixture.people.map((person) => person.memberId)),
      ],
    );
    for (const [index, task] of fixture.tasks.entries()) {
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}.task (id,title,"assigneeId",status) VALUES($1,$2,$3,'IN_PROGRESS')`,
        [
          task.id,
          `${fixture.title} ${['tied own history', 'newer other history', 'old own history'][index]}`,
          fixture.people[index % fixture.people.length].memberId,
        ],
      );
      await manager.query(
        'INSERT INTO core."deliveryTask" (id,"workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,$5,1)',
        [
          task.deliveryTaskId,
          WORKSPACE_ID,
          task.id,
          fixture.projectId,
          taskDetails(fixture),
        ],
      );
    }
    const configuration = agentConfiguration(fixture);
    await manager.query(
      'INSERT INTO core."deliveryAgent" (id,"workspaceId",configuration,version) VALUES($1,$2,$3,1)',
      [fixture.agentId, WORKSPACE_ID, configuration],
    );
    for (const [index, run] of fixture.runs.entries()) {
      const other = run.kind === 'NEW_OTHER';
      const createdAt = other
        ? OTHER_CREATED_AT
        : run.kind === 'TIED_OWN'
          ? TIED_CREATED_AT
          : OLD_CREATED_AT;
      const task = fixture.tasks[other ? 1 : run.kind === 'TIED_OWN' ? 0 : 2];
      await manager.query(
        'INSERT INTO core."deliveryAgentRun" (id,"workspaceId","requestId","taskId","agentId","initiatorId","userWorkspaceId","taskRevision","agentVersion",configuration,context,status,result,activity,usage,error,decision,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,$7,1,1,$8,$9,\'SUCCEEDED\',$10,$11,$12,NULL,$13,$14,$14)',
        [
          run.id,
          WORKSPACE_ID,
          run.requestId,
          task.id,
          fixture.agentId,
          other ? fixture.people[1].memberId : fixture.actorId,
          other ? fixture.people[1].userWorkspaceId : fixture.userWorkspaceId,
          configuration,
          runContext(fixture),
          runResult(fixture, index),
          JSON.stringify([
            {
              at: createdAt,
              message: `${fixture.marker}: PRIVATE_RUN_ACTIVITY; directly seeded terminal fixture; no job was queued.`,
            },
          ]),
          { inputTokens: null, outputTokens: null, cost: null },
          {
            memberId: fixture.actorId,
            at: createdAt,
            action: 'REJECT',
            field: null,
          },
          createdAt,
        ],
      );
    }
    const seeded = await readTables(manager, fixture);
    for (const entry of seedEntries(fixture)) {
      const table = seeded.find(
        (table) => table.schema === entry.schema && table.name === entry.name,
      );
      assert(table, `Owned table ${entry.name} is protected.`);
      for (const id of entry.ids) {
        const record = table.rows.find((row) => row.id === id);
        assert(record, `Owned ${entry.name} row was inserted.`);
        fixture.seed[`${entry.schema}.${entry.name}:${id}`] = record.hash;
      }
    }
    writeJournal(fixture);
    await validate(manager, fixture);
    if (
      process.env.OTOGROW_ASSISTANTS_UI_TEST_FAILURE === 'create-before-commit'
    )
      throw new Error('Injected assistants fixture before commit');
  });
  if (process.env.OTOGROW_ASSISTANTS_UI_TEST_FAILURE === 'create-after-commit')
    throw new Error('Injected assistants fixture after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
}

async function inspectFixture() {
  const fixture = readJournal();
  assert(fixture.baseline, 'No baseline was prepared; use cleanup recovery.');
  const observation = await connectionSource.transaction(async (manager) => {
    await locked(manager);
    return validate(manager, fixture);
  });
  if (observation.hasSeed && fixture.status === 'PREPARED') {
    fixture.status = 'READY';
    fixture.recoveredAfterCreateCommit = true;
  }
  fixture.inspection = {
    observedAt: new Date().toISOString(),
    hasSeed: observation.hasSeed,
  };
  writeJournal(fixture);
  printFixture(fixture);
  console.log(
    'All exact owned terminal sources and protected baseline digests matched.',
  );
}

async function cleanupFixture() {
  const fixture = readJournal();
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      for (const entry of seedEntries(fixture).filter(
        (entry) => entry.schema,
      )) {
        const rows = await manager.query(
          `SELECT id FROM ${quote(entry.schema)}.${quote(entry.name)} WHERE id=ANY($1::uuid[])`,
          [entry.ids],
        );
        assert.equal(
          rows.length,
          0,
          'An unjournalled seed exists; preserve this ownership journal.',
        );
      }
      fixture.noCommittedSeed = true;
      return;
    }
    const observation = await validate(manager, fixture);
    const authentication = observation.tables.filter(
      isAuthenticationLifecycleTable,
    );
    if (observation.hasSeed) {
      assert(fixture.cleanupAttempts.length < 20);
      fixture.cleanupAttempts.push({
        preparedAt: new Date().toISOString(),
        rows: observation.extra.filter((table) => table.rows.length),
        authenticationLifecycle: authentication,
      });
      fixture.status = 'CLEANUP_PREPARED';
      writeJournal(fixture);
      for (const entry of seedEntries(fixture).sort((left, right) => {
        const order = [
          'deliveryAgentRun',
          'deliveryAgent',
          'deliveryTask',
          'task',
          'deliveryProject',
          'workspaceMember',
          'userWorkspace',
          'user',
        ];
        return order.indexOf(left.name) - order.indexOf(right.name);
      })) {
        const removed = await manager.query(
          `WITH removed AS (DELETE FROM ${quote(entry.schema)}.${quote(entry.name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
          [entry.ids],
        );
        exactIds(
          removed,
          entry.ids,
          `Remove only exact owned ${entry.name} rows.`,
        );
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
      process.env.OTOGROW_ASSISTANTS_UI_TEST_FAILURE === 'cleanup-before-commit'
    )
      throw new Error('Injected assistants cleanup before commit');
  });
  if (process.env.OTOGROW_ASSISTANTS_UI_TEST_FAILURE === 'cleanup-after-commit')
    throw new Error('Injected assistants cleanup after commit');
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
    `Removed only exact owned disabled accounts, membership/native members, project, tasks, disabled assistant and 581 terminal runs. All original core/native/financial/access/budget/transport/routing/Operations data and locked current authentication lifecycle were preserved. No provider, queue, native API or Redis descendant action occurred. Private receipt: ${receipt}`,
  );
}

async function main() {
  const command = process.argv[2];
  assert(['create', 'inspect', 'cleanup'].includes(command));
  assert.equal(process.argv.length, 3);
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

module.exports = {
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
};

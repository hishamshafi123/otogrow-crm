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

const FILE = '/tmp/otogrow-founder-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const PREFIX = 'Disposable founder acceptance';
const MONTH = '2098-12';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const IDS = [
  'nonce',
  'companyId',
  'projectId',
  'engagementId',
  'periodId',
  'lineId',
  'taskId',
  'deliveryTaskId',
  'reportId',
  'alertId',
  'revenueId',
  'costId',
  'revenueAllocationId',
  'costAllocationId',
];
const DELETE_ORDER = [
  ['core', 'deliveryFinanceAllocation'],
  ['core', 'deliveryFinanceEntry'],
  ['core', 'deliveryCommitmentLine'],
  ['core', 'deliveryCommitmentPeriod'],
  ['core', 'deliveryTask'],
  ['native', 'task'],
  ['core', 'deliveryProject'],
  ['native', 'company'],
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
const markerFor = (nonce) => `founder-ui:${nonce}`;
const titleFor = (nonce) => `${PREFIX} ${nonce.slice(0, 8)}`;
const quote = (identifier) => {
  assert(/^[a-zA-Z0-9_]+$/.test(identifier));
  return `"${identifier}"`;
};
const isAuthenticationLifecycleTable = (table) =>
  table.schema === 'core' &&
  ['appToken', 'userSession'].includes(table.name) &&
  table.scope === 'WORKSPACE';
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
    'The ownership journal must be a private regular file.',
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const key of IDS) assert.match(fixture[key], UUID);
  assert.equal(fixture.marker, markerFor(fixture.nonce));
  assert.equal(fixture.sentinel, titleFor(fixture.nonce));
  assert.equal(fixture.month, MONTH);
  assert(
    ['CREATING', 'PREPARED', 'READY', 'CLEANUP_PREPARED', 'CLEANED'].includes(
      fixture.status,
    ),
  );
  assert(Array.isArray(fixture.cleanupAttempts));
  if (fixture.baseline) {
    quote(fixture.schema);
    assert.match(fixture.actorId, UUID);
    assert.match(fixture.userWorkspaceId, UUID);
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
async function locked(manager) {
  await manager.query("SET LOCAL lock_timeout='5s'");
  await manager.query("SET LOCAL statement_timeout='30s'");
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `delivery:${WORKSPACE_ID}`,
  ]);
}
async function readOperations(manager) {
  const rows = await manager.query(
    'SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1 FOR UPDATE',
    [WORKSPACE_ID],
  );
  assert.equal(
    rows.length,
    1,
    'Use the exact initialized local dev workspace.',
  );
  const state = rows[0].state;
  assert(
    Array.isArray(state.business?.records) &&
      Array.isArray(state.clients?.engagements) &&
      Array.isArray(state.alerts) &&
      Array.isArray(state.notices) &&
      state.assignments &&
      typeof state.assignments === 'object',
  );
  return rows[0];
}
async function tableDescriptors(manager, schema) {
  const rows = await manager.query(
    `SELECT tables.table_schema AS schema,tables.table_name AS name,
    bool_or(columns.column_name='workspaceId') AS scoped,
    bool_or(columns.column_name='id') AS identified
    FROM information_schema.tables tables JOIN information_schema.columns columns
      ON columns.table_schema=tables.table_schema AND columns.table_name=tables.table_name
    WHERE tables.table_type='BASE TABLE' AND tables.table_schema IN ('core',$1)
    GROUP BY tables.table_schema,tables.table_name ORDER BY tables.table_schema,tables.table_name`,
    [schema],
  );
  const descriptors = rows
    .filter(
      (row) =>
        row.schema === schema ||
        row.scoped ||
        (row.schema === 'core' && ['workspace', 'user'].includes(row.name)),
    )
    .filter(
      (row) => !(row.schema === 'core' && row.name === 'deliveryOperations'),
    );
  for (const row of descriptors)
    assert(row.identified, `Cannot protect ${row.name} without its identity.`);
  return descriptors.map((row) => ({
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
  }));
}
async function readTables(manager, descriptors) {
  const tables = [];
  for (const table of descriptors) {
    const condition =
      table.scope === 'NATIVE'
        ? 'true'
        : table.scope === 'WORKSPACE_ROW'
          ? 'record.id=$1'
          : table.scope === 'USERS'
            ? 'record.id IN (SELECT "userId" FROM core."userWorkspace" WHERE "workspaceId"=$1)'
            : 'record."workspaceId"=$1';
    // Row digests protect all existing data without putting private record contents in the journal.
    const rows = await manager.query(
      `SELECT record.id::text AS id,md5(to_jsonb(record)::text) AS hash
      FROM ${quote(table.schema)}.${quote(table.name)} record WHERE ${condition} ORDER BY record.id`,
      table.scope === 'NATIVE' ? [] : [WORKSPACE_ID],
    );
    tables.push({ ...table, rows, hash: fingerprint(rows) });
  }
  return tables;
}
function expectedIds(fixture, schema, name) {
  if (schema === fixture.schema)
    return name === 'task'
      ? [fixture.taskId]
      : name === 'company'
        ? [fixture.companyId]
        : [];
  const owned = {
    deliveryProject: [fixture.projectId],
    deliveryTask: [fixture.deliveryTaskId],
    deliveryCommitmentPeriod: [fixture.periodId],
    deliveryCommitmentLine: [fixture.lineId],
    deliveryFinanceEntry: [fixture.revenueId, fixture.costId],
    deliveryFinanceAllocation: [
      fixture.revenueAllocationId,
      fixture.costAllocationId,
    ],
  };
  return owned[name] ?? [];
}
function additions(tables, fixture, preserveAuthenticationLifecycle = false) {
  assert.deepEqual(
    tables.map(({ schema, name, scope }) => ({ schema, name, scope })),
    fixture.baseline.tables.map(({ schema, name, scope }) => ({
      schema,
      name,
      scope,
    })),
    'The protected schema changed; retain the journal for explicit review.',
  );
  return tables.map((table, index) => {
    // Browser requests rotate tokens and touch sessions independently; protect their current rows instead.
    if (
      preserveAuthenticationLifecycle &&
      isAuthenticationLifecycleTable(table)
    )
      return { ...table, rows: [] };
    const baseline = fixture.baseline.tables[index];
    const ids = new Set(baseline.rows.map((row) => row.id));
    assert.equal(
      fingerprint(table.rows.filter((row) => ids.has(row.id))),
      baseline.hash,
      `Preexisting ${table.schema}.${table.name} changed; refusing cleanup.`,
    );
    return { ...table, rows: table.rows.filter((row) => !ids.has(row.id)) };
  });
}
function stripOwnedOperations(operations, fixture, hasSeed) {
  assert.equal(operations.id, fixture.baseline.operations.id);
  const proposed = copy(operations.state);
  for (const [path, id, seed] of [
    [['business', 'records'], fixture.reportId, fixture.seed?.report],
    [
      ['clients', 'engagements'],
      fixture.engagementId,
      fixture.seed?.engagement,
    ],
    [['alerts'], fixture.alertId, fixture.seed?.alert],
  ]) {
    const parent = path.length === 2 ? proposed[path[0]] : proposed;
    const key = path[path.length - 1];
    const found = parent[key].filter((row) => row.id === id);
    assert.equal(
      found.length,
      hasSeed ? 1 : 0,
      'Only the complete owned Operations seed may be removed.',
    );
    if (hasSeed)
      assert.equal(
        fingerprint(found[0]),
        fingerprint(seed),
        'Fixture source edits are not allowed.',
      );
    parent[key] = parent[key].filter((row) => row.id !== id);
  }
  if (hasSeed) {
    assert.equal(proposed.assignments[fixture.taskId], fixture.seed.assignment);
    delete proposed.assignments[fixture.taskId];
  } else assert(!Object.hasOwn(proposed.assignments, fixture.taskId));
  assert.equal(
    fingerprint(withoutHeartbeat(proposed)),
    fixture.baseline.operations.hash,
    'Unrelated Operations state, notices, fulfilments or source records changed; refusing cleanup.',
  );
  return proposed;
}
function validateOwned(
  tables,
  operations,
  fixture,
  preserveAuthenticationLifecycle = false,
) {
  const extra = additions(tables, fixture, preserveAuthenticationLifecycle);
  const hasSeed = extra.some((table) => table.rows.length > 0);
  if (hasSeed)
    assert(
      fixture.seed,
      'Committed data requires its durable seed fingerprints.',
    );
  for (const table of extra) {
    const expected = hasSeed
      ? expectedIds(fixture, table.schema, table.name)
      : [];
    assert.deepEqual(
      table.rows.map((row) => row.id).sort(),
      [...expected].sort(),
      `Unexpected ${table.schema}.${table.name} additions; refusing cleanup.`,
    );
    if (hasSeed)
      assert.equal(
        fingerprint(table.rows),
        fixture.seed.tables[`${table.schema}.${table.name}`],
        `The immutable ${table.name} seed changed; refusing cleanup.`,
      );
  }
  return {
    extra,
    hasSeed,
    proposed: stripOwnedOperations(operations, fixture, hasSeed),
  };
}
function printFixture(fixture) {
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        status: fixture.status,
        workspaceId: WORKSPACE_ID,
        actorId: fixture.actorId,
        actorName: fixture.actorName,
        sentinel: fixture.sentinel,
        companyId: fixture.companyId,
        projectId: fixture.projectId,
        engagementId: fixture.engagementId,
        periodId: fixture.periodId,
        taskId: fixture.taskId,
        reportId: fixture.reportId,
        month: MONTH,
        expected: {
          blockedTask: 1,
          overdueTask: 1,
          promised: 2,
          fulfilled: 0,
          reportStatus: 'REVIEW',
          recognizedRevenue: '50.00',
          recognizedCost: '100.00',
          recognizedResult: '-50.00',
        },
        urls: {
          founder: `/delivery?view=health&founderProject=${fixture.projectId}&founderCurrency=USD&founderMonth=${MONTH}`,
          commitment: `/delivery?view=clients&clientEngagement=${fixture.engagementId}&commitmentPeriod=${fixture.periodId}`,
          report: `/delivery?view=ads&businessRecord=${fixture.reportId}`,
        },
      },
      null,
      2,
    ),
  );
}
async function createFixture() {
  assert(
    !existsSync(FILE),
    'Recover the active founder browser fixture first.',
  );
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    ...Object.fromEntries(IDS.map((key) => [key, randomUUID()])),
    month: MONTH,
    createdAt: new Date().toISOString(),
    baseline: null,
    cleanupAttempts: [],
  };
  fixture.marker = markerFor(fixture.nonce);
  fixture.sentinel = titleFor(fixture.nonce);
  fixture.dueAt = new Date(
    Date.parse(fixture.createdAt) - 86400000,
  ).toISOString();
  writeJournal(fixture, FILE, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT id,"databaseSchema","activationStatus" FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert(workspace && workspace.activationStatus === 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    quote(fixture.schema);
    const admins = await manager.query(
      `SELECT member.id AS "memberId",membership.id AS "userWorkspaceId",
      trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name
      FROM ${quote(fixture.schema)}."workspaceMember" member
      JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1
      JOIN core."user" account ON account.id=membership."userId"
      JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1
      JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1
      WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL
        AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(
      admins.length,
      1,
      'Use the existing native administrator; never create or change access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorName = admins[0].name;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    const operations = await readOperations(manager);
    assert(
      !operations.state.clients.engagements.some((item) =>
        item.name.startsWith(PREFIX),
      ) &&
        !operations.state.business.records.some((item) =>
          item.title.startsWith(PREFIX),
        ),
      'Recover previous founder acceptance fixtures first.',
    );
    assert(!Object.hasOwn(operations.state.assignments, fixture.taskId));
    const [occupied] = await manager.query(
      `SELECT
      EXISTS(SELECT 1 FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND month=$2)
      OR EXISTS(SELECT 1 FROM core."deliveryFinancePeriod" WHERE "workspaceId"=$1 AND month=$2) AS occupied`,
      [WORKSPACE_ID, MONTH],
    );
    assert(
      !occupied.occupied,
      'The synthetic recognition month must be empty and unlocked.',
    );
    const descriptors = await tableDescriptors(manager, fixture.schema);
    fixture.baseline = {
      tables: await readTables(manager, descriptors),
      operations: {
        id: operations.id,
        hash: fingerprint(withoutHeartbeat(operations.state)),
      },
    };
    fixture.status = 'PREPARED';
    writeJournal(fixture);
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.company (id,name) VALUES ($1,$2)`,
      [fixture.companyId, fixture.sentinel],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES ($1,$2,$3,$4,$5)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.sentinel,
        fixture.companyId,
        JSON.stringify([fixture.actorId]),
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.task (id,title,"assigneeId",status,"dueAt") VALUES ($1,$2,$3,'IN_PROGRESS',$4)`,
      [
        fixture.taskId,
        `${fixture.sentinel} blocked video`,
        fixture.actorId,
        fixture.dueAt,
      ],
    );
    const details = {
      brief: `${fixture.marker} Read-only synthetic founder acceptance.`,
      service: 'AI video',
      priority: 'NORMAL',
      scheduledDate: fixture.dueAt.slice(0, 10),
      reviewerId: fixture.actorId,
      state: 'BLOCKED',
      blocker: 'Synthetic reference asset is missing.',
      checklist: [],
      evidence: [],
      submissions: [],
      events: [],
    };
    await manager.query(
      'INSERT INTO core."deliveryTask" (id,"workspaceId","taskId","projectId",details) VALUES ($1,$2,$3,$4,$5)',
      [
        fixture.deliveryTaskId,
        WORKSPACE_ID,
        fixture.taskId,
        fixture.projectId,
        details,
      ],
    );
    await manager.query(
      `INSERT INTO core."deliveryCommitmentPeriod"
      (id,"workspaceId","engagementId","projectId","clientId",label,billing,"startDate","endDateExclusive",timezone,state,revision)
      VALUES ($1,$2,$3,$4,$5,$6,'RETAINER','2020-02-01','2020-03-01','Asia/Qatar','OPEN',1)`,
      [
        fixture.periodId,
        WORKSPACE_ID,
        fixture.engagementId,
        fixture.projectId,
        fixture.companyId,
        `${fixture.sentinel} ended period`,
      ],
    );
    await manager.query(
      `INSERT INTO core."deliveryCommitmentLine" (id,"workspaceId","periodId",label,unit,"promisedQuantity",revision)
      VALUES ($1,$2,$3,$4,'UNIQUE_VIDEO',2,1)`,
      [
        fixture.lineId,
        WORKSPACE_ID,
        fixture.periodId,
        `${fixture.sentinel} videos`,
      ],
    );
    for (const [id, allocationId, kind, amount] of [
      [fixture.revenueId, fixture.revenueAllocationId, 'REVENUE', '50000000'],
      [fixture.costId, fixture.costAllocationId, 'COST', '100000000'],
    ]) {
      await manager.query(
        `INSERT INTO core."deliveryFinanceEntry"
        (id,"workspaceId",revision,month,kind,category,title,currency,"amountMicros",note,status,"sourceType","createdBy","postedBy","postedAt","createdAt","updatedAt")
        VALUES ($1,$2,1,$3,$4,'Synthetic acceptance',$5,'USD',$6,$7,'POSTED','MANUAL',$8,$8,$9,$9,$9)`,
        [
          id,
          WORKSPACE_ID,
          MONTH,
          kind,
          `${fixture.sentinel} ${kind.toLowerCase()}`,
          amount,
          fixture.marker,
          fixture.actorId,
          fixture.createdAt,
        ],
      );
      await manager.query(
        `INSERT INTO core."deliveryFinanceAllocation" (id,"workspaceId","entryId",bucket,"projectId","projectName","amountMicros") VALUES ($1,$2,$3,$4::text,$4::uuid,$5,$6)`,
        [
          allocationId,
          WORKSPACE_ID,
          id,
          fixture.projectId,
          fixture.sentinel,
          amount,
        ],
      );
    }
    const engagement = {
      id: fixture.engagementId,
      revision: 1,
      projectId: fixture.projectId,
      companyId: fixture.companyId,
      name: fixture.sentinel,
      services: ['AI video', 'Performance marketing'],
      billing: 'RETAINER',
      scope: `${fixture.marker} Synthetic read-only acceptance.`,
      allowance: 'Two unique videos',
      contact: '',
      fields: [],
      assets: [],
      submissions: [],
    };
    const report = {
      id: fixture.reportId,
      revision: 1,
      kind: 'AD_REPORT',
      projectId: fixture.projectId,
      title: `${fixture.sentinel} campaign review`,
      date: fixture.createdAt.slice(0, 10),
      channel: 'META',
      currency: 'USD',
      spend: 1000,
      attributedRevenue: 2000,
      shopifyRevenue: null,
      purchases: 1,
      qualifiedLeads: 0,
      bookedCalls: 0,
      webinarRegistrations: 0,
      goal: 'PURCHASES',
      targetCost: 1500,
      recommendation: `${fixture.marker} Synthetic awaiting-review report; no live account.`,
      sourceUrl: 'https://example.invalid/founder-acceptance',
      marketerId: fixture.actorId,
      createdBy: fixture.actorId,
      createdAt: fixture.createdAt,
      updatedAt: fixture.createdAt,
      status: 'REVIEW',
      decisionBy: null,
      evidence: null,
      taskId: null,
      history: [],
    };
    const [nativeTask] = await manager.query(
      `SELECT "dueAt" FROM ${quote(fixture.schema)}.task WHERE id=$1`,
      [fixture.taskId],
    );
    // Match the worker's exact Date interpolation so it will not create or send a new overdue alert.
    const alert = {
      id: fixture.alertId,
      taskId: fixture.taskId,
      category: 'LATE',
      sourceKey: `${fixture.taskId}:${nativeTask.dueAt}:0`,
      severity: 'NORMAL',
      reason: `${fixture.marker} Resolved synthetic notification suppression.`,
      ownerId: fixture.actorId,
      createdAt: fixture.createdAt,
      acknowledgedAt: fixture.createdAt,
      resolvedAt: fixture.createdAt,
    };
    const proposed = copy(operations.state);
    proposed.clients.engagements.push(engagement);
    proposed.business.records.push(report);
    proposed.alerts.push(alert);
    const assignment = `${fixture.actorId}:legacy`;
    proposed.assignments[fixture.taskId] = assignment;
    const updated = await manager.query(
      'WITH changed AS (UPDATE core."deliveryOperations" SET state=$3 WHERE id=$1 AND "workspaceId"=$2 RETURNING id) SELECT id FROM changed',
      [operations.id, WORKSPACE_ID, proposed],
    );
    assert.equal(updated.length, 1);
    fixture.seed = { engagement, report, alert, assignment, tables: {} };
    const seeded = await readTables(manager, descriptors);
    for (const table of additions(seeded, fixture)) {
      assert.deepEqual(
        table.rows.map((row) => row.id).sort(),
        expectedIds(fixture, table.schema, table.name).sort(),
      );
      fixture.seed.tables[`${table.schema}.${table.name}`] = fingerprint(
        table.rows,
      );
    }
    validateOwned(seeded, await readOperations(manager), fixture);
    writeJournal(fixture);
    if (process.env.OTOGROW_FOUNDER_UI_TEST_FAILURE === 'create-before-commit')
      throw new Error('Injected founder create failure before commit');
  });
  if (process.env.OTOGROW_FOUNDER_UI_TEST_FAILURE === 'create-after-commit')
    throw new Error('Injected founder create failure after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
  console.log(
    'Read only: filter the founder queue, open the owned task/commitment/manual report/monthly result, and use browser back. Do not edit, approve, assign, acknowledge, resolve, post, message, create exports or invoke agents/providers. No notices, roles, users or global settings were created or changed.',
  );
}
async function cleanupFixture() {
  const fixture = readJournal();
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    if (!fixture.baseline) {
      const [workspace] = await manager.query(
        'SELECT "databaseSchema" FROM core.workspace WHERE id=$1',
        [WORKSPACE_ID],
      );
      quote(workspace.databaseSchema);
      for (const table of await readTables(
        manager,
        await tableDescriptors(manager, workspace.databaseSchema),
      ))
        assert(
          !table.rows.some((row) => IDS.some((key) => fixture[key] === row.id)),
          'Unprepared journal cannot own committed rows.',
        );
      const operations = await readOperations(manager);
      assert(
        !operations.state.clients.engagements.some(
          (row) => row.id === fixture.engagementId,
        ) &&
          !operations.state.business.records.some(
            (row) => row.id === fixture.reportId,
          ) &&
          !operations.state.alerts.some((row) => row.id === fixture.alertId) &&
          !Object.hasOwn(operations.state.assignments, fixture.taskId),
      );
      fixture.noCommittedSeed = true;
      return;
    }
    for (const name of ['appToken', 'userSession'])
      await manager.query(
        `SELECT id FROM core.${quote(name)} WHERE "workspaceId"=$1 ORDER BY id FOR UPDATE`,
        [WORKSPACE_ID],
      );
    const tables = await readTables(
      manager,
      await tableDescriptors(manager, fixture.schema),
    );
    const authenticationTables = tables.filter(isAuthenticationLifecycleTable);
    assert.equal(authenticationTables.length, 2);
    const authenticationLifecycle = authenticationTables.map((table) => {
      const original = fixture.baseline.tables.find(
        (candidate) =>
          candidate.schema === table.schema && candidate.name === table.name,
      );
      assert(original);
      return {
        table: table.name,
        scope: `core.${table.name} for the exact fixture workspace only`,
        originalHash: original.hash,
        originalRows: original.rows,
        beforeCleanupHash: table.hash,
        beforeCleanupRows: table.rows,
      };
    });
    const operations = await readOperations(manager);
    const { extra, hasSeed, proposed } = validateOwned(
      tables,
      operations,
      fixture,
      true,
    );
    if (!hasSeed) {
      const authenticationAfter = await readTables(
        manager,
        authenticationTables,
      );
      for (const observation of authenticationLifecycle) {
        const after = authenticationAfter.find(
          (table) => table.name === observation.table,
        );
        assert(after);
        assert.equal(
          after.hash,
          observation.beforeCleanupHash,
          `Cleanup must preserve exact current ${observation.table} rows.`,
        );
        assert.deepEqual(after.rows, observation.beforeCleanupRows);
        observation.afterCleanupHash = after.hash;
        observation.afterCleanupRows = after.rows;
      }
      if (fixture.cleanupAttempts.length) {
        const expected = fixture.cleanupAttempts.at(-1);
        assert.equal(
          fingerprint(withoutHeartbeat(operations.state)),
          expected.proposedWithoutHeartbeatHash,
          'Interrupted committed cleanup must match its saved target.',
        );
        if (fixture.status !== 'CLEANED') {
          fixture.cleanupRecoveredAfterCommit = true;
          fixture.cleanupRecoveryAuthenticationLifecycle =
            authenticationLifecycle;
        }
      }
      return;
    }
    assert(
      fixture.cleanupAttempts.length < 20,
      'Retain the journal after repeated cleanup attempts.',
    );
    const attempt = {
      preparedAt: new Date().toISOString(),
      beforeStateHash: fingerprint(operations.state),
      proposedHash: fingerprint(proposed),
      proposedWithoutHeartbeatHash: fingerprint(withoutHeartbeat(proposed)),
      authenticationLifecycle,
      rows: extra
        .filter((table) => table.rows.length)
        .map(({ schema, name, rows }) => ({ schema, name, rows })),
    };
    fixture.cleanupAttempts.push(attempt);
    fixture.status = 'CLEANUP_PREPARED';
    writeJournal(fixture);
    for (const [scope, name] of DELETE_ORDER) {
      const schema = scope === 'native' ? fixture.schema : scope;
      const ids = expectedIds(fixture, schema, name);
      const deleted = await manager.query(
        `WITH deleted AS (DELETE FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[])${scope === 'core' ? ' AND "workspaceId"=$2' : ''} RETURNING id) SELECT id FROM deleted`,
        scope === 'core' ? [ids, WORKSPACE_ID] : [ids],
      );
      assert.equal(deleted.length, ids.length);
    }
    const updated = await manager.query(
      'WITH changed AS (UPDATE core."deliveryOperations" SET state=$3 WHERE id=$1 AND "workspaceId"=$2 RETURNING id) SELECT id FROM changed',
      [operations.id, WORKSPACE_ID, proposed],
    );
    assert.equal(updated.length, 1);
    const after = await readTables(manager, fixture.baseline.tables);
    for (let index = 0; index < after.length; index++)
      assert.equal(
        after[index].hash,
        isAuthenticationLifecycleTable(after[index])
          ? authenticationTables.find(
              (table) => table.name === after[index].name,
            ).hash
          : fixture.baseline.tables[index].hash,
        `Exact protected baseline did not survive cleanup: ${after[index].name}`,
      );
    for (const observation of authenticationLifecycle) {
      const authenticationAfter = after.find(
        (table) => table.schema === 'core' && table.name === observation.table,
      );
      assert(authenticationAfter);
      assert.deepEqual(
        authenticationAfter.rows,
        observation.beforeCleanupRows,
        `Cleanup must never mutate or delete current ${observation.table} rows.`,
      );
      observation.afterCleanupHash = authenticationAfter.hash;
      observation.afterCleanupRows = authenticationAfter.rows;
    }
    assert.equal(
      fingerprint((await readOperations(manager)).state),
      attempt.proposedHash,
      'Cleanup may remove only verified seeds from the locked current Operations document.',
    );
    fixture.cleanupFinalOperationsHash = attempt.proposedHash;
    writeJournal(fixture);
    if (process.env.OTOGROW_FOUNDER_UI_TEST_FAILURE === 'cleanup-before-commit')
      throw new Error('Injected founder cleanup failure before commit');
  });
  if (process.env.OTOGROW_FOUNDER_UI_TEST_FAILURE === 'cleanup-after-commit')
    throw new Error('Injected founder cleanup failure after commit');
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
    `Removed only verified founder fixture seeds; financial/native/source/global-user/role baselines and unrelated Operations state match. Exceptions: normal lifecycle changes since creation in this workspace's core.appToken and core.userSession are preserved; their current rows were locked and stayed byte/hash-identical across cleanup, without token/session mutations. Original/current IDs and hashes are recorded in the private receipt: ${receipt}`,
  );
}
async function main() {
  assert.equal(process.argv.length, 3);
  const command = process.argv[2];
  assert(['create', 'inspect', 'cleanup'].includes(command));
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  if (command === 'inspect') {
    printFixture(readJournal());
    return;
  }
  await connectionSource.initialize();
  try {
    if (command === 'create') await createFixture();
    else await cleanupFixture();
  } finally {
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  console.error(
    `Retain ${FILE}; the transaction may have committed and its private journal is required for exact recovery.`,
  );
  process.exitCode = 1;
});

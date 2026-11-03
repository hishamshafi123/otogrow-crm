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
const { v5 } = require('uuid');
const FILE = '/tmp/otogrow-atlas-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const OWNED_IDS = [
  'nonce',
  'projectId',
  'taskId',
  'deliveryTaskId',
  'connectionId',
];
const PROFILE_IDS = [
  'google/nano-banana-pro/text-to-image',
  'bytedance/seedream-v5.0-pro/text-to-image',
  'google/veo3.1-fast/image-to-video',
];
const MAX_SAVES = 8;
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
const markerFor = (nonce) => `atlas-ui:${nonce}`;
const titleFor = (nonce) => `Disposable Atlas UI ${nonce.slice(0, 8)}`;
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
  assert.deepEqual(fixture.profileIds, PROFILE_IDS);
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

async function validate(manager, fixture) {
  const tables = await readTables(manager, fixture);
  const extra = additions(tables, fixture);
  const state = await operations(manager);
  assert.equal(state.id, fixture.baseline.operations.id);
  assert(
    state.state.assignments &&
      typeof state.state.assignments === 'object' &&
      !Array.isArray(state.state.assignments),
    'Legacy assignment receipt storage must remain intact.',
  );
  const hasAssignmentReceipt = Object.hasOwn(
    state.state.assignments,
    fixture.taskId,
  );
  const assignmentReceipt = hasAssignmentReceipt
    ? { taskId: fixture.taskId, value: state.state.assignments[fixture.taskId] }
    : null;
  const protectedOperations = copy(state.state);
  if (assignmentReceipt) {
    assert.equal(
      assignmentReceipt.value,
      `${fixture.actorId}:legacy`,
      'Only the exact owned task legacy Seen receipt is permitted.',
    );
    delete protectedOperations.assignments[fixture.taskId];
  }
  assert.equal(
    fingerprint(withoutHeartbeat(protectedOperations)),
    fixture.baseline.operations.hash,
    'Removing only the exact owned Seen receipt must reproduce the original Operations baseline; messaging, routing, bots, notices and all other state remain protected.',
  );
  const owned = [
    ['core', 'deliveryProject', fixture.projectId],
    ['core', 'deliveryTask', fixture.deliveryTaskId],
    [fixture.schema, 'task', fixture.taskId],
    ['core', 'deliveryAtlasConnection', fixture.connectionId],
  ];
  const counts = owned.map(
    ([schema, name]) =>
      extra.find((table) => table.schema === schema && table.name === name)
        ?.rows.length,
  );
  assert(
    counts.every((count) => count === 1) ||
      counts.every((count) => count === 0),
    'Partial owned fixture detected; preserve its journal.',
  );
  const hasSeed = counts.every((count) => count === 1);
  for (const table of extra) {
    const source = owned.find(
      ([schema, name]) => table.schema === schema && table.name === name,
    );
    if (source)
      exactIds(
        table.rows,
        hasSeed ? [source[2]] : [],
        `Unexpected ${table.name} source.`,
      );
    else if (
      !(table.schema === 'core' && table.name === 'otogrowActivityEvent')
    )
      assert.equal(
        table.rows.length,
        0,
        `Unexpected ${table.schema}.${table.name} mutation; no credential/job/spending/outbox/access actions are allowed.`,
      );
  }
  const activityIds = extra
    .find(
      (table) =>
        table.schema === 'core' && table.name === 'otogrowActivityEvent',
    )
    .rows.map((row) => row.id);
  if (!hasSeed) {
    assert.equal(
      assignmentReceipt,
      null,
      'An owned Seen receipt cannot outlive its exact task fixture.',
    );
    assert.equal(
      activityIds.length,
      0,
      'Activity exists without its exact owned connection.',
    );
    return { tables, extra, hasSeed, activity: [] };
  }
  for (const [schema, name, id] of owned.slice(0, 3)) {
    const rows = await manager.query(
      `SELECT * FROM ${quote(schema)}.${quote(name)} WHERE id=$1`,
      [id],
    );
    assert.equal(rows.length, 1);
    assert.equal(
      fingerprint(rows[0]),
      fixture.seed[`${schema}.${name}`],
      `The owned ${name} is read-only.`,
    );
  }
  const [connection] = await manager.query(
    'SELECT * FROM core."deliveryAtlasConnection" WHERE id=$1 AND "workspaceId"=$2 FOR UPDATE',
    [fixture.connectionId, WORKSPACE_ID],
  );
  assert(connection);
  assert.deepEqual(
    without(copy(connection), [
      'revision',
      'enabledProfileIds',
      'defaultImageFamilyId',
      'defaultClipProfileId',
      'reservationLimits',
      'updatedAt',
    ]),
    without(fixture.connectionSeed, [
      'revision',
      'enabledProfileIds',
      'defaultImageFamilyId',
      'defaultClipProfileId',
      'reservationLimits',
      'updatedAt',
    ]),
  );
  assert.equal(connection.enabled, false);
  assert.equal(connection.credentialId, null);
  assert.equal(connection.verifiedAt, null);
  assert(
    Number.isInteger(connection.revision) &&
      connection.revision >= 1 &&
      connection.revision <= MAX_SAVES + 1,
    'Only the bounded documented settings saves are allowed.',
  );
  assert.equal(
    new Set(connection.enabledProfileIds).size,
    connection.enabledProfileIds.length,
  );
  assert(connection.enabledProfileIds.every((id) => PROFILE_IDS.includes(id)));
  const familyProfile = {
    'nano-banana-pro': PROFILE_IDS[0],
    'seedream-5-pro': PROFILE_IDS[1],
  };
  assert(
    connection.defaultImageFamilyId === null ||
      connection.enabledProfileIds.includes(
        familyProfile[connection.defaultImageFamilyId],
      ),
    'Image defaults must remain explicitly permitted.',
  );
  assert(
    connection.defaultClipProfileId === null ||
      (connection.defaultClipProfileId === PROFILE_IDS[2] &&
        connection.enabledProfileIds.includes(PROFILE_IDS[2])),
    'Video defaults must remain explicitly permitted.',
  );
  assert(
    Array.isArray(connection.reservationLimits) &&
      connection.reservationLimits.length <= PROFILE_IDS.length,
  );
  assert.equal(
    new Set(connection.reservationLimits.map((limit) => limit.profileId)).size,
    connection.reservationLimits.length,
  );
  for (const limit of connection.reservationLimits) {
    assert.deepEqual(
      Object.keys(limit).sort(),
      [
        'id',
        'revision',
        'profileId',
        'maximumCostUsd',
        'source',
        'verifiedAt',
      ].sort(),
    );
    assert(PROFILE_IDS.includes(limit.profileId));
    assert.equal(
      limit.id,
      v5(`atlas-price:${limit.profileId}`, fixture.connectionId),
    );
    assert(
      Number.isInteger(limit.revision) &&
        limit.revision >= 1 &&
        limit.revision < connection.revision,
    );
    assert(['0.250000', '0.500000', '1.000000'].includes(limit.maximumCostUsd));
    assert.equal(
      limit.source,
      `${fixture.marker} synthetic no-spend UI evidence`,
    );
    assert.equal(limit.verifiedAt, fixture.verifiedAt);
  }
  if (connection.revision === 1)
    assert.equal(fingerprint(connection), fingerprint(fixture.connectionSeed));
  assert(
    timestamp(connection.updatedAt, 'Settings timestamp') >=
      timestamp(fixture.connectionSeed.updatedAt, 'Seed timestamp'),
  );
  const activity = activityIds.length
    ? await manager.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) ORDER BY "occurredAt",id',
        [WORKSPACE_ID, activityIds],
      )
    : [];
  assert.equal(
    activity.length,
    connection.revision - 1,
    'Exactly one attributable activity receipt is required per settings revision.',
  );
  const revisions = [];
  for (const row of activity) {
    const next = Number(row.changes?.[0]?.after);
    revisions.push(next);
    assert.deepEqual(
      without(row, ['id', 'occurredAt', 'recordedAt', 'changes']),
      {
        workspaceId: WORKSPACE_ID,
        actorId: fixture.actorId,
        actorName: fixture.actorName,
        actorType: 'HUMAN',
        subjectMemberId: null,
        subjectName: null,
        category: 'DELIVERY',
        action: 'ATLAS_SETTINGS_UPDATED',
        outcome: 'RECORDED',
        summary: 'Updated Atlas model access, reservation limits and defaults.',
        projectId: null,
        projectName: null,
        clientId: null,
        clientName: null,
        taskId: null,
        taskName: null,
        agentName: null,
        sourceType: 'connection',
        sourceId: fixture.connectionId,
      },
    );
    assert.deepEqual(row.changes, [
      { field: 'revision', before: String(next - 1), after: String(next) },
    ]);
    for (const name of ['occurredAt', 'recordedAt'])
      assert(
        timestamp(row[name], name) >=
          timestamp(fixture.createdAt, 'Fixture timestamp') - 1000 &&
          timestamp(row[name], name) <= Date.now() + 5000,
      );
  }
  assert.deepEqual(
    revisions.sort((left, right) => left - right),
    Array.from({ length: connection.revision - 1 }, (_, index) => index + 2),
    'Settings receipts form one complete revision chain.',
  );
  return { tables, extra, hasSeed, activity, connection, assignmentReceipt };
}

function printFixture(fixture) {
  console.log(
    JSON.stringify(
      {
        status: fixture.status,
        project: fixture.title,
        task: `${fixture.title} static image`,
        settingsUrl: `/delivery?view=agents&agentView=media&task=${fixture.taskId}`,
        productionUrl: `/delivery?view=creative&project=${fixture.projectId}&task=${fixture.taskId}&panel=creative`,
        profileIds: PROFILE_IDS,
        imageFamilies: ['nano-banana-pro', 'seedream-5-pro'],
        videoDefault: PROFILE_IDS[2],
        permittedReservationUsd: ['0.25', '0.50', '1.00'],
        pricingEvidence: `${fixture.marker} synthetic no-spend UI evidence`,
        verifiedAtUtc: fixture.verifiedAt,
        maximumSettingsSaves: MAX_SAVES,
        journal: FILE,
      },
      null,
      2,
    ),
  );
  console.log(
    'Only save disabled, credential-free model/default/limit settings within the printed values. Keep defaults unset or among enabled models. Read the immutable static IMAGE production and prepare local drafts/context navigation only. Opening this owned task may record its exact legacy Seen receipt; cleanup removes only that key after the original Operations baseline proof. No API key, verification, price review/quote, generation, production-access save, task/project/brief edit, approval, job, spending or delivery/send action is allowed. Run inspect after saves; unexpected state preserves the journal.',
  );
}

async function createFixture() {
  assert(!existsSync(FILE), 'Recover the active Atlas fixture first.');
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    ...Object.fromEntries(OWNED_IDS.map((key) => [key, randomUUID()])),
    createdAt: new Date().toISOString(),
    verifiedAt: '2020-02-20T09:00:00.000Z',
    profileIds: PROFILE_IDS,
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
      FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1
      JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1
      JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(
      admins.length,
      1,
      'Use the existing administrator without granting access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorUserId = admins[0].userId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    fixture.actorName = admins[0].name || 'Former team member';
    const currentOperations = await operations(manager);
    assert(
      currentOperations.state.assignments &&
        typeof currentOperations.state.assignments === 'object' &&
        !Array.isArray(currentOperations.state.assignments),
    );
    assert.equal(
      Object.hasOwn(currentOperations.state.assignments, fixture.taskId),
      false,
      'A future owned task must not overwrite an original assignment receipt.',
    );
    const [{ retained }] = await manager.query(
      `SELECT EXISTS(SELECT 1 FROM core."deliveryAtlasConnection" WHERE "workspaceId"=$1) OR EXISTS(SELECT 1 FROM core."deliveryAtlasCredential" WHERE "workspaceId"=$1) OR EXISTS(SELECT 1 FROM core."deliveryAtlasJob" WHERE "workspaceId"=$1)
      OR EXISTS(SELECT 1 FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND price->>'billingType'='ATLAS_MEDIA') OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND left(action,6)='ATLAS_') AS retained`,
      [WORKSPACE_ID],
    );
    assert.equal(
      retained,
      false,
      'Preexisting Atlas setup/history is read-only: refuse this mutation fixture without overwriting it.',
    );
    assert.equal(
      (
        await manager.query(
          'SELECT count(*)::integer AS count FROM core."deliveryProject" WHERE "workspaceId"=$1 AND name LIKE \'Disposable Atlas UI %\'',
          [WORKSPACE_ID],
        )
      )[0].count,
      0,
      'Recover earlier Atlas fixtures first.',
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
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.title,
        JSON.stringify([fixture.actorId]),
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.task (id,title,"assigneeId",status) VALUES($1,$2,$3,'IN_PROGRESS')`,
      [fixture.taskId, `${fixture.title} static image`, fixture.actorId],
    );
    const {
      newCreativeDocument,
      creativeBriefSchema,
    } = require('../dist/modules/delivery/creative/delivery-creative.types');
    const document = newCreativeDocument();
    document.brief = creativeBriefSchema.parse({
      ...document.brief,
      outputKind: 'IMAGE',
      objective: 'ADS',
      audience: 'Synthetic internal acceptance',
      concept: `${fixture.marker} One static product still with clear space for a short headline.`,
      visualDirection:
        'Simple studio photograph; no real client/product claim.',
      duration: 1,
      format: '1:1',
    });
    document.approvedBriefVersion = 1;
    document.briefHistory = [
      { version: 1, brief: copy(document.brief), approved: true },
    ];
    document.mediaSettings = {
      version: 1,
      enabled: true,
      modelIds: PROFILE_IDS.map((id) => `atlascloud/${id}`),
      roles: ['ADMIN'],
      dailyRunLimit: 1,
      allowUnknownCost: false,
    };
    document.mediaRuns = [];
    await manager.query(
      'INSERT INTO core."deliveryTask" (id,"workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,$5,1)',
      [
        fixture.deliveryTaskId,
        WORKSPACE_ID,
        fixture.taskId,
        fixture.projectId,
        {
          brief: `${fixture.marker} Synthetic static IMAGE; no paid calls or final review.`,
          service: 'CONTENT',
          priority: 'NORMAL',
          scheduledDate: null,
          reviewerId: fixture.actorId,
          state: 'IN_PROGRESS',
          blocker: '',
          checklist: [],
          evidence: [],
          events: [],
          submissions: [],
          creative: document,
        },
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryAtlasConnection" (id,"workspaceId",revision,enabled,"credentialId","enabledProfileIds","defaultImageFamilyId","defaultClipProfileId","reservationLimits","verifiedAt") VALUES($1,$2,1,false,NULL,\'{}\',NULL,NULL,\'[]\',NULL)',
      [fixture.connectionId, WORKSPACE_ID],
    );
    for (const [schema, name, id] of [
      ['core', 'deliveryProject', fixture.projectId],
      ['core', 'deliveryTask', fixture.deliveryTaskId],
      [fixture.schema, 'task', fixture.taskId],
    ])
      fixture.seed[`${schema}.${name}`] = fingerprint(
        (
          await manager.query(
            `SELECT * FROM ${quote(schema)}.${quote(name)} WHERE id=$1`,
            [id],
          )
        )[0],
      );
    fixture.connectionSeed = copy(
      (
        await manager.query(
          'SELECT * FROM core."deliveryAtlasConnection" WHERE id=$1',
          [fixture.connectionId],
        )
      )[0],
    );
    writeJournal(fixture);
    await validate(manager, fixture);
    if (process.env.OTOGROW_ATLAS_UI_TEST_FAILURE === 'create-before-commit')
      throw new Error('Injected Atlas fixture create before commit');
  });
  if (process.env.OTOGROW_ATLAS_UI_TEST_FAILURE === 'create-after-commit')
    throw new Error('Injected Atlas fixture create after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
}

async function cleanupFixture() {
  const fixture = readJournal();
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      for (const [name, id] of [
        ['deliveryProject', fixture.projectId],
        ['deliveryTask', fixture.deliveryTaskId],
        ['deliveryAtlasConnection', fixture.connectionId],
      ])
        assert.equal(
          (
            await manager.query(
              `SELECT count(*)::integer AS count FROM core.${quote(name)} WHERE id=$1`,
              [id],
            )
          )[0].count,
          0,
          'Unjournalled owned state exists; preserve for review.',
        );
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
        rows: observation.extra
          .filter((table) => table.rows.length)
          .map(({ schema, name, rows }) => ({ schema, name, rows })),
        connection: copy(observation.connection),
        activity: copy(observation.activity),
        assignmentReceipt: observation.assignmentReceipt,
        authenticationLifecycle: authentication,
      });
      fixture.status = 'CLEANUP_PREPARED';
      writeJournal(fixture);
      for (const [schema, name] of [
        ['core', 'otogrowActivityEvent'],
        ['core', 'deliveryAtlasConnection'],
        ['core', 'deliveryTask'],
        [fixture.schema, 'task'],
        ['core', 'deliveryProject'],
      ]) {
        const ids = observation.extra
          .find((table) => table.schema === schema && table.name === name)
          .rows.map((row) => row.id);
        if (!ids.length) continue;
        const removed = await manager.query(
          `WITH removed AS (DELETE FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
          [ids],
        );
        exactIds(
          removed,
          ids,
          `Cleanup must remove only the exact validated ${name} rows.`,
        );
      }
      if (observation.assignmentReceipt) {
        const restored = await manager.query(
          `WITH restored AS (UPDATE core."deliveryOperations" SET state=jsonb_set(state,'{assignments}',(state->'assignments')-$3::text)
          WHERE id=$1 AND "workspaceId"=$2 AND state->'assignments'->>$3=$4 RETURNING id) SELECT id FROM restored`,
          [
            fixture.baseline.operations.id,
            WORKSPACE_ID,
            fixture.taskId,
            observation.assignmentReceipt.value,
          ],
        );
        assert.equal(
          restored.length,
          1,
          'Remove only the exact validated owned Seen receipt while retaining all other Operations fields.',
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
        `Protected ${after[index].schema}.${after[index].name} did not survive cleanup.`,
      );
    assert.equal(
      fingerprint(withoutHeartbeat((await operations(manager)).state)),
      fixture.baseline.operations.hash,
    );
    fixture.recoveryAuthenticationLifecycle = authentication.map((table) => ({
      table: table.name,
      beforeHash: table.hash,
      afterHash: after.find(
        (row) => row.schema === table.schema && row.name === table.name,
      ).hash,
    }));
    writeJournal(fixture);
    if (process.env.OTOGROW_ATLAS_UI_TEST_FAILURE === 'cleanup-before-commit')
      throw new Error('Injected Atlas fixture cleanup before commit');
  });
  if (process.env.OTOGROW_ATLAS_UI_TEST_FAILURE === 'cleanup-after-commit')
    throw new Error('Injected Atlas fixture cleanup after commit');
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
    `Removed only the exact owned Atlas connection/settings receipts/project/static task and its exact legacy Seen key. The original Operations baseline and all protected core/native/finance/access/transport/outbox rows and current login lifecycle survived. Private receipt: ${receipt}`,
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
    'Local database only.',
  );
  await connectionSource.initialize();
  try {
    if (command === 'create') await createFixture();
    else if (command === 'cleanup') await cleanupFixture();
    else {
      const fixture = readJournal();
      assert(
        fixture.baseline,
        'Setup did not prepare a baseline; use cleanup recovery.',
      );
      const observation = await connectionSource.transaction(
        async (manager) => {
          await locked(manager);
          return validate(manager, fixture);
        },
      );
      fixture.inspection = {
        observedAt: new Date().toISOString(),
        hasSeed: observation.hasSeed,
        revision: observation.connection?.revision ?? null,
        activityIds: observation.activity.map((row) => row.id),
        assignmentReceipt: observation.assignmentReceipt ?? null,
      };
      writeJournal(fixture);
      printFixture(fixture);
      console.log(
        `Protected-state inspection passed; ${observation.activity.length} exact settings receipts, no credentials/jobs/ledger or other mutations.`,
      );
    }
  } finally {
    await connectionSource.destroy();
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    console.error(
      `Preserve ${FILE}; interruption or unexpected-state recovery requires its private journal.`,
    );
    process.exitCode = 1;
  });

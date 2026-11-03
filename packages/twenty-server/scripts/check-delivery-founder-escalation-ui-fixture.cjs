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

const FILE = '/tmp/otogrow-founder-escalation-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const PREFIX = 'Disposable paused founder rule';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const IDS = ['nonce', 'ruleId', 'episodeId', 'seedNoticeId', 'seedCommandId'];
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
const markerFor = (nonce) => `founder-rule-ui:${nonce}`;
const titleFor = (nonce) => `${PREFIX} ${nonce.slice(0, 8)}`;
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
    ].map((key) => [key, rule[key]]),
  );
async function validateOwned(
  manager,
  tables,
  operations,
  fixture,
  preserveAuthenticationLifecycle = false,
) {
  const extra = additions(tables, fixture, preserveAuthenticationLifecycle);
  assert.equal(operations.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(withoutHeartbeat(operations.state)),
    fixture.baseline.operations.hash,
    'Paused-rule acceptance must not change routing, connections, business records or unrelated Operations state.',
  );
  const ruleRows = await manager.query(
    'SELECT * FROM core."deliveryFounderEscalationRule" WHERE "workspaceId"=$1 AND id=$2',
    [WORKSPACE_ID, fixture.ruleId],
  );
  const hasSeed = extra.some((table) => table.rows.length > 0);
  if (!hasSeed) {
    assert.equal(ruleRows.length, 0);
    return { extra, hasSeed };
  }
  assert(
    fixture.seedNoticeHash,
    'Committed data requires its immutable private seed receipt.',
  );
  assert.equal(ruleRows.length, 1);
  const rule = ruleRows[0];
  assert(
    rule.enabled === false &&
      rule.grantedBy === null &&
      rule.grantUserWorkspaceId === null &&
      rule.changedBy === fixture.actorId &&
      rule.changedByName === fixture.actorName &&
      rule.recipientId === fixture.actorId &&
      rule.name.startsWith(fixture.sentinel) &&
      Number.isSafeInteger(rule.revision) &&
      rule.revision >= 1 &&
      rule.lastEvaluatedAt === null &&
      rule.evaluationError === null,
    'Only the exact nonce-named never-enabled paused rule may be removed.',
  );
  const episodeRows = await manager.query(
    'SELECT * FROM core."deliveryFounderEscalationEpisode" WHERE "workspaceId"=$1 AND "ruleId"=$2',
    [WORKSPACE_ID, fixture.ruleId],
  );
  assert.equal(episodeRows.length, 1);
  const episode = episodeRows[0];
  assert.equal(episode.id, fixture.episodeId);
  assert(fixture.seedEpisode && fixture.seedEpisodeHash);
  const fixedEpisode = (value) =>
    Object.fromEntries(
      Object.entries(value).filter(
        ([key]) =>
          ![
            'revision',
            'acknowledgedAt',
            'acknowledgedByName',
            'acknowledgementReason',
          ].includes(key),
      ),
    );
  assert.equal(
    fingerprint(fixedEpisode(episode)),
    fingerprint(fixedEpisode(fixture.seedEpisode)),
    'Only exact acknowledgement fields may amend the immutable synthetic observation.',
  );
  if (episode.acknowledgedAt === null)
    assert.equal(fingerprint(episode), fixture.seedEpisodeHash);
  else {
    assert.equal(
      episode.revision,
      fixture.seedEpisode.revision + 1,
      'The synthetic issue permits exactly one acknowledgement revision.',
    );
    assert.equal(
      episode.acknowledgedByName,
      fixture.actorName,
      'The acknowledgement must belong to the exact fixture actor.',
    );
    assert.equal(
      typeof episode.acknowledgementReason,
      'string',
      'The acknowledgement reason must be text.',
    );
    assert(
      episode.acknowledgementReason.trim().length > 0,
      'The acknowledgement must retain a nonempty reason.',
    );
    assert(
      episode.acknowledgementReason.length <= 2000,
      'The acknowledgement reason exceeds the permitted bound.',
    );
    assert(
      timestamp(episode.acknowledgedAt, 'Episode acknowledgement') >=
        timestamp(fixture.createdAt, 'Fixture creation'),
      'The acknowledgement must not precede fixture creation.',
    );
  }
  const notices = await manager.query(
    'SELECT * FROM core."deliveryFounderEscalationNotice" WHERE "workspaceId"=$1 AND "ruleId"=$2 ORDER BY "ruleRevision",id',
    [WORKSPACE_ID, fixture.ruleId],
  );
  assert(notices.length >= 1 && notices.length <= 20);
  const seed = notices.find((notice) => notice.id === fixture.seedNoticeId);
  assert(seed);
  assert.equal(
    fingerprint(seed),
    fixture.seedNoticeHash,
    'Original seed history must remain immutable.',
  );
  for (const notice of notices) {
    const label = `Owned administrative notice ${notice.id}`;
    assert(
      ['RULE_SAVED', 'RULE_PAUSED', 'ACKNOWLEDGED'].includes(notice.kind),
      `${label} has an unsupported event kind.`,
    );
    assert.equal(
      notice.episodeId,
      notice.kind === 'ACKNOWLEDGED' ? fixture.episodeId : null,
      `${label} must reference exactly the permitted synthetic episode.`,
    );
    assert.equal(
      notice.source,
      null,
      `${label} cannot contain alert transport evidence.`,
    );
    assert.equal(
      notice.createdBy,
      fixture.actorId,
      `${label} has an unexpected actor identity.`,
    );
    assert.equal(
      notice.actorName,
      fixture.actorName,
      `${label} has an unexpected actor name.`,
    );
    assert.equal(
      notice.recipientId,
      fixture.actorId,
      `${label} has an unexpected recipient identity.`,
    );
    assert.equal(
      notice.recipientName,
      fixture.actorName,
      `${label} has an unexpected recipient name.`,
    );
    assert.equal(
      notice.sequence,
      0,
      `${label} cannot be an alert transport occurrence.`,
    );
    assert(
      Number.isSafeInteger(notice.ruleRevision) && notice.ruleRevision >= 1,
      `${label} must retain a positive exact rule revision.`,
    );
    assert(
      notice.ruleRevision <= rule.revision,
      `${label} references a future rule revision.`,
    );
    assert(
      notice.ruleSnapshot &&
        typeof notice.ruleSnapshot === 'object' &&
        !Array.isArray(notice.ruleSnapshot),
      `${label} must retain its immutable configuration.`,
    );
    assert.equal(
      notice.ruleSnapshot.id,
      fixture.ruleId,
      `${label} snapshot has an unexpected rule identity.`,
    );
    assert.equal(
      notice.ruleSnapshot.revision,
      notice.ruleRevision,
      `${label} snapshot revision does not match its event.`,
    );
    assert.equal(
      notice.ruleSnapshot.enabled,
      false,
      `${label} must record a paused rule.`,
    );
    assert(
      typeof notice.ruleSnapshot.name === 'string' &&
        notice.ruleSnapshot.name.startsWith(fixture.sentinel),
      `${label} must retain the exact nonce name prefix.`,
    );
    assert.equal(
      notice.ruleSnapshot.recipientId,
      fixture.actorId,
      `${label} snapshot has an unexpected recipient.`,
    );
    assert(
      timestamp(notice.createdAt, `${label} creation`) >=
        timestamp(fixture.createdAt, 'Fixture creation'),
      `${label} must not precede fixture creation.`,
    );
    assert.match(notice.commandId, UUID);
    assert.match(notice.requestHash, HASH);
    assert.equal(notice.priority, notice.ruleSnapshot.priority);
  }
  const configurations = notices.filter(
    (notice) => notice.kind !== 'ACKNOWLEDGED',
  );
  const acknowledgements = notices.filter(
    (notice) => notice.kind === 'ACKNOWLEDGED',
  );
  assert.equal(
    acknowledgements.length,
    episode.acknowledgedAt === null ? 0 : 1,
  );
  if (acknowledgements.length) {
    const acknowledgement = acknowledgements[0];
    assert.equal(acknowledgement.reason, episode.acknowledgementReason);
    assert.equal(acknowledgement.actorName, episode.acknowledgedByName);
    assert.equal(
      timestamp(acknowledgement.createdAt, 'Acknowledgement event creation'),
      timestamp(episode.acknowledgedAt, 'Episode acknowledgement'),
      'The immutable acknowledgement event must retain the exact episode timestamp.',
    );
    const configuration = configurations.find(
      (notice) => notice.ruleRevision === acknowledgement.ruleRevision,
    );
    assert(configuration);
    assert.equal(
      fingerprint(acknowledgement.ruleSnapshot),
      fingerprint(configuration.ruleSnapshot),
    );
  }
  const revisions = new Set(
    configurations.map((notice) => notice.ruleRevision),
  );
  assert.equal(configurations.length, rule.revision);
  assert.equal(
    revisions.size,
    rule.revision,
    'Every paused rule revision must retain exactly one immutable administration receipt.',
  );
  const current = configurations.find(
    (notice) => notice.ruleRevision === rule.revision,
  );
  assert(current);
  assert.equal(
    fingerprint(current.ruleSnapshot),
    fingerprint({ ...draftOf(rule), enabled: false }),
    'Current rule configuration must match its exact immutable administration snapshot.',
  );
  const activities = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'founder-alert\' AND "sourceId"=$2 ORDER BY id',
    [WORKSPACE_ID, fixture.ruleId],
  );
  for (const event of activities) {
    assert(
      event.actorId === fixture.actorId &&
        event.actorType === 'HUMAN' &&
        event.category === 'DELIVERY' &&
        event.projectId === null &&
        event.taskId === null &&
        [
          'FOUNDER_ESCALATION_RULE_SAVED',
          'FOUNDER_ESCALATION_RULE_PAUSED',
          'FOUNDER_ESCALATION_ACKNOWLEDGED',
        ].includes(event.action) &&
        event.changes.length === 1 &&
        (event.action === 'FOUNDER_ESCALATION_ACKNOWLEDGED'
          ? acknowledgements.length === 1 &&
            event.changes[0].field === 'acknowledged' &&
            event.changes[0].after === 'true'
          : event.changes[0].field === 'revision' &&
            revisions.has(Number(event.changes[0].after))),
      'Only exact actor/source/revision activity belongs to this paused fixture.',
    );
  }
  assert.equal(
    activities.filter(
      (event) => event.action === 'FOUNDER_ESCALATION_ACKNOWLEDGED',
    ).length,
    acknowledgements.length,
  );
  const allowed = {
    deliveryFounderEscalationRule: [fixture.ruleId],
    deliveryFounderEscalationEpisode: [fixture.episodeId],
    deliveryFounderEscalationNotice: notices.map((notice) => notice.id),
    otogrowActivityEvent: activities.map((event) => event.id),
  };
  for (const table of extra) {
    assert.deepEqual(
      table.rows.map((row) => row.id).sort(),
      [...(table.schema === 'core' ? (allowed[table.name] ?? []) : [])].sort(),
      `Unexpected ${table.schema}.${table.name} additions, active episodes or outbox jobs; refusing cleanup.`,
    );
  }
  return { extra, hasSeed };
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
        ruleId: fixture.ruleId,
        episodeId: fixture.episodeId,
        url: `/delivery?view=health&founderPanel=alerts&founderRule=${fixture.ruleId}`,
        issueUrl: `/delivery?view=health&founderPanel=alerts&founderRule=${fixture.ruleId}&founderIssue=${fixture.episodeId}`,
        sourceUrl: fixture.sourceUrl,
      },
      null,
      2,
    ),
  );
}
async function createFixture() {
  assert(!existsSync(FILE), 'Recover the existing paused-rule fixture first.');
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    ...Object.fromEntries(IDS.map((key) => [key, randomUUID()])),
    createdAt: new Date().toISOString(),
    baseline: null,
    cleanupAttempts: [],
  };
  fixture.marker = markerFor(fixture.nonce);
  fixture.sentinel = titleFor(fixture.nonce);
  writeJournal(fixture, FILE, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT "databaseSchema","activationStatus" FROM core.workspace WHERE id=$1',
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
      'Use the existing current native admin; do not create or change access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorName = admins[0].name;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    const existing = await manager.query(
      'SELECT id FROM core."deliveryFounderEscalationRule" WHERE "workspaceId"=$1 AND name LIKE $2',
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    assert.equal(
      existing.length,
      0,
      'Recover prior paused-rule acceptance fixtures first.',
    );
    const descriptors = await tableDescriptors(manager, fixture.schema);
    const operations = await readOperations(manager);
    fixture.baseline = {
      tables: await readTables(manager, descriptors),
      operations: {
        id: operations.id,
        hash: fingerprint(withoutHeartbeat(operations.state)),
      },
    };
    fixture.status = 'PREPARED';
    writeJournal(fixture);
    const [report] = await manager.query(
      `SELECT report.id,report."projectId",report.status,to_char(report.date,'YYYY-MM-DD') AS date,
        report.report->>'currency' AS currency,report.report->>'timezone' AS timezone,project.name AS "projectName"
        FROM core."deliveryMetaReport" report LEFT JOIN core."deliveryProject" project
        ON project.id=report."projectId" AND project."workspaceId"=report."workspaceId"
        WHERE report."workspaceId"=$1 AND report."archivedAt" IS NULL
        AND report.status IN ('REVIEW','CHANGES_REQUESTED')
        AND (report."projectId" IS NULL OR project.id IS NOT NULL)
        ORDER BY report.position DESC,report.id DESC LIMIT 1`,
      [WORKSPACE_ID],
    );
    const condition = report
      ? report.status === 'REVIEW'
        ? 'CAMPAIGN_REVIEW'
        : 'CAMPAIGN_CHANGES_REQUESTED'
      : 'CAMPAIGN_SETUP';
    fixture.sourceUrl = report
      ? `/delivery?view=ads&metaArchive=ALL&metaReport=${report.id}`
      : '/delivery?view=health#company-readiness';
    const source = {
      key: `SYNTHETIC_BROWSER_FIXTURE:${fixture.nonce}`,
      domain: 'CAMPAIGNS',
      reasonCode: condition,
      sourceType: report ? 'META_REPORT' : 'CAMPAIGN_SETUP',
      sourceId: report?.id ?? null,
      sourceRevision: fingerprint({
        marker: fixture.marker,
        reportId: report?.id ?? null,
      }),
      projectId: report?.projectId ?? null,
      projectName: report?.projectName ?? null,
      title: `${fixture.sentinel} · synthetic browser observation, not a live finding`,
      occurredAt: fixture.createdAt,
      dueAt: null,
      ownerId: fixture.actorId,
      ownerName: fixture.actorName,
      ownerState: 'ACTIVE',
      evidence: {
        state: 'SYNTHETIC_UNAVAILABLE',
        date: report?.date ?? null,
        timezone: report?.timezone ?? null,
        currency: report?.currency ?? null,
        amountMicros: null,
        revenueMicros: null,
        costMicros: null,
        resultMicros: null,
        promisedQuantity: null,
        fulfilledQuantity: null,
        remainingQuantity: null,
        warnings: ['SYNTHETIC_BROWSER_FIXTURE'],
      },
      nextAction: {
        code: report ? 'REVIEW_CAMPAIGN' : 'REVIEW_SETUP',
        targetType: report ? 'META_REPORT' : 'READINESS',
        targetId: report?.id ?? null,
        engagementId: null,
        periodId: null,
        currency: null,
        serviceMonth: null,
        sourceKind: null,
      },
    };
    const rule = {
      id: fixture.ruleId,
      revision: 1,
      name: fixture.sentinel,
      condition,
      recipientId: fixture.actorId,
      priority: 'NORMAL',
      projectScope: 'ALL',
      projectIds: [],
      includeCompany: true,
      currency: null,
      serviceMonth: null,
      repeatMode: 'ONCE',
      repeatHours: null,
      maxSends: 1,
    };
    await manager.query(
      `INSERT INTO core."deliveryFounderEscalationRule"
      (id,"workspaceId",revision,enabled,name,condition,"recipientId","recipientName",priority,"projectScope","projectIds","includeCompany",currency,"serviceMonth","repeatMode","repeatHours","maxSends","grantedBy","grantUserWorkspaceId","changedBy","changedByName","changedAt","lastEvaluatedAt","evaluationError")
      VALUES($1,$2,1,false,$3,$7,$4,$5,'NORMAL','ALL','{}'::uuid[],true,NULL,NULL,'ONCE',NULL,1,NULL,NULL,$4,$5,$6,NULL,NULL)`,
      [
        fixture.ruleId,
        WORKSPACE_ID,
        fixture.sentinel,
        fixture.actorId,
        fixture.actorName,
        fixture.createdAt,
        condition,
      ],
    );
    await manager.query(
      `INSERT INTO core."deliveryFounderEscalationEpisode"
        (id,"workspaceId","ruleId",revision,"sourceKey",condition,status,source,"firstSeenAt","lastSeenAt","resolvedAt","acknowledgedAt","acknowledgedByName","acknowledgementReason")
        VALUES($1,$2,$3,1,$4,$5,'UNAVAILABLE',$6,$7,$7,NULL,NULL,NULL,NULL)`,
      [
        fixture.episodeId,
        WORKSPACE_ID,
        fixture.ruleId,
        report ? `META_REPORT:${report.id}` : 'CAMPAIGN_SETUP:META',
        condition,
        source,
        fixture.createdAt,
      ],
    );
    const [episode] = await manager.query(
      'SELECT * FROM core."deliveryFounderEscalationEpisode" WHERE id=$1 AND "workspaceId"=$2',
      [fixture.episodeId, WORKSPACE_ID],
    );
    fixture.seedEpisode = episode;
    fixture.seedEpisodeHash = fingerprint(episode);
    await manager.query(
      `INSERT INTO core."deliveryFounderEscalationNotice"
      (id,"workspaceId","ruleId","episodeId",kind,sequence,"ruleRevision","commandId","requestHash","ruleSnapshot",source,"recipientId","recipientName",priority,"createdBy","actorName",reason,"createdAt")
      VALUES($1,$2,$3,NULL,'RULE_SAVED',0,1,$4,$5,$6,NULL,$7,$8,'NORMAL',$7,$8,$9,$10)`,
      [
        fixture.seedNoticeId,
        WORKSPACE_ID,
        fixture.ruleId,
        fixture.seedCommandId,
        fingerprint({ rule, marker: fixture.marker }),
        { ...rule, enabled: false },
        fixture.actorId,
        fixture.actorName,
        fixture.marker,
        fixture.createdAt,
      ],
    );
    const [notice] = await manager.query(
      'SELECT * FROM core."deliveryFounderEscalationNotice" WHERE id=$1 AND "workspaceId"=$2',
      [fixture.seedNoticeId, WORKSPACE_ID],
    );
    fixture.seedNoticeHash = fingerprint(notice);
    await validateOwned(
      manager,
      await readTables(manager, descriptors),
      await readOperations(manager),
      fixture,
    );
    writeJournal(fixture);
    if (
      process.env.OTOGROW_FOUNDER_RULE_UI_TEST_FAILURE ===
      'create-before-commit'
    )
      throw new Error('Injected paused-rule create failure before commit');
  });
  if (
    process.env.OTOGROW_FOUNDER_RULE_UI_TEST_FAILURE === 'create-after-commit'
  )
    throw new Error('Injected paused-rule create failure after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
  console.log(
    'Only preview, edit/Save paused, inspect the labelled synthetic issue/follow-up owner, open its read-only source route and acknowledge that exact synthetic issue once. Retain the nonce name prefix and current admin recipient. Outage/Keep editing/retry/mobile/back are allowed. Never enable/adopt routing, change bot/global switches, send, or act on original source tasks/reports/finance/clients/roles. The synthetic observation does not assert a live issue or a Telegram send.',
  );
}
async function cleanupFixture() {
  const fixture = readJournal();
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    if (!fixture.baseline) {
      for (const [name, id] of [
        ['deliveryFounderEscalationRule', fixture.ruleId],
        ['deliveryFounderEscalationNotice', fixture.seedNoticeId],
        ['deliveryFounderEscalationEpisode', fixture.episodeId],
      ]) {
        const [{ count }] = await manager.query(
          `SELECT count(*)::int AS count FROM core."${name}" WHERE "workspaceId"=$1 AND id=$2`,
          [WORKSPACE_ID, id],
        );
        assert.equal(count, 0);
      }
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
    const operations = await readOperations(manager);
    const { extra, hasSeed } = await validateOwned(
      manager,
      tables,
      operations,
      fixture,
      true,
    );
    const authentication = tables.filter(isAuthenticationLifecycleTable);
    assert.equal(authentication.length, 2);
    const observations = authentication.map((table) => {
      const original = fixture.baseline.tables.find(
        (candidate) =>
          candidate.name === table.name && candidate.schema === table.schema,
      );
      assert(original);
      return {
        table: table.name,
        scope: WORKSPACE_ID,
        originalRows: original.rows,
        originalHash: original.hash,
        beforeRows: table.rows,
        beforeHash: table.hash,
      };
    });
    if (!hasSeed) {
      if (fixture.status !== 'CLEANED')
        fixture.cleanupRecoveredAfterCommit =
          fixture.cleanupAttempts.length > 0;
    } else {
      assert(fixture.cleanupAttempts.length < 20);
      const attempt = {
        preparedAt: new Date().toISOString(),
        operationsHash: fingerprint(operations.state),
        rows: extra
          .filter((table) => table.rows.length)
          .map(({ schema, name, rows }) => ({ schema, name, rows })),
        authenticationLifecycle: observations,
      };
      fixture.cleanupAttempts.push(attempt);
      fixture.status = 'CLEANUP_PREPARED';
      writeJournal(fixture);
      for (const name of [
        'otogrowActivityEvent',
        'deliveryFounderEscalationNotice',
        'deliveryFounderEscalationEpisode',
        'deliveryFounderEscalationRule',
      ]) {
        const ids = extra
          .find((table) => table.schema === 'core' && table.name === name)
          .rows.map((row) => row.id);
        if (!ids.length) continue;
        const deleted = await manager.query(
          `WITH deleted AS (DELETE FROM core.${quote(name)} WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) RETURNING id) SELECT id FROM deleted`,
          [WORKSPACE_ID, ids],
        );
        assert.equal(deleted.length, ids.length);
      }
    }
    const after = await readTables(manager, fixture.baseline.tables);
    for (let index = 0; index < after.length; index++)
      assert.equal(
        after[index].hash,
        isAuthenticationLifecycleTable(after[index])
          ? authentication.find((table) => table.name === after[index].name)
              .hash
          : fixture.baseline.tables[index].hash,
        `Exact protected baseline did not survive paused-rule cleanup: ${after[index].name}`,
      );
    for (const observation of observations) {
      const current = after.find(
        (table) => table.schema === 'core' && table.name === observation.table,
      );
      assert(current);
      assert.deepEqual(current.rows, observation.beforeRows);
      observation.afterRows = current.rows;
      observation.afterHash = current.hash;
    }
    assert.equal(
      fingerprint((await readOperations(manager)).state),
      fingerprint(operations.state),
      'Cleanup must never write Operations or unrelated source state.',
    );
    if (!hasSeed && fixture.status !== 'CLEANED')
      fixture.recoveryAuthenticationLifecycle = observations;
    writeJournal(fixture);
    if (
      process.env.OTOGROW_FOUNDER_RULE_UI_TEST_FAILURE ===
      'cleanup-before-commit'
    )
      throw new Error('Injected paused-rule cleanup failure before commit');
  });
  if (
    process.env.OTOGROW_FOUNDER_RULE_UI_TEST_FAILURE === 'cleanup-after-commit'
  )
    throw new Error('Injected paused-rule cleanup failure after commit');
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
    `Removed only the exact never-enabled nonce rule, immutable synthetic observation with its permitted attributed acknowledgement, and owned administration/activity. Original source, routing, bot, membership and outbox baselines match. Only current workspace appToken/userSession lifecycle is preserved with locked exact before/after IDs/digests. Private receipt: ${receipt}`,
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
    `Retain ${FILE}; exact interruption recovery requires its private journal.`,
  );
  process.exitCode = 1;
});

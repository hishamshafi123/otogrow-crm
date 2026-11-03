const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { dirname, join, resolve, sep } = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  reviewDetails,
} = require('./check-delivery-creative-review-support.cjs');
const FILE = '/tmp/otogrow-creative-review-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const PREFIX = 'Disposable creative review';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const IDS = [
  'nonce',
  'projectId',
  'taskId',
  'deliveryTaskId',
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
const markerFor = (nonce) => `creative-review-ui:${nonce}`;
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
  for (const assetId of Object.values(fixture.assets))
    assert.match(assetId, UUID);
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

const withoutOwnedAssignment = (state, fixture) => {
  const value = withoutHeartbeat(state);
  delete value.assignments[fixture.taskId];
  return value;
};
async function storageRoot(manager) {
  const values = await manager.query(
    `SELECT key,value FROM core."keyValuePair" WHERE type='CONFIG_VARIABLE' AND "workspaceId" IS NULL AND "userId" IS NULL AND key IN ('STORAGE_TYPE','STORAGE_LOCAL_PATH')`,
  );
  const configured = Object.fromEntries(
    values.map((row) => [row.key, row.value]),
  );
  assert.equal(
    (
      configured.STORAGE_TYPE ??
      process.env.STORAGE_TYPE ??
      'local'
    ).toLowerCase(),
    'local',
    'Synthetic media requires the current LOCAL storage driver.',
  );
  const relative =
    configured.STORAGE_LOCAL_PATH ??
    process.env.STORAGE_LOCAL_PATH ??
    '.local-storage';
  assert.equal(typeof relative, 'string');
  return resolve(__dirname, '..', relative);
}
function mediaDirectory(fixture) {
  assert.equal(
    fixture.media.directory,
    join(fixture.media.root, WORKSPACE_ID, 'delivery-creative', fixture.taskId),
  );
  return fixture.media.directory;
}
function verifyFiles(fixture, allowAbsent = false) {
  if (!fixture.media) return;
  const directory = mediaDirectory(fixture);
  if (!existsSync(directory)) {
    assert(allowAbsent);
    return;
  }
  assert(
    lstatSync(directory).isDirectory() &&
      !lstatSync(directory).isSymbolicLink(),
  );
  assert(
    realpathSync(directory).startsWith(realpathSync(fixture.media.root) + sep),
  );
  const names = readdirSync(directory).sort();
  assert.deepEqual(
    names,
    Object.keys(fixture.media.files).sort(),
    'Only journaled immutable media files may exist in the owned creative directory.',
  );
  for (const name of names) {
    assert.match(name, UUID);
    const path = join(directory, name),
      expected = fixture.media.files[name],
      metadata = lstatSync(path);
    assert(metadata.isFile() && !metadata.isSymbolicLink());
    assert.equal(metadata.size, expected.size);
    assert.equal(
      createHash('sha256').update(readFileSync(path)).digest('hex'),
      expected.hash,
      'Synthetic media bytes changed; retain the journal for explicit review.',
    );
  }
}
function generateMedia(fixture) {
  const directory = mediaDirectory(fixture);
  assert(
    !existsSync(directory),
    'Never overwrite an existing creative asset directory.',
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  fixture.media.files = {};
  writeJournal(fixture);
  const outputs = [
    [
      fixture.assets.video,
      [
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=320x180:rate=24',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=44100',
        '-t',
        '2',
        '-c:v',
        'libx264',
        '-threads',
        '1',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-movflags',
        'frag_keyframe+empty_moov',
        '-f',
        'mp4',
        'pipe:1',
      ],
    ],
    [
      fixture.assets.image,
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:size=320x180',
        '-frames:v',
        '1',
        '-threads',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'png',
        'pipe:1',
      ],
    ],
    [
      fixture.assets.intermediate,
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=red:size=320x180',
        '-frames:v',
        '1',
        '-threads',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'png',
        'pipe:1',
      ],
    ],
    [
      fixture.assets.audio,
      [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=660:sample_rate=44100',
        '-t',
        '2',
        '-c:a',
        'pcm_s16le',
        '-f',
        'wav',
        'pipe:1',
      ],
    ],
  ];
  for (const [id, arguments_] of outputs) {
    const bytes = execFileSync(
      'ffmpeg',
      ['-nostdin', '-hide_banner', '-loglevel', 'error', ...arguments_],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30000 },
    );
    assert(bytes.length > 0 && bytes.length < 8 * 1024 * 1024);
    fixture.media.files[id] = {
      size: bytes.length,
      hash: createHash('sha256').update(bytes).digest('hex'),
    };
    writeJournal(fixture);
    const descriptor = openSync(join(directory, id), 'wx', 0o600);
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
  verifyFiles(fixture);
}
function detailsFor(fixture, version) {
  const details = reviewDetails({
    assets: fixture.assets,
    people: {
      writer: { memberId: fixture.editorId },
      admin: { memberId: fixture.actorId },
    },
  });
  details.brief = `${fixture.marker} Synthetic local media only; annotations are advisory and final approval is separate.`;
  details.service = 'AI video and static ad';
  details.creative.assets = details.creative.assets
    .filter((asset) => Object.hasOwn(fixture.media.files, asset.id))
    .map((asset) => ({
      ...asset,
      size: fixture.media.files[asset.id].size,
      createdAt: fixture.createdAt,
    }));
  if (version === 1) {
    const creative = details.creative;
    creative.version = 1;
    creative.briefVersion = 1;
    creative.approvedBriefVersion = 1;
    creative.productionVersion = 1;
    creative.assemblyVersion = 1;
    creative.brief = {
      ...creative.brief,
      outputKind: 'VIDEO',
      concept: 'Synthetic exact video v1',
      duration: 2,
    };
    creative.briefHistory = [];
    creative.assets = creative.assets
      .filter((asset) => asset.id !== fixture.assets.image)
      .map((asset) =>
        asset.id === fixture.assets.intermediate
          ? {
              ...asset,
              briefVersion: 1,
              productionVersion: 1,
              assemblyVersion: 1,
            }
          : asset,
      );
    creative.finalAssetId = fixture.assets.video;
    details.submissions = [
      {
        ...details.submissions[0],
        decision: undefined,
        reviewedBy: undefined,
        reviewedAt: undefined,
        feedback: undefined,
        submittedAt: fixture.createdAt,
      },
    ];
  } else {
    details.creative.briefHistory = [
      {
        version: 1,
        brief: {
          ...details.creative.brief,
          outputKind: 'VIDEO',
          concept: 'Synthetic exact video v1',
        },
        approved: true,
      },
    ];
    details.creative.assets = details.creative.assets.map((asset) =>
      asset.id === fixture.assets.intermediate
        ? {
            ...asset,
            briefVersion: 1,
            productionVersion: 1,
            assemblyVersion: 1,
          }
        : asset,
    );
    assert(
      fixture.v1ReviewedTask,
      'Advance must preserve one real independently reviewed v1.',
    );
    details.submissions[0] = copy(
      fixture.v1ReviewedTask.details.submissions[0],
    );
    details.events = copy(fixture.v1ReviewedTask.details.events);
    details.submissions[1].submittedAt = fixture.advancedAt;
  }
  return copy(details);
}
function validateTask(task, native, fixture) {
  if (
    fixture.advancePrepared &&
    fingerprint(task) === fingerprint(fixture.previousTask)
  ) {
    fixture = {
      ...fixture,
      stage: 1,
      currentTask: fixture.initialTask,
      currentNativeTask: fixture.initialNativeTask,
    };
  }
  const seed = fixture.currentTask;
  assert(seed, 'Committed source rows require an exact immutable seed.');
  const normalized = copy(task),
    expected = copy(seed);
  const approved = task.details.state === 'APPROVED';
  const requested = task.details.state === 'CHANGES_REQUESTED';
  const decision = approved
    ? 'APPROVED'
    : requested
      ? 'CHANGES_REQUESTED'
      : null;
  if (decision) {
    assert.equal(
      fixture.stage,
      approved ? 2 : 1,
      'Only one independent v1 Request changes followed by v2 approval is permitted.',
    );
    assert.equal(task.revision, seed.revision + 1);
    const latest = task.details.submissions.at(-1),
      prior = seed.details.submissions.at(-1);
    assert.equal(latest.version, fixture.stage);
    assert.equal(
      latest.finalAssetId,
      approved ? fixture.assets.image : fixture.assets.video,
    );
    assert.equal(latest.creativeVersion, fixture.stage);
    assert.equal(latest.decision, decision);
    assert.equal(latest.reviewedBy, fixture.actorId);
    assert(
      timestamp(latest.reviewedAt, 'Final review') >=
        timestamp(
          approved ? fixture.advancedAt : fixture.createdAt,
          'Synthetic submission',
        ),
    );
    assert.equal(typeof latest.feedback, 'string');
    assert(latest.feedback.length <= 6000);
    if (requested)
      assert(
        latest.feedback.trim().length > 0,
        'Request changes must retain a nonempty reason.',
      );
    normalized.details.state = seed.details.state;
    normalized.details.submissions[fixture.stage - 1] = copy(prior);
    assert.equal(task.details.events.length, seed.details.events.length + 1);
    const event = task.details.events.at(-1);
    assert.match(event.id, UUID);
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.action, decision);
    assert.equal(event.text, latest.feedback);
    assert(
      timestamp(event.at, 'Approval event') >=
        timestamp(
          approved ? fixture.advancedAt : fixture.createdAt,
          'Synthetic submission',
        ),
    );
    assert(
      timestamp(event.at, 'API decision event') <= Date.now(),
      'The API decision event must not be in the future of this local process.',
    );
    assert.equal(
      fingerprint(task.details.events.slice(0, -1)),
      fingerprint(seed.details.events),
      'Earlier task events must remain immutable.',
    );
    normalized.details.events = copy(seed.details.events);
    normalized.revision = seed.revision;
    normalized.updatedAt = expected.updatedAt;
  }
  assert.equal(
    fingerprint(normalized),
    fingerprint(expected),
    'Review annotations must not mutate source production, task state, plan, brief or submission identities.',
  );
  const normalizedNative = copy(native),
    expectedNative = copy(fixture.currentNativeTask);
  if (decision) {
    assert.equal(native.status, approved ? 'DONE' : 'IN_PROGRESS');
    normalizedNative.status = expectedNative.status;
    normalizedNative.updatedAt = expectedNative.updatedAt;
  }
  assert.equal(
    fingerprint(normalizedNative),
    fingerprint(expectedNative),
    'Only the exact independent request-change or final-approval transition may update the synthetic task status.',
  );
  return decision;
}
async function validateOwned(
  manager,
  tables,
  operations,
  fixture,
  preserveAuthenticationLifecycle = false,
) {
  const extra = additions(tables, fixture, preserveAuthenticationLifecycle);
  assert.equal(operations.id, fixture.baseline.operations.id);
  const assignment = operations.state.assignments[fixture.taskId];
  assert(
    assignment === undefined || assignment === `${fixture.editorId}:legacy`,
  );
  assert.equal(
    fingerprint(withoutOwnedAssignment(operations.state, fixture)),
    fixture.baseline.operations.hash,
    'Only the exact synthetic assignment marker and reporting heartbeat may differ in Operations. No sends, notices, fulfilment or routing changes are allowed.',
  );
  const hasSeed = extra.some((table) => table.rows.length > 0);
  const [task] = await manager.query(
    'SELECT * FROM core."deliveryTask" WHERE "workspaceId"=$1 AND id=$2',
    [WORKSPACE_ID, fixture.deliveryTaskId],
  );
  if (!hasSeed) {
    assert.equal(task, undefined);
    return { extra, hasSeed };
  }
  assert(task);
  const [native] = await manager.query(
    `SELECT * FROM ${quote(fixture.schema)}.task WHERE id=$1`,
    [fixture.taskId],
  );
  const decision = validateTask(task, native, fixture);
  const approved = decision === 'APPROVED';
  const requested = decision === 'CHANGES_REQUESTED';
  const revisions = await manager.query(
    'SELECT * FROM core."deliveryRevision" WHERE "workspaceId"=$1 AND "taskId"=$2 ORDER BY round',
    [WORKSPACE_ID, fixture.taskId],
  );
  const hasV1Decision = requested || fixture.stage === 2;
  assert.equal(
    revisions.length,
    hasV1Decision ? 1 : 0,
    'Only one tracked v1 Request changes round belongs to this fixture.',
  );
  if (hasV1Decision) {
    const revision = revisions[0],
      requestTask = requested ? task : fixture.v1ReviewedTask,
      submission = requestTask.details.submissions[0];
    const [{ observedAt }] = await manager.query(
      'SELECT clock_timestamp() AS "observedAt"',
    );
    assert.match(revision.id, UUID);
    assert.equal(revision.workspaceId, WORKSPACE_ID);
    assert.equal(revision.taskId, fixture.taskId);
    assert.equal(revision.projectId, fixture.projectId);
    assert.equal(revision.round, 1);
    assert.equal(revision.taskRevision, fixture.initialTask.revision + 1);
    assert.equal(revision.submissionVersion, 1);
    assert.equal(revision.source, 'INTERNAL_REVIEW');
    assert.equal(revision.reason, submission.feedback);
    assert.equal(revision.cause, 'UNCLASSIFIED');
    assert.equal(revision.effortMinutes, null);
    assert.equal(revision.internalCost, null);
    assert.equal(String(revision.proposedCharge), '0');
    assert.equal(revision.currency, null);
    assert.equal(revision.revision, 1);
    assert(
      timestamp(revision.createdAt, 'Revision round creation') >=
        timestamp(
          fixture.initialTask.createdAt,
          'Initial database task creation',
        ),
    );
    // PostgreSQL and the API clock can differ; compare each timestamp only with its own clock domain.
    assert(
      timestamp(revision.createdAt, 'Revision round creation') <=
        timestamp(observedAt, 'Current database observation'),
    );
    assert.equal(
      timestamp(revision.createdAt, 'Revision round creation'),
      timestamp(
        requestTask.updatedAt,
        'Atomic request-change database timestamp',
      ),
    );
    assert(
      timestamp(submission.reviewedAt, 'Request changes API review') <=
        Date.now(),
      'The API review timestamp must not be in the future of this local process.',
    );
    if (fixture.v1RevisionHash)
      assert.equal(
        fingerprint(revision),
        fixture.v1RevisionHash,
        'The v1 tracked revision must remain immutable after advance.',
      );
  }
  for (const [schema, name, id, seedHash] of [
    ['core', 'deliveryProject', fixture.projectId, fixture.projectHash],
    ['core', 'user', fixture.editorUserId, fixture.editorUserHash],
    [
      'core',
      'userWorkspace',
      fixture.editorMembershipId,
      fixture.editorMembershipHash,
    ],
    [fixture.schema, 'workspaceMember', fixture.editorId, fixture.editorHash],
  ]) {
    const [row] = await manager.query(
      `SELECT * FROM ${quote(schema)}.${quote(name)} WHERE id=$1`,
      [id],
    );
    assert(row);
    assert.equal(
      fingerprint(row),
      seedHash,
      `Immutable synthetic ${name} changed.`,
    );
  }
  const feedback = await manager.query(
    'SELECT * FROM core."deliveryCreativeFeedback" WHERE "workspaceId"=$1 AND "taskId"=$2 ORDER BY id',
    [WORKSPACE_ID, fixture.taskId],
  );
  const events = await manager.query(
    'SELECT * FROM core."deliveryCreativeFeedbackEvent" WHERE "workspaceId"=$1 AND "taskId"=$2 ORDER BY "feedbackId",revision',
    [WORKSPACE_ID, fixture.taskId],
  );
  assert(
    feedback.length <= 40 && events.length <= 100,
    'This finite browser fixture is not for bulk data or history stress tests.',
  );
  for (const note of feedback) {
    assert.equal(note.projectId, fixture.projectId);
    assert.equal(note.createdBy, fixture.actorId);
    assert.equal(note.createdByName, fixture.actorName);
    assert(Object.hasOwn(fixture.media.files, note.assetId));
    assert(['ASSET', 'SUBMISSION'].includes(note.targetKind));
    assert(
      note.targetKind === 'ASSET'
        ? note.submissionVersion === null
        : [1, 2].includes(note.submissionVersion),
    );
    assert.equal(note.target.assetId, note.assetId);
    assert.equal(note.target.targetKind, note.targetKind);
    assert.equal(note.target.submissionVersion, note.submissionVersion);
    assert.equal(
      note.target.asset.name,
      detailsFor(
        fixture,
        note.submissionVersion === 1 ? 1 : fixture.stage,
      ).creative.assets.find((asset) => asset.id === note.assetId)?.name,
    );
    assert(
      timestamp(note.createdAt, 'Feedback creation') >=
        timestamp(fixture.createdAt, 'Fixture creation'),
    );
    const history = events.filter((event) => event.feedbackId === note.id);
    assert.equal(history.length, note.revision);
    history.forEach((event, index) => {
      assert.equal(event.revision, index + 1);
      assert.equal(event.actorId, fixture.actorId);
      assert.equal(event.actorName, fixture.actorName);
      assert.equal(event.taskId, fixture.taskId);
      assert.match(event.commandId, UUID);
      assert.match(event.requestHash, HASH);
      assert.equal(event.action, index === 0 ? 'CREATED' : event.action);
      assert(
        ['CREATED', 'REPLY', 'ADDRESSED', 'RESOLVED', 'REOPENED'].includes(
          event.action,
        ),
      );
      assert(
        timestamp(event.createdAt, 'Feedback event') >=
          timestamp(fixture.createdAt, 'Fixture creation'),
      );
      if (event.correction)
        assert(Object.hasOwn(fixture.media.files, event.correction.assetId));
    });
    assert.equal(history[0].commandId, note.id);
    assert.equal(history[0].body, note.body);
    assert.equal(history.at(-1).afterStatus, note.status);
    assert.equal(
      fingerprint(history.at(-1).correction),
      fingerprint(note.correction),
    );
  }
  assert.equal(
    events.length,
    feedback.reduce((sum, note) => sum + note.revision, 0),
  );
  const activities = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "taskId"=$2 ORDER BY id',
    [WORKSPACE_ID, fixture.taskId],
  );
  const reviewActivities = activities.filter(
    (event) => event.sourceType === 'creative-review',
  );
  assert.equal(reviewActivities.length, events.length);
  for (const event of reviewActivities) {
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.actorType, 'HUMAN');
    assert.equal(event.category, 'CREATIVE');
    assert.equal(event.projectId, fixture.projectId);
    assert(feedback.some((note) => note.id === event.sourceId));
    assert(
      [
        'CREATIVE_FEEDBACK_CREATED',
        'CREATIVE_FEEDBACK_REPLIED',
        'CREATIVE_FEEDBACK_ADDRESSED',
        'CREATIVE_FEEDBACK_RESOLVED',
        'CREATIVE_FEEDBACK_REOPENED',
      ].includes(event.action),
    );
  }
  const decisionActivities = activities.filter(
    (event) => event.sourceType !== 'creative-review',
  );
  assert.equal(
    decisionActivities.length,
    (hasV1Decision ? 2 : 0) + (approved ? 1 : 0),
  );
  for (const event of decisionActivities) {
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.actorType, 'HUMAN');
    assert.equal(event.category, 'DELIVERY');
    assert(['TASK_REVIEWED', 'REVISION_OPENED'].includes(event.action));
    assert(['APPROVED', 'CHANGES_REQUESTED'].includes(event.outcome));
    assert.equal(event.sourceType, 'task');
    assert.equal(event.sourceId, fixture.taskId);
    assert.equal(event.projectId, fixture.projectId);
  }
  const requestedActivities = decisionActivities.filter(
    (event) => event.outcome === 'CHANGES_REQUESTED',
  );
  assert.equal(
    requestedActivities.filter((event) => event.action === 'TASK_REVIEWED')
      .length,
    hasV1Decision ? 1 : 0,
  );
  assert.equal(
    requestedActivities.filter((event) => event.action === 'REVISION_OPENED')
      .length,
    hasV1Decision ? 1 : 0,
  );
  assert.equal(
    decisionActivities.filter(
      (event) =>
        event.outcome === 'APPROVED' && event.action === 'TASK_REVIEWED',
    ).length,
    approved ? 1 : 0,
  );
  for (const event of requestedActivities.filter(
    (event) => event.action === 'REVISION_OPENED',
  ))
    assert.equal(
      fingerprint(event.changes),
      fingerprint([
        { field: 'revisionRound', before: null, after: '1' },
        { field: 'revisionSource', before: null, after: 'INTERNAL_REVIEW' },
        { field: 'revisionCause', before: null, after: 'UNCLASSIFIED' },
      ]),
    );
  if (fixture.v1ActivityHashes)
    for (const expected of fixture.v1ActivityHashes) {
      const actual = requestedActivities.find(
        (event) => event.id === expected.id,
      );
      assert(actual);
      assert.equal(
        fingerprint(actual),
        expected.hash,
        'The real v1 decision activity must remain immutable after advance.',
      );
    }
  const allowedCore = {
    deliveryTask: [fixture.deliveryTaskId],
    deliveryProject: [fixture.projectId],
    user: [fixture.editorUserId],
    userWorkspace: [fixture.editorMembershipId],
    deliveryCreativeFeedback: feedback.map((row) => row.id),
    deliveryCreativeFeedbackEvent: events.map((row) => row.id),
    deliveryRevision: revisions.map((row) => row.id),
    otogrowActivityEvent: activities.map((row) => row.id),
  };
  for (const table of extra) {
    const allowed =
      table.schema === 'core'
        ? (allowedCore[table.name] ?? [])
        : table.name === 'workspaceMember'
          ? [fixture.editorId]
          : table.name === 'task'
            ? [fixture.taskId]
            : [];
    assert.deepEqual(
      table.rows.map((row) => row.id).sort(),
      [...allowed].sort(),
      `Unexpected ${table.schema}.${table.name} additions; refusing cleanup.`,
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
        stage: fixture.stage,
        workspaceId: WORKSPACE_ID,
        sentinel: fixture.sentinel,
        taskId: fixture.taskId,
        projectId: fixture.projectId,
        reviewer: fixture.actorName,
        editor: fixture.editorName,
        urls: {
          review: `/delivery?view=creative&task=${fixture.taskId}&panel=task&creativeSubmission=${fixture.stage}`,
          v1: `/delivery?view=creative&task=${fixture.taskId}&panel=task&creativeSubmission=1`,
          compare: `/delivery?view=creative&task=${fixture.taskId}&panel=task&creativeSubmission=2&creativeCompare=1`,
          intermediate: `/delivery?view=creative&task=${fixture.taskId}&panel=creative&creativeAsset=${fixture.assets.intermediate}`,
          audio: `/delivery?view=creative&task=${fixture.taskId}&panel=creative&creativeAsset=${fixture.assets.audio}`,
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
    'Recover the existing creative-review browser fixture first.',
  );
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    ...Object.fromEntries(IDS.map((key) => [key, randomUUID()])),
    assets: Object.fromEntries(
      ['video', 'image', 'intermediate', 'audio', 'unsupported', 'failed'].map(
        (key) => [key, randomUUID()],
      ),
    ),
    createdAt: new Date().toISOString(),
    baseline: null,
    cleanupAttempts: [],
    stage: 1,
  };
  fixture.marker = markerFor(fixture.nonce);
  fixture.sentinel = titleFor(fixture.nonce);
  fixture.editorName = `Synthetic editor ${fixture.nonce.slice(0, 8)}`;
  fixture.editorEmail = `${fixture.editorUserId}+creative-review@example.invalid`;
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
      `SELECT member.id AS "memberId",membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(
      admins.length,
      1,
      'Use the current native admin without changing existing roles or access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorName = admins[0].name;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    const root = await storageRoot(manager);
    fixture.media = {
      root,
      directory: join(root, WORKSPACE_ID, 'delivery-creative', fixture.taskId),
      files: {},
    };
    writeJournal(fixture);
    generateMedia(fixture);
    const descriptors = await tableDescriptors(manager, fixture.schema),
      operations = await readOperations(manager);
    assert(!Object.hasOwn(operations.state.assignments, fixture.taskId));
    fixture.baseline = {
      tables: await readTables(manager, descriptors),
      operations: {
        id: operations.id,
        hash: fingerprint(withoutHeartbeat(operations.state)),
      },
    };
    fixture.status = 'PREPARED';
    writeJournal(fixture);
    await manager.query('INSERT INTO core."user" (id,email) VALUES($1,$2)', [
      fixture.editorUserId,
      fixture.editorEmail,
    ]);
    await manager.query(
      'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES($1,$2,$3)',
      [fixture.editorMembershipId, fixture.editorUserId, WORKSPACE_ID],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}."workspaceMember" (id,"userId","nameFirstName","nameLastName") VALUES($1,$2,$3,$4)`,
      [
        fixture.editorId,
        fixture.editorUserId,
        'Synthetic editor',
        fixture.nonce.slice(0, 8),
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.sentinel,
        JSON.stringify([fixture.actorId, fixture.editorId]),
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.task (id,title,"assigneeId",status,"dueAt") VALUES($1,$2,$3,'IN_PROGRESS',NULL)`,
      [fixture.taskId, fixture.sentinel, fixture.editorId],
    );
    await manager.query(
      'INSERT INTO core."deliveryTask" (id,"workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,$5,1)',
      [
        fixture.deliveryTaskId,
        WORKSPACE_ID,
        fixture.taskId,
        fixture.projectId,
        detailsFor(fixture, 1),
      ],
    );
    fixture.currentTask = (
      await manager.query('SELECT * FROM core."deliveryTask" WHERE id=$1', [
        fixture.deliveryTaskId,
      ])
    )[0];
    fixture.currentNativeTask = (
      await manager.query(
        `SELECT * FROM ${quote(fixture.schema)}.task WHERE id=$1`,
        [fixture.taskId],
      )
    )[0];
    fixture.initialTask = copy(fixture.currentTask);
    fixture.initialNativeTask = copy(fixture.currentNativeTask);
    for (const [field, schema, name, id] of [
      ['projectHash', 'core', 'deliveryProject', fixture.projectId],
      ['editorUserHash', 'core', 'user', fixture.editorUserId],
      [
        'editorMembershipHash',
        'core',
        'userWorkspace',
        fixture.editorMembershipId,
      ],
      ['editorHash', fixture.schema, 'workspaceMember', fixture.editorId],
    ])
      fixture[field] = fingerprint(
        (
          await manager.query(
            `SELECT * FROM ${quote(schema)}.${quote(name)} WHERE id=$1`,
            [id],
          )
        )[0],
      );
    operations.state.assignments[fixture.taskId] = `${fixture.editorId}:legacy`;
    await manager.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
      [operations.id, operations.state],
    );
    writeJournal(fixture);
    await validateOwned(
      manager,
      await readTables(manager, descriptors),
      await readOperations(manager),
      fixture,
    );
    if (
      process.env.OTOGROW_CREATIVE_REVIEW_UI_TEST_FAILURE ===
      'create-before-commit'
    )
      throw new Error('Injected creative-review create failure before commit');
  });
  if (
    process.env.OTOGROW_CREATIVE_REVIEW_UI_TEST_FAILURE ===
    'create-after-commit'
  )
    throw new Error('Injected creative-review create failure after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
  console.log(
    'Review v1 exact video, add time/range/general feedback, inspect intermediate image/audio, reply, resolve/reopen and browser outage/draft/mobile/back behavior. The independent current admin must Request changes once for v1 with a reason before advance. Advance preserves that real review, revision round and activity while providing exact synthetic image v2. Compare v2 with v1 and inspect old threads, then optionally explicitly approve image v2 once. Do not deliver/fulfil/send, modify production/planning/access/settings, or act on original client work. Media is generated locally with FFmpeg; no provider cost.',
  );
}
async function advanceFixture() {
  const fixture = readJournal();
  assert.equal(fixture.stage, 1);
  verifyFiles(fixture);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const descriptors = await tableDescriptors(manager, fixture.schema),
      operations = await readOperations(manager);
    await validateOwned(
      manager,
      await readTables(manager, descriptors),
      operations,
      fixture,
      true,
    );
    const [reviewed] = await manager.query(
      'SELECT * FROM core."deliveryTask" WHERE id=$1 AND "workspaceId"=$2',
      [fixture.deliveryTaskId, WORKSPACE_ID],
    );
    assert.equal(
      reviewed?.details.state,
      'CHANGES_REQUESTED',
      'Use the current admin UI to Request changes on v1 once before advance.',
    );
    fixture.v1ReviewedTask = copy(reviewed);
    fixture.previousTask = copy(reviewed);
    fixture.v1NativeTask = copy(
      (
        await manager.query(
          `SELECT * FROM ${quote(fixture.schema)}.task WHERE id=$1`,
          [fixture.taskId],
        )
      )[0],
    );
    fixture.currentNativeTask = copy(fixture.v1NativeTask);
    const [revision] = await manager.query(
      'SELECT * FROM core."deliveryRevision" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [WORKSPACE_ID, fixture.taskId],
    );
    assert(revision);
    fixture.v1RevisionHash = fingerprint(revision);
    fixture.v1Revision = copy(revision);
    fixture.v1ActivityHashes = (
      await manager.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "taskId"=$2 AND "sourceType"=\'task\' ORDER BY id',
        [WORKSPACE_ID, fixture.taskId],
      )
    ).map((event) => ({ id: event.id, hash: fingerprint(event) }));
    fixture.advancedAt = new Date().toISOString();
    fixture.advancePrepared = true;
    fixture.stage = 2;
    const details = detailsFor(fixture, 2);
    await manager.query(
      'UPDATE core."deliveryTask" SET details=$2,revision=revision+1,"updatedAt"=now() WHERE id=$1',
      [fixture.deliveryTaskId, details],
    );
    fixture.currentTask = (
      await manager.query('SELECT * FROM core."deliveryTask" WHERE id=$1', [
        fixture.deliveryTaskId,
      ])
    )[0];
    writeJournal(fixture);
    await validateOwned(
      manager,
      await readTables(manager, descriptors),
      await readOperations(manager),
      fixture,
      true,
    );
  });
  fixture.advancePrepared = false;
  writeJournal(fixture);
  printFixture(fixture);
}
async function cleanupFixture() {
  const fixture = readJournal();
  verifyFiles(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    if (!fixture.baseline) {
      for (const [name, id] of [
        ['deliveryProject', fixture.projectId],
        ['deliveryTask', fixture.deliveryTaskId],
        ['userWorkspace', fixture.editorMembershipId],
        ['user', fixture.editorUserId],
      ])
        assert.equal(
          (
            await manager.query(
              `SELECT count(*)::int AS count FROM core.${quote(name)} WHERE id=$1`,
              [id],
            )
          )[0].count,
          0,
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
      ),
      operations = await readOperations(manager);
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
      return {
        table: table.name,
        scope: WORKSPACE_ID,
        originalRows: original.rows,
        originalHash: original.hash,
        beforeRows: table.rows,
        beforeHash: table.hash,
      };
    });
    if (hasSeed) {
      assert(fixture.cleanupAttempts.length < 20);
      fixture.cleanupAttempts.push({
        preparedAt: new Date().toISOString(),
        rows: extra
          .filter((table) => table.rows.length)
          .map(({ schema, name, rows }) => ({ schema, name, rows })),
        authenticationLifecycle: observations,
        media: fixture.media.files,
      });
      fixture.status = 'CLEANUP_PREPARED';
      writeJournal(fixture);
      const order = [
        ['core', 'otogrowActivityEvent'],
        ['core', 'deliveryCreativeFeedbackEvent'],
        ['core', 'deliveryCreativeFeedback'],
        ['core', 'deliveryRevision'],
        ['core', 'deliveryTask'],
        [fixture.schema, 'task'],
        ['core', 'deliveryProject'],
        [fixture.schema, 'workspaceMember'],
        ['core', 'userWorkspace'],
        ['core', 'user'],
      ];
      for (const [schema, name] of order) {
        const ids = extra
          .find((table) => table.schema === schema && table.name === name)
          .rows.map((row) => row.id);
        if (!ids.length) continue;
        const deleted = await manager.query(
          `WITH deleted AS (DELETE FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM deleted`,
          [ids],
        );
        assert.equal(deleted.length, ids.length);
      }
      const state = copy(operations.state);
      delete state.assignments[fixture.taskId];
      await manager.query(
        'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
        [operations.id, state],
      );
    } else
      fixture.cleanupRecoveredAfterCommit = fixture.cleanupAttempts.length > 0;
    const after = await readTables(manager, fixture.baseline.tables);
    for (let index = 0; index < after.length; index++)
      assert.equal(
        after[index].hash,
        isAuthenticationLifecycleTable(after[index])
          ? authentication.find((table) => table.name === after[index].name)
              .hash
          : fixture.baseline.tables[index].hash,
        `Exact protected baseline did not survive creative-review cleanup: ${after[index].name}`,
      );
    for (const observation of observations) {
      const current = after.find(
        (table) => table.schema === 'core' && table.name === observation.table,
      );
      assert.deepEqual(current.rows, observation.beforeRows);
      observation.afterRows = current.rows;
      observation.afterHash = current.hash;
    }
    assert.equal(
      fingerprint(withoutHeartbeat((await readOperations(manager)).state)),
      fixture.baseline.operations.hash,
    );
    fixture.recoveryAuthenticationLifecycle = observations;
    writeJournal(fixture);
    if (
      process.env.OTOGROW_CREATIVE_REVIEW_UI_TEST_FAILURE ===
      'cleanup-before-commit'
    )
      throw new Error('Injected creative-review cleanup failure before commit');
  });
  if (
    process.env.OTOGROW_CREATIVE_REVIEW_UI_TEST_FAILURE ===
    'cleanup-after-commit'
  )
    throw new Error('Injected creative-review cleanup failure after commit');
  if (fixture.media && existsSync(mediaDirectory(fixture))) {
    verifyFiles(fixture);
    for (const id of Object.keys(fixture.media.files))
      unlinkSync(join(mediaDirectory(fixture), id));
    rmdirSync(mediaDirectory(fixture));
  }
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
    `Removed only ownership-verified synthetic creative review task/project/editor/feedback/history/activity and exact hashed local media. All preexisting source/finance/role/user/routing/outbox baselines match; current appToken/userSession lifecycle preserved with locked before/after digests. Private receipt: ${receipt}`,
  );
}
async function main() {
  assert.equal(process.argv.length, 3);
  const command = process.argv[2];
  assert(['create', 'advance', 'inspect', 'cleanup'].includes(command));
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
    else if (command === 'advance') await advanceFixture();
    else await cleanupFixture();
  } finally {
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  console.error(
    `Retain ${FILE}; exact interruption recovery requires its private journal and media hashes.`,
  );
  process.exitCode = 1;
});

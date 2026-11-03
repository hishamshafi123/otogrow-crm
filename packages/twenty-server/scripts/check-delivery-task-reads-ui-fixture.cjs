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
const FILE = '/tmp/otogrow-task-reads-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const PREFIX = 'Disposable primary task reads';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const IDS = [
  'nonce',
  'projectId',
  'editorId',
  'editorUserId',
  'editorMembershipId',
  'managerId',
  'managerUserId',
  'managerMembershipId',
  'roleId',
  'roleAssignmentId',
  'memberAccessId',
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
const markerFor = (nonce) => `task-reads-ui:${nonce}`;
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
  assert.equal(fixture.tasks.length, 38);
  for (const task of fixture.tasks)
    for (const key of ['taskId', 'deliveryTaskId', 'templateId'])
      assert.match(task[key], UUID);
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

const exactIds = (actual, expected, label) =>
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
const validText = (value, max, label) => {
  assert.equal(typeof value, 'string', label);
  assert(value.trim().length > 0 && value.length <= max, label);
};
const withoutOwned = (state, tasks) => {
  const value = withoutHeartbeat(state),
    ids = new Set(tasks.map((task) => task.taskId));
  for (const id of ids) delete value.assignments[id];
  value.notices = value.notices.filter(
    (notice) => notice.kind !== 'REVIEW_ASSIGNMENT' || !ids.has(notice.taskId),
  );
  return value;
};
const fields = (value, keys) =>
  Object.fromEntries(keys.map((key) => [key, value[key]]));
const safeEvidence = (value) => {
  assert(Array.isArray(value) && value.length <= 10);
  for (const link of value) {
    const url = new URL(link);
    assert.equal(url.protocol, 'https:');
    assert.equal(
      url.hostname,
      'example.invalid',
      'Only clearly synthetic evidence links are permitted.',
    );
  }
};
function initialDetails(fixture, item) {
  const details = {
    brief: `${fixture.marker} synthetic current task notes`,
    service: 'SEO',
    priority: item.index === 34 ? 'LOW' : 'NORMAL',
    scheduledDate: item.scheduledDate,
    reviewerId: item.reviewerId,
    state: item.state,
    blocker: item.state === 'BLOCKED' ? 'Synthetic missing reference.' : '',
    checklist: [],
    evidence: [],
    events: [],
    submissions: [],
  };
  if (['IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED'].includes(item.state))
    details.submissions = [
      {
        version: 1,
        description: `${fixture.marker} synthetic submitted evidence`,
        evidence: [],
        submittedBy: item.assigneeId,
        submittedAt: fixture.createdAt,
        ...(item.state === 'IN_REVIEW'
          ? {}
          : {
              decision: item.state,
              feedback: 'Synthetic historical fixture review',
              reviewedBy: item.reviewerId,
              reviewedAt: fixture.createdAt,
            }),
      },
    ];
  if (item.mode === 'PROGRESS')
    details.checklist = [
      { id: randomUUID(), text: 'Synthetic completion check', done: false },
    ];
  if (['APPROVE', 'CHANGES'].includes(item.mode)) {
    const workflow = {
      templateId: item.templateId,
      version: 1,
      revision: 1,
      definition: {
        name: 'Synthetic pinned review',
        description: fixture.marker,
        service: 'SEO',
        definitionOfDone: 'Review this synthetic evidence.',
        checklist: [],
        evidence: [
          {
            id: 'proof',
            label: 'Synthetic work evidence',
            instructions: 'Fixture only.',
            kind: 'TEXT',
            required: true,
          },
        ],
        reviewChecks: [
          {
            id: 'quality',
            label: 'Verify the submitted synthetic evidence',
            required: true,
          },
        ],
      },
      checkedIds: [],
      evidence: [
        {
          requirementId: 'proof',
          value: 'Synthetic completed work; no client claim.',
        },
      ],
      appliedAt: fixture.createdAt,
      appliedBy: item.assigneeId,
      appliedByName: fixture.editorName,
    };
    details.workflow = workflow;
    details.submissions[0].workflow = copy(workflow);
  }
  return details;
}
function validateExisting(task, native, item, fixture) {
  const expected = copy(item.taskSeed),
    normalized = copy(task),
    expectedNative = copy(item.nativeSeed),
    normalizedNative = copy(native),
    events = task.details.events;
  assert(Array.isArray(events));
  if (item.mode === 'READONLY') {
    assert.equal(fingerprint(task), fingerprint(expected));
    assert.equal(fingerprint(native), fingerprint(expectedNative));
    return;
  }
  assert(events.length <= 3);
  assert.equal(task.revision, expected.revision + events.length);
  for (const event of events) {
    assert.match(event.id, UUID);
    assert.equal(event.actorId, fixture.actorId);
    assert(
      timestamp(event.at, 'Owned task event') >=
        timestamp(fixture.createdAt, 'Fixture creation'),
    );
    assert(timestamp(event.at, 'Owned task event') <= Date.now());
    if (
      !(
        item.mode === 'APPROVE' &&
        event.action === 'APPROVED' &&
        event.text === ''
      )
    )
      validText(event.text, 20000, 'Owned task event text');
    exactIds(Object.keys(event), ['id', 'actorId', 'action', 'text', 'at']);
  }
  const comments = events.filter((event) => event.action === 'COMMENT');
  assert(comments.length <= 1);
  const changes = events.filter((event) => event.action !== 'COMMENT');
  if (item.mode === 'EDIT') {
    assert(
      changes.length <= 1 &&
        changes.every((event) => event.action === 'UPDATED'),
    );
    assert.equal(task.details.state, 'PLANNED');
    assert.equal(native.assigneeId, item.assigneeId);
    assert.equal(task.details.reviewerId, item.reviewerId);
    if (changes.length) {
      assert(native.title.startsWith(fixture.sentinel));
      validText(native.title, 200, 'Edited title');
      assert.equal(changes[0].text, native.title);
      for (const key of ['brief', 'service'])
        assert.equal(typeof task.details[key], 'string');
      assert(['LOW', 'NORMAL', 'HIGH'].includes(task.details.priority));
      safeEvidence(task.details.evidence);
      assert(Array.isArray(task.details.checklist));
      for (const key of [
        'brief',
        'service',
        'priority',
        'scheduledDate',
        'checklist',
        'evidence',
      ])
        normalized.details[key] = copy(expected.details[key]);
      normalizedNative.title = expectedNative.title;
      normalizedNative.dueAt = expectedNative.dueAt;
    }
  } else if (item.mode === 'SUBMIT') {
    assert(changes.filter((event) => event.action === 'PROGRESS').length <= 1);
    assert(changes.filter((event) => event.action === 'SUBMITTED').length <= 1);
    assert(
      changes.every((event) =>
        ['PROGRESS', 'SUBMITTED'].includes(event.action),
      ),
    );
    const submitted = changes.some((event) => event.action === 'SUBMITTED');
    assert.equal(task.details.state, submitted ? 'IN_REVIEW' : 'IN_PROGRESS');
    assert.equal(task.details.blocker, '');
    if (submitted) {
      assert.equal(task.details.submissions.length, 1);
      const submission = task.details.submissions[0];
      assert.equal(submission.version, 1);
      assert.equal(submission.submittedBy, fixture.actorId);
      validText(submission.description, 20000, 'Submitted description');
      safeEvidence(submission.evidence);
      assert(submission.evidence.length > 0);
      assert.equal(
        fingerprint(task.details.evidence),
        fingerprint(submission.evidence),
      );
      assert.equal(changes.at(-1).action, 'SUBMITTED');
      assert.equal(changes.at(-1).text, submission.description);
      assert(
        timestamp(submission.submittedAt, 'Owned submission') >=
          timestamp(fixture.createdAt, 'Fixture creation'),
      );
      assert(
        timestamp(submission.submittedAt, 'Owned submission') <= Date.now(),
      );
      exactIds(Object.keys(submission), [
        'version',
        'description',
        'evidence',
        'submittedBy',
        'submittedAt',
      ]);
      normalized.details.submissions = copy(expected.details.submissions);
      normalized.details.evidence = copy(expected.details.evidence);
    }
    normalized.details.state = expected.details.state;
  } else if (item.mode === 'PROGRESS') {
    assert(
      changes.length <= 2 &&
        changes.every((event) => event.action === 'PROGRESS'),
    );
    assert(['BLOCKED', 'IN_PROGRESS'].includes(task.details.state));
    assert.equal(typeof task.details.blocker, 'string');
    if (task.details.state === 'BLOCKED')
      validText(task.details.blocker, 4000, 'Blocker reason');
    assert.equal(
      task.details.checklist.length,
      expected.details.checklist.length,
    );
    task.details.checklist.forEach((check, index) =>
      assert.equal(
        fingerprint({ ...check, done: expected.details.checklist[index].done }),
        fingerprint(expected.details.checklist[index]),
      ),
    );
    safeEvidence(task.details.evidence);
    for (const key of ['state', 'blocker', 'checklist', 'evidence'])
      normalized.details[key] = copy(expected.details[key]);
  } else {
    const decision = item.mode === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED';
    assert(
      changes.length <= 1 &&
        changes.every((event) => event.action === decision),
    );
    if (changes.length) {
      assert.equal(task.details.state, decision);
      assert.equal(task.details.submissions.length, 1);
      const submission = task.details.submissions[0];
      assert.equal(submission.decision, decision);
      assert.equal(submission.reviewedBy, fixture.actorId);
      assert.equal(typeof submission.feedback, 'string');
      assert(submission.feedback.length <= 6000);
      if (decision === 'CHANGES_REQUESTED')
        validText(submission.feedback, 6000, 'Request-change reason');
      assert.equal(changes[0].text, submission.feedback);
      assert(
        timestamp(submission.reviewedAt, 'Review decision') >=
          timestamp(fixture.createdAt, 'Fixture creation'),
      );
      assert(timestamp(submission.reviewedAt, 'Review decision') <= Date.now());
      assert(Array.isArray(submission.workflowReview?.checkedIds));
      assert(
        submission.workflowReview.checkedIds.every((id) => id === 'quality'),
      );
      if (decision === 'APPROVED')
        assert.deepEqual(submission.workflowReview.checkedIds, ['quality']);
      const original = copy(submission);
      for (const key of [
        'decision',
        'feedback',
        'reviewedBy',
        'reviewedAt',
        'workflowReview',
      ])
        delete original[key];
      assert.equal(
        fingerprint(original),
        fingerprint(expected.details.submissions[0]),
      );
      normalized.details.submissions = copy(expected.details.submissions);
      normalized.details.state = expected.details.state;
    }
  }
  normalized.details.events = [];
  if (events.length) {
    normalized.revision = expected.revision;
    normalized.updatedAt = expected.updatedAt;
    normalizedNative.updatedAt = expectedNative.updatedAt;
    assert.equal(
      native.status,
      task.details.state === 'APPROVED'
        ? 'DONE'
        : task.details.state === 'PLANNED'
          ? 'TODO'
          : 'IN_PROGRESS',
    );
    normalizedNative.status = expectedNative.status;
  }
  assert.equal(
    fingerprint(normalized),
    fingerprint(expected),
    'Only designated explicit task actions may change source fields; history and unrelated planning/ownership remain exact.',
  );
  assert.equal(
    fingerprint(normalizedNative),
    fingerprint(expectedNative),
    'Unexpected native task mutation.',
  );
}
function validateCreated(task, native, fixture) {
  assert.equal(task.workspaceId, WORKSPACE_ID);
  assert.equal(task.projectId, fixture.projectId);
  assert.equal(task.revision, 1);
  assert.equal(task.details.state, 'PLANNED');
  assert.equal(task.details.reviewerId, fixture.managerId);
  assert.equal(native.assigneeId, fixture.actorId);
  assert(native.title.startsWith(fixture.sentinel));
  validText(native.title, 200, 'Created title');
  assert.equal(native.status, 'TODO');
  assert.equal(task.details.events.length, 1);
  const event = task.details.events[0];
  assert.equal(event.action, 'CREATED');
  assert.equal(event.actorId, fixture.actorId);
  assert.equal(event.text, native.title);
  assert(
    timestamp(event.at, 'Created task') >=
      timestamp(fixture.createdAt, 'Fixture creation'),
  );
  assert.equal(task.details.submissions.length, 0);
  assert.equal(task.details.creative, undefined);
  assert.equal(task.details.workflow, undefined);
  safeEvidence(task.details.evidence);
}
async function validateOwned(
  manager,
  tables,
  operations,
  fixture,
  preserveAuthenticationLifecycle = false,
) {
  const extra = additions(tables, fixture, preserveAuthenticationLifecycle),
    hasSeed = extra.some((table) => table.rows.length > 0);
  assert.equal(operations.id, fixture.baseline.operations.id);
  if (!hasSeed) {
    assert.equal(
      fingerprint(withoutHeartbeat(operations.state)),
      fixture.baseline.operations.hash,
    );
    return { extra, hasSeed };
  }
  for (const seed of fixture.immutable) {
    const [row] = await manager.query(
      `SELECT * FROM ${quote(seed.schema)}.${quote(seed.name)} WHERE id=$1`,
      [seed.id],
    );
    assert(row);
    assert.equal(
      fingerprint(row),
      seed.hash,
      `Immutable synthetic ${seed.name} changed.`,
    );
  }
  const tasks = await manager.query(
    'SELECT * FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "projectId"=$2',
    [WORKSPACE_ID, fixture.projectId],
  );
  assert(
    tasks.length >= fixture.tasks.length &&
      tasks.length <= fixture.tasks.length + 1,
  );
  const native = await manager.query(
    `SELECT * FROM ${quote(fixture.schema)}.task WHERE id=ANY($1::uuid[])`,
    [tasks.map((task) => task.taskId)],
  );
  assert.equal(native.length, tasks.length);
  const extras = tasks.filter(
    (task) => !fixture.tasks.some((item) => item.taskId === task.taskId),
  );
  assert(extras.length <= 1);
  for (const task of tasks) {
    const item = fixture.tasks.find((item) => item.taskId === task.taskId),
      source = native.find((row) => row.id === task.taskId);
    assert(source);
    if (item) validateExisting(task, source, item, fixture);
    else validateCreated(task, source, fixture);
    const assignment = operations.state.assignments[task.taskId];
    assert(
      assignment === undefined ||
        assignment ===
          `${source.assigneeId}:${task.details.assignmentAt ?? 'legacy'}`,
    );
  }
  assert.equal(
    fingerprint(withoutOwned(operations.state, tasks)),
    fixture.baseline.operations.hash,
    'Original Operations/finance/fulfilment/routing/bot state and unrelated notices remain exact.',
  );
  const reviewNotices = operations.state.notices.filter(
    (notice) =>
      notice.kind === 'REVIEW_ASSIGNMENT' &&
      tasks.some((task) => task.taskId === notice.taskId),
  );
  assert(reviewNotices.length <= 1);
  for (const notice of reviewNotices) {
    assert.equal(notice.taskId, fixture.tasks[1].taskId);
    assert.equal(notice.senderId, fixture.actorId);
    assert.equal(notice.recipientId, fixture.managerId);
    assert.equal(notice.reviewAssignment.assignmentId, null);
    assert.equal(notice.reviewAssignment.assignmentRevision, 0);
    assert.equal(notice.reviewAssignment.submissionVersion, 1);
    assert.equal(notice.reviewAssignment.recipientId, fixture.managerId);
    assert.equal(notice.attemptedAt, null);
    assert.equal(notice.seenAt, null);
    assert.equal(notice.acknowledgedAt, null);
    assert(
      ['PENDING', 'UNCONFIGURED', 'SUPPRESSED', 'QUEUED'].includes(
        notice.sendState,
      ),
    );
    assert.equal(
      timestamp(notice.remindAt, 'Review deadline') -
        timestamp(notice.createdAt, 'Review handoff'),
      300000,
    );
    const task = tasks.find((row) => row.taskId === notice.taskId);
    assert.equal(task.details.state, 'IN_REVIEW');
    assert.equal(task.details.submissions.length, 1);
  }
  const revisions = await manager.query(
    'SELECT * FROM core."deliveryRevision" WHERE "workspaceId"=$1 AND "taskId"=ANY($2::uuid[])',
    [WORKSPACE_ID, tasks.map((task) => task.taskId)],
  );
  const changed = tasks.find(
    (task) =>
      task.taskId === fixture.tasks[36].taskId &&
      task.details.state === 'CHANGES_REQUESTED',
  );
  assert.equal(revisions.length, changed ? 1 : 0);
  for (const row of revisions) {
    assert.equal(row.taskId, changed.taskId);
    assert.equal(row.projectId, fixture.projectId);
    assert.equal(row.round, 1);
    assert.equal(row.submissionVersion, 1);
    assert.equal(
      row.taskRevision,
      changed.details.events.findIndex(
        (event) => event.action === 'CHANGES_REQUESTED',
      ) + 2,
    );
    assert.equal(row.source, 'INTERNAL_REVIEW');
    assert.equal(row.reason, changed.details.submissions[0].feedback);
    assert.equal(row.cause, 'UNCLASSIFIED');
    assert.equal(row.effortMinutes, null);
    assert.equal(row.internalCost, null);
    assert.equal(String(row.proposedCharge), '0');
    assert.equal(row.currency, null);
    assert.equal(row.revision, 1);
  }
  const activities = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "taskId"=ANY($2::uuid[])',
    [WORKSPACE_ID, tasks.map((task) => task.taskId)],
  );
  assert.equal(
    activities.length,
    tasks.reduce((sum, task) => sum + task.details.events.length, 0) +
      revisions.length,
  );
  const expectedActions = {
    UPDATED: 'TASK_UPDATED',
    PROGRESS: 'TASK_PROGRESS',
    SUBMITTED: 'TASK_SUBMITTED',
    COMMENT: 'TASK_COMMENTED',
    APPROVED: 'TASK_REVIEWED',
    CHANGES_REQUESTED: 'TASK_REVIEWED',
    CREATED: 'TASK_CREATED',
  };
  for (const task of tasks) {
    const rows = activities.filter((row) => row.taskId === task.taskId);
    for (const event of task.details.events) {
      assert.equal(
        rows.filter(
          (row) =>
            row.action === expectedActions[event.action] &&
            row.outcome ===
              (['APPROVED', 'CHANGES_REQUESTED'].includes(event.action)
                ? event.action
                : 'RECORDED'),
        ).length,
        task.details.events.filter(
          (candidate) =>
            expectedActions[candidate.action] ===
              expectedActions[event.action] &&
            (['APPROVED', 'CHANGES_REQUESTED'].includes(candidate.action)
              ? candidate.action
              : 'RECORDED') ===
              (['APPROVED', 'CHANGES_REQUESTED'].includes(event.action)
                ? event.action
                : 'RECORDED'),
        ).length,
      );
    }
  }
  for (const row of activities) {
    assert.equal(row.actorId, fixture.actorId);
    assert.equal(row.actorType, 'HUMAN');
    assert.equal(row.category, 'DELIVERY');
    assert.equal(row.projectId, fixture.projectId);
    assert.equal(row.sourceType, 'task');
    assert.equal(row.sourceId, row.taskId);
    assert(
      [...Object.values(expectedActions), 'REVISION_OPENED'].includes(
        row.action,
      ),
    );
  }
  const outbox = await manager.query(
    'SELECT * FROM core."deliveryReminderOutbox" WHERE "workspaceId"=$1 AND "noticeId"=ANY($2::uuid[])',
    [WORKSPACE_ID, reviewNotices.map((notice) => notice.id)],
  );
  for (const row of outbox) {
    assert.equal(row.attemptedAt, null);
    assert(['QUEUED', 'SUPPRESSED', 'UNCONFIGURED'].includes(row.status));
  }
  const allowed = {
    deliveryProject: [fixture.projectId],
    deliveryTask: tasks.map((task) => task.id),
    user: [fixture.editorUserId, fixture.managerUserId],
    userWorkspace: [fixture.editorMembershipId, fixture.managerMembershipId],
    otogrowRole: [fixture.roleId],
    otogrowRoleAssignment: [fixture.roleAssignmentId],
    otogrowMemberAccess: [fixture.memberAccessId],
    deliveryRevision: revisions.map((row) => row.id),
    otogrowActivityEvent: activities.map((row) => row.id),
    deliveryReminderOutbox: outbox.map((row) => row.id),
  };
  for (const table of extra) {
    const ids =
      table.schema === 'core'
        ? (allowed[table.name] ?? [])
        : table.name === 'workspaceMember'
          ? [fixture.editorId, fixture.managerId]
          : table.name === 'task'
            ? tasks.map((task) => task.taskId)
            : [];
    exactIds(
      table.rows.map((row) => row.id),
      ids,
      `Unexpected ${table.schema}.${table.name} additions; refusing cleanup.`,
    );
  }
  return { extra, hasSeed, tasks, reviewNotices };
}
function printFixture(fixture) {
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        status: fixture.status,
        workspaceId: WORKSPACE_ID,
        sentinel: fixture.sentinel,
        projectId: fixture.projectId,
        personalTasks: 35,
        totalTasks: 38,
        defaultPageSize: 30,
        extraTaskTitle: `${fixture.sentinel} extra task`,
        tasks: fixture.tasks
          .filter((task) => task.mode !== 'READONLY')
          .map((task) => ({
            id: task.taskId,
            name: task.name,
            mode: task.mode,
          })),
        urls: {
          today: `/delivery?view=home&project=${fixture.projectId}`,
          mine: `/delivery?view=mine&project=${fixture.projectId}`,
          offPage: `/delivery?view=mine&project=${fixture.projectId}&task=${fixture.tasks[34].taskId}`,
          edit: `/delivery?view=mine&project=${fixture.projectId}&task=${fixture.tasks[0].taskId}`,
          submit: `/delivery?view=mine&project=${fixture.projectId}&task=${fixture.tasks[1].taskId}`,
          progress: `/delivery?view=mine&project=${fixture.projectId}&task=${fixture.tasks[2].taskId}`,
          approve: `/delivery?view=home&project=${fixture.projectId}&task=${fixture.tasks[35].taskId}`,
          changes: `/delivery?view=home&project=${fixture.projectId}&task=${fixture.tasks[36].taskId}`,
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
    'Recover the active primary task-read fixture first.',
  );
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    ...Object.fromEntries(IDS.map((key) => [key, randomUUID()])),
    createdAt: new Date().toISOString(),
    baseline: null,
    cleanupAttempts: [],
    immutable: [],
    tasks: Array.from({ length: 38 }, (_, index) => ({
      index,
      taskId: randomUUID(),
      deliveryTaskId: randomUUID(),
      templateId: randomUUID(),
      mode:
        index === 0
          ? 'EDIT'
          : index === 1
            ? 'SUBMIT'
            : index === 2
              ? 'PROGRESS'
              : index === 35
                ? 'APPROVE'
                : index === 36
                  ? 'CHANGES'
                  : 'READONLY',
      name:
        index === 0
          ? 'edit notes'
          : index === 1
            ? 'submit work'
            : index === 2
              ? 'resume blocked work'
              : index === 34
                ? 'off-page source'
                : index === 35
                  ? 'independent approval'
                  : index === 36
                    ? 'request changes'
                    : `read-only ${String(index).padStart(2, '0')}`,
      state:
        index === 0
          ? 'PLANNED'
          : index === 1
            ? 'IN_PROGRESS'
            : index === 2
              ? 'BLOCKED'
              : index === 3
                ? 'CHANGES_REQUESTED'
                : index === 4 || index === 34
                  ? 'APPROVED'
                  : index === 5 || index === 35 || index === 36
                    ? 'IN_REVIEW'
                    : index % 2 === 0
                      ? 'PLANNED'
                      : 'IN_PROGRESS',
      scheduledDate: null,
      dueAt: index === 34 ? '2098-12-31T12:00:00.000Z' : null,
    })),
  };
  fixture.marker = markerFor(fixture.nonce);
  fixture.sentinel = titleFor(fixture.nonce);
  fixture.editorName = `Synthetic editor ${fixture.nonce.slice(0, 8)}`;
  fixture.managerName = `Synthetic manager ${fixture.nonce.slice(0, 8)}`;
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
      'Use the current native admin without changing real access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorName = admins[0].name;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    const operations = await readOperations(manager);
    assert.equal(
      operations.state.enabled,
      false,
      'This disposable fixture requires the existing local delivery automation to be disabled; do not change real configuration for acceptance.',
    );
    assert.equal(
      operations.state.telegramEnabled,
      false,
      'Keep the existing local Telegram transport disabled.',
    );
    assert.equal(
      (
        await manager.query(
          'SELECT count(*)::int AS count FROM core."deliveryProject" WHERE "workspaceId"=$1 AND name LIKE $2',
          [WORKSPACE_ID, `${PREFIX}%`],
        )
      )[0].count,
      0,
      'Recover earlier task-read fixtures first.',
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
    for (const kind of ['editor', 'manager']) {
      await manager.query('INSERT INTO core."user" (id,email) VALUES($1,$2)', [
        fixture[`${kind}UserId`],
        `${fixture[`${kind}UserId`]}+task-reads@example.invalid`,
      ]);
      await manager.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES($1,$2,$3)',
        [
          fixture[`${kind}MembershipId`],
          fixture[`${kind}UserId`],
          WORKSPACE_ID,
        ],
      );
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}."workspaceMember" (id,"userId","nameFirstName","nameLastName") VALUES($1,$2,$3,$4)`,
        [
          fixture[`${kind}Id`],
          fixture[`${kind}UserId`],
          `Synthetic ${kind}`,
          fixture.nonce.slice(0, 8),
        ],
      );
    }
    await manager.query(
      'INSERT INTO core."otogrowRole" (id,"workspaceId",name,description,capabilities,revision) VALUES($1,$2,$3,$4,$5,1)',
      [
        fixture.roleId,
        WORKSPACE_ID,
        `${fixture.sentinel} independent manager`,
        fixture.marker,
        ['delivery.manage'],
      ],
    );
    await manager.query(
      'INSERT INTO core."otogrowMemberAccess" (id,"workspaceId","workspaceMemberId",revision) VALUES($1,$2,$3,1)',
      [fixture.memberAccessId, WORKSPACE_ID, fixture.managerId],
    );
    await manager.query(
      'INSERT INTO core."otogrowRoleAssignment" (id,"workspaceId","workspaceMemberId","roleId") VALUES($1,$2,$3,$4)',
      [
        fixture.roleAssignmentId,
        WORKSPACE_ID,
        fixture.managerId,
        fixture.roleId,
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.sentinel,
        JSON.stringify([fixture.actorId, fixture.editorId, fixture.managerId]),
      ],
    );
    for (const item of fixture.tasks) {
      item.assigneeId = item.index < 35 ? fixture.actorId : fixture.editorId;
      item.reviewerId = item.index < 35 ? fixture.managerId : fixture.actorId;
      const title = `${fixture.sentinel} ${String(item.index).padStart(2, '0')} ${item.name}`;
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}.task (id,title,"assigneeId",status,"dueAt") VALUES($1,$2,$3,$4,$5)`,
        [
          item.taskId,
          title,
          item.assigneeId,
          item.state === 'APPROVED'
            ? 'DONE'
            : item.state === 'PLANNED'
              ? 'TODO'
              : 'IN_PROGRESS',
          item.dueAt,
        ],
      );
      await manager.query(
        'INSERT INTO core."deliveryTask" (id,"workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,$5,1)',
        [
          item.deliveryTaskId,
          WORKSPACE_ID,
          item.taskId,
          fixture.projectId,
          initialDetails(fixture, item),
        ],
      );
      item.taskSeed = copy(
        (
          await manager.query('SELECT * FROM core."deliveryTask" WHERE id=$1', [
            item.deliveryTaskId,
          ])
        )[0],
      );
      item.nativeSeed = copy(
        (
          await manager.query(
            `SELECT * FROM ${quote(fixture.schema)}.task WHERE id=$1`,
            [item.taskId],
          )
        )[0],
      );
      operations.state.assignments[item.taskId] = `${item.assigneeId}:legacy`;
    }
    await manager.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
      [operations.id, operations.state],
    );
    for (const [schema, name, ids] of [
      ['core', 'deliveryProject', [fixture.projectId]],
      ['core', 'user', [fixture.editorUserId, fixture.managerUserId]],
      [
        'core',
        'userWorkspace',
        [fixture.editorMembershipId, fixture.managerMembershipId],
      ],
      [
        fixture.schema,
        'workspaceMember',
        [fixture.editorId, fixture.managerId],
      ],
      ['core', 'otogrowRole', [fixture.roleId]],
      ['core', 'otogrowRoleAssignment', [fixture.roleAssignmentId]],
      ['core', 'otogrowMemberAccess', [fixture.memberAccessId]],
    ])
      for (const id of ids)
        fixture.immutable.push({
          schema,
          name,
          id,
          hash: fingerprint(
            (
              await manager.query(
                `SELECT * FROM ${quote(schema)}.${quote(name)} WHERE id=$1`,
                [id],
              )
            )[0],
          ),
        });
    writeJournal(fixture);
    await validateOwned(
      manager,
      await readTables(manager, descriptors),
      await readOperations(manager),
      fixture,
    );
    if (
      process.env.OTOGROW_TASK_READS_UI_TEST_FAILURE === 'create-before-commit'
    )
      throw new Error('Injected task-read fixture create before commit');
  });
  if (process.env.OTOGROW_TASK_READS_UI_TEST_FAILURE === 'create-after-commit')
    throw new Error('Injected task-read fixture create after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
  console.log(
    'Restricted journey: inspect Today and My tasks for this exact project, full counts/filters and30-row pagination; open the exact off-page source/back/forward without a fallback. Only task00 may receive one edit (retain nonce title and original assignee/reviewer), task01 may receive at most one progress and one explicit submission with synthetic https://example.invalid evidence, task02 at most two progress/checklist changes, task35 one independently checked approval, and task36 one reasoned Request changes. Each mutable item permits one ordinary comment. One additional task may be created in the exact project with the printed nonce title prefix, current-admin assignee and Synthetic manager reviewer. All other seeded tasks are read-only. Draft keep/discard/outage/retry/mobile/keyboard are allowed. Do not deliver/fulfil/send, change roles/project/setup, activate automations or act on preexisting sources. New review handoff notices remain unattempted and private to the owned synthetic manager.',
  );
}
async function cleanupFixture() {
  const fixture = readJournal();
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    if (!fixture.baseline) {
      for (const [name, ids] of [
        ['deliveryProject', [fixture.projectId]],
        ['deliveryTask', fixture.tasks.map((item) => item.deliveryTaskId)],
        ['user', [fixture.editorUserId, fixture.managerUserId]],
        ['otogrowRole', [fixture.roleId]],
      ])
        assert.equal(
          (
            await manager.query(
              `SELECT count(*)::int AS count FROM core.${quote(name)} WHERE id=ANY($1::uuid[])`,
              [ids],
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
      operations = await readOperations(manager),
      { extra, hasSeed, tasks, reviewNotices } = await validateOwned(
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
        (row) => row.schema === table.schema && row.name === table.name,
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
        reviewNotices: reviewNotices.map((notice) => ({
          id: notice.id,
          hash: fingerprint(notice),
          receipt: copy(notice),
        })),
        authenticationLifecycle: observations,
      });
      fixture.status = 'CLEANUP_PREPARED';
      writeJournal(fixture);
      for (const [schema, name] of [
        ['core', 'otogrowActivityEvent'],
        ['core', 'deliveryReminderOutbox'],
        ['core', 'deliveryRevision'],
        ['core', 'deliveryTask'],
        [fixture.schema, 'task'],
        ['core', 'deliveryProject'],
        ['core', 'otogrowRoleAssignment'],
        ['core', 'otogrowMemberAccess'],
        ['core', 'otogrowRole'],
        [fixture.schema, 'workspaceMember'],
        ['core', 'userWorkspace'],
        ['core', 'user'],
      ]) {
        const ids = extra
          .find((table) => table.schema === schema && table.name === name)
          .rows.map((row) => row.id);
        if (!ids.length) continue;
        const removed = await manager.query(
          `WITH removed AS (DELETE FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
          [ids],
        );
        assert.equal(removed.length, ids.length);
      }
      const state = copy(operations.state),
        ids = new Set(tasks.map((task) => task.taskId));
      for (const id of ids) delete state.assignments[id];
      state.notices = state.notices.filter(
        (notice) =>
          notice.kind !== 'REVIEW_ASSIGNMENT' || !ids.has(notice.taskId),
      );
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
        `Protected ${after[index].name} did not survive task-read cleanup.`,
      );
    for (const observation of observations) {
      const current = after.find(
        (row) => row.schema === 'core' && row.name === observation.table,
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
      process.env.OTOGROW_TASK_READS_UI_TEST_FAILURE === 'cleanup-before-commit'
    )
      throw new Error('Injected task-read fixture cleanup before commit');
  });
  if (process.env.OTOGROW_TASK_READS_UI_TEST_FAILURE === 'cleanup-after-commit')
    throw new Error('Injected task-read fixture cleanup after commit');
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
    `Removed only exact owned task-read project/tasks/synthetic people/manager role, authorized task action/revision/activity and unattempted handoff notices/jobs. All preexisting core/native/finance/role/user/routing/bot/outbox digests match; current appToken/userSession lifecycle locked and preserved. Private receipt: ${receipt}`,
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

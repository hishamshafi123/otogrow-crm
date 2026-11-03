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
const FILE = '/tmp/otogrow-reviews-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const PREFIX = 'Disposable review queue';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const IDS = [
  'nonce',
  'projectId',
  'editorId',
  'editorUserId',
  'editorMembershipId',
  'backupId',
  'backupUserId',
  'backupMembershipId',
  'roleId',
  'roleAssignmentId',
  'memberAccessId',
  'ruleId',
  'seedNoticeId',
  'seedCommandId',
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
const markerFor = (nonce) => `reviews-ui:${nonce}`;
const titleFor = (nonce) => `${PREFIX} ${nonce.slice(0, 8)}`;
const pagingSubmittedAt = (index) =>
  new Date(
    Date.parse(
      index < 24 ? '2019-01-01T08:00:00.000Z' : '2020-02-20T09:00:00.000Z',
    ) +
      Math.floor((index < 24 ? index : index - 24) / 4) * 3600000,
  ).toISOString();
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
  if (fixture.primaryNoticeId) {
    assert.match(fixture.primaryNoticeId, UUID);
    assert.match(fixture.primaryNoticeImmutableHash, HASH);
  }
  assert.equal(fixture.tasks.length, fixture.paged === true ? 55 : 3);
  fixture.tasks.forEach((item, index) => {
    for (const key of ['taskId', 'deliveryTaskId', 'templateId'])
      assert.match(item[key], UUID);
    assert.equal(
      item.allowedDecision,
      index === 0 ? 'APPROVED' : index === 1 ? 'CHANGES_REQUESTED' : null,
    );
    if (index >= 3) {
      assert.equal(fixture.paged, true);
      assert.equal(item.readOnly, true);
      assert.equal(
        item.name,
        `Read-only queue source ${String(index - 3).padStart(2, '0')}`,
      );
      assert.equal(item.submittedAt, pagingSubmittedAt(index - 3));
    }
  });
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

const withoutAssignments = (state, fixture) => {
  const result = withoutHeartbeat(state);
  for (const item of fixture.tasks) delete result.assignments[item.taskId];
  const owned = new Set(fixture.tasks.map((item) => item.taskId));
  result.notices = result.notices.filter(
    (notice) =>
      notice.kind !== 'REVIEW_ASSIGNMENT' || !owned.has(notice.taskId),
  );
  return result;
};
const selectedRule = (rule) =>
  Object.fromEntries(
    [
      'id',
      'revision',
      'name',
      'condition',
      'minimumReviewWaitHours',
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
const exactIds = (actual, expected, label) =>
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
const validText = (value, limit, label) => {
  assert.equal(typeof value, 'string', label);
  assert(value.trim().length > 0 && value.length <= limit, label);
};
function taskDetails(fixture, item) {
  const workflow = {
    templateId: item.templateId,
    version: 1,
    revision: 1,
    definition: {
      name: `${fixture.sentinel} pinned checks`,
      description: fixture.marker,
      service: 'SEO',
      definitionOfDone: 'Review this synthetic evidence only.',
      checklist: [],
      evidence: [
        {
          id: 'proof',
          label: 'Synthetic delivery evidence',
          instructions: 'Local acceptance only; not client work.',
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
        value: `${fixture.marker} synthetic completed work; no real claim.`,
      },
    ],
    appliedAt: fixture.createdAt,
    appliedBy: fixture.editorId,
    appliedByName: fixture.editorName,
  };
  return {
    brief: `${fixture.marker} Generic isolated review acceptance.`,
    service: 'SEO',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: fixture.actorId,
    state: 'IN_REVIEW',
    blocker: '',
    checklist: [],
    evidence: [],
    events: [],
    workflow,
    submissions: [
      {
        version: 1,
        description: `${fixture.marker} ${item.name}`,
        evidence: [],
        submittedBy: fixture.editorId,
        submittedAt: item.submittedAt,
        workflow: copy(workflow),
      },
    ],
  };
}
function decisionOf(task, native, item, fixture) {
  const expected = copy(item.taskSeed),
    normalized = copy(task),
    nativeExpected = copy(item.nativeSeed),
    nativeNormalized = copy(native);
  const decision =
    task.details.state === 'IN_REVIEW' ? null : task.details.state;
  if (decision) {
    assert.equal(
      decision,
      item.allowedDecision,
      'Only this exact per-item decision is permitted.',
    );
    assert.equal(task.revision, item.taskSeed.revision + 1);
    const submission = task.details.submissions[0];
    assert.equal(task.details.submissions.length, 1);
    assert.equal(submission.version, 1);
    assert.equal(submission.reviewedBy, fixture.actorId);
    assert.equal(submission.decision, decision);
    assert(
      timestamp(submission.reviewedAt, 'API decision') >=
        timestamp(fixture.createdAt, 'Fixture creation'),
    );
    assert(timestamp(submission.reviewedAt, 'API decision') <= Date.now());
    assert.equal(typeof submission.feedback, 'string');
    assert(submission.feedback.length <= 6000);
    if (decision === 'CHANGES_REQUESTED')
      validText(submission.feedback, 6000, 'Request-change reason');
    const checked = submission.workflowReview?.checkedIds;
    assert(Array.isArray(checked));
    assert.equal(new Set(checked).size, checked.length);
    assert(checked.every((id) => id === 'quality'));
    if (decision === 'APPROVED') assert.deepEqual(checked, ['quality']);
    const originalSubmission = copy(submission);
    for (const key of [
      'decision',
      'feedback',
      'reviewedBy',
      'reviewedAt',
      'workflowReview',
    ])
      delete originalSubmission[key];
    assert.equal(
      fingerprint(originalSubmission),
      fingerprint(expected.details.submissions[0]),
      'The final decision must preserve all originally submitted identity, checklist, evidence and description fields.',
    );
    assert.equal(task.details.events.length, 1);
    const event = task.details.events[0];
    exactIds(
      Object.keys(event),
      ['id', 'actorId', 'action', 'text', 'at'],
      'Only the known immutable task event fields are permitted.',
    );
    assert.match(event.id, UUID);
    assert.equal(event.action, decision);
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.text, submission.feedback);
    assert(
      timestamp(event.at, 'API decision event') >=
        timestamp(fixture.createdAt, 'Fixture creation'),
    );
    assert(timestamp(event.at, 'API decision event') <= Date.now());
    normalized.details.state = expected.details.state;
    normalized.details.submissions = copy(expected.details.submissions);
    normalized.details.events = [];
    normalized.revision = expected.revision;
    normalized.updatedAt = expected.updatedAt;
    nativeNormalized.status = nativeExpected.status;
    nativeNormalized.updatedAt = nativeExpected.updatedAt;
    assert.equal(
      native.status,
      decision === 'APPROVED' ? 'DONE' : 'IN_PROGRESS',
    );
  }
  assert.equal(
    fingerprint(normalized),
    fingerprint(expected),
    'Review assignment or drafts cannot mutate source evidence, canonical delivery owner, workflow or production.',
  );
  assert.equal(
    fingerprint(nativeNormalized),
    fingerprint(nativeExpected),
    'Only the exact final review may change this owned native task.',
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
  for (const item of fixture.tasks) {
    const value = operations.state.assignments[item.taskId];
    assert(value === undefined || value === `${fixture.editorId}:legacy`);
  }
  assert.equal(
    fingerprint(withoutAssignments(operations.state, fixture)),
    fixture.baseline.operations.hash,
    'Only exact owned assignment markers/review notices and the existing reporting heartbeat may differ; unrelated notices, fulfilment, routing and finance stay exact.',
  );
  const hasSeed = extra.some((table) => table.rows.length > 0);
  if (!hasSeed) return { extra, hasSeed };
  for (const seed of fixture.immutable) {
    const [row] = await manager.query(
      `SELECT * FROM ${quote(seed.schema)}.${quote(seed.name)} WHERE id=$1`,
      [seed.id],
    );
    assert(row);
    assert.equal(
      fingerprint(row),
      seed.hash,
      `Immutable ${seed.name} fixture configuration changed.`,
    );
  }
  const allAssignments = [],
    allAssignmentEvents = [],
    allRevisions = [],
    allTaskActivities = [];
  for (const item of fixture.tasks) {
    const [task] = await manager.query(
      'SELECT * FROM core."deliveryTask" WHERE "workspaceId"=$1 AND id=$2',
      [WORKSPACE_ID, item.deliveryTaskId],
    );
    assert(task);
    const [native] = await manager.query(
      `SELECT * FROM ${quote(fixture.schema)}.task WHERE id=$1`,
      [item.taskId],
    );
    assert(native);
    const decision = decisionOf(task, native, item, fixture);
    if (decision) {
      const [{ observedAt }] = await manager.query(
        'SELECT clock_timestamp() AS "observedAt"',
      );
      assert(
        timestamp(task.updatedAt, 'Decision database time') >=
          timestamp(item.taskSeed.createdAt, 'Initial database time'),
      );
      assert(
        timestamp(task.updatedAt, 'Decision database time') <=
          timestamp(observedAt, 'Observed database time'),
      );
    }
    const assignments = await manager.query(
      'SELECT * FROM core."deliveryReviewAssignment" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [WORKSPACE_ID, item.taskId],
    );
    const events = await manager.query(
      'SELECT * FROM core."deliveryReviewAssignmentEvent" WHERE "workspaceId"=$1 AND "taskId"=$2 ORDER BY revision',
      [WORKSPACE_ID, item.taskId],
    );
    assert(assignments.length <= 1 && events.length <= 10);
    if (item.allowedDecision === null) {
      assert.equal(assignments.length, 0);
      assert.equal(events.length, 0);
    }
    if (assignments.length) {
      const assignment = assignments[0];
      assert.equal(assignment.submissionVersion, 1);
      assert.equal(assignment.revision, events.length);
      assert.equal(assignment.changedBy, fixture.actorId);
      assert.equal(assignment.changedByName, fixture.actorName);
      validText(assignment.reason, 2000, 'Assignment reason');
      assert(['PRIMARY', 'BACKUP'].includes(assignment.mode));
      assert.equal(
        assignment.reviewerId,
        assignment.mode === 'BACKUP' ? fixture.backupId : null,
      );
      assert.equal(
        assignment.reviewerName,
        assignment.mode === 'BACKUP' ? fixture.backupName : null,
      );
      events.forEach((event, index) => {
        assert.equal(event.assignmentId, assignment.id);
        assert.equal(event.submissionVersion, 1);
        assert.equal(event.revision, index + 1);
        assert.equal(event.actorId, fixture.actorId);
        assert.equal(event.actorName, fixture.actorName);
        assert.equal(event.primaryReviewerId, fixture.actorId);
        assert.equal(event.primaryReviewerName, fixture.actorName);
        assert.equal(
          event.reviewerId,
          event.mode === 'BACKUP' ? fixture.backupId : null,
        );
        assert.equal(
          event.reviewerName,
          event.mode === 'BACKUP' ? fixture.backupName : null,
        );
        assert(['PRIMARY', 'BACKUP'].includes(event.mode));
        assert.match(event.commandId, UUID);
        assert.match(event.requestHash, HASH);
        validText(event.reason, 2000, 'Immutable assignment reason');
        const previous = events[index - 1];
        assert.equal(event.previousMode, previous?.mode ?? 'PRIMARY');
        assert.equal(
          event.previousReviewerId,
          previous?.mode === 'BACKUP' ? fixture.backupId : fixture.actorId,
        );
        assert.equal(
          event.previousReviewerName,
          previous?.mode === 'BACKUP' ? fixture.backupName : fixture.actorName,
        );
        assert(
          timestamp(event.createdAt, 'Assignment event') >=
            timestamp(fixture.createdAt, 'Fixture creation'),
        );
      });
      const last = events.at(-1);
      for (const key of ['mode', 'reviewerId', 'reviewerName', 'reason'])
        assert.equal(assignment[key], last[key]);
      assert.equal(
        timestamp(assignment.changedAt, 'Assignment change'),
        timestamp(last.createdAt, 'Assignment event'),
      );
      if (decision)
        assert.equal(
          assignment.mode,
          'PRIMARY',
          'Restore canonical primary review before the allowed actual decision.',
        );
    } else assert.equal(events.length, 0);
    const revisions = await manager.query(
      'SELECT * FROM core."deliveryRevision" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [WORKSPACE_ID, item.taskId],
    );
    assert.equal(revisions.length, decision === 'CHANGES_REQUESTED' ? 1 : 0);
    if (revisions.length) {
      const row = revisions[0];
      assert.equal(row.projectId, fixture.projectId);
      assert.equal(row.round, 1);
      assert.equal(row.taskRevision, 2);
      assert.equal(row.submissionVersion, 1);
      assert.equal(row.source, 'INTERNAL_REVIEW');
      assert.equal(row.reason, task.details.submissions[0].feedback);
      assert.equal(row.cause, 'UNCLASSIFIED');
      assert.equal(row.effortMinutes, null);
      assert.equal(row.internalCost, null);
      assert.equal(String(row.proposedCharge), '0');
      assert.equal(row.currency, null);
      assert.equal(row.revision, 1);
      assert.equal(
        timestamp(row.createdAt, 'Revision DB time'),
        timestamp(task.updatedAt, 'Atomic task DB time'),
      );
      assert(
        timestamp(row.createdAt, 'Revision DB time') >=
          timestamp(item.taskSeed.createdAt, 'Initial task DB time'),
      );
    }
    const activities = await manager.query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [WORKSPACE_ID, item.taskId],
    );
    assert.equal(
      activities.length,
      events.length + (decision === 'CHANGES_REQUESTED' ? 2 : decision ? 1 : 0),
    );
    for (const event of activities) {
      assert.equal(event.actorId, fixture.actorId);
      assert.equal(event.actorType, 'HUMAN');
      assert.equal(event.category, 'DELIVERY');
      assert.equal(event.projectId, fixture.projectId);
      assert.equal(event.sourceType, 'task');
      assert.equal(event.sourceId, item.taskId);
      assert(
        [
          'REVIEW_BACKUP_ASSIGNED',
          'REVIEW_PRIMARY_RESTORED',
          'TASK_REVIEWED',
          'REVISION_OPENED',
        ].includes(event.action),
      );
      if (event.action === 'TASK_REVIEWED')
        assert.equal(event.outcome, decision);
      if (event.action === 'REVISION_OPENED')
        assert.equal(decision, 'CHANGES_REQUESTED');
    }
    assert.equal(
      activities.filter((event) => event.action === 'REVIEW_BACKUP_ASSIGNED')
        .length,
      events.filter((event) => event.mode === 'BACKUP').length,
    );
    assert.equal(
      activities.filter((event) => event.action === 'REVIEW_PRIMARY_RESTORED')
        .length,
      events.filter((event) => event.mode === 'PRIMARY').length,
    );
    assert.equal(
      activities.filter((event) => event.action === 'TASK_REVIEWED').length,
      decision ? 1 : 0,
    );
    assert.equal(
      activities.filter((event) => event.action === 'REVISION_OPENED').length,
      revisions.length,
    );
    allAssignments.push(...assignments);
    allAssignmentEvents.push(...events);
    allRevisions.push(...revisions);
    allTaskActivities.push(...activities);
  }
  const [rule] = await manager.query(
    'SELECT * FROM core."deliveryFounderEscalationRule" WHERE "workspaceId"=$1 AND id=$2',
    [WORKSPACE_ID, fixture.ruleId],
  );
  assert(rule);
  assert.equal(rule.enabled, false);
  assert.equal(rule.grantedBy, null);
  assert.equal(rule.grantUserWorkspaceId, null);
  assert.equal(rule.lastEvaluatedAt, null);
  assert.equal(rule.evaluationError, null);
  assert.equal(rule.condition, 'TASK_REVIEW_WAIT');
  assert.equal(rule.recipientId, fixture.actorId);
  assert.equal(rule.recipientName, fixture.actorName);
  assert.equal(rule.changedBy, fixture.actorId);
  assert.equal(rule.changedByName, fixture.actorName);
  assert(rule.name.startsWith(fixture.sentinel));
  assert.equal(rule.projectScope, 'SELECTED');
  exactIds(rule.projectIds, [fixture.projectId]);
  assert.equal(rule.includeCompany, false);
  assert.equal(rule.currency, null);
  assert.equal(rule.serviceMonth, null);
  assert.equal(rule.repeatMode, 'ONCE');
  assert.equal(rule.repeatHours, null);
  assert.equal(rule.maxSends, 1);
  assert.equal(rule.priority, 'NORMAL');
  assert(
    Number.isSafeInteger(rule.minimumReviewWaitHours) &&
      rule.minimumReviewWaitHours >= 1 &&
      rule.minimumReviewWaitHours <= 720,
  );
  assert(
    Number.isSafeInteger(rule.revision) &&
      rule.revision >= 1 &&
      rule.revision <= 10,
  );
  const notices = await manager.query(
    'SELECT * FROM core."deliveryFounderEscalationNotice" WHERE "workspaceId"=$1 AND "ruleId"=$2 ORDER BY "ruleRevision"',
    [WORKSPACE_ID, fixture.ruleId],
  );
  assert.equal(notices.length, rule.revision);
  assert.equal(
    fingerprint(notices.find((row) => row.id === fixture.seedNoticeId)),
    fixture.seedNoticeHash,
  );
  notices.forEach((notice, index) => {
    assert.equal(notice.ruleRevision, index + 1);
    assert(['RULE_SAVED', 'RULE_PAUSED'].includes(notice.kind));
    assert.equal(notice.episodeId, null);
    assert.equal(notice.source, null);
    assert.equal(notice.sequence, 0);
    assert.equal(notice.createdBy, fixture.actorId);
    assert.equal(notice.actorName, fixture.actorName);
    assert.equal(notice.recipientId, fixture.actorId);
    assert.equal(notice.recipientName, fixture.actorName);
    assert.match(notice.commandId, UUID);
    assert.match(notice.requestHash, HASH);
    assert.equal(notice.ruleSnapshot.id, fixture.ruleId);
    assert.equal(notice.ruleSnapshot.revision, notice.ruleRevision);
    assert.equal(notice.ruleSnapshot.enabled, false);
    assert.equal(notice.ruleSnapshot.condition, 'TASK_REVIEW_WAIT');
    assert.equal(notice.ruleSnapshot.projectScope, 'SELECTED');
    exactIds(notice.ruleSnapshot.projectIds, [fixture.projectId]);
    assert.equal(notice.ruleSnapshot.recipientId, fixture.actorId);
    assert(notice.ruleSnapshot.name.startsWith(fixture.sentinel));
    assert(
      timestamp(notice.createdAt, 'Paused rule history') >=
        timestamp(fixture.createdAt, 'Fixture creation'),
    );
  });
  assert.equal(
    fingerprint(notices.at(-1).ruleSnapshot),
    fingerprint({ ...selectedRule(rule), enabled: false }),
  );
  const ruleActivities = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'founder-alert\' AND "sourceId"=$2',
    [WORKSPACE_ID, fixture.ruleId],
  );
  assert.equal(ruleActivities.length, rule.revision - 1);
  for (const event of ruleActivities) {
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.actorType, 'HUMAN');
    assert.equal(event.category, 'DELIVERY');
    assert.equal(event.taskId, null);
    assert.equal(event.projectId, null);
    assert(
      [
        'FOUNDER_ESCALATION_RULE_SAVED',
        'FOUNDER_ESCALATION_RULE_PAUSED',
      ].includes(event.action),
    );
  }
  const allowed = {
    deliveryProject: [fixture.projectId],
    deliveryTask: fixture.tasks.map((item) => item.deliveryTaskId),
    user: [fixture.editorUserId, fixture.backupUserId],
    userWorkspace: [fixture.editorMembershipId, fixture.backupMembershipId],
    otogrowRole: [fixture.roleId],
    otogrowRoleAssignment: [fixture.roleAssignmentId],
    otogrowMemberAccess: [fixture.memberAccessId],
    deliveryReviewAssignment: allAssignments.map((row) => row.id),
    deliveryReviewAssignmentEvent: allAssignmentEvents.map((row) => row.id),
    deliveryRevision: allRevisions.map((row) => row.id),
    deliveryFounderEscalationRule: [fixture.ruleId],
    deliveryFounderEscalationNotice: notices.map((row) => row.id),
    otogrowActivityEvent: [...allTaskActivities, ...ruleActivities].map(
      (row) => row.id,
    ),
  };
  const ownedNotices = operations.state.notices.filter(
    (notice) =>
      notice.kind === 'REVIEW_ASSIGNMENT' &&
      fixture.tasks.some((item) => item.taskId === notice.taskId),
  );
  assert(ownedNotices.length <= 20);
  for (const notice of ownedNotices) {
    assert.match(notice.id, UUID);
    const primarySeed = notice.id === fixture.primaryNoticeId;
    assert.equal(
      notice.senderId,
      primarySeed ? fixture.editorId : fixture.actorId,
    );
    assert.equal(
      notice.recipientId,
      primarySeed ? fixture.actorId : fixture.backupId,
      'Only the exact seeded primary notice or attributed synthetic-backup handoff is owned.',
    );
    const origin = notice.reviewAssignment;
    assert(origin);
    assert.equal(origin.submissionVersion, 1);
    assert.equal(origin.recipientId, notice.recipientId);
    const assignment = allAssignments.find(
      (row) => row.taskId === notice.taskId,
    );
    if (primarySeed) {
      assert.equal(notice.taskId, fixture.tasks[1].taskId);
      assert.equal(origin.assignmentId, null);
      assert.equal(origin.assignmentRevision, 0);
      const immutable = copy(notice);
      for (const key of [
        'seenAt',
        'acknowledgedAt',
        'cancelled',
        'sendState',
        'attemptedAt',
        'error',
      ])
        delete immutable[key];
      assert.equal(
        fingerprint(immutable),
        fixture.primaryNoticeImmutableHash,
        'Seeded primary source/origin/text/deadline must remain exact.',
      );
    } else {
      assert.match(origin.assignmentId, UUID);
      assert(assignment);
      assert.equal(assignment.id, origin.assignmentId);
      assert(
        origin.assignmentRevision >= 1 &&
          origin.assignmentRevision <= assignment.revision,
      );
      const event = allAssignmentEvents.find(
        (row) =>
          row.assignmentId === origin.assignmentId &&
          row.revision === origin.assignmentRevision,
      );
      assert(event);
      assert.equal(event.mode, 'BACKUP');
      assert.equal(event.reviewerId, fixture.backupId);
      assert.equal(
        timestamp(notice.createdAt, 'Review notice mint'),
        timestamp(event.createdAt, 'Assignment mint event'),
      );
      assert.equal(
        notice.seenAt,
        null,
        'Current admin cannot mark another review recipient seen.',
      );
      assert.equal(
        notice.acknowledgedAt,
        null,
        'Current admin cannot acknowledge another review recipient.',
      );
    }
    assert.equal(
      timestamp(notice.remindAt, 'Review notice deadline') -
        timestamp(notice.createdAt, 'Review notice mint'),
      300000,
    );
    assert(
      ['PENDING', 'UNCONFIGURED', 'SUPPRESSED', 'QUEUED'].includes(
        notice.sendState,
      ),
      'No attempted/sent/failed/uncertain transport receipt belongs to this browser fixture.',
    );
    assert.equal(notice.attemptedAt, null);
    assert.equal(typeof notice.cancelled, 'boolean');
    validText(notice.text, 2000, 'Review handoff text');
    for (const value of [notice.seenAt, notice.acknowledgedAt])
      if (value !== null) {
        assert(
          timestamp(value, 'Exact recipient read receipt') >=
            timestamp(notice.createdAt, 'Notice mint'),
        );
        assert(timestamp(value, 'Exact recipient read receipt') <= Date.now());
      }
    const item = fixture.tasks.find((row) => row.taskId === notice.taskId),
      task = (
        await manager.query(
          'SELECT details FROM core."deliveryTask" WHERE id=$1',
          [item.deliveryTaskId],
        )
      )[0];
    if (!notice.cancelled) {
      assert.equal(task.details.state, 'IN_REVIEW');
      assert.equal(
        assignment?.mode ?? 'PRIMARY',
        primarySeed ? 'PRIMARY' : 'BACKUP',
      );
      assert.equal(
        primarySeed ? fixture.actorId : assignment?.reviewerId,
        notice.recipientId,
      );
    }
  }
  assert.equal(
    ownedNotices.filter((notice) => notice.id === fixture.primaryNoticeId)
      .length,
    1,
    'The exact seeded primary handoff must remain as immutable history even after its decision.',
  );
  for (const item of fixture.tasks) {
    const current = ownedNotices.filter(
      (notice) => notice.taskId === item.taskId && !notice.cancelled,
    );
    assert(
      current.length <= 1,
      'One review responsibility has one current original unread deadline.',
    );
  }
  const outbox = await manager.query(
    'SELECT * FROM core."deliveryReminderOutbox" WHERE "workspaceId"=$1 AND "noticeId"=ANY($2::uuid[])',
    [WORKSPACE_ID, ownedNotices.map((notice) => notice.id)],
  );
  for (const row of outbox) {
    assert(['QUEUED', 'UNCONFIGURED', 'SUPPRESSED'].includes(row.status));
    assert.equal(row.attemptedAt, null);
    assert(ownedNotices.some((notice) => notice.id === row.noticeId));
  }
  allowed.deliveryReminderOutbox = outbox.map((row) => row.id);
  for (const table of extra) {
    const ids =
      table.schema === 'core'
        ? (allowed[table.name] ?? [])
        : table.name === 'workspaceMember'
          ? [fixture.editorId, fixture.backupId]
          : table.name === 'task'
            ? fixture.tasks.map((item) => item.taskId)
            : [];
    exactIds(
      table.rows.map((row) => row.id),
      ids,
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
        workspaceId: WORKSPACE_ID,
        sentinel: fixture.sentinel,
        projectId: fixture.projectId,
        primaryReviewer: fixture.actorName,
        backupReviewer: fixture.backupName,
        primaryNoticeId: fixture.primaryNoticeId,
        primaryNoticeSeed:
          'Synthetic pending-source receipt test seed; this does not claim an actual API submission.',
        totalTasks: fixture.tasks.length,
        immutablePagingTasks: fixture.tasks.filter((item) => item.readOnly)
          .length,
        tasks: fixture.tasks
          .filter((item) => !item.readOnly)
          .map((item) => ({
            id: item.taskId,
            name: item.name,
            allowedDecision: item.allowedDecision,
            submittedAt: item.submittedAt,
          })),
        urls: {
          queue: `/delivery?view=reviews&reviewProject=${fixture.projectId}`,
          primary: `/delivery?view=reviews&reviewProject=${fixture.projectId}&reviewReviewer=${fixture.actorId}`,
          backup: `/delivery?view=reviews&reviewProject=${fixture.projectId}&reviewReviewer=${fixture.backupId}`,
          first: `/delivery?view=reviews&reviewProject=${fixture.projectId}&task=${fixture.tasks[0].taskId}&panel=task`,
          second: `/delivery?view=reviews&reviewProject=${fixture.projectId}&task=${fixture.tasks[1].taskId}&panel=task`,
          unknown: `/delivery?view=reviews&reviewProject=${fixture.projectId}&task=${fixture.tasks[2].taskId}&panel=task`,
          rule: `/delivery?view=health&founderPanel=alerts&founderRule=${fixture.ruleId}`,
        },
      },
      null,
      2,
    ),
  );
}
async function createFixture() {
  assert(!existsSync(FILE), 'Recover the existing reviews UI fixture first.');
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    ...Object.fromEntries(IDS.map((key) => [key, randomUUID()])),
    createdAt: new Date().toISOString(),
    baseline: null,
    cleanupAttempts: [],
    immutable: [],
    paged: process.env.OTOGROW_REVIEWS_UI_PAGED === '1',
    tasks: [
      {
        name: 'A · approve independently',
        submittedAt: '2020-02-20T08:00:00.000Z',
        allowedDecision: 'APPROVED',
      },
      {
        name: 'B · request changes',
        submittedAt: '2020-02-21T08:00:00.000Z',
        allowedDecision: 'CHANGES_REQUESTED',
      },
      {
        name: 'C · unknown submission time',
        submittedAt: null,
        allowedDecision: null,
      },
      ...(process.env.OTOGROW_REVIEWS_UI_PAGED === '1'
        ? Array.from({ length: 52 }, (_, index) => ({
            name: `Read-only queue source ${String(index).padStart(2, '0')}`,
            submittedAt: pagingSubmittedAt(index),
            allowedDecision: null,
            readOnly: true,
          }))
        : []),
    ].map((item) => ({
      ...item,
      taskId: randomUUID(),
      deliveryTaskId: randomUUID(),
      templateId: randomUUID(),
    })),
  };
  fixture.marker = markerFor(fixture.nonce);
  fixture.sentinel = titleFor(fixture.nonce);
  fixture.editorName = `Synthetic editor ${fixture.nonce.slice(0, 8)}`;
  fixture.backupName = `Synthetic backup ${fixture.nonce.slice(0, 8)}`;
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
      'Use the existing native administrator without changing access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorName = admins[0].name;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    assert.equal(
      (
        await manager.query(
          'SELECT count(*)::int AS count FROM core."deliveryProject" WHERE "workspaceId"=$1 AND name LIKE $2',
          [WORKSPACE_ID, `${PREFIX}%`],
        )
      )[0].count,
      0,
      'Recover earlier review-queue fixtures first.',
    );
    const descriptors = await tableDescriptors(manager, fixture.schema),
      operations = await readOperations(manager);
    const [{ activeBot }] = await manager.query(
      'SELECT EXISTS(SELECT 1 FROM core."telegramConfig" WHERE "workspaceId"=$1 AND "isActive"=true AND "deletedAt" IS NULL) AS "activeBot"',
      [WORKSPACE_ID],
    );
    assert(
      !operations.state.telegramEnabled || !activeBot,
      'This browser fixture requires a disabled real delivery transport; never change bot or routing setup for acceptance.',
    );
    for (const item of fixture.tasks)
      assert(!Object.hasOwn(operations.state.assignments, item.taskId));
    fixture.baseline = {
      tables: await readTables(manager, descriptors),
      operations: {
        id: operations.id,
        hash: fingerprint(withoutHeartbeat(operations.state)),
      },
    };
    fixture.status = 'PREPARED';
    writeJournal(fixture);
    for (const kind of ['editor', 'backup']) {
      await manager.query('INSERT INTO core."user" (id,email) VALUES($1,$2)', [
        fixture[`${kind}UserId`],
        `${fixture[`${kind}UserId`]}+review-queue@example.invalid`,
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
        `${fixture.sentinel} review only`,
        fixture.marker,
        ['delivery.review'],
      ],
    );
    await manager.query(
      'INSERT INTO core."otogrowMemberAccess" (id,"workspaceId","workspaceMemberId",revision) VALUES($1,$2,$3,1)',
      [fixture.memberAccessId, WORKSPACE_ID, fixture.backupId],
    );
    await manager.query(
      'INSERT INTO core."otogrowRoleAssignment" (id,"workspaceId","workspaceMemberId","roleId") VALUES($1,$2,$3,$4)',
      [
        fixture.roleAssignmentId,
        WORKSPACE_ID,
        fixture.backupId,
        fixture.roleId,
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.sentinel,
        JSON.stringify([fixture.actorId, fixture.editorId, fixture.backupId]),
      ],
    );
    for (const item of fixture.tasks) {
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}.task(id,title,"assigneeId",status,"dueAt") VALUES($1,$2,$3,'IN_PROGRESS',NULL)`,
        [item.taskId, `${fixture.sentinel} ${item.name}`, fixture.editorId],
      );
      await manager.query(
        'INSERT INTO core."deliveryTask" (id,"workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,$5,1)',
        [
          item.deliveryTaskId,
          WORKSPACE_ID,
          item.taskId,
          fixture.projectId,
          taskDetails(fixture, item),
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
      operations.state.assignments[item.taskId] = `${fixture.editorId}:legacy`;
    }
    const rule = {
      id: fixture.ruleId,
      revision: 1,
      name: `${fixture.sentinel} paused wait rule`,
      condition: 'TASK_REVIEW_WAIT',
      minimumReviewWaitHours: 24,
      recipientId: fixture.actorId,
      priority: 'NORMAL',
      projectScope: 'SELECTED',
      projectIds: [fixture.projectId],
      includeCompany: false,
      currency: null,
      serviceMonth: null,
      repeatMode: 'ONCE',
      repeatHours: null,
      maxSends: 1,
    };
    await manager.query(
      `INSERT INTO core."deliveryFounderEscalationRule" (id,"workspaceId",revision,enabled,name,condition,"minimumReviewWaitHours","recipientId","recipientName",priority,"projectScope","projectIds","includeCompany",currency,"serviceMonth","repeatMode","repeatHours","maxSends","grantedBy","grantUserWorkspaceId","changedBy","changedByName","changedAt","lastEvaluatedAt","evaluationError") VALUES($1,$2,1,false,$3,'TASK_REVIEW_WAIT',24,$4,$5,'NORMAL','SELECTED',ARRAY[$6::uuid],false,NULL,NULL,'ONCE',NULL,1,NULL,NULL,$4,$5,$7,NULL,NULL)`,
      [
        fixture.ruleId,
        WORKSPACE_ID,
        rule.name,
        fixture.actorId,
        fixture.actorName,
        fixture.projectId,
        fixture.createdAt,
      ],
    );
    await manager.query(
      `INSERT INTO core."deliveryFounderEscalationNotice" (id,"workspaceId","ruleId","episodeId",kind,sequence,"ruleRevision","commandId","requestHash","ruleSnapshot",source,"recipientId","recipientName",priority,"createdBy","actorName",reason,"createdAt") VALUES($1,$2,$3,NULL,'RULE_SAVED',0,1,$4,$5,$6,NULL,$7,$8,'NORMAL',$7,$8,$9,$10)`,
      [
        fixture.seedNoticeId,
        WORKSPACE_ID,
        fixture.ruleId,
        fixture.seedCommandId,
        fingerprint({ marker: fixture.marker, rule }),
        { ...rule, enabled: false },
        fixture.actorId,
        fixture.actorName,
        fixture.marker,
        fixture.createdAt,
      ],
    );
    fixture.seedNoticeHash = fingerprint(
      (
        await manager.query(
          'SELECT * FROM core."deliveryFounderEscalationNotice" WHERE id=$1',
          [fixture.seedNoticeId],
        )
      )[0],
    );
    await manager.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
      [operations.id, operations.state],
    );
    const {
      recordDeliveryReviewNotice,
    } = require('../dist/modules/delivery/reviews/delivery-review-notices');
    await recordDeliveryReviewNotice(manager, WORKSPACE_ID, {
      taskId: fixture.tasks[1].taskId,
      submissionVersion: 1,
      assignmentId: null,
      assignmentRevision: 0,
      previousRecipientId: null,
      recipientId: fixture.actorId,
      eligible: true,
      senderId: fixture.editorId,
      now: new Date(fixture.createdAt),
    });
    const seededOperations = await readOperations(manager);
    const seededPrimary = seededOperations.state.notices.filter(
      (notice) =>
        notice.kind === 'REVIEW_ASSIGNMENT' &&
        notice.taskId === fixture.tasks[1].taskId,
    );
    assert.equal(seededPrimary.length, 1);
    seededPrimary[0].text =
      'Synthetic fixture seed: a pending submission awaits your independent review. No real client or API submission is claimed.';
    fixture.primaryNoticeId = seededPrimary[0].id;
    fixture.seedPrimaryNotice = copy(seededPrimary[0]);
    const immutablePrimary = copy(seededPrimary[0]);
    for (const key of [
      'seenAt',
      'acknowledgedAt',
      'cancelled',
      'sendState',
      'attemptedAt',
      'error',
    ])
      delete immutablePrimary[key];
    fixture.primaryNoticeImmutableHash = fingerprint(immutablePrimary);
    await manager.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
      [seededOperations.id, seededOperations.state],
    );
    for (const [schema, name, ids] of [
      ['core', 'deliveryProject', [fixture.projectId]],
      ['core', 'user', [fixture.editorUserId, fixture.backupUserId]],
      [
        'core',
        'userWorkspace',
        [fixture.editorMembershipId, fixture.backupMembershipId],
      ],
      [fixture.schema, 'workspaceMember', [fixture.editorId, fixture.backupId]],
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
    if (process.env.OTOGROW_REVIEWS_UI_TEST_FAILURE === 'create-before-commit')
      throw new Error('Injected reviews UI create failure before commit');
  });
  if (process.env.OTOGROW_REVIEWS_UI_TEST_FAILURE === 'create-after-commit')
    throw new Error('Injected reviews UI create failure after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
  console.log(
    'Restricted journey: filter the exact project; inspect factual age/Unknown and select only A+B for guided per-item review. Opt-in paged fixtures contain24 immutable sources before A and28 between A/B: A ends the first25-row page and B appears on the third page. Inspect all pages and select exact A+B across pages without changing any added source. For A, assign the synthetic backup with a reason, verify current primary cannot decide, inspect history, restore Primary with a reason, confirm the pinned quality check and explicitly Approve once. B contains one labelled synthetic PRIMARY row0 notice addressed to the current admin: inspect it, mark that exact handoff seen and optionally acknowledge it before independently Requesting changes once with a reason. This seed does not claim a real client/API submission. C and all added queue sources are read-only: no assignment or decision. Keep/edit/discard drafts, back/forward, outage/retry and390px inspection are permitted. The exact paused TASK_REVIEW_WAIT rule may be previewed and saved paused (wait1–720h, retain nonce name/current-admin recipient/exact project/once/normal). Never enable/adopt routing, send, deliver, fulfil, resubmit, modify production/real roles or act on preexisting work. No external provider/files/cost.',
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
        ['otogrowRole', [fixture.roleId]],
        ['user', [fixture.editorUserId, fixture.backupUserId]],
        ['deliveryFounderEscalationRule', [fixture.ruleId]],
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
          candidate.schema === table.schema && candidate.name === table.name,
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
        reviewNotices: operations.state.notices
          .filter(
            (notice) =>
              notice.kind === 'REVIEW_ASSIGNMENT' &&
              fixture.tasks.some((item) => item.taskId === notice.taskId),
          )
          .map((notice) => ({
            id: notice.id,
            hash: fingerprint(notice),
            receipt: copy(notice),
          })),
        rows: extra
          .filter((table) => table.rows.length)
          .map(({ schema, name, rows }) => ({ schema, name, rows })),
        authenticationLifecycle: observations,
      });
      fixture.status = 'CLEANUP_PREPARED';
      writeJournal(fixture);
      for (const [schema, name] of [
        ['core', 'otogrowActivityEvent'],
        ['core', 'deliveryReminderOutbox'],
        ['core', 'deliveryFounderEscalationNotice'],
        ['core', 'deliveryFounderEscalationRule'],
        ['core', 'deliveryReviewAssignmentEvent'],
        ['core', 'deliveryReviewAssignment'],
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
        const deleted = await manager.query(
          `WITH deleted AS (DELETE FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM deleted`,
          [ids],
        );
        assert.equal(deleted.length, ids.length);
      }
      const state = copy(operations.state);
      for (const item of fixture.tasks) delete state.assignments[item.taskId];
      const ownedTaskIds = new Set(fixture.tasks.map((item) => item.taskId));
      state.notices = state.notices.filter(
        (notice) =>
          notice.kind !== 'REVIEW_ASSIGNMENT' ||
          !ownedTaskIds.has(notice.taskId),
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
        `Exact protected baseline did not survive reviews UI cleanup: ${after[index].name}`,
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
    if (process.env.OTOGROW_REVIEWS_UI_TEST_FAILURE === 'cleanup-before-commit')
      throw new Error('Injected reviews UI cleanup failure before commit');
  });
  if (process.env.OTOGROW_REVIEWS_UI_TEST_FAILURE === 'cleanup-after-commit')
    throw new Error('Injected reviews UI cleanup failure after commit');
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
    `Removed only ownership-verified review tasks/project/synthetic staff/scoped role/delegation/history/revision/activity, exact unattempted owned review notices/jobs and never-enabled paused wait rule. All preexisting native/core/source/finance/access/routing/bot/outbox baselines match. Current appToken/userSession lifecycle preserved with locked exact before/after IDs/digests. Private receipt: ${receipt}`,
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

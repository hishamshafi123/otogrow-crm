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
const FILE = '/tmp/otogrow-capacity-reads-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const PREFIX = 'Disposable Planner capacity reads';
const START_DATE = '2026-10-29';
const DATES = Array.from({ length: 7 }, (_, index) =>
  new Date(Date.parse(`${START_DATE}T00:00:00Z`) + index * 86400000)
    .toISOString()
    .slice(0, 10),
);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const IDS = ['nonce', 'projectId'];
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
const markerFor = (nonce) => `capacity-reads-ui:${nonce}`;
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
  assert.equal(fixture.tasks.length, 65);
  assert.equal(fixture.members.length, 56);
  for (const member of fixture.members)
    for (const key of ['memberId', 'userId', 'membershipId'])
      assert.match(member[key], UUID);
  for (const slot of fixture.availability) {
    assert.match(slot.id, UUID);
    assert.match(slot.memberId, UUID);
    assert(DATES.includes(slot.date));
  }
  for (const task of fixture.tasks)
    for (const key of ['taskId', 'deliveryTaskId'])
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
const validPlan = (plan) => {
  exactIds(Object.keys(plan), [
    'workMinutes',
    'revisionMinutes',
    'waitMinutes',
    'reviewMinutes',
    'reviewDate',
    'complexity',
  ]);
  for (const key of [
    'workMinutes',
    'revisionMinutes',
    'waitMinutes',
    'reviewMinutes',
  ])
    assert(
      plan[key] === null ||
        (Number.isInteger(plan[key]) && plan[key] >= 0 && plan[key] <= 10080),
    );
  assert(plan.reviewDate === null || DATES.includes(plan.reviewDate));
  assert([null, 'STANDARD', 'INVOLVED', 'COMPLEX'].includes(plan.complexity));
};
function initialDetails(fixture, item) {
  const privateText = `${fixture.marker}:PRIVATE_TASK_HISTORY:${'x'.repeat(1024)}`;
  return {
    brief: privateText,
    service: 'SEO',
    priority: 'NORMAL',
    scheduledDate: item.scheduledDate,
    reviewerId: fixture.actorId,
    state: item.state,
    blocker: '',
    checklist: [],
    evidence: [],
    plan: {
      workMinutes:
        item.index === 0
          ? 480
          : item.index % 9 === 0
            ? null
            : item.index % 9 === 1
              ? 0
              : 45,
      revisionMinutes: item.index % 11 === 0 ? null : 15,
      waitMinutes: item.index % 7 === 0 ? null : item.index % 7 === 1 ? 0 : 480,
      reviewMinutes:
        item.index % 8 === 0 ? null : item.index % 8 === 1 ? 0 : 20,
      reviewDate:
        item.index < 58
          ? START_DATE
          : item.index === 58
            ? null
            : item.index === 59
              ? '2026-10-28'
              : DATES[6],
      complexity: 'STANDARD',
    },
    events: Array.from({ length: 8 }, (_, index) => ({
      id: randomUUID(),
      actorId: fixture.members[0].memberId,
      action: 'COMMENT',
      text: privateText,
      at: new Date(
        Date.parse(fixture.createdAt) - 86400000 - index * 1000,
      ).toISOString(),
    })),
    submissions: Array.from({ length: 4 }, (_, index) => ({
      version: index + 1,
      description: privateText,
      evidence: [],
      submittedBy: fixture.members[0].memberId,
      submittedAt: new Date(
        Date.parse(fixture.createdAt) - 86400000 * (5 - index),
      ).toISOString(),
      ...(item.state === 'IN_REVIEW' && index === 3
        ? {}
        : {
            decision:
              item.state === 'APPROVED' && index === 3
                ? 'APPROVED'
                : 'CHANGES_REQUESTED',
            feedback: privateText,
            reviewedBy: fixture.actorId,
            reviewedAt: fixture.createdAt,
          }),
    })),
  };
}
function validateTask(task, native, item, fixture) {
  const expected = copy(item.taskSeed);
  const expectedNative = copy(item.nativeSeed);
  if (item.mode === 'READONLY') {
    assert.equal(
      fingerprint(task),
      fingerprint(expected),
      'Read-only synthetic source changed.',
    );
    assert.equal(fingerprint(native), fingerprint(expectedNative));
    return [];
  }
  const normalized = copy(task);
  const normalizedNative = copy(native);
  const originalEvents = expected.details.events;
  assert.deepEqual(
    task.details.events.slice(0, originalEvents.length),
    originalEvents,
    'Original task history must remain exact.',
  );
  const events = task.details.events.slice(originalEvents.length);
  const comments = events.filter((event) => event.action === 'COMMENT');
  const changes = events.filter((event) => event.action !== 'COMMENT');
  assert(comments.length <= 1);
  assert.equal(task.revision, expected.revision + events.length);
  for (const event of events) {
    exactIds(Object.keys(event), ['id', 'actorId', 'action', 'text', 'at']);
    assert.match(event.id, UUID);
    assert.equal(event.actorId, fixture.actorId);
    assert(
      timestamp(event.at, 'Task action') >=
        timestamp(fixture.createdAt, 'Fixture creation'),
    );
    assert(timestamp(event.at, 'Task action') <= Date.now());
    validText(event.text, 20000, 'Synthetic task action text');
  }
  if (item.mode === 'PLAN') {
    assert(
      changes.length <= 2 &&
        changes.every((event) => event.action === 'PLANNING_UPDATED'),
    );
    if (changes.length) {
      validPlan(task.details.plan);
      assert(
        changes.every(
          (event) =>
            event.text === 'Updated remaining effort and review planning.',
        ),
      );
      normalized.details.plan = expected.details.plan;
    }
  } else if (item.mode === 'EDIT') {
    assert(
      changes.length <= 1 &&
        changes.every((event) => event.action === 'UPDATED'),
    );
    if (changes.length) {
      validText(native.title, 200, 'Synthetic edited title');
      assert(native.title.startsWith(fixture.sentinel));
      assert.equal(changes[0].text, native.title);
      assert(task.details.brief.startsWith(fixture.marker));
      assert(task.details.brief.length <= 20000);
      assert([null, ...DATES].includes(task.details.scheduledDate));
      assert.deepEqual(task.details.evidence, []);
      assert.deepEqual(task.details.checklist, []);
      for (const key of ['brief', 'scheduledDate'])
        normalized.details[key] = expected.details[key];
      normalizedNative.title = expectedNative.title;
    }
  } else {
    assert.equal(item.mode, 'PROGRESS');
    assert(
      changes.length <= 2 &&
        changes.every((event) => event.action === 'PROGRESS'),
    );
    assert(['IN_PROGRESS', 'BLOCKED'].includes(task.details.state));
    assert.equal(typeof task.details.blocker, 'string');
    assert(task.details.blocker.length <= 4000);
    if (task.details.state === 'BLOCKED')
      validText(task.details.blocker, 4000, 'Blocker reason');
    normalized.details.state = expected.details.state;
    normalized.details.blocker = expected.details.blocker;
  }
  normalized.details.events = originalEvents;
  if (events.length) {
    assert(
      timestamp(task.updatedAt, 'Task modification') >=
        timestamp(fixture.createdAt, 'Fixture creation'),
    );
    assert(
      timestamp(native.updatedAt, 'Native modification') >=
        timestamp(fixture.createdAt, 'Fixture creation'),
    );
    normalized.revision = expected.revision;
    normalized.updatedAt = expected.updatedAt;
    normalizedNative.updatedAt = expectedNative.updatedAt;
    assert.equal(
      native.status,
      task.details.state === 'PLANNED' ? 'TODO' : 'IN_PROGRESS',
    );
    normalizedNative.status = expectedNative.status;
  }
  assert.equal(
    fingerprint(normalized),
    fingerprint(expected),
    'Only documented plan, schedule/notes or progress fields may change. Original evidence, ownership, approvals and history remain exact.',
  );
  assert.equal(fingerprint(normalizedNative), fingerprint(expectedNative));
  return events;
}
async function validateOwned(
  manager,
  tables,
  operations,
  fixture,
  preserveAuthenticationLifecycle = false,
) {
  const extra = additions(tables, fixture, preserveAuthenticationLifecycle);
  const hasSeed = extra.some((table) => table.rows.length);
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
  exactIds(
    tasks.map((task) => task.id),
    fixture.tasks.map((item) => item.deliveryTaskId),
    'Only exact owned seeded tasks are allowed.',
  );
  const native = await manager.query(
    `SELECT * FROM ${quote(fixture.schema)}.task WHERE id=ANY($1::uuid[])`,
    [tasks.map((task) => task.taskId)],
  );
  assert.equal(native.length, tasks.length);
  const actions = [];
  for (const task of tasks) {
    const item = fixture.tasks.find(
      (candidate) => candidate.deliveryTaskId === task.id,
    );
    const source = native.find((row) => row.id === item.taskId);
    assert(source);
    for (const event of validateTask(task, source, item, fixture))
      actions.push({ task, event });
    assert.equal(
      operations.state.assignments[task.taskId],
      `${source.assigneeId}:legacy`,
    );
  }
  assert.equal(
    fingerprint(withoutOwned(operations.state, tasks)),
    fixture.baseline.operations.hash,
    'Original Operations, finance, automation, routing, bot, notices and outbox state must remain exact.',
  );
  assert(
    !operations.state.notices.some((notice) =>
      tasks.some((task) => notice.taskId === task.taskId),
    ),
    'This finite planning journey cannot create or send notices.',
  );
  const slots = await manager.query(
    'SELECT * FROM core."deliveryAvailability" WHERE "workspaceId"=$1 AND "memberId"=ANY($2::uuid[])',
    [WORKSPACE_ID, fixture.members.map((member) => member.memberId)],
  );
  exactIds(
    slots.map((slot) => slot.id),
    fixture.availability.map((slot) => slot.id),
    'Only exact seeded availability slots may exist.',
  );
  let availabilityChanges = 0;
  for (const slot of slots) {
    const original = fixture.availability.find((item) => item.id === slot.id);
    const expected = copy(original.seed);
    const normalized = copy(slot);
    if (!original.mutable)
      assert.equal(fingerprint(slot), fingerprint(expected));
    else {
      assert(
        Number.isInteger(slot.revision) &&
          slot.revision >= 1 &&
          slot.revision <= 4,
      );
      availabilityChanges += slot.revision - 1;
      assert([null, 0, 240, 480].includes(slot.minutes));
      normalized.minutes = expected.minutes;
      normalized.revision = expected.revision;
      assert.equal(
        fingerprint(normalized),
        fingerprint(expected),
        'Availability ownership/date/id must remain exact.',
      );
    }
  }
  const activities = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND (("taskId"=ANY($2::uuid[])) OR ("sourceType"=\'capacity\' AND "sourceId"=ANY($3::uuid[])))',
    [
      WORKSPACE_ID,
      tasks.map((task) => task.taskId),
      slots.map((slot) => slot.id),
    ],
  );
  assert.equal(activities.length, actions.length + availabilityChanges);
  const expectedActions = {
    PLANNING_UPDATED: 'TASK_PLANNING_UPDATED',
    UPDATED: 'TASK_UPDATED',
    PROGRESS: 'TASK_PROGRESS',
    COMMENT: 'TASK_COMMENTED',
  };
  for (const row of activities) {
    assert.equal(row.actorId, fixture.actorId);
    assert.equal(row.actorType, 'HUMAN');
    assert.equal(row.category, 'DELIVERY');
    assert.equal(row.outcome, 'RECORDED');
    assert.equal(row.clientId, null);
    assert.equal(row.clientName, null);
    assert.equal(row.agentName, null);
    assert(
      timestamp(row.occurredAt, 'Activity') >=
        timestamp(fixture.createdAt, 'Fixture creation'),
    );
    assert(timestamp(row.occurredAt, 'Activity') <= Date.now());
    assert(Array.isArray(row.changes) && row.changes.length <= 10);
    for (const change of row.changes) {
      exactIds(Object.keys(change), ['field', 'before', 'after']);
      for (const value of [change.before, change.after])
        assert(
          value === null ||
            (typeof value === 'string' && value.length <= 10000),
        );
    }
    if (row.sourceType === 'task') {
      assert.equal(row.sourceId, row.taskId);
      assert.equal(row.projectId, fixture.projectId);
      assert.equal(row.projectName, fixture.sentinel);
      assert.equal(row.subjectMemberId, fixture.members[0].memberId);
      assert(row.taskName.startsWith(fixture.sentinel));
      const summaries = {
        TASK_PLANNING_UPDATED: 'Updated remaining effort and review planning.',
        TASK_UPDATED: 'Updated a delivery task.',
        TASK_PROGRESS: 'Updated production progress.',
        TASK_COMMENTED: 'Added a task note.',
      };
      assert.equal(row.summary, summaries[row.action]);
      const allowedChanges =
        row.action === 'TASK_PLANNING_UPDATED'
          ? [
              'workMinutes',
              'revisionMinutes',
              'waitMinutes',
              'reviewMinutes',
              'reviewDate',
              'complexity',
              'revision',
            ]
          : row.action === 'TASK_UPDATED'
            ? ['scheduledDate', 'revision']
            : row.action === 'TASK_PROGRESS'
              ? ['state', 'revision']
              : ['revision'];
      assert(
        row.changes.every((change) => allowedChanges.includes(change.field)),
      );
      assert(
        actions.some(
          ({ task, event }) =>
            task.taskId === row.taskId &&
            expectedActions[event.action] === row.action,
        ),
      );
    } else {
      assert.equal(row.sourceType, 'capacity');
      assert.equal(row.action, 'AVAILABILITY_UPDATED');
      assert.equal(row.taskId, null);
      assert.equal(row.projectId, null);
      assert.equal(row.projectName, null);
      assert.equal(row.taskName, null);
      assert.equal(row.summary, 'Updated daily planning availability.');
      const slot = fixture.availability.find(
        (item) => item.id === row.sourceId && item.mutable,
      );
      assert(slot);
      assert.equal(row.subjectMemberId, slot.memberId);
      exactIds(
        row.changes.map((change) => change.field),
        ['scheduledDate', 'availableMinutes', 'revision'],
      );
      assert.deepEqual(
        row.changes.find((change) => change.field === 'scheduledDate'),
        { field: 'scheduledDate', before: slot.date, after: slot.date },
      );
    }
  }
  for (const item of fixture.tasks) {
    const taskActions = actions.filter(
      ({ task }) => task.taskId === item.taskId,
    );
    exactIds(
      activities
        .filter((row) => row.taskId === item.taskId)
        .map((row) => row.action),
      taskActions.map(({ event }) => expectedActions[event.action]),
      'Every task action requires exactly one matching audit event.',
    );
  }
  for (const slot of slots) {
    const updates = activities.filter(
      (row) => row.sourceType === 'capacity' && row.sourceId === slot.id,
    );
    assert.equal(updates.length, slot.revision - 1);
    exactIds(
      updates.map(
        (row) =>
          row.changes.find((change) => change.field === 'revision').after,
      ),
      Array.from({ length: slot.revision - 1 }, (_, index) =>
        String(index + 2),
      ),
    );
    for (const row of updates) {
      const change = row.changes.find((item) => item.field === 'revision');
      assert.equal(Number(change.after), Number(change.before) + 1);
    }
  }
  const allowed = {
    deliveryProject: [fixture.projectId],
    deliveryTask: tasks.map((task) => task.id),
    deliveryAvailability: slots.map((slot) => slot.id),
    otogrowActivityEvent: activities.map((row) => row.id),
    user: fixture.members.map((member) => member.userId),
    userWorkspace: fixture.members.map((member) => member.membershipId),
  };
  for (const table of extra) {
    const expected =
      table.schema === 'core'
        ? (allowed[table.name] ?? [])
        : table.name === 'workspaceMember'
          ? fixture.members.map((member) => member.memberId)
          : table.name === 'task'
            ? tasks.map((task) => task.taskId)
            : [];
    exactIds(
      table.rows.map((row) => row.id),
      expected,
      `Unexpected ${table.schema}.${table.name} additions; refusing cleanup.`,
    );
  }
  return { extra, hasSeed, tasks };
}
function printFixture(fixture) {
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        status: fixture.status,
        workspaceId: WORKSPACE_ID,
        sentinel: fixture.sentinel,
        marker: fixture.marker,
        projectId: fixture.projectId,
        startDate: START_DATE,
        members: fixture.members.length,
        tasks: fixture.tasks.length,
        editorId: fixture.members[0].memberId,
        availabilityDates: DATES.slice(0, 3),
        mutableTasks: fixture.tasks
          .filter((item) => item.mode !== 'READONLY')
          .map((item) => ({ taskId: item.taskId, mode: item.mode })),
        urls: {
          planner: `/delivery?view=planner&project=${fixture.projectId}&capacityFrom=${START_DATE}&taskTimezone=Asia%2FQatar`,
          editor: `/delivery?view=planner&project=${fixture.projectId}&capacityFrom=${START_DATE}&capacityMember=${fixture.members[0].memberId}&capacityBucket=DAY&capacityDate=${START_DATE}&taskTimezone=Asia%2FQatar`,
          plan: `/delivery?view=planner&project=${fixture.projectId}&capacityFrom=${START_DATE}&taskTimezone=Asia%2FQatar&task=${fixture.tasks[0].taskId}`,
          edit: `/delivery?view=planner&project=${fixture.projectId}&capacityFrom=${START_DATE}&taskTimezone=Asia%2FQatar&task=${fixture.tasks[1].taskId}`,
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
    'Recover the active Planner capacity fixture first.',
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
    availability: [],
    members: Array.from({ length: 56 }, (_, index) => ({
      memberId: randomUUID(),
      userId: randomUUID(),
      membershipId: randomUUID(),
      index,
    })),
    tasks: Array.from({ length: 65 }, (_, index) => ({
      index,
      taskId: randomUUID(),
      deliveryTaskId: randomUUID(),
      mode:
        index === 0
          ? 'PLAN'
          : index === 1
            ? 'EDIT'
            : index === 2
              ? 'PROGRESS'
              : 'READONLY',
      state:
        index === 64
          ? 'APPROVED'
          : index === 63
            ? 'IN_REVIEW'
            : index === 2
              ? 'IN_PROGRESS'
              : 'PLANNED',
      scheduledDate:
        index < 55
          ? START_DATE
          : index === 55
            ? null
            : index === 56
              ? '2026-10-28'
              : index === 57
                ? '2026-11-05'
                : DATES[1],
    })),
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
    assert.equal(workspace?.activationStatus, 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    quote(fixture.schema);
    const admins = await manager.query(
      `SELECT member.id AS "memberId",membership.id AS "userWorkspaceId" FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(
      admins.length,
      1,
      'Use the current native administrator without changing real access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    const operations = await readOperations(manager);
    assert.equal(
      operations.state.enabled,
      false,
      'This fixture requires already-disabled local automation.',
    );
    assert.equal(
      operations.state.telegramEnabled,
      false,
      'Keep existing local Telegram transport disabled.',
    );
    assert.equal(
      (
        await manager.query(
          'SELECT count(*)::int AS count FROM core."deliveryProject" WHERE "workspaceId"=$1 AND name LIKE $2',
          [WORKSPACE_ID, `${PREFIX}%`],
        )
      )[0].count,
      0,
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
    for (const person of fixture.members) {
      const name =
        person.index === 0
          ? 'Synthetic Planner editor'
          : `Synthetic Planner teammate ${String(Math.floor(person.index / 4)).padStart(2, '0')}`;
      await manager.query('INSERT INTO core."user" (id,email) VALUES($1,$2)', [
        person.userId,
        `${person.userId}+capacity-reads@example.invalid`,
      ]);
      await manager.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES($1,$2,$3)',
        [person.membershipId, person.userId, WORKSPACE_ID],
      );
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}."workspaceMember" (id,"userId","nameFirstName","nameLastName") VALUES($1,$2,$3,$4)`,
        [person.memberId, person.userId, name, fixture.nonce.slice(0, 8)],
      );
    }
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.sentinel,
        JSON.stringify([
          fixture.actorId,
          ...fixture.members.map((person) => person.memberId),
        ]),
      ],
    );
    for (const item of fixture.tasks) {
      item.assigneeId = fixture.members[0].memberId;
      const title = `${fixture.sentinel} ${String(item.index).padStart(2, '0')} ${item.mode === 'READONLY' ? 'source' : item.mode.toLowerCase()}`;
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}.task (id,title,"assigneeId",status,"dueAt") VALUES($1,$2,$3,$4,NULL)`,
        [
          item.taskId,
          title,
          item.assigneeId,
          item.state === 'APPROVED'
            ? 'DONE'
            : item.state === 'PLANNED'
              ? 'TODO'
              : 'IN_PROGRESS',
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
    for (const [index, date] of DATES.entries()) {
      const slot = {
        id: randomUUID(),
        memberId: fixture.members[0].memberId,
        date,
        mutable: index < 3,
      };
      await manager.query(
        'INSERT INTO core."deliveryAvailability" (id,"workspaceId","memberId",date,minutes,revision) VALUES($1,$2,$3,$4,$5,1)',
        [
          slot.id,
          WORKSPACE_ID,
          slot.memberId,
          date,
          index === 0 ? 240 : index === 1 ? 0 : null,
        ],
      );
      slot.seed = copy(
        (
          await manager.query(
            'SELECT * FROM core."deliveryAvailability" WHERE id=$1',
            [slot.id],
          )
        )[0],
      );
      fixture.availability.push(slot);
    }
    await manager.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
      [operations.id, operations.state],
    );
    for (const [schema, name, ids] of [
      ['core', 'deliveryProject', [fixture.projectId]],
      ['core', 'user', fixture.members.map((person) => person.userId)],
      [
        'core',
        'userWorkspace',
        fixture.members.map((person) => person.membershipId),
      ],
      [
        fixture.schema,
        'workspaceMember',
        fixture.members.map((person) => person.memberId),
      ],
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
      process.env.OTOGROW_CAPACITY_READS_UI_TEST_FAILURE ===
      'create-before-commit'
    )
      throw new Error('Injected capacity fixture create before commit');
  });
  if (
    process.env.OTOGROW_CAPACITY_READS_UI_TEST_FAILURE === 'create-after-commit'
  )
    throw new Error('Injected capacity fixture create after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
  console.log(
    'Restricted journey: inspect Planner for the exact synthetic project; complete capacity stays across all permitted projects independently of task-card filters. Inspect three teammate pages, three assignment pages, date range, filters, exact task links, Back/forward, desktop390px, keyboard and draft Keep/Discard/outage/retry. Only task00 permits up to two plan saves; task01 one title/brief/scheduled-date edit retaining nonce title/marker and all original owners/service/priority/due-date/checklist/evidence; task02 up to two IN_PROGRESS/BLOCKED progress saves. Each mutable task permits one ordinary comment. Only the printed synthetic editor first three availability dates permit up to three saves each, to null,0,240or480minutes. All other tasks/members/availability are read-only. Do not create tasks, submit/review/send/deliver/fulfil, change roles/project/setup, activate automation, touch original sources or make paid/provider/ad/accounting calls. Exact fixture cleanup validates and removes only documented owned changes.',
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
        ['user', fixture.members.map((member) => member.userId)],
        ['deliveryAvailability', fixture.availability.map((slot) => slot.id)],
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
    );
    const operations = await readOperations(manager);
    const { extra, hasSeed, tasks } = await validateOwned(
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
        authenticationLifecycle: observations,
      });
      fixture.status = 'CLEANUP_PREPARED';
      writeJournal(fixture);
      for (const [schema, name] of [
        ['core', 'otogrowActivityEvent'],
        ['core', 'deliveryAvailability'],
        ['core', 'deliveryTask'],
        [fixture.schema, 'task'],
        ['core', 'deliveryProject'],
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
        exactIds(
          removed.map((row) => row.id),
          ids,
        );
      }
      const state = copy(operations.state);
      for (const task of tasks) delete state.assignments[task.taskId];
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
        `Protected ${after[index].name} did not survive capacity cleanup.`,
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
      process.env.OTOGROW_CAPACITY_READS_UI_TEST_FAILURE ===
      'cleanup-before-commit'
    )
      throw new Error('Injected capacity fixture cleanup before commit');
  });
  if (
    process.env.OTOGROW_CAPACITY_READS_UI_TEST_FAILURE ===
    'cleanup-after-commit'
  )
    throw new Error('Injected capacity fixture cleanup after commit');
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
    `Removed only exact owned Planner project/tasks/people/availability and documented planning/progress/activity. Original core/native/finance/access/bot/routing/notices/outbox digests match; current authentication lifecycle was locked and preserved. Private receipt: ${receipt}`,
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

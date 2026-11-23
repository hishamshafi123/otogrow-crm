const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  fingerprint,
  quote,
  withoutHeartbeat,
} = require('./check-delivery-assistants-ui-fixture.cjs');

const copy = (value) => JSON.parse(JSON.stringify(value));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const IDENTITIES = [
  'companyId',
  'engagementId',
  'periodId',
  'uniqueLineId',
  'variationLineId',
  'deletedTaskId',
  'deletedManagedId',
  'uniqueAllocationId',
  'variationAllocationId',
  'orphanAllocationId',
  'contractEventId',
  'taskEventId',
  'privateEventId',
];

function initializeCommitments() {
  return {
    ...Object.fromEntries(IDENTITIES.map((name) => [name, randomUUID()])),
    createdAt: new Date().toISOString(),
  };
}

function checkCommitmentJournal(fixture) {
  for (const name of IDENTITIES) assert.match(fixture[name], UUID);
  assert(Number.isFinite(Date.parse(fixture.createdAt)));
  assert.equal(
    new Set(IDENTITIES.map((name) => fixture[name])).size,
    IDENTITIES.length,
  );
  if (fixture.cleanupPermit) {
    assert.deepEqual(Object.keys(fixture.cleanupPermit).sort(), [
      'action',
      'allocationId',
      'at',
      'databaseAt',
      'requestId',
    ]);
    assert(['REMOVED', 'CANCELLED'].includes(fixture.cleanupPermit.action));
    assert.equal(
      fixture.cleanupPermit.allocationId,
      fixture.orphanAllocationId,
    );
    assert(
      Date.parse(fixture.cleanupPermit.at) >= Date.parse(fixture.createdAt),
    );
    assert(Number.isFinite(Date.parse(fixture.cleanupPermit.databaseAt)));
    if (fixture.cleanupPermit.requestId !== null)
      assert.match(fixture.cleanupPermit.requestId, UUID);
  }
}

function commitmentGroups(fixture) {
  return [
    [fixture.schema, 'company', [fixture.companyId]],
    ['core', 'deliveryCommitmentPeriod', [fixture.periodId]],
    [
      'core',
      'deliveryCommitmentLine',
      [fixture.uniqueLineId, fixture.variationLineId],
    ],
    [
      'core',
      'deliveryCommitmentAllocation',
      [
        fixture.uniqueAllocationId,
        fixture.variationAllocationId,
        fixture.orphanAllocationId,
      ],
    ],
    [
      'core',
      'deliveryCommitmentEvent',
      [fixture.contractEventId, fixture.taskEventId, fixture.privateEventId],
    ],
  ];
}

function expectedCommitmentOperations(fixture, present) {
  const value = copy(fixture.operationsOriginal);
  if (!present) return value;
  if (!value.clients)
    value.clients = { engagements: [], shares: [], links: [], audit: [] };
  value.clients.engagements.push(copy(fixture.engagementSeed));
  return value;
}

function verifyCommitmentOperations(state, fixture, present) {
  if (!fixture.operationsOriginal) {
    assert.equal(present, false);
    assert.equal(
      fingerprint(withoutHeartbeat(state)),
      fixture.baseline.operations.hash,
    );
    return;
  }
  assert.equal(
    fingerprint(withoutHeartbeat(state)),
    fingerprint(
      withoutHeartbeat(expectedCommitmentOperations(fixture, present)),
    ),
    'Only the exact disposable engagement may change Operations.',
  );
}

const timestampInWindow = (value, fixture, databaseNow) => {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  assert(
    timestamp >=
      Date.parse(
        databaseNow
          ? fixture.cleanupPermit.databaseAt
          : fixture.cleanupPermit.at,
      ) &&
      timestamp <=
        (databaseNow ? new Date(databaseNow).getTime() : Date.now()) + 5000,
  );
};

async function validateCommitmentMutation(manager, fixture, groups, present) {
  const extras = await manager.query(
    'SELECT * FROM core."deliveryCommitmentEvent" WHERE "workspaceId"=$1 AND "periodId"=$2 AND id<>ALL($3::uuid[]) ORDER BY id FOR UPDATE',
    [
      fixture.workspaceId,
      fixture.periodId,
      [fixture.contractEventId, fixture.taskEventId, fixture.privateEventId],
    ],
  );
  const activities = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND ("projectId"=$2 OR "sourceId"=$3) ORDER BY id FOR UPDATE',
    [fixture.workspaceId, fixture.projectId, fixture.engagementId],
  );
  if (!extras.length) {
    assert.equal(activities.length, 0);
    if (present)
      assert(
        !fixture.cleanupPermit?.requestId,
        'A bound cleanup receipt disappeared.',
      );
    return { extraEventIds: [], activityIds: [], removed: false };
  }
  assert(
    present && fixture.cleanupPermit,
    'Product cleanup requires a durable predeclared intent.',
  );
  assert.equal(extras.length, 1);
  assert.equal(activities.length, 1);
  const removed = fixture.cleanupPermit.action === 'REMOVED';
  const cleanupAction = removed
    ? 'COMMITMENT_ORPHAN_REMOVED'
    : 'COMMITMENT_ORPHAN_CLEANUP_CANCELLED';
  const cleanupReason = removed
    ? 'Removed an unavailable-source allocation from this commitment. Promised quantities and delivery history are unchanged.'
    : 'Cancelled this unavailable-source cleanup request before removal. No allocation was changed.';
  const event = copy(extras[0]);
  const activity = copy(activities[0]);
  assert.match(event.id, UUID);
  if (fixture.cleanupPermit.requestId)
    assert.equal(event.id, fixture.cleanupPermit.requestId);
  assert.match(activity.id, UUID);
  const [{ now: databaseNow }] = await manager.query(
    'SELECT clock_timestamp() AS now',
  );
  timestampInWindow(event.createdAt, fixture);
  timestampInWindow(activity.occurredAt, fixture);
  timestampInWindow(activity.recordedAt, fixture, databaseNow);
  const [{ name: actorName }] = await manager.query(
    `SELECT trim(concat_ws(' ',"nameFirstName","nameLastName")) AS name FROM ${quote(fixture.schema)}."workspaceMember" WHERE id=$1`,
    [fixture.actorId],
  );
  const {
    commitmentCleanupRequestHash,
  } = require('../dist/modules/delivery/commitments/delivery-commitments.policy');
  const hash = commitmentCleanupRequestHash(
    {
      workspaceId: fixture.workspaceId,
      memberId: fixture.actorId,
      userWorkspaceId: fixture.userWorkspaceId,
    },
    {
      requestId: event.id,
      engagementId: fixture.engagementId,
      periodId: fixture.periodId,
      periodRevision: 1,
      allocationId: fixture.orphanAllocationId,
      allocationRevision: 1,
      confirm: true,
    },
  );
  assert.deepEqual(event, {
    id: event.id,
    workspaceId: fixture.workspaceId,
    periodId: fixture.periodId,
    actorId: fixture.actorId,
    actorType: 'HUMAN',
    actorName,
    action: cleanupAction,
    taskId: null,
    taskName: null,
    reason: cleanupReason,
    changes: [
      {
        field: 'state',
        before: removed ? 'ASSIGNED' : null,
        after: fixture.cleanupPermit.action,
      },
      { field: 'requestHash', before: null, after: hash },
    ],
    createdAt: event.createdAt,
  });
  assert.deepEqual(activity, {
    id: activity.id,
    workspaceId: fixture.workspaceId,
    actorId: fixture.actorId,
    actorName,
    actorType: 'HUMAN',
    subjectMemberId: null,
    subjectName: null,
    category: 'CLIENT',
    action: cleanupAction,
    outcome: 'RECORDED',
    summary: 'Updated a structured service commitment.',
    projectId: fixture.projectId,
    projectName: fixture.title,
    clientId: fixture.companyId,
    clientName: `${fixture.title} brand`,
    taskId: null,
    taskName: null,
    agentName: null,
    sourceType: 'client-engagement',
    sourceId: fixture.engagementId,
    changes: [],
    occurredAt: activity.occurredAt,
    recordedAt: activity.recordedAt,
  });
  const allocation = groups
    .find((group) => group.name === 'deliveryCommitmentAllocation')
    .rows.find((row) => row.id === fixture.orphanAllocationId);
  assert.equal(allocation.state, removed ? 'REMOVED' : 'ASSIGNED');
  assert.equal(allocation.revision, removed ? 2 : 1);
  if (removed) timestampInWindow(allocation.updatedAt, fixture, databaseNow);
  groups
    .find((group) => group.name === 'deliveryCommitmentEvent')
    .rows.push(...extras);
  groups.push({
    schema: 'core',
    name: 'otogrowActivityEvent',
    rows: activities,
  });
  return {
    extraEventIds: [event.id],
    activityIds: [activity.id],
    removed,
  };
}

function normalizeCommitmentGroup(group, fixture, mutation, expected) {
  const actual = copy(group.rows);
  if (group.name === 'deliveryCommitmentAllocation' && mutation.removed) {
    const allocation = actual.find(
      (row) => row.id === fixture.orphanAllocationId,
    );
    const original = expected.find(
      (row) => row.id === fixture.orphanAllocationId,
    );
    allocation.state = original.state;
    allocation.revision = original.revision;
    allocation.updatedAt = original.updatedAt;
  }
  if (group.name === 'deliveryCommitmentEvent')
    return actual.filter((row) => !mutation.extraEventIds.includes(row.id));
  if (group.name === 'otogrowActivityEvent') return [];
  return actual;
}

async function seedCommitments(manager, fixture, originalOperations) {
  fixture.operationsOriginal = copy(originalOperations.state);
  const title = fixture.title;
  fixture.engagementSeed = {
    id: fixture.engagementId,
    revision: 1,
    companyId: fixture.companyId,
    projectId: fixture.projectId,
    name: `${title} plan`,
    services: ['AI video'],
    advertising: null,
    billing: 'RETAINER',
    scope: 'Disposable package for local interface acceptance.',
    allowance: '',
    contact: '',
    fields: [],
    assets: [],
    submissions: [],
  };
  await manager.query(
    `INSERT INTO ${quote(fixture.schema)}.company (id,name) VALUES($1,$2)`,
    [fixture.companyId, `${title} brand`],
  );
  await manager.query(
    'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
    [fixture.projectId, fixture.companyId],
  );
  await manager.query(
    'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
    [originalOperations.id, expectedCommitmentOperations(fixture, true)],
  );
  await manager.query(
    `INSERT INTO ${quote(fixture.schema)}.task (id,title,status,"deletedAt") VALUES($1,$2,'TODO',now())`,
    [fixture.deletedTaskId, `${fixture.marker}: private deleted title`],
  );
  await manager.query(
    'INSERT INTO core."deliveryTask" (id,"workspaceId","taskId","projectId",details,revision) SELECT $1,"workspaceId",$2,"projectId",details,1 FROM core."deliveryTask" WHERE id=$3',
    [fixture.deletedManagedId, fixture.deletedTaskId, fixture.firstManagedId],
  );
  await manager.query(
    `INSERT INTO core."deliveryCommitmentPeriod" (id,"workspaceId","engagementId","projectId","clientId",label,billing,"startDate","endDateExclusive",timezone,state,revision) VALUES($1,$2,$3,$4,$5,'November delivery','RETAINER','2026-11-01','2026-12-01','Asia/Qatar','OPEN',1)`,
    [
      fixture.periodId,
      fixture.workspaceId,
      fixture.engagementId,
      fixture.projectId,
      fixture.companyId,
    ],
  );
  for (const [id, label, unit, quantity] of [
    [fixture.uniqueLineId, 'Unique videos', 'UNIQUE_VIDEO', 6],
    [fixture.variationLineId, 'Hook variations', 'VARIATION', 12],
  ])
    await manager.query(
      'INSERT INTO core."deliveryCommitmentLine" (id,"workspaceId","periodId",label,unit,"promisedQuantity",revision) VALUES($1,$2,$3,$4,$5,$6,1)',
      [id, fixture.workspaceId, fixture.periodId, label, unit, quantity],
    );
  for (const [id, taskId, lineId, parentId, taskName] of [
    [
      fixture.uniqueAllocationId,
      fixture.firstTaskId,
      fixture.uniqueLineId,
      null,
      `${title} first`,
    ],
    [
      fixture.variationAllocationId,
      fixture.secondTaskId,
      fixture.variationLineId,
      fixture.firstTaskId,
      `${title} second`,
    ],
    [
      fixture.orphanAllocationId,
      fixture.deletedTaskId,
      fixture.uniqueLineId,
      null,
      `${fixture.marker}: private deleted allocation title`,
    ],
  ])
    await manager.query(
      `INSERT INTO core."deliveryCommitmentAllocation" (id,"workspaceId","periodId","lineId","taskId","taskName","parentTaskId",state,revision) VALUES($1,$2,$3,$4,$5,$6,$7,'ASSIGNED',1)`,
      [
        id,
        fixture.workspaceId,
        fixture.periodId,
        lineId,
        taskId,
        taskName,
        parentId,
      ],
    );
  for (const [id, taskId, taskName, action, reason] of [
    [
      fixture.contractEventId,
      null,
      null,
      'COMMITMENT_LINE_UPDATED',
      'Initial disposable service quantities.',
    ],
    [
      fixture.taskEventId,
      fixture.firstTaskId,
      `${title} first`,
      'COMMITMENT_TASK_ASSIGNED',
      'Disposable visible assignment.',
    ],
    [
      fixture.privateEventId,
      fixture.deletedTaskId,
      `${fixture.marker}: private retained title`,
      'COMMITMENT_TASK_ASSIGNED',
      `${fixture.marker}: private deleted assignment reason`,
    ],
  ])
    await manager.query(
      `INSERT INTO core."deliveryCommitmentEvent" (id,"workspaceId","periodId","actorId","actorType","actorName",action,"taskId","taskName",reason,changes) VALUES($1,$2,$3,$4,'HUMAN','Disposable manager',$5,$6,$7,$8,'[]'::jsonb)`,
      [
        id,
        fixture.workspaceId,
        fixture.periodId,
        fixture.actorId,
        action,
        taskId,
        taskName,
        reason,
      ],
    );
}

module.exports = {
  checkCommitmentJournal,
  commitmentGroups,
  expectedCommitmentOperations,
  initializeCommitments,
  normalizeCommitmentGroup,
  seedCommitments,
  validateCommitmentMutation,
  verifyCommitmentOperations,
};

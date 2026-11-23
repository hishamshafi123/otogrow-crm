const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createFixture } = require('./check-delivery-reconciliation.cjs');
const {
  seedCurrentWorkFixture,
  syntheticCurrentWork,
} = require('./check-otogrow-activity-current-work-support.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryNativeTaskAccessService,
} = require('../dist/modules/delivery/delivery-native-task-access.service');
const {
  DeliveryCommitmentsService,
} = require('../dist/modules/delivery/commitments/delivery-commitments.service');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
const {
  DeliveryCommitmentPeriodEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-period.entity');
const {
  DeliveryCommitmentLineEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-line.entity');
const {
  DeliveryCommitmentAllocationEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-allocation.entity');
const {
  DeliveryCommitmentEventEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-event.entity');

const DATE = '2020-02-21T12:00:00.000Z';
const TABLES = [
  'deliveryCommitmentEvent',
  'deliveryCommitmentAllocation',
  'deliveryCommitmentLine',
  'deliveryCommitmentPeriod',
  'deliveryReviewAssignment',
  'deliveryTask',
  'deliveryOperations',
  'deliveryReminderOutbox',
  'otogrowActivityEvent',
];

async function seed(manager, prefix = 'native_commit') {
  const fixture = await createFixture(manager, prefix);
  await seedCurrentWorkFixture(manager, fixture);
  for (const [roleId, capabilities] of [
    [fixture.roles.reader, ['delivery.manage']],
    [fixture.roles.writer, []],
    [fixture.roles.secondWriter, []],
  ])
    await manager.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [roleId, capabilities],
    );
  const [project] = await manager.query(
    'SELECT * FROM core."deliveryProject" WHERE id=$1',
    [fixture.projects.first],
  );
  fixture.companyId = project.companyId;
  fixture.engagementId = randomUUID();
  fixture.periodId = randomUUID();
  fixture.otherPeriodId = randomUUID();
  fixture.lineIds = {
    unique: randomUUID(),
    variation: randomUUID(),
    other: randomUUID(),
  };
  fixture.tasks = {
    visible: fixture.currentTasks.staleBackup,
    second: fixture.currentTasks.activeBackup,
    child: fixture.currentTasks.selfBackup,
    hidden: fixture.currentTasks.hidden,
    deleted: fixture.currentTasks.deleted,
    moved: fixture.currentTasks.otherProject,
    unknown: fixture.currentTasks.unavailableBackup,
    unallocated: fixture.currentTasks.inProgress,
    missing: randomUUID(),
  };
  fixture.allocations = {};
  fixture.events = {};
  const operations = newDeliveryOperations();
  fixture.engagement = {
    id: fixture.engagementId,
    revision: 1,
    companyId: project.companyId,
    projectId: fixture.projects.first,
    name: 'FIXTURE native commitment',
    services: ['AI video'],
    advertising: null,
    billing: 'RETAINER',
    scope: 'FIXTURE contractual scope',
    allowance: 'FIXTURE separately authorized commercial allowance',
    contact: '',
    fields: [],
    assets: [],
    submissions: [],
  };
  operations.clients = {
    engagements: [fixture.engagement],
    shares: [],
    links: [],
    audit: [],
  };
  for (const [key, taskId] of Object.entries(fixture.tasks)) {
    if (key === 'missing') continue;
    const details = {
      state: 'APPROVED',
      brief: `FIXTURE private ${key} brief`,
      blocker: null,
      service: 'AI video',
      priority: 'NORMAL',
      scheduledDate: null,
      reviewerId: fixture.people.reader.memberId,
      checklist: [],
      evidence: [],
      events: [],
      submissions: [
        {
          version: 1,
          submittedAt: '2020-02-20T09:00:00.000Z',
          submittedBy: fixture.people.writer.memberId,
          description: `FIXTURE private ${key} submission`,
          evidence: [],
          decision: 'APPROVED',
          reviewedAt: '2020-02-20T10:00:00.000Z',
          reviewedBy: fixture.people.reader.memberId,
        },
      ],
    };
    await manager.query(
      'UPDATE core."deliveryTask" SET details=$2,revision=7 WHERE "workspaceId"=$3 AND "taskId"=$1',
      [taskId, details, fixture.workspaceId],
    );
    operations.fulfilments.push({
      taskId,
      status: 'FULFILLED',
      deliveredAt: '2020-02-20T11:00:00.000Z',
      deliveredSubmissionVersion: 1,
      nextCheckAt: null,
      cycle: 1,
      history: [
        {
          at: DATE,
          actorId: fixture.people.reader.memberId,
          action: 'FULFILLED',
          note: `FIXTURE private ${key} fulfilment`,
        },
      ],
    });
  }
  await manager.query(
    'DELETE FROM core."deliveryReviewAssignment" WHERE "workspaceId"=$1 AND "taskId"=$2',
    [fixture.workspaceId, fixture.tasks.unknown],
  );
  await manager.query(
    'DELETE FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
    [fixture.workspaceId, fixture.tasks.unknown],
  );
  for (const [id, state] of [
    [fixture.periodId, 'OPEN'],
    [fixture.otherPeriodId, 'CLOSED'],
  ])
    await manager.getRepository(DeliveryCommitmentPeriodEntity).insert({
      id,
      workspaceId: fixture.workspaceId,
      engagementId: fixture.engagementId,
      projectId: fixture.projects.first,
      clientId: project.companyId,
      label:
        id === fixture.periodId
          ? 'FIXTURE February commitment'
          : 'FIXTURE closed commitment',
      billing: 'RETAINER',
      startDate: id === fixture.periodId ? '2020-02-01' : '2020-01-01',
      endDateExclusive: id === fixture.periodId ? '2020-03-01' : '2020-02-01',
      timezone: 'UTC',
      state,
      revision: 3,
    });
  for (const [key, id] of Object.entries(fixture.lineIds))
    await manager.getRepository(DeliveryCommitmentLineEntity).insert({
      id,
      workspaceId: fixture.workspaceId,
      periodId: fixture.periodId,
      label: `FIXTURE ${key} service line`,
      unit:
        key === 'unique'
          ? 'UNIQUE_VIDEO'
          : key === 'variation'
            ? 'VARIATION'
            : 'OTHER',
      promisedQuantity: 20,
      revision: 2,
      createdAt: new Date(DATE),
      updatedAt: new Date(DATE),
    });
  for (const [key, taskId] of Object.entries(fixture.tasks)) {
    if (key === 'unallocated') continue;
    const id = randomUUID();
    fixture.allocations[key] = id;
    await manager.getRepository(DeliveryCommitmentAllocationEntity).insert({
      id,
      workspaceId: fixture.workspaceId,
      periodId: fixture.periodId,
      lineId:
        key === 'child' ? fixture.lineIds.variation : fixture.lineIds.unique,
      taskId,
      taskName: `RETAINED_PRIVATE_${key.toUpperCase()}_TITLE`,
      parentTaskId: key === 'child' ? fixture.tasks.hidden : null,
      state: ['visible', 'hidden', 'deleted'].includes(key)
        ? 'FULFILLED'
        : 'ASSIGNED',
      revision: 4,
      creditedCycle: ['visible', 'hidden', 'deleted'].includes(key) ? 1 : null,
      creditedSubmissionVersion: ['visible', 'hidden', 'deleted'].includes(key)
        ? 1
        : null,
      fulfilledAt: ['visible', 'hidden', 'deleted'].includes(key)
        ? new Date(DATE)
        : null,
      createdAt: new Date(DATE),
      updatedAt: new Date(DATE),
    });
  }
  for (const [key, taskId, changes] of [
    [
      'taskFree',
      null,
      [{ field: 'label', before: null, after: 'FIXTURE contract label' }],
    ],
    ['visible', fixture.tasks.visible, []],
    ['hidden', fixture.tasks.hidden, []],
    ['deleted', fixture.tasks.deleted, []],
    [
      'parentBefore',
      fixture.tasks.child,
      [
        {
          field: 'parentTaskId',
          before: fixture.tasks.hidden,
          after: fixture.tasks.visible,
        },
      ],
    ],
    [
      'parentAfter',
      fixture.tasks.child,
      [
        {
          field: 'parentTaskId',
          before: fixture.tasks.visible,
          after: fixture.tasks.hidden,
        },
      ],
    ],
  ]) {
    const id = randomUUID();
    fixture.events[key] = id;
    await manager.getRepository(DeliveryCommitmentEventEntity).insert({
      id,
      workspaceId: fixture.workspaceId,
      periodId: fixture.periodId,
      actorId: fixture.people.reader.memberId,
      actorType: 'HUMAN',
      actorName: 'FIXTURE manager',
      action: taskId ? 'COMMITMENT_TASK_ASSIGNED' : 'COMMITMENT_LINE_UPDATED',
      taskId,
      taskName: taskId ? `EVENT_PRIVATE_${key.toUpperCase()}_TITLE` : null,
      reason: `EVENT_PRIVATE_${key.toUpperCase()}_REASON`,
      changes,
      createdAt: new Date(DATE),
    });
  }
  await manager
    .getRepository(DeliveryOperationsEntity)
    .insert({ workspaceId: fixture.workspaceId, state: operations });
  return fixture;
}

function services(source, fixture, sharedMetadata) {
  const access = new OtogrowAccessService(source, {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) =>
      workspaceId === fixture.workspaceId &&
      userWorkspaceId === fixture.people.admin.userWorkspaceId,
  });
  const native = syntheticCurrentWork(access, fixture, sharedMetadata);
  const adapter = new DeliveryNativeTaskAccessService(
    native.workspaceOrm,
    native.cache,
  );
  const delivery = new DeliveryService(source, access, adapter);
  const commitments = new DeliveryCommitmentsService(source, delivery, adapter);
  return {
    access,
    native,
    metadata: native.native,
    adapter,
    delivery,
    commitments,
  };
}

function harness(source, fixture, built = services(source, fixture)) {
  const { commitments, metadata } = built;
  const person = fixture.people.reader;
  const call = (method, input, actor = person, workspace = fixture.workspace) =>
    commitments[method](
      workspace,
      actor.memberId,
      actor.userWorkspaceId,
      input,
    );
  const read = (input = {}, actor = person) =>
    call(
      'snapshot',
      {
        engagementId: fixture.engagementId,
        periodId: fixture.periodId,
        ...input,
      },
      actor,
    );
  const cleanupInput = (key = 'deleted', changes = {}) => ({
    requestId: randomUUID(),
    engagementId: fixture.engagementId,
    periodId: fixture.periodId,
    periodRevision: 3,
    allocationId: fixture.allocations[key],
    allocationRevision: 4,
    confirm: true,
    ...changes,
  });
  const assignInput = (key = 'unallocated', changes = {}) => ({
    engagementId: fixture.engagementId,
    periodId: fixture.periodId,
    periodRevision: 3,
    lineId: fixture.lineIds.unique,
    lineRevision: 2,
    taskId: fixture.tasks[key],
    taskRevision: 7,
    revision: fixture.allocations[key] ? 4 : 0,
    parentTaskId: null,
    reason: 'FIXTURE explicit current allocation',
    ...changes,
  });
  const removeInput = (key = 'second', changes = {}) => ({
    engagementId: fixture.engagementId,
    periodId: fixture.periodId,
    taskId: fixture.tasks[key],
    revision: 4,
    reason: 'FIXTURE ordinary current removal',
    ...changes,
  });
  const permission = () =>
    metadata.data.rolesPermissions[fixture.nativeRoleId][
      metadata.taskObject.id
    ];
  const allocation = (key) =>
    source.getRepository(DeliveryCommitmentAllocationEntity).findOneByOrFail({
      workspaceId: fixture.workspaceId,
      id: fixture.allocations[key],
    });
  return {
    ...built,
    call,
    read,
    cleanupInput,
    assignInput,
    removeInput,
    permission,
    allocation,
  };
}

async function mutationDigest(manager, fixture) {
  const rows = [];
  for (const table of TABLES) {
    const [result] = await manager.query(
      `SELECT count(*)::text AS count,md5(COALESCE(string_agg(md5(to_jsonb(record)::text),'' ORDER BY md5(to_jsonb(record)::text)),'')) AS hash FROM core."${table}" record WHERE "workspaceId"=ANY($1::uuid[])`,
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    rows.push({ table, ...result });
  }
  const [native] = await manager.query(
    `SELECT count(*)::text AS count,md5(COALESCE(string_agg(md5(to_jsonb(record)::text),'' ORDER BY id),'')) AS hash FROM "${fixture.schemaName}".task record`,
  );
  return JSON.stringify([...rows, native]);
}

function noPrivateProjection(
  value,
  fixture,
  keys = ['hidden', 'deleted', 'moved', 'unknown', 'missing'],
) {
  const text = JSON.stringify(value);
  for (const key of keys) {
    assert(
      !text.includes(fixture.tasks[key]),
      `Private ${key} native ID escaped.`,
    );
    assert(!text.includes(`RETAINED_PRIVATE_${key.toUpperCase()}_TITLE`));
    assert(!text.includes(`EVENT_PRIVATE_${key.toUpperCase()}_TITLE`));
    assert(!text.includes(`EVENT_PRIVATE_${key.toUpperCase()}_REASON`));
  }
  assert(!text.includes('EVENT_PRIVATE_PARENTBEFORE_REASON'));
  assert(!text.includes('EVENT_PRIVATE_PARENTAFTER_REASON'));
}

module.exports = {
  DATE,
  TABLES,
  seed,
  services,
  harness,
  mutationDigest,
  noPrivateProjection,
};

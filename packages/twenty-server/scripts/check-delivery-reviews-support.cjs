const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const creativeSupport = require('./check-delivery-creative-review-support.cjs');
const NOW = new Date('2026-10-29T08:00:00.000Z');
const TABLES = ['deliveryReviewAssignmentEvent', 'deliveryReviewAssignment'];
const {
  copy,
  hash,
  sourceFingerprint: creativeFingerprint,
  alterDetails,
  denied,
} = creativeSupport;
async function createReviewsFixture(manager, race = false) {
  const fixture = await creativeSupport.createReviewFixture(
    manager,
    race ? 'creative_review_race' : 'creative_review_rollback',
  );
  for (const name of ['reader', 'secondWriter', 'writer'])
    await manager.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles[name], ['delivery.review']],
    );
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
    [
      fixture.projects.first,
      JSON.stringify([
        fixture.people.writer.memberId,
        fixture.people.reader.memberId,
        fixture.people.secondWriter.memberId,
      ]),
    ],
  );
  const workflow = {
    templateId: randomUUID(),
    version: 1,
    revision: 1,
    definition: {
      name: 'Synthetic pinned quality checks',
      description: 'Local acceptance only',
      service: 'STATIC_AD',
      definitionOfDone: 'Review the exact submitted output.',
      checklist: [],
      evidence: [],
      reviewChecks: [
        {
          id: 'quality',
          label: 'Verify the exact submitted creative quality',
          required: true,
        },
      ],
    },
    checkedIds: [],
    evidence: [],
    appliedAt: NOW.toISOString(),
    appliedBy: fixture.people.writer.memberId,
    appliedByName: 'Synthetic editor',
  };
  const [sourceTask] = await manager.query(
    'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
    [fixture.workspaceId, fixture.taskId],
  );
  sourceTask.details.workflow = copy(workflow);
  sourceTask.details.submissions[1].workflow = copy(workflow);
  await manager.query(
    'UPDATE core."deliveryTask" SET details=$3 WHERE "workspaceId"=$1 AND "taskId"=$2',
    [fixture.workspaceId, fixture.taskId, sourceTask.details],
  );
  fixture.queueTasks = [];
  for (let index = 0; index < 53; index++) {
    const taskId = randomUUID(),
      submittedAt =
        index < 50
          ? new Date(NOW.getTime() - (index + 1) * 3600000).toISOString()
          : index === 50
            ? null
            : index === 51
              ? 'unknown submitted date'
              : new Date(NOW.getTime() + 3600000).toISOString();
    const details = {
      brief: `${fixture.sentinel} generic submitted evidence`,
      service: 'Synthetic SEO delivery',
      priority: 'NORMAL',
      scheduledDate: null,
      reviewerId: fixture.people.admin.memberId,
      state: 'IN_REVIEW',
      blocker: '',
      checklist: [],
      evidence: [],
      events: [],
      submissions: [
        {
          version: 1,
          description: 'Synthetic noncreative submission',
          evidence: [],
          submittedBy: fixture.people.writer.memberId,
          submittedAt,
        },
      ],
    };
    await manager.query(
      `INSERT INTO "${fixture.schemaName}".task(id,title,"assigneeId",status) VALUES($1,$2,$3,'IN_PROGRESS')`,
      [
        taskId,
        `Synthetic review queue ${String(index).padStart(2, '0')}`,
        fixture.people.writer.memberId,
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,1)',
      [fixture.workspaceId, taskId, fixture.projects.first, details],
    );
    fixture.queueTasks.push({ taskId, index, submittedAt });
  }
  return fixture;
}
function buildReviewsServices(source, fixture) {
  const services = creativeSupport.buildReviewServices(source, fixture);
  const {
    DeliveryReviewsService,
  } = require('../dist/modules/delivery/reviews/delivery-reviews.service');
  const {
    DeliveryOperationsService,
  } = require('../dist/modules/delivery/operations/delivery-operations.service');
  const telegram = {
    findByWorkspaceId: async () => null,
    decryptBotToken: () => {
      throw new Error(
        'No real Telegram credential may be loaded by review acceptance.',
      );
    },
  };
  const operations = new DeliveryOperationsService(
    source,
    services.delivery,
    services.creative,
    telegram,
    { get: () => 'http://localhost:3001' },
    { add: async () => undefined },
  );
  return {
    ...services,
    operations,
    reviews: new DeliveryReviewsService(
      source,
      services.delivery,
      services.access,
      createIsolatedNativeTaskAccess(),
    ),
  };
}
function reviewsHarness(services, fixture) {
  const call = (
    method,
    input,
    person = fixture.people.admin,
    workspace = fixture.workspace,
  ) =>
    services.reviews[method](
      workspace,
      person.memberId,
      person.userWorkspaceId,
      input,
      NOW,
    );
  return {
    creative: creativeSupport.reviewHarness(services, fixture),
    queue: (fields = {}, person, workspace) =>
      call(
        'queue',
        { projectId: fixture.projects.first, ...fields },
        person,
        workspace,
      ),
    task: (fields = {}, person, workspace) =>
      call('task', { taskId: fixture.taskId, ...fields }, person, workspace),
    assign: (snapshot, fields = {}, person, workspace) =>
      call(
        'assign',
        {
          commandId: randomUUID(),
          taskId: snapshot.taskId,
          taskRevision: snapshot.taskRevision,
          submissionVersion: snapshot.assignment.submissionVersion,
          assignmentRevision: snapshot.assignment.revision,
          mode: 'BACKUP',
          reviewerId: fixture.people.reader.memberId,
          reason: 'Synthetic bounded independent backup coverage',
          ...fields,
        },
        person,
        workspace,
      ),
    history: (fields = {}, person, workspace) =>
      call(
        'history',
        { taskId: fixture.taskId, submissionVersion: 2, ...fields },
        person,
        workspace,
      ),
    seen: (
      snapshot,
      fields = {},
      person = fixture.people.admin,
      workspace = fixture.workspace,
    ) =>
      call(
        'seen',
        {
          taskId: snapshot.taskId,
          taskRevision: snapshot.taskRevision,
          submissionVersion: snapshot.assignment.submissionVersion,
          assignmentRevision: snapshot.assignment.revision,
          noticeId: snapshot.assignmentNotice.id,
          ...fields,
        },
        person,
        workspace,
      ),
    decide: (snapshot, fields = {}, person = fixture.people.admin) =>
      services.delivery.command(
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        {
          action: 'review',
          taskId: snapshot.taskId,
          revision: snapshot.taskRevision,
          decision: 'APPROVED',
          feedback: 'Synthetic explicit independent approval',
          selectedSubmissionVersion: snapshot.assignment.submissionVersion,
          creativeVersion: 2,
          finalAssetId: fixture.assets.image,
          reviewAssignmentRevision: snapshot.assignment.revision,
          workflowReview: { checkedIds: ['quality'] },
          ...fields,
        },
      ),
  };
}
async function sourceFingerprint(manager, fixture) {
  const result = await creativeFingerprint(manager, fixture);
  const operations = await manager.query(
    'SELECT * FROM core."deliveryOperations" WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  const taskIds = new Set([
    fixture.taskId,
    fixture.otherTaskId,
    fixture.foreignTaskId,
    ...fixture.queueTasks.map((item) => item.taskId),
  ]);
  for (const row of operations) {
    row.state.notices = row.state.notices.filter((notice) => {
      if (notice.kind !== 'REVIEW_ASSIGNMENT') return true;
      assert(
        taskIds.has(notice.taskId),
        'Only the isolated fixture review notices are normalized.',
      );
      assert.equal(notice.reviewAssignment.recipientId, notice.recipientId);
      assert(
        Object.values(fixture.people).some(
          (person) => person.memberId === notice.recipientId,
        ),
      );
      return false;
    });
    // Notice persistence updates this mechanical timestamp; all remaining Operations state is protected.
    delete row.updatedAt;
  }
  result.operations = hash(operations);
  result.revisions = hash(
    await manager.query(
      'SELECT to_jsonb(record)::text AS value FROM core."deliveryRevision" record WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    ),
  );
  return result;
}
async function cleanupReviewsFixture(manager, fixture) {
  const workspaces = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  assert.equal(workspaces.length, 2);
  for (const workspace of workspaces) {
    assert.equal(workspace.displayName, fixture.sentinel);
    assert.equal(workspace.databaseSchema, fixture.schemaName);
  }
  await manager.query(
    'DELETE FROM core."deliveryReminderOutbox" WHERE "workspaceId"=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  for (const table of TABLES)
    await manager.query(
      `DELETE FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
  const tasks = await manager.query(
    'SELECT "taskId",details FROM core."deliveryTask" WHERE "workspaceId"=$1',
    [fixture.workspaceId],
  );
  const owned = new Set([
    fixture.taskId,
    fixture.otherTaskId,
    ...fixture.queueTasks.map((row) => row.taskId),
  ]);
  assert.equal(tasks.length, owned.size);
  for (const row of tasks)
    assert(owned.has(row.taskId), 'Refusing to delete a foreign source task.');
  await manager.query(
    'DELETE FROM core."deliveryRevision" WHERE "workspaceId"=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  await manager.query(
    'DELETE FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=ANY($2::uuid[])',
    [fixture.workspaceId, fixture.queueTasks.map((row) => row.taskId)],
  );
  await creativeSupport.cleanupReviewFixture(manager, fixture);
}
module.exports = {
  NOW,
  TABLES,
  copy,
  hash,
  alterDetails,
  denied,
  createReviewsFixture,
  buildReviewsServices,
  reviewsHarness,
  reviewNotices: async (manager, fixture) => {
    const [row] = await manager.query(
      'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    return row.state.notices.filter(
      (notice) => notice.kind === 'REVIEW_ASSIGNMENT',
    );
  },
  sourceFingerprint,
  cleanupReviewsFixture,
  correction: creativeSupport.correction,
  SOURCE_TABLES: creativeSupport.SOURCE_TABLES,
  REVIEW_TABLES: creativeSupport.REVIEW_TABLES,
};

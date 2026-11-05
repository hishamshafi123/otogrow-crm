const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  createFixture,
  cleanupFixture,
  buildServices,
} = require('./check-delivery-reconciliation.cjs');
const {
  SOURCE_TABLES,
} = require('./check-delivery-founder-escalation-support.cjs');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');

const REVIEW_TABLES = [
  'deliveryCreativeFeedbackEvent',
  'deliveryCreativeFeedback',
];
const CREATED_AT = '2026-10-29T00:00:00.123Z';
const copy = (value) => JSON.parse(JSON.stringify(value));
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function reviewDetails(fixture) {
  const document = newCreativeDocument();
  document.version = 2;
  document.briefVersion = 2;
  document.approvedBriefVersion = 2;
  document.productionVersion = 2;
  document.assemblyVersion = 2;
  document.brief = {
    ...document.brief,
    outputKind: 'IMAGE',
    concept: 'Synthetic still image correction',
    duration: 2,
  };
  document.briefHistory = [
    {
      version: 1,
      brief: { ...document.brief, outputKind: 'VIDEO' },
      approved: true,
    },
  ];
  const asset = (id, name, mimeType, kind, version, extra = {}) => ({
    id,
    name,
    mimeType,
    kind,
    size: 1024,
    storageState: 'READY',
    createdAt: CREATED_AT,
    uploadedBy: fixture.people.writer.memberId,
    briefVersion: version,
    productionVersion: version,
    assemblyVersion: version,
    shotId: null,
    shotVersion: null,
    parentAssetId: null,
    reviews: [],
    ...extra,
  });
  document.assets = [
    asset(
      fixture.assets.video,
      'Synthetic submitted video v1',
      'video/mp4',
      'FINAL',
      1,
    ),
    asset(
      fixture.assets.image,
      'Synthetic submitted image v2',
      'image/png',
      'FINAL',
      2,
    ),
    asset(
      fixture.assets.intermediate,
      'Synthetic intermediate still',
      'image/png',
      'IMAGE',
      2,
    ),
    asset(
      fixture.assets.audio,
      'Synthetic intermediate tone',
      'audio/wav',
      'AUDIO',
      1,
    ),
    asset(
      fixture.assets.unsupported,
      'Synthetic unsupported download',
      'application/pdf',
      'REFERENCE',
      2,
    ),
    asset(
      fixture.assets.failed,
      'Synthetic unavailable still',
      'image/png',
      'IMAGE',
      2,
      { storageState: 'FAILED' },
    ),
  ];
  document.finalAssetId = fixture.assets.image;
  return {
    brief: 'PRIVATE_REVIEW_BRIEF',
    service: 'AI video and static ad',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: fixture.people.admin.memberId,
    state: 'IN_REVIEW',
    blocker: '',
    checklist: [],
    evidence: [],
    events: [],
    creative: document,
    submissions: [
      {
        version: 1,
        creativeVersion: 1,
        finalAssetId: fixture.assets.video,
        description: 'Synthetic video v1',
        evidence: [],
        submittedBy: fixture.people.writer.memberId,
        submittedAt: CREATED_AT,
        decision: 'CHANGES_REQUESTED',
        reviewedBy: fixture.people.admin.memberId,
        reviewedAt: '2026-10-29T00:01:00.123Z',
        feedback: 'Synthetic revision required',
      },
      {
        version: 2,
        creativeVersion: 2,
        finalAssetId: fixture.assets.image,
        description: 'Synthetic image v2',
        evidence: [],
        submittedBy: fixture.people.writer.memberId,
        submittedAt: '2026-10-29T00:02:00.123Z',
      },
    ],
  };
}
async function createReviewFixture(
  manager,
  prefix = 'creative_review_rollback',
) {
  const fixture = await createFixture(manager, prefix);
  await manager.query(
    `COMMENT ON SCHEMA "${fixture.schemaName}" IS '${fixture.sentinel}'`,
  );
  await manager.query(`CREATE TABLE "${fixture.schemaName}".task (id uuid PRIMARY KEY,title text NOT NULL,
    "assigneeId" uuid,"dueAt" timestamptz,"createdAt" timestamptz DEFAULT now(),
    "updatedAt" timestamptz DEFAULT now(),status text,"deletedAt" timestamptz)`);
  fixture.taskId = randomUUID();
  fixture.otherTaskId = randomUUID();
  fixture.foreignTaskId = randomUUID();
  fixture.assets = Object.fromEntries(
    ['video', 'image', 'intermediate', 'audio', 'unsupported', 'failed'].map(
      (kind) => [kind, randomUUID()],
    ),
  );
  fixture.otherAssetId = randomUUID();
  fixture.foreignAssetId = randomUUID();
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE "workspaceId"=$1 AND id=$3',
    [
      fixture.workspaceId,
      JSON.stringify([
        fixture.people.writer.memberId,
        fixture.people.reader.memberId,
      ]),
      fixture.projects.first,
    ],
  );
  for (const [taskId, projectId, workspaceId] of [
    [fixture.taskId, fixture.projects.first, fixture.workspaceId],
    [fixture.otherTaskId, fixture.projects.otherClient, fixture.workspaceId],
    [
      fixture.foreignTaskId,
      fixture.projects.foreign,
      fixture.foreignWorkspaceId,
    ],
  ]) {
    await manager.query(
      `INSERT INTO "${fixture.schemaName}".task(id,title,"assigneeId",status) VALUES($1,$2,$3,'IN_PROGRESS')`,
      [
        taskId,
        'Synthetic creative review target',
        fixture.people.writer.memberId,
      ],
    );
    const details = reviewDetails(fixture);
    if (taskId !== fixture.taskId) {
      const assetId =
        taskId === fixture.otherTaskId
          ? fixture.otherAssetId
          : fixture.foreignAssetId;
      details.creative.assets = [
        { ...details.creative.assets[1], id: assetId },
      ];
      details.creative.finalAssetId = assetId;
      details.submissions = [
        { ...details.submissions[1], finalAssetId: assetId },
      ];
    }
    await manager.query(
      'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,1)',
      [workspaceId, taskId, projectId, details],
    );
  }
  const operations = newDeliveryOperations();
  operations.business = { records: [], inbox: [], seen: {} };
  operations.clients = { engagements: [], shares: [], links: [], audit: [] };
  await manager.query(
    'INSERT INTO core."deliveryOperations" ("workspaceId",state) VALUES($1,$2)',
    [fixture.workspaceId, operations],
  );
  return fixture;
}
function buildReviewServices(source, fixture) {
  const {
    DeliveryCreativeService,
  } = require('../dist/modules/delivery/creative/delivery-creative.service');
  const {
    DeliveryCreativeReviewService,
  } = require('../dist/modules/delivery/creative/review/delivery-creative-review.service');
  const services = buildServices(source, fixture);
  const creative = new DeliveryCreativeService(
    source,
    services.delivery,
    {
      getCurrentDriver: () => {
        throw new Error(
          'Review annotation checks must not load media or contact a provider.',
        );
      },
    },
    createIsolatedNativeTaskAccess(),
  );
  const review = new DeliveryCreativeReviewService(
    source,
    creative,
    services.access,
  );
  return { ...services, creative, review };
}
function reviewHarness(services, fixture) {
  const call = (
    method,
    input,
    person = fixture.people.admin,
    workspace = fixture.workspace,
  ) =>
    services.review[method](
      workspace,
      person.memberId,
      person.userWorkspaceId,
      input,
    );
  const selection = (fields = {}) => ({
    taskId: fixture.taskId,
    targetKind: 'SUBMISSION',
    submissionVersion: 2,
    ...fields,
  });
  return {
    read: (fields = {}, person, workspace) =>
      call('snapshot', selection(fields), person, workspace),
    history: (feedbackId, fields = {}, person, workspace) =>
      call(
        'history',
        { taskId: fixture.taskId, feedbackId, ...fields },
        person,
        workspace,
      ),
    create: (target, fields = {}, person, workspace) =>
      call(
        'create',
        {
          commandId: randomUUID(),
          taskId: fixture.taskId,
          targetKind: target.targetKind,
          submissionVersion: target.submissionVersion,
          assetId: target.assetId,
          targetToken: target.targetToken,
          body: 'Synthetic exact-version feedback',
          anchorKind: 'GENERAL',
          startMs: null,
          endMs: null,
          ...fields,
        },
        person,
        workspace,
      ),
    change: (feedback, action, fields = {}, person, workspace) =>
      call(
        'change',
        {
          commandId: randomUUID(),
          taskId: fixture.taskId,
          feedbackId: feedback.id,
          revision: feedback.revision,
          action,
          body: 'Synthetic review explanation',
          evidenceTargetKind: null,
          evidenceSubmissionVersion: null,
          evidenceAssetId: null,
          evidenceTargetToken: null,
          ...fields,
        },
        person,
        workspace,
      ),
  };
}
const correction = (target) => ({
  evidenceTargetKind: target.targetKind,
  evidenceSubmissionVersion: target.submissionVersion,
  evidenceAssetId: target.assetId,
  evidenceTargetToken: target.targetToken,
});
async function sourceFingerprint(manager, fixture) {
  const result = {};
  for (const table of SOURCE_TABLES)
    result[table] = hash(
      await manager.query(
        `SELECT to_jsonb(record)::text AS value FROM core."${table}" record
      WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id`,
        [[fixture.workspaceId, fixture.foreignWorkspaceId]],
      ),
    );
  result.nativeTasks = hash(
    await manager.query(
      `SELECT to_jsonb(record)::text AS value FROM "${fixture.schemaName}".task record ORDER BY id`,
    ),
  );
  result.operations = hash(
    await manager.query(
      'SELECT to_jsonb(record)::text AS value FROM core."deliveryOperations" record WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    ),
  );
  return result;
}
async function alterDetails(manager, fixture, change) {
  const [row] = await manager.query(
    'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
    [fixture.workspaceId, fixture.taskId],
  );
  assert(row);
  const details = copy(row.details);
  change(details);
  await manager.query(
    'UPDATE core."deliveryTask" SET details=$3,revision=revision+1,"updatedAt"=now() WHERE "workspaceId"=$1 AND "taskId"=$2',
    [fixture.workspaceId, fixture.taskId, details],
  );
}
async function cleanupReviewFixture(manager, fixture) {
  assert.match(
    fixture.schemaName,
    /^creative_review_(rollback|race)_[a-f0-9_]{36}$/,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  const rows = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.displayName, fixture.sentinel);
    assert.equal(row.databaseSchema, fixture.schemaName);
  }
  for (const table of REVIEW_TABLES)
    await manager.query(
      `DELETE FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
  await manager.query(
    'DELETE FROM core."deliveryTask" WHERE "workspaceId"=ANY($1::uuid[]) AND "taskId"=ANY($2::uuid[])',
    [
      [fixture.workspaceId, fixture.foreignWorkspaceId],
      [fixture.taskId, fixture.otherTaskId, fixture.foreignTaskId],
    ],
  );
  await cleanupFixture(manager, fixture);
}
const denied = (operation, statuses = [403, 404]) =>
  assert.rejects(operation, (error) => statuses.includes(error.getStatus?.()));
module.exports = {
  REVIEW_TABLES,
  SOURCE_TABLES,
  CREATED_AT,
  copy,
  hash,
  reviewDetails,
  createReviewFixture,
  buildReviewServices,
  reviewHarness,
  correction,
  sourceFingerprint,
  alterDetails,
  cleanupReviewFixture,
  denied,
};

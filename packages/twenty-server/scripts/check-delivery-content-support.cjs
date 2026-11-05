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
  DeliveryContentSourceService,
} = require('../dist/modules/delivery/content/delivery-content-source.service');
const {
  DeliveryContentReadsService,
} = require('../dist/modules/delivery/content/delivery-content-reads.service');
const {
  DeliveryContentService,
} = require('../dist/modules/delivery/content/delivery-content.service');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');
const {
  newDeliveryClients,
} = require('../dist/modules/delivery/clients/delivery-clients.types');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');
const {
  freezeCreativeSubmissionLearning,
} = require('../dist/modules/delivery/creative/learning/freeze-creative-submission-learning');

const CONTENT_TABLES = [
  'deliveryContentEvent',
  'deliveryContentVersion',
  'deliveryContentVariant',
  'deliveryContentPlan',
  'deliveryContentAccount',
];
const WHEN = '2026-11-04T03:00:00.000Z';
const quote = (value) => {
  if (!/^[A-Za-z0-9_]+$/.test(value))
    throw new Error('Unsafe fixture identifier.');
  return `"${value}"`;
};
function services(dataSource, fixture) {
  const access = new OtogrowAccessService(dataSource, {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) =>
      workspaceId === fixture.workspaceId &&
      userWorkspaceId === fixture.people.admin.userWorkspaceId,
  });
  const native = syntheticCurrentWork(access, fixture);
  const source = new DeliveryContentSourceService(
    dataSource,
    access,
    native.workspaceOrm,
    native.cache,
  );
  const reads = new DeliveryContentReadsService(source);
  const content = new DeliveryContentService(source, reads);
  const call = (method, input, person = fixture.people.admin, manager) =>
    content[method](
      fixture.workspace,
      person.memberId,
      person.userWorkspaceId,
      input,
      manager,
    );
  return { access, native, source, reads, content, call };
}
function creativeDetails(fixture, key, anchor, mimeType = 'image/png') {
  const creative = newCreativeDocument();
  creative.brief.objective = 'ORGANIC';
  creative.brief.outputKind = mimeType.startsWith('image/') ? 'IMAGE' : 'VIDEO';
  creative.brief.concept = `FIXTURE ${key} independently approved content source.`;
  creative.approvedBriefVersion = creative.briefVersion;
  const assetId = fixture.assets[key];
  creative.finalAssetId = assetId;
  creative.assets = [
    {
      id: assetId,
      name: `FIXTURE ${key} final creative`,
      kind: 'FINAL',
      mimeType,
      size: 1024,
      createdAt: WHEN,
      uploadedBy: fixture.people.writer.memberId,
      briefVersion: creative.briefVersion,
      productionVersion: creative.productionVersion,
      assemblyVersion: creative.assemblyVersion,
      shotId: null,
      shotVersion: null,
      parentAssetId: null,
      storageState: 'READY',
      reviews: [
        {
          memberId: fixture.people.reader.memberId,
          at: WHEN,
          decision: 'APPROVED',
          notes: 'FIXTURE native media approval.',
        },
      ],
    },
  ];
  return {
    brief: `FIXTURE ${key} source`,
    service: 'AI video',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: fixture.people.reader.memberId,
    state: 'APPROVED',
    blocker: '',
    checklist: [],
    evidence: [],
    events: [],
    creative,
    submissions: [
      {
        version: 1,
        creativeVersion: creative.version,
        finalAssetId: assetId,
        description: `FIXTURE approved ${key} submission`,
        evidence: [],
        submittedBy: fixture.people.writer.memberId,
        submittedAt: WHEN,
        decision: 'APPROVED',
        reviewedBy: fixture.people.reader.memberId,
        reviewedAt: WHEN,
        feedback: 'FIXTURE independently approved source.',
        creativeLearning: freezeCreativeSubmissionLearning(
          creative,
          'FIXTURE approved native copy.',
          anchor,
        ),
      },
    ],
  };
}
async function seedContentFixture(manager, prefix = 'content_proof') {
  const fixture = await createFixture(manager, prefix);
  fixture.prefix = prefix;
  await manager.query(
    `COMMENT ON SCHEMA ${quote(fixture.schemaName)} IS '${fixture.sentinel}'`,
  );
  await seedCurrentWorkFixture(manager, fixture);
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
    [fixture.roles.writer, []],
  );
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
    [fixture.roles.reader, ['delivery.review']],
  );
  const projects = await manager.query(
    'SELECT id,revision,"companyId" FROM core."deliveryProject" WHERE "workspaceId"=$1',
    [fixture.workspaceId],
  );
  fixture.projectAnchors = Object.fromEntries(
    projects.map((project) => [project.id, project]),
  );
  fixture.taskId = fixture.currentTasks.approved;
  fixture.assets = Object.fromEntries(
    ['approved', 'hidden', 'otherProject', 'video'].map((key) => [
      key,
      randomUUID(),
    ]),
  );
  fixture.sourceTasks = {
    approved: fixture.currentTasks.approved,
    hidden: fixture.currentTasks.hidden,
    otherProject: fixture.currentTasks.otherProject,
    video: fixture.currentTasks.inProgress,
  };
  for (const [key, taskId] of Object.entries(fixture.sourceTasks)) {
    const projectId =
      key === 'otherProject'
        ? fixture.projects.otherClient
        : fixture.projects.first;
    const anchor = fixture.projectAnchors[projectId];
    await manager.query(
      'UPDATE core."deliveryTask" SET details=$3 WHERE "workspaceId"=$1 AND "taskId"=$2',
      [
        fixture.workspaceId,
        taskId,
        JSON.stringify(
          creativeDetails(
            fixture,
            key,
            { id: projectId, companyId: anchor.companyId },
            key === 'video' ? 'video/mp4' : 'image/png',
          ),
        ),
      ],
    );
  }
  fixture.engagementId = randomUUID();
  const operations = newDeliveryOperations();
  operations.clients = newDeliveryClients();
  operations.clients.engagements = [
    {
      id: fixture.engagementId,
      revision: 1,
      projectId: fixture.projects.first,
      companyId: fixture.projectAnchors[fixture.projects.first].companyId,
      name: 'FIXTURE content retainer',
      services: ['Social media'],
      advertising: null,
      billing: 'RETAINER',
      scope: 'FIXTURE social planning and manual publication evidence.',
      allowance: '',
      contact: '',
      fields: [],
      assets: [],
      submissions: [],
    },
  ];
  fixture.legacyContentId = randomUUID();
  operations.business = {
    records: [
      {
        id: fixture.legacyContentId,
        kind: 'CONTENT',
        revision: 1,
        projectId: fixture.projects.first,
        title: 'FIXTURE earlier manual content retained unchanged',
        channel: 'X',
        account: '@fixture_legacy',
        ownerId: fixture.people.writer.memberId,
        scheduledDate: '2026-11-04',
        copy: 'FIXTURE legacy copy',
        assetUrl: null,
        notes: 'FIXTURE existing manual record',
        createdBy: fixture.people.admin.memberId,
        createdAt: WHEN,
        updatedAt: WHEN,
        status: 'DRAFT',
        decisionBy: null,
        evidence: null,
        taskId: null,
        history: [],
      },
    ],
    inbox: [],
    seen: {},
  };
  await manager.query(
    'INSERT INTO core."deliveryOperations"("workspaceId",state) VALUES($1,$2)',
    [fixture.workspaceId, operations],
  );
  return fixture;
}
const accountInput = (fixture, platform = 'INSTAGRAM', overrides = {}) => {
  const anchor = fixture.projectAnchors[fixture.projects.first];
  const handle = `otogrow${fixture.workspaceId.slice(0, 6)}`;
  const host = {
    X: 'x.com',
    INSTAGRAM: 'www.instagram.com',
    FACEBOOK: 'www.facebook.com',
    TIKTOK: 'www.tiktok.com',
  }[platform];
  return {
    id: randomUUID(),
    requestId: randomUUID(),
    revision: 0,
    projectId: anchor.id,
    projectRevision: anchor.revision,
    expectedCompanyId: anchor.companyId,
    platform,
    name: `FIXTURE ${platform} account`,
    handle: `@${handle}`,
    profileUrl: `https://${host}/${platform === 'TIKTOK' ? '@' : ''}${handle}`,
    archived: false,
    ...overrides,
  };
};
const planInput = (fixture, overrides = {}) => {
  const anchor = fixture.projectAnchors[fixture.projects.first];
  return {
    id: randomUUID(),
    requestId: randomUUID(),
    revision: 0,
    projectId: anchor.id,
    projectRevision: anchor.revision,
    expectedCompanyId: anchor.companyId,
    title: 'FIXTURE multi-platform content plan',
    purpose:
      'FIXTURE improve the brand presentation with independently reviewed posts.',
    engagementId: fixture.engagementId,
    service: 'Social media',
    ...overrides,
  };
};
const packageBody = (fixture, account, overrides = {}) => ({
  accountId: account.id,
  accountRevision: account.revision,
  ownerId: fixture.people.writer.memberId,
  reviewerId: fixture.people.reader.memberId,
  format: 'IMAGE',
  caption: 'FIXTURE brand post caption and call to action.',
  plannedAt: '2026-11-20T03:00:00.000Z',
  timezone: 'Asia/Qatar',
  plannedLocal: '2026-11-20T06:00',
  asset: {
    taskId: fixture.taskId,
    submissionVersion: 1,
    assetId: fixture.assets.approved,
  },
  notes: 'FIXTURE manual publication; no connected scheduling.',
  ...overrides,
});
module.exports = {
  CONTENT_TABLES,
  WHEN,
  quote,
  services,
  seedContentFixture,
  creativeDetails,
  accountInput,
  planInput,
  packageBody,
};

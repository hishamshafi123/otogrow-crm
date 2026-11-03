const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  createReviewFixture,
  copy,
  hash,
  denied,
} = require('./check-delivery-creative-review-support.cjs');
const { buildServices } = require('./check-delivery-reconciliation.cjs');
const {
  DeliveryMetaService,
} = require('../dist/modules/delivery/advertising/delivery-meta.service');
const {
  insertMetaReport,
} = require('../dist/modules/delivery/advertising/delivery-meta-report-store');
const {
  DeliveryAdvertisingSourcesService,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-sources.service');
const {
  DeliveryAdvertisingWorkbenchService,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.service');

const TABLES = [
  'deliveryAdvertisingObservation',
  'deliveryAdvertisingEvent',
  'deliveryAdvertisingAction',
  'deliveryAdvertisingReview',
];
const PRIVATE_REPORT = 'PRIVATE_ADVERTISING_ACCOUNT_EVIDENCE';
const DATE = '2020-02-20';
const NOW = '2020-02-21T09:00:00.123456Z';
const forbiddenProvider = new Proxy(
  {},
  {
    get: () => () => {
      throw new Error('Advertising acceptance forbids provider calls.');
    },
  },
);

async function seedAdvertisingFixture(manager) {
  const fixture = await createReviewFixture(manager);
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
    [fixture.roles.reader, ['delivery.manage']],
  );
  for (const name of ['writer', 'secondWriter'])
    await manager.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles[name], []],
    );
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE "workspaceId"=$1 AND id=$3',
    [
      fixture.workspaceId,
      JSON.stringify([
        fixture.people.writer.memberId,
        fixture.people.secondWriter.memberId,
      ]),
      fixture.projects.first,
    ],
  );
  fixture.metaReports = [];
  for (let index = 0; index < 55; index++) {
    const report = metaReport(fixture, { note: `${PRIVATE_REPORT} ${index}` });
    fixture.metaReports.push(report);
    await insertMetaReport(manager, fixture.workspaceId, report);
  }
  fixture.laterReport = metaReport(fixture, {
    date: '2020-02-22',
    account: insight({
      date_start: '2020-02-22',
      date_stop: '2020-02-22',
      spend: '50',
      actions: [
        { action_type: 'lead', value: '10' },
        { action_type: 'purchase', value: '10' },
      ],
    }),
  });
  await insertMetaReport(manager, fixture.workspaceId, fixture.laterReport);
  fixture.foreignReport = metaReport(fixture, {
    projectId: fixture.projects.foreign,
  });
  await insertMetaReport(
    manager,
    fixture.foreignWorkspaceId,
    fixture.foreignReport,
  );
  fixture.hiddenReport = metaReport(fixture, {
    projectId: fixture.projects.otherClient,
    managerId: fixture.people.secondWriter.memberId,
    marketerId: fixture.people.outsider.memberId,
  });
  await insertMetaReport(manager, fixture.workspaceId, fixture.hiddenReport);
  fixture.manualReports = Array.from({ length: 12 }, (_, index) =>
    manualReport(fixture, {
      title: `Synthetic manually recorded report ${String(index).padStart(3, '0')}`,
    }),
  );
  fixture.manualLater = manualReport(fixture, {
    date: '2020-02-22',
    spend: 5000,
    purchases: 10,
  });
  await manager.query(
    `UPDATE core."deliveryOperations" SET state=jsonb_set(state,'{business,records}',$2::jsonb) WHERE "workspaceId"=$1`,
    [
      fixture.workspaceId,
      JSON.stringify([...fixture.manualReports, fixture.manualLater]),
    ],
  );
  return fixture;
}
function insight(fields = {}) {
  return {
    account_id: '1234567890',
    date_start: DATE,
    date_stop: DATE,
    spend: '100.12',
    impressions: '1000',
    clicks: '150',
    actions: [
      { action_type: 'lead', value: '6' },
      { action_type: 'onsite_conversion.lead_grouped', value: '6' },
      { action_type: 'purchase', value: '0' },
    ],
    action_values: [],
    ...fields,
  };
}
function metaReport(fixture, fields = {}) {
  return {
    id: randomUUID(),
    accountId: '1234567890',
    projectId: fixture.projects.first,
    managerId: fixture.people.reader.memberId,
    marketerId: fixture.people.writer.memberId,
    date: DATE,
    currency: 'USD',
    timezone: 'Asia/Qatar',
    fetchedAt: NOW,
    account: insight(),
    ads: Array.from({ length: 55 }, (_, index) =>
      insight({
        ad_id: String(1000 + index),
        ad_name: `Synthetic ad ${index}`,
        campaign_id: '2000',
        campaign_name: 'Synthetic campaign',
      }),
    ),
    status: 'REVIEW',
    reviewedBy: null,
    reviewedAt: null,
    note: '',
    taskId: null,
    ...fields,
  };
}
function manualReport(fixture, fields = {}) {
  return {
    kind: 'AD_REPORT',
    id: randomUUID(),
    revision: 1,
    projectId: fixture.projects.first,
    title: 'Synthetic manually recorded report',
    date: DATE,
    channel: 'META',
    currency: 'USD',
    spend: 10012,
    attributedRevenue: 0,
    shopifyRevenue: null,
    purchases: 0,
    qualifiedLeads: 6,
    bookedCalls: 0,
    webinarRegistrations: 0,
    goal: 'LEADS',
    targetCost: 0,
    recommendation: PRIVATE_REPORT,
    sourceUrl: 'https://example.invalid/synthetic-report',
    marketerId: fixture.people.writer.memberId,
    createdBy: fixture.people.writer.memberId,
    createdAt: NOW,
    updatedAt: NOW,
    status: 'REVIEW',
    decisionBy: null,
    evidence: null,
    taskId: null,
    history: [],
    ...fields,
  };
}
function advertisingServices(source, fixture) {
  const services = buildServices(source, fixture);
  const meta = new DeliveryMetaService(
    source,
    services.delivery,
    forbiddenProvider,
    forbiddenProvider,
  );
  const sources = new DeliveryAdvertisingSourcesService(
    services.delivery,
    meta,
    services.business,
  );
  const workbench = new DeliveryAdvertisingWorkbenchService(
    source,
    services.delivery,
    services.access,
    sources,
  );
  const noSnapshot = () => {
    throw new Error(
      'Advertising workbench must not hydrate a legacy snapshot.',
    );
  };
  services.delivery.snapshot = noSnapshot;
  services.business.snapshot = noSnapshot;
  meta.snapshot = noSnapshot;
  return { ...services, meta, sources, workbench };
}
function advertisingHarness(services, fixture, manager) {
  return (
    method,
    input,
    person = fixture.people.admin,
    workspace = fixture.workspace,
  ) => {
    const execute = (transactionManager) =>
      services.workbench[method](
        workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
        transactionManager,
      );
    return manager && ['save', 'assign', 'observe'].includes(method)
      ? manager.transaction(execute)
      : execute(manager);
  };
}
function newReviewInput(fixture, source, fields = {}) {
  const metric = source.metrics.find(
    (item) => item.goalKinds.includes('PURCHASES') && item.unit === 'COUNT',
  );
  assert(metric, 'Fixture must contain an explicit purchases metric.');
  return {
    requestId: randomUUID(),
    id: randomUUID(),
    revision: 0,
    sourceKind: source.source.kind,
    sourceId: source.source.id,
    sourceFingerprint: source.fingerprint,
    goal: {
      kind: 'PURCHASES',
      metricKey: metric.key,
      metricAdId: null,
      provenance: 'REPORT',
      value: metric.value,
      evidence: '',
      targetCostMicros: '25000000',
    },
    note: 'Synthetic manager reviewed recommendation.',
    noChangeReason: '',
    legacyHandling: {
      mode: 'NONE',
      taskId: null,
      taskRevision: null,
      taskState: null,
      reason: '',
    },
    actions: [
      {
        id: randomUUID(),
        title: 'Test a reviewed creative angle',
        rationale: 'The selected report needs a deliberate creative test.',
        expectedResult: 'Compare recorded purchases after enough time.',
        evidence:
          'Reviewed campaign evidence: https://example.invalid/approved-evidence',
        ownerId: fixture.people.writer.memberId,
        reviewerId: fixture.people.reader.memberId,
        dueDate: '2030-02-23',
        assistantId: null,
        adoptTaskId: null,
      },
    ],
    ...fields,
  };
}
module.exports = {
  TABLES,
  PRIVATE_REPORT,
  DATE,
  NOW,
  copy,
  hash,
  denied,
  seedAdvertisingFixture,
  insight,
  metaReport,
  manualReport,
  advertisingServices,
  advertisingHarness,
  newReviewInput,
};

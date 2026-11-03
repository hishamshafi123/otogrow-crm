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
  DeliveryReleaseSourceService,
} = require('../dist/modules/delivery/development/delivery-release-source.service');
const {
  DeliveryReleaseReadsService,
} = require('../dist/modules/delivery/development/delivery-release-reads.service');
const {
  DeliveryReleaseService,
} = require('../dist/modules/delivery/development/delivery-release.service');
const body = (fixture) => ({
  title: 'FIXTURE checkout release',
  ownerId: fixture.people.writer.memberId,
  targetDate: '2026-11-05',
  repositoryUrl: 'https://github.com/example/mobile',
  commitSha: 'a'.repeat(40),
  summary: 'FIXTURE checkout validation',
  acceptanceCriteria: 'FIXTURE verified checkout and retry.',
  rollbackPlan: 'FIXTURE reactivate the previous artifact.',
  work: [
    {
      taskId: fixture.taskId,
      revision: 1,
      issueUrl: '',
      pullRequestUrl: '',
      blockedByTaskIds: [],
    },
  ],
  checks: ['TEST', 'CODE_REVIEW', 'ROLLBACK', 'HANDOVER'].map((kind) => ({
    id: randomUUID(),
    kind,
    label: `FIXTURE ${kind}`,
    status: 'PASSED',
    evidenceUrl: 'https://example.invalid/release-evidence',
    note: 'FIXTURE external human attestation; no provider verification.',
  })),
});
function services(source, fixture) {
  const access = new OtogrowAccessService(source, {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) =>
      workspaceId === fixture.workspaceId &&
      userWorkspaceId === fixture.people.admin.userWorkspaceId,
  });
  const native = syntheticCurrentWork(access, fixture);
  const releases = new DeliveryReleaseSourceService(
    source,
    access,
    native.workspaceOrm,
    native.cache,
  );
  return {
    access,
    releases: new DeliveryReleaseService(
      releases,
      new DeliveryReleaseReadsService(releases),
    ),
  };
}
async function seedDeveloperFixture(manager, prefix = 'development_race') {
  const fixture = await createFixture(manager, prefix);
  await seedCurrentWorkFixture(manager, fixture);
  fixture.taskId = fixture.currentTasks.approved;
  fixture.projectAnchor = (
    await manager.query(
      'SELECT revision,"companyId" FROM core."deliveryProject" WHERE id=$1',
      [fixture.projects.first],
    )
  )[0];
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
    [fixture.roles.reader, ['delivery.manage']],
  );
  const details = {
    state: 'APPROVED',
    service: 'MOBILE_APP',
    submissions: [
      {
        version: 1,
        submittedBy: fixture.people.writer.memberId,
        submittedAt: '2020-02-21T10:00:00Z',
        decision: 'APPROVED',
        reviewedBy: fixture.people.reader.memberId,
        reviewedAt: '2020-02-21T11:00:00Z',
      },
    ],
  };
  await manager.query(
    'UPDATE core."deliveryTask" SET details=$3 WHERE "workspaceId"=$1 AND "taskId"=$2',
    [fixture.workspaceId, fixture.taskId, JSON.stringify(details)],
  );
  return fixture;
}
module.exports = { services, seedDeveloperFixture, body };

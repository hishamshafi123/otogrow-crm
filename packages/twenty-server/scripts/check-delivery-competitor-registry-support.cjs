const { randomUUID } = require('node:crypto');
const { createFixture } = require('./check-delivery-reconciliation.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryCompetitorSourceService,
} = require('../dist/modules/delivery/competitors/delivery-competitor-source.service');
const {
  DeliveryCompetitorReadsService,
} = require('../dist/modules/delivery/competitors/delivery-competitor-reads.service');
const {
  DeliveryCompetitorService,
} = require('../dist/modules/delivery/competitors/delivery-competitor.service');

const TABLES = [
  'deliveryCompetitorSource',
  'deliveryCompetitorSourceVersion',
  'deliveryCompetitorSourceEvent',
];

const sourceBody = (fixture, changes = {}) => ({
  projectId: fixture.projects.first,
  label: 'FIXTURE public competitor profile',
  platform: 'X',
  accountReference: '@OtogrowFixture',
  ownerId: fixture.people.writer.memberId,
  reviewerId: fixture.people.reader.memberId,
  cadenceHours: 24,
  lookbackDays: 7,
  purpose: 'PRIVATE_FIXTURE_PURPOSE: compare public creative evidence.',
  ...changes,
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
  const sources = new DeliveryCompetitorSourceService(source, access);
  return {
    access,
    registry: new DeliveryCompetitorService(
      sources,
      new DeliveryCompetitorReadsService(sources),
    ),
  };
}

async function seedRegistryFixture(manager, prefix = 'competitor_check') {
  const fixture = await createFixture(manager, prefix);
  for (const name of ['writer', 'secondWriter'])
    await manager.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles[name], []],
    );
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
    [fixture.roles.reader, ['delivery.manage']],
  );
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
    [
      fixture.projects.first,
      JSON.stringify([
        fixture.people.writer.memberId,
        fixture.people.secondWriter.memberId,
      ]),
    ],
  );
  fixture.projectAnchor = (
    await manager.query(
      'SELECT revision,"companyId" FROM core."deliveryProject" WHERE id=$1',
      [fixture.projects.first],
    )
  )[0];
  fixture.taskId = randomUUID();
  await manager.query(
    `CREATE TABLE "${fixture.schemaName}".task (id uuid PRIMARY KEY,title text,"deletedAt" timestamptz)`,
  );
  await manager.query(
    `INSERT INTO "${fixture.schemaName}".task(id,title) VALUES($1,$2)`,
    [fixture.taskId, 'PRIVATE_FIXTURE_NATIVE_TASK: registry must never edit.'],
  );
  await manager.query(
    'INSERT INTO core."deliveryTask"("workspaceId","taskId","projectId",details) VALUES($1,$2,$3,$4)',
    [
      fixture.workspaceId,
      fixture.taskId,
      fixture.projects.first,
      JSON.stringify({ state: 'IN_PROGRESS', service: 'CONTENT' }),
    ],
  );
  return fixture;
}

module.exports = { TABLES, sourceBody, services, seedRegistryFixture };

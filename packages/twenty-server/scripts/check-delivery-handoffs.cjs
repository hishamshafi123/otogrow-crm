const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  withWorkspaceContext,
} = require('../dist/engine/twenty-orm/storage/orm-workspace-context.storage');
const {
  DeliveryHandoffsService,
} = require('../dist/modules/delivery/handoffs/delivery-handoffs.service');
const {
  DeliveryHandoffSourceService,
} = require('../dist/modules/delivery/handoffs/delivery-handoff-source.service');
const {
  DeliveryClientsService,
} = require('../dist/modules/delivery/clients/delivery-clients.service');
const {
  DeliveryCommitmentsService,
} = require('../dist/modules/delivery/commitments/delivery-commitments.service');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
async function main() {
  const databaseUrl = new URL(connectionSource.options.url);
  assert(
    ['localhost', '127.0.0.1'].includes(databaseUrl.hostname),
    'Only a local development database is allowed',
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const [workspace] = await runner.query(
      `SELECT id, "databaseSchema" FROM core.workspace WHERE "databaseSchema" IS NOT NULL AND "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
    const schema = `"${workspace.databaseSchema}"`;
    const admin = randomUUID();
    const editor = randomUUID();
    const outsider = randomUUID();
    for (const [id, name] of [
      [admin, 'Delivery reviewer fixture'],
      [editor, 'Delivery editor fixture'],
      [outsider, 'Delivery outsider fixture'],
    ]) {
      const userId = randomUUID();
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        userId,
        `${id}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [id, userId, workspace.id],
      );
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id, "nameFirstName", "nameLastName", "userId", "userEmail") VALUES ($1,$2,'',$3,$4)`,
        [id, name, userId, `${id}@example.invalid`],
      );
    }
    const scopedDataSource = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const access = new OtogrowAccessService(scopedDataSource, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        userWorkspaceId === admin,
    });
    const service = new DeliveryService(scopedDataSource, access);
    const command = (actor, input) =>
      service.command(workspace, actor, actor, input);
    const companyId = randomUUID(),
      opportunityId = randomUUID(),
      quoteId = randomUUID(),
      lineId = randomUUID();
    await runner.query(
      `INSERT INTO ${schema}.company (id,name) VALUES ($1,'Handoff fixture client')`,
      [companyId],
    );
    await runner.query(
      `INSERT INTO ${schema}.opportunity (id,name,stage,"companyId") VALUES ($1,'Accepted service sale','CUSTOMER',$2)`,
      [opportunityId, companyId],
    );
    await runner.query(
      `INSERT INTO ${schema}.quote (id,"quoteNumber",status,"companyId","opportunityId",terms,"totalAmountMicros","totalCurrencyCode") VALUES ($1,'HANDOFF-FIXTURE','ACCEPTED',$2,$3,'Retainer reviewed monthly',1250000000,'USD')`,
      [quoteId, companyId, opportunityId],
    );
    await runner.query(
      `INSERT INTO ${schema}."quoteLineItem" (id,"quoteId",label,description,quantity) VALUES ($1,$2,'AI video creative','Product fidelity and hook testing',6)`,
      [lineId, quoteId],
    );
    let nativeDenied = false;
    let context;
    const orm = {
      executeInWorkspaceContext: async (callback, auth) => {
        assert.equal(auth.type, 'user');
        context = auth;
        if (nativeDenied)
          throw Object.assign(new Error('Native CRM access denied'), {
            status: 403,
          });
        return withWorkspaceContext(
          {
            authContext: auth,
            userWorkspaceRoleMap: {
              [auth.userWorkspaceId]: 'native-test-role',
            },
            apiKeyRoleMap: {},
          },
          callback,
        );
      },
      getRepository: async (workspaceId, entity, options) => {
        assert.equal(workspaceId, workspace.id);
        assert.deepEqual(
          options,
          { intersectionOf: ['native-test-role'] },
          'Source must explicitly resolve current native CRM permissions',
        );
        const tables = {
          OpportunityWorkspaceEntity: 'opportunity',
          QuoteWorkspaceEntity: 'quote',
          QuoteLineItemWorkspaceEntity: 'quoteLineItem',
          CompanyWorkspaceEntity: 'company',
        };
        const table = tables[entity.name];
        assert(table);
        const rows = async (where) => {
          const pairs = Object.entries(where).filter(
            ([, value]) => typeof value === 'string',
          );
          const values = pairs.map(([, value]) => value);
          const conditions = pairs.map(
            ([key], index) => `"${key}"=$${index + 1}`,
          );
          let result = await runner.query(
            `SELECT * FROM ${schema}."${table}" WHERE "deletedAt" IS NULL ${conditions.length ? 'AND ' + conditions.join(' AND ') : ''}`,
            values,
          );
          if (table === 'quote')
            result = result.map((row) => ({
              ...row,
              total: {
                amountMicros: row.totalAmountMicros,
                currencyCode: row.totalCurrencyCode,
              },
            }));
          if (table === 'quoteLineItem')
            result.sort((left, right) => left.id.localeCompare(right.id));
          return result;
        };
        return {
          findOne: async ({ where }) => (await rows(where))[0] ?? null,
          find: async ({ where }) => rows(where),
          createQueryBuilder: () => {
            const where = {};
            const builder = {
              select: () => builder,
              where: (_sql, values) => {
                where.id = values.quoteId;
                return builder;
              },
              andWhere: (_sql, values) => {
                where.opportunityId = values.opportunityId;
                return builder;
              },
              getOne: async () => (await rows(where))[0] ?? null,
            };
            return builder;
          },
        };
      },
    };
    const native = new DeliveryHandoffSourceService(orm);
    const clients = new DeliveryClientsService(
      scopedDataSource,
      service,
      new DeliveryCreativeService(scopedDataSource, service, {}),
      new DeliveryCommitmentsService(scopedDataSource, service),
    );
    const handoffs = new DeliveryHandoffsService(
      scopedDataSource,
      service,
      clients,
      access,
      native,
    );
    const auth = (id) => ({
      type: 'user',
      workspace,
      workspaceMemberId: id,
      userWorkspaceId: id,
    });
    let directory = await access.directory(workspace.id, admin, admin);
    const managerRole = directory.roles.find(
      (role) =>
        role.capabilities.includes('delivery.manage') &&
        !role.capabilities.includes('workspace.admin'),
    );
    await access.assignRoles(workspace.id, admin, admin, {
      memberId: outsider,
      roleIds: [managerRole.id],
      roleRevisions: [{ id: managerRole.id, revision: managerRole.revision }],
      revision: 0,
    });
    await assert.rejects(handoffs.directory(auth(editor), ''), { status: 403 });
    await assert.rejects(handoffs.directory(auth(outsider), ''), {
      status: 403,
    });
    const preview = await handoffs.preview(auth(admin), {
      opportunityId,
      quoteId,
    });
    assert(preview.source.scope.includes('6 × AI video creative'));
    assert(preview.source.scope.includes('Retainer reviewed monthly'));
    assert.equal(preview.source.totalAmountMicros, '1250000000');
    assert.equal(context.workspaceMemberId, admin);
    const input = {
      opportunityId,
      quoteId,
      fingerprint: preview.source.fingerprint,
      projectName: 'Handoff delivery fixture',
      managerId: outsider,
      reviewerId: admin,
      memberIds: [editor],
      services: ['AI videos', 'SEO'],
      billing: 'RETAINER',
      contact: 'Client marketing lead',
      scheduledDate: null,
    };
    await assert.rejects(
      handoffs.create(auth(admin), { ...input, reviewerId: outsider }),
      { status: 400 },
    );
    await assert.rejects(
      handoffs.create(auth(admin), { ...input, managerId: editor }),
      { status: 400 },
    );
    nativeDenied = true;
    await assert.rejects(handoffs.create(auth(admin), input), { status: 403 });
    nativeDenied = false;
    await runner.query(
      `UPDATE ${schema}.quote SET terms='Scope changed' WHERE id=$1`,
      [quoteId],
    );
    await assert.rejects(handoffs.create(auth(admin), input), { status: 409 });
    await runner.query(
      `UPDATE ${schema}.quote SET status='DRAFT' WHERE id=$1`,
      [quoteId],
    );
    await assert.rejects(
      handoffs.preview(auth(admin), { opportunityId, quoteId }),
      { status: 400 },
    );
    await runner.query(
      `UPDATE ${schema}.quote SET status='ACCEPTED',terms='Retainer reviewed monthly' WHERE id=$1`,
      [quoteId],
    );
    await runner.query(
      `UPDATE ${schema}.opportunity SET stage='NEW' WHERE id=$1`,
      [opportunityId],
    );
    await assert.rejects(handoffs.create(auth(admin), input), { status: 400 });
    await runner.query(
      `UPDATE ${schema}.opportunity SET stage='CUSTOMER' WHERE id=$1`,
      [opportunityId],
    );
    const counts = async () => {
      const [row] = await runner.query(
        'SELECT (SELECT count(*) FROM core."deliveryProject" WHERE "workspaceId"=$1) projects,(SELECT count(*) FROM core."deliveryHandoff" WHERE "workspaceId"=$1) handoffs,(SELECT count(*) FROM core."deliveryTask" WHERE "workspaceId"=$1) tasks,(SELECT count(*) FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1) events',
        [workspace.id],
      );
      return row;
    };
    const before = await counts(),
      originalTransaction = scopedDataSource.transaction;
    scopedDataSource.transaction = (callback) =>
      runner.manager.transaction(async (manager) => {
        await callback(manager);
        throw new Error('Injected handoff failure');
      });
    await assert.rejects(
      handoffs.create(auth(admin), input),
      /Injected handoff failure/,
    );
    scopedDataSource.transaction = originalTransaction;
    assert.deepEqual(await counts(), before);
    const created = await handoffs.create(auth(admin), input);
    assert.equal(created.setupTaskIds.length, 3);
    const createdCounts = await counts();
    assert.deepEqual(await handoffs.create(auth(admin), input), created);
    assert.deepEqual(
      await counts(),
      createdCounts,
      'Retry never duplicates projects, engagements, tasks or events',
    );
    const delivery = await service.snapshot(workspace, admin, admin);
    const project = delivery.projects.find(
      (row) => row.id === created.projectId,
    );
    assert.equal(project.companyId, companyId);
    assert(project.memberIds.includes(editor));
    const setup = delivery.tasks.filter((row) =>
      created.setupTaskIds.includes(row.id),
    );
    assert(
      setup.every(
        (row) =>
          row.assigneeId === outsider &&
          row.details.reviewerId === admin &&
          row.details.state === 'PLANNED' &&
          row.details.checklist.length === 3,
      ),
    );
    const client = await clients.snapshot(workspace, admin, admin);
    const engagement = client.engagements.find(
      (row) => row.id === created.engagementId,
    );
    assert.equal(engagement.scope, preview.source.scope);
    assert.equal(engagement.billing, 'RETAINER');
    assert.equal(engagement.assets.length, 0);
    assert.equal(engagement.submissions.length, 0);
    assert.equal(
      client.links.filter((row) => row.engagementId === engagement.id).length,
      0,
    );
    const [stored] = await runner.query(
      'SELECT source FROM core."deliveryHandoff" WHERE id=$1',
      [created.id],
    );
    assert.equal(stored.source.fingerprint, input.fingerprint);
    assert(
      (await handoffs.directory(auth(admin), '')).handoffs.some(
        (row) => row.id === created.id,
      ),
    );
    await assert.rejects(
      handoffs.preview(
        { ...auth(admin), workspace: { ...workspace, id: randomUUID() } },
        { opportunityId, quoteId },
      ),
    );
    console.log(
      'PASS won/accepted source import, native-CRM permission boundary, OS finance/manager scope, independent owners, changed-source rejection, atomic project/engagement/tasks/history, zero implicit payments/links and idempotent retry. All synthetic records rolled back.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

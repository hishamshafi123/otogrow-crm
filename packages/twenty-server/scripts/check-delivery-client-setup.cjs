const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ForbiddenException } = require('@nestjs/common');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  withWorkspaceContext,
} = require('../dist/engine/twenty-orm/storage/orm-workspace-context.storage');
const {
  createReviewFixture,
  copy,
  hash,
  denied,
} = require('./check-delivery-creative-review-support.cjs');
const { buildServices } = require('./check-delivery-reconciliation.cjs');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryClientsService,
} = require('../dist/modules/delivery/clients/delivery-clients.service');
const {
  DeliveryCommitmentsService,
} = require('../dist/modules/delivery/commitments/delivery-commitments.service');
const {
  DeliveryClientSetupSourceService,
} = require('../dist/modules/delivery/onboarding/delivery-client-setup-source.service');
const {
  DeliveryClientSetupService,
} = require('../dist/modules/delivery/onboarding/delivery-client-setup.service');

async function main() {
  assert.equal(process.argv.length, 2, 'This checker always rolls back.');
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const fixture = await createReviewFixture(runner.manager);
    const { workspace, workspaceId, schemaName, people } = fixture;
    const schema = `"${schemaName}"`;
    await runner.query(
      `ALTER TABLE ${schema}.company ADD COLUMN "updatedAt" timestamptz NOT NULL DEFAULT '2026-10-30T00:00:00.123Z'`,
    );
    fixture.companies = (
      await runner.query(`SELECT id FROM ${schema}.company ORDER BY name,id`)
    ).map((company) => company.id);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (work) => runner.manager.transaction(work),
    };
    const services = buildServices(source, fixture);
    const noSnapshot = () => {
      throw new Error(
        'Guided setup must never build a legacy workspace or client snapshot.',
      );
    };
    services.delivery.snapshot = noSnapshot;
    const creative = new DeliveryCreativeService(
      source,
      services.delivery,
      {
        getCurrentDriver: () => {
          throw new Error('Client setup must not load or write media.');
        },
      },
      createIsolatedNativeTaskAccess(),
    );
    const clients = new DeliveryClientsService(
      source,
      services.delivery,
      creative,
      new DeliveryCommitmentsService(source, services.delivery),
    );
    clients.snapshot = noSnapshot;
    let nativeDenied = false,
      activeAuth;
    const nativeRoles = new Map();
    const orm = {
      executeInWorkspaceContext: async (work, auth) => {
        assert.equal(auth.type, 'user');
        activeAuth = auth;
        if (nativeDenied)
          throw new ForbiddenException(
            'Synthetic native company access revoked.',
          );
        return withWorkspaceContext(
          {
            authContext: auth,
            userWorkspaceRoleMap: {
              [auth.userWorkspaceId]: 'native-setup-test-role',
            },
            apiKeyRoleMap: {},
          },
          work,
        );
      },
      getRepository: async (targetWorkspaceId, entity, permissions) => {
        assert.equal(targetWorkspaceId, activeAuth.workspace.id);
        assert.equal(entity.name, 'CompanyWorkspaceEntity');
        assert.deepEqual(
          permissions,
          { intersectionOf: ['native-setup-test-role'] },
          'Native permission intersection is mandatory; no bypass repository.',
        );
        nativeRoles.set(activeAuth.userWorkspaceId, permissions);
        const allowed =
          activeAuth.workspace.id === workspaceId ? fixture.companies : [];
        return {
          find: async (options) =>
            runner.query(
              `SELECT id,name,"updatedAt" FROM ${schema}.company WHERE "deletedAt" IS NULL AND id=ANY($1::uuid[]) AND name ILIKE $2 ORDER BY name,id LIMIT 51`,
              [
                allowed,
                options.where?.name?.value ??
                  options.where?.name?._value ??
                  '%',
              ],
            ),
          findOne: async (options) =>
            (
              await runner.query(
                `SELECT id,name,"updatedAt" FROM ${schema}.company WHERE id=$1 AND id=ANY($2::uuid[]) AND "deletedAt" IS NULL`,
                [options.where.id, allowed],
              )
            )[0] ?? null,
        };
      },
    };
    const companySource = new DeliveryClientSetupSourceService(orm);
    const setup = new DeliveryClientSetupService(
      source,
      services.delivery,
      clients,
      services.access,
      companySource,
    );
    const auth = (person = people.admin, target = workspace) => ({
      type: 'user',
      workspace: target,
      workspaceMemberId: person.memberId,
      userWorkspaceId: person.userWorkspaceId,
      user: { id: person.userId },
    });
    const context = (input = {}, person = people.admin, target = workspace) =>
      setup.context(auth(person, target), input);
    const companyId = fixture.companies[0];
    const initial = await context({ companyId });
    assert.equal(initial.selectedCompany.id, companyId);
    assert(!('tasks' in initial));
    assert.equal(initial.companiesHasMore, false);
    const firstPlan = {
      name: 'Synthetic agreed AI creative',
      services: ['AI videos'],
      billing: 'RETAINER',
      scope:
        'Four explicitly reviewed concepts; no automatic video quantity or billing.',
      allowance: '',
      contact: '',
      fields: [
        {
          id: randomUUID(),
          label: 'Website and approved brand assets',
          required: true,
        },
      ],
      advertising: null,
    };
    const base = () => ({
      requestId: randomUUID(),
      companyId,
      companySourceToken: initial.selectedCompany.sourceToken,
      projectId: null,
      projectRevision: null,
      projectName: `Synthetic client work ${randomUUID()}`,
      memberIds: [people.writer.memberId],
      engagementId: null,
      engagementRevision: null,
      plan: copy(firstPlan),
      firstTask: null,
    });
    const firstTask = () => ({
      title: 'Synthetic first deliverable',
      brief: 'Human reviews brand fidelity before any final approval.',
      service: 'AI videos',
      assigneeId: people.writer.memberId,
      reviewerId: people.admin.memberId,
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      checklist: ['Check product details', 'Verify references'],
      evidence: ['https://example.invalid/approved-reference'],
    });
    const counts = async () =>
      (
        await runner.query(
          `SELECT
      (SELECT count(*) FROM core."deliveryProject" WHERE "workspaceId"=$1)::int AS projects,
      (SELECT count(*) FROM core."deliveryTask" WHERE "workspaceId"=$1)::int AS tasks,
      (SELECT count(*) FROM core."deliveryClientSetup" WHERE "workspaceId"=$1)::int AS receipts,
      COALESCE((SELECT jsonb_array_length(state->'clients'->'engagements') FROM core."deliveryOperations" WHERE "workspaceId"=$1),0) AS plans`,
          [workspaceId],
        )
      )[0];
    const immutableTables = [
      'deliveryCommitmentPeriod',
      'deliveryCommitmentLine',
      'deliveryCommitmentAllocation',
      'deliveryCommitmentEvent',
      'deliveryFinancePlan',
      'deliveryFinanceEntry',
      'deliveryFinanceAllocation',
      'deliveryFinanceEvent',
      'deliveryFinanceSource',
      'deliveryFinanceSettlement',
      'deliveryFinanceCashMatch',
      'deliveryFinanceAiClaim',
      'deliveryFinancePeriod',
      'deliveryFinanceForecastAnchor',
      'deliveryFinanceForecastItem',
      'deliveryFinanceForecastRealization',
      'deliveryFinanceExportProfile',
      'deliveryFinanceExportBatch',
      'otogrowAiSpend',
      'otogrowAiSpendEvent',
      'otogrowAiBudget',
      'otogrowAiPrice',
      'deliveryMetaReport',
      'deliveryReminderOutbox',
    ];
    const protectedSources = async () => {
      const state = {};
      for (const name of immutableTables)
        state[name] = hash(
          await runner.query(
            `SELECT to_jsonb(record)::text AS value FROM core."${name}" record WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id`,
            [[workspaceId, fixture.foreignWorkspaceId]],
          ),
        );
      const [operations] = await runner.query(
        'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
        [workspaceId],
      );
      const keep = copy(operations.state);
      delete keep.clients;
      state.operationsExceptClients = hash(keep);
      state.nativeCompanies = hash(
        await runner.query(
          `SELECT to_jsonb(record)::text AS value FROM ${schema}.company record ORDER BY id`,
        ),
      );
      return state;
    };
    const original = await protectedSources();
    const emptyRequest = randomUUID(),
      beforeMissing = await counts();
    assert.equal(
      await setup.receipt(auth(), { requestId: emptyRequest }),
      null,
    );
    assert.deepEqual(await counts(), beforeMissing);
    await denied(() => context({}, people.writer));
    await denied(() =>
      context({ companyId }, people.admin, fixture.foreignWorkspace),
    );
    assert.equal(
      (await context({ companyId: randomUUID() })).selectedCompany,
      null,
    );
    const request = { ...base(), firstTask: firstTask() };
    const before = await counts();
    const created = await setup.create(auth(), request);
    assert.equal(created.replayed, false);
    assert(created.taskId);
    assert.equal(created.reusedProject, false);
    assert.equal(created.reusedEngagement, false);
    const after = await counts();
    assert.equal(after.projects, before.projects + 1);
    assert.equal(after.tasks, before.tasks + 1);
    assert.equal(after.plans, before.plans + 1);
    assert.equal(after.receipts, before.receipts + 1);
    assert.deepEqual(await setup.create(auth(), request), {
      ...created,
      replayed: true,
    });
    assert.deepEqual(
      await setup.receipt(auth(), { requestId: request.requestId }),
      { ...created, replayed: true },
    );
    assert.deepEqual(await counts(), after);
    await denied(
      () =>
        setup.create(auth(), {
          ...request,
          projectName: 'Changed while outcome was unknown',
        }),
      [409],
    );
    assert.deepEqual(await counts(), after);
    const [task] = await runner.query(
      'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [workspaceId, created.taskId],
    );
    assert.equal(task.details.state, 'PLANNED');
    assert.equal(task.details.reviewerId, people.admin.memberId);
    assert.equal(task.details.submissions.length, 0);
    assert(task.details.checklist.every((item) => item.done === false));
    assert.equal(task.details.scheduledDate, null);
    const [nativeTask] = await runner.query(
      `SELECT "dueAt" FROM ${schema}.task WHERE id=$1`,
      [created.taskId],
    );
    assert.equal(nativeTask.dueAt, null);
    const existing = await context({ companyId, projectId: created.projectId });
    assert(
      existing.projects.some((project) => project.id === created.projectId),
    );
    assert.equal(existing.servicePlans.length, 1);
    assert.equal(existing.servicePlans[0].id, created.engagementId);
    assert(!JSON.stringify(existing).includes('PRIVATE_REVIEW_BRIEF'));
    const reuse = {
      ...base(),
      projectId: created.projectId,
      projectRevision: existing.projects.find(
        (project) => project.id === created.projectId,
      ).revision,
      projectName: null,
      memberIds: [],
      engagementId: created.engagementId,
      engagementRevision: existing.servicePlans[0].revision,
      plan: null,
    };
    const beforeReuse = await counts();
    const reused = await setup.create(auth(), reuse);
    assert.equal(reused.reusedProject, true);
    assert.equal(reused.reusedEngagement, true);
    assert.equal(reused.taskId, null);
    const afterReuse = await counts();
    assert.equal(afterReuse.projects, beforeReuse.projects);
    assert.equal(afterReuse.plans, beforeReuse.plans);
    assert.equal(afterReuse.tasks, beforeReuse.tasks);
    assert.equal(afterReuse.receipts, beforeReuse.receipts + 1);
    const noTeam = { ...base(), memberIds: [] };
    const withoutFirstTask = await setup.create(auth(), noTeam);
    assert.equal(withoutFirstTask.taskId, null);
    const failing = [
      {
        ...base(),
        firstTask: {
          ...firstTask(),
          assigneeId: people.admin.memberId,
          reviewerId: people.admin.memberId,
        },
        memberIds: [people.admin.memberId],
      },
      { ...base(), firstTask: firstTask(), memberIds: [] },
      {
        ...base(),
        memberIds: [fixture.people.outsider.memberId],
        firstTask: {
          ...firstTask(),
          assigneeId: fixture.people.outsider.memberId,
          reviewerId: fixture.people.writer.memberId,
        },
      },
      {
        ...base(),
        firstTask: firstTask(),
        plan: {
          ...firstPlan,
          advertising: {
            managerId: people.admin.memberId,
            marketerId: people.admin.memberId,
            currency: 'USD',
            channel: 'META',
            period: 'DAILY',
          },
          services: ['Performance marketing'],
        },
      },
    ];
    for (const invalid of failing) {
      const beforeFailure = await counts();
      await denied(() => setup.create(auth(), invalid), [400]);
      assert.deepEqual(
        await counts(),
        beforeFailure,
        'Rejected setup must roll back project, plan, task and receipt together.',
      );
    }
    await denied(
      () =>
        setup.create(auth(), {
          ...reuse,
          requestId: randomUUID(),
          projectRevision: reuse.projectRevision + 1,
        }),
      [409],
    );
    await denied(
      () =>
        setup.create(auth(), {
          ...reuse,
          requestId: randomUUID(),
          engagementRevision: reuse.engagementRevision + 1,
        }),
      [409],
    );
    const oldCompany = (
      await runner.query(
        `SELECT name,"updatedAt" FROM ${schema}.company WHERE id=$1`,
        [companyId],
      )
    )[0];
    await runner.query(
      `UPDATE ${schema}.company SET name='Changed synthetic brand',"updatedAt"='2026-10-30T00:01:00.123Z' WHERE id=$1`,
      [companyId],
    );
    await denied(() => setup.create(auth(), base()), [409]);
    assert.equal(
      (await setup.receipt(auth(), { requestId: request.requestId })).requestId,
      request.requestId,
      'Known completed setup remains recoverable after a legitimate company edit.',
    );
    await runner.query(
      `UPDATE ${schema}.company SET name=$2,"updatedAt"=$3 WHERE id=$1`,
      [companyId, oldCompany.name, oldCompany.updatedAt],
    );
    nativeDenied = true;
    const deniedCount = await counts();
    await denied(() => setup.receipt(auth(), { requestId: request.requestId }));
    await denied(() => setup.create(auth(), request));
    await denied(() => context({ companyId }));
    assert.deepEqual(await counts(), deniedCount);
    nativeDenied = false;
    await runner.query(
      `UPDATE ${schema}.company SET "deletedAt"=now() WHERE id=$1`,
      [companyId],
    );
    await denied(() => setup.create(auth(), base()));
    assert.equal((await context({ companyId })).selectedCompany, null);
    await runner.query(
      `UPDATE ${schema}.company SET "deletedAt"=NULL WHERE id=$1`,
      [companyId],
    );
    await runner.query(
      `UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1`,
      [fixture.roles.writer, ['delivery.manage']],
    );
    const writerRequest = base();
    const writerReceipt = await setup.create(
      auth(people.writer),
      writerRequest,
    );
    await denied(() =>
      setup.receipt(auth(), { requestId: writerRequest.requestId }),
    );
    await runner.query(
      `UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1`,
      [fixture.roles.writer, ['finance.manage']],
    );
    await denied(() =>
      setup.receipt(auth(people.writer), {
        requestId: writerRequest.requestId,
      }),
    );
    assert(writerReceipt.engagementId);
    assert.deepEqual(
      await protectedSources(),
      original,
      'Guided setup must not create billing, payment, commitment, transport or provider side effects, or change native companies.',
    );
    assert(nativeRoles.size > 0);
    console.log(
      JSON.stringify({
        result: 'PASS',
        rollbackOnly: true,
        typedTaskFreeContext: true,
        exactNativePermissionIntersection: true,
        atomicReplays: true,
        independentFirstTask: true,
        unchangedFinanceTransportAndCompanies: true,
        actualNetworkCalls: 0,
        paidCalls: 0,
      }),
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

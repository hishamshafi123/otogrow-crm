const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  createFixture,
  buildServices,
} = require('./check-delivery-reconciliation.cjs');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');
const {
  DeliveryFounderPerformanceService,
} = require('../dist/modules/delivery/founder/performance/delivery-founder-performance.service');

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
    await runner.query("SET LOCAL statement_timeout='30s'");
    const fixture = await createFixture(runner.manager, 'founder_performance');
    const { workspace, workspaceId, schemaName, people, projects } = fixture;
    await runner.query(
      `CREATE TABLE "${schemaName}".task (id uuid PRIMARY KEY,title text NOT NULL,"assigneeId" uuid,"dueAt" timestamptz,"updatedAt" timestamptz NOT NULL DEFAULT now(),"deletedAt" timestamptz)`,
    );
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const services = buildServices(source, fixture);
    const performance = new DeliveryFounderPerformanceService(
      source,
      services.delivery,
      services.access,
    );
    const now = new Date('2020-02-20T12:00:00.000Z');
    const tasks = {
      blocked: randomUUID(),
      approved: randomUUID(),
      reviewed: randomUUID(),
      waiting: randomUUID(),
      foreign: randomUUID(),
    };
    for (const [name, id] of Object.entries(tasks)) {
      const state =
        name === 'approved'
          ? 'APPROVED'
          : name === 'reviewed'
            ? 'CHANGES_REQUESTED'
            : name === 'waiting'
              ? 'IN_REVIEW'
              : 'BLOCKED';
      const projectId =
        name === 'waiting' ? projects.otherClient : projects.first;
      const assigneeId =
        name === 'reviewed' || name === 'waiting'
          ? people.writer.memberId
          : people.reader.memberId;
      const dueAt =
        name === 'approved'
          ? '2020-02-05T09:00:00Z'
          : name === 'reviewed'
            ? '2020-02-25T09:00:00Z'
            : '2020-02-10T09:00:00Z';
      await runner.query(
        `INSERT INTO "${schemaName}".task(id,title,"assigneeId","dueAt","updatedAt") VALUES($1,$2,$3,$4,'2020-02-01')`,
        [id, `Synthetic ${name}`, assigneeId, dueAt],
      );
      await runner.query(
        'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details,revision,"updatedAt") VALUES($1,$2,$3,$4,1,\'2020-02-01\')',
        [
          name === 'foreign' ? fixture.foreignWorkspaceId : workspaceId,
          id,
          name === 'foreign' ? projects.foreign : projectId,
          {
            state,
            reviewerId: people.admin.memberId,
            submissions:
              name === 'approved'
                ? [
                    {
                      version: 1,
                      decision: 'APPROVED',
                      reviewedAt: '2020-02-04T09:00:00.000Z',
                      description: 'PRIVATE_SUBMISSION',
                    },
                  ]
                : name === 'reviewed'
                  ? [
                      {
                        version: 1,
                        decision: 'CHANGES_REQUESTED',
                        reviewedAt: '2020-02-12T09:00:00.000Z',
                        feedback: 'PRIVATE_FEEDBACK',
                      },
                    ]
                  : [],
            brief: 'PRIVATE_BRIEF',
          },
        ],
      );
    }
    const entries = {
      revenue: randomUUID(),
      salary: randomUUID(),
      previousRevenue: randomUUID(),
      previousCost: randomUUID(),
      draft: randomUUID(),
    };
    const salaryPlanId = randomUUID();
    for (const [key, id] of Object.entries(entries)) {
      const current = !key.startsWith('previous');
      const kind = ['salary', 'previousCost'].includes(key)
        ? 'COST'
        : 'REVENUE';
      const amount =
        key === 'revenue'
          ? '10000000000'
          : key === 'salary'
            ? '4000000000'
            : key === 'previousRevenue'
              ? '8000000000'
              : key === 'previousCost'
                ? '2000000000'
                : '999000000';
      const salary = key === 'salary';
      await runner.query(
        'INSERT INTO core."deliveryFinanceEntry" (id,"workspaceId",month,kind,category,title,currency,"amountMicros",note,status,"sourceType","planId","sourcePlan","createdBy","postedBy","postedAt") VALUES($1,$2,$3,$4,$5,$6,\'USD\',$7,$8,$9,$10,$11,$12,$13,$14,now())',
        [
          id,
          workspaceId,
          current ? '2020-02' : '2020-01',
          kind,
          salary ? 'SALARY' : 'RETAINER',
          `Synthetic ${key}`,
          amount,
          'PRIVATE_FINANCE_NOTE',
          key === 'draft' ? 'DRAFT' : 'POSTED',
          salary ? 'PLAN' : 'MANUAL',
          salary ? salaryPlanId : null,
          salary
            ? {
                planId: salaryPlanId,
                revision: 1,
                type: 'SALARY',
                name: 'Synthetic salary',
                memberId: people.reader.memberId,
                memberName: 'reader',
                monthlyAmountMicros: amount,
                startMonth: '2020-01',
                endMonth: null,
                dueDay: 28,
              }
            : null,
          people.admin.memberId,
          key === 'draft' ? null : people.admin.memberId,
        ],
      );
      if (key !== 'draft') {
        await runner.query(
          'INSERT INTO core."deliveryFinanceAllocation" (id,"workspaceId","entryId",bucket,"projectId","projectName","amountMicros") VALUES($1,$2,$3,$4::text,$4::uuid,\'Synthetic client\',$5)',
          [randomUUID(), workspaceId, id, projects.first, amount],
        );
      }
    }
    const operations = newDeliveryOperations();
    const incomeId = randomUUID();
    const previousIncomeId = randomUUID();
    const receivableId = randomUUID();
    const cashRecord = (id, category, amount, date, dueDate = null) => ({
      id,
      revision: 1,
      kind: 'FINANCE',
      projectId: projects.first,
      title: `Synthetic ${category}`,
      category,
      currency: 'USD',
      amount,
      date,
      dueDate,
      status: category === 'RECEIVABLE' ? 'OPEN' : 'POSTED',
      externalReference: '',
      evidenceUrl: null,
      notes: 'PRIVATE_CASH_NOTE',
      createdAt: '2020-02-01T00:00:00.000Z',
      history: [],
    });
    operations.business = {
      records: [
        cashRecord(incomeId, 'INCOME', 600000, '2020-02-03'),
        cashRecord(previousIncomeId, 'INCOME', 100000, '2020-01-31'),
        cashRecord(
          receivableId,
          'RECEIVABLE',
          300000,
          '2020-02-01',
          '2020-02-01',
        ),
      ],
      inbox: [],
      seen: {},
    };
    await runner.query(
      'INSERT INTO core."deliveryOperations" ("workspaceId",state) VALUES($1,$2)',
      [workspaceId, operations],
    );
    await runner.query(
      'INSERT INTO core."deliveryRevision" (id,"workspaceId","taskId","projectId",round,"taskRevision","submissionVersion",source,reason,cause,"effortMinutes","internalCost","proposedCharge",currency,revision,"createdAt") VALUES($1,$2,$3,$4,1,1,1,\'INTERNAL_REVIEW\',\'Synthetic revision\',\'INTERNAL_DEFECT\',30,NULL,0,\'USD\',1,\'2020-02-15\')',
      [randomUUID(), workspaceId, tasks.approved, projects.first],
    );
    const result = await performance.snapshot(
      workspace,
      people.admin.memberId,
      people.admin.userWorkspaceId,
      { month: '2020-02', timezone: 'UTC', currency: 'USD' },
      now,
    );
    assert.equal(result.workspaceId, workspaceId);
    assert.equal(result.previousMonth, '2020-01');
    assert.equal(result.currencies.length, 1);
    assert.deepEqual(
      Object.fromEntries(
        [
          'revenueMicros',
          'costMicros',
          'resultMicros',
          'previousRevenueMicros',
          'previousResultMicros',
          'salaryCostMicros',
          'cashCollectedMicros',
          'receivablesMicros',
          'overdueReceivablesMicros',
        ].map((key) => [key, result.currencies[0][key]]),
      ),
      {
        revenueMicros: '10000000000',
        costMicros: '4000000000',
        resultMicros: '6000000000',
        previousRevenueMicros: '8000000000',
        previousResultMicros: '6000000000',
        salaryCostMicros: '4000000000',
        cashCollectedMicros: '6000000000',
        receivablesMicros: '3000000000',
        overdueReceivablesMicros: '3000000000',
      },
    );
    assert.equal(result.currencies[0].draftEntryCount, 1);
    assert.equal(result.currencies[0].cashComplete, true);
    assert.equal(result.operations.openTaskCount, 3);
    assert.equal(result.operations.overdueTaskCount, 2);
    assert.equal(result.operations.approvedTaskCount, 1);
    assert.equal(result.operations.dueTaskCount, 3);
    assert.equal(result.operations.onTimeApprovedTaskCount, 1);
    assert.equal(result.operations.reviewedTaskCount, 2);
    assert.equal(result.operations.firstPassApprovedTaskCount, 1);
    assert.equal(result.operations.internalRevisionCount, 1);
    const client = result.clients.find(
      (row) => row.projectId === projects.first,
    );
    assert(client);
    assert.equal(client.finance[0].resultMicros, '6000000000');
    assert.equal(client.finance[0].cashCollectedMicros, '6000000000');
    assert.equal(client.finance[0].receivablesMicros, '3000000000');
    const employee = result.employees.find(
      (row) => row.memberId === people.reader.memberId,
    );
    assert(employee);
    assert.deepEqual(employee.salaryCosts, [
      { currency: 'USD', amountMicros: '4000000000' },
    ]);
    assert(!result.clients.some((row) => row.projectId === projects.foreign));
    assert(!JSON.stringify(result).includes('PRIVATE_'));
    await assert.rejects(
      performance.snapshot(
        workspace,
        people.outsider.memberId,
        people.outsider.userWorkspaceId,
        { month: '2020-02', timezone: 'UTC', currency: 'USD' },
        now,
      ),
      (error) => error.getStatus?.() === 403,
    );
    console.log(
      'Founder performance real PostgreSQL rollback checks passed: exact finance/cash, client/employee KPIs, native task history, tenant isolation and access.',
    );
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

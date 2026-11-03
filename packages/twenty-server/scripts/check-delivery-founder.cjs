const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
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
  DeliveryFounderService,
} = require('../dist/modules/delivery/founder/delivery-founder.service');
const TABLES = [
  'deliveryOperations',
  'deliveryTask',
  'deliveryCommitmentPeriod',
  'deliveryCommitmentLine',
  'deliveryCommitmentAllocation',
  'deliveryFinanceEntry',
  'deliveryFinanceAllocation',
  'deliveryFinanceEvent',
  'otogrowActivityEvent',
  'deliveryReminderOutbox',
];
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
    const fixture = await createFixture(runner.manager, 'founder_rollback');
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
    const founder = new DeliveryFounderService(
      source,
      services.delivery,
      services.access,
    );
    const read = (input = {}, person = people.admin, target = workspace) =>
      founder.snapshot(target, person.memberId, person.userWorkspaceId, input);
    const denied = async (action, expected = 403) =>
      assert.rejects(action, (error) => error.getStatus?.() === expected);
    const tasks = {
      blocked: randomUUID(),
      review: randomUUID(),
      approved: randomUUID(),
      foreign: randomUUID(),
    };
    for (const [name, id] of Object.entries(tasks)) {
      const state =
        name === 'review'
          ? 'IN_REVIEW'
          : name === 'approved'
            ? 'APPROVED'
            : 'BLOCKED';
      await runner.query(
        `INSERT INTO "${schemaName}".task(id,title,"assigneeId","dueAt","updatedAt") VALUES($1,$2,$3,$4,'2020-02-01')`,
        [
          id,
          `Synthetic ${name}`,
          people.reader.memberId,
          name === 'review' ? '2099-01-01' : '2000-01-01',
        ],
      );
      await runner.query(
        'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details,revision,"updatedAt") VALUES($1,$2,$3,$4,1,\'2020-03-01\')',
        [
          name === 'foreign' ? fixture.foreignWorkspaceId : workspaceId,
          id,
          name === 'foreign' ? projects.foreign : projects.first,
          {
            state,
            reviewerId: people.writer.memberId,
            submissions:
              name === 'approved'
                ? [
                    {
                      version: 1,
                      decision: 'APPROVED',
                      reviewedAt: '2020-01-01T00:00:00.000Z',
                      reviewedBy: people.writer.memberId,
                      submittedBy: people.reader.memberId,
                      submittedAt: '2019-12-31T00:00:00.000Z',
                      description: 'PRIVATE_SUBMISSION',
                      evidence: [],
                    },
                  ]
                : [],
            events: [{ text: 'PRIVATE_TASK_EVENT' }],
            brief: 'PRIVATE_TASK_BRIEF',
          },
        ],
      );
    }
    const operations = newDeliveryOperations();
    const engagementId = randomUUID(),
      periodId = randomUUID(),
      lineId = randomUUID(),
      reportId = randomUUID();
    operations.clients = {
      engagements: [
        {
          id: engagementId,
          projectId: projects.first,
          companyId: (
            await runner.query(
              'SELECT "companyId" FROM core."deliveryProject" WHERE id=$1',
              [projects.first],
            )
          )[0].companyId,
          name: 'Synthetic client',
          services: ['Performance marketing'],
          advertising: {
            managerId: people.admin.memberId,
            marketerId: people.writer.memberId,
            channel: 'META',
          },
        },
      ],
      links: [],
      submissions: [],
    };
    operations.business = {
      records: [
        {
          id: reportId,
          revision: 1,
          kind: 'AD_REPORT',
          projectId: projects.first,
          title: 'Synthetic campaign review',
          status: 'REVIEW',
          date: '2020-02-01',
          currency: 'USD',
          marketerId: people.writer.memberId,
          updatedAt: '2020-02-02T00:00:00.000Z',
          recommendation: 'PRIVATE_RECOMMENDATION',
          history: [{ note: 'PRIVATE_HISTORY' }],
        },
      ],
      inbox: [{ text: 'PRIVATE_INBOX' }],
      seen: {},
    };
    await runner.query(
      'INSERT INTO core."deliveryOperations" ("workspaceId",state) VALUES($1,$2)',
      [workspaceId, operations],
    );
    await runner.query(
      'INSERT INTO core."deliveryCommitmentPeriod" (id,"workspaceId","engagementId","projectId","clientId",label,billing,"startDate","endDateExclusive",timezone,state,revision) VALUES($1,$2,$3,$4,$5,\'Synthetic ended period\',\'RETAINER\',\'2020-01-01\',\'2020-02-01\',\'Asia/Qatar\',\'ACTIVE\',1)',
      [
        periodId,
        workspaceId,
        engagementId,
        projects.first,
        operations.clients.engagements[0].companyId,
      ],
    );
    await runner.query(
      'INSERT INTO core."deliveryCommitmentLine" (id,"workspaceId","periodId",label,unit,"promisedQuantity",revision) VALUES($1,$2,$3,\'Synthetic videos\',\'UNIQUE_VIDEO\',2,1)',
      [lineId, workspaceId, periodId],
    );
    for (const [kind, amount] of [
      ['REVENUE', '50000000'],
      ['COST', '100000000'],
    ]) {
      const id = randomUUID();
      await runner.query(
        'INSERT INTO core."deliveryFinanceEntry" (id,"workspaceId",month,kind,category,title,currency,"amountMicros",note,status,"sourceType","createdBy","postedBy","postedAt") VALUES($1,$2,\'2020-01\',$3,\'Synthetic\',\'Synthetic monthly source\',\'USD\',$4,\'PRIVATE_FINANCE_NOTE\',\'POSTED\',\'MANUAL\',$5,$5,now())',
        [id, workspaceId, kind, amount, people.admin.memberId],
      );
      await runner.query(
        'INSERT INTO core."deliveryFinanceAllocation" (id,"workspaceId","entryId",bucket,"projectId","projectName","amountMicros") VALUES($1,$2,$3,$4::text,$4::uuid,\'Synthetic client\',$5)',
        [randomUUID(), workspaceId, id, projects.first, amount],
      );
    }
    const fingerprint = async () =>
      Object.fromEntries(
        await Promise.all(
          TABLES.map(async (table) => [
            table,
            hash(
              await runner.query(
                `SELECT to_jsonb(row)::text AS value FROM core."${table}" row WHERE "workspaceId"=$1 ORDER BY id`,
                [workspaceId],
              ),
            ),
          ]),
        ),
      );
    const baseline = await fingerprint();
    const delivery = await read({ domain: 'DELIVERY', limit: 1 });
    assert.equal(delivery.totalCount, 3);
    assert.equal(delivery.items.length, 1);
    assert(delivery.nextCursor);
    const next = await read({
      domain: 'DELIVERY',
      limit: 1,
      after: delivery.nextCursor,
    });
    assert.equal(next.totalCount, 3);
    assert.equal(next.items.length, 1);
    assert.notEqual(next.items[0].key, delivery.items[0].key);
    const all = await read({
      serviceMonth: '2020-01',
      currency: 'USD',
      limit: 50,
    });
    assert.equal(all.workspaceId, workspaceId);
    assert.equal(all.memberId, people.admin.memberId);
    const blocked = all.items.find((item) => item.sourceId === tasks.blocked);
    assert(blocked && blocked.reasonCode === 'TASK_BLOCKED');
    assert(blocked.evidence.warnings.includes('TASK_OVERDUE'));
    assert.equal(
      all.items.filter((item) => item.sourceId === tasks.blocked).length,
      1,
    );
    assert.equal(blocked.ownerId, people.reader.memberId);
    assert.equal(blocked.occurredAt, '2020-03-01T00:00:00.000000Z');
    const review = all.items.find((item) => item.sourceId === tasks.review);
    assert.equal(review.ownerId, people.writer.memberId);
    assert(!all.items.some((item) => item.sourceId === tasks.foreign));
    assert.equal(
      all.items.find((item) => item.sourceId === tasks.approved).reasonCode,
      'TASK_DELIVERY_OVERDUE',
    );
    const commitment = all.items.find((item) => item.sourceId === lineId);
    assert(commitment);
    assert.equal(commitment.evidence.promisedQuantity, 2);
    assert.equal(commitment.evidence.fulfilledQuantity, 0);
    assert.equal(commitment.nextAction.engagementId, engagementId);
    assert.equal(commitment.nextAction.periodId, periodId);
    assert(
      all.items.some(
        (item) =>
          item.sourceId === reportId &&
          item.nextAction.targetType === 'MANUAL_REPORT',
      ),
    );
    assert(
      all.items.some(
        (item) =>
          item.sourceType === 'MONTHLY_RESULT' &&
          item.evidence.resultMicros === '-50000000',
      ),
    );
    assert(
      all.coverage.some(
        (item) => item.domain === 'CAMPAIGNS' && item.status === 'PARTIAL',
      ),
    );
    assert(!JSON.stringify(all).includes('PRIVATE_'));
    assert.deepEqual(
      await fingerprint(),
      baseline,
      'Snapshots cannot mutate ledgers, task/commitment state, activity or outbox.',
    );
    const delivered = {
      taskId: tasks.approved,
      status: 'WAITING',
      cycle: 1,
      deliveredSubmissionVersion: 1,
      deliveredAt: '2020-02-01T00:00:00.000Z',
      nextCheckAt: null,
      history: [
        {
          at: '2020-02-01T00:00:00.000Z',
          actorId: people.writer.memberId,
          action: 'DELIVERED',
          note: 'Synthetic delivery',
        },
      ],
    };
    const setDelivery = async (fields) => {
      operations.fulfilments = [{ ...delivered, ...fields }];
      await runner.query(
        'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
        [workspaceId, operations],
      );
      return read({ domain: 'DELIVERY' });
    };
    assert(
      !(await setDelivery({})).items.some(
        (item) => item.sourceId === tasks.approved,
      ),
    );
    assert(
      (await setDelivery({ status: 'REDOING' })).items.some(
        (item) =>
          item.sourceId === tasks.approved &&
          item.reasonCode === 'TASK_DELIVERY_OVERDUE',
      ),
    );
    assert(
      (await setDelivery({ deliveredSubmissionVersion: 2 })).items.some(
        (item) => item.sourceId === tasks.approved,
      ),
    );
    assert(
      !(
        await setDelivery({
          status: 'FULFILLED',
          history: [
            {
              at: '2020-03-01T00:00:00.000Z',
              actorId: people.writer.memberId,
              action: 'FULFILLED',
              note: 'Synthetic confirmed delivery',
            },
          ],
        })
      ).items.some((item) => item.sourceId === tasks.approved),
    );
    await setDelivery({});
    const onlyOwner = await read({
      domain: 'DELIVERY',
      ownerId: people.writer.memberId,
    });
    assert.equal(onlyOwner.totalCount, 1);
    assert.equal(onlyOwner.items[0].sourceId, tasks.review);
    const firstVersion = blocked.sourceRevision;
    await runner.query(
      `UPDATE "${schemaName}".task SET title='Synthetic native title changed',"updatedAt"='2020-04-01' WHERE id=$1`,
      [tasks.blocked],
    );
    const changed = await read({ domain: 'DELIVERY' });
    assert.notEqual(
      changed.items.find((item) => item.sourceId === tasks.blocked)
        .sourceRevision,
      firstVersion,
    );
    await denied(
      () => read({ domain: 'DELIVERY', limit: 1, after: delivery.nextCursor }),
      409,
    );
    await denied(() => read({}, people.reader));
    await denied(() => read({}, people.admin, fixture.foreignWorkspace));
    await denied(() => read({ projectId: projects.foreign }), 400);
    await runner.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, ['workspace.admin', 'finance.read']],
    );
    assert.equal(
      (await read({ domain: 'DELIVERY' }, people.reader)).memberId,
      people.reader.memberId,
    );
    await runner.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, ['finance.read']],
    );
    await denied(() => read({}, people.reader));
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.admin.userId,
    ]);
    await denied(() => read());
    console.log(
      'PASS rollback-only founder exceptions: exact source/owner/action links, consolidated tasks and native/core provenance, complete counts/keyset pages/stale cursors, ended commitment quantities, exact monthly loss, supported manual campaign evidence, explicit partial coverage, privacy, current administrator/secondary-role/revocation and read-only ledgers/outbox. No sends or persistent fixtures.',
    );
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

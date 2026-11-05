const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  createReviewFixture,
} = require('./check-delivery-creative-review-support.cjs');
const {
  sourceFingerprint,
} = require('./check-delivery-task-reads-support.cjs');
const { buildServices } = require('./check-delivery-reconciliation.cjs');
const {
  DeliveryCreativeReadsService,
} = require('../dist/modules/delivery/creative/reads/delivery-creative-reads.service');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');
const PRIVATE = 'PRIVATE_FULL_PRODUCTION_NOT_FOR_SUMMARY';
const HISTORY = 'PRIVATE_TASK_HISTORY_NOT_FOR_CREATIVE';

async function seed(manager, fixture) {
  const records = [];
  for (let index = 0; index < 65; index++) {
    const id = randomUUID();
    const referenceId = randomUUID();
    const document = newCreativeDocument();
    document.brief.concept = `${PRIVATE}:${index}`;
    document.revisionCharge = 12345;
    document.references = [
      {
        id: referenceId,
        version: 2,
        title: `Approved source ${String(index).padStart(3, '0')}`,
        url: `https://example.invalid/reference/${index}`,
        assetId: null,
        summary: 'A useful reference. '.repeat(30) + PRIVATE,
        angle: 'Product scene',
        tags: [],
        reviews: [
          {
            memberId: fixture.people.admin.memberId,
            at: '2020-02-20T00:00:00.000Z',
            decision: 'APPROVED',
            notes: 'Approved synthetic reference',
          },
        ],
      },
      {
        id: randomUUID(),
        version: 1,
        title: 'Rejected source',
        url: 'https://example.invalid/rejected',
        assetId: null,
        summary: 'Not approved',
        angle: '',
        tags: [],
        reviews: [
          {
            memberId: fixture.people.admin.memberId,
            at: '2020-02-20T00:00:00.000Z',
            decision: 'REJECTED',
            notes: '',
          },
        ],
      },
    ];
    const details = {
      brief: HISTORY,
      service: 'AI video',
      priority: 'NORMAL',
      scheduledDate: null,
      reviewerId: fixture.people.admin.memberId,
      state: 'IN_PROGRESS',
      blocker: '',
      checklist: [],
      evidence: [],
      submissions: [],
      events: [],
      creative: document,
    };
    const createdAt = [
      '2020-02-21T09:00:00.123100Z',
      '2020-02-21T09:00:00.123450Z',
      '2020-02-21T09:00:00.123900Z',
    ][index % 3];
    await manager.query(
      `INSERT INTO "${fixture.schemaName}".task(id,title,"assigneeId",status) VALUES($1,$2,$3,'IN_PROGRESS')`,
      [
        id,
        `Production ${String(index).padStart(3, '0')}${index === 0 ? ' literal%_match' : ''}`,
        fixture.people.writer.memberId,
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details,revision,"createdAt") VALUES($1,$2,$3,$4,1,$5)',
      [fixture.workspaceId, id, fixture.projects.first, details, createdAt],
    );
    records.push({ id, referenceId, createdAt });
  }
  for (let index = 0; index < 55; index++) {
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES($1,$2,$3,$4)',
      [
        randomUUID(),
        fixture.workspaceId,
        `Production project ${String(index).padStart(3, '0')}`,
        JSON.stringify([fixture.people.reader.memberId]),
      ],
    );
  }
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
    [fixture.roles.reader, []],
  );
  return records;
}
async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This checker only runs under rollback.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const originalFetch = global.fetch;
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error('External requests are forbidden.');
  };
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const originalQuery = runner.query.bind(runner);
  let readOnly = false;
  let summaries = true;
  const captured = [];
  runner.query = async (...arguments_) => {
    const sql = arguments_[0];
    if (readOnly)
      assert(
        !/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql),
        'Read attempted a write.',
      );
    const result = await originalQuery(...arguments_);
    if (readOnly) {
      assert(
        !sql.includes('deliveryOperations'),
        'Production reads hydrated Operations.',
      );
      if (summaries)
        for (const marker of [PRIVATE, HISTORY])
          assert(
            !JSON.stringify(result).includes(marker),
            `Summary SQL transferred ${marker}.`,
          );
      captured.push({ sql, parameters: arguments_[1] });
    }
    return result;
  };
  try {
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const fixture = await createReviewFixture(runner.manager, 'creative_reads');
    const records = await seed(runner.manager, fixture);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (work) => runner.manager.transaction(work),
    };
    const services = buildServices(source, fixture);
    services.delivery.snapshot = () => {
      throw new Error('Legacy workspace hydration is forbidden.');
    };
    const reads = new DeliveryCreativeReadsService(
      source,
      services.delivery,
      createIsolatedNativeTaskAccess(),
    );
    const storage = new Proxy(
      {},
      {
        get() {
          throw new Error('Media storage is not needed for this proof.');
        },
      },
    );
    const engine = new DeliveryCreativeService(
      source,
      services.delivery,
      storage,
      createIsolatedNativeTaskAccess(),
    );
    const call = (method, input = {}, person = fixture.people.reader) =>
      method === 'context'
        ? reads.context(
            fixture.workspace,
            person.memberId,
            person.userWorkspaceId,
          )
        : reads[method](
            fixture.workspace,
            person.memberId,
            person.userWorkspaceId,
            input,
          );
    const baseline = await sourceFingerprint(runner.manager, fixture);
    const unchanged = async () =>
      assert.deepEqual(
        await sourceFingerprint(runner.manager, fixture),
        baseline,
      );
    const readonly = async (work, summary = true) => {
      readOnly = true;
      summaries = summary;
      try {
        return await work();
      } finally {
        readOnly = false;
        summaries = true;
      }
    };
    const rejected = (work, statuses = [400, 403, 404, 409]) =>
      assert.rejects(work, (error) => statuses.includes(error.getStatus?.()));
    const isolate = async (name, work) => {
      assert.match(name, /^[a-z_]+$/);
      await runner.query(`SAVEPOINT ${name}`);
      try {
        await work();
      } finally {
        readOnly = false;
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
      await unchanged();
    };
    const context = await readonly(() => call('context'));
    assert.equal(context.actor.memberId, fixture.people.reader.memberId);
    assert(!('tasks' in context));
    const taskPages = [],
      taskIds = [];
    let after = null;
    do {
      const page = await readonly(() =>
        call('tasks', { projectId: fixture.projects.first, limit: 25, after }),
      );
      assert.equal(page.totalCount, 66);
      taskPages.push(page.items.length);
      taskIds.push(...page.items.map((item) => item.id));
      after = page.nextCursor;
    } while (after);
    assert.deepEqual(taskPages, [25, 25, 16]);
    assert.equal(new Set(taskIds).size, 66);
    const expected = await runner.query(
      'SELECT "taskId" AS id FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY "createdAt" DESC,"taskId" DESC',
      [fixture.workspaceId, fixture.projects.first],
    );
    assert.deepEqual(
      taskIds,
      expected.map((item) => item.id),
    );
    const firstPage = await readonly(() =>
      call('tasks', { projectId: fixture.projects.first, limit: 25 }),
    );
    const otherPersonCursor = firstPage.nextCursor;
    await readonly(() =>
      rejected(
        () =>
          call(
            'tasks',
            { projectId: fixture.projects.first, after: otherPersonCursor },
            fixture.people.writer,
          ),
        [400],
      ),
    );
    await readonly(() =>
      rejected(
        () =>
          call('tasks', {
            projectId: fixture.projects.first,
            after: otherPersonCursor,
            mine: true,
          }),
        [400],
      ),
    );
    const literal = await readonly(() =>
      call('tasks', { search: 'literal%_match' }),
    );
    assert.equal(literal.totalCount, 1);
    assert.equal(literal.items[0].id, records[0].id);
    const referencePages = [],
      referenceIds = [];
    after = null;
    do {
      const page = await readonly(() =>
        call('references', { taskId: fixture.taskId, limit: 25, after }),
      );
      assert.equal(page.totalCount, 65);
      assert(
        page.items.every(
          (item) => item.summaryTruncated && item.summaryPreview.length <= 300,
        ),
      );
      referencePages.push(page.items.length);
      referenceIds.push(...page.items.map((item) => item.id));
      after = page.nextCursor;
    } while (after);
    assert.deepEqual(referencePages, [25, 25, 15]);
    assert.equal(new Set(referenceIds).size, 65);
    const projectIds = [];
    after = null;
    do {
      const page = await readonly(() => call('projects', { limit: 25, after }));
      projectIds.push(...page.items.map((item) => item.id));
      after = page.nextCursor;
    } while (after);
    assert.equal(new Set(projectIds).size, projectIds.length);
    assert(projectIds.length >= 56);
    const exact = await readonly(
      () => call('detail', { taskId: records[0].id }),
      false,
    );
    assert(exact.document.brief.concept.includes(PRIVATE));
    assert.equal(exact.document.revisionCharge, 0);
    const legacyExact = await readonly(
      () =>
        engine.read(
          fixture.workspace,
          fixture.people.reader.memberId,
          fixture.people.reader.userWorkspaceId,
          records[0].id,
        ),
      false,
    );
    assert.equal(legacyExact.document.revisionCharge, 0);
    assert(!JSON.stringify(exact).includes(HISTORY));
    const administrator = await readonly(
      () => call('detail', { taskId: records[0].id }, fixture.people.admin),
      false,
    );
    assert.equal(administrator.document.revisionCharge, 12345);
    await readonly(() =>
      rejected(() => call('state', { taskId: fixture.foreignTaskId })),
    );
    await readonly(() =>
      rejected(() => call('references', { taskId: fixture.otherTaskId })),
    );
    await unchanged();
    await isolate('native_deleted', async () => {
      await runner.query(
        `UPDATE "${fixture.schemaName}".task SET "deletedAt"=now() WHERE id=$1`,
        [records[0].id],
      );
      await readonly(() =>
        rejected(() => call('detail', { taskId: records[0].id })),
      );
      const page = await readonly(() =>
        call('tasks', { projectId: fixture.projects.first }),
      );
      assert.equal(page.totalCount, 65);
      const references = await readonly(() =>
        call('references', { taskId: fixture.taskId }),
      );
      assert.equal(references.totalCount, 64);
    });
    await isolate('member_revoked', async () => {
      await runner.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
        [fixture.people.reader.userWorkspaceId],
      );
      await readonly(() => rejected(() => call('context'), [403]));
      await readonly(() =>
        rejected(() => call('state', { taskId: records[0].id }), [403]),
      );
    });
    await isolate('project_revoked', async () => {
      await runner.query(
        'UPDATE core."deliveryProject" SET "memberIds"=$2,revision=revision+1 WHERE id=$1',
        [
          fixture.projects.first,
          JSON.stringify([fixture.people.writer.memberId]),
        ],
      );
      await readonly(() =>
        rejected(() => call('state', { taskId: records[0].id })),
      );
      await readonly(() =>
        rejected(() =>
          call('tasks', {
            projectId: fixture.projects.first,
            after: firstPage.nextCursor,
          }),
        ),
      );
    });
    await isolate('cursor_changed', async () => {
      await runner.query(
        'UPDATE core."deliveryTask" SET revision=revision+1 WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, records[0].id],
      );
      await readonly(() =>
        rejected(
          () =>
            call('tasks', {
              projectId: fixture.projects.first,
              after: firstPage.nextCursor,
            }),
          [400],
        ),
      );
    });
    await isolate('real_reuse', async () => {
      const person = fixture.people.writer;
      const saved = await engine.command(
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        {
          action: 'reuseReference',
          taskId: records[0].id,
          revision: 1,
          sourceTaskId: records[1].id,
          referenceId: records[1].referenceId,
        },
      );
      assert.equal(saved.revision, 2);
      const reused = saved.document.references.find(
        (reference) => reference.sourceReferenceId === records[1].referenceId,
      );
      assert(reused);
      assert.deepEqual(reused.reviews, []);
      const state = await call('state', { taskId: records[0].id }, person);
      assert.equal(state.task.revision, 2);
      await rejected(
        () =>
          engine.command(
            fixture.workspace,
            person.memberId,
            person.userWorkspaceId,
            {
              action: 'reuseReference',
              taskId: records[0].id,
              revision: 1,
              sourceTaskId: records[1].id,
              referenceId: records[1].referenceId,
            },
          ),
        [409],
      );
    });
    await unchanged();
    assert.equal(networkCalls, 0);
    console.log(
      JSON.stringify({
        result: 'PASS',
        rollbackOnly: true,
        taskPages,
        referencePages,
        projectCount: projectIds.length,
        exactMicroseconds: true,
        readOnlyQueries: captured.length,
        nativeDeletionAndMembershipScope: true,
        noBroadSnapshots: true,
        realReferenceReuseNeedsReview: true,
        scopeRevocation: true,
        networkCalls,
        paidCalls: 0,
      }),
    );
  } finally {
    runner.query = originalQuery;
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
    global.fetch = originalFetch;
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

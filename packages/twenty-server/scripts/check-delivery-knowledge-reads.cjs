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
  DeliveryKnowledgeService,
} = require('../dist/modules/delivery/knowledge/delivery-knowledge.service');
const {
  DeliveryKnowledgeReadsService,
} = require('../dist/modules/delivery/knowledge/reads/delivery-knowledge-reads.service');
const {
  DeliveryKnowledgeSourceEntity,
} = require('../dist/modules/delivery/knowledge/entities/delivery-knowledge-source.entity');
const RAW = 'PRIVATE_KNOWLEDGE_RAW_NOTES';
const DRAFT = 'PRIVATE_UNPUBLISHED_KNOWLEDGE';
const PRIVATE_URL = 'private-knowledge-source.invalid';

async function seed(manager, fixture) {
  fixture.knowledgeProjects = [];
  for (let index = 0; index < 55; index++) {
    const id = randomUUID();
    fixture.knowledgeProjects.push(id);
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES($1,$2,$3,$4)',
      [
        id,
        fixture.workspaceId,
        `Knowledge directory ${String(index).padStart(3, '0')}`,
        JSON.stringify(
          index < 53
            ? [fixture.people.reader.memberId]
            : [fixture.people.writer.memberId],
        ),
      ],
    );
  }
  fixture.knowledgeSources = [];
  for (let index = 0; index < 65; index++) {
    const source = {
      id: randomUUID(),
      workspaceId: fixture.workspaceId,
      projectId: fixture.projects.first,
      createdBy: fixture.people.writer.memberId,
      published: true,
      index,
      createdAt: [
        '2020-02-21T09:00:00.123100Z',
        '2020-02-21T09:00:00.123450Z',
        '2020-02-21T09:00:00.123900Z',
      ][index % 3],
    };
    fixture.knowledgeSources.push(source);
    await seedSource(manager, source);
  }
  fixture.readerDraft = {
    ...fixture.knowledgeSources[0],
    id: randomUUID(),
    createdBy: fixture.people.reader.memberId,
    published: false,
    index: 100,
  };
  fixture.writerDraft = {
    ...fixture.knowledgeSources[0],
    id: randomUUID(),
    published: false,
    index: 101,
  };
  fixture.otherProjectSource = {
    ...fixture.knowledgeSources[0],
    id: randomUUID(),
    projectId: fixture.projects.otherClient,
    index: 102,
  };
  fixture.foreignSource = {
    ...fixture.knowledgeSources[0],
    id: randomUUID(),
    workspaceId: fixture.foreignWorkspaceId,
    projectId: fixture.projects.foreign,
    index: 103,
  };
  for (const source of [
    fixture.readerDraft,
    fixture.writerDraft,
    fixture.otherProjectSource,
    fixture.foreignSource,
  ])
    await seedSource(manager, source);
}
async function seedSource(manager, source) {
  await manager.query(
    'INSERT INTO core."deliveryKnowledgeSource" (id,"workspaceId","projectId","createdBy",revision,"currentVersion","publishedVersion","publishedAt","publishedBy","createdAt") VALUES($1,$2,$3,$4,2,2,$5,$6,$7,$8)',
    [
      source.id,
      source.workspaceId,
      source.projectId,
      source.createdBy,
      source.published ? 1 : null,
      source.published ? source.createdAt : null,
      source.published ? source.createdBy : null,
      source.createdAt,
    ],
  );
  for (const version of [1, 2])
    await manager.query(
      'INSERT INTO core."deliveryKnowledgeVersion" (id,"workspaceId","sourceId",version,title,category,"meetingDate","sourceUrl",transcript,knowledge,"createdBy","createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [
        randomUUID(),
        source.workspaceId,
        source.id,
        version,
        `${version === 1 ? 'Published' : 'Current'} source ${source.index}`,
        source.index % 2 === 0 ? 'MEETING' : 'BRAND_FACTS',
        '2026-10-31',
        `https://${PRIVATE_URL}/${source.id}`,
        `${RAW}:${source.id}:` + 'x'.repeat(source.index === 0 ? 190000 : 100),
        version === 1
          ? `Approved facts ${source.index}${source.index === 0 ? ' literal%match' : ''}`
          : `${DRAFT}:${source.index}`,
        source.createdBy,
        source.createdAt,
      ],
    );
}

async function main() {
  assert.equal(process.argv.length, 2, 'This local checker always rolls back.');
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const originalFetch = global.fetch;
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error('Network is forbidden in knowledge read acceptance.');
  };
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const originalQuery = runner.query.bind(runner);
  const originalRepository = runner.manager.getRepository.bind(runner.manager);
  let readOnly = false;
  let summaries = false;
  let failActivity = false;
  let hideSourceId = null;
  const captured = [];
  runner.query = async (...arguments_) => {
    const [sql] = arguments_;
    if (readOnly) {
      assert(
        !/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql),
        'Read attempted a write.',
      );
      assert(
        !sql.includes('deliveryOperations') && !sql.includes('deliveryTask'),
        'Knowledge reads must not hydrate legacy workspace/Operations/task state.',
      );
    }
    if (
      failActivity &&
      /^\s*INSERT\b/i.test(sql) &&
      sql.includes('otogrowActivityEvent')
    )
      throw new Error('Synthetic activity insertion failure');
    const result = await originalQuery(...arguments_);
    if (readOnly)
      captured.push({ sql, parameters: arguments_[1], result, summaries });
    return result;
  };
  runner.manager.getRepository = (entity) => {
    const repository = originalRepository(entity);
    if (entity !== DeliveryKnowledgeSourceEntity) return repository;
    return new Proxy(repository, {
      get(target, property) {
        if (property === 'findOneBy')
          return async (where) => {
            if (
              hideSourceId &&
              where.id === hideSourceId &&
              Object.keys(where).length === 1
            )
              return null;
            return target.findOneBy(where);
          };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
  try {
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const fixture = await createReviewFixture(
      runner.manager,
      'knowledge_reads_rollback',
    );
    await seed(runner.manager, fixture);
    const { workspace, workspaceId, people, projects } = fixture;
    let transactionTail = Promise.resolve();
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (work) => {
        const result = transactionTail.then(() =>
          runner.manager.transaction(work),
        );
        transactionTail = result.catch(() => undefined);
        return result;
      },
    };
    const services = buildServices(source, fixture);
    services.delivery.snapshot = () => {
      throw new Error('Legacy workspace must not run.');
    };
    const reads = new DeliveryKnowledgeReadsService(source, services.delivery);
    const engine = new DeliveryKnowledgeService(source, services.delivery);
    const call = (
      method,
      input = {},
      person = people.reader,
      targetWorkspace = workspace,
    ) =>
      reads[method](
        targetWorkspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const baseline = await sourceFingerprint(runner.manager, fixture);
    const unchanged = async () =>
      assert.deepEqual(
        await sourceFingerprint(runner.manager, fixture),
        baseline,
        'Original core/native/access/finance/knowledge/Operations sources changed.',
      );
    const readonly = async (work, summary = true) => {
      const start = captured.length;
      readOnly = true;
      summaries = summary;
      try {
        const result = await work();
        if (summary)
          for (const entry of captured.slice(start)) {
            for (const secret of [RAW, DRAFT, PRIVATE_URL])
              assert(
                !JSON.stringify(entry.result).includes(secret),
                `Summary SQL transferred ${secret}.`,
              );
            assert(
              !/\b(?:s|v)\s*\.\s*\*/i.test(entry.sql),
              'Summary selected entire knowledge entities.',
            );
          }
        return result;
      } finally {
        readOnly = false;
        summaries = false;
      }
    };
    const isolate = async (name, work) => {
      assert.match(name, /^[a-z_]+$/);
      await runner.query(`SAVEPOINT ${name}`);
      try {
        await work();
      } finally {
        failActivity = false;
        hideSourceId = null;
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
      await unchanged();
    };
    const rejected = (work, statuses = [400, 403, 404, 409]) =>
      assert.rejects(work, (error) => statuses.includes(error.getStatus?.()));
    const context = await readonly(() => call('context'));
    assert.equal(context.selectedProject, null);
    for (const heavy of [
      'tasks',
      'companies',
      'members',
      'projects',
      'items',
      'detail',
    ])
      assert(!(heavy in context));
    const selected = await readonly(() =>
      call('context', { projectId: projects.first }),
    );
    assert.equal(selected.selectedProject.id, projects.first);
    const projectPages = [];
    let after;
    do {
      const page = await readonly(() =>
        call('projects', { search: 'Knowledge directory', limit: 25, after }),
      );
      assert.equal(page.totalCount, 53);
      projectPages.push(page);
      after = page.nextCursor;
    } while (after);
    assert.deepEqual(
      projectPages.map((page) => page.items.length),
      [25, 25, 3],
    );
    assert.equal(
      new Set(projectPages.flatMap((page) => page.items.map((item) => item.id)))
        .size,
      53,
    );
    assert.equal(
      (
        await readonly(() =>
          call('projects', { search: 'Knowledge directory' }, people.admin),
        )
      ).totalCount,
      55,
    );
    const expected = await runner.query(
      'SELECT id FROM core."deliveryKnowledgeSource" WHERE "workspaceId"=$1 AND "projectId"=$2 AND ("publishedVersion" IS NOT NULL OR "createdBy"=$3) ORDER BY "createdAt" DESC,id DESC',
      [workspaceId, projects.first, people.reader.memberId],
    );
    const sourcePages = [];
    after = undefined;
    do {
      const page = await readonly(() =>
        call('list', { projectId: projects.first, limit: 25, after }),
      );
      assert.equal(page.totalCount, 66);
      sourcePages.push(page);
      after = page.nextCursor;
    } while (after);
    assert.deepEqual(
      sourcePages.map((page) => page.items.length),
      [25, 25, 16],
    );
    assert.deepEqual(
      sourcePages.flatMap((page) => page.items.map((item) => item.id)),
      expected.map((row) => row.id),
    );
    assert(sourcePages[0].nextCursor);
    assert(
      /\.123(?:100|450|900)Z/.test(
        Buffer.from(sourcePages[0].nextCursor, 'base64url').toString(),
      ),
    );
    assert(
      sourcePages
        .flatMap((page) => page.items)
        .filter((item) => item.id !== fixture.readerDraft.id)
        .every((item) => item.version === 1 && !item.canEdit),
    );
    const catalogProjection = captured.find(
      (entry) =>
        entry.sql.includes('AS "createdAtKey"') &&
        entry.sql.includes('LIMIT $9'),
    );
    assert(catalogProjection);
    for (const field of ['transcript', 'v.knowledge', 'v."sourceUrl"'])
      assert(!catalogProjection.sql.split('FROM')[0].includes(field));
    const projectionResult = Array.isArray(catalogProjection.result)
      ? catalogProjection.result
      : catalogProjection.result.records;
    assert(projectionResult.length <= 26);
    assert.equal(
      (
        await readonly(() =>
          call('list', { projectId: projects.first, search: RAW }),
        )
      ).totalCount,
      0,
    );
    assert.equal(
      (
        await readonly(() =>
          call('list', { projectId: projects.first, search: `${DRAFT}:0` }),
        )
      ).totalCount,
      0,
    );
    assert.equal(
      (
        await readonly(() =>
          call(
            'list',
            { projectId: projects.first, search: `${DRAFT}:0` },
            people.writer,
          ),
        )
      ).totalCount,
      1,
    );
    assert.equal(
      (
        await readonly(() =>
          call('list', { projectId: projects.first, search: '%' }),
        )
      ).totalCount,
      1,
    );
    assert.equal(
      (
        await readonly(() =>
          call('list', { projectId: projects.first, category: 'MEETING' }),
        )
      ).totalCount,
      34,
    );
    const target = fixture.knowledgeSources[0];
    const input = { projectId: projects.first, sourceId: target.id };
    const state = await readonly(() => call('state', input));
    assert.equal(state.source.canEdit, false);
    assert.equal(state.source.version, 1);
    assert(!('transcript' in state.source) && !('knowledge' in state.source));
    const published = await readonly(() => call('detail', input));
    assert.equal(published.detail.sourceUrl, '');
    assert.equal(published.detail.transcript, null);
    assert.equal(published.detail.knowledge, 'Approved facts 0 literal%match');
    const author = await readonly(
      () => call('detail', input, people.writer),
      false,
    );
    assert(author.detail.transcript.startsWith(RAW));
    assert.equal(author.detail.version, 2);
    assert.equal(
      (
        await readonly(
          () => call('detail', { ...input, version: 1 }, people.writer),
          false,
        )
      ).detail.version,
      1,
    );
    assert.equal(
      (await readonly(() => call('detail', { ...input, version: 2 }))).detail,
      null,
    );
    assert.equal(
      (
        await readonly(() =>
          call('state', { ...input, sourceId: fixture.writerDraft.id }),
        )
      ).source,
      null,
    );
    assert.equal(
      (
        await readonly(() =>
          call('state', { ...input, sourceId: fixture.foreignSource.id }),
        )
      ).source,
      null,
    );
    assert.equal(
      (
        await readonly(() =>
          call('detail', { ...input, sourceId: randomUUID() }),
        )
      ).detail,
      null,
    );
    await rejected(() =>
      call('detail', { ...input, projectId: projects.otherClient }),
    );
    await rejected(() =>
      call(
        'context',
        {},
        { ...people.reader, userWorkspaceId: people.writer.userWorkspaceId },
      ),
    );
    await rejected(() =>
      call(
        'list',
        { projectId: projects.first, after: sourcePages[0].nextCursor },
        people.writer,
      ),
    );
    await rejected(() =>
      call('list', {
        projectId: projects.first,
        search: 'changed',
        after: sourcePages[0].nextCursor,
      }),
    );
    await unchanged();

    await isolate('publication_change', async () => {
      await engine.publish(
        workspace,
        people.admin.memberId,
        people.admin.userWorkspaceId,
        {
          id: target.id,
          projectId: projects.first,
          revision: 2,
          publish: true,
        },
      );
      await rejected(
        () =>
          call('list', {
            projectId: projects.first,
            after: sourcePages[0].nextCursor,
          }),
        [400],
      );
      assert.equal((await call('state', input)).source.version, 2);
      assert.equal(
        (await call('detail', { ...input, version: 1 })).detail,
        null,
      );
      await engine.publish(
        workspace,
        people.admin.memberId,
        people.admin.userWorkspaceId,
        {
          id: target.id,
          projectId: projects.first,
          revision: 3,
          publish: false,
        },
      );
      assert.equal((await call('state', input)).source, null);
      assert.equal((await call('detail', input)).detail, null);
    });
    await isolate('role_loss', async () => {
      await runner.query(
        'UPDATE core."otogrowRole" SET capabilities=$2,revision=revision+1 WHERE id=$1',
        [fixture.roles.reader, ['delivery.manage']],
      );
      assert.equal((await call('state', input)).source.canEdit, true);
      assert((await call('detail', input)).detail.transcript.startsWith(RAW));
      const managerPage = await call('list', { projectId: projects.first });
      await runner.query(
        'UPDATE core."otogrowRole" SET capabilities=$2,revision=revision+1 WHERE id=$1',
        [fixture.roles.reader, []],
      );
      assert.equal((await call('state', input)).source.canEdit, false);
      assert.equal((await call('detail', input)).detail.transcript, null);
      await rejected(
        () =>
          call('list', {
            projectId: projects.first,
            after: managerPage.nextCursor,
          }),
        [400],
      );
    });
    await isolate('project_loss', async () => {
      await runner.query(
        'UPDATE core."deliveryProject" SET "memberIds"=$3,revision=revision+1 WHERE "workspaceId"=$1 AND id=$2',
        [workspaceId, projects.first, JSON.stringify([people.writer.memberId])],
      );
      for (const method of ['context', 'list', 'state', 'detail'])
        await rejected(
          () =>
            call(
              method,
              method === 'context' || method === 'list'
                ? { projectId: projects.first }
                : input,
            ),
          [403],
        );
    });
    await isolate('inactive_identity', async () => {
      await runner.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
        [people.reader.userWorkspaceId],
      );
      for (const method of ['context', 'projects', 'list', 'state', 'detail'])
        await rejected(
          () =>
            call(
              method,
              ['context', 'projects'].includes(method)
                ? {}
                : method === 'list'
                  ? { projectId: projects.first }
                  : input,
            ),
          [403],
        );
    });
    await isolate('project_page_changed', async () => {
      await runner.query(
        'UPDATE core."deliveryProject" SET name=name || $2,revision=revision+1 WHERE id=$1',
        [fixture.knowledgeProjects[0], ' changed'],
      );
      await rejected(
        () =>
          call('projects', {
            search: 'Knowledge directory',
            after: projectPages[0].nextCursor,
          }),
        [400],
      );
    });
    const saveBody = {
      id: randomUUID(),
      projectId: projects.first,
      revision: 0,
      title: 'Checked new meeting',
      category: 'MEETING',
      meetingDate: '2026-10-31',
      sourceUrl: '',
      transcript: 'Synthetic evidence only',
      knowledge: 'Synthetic reviewed knowledge',
    };
    await isolate('create_retry', async () => {
      const results = await Promise.allSettled([
        engine.save(
          workspace,
          people.reader.memberId,
          people.reader.userWorkspaceId,
          saveBody,
        ),
        engine.save(
          workspace,
          people.reader.memberId,
          people.reader.userWorkspaceId,
          saveBody,
        ),
      ]);
      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      assert.equal(
        results.filter(
          (result) =>
            result.status === 'rejected' && result.reason.getStatus?.() === 409,
        ).length,
        1,
      );
      assert.equal(
        (
          await runner.query(
            'SELECT * FROM core."deliveryKnowledgeVersion" WHERE "workspaceId"=$1 AND "sourceId"=$2',
            [workspaceId, saveBody.id],
          )
        ).length,
        1,
      );
      assert.equal(
        (await call('state', { ...input, sourceId: saveBody.id })).source
          .revision,
        1,
      );
      await rejected(
        () =>
          call('list', {
            projectId: projects.first,
            after: sourcePages[0].nextCursor,
          }),
        [400],
      );
      await rejected(
        () =>
          engine.save(
            workspace,
            people.reader.memberId,
            people.reader.userWorkspaceId,
            saveBody,
          ),
        [409],
      );
    });
    await isolate('foreign_insert_collision', async () => {
      const before = await runner.query(
        'SELECT to_jsonb(s)::text value FROM core."deliveryKnowledgeSource" s WHERE id=$1',
        [fixture.foreignSource.id],
      );
      hideSourceId = fixture.foreignSource.id;
      await rejected(
        () =>
          engine.save(
            workspace,
            people.reader.memberId,
            people.reader.userWorkspaceId,
            { ...saveBody, id: fixture.foreignSource.id },
          ),
        [409],
      );
      hideSourceId = null;
      assert.deepEqual(
        await runner.query(
          'SELECT to_jsonb(s)::text value FROM core."deliveryKnowledgeSource" s WHERE id=$1',
          [fixture.foreignSource.id],
        ),
        before,
      );
    });
    await isolate('activity_atomicity', async () => {
      failActivity = true;
      await assert.rejects(
        () =>
          engine.save(
            workspace,
            people.reader.memberId,
            people.reader.userWorkspaceId,
            saveBody,
          ),
        /Synthetic activity/,
      );
      failActivity = false;
      assert.equal(
        (await call('state', { ...input, sourceId: saveBody.id })).source,
        null,
      );
      assert.equal(
        (
          await runner.query(
            'SELECT id FROM core."deliveryKnowledgeVersion" WHERE "sourceId"=$1',
            [saveBody.id],
          )
        ).length,
        0,
      );
    });
    await unchanged();
    assert.equal(networkCalls, 0);
    console.log(
      JSON.stringify({
        result: 'PASS',
        rollbackOnly: true,
        projectPages: projectPages.map((page) => page.items.length),
        sourcePages: sourcePages.map((page) => page.items.length),
        sourceCount: 66,
        microsecondAndTieOrdering: true,
        hiddenRawEvidenceOnSummarySql: true,
        searchBeforeCounts: true,
        exactPublishedHistoricalVisibility: true,
        revokedRoleProjectIdentity: true,
        cursorSourceSetInvalidation: true,
        sourceWritesDuringReads: false,
        createOverlap:
          'One serialized outer rollback connection; not an independent-session concurrency claim.',
        lateGlobalCollision:
          'Forced earlier absence then actual strict INSERT against a foreign global primary key; no foreign update.',
        activityRollback: true,
        networkCalls,
        paidCalls: 0,
      }),
    );
  } finally {
    runner.query = originalQuery;
    runner.manager.getRepository = originalRepository;
    await runner.rollbackTransaction();
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

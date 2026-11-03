const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const { createFixture } = require('./check-delivery-reconciliation.cjs');
const {
  originalDigest,
  fingerprint,
  deny,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliverySeoResultsService,
} = require('../dist/modules/delivery/seo-results/delivery-seo-results.service');

const metric = (overrides = {}) => ({
  id: randomUUID(),
  key: 'CLICKS',
  label: 'Organic web clicks',
  unit: 'COUNT',
  value: '0',
  unknownReason: '',
  source: 'SEARCH_CONSOLE',
  sourceUrl: 'https://example.invalid/report-evidence',
  property: 'https://example.invalid/',
  segment: 'Web · all countries · all devices',
  definition: 'Organic web search clicks; paid clicks excluded.',
  observedAt: '2020-03-01T12:00:00Z',
  ...overrides,
});
const body = (fixture, overrides = {}) => ({
  title: 'FIXTURE February SEO results',
  ownerId: fixture.people.writer.memberId,
  period: 'MONTHLY',
  periodStart: '2020-02-01',
  periodEnd: '2020-02-29',
  timezone: 'Asia/Qatar',
  summary: 'FIXTURE documented work and measured results are distinct.',
  workNotes: 'FIXTURE public-page checks do not establish indexing or ranking.',
  tasks: fixture.taskId ? [{ taskId: fixture.taskId, revision: 1 }] : [],
  evidence: [],
  metrics: [metric()],
  comparisonId: null,
  comparisonVersion: null,
  ...overrides,
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
  return { access, seo: new DeliverySeoResultsService(source, access) };
}
async function seedSeoFixture(manager, prefix = 'seo_results_check') {
  const fixture = await createFixture(manager, prefix);
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
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$2::jsonb WHERE id=$1',
    [
      fixture.projects.first,
      JSON.stringify([
        fixture.people.writer.memberId,
        fixture.people.secondWriter.memberId,
      ]),
    ],
  );
  await manager.query(
    `CREATE TABLE "${fixture.schemaName}".task (id uuid PRIMARY KEY,title text,"assigneeId" uuid,"deletedAt" timestamptz)`,
  );
  fixture.taskId = randomUUID();
  await manager.query(
    `INSERT INTO "${fixture.schemaName}".task (id,title,"assigneeId") VALUES ($1,'FIXTURE approved SEO work',$2)`,
    [fixture.taskId, fixture.people.writer.memberId],
  );
  await manager.query(
    'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",revision,details) VALUES ($1,$2,$3,1,$4)',
    [
      fixture.workspaceId,
      fixture.taskId,
      fixture.projects.first,
      JSON.stringify({
        service: 'SEO',
        state: 'APPROVED',
        submissions: [{ version: 1, decision: 'APPROVED' }],
      }),
    ],
  );
  fixture.verificationRunId = randomUUID();
  await manager.query(
    'INSERT INTO core."deliveryAgentRun" (id,"workspaceId","requestId","taskId","agentId","initiatorId","userWorkspaceId","taskRevision","agentVersion",configuration,context,status,result,activity,decision) VALUES ($1,$2,$3,$4,$5,$6,$7,1,1,$8,\'{}\'::jsonb,\'SUCCEEDED\',$9,\'[]\'::jsonb,$10)',
    [
      fixture.verificationRunId,
      fixture.workspaceId,
      randomUUID(),
      fixture.taskId,
      randomUUID(),
      fixture.people.writer.memberId,
      fixture.people.writer.userWorkspaceId,
      JSON.stringify({
        kind: 'SEO',
        name: 'FIXTURE terminal public-page verification',
        enabled: false,
        modelId: null,
      }),
      JSON.stringify({
        summary:
          'FIXTURE backlink observed in fetched HTML. This does not establish indexing or ranking.',
        findings: [],
        suggestedBrief: null,
        suggestedCopy: null,
      }),
      JSON.stringify({
        action: 'ACCEPT',
        memberId: fixture.people.reader.memberId,
        at: '2020-03-01T12:00:00Z',
        field: null,
      }),
    ],
  );
  return fixture;
}
async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Rollback-only; no live or committed fixture mode.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const fetchBefore = global.fetch;
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error('Provider/network calls are forbidden in SEO acceptance.');
  };
  let runner;
  let before;
  let checks = 0;
  try {
    await connectionSource.initialize();
    before = await originalDigest((...arguments_) =>
      connectionSource.query(...arguments_),
    );
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const query = runner.query.bind(runner);
    let reading = false;
    let light = false;
    let failActivity = false;
    runner.query = async (...arguments_) => {
      const sql = arguments_[0];
      if (reading)
        assert(
          !/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|MERGE)\b/i.test(
            sql,
          ),
          'A source read attempted to write.',
        );
      if (light && /^\s*SELECT/i.test(sql))
        assert(
          !sql.includes('deliverySeoVersion') &&
            !sql.includes('deliverySeoEvent'),
          'A light source check loaded report bodies or history.',
        );
      if (/^\s*SELECT/i.test(sql))
        assert(
          !sql.includes('deliveryOperations'),
          'SEO must not hydrate the broad legacy Operations document.',
        );
      if (
        failActivity &&
        /^\s*INSERT/i.test(sql) &&
        sql.includes('otogrowActivityEvent')
      ) {
        failActivity = false;
        throw new Error('FIXTURE atomic SEO activity failure');
      }
      return query(...arguments_);
    };
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const fixture = await seedSeoFixture(runner.manager);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (operation) => runner.manager.transaction(operation),
    };
    const { seo } = services(source, fixture);
    const writer = fixture.people.writer;
    const manager = fixture.people.reader;
    const staff = fixture.people.secondWriter;
    const call = (
      method,
      input,
      actor = writer,
      workspace = fixture.workspace,
    ) => seo[method](workspace, actor.memberId, actor.userWorkspaceId, input);
    const read = async (method, input, actor = writer, isLight = false) => {
      assert(!reading);
      reading = true;
      light = isLight;
      try {
        return await call(method, input, actor);
      } finally {
        reading = false;
        light = false;
      }
    };
    const command = (overrides = {}) => ({
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 0,
      projectId: fixture.projects.first,
      projectRevision: fixture.projectAnchor.revision,
      expectedCompanyId: fixture.projectAnchor.companyId,
      body: body(fixture),
      ...overrides,
    });
    const decide = (saved, action, actor = writer, note = '') =>
      call(
        'decide',
        {
          id: saved.reportId,
          requestId: randomUUID(),
          revision: saved.revision,
          action,
          note,
        },
        actor,
      );
    const domainHash = async () =>
      fingerprint(
        await runner.query(
          `SELECT to_jsonb(record) AS body FROM core."deliveryTask" record WHERE "workspaceId"=$1 UNION ALL SELECT to_jsonb(record) FROM "${fixture.schemaName}".task record`,
          [fixture.workspaceId],
        ),
      );
    const initialDomain = await domainHash();
    const projectPage = await read('projects', {});
    assert(
      projectPage.items.some(
        (project) => project.id === fixture.projects.first,
      ),
    );
    const choices = await read('choices', {
      projectId: fixture.projects.first,
    });
    assert.equal(choices.totalTaskCount, 1);
    assert.equal(choices.tasks[0].taskId, fixture.taskId);
    assert.equal(choices.tasks[0].verificationRunId, fixture.verificationRunId);
    assert(
      choices.tasks[0].verificationSummary.includes(
        'does not establish indexing or ranking',
      ),
    );
    const baselineInput = command({
      body: body(fixture, {
        title: 'FIXTURE January report',
        periodStart: '2020-01-01',
        periodEnd: '2020-01-31',
        summary: 'PRIVATE_UNAPPROVED_DRAFT',
        metrics: [metric({ value: '10', observedAt: '2020-02-01T12:00:00Z' })],
      }),
    });
    const first = await call('save', baselineInput);
    assert.deepEqual(
      await call('save', baselineInput),
      first,
      'Exact create retry returns its original receipt.',
    );
    assert.deepEqual(
      await read('receipt', { requestId: baselineInput.requestId }),
      first,
    );
    await deny(
      () =>
        call('save', {
          ...baselineInput,
          body: {
            ...baselineInput.body,
            title: 'Different body under same request',
          },
        }),
      [409],
    );
    await deny(() => call('save', baselineInput, manager), [409]);
    await deny(
      () => read('receipt', { requestId: baselineInput.requestId }, manager),
      [404],
    );
    await deny(
      () => call('save', { ...baselineInput, requestId: randomUUID() }),
      [409],
    );
    const corrected = await call('save', {
      ...baselineInput,
      requestId: randomUUID(),
      revision: first.revision,
      body: {
        ...baselineInput.body,
        summary: 'FIXTURE approved January evidence.',
      },
    });
    let submitted = await decide(corrected, 'SUBMIT');
    await deny(() => decide(submitted, 'APPROVE'), [403]);
    const baseline = await decide(submitted, 'APPROVE', manager);
    assert.equal(baseline.version, 2);
    assert.equal(baseline.status, 'APPROVED');
    await runner.query(
      'UPDATE core."deliveryProject" SET revision=2 WHERE id=$1',
      [fixture.projects.first],
    );
    await deny(() => call('save', command()), [409]);
    assert.deepEqual(
      await call('save', baselineInput),
      first,
      'A committed exact receipt remains recoverable after later project edits.',
    );
    await runner.query(
      'UPDATE core."deliveryProject" SET revision=1 WHERE id=$1',
      [fixture.projects.first],
    );
    await deny(
      () =>
        call('save', {
          ...baselineInput,
          requestId: randomUUID(),
          revision: baseline.revision,
        }),
      [409],
    );
    await deny(
      () => read('detail', { id: baseline.reportId, version: 1 }, staff),
      [403],
    );
    assert.equal(
      (await read('detail', { id: baseline.reportId }, staff)).history.length,
      1,
    );
    assert(
      !JSON.stringify(
        await read('detail', { id: baseline.reportId }, staff),
      ).includes('PRIVATE_UNAPPROVED_DRAFT'),
    );
    assert.equal(
      (await read('detail', { id: baseline.reportId, version: 1 })).body
        .summary,
      'PRIVATE_UNAPPROVED_DRAFT',
    );
    checks += 12;

    const currentInput = command({
      body: body(fixture, {
        comparisonId: baseline.reportId,
        comparisonVersion: baseline.version,
      }),
    });
    let current = await call('save', currentInput);
    let detail = await read('detail', { id: current.reportId });
    assert.equal(detail.comparison[0].delta, '-10');
    assert.equal(detail.comparison[0].currentValue, '0');
    assert.equal(detail.taskSnapshots[0].state, 'APPROVED');
    assert.equal(detail.canSubmit, true);
    await deny(() => read('detail', { id: current.reportId }, staff), [403]);
    await deny(
      () => read('detail', { id: current.reportId }, fixture.people.outsider),
      [403],
    );
    await deny(
      () =>
        call(
          'detail',
          { id: current.reportId },
          writer,
          fixture.foreignWorkspace,
        ),
      [403, 404],
    );
    await runner.query(
      'UPDATE core."deliveryTask" SET revision=2 WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, fixture.taskId],
    );
    await deny(() => decide(current, 'SUBMIT'), [409]);
    await runner.query(
      'UPDATE core."deliveryTask" SET revision=1 WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, fixture.taskId],
    );
    submitted = await decide(current, 'SUBMIT');
    await deny(() => decide(submitted, 'REQUEST_CHANGES', manager), [400]);
    const changes = await decide(
      submitted,
      'REQUEST_CHANGES',
      manager,
      'FIXTURE: identify the measurement definition.',
    );
    current = await call('save', {
      ...currentInput,
      requestId: randomUUID(),
      revision: changes.revision,
      body: {
        ...currentInput.body,
        summary:
          'FIXTURE clarified measurement definition; zero is recorded, not assumed.',
      },
    });
    submitted = await decide(current, 'SUBMIT');
    current = await decide(submitted, 'APPROVE', manager);
    detail = await read('detail', { id: current.reportId }, staff);
    assert.equal(detail.report.status, 'APPROVED');
    assert.equal(detail.comparison[0].delta, '-10');
    assert.equal(detail.comparisonPeriodEnd, '2020-01-31');
    assert.equal(
      (await read('state', { id: current.reportId }, staff, true)).canEdit,
      false,
    );
    assert.equal(
      await domainHash(),
      initialDomain,
      'Reporting and review must not mutate task progress or verification.',
    );
    checks += 11;

    const unknown = await call(
      'save',
      command({
        body: body(fixture, {
          metrics: [
            metric({
              value: null,
              unknownReason: 'FIXTURE analytics access is unavailable.',
            }),
          ],
        }),
      }),
    );
    assert.equal(
      (await read('detail', { id: unknown.reportId })).body.metrics[0].value,
      null,
    );
    assert.equal(
      (await decide(unknown, 'SUBMIT')).status,
      'SUBMITTED',
      'Explicit unknown measurements do not force fabricated outcomes.',
    );
    await deny(
      () =>
        call(
          'save',
          command({
            body: body(fixture, { metrics: [metric({ value: '1.0' })] }),
          }),
        ),
      [400],
    );
    await deny(
      () =>
        call(
          'save',
          command({
            body: body(fixture, {
              metrics: [metric({ sourceUrl: 'not-a-url' })],
            }),
          }),
        ),
      [400],
    );
    const future = await call(
      'save',
      command({
        body: body(fixture, {
          periodStart: '2099-01-01',
          periodEnd: '2099-01-31',
        }),
      }),
    );
    await deny(() => decide(future, 'SUBMIT'), [400]);
    await deny(
      () =>
        call(
          'save',
          command({
            body: body(fixture, {
              metrics: [metric({ observedAt: '2099-01-01T00:00:00Z' })],
            }),
          }),
        ),
      [400],
    );
    await deny(
      () =>
        call(
          'save',
          command({
            body: body(fixture, {
              tasks: [{ taskId: randomUUID(), revision: 1 }],
            }),
          }),
        ),
      [409],
    );
    await deny(
      () =>
        call(
          'save',
          command({
            body: body(fixture, {
              comparisonId: unknown.reportId,
              comparisonVersion: 1,
            }),
          }),
        ),
      [409],
    );
    checks += 8;

    const originalMembers = (
      await runner.query(
        'SELECT "memberIds","companyId" FROM core."deliveryProject" WHERE id=$1',
        [fixture.projects.first],
      )
    )[0];
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=\'[]\'::jsonb WHERE id=$1',
      [fixture.projects.first],
    );
    await deny(() => read('detail', { id: current.reportId }), [403]);
    await deny(
      () => read('receipt', { requestId: currentInput.requestId }),
      [403],
    );
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
      [fixture.projects.first, JSON.stringify(originalMembers.memberIds)],
    );
    await runner.query(
      'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
      [fixture.projects.first, randomUUID()],
    );
    await deny(() => call('save', command()), [409]);
    await deny(() => read('detail', { id: current.reportId }, manager), [403]);
    const adminView = await read(
      'detail',
      { id: current.reportId },
      fixture.people.admin,
    );
    assert.equal(adminView.clientAnchorChanged, true);
    assert.equal(adminView.comparison[0].delta, '-10');
    assert.equal(adminView.canEdit, false);
    await runner.query(
      'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
      [fixture.projects.first, originalMembers.companyId],
    );
    const beforeAtomic = (
      await runner.query(
        'SELECT count(*)::integer AS count FROM core."deliverySeoReport" WHERE "workspaceId"=$1',
        [fixture.workspaceId],
      )
    )[0].count;
    failActivity = true;
    await assert.rejects(
      () => call('save', command()),
      /FIXTURE atomic SEO activity failure/,
    );
    assert.equal(
      (
        await runner.query(
          'SELECT count(*)::integer AS count FROM core."deliverySeoReport" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].count,
      beforeAtomic,
    );
    for (let index = 0; index < 30; index++)
      await call(
        'save',
        command({
          body: body(fixture, { title: `FIXTURE paged SEO report ${index}` }),
        }),
      );
    const seen = new Set();
    let afterId = null;
    let expected;
    do {
      const page = await read('reports', {
        projectId: fixture.projects.first,
        afterId,
      });
      expected = page.totalCount;
      assert(page.items.length <= 25);
      for (const item of page.items) {
        assert(!seen.has(item.id));
        seen.add(item.id);
      }
      afterId = page.nextId;
    } while (afterId);
    assert.equal(seen.size, expected);
    const full = await read('detail', { id: current.reportId });
    assert(full.history.some((event) => event.action === 'REQUEST_CHANGES'));
    assert(
      full.history.every(
        (event, index, all) =>
          index === 0 || event.revision > all[index - 1].revision,
      ),
    );
    assert.equal(networkCalls, 0);
    checks += 8;
  } finally {
    try {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      if (runner && !runner.isReleased) await runner.release();
    }
    try {
      if (before)
        assert.equal(
          await originalDigest((...arguments_) =>
            connectionSource.query(...arguments_),
          ),
          before,
          'Original core/native inventory and data must remain unchanged.',
        );
    } finally {
      if (connectionSource.isInitialized) await connectionSource.destroy();
      global.fetch = fetchBefore;
    }
  }
  console.log(
    `PASS SEO actual-service rollback: ${checks} workflow/source/privacy/paging assertions; no provider/task writes, all fixtures rolled back and original inventory preserved.`,
  );
}
module.exports = { services, seedSeoFixture, body, metric };
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

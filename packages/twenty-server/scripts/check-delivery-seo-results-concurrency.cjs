const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  writeJournal,
  syncDirectory,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const { cleanupFixture } = require('./check-delivery-reconciliation.cjs');
const {
  originalDigest,
  quote,
  deferred,
  bounded,
  deny,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const {
  seoSaveSchema,
  seoDecisionSchema,
} = require('../dist/modules/delivery/seo-results/delivery-seo-results.types');
const {
  services,
  seedSeoFixture,
  body,
} = require('./check-delivery-seo-results.cjs');
const FILE = '/tmp/otogrow-seo-results-concurrency.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const saveJournal = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
async function ownedRows(manager, fixture) {
  const tables = await manager.query(
    `SELECT table_schema AS schema,table_name AS name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('core',$1) ORDER BY table_schema,table_name`,
    [fixture.schemaName],
  );
  const scoped = new Set(
    (
      await manager.query(
        "SELECT table_name FROM information_schema.columns WHERE table_schema='core' AND column_name='workspaceId'",
      )
    ).map((row) => row.table_name),
  );
  const rows = [];
  for (const table of tables) {
    let where;
    let values;
    if (table.schema === fixture.schemaName) {
      where = 'true';
      values = [];
    } else if (table.name === 'workspace') {
      where = 'record.id=ANY($1::uuid[])';
      values = [[fixture.workspaceId, fixture.foreignWorkspaceId]];
    } else if (table.name === 'user') {
      where = 'record.id=ANY($1::uuid[])';
      values = [Object.values(fixture.people).map((person) => person.userId)];
    } else if (scoped.has(table.name)) {
      where = 'record."workspaceId"=ANY($1::uuid[])';
      values = [[fixture.workspaceId, fixture.foreignWorkspaceId]];
    } else continue;
    rows.push({
      ...table,
      rows: await manager.query(
        `SELECT to_jsonb(record)->>'id' AS id,md5(to_jsonb(record)::text) AS hash FROM ${quote(table.schema)}.${quote(table.name)} record WHERE ${where} ORDER BY to_jsonb(record)->>'id'`,
        values,
      ),
    });
  }
  return rows;
}
function readJournal() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, 'seo-results-concurrency-v1');
  for (const id of [
    fixture.workspaceId,
    fixture.foreignWorkspaceId,
    fixture.taskId,
    ...Object.values(fixture.people).flatMap((person) => [
      person.memberId,
      person.userId,
      person.userWorkspaceId,
    ]),
  ])
    assert.match(id, UUID);
  assert.equal(
    fixture.schemaName,
    `seo_results_race_${fixture.workspaceId.replaceAll('-', '_')}`,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  for (const plan of fixture.commands) {
    const input = (
      plan.method === 'save' ? seoSaveSchema : seoDecisionSchema
    ).parse(plan.input);
    assert.deepEqual(input, plan.input);
    assert.equal(plan.hash, advertisingHash(input));
    assert(
      ['writer', 'reader'].some(
        (key) => fixture.people[key].memberId === plan.memberId,
      ),
    );
  }
  return fixture;
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='10s'");
    for (const id of [fixture.workspaceId, fixture.foreignWorkspaceId].sort())
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${id}`],
      );
    assert.equal(
      await originalDigest(
        (...arguments_) => manager.query(...arguments_),
        fixture,
      ),
      fixture.original,
      'Original rows changed; preserve this owned fixture for investigation.',
    );
    const workspaces = await manager.query(
      'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    if (!workspaces.length) {
      assert.equal(
        (
          await manager.query('SELECT to_regnamespace($1)::text AS schema', [
            fixture.schemaName,
          ])
        )[0].schema,
        null,
      );
      return;
    }
    assert.equal(workspaces.length, 2);
    for (const workspace of workspaces) {
      assert.equal(workspace.displayName, fixture.sentinel);
      assert.equal(workspace.databaseSchema, fixture.schemaName);
    }
    const reports = await manager.query(
      `SELECT report.*,to_char(report."periodStart",'YYYY-MM-DD') AS "periodStartDate",to_char(report."periodEnd",'YYYY-MM-DD') AS "periodEndDate" FROM core."deliverySeoReport" report WHERE report."workspaceId"=ANY($1::uuid[])`,
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    const versions = await manager.query(
      'SELECT * FROM core."deliverySeoVersion" WHERE "workspaceId"=ANY($1::uuid[])',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    const events = await manager.query(
      'SELECT * FROM core."deliverySeoEvent" WHERE "workspaceId"=ANY($1::uuid[])',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    for (const report of reports) {
      assert.equal(report.workspaceId, fixture.workspaceId);
      assert.equal(report.projectId, fixture.projects.first);
      assert.equal(report.createdBy, fixture.people.writer.memberId);
      assert(
        fixture.commands.some(
          (plan) =>
            plan.method === 'save' &&
            plan.input.id === report.id &&
            plan.input.revision === 0,
        ),
      );
    }
    for (const event of events) {
      const plan = fixture.commands.find(
        (candidate) => candidate.input.requestId === event.requestId,
      );
      assert(plan);
      assert.equal(event.inputHash, plan.hash);
      assert.equal(event.reportId, plan.input.id);
      assert.equal(event.actorId, plan.memberId);
      assert.equal(event.userWorkspaceId, plan.userWorkspaceId);
      assert.equal(
        event.action,
        plan.method === 'save' ? 'SAVE' : plan.input.action,
      );
    }
    for (const version of versions) {
      const event = events.find(
        (candidate) =>
          candidate.reportId === version.reportId &&
          candidate.version === version.version &&
          candidate.action === 'SAVE',
      );
      assert(event);
      const plan = fixture.commands.find(
        (candidate) => candidate.input.requestId === event.requestId,
      );
      const { taskSnapshots, comparisonSnapshot, ...saved } = version.body;
      assert.deepEqual(saved, plan.input.body);
      assert.equal(comparisonSnapshot, null);
      assert(
        taskSnapshots.every(
          (task) =>
            task.taskId === fixture.taskId &&
            task.revision === 1 &&
            task.state === 'APPROVED',
        ),
      );
    }
    for (const report of reports) {
      const version = versions.find(
        (candidate) =>
          candidate.reportId === report.id &&
          candidate.version === report.currentVersion,
      );
      assert(version);
      assert.equal(report.title, version.body.title);
      assert.equal(report.ownerId, version.body.ownerId);
      assert.equal(report.periodStartDate, version.body.periodStart);
      assert.equal(report.periodEndDate, version.body.periodEnd);
      const last = events
        .filter((event) => event.reportId === report.id)
        .sort((left, right) => right.revision - left.revision)[0];
      assert(last);
      assert.equal(report.revision, last.revision);
      assert.equal(report.status, last.status);
    }
    const activity = await manager.query(
      'SELECT id,"sourceType","sourceId",action FROM core."otogrowActivityEvent" WHERE "workspaceId"=ANY($1::uuid[])',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    assert.equal(activity.length, events.length);
    for (const event of activity) {
      assert.equal(event.sourceType, 'seo-report');
      assert(reports.some((report) => report.id === event.sourceId));
      assert(
        [
          'SEO_REPORT_SAVE',
          'SEO_REPORT_SUBMIT',
          'SEO_REPORT_APPROVE',
          'SEO_REPORT_REQUEST_CHANGES',
        ].includes(event.action),
      );
    }
    const dynamic = {
      deliverySeoReport: reports,
      deliverySeoVersion: versions,
      deliverySeoEvent: events,
      otogrowActivityEvent: activity,
    };
    const current = await ownedRows(manager, fixture);
    assert.deepEqual(
      current.map(({ schema, name }) => ({ schema, name })),
      fixture.seed.map(({ schema, name }) => ({ schema, name })),
    );
    for (const table of current) {
      const seed = fixture.seed.find(
        (candidate) =>
          candidate.schema === table.schema && candidate.name === table.name,
      );
      const added = table.schema === 'core' ? (dynamic[table.name] ?? []) : [];
      assert.deepEqual(
        table.rows.map((row) => row.id).sort(),
        [
          ...seed.rows.map((row) => row.id),
          ...added.map((row) => row.id),
        ].sort(),
      );
      for (const row of seed.rows) {
        const actual = table.rows.find((candidate) => candidate.id === row.id);
        assert(
          (
            fixture.mutable[`${table.schema}.${table.name}:${row.id}`] ?? [
              row.hash,
            ]
          ).includes(actual.hash),
          `Unexpected change to ${table.schema}.${table.name}; no broad cleanup.`,
        );
      }
    }
    for (const table of [
      'deliverySeoEvent',
      'deliverySeoVersion',
      'deliverySeoReport',
      'deliveryAgentRun',
      'deliveryTask',
    ])
      await manager.query(
        `DELETE FROM core.${quote(table)} WHERE "workspaceId"=ANY($1::uuid[])`,
        [[fixture.workspaceId, fixture.foreignWorkspaceId]],
      );
    await cleanupFixture(manager, fixture);
    assert.equal(
      await originalDigest((...arguments_) => manager.query(...arguments_)),
      fixture.original,
    );
  });
  const receipt = `${FILE}.${fixture.workspaceId}.cleaned.json`;
  if (!existsSync(receipt))
    writeJournal(
      {
        checker: fixture.checker,
        workspaceId: fixture.workspaceId,
        cleaned: true,
        original: fixture.original,
      },
      receipt,
      true,
    );
  if (existsSync(FILE)) {
    unlinkSync(FILE);
    syncDirectory(FILE);
  }
}
async function main() {
  assert.equal(
    process.env.OTOGROW_SEO_CHECK_ISOLATED,
    '1',
    'Explicit isolated local check required.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const mode = process.argv[2] ?? 'run';
  assert(['run', 'cleanup'].includes(mode));
  await connectionSource.initialize();
  if (mode === 'cleanup') {
    try {
      await cleanup(readJournal());
      console.log('PASS exact interrupted SEO fixture cleanup.');
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  assert(
    !existsSync(FILE),
    'Recover the existing private fixture journal first.',
  );
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Network is forbidden.');
  };
  const sessions = [0, 1].map(
    () =>
      new DataSource({
        ...connectionSource.options,
        extra: { ...connectionSource.options.extra, max: 1 },
      }),
  );
  let fixture;
  let hold = null;
  const pids = [];
  const pending = [];
  const blockers = [];
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const scoped = sessions.map((source, index) => ({
    manager: source.manager,
    getRepository: (entity) => source.getRepository(entity),
    transaction: (operation) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='10s'");
        const [session] = await manager.query(
          'SELECT pg_backend_pid() AS pid,txid_current()::text AS tx',
        );
        pids[index] = session;
        const result = await operation(manager);
        if (hold?.index === index) {
          const current = hold;
          hold = null;
          current.entered.resolve();
          await bounded(current.release.promise);
        }
        return result;
      }),
  }));
  const waitBlocked = async (index, holder) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (pids[index]) {
        const [row] = await connectionSource.query(
          'SELECT $2::integer=ANY(pg_blocking_pids($1::integer)) AS blocked',
          [pids[index].pid, holder],
        );
        if (row.blocked) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(
      'The independent session did not wait on the delivery lock.',
    );
  };
  try {
    await Promise.all(sessions.map((source) => source.initialize()));
    const original = await originalDigest((...arguments_) =>
      connectionSource.query(...arguments_),
    );
    await connectionSource.transaction(async (manager) => {
      fixture = await seedSeoFixture(manager, 'seo_results_race');
      fixture.checker = 'seo-results-concurrency-v1';
      fixture.original = original;
      fixture.commands = [];
      fixture.mutable = {};
      fixture.seed = await ownedRows(manager, fixture);
      saveJournal(fixture, true);
    });
    const domains = scoped.map((source) => services(source, fixture).seo);
    const call = (index, method, input, person = fixture.people.writer) =>
      domains[index][method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const plan = (method, input, person = fixture.people.writer) => {
      const canonical = (
        method === 'save' ? seoSaveSchema : seoDecisionSchema
      ).parse(input);
      fixture.commands.push({
        method,
        input: canonical,
        hash: advertisingHash(canonical),
        memberId: person.memberId,
        userWorkspaceId: person.userWorkspaceId,
      });
      saveJournal(fixture);
      return canonical;
    };
    const create = () => ({
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 0,
      projectId: fixture.projects.first,
      projectRevision: fixture.projectAnchor.revision,
      expectedCompanyId: fixture.projectAnchor.companyId,
      body: body(fixture),
    });
    const first = plan('save', create());
    const duplicates = await Promise.all([
      call(0, 'save', first),
      call(1, 'save', first),
    ]);
    assert.deepEqual(duplicates[0], duplicates[1]);
    assert.notEqual(pids[0].pid, pids[1].pid);
    assert.notEqual(pids[0].tx, pids[1].tx);
    const beforeCount = (
      await connectionSource.query(
        'SELECT count(*)::integer AS count FROM core."deliverySeoEvent" WHERE "workspaceId"=$1',
        [fixture.workspaceId],
      )
    )[0].count;
    assert.equal(beforeCount, 1);
    const collision = plan('save', create());
    const collisionOther = plan('save', {
      ...collision,
      requestId: randomUUID(),
      body: {
        ...collision.body,
        title: 'FIXTURE different create collision body',
      },
    });
    const collisionReplies = await Promise.allSettled([
      call(0, 'save', collision),
      call(1, 'save', collisionOther),
    ]);
    assert.equal(
      collisionReplies.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      collisionReplies
        .find((result) => result.status === 'rejected')
        .reason.getStatus(),
      409,
    );
    const left = plan('save', {
      ...first,
      requestId: randomUUID(),
      revision: 1,
      body: { ...first.body, summary: 'FIXTURE first competing correction.' },
    });
    const right = plan('save', {
      ...first,
      requestId: randomUUID(),
      revision: 1,
      body: { ...first.body, summary: 'FIXTURE second competing correction.' },
    });
    const edits = await Promise.allSettled([
      call(0, 'save', left),
      call(1, 'save', right),
    ]);
    assert.equal(
      edits.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      edits.find((result) => result.status === 'rejected').reason.getStatus(),
      409,
    );
    const saved = edits.find((result) => result.status === 'fulfilled').value;
    const submit = plan('decide', {
      id: first.id,
      requestId: randomUUID(),
      revision: saved.revision,
      action: 'SUBMIT',
      note: '',
    });
    const submitted = await call(0, 'decide', submit);
    const approve1 = plan(
      'decide',
      {
        id: first.id,
        requestId: randomUUID(),
        revision: submitted.revision,
        action: 'APPROVE',
        note: 'FIXTURE independent approval.',
      },
      fixture.people.reader,
    );
    const approve2 = plan(
      'decide',
      { ...approve1, requestId: randomUUID() },
      fixture.people.reader,
    );
    const approvals = await Promise.allSettled([
      call(0, 'decide', approve1, fixture.people.reader),
      call(1, 'decide', approve2, fixture.people.reader),
    ]);
    assert.equal(
      approvals.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      approvals
        .find((result) => result.status === 'rejected')
        .reason.getStatus(),
      409,
    );
    const originalMembers = (
      await connectionSource.query(
        'SELECT "memberIds" FROM core."deliveryProject" WHERE id=$1',
        [fixture.projects.first],
      )
    )[0].memberIds;
    const mutate = async (manager, members) => {
      await manager.query(
        'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
        [fixture.projects.first, JSON.stringify(members)],
      );
      const [row] = await manager.query(
        'SELECT md5(to_jsonb(record)::text) AS hash FROM core."deliveryProject" record WHERE id=$1',
        [fixture.projects.first],
      );
      const key = `core.deliveryProject:${fixture.projects.first}`;
      fixture.mutable[key] ??= [
        fixture.seed
          .find(
            (table) =>
              table.schema === 'core' && table.name === 'deliveryProject',
          )
          .rows.find((item) => item.id === fixture.projects.first).hash,
      ];
      if (!fixture.mutable[key].includes(row.hash))
        fixture.mutable[key].push(row.hash);
      saveJournal(fixture);
    };
    const revoke = () =>
      scoped[1].transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        await mutate(manager, []);
      });
    const restore = () =>
      connectionSource.transaction((manager) =>
        mutate(manager, originalMembers),
      );
    const ordered = plan('save', create());
    hold = { index: 0, entered: deferred(), release: deferred() };
    const held = hold;
    blockers.push(held.release);
    const allowed = track(call(0, 'save', ordered));
    await bounded(held.entered.promise);
    const revoking = track(revoke());
    await waitBlocked(1, pids[0].pid);
    held.release.resolve();
    await bounded(allowed);
    await bounded(revoking);
    await deny(() => call(1, 'detail', { id: ordered.id }), [403]);
    await restore();
    const rejected = plan('save', create());
    const blocker = connectionSource.createQueryRunner();
    blockers.push(blocker);
    await blocker.connect();
    await blocker.startTransaction();
    const [blocking] = await blocker.query('SELECT pg_backend_pid() AS pid');
    await blocker.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`delivery:${fixture.workspaceId}`],
    );
    const waiting = track(call(0, 'save', rejected));
    await waitBlocked(0, blocking.pid);
    await mutate(blocker.manager, []);
    await blocker.commitTransaction();
    await blocker.release();
    await deny(() => waiting, [403]);
    assert.equal(
      (
        await connectionSource.query(
          'SELECT id FROM core."deliverySeoReport" WHERE id=$1',
          [rejected.id],
        )
      ).length,
      0,
    );
    await restore();
    console.log(
      'PASS SEO independent-session duplicate receipt, conflicting edit, independent approval and both current-access lock orderings; no task writes or provider calls.',
    );
  } finally {
    hold?.release.resolve();
    for (const resource of blockers) if (resource.resolve) resource.resolve();
    await Promise.allSettled(pending);
    for (const resource of blockers)
      if (resource.isTransactionActive) await resource.rollbackTransaction();
    for (const resource of blockers)
      if (resource.release && !resource.isReleased) await resource.release();
    await Promise.all(
      sessions
        .filter((source) => source.isInitialized)
        .map((source) => source.destroy()),
    );
    try {
      if (fixture?.seed && existsSync(FILE)) await cleanup(readJournal());
    } finally {
      if (connectionSource.isInitialized) await connectionSource.destroy();
      global.fetch = originalFetch;
    }
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

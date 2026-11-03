const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  seedLearningFixture,
  learningServices,
  associationInput,
} = require('./check-delivery-creative-learning.cjs');
const {
  cleanupReviewFixture,
} = require('./check-delivery-creative-review-support.cjs');
const {
  writeJournal,
  syncDirectory,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const {
  originalDigest,
  quote,
  deferred,
  bounded,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const {
  creativeAdLinkSaveSchema,
  creativeAdLinkDecisionSchema,
} = require('../dist/modules/delivery/creative/learning/delivery-creative-learning.types');
const {
  creativeAdPreviewFingerprint,
} = require('../dist/modules/delivery/creative/learning/delivery-creative-learning.policy');
const FILE = '/tmp/otogrow-creative-learning-concurrency.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const LEARNING_TABLES = [
  'deliveryCreativeLesson',
  'deliveryCreativeLearningEvent',
  'deliveryCreativeAdVersion',
  'deliveryCreativeAdLink',
];
async function ownedRows(manager, fixture) {
  const tables = await manager.query(
    `SELECT table_schema AS schema,table_name AS name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN('core',$1) ORDER BY table_schema,table_name`,
    [fixture.schemaName],
  );
  const scoped = new Set(
    (
      await manager.query(
        `SELECT table_name FROM information_schema.columns WHERE table_schema='core' AND column_name='workspaceId'`,
      )
    ).map((row) => row.table_name),
  );
  const output = [];
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
    output.push({
      ...table,
      rows: await manager.query(
        `SELECT to_jsonb(record)->>'id' AS id,md5(to_jsonb(record)::text) AS hash FROM ${quote(table.schema)}.${quote(table.name)} record WHERE ${where} ORDER BY to_jsonb(record)->>'id'`,
        values,
      ),
    });
  }
  return output;
}
function journal(fixture, initial = false) {
  writeJournal(fixture, FILE, initial);
}
function readJournal() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, 'creative-learning-concurrency-v1');
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
    `creative_review_rollback_${fixture.workspaceId.replaceAll('-', '_')}`,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  assert(Number.isFinite(Date.parse(fixture.createdAt)));
  for (const plan of fixture.commands) {
    const input = (
      plan.method === 'save'
        ? creativeAdLinkSaveSchema
        : creativeAdLinkDecisionSchema
    ).parse(plan.input);
    assert.deepEqual(input, plan.input);
    assert.equal(plan.hash, advertisingHash(input));
    assert(
      ['writer', 'admin', 'reader'].some(
        (name) =>
          fixture.people[name].memberId === plan.memberId &&
          fixture.people[name].userWorkspaceId === plan.userWorkspaceId,
      ),
    );
  }
  return fixture;
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='10s'");
    for (const workspaceId of [
      fixture.workspaceId,
      fixture.foreignWorkspaceId,
    ].sort())
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${workspaceId}`],
      );
    assert.equal(
      await originalDigest(
        (...arguments_) => manager.query(...arguments_),
        fixture,
      ),
      fixture.original,
      'Original data changed; preserve the fixture for inspection.',
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
    const ids = [fixture.workspaceId, fixture.foreignWorkspaceId];
    const links = await manager.query(
      'SELECT * FROM core."deliveryCreativeAdLink" WHERE "workspaceId"=ANY($1::uuid[])',
      [ids],
    );
    const versions = await manager.query(
      'SELECT * FROM core."deliveryCreativeAdVersion" WHERE "workspaceId"=ANY($1::uuid[])',
      [ids],
    );
    const events = await manager.query(
      'SELECT * FROM core."deliveryCreativeLearningEvent" WHERE "workspaceId"=ANY($1::uuid[])',
      [ids],
    );
    assert.equal(
      (
        await manager.query(
          'SELECT count(*)::int AS count FROM core."deliveryCreativeLesson" WHERE "workspaceId"=ANY($1::uuid[])',
          [ids],
        )
      )[0].count,
      0,
    );
    for (const link of links) {
      assert.equal(link.workspaceId, fixture.workspaceId);
      assert.equal(link.projectId, fixture.projects.first);
      assert.equal(link.sourceProjectId, fixture.projects.first);
      assert.equal(link.sourceId, fixture.learningReportId);
      assert.equal(link.adId, '1000');
      assert.equal(link.taskId, fixture.taskId);
      assert.equal(link.assetId, fixture.assets.image);
      assert.equal(link.createdBy, fixture.people.writer.memberId);
      assert.equal(link.correctsId, null);
      const history = events
        .filter((event) => event.linkId === link.id)
        .sort((left, right) => left.revision - right.revision);
      assert(history.length && history[0].action === 'SAVE');
      assert.deepEqual(
        history.map((event) => event.revision),
        history.map((_event, index) => index + 1),
      );
      assert.equal(link.revision, history[history.length - 1].revision);
      assert.equal(link.state, history[history.length - 1].state);
      assert.equal(link.currentVersion, history[history.length - 1].version);
    }
    for (const event of events) {
      const plan = fixture.commands.find(
        (plan) =>
          plan.input.requestId === event.requestId &&
          plan.hash === event.inputHash &&
          plan.memberId === event.actorId,
      );
      assert(plan);
      assert.equal(event.inputHash, plan.hash);
      assert.equal(event.actorId, plan.memberId);
      assert.equal(event.userWorkspaceId, plan.userWorkspaceId);
      assert.equal(event.linkId, plan.input.id);
      assert.equal(
        event.action,
        plan.method === 'save' ? 'SAVE' : plan.input.action,
      );
      assert.equal(event.lessonId, null);
      assert(Date.parse(event.createdAt) >= Date.parse(fixture.createdAt));
    }
    for (const version of versions) {
      const event = events.find(
        (event) =>
          event.linkId === version.linkId &&
          event.version === version.version &&
          event.action === 'SAVE',
      );
      assert(event);
      const plan = fixture.commands.find(
        (plan) =>
          plan.input.requestId === event.requestId &&
          plan.hash === event.inputHash &&
          plan.memberId === event.actorId,
      );
      assert(plan);
      for (const key of [
        'projectId',
        'sourceId',
        'adId',
        'taskId',
        'submissionVersion',
        'assetId',
        'goal',
        'declaredComponents',
        'declaredCopy',
        'associationEvidence',
        'evidenceUrl',
        'note',
        'correctsId',
      ])
        assert.deepEqual(version.body[key], plan.input[key]);
      assert.equal(
        version.body.previewFingerprint,
        plan.input.previewFingerprint,
      );
      assert.equal(version.body.assetSha256, fixture.learningAssetHash);
      assert.equal(version.body.source.accountId, '1234567890');
      assert.equal(version.body.source.kind, 'META');
      assert.equal(
        version.body.submittedLearning.projectId,
        fixture.projects.first,
      );
      assert.equal(version.body.copyText, 'FIXTURE original submitted copy');
      assert.equal(
        creativeAdPreviewFingerprint(version.body),
        plan.input.previewFingerprint,
      );
      assert.equal(version.createdBy, event.actorId);
      assert.deepEqual(version.body.warnings, [
        'COMPONENTS_UNKNOWN',
        'HUMAN_ASSOCIATION_NOT_PROVIDER_VERIFIED',
        'EXACT_REPORT_WINDOW_ONLY',
      ]);
      assert(
        Date.parse(version.body.assetHashCapturedAt) >=
          Date.parse(fixture.createdAt),
      );
    }
    const activity = await manager.query(
      'SELECT id,"sourceType","sourceId",action FROM core."otogrowActivityEvent" WHERE "workspaceId"=ANY($1::uuid[])',
      [ids],
    );
    const seedActivity = fixture.seed.find(
      (table) =>
        table.schema === 'core' && table.name === 'otogrowActivityEvent',
    ).rows;
    const addedActivity = activity.filter(
      (row) => !seedActivity.some((seed) => seed.id === row.id),
    );
    assert.equal(addedActivity.length, events.length);
    for (const row of addedActivity) {
      assert.equal(row.sourceType, 'creative-learning');
      assert(links.some((link) => link.id === row.sourceId));
      assert(
        events.some(
          (event) =>
            event.linkId === row.sourceId &&
            row.action === `CREATIVE_LEARNING_${event.action}`,
        ),
      );
    }
    const dynamic = {
      deliveryCreativeAdLink: links,
      deliveryCreativeAdVersion: versions,
      deliveryCreativeLearningEvent: events,
      otogrowActivityEvent: addedActivity,
    };
    const current = await ownedRows(manager, fixture);
    assert.deepEqual(
      current.map(({ schema, name }) => ({ schema, name })),
      fixture.seed.map(({ schema, name }) => ({ schema, name })),
    );
    for (const table of current) {
      const seed = fixture.seed.find(
        (row) => row.schema === table.schema && row.name === table.name,
      );
      const additions =
        table.schema === 'core' ? (dynamic[table.name] ?? []) : [];
      assert.deepEqual(
        table.rows.map((row) => row.id).sort(),
        [
          ...seed.rows.map((row) => row.id),
          ...additions.map((row) => row.id),
        ].sort(),
      );
      for (const row of seed.rows)
        assert.equal(
          table.rows.find((candidate) => candidate.id === row.id)?.hash,
          row.hash,
          `Owned seed ${table.schema}.${table.name} changed; no broad cleanup.`,
        );
    }
    for (const table of LEARNING_TABLES)
      await manager.query(
        `DELETE FROM core.${quote(table)} WHERE "workspaceId"=ANY($1::uuid[])`,
        [ids],
      );
    await manager.query(
      'DELETE FROM core."deliveryMetaReport" WHERE "workspaceId"=ANY($1::uuid[])',
      [ids],
    );
    await cleanupReviewFixture(manager, fixture);
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
    process.env.OTOGROW_CREATIVE_LEARNING_CHECK_ISOLATED,
    '1',
    'Explicit isolated local session proof only.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const mode = process.argv[2] ?? 'run';
  assert(['run', 'cleanup'].includes(mode));
  const beforeFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Concurrency proof forbids providers/network.');
  };
  let first;
  let second;
  let fixture;
  let ownsJournal = false;
  try {
    await connectionSource.initialize();
    if (mode === 'cleanup') {
      if (existsSync(FILE)) await cleanup(readJournal());
      return;
    }
    assert(
      !existsSync(FILE),
      'Clean the prior exact journal before creating another fixture.',
    );
    const original = await originalDigest((...arguments_) =>
      connectionSource.query(...arguments_),
    );
    fixture = await connectionSource.transaction(async (manager) => {
      const created = await seedLearningFixture(manager);
      created.checker = 'creative-learning-concurrency-v1';
      created.createdAt = new Date().toISOString();
      created.original = original;
      created.commands = [];
      const scoped = {
        manager,
        query: (...arguments_) => manager.query(...arguments_),
        getRepository: (entity) => manager.getRepository(entity),
        transaction: (operation) => manager.transaction(operation),
      };
      const services = learningServices(scoped, created);
      const writer = created.people.writer;
      created.base = await associationInput(
        services,
        created,
        writer,
        {},
        manager,
      );
      const preview = await services.learning.preview(
        created.workspace,
        writer.memberId,
        writer.userWorkspaceId,
        created.base,
        manager,
      );
      created.learningAssetHash = preview.body.assetSha256;
      created.seed = await ownedRows(manager, created);
      journal(created, true);
      ownsJournal = true;
      return created;
    });
    first = new DataSource({
      ...connectionSource.options,
      synchronize: false,
      migrationsRun: false,
    });
    second = new DataSource({
      ...connectionSource.options,
      synchronize: false,
      migrationsRun: false,
    });
    await first.initialize();
    await second.initialize();
    const servicesA = learningServices(first, fixture);
    const servicesB = learningServices(second, fixture);
    const writer = fixture.people.writer;
    const admin = fixture.people.admin;
    const reviewer = fixture.people.reader;
    const call = (services, method, input, person = writer, manager) =>
      services.learning[method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
        manager,
      );
    const plan = (method, input, person = writer) => {
      const existing = fixture.commands.find(
        (plan) =>
          plan.input.requestId === input.requestId &&
          plan.hash === advertisingHash(input) &&
          plan.memberId === person.memberId,
      );
      if (!existing) {
        fixture.commands.push({
          method,
          input,
          hash: advertisingHash(input),
          memberId: person.memberId,
          userWorkspaceId: person.userWorkspaceId,
        });
        journal(fixture);
      }
      return input;
    };
    const command = async (fields = {}) => {
      const input = { ...fixture.base, ...fields };
      const preview = await call(servicesA, 'preview', input);
      return {
        ...input,
        id: randomUUID(),
        requestId: randomUUID(),
        revision: 0,
        previewFingerprint: preview.body.previewFingerprint,
      };
    };
    const exact = plan('save', await command());
    const retry = await Promise.all([
      call(servicesA, 'save', exact),
      call(servicesB, 'save', exact),
    ]);
    assert.equal(retry[0].receipt.requestId, retry[1].receipt.requestId);
    assert.equal(retry[0].receipt.linkId, retry[1].receipt.linkId);
    const collisionA = plan(
      'save',
      await command({ note: 'FIXTURE collision A' }),
    );
    const collisionB = await command({ note: 'FIXTURE collision B' });
    collisionB.id = collisionA.id;
    collisionB.requestId = collisionA.requestId;
    plan('save', collisionB);
    const collision = await Promise.allSettled([
      call(servicesA, 'save', collisionA),
      call(servicesB, 'save', collisionB),
    ]);
    assert.equal(
      collision.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert(
      collision.some(
        (result) =>
          result.status === 'rejected' && result.reason.getStatus?.() === 409,
      ),
    );
    const detail = await call(servicesA, 'detail', { id: exact.id });
    const editA = await command({ note: 'FIXTURE concurrent edit A' });
    editA.id = exact.id;
    editA.revision = detail.link.revision;
    plan('save', editA);
    const editB = await command({ note: 'FIXTURE concurrent edit B' });
    editB.id = exact.id;
    editB.revision = detail.link.revision;
    plan('save', editB);
    const edits = await Promise.allSettled([
      call(servicesA, 'save', editA),
      call(servicesB, 'save', editB),
    ]);
    assert.equal(
      edits.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    let current = await call(servicesA, 'detail', { id: exact.id });
    const submit = plan('decide', {
      id: exact.id,
      requestId: randomUUID(),
      revision: current.link.revision,
      action: 'SUBMIT',
      previewFingerprint: current.body.previewFingerprint,
      note: 'FIXTURE ready for independent association review',
    });
    await call(servicesA, 'decide', submit);
    current = await call(servicesA, 'detail', { id: exact.id }, admin);
    const reviewA = plan(
      'decide',
      {
        id: exact.id,
        requestId: randomUUID(),
        revision: current.link.revision,
        action: 'REVIEW',
        previewFingerprint: current.body.previewFingerprint,
        note: 'FIXTURE manager A reviewed exact association',
      },
      admin,
    );
    const reviewB = plan(
      'decide',
      {
        ...reviewA,
        requestId: randomUUID(),
        note: 'FIXTURE manager B reviewed exact association',
      },
      reviewer,
    );
    const reviews = await Promise.allSettled([
      call(servicesA, 'decide', reviewA, admin),
      call(servicesB, 'decide', reviewB, reviewer),
    ]);
    assert.equal(
      reviews.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const ahead = plan(
      'save',
      await command({
        note: 'FIXTURE authorized write before queued revocation',
      }),
    );
    const writerRunner = first.createQueryRunner();
    const revokerRunner = second.createQueryRunner();
    await writerRunner.connect();
    await revokerRunner.connect();
    try {
      await writerRunner.startTransaction();
      await revokerRunner.startTransaction();
      const entered = deferred();
      const release = deferred();
      const originalQuery = writerRunner.query.bind(writerRunner);
      writerRunner.query = async (...arguments_) => {
        const result = await originalQuery(...arguments_);
        if (
          arguments_[0].includes('pg_advisory_xact_lock(') &&
          arguments_[1]?.[0] === `delivery:${fixture.workspaceId}`
        ) {
          entered.resolve();
          await bounded(release.promise);
        }
        return result;
      };
      const write = call(
        servicesA,
        'save',
        ahead,
        writer,
        writerRunner.manager,
      );
      await bounded(entered.promise);
      const revoke = (async () => {
        await revokerRunner.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        await revokerRunner.query(
          'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
          [writer.userWorkspaceId],
        );
        await revokerRunner.commitTransaction();
      })();
      release.resolve();
      await bounded(write);
      await writerRunner.commitTransaction();
      await bounded(revoke);
      await connectionSource.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
        [writer.userWorkspaceId],
      );
    } finally {
      if (writerRunner.isTransactionActive)
        await writerRunner.rollbackTransaction();
      if (revokerRunner.isTransactionActive)
        await revokerRunner.rollbackTransaction();
      await writerRunner.release();
      await revokerRunner.release();
    }
    const after = plan(
      'save',
      await command({ note: 'FIXTURE revocation wins before new write' }),
    );
    const blocker = second.createQueryRunner();
    await blocker.connect();
    try {
      await blocker.startTransaction();
      await blocker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${fixture.workspaceId}`],
      );
      await blocker.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
        [writer.userWorkspaceId],
      );
      const write = call(servicesA, 'save', after);
      await blocker.commitTransaction();
      await assert.rejects(write, (error) =>
        [403, 404].includes(error.getStatus?.()),
      );
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await connectionSource.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
        [writer.userWorkspaceId],
      );
    }
    console.log(
      'PASS creative learning independent-session exact retries, body collision, conflicting edits, independent review and both membership-revocation lock orders; no provider/task/approval side effects.',
    );
  } finally {
    try {
      if (first?.isInitialized) await first.destroy();
      if (second?.isInitialized) await second.destroy();
      if (ownsJournal && existsSync(FILE)) await cleanup(readJournal());
    } finally {
      if (connectionSource.isInitialized) await connectionSource.destroy();
      global.fetch = beforeFetch;
    }
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

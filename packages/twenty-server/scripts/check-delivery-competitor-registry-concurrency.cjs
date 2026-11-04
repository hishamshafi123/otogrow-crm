const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const http = require('node:http');
const https = require('node:https');
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
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
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
  competitorSourceSaveSchema,
  competitorSourceChangeSchema,
} = require('../dist/modules/delivery/competitors/delivery-competitor.types');
const {
  canonicalCompetitorSource,
} = require('../dist/modules/delivery/competitors/delivery-competitor-source.policy');
const {
  TABLES,
  services,
  seedRegistryFixture,
  sourceBody,
} = require('./check-delivery-competitor-registry-support.cjs');

const FILE = '/tmp/otogrow-competitor-registry-concurrency.json';
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
    let condition;
    let values;
    if (table.schema === fixture.schemaName) {
      condition = 'true';
      values = [];
    } else if (table.name === 'workspace') {
      condition = 'record.id=ANY($1::uuid[])';
      values = [[fixture.workspaceId, fixture.foreignWorkspaceId]];
    } else if (table.name === 'user') {
      condition = 'record.id=ANY($1::uuid[])';
      values = [Object.values(fixture.people).map((person) => person.userId)];
    } else if (scoped.has(table.name)) {
      condition = 'record."workspaceId"=ANY($1::uuid[])';
      values = [[fixture.workspaceId, fixture.foreignWorkspaceId]];
    } else continue;
    rows.push({
      ...table,
      rows: await manager.query(
        `SELECT to_jsonb(record)->>'id' AS id,md5(to_jsonb(record)::text) AS hash FROM ${quote(table.schema)}.${quote(table.name)} record WHERE ${condition} ORDER BY to_jsonb(record)->>'id'`,
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
  assert.equal(fixture.checker, 'competitor-registry-concurrency-v1');
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
    `competitor_race_${fixture.workspaceId.replaceAll('-', '_')}`,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  for (const plan of fixture.commands) {
    assert(['save', 'changeState'].includes(plan.method));
    const input = (
      plan.method === 'save'
        ? competitorSourceSaveSchema
        : competitorSourceChangeSchema
    ).parse(plan.input);
    assert.deepEqual(input, plan.input);
    assert.equal(plan.hash, advertisingHash(input));
    assert(
      Object.values(fixture.people).some(
        (person) =>
          person.memberId === plan.memberId &&
          person.userWorkspaceId === plan.userWorkspaceId,
      ),
    );
    assert.equal(input.projectId, fixture.projects.first);
  }
  return fixture;
}

async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='10s'");
    await manager.query("SET LOCAL statement_timeout='30s'");
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
      'Original rows changed; retain the private journal for investigation.',
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
    assert.equal(
      await schemaFingerprint(manager),
      fixture.seedSchema,
      'Schema changed; cleanup cannot cascade into unknown objects.',
    );
    const [sources, versions, events, activity] = await Promise.all([
      ...TABLES.map((table) =>
        manager.query(
          `SELECT * FROM core.${quote(table)} WHERE "workspaceId"=ANY($1::uuid[])`,
          [[fixture.workspaceId, fixture.foreignWorkspaceId]],
        ),
      ),
      manager.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=ANY($1::uuid[])',
        [[fixture.workspaceId, fixture.foreignWorkspaceId]],
      ),
    ]);
    for (const source of sources) {
      assert.equal(source.workspaceId, fixture.workspaceId);
      assert.equal(source.projectId, fixture.projects.first);
      assert.equal(source.companyId, fixture.projectAnchor.companyId);
      const history = events
        .filter((event) => event.sourceId === source.id)
        .sort((left, right) => left.revision - right.revision);
      assert.deepEqual(
        history.map((event) => event.revision),
        Array.from({ length: source.revision }, (_, index) => index + 1),
      );
      assert.equal(history[0].action, 'SAVE');
      assert.equal(source.createdBy, history[0].actorId);
      assert.equal(source.status, history.at(-1).status);
      let expectedVersion = 0;
      let expectedStatus = 'ACTIVE';
      for (const event of history) {
        if (event.action === 'SAVE') expectedVersion++;
        else if (event.action === 'PAUSE') expectedStatus = 'PAUSED';
        else if (event.action === 'ARCHIVE') expectedStatus = 'ARCHIVED';
        else
          expectedStatus = expectedStatus === 'ARCHIVED' ? 'PAUSED' : 'ACTIVE';
        assert.equal(event.version, expectedVersion);
        assert.equal(event.status, expectedStatus);
      }
      assert.equal(
        source.currentVersion,
        history.filter((event) => event.action === 'SAVE').length,
      );
      const current = versions.find(
        (version) =>
          version.sourceId === source.id &&
          version.version === source.currentVersion,
      );
      assert(current);
      for (const key of [
        'label',
        'platform',
        'canonicalReference',
        'canonicalKey',
        'ownerId',
        'ownerName',
        'reviewerId',
        'reviewerName',
        'cadenceHours',
        'lookbackDays',
      ])
        assert.equal(source[key], current.body[key]);
    }
    for (const event of events) {
      const plan = fixture.commands.find(
        (candidate) =>
          candidate.input.requestId === event.requestId &&
          candidate.hash === event.inputHash &&
          candidate.memberId === event.actorId &&
          candidate.userWorkspaceId === event.userWorkspaceId,
      );
      assert(plan, 'An unplanned source event prevents cleanup.');
      assert.equal(event.workspaceId, fixture.workspaceId);
      assert.equal(event.sourceId, plan.input.id);
      assert.equal(
        event.action,
        plan.method === 'save' ? 'SAVE' : plan.input.action,
      );
      assert.equal(event.note, plan.method === 'save' ? '' : plan.input.note);
      assert.equal(event.revision, plan.input.revision + 1);
      assert(sources.some((source) => source.id === event.sourceId));
    }
    for (const version of versions) {
      assert.equal(version.workspaceId, fixture.workspaceId);
      assert.equal(version.companyId, fixture.projectAnchor.companyId);
      const event = events.find(
        (candidate) =>
          candidate.sourceId === version.sourceId &&
          candidate.version === version.version &&
          candidate.action === 'SAVE',
      );
      assert(event);
      assert.equal(version.createdBy, event.actorId);
      const plan = fixture.commands.find(
        (candidate) =>
          candidate.input.requestId === event.requestId &&
          candidate.hash === event.inputHash,
      );
      const { ownerName, reviewerName, ...body } = version.body;
      assert.deepEqual(body, {
        ...plan.input.body,
        ...canonicalCompetitorSource(
          plan.input.body.platform,
          plan.input.body.accountReference,
        ),
      });
      const personName = (id) => {
        const person = Object.values(fixture.people).find(
          (candidate) => candidate.memberId === id,
        );
        assert(person);
        return `${person.name} ${fixture.sentinel}`;
      };
      assert.equal(ownerName, personName(body.ownerId));
      assert.equal(reviewerName, personName(body.reviewerId));
    }
    assert.equal(activity.length, events.length);
    const auditedEvents = new Set();
    for (const audit of activity) {
      assert.equal(audit.workspaceId, fixture.workspaceId);
      assert.equal(audit.sourceType, 'competitor-source');
      const event = events.find(
        (event) =>
          event.sourceId === audit.sourceId &&
          event.actorId === audit.actorId &&
          audit.action === `COMPETITOR_SOURCE_${event.action}` &&
          audit.changes.some(
            (change) =>
              change.field === 'revision' &&
              change.after === String(event.revision),
          ),
      );
      assert(event);
      assert(!auditedEvents.has(event.id));
      auditedEvents.add(event.id);
      assert.equal(audit.projectId, fixture.projects.first);
      assert.equal(audit.clientId, fixture.projectAnchor.companyId);
      assert.equal(audit.subjectMemberId, fixture.people.writer.memberId);
      assert.equal(audit.actorType, 'HUMAN');
      assert.equal(audit.category, 'DELIVERY');
      assert.equal(audit.outcome, 'RECORDED');
      assert.equal(audit.taskId, null);
      assert.deepEqual(audit.changes, [
        { field: 'state', before: null, after: event.status },
        { field: 'revision', before: null, after: String(event.revision) },
      ]);
      assert(!JSON.stringify(audit).includes('PRIVATE_FIXTURE'));
    }
    const dynamic = {
      deliveryCompetitorSource: sources,
      deliveryCompetitorSourceVersion: versions,
      deliveryCompetitorSourceEvent: events,
      otogrowActivityEvent: activity,
    };
    const currentRows = await ownedRows(manager, fixture);
    assert.deepEqual(
      currentRows.map(({ schema, name }) => ({ schema, name })),
      fixture.seed.map(({ schema, name }) => ({ schema, name })),
    );
    for (const table of currentRows) {
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
        `Unexpected owned rows in ${table.schema}.${table.name}.`,
      );
      for (const row of seed.rows) {
        const actual = table.rows.find((candidate) => candidate.id === row.id);
        assert(
          (
            fixture.mutable[`${table.schema}.${table.name}:${row.id}`] ?? [
              row.hash,
            ]
          ).includes(actual.hash),
          `Unexpected fixture mutation in ${table.schema}.${table.name}.`,
        );
      }
    }
    for (const table of [TABLES[2], TABLES[1], TABLES[0], 'deliveryTask'])
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
    process.env.OTOGROW_COMPETITOR_PROOF_SERVICES_STOPPED,
    '1',
    'Pause local API/workers before independent-session acceptance.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const mode = process.argv[2] ?? 'run';
  assert(['run', 'cleanup'].includes(mode) && process.argv.length <= 3);
  if (mode === 'run')
    assert(
      !existsSync(FILE),
      'Recover the existing private fixture journal before another run.',
    );
  await connectionSource.initialize();
  if (mode === 'cleanup') {
    try {
      await cleanup(readJournal());
      process.stdout.write(
        'PASS exact interrupted competitor-registry fixture cleanup.\n',
      );
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  let providerRequests = 0;
  const transports = [
    [global, 'fetch'],
    [http, 'request'],
    [http, 'get'],
    [https, 'request'],
    [https, 'get'],
  ].map(([owner, key]) => ({ owner, key, original: owner[key] }));
  for (const { owner, key } of transports)
    owner[key] = () => {
      providerRequests++;
      throw new Error('Provider calls are forbidden.');
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
  const identities = [];
  const pending = [];
  const resources = [];
  const checks = [];
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const scoped = sessions.map((source, index) => ({
    getRepository: (entity) => source.getRepository(entity),
    transaction: (operation) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='10s'");
        await manager.query("SET LOCAL statement_timeout='30s'");
        [identities[index]] = await manager.query(
          'SELECT pg_backend_pid() AS pid,txid_current()::text AS tx',
        );
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
      if (
        identities[index] &&
        (
          await connectionSource.query(
            'SELECT $2::integer=ANY(pg_blocking_pids($1::integer)) AS blocked',
            [identities[index].pid, holder],
          )
        )[0].blocked
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(
      'The independent session did not wait for its expected lock.',
    );
  };
  const heldTransaction = (index = 0) => {
    hold = { index, entered: deferred(), release: deferred() };
    resources.push(hold.release);
    return hold;
  };
  const oneWinner = (results) => {
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      results.find((result) => result.status === 'rejected').reason.getStatus(),
      409,
    );
    return results.find((result) => result.status === 'fulfilled').value;
  };
  try {
    await Promise.all(sessions.map((source) => source.initialize()));
    const original = await originalDigest((...arguments_) =>
      connectionSource.query(...arguments_),
    );
    await connectionSource.transaction(async (manager) => {
      fixture = await seedRegistryFixture(manager, 'competitor_race');
      fixture.checker = 'competitor-registry-concurrency-v1';
      fixture.original = original;
      fixture.commands = [];
      fixture.mutable = {};
      fixture.seed = await ownedRows(manager, fixture);
      fixture.seedSchema = await schemaFingerprint(manager);
      saveJournal(fixture, true);
      if (process.env.OTOGROW_COMPETITOR_PROOF_FAILURE === 'PRECOMMIT')
        throw new Error('Injected PRECOMMIT failure.');
    });
    if (process.env.OTOGROW_COMPETITOR_PROOF_FAILURE === 'AFTER_SEED_COMMIT')
      throw new Error('Injected AFTER_SEED_COMMIT failure.');
    const domains = scoped.map((source) => services(source, fixture).registry);
    const call = (index, method, input, person = fixture.people.reader) =>
      domains[index][method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const plan = (method, input, person = fixture.people.reader) => {
      const canonical = (
        method === 'save'
          ? competitorSourceSaveSchema
          : competitorSourceChangeSchema
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
    let sourceSequence = 0;
    const create = () => ({
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 0,
      projectId: fixture.projects.first,
      projectRevision: fixture.projectAnchor.revision,
      expectedCompanyId: fixture.projectAnchor.companyId,
      body: sourceBody(fixture, {
        accountReference: `@race${++sourceSequence}`,
      }),
    });
    const first = plan('save', create());
    const duplicate = await Promise.all([
      call(0, 'save', first),
      call(1, 'save', first),
    ]);
    assert.deepEqual(duplicate[0], duplicate[1]);
    assert.notEqual(identities[0].pid, identities[1].pid);
    assert.notEqual(identities[0].tx, identities[1].tx);
    assert.equal(
      (
        await connectionSource.query(
          'SELECT count(*)::int AS count FROM core."deliveryCompetitorSourceEvent" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].count,
      1,
    );
    checks.push(
      'Genuine independent sessions recover one receipt for an exact concurrent request',
    );
    if (process.env.OTOGROW_COMPETITOR_PROOF_FAILURE === 'AFTER_ACTION_COMMIT')
      throw new Error('Injected AFTER_ACTION_COMMIT failure.');
    const independent = plan('save', create());
    const independentOther = plan('save', create());
    const independentHold = heldTransaction();
    const firstIndependent = track(call(0, 'save', independent));
    await bounded(independentHold.entered.promise);
    await bounded(call(1, 'save', independentOther));
    independentHold.release.resolve();
    await bounded(firstIndependent);
    checks.push(
      'Unrelated canonical sources can commit independently under shared authorization locks',
    );
    const canonical = plan('save', create());
    const alias = plan('save', {
      ...canonical,
      id: randomUUID(),
      requestId: randomUUID(),
      body: {
        ...canonical.body,
        accountReference: `https://twitter.com/${canonical.body.accountReference.slice(1).toUpperCase()}`,
      },
    });
    const canonicalHold = heldTransaction();
    const canonicalWrite = track(call(0, 'save', canonical));
    await bounded(canonicalHold.entered.promise);
    const aliasWrite = track(call(1, 'save', alias));
    await waitBlocked(1, identities[0].pid);
    canonicalHold.release.resolve();
    await bounded(canonicalWrite);
    await deny(() => aliasWrite, [409]);
    checks.push(
      'Different source IDs and aliases serialize on canonical identity and cannot duplicate registration',
    );
    const conflicting = plan('save', create());
    const conflictingBody = plan('save', {
      ...conflicting,
      body: { ...conflicting.body, label: 'FIXTURE changed request body' },
    });
    oneWinner(
      await Promise.allSettled([
        call(0, 'save', conflicting),
        call(1, 'save', conflictingBody),
      ]),
    );
    checks.push(
      'A reused request with different content yields exactly one persisted source command',
    );
    const left = plan(
      'save',
      {
        ...first,
        requestId: randomUUID(),
        revision: 1,
        body: { ...first.body, label: 'FIXTURE competing edit one' },
      },
      fixture.people.writer,
    );
    const right = plan(
      'save',
      {
        ...left,
        requestId: randomUUID(),
        body: { ...first.body, label: 'FIXTURE competing edit two' },
      },
      fixture.people.writer,
    );
    const edited = oneWinner(
      await Promise.allSettled([
        call(0, 'save', left, fixture.people.writer),
        call(1, 'save', right, fixture.people.writer),
      ]),
    );
    const { body: _body, ...common } = first;
    const pause = plan(
      'changeState',
      {
        ...common,
        requestId: randomUUID(),
        revision: edited.revision,
        action: 'PAUSE',
        note: 'FIXTURE competing state one',
      },
      fixture.people.writer,
    );
    const archive = plan(
      'changeState',
      {
        ...pause,
        requestId: randomUUID(),
        action: 'ARCHIVE',
        note: 'FIXTURE competing state two',
      },
      fixture.people.writer,
    );
    oneWinner(
      await Promise.allSettled([
        call(0, 'changeState', pause, fixture.people.writer),
        call(1, 'changeState', archive, fixture.people.writer),
      ]),
    );
    checks.push(
      'Competing owner edits and state changes retain one event per source revision',
    );
    const originalMembers = (
      await connectionSource.query(
        'SELECT "memberIds" FROM core."deliveryProject" WHERE id=$1',
        [fixture.projects.first],
      )
    )[0].memberIds;
    const mutateMembers = async (manager, memberIds) => {
      await manager.query(
        'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
        [fixture.projects.first, JSON.stringify(memberIds)],
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
    const restore = () =>
      connectionSource.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        await mutateMembers(manager, originalMembers);
      });
    const accessSource = plan('save', create());
    await call(0, 'save', accessSource);
    const ordered = plan(
      'save',
      {
        ...accessSource,
        requestId: randomUUID(),
        revision: 1,
        body: {
          ...accessSource.body,
          label: 'FIXTURE allowed before revocation',
        },
      },
      fixture.people.writer,
    );
    const accessHold = heldTransaction();
    const allowed = track(call(0, 'save', ordered, fixture.people.writer));
    await bounded(accessHold.entered.promise);
    const revoking = track(
      scoped[1].transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        await mutateMembers(manager, []);
      }),
    );
    await waitBlocked(1, identities[0].pid);
    accessHold.release.resolve();
    await bounded(allowed);
    await bounded(revoking);
    await deny(
      () => call(1, 'detail', { id: accessSource.id }, fixture.people.writer),
      [403],
    );
    await restore();
    checks.push(
      'An authorized source write commits before queued revocation; subsequent reads are denied',
    );
    const rejected = plan(
      'save',
      {
        ...ordered,
        requestId: randomUUID(),
        revision: 2,
        body: {
          ...accessSource.body,
          label: 'FIXTURE denied after revocation',
        },
      },
      fixture.people.writer,
    );
    const blocker = connectionSource.createQueryRunner();
    resources.push(blocker);
    await blocker.connect();
    await blocker.startTransaction();
    const [blocking] = await blocker.query('SELECT pg_backend_pid() AS pid');
    await blocker.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`delivery:${fixture.workspaceId}`],
    );
    const waiting = track(call(0, 'save', rejected, fixture.people.writer));
    await waitBlocked(0, blocking.pid);
    await mutateMembers(blocker.manager, []);
    await blocker.commitTransaction();
    await blocker.release();
    await deny(() => waiting, [403]);
    assert.equal(
      (
        await connectionSource.query(
          'SELECT id FROM core."deliveryCompetitorSourceEvent" WHERE "workspaceId"=$1 AND "requestId"=$2',
          [fixture.workspaceId, rejected.requestId],
        )
      ).length,
      0,
    );
    await restore();
    checks.push(
      'Revocation committed first prevents a waiting owner write from persisting an event',
    );
    assert.equal(providerRequests, 0);
    process.stdout.write(
      JSON.stringify(
        {
          passed: checks.length,
          checks,
          independentSessions: 2,
          providerRequests,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    hold?.release.resolve();
    for (const resource of resources) if (resource.resolve) resource.resolve();
    await Promise.allSettled(pending);
    for (const resource of resources)
      if (resource.isTransactionActive) await resource.rollbackTransaction();
    for (const resource of resources)
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
      for (const { owner, key, original } of transports) owner[key] = original;
    }
  }
}

if (require.main === module)
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });

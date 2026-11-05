const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  originalDigest,
  deferred,
  bounded,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  WHEN,
  services,
  seedContentFixture,
  accountInput,
  planInput,
  packageBody,
} = require('./check-delivery-content-support.cjs');
const {
  FILE,
  CHECKER,
  saveJournal,
  readJournal,
  journalCommand,
  ownedRows,
  validate,
  cleanup,
} = require('./check-delivery-content-concurrency-guard.cjs');

async function main() {
  assert.equal(
    process.env.OTOGROW_CONTENT_PROOF_SERVICES_STOPPED,
    '1',
    'Pause local API and workers before independent-session content acceptance.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const mode = process.argv[2] ?? 'run';
  assert(
    ['run', 'inspect', 'cleanup'].includes(mode) && process.argv.length <= 3,
  );
  if (mode === 'run')
    assert(
      !existsSync(FILE),
      'Recover the existing private journal before another fixture.',
    );
  await connectionSource.initialize();
  if (mode !== 'run') {
    try {
      const fixture = readJournal();
      if (mode === 'cleanup') await cleanup(connectionSource, fixture);
      else
        await connectionSource.transaction(async (manager) => {
          await manager.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
            [`delivery:${fixture.workspaceId}`],
          );
          await validate(manager, fixture);
        });
      process.stdout.write(`PASS guarded content concurrency ${mode}.\n`);
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
      throw new Error('Providers are forbidden in concurrency acceptance.');
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
  const barriers = [];
  const checks = [];
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const scoped = sessions.map((session, index) => ({
    getRepository: (entity) => session.getRepository(entity),
    transaction: (operation) =>
      session.transaction(async (manager) => {
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
  const held = (index = 0) => {
    hold = { index, entered: deferred(), release: deferred() };
    barriers.push(hold.release);
    return hold;
  };
  const waitBlocked = async (index, holder) => {
    for (let attempt = 0; attempt < 150; attempt++) {
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
      'The independent content transaction did not wait for its expected lock.',
    );
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
    await Promise.all(sessions.map((session) => session.initialize()));
    const original = await originalDigest((...arguments_) =>
      connectionSource.query(...arguments_),
    );
    await connectionSource.transaction(async (manager) => {
      fixture = await seedContentFixture(manager, 'content_race');
      fixture.checker = CHECKER;
      fixture.original = original;
      fixture.commands = [];
      fixture.mutable = {};
      fixture.seed = await ownedRows(manager, fixture);
      fixture.seedSchema = await schemaFingerprint(manager);
      saveJournal(fixture, true);
      if (process.env.OTOGROW_CONTENT_PROOF_FAILURE === 'PRECOMMIT')
        throw new Error('Injected PRECOMMIT failure.');
    });
    if (process.env.OTOGROW_CONTENT_PROOF_FAILURE === 'AFTER_SEED_COMMIT')
      throw new Error('Injected AFTER_SEED_COMMIT failure.');
    const domains = scoped.map((source) => services(source, fixture));
    const call = (index, method, input, person = fixture.people.writer) =>
      domains[index].call(method, input, person);
    const planCommand = (
      method,
      input,
      person = fixture.people.writer,
      body = null,
    ) => journalCommand(fixture, method, input, person, body);
    const accountCommand = planCommand(
      'saveAccount',
      accountInput(fixture),
      fixture.people.admin,
    );
    const duplicate = await Promise.all([
      call(0, 'saveAccount', accountCommand, fixture.people.admin),
      call(1, 'saveAccount', accountCommand, fixture.people.admin),
    ]);
    assert.deepEqual(duplicate[0], duplicate[1]);
    checks.push(
      'Independent identical account requests recover one original receipt',
    );
    const account = { ...accountCommand, revision: duplicate[0].revision };
    const parent = planCommand(
      'savePlan',
      planInput(fixture),
      fixture.people.admin,
    );
    const parentReceipt = await call(
      0,
      'savePlan',
      parent,
      fixture.people.admin,
    );
    const prepare = async (input, person = fixture.people.writer) => {
      const preview = await call(
        0,
        'preview',
        { ...input, expectedSourceFingerprint: null },
        person,
      );
      return planCommand(
        'save',
        { ...input, expectedSourceFingerprint: preview.body.sourceFingerprint },
        person,
        preview.body,
      );
    };
    const fresh = (selectedAccount = account) => ({
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 0,
      planId: parent.id,
      planRevision: parentReceipt.revision,
      body: packageBody(fixture, selectedAccount),
      expectedSourceFingerprint: null,
    });
    const first = await prepare(fresh());
    const firstDuplicate = await Promise.all([
      call(0, 'save', first),
      call(1, 'save', first),
    ]);
    assert.deepEqual(firstDuplicate[0], firstDuplicate[1]);
    checks.push(
      'Independent identical package saves create one version, receipt and activity event',
    );
    const changed = await Promise.all(
      ['A', 'B'].map((label) =>
        prepare({
          ...first,
          requestId: randomUUID(),
          revision: firstDuplicate[0].revision,
          body: {
            ...first.body,
            caption: `FIXTURE conflicting content ${label}`,
          },
        }),
      ),
    );
    oneWinner(
      await Promise.allSettled([
        call(0, 'save', changed[0]),
        call(1, 'save', changed[1]),
      ]),
    );
    checks.push(
      'Conflicting edits to the same package have exactly one optimistic revision winner',
    );
    const decideInput = async (
      id,
      action,
      person = fixture.people.writer,
      changes = {},
    ) => {
      const current = await call(0, 'detail', { id }, person);
      return planCommand(
        'decide',
        {
          id,
          requestId: randomUUID(),
          revision: current.variant.revision,
          action,
          sourceFingerprint: current.currentSourceFingerprint,
          note: '',
          evidenceUrl: '',
          publishedAt: null,
          correctsEventId: null,
          ...changes,
        },
        person,
      );
    };
    await call(0, 'decide', await decideInput(first.id, 'SUBMIT'));
    await call(
      0,
      'decide',
      await decideInput(first.id, 'APPROVE', fixture.people.reader),
      fixture.people.reader,
    );
    const publication = await decideInput(
      first.id,
      'RECORD_PUBLICATION',
      fixture.people.writer,
      {
        evidenceUrl: 'https://www.instagram.com/p/FIXTURE_RACE/',
        publishedAt: WHEN,
        note: 'FIXTURE manual publication attestation.',
      },
    );
    const otherPublication = planCommand('decide', {
      ...publication,
      requestId: randomUUID(),
    });
    oneWinner(
      await Promise.allSettled([
        call(0, 'decide', publication),
        call(1, 'decide', otherPublication),
      ]),
    );
    checks.push(
      'Concurrent first-publication records have one winner and cannot double-publish a variant',
    );
    const left = await prepare(fresh());
    const right = await prepare(fresh());
    const leftSaved = await call(0, 'save', left);
    const rightSaved = await call(0, 'save', right);
    const leftChange = await prepare({
      ...left,
      requestId: randomUUID(),
      revision: leftSaved.revision,
      body: { ...left.body, caption: 'FIXTURE independent left edit' },
    });
    const rightChange = await prepare({
      ...right,
      requestId: randomUUID(),
      revision: rightSaved.revision,
      body: { ...right.body, caption: 'FIXTURE independent right edit' },
    });
    const independentBarrier = held();
    const leftPending = track(call(0, 'save', leftChange));
    await bounded(independentBarrier.entered.promise);
    const rightResult = await bounded(
      track(call(1, 'save', rightChange)),
      'Unrelated sibling edits must not wait for an exclusive plan lock.',
    );
    assert.equal(rightResult.version, 2);
    independentBarrier.release.resolve();
    await leftPending;
    checks.push(
      'Different existing variants under one plan can commit independently',
    );
    const raceAccountCommand = planCommand(
      'saveAccount',
      accountInput(fixture, 'INSTAGRAM', { name: 'FIXTURE account lock race' }),
      fixture.people.admin,
    );
    const raceAccountReceipt = await call(
      0,
      'saveAccount',
      raceAccountCommand,
      fixture.people.admin,
    );
    const raceAccount = {
      ...raceAccountCommand,
      revision: raceAccountReceipt.revision,
    };
    const racePost = await prepare(fresh(raceAccount));
    await call(0, 'save', racePost);
    const submit = await decideInput(racePost.id, 'SUBMIT');
    const archive = planCommand(
      'saveAccount',
      {
        ...raceAccountCommand,
        revision: raceAccount.revision,
        requestId: randomUUID(),
        archived: true,
      },
      fixture.people.admin,
    );
    const decisionBarrier = held();
    const submitting = track(call(0, 'decide', submit));
    await bounded(decisionBarrier.entered.promise);
    const archiving = track(
      call(1, 'saveAccount', archive, fixture.people.admin),
    );
    await waitBlocked(1, identities[0].pid);
    decisionBarrier.release.resolve();
    await submitting;
    await archiving;
    const archivedPost = await call(0, 'detail', { id: racePost.id });
    assert.equal(archivedPost.variant.status, 'REVIEW');
    assert.equal(archivedPost.sourceChanged, true);
    assert(!archivedPost.allowedActions.includes('APPROVE'));
    checks.push(
      'Account archival waits for an in-flight package decision and then invalidates later review',
    );
    const reverseCommand = planCommand(
      'saveAccount',
      accountInput(fixture, 'INSTAGRAM', {
        name: 'FIXTURE reverse account race',
      }),
      fixture.people.admin,
    );
    const reverseReceipt = await call(
      0,
      'saveAccount',
      reverseCommand,
      fixture.people.admin,
    );
    const reversePost = await prepare(
      fresh({ ...reverseCommand, revision: reverseReceipt.revision }),
    );
    await call(0, 'save', reversePost);
    const staleSubmit = await decideInput(reversePost.id, 'SUBMIT');
    const reverseArchive = planCommand(
      'saveAccount',
      {
        ...reverseCommand,
        revision: reverseReceipt.revision,
        requestId: randomUUID(),
        archived: true,
      },
      fixture.people.admin,
    );
    const accountBarrier = held();
    const accountWrite = track(
      call(0, 'saveAccount', reverseArchive, fixture.people.admin),
    );
    await bounded(accountBarrier.entered.promise);
    const staleDecision = track(call(1, 'decide', staleSubmit));
    await waitBlocked(1, identities[0].pid);
    accountBarrier.release.resolve();
    await accountWrite;
    await assert.rejects(
      () => staleDecision,
      (error) => error.getStatus() === 409,
    );
    checks.push(
      'Account archival committed first defeats a stale waiting decision without a receipt',
    );
    const revokedCommand = await decideInput(right.id, 'SUBMIT');
    const member = fixture.people.writer;
    const [changedMember] = await connectionSource.query(
      'SELECT md5(jsonb_set(to_jsonb(record),\'{deletedAt}\',to_jsonb($2::timestamptz))::text) AS hash FROM core."userWorkspace" record WHERE id=$1',
      [member.userWorkspaceId, WHEN],
    );
    const seedMember = fixture.seed
      .find((item) => item.schema === 'core' && item.name === 'userWorkspace')
      .rows.find((item) => item.id === member.userWorkspaceId);
    fixture.mutable[`core.userWorkspace:${member.userWorkspaceId}`] = [
      seedMember.hash,
      changedMember.hash,
    ];
    saveJournal(fixture);
    const revokeBarrier = held();
    const revoke = track(
      scoped[0].transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${fixture.workspaceId}`],
        );
        await manager.query(
          'UPDATE core."userWorkspace" SET "deletedAt"=$2 WHERE id=$1',
          [member.userWorkspaceId, WHEN],
        );
      }),
    );
    await bounded(revokeBarrier.entered.promise);
    const revokedWrite = track(call(1, 'decide', revokedCommand));
    await waitBlocked(1, identities[0].pid);
    revokeBarrier.release.resolve();
    await revoke;
    await assert.rejects(
      () => revokedWrite,
      (error) => error.getStatus() === 403,
    );
    await scoped[0].transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${fixture.workspaceId}`],
      );
      await manager.query(
        'UPDATE core."userWorkspace" SET "deletedAt"=null WHERE id=$1 AND "deletedAt"=$2',
        [member.userWorkspaceId, WHEN],
      );
    });
    checks.push(
      'Membership revocation wins against waiting work and leaves no unauthorized action receipt',
    );
    await connectionSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${fixture.workspaceId}`],
      );
      await validate(manager, fixture);
    });
    assert.equal(providerRequests, 0);
    await cleanup(connectionSource, fixture);
    process.stdout.write(
      `${JSON.stringify({ passed: checks.length, checks, providerRequests, preservedOriginals: true, fixtureCleaned: true }, null, 2)}\n`,
    );
  } finally {
    for (const barrier of barriers) barrier.resolve();
    await Promise.allSettled(pending);
    await Promise.allSettled(
      sessions
        .filter((session) => session.isInitialized)
        .map((session) => session.destroy()),
    );
    await connectionSource.destroy();
    for (const { owner, key, original } of transports) owner[key] = original;
  }
}
if (require.main === module)
  main().catch((error) => {
    process.stderr.write(
      `${error.stack}\nPrivate fixture journal, when present, is retained for guarded inspection/cleanup.\n`,
    );
    process.exitCode = 1;
  });

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { dirname } = require('node:path');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  dataFingerprint,
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  seedInboxFixture,
  inboxServices,
  consentInput,
  manualInput,
  cleanupInboxFixture,
} = require('./check-delivery-inbox-support.cjs');
const FILE = '/tmp/otogrow-inbox-concurrency-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const bounded = async (promise, label) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
function syncDirectory(path) {
  const descriptor = openSync(dirname(path), 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function journal(value, destination = FILE, initial = false) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(value));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    if (initial) {
      linkSync(temporary, destination);
      unlinkSync(temporary);
    } else renameSync(temporary, destination);
    syncDirectory(destination);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}
function readJournal() {
  const metadata = lstatSync(FILE);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o077) === 0 &&
      metadata.uid === process.getuid(),
  );
  const value = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(value.checker, 'inbox-concurrency-v1');
  for (const id of [
    value.workspaceId,
    value.foreignWorkspaceId,
    ...Object.values(value.people).flatMap((person) => [
      person.userId,
      person.memberId,
      person.userWorkspaceId,
    ]),
    ...Object.values(value.accounts),
    ...Object.values(value.channels),
    ...value.messages,
    ...value.associations,
    ...value.participants,
  ])
    assert.match(id, UUID);
  assert.equal(value.prefix, 'inbox_race');
  assert.equal(
    value.schemaName,
    `inbox_race_${value.workspaceId.replaceAll('-', '_')}`,
  );
  assert.equal(
    value.sentinel,
    `otogrow-reconciliation-fixture:${value.workspaceId}`,
  );
  assert(value.schemaName.length <= 63);
  return value;
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='5s'");
    await manager.query("SET LOCAL statement_timeout='60s'");
    const workspaces = await manager.query(
      'SELECT id FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    if (workspaces.length) {
      assert.equal(workspaces.length, 2);
      await cleanupInboxFixture(manager, fixture);
    }
    assert.equal(
      (
        await manager.query('SELECT to_regnamespace($1)::text AS schema', [
          fixture.schemaName,
        ])
      )[0].schema,
      null,
    );
    assert.deepEqual(
      await dataFingerprint(manager),
      fixture.protectedData,
      'Unrelated rows changed; preserve ownership journal.',
    );
    assert.equal(await schemaFingerprint(manager), fixture.protectedSchema);
  });
  const receipt = `${FILE}.${fixture.workspaceId}.cleaned.json`;
  const value = {
    checker: fixture.checker,
    workspaceId: fixture.workspaceId,
    schemaName: fixture.schemaName,
    cleaned: true,
  };
  if (!existsSync(receipt)) journal(value, receipt, true);
  else assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), value);
  assert.equal(readJournal().workspaceId, fixture.workspaceId);
  unlinkSync(FILE);
  syncDirectory(FILE);
}
async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  connectionSource.setOptions({ logging: false });
  if (process.argv[2] === 'cleanup') {
    assert.equal(process.argv.length, 3);
    await connectionSource.initialize();
    try {
      await cleanup(readJournal());
      console.log('Recovered only the exact owned Gmail concurrency fixture.');
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  assert.equal(process.argv.length, 2);
  assert.equal(
    process.env.OTOGROW_INBOX_PROOF_WORKERS_STOPPED,
    '1',
    'Pause API and worker processes before a committed outbox fixture, then explicitly attest OTOGROW_INBOX_PROOF_WORKERS_STOPPED=1.',
  );
  assert(!existsSync(FILE), 'Recover the prior private Gmail journal first.');
  const originalFetch = global.fetch;
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error('Concurrency proof forbids network.');
  };
  const name = `inbox-race:${randomUUID()}`;
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${name}:${index}`,
        },
      }),
  );
  const depths = [0, 0],
    sessions = [null, null],
    pending = [];
  let barrier = null,
    fixture;
  const scoped = sources.map((source, index) => ({
    manager: source.manager,
    getRepository: (entity) => source.getRepository(entity),
    query: (...args) => source.query(...args),
    transaction: (callback) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='10s'");
        await manager.query("SET LOCAL statement_timeout='20s'");
        [sessions[index]] = await manager.query(
          'SELECT pg_backend_pid() AS pid,txid_current()::text AS transaction',
        );
        const current = barrier;
        if (current) {
          current.arrivals.add(index);
          if (current.arrivals.size === 2) {
            barrier = null;
            current.ready.resolve();
          }
          await bounded(
            current.ready.promise,
            'Both independent connections did not enter.',
          );
        }
        depths[index]++;
        try {
          return await callback(manager);
        } finally {
          depths[index]--;
        }
      }),
  }));
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => {});
    return promise;
  };
  const paired = async (first, second) => {
    barrier = { arrivals: new Set(), ready: deferred() };
    const results = await bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Concurrent inbox commands did not settle.',
    );
    assert.notEqual(sessions[0].pid, sessions[1].pid);
    assert.notEqual(sessions[0].transaction, sessions[1].transaction);
    return results;
  };
  const winner = (results) => {
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.getStatus(), 409);
  };
  try {
    await connectionSource.initialize();
    for (const source of sources) await source.initialize();
    const protectedData = await dataFingerprint(connectionSource.manager),
      protectedSchema = await schemaFingerprint(connectionSource.manager);
    fixture = await connectionSource.transaction(async (manager) => {
      const value = await seedInboxFixture(manager, 'inbox_race');
      Object.assign(value, {
        checker: 'inbox-concurrency-v1',
        protectedData,
        protectedSchema,
      });
      journal(value, FILE, true);
      return value;
    });
    const options = [0, 1].map((index) => ({
      beforeSend: async () =>
        assert.equal(
          depths[index],
          0,
          'Provider ran while the service transaction was active.',
        ),
    }));
    const services = scoped.map((source, index) =>
      inboxServices(source, fixture, options[index]),
    );
    const consent = await consentInput(services[0], fixture);
    const same = await paired(
      () => services[0].call('consent', consent),
      () => services[1].call('consent', consent),
    );
    assert(same.every((result) => result.status === 'fulfilled'));
    assert.deepEqual(same[0].value.receipt, same[1].value.receipt);
    assert.equal(
      (
        await connectionSource.query(
          'SELECT count(*)::int AS count FROM core."deliveryInboxConsent" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].count,
      1,
    );
    const next = { ...consent, requestId: randomUUID(), revision: 1 };
    const competing = {
      ...next,
      requestId: randomUUID(),
      grants: next.grants.map((grant) => ({ ...grant, send: false })),
    };
    winner(
      await paired(
        () => services[0].call('consent', next),
        () => services[1].call('consent', competing),
      ),
    );
    let revision = (
      await services[0].call('conversation', { id: consent.conversationId })
    ).binding.revision;
    const restore = { ...consent, requestId: randomUUID(), revision };
    await services[0].call('consent', restore);
    revision++;
    const prepare = await manualInput(services[0], fixture);
    const prepared = await paired(
      () => services[0].reply('prepare', prepare, fixture.people.writer),
      () => services[1].reply('prepare', prepare, fixture.people.writer),
    );
    assert(prepared.every((result) => result.status === 'fulfilled'));
    assert.deepEqual(prepared[0].value.receipt, prepared[1].value.receipt);
    assert.equal(
      (
        await connectionSource.query(
          'SELECT count(*)::int AS count FROM core."deliveryInboxReply" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].count,
      1,
    );
    const send = {
      id: prepare.id,
      requestId: randomUUID(),
      bodyFingerprint: prepared[0].value.reply.bodyFingerprint,
      sourceFingerprint: prepared[0].value.reply.sourceFingerprint,
    };
    const sends = await paired(
      () => services[0].reply('send', send, fixture.people.writer),
      () => services[1].reply('send', send, fixture.people.writer),
    );
    assert(sends.every((result) => result.status === 'fulfilled'));
    assert.equal(
      services.reduce((total, service) => total + service.enqueued.length, 0),
      1,
    );
    const dispatched = await paired(
      () => services[0].replies.execute(prepare.id),
      () => services[1].replies.execute(prepare.id),
    );
    assert(dispatched.every((result) => result.status === 'fulfilled'));
    assert.equal(
      services.reduce((total, service) => total + service.calls.length, 0),
      1,
    );
    assert.equal(
      (
        await services[1].reply(
          'request',
          { requestId: send.requestId },
          fixture.people.writer,
        )
      ).reply.status,
      'SENT',
    );
    const queueReply = async () => {
      const input = await manualInput(services[0], fixture);
      const value = await services[0].reply(
        'prepare',
        input,
        fixture.people.writer,
      );
      await services[0].reply(
        'send',
        {
          id: input.id,
          requestId: randomUUID(),
          bodyFingerprint: value.reply.bodyFingerprint,
          sourceFingerprint: value.reply.sourceFingerprint,
        },
        fixture.people.writer,
      );
      return input;
    };
    const revoked = await queueReply();
    const locker = connectionSource.createQueryRunner();
    await locker.connect();
    await locker.startTransaction();
    try {
      await locker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${fixture.workspaceId}`],
      );
      const [{ pid: blockerPid }] = await locker.query(
        'SELECT pg_backend_pid() AS pid',
      );
      const waiting = track(services[0].replies.execute(revoked.id));
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (Date.now() < deadline) {
        const [state] = await connectionSource.query(
          'SELECT pg_blocking_pids($1) AS blockers',
          [sessions[0].pid],
        );
        if (state.blockers.includes(blockerPid)) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert(
        blocked,
        'Worker did not wait for the current workspace authority lock.',
      );
      const local = {
        manager: locker.manager,
        getRepository: (entity) => locker.manager.getRepository(entity),
        query: (...args) => locker.query(...args),
        transaction: (callback) => locker.manager.transaction(callback),
      };
      const owner = inboxServices(local, fixture);
      await owner.call('revoke', {
        id: consent.id,
        requestId: randomUUID(),
        revision,
      });
      await locker.commitTransaction();
      await bounded(waiting, 'Revoked worker remained blocked.');
    } finally {
      if (locker.isTransactionActive) await locker.rollbackTransaction();
      await locker.release();
    }
    assert.equal(
      services.reduce((total, service) => total + service.calls.length, 0),
      1,
    );
    assert.equal(
      (
        await connectionSource.query(
          'SELECT status FROM core."deliveryInboxReply" WHERE id=$1',
          [revoked.id],
        )
      )[0].status,
      'FAILED',
    );
    revision++;
    await services[0].call('consent', {
      ...consent,
      requestId: randomUUID(),
      revision,
    });
    revision++;
    const uncertain = await queueReply();
    options[0].failSend = true;
    await services[0].replies.execute(uncertain.id);
    options[0].failSend = false;
    assert.equal(
      (
        await services[0].reply(
          'detail',
          { id: uncertain.id },
          fixture.people.writer,
        )
      ).status,
      'UNCERTAIN',
    );
    await Promise.all([
      services[0].replies.execute(uncertain.id),
      services[1].replies.execute(uncertain.id),
    ]);
    assert.equal(
      services.reduce((total, service) => total + service.calls.length, 0),
      2,
    );
    const cancelled = await queueReply();
    const cancelId = randomUUID();
    const cancel = await paired(
      () =>
        services[0].reply(
          'cancel',
          { id: cancelled.id, requestId: cancelId },
          fixture.people.writer,
        ),
      () =>
        services[1].reply(
          'cancel',
          { id: cancelled.id, requestId: cancelId },
          fixture.people.writer,
        ),
    );
    assert(cancel.every((result) => result.status === 'fulfilled'));
    await services[0].replies.execute(cancelled.id);
    assert.equal(
      services.reduce((total, service) => total + service.calls.length, 0),
      2,
    );
    assert.equal(networkCalls, 0);
    console.log(
      'PASS two-session Gmail races: exact consent/preparation/send retry yields one receipt/task-free outbox and one dispatch; stale distinct consent one409; revoked owner consent wins the shared workspace lock before worker; lost provider result stays uncertain; cancel replay never dispatches. Only2 synthetic sender calls, no network.',
    );
  } finally {
    barrier?.ready.resolve();
    await Promise.allSettled(pending);
    for (const source of sources)
      if (source.isInitialized) await source.destroy();
    try {
      if (fixture && connectionSource.isInitialized)
        await cleanup(readJournal());
      else if (existsSync(FILE) && connectionSource.isInitialized)
        await cleanup(readJournal());
    } finally {
      global.fetch = originalFetch;
      if (connectionSource.isInitialized) await connectionSource.destroy();
    }
  }
}
main().catch((error) => {
  console.error(error.stack);
  console.error(
    `Preserve ${FILE} on uncertain cleanup; use only this checker's cleanup command.`,
  );
  process.exitCode = 1;
});

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
const axios = require('axios');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  DeliveryReminderOutboxEntity,
} = require('../dist/modules/delivery/entities/delivery-reminder-outbox.entity');
const {
  DeliveryReminderService,
} = require('../dist/modules/delivery/operations/delivery-reminder.service');
const {
  NOW,
  SOURCE_TABLES,
  ESCALATION_TABLES,
  createEscalationFixture,
  cleanupEscalationFixture,
  buildEscalationServices,
  escalationHarness,
  ruleDraft,
  outboxForRule,
  sourceFingerprint,
} = require('./check-delivery-founder-escalation-support.cjs');

const FILE = '/tmp/otogrow-founder-escalation-concurrency-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function bounded(promise, label, milliseconds = 10000) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(label)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
function syncDirectory(path) {
  const descriptor = openSync(dirname(path), 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function writeJournal(value, destination = FILE, initial = false) {
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
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  for (const value of [
    fixture.workspaceId,
    fixture.foreignWorkspaceId,
    fixture.otherTaskId,
    ...fixture.taskIds,
  ])
    assert.match(value, UUID);
  assert.match(fixture.schemaName, /^founder_alert_race_[a-f0-9_]{36}$/);
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  return fixture;
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='5s'");
    await manager.query("SET LOCAL statement_timeout='30s'");
    const rows = await manager.query(
      'SELECT id FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
    if (rows.length) await cleanupEscalationFixture(manager, fixture);
    else {
      for (const name of [
        ...SOURCE_TABLES,
        ...ESCALATION_TABLES,
        'deliveryReminderOutbox',
        'deliveryOperations',
        'otogrowActivityEvent',
        'otogrowRole',
        'otogrowRoleAssignment',
        'otogrowMemberAccess',
        'otogrowAccessEvent',
        'userWorkspace',
      ]) {
        const [{ count }] = await manager.query(
          `SELECT count(*)::int AS count FROM core."${name}" WHERE "workspaceId"=ANY($1::uuid[])`,
          [[fixture.workspaceId, fixture.foreignWorkspaceId]],
        );
        assert.equal(count, 0, `Interrupted cleanup left ${name}.`);
      }
      const [{ schema }] = await manager.query(
        'SELECT to_regnamespace($1)::text AS schema',
        [fixture.schemaName],
      );
      assert.equal(schema, null);
      const [{ count }] = await manager.query(
        'SELECT count(*)::int AS count FROM core."user" WHERE id=ANY($1::uuid[])',
        [Object.values(fixture.people).map((person) => person.userId)],
      );
      assert.equal(count, 0);
    }
  });
  const receipt = `${FILE}.${fixture.workspaceId}.cleaned.json`;
  const value = {
    workspaceId: fixture.workspaceId,
    foreignWorkspaceId: fixture.foreignWorkspaceId,
    schemaName: fixture.schemaName,
    sentinel: fixture.sentinel,
    cleaned: true,
  };
  if (existsSync(receipt))
    assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), value);
  else writeJournal(value, receipt, true);
  if (existsSync(FILE)) {
    assert.equal(readJournal().workspaceId, fixture.workspaceId);
    unlinkSync(FILE);
    syncDirectory(FILE);
  }
}
async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  if (process.argv.length === 3) {
    assert.equal(process.argv[2], 'cleanup');
    await connectionSource.initialize();
    try {
      await cleanup(readJournal());
      console.log(
        'Recovered only the ownership-verified founder escalation fixture.',
      );
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  assert.equal(process.argv.length, 2);
  assert(
    !existsSync(FILE),
    `Recover ${FILE} with this checker's cleanup command first.`,
  );
  const sessionName = `founder-escalation-qa:${randomUUID()}`;
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${sessionName}:${index}`,
        },
      }),
  );
  let fixture;
  let startBarrier = null;
  let httpRelease = null;
  const pending = [];
  const blockers = [];
  const originalPost = axios.post;
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const scoped = sources.map((source, index) => ({
    manager: source.manager,
    query: (...arguments_) => source.query(...arguments_),
    getRepository: (entity) => {
      const repository = source.getRepository(entity);
      // Production recovery is global; synthetic checks may only inspect their own jobs.
      return entity === DeliveryReminderOutboxEntity
        ? new Proxy(repository, {
            get: (target, property) =>
              property === 'find'
                ? (options) =>
                    target.find({
                      ...options,
                      where: {
                        ...options.where,
                        workspaceId: fixture.workspaceId,
                      },
                    })
                : Reflect.get(target, property),
          })
        : repository;
    },
    transaction: (callback) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='10s'");
        await manager.query("SET LOCAL statement_timeout='20s'");
        const barrier = startBarrier;
        if (barrier) {
          barrier.arrivals.add(index);
          if (barrier.arrivals.size === 2) {
            startBarrier = null;
            barrier.ready.resolve();
          }
          await bounded(
            barrier.ready.promise,
            'Both independent founder workers must reach the barrier.',
          );
        }
        return callback(manager);
      }),
  }));
  const paired = async (first, second) => {
    const before = await sourceFingerprint(connectionSource.manager, fixture);
    startBarrier = { arrivals: new Set(), ready: deferred() };
    const results = await bounded(
      Promise.allSettled([track(first()), track(second())]),
      'Founder race did not settle.',
    );
    assert.deepEqual(
      await sourceFingerprint(connectionSource.manager, fixture),
      before,
    );
    return results;
  };
  const values = (results) =>
    results.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    });
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    await connectionSource.transaction(async (manager) => {
      fixture = await createEscalationFixture(manager, 'founder_alert_race');
      writeJournal(fixture, FILE, true);
    });
    const services = scoped.map((source) =>
      buildEscalationServices(source, fixture),
    );
    const tests = services.map((service) =>
      escalationHarness(service, fixture),
    );
    const commandId = randomUUID();
    const draft = ruleDraft(fixture);
    const saved = values(
      await paired(
        () => tests[0].save(draft, undefined, commandId),
        () => tests[1].save(draft, undefined, commandId),
      ),
    );
    assert.deepEqual(saved.map((result) => result.replayed).sort(), [
      false,
      true,
    ]);
    const preview = await tests[0].preview(saved[0].rule);
    const enableCommand = randomUUID();
    const enableFields = {
      enabled: true,
      previewToken: preview.previewToken,
      adoptLegacyRouting: true,
    };
    const enabled = values(
      await paired(
        () =>
          tests[0].change(
            saved[0].rule,
            enableFields,
            undefined,
            enableCommand,
          ),
        () =>
          tests[1].change(
            saved[0].rule,
            enableFields,
            undefined,
            enableCommand,
          ),
      ),
    );
    assert.deepEqual(enabled.map((result) => result.replayed).sort(), [
      false,
      true,
    ]);
    const rule = enabled[0].rule;
    values(
      await paired(
        () => services[0].escalation.queueWorkspace(fixture.workspaceId, NOW),
        () => services[1].escalation.queueWorkspace(fixture.workspaceId, NOW),
      ),
    );
    const outbox = (ruleId) =>
      outboxForRule(connectionSource.manager, fixture, ruleId);
    const [first] = await outbox(rule.id);
    assert(first);
    assert.equal((await outbox(rule.id)).length, 1);
    const claims = values(
      await paired(
        () => services[0].escalation.claimReminder(first.id, NOW),
        () => services[1].escalation.claimReminder(first.id, NOW),
      ),
    );
    assert.equal(
      claims.filter(Boolean).length,
      1,
      'Only one worker may obtain an external-send payload.',
    );
    assert(!claims.find(Boolean).text.includes('PRIVATE_'));
    await services[0].escalation.finishReminder(first.id, 'SENT', null, NOW);

    const fresh = async () => {
      const result = await tests[0].save(ruleDraft(fixture));
      const preview = await tests[0].preview(result.rule);
      const changed = await tests[0].change(result.rule, {
        enabled: true,
        previewToken: preview.previewToken,
        adoptLegacyRouting: true,
      });
      await services[0].escalation.queueWorkspace(fixture.workspaceId, NOW);
      const [entry] = await outbox(changed.rule.id);
      assert(entry);
      return { rule: changed.rule, entry };
    };
    const enqueued = new Set();
    const operations = {
      enqueueReminder: async (id) => {
        enqueued.add(id);
      },
      claimReminder: async () => {
        throw new Error(
          'A founder job must never use task reminder authorization.',
        );
      },
      finishReminder: async () => {
        throw new Error(
          'A founder receipt must never use task reminder ownership.',
        );
      },
    };
    const noChat = {
      ownsReminder: async () => false,
      queueDue: async () => {},
    };
    const owner = (service, override = {}) => ({
      ownsReminder: (id) => service.ownsReminder(id),
      queueDue: (date) => service.queueWorkspace(fixture.workspaceId, date),
      claimReminder: (...arguments_) => service.claimReminder(...arguments_),
      finishReminder: (...arguments_) => service.finishReminder(...arguments_),
      ...override,
    });
    const reminders = new DeliveryReminderService(
      scoped[0],
      operations,
      noChat,
      owner(services[0].escalation),
    );
    let sends = 0;
    let behavior = 'success';
    let httpEntered = null;
    const [{ pid: workerPid }] = await sources[0].query(
      'SELECT pg_backend_pid() AS pid',
    );
    axios.post = async (url, body) => {
      assert.equal(
        url,
        'https://api.telegram.org/botfixture-founder-token/sendMessage',
      );
      assert.equal(body.chat_id, '424242');
      assert(!body.text.includes('PRIVATE_'));
      const [worker] = await connectionSource.query(
        'SELECT xact_start AS started FROM pg_stat_activity WHERE pid=$1',
        [workerPid],
      );
      assert.equal(
        worker.started,
        null,
        'Telegram HTTP must not retain a database transaction/lock.',
      );
      sends++;
      if (behavior === 'hold') {
        httpEntered.resolve();
        await httpRelease.promise;
      }
      if (behavior === 'timeout')
        throw new Error('Synthetic ambiguous HTTP timeout');
      return { data: { ok: true } };
    };
    const slow = await fresh();
    behavior = 'hold';
    httpEntered = deferred();
    httpRelease = deferred();
    const sending = track(reminders.execute(slow.entry.id, NOW));
    await bounded(
      httpEntered.promise,
      'The mock founder HTTP call did not start.',
    );
    await bounded(
      tests[1].save(
        ruleDraft(fixture, { name: 'Rule edit while network is slow' }),
      ),
      'Slow Telegram blocked an independent rule edit.',
    );
    await reminders.execute(slow.entry.id, NOW);
    assert.equal(sends, 1);
    httpRelease.resolve();
    await sending;
    behavior = 'success';
    assert.equal((await outbox(slow.rule.id))[0].status, 'SENT');

    const timeout = await fresh();
    behavior = 'timeout';
    await reminders.execute(timeout.entry.id, NOW);
    behavior = 'success';
    assert.equal((await outbox(timeout.rule.id))[0].status, 'UNCERTAIN');
    const afterTimeout = sends;
    await reminders.execute(timeout.entry.id, NOW);
    await reminders.recover(new Date(NOW.getTime() + 180000));
    assert.equal(
      sends,
      afterTimeout,
      'An uncertain founder send cannot be retried.',
    );

    const lostReceipt = await fresh();
    const receiptFailure = new DeliveryReminderService(
      scoped[0],
      operations,
      noChat,
      owner(services[0].escalation, {
        finishReminder: async () => {
          throw new Error('Synthetic receipt failure after HTTP acceptance');
        },
      }),
    );
    await assert.rejects(
      receiptFailure.execute(lostReceipt.entry.id, NOW),
      /receipt failure/,
    );
    const afterLostReceipt = sends;
    assert.equal((await outbox(lostReceipt.rule.id))[0].status, 'SENDING');
    await reminders.recover(new Date(NOW.getTime() + 180000));
    assert.equal((await outbox(lostReceipt.rule.id))[0].status, 'UNCERTAIN');
    await reminders.execute(lostReceipt.entry.id, NOW);
    assert.equal(sends, afterLostReceipt);

    const interrupted = await fresh();
    assert(
      await services[0].escalation.claimReminder(interrupted.entry.id, NOW),
    );
    await reminders.recover(new Date(NOW.getTime() + 180000));
    assert.equal((await outbox(interrupted.rule.id))[0].status, 'UNCERTAIN');
    assert.equal(sends, afterLostReceipt);

    const recovered = await fresh();
    await reminders.recover(NOW);
    assert(
      enqueued.has(recovered.entry.id),
      'Durable founder work must be enqueued after process/Redis recovery.',
    );
    const beforeRevocation = sends;
    const blocker = connectionSource.createQueryRunner();
    blockers.push(blocker);
    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`delivery:${fixture.workspaceId}`],
    );
    const waitingClaim = track(
      services[0].escalation.claimReminder(recovered.entry.id, NOW),
    );
    await blocker.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      fixture.people.admin.userId,
    ]);
    await blocker.commitTransaction();
    await blocker.release();
    assert.equal(
      await bounded(waitingClaim, 'Revoked founder claim did not settle.'),
      null,
    );
    assert.equal((await outbox(recovered.rule.id))[0].status, 'SUPPRESSED');
    assert.equal(sends, beforeRevocation);
    await connectionSource.query(
      'UPDATE core."user" SET disabled=false WHERE id=$1',
      [fixture.people.admin.userId],
    );
    console.log(
      'PASS isolated founder escalation races: stable command replay, concurrent complete observers, single committed claim, real third-owner reminder routing, queue recovery, nonblocking mocked HTTP, terminal ambiguity/interruption/lost receipt and current-admin revocation. No real Telegram or provider call.',
    );
  } finally {
    axios.post = originalPost;
    if (httpRelease) httpRelease.resolve();
    startBarrier?.ready.resolve();
    startBarrier = null;
    for (const blocker of blockers) {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      if (!blocker.isReleased) await blocker.release();
    }
    await Promise.allSettled(pending);
    await Promise.all(
      sources
        .filter((source) => source.isInitialized)
        .map((source) => source.destroy()),
    );
    if (connectionSource.isInitialized) {
      try {
        if (fixture && existsSync(FILE)) await cleanup(fixture);
      } finally {
        await connectionSource.destroy();
      }
    }
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    console.error(
      `Retain ${FILE} if present; its private ownership journal supports exact recovery.`,
    );
    process.exitCode = 1;
  });

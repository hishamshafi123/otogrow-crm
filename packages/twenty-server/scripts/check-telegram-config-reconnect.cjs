const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { dirname } = require('node:path');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  TelegramConfigEntity,
} = require('../dist/modules/lead-assignment/entities/telegram-config.entity');
const {
  TelegramConfigService,
} = require('../dist/modules/lead-assignment/services/telegram-config.service');
const {
  TelegramConfigEncryptionService,
} = require('../dist/modules/lead-assignment/services/telegram-config-encryption.service');
const {
  SecretEncryptionService,
} = require('../dist/engine/core-modules/secret-encryption/secret-encryption.service');
const {
  createFixture,
  cleanupFixture,
} = require('./check-delivery-reconciliation.cjs');

const FILE = '/tmp/otogrow-telegram-reconnect-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const WORKSPACE_TABLES = [
  'telegramConfig',
  'deliveryOperations',
  'deliveryProject',
  'otogrowActivityEvent',
  'otogrowRole',
  'otogrowRoleAssignment',
  'otogrowMemberAccess',
  'otogrowAccessEvent',
  'userWorkspace',
];
function syncDirectory(path) {
  const descriptor = openSync(dirname(path), 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function writeJournal(fixture) {
  const temporary = `${FILE}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(fixture));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    linkSync(temporary, FILE);
    unlinkSync(temporary);
    syncDirectory(FILE);
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
      (metadata.mode & 0o077) === 0,
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.match(fixture.schemaName, /^telegram_reconnect_race_[a-f0-9_]{36}$/);
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  for (const id of [
    fixture.workspaceId,
    fixture.foreignWorkspaceId,
    ...fixture.configIds,
  ])
    assert.match(id, UUID);
  return fixture;
}
async function protectedBots(manager, fixture) {
  return manager.query(
    'SELECT record.id,md5(to_jsonb(record)::text) AS hash FROM core."telegramConfig" record WHERE "workspaceId"<>ALL($1::uuid[]) ORDER BY id',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='5s'");
    const workspaceIds = [fixture.workspaceId, fixture.foreignWorkspaceId];
    const workspaces = await manager.query(
      'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
      [workspaceIds],
    );
    if (workspaces.length) {
      assert.equal(workspaces.length, 2);
      for (const workspace of workspaces) {
        assert.equal(workspace.displayName, fixture.sentinel);
        assert.equal(workspace.databaseSchema, fixture.schemaName);
      }
      const rows = await manager.query(
        'SELECT id,"workspaceId" FROM core."telegramConfig" WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY id',
        [workspaceIds],
      );
      assert.deepEqual(
        rows.map((row) => row.id).sort(),
        [...fixture.configIds].sort(),
      );
      await manager.query(
        'DELETE FROM core."telegramConfig" WHERE id=ANY($1::uuid[]) AND "workspaceId"=ANY($2::uuid[])',
        [fixture.configIds, workspaceIds],
      );
      await cleanupFixture(manager, fixture);
    } else {
      for (const table of WORKSPACE_TABLES) {
        const [{ count }] = await manager.query(
          `SELECT count(*)::int AS count FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
          [workspaceIds],
        );
        assert.equal(count, 0);
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
    assert.deepEqual(
      await protectedBots(manager, fixture),
      fixture.originalBots,
      'Every preexisting bot configuration, including deleted records, must remain unchanged.',
    );
  });
  if (existsSync(FILE)) {
    assert.equal(readJournal().workspaceId, fixture.workspaceId);
    unlinkSync(FILE);
    syncDirectory(FILE);
  }
}
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
        'Recovered only the exact synthetic Telegram reconnect fixture.',
      );
    } finally {
      await connectionSource.destroy();
    }
    return;
  }
  assert.equal(process.argv.length, 2);
  assert(
    !existsSync(FILE),
    `Recover ${FILE} first with this checker's cleanup command.`,
  );
  const session = `telegram-reconnect-qa:${randomUUID()}`;
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${session}:${index}`,
        },
      }),
  );
  const key = randomBytes(32).toString('hex');
  const crypto = new TelegramConfigEncryptionService(
    new SecretEncryptionService({
      get: (name) => (name === 'ENCRYPTION_KEY' ? key : undefined),
    }),
  );
  const encryption = {
    encrypt: (input) => crypto.encrypt(input),
    decrypt: () => {
      throw new Error(
        'Configuration changes must never decrypt an existing credential.',
      );
    },
  };
  const serviceFor = (manager) =>
    new TelegramConfigService(
      manager.getRepository(TelegramConfigEntity),
      encryption,
    );
  const pending = [];
  const blockers = [];
  let fixture;
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const raw = (manager, workspaceId) =>
    manager
      .getRepository(TelegramConfigEntity)
      .findOne({ where: { workspaceId }, withDeleted: true });
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    await connectionSource.transaction(async (manager) => {
      await manager.query("SET LOCAL lock_timeout='5s'");
      await manager.query("SET LOCAL statement_timeout='30s'");
      fixture = await createFixture(manager, 'telegram_reconnect_race');
      fixture.originalBots = await protectedBots(manager, fixture);
      const service = serviceFor(manager);
      const first = await service.upsert(
        {
          botToken: 'synthetic-initial-credential',
          botUsername: 'initial_fixture_bot',
          isActive: false,
        },
        fixture.workspaceId,
      );
      assert(first.botToken.startsWith('enc:v2:'));
      assert.notEqual(first.botToken, 'synthetic-initial-credential');
      assert.equal(
        crypto.decrypt({
          ciphertext: first.botToken,
          workspaceId: fixture.workspaceId,
        }),
        'synthetic-initial-credential',
      );
      const edited = await service.upsert(
        { botUsername: 'renamed_fixture_bot' },
        fixture.workspaceId,
      );
      assert.equal(edited.id, first.id);
      assert.equal(edited.botToken, first.botToken);
      assert.equal(edited.isActive, false);
      await service.delete(fixture.workspaceId);
      assert.equal(await service.findByWorkspaceId(fixture.workspaceId), null);
      const deleted = await raw(manager, fixture.workspaceId);
      for (const input of [
        {},
        { botToken: '' },
        { botToken: '   ' },
        { botUsername: 'tokenless_restore', isActive: true },
      ]) {
        await assert.rejects(
          service.upsert(input, fixture.workspaceId),
          (error) => error.getStatus?.() === 400,
        );
        assert.deepEqual(await raw(manager, fixture.workspaceId), deleted);
      }
      const restored = await service.upsert(
        { botToken: 'synthetic-replacement-credential' },
        fixture.workspaceId,
      );
      assert.equal(restored.id, first.id);
      assert.equal(restored.createdAt.getTime(), first.createdAt.getTime());
      assert.equal(restored.deletedAt, null);
      assert.equal(restored.botUsername, null);
      assert.equal(restored.isActive, true);
      assert.equal(
        crypto.decrypt({
          ciphertext: restored.botToken,
          workspaceId: fixture.workspaceId,
        }),
        'synthetic-replacement-credential',
      );
      await service.upsert({ isActive: false }, fixture.workspaceId);
      const beforeFailure = await raw(manager, fixture.workspaceId);
      await assert.rejects(
        manager.transaction(async (transaction) => {
          await serviceFor(transaction).upsert(
            {
              botToken: 'synthetic-rolled-back-credential',
              botUsername: 'rollback_fixture_bot',
              isActive: false,
            },
            fixture.workspaceId,
          );
          throw new Error('Synthetic outer rollback after reconnect');
        }),
        /Synthetic outer rollback/,
      );
      assert.deepEqual(await raw(manager, fixture.workspaceId), beforeFailure);
      const foreign = await service.upsert(
        {
          botToken: 'synthetic-other-workspace-credential',
          botUsername: 'foreign_fixture_bot',
          isActive: false,
        },
        fixture.foreignWorkspaceId,
      );
      assert.notEqual(foreign.id, first.id);
      fixture.configIds = [first.id, foreign.id];
      assert.deepEqual(
        await protectedBots(manager, fixture),
        fixture.originalBots,
      );
      writeJournal(fixture);
    });
    const services = sources.map((source) => serviceFor(source.manager));
    const bothWaiting = async (count) =>
      bounded(
        (async () => {
          while (true) {
            const [{ waiting }] = await connectionSource.query(
              "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE application_name LIKE $1 AND wait_event='advisory'",
              [`${session}:%`],
            );
            if (waiting === count) return;
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        })(),
        'Independent reconnect sessions did not reach their advisory-lock waits.',
      );
    const hold = async () => {
      const runner = connectionSource.createQueryRunner();
      blockers.push(runner);
      await runner.connect();
      await runner.startTransaction();
      await runner.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${fixture.workspaceId}`],
      );
      return runner;
    };
    const pair = async (first, second) => {
      const blocker = await hold();
      const promises = [track(first()), track(second())];
      await bothWaiting(2);
      await blocker.commitTransaction();
      await blocker.release();
      return bounded(
        Promise.all(promises),
        'Concurrent bot changes did not settle.',
      );
    };
    const originalId = fixture.configIds[0];
    const initialRace = await pair(
      () =>
        services[0].upsert(
          {
            botToken: 'synthetic-race-a',
            botUsername: 'race_a_fixture_bot',
            isActive: false,
          },
          fixture.workspaceId,
        ),
      () =>
        services[1].upsert(
          {
            botToken: 'synthetic-race-b',
            botUsername: 'race_b_fixture_bot',
            isActive: false,
          },
          fixture.workspaceId,
        ),
    );
    assert(initialRace.every((row) => row.id === originalId));
    await services[0].delete(fixture.workspaceId);
    const restoredRace = await pair(
      () =>
        services[0].upsert(
          { botToken: 'synthetic-restored-a', isActive: false },
          fixture.workspaceId,
        ),
      () =>
        services[1].upsert(
          { botToken: 'synthetic-restored-b', isActive: false },
          fixture.workspaceId,
        ),
    );
    assert(
      restoredRace.every(
        (row) => row.id === originalId && row.deletedAt === null,
      ),
    );
    await pair(
      () =>
        services[0].upsert(
          {
            botToken: 'synthetic-save-delete-race',
            botUsername: 'final_fixture_bot',
            isActive: false,
          },
          fixture.workspaceId,
        ),
      () => services[1].delete(fixture.workspaceId),
    );
    const final = await raw(connectionSource.manager, fixture.workspaceId);
    assert.equal(final.id, originalId);
    assert.equal(final.isActive, false);
    assert.equal(
      crypto.decrypt({
        ciphertext: final.botToken,
        workspaceId: fixture.workspaceId,
      }),
      'synthetic-save-delete-race',
    );
    const [{ count }] = await connectionSource.query(
      'SELECT count(*)::int AS count FROM core."telegramConfig" WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    assert.equal(count, 1);
    const blocker = await hold();
    let firstFinished = false;
    const blocked = track(
      services[0]
        .upsert(
          { botToken: 'synthetic-blocked-workspace', isActive: false },
          fixture.workspaceId,
        )
        .then((value) => {
          firstFinished = true;
          return value;
        }),
    );
    await bothWaiting(1);
    const independent = await bounded(
      services[1].upsert(
        { botUsername: 'independent_fixture_bot' },
        fixture.foreignWorkspaceId,
      ),
      'Another workspace was incorrectly blocked.',
      3000,
    );
    assert.equal(independent.id, fixture.configIds[1]);
    assert.equal(firstFinished, false);
    await blocker.commitTransaction();
    await blocker.release();
    await blocked;
    assert.deepEqual(
      await protectedBots(connectionSource.manager, fixture),
      fixture.originalBots,
    );
    console.log(
      'PASS synthetic Telegram reconnect: same-row encrypted replacement, tokenless rejection, active metadata preservation, atomic rollback, real independent-session save/save and save/delete serialization, workspace isolation and unchanged historical configurations. No network or real bot restoration.',
    );
  } finally {
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
      `Retain ${FILE} if present for ownership-checked fixture cleanup.`,
    );
    process.exitCode = 1;
  });

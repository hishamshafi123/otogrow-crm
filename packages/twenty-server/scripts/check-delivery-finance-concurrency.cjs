const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryFinanceService,
} = require('../dist/modules/delivery/finance/delivery-finance.service');

const WORKSPACE_ID = randomUUID();
const SCHEMA_NAME = `finance_concurrency_${WORKSPACE_ID.replaceAll('-', '_')}`;
const SENTINEL = `otogrow-finance-concurrency:${WORKSPACE_ID}`;
const PROJECT_ID = randomUUID();
const FINANCE_ROLE_ID = randomUUID();
const MEMBERS = ['Administrator', 'Finance writer'].map((name) => ({
  name,
  memberId: randomUUID(),
  userId: randomUUID(),
  userWorkspaceId: randomUUID(),
}));
const [ADMIN, WRITER] = MEMBERS;
const EMAIL_FOR = (member) =>
  `${member.userId}+finance-concurrency@example.invalid`;
const MONTH = '7431-02';
const SECOND_MONTH = '7431-03';
const THIRD_MONTH = '7431-04';
const FOURTH_MONTH = '7431-05';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const bounded = async (promise, label, milliseconds = 10000) => {
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
};

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This script only uses disposable local fixtures.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert.match(SCHEMA_NAME, /^finance_concurrency_[a-f0-9_]{36}$/);
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${SENTINEL}:${index}`,
        },
      }),
  );
  const blockers = [];
  const pending = [];
  let fixtureCommitted = false;
  let workspace;
  let startBarrier = null;
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const scoped = sources.map((source, index) => ({
    manager: source.manager,
    getRepository: (entity) => source.getRepository(entity),
    query: (...arguments_) => source.query(...arguments_),
    transaction: (callback) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='10s'");
        await manager.query("SET LOCAL statement_timeout='15s'");
        const barrier = startBarrier;
        if (barrier) {
          barrier.arrivals.add(index);
          if (barrier.arrivals.size === 2) {
            startBarrier = null;
            barrier.ready.resolve();
          }
          await bounded(
            barrier.ready.promise,
            'Both finance sessions did not reach the start barrier.',
          );
        }
        return callback(manager);
      }),
  }));
  const permissions = {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) =>
      workspaceId === WORKSPACE_ID && userWorkspaceId === ADMIN.userWorkspaceId,
  };
  const access = scoped.map(
    (source) => new OtogrowAccessService(source, permissions),
  );
  const delivery = scoped.map(
    (source, index) => new DeliveryService(source, access[index]),
  );
  const finance = scoped.map(
    (source, index) =>
      new DeliveryFinanceService(source, delivery[index], access[index]),
  );
  const memberArguments = (member = WRITER) => [
    workspace,
    member.memberId,
    member.userWorkspaceId,
  ];
  const entryInput = (fields = {}) => ({
    id: randomUUID(),
    revision: 0,
    month: MONTH,
    kind: 'REVENUE',
    category: 'Service revenue',
    title: 'Disposable concurrency entry',
    currency: 'USD',
    amountMicros: '1000000',
    note: 'Synthetic reviewed service evidence.',
    evidenceUrl: null,
    allocations: [{ projectId: PROJECT_ID, amountMicros: '1000000' }],
    ...fields,
  });
  const save = (index, input) =>
    finance[index].saveEntry(...memberArguments(), input);
  const storedEntry = async (id) => {
    const [entry] = await connectionSource.query(
      'SELECT * FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND id=$2',
      [WORKSPACE_ID, id],
    );
    assert(entry, 'Expected a committed fixture finance entry.');
    return entry;
  };
  const sourceEvents = async (id, action) => {
    const [row] = await connectionSource.query(
      'SELECT count(*)::int AS count FROM core."deliveryFinanceEvent" WHERE "workspaceId"=$1 AND "sourceId"=$2 AND ($3::text IS NULL OR action=$3)',
      [WORKSPACE_ID, id, action ?? null],
    );
    return row.count;
  };
  const paired = async (first, second) => {
    startBarrier = { arrivals: new Set(), ready: deferred() };
    const operations = [track(first()), track(second())];
    return bounded(
      Promise.allSettled(operations),
      'Concurrent finance operations did not settle.',
    );
  };
  const oneWinner = (results) => {
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const failures = results.filter((result) => result.status === 'rejected');
    assert.equal(failures.length, 1);
    assert.equal(
      failures[0].reason.status,
      409,
      'The stale operation must fail with a conflict.',
    );
  };
  const holdLock = async (key) => {
    const runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const blocker = { runner, released: false };
    blockers.push(blocker);
    await runner.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      key,
    ]);
    return blocker;
  };
  const releaseLock = async (blocker) => {
    if (blocker.released) return;
    try {
      if (blocker.runner.isTransactionActive)
        await blocker.runner.rollbackTransaction();
    } finally {
      if (!blocker.runner.isReleased) await blocker.runner.release();
      blocker.released = true;
    }
  };
  const waitForLock = async (pid, key) => {
    const [{ hash }] = await connectionSource.query(
      'SELECT hashtextextended($1,0)::text AS hash',
      [key],
    );
    const unsigned = BigInt.asUintN(64, BigInt(hash));
    const classId = (unsigned >> 32n).toString();
    const objectId = (unsigned & 0xffffffffn).toString();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [{ waiting }] = await connectionSource.query(
        "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted AND classid::text=$2 AND objid::text=$3 AND objsubid=1) AS waiting",
        [pid, classId, objectId],
      );
      if (waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail(`Fixture session did not wait for the expected lock: ${key}`);
  };
  const assignment = async () => {
    const directory = await access[1].directory(
      WORKSPACE_ID,
      ADMIN.memberId,
      ADMIN.userWorkspaceId,
    );
    const writer = directory.members.find(
      (member) => member.memberId === WRITER.memberId,
    );
    assert(writer);
    return { directory, writer };
  };
  const revoke = async (revision) =>
    access[1].assignRoles(WORKSPACE_ID, ADMIN.memberId, ADMIN.userWorkspaceId, {
      memberId: WRITER.memberId,
      roleIds: [],
      roleRevisions: [],
      revision,
    });
  const restore = async () => {
    const { directory, writer } = await assignment();
    const role = directory.roles.find(
      (candidate) => candidate.id === FINANCE_ROLE_ID,
    );
    assert(role);
    await access[1].assignRoles(
      WORKSPACE_ID,
      ADMIN.memberId,
      ADMIN.userWorkspaceId,
      {
        memberId: WRITER.memberId,
        roleIds: [role.id],
        roleRevisions: [{ id: role.id, revision: role.revision }],
        revision: writer.revision,
      },
    );
  };

  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    await connectionSource.transaction(async (manager) => {
      const [existing] = await manager.query(
        'SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"=\'ACTIVE\' LIMIT 1',
      );
      assert(existing, 'An initialized local workspace is required.');
      await manager.query(`CREATE SCHEMA "${SCHEMA_NAME}"`);
      await manager.query(
        `CREATE TABLE "${SCHEMA_NAME}"."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
      );
      [workspace] = await manager.query(
        'INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,$2,$3,$4,\'ACTIVE\',$5,$6) RETURNING *',
        [
          WORKSPACE_ID,
          SENTINEL,
          SCHEMA_NAME.replaceAll('_', '-'),
          SCHEMA_NAME,
          existing.workspaceCustomApplicationId,
          existing.defaultRoleId,
        ],
      );
      for (const member of MEMBERS) {
        await manager.query(
          'INSERT INTO core."user" (id,email) VALUES ($1,$2)',
          [member.userId, EMAIL_FOR(member)],
        );
        await manager.query(
          'INSERT INTO core."userWorkspace" (id,"workspaceId","userId") VALUES ($1,$2,$3)',
          [member.userWorkspaceId, WORKSPACE_ID, member.userId],
        );
        await manager.query(
          `INSERT INTO "${SCHEMA_NAME}"."workspaceMember" (id,"userId","nameFirstName","nameLastName") VALUES ($1,$2,$3,'Finance concurrency fixture')`,
          [member.memberId, member.userId, member.name],
        );
      }
      await manager.query(
        'INSERT INTO core."otogrowRole" (id,"workspaceId",name,description,capabilities,revision) VALUES ($1,$2,\'Disposable finance manager\',$3,$4,1)',
        [FINANCE_ROLE_ID, WORKSPACE_ID, SENTINEL, ['finance.manage']],
      );
      await manager.query(
        'INSERT INTO core."otogrowMemberAccess" ("workspaceId","workspaceMemberId",revision) VALUES ($1,$2,1)',
        [WORKSPACE_ID, WRITER.memberId],
      );
      await manager.query(
        'INSERT INTO core."otogrowRoleAssignment" ("workspaceId","workspaceMemberId","roleId") VALUES ($1,$2,$3)',
        [WORKSPACE_ID, WRITER.memberId, FINANCE_ROLE_ID],
      );
      await manager.query(
        'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES ($1,$2,$3,$4)',
        [PROJECT_ID, WORKSPACE_ID, SENTINEL, JSON.stringify([WRITER.memberId])],
      );
    });
    fixtureCommitted = true;
    if (process.env.OTOGROW_FINANCE_CONCURRENCY_TEST_FAILURE === '1')
      throw new Error('Injected finance concurrency cleanup failure');
    const [{ pid: firstPid }] = await sources[0].query(
      'SELECT pg_backend_pid() AS pid',
    );
    const [{ pid: secondPid }] = await sources[1].query(
      'SELECT pg_backend_pid() AS pid',
    );
    assert.notEqual(
      firstPid,
      secondPid,
      'Concurrency checks require independent database sessions.',
    );

    const edited = entryInput();
    await save(0, edited);
    const edits = await paired(
      () => save(0, { ...edited, revision: 1, note: 'First independent edit' }),
      () =>
        save(1, { ...edited, revision: 1, note: 'Second independent edit' }),
    );
    oneWinner(edits);
    assert.equal((await storedEntry(edited.id)).revision, 2);
    assert.equal(await sourceEvents(edited.id, 'FINANCE_ENTRY_SAVED'), 2);

    const posted = entryInput({ title: 'Concurrent posting fixture' });
    await save(0, posted);
    oneWinner(
      await paired(
        () =>
          finance[0].postEntry(...memberArguments(), {
            id: posted.id,
            revision: 1,
          }),
        () =>
          finance[1].postEntry(...memberArguments(), {
            id: posted.id,
            revision: 1,
          }),
      ),
    );
    assert.equal((await storedEntry(posted.id)).status, 'POSTED');
    assert.equal(await sourceEvents(posted.id, 'FINANCE_ENTRY_POSTED'), 1);
    oneWinner(
      await paired(
        () =>
          finance[0].voidEntry(...memberArguments(), {
            id: posted.id,
            revision: 2,
            reason: 'First independently reviewed correction',
          }),
        () =>
          finance[1].voidEntry(...memberArguments(), {
            id: posted.id,
            revision: 2,
            reason: 'Second independently reviewed correction',
          }),
      ),
    );
    assert.equal((await storedEntry(posted.id)).status, 'VOID');
    assert.equal((await storedEntry(posted.id)).revision, 3);
    assert.equal(await sourceEvents(posted.id, 'FINANCE_ENTRY_VOIDED'), 1);

    const planId = randomUUID();
    await finance[0].savePlan(...memberArguments(), {
      id: planId,
      revision: 0,
      type: 'OVERHEAD',
      name: 'Concurrent monthly preparation fixture',
      currency: 'USD',
      monthlyAmountMicros: '1000000',
      memberId: null,
      startMonth: MONTH,
      endMonth: MONTH,
      dueDay: 31,
      active: true,
    });
    const preparations = await paired(
      () => finance[0].prepareMonth(...memberArguments(), { month: MONTH }),
      () => finance[1].prepareMonth(...memberArguments(), { month: MONTH }),
    );
    assert(preparations.every((result) => result.status === 'fulfilled'));
    assert.deepEqual(
      preparations
        .map((result) => [
          result.value.createdCount,
          result.value.existingCount,
        ])
        .sort(),
      [
        [0, 1],
        [1, 0],
      ],
    );
    const prepared = await connectionSource.query(
      'SELECT id,revision FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND "planId"=$2 AND month=$3',
      [WORKSPACE_ID, planId, MONTH],
    );
    assert.equal(prepared.length, 1);
    assert.equal(
      await sourceEvents(prepared[0].id, 'FINANCE_ENTRY_PREPARED'),
      1,
    );
    await finance[0].voidEntry(...memberArguments(), {
      id: prepared[0].id,
      revision: prepared[0].revision,
      reason: 'Void preserves the one-plan-per-month source history.',
    });
    const preparedAfterVoid = await finance[0].prepareMonth(
      ...memberArguments(),
      { month: MONTH },
    );
    assert.equal(preparedAfterVoid.createdCount, 0);
    assert.equal(preparedAfterVoid.existingCount, 1);

    const firstPeriodKey = `finance-period:${WORKSPACE_ID}:${SECOND_MONTH}`;
    const periodBlocker = await holdLock(firstPeriodKey);
    const blockedInput = entryInput({
      month: SECOND_MONTH,
      title: 'Blocked period fixture',
    });
    const blockedSave = track(save(0, blockedInput));
    await waitForLock(firstPid, firstPeriodKey);
    const independent = entryInput({
      month: THIRD_MONTH,
      title: 'Independent period fixture',
    });
    await bounded(
      track(save(1, independent)),
      'An independent month was serialized behind another period.',
      5000,
    );
    await waitForLock(firstPid, firstPeriodKey);
    assert.equal((await storedEntry(independent.id)).month, THIRD_MONTH);
    await releaseLock(periodBlocker);
    await bounded(blockedSave, 'Blocked period did not recover after release.');

    const { writer: beforeRevoke } = await assignment();
    const accessKey = `delivery:${WORKSPACE_ID}`;
    const accessBlocker = await holdLock(accessKey);
    const revocation = track(revoke(beforeRevoke.revision));
    await waitForLock(secondPid, accessKey);
    const deniedInput = entryInput({
      month: FOURTH_MONTH,
      title: 'Write queued behind revocation fixture',
    });
    const deniedSave = track(save(0, deniedInput));
    await waitForLock(firstPid, accessKey);
    await releaseLock(accessBlocker);
    await bounded(revocation, 'Role revocation did not finish.');
    await assert.rejects(bounded(deniedSave, 'Revoked write did not finish.'), {
      status: 403,
    });
    const [{ count: deniedCount }] = await connectionSource.query(
      'SELECT count(*)::int AS count FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND id=$2',
      [WORKSPACE_ID, deniedInput.id],
    );
    assert.equal(deniedCount, 0);
    await restore();

    const { writer: beforeSerializedRevoke } = await assignment();
    const finalPeriodKey = `finance-period:${WORKSPACE_ID}:${FOURTH_MONTH}`;
    const finalBlocker = await holdLock(finalPeriodKey);
    const authorizedInput = entryInput({
      month: FOURTH_MONTH,
      title: 'Authorized write before revocation fixture',
    });
    const authorizedSave = track(save(0, authorizedInput));
    await waitForLock(firstPid, finalPeriodKey);
    const serializedRevocation = track(revoke(beforeSerializedRevoke.revision));
    await waitForLock(secondPid, accessKey);
    await releaseLock(finalBlocker);
    await bounded(
      authorizedSave,
      'Authorized write did not complete before the queued revocation.',
    );
    await bounded(
      serializedRevocation,
      'Serialized role revocation did not complete.',
    );
    assert.equal((await storedEntry(authorizedInput.id)).revision, 1);
    assert.equal(await sourceEvents(authorizedInput.id), 1);
    await assert.rejects(save(0, entryInput({ month: FOURTH_MONTH })), {
      status: 403,
    });
    console.log(
      'PASS: independent-session finance edit/post/void conflicts, one source entry per plan/month including void history, independent months, and ordered role-revocation/write boundaries. Disposable committed fixtures only; no providers or payments.',
    );
  } finally {
    startBarrier?.ready.resolve();
    startBarrier = null;
    try {
      for (const blocker of blockers) await releaseLock(blocker);
      await bounded(
        Promise.allSettled(pending),
        'Pending fixture operations did not settle for cleanup.',
        16000,
      );
    } finally {
      for (const source of sources)
        if (source.isInitialized) await source.destroy();
      try {
        if (fixtureCommitted && connectionSource.isInitialized)
          await connectionSource.transaction(async (manager) => {
            await manager.query("SET LOCAL lock_timeout='5s'");
            const [saved] = await manager.query(
              'SELECT "displayName","databaseSchema" FROM core.workspace WHERE id=$1 FOR UPDATE',
              [WORKSPACE_ID],
            );
            assert.equal(
              saved?.displayName,
              SENTINEL,
              'Unexpected workspace; refusing cleanup.',
            );
            assert.equal(
              saved?.databaseSchema,
              SCHEMA_NAME,
              'Unexpected schema; refusing cleanup.',
            );
            const nativeMembers = await manager.query(
              `SELECT id,"userId","nameFirstName","nameLastName" FROM "${SCHEMA_NAME}"."workspaceMember" ORDER BY id`,
            );
            assert.equal(nativeMembers.length, MEMBERS.length);
            for (const member of MEMBERS) {
              const native = nativeMembers.find(
                (row) => row.id === member.memberId,
              );
              assert.equal(native?.userId, member.userId);
              assert.equal(native?.nameFirstName, member.name);
              assert.equal(native?.nameLastName, 'Finance concurrency fixture');
              const [account] = await manager.query(
                'SELECT email FROM core."user" WHERE id=$1',
                [member.userId],
              );
              assert.equal(account?.email, EMAIL_FOR(member));
            }
            const [{ count: operationsCount }] = await manager.query(
              'SELECT count(*)::int AS count FROM core."deliveryOperations" WHERE "workspaceId"=$1',
              [WORKSPACE_ID],
            );
            assert.equal(
              operationsCount,
              0,
              'Unexpected operational integrations in disposable workspace.',
            );
            for (const table of [
              'deliveryFinanceAllocation',
              'deliveryFinanceEvent',
              'deliveryFinanceEntry',
              'deliveryFinancePlan',
              'otogrowActivityEvent',
              'otogrowAccessEvent',
              'otogrowRoleAssignment',
              'otogrowMemberAccess',
              'otogrowRole',
              'deliveryProject',
            ])
              await manager.query(
                `DELETE FROM core."${table}" WHERE "workspaceId"=$1`,
                [WORKSPACE_ID],
              );
            await manager.query(
              'DELETE FROM core."userWorkspace" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
              [WORKSPACE_ID, MEMBERS.map((member) => member.userWorkspaceId)],
            );
            for (const member of MEMBERS)
              await manager.query(
                'DELETE FROM core."user" WHERE id=$1 AND email=$2',
                [member.userId, EMAIL_FOR(member)],
              );
            await manager.query(
              'DELETE FROM core.workspace WHERE id=$1 AND "displayName"=$2 AND "databaseSchema"=$3',
              [WORKSPACE_ID, SENTINEL, SCHEMA_NAME],
            );
            await manager.query(`DROP SCHEMA "${SCHEMA_NAME}" CASCADE`);
          });
        if (fixtureCommitted)
          console.log(
            'Removed exact disposable finance workspace, schema, users, role assignments, entries, allocations and activity.',
          );
      } finally {
        if (connectionSource.isInitialized) await connectionSource.destroy();
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

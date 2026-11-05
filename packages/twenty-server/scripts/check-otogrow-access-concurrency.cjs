const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
// Independent transactions need visible fixtures; commit only this disposable workspace, then verify exact cleanup.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
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

const WORKSPACE_ID = randomUUID();
const SCHEMA = `access_concurrency_${WORKSPACE_ID.replaceAll('-', '_')}`;
const SENTINEL = `otogrow-access-concurrency:${WORKSPACE_ID}`;
const MEMBERS = ['Founder', 'Staff'].map((name) => ({
  name,
  memberId: randomUUID(),
  userId: randomUUID(),
  userWorkspaceId: randomUUID(),
}));
const [FOUNDER, STAFF] = MEMBERS;
const emailFor = (member) =>
  `${member.userId}+access-concurrency@example.invalid`;

const deferred = () => {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

const transactionBarrier = () => {
  const ready = deferred();
  const arrivals = new Set();
  const timer = setTimeout(() => ready.resolve(), 5000);
  return async (pid) => {
    arrivals.add(pid);
    if (arrivals.size === 2) {
      clearTimeout(timer);
      ready.resolve();
    }
    await ready.promise;
    assert.equal(
      arrivals.size,
      2,
      'Both independent transactions must begin before either mutation',
    );
  };
};

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Only a local development database is allowed',
  );
  assert.match(SCHEMA, /^access_concurrency_[a-f0-9_]{36}$/);
  const workers = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${SENTINEL}:worker-${index}`,
        },
      }),
  );
  let committed = false;
  let completed = false;
  let startBarrier;
  let holdFirstCommit;
  const pending = [];
  const workerPids = [];
  const settle = (operation) => {
    const promise = operation.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    );
    pending.push(promise);
    return promise;
  };
  const scoped = workers.map((source, index) => ({
    manager: source.manager,
    getRepository: (entity) => source.getRepository(entity),
    query: (...args) => source.query(...args),
    transaction: (operation) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout = '5s'");
        await manager.query("SET LOCAL statement_timeout = '15s'");
        const [{ pid }] = await manager.query('SELECT pg_backend_pid() AS pid');
        workerPids[index] = pid;
        if (startBarrier) await startBarrier(pid);
        const result = await operation(manager);
        if (index === 0 && holdFirstCommit) {
          holdFirstCommit.started.resolve();
          await holdFirstCommit.release.promise;
        }
        return result;
      }),
  }));
  const permissions = {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) =>
      workspaceId === WORKSPACE_ID &&
      userWorkspaceId === FOUNDER.userWorkspaceId,
  };
  const services = scoped.map(
    (source) => new OtogrowAccessService(source, permissions),
  );
  const directory = () =>
    services[0].directory(
      WORKSPACE_ID,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
    );
  const assignment = (roles, revision) => ({
    memberId: STAFF.memberId,
    roleIds: roles.map((role) => role.id),
    roleRevisions: roles.map((role) => ({
      id: role.id,
      revision: role.revision,
    })),
    revision,
  });
  const assign = (index, input) =>
    services[index].assignRoles(
      WORKSPACE_ID,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      input,
    );
  const saveRole = (index, input) =>
    services[index].saveRole(
      WORKSPACE_ID,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      input,
    );
  const assertSingleWinner = (outcomes) => {
    assert.equal(
      outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
      1,
      'Exactly one mutation must commit',
    );
    const loser = outcomes.find((outcome) => outcome.status === 'rejected');
    assert.equal(
      loser.reason.getStatus?.(),
      409,
      `The second mutation must reject its stale revision: ${loser.reason.message}`,
    );
    assert.notEqual(
      workerPids[0],
      workerPids[1],
      'Mutations must use distinct PostgreSQL sessions',
    );
    return outcomes.findIndex((outcome) => outcome.status === 'fulfilled');
  };
  try {
    await connectionSource.initialize();
    await Promise.all(workers.map((source) => source.initialize()));
    await connectionSource.transaction(async (manager) => {
      const [existing] = await manager.query(
        `SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"='ACTIVE' AND "deletedAt" IS NULL LIMIT 1`,
      );
      assert(
        existing,
        'An initialized local development workspace is required',
      );
      await manager.query(`CREATE SCHEMA "${SCHEMA}"`);
      await manager.query(`COMMENT ON SCHEMA "${SCHEMA}" IS '${SENTINEL}'`);
      await manager.query(
        `CREATE TABLE "${SCHEMA}"."workspaceMember" (id uuid PRIMARY KEY, "userId" uuid NOT NULL, "nameFirstName" text NOT NULL DEFAULT '', "nameLastName" text NOT NULL DEFAULT '', "userEmail" text NOT NULL, "deletedAt" timestamptz)`,
      );
      await manager.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6)`,
        [
          WORKSPACE_ID,
          SENTINEL,
          `access-concurrency-${WORKSPACE_ID}`,
          SCHEMA,
          existing.workspaceCustomApplicationId,
          existing.defaultRoleId,
        ],
      );
      for (const member of MEMBERS) {
        await manager.query(
          'INSERT INTO core."user" (id,email) VALUES ($1,$2)',
          [member.userId, emailFor(member)],
        );
        await manager.query(
          'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
          [member.userWorkspaceId, member.userId, WORKSPACE_ID],
        );
        await manager.query(
          `INSERT INTO "${SCHEMA}"."workspaceMember" (id,"userId","nameFirstName","userEmail") VALUES ($1,$2,$3,$4)`,
          [
            member.memberId,
            member.userId,
            `${member.name} concurrency fixture`,
            emailFor(member),
          ],
        );
      }
    });
    committed = true;
    process.stdout.write(
      `Transient fixture committed: ${WORKSPACE_ID}; schema ${SCHEMA}.\n`,
    );

    let state = await directory();
    const sales = state.roles.find((role) => role.name === 'Sales');
    const marketing = state.roles.find((role) => role.name === 'Marketing');
    const managerRole = state.roles.find(
      (role) => role.name === 'Project manager',
    );
    assert(sales && marketing && managerRole);
    const inputs = [assignment([sales], 0), assignment([marketing], 0)];
    startBarrier = transactionBarrier();
    const assignments = await Promise.all(
      inputs.map((input, index) => settle(assign(index, input))),
    );
    startBarrier = undefined;
    const assignmentWinner = assertSingleWinner(assignments);
    state = await directory();
    const member = state.members.find(
      (candidate) => candidate.memberId === STAFF.memberId,
    );
    assert.equal(member.revision, 1);
    assert.deepEqual(member.roleIds, inputs[assignmentWinner].roleIds);
    const [{ assignmentsCommitted }] = await connectionSource.query(
      `SELECT count(*)::int AS "assignmentsCommitted" FROM core."otogrowAccessEvent" WHERE "workspaceId"=$1 AND action='ROLES_ASSIGNED'`,
      [WORKSPACE_ID],
    );
    assert.equal(
      assignmentsCommitted,
      1,
      'Rejected assignment must not leave audit events',
    );

    const currentSales = state.roles.find((role) => role.id === sales.id);
    const roleInputs = [0, 1].map((index) => ({
      ...currentSales,
      name: `Concurrent sales ${index}`,
    }));
    startBarrier = transactionBarrier();
    const roles = await Promise.all(
      roleInputs.map((input, index) => settle(saveRole(index, input))),
    );
    startBarrier = undefined;
    const roleWinner = assertSingleWinner(roles);
    state = await directory();
    const updatedRole = state.roles.find((role) => role.id === sales.id);
    assert.equal(updatedRole.revision, 1);
    assert.equal(updatedRole.name, roleInputs[roleWinner].name);
    const [{ rolesCommitted }] = await connectionSource.query(
      `SELECT count(*)::int AS "rolesCommitted" FROM core."otogrowAccessEvent" WHERE "workspaceId"=$1 AND action='ROLE_UPDATED'`,
      [WORKSPACE_ID],
    );
    assert.equal(
      rolesCommitted,
      1,
      'Rejected role update must not leave audit events',
    );

    await assign(0, assignment([managerRole], 1));
    await services[1].requireCapability(
      WORKSPACE_ID,
      STAFF.memberId,
      'delivery.manage',
    );
    holdFirstCommit = { started: deferred(), release: deferred() };
    const revoked = settle(assign(0, assignment([], 2)));
    const revocationReady = await Promise.race([
      holdFirstCommit.started.promise.then(() => true),
      revoked.then((outcome) => {
        throw outcome.reason ?? new Error('Expected an uncommitted revocation');
      }),
    ]);
    assert(revocationReady);
    const delivery = new DeliveryService(
      scoped[1],
      services[1],
      createIsolatedNativeTaskAccess(),
    );
    const projectName = `Must not commit after revocation ${WORKSPACE_ID}`;
    const deliveryOutcome = settle(
      delivery.command(
        { id: WORKSPACE_ID, databaseSchema: SCHEMA },
        STAFF.memberId,
        STAFF.userWorkspaceId,
        {
          action: 'project',
          name: projectName,
          companyId: null,
          memberIds: [],
        },
      ),
    );
    const deadline = Date.now() + 4000;
    let waiting = false;
    while (!waiting && Date.now() < deadline) {
      const [activity] = await connectionSource.query(
        'SELECT pg_blocking_pids(pid) AS blockers, wait_event FROM pg_stat_activity WHERE pid=$1',
        [workerPids[1]],
      );
      waiting =
        activity?.wait_event === 'advisory' &&
        activity.blockers.includes(workerPids[0]);
      if (!waiting) await delay(25);
    }
    assert(
      waiting,
      'Delivery must wait behind the uncommitted access change on the shared advisory lock',
    );
    holdFirstCommit.release.resolve();
    const [revocation, deliveryResult] = await Promise.all([
      revoked,
      deliveryOutcome,
    ]);
    holdFirstCommit = undefined;
    assert.equal(revocation.status, 'fulfilled');
    assert.equal(deliveryResult.status, 'rejected');
    assert.equal(
      deliveryResult.reason.getStatus?.(),
      403,
      'Delivery must recheck permission after waiting for revocation',
    );
    const [{ projectCount }] = await connectionSource.query(
      'SELECT count(*)::int AS "projectCount" FROM core."deliveryProject" WHERE "workspaceId"=$1',
      [WORKSPACE_ID],
    );
    assert.equal(
      projectCount,
      0,
      'The revoked command must not persist a project',
    );
    completed = true;
  } finally {
    holdFirstCommit?.release.resolve();
    await Promise.all(pending);
    try {
      if (committed) {
        await connectionSource.transaction(async (manager) => {
          const [workspace] = await manager.query(
            'SELECT "displayName","databaseSchema" FROM core.workspace WHERE id=$1 FOR UPDATE',
            [WORKSPACE_ID],
          );
          const [schema] = await manager.query(
            "SELECT obj_description(oid,'pg_namespace') AS sentinel FROM pg_namespace WHERE nspname=$1",
            [SCHEMA],
          );
          assert.equal(
            workspace?.displayName,
            SENTINEL,
            'Refusing cleanup without the exact workspace sentinel',
          );
          assert.equal(workspace?.databaseSchema, SCHEMA);
          assert.equal(
            schema?.sentinel,
            SENTINEL,
            'Refusing cleanup without the exact schema sentinel',
          );
          for (const member of MEMBERS) {
            const [user] = await manager.query(
              'SELECT email FROM core."user" WHERE id=$1',
              [member.userId],
            );
            assert.equal(user?.email, emailFor(member));
            const [{ outside }] = await manager.query(
              'SELECT count(*)::int AS outside FROM core."userWorkspace" WHERE "userId"=$1 AND "workspaceId"<>$2',
              [member.userId, WORKSPACE_ID],
            );
            assert.equal(
              outside,
              0,
              'Refusing to delete a fixture user linked outside this workspace',
            );
          }
          await manager.query(
            'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1',
            [WORKSPACE_ID],
          );
          await manager.query(
            'DELETE FROM core."userWorkspace" WHERE "workspaceId"=$1',
            [WORKSPACE_ID],
          );
          await manager.query(
            'DELETE FROM core.workspace WHERE id=$1 AND "displayName"=$2 AND "databaseSchema"=$3',
            [WORKSPACE_ID, SENTINEL, SCHEMA],
          );
          for (const member of MEMBERS)
            await manager.query(
              'DELETE FROM core."user" WHERE id=$1 AND email=$2',
              [member.userId, emailFor(member)],
            );
          await manager.query(`DROP SCHEMA "${SCHEMA}" CASCADE`);
        });
        const [{ workspaceCount }] = await connectionSource.query(
          'SELECT count(*)::int AS "workspaceCount" FROM core.workspace WHERE id=$1',
          [WORKSPACE_ID],
        );
        const [{ userCount }] = await connectionSource.query(
          'SELECT count(*)::int AS "userCount" FROM core."user" WHERE id=ANY($1::uuid[])',
          [MEMBERS.map((member) => member.userId)],
        );
        const [{ schemaCount }] = await connectionSource.query(
          'SELECT count(*)::int AS "schemaCount" FROM pg_namespace WHERE nspname=$1',
          [SCHEMA],
        );
        assert.equal(
          workspaceCount + userCount + schemaCount,
          0,
          'All committed fixture identities must be removed',
        );
        process.stdout.write(
          'Transient fixture workspace, schema, memberships, access changes, audit rows and users removed; borrowed application/default-role rows were never changed.\n',
        );
      }
    } finally {
      for (const source of [...workers, connectionSource])
        if (source.isInitialized) await source.destroy();
    }
  }
  if (completed)
    process.stdout.write(
      'PASS: two independent connections produce one winner and one stale conflict for assignments and roles; delivery waits for role revocation and rejects without writing. No external calls.\n',
    );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});

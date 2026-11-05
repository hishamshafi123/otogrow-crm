const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
// Independent transactions use only a committed disposable workspace, removed with exact sentinel checks.
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
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryOperationsService,
} = require('../dist/modules/delivery/operations/delivery-operations.service');
const {
  DeliveryClientsService,
} = require('../dist/modules/delivery/clients/delivery-clients.service');
const {
  DeliveryCommitmentsService,
} = require('../dist/modules/delivery/commitments/delivery-commitments.service');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
const {
  DeliveryCommitmentAllocationEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-allocation.entity');
const WORKSPACE_ID = randomUUID();
const SCHEMA = `commitment_concurrency_${WORKSPACE_ID.replaceAll('-', '_')}`;
const SENTINEL = `otogrow-commitment-concurrency:${WORKSPACE_ID}`;
const MEMBERS = ['Founder', 'Editor', 'Manager'].map((name) => ({
  name,
  memberId: randomUUID(),
  userId: randomUUID(),
  userWorkspaceId: randomUUID(),
}));
const [FOUNDER, EDITOR, MANAGER] = MEMBERS;
const emailFor = (member) =>
  `${member.userId}+commitment-concurrency@example.invalid`;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const bounded = async (promise, label) => {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(label)), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert.match(SCHEMA, /^commitment_concurrency_[a-f0-9_]{36}$/);
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
  let startBarrier = null;
  const commitHooks = [null, null];
  const gates = [];
  const pending = [];
  const gate = () => {
    const item = deferred();
    gates.push(item);
    return item;
  };
  const hold = () => {
    const entered = gate(),
      release = gate();
    return {
      entered,
      release,
      run: async () => {
        entered.resolve();
        await release.promise;
      },
    };
  };
  const scoped = sources.map((source, index) => ({
    manager: source.manager,
    query: (...args) => source.query(...args),
    getRepository: (entity) => source.getRepository(entity),
    transaction: (callback) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='4s'");
        await manager.query("SET LOCAL statement_timeout='10s'");
        const barrier = startBarrier;
        if (barrier) {
          barrier.arrivals.add(index);
          if (barrier.arrivals.size === 2) {
            startBarrier = null;
            barrier.ready.resolve();
          }
          await bounded(
            barrier.ready.promise,
            'Both commitment sessions must reach the transaction barrier',
          );
        }
        const result = await callback(manager);
        const hook = commitHooks[index];
        commitHooks[index] = null;
        if (hook) await hook();
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
  const access = scoped.map(
    (source) => new OtogrowAccessService(source, permissions),
  );
  const deliveries = scoped.map(
    (source, index) =>
      new DeliveryService(
        source,
        access[index],
        createIsolatedNativeTaskAccess(),
      ),
  );
  const commitments = scoped.map(
    (source, index) =>
      new DeliveryCommitmentsService(source, deliveries[index]),
  );
  const creatives = scoped.map(
    (source, index) =>
      new DeliveryCreativeService(
        source,
        deliveries[index],
        {},
        createIsolatedNativeTaskAccess(),
      ),
  );
  const clients = scoped.map(
    (source, index) =>
      new DeliveryClientsService(
        source,
        deliveries[index],
        creatives[index],
        commitments[index],
      ),
  );
  const operations = scoped.map(
    (source, index) =>
      new DeliveryOperationsService(
        source,
        deliveries[index],
        creatives[index],
        {},
        { get: () => 'http://localhost:3001' },
        { add: async () => assert.fail('No external reminders may be queued') },
      ),
  );
  let workspace;
  let committed = false;
  let complete = false;
  const settlePromise = (promise) => {
    const safe = promise.then(
      (value) => ({ status: 'fulfilled', value }),
      (reason) => ({ status: 'rejected', reason }),
    );
    pending.push(safe);
    return safe;
  };
  const simultaneous = async (actions) => {
    startBarrier = { arrivals: new Set(), ready: gate() };
    return Promise.all(actions.map((action) => settlePromise(action())));
  };
  const oneWinner = (outcomes) => {
    const wins = outcomes.filter((item) => item.status === 'fulfilled'),
      losses = outcomes.filter((item) => item.status === 'rejected');
    assert.equal(wins.length, 1);
    assert.equal(losses.length, 1);
    return { winner: wins[0].value, loser: losses[0].reason };
  };
  const waitBlocked = async (pid) =>
    bounded(
      (async () => {
        while (true) {
          const [row] = await connectionSource.query(
            'SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1',
            [pid],
          );
          if (row?.wait_event_type === 'Lock' && row.wait_event === 'advisory')
            return;
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      })(),
      'Expected commitment advisory lock wait',
    );
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    await connectionSource.transaction(async (manager) => {
      const [existing] = await manager.query(
        `SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"='ACTIVE' AND "deletedAt" IS NULL LIMIT 1`,
      );
      assert(existing);
      await manager.query(`CREATE SCHEMA "${SCHEMA}"`);
      await manager.query(`COMMENT ON SCHEMA "${SCHEMA}" IS '${SENTINEL}'`);
      await manager.query(
        `CREATE TABLE "${SCHEMA}"."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"userEmail" text,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
      );
      await manager.query(
        `CREATE TABLE "${SCHEMA}".company (id uuid PRIMARY KEY,name text,"deletedAt" timestamptz)`,
      );
      await manager.query(
        `CREATE TABLE "${SCHEMA}".task (id uuid PRIMARY KEY,title text,"assigneeId" uuid,"dueAt" timestamptz,status text,"deletedAt" timestamptz,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now())`,
      );
      [workspace] = await manager.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6) RETURNING *`,
        [
          WORKSPACE_ID,
          SENTINEL,
          `commitment-race-${WORKSPACE_ID}`,
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
          `INSERT INTO "${SCHEMA}"."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,$4,'fixture')`,
          [member.memberId, member.userId, emailFor(member), member.name],
        );
      }
    });
    committed = true;
    const [{ pid: secondPid }] = await sources[1].query(
      'SELECT pg_backend_pid() AS pid',
    );
    const clientIds = [randomUUID(), randomUUID()];
    for (const [index, id] of clientIds.entries())
      await sources[0].query(
        `INSERT INTO "${SCHEMA}".company (id,name) VALUES ($1,$2)`,
        [id, `Commitment client ${index}`],
      );
    const taskFields = {
      title: 'Commitment task',
      brief: 'Private commitment fixture brief',
      service: 'SEO',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: EDITOR.memberId,
      reviewerId: FOUNDER.memberId,
      checklist: [],
      evidence: [],
    };
    const projects = [];
    const tasks = [];
    for (const [index, companyId] of clientIds.entries()) {
      const result = await deliveries[0].command(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          action: 'project',
          name: `Commitment project ${index}`,
          companyId,
          memberIds: [EDITOR.memberId],
        },
      );
      projects.push(
        result.projects.find((item) => item.companyId === companyId),
      );
    }
    for (const project of [projects[0], projects[0], projects[1]]) {
      const title = `Commitment task ${tasks.length}`;
      const result = await deliveries[0].command(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          action: 'create',
          projectId: project.id,
          fields: { ...taskFields, title },
        },
      );
      tasks.push(result.tasks.find((item) => item.title === title));
    }
    const commercial = `PRIVATE-COMMERCIAL-${randomUUID()}`;
    const engagementResult = await clients[0].command(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        action: 'engagement',
        engagement: {
          revision: 0,
          projectId: projects[0].id,
          name: 'Commitment fixture',
          services: ['AI videos'],
          billing: 'RETAINER',
          scope: commercial,
          allowance: commercial,
          contact: commercial,
          fields: [],
        },
      },
    );
    const engagementId = engagementResult.engagements.find(
      (item) => item.projectId === projects[0].id,
    ).id;
    const read = (periodId, actor = FOUNDER, index = 0, input = {}) =>
      commitments[index].snapshot(
        workspace,
        actor.memberId,
        actor.userWorkspaceId,
        { engagementId, periodId, ...input },
      );
    const task = (taskId) =>
      sources[0]
        .getRepository(DeliveryTaskEntity)
        .findOneBy({ workspaceId: WORKSPACE_ID, taskId });
    const allocation = (taskId) =>
      sources[0]
        .getRepository(DeliveryCommitmentAllocationEntity)
        .findOneBy({ workspaceId: WORKSPACE_ID, taskId });
    const operationState = async () =>
      (
        await sources[0]
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId: WORKSPACE_ID })
      ).state;
    const fulfilment = async (taskId) =>
      (await operationState()).fulfilments.find(
        (item) => item.taskId === taskId,
      );
    const eventRows = async (action, taskId) =>
      sources[0].query(
        `SELECT * FROM core."deliveryCommitmentEvent" WHERE "workspaceId"=$1 AND ($2::text IS NULL OR action=$2) AND ($3::uuid IS NULL OR "taskId"=$3) ORDER BY "createdAt",id`,
        [WORKSPACE_ID, action ?? null, taskId ?? null],
      );
    const periodIds = [randomUUID(), randomUUID()];
    for (const [index, id] of periodIds.entries())
      await commitments[0].savePeriod(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          id,
          engagementId,
          revision: 0,
          label: index ? 'November' : 'October',
          startDate: index ? '2026-11-01' : '2026-10-01',
          endDateExclusive: index ? '2026-12-01' : '2026-11-01',
          timezone: 'Asia/Qatar',
          reason: 'Explicit fixture billing period',
        },
      );
    const lineIds = [randomUUID(), randomUUID(), randomUUID()];
    const lineInput = (
      id,
      periodId,
      unit,
      label,
      revision = 0,
      periodRevision = 1,
    ) => ({
      id,
      engagementId,
      periodId,
      periodRevision,
      revision,
      label,
      unit,
      promisedQuantity: 1,
      reason: 'Fixture agreed quantity',
    });
    await commitments[0].saveLine(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      lineInput(lineIds[0], periodIds[0], 'UNIQUE_VIDEO', 'Unique videos'),
    );
    await commitments[0].saveLine(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      lineInput(lineIds[1], periodIds[0], 'VARIATION', 'Hook variations'),
    );
    await commitments[0].saveLine(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      lineInput(lineIds[2], periodIds[1], 'UNIQUE_VIDEO', 'Unique videos'),
    );
    const assignment = async (
      taskId,
      lineId,
      periodId = periodIds[0],
      parentTaskId = null,
    ) => {
      const snapshot = await read(periodId),
        existing = await allocation(taskId);
      return {
        engagementId,
        periodId,
        lineId,
        lineRevision: snapshot.lines.find((line) => line.id === lineId)
          .revision,
        periodRevision: snapshot.periods.find(
          (period) => period.id === periodId,
        ).revision,
        taskId,
        taskRevision: (await task(taskId)).revision,
        revision: existing?.revision ?? 0,
        parentTaskId,
        reason: 'Explicit task attribution',
      };
    };
    const assign = (index, input, actor = FOUNDER) =>
      commitments[index].assignTask(
        workspace,
        actor.memberId,
        actor.userWorkspaceId,
        input,
      );
    const firstAssignment = await assignment(tasks[0].id, lineIds[0]);
    let outcomes = oneWinner(
      await simultaneous([
        () => assign(0, firstAssignment),
        () => assign(1, firstAssignment),
      ]),
    );
    assert.equal(outcomes.loser.status, 409);
    assert.equal(
      (await eventRows('COMMITMENT_TASK_ASSIGNED', tasks[0].id)).length,
      1,
    );
    assert.equal((await read(periodIds[0])).lines[0].fulfilledQuantity, 0);
    assert.equal((await allocation(tasks[0].id)).revision, 1);
    const initialLine = (await read(periodIds[0])).lines.find(
      (line) => line.id === lineIds[0],
    );
    const staleLine = lineInput(
      initialLine.id,
      periodIds[0],
      'UNIQUE_VIDEO',
      'Original quantities',
      initialLine.revision,
    );
    outcomes = oneWinner(
      await simultaneous([
        () =>
          commitments[0].saveLine(
            workspace,
            FOUNDER.memberId,
            FOUNDER.userWorkspaceId,
            { ...staleLine, label: 'First concurrent edit' },
          ),
        () =>
          commitments[1].saveLine(
            workspace,
            FOUNDER.memberId,
            FOUNDER.userWorkspaceId,
            { ...staleLine, label: 'Second concurrent edit' },
          ),
      ]),
    );
    assert.equal(outcomes.loser.status, 409);
    assert.equal((await eventRows('COMMITMENT_LINE_UPDATED')).length, 1);
    const secondAssignment = await assignment(
      tasks[1].id,
      lineIds[1],
      periodIds[0],
      tasks[0].id,
    );
    const priceGate = hold();
    commitHooks[0] = priceGate.run;
    const lineMutation = settlePromise(
      commitments[0].saveLine(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        lineInput(
          lineIds[1],
          periodIds[0],
          'VARIATION',
          'Revised hook quantity',
          secondAssignment.lineRevision,
        ),
      ),
    );
    await bounded(priceGate.entered.promise, 'Line edit reached commit gate');
    const staleAssign = settlePromise(assign(1, secondAssignment));
    await waitBlocked(secondPid);
    priceGate.release.resolve();
    assert.equal((await lineMutation).status, 'fulfilled');
    assert.equal((await staleAssign).reason.status, 409);
    assert.equal(await allocation(tasks[1].id), null);
    await assign(
      0,
      await assignment(tasks[1].id, lineIds[1], periodIds[0], tasks[0].id),
    );
    await assert.rejects(
      commitments[0].removeTask(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          engagementId,
          periodId: periodIds[0],
          taskId: tasks[0].id,
          revision: (await allocation(tasks[0].id)).revision,
          reason: 'Cannot orphan a variation',
        },
      ),
      { status: 409 },
    );
    const taskCommand = async (actor, input, index = 0) =>
      deliveries[index].command(
        workspace,
        actor.memberId,
        actor.userWorkspaceId,
        { ...input, revision: (await task(input.taskId)).revision },
      );
    const approve = async (taskId) => {
      await taskCommand(EDITOR, {
        action: 'submit',
        taskId,
        description: 'Synthetic completed work',
        evidence: ['https://example.com/fixture'],
      });
      await assert.rejects(
        taskCommand(EDITOR, {
          action: 'review',
          taskId,
          decision: 'APPROVED',
          feedback: '',
        }),
        { status: 403 },
      );
      await taskCommand(FOUNDER, {
        action: 'review',
        taskId,
        decision: 'APPROVED',
        feedback: '',
      });
    };
    const deliver = async (taskId, index = 0) =>
      operations[index].command(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          action: 'delivered',
          taskId,
          revision: (await task(taskId)).revision,
          note: 'Synthetic recorded delivery',
        },
        new Date('2030-11-01T00:00:00.000Z'),
      );
    const confirmInput = async (taskId, decision = 'FULFILLED') => {
      const current = await fulfilment(taskId);
      return {
        action: 'fulfilment',
        taskId,
        cycle: current.cycle,
        historyLength: current.history.length,
        decision,
        note: 'Synthetic client response',
      };
    };
    const confirm = (index, input) =>
      operations[index].command(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        input,
        new Date('2030-11-01T12:00:00.000Z'),
      );
    await approve(tasks[0].id);
    assert.equal(
      (await read(periodIds[0])).lines.find((line) => line.id === lineIds[0])
        .fulfilledQuantity,
      0,
      'Approval does not fulfil a commitment',
    );
    await deliver(tasks[0].id);
    assert.equal(
      (await read(periodIds[0])).lines.find((line) => line.id === lineIds[0])
        .fulfilledQuantity,
      0,
      'Delivery alone does not fulfil',
    );
    const confirmation = await confirmInput(tasks[0].id);
    outcomes = oneWinner(
      await simultaneous([
        () => confirm(0, confirmation),
        () => confirm(1, confirmation),
      ]),
    );
    assert.equal(outcomes.loser.status, 409);
    assert.equal(
      (await eventRows('COMMITMENT_TASK_CREDITED', tasks[0].id)).length,
      1,
    );
    assert.equal(
      (await read(periodIds[0])).lines.find((line) => line.id === lineIds[0])
        .fulfilledQuantity,
      1,
      'Late work remains assigned to original October period',
    );
    assert.equal((await read(periodIds[1])).lines[0].fulfilledQuantity, 0);
    await assert.rejects(assign(0, await assignment(tasks[0].id, lineIds[0])), {
      status: 409,
    });
    assert.equal(
      (await eventRows('COMMITMENT_TASK_CREDITED', tasks[0].id)).length,
      1,
      'Same mapping cannot re-credit identical evidence',
    );
    await approve(tasks[1].id);
    await deliver(tasks[1].id);
    await confirm(0, await confirmInput(tasks[1].id));
    const fulfilledLines = (await read(periodIds[0])).lines;
    assert.equal(
      fulfilledLines.find((line) => line.unit === 'UNIQUE_VIDEO')
        .fulfilledQuantity,
      1,
    );
    assert.equal(
      fulfilledLines.find((line) => line.unit === 'VARIATION')
        .fulfilledQuantity,
      1,
    );
    const shares = await clients[0].command(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        action: 'share',
        engagementId,
        taskId: tasks[0].id,
        revision: (await task(tasks[0].id)).revision,
        kind: 'SUBMISSION',
      },
    );
    const shareId = shares.shares.find(
      (item) => item.taskId === tasks[0].id,
    ).id;
    const link = await clients[0].command(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      { action: 'link', engagementId },
    );
    const credential = `${link.token}:${link.accessCode}`;
    const objection = {
      action: 'review',
      shareId,
      requestId: randomUUID(),
      decision: 'CHANGES_REQUESTED',
      comment: 'Synthetic change request',
    };
    const beforeObjection = (
      await eventRows('COMMITMENT_TASK_REOPENED', tasks[0].id)
    ).length;
    await Promise.all([
      clients[0].respond(credential, objection),
      clients[1].respond(credential, objection),
    ]);
    assert.equal(
      (await eventRows('COMMITMENT_TASK_REOPENED', tasks[0].id)).length,
      beforeObjection + 1,
    );
    assert.equal(
      (await read(periodIds[0])).lines.find(
        (line) => line.unit === 'UNIQUE_VIDEO',
      ).fulfilledQuantity,
      0,
    );
    await confirm(0, await confirmInput(tasks[0].id, 'REDOING'));
    await approve(tasks[0].id);
    assert.equal(
      (await read(periodIds[0])).lines.find(
        (line) => line.unit === 'UNIQUE_VIDEO',
      ).fulfilledQuantity,
      0,
      'A new approved submission cannot inherit an old fulfilled cycle',
    );
    await deliver(tasks[0].id);
    await confirm(0, await confirmInput(tasks[0].id));
    assert.equal((await allocation(tasks[0].id)).creditedSubmissionVersion, 2);
    const staffSnapshot = await read(periodIds[0], EDITOR);
    assert.equal(staffSnapshot.canManage, false);
    assert.equal(staffSnapshot.legacyAllowance, null);
    assert.deepEqual(staffSnapshot.history, []);
    assert.deepEqual(staffSnapshot.taskOptions, []);
    assert(!JSON.stringify(staffSnapshot).includes(commercial));
    assert(
      !JSON.stringify(
        await commitments[0].engagements(
          workspace,
          EDITOR.memberId,
          EDITOR.userWorkspaceId,
        ),
      ).includes(commercial),
    );
    assert(
      !JSON.stringify(
        (await clients[0].portal(credential)).commitments,
      ).includes(commercial),
    );
    const originalPeriod = (await read(periodIds[0])).periods.find(
      (period) => period.id === periodIds[0],
    );
    const closeGate = hold();
    commitHooks[0] = closeGate.run;
    const closeOperation = settlePromise(
      commitments[0].setPeriodState(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          engagementId,
          periodId: periodIds[0],
          revision: originalPeriod.revision,
          state: 'CLOSED',
          reason: 'Close period before concurrent edit',
        },
      ),
    );
    await bounded(closeGate.entered.promise, 'Closure reached commit gate');
    const pendingLine = settlePromise(
      commitments[1].saveLine(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        lineInput(
          randomUUID(),
          periodIds[0],
          'OTHER',
          'Stale closed-period edit',
        ),
      ),
    );
    await waitBlocked(secondPid);
    closeGate.release.resolve();
    assert.equal((await closeOperation).status, 'fulfilled');
    assert.equal((await pendingLine).reason.status, 409);
    const closed = (await read(periodIds[0])).periods.find(
      (period) => period.id === periodIds[0],
    );
    await commitments[0].setPeriodState(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        engagementId,
        periodId: periodIds[0],
        revision: closed.revision,
        state: 'OPEN',
        reason: 'Reopen isolated fixture period',
      },
    );
    // A variation move does not leave double credit in its former line.
    const novemberVariation = randomUUID();
    await commitments[0].saveLine(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      lineInput(
        novemberVariation,
        periodIds[1],
        'VARIATION',
        'November variations',
      ),
    );
    await assign(
      0,
      await assignment(
        tasks[1].id,
        novemberVariation,
        periodIds[1],
        tasks[0].id,
      ),
    );
    assert.equal(
      (await read(periodIds[0])).lines.find((line) => line.unit === 'VARIATION')
        .fulfilledQuantity,
      0,
    );
    assert.equal(
      (await read(periodIds[1])).lines.find((line) => line.unit === 'VARIATION')
        .fulfilledQuantity,
      1,
    );
    const roleDirectory = await access[0].saveRole(
      WORKSPACE_ID,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        name: 'Fixture delivery manager',
        description: 'Scoped concurrency test',
        capabilities: ['delivery.manage'],
      },
    );
    const role = roleDirectory.roles.find(
      (item) => item.name === 'Fixture delivery manager',
    );
    const managerRevision = roleDirectory.members.find(
      (item) => item.memberId === MANAGER.memberId,
    ).revision;
    const assignedDirectory = await access[0].assignRoles(
      WORKSPACE_ID,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        memberId: MANAGER.memberId,
        revision: managerRevision,
        roleIds: [role.id],
        roleRevisions: [{ id: role.id, revision: role.revision }],
      },
    );
    const actualManagerRevision = assignedDirectory.members.find(
      (item) => item.memberId === MANAGER.memberId,
    ).revision;
    const freshTaskResult = await deliveries[0].command(
      workspace,
      FOUNDER.memberId,
      FOUNDER.userWorkspaceId,
      {
        action: 'create',
        projectId: projects[0].id,
        fields: { ...taskFields, title: 'Revocation fixture' },
      },
    );
    const freshTask = freshTaskResult.tasks.find(
      (item) => item.title === 'Revocation fixture',
    );
    // No user task-move command exists; direct maintenance must still fail current-project/parent checks.
    const defensiveAssignment = await assignment(
      freshTask.id,
      novemberVariation,
      periodIds[1],
      tasks[0].id,
    );
    const beforeDefensive = await eventRows();
    const originalParent = await allocation(tasks[0].id);
    for (const mode of ['moved', 'deleted']) {
      const rollback = new Error(`Roll back ${mode} parent fixture`);
      await assert.rejects(
        sources[0].transaction(async (manager) => {
          const temporary = {
            transaction: (callback) => manager.transaction(callback),
          };
          const service = new DeliveryCommitmentsService(
            temporary,
            deliveries[0],
          );
          if (mode === 'moved') {
            await manager.query(
              'UPDATE core."deliveryTask" SET "projectId"=$1 WHERE "workspaceId"=$2 AND "taskId"=$3',
              [projects[1].id, WORKSPACE_ID, tasks[0].id],
            );
            const moved = await manager
              .getRepository(DeliveryTaskEntity)
              .findOneBy({ workspaceId: WORKSPACE_ID, taskId: tasks[0].id });
            await deliveries[0].command(
              workspace,
              FOUNDER.memberId,
              FOUNDER.userWorkspaceId,
              {
                action: 'comment',
                taskId: tasks[0].id,
                revision: moved.revision,
                text: 'Synthetic maintenance scope check',
              },
              manager,
            );
            const reopened = await manager
              .getRepository(DeliveryCommitmentAllocationEntity)
              .findOneBy({ workspaceId: WORKSPACE_ID, taskId: tasks[0].id });
            assert.equal(reopened.state, 'REOPENED');
            assert.equal(reopened.creditedCycle, originalParent.creditedCycle);
          } else
            await manager.query(
              `UPDATE "${SCHEMA}".task SET "deletedAt"=now() WHERE id=$1`,
              [tasks[0].id],
            );
          const snapshot = await service.snapshot(
            workspace,
            EDITOR.memberId,
            EDITOR.userWorkspaceId,
            { engagementId, periodId: periodIds[0] },
          );
          assert.equal(
            snapshot.lines.find((line) => line.unit === 'UNIQUE_VIDEO')
              .fulfilledQuantity,
            0,
          );
          assert(!JSON.stringify(snapshot).includes(commercial));
          await assert.rejects(
            service.assignTask(
              workspace,
              FOUNDER.memberId,
              FOUNDER.userWorkspaceId,
              defensiveAssignment,
            ),
            { status: 400 },
          );
          throw rollback;
        }),
        (error) => error === rollback,
      );
    }
    assert.deepEqual(await eventRows(), beforeDefensive);
    assert.deepEqual(await allocation(tasks[0].id), originalParent);
    const revokedAssignment = await assignment(
      freshTask.id,
      lineIds[2],
      periodIds[1],
    );
    const revokeGate = hold();
    commitHooks[0] = revokeGate.run;
    const revoke = settlePromise(
      access[0].assignRoles(
        WORKSPACE_ID,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          memberId: MANAGER.memberId,
          revision: actualManagerRevision,
          roleIds: [],
          roleRevisions: [],
        },
      ),
    );
    await bounded(
      revokeGate.entered.promise,
      'Role revocation reached commit gate',
    );
    const deniedAssignment = settlePromise(
      assign(1, revokedAssignment, MANAGER),
    );
    await waitBlocked(secondPid);
    revokeGate.release.resolve();
    assert.equal((await revoke).status, 'fulfilled');
    assert.equal((await deniedAssignment).reason.status, 403);
    assert.equal(await allocation(freshTask.id), null);
    const projectGate = hold();
    commitHooks[0] = projectGate.run;
    const removeAccess = settlePromise(
      deliveries[0].command(
        workspace,
        FOUNDER.memberId,
        FOUNDER.userWorkspaceId,
        {
          action: 'project',
          id: projects[0].id,
          revision: projects[0].revision,
          name: projects[0].name,
          companyId: projects[0].companyId,
          memberIds: [],
        },
      ),
    );
    await bounded(
      projectGate.entered.promise,
      'Project revocation reached commit gate',
    );
    const revokedRead = settlePromise(read(periodIds[0], EDITOR, 1));
    await waitBlocked(secondPid);
    projectGate.release.resolve();
    assert.equal((await removeAccess).status, 'fulfilled');
    assert.equal((await revokedRead).reason.status, 403);
    const directory = await commitments[0].engagements(
      workspace,
      EDITOR.memberId,
      EDITOR.userWorkspaceId,
    );
    assert(!directory.engagements.some((item) => item.id === engagementId));
    await assert.rejects(
      read(periodIds[0], {
        memberId: randomUUID(),
        userWorkspaceId: randomUUID(),
      }),
      { status: 403 },
    );
    await assert.rejects(
      read(periodIds[0], {
        memberId: FOUNDER.memberId,
        userWorkspaceId: EDITOR.userWorkspaceId,
      }),
      { status: 403 },
    );
    complete = true;
  } finally {
    for (const item of gates) item.resolve();
    await Promise.allSettled(pending);
    try {
      if (committed) {
        await connectionSource.transaction(async (manager) => {
          const [saved] = await manager.query(
            'SELECT "displayName","databaseSchema" FROM core.workspace WHERE id=$1 FOR UPDATE',
            [WORKSPACE_ID],
          );
          const [schema] = await manager.query(
            "SELECT obj_description(oid,'pg_namespace') AS sentinel FROM pg_namespace WHERE nspname=$1",
            [SCHEMA],
          );
          assert.equal(saved?.displayName, SENTINEL);
          assert.equal(saved?.databaseSchema, SCHEMA);
          assert.equal(schema?.sentinel, SENTINEL);
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
            assert.equal(outside, 0);
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
        assert.equal(
          (
            await connectionSource.query(
              'SELECT id FROM core.workspace WHERE id=$1',
              [WORKSPACE_ID],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await connectionSource.query(
              'SELECT id FROM core."deliveryCommitmentAllocation" WHERE "workspaceId"=$1',
              [WORKSPACE_ID],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await connectionSource.query(
              'SELECT nspname FROM pg_namespace WHERE nspname=$1',
              [SCHEMA],
            )
          ).length,
          0,
        );
      }
    } finally {
      await Promise.all(
        sources
          .filter((source) => source.isInitialized)
          .map((source) => source.destroy()),
      );
      if (connectionSource.isInitialized) await connectionSource.destroy();
    }
  }
  assert(complete);
  console.log(
    'PASS: independent PostgreSQL sessions preserve one task allocation/credit, stale line and period conflicts, distinct unique/variation counts, current delivery-version evidence, objection/redo history, period moves and late fulfilment, fresh role/project revocation, and staff commercial isolation. Exact disposable workspace/schema/users removed; no external sends.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

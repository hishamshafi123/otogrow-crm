const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
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
  DeliveryRevisionsService,
} = require('../dist/modules/delivery/revisions/delivery-revisions.service');
async function main() {
  const databaseUrl = new URL(connectionSource.options.url);
  assert(
    ['localhost', '127.0.0.1'].includes(databaseUrl.hostname),
    'Only a local development database is allowed',
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const [workspace] = await runner.query(
      `SELECT id, "databaseSchema" FROM core.workspace WHERE "databaseSchema" IS NOT NULL AND "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
    const schema = `"${workspace.databaseSchema}"`;
    const admin = randomUUID();
    const editor = randomUUID();
    const outsider = randomUUID();
    for (const [id, name] of [
      [admin, 'Delivery reviewer fixture'],
      [editor, 'Delivery editor fixture'],
      [outsider, 'Delivery outsider fixture'],
    ]) {
      const userId = randomUUID();
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        userId,
        `${id}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [id, userId, workspace.id],
      );
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id, "nameFirstName", "nameLastName", "userId", "userEmail") VALUES ($1,$2,'',$3,$4)`,
        [id, name, userId, `${id}@example.invalid`],
      );
    }
    const scopedDataSource = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const access = new OtogrowAccessService(scopedDataSource, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        userWorkspaceId === admin,
    });
    const service = new DeliveryService(
      scopedDataSource,
      access,
      createIsolatedNativeTaskAccess(),
    );
    const command = (actor, input) =>
      service.command(workspace, actor, actor, input);
    const revisions = new DeliveryRevisionsService(scopedDataSource, service);
    let state = await command(admin, {
      action: 'project',
      name: 'Revision accounting fixture',
      companyId: null,
      memberIds: [editor],
    });
    const project = state.projects.find(
      (row) => row.name === 'Revision accounting fixture',
    );
    state = await command(admin, {
      action: 'create',
      projectId: project.id,
      fields: {
        title: 'Revision video fixture',
        brief: 'Accurate label',
        service: 'Video',
        priority: 'NORMAL',
        scheduledDate: null,
        dueAt: null,
        assigneeId: editor,
        reviewerId: admin,
        checklist: [],
        evidence: [],
      },
    });
    let task = state.tasks.find((row) => row.projectId === project.id);
    const refresh = () =>
      service.snapshot(workspace, admin, admin).then((value) => {
        task = value.tasks.find((row) => row.id === task.id);
        return task;
      });
    const read = (actor) =>
      revisions.snapshot(workspace, actor, actor, { taskId: task.id });
    const submit = async () => {
      await command(editor, {
        action: 'submit',
        taskId: task.id,
        revision: task.revision,
        description: 'Review version',
        evidence: ['https://example.com/revision'],
      });
      await refresh();
    };
    const reject = async () => {
      await command(admin, {
        action: 'review',
        taskId: task.id,
        revision: task.revision,
        decision: 'CHANGES_REQUESTED',
        feedback: 'Correct product label',
      });
      await refresh();
    };
    await submit();
    const originalTransaction = scopedDataSource.transaction;
    scopedDataSource.transaction = (callback) =>
      runner.manager.transaction(async (manager) => {
        await callback(manager);
        throw new Error('Injected revision failure');
      });
    await assert.rejects(reject(), /Injected revision failure/);
    scopedDataSource.transaction = originalTransaction;
    assert.equal((await read(admin)).total, 0);
    assert.equal((await refresh()).details.state, 'IN_REVIEW');
    assert.equal(
      (
        await runner.query(
          'SELECT count(*)::int AS count FROM core."otogrowActivityEvent" WHERE "taskId"=$1 AND action=\'REVISION_OPENED\'',
          [task.id],
        )
      )[0].count,
      0,
    );
    await reject();
    let snapshot = await read(admin),
      round = snapshot.rounds[0];
    assert.equal(round.round, 1);
    assert.equal(round.source, 'INTERNAL_REVIEW');
    assert.equal(round.submissionVersion, 1);
    assert.equal(round.reason, 'Correct product label');
    assert.equal(round.cause, 'UNCLASSIFIED');
    assert.equal(round.effortMinutes, null);
    assert.equal(round.internalCost, null);
    assert.equal(round.proposedCharge, 0);
    assert.equal(round.currency, null);
    await assert.rejects(
      command(admin, {
        action: 'review',
        taskId: task.id,
        revision: task.revision - 1,
        decision: 'CHANGES_REQUESTED',
        feedback: 'Duplicate',
      }),
      { status: 409 },
    );
    assert.equal((await read(admin)).total, 1);
    const save = (actor, input) =>
      revisions.save(workspace, actor, actor, input);
    const metadata = {
      taskId: task.id,
      id: round.id,
      revision: 1,
      cause: 'INTERNAL_DEFECT',
      effortMinutes: 45,
    };
    await assert.rejects(save(editor, metadata), { status: 403 });
    await assert.rejects(read(outsider), { status: 404 });
    await assert.rejects(
      revisions.snapshot({ ...workspace, id: randomUUID() }, admin, admin, {
        taskId: task.id,
      }),
      { status: 403 },
    );
    await assert.rejects(
      revisions.snapshot(workspace, admin, editor, { taskId: task.id }),
      { status: 403 },
    );
    await assert.rejects(save(admin, { ...metadata, internalCost: 0 }), {
      status: 400,
    });
    await assert.rejects(save(admin, { ...metadata, effortMinutes: -1 }), {
      status: 400,
    });
    await assert.rejects(
      save(admin, { ...metadata, proposedCharge: 12.5, currency: 'USD' }),
      { status: 400 },
    );
    await save(admin, {
      ...metadata,
      internalCost: 1250,
      proposedCharge: 0,
      currency: 'USD',
    });
    const taskBefore = JSON.stringify(await refresh());
    await assert.rejects(save(admin, metadata), { status: 409 });
    assert.equal(
      JSON.stringify(await refresh()),
      taskBefore,
      'Revision accounting does not change task approval or planning',
    );
    const employeeRound = (await read(editor)).rounds[0];
    assert.equal(employeeRound.cause, 'INTERNAL_DEFECT');
    assert.equal(employeeRound.effortMinutes, 45);
    assert.equal(employeeRound.internalCost, null);
    assert.equal(employeeRound.proposedCharge, null);
    assert.equal(employeeRound.currency, null);
    let directory = await access.directory(workspace.id, admin, admin);
    const managerRole = directory.roles.find(
      (role) =>
        role.capabilities.includes('delivery.manage') &&
        !role.capabilities.includes('workspace.admin'),
    );
    const assign = async (roles) => {
      directory = await access.directory(workspace.id, admin, admin);
      await access.assignRoles(workspace.id, admin, admin, {
        memberId: outsider,
        roleIds: roles,
        roleRevisions: directory.roles
          .filter((role) => roles.includes(role.id))
          .map(({ id, revision }) => ({ id, revision })),
        revision: directory.members.find(
          (member) => member.memberId === outsider,
        ).revision,
      });
    };
    await assign([managerRole.id]);
    assert.equal((await read(outsider)).canManage, true);
    assert.equal((await read(outsider)).canManageFinance, false);
    await assert.rejects(
      save(outsider, { ...metadata, revision: 2, internalCost: null }),
      { status: 403 },
    );
    await save(outsider, {
      ...metadata,
      revision: 2,
      cause: 'CLIENT_PREFERENCE',
      effortMinutes: 30,
    });
    round = (await read(admin)).rounds[0];
    assert.equal(round.internalCost, 1250);
    assert.equal(round.currency, 'USD');
    assert.equal(round.revision, 3);
    const eventCount = async () =>
      Number(
        (
          await runner.query(
            'SELECT count(*) FROM core."otogrowActivityEvent" WHERE "taskId"=$1 AND action=\'REVISION_UPDATED\'',
            [task.id],
          )
        )[0].count,
      );
    const beforeEvents = await eventCount();
    scopedDataSource.transaction = (callback) =>
      runner.manager.transaction(async (manager) => {
        await callback(manager);
        throw new Error('Injected save failure');
      });
    await assert.rejects(
      save(admin, { ...metadata, revision: 3, cause: 'OTHER' }),
      /Injected save failure/,
    );
    scopedDataSource.transaction = originalTransaction;
    assert.equal((await read(admin)).rounds[0].revision, 3);
    assert.equal(await eventCount(), beforeEvents);
    const today = new Date().toISOString().slice(0, 10),
      filters = { startDate: today, endDate: today, projectId: project.id };
    const costs = (actor) => revisions.costs(workspace, actor, actor, filters);
    await assert.rejects(costs(editor), { status: 403 });
    await assert.rejects(costs(outsider), { status: 403 });
    let summary = await costs(admin);
    assert.equal(summary.groups[0].recordedCost, 1250);
    assert.equal(summary.groups[0].cause, 'CLIENT_PREFERENCE');
    assert.equal(summary.groups[0].proposedCharges, 0);
    directory = await access.saveRole(workspace.id, admin, admin, {
      name: 'Revision finance fixture',
      description: '',
      capabilities: ['finance.manage'],
    });
    const financeRole = directory.roles.find(
      (role) => role.name === 'Revision finance fixture',
    );
    await assign([financeRole.id]);
    assert.equal((await costs(outsider)).groups[0].recordedCost, 1250);
    await assert.rejects(
      read(outsider),
      { status: 404 },
      'Finance access alone does not grant access to all task contents',
    );
    await command(admin, {
      action: 'project',
      id: project.id,
      revision: project.revision,
      name: project.name,
      companyId: null,
      memberIds: [editor, outsider],
    });
    await assert.rejects(
      save(outsider, { ...metadata, revision: 3, cause: 'SCOPE_CHANGE' }),
      { status: 403 },
    );
    await save(outsider, {
      ...metadata,
      revision: 3,
      cause: 'CLIENT_PREFERENCE',
      effortMinutes: 30,
      internalCost: 1750,
      proposedCharge: 2200,
      currency: 'USD',
    });
    await assign([]);
    await assert.rejects(
      save(outsider, {
        ...metadata,
        revision: 4,
        internalCost: 500,
        currency: 'USD',
      }),
      { status: 403 },
    );
    for (let index = 0; index < 21; index++) {
      await submit();
      await reject();
    }
    snapshot = await read(admin);
    assert.equal(snapshot.total, 22);
    assert.equal(snapshot.rounds.length, 20);
    assert.equal(snapshot.rounds[0].round, 22);
    const older = await revisions.snapshot(workspace, admin, admin, {
      taskId: task.id,
      beforeRound: snapshot.nextBeforeRound,
    });
    assert.deepEqual(
      older.rounds.map((row) => row.round),
      [2, 1],
    );
    assert.equal(older.nextBeforeRound, null);
    const second = snapshot.rounds[0];
    await save(admin, {
      taskId: task.id,
      id: second.id,
      revision: second.revision,
      cause: 'SCOPE_CHANGE',
      effortMinutes: 0,
      internalCost: 0,
      proposedCharge: 0,
      currency: 'EUR',
    });
    summary = await costs(admin);
    assert.equal(summary.groups.length, 3);
    const unknown = summary.groups.find(
      (group) => group.cause === 'UNCLASSIFIED',
    );
    assert.equal(unknown.rounds, 20);
    assert.equal(unknown.missingCostCount, 20);
    assert.equal(unknown.missingEffortCount, 20);
    const euros = summary.groups.find((group) => group.currency === 'EUR');
    assert.equal(euros.recordedCost, 0);
    assert.equal(euros.missingCostCount, 0);
    assert.equal(euros.missingEffortCount, 0);
    const usd = summary.groups.find((group) => group.currency === 'USD');
    assert.equal(usd.recordedCost, 1750);
    assert.equal(usd.proposedCharges, 2200);
    assert.equal(
      (
        await revisions.costs(workspace, admin, admin, {
          ...filters,
          projectId: randomUUID(),
        })
      ).groups.length,
      0,
    );
    await assert.rejects(
      revisions.costs(workspace, admin, admin, {
        startDate: '2025-01-01',
        endDate: '2026-10-27',
      }),
      { status: 400 },
    );
    await runner.query(
      'UPDATE core."deliveryRevision" SET "createdAt"=$1 WHERE id=$2',
      ['2026-01-01T00:00:00Z', round.id],
    );
    assert.equal(
      (
        await revisions.costs(workspace, admin, admin, {
          startDate: '2025-12-31',
          endDate: '2025-12-31',
          projectId: project.id,
        })
      ).groups.length,
      0,
    );
    assert.equal(
      (
        await revisions.costs(workspace, admin, admin, {
          startDate: '2026-01-01',
          endDate: '2026-01-01',
          projectId: project.id,
        })
      ).groups[0].rounds,
      1,
    );
    console.log(
      'PASS revision creation/rollback, reasons/rounds, currency/unknown/zero costs, classification and finance permissions/revocation, workspace/identity isolation, stale updates, pagination, separate currency totals and UTC boundaries. All fixtures rolled back.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

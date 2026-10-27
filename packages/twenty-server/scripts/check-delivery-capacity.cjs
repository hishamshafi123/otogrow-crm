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
  DeliveryCapacityService,
} = require('../dist/modules/delivery/capacity/delivery-capacity.service');
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
    const service = new DeliveryService(scopedDataSource, access);
    const command = (actor, input) =>
      service.command(workspace, actor, actor, input);
    const capacity = new DeliveryCapacityService(
      scopedDataSource,
      service,
      access,
    );
    const day = '2026-11-01';
    const save = (actor, input) =>
      capacity.save(workspace, actor, actor, input);
    const initial = { memberId: editor, date: day, minutes: 360, revision: 0 };
    const first = await save(admin, initial);
    assert.equal(first.revision, 1);
    const read = () =>
      capacity.snapshot(workspace, admin, admin, { startDate: day });
    await assert.rejects(
      capacity.snapshot({ ...workspace, id: randomUUID() }, admin, admin, {
        startDate: day,
      }),
      { status: 403 },
    );
    const rowsBefore = JSON.stringify(
      await runner.query(
        'SELECT *,xmin::text FROM core."deliveryAvailability" WHERE id=$1',
        [first.id],
      ),
    );
    assert.equal(
      (await read()).availability.find((row) => row.memberId === editor)
        .minutes,
      360,
    );
    assert.equal(
      JSON.stringify(
        await runner.query(
          'SELECT *,xmin::text FROM core."deliveryAvailability" WHERE id=$1',
          [first.id],
        ),
      ),
      rowsBefore,
      'Reads never rewrite availability',
    );
    await assert.rejects(save(admin, initial), { status: 409 });
    await assert.rejects(save(editor, { ...initial, revision: 1 }), {
      status: 403,
    });
    await assert.rejects(
      capacity.snapshot(workspace, editor, editor, { startDate: day }),
      { status: 403 },
    );
    await assert.rejects(
      capacity.snapshot(workspace, admin, editor, { startDate: day }),
      { status: 403 },
    );
    await assert.rejects(
      capacity.snapshot(workspace, admin, admin, { startDate: '9999-12-31' }),
      { status: 400 },
    );
    for (const minutes of [-1, 0.5, 1441])
      await assert.rejects(save(admin, { ...initial, minutes, revision: 1 }), {
        status: 400,
      });
    await assert.rejects(save(admin, { ...initial, memberId: randomUUID() }), {
      status: 400,
    });
    await save(admin, { ...initial, revision: 1, minutes: 0 });
    assert.equal(
      (await read()).availability.find((row) => row.memberId === editor)
        .minutes,
      0,
    );
    await save(admin, { ...initial, revision: 2, minutes: null });
    assert.equal(
      (await read()).availability.find((row) => row.memberId === editor)
        .minutes,
      null,
    );
    const [event] = await runner.query(
      'SELECT changes FROM core."otogrowActivityEvent" WHERE "sourceId"=$1 ORDER BY "occurredAt" DESC LIMIT 1',
      [first.id],
    );
    assert(
      event.changes.some(
        (change) =>
          change.field === 'availableMinutes' &&
          change.before === '0' &&
          change.after === null,
      ),
    );
    const originalTransaction = scopedDataSource.transaction;
    scopedDataSource.transaction = (callback) =>
      runner.manager.transaction(async (manager) => {
        await callback(manager);
        throw new Error('Injected atomic failure');
      });
    await assert.rejects(
      save(admin, { ...initial, revision: 3 }),
      /Injected atomic failure/,
    );
    scopedDataSource.transaction = originalTransaction;
    assert.equal(
      (await read()).availability.find((row) => row.memberId === editor)
        .revision,
      3,
    );
    let snapshot = await command(admin, {
      action: 'project',
      name: 'Capacity fixture',
      companyId: null,
      memberIds: [editor],
    });
    const project = snapshot.projects.find(
      (row) => row.name === 'Capacity fixture',
    );
    snapshot = await command(admin, {
      action: 'create',
      projectId: project.id,
      fields: {
        title: 'Complex video',
        brief: 'Accurate product',
        service: 'Video',
        priority: 'NORMAL',
        scheduledDate: day,
        dueAt: null,
        assigneeId: editor,
        reviewerId: admin,
        checklist: [],
        evidence: ['https://example.com/fixture'],
      },
    });
    let task = snapshot.tasks.find((row) => row.projectId === project.id);
    const plan = {
      workMinutes: 120,
      revisionMinutes: 30,
      waitMinutes: 60,
      reviewMinutes: 20,
      reviewDate: day,
      complexity: 'COMPLEX',
    };
    const planning = {
      action: 'plan',
      taskId: task.id,
      revision: task.revision,
      plan,
    };
    await assert.rejects(command(editor, planning), { status: 403 });
    snapshot = await command(admin, planning);
    task = snapshot.tasks.find((row) => row.id === task.id);
    assert.deepEqual(task.details.plan, plan);
    assert.equal(task.details.brief, 'Accurate product');
    assert.equal(task.details.state, 'PLANNED');
    await assert.rejects(command(admin, planning), { status: 409 });
    await assert.rejects(
      command(admin, {
        ...planning,
        revision: task.revision,
        plan: { ...plan, workMinutes: -1 },
      }),
      { status: 400 },
    );
    snapshot = await command(editor, {
      action: 'submit',
      taskId: task.id,
      revision: task.revision,
      description: 'Version one',
      evidence: ['https://example.com/fixture'],
    });
    task = snapshot.tasks.find((row) => row.id === task.id);
    snapshot = await command(admin, {
      ...planning,
      revision: task.revision,
      plan: { ...plan, reviewMinutes: 40 },
    });
    task = snapshot.tasks.find((row) => row.id === task.id);
    assert.equal(task.details.state, 'IN_REVIEW');
    assert.equal(task.details.submissions.length, 1);
    assert.equal(task.details.plan.reviewMinutes, 40);
    snapshot = await command(admin, {
      action: 'review',
      taskId: task.id,
      revision: task.revision,
      decision: 'APPROVED',
      feedback: '',
    });
    task = snapshot.tasks.find((row) => row.id === task.id);
    await assert.rejects(
      command(admin, { ...planning, revision: task.revision }),
      { status: 400 },
    );
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [admin],
    );
    await assert.rejects(save(admin, { ...initial, revision: 3 }), {
      status: 403,
    });
    console.log(
      'PASS manager-only capacity, identity/revocation, unknown vs zero, input boundaries, stale versions, read-only snapshots, atomic rollback, audited minutes, task estimates without brief/approval changes and final-approval protection. All rolled back.',
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

const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const { DeliveryBatchesService } = require('../dist/modules/delivery/batches/delivery-batches.service');
const {
  DeliveryWorkflowsService,
} = require('../dist/modules/delivery/workflows/delivery-workflows.service');
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
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryClientsService,
} = require('../dist/modules/delivery/clients/delivery-clients.service');
const {
  DeliveryOperationsService,
} = require('../dist/modules/delivery/operations/delivery-operations.service');
const {
  DeliveryCommitmentsService,
} = require('../dist/modules/delivery/commitments/delivery-commitments.service');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');
const {
  DeliveryProjectEntity,
} = require('../dist/modules/delivery/entities/delivery-project.entity');
const {
  DeliveryCommitmentAllocationEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-allocation.entity');
const {
  DeliveryCommitmentEventEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-event.entity');

(async () => {
  assert(
    !process.argv.some((arg) => ['--live', '--browser-fixture'].includes(arg)),
    'This script is rollback-only.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const [workspace] = await runner.query(
      `SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL AND "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert.match(workspace.databaseSchema, /^[a-zA-Z0-9_]+$/);
    const schema = `"${workspace.databaseSchema}"`;
    const founder = randomUUID(),
      editor = randomUUID(),
      outsider = randomUUID();
    const people = new Map();
    for (const [member, name] of [
      [founder, 'Founder'],
      [editor, 'Editor'],
      [outsider, 'Outsider'],
    ]) {
      const user = randomUUID();
      people.set(member, user);
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        user,
        `${user}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [member, user, workspace.id],
      );
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,$4,'Commitment fixture')`,
        [member, user, `${user}@example.invalid`, name],
      );
    }
    let failAfterWrite = false;
    const source = {
      manager: runner.manager,
      query: (...args) => runner.query(...args),
      getRepository: (entity) => runner.manager.getRepository(entity),
      transaction: (callback) =>
        runner.manager.transaction(async (manager) => {
          const result = await callback(manager);
          if (failAfterWrite) {
            failAfterWrite = false;
            throw new Error('Synthetic commitment write failure');
          }
          return result;
        }),
    };
    const access = new OtogrowAccessService(source, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        userWorkspaceId === founder,
    });
    const delivery = new DeliveryService(
      source,
      access,
      createIsolatedNativeTaskAccess(),
    );
    const creative = new DeliveryCreativeService(
      source,
      delivery,
      {},
      createIsolatedNativeTaskAccess(),
    );
    const commitments = new DeliveryCommitmentsService(source, delivery);
    const clients = new DeliveryClientsService(
      source,
      delivery,
      creative,
      commitments,
    );
    const operations = new DeliveryOperationsService(
      source,
      delivery,
      creative,
      { findByWorkspaceId: async () => ({ isActive: false }) },
      { get: () => null },
    );
    const companyId = randomUUID();
    await runner.query(
      `INSERT INTO ${schema}.company (id,name) VALUES ($1,'Commitment fixture client')`,
      [companyId],
    );
    const createdProject = await delivery.command(workspace, founder, founder, {
      action: 'project',
      name: `Commitment fixture ${randomUUID()}`,
      companyId,
      memberIds: [editor],
    });
    const project = createdProject.projects.find(
      (item) => item.companyId === companyId,
    );
    const secret = `Legacy commercial notes ${randomUUID()} USD 12345`;
    const makeEngagement = async (name, billing = 'RETAINER') => {
      const result = await clients.command(workspace, founder, founder, {
        action: 'engagement',
        engagement: {
          revision: 0,
          projectId: project.id,
          name,
          services: ['AI video', 'SEO'],
          billing,
          scope: secret,
          allowance: secret,
          contact: secret,
          fields: [],
        },
      });
      return result.engagements.find((item) => item.name === name);
    };
    const engagement = await makeEngagement('Monthly videos');
    const oneTime = await makeEngagement('Website release', 'ONE_TIME');
    const batches = new DeliveryBatchesService(source, delivery);
    const batchId = randomUUID();
    const plan = { id: batchId, projectId: project.id, revision: 0, label: 'Disposable weekly plan', periodId: null, startDate: '2026-10-25', endDate: '2026-10-31', timezone: 'Asia/Qatar', reason: 'Plan synthetic work' };
    const read = (extra = {}, actor = founder) => batches.snapshot(workspace, actor, actor, { projectId: project.id, batchId, includeClosed: true, ...extra });
    const task = (taskId) => runner.manager.getRepository(DeliveryTaskEntity).findOneByOrFail({ workspaceId: workspace.id, taskId });
    const makeTask = async (title) => {
      const result = await delivery.command(workspace, founder, founder, { action: 'create', projectId: project.id, fields: { title, brief: 'Keep this original brief', service: 'AI video', priority: 'NORMAL', scheduledDate: null, dueAt: null, assigneeId: editor, reviewerId: founder, checklist: [], evidence: [] } });
      return result.tasks.find((item) => item.title === title).id;
    };
    const taskId = await makeTask('Batch original video'), variantId = await makeTask('Batch hook variation'), extraId = await makeTask('Unclassified SEO work');
    const initial = await batches.snapshot(workspace, editor, editor, { projectId: project.id });
    assert.equal(initial.canManage, false);
    await assert.rejects(batches.save(workspace, editor, editor, plan));
    await assert.rejects(batches.save(workspace, founder, editor, plan));
    await assert.rejects(batches.save(workspace, founder, founder, { ...plan, endDate: '2026-10-01' }));
    let result = await batches.save(workspace, founder, founder, plan);
    assert.equal(result.selected.revision, 1);
    await assert.rejects(batches.save(workspace, founder, founder, plan));
    await assert.rejects(read({}, outsider));
    await assert.rejects(batches.snapshot({ ...workspace, id: randomUUID() }, founder, founder, { projectId: project.id, batchId }));
    const change = async (id, overrides = {}) => batches.item(workspace, founder, founder, { projectId: project.id, batchId, revision: (await read()).selected.revision, taskId: id, taskRevision: (await task(id)).revision, active: true, concept: 'Customer pain point', reason: 'Add to weekly production', ...overrides });
    await change(taskId);
    await assert.rejects(change(taskId));
    await assert.rejects(change(variantId, { taskRevision: 0 }));
    await change(variantId); await change(extraId);
    result = await read({ limit: 1 });
    assert.equal(result.tasks.length, 1); assert.equal(result.counts.find((item) => item.key === 'ALL').total, 3);
    assert.equal(result.counts.find((item) => item.key === 'UNCLASSIFIED').total, 3);
    const pageIds = new Set(result.tasks.map((item) => item.taskId));
    let next = result.nextTaskCursor;
    while (next) { const page = await read({ taskCursor: next, limit: 1 }); for (const row of page.tasks) { assert(!pageIds.has(row.taskId)); pageIds.add(row.taskId); } next = page.nextTaskCursor; }
    assert.equal(pageIds.size, 3);
    await assert.rejects(read({ taskCursor: result.nextHistoryCursor }));
    const historyIds = new Set(); next = null;
    do { const page = await read({ historyCursor: next, limit: 1 }); for (const row of page.history) { assert(!historyIds.has(row.id)); historyIds.add(row.id); } next = page.nextHistoryCursor; } while (next);
    assert.equal(historyIds.size, 4);
    assert.equal((await task(taskId)).details.brief, 'Keep this original brief');
    assert.equal((await task(taskId)).details.state, 'PLANNED');
    const periodId = randomUUID(), uniqueId = randomUUID(), variationLineId = randomUUID();
    await commitments.savePeriod(workspace, founder, founder, { id: periodId, engagementId: engagement.id, revision: 0, label: 'October commitment', startDate: '2026-10-01', endDateExclusive: '2026-11-01', timezone: 'Asia/Qatar', reason: 'Test structured scope' });
    for (const [id, label, unit] of [[uniqueId, 'Unique videos', 'UNIQUE_VIDEO'], [variationLineId, 'Variations', 'VARIATION']]) {
      await commitments.saveLine(workspace, founder, founder, { id, engagementId: engagement.id, periodId, periodRevision: 1, revision: 0, label, unit, promisedQuantity: 5, reason: 'Test separate quantities' });
    }
    for (const [id, lineId, parentTaskId] of [[taskId, uniqueId, null], [variantId, variationLineId, taskId]]) {
      await commitments.assignTask(workspace, founder, founder, { engagementId: engagement.id, periodId, lineId, lineRevision: 1, periodRevision: 1, taskId: id, taskRevision: (await task(id)).revision, revision: 0, parentTaskId, reason: 'Explicit commitment allocation' });
    }
    result = await read();
    assert.equal(result.counts.find((item) => item.key === 'UNIQUE_VIDEO').total, 1);
    assert.equal(result.counts.find((item) => item.key === 'VARIATION').total, 1);
    assert.equal(result.counts.find((item) => item.key === 'UNCLASSIFIED').total, 1);
    await delivery.command(workspace, editor, editor, { action: 'submit', taskId, revision: (await task(taskId)).revision, description: 'Completed original', evidence: ['https://example.com/video'] });
    await assert.rejects(delivery.command(workspace, editor, editor, { action: 'review', taskId, revision: (await task(taskId)).revision, decision: 'APPROVED', feedback: 'Self approval must fail' }));
    await delivery.command(workspace, founder, founder, { action: 'review', taskId, revision: (await task(taskId)).revision, decision: 'APPROVED', feedback: 'Independent review' });
    result = await read();
    assert.equal(result.counts.find((item) => item.key === 'UNIQUE_VIDEO').approved, 1);
    assert.equal(result.counts.find((item) => item.key === 'UNIQUE_VIDEO').fulfilled, 0);
    await batches.state(workspace, founder, founder, { projectId: project.id, batchId, revision: result.selected.revision, closed: true, reason: 'Planning frozen, work still continues' });
    await assert.rejects(change(extraId, { concept: 'Cannot edit frozen plan' }));
    await operations.command(workspace, founder, founder, { action: 'delivered', taskId, revision: (await task(taskId)).revision, note: 'Delivered synthetic version' });
    const ops = await runner.manager.getRepository(DeliveryOperationsEntity).findOneByOrFail({ workspaceId: workspace.id });
    const fulfilment = ops.state.fulfilments.find((item) => item.taskId === taskId);
    await operations.command(workspace, founder, founder, { action: 'fulfilment', taskId, cycle: fulfilment.cycle, historyLength: fulfilment.history.length, decision: 'FULFILLED', note: 'Confirmed fulfilled version' });
    result = await read();
    assert.equal(result.selected.closed, true); assert.equal(result.counts.find((item) => item.key === 'UNIQUE_VIDEO').fulfilled, 1);
    const approvedTask = structuredClone(await task(taskId));
    await runner.manager.getRepository(DeliveryTaskEntity).update({ taskId }, { details: { ...approvedTask.details, state: 'CHANGES_REQUESTED' } });
    result = await read();
    assert.equal(result.counts.find((item) => item.key === 'UNIQUE_VIDEO').approved, 0); assert.equal(result.counts.find((item) => item.key === 'UNIQUE_VIDEO').fulfilled, 0);
    await runner.manager.getRepository(DeliveryTaskEntity).update({ taskId }, { details: approvedTask.details });
    const otherProject = (await delivery.command(workspace, founder, founder, { action: 'project', name: 'Other private project', companyId: null, memberIds: [outsider] })).projects.find((item) => item.name === 'Other private project');
    await runner.manager.getRepository(DeliveryTaskEntity).update({ taskId }, { projectId: otherProject.id });
    result = await read({}, editor);
    const moved = result.tasks.find((item) => item.taskId === taskId);
    assert.equal(moved.available, false); assert.equal(moved.approved, false); assert.equal(moved.fulfilled, false); assert.equal(moved.state, null); assert.equal(moved.assigneeName, null);
    await runner.manager.getRepository(DeliveryTaskEntity).update({ taskId }, { projectId: project.id });
    await runner.query(`UPDATE ${schema}.task SET "deletedAt"=now() WHERE id=$1`, [variantId]);
    assert.equal((await read()).tasks.find((item) => item.taskId === variantId).available, false);
    await runner.query(`UPDATE ${schema}.task SET "deletedAt"=NULL WHERE id=$1`, [variantId]);
    result = await read();
    await batches.state(workspace, founder, founder, { projectId: project.id, batchId, revision: result.selected.revision, closed: false, reason: 'Reopen plan for corrections' });
    await change(extraId, { active: false, taskRevision: null });
    assert.equal((await read()).counts.find((item) => item.key === 'ALL').total, 2);
    await change(extraId);
    const duplicate = await runner.query('SELECT count(*)::int AS count FROM core."deliveryBatchItem" WHERE "batchId"=$1 AND "taskId"=$2', [batchId, extraId]);
    assert.equal(duplicate[0].count, 1);
    const beforeFailure = await read(); failAfterWrite = true;
    await assert.rejects(batches.save(workspace, founder, founder, { ...plan, revision: beforeFailure.selected.revision, label: 'Must roll back' }));
    assert.deepEqual(await read(), beforeFailure);
    const snapshotRows = () => runner.query('SELECT xmin::text,"updatedAt",revision FROM core."deliveryBatch" WHERE id=$1', [batchId]);
    const beforeRead = await snapshotRows(); await read(); await read({}, editor); assert.deepEqual(await snapshotRows(), beforeRead);
    await runner.manager.getRepository(DeliveryProjectEntity).update({ id: project.id }, { memberIds: [] });
    await assert.rejects(read({}, editor));
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [people.get(founder)]);
    await assert.rejects(read());
    await assert.rejects(batches.state(workspace, founder, founder, { projectId: project.id, batchId, revision: beforeFailure.selected.revision, closed: true, reason: 'Disabled actor must fail' }));
    console.log('PASS batch planning, task uniqueness, stale changes, permissions/revocation, separate original/variation counts, independent approval/fulfilment, closed-plan corrections, moved/deleted records, cursor pages, history, read-only and atomic failure. Rolled back.');
  } finally {
    await runner.rollbackTransaction(); await runner.release(); await connectionSource.destroy();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

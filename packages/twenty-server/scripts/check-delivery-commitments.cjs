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
    const commitments = new DeliveryCommitmentsService(source, delivery, createIsolatedNativeTaskAccess());
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
      undefined,
      createIsolatedNativeTaskAccess(),
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
    const read = (actor = founder, extra = {}) =>
      commitments.snapshot(workspace, actor, actor, {
        engagementId: engagement.id,
        ...extra,
      });
    const events = () =>
      runner.manager
        .getRepository(DeliveryCommitmentEventEntity)
        .findBy({ workspaceId: workspace.id });
    const denied = async (action) => {
      const before = await events();
      await assert.rejects(action);
      assert.deepEqual(
        await events(),
        before,
        'Rejected mutations cannot record success events.',
      );
    };
    assert.equal((await read()).periods.length, 0);
    assert.equal((await read(editor)).legacyAllowance, null);
    assert.equal((await read(editor)).canManage, false);
    assert.equal(
      (
        await commitments.engagements(workspace, outsider, outsider)
      ).engagements.some((item) => item.id === engagement.id),
      false,
    );
    await assert.rejects(read(outsider));
    await assert.rejects(
      commitments.snapshot(workspace, founder, editor, {
        engagementId: engagement.id,
      }),
    );
    const periodInput = {
      id: randomUUID(),
      engagementId: engagement.id,
      revision: 0,
      label: 'October scope',
      startDate: '2026-10-01',
      endDateExclusive: '2026-11-01',
      timezone: 'Asia/Qatar',
      reason: 'Explicit agreed scope',
    };
    await denied(() =>
      commitments.savePeriod(workspace, editor, editor, periodInput),
    );
    await denied(() =>
      commitments.savePeriod(workspace, founder, founder, {
        ...periodInput,
        endDateExclusive: null,
      }),
    );
    await denied(() =>
      commitments.savePeriod(workspace, founder, founder, {
        ...periodInput,
        timezone: 'invalid',
      }),
    );
    await denied(() =>
      commitments.savePeriod(workspace, founder, founder, {
        ...periodInput,
        endDateExclusive: periodInput.startDate,
      }),
    );
    let snapshot = await commitments.savePeriod(
      workspace,
      founder,
      founder,
      periodInput,
    );
    const periodId = periodInput.id;
    await denied(() =>
      commitments.savePeriod(workspace, founder, founder, periodInput),
    );
    assert.equal(
      (await read()).periods.length,
      1,
      'Retrying create with same id cannot create another period.',
    );
    const saveLine = async (unit, label, quantity) => {
      const id = randomUUID();
      const result = await commitments.saveLine(workspace, founder, founder, {
        id,
        engagementId: engagement.id,
        periodId,
        periodRevision: 1,
        revision: 0,
        label,
        unit,
        promisedQuantity: quantity,
        reason: 'Agreed deliverable quantity',
      });
      return result.lines.find((item) => item.id === id);
    };
    const unique = await saveLine('UNIQUE_VIDEO', 'Unique video', 2);
    const variants = await saveLine('VARIATION', 'Hook/CTA variations', 3);
    const other = await saveLine('OTHER', 'One SEO work item', 1);
    const createTask = async (title) => {
      const result = await delivery.command(workspace, founder, founder, {
        action: 'create',
        projectId: project.id,
        fields: {
          title,
          brief: 'Synthetic brief',
          service: 'AI video',
          priority: 'NORMAL',
          scheduledDate: null,
          dueAt: null,
          assigneeId: editor,
          reviewerId: founder,
          checklist: [],
          evidence: [],
        },
      });
      return result.tasks.find((item) => item.title === title).id;
    };
    const taskId = await createTask(`Unique ${randomUUID()}`),
      variantId = await createTask(`Variation ${randomUUID()}`),
      seoId = await createTask(`SEO ${randomUUID()}`);
    const task = (taskId) =>
      runner.manager
        .getRepository(DeliveryTaskEntity)
        .findOneBy({ workspaceId: workspace.id, taskId });
    const allocation = (taskId) =>
      runner.manager
        .getRepository(DeliveryCommitmentAllocationEntity)
        .findOneBy({ workspaceId: workspace.id, taskId });
    const assignment = async (taskId, line, parentTaskId = null) => ({
      engagementId: engagement.id,
      periodId,
      lineId: line.id,
      lineRevision: line.revision,
      periodRevision: 1,
      taskId,
      taskRevision: (await task(taskId)).revision,
      revision: (await allocation(taskId))?.revision ?? 0,
      parentTaskId,
      reason: 'Assign one completed work item',
    });
    await commitments.assignTask(
      workspace,
      founder,
      founder,
      await assignment(taskId, unique),
    );
    snapshot = await read();
    assert.equal(
      snapshot.lines.find((item) => item.id === unique.id).assignedQuantity,
      1,
    );
    assert.equal(
      snapshot.lines.find((item) => item.id === unique.id).fulfilledQuantity,
      0,
    );
    await denied(async () =>
      commitments.assignTask(workspace, founder, founder, {
        ...(await assignment(variantId, variants)),
        parentTaskId: null,
      }),
    );
    await denied(async () =>
      commitments.assignTask(
        workspace,
        founder,
        founder,
        await assignment(variantId, variants, variantId),
      ),
    );
    await commitments.assignTask(
      workspace,
      founder,
      founder,
      await assignment(variantId, variants, taskId),
    );
    await commitments.assignTask(
      workspace,
      founder,
      founder,
      await assignment(seoId, other),
    );
    await denied(async () =>
      commitments.removeTask(workspace, founder, founder, {
        engagementId: engagement.id,
        periodId,
        taskId,
        revision: (await allocation(taskId)).revision,
        reason: 'Cannot abandon variation parent',
      }),
    );
    await denied(() =>
      commitments.saveLine(workspace, founder, founder, {
        id: unique.id,
        engagementId: engagement.id,
        periodId,
        periodRevision: 1,
        revision: 1,
        label: 'Change type',
        unit: 'VARIATION',
        promisedQuantity: 2,
        reason: 'Cannot reclassify parent',
      }),
    );
    const approve = async (taskId) => {
      await delivery.command(workspace, editor, editor, {
        action: 'submit',
        taskId,
        revision: (await task(taskId)).revision,
        description: 'Completed synthetic work',
        evidence: ['https://example.com/evidence'],
      });
      await delivery.command(workspace, founder, founder, {
        action: 'review',
        taskId,
        revision: (await task(taskId)).revision,
        decision: 'APPROVED',
        feedback: 'Independent approval',
      });
    };
    const readOperations = () =>
      runner.manager
        .getRepository(DeliveryOperationsEntity)
        .findOneBy({ workspaceId: workspace.id });
    const fulfil = async (taskId) => {
      await operations.command(workspace, founder, founder, {
        action: 'delivered',
        taskId,
        revision: (await task(taskId)).revision,
        note: 'Delivered synthetic work',
      });
      const current = (await readOperations()).state.fulfilments.find(
        (item) => item.taskId === taskId,
      );
      await operations.command(workspace, founder, founder, {
        action: 'fulfilment',
        taskId,
        cycle: current.cycle,
        historyLength: current.history.length,
        decision: 'FULFILLED',
        note: 'Confirmed fulfilled with no objection',
      });
    };
    await approve(taskId);
    assert.equal(
      (await read()).lines.find((item) => item.id === unique.id)
        .fulfilledQuantity,
      0,
      'Approval alone never credits.',
    );
    await fulfil(taskId);
    assert.equal(
      (await read()).lines.find((item) => item.id === unique.id)
        .fulfilledQuantity,
      1,
    );
    await denied(async () =>
      commitments.assignTask(workspace, founder, founder, {
        ...(await assignment(taskId, unique)),
        periodRevision: 1,
      }),
    );
    await approve(variantId);
    await fulfil(variantId);
    snapshot = await read();
    assert.equal(
      snapshot.lines.find((item) => item.id === unique.id).fulfilledQuantity,
      1,
    );
    assert.equal(
      snapshot.lines.find((item) => item.id === variants.id).fulfilledQuantity,
      1,
      'A variation counts only as a variation.',
    );
    await fulfil(taskId);
    assert.equal(
      (await read()).lines.find((item) => item.id === unique.id)
        .fulfilledQuantity,
      1,
      'Repeated delivery cannot duplicate task credits.',
    );
    const fulfilledHistory = (await events()).filter(
      (item) =>
        item.taskId === taskId && item.action === 'COMMITMENT_TASK_CREDITED',
    );
    assert.equal(
      fulfilledHistory.length,
      2,
      'Each real delivery cycle retains evidence.',
    );
    const beforeRead = await events();
    const operationsBefore = await readOperations();
    await read();
    await read(editor);
    assert.deepEqual(await events(), beforeRead);
    assert.deepEqual(
      await readOperations(),
      operationsBefore,
      'Commitment reads are read-only.',
    );
    const staff = await read(editor);
    assert(!JSON.stringify(staff).includes(secret));
    assert.equal(staff.history.length, 0);
    assert.equal(staff.taskOptions.length, 0);
    const originalOperations = await readOperations();
    const legacyOperations = structuredClone(originalOperations);
    delete legacyOperations.state.fulfilments.find(
      (item) => item.taskId === taskId,
    ).deliveredSubmissionVersion;
    await runner.manager
      .getRepository(DeliveryOperationsEntity)
      .save(legacyOperations);
    assert.equal(
      (await read()).lines.find((item) => item.id === unique.id)
        .fulfilledQuantity,
      0,
      'Legacy fulfilment without a bound submission cannot inherit a credit.',
    );
    await runner.manager
      .getRepository(DeliveryOperationsEntity)
      .save(originalOperations);
    await denied(async () =>
      commitments.assignTask(workspace, founder, founder, {
        ...(await assignment(seoId, unique)),
        taskRevision: 0,
      }),
    );
    await denied(async () =>
      commitments.assignTask(workspace, founder, founder, {
        ...(await assignment(seoId, unique)),
        lineRevision: 0,
      }),
    );
    await denied(async () =>
      commitments.assignTask(workspace, founder, founder, {
        ...(await assignment(seoId, unique)),
        periodRevision: 0,
      }),
    );
    await denied(async () =>
      commitments.assignTask(workspace, founder, founder, {
        ...(await assignment(seoId, unique)),
        revision: 0,
      }),
    );
    const publicLink = await clients.command(workspace, founder, founder, {
      action: 'link',
      engagementId: engagement.id,
    });
    const credential = `${publicLink.token}:${publicLink.accessCode}`;
    const publicSummary = (await clients.portal(credential)).commitments;
    assert.equal(
      publicSummary[0].lines.find((item) => item.id === unique.id)
        .fulfilledQuantity,
      1,
    );
    assert(!JSON.stringify(publicSummary).includes(secret));
    assert(!JSON.stringify(publicSummary).includes('taskName'));
    const shared = await clients.command(workspace, founder, founder, {
      action: 'share',
      engagementId: engagement.id,
      taskId,
      revision: (await task(taskId)).revision,
      kind: 'SUBMISSION',
    });
    const shareId = shared.shares.find((item) => item.taskId === taskId).id;
    await clients.respond(credential, {
      action: 'review',
      shareId,
      requestId: randomUUID(),
      decision: 'CHANGES_REQUESTED',
      comment: 'Please revise the final delivery.',
    });
    assert.equal(
      (await read()).lines.find((item) => item.id === unique.id)
        .fulfilledQuantity,
      0,
      'Client objection immediately removes current credit.',
    );
    const objection = (await events()).find(
      (item) =>
        item.taskId === taskId &&
        item.action === 'COMMITMENT_TASK_REOPENED' &&
        item.actorType === 'CLIENT',
    );
    assert(objection);
    assert.equal(objection.actorId, null);
    assert.equal(objection.actorName, 'Client portal');
    const current = (await readOperations()).state.fulfilments.find(
      (item) => item.taskId === taskId,
    );
    await operations.command(workspace, founder, founder, {
      action: 'fulfilment',
      taskId,
      cycle: current.cycle,
      historyLength: current.history.length,
      decision: 'REDOING',
      note: 'Redo after client objection',
    });
    await approve(taskId);
    await fulfil(taskId);
    assert.equal(
      (await read()).lines.find((item) => item.id === unique.id)
        .fulfilledQuantity,
      1,
    );
    const previous = await task(taskId);
    previous.details.state = 'CHANGES_REQUESTED';
    previous.revision++;
    await runner.manager.getRepository(DeliveryTaskEntity).save(previous);
    assert.equal(
      (await read()).lines.find((item) => item.id === unique.id)
        .fulfilledQuantity,
      0,
      'Read guard also catches production reopened outside operations.',
    );
    await approve(taskId);
    assert.equal(
      (await read()).lines.find((item) => item.id === unique.id)
        .fulfilledQuantity,
      0,
      'New approval cannot inherit an old delivery credit.',
    );
    await fulfil(taskId);
    await commitments.setPeriodState(workspace, founder, founder, {
      engagementId: engagement.id,
      periodId,
      revision: 1,
      state: 'CLOSED',
      reason: 'Month closed for planning',
    });
    await denied(() =>
      commitments.saveLine(workspace, founder, founder, {
        id: unique.id,
        engagementId: engagement.id,
        periodId,
        periodRevision: 2,
        revision: 1,
        label: 'Changed closed plan',
        unit: 'UNIQUE_VIDEO',
        promisedQuantity: 9,
        reason: 'Should fail while closed',
      }),
    );
    await clients.respond(credential, {
      action: 'review',
      shareId,
      requestId: randomUUID(),
      decision: 'CHANGES_REQUESTED',
      comment: 'Objection after period closing',
    });
    assert.equal(
      (await read()).lines.find((item) => item.id === unique.id)
        .fulfilledQuantity,
      0,
      'Closed periods still reflect later client objections.',
    );
    await commitments.setPeriodState(workspace, founder, founder, {
      engagementId: engagement.id,
      periodId,
      revision: 2,
      state: 'OPEN',
      reason: 'Correct the explicit agreement',
    });
    const laterInput = {
      ...periodInput,
      id: randomUUID(),
      label: 'November',
      startDate: '2026-11-01',
      endDateExclusive: '2026-12-01',
    };
    await commitments.savePeriod(workspace, founder, founder, laterInput);
    const laterLineId = randomUUID();
    await commitments.saveLine(workspace, founder, founder, {
      id: laterLineId,
      engagementId: engagement.id,
      periodId: laterInput.id,
      periodRevision: 1,
      revision: 0,
      label: 'Next period',
      unit: 'OTHER',
      promisedQuantity: 1,
      reason: 'New explicit scope',
    });
    await commitments.assignTask(workspace, founder, founder, {
      engagementId: engagement.id,
      periodId: laterInput.id,
      periodRevision: 1,
      lineId: laterLineId,
      lineRevision: 1,
      taskId: seoId,
      taskRevision: (await task(seoId)).revision,
      revision: (await allocation(seoId)).revision,
      parentTaskId: null,
      reason: 'Move undelivered work explicitly',
    });
    assert.equal(
      (await read(founder, { periodId })).lines.find(
        (item) => item.id === other.id,
      ).assignedQuantity,
      0,
    );
    const oldPeriodEvents = (await events()).filter(
      (item) => item.periodId === periodId && item.taskId === seoId,
    );
    assert(
      oldPeriodEvents.some((item) => item.action === 'COMMITMENT_TASK_REMOVED'),
    );
    const limited = await commitments.saveLine(workspace, founder, founder, {
      id: variants.id,
      engagementId: engagement.id,
      periodId,
      periodRevision: 3,
      revision: variants.revision,
      label: variants.label,
      unit: variants.unit,
      promisedQuantity: 0,
      reason: 'Explicitly reduced variation scope',
    });
    const overdelivered = limited.lines.find((item) => item.id === variants.id);
    assert.equal(overdelivered.fulfilledQuantity, 1);
    assert.equal(overdelivered.remainingQuantity, 0);
    assert.equal(
      overdelivered.overdeliveredQuantity,
      1,
      'Reduced promises cannot erase actual fulfilled work.',
    );
    const lateTask = await createTask(`Late unique ${randomUUID()}`);
    await commitments.assignTask(workspace, founder, founder, {
      ...(await assignment(lateTask, unique)),
      periodRevision: 3,
    });
    await approve(lateTask);
    const lateDate = new Date('2026-12-20T12:00:00.000Z');
    await operations.command(
      workspace,
      founder,
      founder,
      {
        action: 'delivered',
        taskId: lateTask,
        revision: (await task(lateTask)).revision,
        note: 'Late completion against original period',
      },
      lateDate,
    );
    const lateDelivery = (await readOperations()).state.fulfilments.find(
      (item) => item.taskId === lateTask,
    );
    await operations.command(
      workspace,
      founder,
      founder,
      {
        action: 'fulfilment',
        taskId: lateTask,
        cycle: lateDelivery.cycle,
        historyLength: lateDelivery.history.length,
        decision: 'FULFILLED',
        note: 'Fulfilled later with original attribution',
      },
      new Date(lateDate.getTime() + 12 * 60 * 60 * 1000),
    );
    assert.equal((await allocation(lateTask)).periodId, periodId);
    assert.equal(
      (await read(founder, { periodId })).allocations.find(
        (item) => item.taskId === lateTask,
      ).credited,
      true,
      'Late completion remains in the explicitly assigned period.',
    );
    const oneTimeInput = {
      ...periodInput,
      id: randomUUID(),
      engagementId: oneTime.id,
      label: 'Website package',
      endDateExclusive: null,
    };
    await commitments.savePeriod(workspace, founder, founder, oneTimeInput);
    await denied(() =>
      commitments.saveLine(workspace, founder, founder, {
        id: randomUUID(),
        engagementId: engagement.id,
        periodId: oneTimeInput.id,
        periodRevision: 1,
        revision: 0,
        label: 'Foreign engagement',
        unit: 'OTHER',
        promisedQuantity: 1,
        reason: 'Should fail',
      }),
    );
    const failedId = randomUUID();
    const beforeFailure = await events();
    failAfterWrite = true;
    await assert.rejects(
      commitments.savePeriod(workspace, founder, founder, {
        ...periodInput,
        id: failedId,
        label: 'Atomic failure',
      }),
      /Synthetic commitment/,
    );
    assert.deepEqual(await events(), beforeFailure);
    assert(!(await read()).periods.some((item) => item.id === failedId));
    const full = await read(founder, { periodId, limit: 100 });
    let page = await read(founder, { periodId, limit: 1 });
    const allocationIds = [];
    while (true) {
      allocationIds.push(...page.allocations.map((item) => item.taskId));
      if (!page.nextAllocationCursor) break;
      page = await read(founder, {
        periodId,
        limit: 1,
        allocationCursor: page.nextAllocationCursor,
      });
    }
    assert.equal(new Set(allocationIds).size, full.allocations.length);
    page = await read(founder, { periodId, limit: 1 });
    const historyIds = [];
    const firstCursor = page.nextHistoryCursor;
    while (true) {
      historyIds.push(...page.history.map((item) => item.id));
      if (!page.nextHistoryCursor) break;
      page = await read(founder, {
        periodId,
        limit: 1,
        historyCursor: page.nextHistoryCursor,
      });
    }
    assert.equal(new Set(historyIds).size, full.history.length);
    await assert.rejects(
      read(founder, { periodId: laterInput.id, historyCursor: firstCursor }),
    );
    await assert.rejects(
      read(founder, { periodId, allocationCursor: 'invalid' }),
    );
    const beforeRevocation = await runner.manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ id: project.id });
    await runner.manager
      .getRepository(DeliveryProjectEntity)
      .update({ id: project.id }, { memberIds: [] });
    await assert.rejects(read(editor));
    await runner.manager
      .getRepository(DeliveryProjectEntity)
      .save(beforeRevocation);
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.get(editor),
    ]);
    await assert.rejects(read(editor));
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      people.get(editor),
    ]);
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [editor],
    );
    await assert.rejects(read(editor));
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
      [editor],
    );
    await runner.query(
      `UPDATE ${schema}."workspaceMember" SET "nameFirstName"='Renamed' WHERE id=$1`,
      [founder],
    );
    assert(
      (await read(founder, { periodId })).history.some((item) =>
        item.actorName.startsWith('Founder'),
      ),
      'History keeps the actual original actor name.',
    );
    assert.equal(
      (await readOperations()).state.clients.engagements.find(
        (item) => item.id === engagement.id,
      ).allowance,
      secret,
      'Legacy commercial prose remains untouched.',
    );
    console.log(
      'PASS commitment scope, revisions, unique/variation counts, fulfilment/objection/reopen, closed periods, one-time packages, history, pagination, read-only and rollback acceptance.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

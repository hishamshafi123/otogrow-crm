const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
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
    const workflows = new DeliveryWorkflowsService(source, delivery, createIsolatedNativeTaskAccess());
    const catalog = () =>
      workflows.catalog(workspace, founder, founder, { includeArchived: true });
    const readTask = (taskId) =>
      runner.manager
        .getRepository(DeliveryTaskEntity)
        .findOneBy({ workspaceId: workspace.id, taskId });
    const readWorkflow = (taskId, actor = editor, extra = {}) =>
      workflows.task(workspace, actor, actor, { taskId, ...extra });
    const activities = () =>
      runner.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "actorId"=ANY($2::uuid[]) ORDER BY "recordedAt",id',
        [workspace.id, [founder, editor, outsider]],
      );
    const denied = async (operation) => {
      const before = await activities();
      await assert.rejects(operation);
      assert.deepEqual(
        await activities(),
        before,
        'Rejected workflow mutations cannot leave success activity.',
      );
    };
    const initial = await catalog();
    assert.equal(initial.starters.length, 6);
    await denied(() => workflows.catalog(workspace, editor, editor, {}));
    await assert.rejects(workflows.catalog(workspace, founder, editor, {}));
    const starter = structuredClone(
      initial.starters.find((item) => item.key === 'static-ad').definition,
    );
    const templateId = randomUUID();
    const publish = {
      id: templateId,
      revision: 0,
      definition: starter,
      reason: 'Synthetic workflow definition',
    };
    await denied(() => workflows.save(workspace, editor, editor, publish));
    let published = await workflows.save(workspace, founder, founder, publish);
    const versionOne = published.templates.find(
      (item) => item.id === templateId,
    ).current;
    await denied(() => workflows.save(workspace, founder, founder, publish));
    const fields = {
      title: `Workflow fixture ${randomUUID()}`,
      brief: 'Preserve the client brief and editor music notes',
      service: 'Static ads',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: editor,
      reviewerId: founder,
      checklist: [
        { id: randomUUID(), text: 'Custom editor instruction', done: false },
      ],
      evidence: ['https://example.com/original-reference'],
    };
    const create = async (title, workflow) => {
      const result = await delivery.command(workspace, founder, founder, {
        action: 'create',
        projectId: project.id,
        fields: { ...fields, title },
        ...(workflow ? { workflow } : {}),
      });
      return result.tasks.find((item) => item.title === title).id;
    };
    const taskId = await create(fields.title);
    assert.equal((await readWorkflow(taskId)).workflow, null);
    await denied(() =>
      workflows.task(workspace, outsider, outsider, { taskId }),
    );
    const applyInput = {
      taskId,
      taskRevision: (await readTask(taskId)).revision,
      templateId,
      templateRevision: 1,
      version: 1,
      reopen: false,
      reason: 'Apply published service requirements',
    };
    await denied(() => workflows.apply(workspace, editor, editor, applyInput));
    await workflows.apply(workspace, founder, founder, applyInput);
    let task = await readTask(taskId);
    assert.equal(task.details.brief, fields.brief);
    assert.deepEqual(task.details.checklist, fields.checklist);
    assert.deepEqual(task.details.evidence, fields.evidence);
    await denied(() =>
      workflows.apply(workspace, founder, founder, {
        ...applyInput,
        taskRevision: task.revision,
      }),
    );
    const submit = async (id = taskId) =>
      delivery.command(workspace, editor, editor, {
        action: 'submit',
        taskId: id,
        revision: (await readTask(id)).revision,
        description: 'Review the final deliverable',
        evidence: ['https://example.com/final'],
      });
    await denied(() => submit());
    const progressInput = async (id = taskId) => {
      const current = await readWorkflow(id);
      return {
        taskId: id,
        taskRevision: current.taskRevision,
        workflowRevision: current.workflow.revision,
        checkedIds: current.workflow.definition.checklist.map(
          (item) => item.id,
        ),
        evidence: current.workflow.definition.evidence.map((item) => ({
          requirementId: item.id,
          value:
            item.kind === 'LINK'
              ? 'https://example.com/internal-proof'
              : 'Verified synthetic findings',
        })),
      };
    };
    await denied(async () =>
      workflows.progress(workspace, editor, editor, {
        ...(await progressInput()),
        checkedIds: ['unknown'],
      }),
    );
    await denied(async () =>
      workflows.progress(workspace, editor, editor, {
        ...(await progressInput()),
        evidence: [
          {
            requirementId: 'creative',
            value: 'https://user:password@example.com',
          },
        ],
      }),
    );
    await workflows.progress(workspace, editor, editor, await progressInput());
    await denied(async () =>
      workflows.progress(workspace, editor, editor, {
        ...(await progressInput()),
        workflowRevision: 0,
      }),
    );
    assert.equal(
      (await readTask(taskId)).details.state,
      'PLANNED',
      'Completed requirements cannot automatically submit or approve work.',
    );
    await runner.manager
      .getRepository(DeliveryProjectEntity)
      .update({ id: project.id }, { memberIds: [editor, outsider] });
    const observer = await readWorkflow(taskId, outsider);
    assert.equal(observer.canEdit, false);
    assert(
      observer.workflow,
      'A permitted project member can read the pinned version context.',
    );
    await denied(async () =>
      workflows.progress(workspace, outsider, outsider, await progressInput()),
    );
    await runner.manager
      .getRepository(DeliveryProjectEntity)
      .update({ id: project.id }, { memberIds: [editor] });
    await assert.rejects(
      workflows.task({ ...workspace, id: randomUUID() }, editor, editor, {
        taskId,
      }),
    );
    const prepared = await readWorkflow(taskId);
    assert.deepEqual(prepared.missingRequirements, []);
    assert.equal(prepared.canEdit, true);
    const changed = structuredClone(starter);
    changed.name = 'Static ad quality v2';
    changed.checklist.push({
      id: 'new-check',
      label: 'New required check',
      required: true,
    });
    changed.reviewChecks.push({
      id: 'new-review',
      label: 'New quality criterion',
      required: true,
    });
    published = await workflows.save(workspace, founder, founder, {
      ...publish,
      revision: 1,
      definition: changed,
      reason: 'Updated future service quality requirements',
    });
    assert.equal(
      published.templates.find((item) => item.id === templateId).current
        .version,
      2,
    );
    assert.deepEqual(
      (await readWorkflow(taskId)).workflow.definition,
      starter,
      'Publishing must not rewrite active tasks.',
    );
    const versions = (
      await workflows.catalog(workspace, founder, founder, { templateId })
    ).versions;
    assert.deepEqual(
      versions.find((item) => item.version === 1),
      versionOne,
    );
    await submit();
    task = await readTask(taskId);
    assert.deepEqual(task.details.submissions[0].workflow.definition, starter);
    await denied(async () =>
      workflows.progress(workspace, editor, editor, await progressInput()),
    );
    await denied(() =>
      delivery.command(workspace, editor, editor, {
        action: 'review',
        taskId,
        revision: task.revision,
        decision: 'APPROVED',
        feedback: 'Self approval',
        workflowReview: {
          checkedIds: starter.reviewChecks.map((item) => item.id),
        },
      }),
    );
    await denied(() =>
      delivery.command(workspace, founder, founder, {
        action: 'review',
        taskId,
        revision: task.revision,
        decision: 'APPROVED',
        feedback: 'Missing confirmations',
      }),
    );
    const approve = async () => {
      const current = await readTask(taskId);
      await delivery.command(workspace, founder, founder, {
        action: 'review',
        taskId,
        revision: current.revision,
        decision: 'APPROVED',
        feedback: 'Independent evidence and quality review',
        workflowReview: {
          checkedIds: current.details.workflow.definition.reviewChecks.map(
            (item) => item.id,
          ),
        },
      });
    };
    await approve();
    assert.equal((await readWorkflow(taskId)).locked, true);
    const periodId = randomUUID(),
      lineId = randomUUID();
    await commitments.savePeriod(workspace, founder, founder, {
      id: periodId,
      engagementId: engagement.id,
      revision: 0,
      label: 'Workflow commitment',
      startDate: '2026-10-01',
      endDateExclusive: '2026-11-01',
      timezone: 'Asia/Qatar',
      reason: 'Synthetic scope',
    });
    await commitments.saveLine(workspace, founder, founder, {
      id: lineId,
      engagementId: engagement.id,
      periodId,
      periodRevision: 1,
      revision: 0,
      label: 'One static work item',
      unit: 'OTHER',
      promisedQuantity: 1,
      reason: 'One agreed item',
    });
    await commitments.assignTask(workspace, founder, founder, {
      engagementId: engagement.id,
      periodId,
      lineId,
      lineRevision: 1,
      periodRevision: 1,
      taskId,
      taskRevision: (await readTask(taskId)).revision,
      revision: 0,
      parentTaskId: null,
      reason: 'Link independently approved task',
    });
    await operations.command(workspace, founder, founder, {
      action: 'delivered',
      taskId,
      revision: (await readTask(taskId)).revision,
      note: 'Delivered for fulfilment',
    });
    let operationsRecord = await runner.manager
      .getRepository(DeliveryOperationsEntity)
      .findOneBy({ workspaceId: workspace.id });
    let fulfilment = operationsRecord.state.fulfilments.find(
      (item) => item.taskId === taskId,
    );
    await operations.command(workspace, founder, founder, {
      action: 'fulfilment',
      taskId,
      cycle: fulfilment.cycle,
      historyLength: fulfilment.history.length,
      decision: 'FULFILLED',
      note: 'Confirmed no objection',
    });
    const credits = () =>
      commitments.snapshot(workspace, founder, founder, {
        engagementId: engagement.id,
        periodId,
      });
    assert.equal((await credits()).lines[0].fulfilledQuantity, 1);
    const applyVersionTwo = {
      ...applyInput,
      taskRevision: (await readTask(taskId)).revision,
      templateRevision: 2,
      version: 2,
      reason: 'Apply improved requirements to reopened work',
    };
    await denied(() =>
      workflows.apply(workspace, founder, founder, {
        ...applyVersionTwo,
        templateRevision: 1,
      }),
    );
    await denied(() =>
      workflows.apply(workspace, founder, founder, applyVersionTwo),
    );
    await workflows.apply(workspace, founder, founder, {
      ...applyVersionTwo,
      reopen: true,
    });
    assert.equal((await readTask(taskId)).details.state, 'CHANGES_REQUESTED');
    const [workflowRevision] = await runner.query('SELECT source,reason FROM core."deliveryRevision" WHERE "taskId"=$1 ORDER BY round DESC LIMIT 1',[taskId]);
    assert.equal(workflowRevision.source,'WORKFLOW_REOPEN');assert.equal(workflowRevision.reason,applyVersionTwo.reason);
    assert.equal((await credits()).lines[0].fulfilledQuantity, 0);
    const replaced = await readWorkflow(taskId);
    assert.deepEqual(replaced.previousApplications[0].definition, starter);
    assert.deepEqual(
      replaced.previousApplications[0].checkedIds,
      prepared.workflow.checkedIds,
    );
    assert.deepEqual(replaced.workflow.checkedIds, []);
    assert.deepEqual(
      (await readTask(taskId)).details.submissions[0].workflow.definition,
      starter,
    );
    await workflows.progress(workspace, editor, editor, await progressInput());
    await submit();
    await approve();
    const approved = await readTask(taskId);
    await workflows.apply(workspace, founder, founder, {
      ...applyVersionTwo,
      taskRevision: approved.revision,
      reopen: true,
      reason: 'Explicitly reopen the same pinned version',
    });
    assert.equal((await readTask(taskId)).details.state, 'CHANGES_REQUESTED');
    assert.equal((await readWorkflow(taskId)).previousApplications.length, 2);
    const firstPage = await readWorkflow(taskId, editor, { limit: 1 });
    assert(firstPage.nextHistoryCursor);
    const secondPage = await readWorkflow(taskId, editor, {
      limit: 1,
      historyCursor: firstPage.nextHistoryCursor,
    });
    assert.equal(secondPage.previousApplications.length, 1);
    assert.equal(secondPage.nextHistoryCursor, null);
    await assert.rejects(
      readWorkflow(taskId, editor, { historyCursor: 'invalid' }),
    );
    await workflows.archive(workspace, founder, founder, {
      id: templateId,
      revision: 2,
      archived: true,
      reason: 'Pause new work using this workflow',
    });
    assert.equal(
      (await catalog()).templates.find((item) => item.id === templateId)
        .stateReason,
      'Pause new work using this workflow',
    );
    await workflows.progress(workspace, editor, editor, await progressInput());
    assert.equal(
      (await readWorkflow(taskId)).missingRequirements.length,
      0,
      'Existing pinned work can continue while its template is archived.',
    );
    const beforeCreate = await runner.manager
      .getRepository(DeliveryTaskEntity)
      .countBy({ workspaceId: workspace.id, projectId: project.id });
    await denied(() =>
      create(`Archived template ${randomUUID()}`, { templateId, version: 1 }),
    );
    assert.equal(
      await runner.manager
        .getRepository(DeliveryTaskEntity)
        .countBy({ workspaceId: workspace.id, projectId: project.id }),
      beforeCreate,
      'Rejected new task must roll back the native/core task and activity.',
    );
    await workflows.archive(workspace, founder, founder, {
      id: templateId,
      revision: 3,
      archived: false,
      reason: 'Restore future use',
    });
    const pinnedTask = await create(`Pinned old version ${randomUUID()}`, {
      templateId,
      version: 1,
    });
    assert.deepEqual(
      (await readWorkflow(pinnedTask)).workflow.definition,
      starter,
    );
    const legacyTask = await create(`Legacy task ${randomUUID()}`);
    await submit(legacyTask);
    await delivery.command(workspace, founder, founder, {
      action: 'review',
      taskId: legacyTask,
      revision: (await readTask(legacyTask)).revision,
      decision: 'APPROVED',
      feedback: 'Legacy review unchanged',
    });
    operationsRecord = await runner.manager
      .getRepository(DeliveryOperationsEntity)
      .findOneBy({ workspaceId: workspace.id });
    operationsRecord.state.templates = [];
    operationsRecord.state.enabled = true;
    operationsRecord.state.telegramEnabled = false;
    await runner.manager
      .getRepository(DeliveryOperationsEntity)
      .save(operationsRecord);
    const now = new Date('2026-10-25T10:00:00Z');
    await operations.command(
      workspace,
      founder,
      founder,
      {
        action: 'template',
        template: {
          projectId: project.id,
          workflow: { templateId, version: 1 },
          fields: {
            ...fields,
            title: 'Pinned recurring workflow',
            checklist: [],
          },
          frequency: 'DAILY',
          weekdays: [1],
          monthDay: 1,
          time: '09:00',
          startDate: '2026-10-25',
          endDate: null,
          paused: false,
          dueHours: 24,
        },
      },
      now,
    );
    await operations.tickWorkspace(workspace, now);
    operationsRecord = await runner.manager
      .getRepository(DeliveryOperationsEntity)
      .findOneBy({ workspaceId: workspace.id });
    const schedule = operationsRecord.state.templates[0];
    assert(schedule.lastTaskId);
    assert.deepEqual(
      (await readWorkflow(schedule.lastTaskId)).workflow.definition,
      starter,
    );
    await operations.tickWorkspace(workspace, now);
    assert.equal(
      (
        await runner.manager
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId: workspace.id })
      ).state.templates[0].lastTaskId,
      schedule.lastTaskId,
      'A workflow pin cannot duplicate scheduled tasks.',
    );
    await workflows.archive(workspace, founder, founder, {
      id: templateId,
      revision: 4,
      archived: true,
      reason: 'Stop new scheduled applications',
    });
    const beforeTick = await runner.manager
      .getRepository(DeliveryTaskEntity)
      .countBy({ workspaceId: workspace.id, projectId: project.id });
    await operations.tickWorkspace(workspace, new Date('2026-10-26T10:00:00Z'));
    assert.equal(
      await runner.manager
        .getRepository(DeliveryTaskEntity)
        .countBy({ workspaceId: workspace.id, projectId: project.id }),
      beforeTick,
    );
    assert.match(
      (
        await runner.manager
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId: workspace.id })
      ).state.templates[0].error,
      /workflow/i,
    );
    const rollbackId = randomUUID();
    failAfterWrite = true;
    await assert.rejects(
      workflows.save(workspace, founder, founder, {
        ...publish,
        id: rollbackId,
      }),
      /Synthetic commitment write failure/,
    );
    assert(!(await catalog()).templates.some((item) => item.id === rollbackId));
    const beforeRead = await readTask(taskId),
      activityBefore = await activities();
    await readWorkflow(taskId);
    await catalog();
    assert.deepEqual(await readTask(taskId), beforeRead);
    assert.deepEqual(
      await activities(),
      activityBefore,
      'Reads do not create activity or update work.',
    );
    await runner.manager
      .getRepository(DeliveryProjectEntity)
      .update({ id: project.id }, { memberIds: [] });
    await denied(() => readWorkflow(taskId));
    await runner.manager
      .getRepository(DeliveryProjectEntity)
      .update({ id: project.id }, { memberIds: [editor] });
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.get(founder),
    ]);
    await assert.rejects(catalog());
    await denied(() =>
      workflows.archive(workspace, founder, founder, {
        id: templateId,
        revision: 5,
        archived: false,
        reason: 'Disabled actor must fail',
      }),
    );
    console.log(
      'PASS workflow versioning, starter definitions, task/submission snapshots, scoped access, required evidence and independent review, explicit reopen/commitment reversal, archive, pinned recurrence, pagination, read-only and atomic rollback acceptance.',
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

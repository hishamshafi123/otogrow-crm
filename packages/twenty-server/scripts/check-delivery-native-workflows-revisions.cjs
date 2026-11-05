const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  originalDigest,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const { createFixture } = require('./check-delivery-reconciliation.cjs');
const {
  seedCurrentWorkFixture,
  syntheticCurrentWork,
} = require('./check-otogrow-activity-current-work-support.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryNativeTaskAccessService,
} = require('../dist/modules/delivery/delivery-native-task-access.service');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryWorkflowsService,
} = require('../dist/modules/delivery/workflows/delivery-workflows.service');
const {
  DeliveryRevisionsService,
} = require('../dist/modules/delivery/revisions/delivery-revisions.service');
const {
  DeliveryOperationsService,
} = require('../dist/modules/delivery/operations/delivery-operations.service');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
const {
  DeliveryRevisionEntity,
} = require('../dist/modules/delivery/revisions/entities/delivery-revision.entity');
const {
  DeliveryWorkflowTemplateEntity,
} = require('../dist/modules/delivery/workflows/entities/delivery-workflow-template.entity');
const {
  DeliveryWorkflowVersionEntity,
} = require('../dist/modules/delivery/workflows/entities/delivery-workflow-version.entity');
const {
  DeliveryWorkflowArchiveEntity,
} = require('../dist/modules/delivery/workflows/entities/delivery-workflow-archive.entity');
const {
  DeliveryCommitmentPeriodEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-period.entity');
const {
  DeliveryCommitmentLineEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-line.entity');
const {
  DeliveryCommitmentAllocationEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-allocation.entity');

const unavailableInfrastructure = new Proxy(
  {},
  {
    get: (_target, method) => () => {
      throw new Error(
        `No provider, storage, message or queue call is allowed: ${String(method)}`,
      );
    },
  },
);

async function main() {
  assert.equal(process.argv.length, 2, 'No persistent or live mode exists.');
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'This rollback proof is local only.',
  );
  let runner, original, schema;
  const checks = [];
  try {
    await connectionSource.initialize();
    original = await originalDigest((...args) =>
      connectionSource.query(...args),
    );
    schema = await schemaFingerprint(connectionSource);
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const manager = runner.manager;
    const fixture = await createFixture(manager, 'native_flow_rollback');
    await seedCurrentWorkFixture(manager, fixture);
    await manager.query(
      `ALTER TABLE "${fixture.schemaName}".task ADD COLUMN status text NOT NULL DEFAULT 'TODO', ADD COLUMN "createdAt" timestamptz NOT NULL DEFAULT now(), ADD COLUMN "updatedAt" timestamptz NOT NULL DEFAULT now()`,
    );
    const { admin, reader, writer, secondWriter, outsider } = fixture.people;
    for (const [roleId, capabilities] of [
      [fixture.roles.reader, ['delivery.manage']],
      [fixture.roles.writer, []],
      [fixture.roles.secondWriter, ['finance.manage']],
    ])
      await manager.query(
        'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
        [roleId, capabilities],
      );
    const visible = fixture.currentTasks.staleBackup;
    const locked = fixture.currentTasks.activeBackup;
    const hidden = fixture.currentTasks.hidden;
    const revision = 50;
    const now = new Date('2020-02-22T12:00:00.000Z');
    const templateId = randomUUID();
    const definition = {
      name: 'FIXTURE permitted service requirements',
      description: 'FIXTURE exact immutable requirements',
      service: 'CUSTOM',
      definitionOfDone: 'Independent reviewer verifies the submitted evidence.',
      checklist: [
        { id: 'check-product', label: 'Check product', required: true },
      ],
      evidence: [
        {
          id: 'source',
          label: 'Evidence',
          instructions: 'Explain the source',
          kind: 'TEXT',
          required: true,
        },
      ],
      reviewChecks: [
        { id: 'independent', label: 'Independent check', required: true },
      ],
    };
    const applied = {
      templateId,
      version: 1,
      revision: 1,
      definition,
      checkedIds: [],
      evidence: [],
      appliedAt: '2020-02-19T10:00:00.000Z',
      appliedBy: admin.memberId,
      appliedByName: 'FIXTURE manager',
    };
    for (const [key, taskId] of Object.entries(fixture.currentTasks)) {
      const approved = [locked, hidden].includes(taskId);
      const creativeDocument = newCreativeDocument();
      creativeDocument.brief.concept = `FIXTURE ${key} private creative concept`;
      await manager.query(
        'UPDATE core."deliveryTask" SET details=$2,revision=$3 WHERE "workspaceId"=$4 AND "taskId"=$1',
        [
          taskId,
          {
            brief: `FIXTURE ${key} private brief`,
            service: 'Design',
            priority: 'NORMAL',
            scheduledDate: null,
            reviewerId: reader.memberId,
            state: approved ? 'APPROVED' : 'IN_PROGRESS',
            blocker: '',
            checklist: [],
            evidence: [],
            submissions: [
              {
                version: 1,
                submittedBy: writer.memberId,
                submittedAt: '2020-02-20T10:00:00.000Z',
                description: 'FIXTURE exact evidence',
                evidence: [],
                decision: 'APPROVED',
                reviewedBy: reader.memberId,
                reviewedAt: '2020-02-20T11:00:00.000Z',
              },
            ],
            events: [],
            workflow: structuredClone(applied),
            creative: creativeDocument,
          },
          revision,
          fixture.workspaceId,
        ],
      );
      await manager.query(
        `UPDATE "${fixture.schemaName}".task SET status=$2 WHERE id=$1`,
        [taskId, approved ? 'DONE' : 'IN_PROGRESS'],
      );
    }
    await manager.getRepository(DeliveryWorkflowTemplateEntity).insert({
      id: templateId,
      workspaceId: fixture.workspaceId,
      revision: 2,
      currentVersion: 2,
      archived: false,
      stateReason: '',
    });
    for (const version of [1, 2])
      await manager.getRepository(DeliveryWorkflowVersionEntity).insert({
        workspaceId: fixture.workspaceId,
        templateId,
        version,
        definition: {
          ...definition,
          name: `FIXTURE requirements version ${version}`,
        },
        publishedBy: admin.memberId,
        publishedByName: 'FIXTURE manager',
        reason: 'FIXTURE published requirements',
        createdAt: new Date(`2020-02-${17 + version}T09:00:00.000Z`),
      });
    for (const taskId of [visible, hidden])
      for (let version = 1; version <= 3; version++)
        await manager.getRepository(DeliveryWorkflowArchiveEntity).insert({
          workspaceId: fixture.workspaceId,
          taskId,
          snapshot: {
            ...structuredClone(applied),
            revision: version,
            appliedByName: `FIXTURE archived manager ${version}`,
          },
          createdAt: new Date(`2020-02-${10 + version}T09:00:00.000Z`),
        });
    const rounds = {};
    for (const [taskId, count] of [
      [visible, 22],
      [locked, 2],
      [hidden, 2],
    ]) {
      rounds[taskId] = [];
      for (let round = 1; round <= count; round++) {
        const row = await manager.getRepository(DeliveryRevisionEntity).save({
          workspaceId: fixture.workspaceId,
          taskId,
          projectId: fixture.projects.first,
          round,
          taskRevision: round,
          submissionVersion: 1,
          source: 'INTERNAL_REVIEW',
          reason: `FIXTURE private revision ${round}`,
          cause: 'INTERNAL_DEFECT',
          effortMinutes: 10,
          internalCost: 100,
          proposedCharge: 0,
          currency: 'USD',
          revision: 1,
          createdAt: new Date('2020-02-20T12:00:00.000Z'),
        });
        rounds[taskId].push(row.id);
      }
    }
    const periodId = randomUUID(),
      lineId = randomUUID();
    const [project] = await manager.query(
      'SELECT "companyId" FROM core."deliveryProject" WHERE id=$1',
      [fixture.projects.first],
    );
    await manager.getRepository(DeliveryCommitmentPeriodEntity).insert({
      id: periodId,
      workspaceId: fixture.workspaceId,
      engagementId: randomUUID(),
      projectId: fixture.projects.first,
      clientId: project.companyId,
      label: 'FIXTURE retained delivery credit',
      billing: 'RETAINER',
      startDate: '2020-02-01',
      endDateExclusive: '2020-03-01',
      timezone: 'UTC',
      state: 'ACTIVE',
      revision: 1,
    });
    await manager.getRepository(DeliveryCommitmentLineEntity).insert({
      id: lineId,
      workspaceId: fixture.workspaceId,
      periodId,
      label: 'FIXTURE unique creative',
      unit: 'UNIQUE_VIDEO',
      promisedQuantity: 1,
      revision: 1,
    });
    await manager.getRepository(DeliveryCommitmentAllocationEntity).insert({
      workspaceId: fixture.workspaceId,
      periodId,
      lineId,
      taskId: locked,
      taskName: 'FIXTURE retained task name',
      parentTaskId: null,
      state: 'FULFILLED',
      revision: 1,
      creditedCycle: 1,
      creditedSubmissionVersion: 1,
      fulfilledAt: new Date('2020-02-21T10:00:00.000Z'),
    });
    const operationsState = newDeliveryOperations();
    operationsState.fulfilments.push({
      taskId: locked,
      status: 'FULFILLED',
      deliveredAt: '2020-02-20T12:00:00.000Z',
      deliveredSubmissionVersion: 1,
      nextCheckAt: null,
      cycle: 1,
      history: [
        {
          at: '2020-02-20T12:00:00.000Z',
          actorId: admin.memberId,
          action: 'DELIVERED',
          note: 'FIXTURE delivered version',
        },
        {
          at: '2020-02-21T10:00:00.000Z',
          actorId: admin.memberId,
          action: 'FULFILLED',
          note: 'FIXTURE confirmed version',
        },
      ],
    });
    operationsState.notices.push({
      id: randomUUID(),
      taskId: locked,
      recipientId: admin.memberId,
      senderId: reader.memberId,
      kind: 'FULFILMENT',
      text: 'FIXTURE pending check',
      createdAt: '2020-02-20T12:00:00.000Z',
      remindAt: '2020-02-20T12:05:00.000Z',
      seenAt: null,
      acknowledgedAt: null,
      cancelled: false,
      sendState: 'PENDING',
      attemptedAt: null,
      error: null,
    });
    await manager
      .getRepository(DeliveryOperationsEntity)
      .save({ workspaceId: fixture.workspaceId, state: operationsState });
    const source = {
      manager,
      query: (...args) => manager.query(...args),
      getRepository: (entity) => manager.getRepository(entity),
      transaction: (operation) => manager.transaction(operation),
    };
    const access = new OtogrowAccessService(source, {
      userHasWorkspaceSettingPermission: async ({
        workspaceId,
        userWorkspaceId,
      }) =>
        workspaceId === fixture.workspaceId &&
        userWorkspaceId === admin.userWorkspaceId,
    });
    const native = syntheticCurrentWork(access, fixture);
    const metadata = native.native;
    for (const [name, type] of [
      ['status', 'TEXT'],
      ['createdAt', 'DATE_TIME'],
    ]) {
      const id = randomUUID();
      metadata.taskFields.push({
        ...metadata.taskFields[1],
        id,
        universalIdentifier: id,
        name,
        type,
      });
      metadata.taskObject.fieldIds.push(id);
      metadata.taskObject.fieldUniversalIdentifiers.push(id);
    }
    metadata.data.flatFieldMetadataMaps = metadata.maps([
      ...metadata.taskFields,
      ...metadata.memberFields,
    ]);
    const permission = () =>
      metadata.data.rolesPermissions[fixture.nativeRoleId][
        metadata.taskObject.id
      ];
    permission().canUpdateObjectRecords = true;
    const adapter = new DeliveryNativeTaskAccessService(
      native.workspaceOrm,
      native.cache,
    );
    const delivery = new DeliveryService(source, access, adapter);
    const creative = new DeliveryCreativeService(
      source,
      delivery,
      unavailableInfrastructure,
      adapter,
    );
    const workflows = new DeliveryWorkflowsService(source, delivery, adapter);
    const revisions = new DeliveryRevisionsService(source, delivery, adapter);
    const operations = new DeliveryOperationsService(
      source,
      delivery,
      creative,
      unavailableInfrastructure,
      unavailableInfrastructure,
      unavailableInfrastructure,
      adapter,
    );
    const call = (
      service,
      method,
      input,
      person = admin,
      workspace = fixture.workspace,
    ) =>
      service[method](
        workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
        now,
      );
    const workflowInput = (taskId = visible, overrides = {}) => ({
      taskId,
      taskRevision: revision,
      templateId,
      templateRevision: 2,
      version: 2,
      reopen: taskId === locked,
      reason: 'FIXTURE exact workflow change',
      ...overrides,
    });
    const progressInput = (overrides = {}) => ({
      taskId: visible,
      taskRevision: revision,
      workflowRevision: 1,
      checkedIds: ['check-product'],
      evidence: [
        { requirementId: 'source', value: 'FIXTURE reviewed product evidence' },
      ],
      ...overrides,
    });
    const revisionInput = (taskId = visible, overrides = {}) => ({
      taskId,
      id: rounds[taskId][0],
      revision: 1,
      cause: 'CLIENT_PREFERENCE',
      effortMinutes: 25,
      ...overrides,
    });
    const taskRow = (taskId = locked) =>
      manager
        .getRepository(DeliveryTaskEntity)
        .findOneByOrFail({ workspaceId: fixture.workspaceId, taskId });
    const nativeRow = async (taskId = locked) =>
      (
        await manager.query(
          `SELECT * FROM "${fixture.schemaName}".task WHERE id=$1`,
          [taskId],
        )
      )[0];
    const operationsRow = () =>
      manager
        .getRepository(DeliveryOperationsEntity)
        .findOneByOrFail({ workspaceId: fixture.workspaceId });
    const setWaiting = async () => {
      const record = await operationsRow();
      const current = record.state.fulfilments[0];
      current.status = 'WAITING';
      current.cycle = 2;
      current.nextCheckAt = '2020-02-23T00:00:00.000Z';
      current.history.push({
        at: '2020-02-22T12:00:00.000Z',
        actorId: admin.memberId,
        action: 'DELIVERED',
        note: 'FIXTURE redelivery awaiting confirmation',
      });
      await manager.getRepository(DeliveryOperationsEntity).save(record);
      await manager
        .getRepository(DeliveryCommitmentAllocationEntity)
        .update(
          { workspaceId: fixture.workspaceId, taskId: locked },
          { state: 'REOPENED' },
        );
      return current;
    };
    const fulfilmentInput = (decision, current) => ({
      action: 'fulfilment',
      taskId: locked,
      cycle: current.cycle,
      historyLength: current.history.length,
      decision,
      note: 'FIXTURE exact fulfilment response',
    });
    const mutationDigest = async () => {
      const result = [];
      for (const table of [
        'deliveryTask',
        'deliveryWorkflowTemplate',
        'deliveryWorkflowVersion',
        'deliveryWorkflowArchive',
        'deliveryRevision',
        'deliveryOperations',
        'deliveryReminderOutbox',
        'deliveryReviewAssignment',
        'deliveryReviewAssignmentEvent',
        'deliveryCommitmentPeriod',
        'deliveryCommitmentLine',
        'deliveryCommitmentAllocation',
        'deliveryCommitmentEvent',
        'otogrowActivityEvent',
      ]) {
        const [row] = await manager.query(
          `SELECT count(*)::text AS count,md5(COALESCE(string_agg(md5(to_jsonb(record)::text),'' ORDER BY md5(to_jsonb(record)::text)),'')) AS hash FROM core."${table}" record WHERE "workspaceId"=$1`,
          [fixture.workspaceId],
        );
        result.push({ table, ...row });
      }
      const [nativeRows] = await manager.query(
        `SELECT md5(COALESCE(string_agg(md5(to_jsonb(record)::text),'' ORDER BY id),'')) AS hash FROM "${fixture.schemaName}".task record`,
      );
      return JSON.stringify([...result, nativeRows]);
    };
    const deniedUnchanged = async (
      operation,
      pattern = (failure) => [400, 403, 404, 409].includes(failure.status),
    ) => {
      const before = await mutationDigest();
      await assert.rejects(operation, pattern);
      assert.equal(
        await mutationDigest(),
        before,
        'Denied action changed native/core task, workflow, revision, fulfilment, commitment, notice or audit evidence.',
      );
    };
    const check = async (name, operation) => {
      await manager.query('SAVEPOINT native_flow_case');
      const originalData = structuredClone(metadata.data);
      try {
        await operation();
        checks.push(name);
      } finally {
        await manager.query('ROLLBACK TO SAVEPOINT native_flow_case');
        await manager.query('RELEASE SAVEPOINT native_flow_case');
        for (const key of Object.keys(metadata.data))
          metadata.data[key] = originalData[key];
        native.state.changingHash = false;
      }
    };
    const restrictField = (name, values) => {
      permission().restrictedFields[
        metadata.taskFields.find((field) => field.name === name).id
      ] = values;
    };
    const statusPredicate = () => {
      const predicate =
        metadata.data.flatRowLevelPermissionPredicateMaps.byUniversalIdentifier[
          metadata.predicate.universalIdentifier
        ];
      const status = metadata.taskFields.find(
        (field) => field.name === 'status',
      );
      Object.assign(predicate, {
        fieldMetadataId: status.id,
        fieldMetadataUniversalIdentifier: status.universalIdentifier,
        operand: 'CONTAINS',
        value: 'DONE',
      });
    };
    const reopening = [
      {
        name: 'Workflow reopen',
        source: 'WORKFLOW_REOPEN',
        prepare: async () => undefined,
        run: () => call(workflows, 'apply', workflowInput(locked)),
      },
      {
        name: 'Creative reopen',
        source: 'CREATIVE_REOPEN',
        prepare: async () => undefined,
        run: () =>
          call(creative, 'command', {
            action: 'reopen',
            taskId: locked,
            revision,
            notes: 'FIXTURE reopen creative evidence',
          }),
      },
      {
        name: 'Fulfilment REDOING',
        source: 'CLIENT_REDO',
        prepare: setWaiting,
        run: (current) =>
          call(operations, 'command', fulfilmentInput('REDOING', current)),
      },
    ];

    await check(
      'Exact workflow/history and revision paging expose only the freshly permitted task',
      async () => {
        const first = await call(workflows, 'task', {
          taskId: visible,
          limit: 1,
        });
        assert.equal(first.workflow.revision, 1);
        assert.equal(first.previousApplications.length, 1);
        assert(first.nextHistoryCursor);
        const next = await call(workflows, 'task', {
          taskId: visible,
          limit: 1,
          historyCursor: first.nextHistoryCursor,
        });
        assert.notEqual(
          next.previousApplications[0].revision,
          first.previousApplications[0].revision,
        );
        const revisionsFirst = await call(revisions, 'snapshot', {
          taskId: visible,
        });
        assert.equal(revisionsFirst.total, 22);
        assert.equal(revisionsFirst.rounds.length, 20);
        assert.equal(revisionsFirst.nextBeforeRound, 3);
        const revisionsNext = await call(revisions, 'snapshot', {
          taskId: visible,
          beforeRound: 3,
        });
        assert.deepEqual(
          revisionsNext.rounds.map((row) => row.round),
          [2, 1],
        );
        for (const taskId of [hidden, fixture.currentTasks.deleted]) {
          await deniedUnchanged(() => call(workflows, 'task', { taskId }));
          await deniedUnchanged(() => call(revisions, 'snapshot', { taskId }));
        }
        await deniedUnchanged(() =>
          call(workflows, 'apply', workflowInput(hidden, { reopen: true })),
        );
        await deniedUnchanged(() =>
          call(revisions, 'save', revisionInput(hidden)),
        );
      },
    );
    await check(
      'Object read denial blocks all exact workflow and revision reads/writes with no effects',
      async () => {
        permission().canReadObjectRecords = false;
        for (const operation of [
          () => call(workflows, 'task', { taskId: visible }),
          () => call(workflows, 'apply', workflowInput()),
          () => call(workflows, 'progress', progressInput()),
          () => call(revisions, 'snapshot', { taskId: visible }),
          () => call(revisions, 'save', revisionInput()),
        ])
          await deniedUnchanged(operation);
      },
    );
    await check(
      'Required native assignee field denial blocks workflow but title restrictions do not overrestrict core-only facts',
      async () => {
        restrictField('assigneeId', { canRead: false, canUpdate: true });
        await deniedUnchanged(() =>
          call(workflows, 'task', { taskId: visible }),
        );
        await deniedUnchanged(() =>
          call(workflows, 'progress', progressInput()),
        );
        assert.equal(
          (await call(revisions, 'snapshot', { taskId: visible })).total,
          22,
        );
        delete permission().restrictedFields[
          metadata.taskFields.find((field) => field.name === 'assigneeId').id
        ];
        restrictField('title', { canRead: false, canUpdate: true });
        assert.equal(
          (await call(workflows, 'task', { taskId: visible })).taskId,
          visible,
        );
        assert.equal(
          (await call(revisions, 'snapshot', { taskId: visible })).total,
          22,
        );
      },
    );
    await check(
      'Cross-project, mismatched membership, tenant and removed member remain denied',
      async () => {
        await deniedUnchanged(() =>
          call(
            workflows,
            'task',
            { taskId: fixture.currentTasks.otherProject },
            secondWriter,
          ),
        );
        await deniedUnchanged(() =>
          call(
            revisions,
            'snapshot',
            { taskId: fixture.currentTasks.otherProject },
            secondWriter,
          ),
        );
        await deniedUnchanged(() =>
          workflows.task(
            fixture.workspace,
            reader.memberId,
            writer.userWorkspaceId,
            { taskId: visible },
          ),
        );
        await deniedUnchanged(() =>
          call(
            revisions,
            'snapshot',
            { taskId: visible },
            admin,
            fixture.foreignWorkspace,
          ),
        );
        await manager.query(
          'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
          [reader.userWorkspaceId],
        );
        await deniedUnchanged(() =>
          call(workflows, 'task', { taskId: visible }, reader),
        );
        await deniedUnchanged(() =>
          call(revisions, 'snapshot', { taskId: visible }, reader),
        );
      },
    );
    await check(
      'Native metadata disagreement fails closed without losing persisted evidence',
      async () => {
        native.state.changingHash = true;
        native.state.hashReads = 0;
        await deniedUnchanged(() =>
          call(workflows, 'task', { taskId: visible }),
        );
        native.state.hashReads = 0;
        await deniedUnchanged(() => call(revisions, 'save', revisionInput()));
      },
    );
    await check(
      'Workflow archive cursor is bound to current identity and native policy with explicit legacy recovery',
      async () => {
        const first = await call(workflows, 'task', {
          taskId: visible,
          limit: 1,
        });
        const input = {
          taskId: visible,
          historyCursor: first.nextHistoryCursor,
          limit: 1,
        };
        await deniedUnchanged(
          () => call(workflows, 'task', input, reader),
          /page|cursor|access/i,
        );
        permission().canUpdateObjectRecords = false;
        await deniedUnchanged(
          () => call(workflows, 'task', input),
          /page|cursor|access/i,
        );
        const legacy = Buffer.from(
          JSON.stringify({
            workspaceId: fixture.workspaceId,
            taskId: visible,
            at: '2020-02-13T09:00:00.000Z',
            id: randomUUID(),
          }),
        ).toString('base64url');
        await deniedUnchanged(
          () => call(workflows, 'task', { ...input, historyCursor: legacy }),
          /page|cursor|access/i,
        );
        assert.equal(
          (await call(workflows, 'task', { taskId: visible, limit: 1 }))
            .previousApplications.length,
          1,
        );
      },
    );
    await check(
      'Task-free template catalog and management remain available without native Task read',
      async () => {
        permission().canReadObjectRecords = false;
        assert.equal(
          (await call(workflows, 'catalog', {})).templates.length,
          1,
        );
        const created = await call(workflows, 'save', {
          id: randomUUID(),
          revision: 0,
          definition,
          reason: 'FIXTURE task-free template change',
        });
        assert.equal(created.templates.length, 2);
        await deniedUnchanged(() => call(workflows, 'catalog', {}, writer));
      },
    );
    await check(
      'Native read-only access permits unlocked workflow application and assignee evidence progress',
      async () => {
        permission().canUpdateObjectRecords = false;
        const nativeBefore = await nativeRow(visible);
        const appliedResult = await call(
          workflows,
          'apply',
          workflowInput(),
          reader,
        );
        assert.equal(appliedResult.workflow.version, 2);
        assert.equal(appliedResult.canManage, true);
        const progressed = await call(
          workflows,
          'progress',
          progressInput({ taskRevision: revision + 1, workflowRevision: 2 }),
          writer,
        );
        assert.deepEqual(progressed.workflow.checkedIds, ['check-product']);
        assert.equal(
          progressed.workflow.evidence[0].value,
          'FIXTURE reviewed product evidence',
        );
        assert.deepEqual(await nativeRow(visible), nativeBefore);
        const lockedResult = await call(
          workflows,
          'task',
          { taskId: locked },
          reader,
        );
        assert.equal(lockedResult.locked, true);
        assert.equal(lockedResult.canManage, false);
        assert.equal(lockedResult.canEdit, false);
        await deniedUnchanged(() =>
          call(workflows, 'apply', workflowInput(locked), reader),
        );
      },
    );
    await check(
      'Manager and assignee business responsibilities remain enforced for core-only workflow edits',
      async () => {
        await deniedUnchanged(() =>
          call(workflows, 'apply', workflowInput(), writer),
        );
        await deniedUnchanged(() =>
          call(workflows, 'progress', progressInput(), secondWriter),
        );
        await deniedUnchanged(() =>
          call(workflows, 'progress', progressInput({ taskId: locked })),
        );
        await deniedUnchanged(() =>
          call(revisions, 'save', revisionInput(), writer),
        );
      },
    );
    await check(
      'Native read-only classification and separate finance-only correction preserve field authority',
      async () => {
        permission().canUpdateObjectRecords = false;
        const nativeBefore = await nativeRow(visible);
        await call(revisions, 'save', revisionInput(), reader);
        const nonFinancial = await call(
          revisions,
          'snapshot',
          { taskId: visible },
          reader,
        );
        assert(
          nonFinancial.rounds.every(
            (row) => row.internalCost === null && row.currency === null,
          ),
        );
        await deniedUnchanged(
          () =>
            call(
              revisions,
              'save',
              revisionInput(visible, {
                revision: 2,
                internalCost: 250,
                currency: 'USD',
              }),
              reader,
            ),
          /finance|permission/i,
        );
        await call(
          revisions,
          'save',
          revisionInput(visible, {
            revision: 2,
            internalCost: 250,
            proposedCharge: 30,
            currency: 'USD',
          }),
          secondWriter,
        );
        await deniedUnchanged(
          () =>
            call(
              revisions,
              'save',
              revisionInput(visible, {
                revision: 3,
                cause: 'SCOPE_CHANGE',
                internalCost: 300,
              }),
              secondWriter,
            ),
          /manager|classify/i,
        );
        assert.deepEqual(await nativeRow(visible), nativeBefore);
        const [event] = await manager.query(
          'SELECT "actorId","actorType" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND action=\'REVISION_UPDATED\' ORDER BY "occurredAt" DESC,id DESC LIMIT 1',
          [fixture.workspaceId],
        );
        assert(event);
        assert.equal(event.actorType, 'HUMAN');
      },
    );
    for (const route of reopening) {
      await check(
        `${route.name}: object and status-field update denial leave all task/audit/commitment state unchanged`,
        async () => {
          const current = await route.prepare();
          permission().canUpdateObjectRecords = false;
          await deniedUnchanged(() => route.run(current));
          permission().canUpdateObjectRecords = true;
          restrictField('status', { canRead: true, canUpdate: false });
          await deniedUnchanged(() => route.run(current));
        },
      );
      await check(
        `${route.name}: post-write row exclusion rolls back its exact revision and adjacent state`,
        async () => {
          const current = await route.prepare();
          statusPredicate();
          await adapter.assert(
            manager,
            fixture.workspace,
            admin,
            locked,
            ['id', 'assigneeId'],
            { type: 'update', updatedColumns: ['status'] },
          );
          await deniedUnchanged(
            () => route.run(current),
            /task|unavailable|access|permission/i,
          );
          assert.equal((await nativeRow()).status, 'DONE');
          assert.equal((await taskRow()).details.state, 'APPROVED');
        },
      );
      await check(
        `${route.name}: allowed current manager reopens once with attributable retained history`,
        async () => {
          const current = await route.prepare();
          await route.run(current);
          const changed = await taskRow();
          assert.equal(changed.revision, revision + 1);
          assert.equal(changed.details.state, 'CHANGES_REQUESTED');
          assert.equal(changed.details.submissions.at(-1).decision, 'APPROVED');
          assert.equal((await nativeRow()).status, 'IN_PROGRESS');
          const latest = await manager
            .getRepository(DeliveryRevisionEntity)
            .findOne({
              where: { workspaceId: fixture.workspaceId, taskId: locked },
              order: { round: 'DESC' },
            });
          assert.equal(latest.source, route.source);
          assert.equal(latest.round, 3);
          const [event] = await manager.query(
            'SELECT "actorId","actorType" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "taskId"=$2 AND action=\'REVISION_OPENED\'',
            [fixture.workspaceId, locked],
          );
          assert.equal(event.actorId, admin.memberId);
          assert.equal(event.actorType, 'HUMAN');
          const allocation = await manager
            .getRepository(DeliveryCommitmentAllocationEntity)
            .findOneByOrFail({
              workspaceId: fixture.workspaceId,
              taskId: locked,
            });
          assert.equal(allocation.state, 'REOPENED');
          if (route.source === 'CLIENT_REDO') {
            const record = await operationsRow();
            assert.equal(record.state.fulfilments[0].status, 'REDOING');
            assert.equal(record.state.fulfilments[0].nextCheckAt, null);
            assert(record.state.notices.every((notice) => notice.cancelled));
          }
          await deniedUnchanged(
            () => route.run(current),
            /changed|refresh|cycle|already|revision/i,
          );
        },
      );
    }
    await check(
      'Native read-only managers can answer ordinary fulfilment checks without writing native status',
      async () => {
        permission().canUpdateObjectRecords = false;
        const current = await setWaiting();
        const nativeBefore = await nativeRow();
        await call(
          operations,
          'command',
          fulfilmentInput('NOT_FULFILLED', current),
        );
        let record = await operationsRow();
        assert.equal(record.state.fulfilments[0].status, 'WAITING');
        assert.equal(
          record.state.fulfilments[0].nextCheckAt,
          '2020-02-23T00:00:00.000Z',
        );
        await call(
          operations,
          'command',
          fulfilmentInput('FULFILLED', record.state.fulfilments[0]),
        );
        record = await operationsRow();
        assert.equal(record.state.fulfilments[0].status, 'FULFILLED');
        assert.deepEqual(await nativeRow(), nativeBefore);
        const allocation = await manager
          .getRepository(DeliveryCommitmentAllocationEntity)
          .findOneByOrFail({
            workspaceId: fixture.workspaceId,
            taskId: locked,
          });
        assert.equal(allocation.state, 'FULFILLED');
        assert.equal(allocation.creditedCycle, 2);
      },
    );
    await check(
      'Retained finance totals remain complete after native denial/deletion and contain no private task projections',
      async () => {
        const input = { startDate: '2020-02-01', endDate: '2020-02-29' };
        const before = await call(revisions, 'costs', input, secondWriter);
        assert.equal(
          before.groups.reduce((sum, group) => sum + group.rounds, 0),
          26,
        );
        assert.equal(
          before.groups.reduce((sum, group) => sum + group.recordedCost, 0),
          2600,
        );
        permission().canReadObjectRecords = false;
        await deniedUnchanged(() =>
          call(revisions, 'snapshot', { taskId: visible }, secondWriter),
        );
        await manager.query(
          `UPDATE "${fixture.schemaName}".task SET "deletedAt"=now()`,
        );
        const after = await call(revisions, 'costs', input, secondWriter);
        assert.deepEqual(after, before);
        for (const group of after.groups)
          assert.deepEqual(
            Object.keys(group).sort(),
            [
              'projectId',
              'projectName',
              'cause',
              'currency',
              'rounds',
              'missingCostCount',
              'missingEffortCount',
              'recordedCost',
              'proposedCharges',
              'recordedEffortMinutes',
            ].sort(),
          );
        assert(!JSON.stringify(after).includes('private revision'));
        await deniedUnchanged(
          () => call(revisions, 'costs', input, reader),
          /finance|access/i,
        );
        await deniedUnchanged(
          () => call(revisions, 'costs', input, outsider),
          /finance|access|permission/i,
        );
      },
    );
    await runner.rollbackTransaction();
  } finally {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
    try {
      if (connectionSource.isInitialized && original)
        assert.equal(
          await originalDigest((...args) => connectionSource.query(...args)),
          original,
          'Original database rows changed.',
        );
      if (connectionSource.isInitialized && schema)
        assert.equal(
          await schemaFingerprint(connectionSource),
          schema,
          'Original schema changed.',
        );
    } finally {
      if (connectionSource.isInitialized) await connectionSource.destroy();
    }
  }
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        checks: checks.length,
        evidence: checks,
        preservation:
          'Actual Workflow/Revision/Creative/Operations/Delivery/Access services, native permission engine and PostgreSQL with isolated in-memory metadata cache. Every fixture row and schema change rolled back; full originals/schema preserved. No provider, message, storage, shared-cache or external request. One serialized connection; no cross-session race claim.',
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

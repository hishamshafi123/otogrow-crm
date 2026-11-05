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
  DeliveryTasksService,
} = require('../dist/modules/delivery/tasks/delivery-tasks.service');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryCreativeReadsService,
} = require('../dist/modules/delivery/creative/reads/delivery-creative-reads.service');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');

async function main() {
  assert.equal(process.argv.length, 2);
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
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
    const fixture = await createFixture(manager, 'native_access_rollback');
    await seedCurrentWorkFixture(manager, fixture);
    await manager.query(
      `ALTER TABLE "${fixture.schemaName}".task ADD COLUMN status text NOT NULL DEFAULT 'TODO', ADD COLUMN "createdAt" timestamptz NOT NULL DEFAULT now(), ADD COLUMN "updatedAt" timestamptz NOT NULL DEFAULT now()`,
    );
    await manager.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, ['delivery.manage']],
    );
    for (const [key, taskId] of Object.entries(fixture.currentTasks)) {
      const creative = newCreativeDocument();
      creative.brief.concept = `FIXTURE ${key} private concept`;
      const details = {
        brief: `FIXTURE ${key} delivery brief`,
        service: key === 'hidden' ? 'PRIVATE_HIDDEN_SERVICE' : 'Design',
        priority: 'NORMAL',
        scheduledDate: null,
        reviewerId: fixture.people.reader.memberId,
        state: 'PLANNED',
        blocker: '',
        checklist: [],
        evidence: [],
        submissions: [],
        events: [],
        creative,
      };
      await manager.query(
        'UPDATE core."deliveryTask" SET details=$2 WHERE "taskId"=$1',
        [taskId, details],
      );
    }
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
        userWorkspaceId === fixture.people.admin.userWorkspaceId,
    });
    const native = syntheticCurrentWork(access, fixture);
    const metadata = native.native;
    for (const [name, type] of [
      ['status', 'TEXT'],
      ['createdAt', 'DATE_TIME'],
    ]) {
      const id = randomUUID();
      const field = {
        ...metadata.taskFields[1],
        id,
        universalIdentifier: id,
        name,
        type,
      };
      metadata.taskFields.push(field);
      metadata.taskObject.fieldIds.push(id);
      metadata.taskObject.fieldUniversalIdentifiers.push(id);
    }
    metadata.data.flatFieldMetadataMaps = metadata.maps([
      ...metadata.taskFields,
      ...metadata.memberFields,
    ]);
    const permission =
      metadata.data.rolesPermissions[fixture.nativeRoleId][
        metadata.taskObject.id
      ];
    permission.canUpdateObjectRecords = true;
    const adapter = new DeliveryNativeTaskAccessService(
      native.workspaceOrm,
      native.cache,
    );
    const delivery = new DeliveryService(source, access, adapter);
    const forbidden = new Proxy(
      {},
      {
        get: (_target, key) => () => {
          throw new Error(`Unexpected provider/operation: ${String(key)}`);
        },
      },
    );
    const tasks = new DeliveryTasksService(
      source,
      delivery,
      access,
      forbidden,
      adapter,
    );
    const creative = new DeliveryCreativeService(
      source,
      delivery,
      forbidden,
      adapter,
    );
    const creativeReads = new DeliveryCreativeReadsService(
      source,
      delivery,
      adapter,
    );
    const admin = fixture.people.admin;
    const visible = fixture.currentTasks.inProgress;
    const hidden = fixture.currentTasks.hidden;
    const call = (service, method, input, person = admin) =>
      service[method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
        manager,
      );
    const snapshot = () =>
      delivery.snapshot(
        fixture.workspace,
        admin.memberId,
        admin.userWorkspaceId,
        manager,
      );
    const listInput = {
      view: 'PLANNER',
      timezone: 'Asia/Qatar',
      projectId: fixture.projects.first,
      limit: 50,
    };
    const fields = (title = 'Visible FIXTURE created task') => ({
      title,
      brief: 'FIXTURE native-authorized brief',
      service: 'Design',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: fixture.people.writer.memberId,
      reviewerId: fixture.people.reader.memberId,
      checklist: [],
      evidence: [],
    });
    const create = (actor, title) =>
      manager.transaction((transaction) =>
        delivery.command(
          fixture.workspace,
          admin.memberId,
          admin.userWorkspaceId,
          {
            action: 'create',
            projectId: fixture.projects.first,
            fields: fields(title),
          },
          transaction,
          actor,
        ),
      );
    const edit = (title) =>
      manager.transaction((transaction) =>
        delivery.command(
          fixture.workspace,
          admin.memberId,
          admin.userWorkspaceId,
          {
            action: 'edit',
            taskId: visible,
            revision: 1,
            fields: fields(title),
          },
          transaction,
        ),
      );
    const comment = (taskId = visible, actor) =>
      manager.transaction((transaction) =>
        delivery.command(
          fixture.workspace,
          admin.memberId,
          admin.userWorkspaceId,
          {
            action: 'comment',
            taskId,
            revision: 1,
            text: 'FIXTURE native-authorized note',
          },
          transaction,
          actor,
        ),
      );
    const digest = () => originalDigest((...args) => manager.query(...args));
    const check = async (name, operation) => {
      await operation();
      checks.push(name);
    };
    const rejectsUnchanged = async (operation) => {
      const before = await digest();
      await assert.rejects(operation, (error) =>
        /native|task|access|permission|changed|membership/i.test(error.message),
      );
      assert.equal(
        await digest(),
        before,
        'A denied operation changed database rows.',
      );
    };
    const isolated = async (operation) => {
      await manager.query('SAVEPOINT native_case');
      const originalData = structuredClone(metadata.data);
      try {
        await operation();
      } finally {
        await manager.query('ROLLBACK TO SAVEPOINT native_case');
        await manager.query('RELEASE SAVEPOINT native_case');
        for (const key of Object.keys(metadata.data))
          metadata.data[key] = originalData[key];
        native.state.changingHash = false;
      }
    };
    const currentPermission = () =>
      metadata.data.rolesPermissions[fixture.nativeRoleId][
        metadata.taskObject.id
      ];

    await check(
      'Actual legacy snapshot excludes native-RLS-hidden and deleted task details',
      async () => {
        const result = await snapshot();
        assert.equal(result.tasks.length, 7);
        assert(
          !JSON.stringify(result).includes('PRIVATE_NATIVE_RLS_HIDDEN_TASK'),
        );
        assert(
          !result.tasks.some(
            (task) =>
              task.id === hidden || task.id === fixture.currentTasks.deleted,
          ),
        );
      },
    );
    await check(
      'Canonical list counts, facets and rows all use the same native row policy',
      async () => {
        const result = await call(tasks, 'list', listInput);
        assert.equal(result.totalCount, 6);
        assert.equal(result.items.length, 6);
        assert(!result.serviceOptions.includes('PRIVATE_HIDDEN_SERVICE'));
        assert(!result.items.some((task) => task.id === hidden));
      },
    );
    await check(
      'Creative list and exact details enforce native visibility',
      async () => {
        const result = await call(creativeReads, 'tasks', {
          projectId: fixture.projects.first,
          limit: 50,
        });
        assert.equal(result.totalCount, 6);
        assert.equal(result.items.length, 6);
        assert.equal(
          (await call(tasks, 'detail', { taskId: visible })).task.id,
          visible,
        );
        assert.equal(
          (await call(creativeReads, 'detail', { taskId: visible })).task.id,
          visible,
        );
        for (const [service, method, input] of [
          [tasks, 'detail', { taskId: hidden }],
          [creativeReads, 'detail', { taskId: hidden }],
          [creative, 'read', hidden],
        ])
          await rejectsUnchanged(() => call(service, method, input));
      },
    );
    await check(
      'A known hidden task cannot be changed even by an Otogrow administrator',
      () => rejectsUnchanged(() => comment(hidden)),
    );
    await check(
      'Native object-read denial closes legacy, canonical and Creative routes with no effects',
      () =>
        isolated(async () => {
          currentPermission().canReadObjectRecords = false;
          for (const operation of [
            snapshot,
            () => call(tasks, 'list', listInput),
            () => call(tasks, 'detail', { taskId: visible }),
            () => call(creativeReads, 'tasks', {}),
            () => call(creative, 'read', visible),
            () => comment(),
          ])
            await rejectsUnchanged(operation);
        }),
    );
    await check(
      'Native title-field denial blocks all routes that select title',
      () =>
        isolated(async () => {
          currentPermission().restrictedFields[
            metadata.taskFields.find((field) => field.name === 'title').id
          ] = { canRead: false, canUpdate: false };
          for (const operation of [
            snapshot,
            () => call(tasks, 'detail', { taskId: visible }),
            () => call(creativeReads, 'tasks', {}),
            () => comment(),
          ])
            await rejectsUnchanged(operation);
          assert((await call(creative, 'read', visible)).document);
        }),
    );
    await check(
      'Native update denial blocks direct writes and delegated SYSTEM or CLIENT attribution',
      () =>
        isolated(async () => {
          currentPermission().canUpdateObjectRecords = false;
          for (const actor of [
            undefined,
            { actorType: 'SYSTEM', actorId: null },
            { actorType: 'CLIENT', actorId: null },
          ]) {
            await rejectsUnchanged(() => create(actor));
            await rejectsUnchanged(() => comment(visible, actor));
          }
          await creative.modify(
            fixture.workspace,
            fixture.people.writer.memberId,
            fixture.people.writer.userWorkspaceId,
            visible,
            1,
            (document) => {
              document.brief.concept =
                'FIXTURE authorized core-only creative edit';
            },
            'FIXTURE core-only creative edit',
          );
          const [row] = await manager.query(
            `SELECT status FROM "${fixture.schemaName}".task WHERE id=$1`,
            [visible],
          );
          assert.equal(row.status, 'TODO');
        }),
    );
    await check(
      'Native status-field update denial blocks status-writing task actions',
      () =>
        isolated(async () => {
          currentPermission().restrictedFields[
            metadata.taskFields.find((field) => field.name === 'status').id
          ] = { canRead: true, canUpdate: false };
          await rejectsUnchanged(() => comment());
          await rejectsUnchanged(() => create());
        }),
    );
    await check(
      'An edit leaving the permitted native row set rolls back task, detail and audit changes',
      () => rejectsUnchanged(() => edit('PRIVATE_OUTSIDE_PERMITTED_ROW')),
    );
    await check(
      'A newly created task outside native row policy is rolled back',
      () =>
        rejectsUnchanged(() =>
          create(undefined, 'PRIVATE_OUTSIDE_PERMITTED_ROW'),
        ),
    );
    await check(
      'Allowed human and delegated creates preserve accurate audit attribution',
      () =>
        isolated(async () => {
          for (const actor of [
            undefined,
            { actorType: 'SYSTEM', actorId: null },
            { actorType: 'CLIENT', actorId: null },
          ]) {
            const id = await create(actor);
            const [event] = await manager.query(
              'SELECT "actorType","actorId" FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "taskId"=$2 AND action=\'TASK_CREATED\'',
              [fixture.workspaceId, id],
            );
            assert.equal(event.actorType, actor?.actorType ?? 'HUMAN');
            assert.equal(event.actorId, actor ? null : admin.memberId);
          }
        }),
    );
    await check(
      'Canonical and Creative pagination reject a cursor after current native policy changes',
      () =>
        isolated(async () => {
          const list = await call(tasks, 'list', { ...listInput, limit: 1 });
          const production = await call(creativeReads, 'tasks', {
            projectId: fixture.projects.first,
            limit: 1,
          });
          assert(list.nextCursor && production.nextCursor);
          const predicate = Object.values(
            metadata.data.flatRowLevelPermissionPredicateMaps
              .byUniversalIdentifier,
          )[0];
          predicate.value = 'Visible FIXTURE';
          await rejectsUnchanged(() =>
            call(tasks, 'list', {
              ...listInput,
              limit: 1,
              after: list.nextCursor,
            }),
          );
          await rejectsUnchanged(() =>
            call(creativeReads, 'tasks', {
              projectId: fixture.projects.first,
              limit: 1,
              after: production.nextCursor,
            }),
          );
        }),
    );
    await check(
      'Native role cache disagreement fails closed without mutating or recomputing shared cache',
      () =>
        isolated(async () => {
          metadata.data.userWorkspaceRoleMap[admin.userWorkspaceId] =
            randomUUID();
          await rejectsUnchanged(snapshot);
        }),
    );
    await check('A changing native cache hash fails closed', () =>
      isolated(async () => {
        native.state.changingHash = true;
        native.state.hashReads = 0;
        await rejectsUnchanged(snapshot);
      }),
    );
    await check('Revoked active membership blocks task reads and writes', () =>
      isolated(async () => {
        await manager.query(
          'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
          [admin.userWorkspaceId],
        );
        await rejectsUnchanged(snapshot);
        await rejectsUnchanged(() => comment());
      }),
    );
    await runner.rollbackTransaction();
  } finally {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
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
    if (connectionSource.isInitialized) await connectionSource.destroy();
  }
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        checks: checks.length,
        evidence: checks,
        preservation:
          'All fixture data/schema rolled back; original data/schema preserved. Real native context and policy helpers; isolated metadata cache; no shared cache writes or provider calls.',
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

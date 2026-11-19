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
const {
  DATE,
  seed,
  harness,
  mutationDigest,
  noPrivateProjection,
} = require('./check-delivery-native-commitments-support.cjs');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
const {
  DeliveryCommitmentEventEntity,
} = require('../dist/modules/delivery/commitments/entities/delivery-commitment-event.entity');
const {
  syncDeliveryCommitment,
} = require('../dist/modules/delivery/commitments/record-delivery-commitment');

async function main() {
  assert.equal(process.argv.length, 2, 'No persistent or live mode exists.');
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
    const fixture = await seed(manager);
    const source = {
      manager,
      query: (...args) => manager.query(...args),
      getRepository: (entity) => manager.getRepository(entity),
      transaction: (operation) => manager.transaction(operation),
    };
    const test = harness(source, fixture);
    const {
      metadata,
      native,
      read,
      call,
      permission,
      cleanupInput,
      assignInput,
      removeInput,
      allocation,
    } = test;
    const { reader, writer, admin, outsider } = fixture.people;
    const denied = async (
      operation,
      expected = (error) =>
        [400, 403, 404, 409].includes(error?.status ?? error?.getStatus?.()),
    ) => {
      const before = await mutationDigest(manager, fixture);
      await assert.rejects(operation, expected);
      assert.equal(
        await mutationDigest(manager, fixture),
        before,
        'Denied operation changed a task, allocation, fulfilment, notice or audit.',
      );
    };
    const check = async (name, operation) => {
      await manager.query('SAVEPOINT native_commitment_case');
      const prior = structuredClone(metadata.data);
      try {
        await operation();
        checks.push(name);
      } finally {
        await manager.query('ROLLBACK TO SAVEPOINT native_commitment_case');
        await manager.query('RELEASE SAVEPOINT native_commitment_case');
        for (const key of Object.keys(metadata.data))
          metadata.data[key] = prior[key];
        native.state.changingHash = false;
        native.state.hashReads = 0;
      }
    };
    const operations = async () =>
      (
        await manager
          .getRepository(DeliveryOperationsEntity)
          .findOneByOrFail({ workspaceId: fixture.workspaceId })
      ).state;
    const portal = async () =>
      test.commitments.portalSummary(
        fixture.workspace,
        fixture.engagement,
        await operations(),
        manager,
      );
    const task = (key) =>
      manager.getRepository(DeliveryTaskEntity).findOneByOrFail({
        workspaceId: fixture.workspaceId,
        taskId: fixture.tasks[key],
      });
    const events = () =>
      manager.getRepository(DeliveryCommitmentEventEntity).find({
        where: { workspaceId: fixture.workspaceId },
        order: { id: 'ASC' },
      });
    const restrict = (field) => {
      permission().restrictedFields[
        metadata.taskFields.find((item) => item.name === field).id
      ] = { canRead: false, canUpdate: false };
    };
    const totals = (snapshot) =>
      snapshot.lines.map((line) => ({
        id: line.id,
        promisedQuantity: line.promisedQuantity,
        assignedQuantity: line.assignedQuantity,
        fulfilledQuantity: line.fulfilledQuantity,
        remainingQuantity: line.remainingQuantity,
        overdeliveredQuantity: line.overdeliveredQuantity,
      }));
    const expectedOrphans = new Set(
      ['deleted', 'moved', 'missing'].map((key) => fixture.allocations[key]),
    );

    await check(
      'Native row privacy, hidden parent redaction, retained-history filtering and complete quantities',
      async () => {
        const snapshot = await read();
        assert.equal(snapshot.taskDetailsAvailable, true);
        assert.deepEqual(
          new Set(snapshot.allocations.map((row) => row.taskId)),
          new Set(
            ['visible', 'second', 'child'].map((key) => fixture.tasks[key]),
          ),
        );
        assert.equal(
          snapshot.allocations.find((row) => row.taskId === fixture.tasks.child)
            .parentTaskId,
          null,
        );
        assert.deepEqual(
          new Set(snapshot.history.map((row) => row.id)),
          new Set([fixture.events.taskFree, fixture.events.visible]),
        );
        assert.deepEqual(
          new Set(snapshot.orphanAllocations.map((row) => row.allocationId)),
          expectedOrphans,
        );
        const unique = snapshot.lines.find(
          (line) => line.id === fixture.lineIds.unique,
        );
        assert.equal(unique.assignedQuantity, 7);
        assert.equal(unique.fulfilledQuantity, 2);
        assert.equal(
          snapshot.lines.find((line) => line.id === fixture.lineIds.variation)
            .assignedQuantity,
          1,
        );
        noPrivateProjection(snapshot, fixture);
        const prior = totals(snapshot);
        metadata.data.flatRowLevelPermissionPredicateMaps = metadata.maps([]);
        const broad = await read();
        assert(
          broad.allocations.some((row) => row.taskId === fixture.tasks.hidden),
        );
        assert.deepEqual(totals(broad), prior);
        assert(!JSON.stringify(await portal()).includes(fixture.tasks.hidden));
      },
    );

    await check(
      'Expected native object denial preserves complete contract/portal totals and task-free work',
      async () => {
        const before = await read();
        const publicBefore = await portal();
        permission().canReadObjectRecords = false;
        const snapshot = await read({
          selectedTaskId: fixture.tasks.visible,
          selectedParentTaskId: fixture.tasks.hidden,
        });
        assert.equal(snapshot.taskDetailsAvailable, false);
        assert.deepEqual(snapshot.allocations, []);
        assert.deepEqual(snapshot.taskOptions, []);
        assert.equal(snapshot.selectedTask, null);
        assert.equal(snapshot.selectedParent, null);
        assert.equal(snapshot.nextAllocationCursor, null);
        assert.deepEqual(
          snapshot.history.map((row) => row.id),
          [fixture.events.taskFree],
        );
        assert.deepEqual(totals(snapshot), totals(before));
        assert.deepEqual(await portal(), publicBefore);
        assert.deepEqual(
          new Set(snapshot.orphanAllocations.map((row) => row.allocationId)),
          expectedOrphans,
        );
        await call('saveLine', {
          id: fixture.lineIds.other,
          engagementId: fixture.engagementId,
          periodId: fixture.periodId,
          periodRevision: 3,
          revision: 2,
          label: 'FIXTURE task-free revised line',
          unit: 'OTHER',
          promisedQuantity: 21,
          reason: 'FIXTURE independently authorized contract edit',
        });
        assert.equal(
          (await read()).lines.find((line) => line.id === fixture.lineIds.other)
            .promisedQuantity,
          21,
        );
        await denied(() => call('assignTask', assignInput()));
        await denied(() => call('removeTask', removeInput()));
        metadata.data.rolesPermissions[fixture.nativeRoleId] = {};
        assert.equal(
          (await read()).taskDetailsAvailable,
          false,
          'A present empty role permission set is a legitimate denial, not a missing context.',
        );
      },
    );

    await check(
      'Title-field denial is expected but unselected native fields do not over-restrict contracts',
      async () => {
        restrict('title');
        const deniedRead = await read();
        assert.equal(deniedRead.taskDetailsAvailable, false);
        noPrivateProjection(deniedRead, fixture, Object.keys(fixture.tasks));
        delete permission().restrictedFields[
          metadata.taskFields.find((item) => item.name === 'title').id
        ];
        restrict('assigneeId');
        restrict('dueAt');
        assert.equal((await read()).taskDetailsAvailable, true);
        await call('assignTask', assignInput());
      },
    );

    await check(
      'Exact selected values do not depend on search-page membership and never echo denied IDs',
      async () => {
        const selected = await read({
          taskSearch: 'NO_MATCHING_FIXTURE',
          selectedTaskId: fixture.tasks.visible,
          selectedParentTaskId: fixture.tasks.hidden,
        });
        assert.deepEqual(selected.taskOptions, []);
        assert.equal(selected.selectedTask.taskId, fixture.tasks.visible);
        assert.equal(selected.selectedParent, null);
        noPrivateProjection(selected, fixture);
        const other = await read({
          selectedTaskId: fixture.tasks.moved,
          selectedParentTaskId: fixture.tasks.deleted,
        });
        assert.equal(other.selectedTask, null);
        assert.equal(other.selectedParent, null);
      },
    );

    await check(
      'Hidden allocation/history rows are filtered before paging and choice search limits',
      async () => {
        const rows = [];
        for (let index = 0; index < 230; index++)
          rows.push({
            taskId: randomUUID(),
            allocationId: randomUUID(),
            eventId: randomUUID(),
            visible: index >= 125,
            title:
              index >= 125
                ? `Visible BULK ${String(index).padStart(3, '0')}`
                : `PRIVATE_HIDDEN_BULK_${index}`,
          });
        await manager.query(
          `INSERT INTO "${fixture.schemaName}".task(id,title,"assigneeId") SELECT "taskId",title,$2::uuid FROM jsonb_to_recordset($1::jsonb) AS r("taskId" uuid,title text)`,
          [JSON.stringify(rows), writer.memberId],
        );
        await manager.query(
          'INSERT INTO core."deliveryTask"("workspaceId","taskId","projectId",details,revision) SELECT $2,"taskId",$3,\'{"state":"PLANNED","submissions":[]}\'::jsonb,7 FROM jsonb_to_recordset($1::jsonb) AS r("taskId" uuid)',
          [JSON.stringify(rows), fixture.workspaceId, fixture.projects.first],
        );
        await manager.query(
          'INSERT INTO core."deliveryCommitmentAllocation"(id,"workspaceId","periodId","lineId","taskId","taskName",state,revision) SELECT "allocationId",$2,$3,$4,"taskId",title,\'ASSIGNED\',1 FROM jsonb_to_recordset($1::jsonb) AS r("allocationId" uuid,"taskId" uuid,title text)',
          [
            JSON.stringify(rows),
            fixture.workspaceId,
            fixture.periodId,
            fixture.lineIds.unique,
          ],
        );
        await manager.query(
          'INSERT INTO core."deliveryCommitmentEvent"(id,"workspaceId","periodId","actorType","actorName",action,"taskId","taskName",reason,changes,"createdAt") SELECT "eventId",$2,$3,\'HUMAN\',\'FIXTURE manager\',\'COMMITMENT_TASK_ASSIGNED\',"taskId",title,title,\'[]\'::jsonb,CASE WHEN visible THEN \'2020-02-22\'::timestamptz ELSE \'2020-02-23\'::timestamptz END FROM jsonb_to_recordset($1::jsonb) AS r("eventId" uuid,"taskId" uuid,title text,visible boolean)',
          [JSON.stringify(rows), fixture.workspaceId, fixture.periodId],
        );
        let cursor = null;
        const ids = new Set();
        do {
          const snapshot = await read({ limit: 7, allocationCursor: cursor });
          assert.equal(
            snapshot.allocations.length,
            Math.min(7, 108 - ids.size),
          );
          for (const allocation of snapshot.allocations) {
            assert(!ids.has(allocation.taskId));
            ids.add(allocation.taskId);
          }
          assert(!JSON.stringify(snapshot).includes('PRIVATE_HIDDEN_BULK_'));
          cursor = snapshot.nextAllocationCursor;
        } while (cursor);
        assert.equal(ids.size, 108);
        const firstHistory = await read({ limit: 7 });
        assert.equal(firstHistory.history.length, 7);
        assert(firstHistory.nextHistoryCursor);
        assert(
          firstHistory.history.every((event) =>
            event.taskName.startsWith('Visible BULK'),
          ),
        );
        const choices = await read();
        assert.equal(choices.taskOptions.length, 100);
        assert.equal(choices.moreTaskOptions, true);
        const selectedTaskId = rows.at(-1).taskId;
        const exact = await read({
          taskSearch: 'NO_MATCHING_FIXTURE',
          selectedTaskId,
        });
        assert.equal(exact.selectedTask.taskId, selectedTaskId);
        const hiddenSearch = await read({ taskSearch: 'PRIVATE_HIDDEN_BULK' });
        assert.deepEqual(hiddenSearch.taskOptions, []);
        assert.equal(hiddenSearch.moreTaskOptions, false);
        assert.equal(
          hiddenSearch.lines.find((line) => line.id === fixture.lineIds.unique)
            .assignedQuantity,
          237,
        );
      },
    );

    await check(
      'Cursors bind exact identity, period and native policy with explicit first-page recovery',
      async () => {
        const first = await read({ limit: 1 });
        assert(
          first.nextAllocationCursor &&
            first.nextHistoryCursor &&
            first.nextOrphanAllocationCursor,
        );
        for (const [name, cursor] of [
          ['allocationCursor', first.nextAllocationCursor],
          ['historyCursor', first.nextHistoryCursor],
        ]) {
          await denied(() => read({ [name]: cursor }, admin));
          await denied(() =>
            read({ periodId: fixture.otherPeriodId, [name]: cursor }),
          );
        }
        metadata.data.flatRowLevelPermissionPredicateMaps = metadata.maps([]);
        await denied(
          () => read({ allocationCursor: first.nextAllocationCursor }),
          /changed|first|refresh/i,
        );
        await denied(
          () => read({ historyCursor: first.nextHistoryCursor }),
          /changed|first|refresh/i,
        );
        assert(
          (await read()).allocations.some(
            (row) => row.taskId === fixture.tasks.hidden,
          ),
        );
        const legacy = Buffer.from(
          JSON.stringify({
            version: 1,
            workspaceId: fixture.workspaceId,
            periodId: fixture.periodId,
            kind: 'allocations',
            id: fixture.allocations.visible,
          }),
        ).toString('base64url');
        await denied(
          () => read({ allocationCursor: legacy }),
          /first|refresh|cursor/i,
        );
      },
    );

    await check(
      'Read-only native permissions allow authorized OS allocation writes with real attribution',
      async () => {
        assert.equal(permission().canUpdateObjectRecords, false);
        const nativeBefore = await manager.query(
          `SELECT * FROM "${fixture.schemaName}".task ORDER BY id`,
        );
        await call('assignTask', assignInput());
        await call('removeTask', removeInput());
        assert.deepEqual(
          await manager.query(
            `SELECT * FROM "${fixture.schemaName}".task ORDER BY id`,
          ),
          nativeBefore,
        );
        const newEvents = (await events()).filter(
          (event) => !Object.values(fixture.events).includes(event.id),
        );
        assert(newEvents.length >= 3);
        assert(
          newEvents.every(
            (event) =>
              event.actorId === reader.memberId && event.actorType === 'HUMAN',
          ),
        );
        await denied(() =>
          call(
            'assignTask',
            assignInput('hidden', { lineId: fixture.lineIds.other }),
          ),
        );
        await denied(() =>
          call(
            'assignTask',
            assignInput('unallocated', {
              lineId: fixture.lineIds.variation,
              parentTaskId: fixture.tasks.hidden,
            }),
          ),
        );
        await denied(() => call('removeTask', removeInput('hidden')));
        await denied(() => call('removeTask', removeInput('deleted')));
        await denied(() =>
          call('assignTask', assignInput('unallocated'), writer),
        );
      },
    );

    await check(
      'Manager orphan discovery is bounded, redacted and independent of native task permission',
      async () => {
        permission().canReadObjectRecords = false;
        const first = await read({ limit: 1 });
        assert.equal(first.orphanAllocations.length, 1);
        assert(first.nextOrphanAllocationCursor);
        const ids = [first.orphanAllocations[0].allocationId];
        let cursor = first.nextOrphanAllocationCursor;
        while (cursor) {
          const page = await read({ limit: 1, orphanAllocationCursor: cursor });
          assert.equal(page.orphanAllocations.length, 1);
          ids.push(page.orphanAllocations[0].allocationId);
          noPrivateProjection(page, fixture, Object.keys(fixture.tasks));
          cursor = page.nextOrphanAllocationCursor;
        }
        assert.deepEqual(new Set(ids), expectedOrphans);
        assert.deepEqual((await read({}, writer)).orphanAllocations, []);
        await denied(() =>
          call('removeOrphanAllocation', cleanupInput(), writer),
        );
        await denied(() =>
          call('removeOrphanAllocation', cleanupInput('hidden')),
        );
        await denied(() =>
          call('removeOrphanAllocation', cleanupInput('visible')),
        );
        await denied(() =>
          call('removeOrphanAllocation', cleanupInput('unknown')),
        );
      },
    );

    for (const key of ['missing', 'deleted', 'moved'])
      await check(
        `Exact ${key} cleanup conserves contract quantities and records one safe historical receipt`,
        async () => {
          const input = cleanupInput(key);
          const before = await read();
          const nativeBefore = await manager.query(
            `SELECT * FROM "${fixture.schemaName}".task ORDER BY id`,
          );
          const pending = await call('orphanCleanupReceipt', input);
          assert.equal(pending.state, 'NOT_FOUND');
          assert.equal(pending.removedAllocationRevision, null);
          const saved = await call('removeOrphanAllocation', input);
          assert.equal(saved.state, 'REMOVED');
          assert.equal(saved.requestId, input.requestId);
          assert.equal(saved.allocationId, input.allocationId);
          assert.equal(saved.requestedAllocationRevision, 4);
          assert.equal(saved.removedAllocationRevision, 5);
          assert(saved.occurredAt);
          assert.equal((await allocation(key)).state, 'REMOVED');
          assert.equal((await allocation(key)).revision, 5);
          assert.deepEqual(await call('removeOrphanAllocation', input), saved);
          assert.deepEqual(await call('orphanCleanupReceipt', input), saved);
          assert.deepEqual(await call('cancelOrphanCleanup', input), saved);
          const after = await read();
          const priorLine = before.lines.find(
            (line) => line.id === fixture.lineIds.unique,
          );
          const nextLine = after.lines.find(
            (line) => line.id === fixture.lineIds.unique,
          );
          assert.equal(
            nextLine.assignedQuantity,
            priorLine.assignedQuantity - 1,
          );
          assert.equal(nextLine.fulfilledQuantity, priorLine.fulfilledQuantity);
          assert.equal(nextLine.promisedQuantity, priorLine.promisedQuantity);
          assert.deepEqual(
            await manager.query(
              `SELECT * FROM "${fixture.schemaName}".task ORDER BY id`,
            ),
            nativeBefore,
          );
          const [event] = await manager.query(
            'SELECT * FROM core."deliveryCommitmentEvent" WHERE id=$1',
            [input.requestId],
          );
          assert.equal(event.action, 'COMMITMENT_ORPHAN_REMOVED');
          assert.equal(event.taskId, null);
          assert.equal(event.taskName, null);
          assert.equal(event.actorId, reader.memberId);
          const activities = await manager.query(
            'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1',
            [fixture.workspaceId],
          );
          assert.equal(activities.length, 1);
          assert.equal(activities[0].taskId, null);
          assert.equal(activities[0].actorId, reader.memberId);
          assert.equal(activities[0].actorType, 'HUMAN');
          assert.equal(activities[0].sourceId, fixture.engagementId);
          noPrivateProjection([saved, event, activities, after], fixture);
        },
      );

    await check(
      'Cleanup exact replay/receipt is actor and body bound, survives closed periods and never proves another request',
      async () => {
        const input = cleanupInput();
        const saved = await call('removeOrphanAllocation', input);
        for (const changed of [
          { allocationRevision: 3 },
          { periodRevision: 2 },
          { allocationId: fixture.allocations.missing },
          { periodId: fixture.otherPeriodId },
        ]) {
          await denied(() =>
            call('removeOrphanAllocation', { ...input, ...changed }),
          );
          await denied(() =>
            call('orphanCleanupReceipt', { ...input, ...changed }),
          );
        }
        await denied(() => call('orphanCleanupReceipt', input, admin));
        await denied(() =>
          call('removeOrphanAllocation', {
            ...input,
            requestId: fixture.events.visible,
          }),
        );
        const other = await call('orphanCleanupReceipt', {
          ...input,
          requestId: randomUUID(),
        });
        assert.equal(other.state, 'NOT_FOUND');
        await manager.query(
          'UPDATE core."deliveryCommitmentPeriod" SET state=\'CLOSED\',revision=revision+1 WHERE id=$1',
          [fixture.periodId],
        );
        assert.deepEqual(await call('orphanCleanupReceipt', input), saved);
        assert.deepEqual(await call('removeOrphanAllocation', input), saved);
        await manager.query(
          'UPDATE core."otogrowRole" SET capabilities=\'{}\' WHERE id=$1',
          [fixture.roles.reader],
        );
        await denied(() => call('orphanCleanupReceipt', input));
        await denied(() => call('removeOrphanAllocation', input));
      },
    );

    await check(
      'Cleanup rejects stale scope, state, confirmation and already-removed allocations without side effects',
      async () => {
        const input = cleanupInput();
        for (const changed of [
          { periodRevision: 2 },
          { allocationRevision: 3 },
          { confirm: false },
          { engagementId: randomUUID() },
          { periodId: fixture.otherPeriodId },
          { allocationId: randomUUID() },
        ])
          await denied(() =>
            call('removeOrphanAllocation', { ...input, ...changed }),
          );
        await denied(() =>
          call(
            'removeOrphanAllocation',
            input,
            reader,
            fixture.foreignWorkspace,
          ),
        );
        await manager.query(
          'UPDATE core."deliveryCommitmentPeriod" SET state=\'CLOSED\' WHERE id=$1',
          [fixture.periodId],
        );
        await denied(() => call('removeOrphanAllocation', input));
        await manager.query(
          'UPDATE core."deliveryCommitmentPeriod" SET state=\'OPEN\' WHERE id=$1',
          [fixture.periodId],
        );
        await call('removeOrphanAllocation', input);
        await denied(() =>
          call('removeOrphanAllocation', {
            ...input,
            requestId: randomUUID(),
            allocationRevision: 5,
          }),
        );
      },
    );

    await check(
      'All active children protect their parent without identity disclosure or cascading removal',
      async () => {
        await manager.query(
          `UPDATE "${fixture.schemaName}".task SET "deletedAt"=$2 WHERE id=$1`,
          [fixture.tasks.hidden, DATE],
        );
        const snapshot = await read();
        const parent = snapshot.orphanAllocations.find(
          (row) => row.allocationId === fixture.allocations.hidden,
        );
        assert(parent);
        assert.equal(parent.canRemove, false);
        assert(parent.removalBlockReason);
        assert(!parent.removalBlockReason.includes(fixture.tasks.child));
        await denied(
          () => call('removeOrphanAllocation', cleanupInput('hidden')),
          /variation|linked|parent/i,
        );
        await manager.query(
          `UPDATE "${fixture.schemaName}".task SET "deletedAt"=$2 WHERE id=$1`,
          [fixture.tasks.child, DATE],
        );
        await call('removeOrphanAllocation', cleanupInput('child'));
        await call('removeOrphanAllocation', cleanupInput('hidden'));
        assert.equal((await allocation('child')).state, 'REMOVED');
        assert.equal((await allocation('hidden')).state, 'REMOVED');
        noPrivateProjection(await read(), fixture, [
          ...Object.keys(fixture.tasks).filter(
            (key) => !['visible', 'second', 'unallocated'].includes(key),
          ),
        ]);
      },
    );

    await check(
      'Restoration or project return before execution invalidates the old orphan confirmation',
      async () => {
        const input = cleanupInput();
        assert(
          (await read()).orphanAllocations.some(
            (row) => row.allocationId === input.allocationId,
          ),
        );
        await manager.query(
          `UPDATE "${fixture.schemaName}".task SET "deletedAt"=NULL WHERE id=$1`,
          [fixture.tasks.deleted],
        );
        await denied(() => call('removeOrphanAllocation', input));
        await manager.query(
          'UPDATE core."deliveryTask" SET "projectId"=$2 WHERE "workspaceId"=$3 AND "taskId"=$1',
          [fixture.tasks.moved, fixture.projects.first, fixture.workspaceId],
        );
        await denied(() =>
          call('removeOrphanAllocation', cleanupInput('moved')),
        );
        assert.equal((await allocation('deleted')).revision, 4);
      },
    );

    await check(
      'Post-cleanup restoration cannot re-credit; fresh authorized reassignment preserves historical receipt',
      async () => {
        const input = cleanupInput();
        const receipt = await call('removeOrphanAllocation', input);
        await manager.query(
          `UPDATE "${fixture.schemaName}".task SET "deletedAt"=NULL WHERE id=$1`,
          [fixture.tasks.deleted],
        );
        const current = await task('deleted');
        await syncDeliveryCommitment(
          manager,
          fixture.workspaceId,
          current.taskId,
          current.details,
          (await operations()).fulfilments.find(
            (row) => row.taskId === current.taskId,
          ),
          { actorId: null, actorType: 'SYSTEM' },
        );
        assert.equal((await allocation('deleted')).state, 'REMOVED');
        assert.equal((await allocation('deleted')).revision, 5);
        await denied(() => call('assignTask', assignInput('deleted')));
        permission().canReadObjectRecords = false;
        await denied(() =>
          call('assignTask', assignInput('deleted', { revision: 5 })),
        );
        permission().canReadObjectRecords = true;
        await call('assignTask', assignInput('deleted', { revision: 5 }));
        assert.notEqual((await allocation('deleted')).state, 'REMOVED');
        assert.deepEqual(await call('orphanCleanupReceipt', input), receipt);
        assert.deepEqual(await call('removeOrphanAllocation', input), receipt);
        assert.notEqual((await allocation('deleted')).state, 'REMOVED');
      },
    );

    await check(
      'Durable cancellation retires an uncertain request after source restoration and period closure',
      async () => {
        const input = cleanupInput();
        assert.equal(
          (await call('orphanCleanupReceipt', input)).state,
          'NOT_FOUND',
        );
        await manager.query(
          `UPDATE "${fixture.schemaName}".task SET "deletedAt"=NULL WHERE id=$1`,
          [fixture.tasks.deleted],
        );
        await manager.query(
          'UPDATE core."deliveryCommitmentPeriod" SET state=\'CLOSED\',revision=4 WHERE id=$1',
          [fixture.periodId],
        );
        const beforeAllocation = await allocation('deleted');
        const beforeTotals = totals(await read());
        permission().canReadObjectRecords = false;
        const receipt = await call('cancelOrphanCleanup', input);
        assert.equal(receipt.state, 'CANCELLED');
        assert.equal(receipt.removedAllocationRevision, null);
        assert(receipt.occurredAt);
        assert.deepEqual(await call('orphanCleanupReceipt', input), receipt);
        assert.deepEqual(await call('cancelOrphanCleanup', input), receipt);
        assert.deepEqual(await call('removeOrphanAllocation', input), receipt);
        assert.deepEqual(await allocation('deleted'), beforeAllocation);
        assert.deepEqual(totals(await read()), beforeTotals);
        const newEvents = (await events()).filter(
          (row) => !Object.values(fixture.events).includes(row.id),
        );
        assert.equal(newEvents.length, 1);
        assert.equal(
          newEvents[0].action,
          'COMMITMENT_ORPHAN_CLEANUP_CANCELLED',
        );
        assert.equal(newEvents[0].taskId, null);
        assert.equal(newEvents[0].taskName, null);
        assert.deepEqual(newEvents[0].changes[0], {
          field: 'state',
          before: null,
          after: 'CANCELLED',
        });
        const activities = await manager.query(
          'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        );
        assert.equal(activities.length, 1);
        assert.equal(
          activities[0].action,
          'COMMITMENT_ORPHAN_CLEANUP_CANCELLED',
        );
        assert.equal(activities[0].taskId, null);
        noPrivateProjection([receipt, newEvents, activities], fixture);
        await denied(() =>
          call('cancelOrphanCleanup', { ...input, allocationRevision: 2 }),
        );
        await denied(() => call('cancelOrphanCleanup', input, admin));
        await manager.query(
          'UPDATE core."otogrowRole" SET capabilities=\'{}\' WHERE id=$1',
          [fixture.roles.reader],
        );
        await denied(() => call('cancelOrphanCleanup', input));
      },
    );

    for (const method of ['removeOrphanAllocation', 'cancelOrphanCleanup'])
      for (const table of ['deliveryCommitmentEvent', 'otogrowActivityEvent'])
        await check(
          `${table} failure rolls ${method} and both audit streams back atomically`,
          async () => {
            await manager.query(
              `CREATE FUNCTION "${fixture.schemaName}".fail_cleanup_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId"='${fixture.workspaceId}'::uuid THEN RAISE EXCEPTION 'FIXTURE cleanup audit failure'; END IF; RETURN NEW; END $$`,
            );
            await manager.query(
              `CREATE TRIGGER native_commitment_failure BEFORE INSERT ON core."${table}" FOR EACH ROW EXECUTE FUNCTION "${fixture.schemaName}".fail_cleanup_audit()`,
            );
            await denied(
              () => call(method, cleanupInput()),
              /FIXTURE cleanup audit failure/,
            );
            assert.equal((await allocation('deleted')).state, 'FULFILLED');
            assert.equal((await allocation('deleted')).revision, 4);
          },
        );

    await check(
      'True deletion changes existing credit semantics, while role filtering never changes total evidence',
      async () => {
        const initial = await read();
        const unique = (snapshot) =>
          snapshot.lines.find((line) => line.id === fixture.lineIds.unique);
        assert.equal(unique(initial).fulfilledQuantity, 2);
        permission().canReadObjectRecords = false;
        assert.equal(unique(await read()).fulfilledQuantity, 2);
        await manager.query(
          `UPDATE "${fixture.schemaName}".task SET "deletedAt"=$2 WHERE id=$1`,
          [fixture.tasks.visible, DATE],
        );
        assert.equal(unique(await read()).fulfilledQuantity, 1);
        assert.equal(unique(await read()).assignedQuantity, 7);
        const publicTotals = await portal();
        assert.equal(
          publicTotals
            .find((period) => period.id === fixture.periodId)
            .lines.find((line) => line.id === fixture.lineIds.unique)
            .fulfilledQuantity,
          1,
        );
      },
    );

    await check(
      'Unknown metadata, role, changing policy and identity failures remain errors',
      async () => {
        const prior = structuredClone(metadata.data);
        delete metadata.data.rolesPermissions[fixture.nativeRoleId];
        await denied(
          () => read(),
          (error) => Boolean(error),
        );
        for (const method of [
          'removeOrphanAllocation',
          'cancelOrphanCleanup',
          'orphanCleanupReceipt',
        ])
          await denied(
            () => call(method, cleanupInput()),
            (error) => Boolean(error),
          );
        Object.assign(metadata.data, structuredClone(prior));
        metadata.data.flatObjectMetadataMaps = metadata.maps([
          metadata.memberObject,
        ]);
        await denied(
          () => read(),
          (error) => Boolean(error),
        );
        Object.assign(metadata.data, structuredClone(prior));
        native.state.changingHash = true;
        await denied(() => read(), /changed|permission|context/i);
        permission().canReadObjectRecords = false;
        await denied(() => read(), /changed|permission|context/i);
        for (const method of [
          'removeOrphanAllocation',
          'cancelOrphanCleanup',
          'orphanCleanupReceipt',
        ])
          await denied(
            () => call(method, cleanupInput()),
            /changed|permission|context/i,
          );
        permission().canReadObjectRecords = true;
        native.state.changingHash = false;
        await denied(() =>
          test.commitments.snapshot(
            fixture.workspace,
            reader.memberId,
            writer.userWorkspaceId,
            { engagementId: fixture.engagementId, periodId: fixture.periodId },
          ),
        );
        await denied(() =>
          call(
            'snapshot',
            { engagementId: fixture.engagementId },
            reader,
            fixture.foreignWorkspace,
          ),
        );
        await denied(() => read({}, outsider));
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
          'Original data changed.',
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
          'Real Commitments/Delivery/Access services, native permission engine and PostgreSQL. Isolated in-memory native metadata only. Complete outer rollback and full original data/schema equality. No provider, shared-cache, API, message or paid call. Concurrent transactions are covered by the separate exact-journal script.',
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

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  activityServices,
  prepareInput,
  startInput,
  deny,
  copy,
  fingerprint,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  seedCurrentWorkFixture,
  syntheticCurrentWork,
} = require('./check-otogrow-activity-current-work-support.cjs');

async function proveCurrentWork({
  runner,
  fixture,
  runtime,
  queue,
  readOperation,
}) {
  const rollback = new Error('ROLLBACK_CURRENT_WORK_PROOF_ONLY');
  let proof;
  try {
    await runner.manager.transaction(async (manager) => {
      await seedCurrentWorkFixture(manager, fixture);
      const source = {
        manager,
        getRepository: (entity) => manager.getRepository(entity),
        query: (...arguments_) => manager.query(...arguments_),
        transaction: (operation) => manager.transaction(operation),
      };
      let native;
      const services = activityServices(
        source,
        fixture,
        runtime.registryFor(fixture),
        queue,
        (access) => {
          native = syntheticCurrentWork(access, fixture);
          return native.currentWork;
        },
      );
      const person = fixture.people.admin;
      const call = (method, input, actor = person) =>
        services.analysis[method](
          fixture.workspace,
          actor.memberId,
          actor.userWorkspaceId,
          input,
        );
      const read = (method, input, actor = person) =>
        readOperation(() => call(method, input, actor));
      const snapshot = (scope = { projectId: fixture.projects.first }) =>
        readOperation(() =>
          native.currentWork.snapshot(
            manager,
            fixture.workspace,
            person.memberId,
            person.userWorkspaceId,
            scope,
          ),
        );
      const taskRead = (
        taskId,
        scope = { projectId: fixture.projects.first },
      ) =>
        readOperation(() =>
          native.currentWork.task(
            manager,
            fixture.workspace,
            person.memberId,
            person.userWorkspaceId,
            { taskId, scope },
          ),
        );
      const prepare = async (overrides = {}) => {
        const input = prepareInput(fixture, {
          includeCurrentWork: true,
          filters: {
            from: '2020-02-20T00:00:00.000Z',
            through: '2020-02-22T00:00:00.000Z',
            projectId: fixture.projects.first,
          },
          ...overrides,
        });
        const preview = await read('preview', input);
        return { input, preview, start: startInput(input, preview) };
      };
      const stored = async (id) =>
        (
          await manager.query(
            'SELECT * FROM core."otogrowActivityAnalysisRun" WHERE "workspaceId"=$1 AND id=$2',
            [fixture.workspaceId, id],
          )
        )[0];
      const spend = async (id) =>
        (
          await manager.query(
            'SELECT state FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND "sourceKind"=\'ACTIVITY_ANALYSIS\' AND "sourceRunId"=$2',
            [fixture.workspaceId, id],
          )
        )[0];
      const taskHash = async () =>
        fingerprint(
          await manager.query(
            `SELECT * FROM (SELECT 'managed' AS kind,to_jsonb(record) AS body FROM core."deliveryTask" record WHERE "workspaceId"=$1 UNION ALL SELECT 'review',to_jsonb(record) FROM core."deliveryReviewAssignment" record WHERE "workspaceId"=$1 UNION ALL SELECT 'native',to_jsonb(record) FROM "${fixture.schemaName}".task record) records ORDER BY kind,body::text`,
            [fixture.workspaceId],
          ),
        );
      const initialHash = await taskHash();
      const initial = await snapshot();
      assert.equal(initial.totalCount, 6);
      assert.equal(initial.includedCount, 6);
      assert.equal(initial.complete, true);
      assert.equal(initial.truncatedFieldCount, 0);
      assert(
        !JSON.stringify(initial).includes('PRIVATE_NATIVE_RLS_HIDDEN_TASK'),
      );
      const byId = new Map(initial.items.map((item) => [item.taskId, item]));
      const tasks = fixture.currentTasks;
      assert.equal(byId.get(tasks.staleBackup).assignmentMode, 'PRIMARY');
      assert.equal(
        byId.get(tasks.staleBackup).effectiveReviewerId,
        fixture.people.reader.memberId,
      );
      assert.equal(
        byId.get(tasks.activeBackup).effectiveReviewerId,
        fixture.people.secondWriter.memberId,
      );
      assert.equal(byId.get(tasks.activeBackup).reviewerState, 'ACTIVE');
      assert.equal(byId.get(tasks.selfBackup).reviewerState, 'SELF_REVIEW');
      assert.equal(
        byId.get(tasks.unavailableBackup).reviewerState,
        'UNAVAILABLE',
      );
      assert.equal(byId.get(tasks.approved).state, 'APPROVED');
      assert.equal(byId.get(tasks.inProgress).reviewerState, 'UNASSIGNED');
      const backupOnly = await snapshot({
        personId: fixture.people.secondWriter.memberId,
        projectId: fixture.projects.first,
      });
      assert.deepEqual(
        backupOnly.items.map((task) => task.taskId),
        [tasks.activeBackup],
      );
      const primary = await snapshot({
        personId: fixture.people.reader.memberId,
        projectId: fixture.projects.first,
      });
      assert.deepEqual(
        new Set(primary.items.map((task) => task.taskId)),
        new Set([tasks.staleBackup, tasks.approved]),
      );
      const unavailable = await snapshot({
        personId: fixture.people.outsider.memberId,
        projectId: fixture.projects.first,
      });
      assert.deepEqual(
        unavailable.items.map((task) => task.taskId),
        [tasks.unavailableBackup],
      );
      assert.equal((await taskRead(tasks.hidden)).task, null);
      assert.equal((await taskRead(tasks.deleted)).task, null);
      assert.equal((await taskRead(tasks.otherProject)).task, null);
      assert.equal(
        (await taskRead(randomUUID())).unavailableReason,
        'NOT_AVAILABLE_IN_SCOPE',
      );
      await deny(
        () =>
          native.currentWork.snapshot(
            manager,
            fixture.workspace,
            fixture.people.writer.memberId,
            fixture.people.writer.userWorkspaceId,
            { projectId: fixture.projects.first },
          ),
        [403],
      );
      await deny(
        () =>
          read('preview', prepareInput(fixture, { includeCurrentWork: true })),
        [400],
      );
      assert.equal(
        await taskHash(),
        initialHash,
        'All source reads preserve tasks and review assignments.',
      );

      const prepared = await prepare();
      assert.equal(
        prepared.preview.context.promptVersion,
        'activity-current-work-1',
      );
      assert.equal(
        prepared.preview.context.outputContractVersion,
        'evidence-analysis-2',
      );
      assert.equal(prepared.preview.context.currentWork.totalCount, 6);
      assert.equal(
        prepared.preview.context.currentWork.capturedAt,
        prepared.preview.context.capturedAt,
      );
      assert.equal(prepared.preview.canStart, true);
      const recaptured = await snapshot();
      assert.equal(
        recaptured.fingerprint,
        initial.fingerprint,
        'Independent capture time alone does not change task facts.',
      );
      const first = await call('start', prepared.start);
      assert.equal(
        (await stored(first.run.id)).context.currentWork.capturedAt,
        prepared.preview.context.capturedAt,
      );
      runtime.state.citation = `current-task:${tasks.activeBackup}`;
      const calls = runtime.state.calls;
      await services.analysis.execute(first.run.id);
      assert.equal(runtime.state.calls, calls + 1);
      assert.equal((await stored(first.run.id)).status, 'SUCCEEDED');
      assert.equal((await spend(first.run.id)).state, 'SETTLED');
      const saved = await read('detail', { id: first.run.id });
      assert.equal(saved.context.currentWork.items.length, 6);
      assert(
        saved.result.findings.every(
          (finding) => finding.kind === 'CURRENT_STATE',
        ),
      );
      assert.equal(
        (await read('detail', { id: first.run.id }, fixture.people.reader)).run
          .status,
        'SUCCEEDED',
        'A second current administrator may inspect historical facts they can currently read natively.',
      );
      assert(
        (await read('runs', { limit: 50 }, fixture.people.reader)).items.some(
          (run) => run.id === first.run.id,
        ),
      );
      assert.equal(
        await taskHash(),
        initialHash,
        'Model output is analysis only, with no task/reviewer writes.',
      );

      const currentOnly = await prepare({
        filters: {
          from: '2021-01-01T00:00:00.000Z',
          through: '2021-01-02T00:00:00.000Z',
          projectId: fixture.projects.first,
          action: 'NEVER_RECORDED',
        },
      });
      assert.equal(currentOnly.preview.context.totalCount, 0);
      assert.equal(currentOnly.preview.context.currentWork.totalCount, 6);
      assert.equal(
        currentOnly.preview.canStart,
        true,
        'Historical filters do not hide separately scoped current work.',
      );
      const only = await call('start', currentOnly.start);
      runtime.state.citation = `current-task:${tasks.approved}`;
      await services.analysis.execute(only.run.id);
      assert.equal((await stored(only.run.id)).status, 'SUCCEEDED');
      const empty = await prepare({
        filters: {
          from: '2021-01-01T00:00:00.000Z',
          through: '2021-01-02T00:00:00.000Z',
          projectId: randomUUID(),
        },
      });
      assert.equal(empty.preview.canStart, false);
      await deny(() => call('start', empty.start), [400]);

      const changed = await prepare();
      const alterTask = (state, revision) =>
        manager.query(
          'UPDATE core."deliveryTask" SET details=jsonb_set(details,\'{state}\',to_jsonb($3::text)),revision=$4 WHERE "workspaceId"=$1 AND "taskId"=$2',
          [fixture.workspaceId, tasks.activeBackup, state, revision],
        );
      await alterTask('BLOCKED', 2);
      await deny(() => call('start', changed.start), [409]);
      assert.equal(
        (
          await read('detail', { id: first.run.id })
        ).context.currentWork.items.find(
          (task) => task.taskId === tasks.activeBackup,
        ).state,
        'IN_REVIEW',
        'Saved answers retain captured task facts after state changes.',
      );
      assert.equal(
        (await taskRead(tasks.activeBackup)).task.state,
        'BLOCKED',
        'Exact citations resolve current source separately.',
      );
      await alterTask('IN_REVIEW', 1);

      const queued = await prepare();
      const queuedRun = await call('start', queued.start);
      await alterTask('CHANGES_REQUESTED', 2);
      const beforeDispatch = runtime.state.calls;
      await services.analysis.execute(queuedRun.run.id);
      assert.equal(runtime.state.calls, beforeDispatch);
      assert.equal((await stored(queuedRun.run.id)).status, 'FAILED');
      assert.equal((await spend(queuedRun.run.id)).state, 'RELEASED');
      await alterTask('IN_REVIEW', 1);

      const inflight = await prepare();
      const inflightRun = await call('start', inflight.start);
      runtime.state.citation = `current-task:${tasks.activeBackup}`;
      runtime.state.hook = () => alterTask('BLOCKED', 2);
      await services.analysis.execute(inflightRun.run.id);
      runtime.state.hook = null;
      assert.equal((await stored(inflightRun.run.id)).status, 'FAILED');
      assert.equal((await stored(inflightRun.run.id)).result, null);
      assert.equal(
        (await spend(inflightRun.run.id)).state,
        'SETTLED',
        'Known in-flight usage is charged before changed-source output is discarded.',
      );
      await alterTask('IN_REVIEW', 1);

      const invalid = await prepare();
      const invalidRun = await call('start', invalid.start);
      runtime.state.citation = `current-task:${tasks.activeBackup}`;
      runtime.state.behavior = 'INVALID_CURRENT_KIND';
      await services.analysis.execute(invalidRun.run.id);
      runtime.state.behavior = 'SUCCESS';
      assert.equal((await stored(invalidRun.run.id)).status, 'FAILED');
      assert.equal((await spend(invalidRun.run.id)).state, 'SETTLED');

      const permissions =
        native.native.data.rolesPermissions[fixture.nativeRoleId][
          native.native.taskObject.id
        ];
      permissions.canReadObjectRecords = false;
      await deny(snapshot, [403]);
      permissions.canReadObjectRecords = true;
      permissions.restrictedFields[native.native.taskFields[1].id] = {
        canRead: false,
      };
      await deny(snapshot, [403]);
      await deny(() => read('detail', { id: first.run.id }), [403]);
      await deny(() => read('state', { id: first.run.id }), [403]);
      await deny(
        () =>
          read('request', {
            requestId: prepared.start.requestId,
            action: 'STARTED',
          }),
        [403],
      );
      assert.equal(
        (await read('runs', { limit: 50 })).items.some(
          (run) => run.id === first.run.id,
        ),
        false,
      );
      delete permissions.restrictedFields[native.native.taskFields[1].id];
      native.state.changingHash = true;
      native.state.hashReads = 0;
      await deny(snapshot, [409]);
      native.state.changingHash = false;
      const originalPredicate = native.native.predicate.value;
      native.native.predicate.value = 'Nothing matches this predicate';
      assert.equal(
        (await snapshot()).totalCount,
        0,
        'Real rendered native RLS applies before counts and source projection.',
      );
      await deny(() => read('detail', { id: first.run.id }), [403]);
      await deny(
        () =>
          read('request', {
            requestId: prepared.start.requestId,
            action: 'STARTED',
          }),
        [403],
      );
      assert.equal(
        (await read('runs', { limit: 50 })).items.some(
          (run) => run.id === first.run.id,
        ),
        false,
      );
      native.native.predicate.value = originalPredicate;
      assert.equal(
        (await read('detail', { id: first.run.id })).run.status,
        'SUCCEEDED',
      );
      await manager.query(
        `UPDATE "${fixture.schemaName}".task SET "deletedAt"='2020-02-21T00:00:00Z' WHERE id=$1`,
        [tasks.activeBackup],
      );
      await deny(() => read('detail', { id: first.run.id }), [403]);
      await deny(() => read('state', { id: first.run.id }), [403]);
      assert(
        await stored(first.run.id),
        'A current source deletion restricts visibility without erasing the saved answer.',
      );
      await manager.query(
        `UPDATE "${fixture.schemaName}".task SET "deletedAt"=NULL WHERE id=$1`,
        [tasks.activeBackup],
      );
      assert.equal(await taskHash(), initialHash);

      const longTitle = `Visible ${'界'.repeat(900)}`;
      await manager.query(
        `UPDATE "${fixture.schemaName}".task SET title=$2 WHERE id=$1`,
        [tasks.activeBackup, longTitle],
      );
      const truncated = await prepare();
      assert.equal(truncated.preview.context.currentWork.complete, false);
      assert(truncated.preview.context.currentWork.truncatedFieldCount > 0);
      assert.equal(truncated.preview.canStart, false);
      await deny(() => call('start', truncated.start), [400]);
      await manager.query(
        `UPDATE "${fixture.schemaName}".task SET title=$2 WHERE id=$1`,
        [tasks.activeBackup, 'Visible FIXTURE activeBackup'],
      );
      const [template] = await manager.query(
        'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, tasks.inProgress],
      );
      for (let index = 0; index < 200; index++) {
        const taskId = randomUUID();
        await manager.query(
          `INSERT INTO "${fixture.schemaName}".task (id,title,"assigneeId") VALUES ($1,$2,$3)`,
          [
            taskId,
            `Visible FIXTURE bound ${index}`,
            fixture.people.writer.memberId,
          ],
        );
        await manager.query(
          'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details,revision) VALUES ($1,$2,$3,$4,1)',
          [
            fixture.workspaceId,
            taskId,
            fixture.projects.first,
            JSON.stringify(copy(template.details)),
          ],
        );
      }
      const omitted = await prepare();
      assert.equal(omitted.preview.context.currentWork.totalCount, 206);
      assert(omitted.preview.context.currentWork.omittedCount > 0);
      assert.equal(omitted.preview.canStart, false);
      await deny(() => call('start', omitted.start), [400]);
      proof = {
        currentTasks: initial.totalCount,
        sourceBoundary:
          'actual ORM permission validators and SQL/RLS with explicitly synthetic isolated cache metadata',
      };
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return proof;
}
module.exports = { proveCurrentWork };

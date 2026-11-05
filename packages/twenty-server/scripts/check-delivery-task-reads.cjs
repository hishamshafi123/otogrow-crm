const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  DeliveryTasksService,
} = require('../dist/modules/delivery/tasks/delivery-tasks.service');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryOperationsService,
} = require('../dist/modules/delivery/operations/delivery-operations.service');
const {
  NOW,
  DATE,
  TIMEZONE,
  copy,
  quote,
  createTaskReadsFixture,
  sourceFingerprint,
  denied,
  buildServices,
} = require('./check-delivery-task-reads-support.cjs');
const counts = (rows, key) =>
  Object.fromEntries(
    [...new Set(rows.map((row) => row[key]))].map((value) => [
      value,
      rows.filter((row) => row[key] === value).length,
    ]),
  );
function group(task) {
  if (task.state === 'APPROVED') return 'approved';
  if (task.state === 'IN_REVIEW') return 'review';
  if (task.state === 'CHANGES_REQUESTED') return 'revisions';
  if (task.state === 'BLOCKED') return 'blocked';
  if (task.dueAt && Date.parse(task.dueAt) < NOW.getTime()) return 'overdue';
  if (
    task.state === 'IN_PROGRESS' ||
    (task.scheduledDate && task.scheduledDate <= DATE) ||
    (task.dueAt &&
      new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(
        new Date(task.dueAt),
      ) === DATE)
  )
    return 'today';
  return task.scheduledDate || task.dueAt ? 'upcoming' : 'unscheduled';
}
async function assertAssignmentReceiptRace(runner, fixture, reads) {
  const task = fixture.tasks.find(
      (item) => item.scope === 'PRIMARY' && item.index === 0,
    ),
    { reader, writer, admin } = fixture.people,
    previousKey = `${reader.memberId}:${task.details.assignmentAt ?? 'legacy'}`,
    reassignedAt = new Date(NOW.getTime() - 1000).toISOString(),
    returnedAt = NOW.toISOString(),
    currentKey = `${reader.memberId}:${returnedAt}`,
    original = await sourceFingerprint(runner.manager, fixture);
  await runner.query('SAVEPOINT assignment_receipt_race');
  try {
    for (const [assigneeId, assignmentAt] of [
      [writer.memberId, reassignedAt],
      [reader.memberId, returnedAt],
    ]) {
      await runner.query(
        `UPDATE ${quote(fixture.schemaName)}.task SET "assigneeId"=$2 WHERE id=$1`,
        [task.taskId, assigneeId],
      );
      await runner.query(
        'UPDATE core."deliveryTask" SET details=jsonb_set(details,\'{assignmentAt}\',to_jsonb($3::text)) WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, task.taskId, assignmentAt],
      );
    }
    const [{ state }] = await runner.query(
      'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    state.assignments[task.taskId] = previousKey;
    const notice = {
      id: randomUUID(),
      taskId: task.taskId,
      recipientId: reader.memberId,
      senderId: admin.memberId,
      kind: 'ASSIGNMENT',
      text: 'Synthetic returned assignment stays unread for its new recipient receipt.',
      createdAt: returnedAt,
      remindAt: new Date(NOW.getTime() + 300000).toISOString(),
      seenAt: null,
      acknowledgedAt: null,
      cancelled: false,
      sendState: 'PENDING',
      attemptedAt: null,
      error: null,
    };
    const message = {
      ...notice,
      id: randomUUID(),
      kind: 'MESSAGE',
      text: 'Synthetic individual message remains independently unread.',
    };
    state.notices.push(notice, message);
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
      [fixture.workspaceId, state],
    );
    const beforeStaleReceipt = await sourceFingerprint(runner.manager, fixture);
    const see = (expectedAssignmentKey, person = reader) =>
      reads.seeAssignment(
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        { taskId: task.taskId, expectedAssignmentKey },
      );
    await denied(() => see(previousKey), [409]);
    assert.deepEqual(
      await sourceFingerprint(runner.manager, fixture),
      beforeStaleReceipt,
      'A delayed A-to-other-to-A receipt must not mark the new assignment seen, suppress any notice or change any source.',
    );
    await denied(() => see(currentKey, writer), [403]);
    assert.deepEqual(
      await sourceFingerprint(runner.manager, fixture),
      beforeStaleReceipt,
      'Another project reader cannot record the current assignee receipt.',
    );
    const receipt = await see(currentKey);
    assert.deepEqual(receipt, {
      workspaceId: fixture.workspaceId,
      memberId: reader.memberId,
      userWorkspaceId: reader.userWorkspaceId,
      taskId: task.taskId,
      seen: true,
    });
    const [{ state: seenState }] = await runner.query(
      'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    const seenNotice = seenState.notices.find((item) => item.id === notice.id);
    assert.equal(seenState.assignments[task.taskId], currentKey);
    assert(seenNotice.seenAt);
    const expectedState = copy(state);
    expectedState.assignments[task.taskId] = currentKey;
    expectedState.notices.find((item) => item.id === notice.id).seenAt =
      seenNotice.seenAt;
    assert.deepEqual(
      seenState,
      expectedState,
      'An exact receipt may change only its current assignment marker and matching assignment-notice seen timestamp.',
    );
    const afterReceipt = await sourceFingerprint(runner.manager, fixture);
    for (const [table, fingerprint] of Object.entries(beforeStaleReceipt))
      if (table !== 'core.deliveryOperations')
        assert.equal(
          afterReceipt[table],
          fingerprint,
          `A seen receipt changed unrelated ${table}.`,
        );
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT assignment_receipt_race');
    await runner.query('RELEASE SAVEPOINT assignment_receipt_race');
  }
  assert.deepEqual(
    await sourceFingerprint(runner.manager, fixture),
    original,
    'The isolated receipt race must restore the complete source and Operations baseline.',
  );
}
async function main() {
  assert.equal(process.argv.length, 2, 'This checker always rolls back.');
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
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const fixture = await createTaskReadsFixture(runner.manager),
      source = {
        manager: runner.manager,
        getRepository: (entity) => runner.manager.getRepository(entity),
        query: (...arguments_) => runner.query(...arguments_),
        transaction: (callback) => runner.manager.transaction(callback),
      },
      services = buildServices(source, fixture),
      creative = new DeliveryCreativeService(
        source,
        services.delivery,
        {
          getCurrentDriver: () => {
            throw new Error('Task-read acceptance cannot access media storage.');
          },
        },
        createIsolatedNativeTaskAccess(),
      ),
      operations = new DeliveryOperationsService(
        source,
        services.delivery,
        creative,
        {
          findByWorkspaceId: async () => null,
          decryptBotToken: () => {
            throw new Error(
              'Task-read acceptance cannot decrypt Telegram credentials.',
            );
          },
        },
        { get: () => null },
        {
          add: async () => {
            throw new Error(
              'Task-read acceptance cannot enqueue transport jobs.',
            );
          },
        },
      ),
      reads = new DeliveryTasksService(
        source,
        services.delivery,
        services.access,
        operations,
        createIsolatedNativeTaskAccess(),
      ),
      { people } = fixture;
    const nativeQuery = runner.query.bind(runner);
    let observeLight = false;
    let observedSelects = 0;
    runner.query = async (sql, parameters, ...rest) => {
      const result = await nativeQuery(sql, parameters, ...rest);
      if (observeLight && /^\s*(SELECT|WITH)/i.test(sql)) {
        observedSelects++;
        assert(
          !JSON.stringify(result).includes('PRIVATE_TASK_HISTORY:'),
          'A lightweight read hydrated private historical details from PostgreSQL.',
        );
        if (Array.isArray(result))
          for (const row of result)
            if (row && typeof row === 'object' && Object.hasOwn(row, 'latest'))
              assert.deepEqual(Object.keys(row.latest).sort(), [
                'decision',
                'reviewedAt',
                'version',
              ]);
      }
      return result;
    };
    const light = async (action) => {
      observeLight = true;
      try {
        return await action();
      } finally {
        observeLight = false;
      }
    };
    const identity = (person = people.admin, workspace = fixture.workspace) => [
      workspace,
      person.memberId,
      person.userWorkspaceId,
    ];
    const list = (
      input = {},
      person = people.admin,
      workspace = fixture.workspace,
      now = NOW,
    ) =>
      light(() =>
        reads.list(
          ...identity(person, workspace),
          { view: 'HOME', timezone: TIMEZONE, ...input },
          undefined,
          now,
        ),
      );
    const detail = (
      taskId,
      person = people.admin,
      workspace = fixture.workspace,
    ) => reads.detail(...identity(person, workspace), { taskId });
    const command = (input, person = people.admin) =>
      reads.command(...identity(person), input);
    const baseline = await sourceFingerprint(runner.manager, fixture);
    const legacy = await services.delivery.snapshot(...identity(people.reader));
    const legacyBytes = Buffer.byteLength(JSON.stringify(legacy));
    let legacyCalls = 0;
    services.delivery.snapshot = async () => {
      legacyCalls++;
      throw new Error(
        'Thin task reads/commands must not hydrate the legacy workspace snapshot.',
      );
    };
    const context = await light(() =>
      reads.context(...identity(people.reader)),
    );
    assert.equal(context.workspaceId, fixture.workspaceId);
    assert.equal(context.memberId, people.reader.memberId);
    assert.equal(Object.hasOwn(context, 'tasks'), false);
    assert.deepEqual(
      context.projects.map((project) => project.id),
      [fixture.projects.first],
    );
    assert(!JSON.stringify(context).includes('PRIVATE_TASK_HISTORY:'));
    const primary = fixture.tasks.filter((task) => task.scope === 'PRIMARY'),
      other = fixture.tasks.filter((task) => task.scope === 'OTHER'),
      own = primary.filter(
        (task) => task.assigneeId === people.reader.memberId,
      );
    const first = await list({ limit: 30 });
    assert.equal(first.totalCount, primary.length + other.length);
    assert.equal(first.overview.totalCount, 156);
    assert.equal(first.businessDate, DATE);
    assert.equal(first.timezone, TIMEZONE);
    assert.equal(first.items.length, 30);
    assert(first.nextCursor);
    const all = [];
    let after = null;
    do {
      const page = await list({ after, limit: 30 });
      assert.equal(page.totalCount, 156);
      all.push(...page.items);
      after = page.nextCursor;
    } while (after);
    assert.equal(all.length, 156);
    assert.equal(new Set(all.map((row) => row.id)).size, 156);
    assert(
      all.every((row) =>
        fixture.tasks.some(
          (task) => task.taskId === row.id && task.scope !== 'FOREIGN',
        ),
      ),
    );
    const summaryKeys = [
      'id',
      'title',
      'projectId',
      'projectName',
      'revision',
      'assigneeId',
      'assigneeName',
      'service',
      'state',
      'priority',
      'scheduledDate',
      'dueAt',
      'workGroup',
      'checklistDone',
      'checklistTotal',
      'hasCreative',
      'review',
      'delivery',
      'warnings',
      'blockerPreview',
      'blockerTruncated',
    ];
    for (const row of all) {
      for (const key of Object.keys(row))
        assert(summaryKeys.includes(key), `Unexpected summary field ${key}.`);
      assert.equal(Object.hasOwn(row, 'details'), false);
      assert.equal(row.checklistTotal, 2);
      assert.equal(Object.hasOwn(row.delivery, 'history'), false);
      const sourceTask = fixture.tasks.find((task) => task.taskId === row.id);
      assert.equal(row.workGroup, group(sourceTask));
    }
    const expectedStates = counts([...primary, ...other], 'state');
    for (const item of first.byState)
      assert.equal(item.count, expectedStates[item.key] ?? 0);
    for (const item of first.byWorkGroup)
      assert.equal(
        item.count,
        all.filter((row) => row.workGroup === item.key).length,
      );
    assert.equal(
      first.byState.reduce((sum, row) => sum + row.count, 0),
      156,
    );
    assert.equal(
      first.byWorkGroup.reduce((sum, row) => sum + row.count, 0),
      156,
    );
    const mine = await list({ view: 'MINE' }, people.reader);
    assert.equal(mine.totalCount, own.length);
    assert.equal(mine.overview.totalCount, own.length);
    assert(
      mine.items.every((row) => row.assigneeId === people.reader.memberId),
    );
    assert.equal(
      (await list({}, people.reader)).totalCount,
      own.length,
      'Nonmanager Today is personal work, not all project tasks.',
    );
    assert.equal(
      (
        await list(
          { view: 'MINE', assigneeId: people.writer.memberId },
          people.reader,
        )
      ).totalCount,
      own.length,
      'My tasks cannot be widened with another assignee filter.',
    );
    const filterCases = [
      { input: { projectId: fixture.projects.first }, expected: primary },
      {
        input: { assigneeId: people.writer.memberId },
        expected: primary.filter(
          (task) => task.assigneeId === people.writer.memberId,
        ),
      },
      {
        input: { service: 'SEO' },
        expected: [...primary, ...other].filter(
          (task) => task.service === 'SEO',
        ),
      },
      {
        input: { state: 'BLOCKED' },
        expected: [...primary, ...other].filter(
          (task) => task.state === 'BLOCKED',
        ),
      },
      {
        input: { search: 'PRIMARY 00' },
        expected: primary.filter((task) => task.title.includes('PRIMARY 00')),
      },
      {
        input: { scheduledFrom: '2026-10-28', scheduledThrough: DATE },
        expected: [...primary, ...other].filter(
          (task) =>
            task.scheduledDate &&
            task.scheduledDate >= '2026-10-28' &&
            task.scheduledDate <= DATE,
        ),
      },
      {
        input: { attention: 'OVERDUE' },
        expected: [...primary, ...other].filter(
          (task) =>
            task.state !== 'APPROVED' &&
            task.dueAt &&
            Date.parse(task.dueAt) < NOW.getTime(),
        ),
      },
    ];
    for (const test of filterCases) {
      const page = await list(test.input);
      assert.equal(page.totalCount, test.expected.length);
      assert.equal(
        page.overview.totalCount,
        156,
        'Overview remains full-view while filters narrow results.',
      );
      assert.equal(
        page.byState.reduce((sum, row) => sum + row.count, 0),
        test.expected.length,
      );
      assert(
        page.items.every((row) =>
          test.expected.some((task) => task.taskId === row.id),
        ),
      );
    }
    await denied(
      () => list({ after: first.nextCursor, state: 'BLOCKED' }),
      [400],
    );
    await denied(() => list({ after: first.nextCursor }, people.reader), [400]);
    await denied(() => list({ timezone: 'not-a-timezone' }), [400]);
    await denied(() => list({ view: 'ARCHIVED' }), [400]);
    await denied(
      () =>
        list(
          { after: first.nextCursor },
          people.admin,
          fixture.workspace,
          new Date('2026-10-30T08:00:00.000Z'),
        ),
      [400],
    );
    const offPage = primary.find(
      (task) => !first.items.some((row) => row.id === task.taskId),
    );
    const exact = await detail(offPage.taskId, people.reader);
    assert.equal(exact.task.id, offPage.taskId);
    assert.equal(exact.task.details.creative.revisionCharge, 0);
    assert(JSON.stringify(exact).includes('PRIVATE_TASK_HISTORY:'));
    assert.equal(
      (await detail(offPage.taskId)).task.details.creative.revisionCharge,
      34567,
    );
    assert.equal(Object.hasOwn(exact, 'tasks'), false);
    await denied(() => detail(other[0].taskId, people.reader), [404]);
    await denied(() => detail(primary[0].taskId, people.secondWriter), [404]);
    await denied(
      () =>
        detail(fixture.tasks.find((task) => task.scope === 'FOREIGN').taskId),
      [404],
    );
    await denied(
      () => detail(primary[0].taskId, people.admin, fixture.foreignWorkspace),
      [403],
    );
    await denied(() => detail(randomUUID()), [404]);
    assert.equal(
      (await list({ projectId: fixture.projects.otherClient }, people.reader))
        .totalCount,
      0,
    );
    assert.equal((await list({}, people.outsider)).totalCount, 0);
    const ownCursor = mine.nextCursor;
    assert(ownCursor);
    await runner.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, ['delivery.manage']],
    );
    await denied(
      () => list({ view: 'MINE', after: ownCursor }, people.reader),
      [400],
    );
    assert.equal((await list({}, people.reader)).totalCount, 156);
    await runner.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, []],
    );
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
      [fixture.projects.first, JSON.stringify([people.writer.memberId])],
    );
    await denied(() => detail(primary[0].taskId, people.reader), [404]);
    await denied(
      () => list({ view: 'MINE', after: ownCursor }, people.reader),
      [400],
    );
    assert.equal((await list({}, people.reader)).totalCount, 0);
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
      [
        fixture.projects.first,
        JSON.stringify([people.reader.memberId, people.writer.memberId]),
      ],
    );
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.reader.userId,
    ]);
    await denied(() => list({}, people.reader), [403]);
    await denied(() => detail(primary[0].taskId, people.reader), [403]);
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      people.reader.userId,
    ]);
    const anomaly = primary[2],
      originalAnomaly = copy(anomaly.details);
    await runner.query(
      'UPDATE core."deliveryTask" SET details=jsonb_set(jsonb_set(details,\'{checklist}\',\'{}\'::jsonb),\'{blocker}\',to_jsonb($3::text)) WHERE "workspaceId"=$1 AND "taskId"=$2',
      [
        fixture.workspaceId,
        anomaly.taskId,
        'Synthetic current blocker ' + 'x'.repeat(250),
      ],
    );
    const malformed = (await list({ search: anomaly.title })).items[0];
    assert.equal(malformed.checklistDone, null);
    assert.equal(malformed.checklistTotal, null);
    assert(malformed.warnings.includes('CHECKLIST_UNAVAILABLE'));
    assert.equal(malformed.blockerPreview.length, 180);
    assert.equal(malformed.blockerTruncated, true);
    await runner.query(
      'UPDATE core."deliveryTask" SET details=jsonb_set(details,\'{state}\',\'"SYNTHETIC_INVALID"\'::jsonb) WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, anomaly.taskId],
    );
    const invalid = (await list({ search: anomaly.title })).items[0];
    assert(invalid.warnings.includes('TASK_STATE_UNAVAILABLE'));
    assert.equal(invalid.delivery.status, 'UNAVAILABLE');
    await runner.query(
      'UPDATE core."deliveryTask" SET details=$3 WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, anomaly.taskId, originalAnomaly],
    );
    await assertAssignmentReceiptRace(runner, fixture, reads);
    assert.deepEqual(
      await sourceFingerprint(runner.manager, fixture),
      baseline,
      'Context/list/count/detail reads must not mutate any original source, history, role, user, finance, bot or outbox.',
    );
    const listBytes = Buffer.byteLength(JSON.stringify(mine)),
      contextBytes = Buffer.byteLength(JSON.stringify(context));
    assert(listBytes < legacyBytes / 10);
    assert(contextBytes < legacyBytes / 10);
    assert(observedSelects > 0);
    const target = primary[0],
      before = copy((await detail(target.taskId, people.reader)).task.details);
    const thin = await command(
      {
        action: 'comment',
        taskId: target.taskId,
        revision: 1,
        text: 'Synthetic thin task note',
      },
      people.reader,
    );
    assert.deepEqual(Object.keys(thin).sort(), [
      'memberId',
      'revision',
      'state',
      'taskId',
      'userWorkspaceId',
      'workspaceId',
    ]);
    assert.equal(thin.revision, 2);
    assert.equal(Buffer.byteLength(JSON.stringify(thin)) < 400, true);
    assert(!JSON.stringify(thin).includes('PRIVATE_TASK_HISTORY:'));
    await denied(
      () =>
        command(
          {
            action: 'comment',
            taskId: target.taskId,
            revision: 1,
            text: 'Stale duplicate',
          },
          people.reader,
        ),
      [409],
    );
    const commented = await detail(target.taskId, people.reader);
    assert.equal(
      commented.task.details.events.length,
      before.events.length + 1,
    );
    assert.deepEqual(commented.task.details.events.slice(0, -1), before.events);
    assert.deepEqual(commented.task.details.submissions, before.submissions);
    assert.equal(
      commented.task.details.events.at(-1).text,
      'Synthetic thin task note',
    );
    const progress = await command(
      {
        action: 'progress',
        taskId: target.taskId,
        revision: 2,
        state: 'IN_PROGRESS',
        blocker: '',
        checklist: before.checklist,
        evidence: [],
      },
      people.reader,
    );
    assert.equal(progress.state, 'IN_PROGRESS');
    assert.equal(progress.revision, 3);
    const pending = primary.find((task) => task.state === 'IN_REVIEW');
    await denied(
      () =>
        command(
          {
            action: 'review',
            taskId: pending.taskId,
            revision: 1,
            decision: 'APPROVED',
            feedback: '',
            selectedSubmissionVersion: 13,
            creativeVersion: 1,
            finalAssetId: pending.finalAssetId,
          },
          people.writer,
        ),
      [403],
    );
    const approved = await command({
      action: 'review',
      taskId: pending.taskId,
      revision: 1,
      decision: 'APPROVED',
      feedback: 'Synthetic independent thin approval',
      selectedSubmissionVersion: 13,
      creativeVersion: 1,
      finalAssetId: pending.finalAssetId,
    });
    assert.equal(approved.state, 'APPROVED');
    assert.equal(approved.revision, 2);
    await denied(
      () => command({ action: 'project', name: 'Forbidden via task command' }),
      [400],
    );
    const afterWrites = await sourceFingerprint(runner.manager, fixture);
    for (const [name, value] of Object.entries(baseline))
      if (
        ![
          'core.deliveryTask',
          'native.task',
          'core.otogrowActivityEvent',
        ].includes(name)
      )
        assert.equal(
          afterWrites[name],
          value,
          `Thin task commands changed unrelated ${name}.`,
        );
    assert.equal(legacyCalls, 0);
    console.log(
      JSON.stringify({
        result: 'PASS rollback-only bounded primary task reads',
        primaryTasks: 137,
        otherProjectTasks: 19,
        foreignWorkspaceTasks: 11,
        scopedLegacyBytes: legacyBytes,
        scopedListPageBytes: listBytes,
        taskFreeContextBytes: contextBytes,
        thinCommandBytes: Buffer.byteLength(JSON.stringify(thin)),
        legacySnapshotCalls: legacyCalls,
        exactAssignmentReceiptRace: true,
        readOnlyPreserved: true,
        noExternalCalls: true,
      }),
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

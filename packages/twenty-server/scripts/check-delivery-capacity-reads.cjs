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
  DeliveryCapacityService,
} = require('../dist/modules/delivery/capacity/delivery-capacity.service');
const {
  DeliveryCapacityReadService,
} = require('../dist/modules/delivery/capacity/read/delivery-capacity-read.service');
const {
  NOW,
  DATE,
  DAYS,
  TIMEZONE,
  copy,
  quote,
  denied,
  buildServices,
  createCapacityReadsFixture,
  sourceFingerprint,
  expectedAssignments,
  expectedDay,
  inBucket,
} = require('./check-delivery-capacity-reads-support.cjs');
const rowIdentity = (row) => `${row.taskId}:${row.kind}`;
const sorted = (values) => [...values].sort();
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
    const fixture = await createCapacityReadsFixture(runner.manager);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const services = buildServices(source, fixture);
    const forbidden = new Proxy(
      {},
      {
        get: () => () => {
          throw new Error(
            'Capacity proof cannot call a transport, storage driver or reminder command.',
          );
        },
      },
    );
    const tasks = new DeliveryTasksService(
      source,
      services.delivery,
      services.access,
      forbidden,
      createIsolatedNativeTaskAccess(),
    );
    const reads = new DeliveryCapacityReadService(
      source,
      services.delivery,
      tasks,
      services.access,
    );
    const availability = new DeliveryCapacityService(
      source,
      services.delivery,
      services.access,
    );
    const identity = (
      person = fixture.people.admin,
      workspace = fixture.workspace,
    ) => [workspace, person.memberId, person.userWorkspaceId];
    const baseline = await sourceFingerprint(runner.manager, fixture);
    const unchangedExcept = async (before, allowed) => {
      const after = await sourceFingerprint(runner.manager, fixture);
      for (const [table, fingerprint] of Object.entries(before))
        if (!allowed.includes(table))
          assert.equal(
            after[table],
            fingerprint,
            `A finite capacity command changed unrelated ${table}.`,
          );
    };
    let legacyCalls = 0;
    services.delivery.snapshot = async () => {
      legacyCalls++;
      throw new Error(
        'Planner reads, exact opens and thin writes must never hydrate the legacy workspace snapshot.',
      );
    };
    let lightweight = false;
    let readSelects = 0;
    let readWrites = 0;
    let selectedBytes = 0;
    const query = runner.query.bind(runner);
    runner.query = async (sql, ...arguments_) => {
      if (
        lightweight &&
        /^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(
          sql,
        )
      ) {
        readWrites++;
        assert.fail('A Planner read issued a write.');
      }
      const result = await query(sql, ...arguments_);
      if (lightweight && /^\s*(SELECT|WITH)\b/i.test(sql)) {
        readSelects++;
        const serialized = JSON.stringify(result);
        selectedBytes += Buffer.byteLength(serialized);
        assert(
          !serialized.includes('PRIVATE_TASK_HISTORY:'),
          'A capacity read hydrated full historical details from PostgreSQL.',
        );
        for (const row of Array.isArray(result) ? result : [])
          if (row && typeof row === 'object')
            for (const field of [
              'details',
              'submissions',
              'events',
              'creative',
              'history',
              'brief',
              'evidence',
            ])
              assert(
                !Object.hasOwn(row, field),
                `A lightweight read selected forbidden full ${field}.`,
              );
      }
      return result;
    };
    const light = async (action) => {
      lightweight = true;
      try {
        const value = await action();
        assert(!JSON.stringify(value).includes('PRIVATE_TASK_HISTORY:'));
        return value;
      } finally {
        lightweight = false;
      }
    };
    const summary = (
      input = {},
      person = fixture.people.admin,
      workspace = fixture.workspace,
    ) =>
      light(() =>
        reads.summary(
          ...identity(person, workspace),
          { startDate: DATE, timezone: TIMEZONE, ...input },
          undefined,
          NOW,
        ),
      );
    const assignments = (
      input = {},
      person = fixture.people.admin,
      workspace = fixture.workspace,
    ) =>
      light(() =>
        reads.assignments(
          ...identity(person, workspace),
          {
            startDate: DATE,
            timezone: TIMEZONE,
            memberId: fixture.people.admin.memberId,
            bucket: 'DAY',
            date: DATE,
            ...input,
          },
          undefined,
          NOW,
        ),
      );
    const allMembers = async (
      totalMemberCount = Object.keys(fixture.people).length,
    ) => {
      const result = [];
      let after = null;
      let pages = 0;
      do {
        const page = await summary({ after, limit: 25 });
        assert.equal(page.workspaceId, fixture.workspaceId);
        assert.equal(page.memberId, fixture.people.admin.memberId);
        assert.equal(
          page.userWorkspaceId,
          fixture.people.admin.userWorkspaceId,
        );
        assert.equal(page.startDate, DATE);
        assert.equal(page.endDate, DAYS[6]);
        assert(page.members.length <= 25);
        assert.equal(page.totalMemberCount, totalMemberCount);
        for (const warning of page.warnings)
          assert.equal(
            warning.scope,
            warning.code === 'INVALID_AVAILABILITY'
              ? 'SELECTED_WEEK'
              : 'OPEN_PLANNING',
          );
        result.push(...page.members);
        after = page.nextCursor;
        assert(++pages < 10);
      } while (after);
      assert(
        pages >= 3,
        'Teammate proof must exceed two pages, including tied names.',
      );
      assert.equal(result.length, totalMemberCount);
      assert.equal(
        new Set(result.map((row) => row.memberId)).size,
        result.length,
      );
      return result;
    };
    const allAssignments = async (input = {}) => {
      const result = [];
      let after = null;
      let totalCount;
      let pages = 0;
      do {
        const page = await assignments({ ...input, after, limit: 25 });
        assert(page.items.length <= 25);
        if (totalCount === undefined) totalCount = page.totalCount;
        assert.equal(page.totalCount, totalCount);
        result.push(...page.items);
        after = page.nextCursor;
        assert(++pages < 30);
      } while (after);
      assert.equal(result.length, totalCount);
      assert.equal(new Set(result.map(rowIdentity)).size, result.length);
      return result;
    };
    const expected = expectedAssignments(fixture);
    const members = await allMembers();
    const expectedIds = sorted(
      Object.values(fixture.people).map((person) => person.memberId),
    );
    assert.deepEqual(
      sorted(members.map((member) => member.memberId)),
      expectedIds,
    );
    for (const member of members) {
      assert.equal(member.days.length, 7);
      for (const day of member.days)
        assert.deepEqual(
          day,
          expectedDay(
            expected,
            member.memberId,
            day.date,
            fixture.availability,
          ),
          `Complete current-plan aggregate differs for ${member.memberId}/${day.date}.`,
        );
      assert.equal(
        member.needsPlanningCount,
        expected.filter(
          (row) =>
            row.ownerId === member.memberId && inBucket(row, 'NEEDS_PLANNING'),
        ).length,
      );
      assert.equal(
        member.overloadDays,
        member.days.filter((day) => day.overloadMinutes > 0).length,
      );
      assert.equal(
        member.incompleteDays,
        member.days.filter(
          (day) => day.unknownCount > 0 || day.availableMinutes === null,
        ).length,
      );
    }
    const adminRows = await allAssignments();
    assert(
      adminRows.length > 50,
      'Assignment proof must exceed two complete pages.',
    );
    const dualTask = fixture.tasks.find(
      (task) => task.scope === 'PRIMARY' && task.index === 4,
    );
    assert.equal(
      adminRows.filter((row) => row.taskId === dualTask.taskId).length,
      2,
      'One person can hold production and planned review assignments for the same open task.',
    );
    for (const [memberId, bucket, selectedDate] of [
      [fixture.people.admin.memberId, 'DAY', DATE],
      [fixture.people.reader.memberId, 'DAY', DATE],
      [fixture.people.writer.memberId, 'DAY', DATE],
      [fixture.people.admin.memberId, 'NEEDS_PLANNING', null],
      [fixture.people.reader.memberId, 'NEEDS_PLANNING', null],
      [null, 'DAY', DATE],
      [null, 'NEEDS_PLANNING', null],
      [null, 'UNAVAILABLE_OWNER', null],
    ]) {
      const actual = await allAssignments({
        memberId,
        bucket,
        date: selectedDate,
      });
      const selected = expected.filter(
        (row) =>
          (memberId === null ? !row.activeOwner : row.ownerId === memberId) &&
          (bucket === 'UNAVAILABLE_OWNER' ||
            inBucket(row, bucket, selectedDate)),
      );
      assert.deepEqual(
        sorted(actual.map(rowIdentity)),
        sorted(selected.map(rowIdentity)),
      );
      for (const row of actual) {
        const oracle = selected.find(
          (item) => rowIdentity(item) === rowIdentity(row),
        );
        for (const field of [
          'ownerId',
          'date',
          'workMinutes',
          'revisionMinutes',
          'waitMinutes',
          'unknownEffort',
          'unknownWait',
          'reviewerState',
        ])
          assert.deepEqual(
            row[field],
            oracle[field],
            `${rowIdentity(row)} ${field}`,
          );
        assert(!row.warnings.includes('PRIVATE_TASK_HISTORY:'));
        assert(
          !fixture.tasks.some(
            (task) => task.scope === 'FOREIGN' && task.taskId === row.taskId,
          ),
        );
      }
    }
    const planner = await light(() =>
      tasks.list(
        ...identity(),
        { view: 'PLANNER', timezone: TIMEZONE, limit: 25 },
        undefined,
        NOW,
      ),
    );
    assert.equal(planner.totalCount, 156);
    assert.equal(planner.items.length, 25);
    const filtered = await light(() =>
      tasks.list(
        ...identity(),
        {
          view: 'PLANNER',
          timezone: TIMEZONE,
          projectId: fixture.projects.first,
          limit: 25,
        },
        undefined,
        NOW,
      ),
    );
    assert.equal(filtered.totalCount, 137);
    assert.deepEqual(
      await allMembers(),
      members,
      'Task-card filters must not reduce complete capacity.',
    );
    const openTask = fixture.tasks.find(
      (task) => task.scope === 'PRIMARY' && task.index === 130,
    );
    const exact = await tasks.detail(...identity(), {
      taskId: openTask.taskId,
    });
    assert.equal(exact.task.id, openTask.taskId);
    assert(
      JSON.stringify(exact).includes('PRIVATE_TASK_HISTORY:'),
      'Only an explicitly opened exact drawer may retrieve its transitional history.',
    );
    await denied(() => summary({}, fixture.people.reader), [403]);
    await denied(
      () =>
        light(() =>
          tasks.list(
            ...identity(fixture.people.reader),
            { view: 'PLANNER', timezone: TIMEZONE },
            undefined,
            NOW,
          ),
        ),
      [403],
    );
    await denied(() => assignments({}, fixture.people.writer), [403]);
    await denied(
      () => summary({}, fixture.people.admin, fixture.foreignWorkspace),
      [403],
    );
    await denied(
      () =>
        reads.summary(
          fixture.workspace,
          fixture.people.admin.memberId,
          fixture.people.reader.userWorkspaceId,
          { startDate: DATE, timezone: TIMEZONE },
        ),
      [403],
    );
    for (const input of [
      { limit: 26 },
      { startDate: '2026-02-30' },
      { startDate: '9999-12-31' },
      { timezone: 'invalid/timezone' },
      { after: 'bad-cursor' },
      { unexpected: true },
    ])
      await denied(() => summary(input), [400]);
    for (const input of [
      { bucket: 'ALL' },
      { bucket: 'DAY', date: null },
      { bucket: 'DAY', date: '2026-11-05' },
      { memberId: randomUUID() },
      { limit: 26 },
    ])
      await denied(() => assignments(input), [400, 404]);
    const firstSummary = await summary();
    assert.equal(firstSummary.warningScope, 'OPEN_PLANNING');
    await denied(
      () => summary({ after: firstSummary.nextCursor, startDate: DAYS[1] }),
      [400],
    );
    const firstAssignments = await assignments();
    await denied(
      () =>
        assignments({
          after: firstAssignments.nextCursor,
          memberId: fixture.people.reader.memberId,
        }),
      [400],
    );
    const missing = await assignments({
      memberId: null,
      bucket: 'UNAVAILABLE_OWNER',
      date: null,
    });
    assert.equal(missing.selectionScope, 'OPEN_PLANNING');
    assert.equal(
      missing.totalCount,
      firstSummary.warnings
        .filter((warning) =>
          ['UNAVAILABLE_PRODUCTION_OWNER', 'UNAVAILABLE_REVIEW_OWNER'].includes(
            warning.code,
          ),
        )
        .reduce((sum, warning) => sum + warning.count, 0),
    );
    assert.deepEqual(
      await sourceFingerprint(runner.manager, fixture),
      baseline,
      'All reads, exact opens and denials must preserve every original source digest.',
    );
    const savepoint = async (name, action) => {
      const before = await sourceFingerprint(runner.manager, fixture);
      const savedTasks = copy(fixture.tasks);
      const savedBackups = copy(fixture.backups);
      const savedAvailability = copy(fixture.availability);
      await runner.query(`SAVEPOINT ${name}`);
      try {
        await action();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
        fixture.tasks = savedTasks;
        fixture.backups = savedBackups;
        fixture.availability = savedAvailability;
        fixture.backupEligible = true;
      }
      assert.deepEqual(
        await sourceFingerprint(runner.manager, fixture),
        before,
      );
    };
    await savepoint('capacity_availability', async () => {
      const before = await sourceFingerprint(runner.manager, fixture);
      const input = {
        memberId: fixture.people.reader.memberId,
        date: DATE,
        minutes: 0,
        revision: 1,
      };
      const saved = await availability.save(...identity(), input);
      assert.equal(saved.revision, 2);
      await denied(
        () => availability.save(...identity(), { ...input, minutes: 480 }),
        [409],
      );
      fixture.availability.find(
        (slot) => slot.memberId === input.memberId && slot.date === DATE,
      ).minutes = 0;
      fixture.availability.find(
        (slot) => slot.memberId === input.memberId && slot.date === DATE,
      ).revision = 2;
      const latest = (await allMembers()).find(
        (member) => member.memberId === input.memberId,
      );
      assert.deepEqual(
        latest.days[0],
        expectedDay(expected, input.memberId, DATE, fixture.availability),
      );
      await denied(
        () => availability.save(...identity(fixture.people.reader), input),
        [403],
      );
      await unchangedExcept(before, [
        'core.deliveryAvailability',
        'core.otogrowActivityEvent',
      ]);
    });
    await savepoint('capacity_invalid_availability', async () => {
      const invalidSlots = [
        { memberId: fixture.people.reader.memberId, minutes: -1 },
        { memberId: fixture.people.writer.memberId, minutes: 1441 },
      ];
      for (const invalid of invalidSlots) {
        const slot = fixture.availability.find(
          (candidate) =>
            candidate.memberId === invalid.memberId && candidate.date === DATE,
        );
        assert(slot);
        await runner.query(
          'UPDATE core."deliveryAvailability" SET minutes=$2 WHERE id=$1',
          [slot.id, invalid.minutes],
        );
        slot.minutes = invalid.minutes;
      }
      await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
        fixture.people.outsider.userId,
      ]);
      for (const [memberId, date, minutes] of [
        [fixture.people.outsider.memberId, DATE, -1],
        [fixture.people.reader.memberId, '2026-11-05', 1441],
      ])
        await runner.query(
          'INSERT INTO core."deliveryAvailability" (id,"workspaceId","memberId",date,minutes,revision) VALUES($1,$2,$3,$4,$5,7)',
          [randomUUID(), fixture.workspaceId, memberId, date, minutes],
        );
      const rawBaseline = await sourceFingerprint(runner.manager, fixture);
      const invalidSummary = await summary();
      assert.deepEqual(
        invalidSummary.warnings.find(
          (warning) => warning.code === 'INVALID_AVAILABILITY',
        ),
        { code: 'INVALID_AVAILABILITY', scope: 'SELECTED_WEEK', count: 2 },
      );
      assert.deepEqual(
        invalidSummary.warnings.filter(
          (warning) => warning.code !== 'INVALID_AVAILABILITY',
        ),
        firstSummary.warnings,
        'Inactive and outside-week invalid slots must not add warnings or change open-planning warning counts.',
      );
      const invalidMembers = await allMembers(
        Object.keys(fixture.people).length - 1,
      );
      for (const member of invalidMembers)
        for (const day of member.days)
          assert.deepEqual(
            day,
            expectedDay(
              expected,
              member.memberId,
              day.date,
              fixture.availability,
            ),
          );
      for (const invalid of invalidSlots) {
        const member = invalidMembers.find(
          (candidate) => candidate.memberId === invalid.memberId,
        );
        const day = member.days.find((candidate) => candidate.date === DATE);
        assert.equal(day.availableMinutes, null);
        assert.equal(day.availabilityInvalid, true);
        assert.equal(day.availabilityRevision, 1);
        assert.equal(day.overloadMinutes, 0);
        assert.equal(
          member.incompleteDays,
          member.days.filter(
            (candidate) =>
              candidate.unknownCount > 0 || candidate.availableMinutes === null,
          ).length,
        );
      }
      const reader = invalidMembers.find(
        (member) => member.memberId === fixture.people.reader.memberId,
      );
      assert.equal(reader.days[1].availableMinutes, 0);
      assert.equal(reader.days[1].availabilityInvalid, false);
      assert.equal(reader.days[6].availableMinutes, null);
      assert.equal(reader.days[6].availabilityInvalid, false);
      assert.equal(reader.days[2].availabilityRevision, 0);
      assert.equal(reader.days[2].availabilityInvalid, false);
      assert.deepEqual(
        await sourceFingerprint(runner.manager, fixture),
        rawBaseline,
        'Normalized invalid availability reads must preserve the exact raw rows, revisions and every unrelated source.',
      );
    });
    await savepoint('capacity_availability_interleaving', async () => {
      const original = await sourceFingerprint(runner.manager, fixture);
      const firstPage = await summary();
      const secondPage = await summary({ after: firstPage.nextCursor });
      assert(secondPage.nextCursor);
      const selectedPage = { after: secondPage.nextCursor };
      const targetId = fixture.people.reader.memberId;
      const slot = fixture.availability.find(
        (candidate) =>
          candidate.memberId === targetId && candidate.date === DATE,
      );
      assert(slot);
      await runner.query(
        'UPDATE core."deliveryAvailability" SET minutes=-1 WHERE id=$1',
        [slot.id],
      );
      slot.minutes = -1;
      const observedQuery = runner.query;
      let repairs = 0;
      runner.query = async (sql, ...arguments_) => {
        const result = await observedQuery(sql, ...arguments_);
        if (repairs === 0 && sql.includes("'INVALID_AVAILABILITY'")) {
          repairs++;
          // A fixture-only fault after the statement result exposes mixed aggregate reads without an external connection to uncommitted records.
          await query(
            'UPDATE core."deliveryAvailability" SET minutes=240,revision=2 WHERE id=$1',
            [slot.id],
          );
        }
        return result;
      };
      let beforeRepair;
      try {
        beforeRepair = await summary(selectedPage);
      } finally {
        runner.query = observedQuery;
      }
      assert.equal(
        repairs,
        1,
        'The controlled interleaving must repair exactly one owned availability slot after an aggregate statement returns.',
      );
      assert.deepEqual(
        beforeRepair.warnings.find(
          (warning) => warning.code === 'INVALID_AVAILABILITY',
        ),
        { code: 'INVALID_AVAILABILITY', scope: 'SELECTED_WEEK', count: 1 },
      );
      assert.deepEqual(
        beforeRepair.warnings.filter(
          (warning) => warning.code !== 'INVALID_AVAILABILITY',
        ),
        firstSummary.warnings,
      );
      const staleMember = beforeRepair.members.find(
        (member) => member.memberId === targetId,
      );
      assert(
        staleMember,
        'The controlled interleaving must inspect the page containing the repaired slot.',
      );
      const staleDay = staleMember.days.find((day) => day.date === DATE);
      assert.equal(staleDay.availableMinutes, null);
      assert.equal(staleDay.availabilityInvalid, true);
      assert.equal(staleDay.availabilityRevision, 1);
      for (const member of beforeRepair.members)
        for (const day of member.days)
          assert.deepEqual(
            day,
            expectedDay(
              expected,
              member.memberId,
              day.date,
              fixture.availability,
            ),
            'Warning and day aggregates must describe the same source snapshot despite a repair after the aggregate result.',
          );
      slot.minutes = 240;
      slot.revision = 2;
      const repairedBaseline = await sourceFingerprint(runner.manager, fixture);
      const afterRepair = await summary(selectedPage);
      assert.deepEqual(
        afterRepair.warnings,
        firstSummary.warnings,
        'The next summary must observe the completed repair and remove its selected-week warning.',
      );
      const repairedMember = afterRepair.members.find(
        (member) => member.memberId === targetId,
      );
      assert(repairedMember);
      const repairedDay = repairedMember.days.find((day) => day.date === DATE);
      assert.equal(repairedDay.availableMinutes, 240);
      assert.equal(repairedDay.availabilityInvalid, false);
      assert.equal(repairedDay.availabilityRevision, 2);
      for (const member of afterRepair.members)
        for (const day of member.days)
          assert.deepEqual(
            day,
            expectedDay(
              expected,
              member.memberId,
              day.date,
              fixture.availability,
            ),
          );
      assert.deepEqual(
        await sourceFingerprint(runner.manager, fixture),
        repairedBaseline,
        'Both aggregate summaries must preserve the exact repaired source and every unrelated row.',
      );
      await unchangedExcept(original, ['core.deliveryAvailability']);
    });
    await savepoint('capacity_plan', async () => {
      const before = await sourceFingerprint(runner.manager, fixture);
      const target = fixture.tasks.find(
        (task) => task.scope === 'PRIMARY' && task.index === 2,
      );
      const plan = {
        workMinutes: 0,
        revisionMinutes: 0,
        waitMinutes: 0,
        reviewMinutes: 0,
        reviewDate: DATE,
        complexity: 'STANDARD',
      };
      const result = await tasks.command(...identity(), {
        action: 'plan',
        taskId: target.taskId,
        revision: 1,
        plan,
      });
      assert.equal(result.revision, 2);
      await denied(
        () =>
          tasks.command(...identity(), {
            action: 'plan',
            taskId: target.taskId,
            revision: 1,
            plan,
          }),
        [409],
      );
      target.details.plan = plan;
      for (const member of await allMembers())
        for (const day of member.days)
          assert.deepEqual(
            day,
            expectedDay(
              expectedAssignments(fixture),
              member.memberId,
              day.date,
              fixture.availability,
            ),
          );
      await unchangedExcept(before, [
        'core.deliveryTask',
        'native.task',
        'core.otogrowActivityEvent',
      ]);
    });
    await savepoint('capacity_backup_revoked', async () => {
      const backup = fixture.backups[0];
      const priorCursor = (await summary()).nextCursor;
      const before = await assignments({ memberId: backup.reviewerId });
      assert(before.items.some((row) => row.taskId === backup.taskId));
      await runner.query(
        'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
        [fixture.roles.writer, []],
      );
      fixture.backupEligible = false;
      await denied(() => summary({ after: priorCursor }), [400]);
      const retained = await allAssignments({ memberId: backup.reviewerId });
      const row = retained.find((item) => item.taskId === backup.taskId);
      assert(
        row,
        'An explicit unavailable backup keeps its reservation; do not silently fall back to primary.',
      );
      assert.equal(row.reviewerState, 'UNAVAILABLE');
      assert(
        (await summary()).warnings.some(
          (warning) =>
            warning.code === 'UNAVAILABLE_REVIEWER' && warning.count > 0,
        ),
      );
      const member = (await allMembers()).find(
        (item) => item.memberId === backup.reviewerId,
      );
      assert(member.days[0].unavailableReviewCount > 0);
    });
    await savepoint('capacity_backup_latest', async () => {
      const backup = fixture.backups[0];
      const task = fixture.tasks.find((item) => item.taskId === backup.taskId);
      task.details.submissions.push({
        ...task.details.submissions.at(-1),
        version: 14,
      });
      await runner.query(
        'UPDATE core."deliveryTask" SET details=$3 WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, task.taskId, task.details],
      );
      assert(
        !(await allAssignments({ memberId: backup.reviewerId })).some(
          (row) => row.taskId === task.taskId,
        ),
        'A prior-submission backup cannot claim the new review.',
      );
      assert(
        (await allAssignments()).some((row) => row.taskId === task.taskId),
      );
    });
    await savepoint('capacity_project_revoked', async () => {
      const backup = fixture.backups[0];
      await runner.query(
        'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
        [
          fixture.projects.first,
          JSON.stringify([fixture.people.reader.memberId]),
        ],
      );
      const row = (await allAssignments({ memberId: backup.reviewerId })).find(
        (item) => item.taskId === backup.taskId,
      );
      assert(row);
      assert.equal(row.reviewerState, 'UNAVAILABLE');
    });
    await savepoint('capacity_disabled_owner', async () => {
      await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
        fixture.people.reader.userId,
      ]);
      const missing = await allAssignments({
        memberId: null,
        bucket: 'NEEDS_PLANNING',
        date: null,
      });
      assert(
        missing.some((row) => row.ownerId === fixture.people.reader.memberId),
      );
      assert(
        (await summary()).warnings.some(
          (warning) =>
            warning.code === 'UNAVAILABLE_PRODUCTION_OWNER' &&
            warning.count > 0,
        ),
      );
    });
    await savepoint('capacity_manager_revoked', async () => {
      await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
        fixture.people.admin.userId,
      ]);
      await denied(() => summary(), [403]);
      await denied(() => assignments(), [403]);
    });
    await savepoint('capacity_role_revoked', async () => {
      await runner.query(
        'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
        [fixture.roles.secondWriter, ['delivery.manage']],
      );
      assert.equal(
        (await summary({}, fixture.people.secondWriter)).totalMemberCount,
        Object.keys(fixture.people).length,
      );
      await runner.query(
        'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
        [fixture.roles.secondWriter, []],
      );
      await denied(() => summary({}, fixture.people.secondWriter), [403]);
      await denied(() => assignments({}, fixture.people.secondWriter), [403]);
    });
    await savepoint('capacity_deleted_task', async () => {
      const target = fixture.tasks.find(
        (task) => task.scope === 'PRIMARY' && task.index === 4,
      );
      await runner.query(
        `UPDATE ${quote(fixture.schemaName)}.task SET "deletedAt"=$2 WHERE id=$1`,
        [target.taskId, NOW],
      );
      assert(
        !(await allAssignments()).some((row) => row.taskId === target.taskId),
      );
    });
    assert.equal(legacyCalls, 0);
    assert.equal(readWrites, 0);
    assert(readSelects > 0);
    assert.deepEqual(
      await sourceFingerprint(runner.manager, fixture),
      baseline,
    );
    console.log(
      JSON.stringify({
        result: 'PASS rollback-only actual-service Planner capacity reads',
        teammates: members.length,
        localTasks: 156,
        foreignTasks: 11,
        completeAdminDayAssignments: adminRows.length,
        readSelects,
        selectedBytes,
        legacySnapshotCalls: legacyCalls,
        fullHistoryRead: false,
        preservedSourceDigests: true,
        controlledAvailabilityInterleaving: true,
        externalCalls: false,
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

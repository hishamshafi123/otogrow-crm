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
  recordDeliveryReviewNotice,
} = require('../dist/modules/delivery/reviews/delivery-review-notices');
const {
  createReviewsFixture,
  buildReviewsServices,
  reviewsHarness,
  NOW,
  copy,
  denied,
} = require('./check-delivery-reviews-support.cjs');
const {
  sourceFingerprint,
} = require('./check-delivery-task-reads-support.cjs');
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
    const fixture = await createReviewsFixture(runner.manager);
    for (const item of fixture.queueTasks) {
      const [{ details }] = await runner.query(
        'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, item.taskId],
      );
      const sentinel = `PRIVATE_TASK_HISTORY:${fixture.workspaceId}:${item.taskId}:${'x'.repeat(1024)}`;
      details.brief = sentinel;
      details.events = Array.from({ length: 24 }, () => ({
        id: randomUUID(),
        actorId: fixture.people.writer.memberId,
        action: 'COMMENT',
        text: sentinel,
        at: NOW.toISOString(),
      }));
      details.submissions = [
        ...Array.from({ length: 12 }, (_, index) => ({
          ...copy(details.submissions[0]),
          version: index + 1,
          description: sentinel,
          decision: 'CHANGES_REQUESTED',
          reviewedBy: fixture.people.admin.memberId,
          reviewedAt: NOW.toISOString(),
          feedback: sentinel,
        })),
        { ...details.submissions[0], version: 13, description: sentinel },
      ];
      await runner.query(
        'UPDATE core."deliveryTask" SET details=$3 WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, item.taskId, details],
      );
    }
    await recordDeliveryReviewNotice(runner.manager, fixture.workspaceId, {
      taskId: fixture.taskId,
      submissionVersion: 2,
      assignmentId: null,
      assignmentRevision: 0,
      previousRecipientId: null,
      recipientId: fixture.people.admin.memberId,
      eligible: true,
      senderId: fixture.people.writer.memberId,
      now: NOW,
    });
    const [{ id: operationsId, state: seededState }] = await runner.query(
      'SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    const hiddenMessage = {
      id: randomUUID(),
      taskId: fixture.taskId,
      recipientId: fixture.people.admin.memberId,
      senderId: fixture.people.writer.memberId,
      kind: 'MESSAGE',
      text: 'Synthetic individual message remains independently unread.',
      createdAt: NOW.toISOString(),
      remindAt: new Date(NOW.getTime() + 300000).toISOString(),
      seenAt: null,
      acknowledgedAt: null,
      cancelled: false,
      sendState: 'PENDING',
      attemptedAt: null,
      error: null,
    };
    seededState.notices.push(hiddenMessage);
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
      [operationsId, seededState],
    );
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const services = buildReviewsServices(source, fixture);
    const tests = reviewsHarness(services, fixture);
    const tasks = new DeliveryTasksService(
      source,
      services.delivery,
      services.access,
      services.operations,
      createIsolatedNativeTaskAccess(),
    );
    const identity = (
      person = fixture.people.admin,
      workspace = fixture.workspace,
    ) => [workspace, person.memberId, person.userWorkspaceId];
    const fingerprint = () => sourceFingerprint(runner.manager, fixture);
    const baseline = await fingerprint();
    let legacyCalls = 0;
    let acknowledging = false;
    let acknowledgementDetailHydrations = 0;
    const readTask = services.reviews.readTask.bind(services.reviews);
    services.reviews.readTask = async (...arguments_) => {
      if (acknowledging) {
        acknowledgementDetailHydrations++;
        throw new Error(
          'A thin acknowledgement must not rebuild the current review detail.',
        );
      }
      return readTask(...arguments_);
    };
    for (const [service, method] of [
      [services.delivery, 'snapshot'],
      [services.operations, 'snapshot'],
      [services.operations, 'command'],
    ])
      service[method] = async () => {
        legacyCalls++;
        throw new Error(`Approvals cannot call legacy ${method}.`);
      };
    let observingLight = false;
    let lightweightSelects = 0;
    const nativeQuery = runner.query.bind(runner);
    runner.query = async (sql, ...arguments_) => {
      if (
        observingLight &&
        /^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(
          sql,
        )
      )
        assert.fail('Approvals context or queue issued a write.');
      const result = await nativeQuery(sql, ...arguments_);
      if (observingLight && /^\s*(SELECT|WITH)\b/i.test(sql)) {
        lightweightSelects++;
        assert(
          !JSON.stringify(result).includes('PRIVATE_TASK_HISTORY:'),
          'A cold Approvals read hydrated full historical task details.',
        );
        for (const row of Array.isArray(result) ? result : [])
          if (row && typeof row === 'object')
            for (const key of [
              'details',
              'brief',
              'submissions',
              'events',
              'creative',
              'history',
            ])
              assert(!Object.hasOwn(row, key));
      }
      return result;
    };
    const light = async (callback) => {
      observingLight = true;
      try {
        return await callback();
      } finally {
        observingLight = false;
      }
    };
    const context = await light(() => tasks.context(...identity()));
    assert.equal(Object.hasOwn(context, 'tasks'), false);
    assert.equal(context.actor.isManager, true);
    const conditional = await light(() =>
      tasks.context(...identity(fixture.people.reader)),
    );
    assert.equal(conditional.actor.isManager, false);
    assert.deepEqual(conditional.actor.capabilities, ['delivery.review']);
    const items = [];
    let after = null;
    do {
      const page = await light(() => tests.queue({ after, limit: 25 }));
      assert.equal(page.totalCount, 54);
      assert(page.items.length <= 25);
      items.push(...page.items);
      after = page.nextCursor;
    } while (after);
    assert.equal(items.length, 54);
    assert.equal(new Set(items.map((item) => item.taskId)).size, 54);
    const offPage = items[52];
    assert(!items.slice(0, 25).some((item) => item.taskId === offPage.taskId));
    const offPageDetail = await tasks.detail(...identity(), {
      taskId: offPage.taskId,
    });
    assert.equal(offPageDetail.task.id, offPage.taskId);
    assert.equal(
      offPageDetail.task.details.submissions.at(-1).version,
      offPage.submissionVersion,
    );
    assert(JSON.stringify(offPageDetail).includes('PRIVATE_TASK_HISTORY:'));
    const primary = await tests.task();
    assert.equal(primary.assignmentNotice.assignmentId, null);
    assert.equal(primary.assignmentNotice.assignmentRevision, 0);
    assert.deepEqual(
      await fingerprint(),
      baseline,
      'Cold queue, exact off-page detail and current review reads must preserve every source.',
    );
    const receiptInput = (snapshot) => ({
      taskId: snapshot.taskId,
      taskRevision: snapshot.taskRevision,
      submissionVersion: snapshot.assignment.submissionVersion,
      assignmentRevision: snapshot.assignment.revision,
      noticeId: snapshot.assignmentNotice.id,
    });
    const acknowledge = async (
      input,
      person = fixture.people.admin,
      workspace = fixture.workspace,
      now = NOW,
    ) => {
      acknowledging = true;
      try {
        return await services.reviews.acknowledge(
          ...identity(person, workspace),
          input,
          now,
        );
      } finally {
        acknowledging = false;
      }
    };
    const state = async () =>
      (
        await runner.query(
          'SELECT state FROM core."deliveryOperations" WHERE id=$1',
          [operationsId],
        )
      )[0].state;
    const exactOperations = async (before, noticeId, field, value) => {
      const expected = copy(before);
      expected.notices.find((notice) => notice.id === noticeId)[field] = value;
      assert.deepEqual(
        await state(),
        expected,
        'A typed review receipt may change only its exact current review notice field.',
      );
    };
    const unchangedExcept = async (before, allowed) => {
      const current = await fingerprint();
      for (const [table, value] of Object.entries(before))
        if (!allowed.includes(table))
          assert.equal(
            current[table],
            value,
            `Review action changed unrelated ${table}.`,
          );
    };
    const savepoint = async (name, callback) => {
      const before = await fingerprint();
      await runner.query(`SAVEPOINT ${name}`);
      try {
        await callback();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
      assert.deepEqual(await fingerprint(), before);
    };
    await savepoint('review_receipt', async () => {
      const input = receiptInput(primary);
      const before = await fingerprint();
      for (const patch of [
        { taskRevision: input.taskRevision + 1 },
        { submissionVersion: 1 },
        { assignmentRevision: 1 },
        { noticeId: randomUUID() },
        { noticeId: hiddenMessage.id },
      ])
        await denied(
          () => acknowledge({ ...input, ...patch }),
          [400, 403, 404, 409],
        );
      await denied(() => acknowledge(input, fixture.people.reader), [403, 404]);
      await denied(
        () =>
          acknowledge(input, fixture.people.admin, fixture.foreignWorkspace),
        [403, 404],
      );
      assert.deepEqual(await fingerprint(), before);
      const beforeSeen = await state();
      const seen = await tests.seen(primary);
      assert(seen.assignmentNotice.seenAt);
      await exactOperations(
        beforeSeen,
        input.noticeId,
        'seenAt',
        NOW.toISOString(),
      );
      const beforeAcknowledgement = await state();
      const acknowledgedAt = new Date(NOW.getTime() + 1000).toISOString();
      const receipt = await acknowledge(
        input,
        fixture.people.admin,
        fixture.workspace,
        new Date(acknowledgedAt),
      );
      assert.deepEqual(receipt, {
        workspaceId: fixture.workspaceId,
        memberId: fixture.people.admin.memberId,
        userWorkspaceId: fixture.people.admin.userWorkspaceId,
        ...input,
        acknowledgedAt,
      });
      assert(Buffer.byteLength(JSON.stringify(receipt)) < 1000);
      await exactOperations(
        beforeAcknowledgement,
        input.noticeId,
        'acknowledgedAt',
        acknowledgedAt,
      );
      const afterAcknowledgement = await fingerprint();
      assert.deepEqual(
        await acknowledge(
          input,
          fixture.people.admin,
          fixture.workspace,
          new Date(NOW.getTime() + 10000),
        ),
        receipt,
      );
      assert.deepEqual(
        await fingerprint(),
        afterAcknowledgement,
        'An exact authorized retry must retain one original acknowledgement without source churn.',
      );
      await unchangedExcept(before, ['core.deliveryOperations']);
      await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
        fixture.people.admin.userId,
      ]);
      const revoked = await fingerprint();
      await denied(() => acknowledge(input), [403]);
      assert.deepEqual(
        await fingerprint(),
        revoked,
        'Revocation is checked before an acknowledgement retry.',
      );
    });
    await savepoint('review_primary_continuity', async () => {
      const original = await tests.task();
      const input = receiptInput(original);
      const originalState = await state();
      const saved = await tests.assign(original, {
        mode: 'PRIMARY',
        reviewerId: null,
        reason:
          'Synthetic same-owner primary reason preserves row-zero notice.',
      });
      assert.equal(saved.assignment.revision, 1);
      const current = saved.taskReview;
      assert.equal(current.assignmentNotice.id, input.noticeId);
      assert.equal(current.assignmentNotice.assignmentRevision, 0);
      assert.deepEqual(
        current.assignmentNotice,
        original.assignmentNotice,
        'A same-owner PRIMARY reason edit must preserve the original row-zero notice identity, attribution and deadline.',
      );
      assert.deepEqual(
        await state(),
        originalState,
        'A same-owner reason edit must not cancel, replace or retime any notice.',
      );
      const before = await fingerprint();
      await denied(() => acknowledge(input), [409]);
      assert.deepEqual(await fingerprint(), before);
      const currentInput = receiptInput(current);
      const receipt = await acknowledge(currentInput);
      assert.equal(receipt.assignmentRevision, 1);
      assert.equal(receipt.noticeId, input.noticeId);
      assert.equal(
        (await state()).notices.find((notice) => notice.id === input.noticeId)
          .reviewAssignment.assignmentRevision,
        0,
      );
    });
    await savepoint('review_replaced_submission', async () => {
      const input = receiptInput(await tests.task());
      await acknowledge(input);
      const [{ details }] = await runner.query(
        'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, fixture.taskId],
      );
      details.submissions.push({
        ...copy(details.submissions.at(-1)),
        version: 3,
      });
      await runner.query(
        'UPDATE core."deliveryTask" SET details=$3 WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, fixture.taskId, details],
      );
      const replaced = await fingerprint();
      await denied(() => acknowledge(input), [409]);
      assert.deepEqual(
        await fingerprint(),
        replaced,
        'A previously acknowledged receipt cannot bypass current submission validation.',
      );
    });
    await savepoint('review_backup_journey', async () => {
      const saved = await tests.assign(await tests.task());
      assert.equal(saved.assignment.mode, 'BACKUP');
      assert.equal(saved.taskReview.canReviewSubmission, false);
      const owned = await tests.task({}, fixture.people.reader);
      assert.equal(owned.canReviewSubmission, true);
      const input = receiptInput(owned);
      await denied(() => acknowledge(input), [403, 404]);
      const before = await fingerprint();
      await tests.seen(owned, {}, fixture.people.reader);
      const receipt = await acknowledge(input, fixture.people.reader);
      assert.equal(receipt.memberId, fixture.people.reader.memberId);
      await unchangedExcept(before, ['core.deliveryOperations']);
      await runner.query(
        'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
        [fixture.roles.reader, []],
      );
      const revoked = await fingerprint();
      await denied(() => acknowledge(input, fixture.people.reader), [403]);
      assert.deepEqual(await fingerprint(), revoked);
      await runner.query(
        'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
        [fixture.roles.reader, ['delivery.review']],
      );
      await tests.assign(await tests.task(), {
        mode: 'PRIMARY',
        reviewerId: null,
        reason:
          'Synthetic restoration before exact independent final decision.',
      });
      const current = await tests.task();
      const command = {
        action: 'review',
        taskId: fixture.taskId,
        revision: current.taskRevision,
        decision: 'APPROVED',
        feedback: 'Synthetic exact independently checked approval.',
        selectedSubmissionVersion: 2,
        creativeVersion: 2,
        finalAssetId: fixture.assets.image,
        reviewAssignmentRevision: current.assignment.revision,
        workflowReview: { checkedIds: ['quality'] },
      };
      await denied(
        () =>
          tasks.command(...identity(), {
            ...command,
            workflowReview: { checkedIds: [] },
          }),
        [400],
      );
      await denied(
        () => tasks.command(...identity(fixture.people.writer), command),
        [403],
      );
      const result = await tasks.command(...identity(), command);
      assert.equal(result.taskId, fixture.taskId);
      assert.equal(result.state, 'APPROVED');
      assert.equal(result.revision, current.taskRevision + 1);
      const decided = await fingerprint();
      await denied(() => acknowledge(input, fixture.people.reader), [403, 409]);
      assert.deepEqual(await fingerprint(), decided);
      assert.equal((await light(() => tests.queue())).totalCount, 53);
      assert.equal(
        (await state()).notices.find((notice) => notice.id === hiddenMessage.id)
          .acknowledgedAt,
        null,
      );
      assert.equal(
        (await state()).notices.find((notice) => notice.id === hiddenMessage.id)
          .seenAt,
        null,
      );
    });
    assert.equal(legacyCalls, 0);
    assert.equal(acknowledgementDetailHydrations, 0);
    assert(lightweightSelects > 0);
    assert.deepEqual(await fingerprint(), baseline);
    console.log(
      JSON.stringify({
        result:
          'PASS rollback-only typed Approvals reads and exact acknowledgement',
        pendingSources: 54,
        historicalQueueTasks: 53,
        legacySnapshotOrCommandCalls: legacyCalls,
        acknowledgementDetailHydrations,
        lightweightSelects,
        exactOffPageDetail: true,
        exactSeenAndAcknowledgement: true,
        rowZeroPrimaryContinuity: true,
        conditionalBackupAuthority: true,
        protectedSourceDigests: true,
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

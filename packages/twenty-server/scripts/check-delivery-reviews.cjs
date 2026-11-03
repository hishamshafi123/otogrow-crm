const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  NOW,
  copy,
  createReviewsFixture,
  buildReviewsServices,
  reviewsHarness,
  sourceFingerprint,
  alterDetails,
  denied,
  correction,
} = require('./check-delivery-reviews-support.cjs');
function checkFounderReviewWait(fixture, pending) {
  const {
    founderTaskExceptions,
  } = require('../dist/modules/delivery/founder/delivery-founder.policy');
  const {
    matchFounderEscalation,
    founderEscalationSourceVerified,
  } = require('../dist/modules/delivery/founder/escalation/delivery-founder-escalation.policy');
  const task = {
    id: fixture.taskId,
    title: 'Synthetic delegated review',
    projectId: fixture.projects.first,
    revision: pending.taskRevision,
    state: 'IN_REVIEW',
    assigneeId: fixture.people.writer.memberId,
    reviewerId: fixture.people.admin.memberId,
    dueAt: null,
    updatedAt: NOW.toISOString(),
    nativeUpdatedAt: NOW.toISOString(),
    review: {
      effectiveReviewerId: pending.effectiveReviewerId,
      reviewerState: pending.reviewerState,
      assignmentRevision: pending.assignmentRevision,
    },
  };
  const items = founderTaskExceptions(
    task,
    [
      { id: fixture.people.admin.memberId, name: 'Primary manager' },
      { id: fixture.people.reader.memberId, name: 'Independent backup' },
    ],
    'Synthetic project',
    NOW,
    undefined,
    [{ version: pending.submissionVersion, submittedAt: pending.submittedAt }],
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].ownerId, fixture.people.reader.memberId);
  assert.equal(items[0].evidence.reviewSubmissionVersion, 2);
  const rule = {
    condition: 'TASK_REVIEW_WAIT',
    minimumReviewWaitHours: 1,
    projectScope: 'ALL',
    projectIds: [],
    includeCompany: true,
    currency: null,
  };
  const matched = matchFounderEscalation(rule, items, NOW);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].key, `TASK_REVIEW:${fixture.taskId}:2`);
  assert.equal(
    matchFounderEscalation(
      { ...rule, condition: 'TASK_REVIEW', minimumReviewWaitHours: null },
      items,
      NOW,
    )[0].key,
    `TASK:${fixture.taskId}`,
  );
  for (const reviewSubmittedAt of [
    null,
    new Date(NOW.getTime() + 3600000).toISOString(),
  ]) {
    const unknown = copy(items);
    unknown[0].evidence.reviewSubmittedAt = reviewSubmittedAt;
    assert.equal(matchFounderEscalation(rule, unknown, NOW).length, 0);
    assert.equal(
      founderEscalationSourceVerified(
        rule,
        unknown,
        [`TASK:${fixture.taskId}`],
        matched[0].key,
        NOW,
      ),
      false,
    );
    unknown[0].evidence.reviewSubmissionVersion = 3;
    assert.equal(
      founderEscalationSourceVerified(
        rule,
        unknown,
        [`TASK:${fixture.taskId}`],
        matched[0].key,
        NOW,
      ),
      true,
      'A verified replacement version clears the older exact occurrence without claiming the new date is known.',
    );
  }
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
    const fixture = await createReviewsFixture(runner.manager),
      source = {
        manager: runner.manager,
        getRepository: (entity) => runner.manager.getRepository(entity),
        query: (...arguments_) => runner.query(...arguments_),
        transaction: (callback) => runner.manager.transaction(callback),
      };
    const services = buildReviewsServices(source, fixture),
      tests = reviewsHarness(services, fixture),
      { people } = fixture;
    const unchanged = async (before) =>
      assert.deepEqual(
        await sourceFingerprint(runner.manager, fixture),
        before,
        'Backup assignment/annotations must leave canonical ownership, production, approval, finance, fulfilment and budgets unchanged.',
      );
    const baseline = await sourceFingerprint(runner.manager, fixture);
    const primary = await tests.task();
    assert.equal(primary.assignment.mode, 'PRIMARY');
    assert.equal(primary.assignment.revision, 0);
    assert.equal(primary.canReviewSubmission, true);
    assert.equal(primary.canApprove, true);
    assert.equal(
      (await tests.task({}, people.reader)).canReviewSubmission,
      false,
    );
    const actor = await services.delivery.actor(
      fixture.workspace,
      people.reader.memberId,
      people.reader.userWorkspaceId,
      runner.manager,
    );
    assert.equal(actor.isManager, false);
    assert.equal(actor.isAdmin, false);
    assert.deepEqual(actor.capabilities, ['delivery.review']);
    const all = [];
    let after = null;
    let first;
    do {
      const page = await tests.queue({ after, limit: 25 });
      first ??= page;
      assert.equal(page.totalCount, 54);
      assert.equal(page.unknownAgeCount, 3);
      assert.equal(page.unavailableReviewerCount, 0);
      all.push(...page.items);
      after = page.nextCursor;
    } while (after);
    assert.equal(all.length, 54);
    assert.equal(new Set(all.map((row) => row.taskId)).size, 54);
    assert.equal(all[0].taskId, fixture.queueTasks[49].taskId);
    assert.equal(all.filter((row) => row.ageState !== 'VALID').length, 3);
    assert(all.slice(-3).every((row) => row.ageSeconds === null));
    assert.equal(
      all.find((row) => row.taskId === fixture.queueTasks[0].taskId).ageSeconds,
      3600,
    );
    const later = await services.reviews.queue(
      fixture.workspace,
      people.admin.memberId,
      people.admin.userWorkspaceId,
      { projectId: fixture.projects.first, after: first.nextCursor, limit: 25 },
      new Date(NOW.getTime() + 1000),
    );
    assert.equal(
      later.items.length,
      25,
      'Elapsed age alone must not invalidate queue paging.',
    );
    assert.equal((await tests.queue({}, people.reader)).totalCount, 54);
    assert.equal(
      (await tests.queue({ mine: true }, people.reader)).totalCount,
      0,
    );
    await denied(() => tests.queue({}, people.outsider), [403]);
    await denied(
      () => tests.task({ taskId: fixture.otherTaskId }, people.reader),
      [404],
    );
    await denied(
      () => tests.task({}, people.admin, fixture.foreignWorkspace),
      [403],
    );
    await denied(() => tests.assign(primary, {}, people.reader), [403]);
    for (const reviewerId of [
      people.writer.memberId,
      people.outsider.memberId,
      randomUUID(),
    ])
      await denied(() => tests.assign(primary, { reviewerId }), [400]);
    await denied(() => tests.assign(primary, { reason: '' }), [400]);
    await denied(
      () => tests.assign(primary, { taskRevision: primary.taskRevision + 1 }),
      [409],
    );
    await denied(() => tests.assign(primary, { submissionVersion: 1 }), [409]);
    const commandId = randomUUID(),
      assigned = await tests.assign(primary, { commandId });
    assert.equal(assigned.assignment.revision, 1);
    assert.equal(
      assigned.taskReview.pending.primaryReviewerId,
      people.admin.memberId,
    );
    assert.equal(
      assigned.taskReview.pending.effectiveReviewerId,
      people.reader.memberId,
    );
    assert.equal(assigned.taskReview.canReviewSubmission, false);
    checkFounderReviewWait(fixture, assigned.taskReview.pending);
    assert.equal((await tests.assign(primary, { commandId })).replayed, true);
    await denied(
      () => tests.assign(primary, { commandId, reason: 'Changed payload' }),
      [409],
    );
    await denied(() => tests.assign(primary), [409]);
    await denied(() => tests.queue({ after: first.nextCursor }), [409]);
    let backup = await tests.task({}, people.reader);
    assert.equal(backup.canReviewSubmission, true);
    assert.equal(backup.canApprove, true);
    assert.equal(backup.canManageAssignment, false);
    assert.deepEqual(backup.eligibleReviewers, []);
    assert.equal(backup.pending.requiredCheckCount, 1);
    await denied(
      () =>
        tests.decide(
          backup,
          { workflowReview: { checkedIds: [] } },
          people.reader,
        ),
      [400],
    );
    await denied(
      () =>
        tests.decide(
          backup,
          { workflowReview: { checkedIds: ['wrong-version-check'] } },
          people.reader,
        ),
      [400],
    );
    assert.equal(
      (await tests.queue({ mine: true }, people.reader)).totalCount,
      1,
    );
    const target = (await tests.creative.read({}, people.reader)).selected;
    const feedback = (
      await tests.creative.create(
        target,
        {
          body: 'Backup independent reviewer can resolve this exact file note.',
        },
        people.writer,
      )
    ).feedback;
    await denied(
      () => tests.creative.change(feedback, 'RESOLVED', correction(target)),
      [403],
    );
    const resolved = await tests.creative.change(
      feedback,
      'RESOLVED',
      correction(target),
      people.reader,
    );
    assert.equal(resolved.feedback.status, 'RESOLVED');
    await denied(() => tests.decide(primary), [409]);
    await denied(
      () =>
        tests.decide(
          backup,
          { reviewAssignmentRevision: undefined },
          people.reader,
        ),
      [409],
    );
    await denied(
      () =>
        services.creative.modify(
          fixture.workspace,
          people.reader.memberId,
          people.reader.userWorkspaceId,
          fixture.taskId,
          backup.taskRevision,
          () => undefined,
          'NO_PRODUCTION_WRITE',
          true,
        ),
      [403],
    );
    await unchanged(baseline);
    await runner.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, []],
    );
    const unavailable = await tests.task();
    assert.equal(unavailable.pending.reviewerState, 'UNAVAILABLE');
    assert.equal(
      unavailable.pending.effectiveReviewerId,
      people.reader.memberId,
    );
    assert.equal(unavailable.canReviewSubmission, false);
    assert.equal((await tests.creative.read()).canResolve, false);
    await denied(() => tests.decide(backup, {}, people.reader), [403]);
    assert.equal(
      (await tests.task({}, people.reader)).canReviewSubmission,
      false,
      'Role loss revokes decisions, not existing project reads.',
    );
    await denied(() => tests.queue({}, people.reader), [403]);
    await runner.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, ['delivery.review']],
    );
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
      [
        fixture.projects.first,
        JSON.stringify([people.writer.memberId, people.secondWriter.memberId]),
      ],
    );
    await denied(() => tests.task({}, people.reader), [404]);
    await denied(() => tests.history({}, people.reader), [404]);
    await denied(() => tests.creative.read({}, people.reader), [404]);
    assert.equal((await tests.task()).pending.reviewerState, 'UNAVAILABLE');
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
      [
        fixture.projects.first,
        JSON.stringify([
          people.writer.memberId,
          people.reader.memberId,
          people.secondWriter.memberId,
        ]),
      ],
    );
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.reader.userId,
    ]);
    assert.equal((await tests.task()).pending.reviewerState, 'UNAVAILABLE');
    await denied(() => tests.decide(backup, {}, people.reader), [403]);
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      people.reader.userId,
    ]);
    let current = await tests.task();
    for (let index = 0; index < 27; index++) {
      const result = await tests.assign(current, {
        mode: index % 2 === 0 ? 'PRIMARY' : 'BACKUP',
        reviewerId: index % 2 === 0 ? null : people.reader.memberId,
        reason: `Exact revision history ${index}`,
      });
      current = result.taskReview;
    }
    const history = await tests.history();
    assert.equal(history.events.length, 25);
    assert(history.nextBeforeId);
    const older = await tests.history({ beforeId: history.nextBeforeId });
    assert.equal(
      new Set([...history.events, ...older.events].map((row) => row.id)).size,
      28,
    );
    assert(
      [...history.events, ...older.events].every(
        (row) => row.primaryReviewerId === people.admin.memberId,
      ),
    );
    assert(
      [...history.events, ...older.events].some(
        (row) => row.previousReviewerId === people.reader.memberId,
      ),
    );
    await denied(() => tests.history({ beforeId: randomUUID() }), [404]);
    const replayCurrent = await tests.assign(primary, { commandId });
    assert.equal(replayCurrent.replayed, true);
    assert.equal(
      replayCurrent.assignment.revision,
      current.assignment.revision,
    );
    assert.equal(replayCurrent.assignment.mode, current.assignment.mode);
    await unchanged(baseline);
    const [stored] = await runner.query(
      'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, fixture.taskId],
    );
    const original = copy(stored.details);
    await alterDetails(runner.manager, fixture, (details) => {
      delete details.submissions.at(-1).version;
    });
    const unknownIdentity = await tests.task();
    assert.equal(unknownIdentity.pending.submissionVersion, null);
    assert.equal(unknownIdentity.pending.requiredCheckCount, null);
    assert.equal(unknownIdentity.canReviewSubmission, false);
    assert(
      unknownIdentity.pending.warnings.includes(
        'SUBMISSION_IDENTITY_UNAVAILABLE',
      ),
    );
    assert(
      unknownIdentity.pending.warnings.includes(
        'WORKFLOW_REQUIREMENTS_UNAVAILABLE',
      ),
    );
    await alterDetails(runner.manager, fixture, (details) =>
      Object.assign(details, original),
    );
    await alterDetails(runner.manager, fixture, (details) =>
      details.submissions.push({
        ...copy(details.submissions.at(-1)),
        version: 3,
        submittedAt: NOW.toISOString(),
      }),
    );
    const next = await tests.task();
    assert.equal(next.assignment.mode, 'PRIMARY');
    assert.equal(next.assignment.revision, 0);
    assert.equal(next.pending.effectiveReviewerId, people.admin.memberId);
    assert.equal(next.canReviewSubmission, true);
    assert.equal(
      (await tests.task({}, people.reader)).canReviewSubmission,
      false,
    );
    await denied(() => tests.assign(current), [409]);
    assert.equal((await tests.history()).events.length, 25);
    await alterDetails(runner.manager, fixture, (details) =>
      Object.assign(details, original),
    );
    await alterDetails(runner.manager, fixture, (details) => {
      details.reviewerId = randomUUID();
    });
    const missing = await tests.task();
    assert.equal(missing.pending.reviewerState, 'UNAVAILABLE');
    assert.equal(missing.canReviewSubmission, false);
    await alterDetails(runner.manager, fixture, (details) => {
      details.reviewerId = people.writer.memberId;
    });
    const self = await tests.task({}, people.writer);
    assert.equal(self.pending.reviewerState, 'SELF_REVIEW');
    assert.equal(self.canReviewSubmission, false);
    await denied(() => tests.decide(self, {}, people.writer), [403]);
    await alterDetails(runner.manager, fixture, (details) =>
      Object.assign(details, original),
    );
    const ready = await tests.task(),
      beforeApproval = await sourceFingerprint(runner.manager, fixture);
    await denied(
      () => tests.decide(ready, { reviewAssignmentRevision: undefined }),
      [409],
    );
    await denied(
      () =>
        tests.decide(ready, {
          reviewAssignmentRevision: ready.assignment.revision - 1,
        }),
      [409],
    );
    await denied(
      () =>
        tests.decide(ready, {
          selectedSubmissionVersion: 1,
          creativeVersion: 1,
          finalAssetId: fixture.assets.video,
        }),
      [409],
    );
    await unchanged(beforeApproval);
    await tests.decide(ready);
    const final = await tests.task();
    assert.equal(final.state, 'APPROVED');
    assert.equal(final.pending, null);
    const [approved] = await runner.query(
      'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, fixture.taskId],
    );
    assert.equal(approved.details.reviewerId, people.admin.memberId);
    assert.equal(approved.details.submissions[1].decision, 'APPROVED');
    const afterApproval = await sourceFingerprint(runner.manager, fixture);
    for (const [name, value] of Object.entries(beforeApproval))
      if (!['deliveryTask', 'nativeTasks'].includes(name))
        assert.equal(afterApproval[name], value);
    const legacy = await tests.task({ taskId: fixture.queueTasks[0].taskId });
    assert.equal(legacy.assignment.revision, 0);
    await tests.decide(legacy, {
      creativeVersion: undefined,
      finalAssetId: undefined,
      reviewAssignmentRevision: undefined,
    });
    assert.equal(
      (await tests.task({ taskId: legacy.taskId })).state,
      'APPROVED',
      'Legacy primary row0 decisions remain compatible without an assignment revision.',
    );
    const afterLegacy = await sourceFingerprint(runner.manager, fixture);
    for (const [name, value] of Object.entries(afterApproval))
      if (!['deliveryTask', 'nativeTasks'].includes(name))
        assert.equal(afterLegacy[name], value);
    console.log(
      'PASS rollback-only review queue/backups: complete54 oldest-first pending/latest sources, unknown/future ages, scoped role-only queue, exact assignment/history/replay, current scope/role/active-user revocation, no self-review/fallback, new-submission primary reset, exact final-assignment revisions, advisory resolution and unchanged ownership/production/finance during delegation. No providers/messages/persistent fixture.',
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

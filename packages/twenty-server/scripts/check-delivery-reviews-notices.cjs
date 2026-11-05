const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const axios = require('axios');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  DeliveryOperationsService,
} = require('../dist/modules/delivery/operations/delivery-operations.service');
const {
  DeliveryReminderService,
} = require('../dist/modules/delivery/operations/delivery-reminder.service');
const {
  createReviewsFixture,
  buildReviewsServices,
  reviewsHarness,
  reviewNotices,
  sourceFingerprint,
  alterDetails,
  copy,
  denied,
} = require('./check-delivery-reviews-support.cjs');
const START = new Date('2026-10-28T00:00:00.000Z');
const plus = (at, milliseconds) => new Date(at.getTime() + milliseconds);
async function main() {
  assert.equal(process.argv.length, 2, 'This checker always rolls back.');
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const originalPost = axios.post;
  let sends = 0;
  axios.post = async (url, input) => {
    assert.equal(
      url,
      'https://api.telegram.org/botSYNTHETIC_REVIEW_TEST_ONLY/sendMessage',
    );
    assert.equal(typeof input.chat_id, 'string');
    assert(input.text.includes('/delivery?'));
    sends++;
    return { data: { ok: true } };
  };
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
    const telegram = {
      findByWorkspaceId: async (workspaceId) => {
        assert.equal(workspaceId, fixture.workspaceId);
        return { isActive: true, botUsername: 'synthetic_review_test_only' };
      },
      decryptBotToken: () => 'SYNTHETIC_REVIEW_TEST_ONLY',
    };
    const jobs = [];
    const operations = new DeliveryOperationsService(
      source,
      services.delivery,
      services.creative,
      telegram,
      { get: () => 'http://localhost:3001' },
      {
        add: async (_name, input) => {
          jobs.push(input.outboxId);
        },
      },
      createIsolatedNativeTaskAccess(),
    );
    const reminder = new DeliveryReminderService(
      source,
      operations,
      { ownsReminder: async () => false },
      { ownsReminder: async () => false },
    );
    const [record] = await runner.query(
      'SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    record.state.enabled = true;
    record.state.telegramEnabled = true;
    record.state.timezone = 'Asia/Qatar';
    for (const person of [people.admin, people.reader, people.secondWriter])
      record.state.connections[person.memberId] = {
        chatId: `synthetic:${person.memberId}`,
        linkedAt: START.toISOString(),
      };
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
      [record.id, record.state],
    );
    const baseline = await sourceFingerprint(runner.manager, fixture);
    const assignAt = (snapshot, reviewerId, at) =>
      services.reviews.assign(
        fixture.workspace,
        people.admin.memberId,
        people.admin.userWorkspaceId,
        {
          commandId: randomUUID(),
          taskId: fixture.taskId,
          taskRevision: snapshot.taskRevision,
          submissionVersion: snapshot.assignment.submissionVersion,
          assignmentRevision: snapshot.assignment.revision,
          mode: reviewerId ? 'BACKUP' : 'PRIMARY',
          reviewerId,
          reason: 'Synthetic handoff notification acceptance',
        },
        at,
      );
    const outbox = async () =>
      runner.query(
        'SELECT * FROM core."deliveryReminderOutbox" WHERE "workspaceId"=$1 ORDER BY "createdAt",id',
        [fixture.workspaceId],
      );
    const notices = () => reviewNotices(runner.manager, fixture);
    const activeNotice = async () => {
      const rows = (await notices()).filter((notice) => !notice.cancelled);
      assert.equal(rows.length, 1);
      return rows[0];
    };
    let saved = await assignAt(
      await tests.task(),
      people.reader.memberId,
      START,
    );
    const initial = await activeNotice();
    assert.equal(initial.kind, 'REVIEW_ASSIGNMENT');
    assert.equal(initial.recipientId, people.reader.memberId);
    assert.equal(initial.reviewAssignment.submissionVersion, 2);
    assert.equal(initial.reviewAssignment.assignmentId, saved.assignment.id);
    assert.equal(initial.reviewAssignment.assignmentRevision, 1);
    assert.equal(initial.reviewAssignment.recipientId, people.reader.memberId);
    assert.equal(
      Date.parse(initial.remindAt) - Date.parse(initial.createdAt),
      300000,
    );
    const repeated = await assignAt(
      saved.taskReview,
      people.reader.memberId,
      plus(START, 120000),
    );
    const same = await activeNotice();
    assert.equal(same.id, initial.id);
    assert.equal(same.createdAt, initial.createdAt);
    assert.equal(same.remindAt, initial.remindAt);
    assert.deepEqual(same.reviewAssignment, initial.reviewAssignment);
    assert.equal(repeated.assignment.revision, 2);
    let own = await tests.task({}, people.reader);
    assert.equal(own.assignmentNotice.id, initial.id);
    assert.equal(own.assignmentNotice.assignmentRevision, 1);
    assert.equal(own.assignment.revision, 2);
    assert.equal((await tests.task({}, people.writer)).assignmentNotice, null);
    await denied(() => tests.seen(own, {}, people.admin), [403]);
    await denied(
      () => tests.seen(own, { assignmentRevision: 1 }, people.reader),
      [409],
    );
    await services.reviews.seen(
      fixture.workspace,
      people.reader.memberId,
      people.reader.userWorkspaceId,
      {
        taskId: fixture.taskId,
        taskRevision: own.taskRevision,
        submissionVersion: 2,
        assignmentRevision: 2,
        noticeId: initial.id,
      },
      plus(START, 180000),
    );
    const read = await activeNotice();
    assert(read.seenAt);
    await operations.dispatchWorkspace(fixture.workspace, plus(START, 300000));
    assert.equal((await outbox()).length, 0);
    assert.equal(sends, 0);
    saved = await assignAt(
      await tests.task(),
      people.secondWriter.memberId,
      plus(START, 600000),
    );
    const next = await activeNotice();
    assert.notEqual(next.id, initial.id);
    assert.equal(
      (await notices()).find((notice) => notice.id === initial.id).cancelled,
      true,
    );
    await operations.dispatchWorkspace(fixture.workspace, plus(START, 899999));
    assert.equal(
      (await outbox()).length,
      0,
      'No reminder before the exact five-minute deadline.',
    );
    await operations.dispatchWorkspace(fixture.workspace, plus(START, 900000));
    let jobsNow = await outbox();
    assert.equal(jobsNow.length, 1);
    assert.equal(jobsNow[0].status, 'QUEUED');
    assert.equal(jobsNow[0].noticeId, next.id);
    await reminder.execute(jobsNow[0].id, plus(START, 900000));
    await reminder.execute(jobsNow[0].id, plus(START, 900001));
    assert.equal(sends, 1);
    assert.equal((await outbox())[0].status, 'SENT');
    await operations.dispatchWorkspace(
      fixture.workspace,
      plus(START, 86400000),
    );
    assert.equal((await outbox()).length, 1);
    assert.equal(
      sends,
      1,
      'One unread review handoff has no automatic second send.',
    );
    saved = await assignAt(
      await tests.task(),
      people.reader.memberId,
      plus(START, 1200000),
    );
    const obsolete = await activeNotice();
    await operations.dispatchWorkspace(fixture.workspace, plus(START, 1500000));
    const obsoleteJob = (await outbox()).find(
      (row) => row.noticeId === obsolete.id,
    );
    assert(obsoleteJob);
    await assignAt(saved.taskReview, null, plus(START, 1510000));
    assert.equal(
      (await notices()).find((notice) => notice.id === obsolete.id).cancelled,
      true,
    );
    assert.equal(
      await operations.claimReminder(obsoleteJob.id, plus(START, 1520000)),
      null,
    );
    assert.equal(sends, 1);
    const checkSuppressed = async (change, restore, label) => {
      const at = plus(START, 2000000 + (await notices()).length * 600000);
      await assignAt(await tests.task(), people.reader.memberId, at);
      const notice = await activeNotice();
      await operations.dispatchWorkspace(fixture.workspace, plus(at, 300000));
      const job = (await outbox()).find((row) => row.noticeId === notice.id);
      assert(job, label);
      await change();
      assert.equal(
        await operations.claimReminder(job.id, plus(at, 300001)),
        null,
        label,
      );
      assert.equal(
        (await outbox()).find((row) => row.id === job.id).status,
        'SUPPRESSED',
        label,
      );
      await restore();
      await assignAt(await tests.task(), null, plus(at, 300002));
    };
    await checkSuppressed(
      () =>
        runner.query(
          'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
          [fixture.roles.reader, []],
        ),
      () =>
        runner.query(
          'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
          [fixture.roles.reader, ['delivery.review']],
        ),
      'Current review-role revocation suppresses a queued handoff.',
    );
    await checkSuppressed(
      () =>
        runner.query(
          'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
          [
            fixture.projects.first,
            JSON.stringify([
              people.writer.memberId,
              people.secondWriter.memberId,
            ]),
          ],
        ),
      () =>
        runner.query(
          'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
          [
            fixture.projects.first,
            JSON.stringify([
              people.writer.memberId,
              people.reader.memberId,
              people.secondWriter.memberId,
            ]),
          ],
        ),
      'Current project revocation suppresses a queued handoff.',
    );
    assert.deepEqual(
      await sourceFingerprint(runner.manager, fixture),
      baseline,
      'Notice handoffs, reads and mocked transport may not change production/ownership/finance/fulfilment/budget or unrelated Operations configuration.',
    );
    const [sourceRow] = await runner.query(
      'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, fixture.taskId],
    );
    const original = copy(sourceRow.details);
    let at = plus(START, 30000000);
    await assignAt(await tests.task(), people.reader.memberId, at);
    let notice = await activeNotice();
    await operations.dispatchWorkspace(fixture.workspace, plus(at, 300000));
    let job = (await outbox()).find((row) => row.noticeId === notice.id);
    await alterDetails(runner.manager, fixture, (details) =>
      details.submissions.push({
        ...copy(details.submissions.at(-1)),
        version: 3,
      }),
    );
    assert.equal(
      await operations.claimReminder(job.id, plus(at, 300001)),
      null,
      'New submission cannot receive an old version reminder.',
    );
    await alterDetails(runner.manager, fixture, (details) =>
      Object.assign(details, original),
    );
    await assignAt(await tests.task(), null, plus(at, 300002));
    at = plus(at, 1000000);
    await assignAt(await tests.task(), people.reader.memberId, at);
    own = await tests.task({}, people.reader);
    await tests.decide(
      own,
      {
        decision: 'CHANGES_REQUESTED',
        feedback: 'Synthetic new submission primary handoff',
      },
      people.reader,
    );
    const changes = await tests.task();
    assert.equal(changes.state, 'CHANGES_REQUESTED');
    await services.delivery.command(
      fixture.workspace,
      people.writer.memberId,
      people.writer.userWorkspaceId,
      {
        action: 'submit',
        taskId: fixture.taskId,
        revision: changes.taskRevision,
        description: 'Synthetic explicit replacement submission',
        evidence: [],
      },
    );
    let primary = await tests.task();
    assert.equal(primary.assignment.submissionVersion, 3);
    assert.equal(primary.assignment.revision, 0);
    assert.equal(primary.assignment.id, null);
    const primaryNotice = await activeNotice();
    assert.equal(primaryNotice.recipientId, people.admin.memberId);
    assert.equal(primaryNotice.reviewAssignment.assignmentId, null);
    assert.equal(primaryNotice.reviewAssignment.assignmentRevision, 0);
    assert.equal(primaryNotice.reviewAssignment.submissionVersion, 3);
    assert.equal(primary.assignmentNotice.id, primaryNotice.id);
    assert.equal(primary.assignmentNotice.assignmentId, null);
    assert.equal(
      (
        await runner.query(
          'SELECT count(*)::int AS count FROM core."deliveryReviewAssignment" WHERE "workspaceId"=$1 AND "taskId"=$2 AND "submissionVersion"=3',
          [fixture.workspaceId, fixture.taskId],
        )
      )[0].count,
      0,
      'New primary handoff must not fabricate an assignment row.',
    );
    const primaryAt = new Date(primaryNotice.createdAt);
    const explicitPrimary = await assignAt(
      primary,
      null,
      plus(primaryAt, 120000),
    );
    assert.equal(explicitPrimary.assignment.revision, 1);
    const preservedPrimary = await activeNotice();
    assert.equal(preservedPrimary.id, primaryNotice.id);
    assert.equal(preservedPrimary.remindAt, primaryNotice.remindAt);
    assert.equal(preservedPrimary.reviewAssignment.assignmentId, null);
    assert.equal(preservedPrimary.reviewAssignment.assignmentRevision, 0);
    assert.equal(
      (await tests.task()).assignmentNotice.id,
      primaryNotice.id,
      'Saving explicit Primary keeps the original row0 notice and deadline.',
    );
    primary = await tests.task();
    await services.reviews.seen(
      fixture.workspace,
      people.admin.memberId,
      people.admin.userWorkspaceId,
      {
        taskId: fixture.taskId,
        taskRevision: primary.taskRevision,
        submissionVersion: 3,
        assignmentRevision: 1,
        noticeId: primaryNotice.id,
      },
      plus(primaryAt, 180000),
    );
    assert((await activeNotice()).seenAt);
    assert.equal(sends, 1);
    at = plus(primaryAt, 600000);
    await assignAt(await tests.task(), people.reader.memberId, at);
    notice = await activeNotice();
    await operations.dispatchWorkspace(fixture.workspace, plus(at, 300000));
    job = (await outbox()).find((row) => row.noticeId === notice.id);
    own = await tests.task({}, people.reader);
    await tests.decide(own, {}, people.reader);
    assert.equal(
      await operations.claimReminder(job.id, plus(at, 300001)),
      null,
      'Final decision suppresses a queued review reminder.',
    );
    assert.equal(sends, 1);
    console.log(
      'PASS rollback-only review handoff notices: exact source/recipient, same-owner original deadline, owner-change cancellation, current-revision seen receipts, before/at5min night dispatch, mocked once-only send, no later repeat, queued role/project/version/final suppression, explicit new-submit primary row0 notification without a fabricated row, row0-to-Primary deadline continuity and unchanged business sources outside explicit decisions. One synthetic axios mock only; no real HTTP/bot/message or persistent data.',
    );
  } finally {
    axios.post = originalPost;
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

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  createReviewFixture,
  buildReviewServices,
  reviewHarness,
  correction,
  sourceFingerprint,
  alterDetails,
  copy,
  denied,
} = require('./check-delivery-creative-review-support.cjs');

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
    const fixture = await createReviewFixture(runner.manager);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const services = buildReviewServices(source, fixture),
      tests = reviewHarness(services, fixture);
    const { people, workspaceId, taskId } = fixture;
    const unchanged = async (before) =>
      assert.deepEqual(
        await sourceFingerprint(runner.manager, fixture),
        before,
        'Review annotations must not mutate creative production, final approval, fulfilment, cash or AI budgets.',
      );
    const baseline = await sourceFingerprint(runner.manager, fixture);
    const current = await tests.read({ compareSubmissionVersion: 1 });
    assert.equal(current.selected.assetId, fixture.assets.image);
    assert.equal(current.selected.asset.current, true);
    assert.equal(current.comparison.assetId, fixture.assets.video);
    assert.equal(current.comparison.asset.current, false);
    assert.equal(current.canReviewFinal, true);
    assert.equal((await tests.read({}, people.writer)).canReviewFinal, false);
    assert(!JSON.stringify(current).includes('PRIVATE_REVIEW_BRIEF'));
    await denied(() => tests.read({}, people.outsider));
    await denied(() => tests.read({}, people.admin, fixture.foreignWorkspace));
    await denied(() =>
      tests.read({ taskId: fixture.otherTaskId }, people.reader),
    );
    const wrongAsset = await tests.read({
      targetKind: 'ASSET',
      submissionVersion: null,
      assetId: fixture.otherAssetId,
    });
    assert.equal(wrongAsset.selected.availability, 'ASSET_MISSING');
    assert.equal(wrongAsset.selected.asset, null);
    const v1 = (await tests.read({ submissionVersion: 1 })).selected;
    const createId = randomUUID();
    const command = {
      commandId: createId,
      body: 'Correct the synthetic hook at this exact video time.',
      anchorKind: 'TIME',
      startMs: 500,
      endMs: null,
    };
    const created = await tests.create(v1, command, people.reader);
    assert.equal(created.feedback.id, createId);
    assert.equal(created.replayed, false);
    assert.equal(
      (await tests.create(v1, command, people.reader)).replayed,
      true,
    );
    await denied(
      () =>
        tests.create(
          v1,
          { ...command, body: 'Different command payload' },
          people.reader,
        ),
      [409],
    );
    await denied(() => tests.create(v1, command, people.writer), [409]);
    let feedback = created.feedback;
    const replyCommand = randomUUID();
    const reply = await tests.change(
      feedback,
      'REPLY',
      {
        commandId: replyCommand,
        body: 'Editor acknowledges the exact hook note.',
      },
      people.writer,
    );
    assert.equal(reply.feedback.body, created.feedback.body);
    assert.equal(
      (
        await tests.change(
          feedback,
          'REPLY',
          {
            commandId: replyCommand,
            body: 'Editor acknowledges the exact hook note.',
          },
          people.writer,
        )
      ).replayed,
      true,
    );
    await denied(
      () => tests.change(feedback, 'REPLY', {}, people.writer),
      [409],
    );
    feedback = reply.feedback;
    const sameBytes = (
      await tests.read({
        targetKind: 'ASSET',
        submissionVersion: null,
        assetId: fixture.assets.video,
      })
    ).selected;
    await denied(
      () =>
        tests.change(
          feedback,
          'ADDRESSED',
          correction(sameBytes),
          people.writer,
        ),
      [400],
    );
    feedback = (
      await tests.change(
        feedback,
        'ADDRESSED',
        correction(current.selected),
        people.writer,
      )
    ).feedback;
    assert.equal(feedback.status, 'ADDRESSED');
    assert.equal(feedback.correction.assetId, fixture.assets.image);
    await denied(() =>
      tests.change(
        feedback,
        'RESOLVED',
        correction(current.selected),
        people.writer,
      ),
    );
    await denied(() =>
      tests.change(
        feedback,
        'RESOLVED',
        correction(current.selected),
        people.reader,
      ),
    );
    feedback = (
      await tests.change(feedback, 'RESOLVED', correction(current.selected))
    ).feedback;
    assert.equal(feedback.status, 'RESOLVED');
    assert.equal((await tests.read()).state, 'IN_REVIEW');
    feedback = (await tests.change(feedback, 'REOPENED')).feedback;
    assert.equal(feedback.status, 'OPEN');
    assert.equal(feedback.correction, null);
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.reader.userId,
    ]);
    await denied(() => tests.create(v1, {}, people.reader));
    feedback = (
      await tests.change(
        feedback,
        'ADDRESSED',
        correction(current.selected),
        people.writer,
      )
    ).feedback;
    feedback = (
      await tests.change(feedback, 'RESOLVED', correction(current.selected))
    ).feedback;
    assert.equal(
      feedback.status,
      'RESOLVED',
      'A departed author must not strand independent review.',
    );
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      people.reader.userId,
    ]);
    const image = (
      await tests.read({
        targetKind: 'ASSET',
        submissionVersion: null,
        assetId: fixture.assets.intermediate,
      })
    ).selected;
    assert.equal(image.availability, 'AVAILABLE');
    await tests.create(
      image,
      { body: 'General intermediate-image correction.' },
      people.writer,
    );
    await denied(
      () =>
        tests.create(
          image,
          { anchorKind: 'TIME', startMs: 100 },
          people.writer,
        ),
      [400],
    );
    const audio = (
      await tests.read({
        targetKind: 'ASSET',
        submissionVersion: null,
        assetId: fixture.assets.audio,
      })
    ).selected;
    await tests.create(
      audio,
      { anchorKind: 'RANGE', startMs: 100, endMs: 700 },
      people.writer,
    );
    await denied(
      () =>
        tests.create(
          audio,
          { anchorKind: 'RANGE', startMs: 700, endMs: 100 },
          people.writer,
        ),
      [400],
    );
    const unsupported = (
      await tests.read({
        targetKind: 'ASSET',
        submissionVersion: null,
        assetId: fixture.assets.unsupported,
      })
    ).selected;
    assert.equal(unsupported.availability, 'UNSUPPORTED_MEDIA');
    await denied(
      () => tests.create(unsupported, { targetToken: '0'.repeat(64) }),
      [409],
    );
    const failed = (
      await tests.read({
        targetKind: 'ASSET',
        submissionVersion: null,
        assetId: fixture.assets.failed,
      })
    ).selected;
    assert.equal(failed.availability, 'STORAGE_NOT_READY');
    await denied(
      () => tests.create(failed, { targetToken: '0'.repeat(64) }),
      [409],
    );
    await denied(() => tests.read({ selectedFeedbackId: feedback.id }), [404]);
    await tests.create(v1, { body: 'Earlier version remains open.' });
    for (let index = 0; index < 53; index++)
      await tests.create(current.selected, {
        body: `Bounded visible image note ${index}`,
      });
    const pages = [];
    let afterFeedbackId = null;
    do {
      const page = await tests.read({ afterFeedbackId });
      assert.equal(page.feedbackCount, 53);
      assert.equal(page.unresolvedCount, 53);
      assert.equal(page.earlierUnresolvedCount, 1);
      pages.push(...page.feedback);
      afterFeedbackId = page.nextFeedbackId;
    } while (afterFeedbackId);
    assert.equal(pages.length, 53);
    assert.equal(new Set(pages.map((row) => row.id)).size, 53);
    await denied(() => tests.read({ afterFeedbackId: feedback.id }), [404]);
    const selected = await tests.read({ selectedFeedbackId: pages[52].id });
    assert.equal(selected.selectedFeedback.id, pages[52].id);
    const exactImageAsset = (
      await tests.read({
        targetKind: 'ASSET',
        submissionVersion: null,
        assetId: fixture.assets.image,
      })
    ).selected;
    const shared = await tests.create(
      exactImageAsset,
      { body: 'Same-file annotation originally made in the assets panel.' },
      people.writer,
    );
    const sameFile = await tests.read({
      selectedFeedbackId: shared.feedback.id,
    });
    assert.equal(sameFile.feedbackCount, 54);
    assert.equal(sameFile.selectedFeedback.targetKind, 'ASSET');
    assert.equal(sameFile.selectedFeedback.submissionVersion, null);
    assert.equal(sameFile.selectedFeedback.assetId, fixture.assets.image);
    const mixedPages = [];
    let mixedCursor = null;
    do {
      const page = await tests.read({
        targetKind: 'ASSET',
        submissionVersion: null,
        assetId: fixture.assets.image,
        afterFeedbackId: mixedCursor,
      });
      assert.equal(page.feedbackCount, 54);
      mixedPages.push(...page.feedback);
      mixedCursor = page.nextFeedbackId;
    } while (mixedCursor);
    assert.equal(mixedPages.length, 54);
    assert.equal(new Set(mixedPages.map((row) => row.id)).size, 54);
    assert.deepEqual(
      [...new Set(mixedPages.map((row) => row.targetKind))].sort(),
      ['ASSET', 'SUBMISSION'],
    );
    for (let index = 0; index < 26; index++)
      feedback = (
        await tests.change(
          feedback,
          'REPLY',
          { body: `Historical reply ${index}` },
          people.writer,
        )
      ).feedback;
    const history = await tests.history(feedback.id);
    assert.equal(history.events.length, 25);
    assert(history.nextBeforeId);
    const older = await tests.history(feedback.id, {
      beforeId: history.nextBeforeId,
    });
    assert.equal(
      new Set([...history.events, ...older.events].map((event) => event.id))
        .size,
      33,
    );
    assert(
      [...history.events, ...older.events].some(
        (event) =>
          event.action === 'CREATED' && event.body === created.feedback.body,
      ),
    );
    await denied(
      () => tests.history(feedback.id, { beforeId: randomUUID() }),
      [404],
    );
    await unchanged(baseline);

    const [production] = await runner.query(
      'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [workspaceId, taskId],
    );
    const original = copy(production.details);
    await alterDetails(runner.manager, fixture, (details) => {
      delete details.submissions[0].finalAssetId;
      delete details.submissions[0].creativeVersion;
    });
    const legacy = await tests.read({ submissionVersion: 1 });
    assert.equal(legacy.selected.availability, 'LEGACY_IDENTITY_MISSING');
    assert.equal(legacy.selected.assetId, null);
    await denied(
      () =>
        tests.create(legacy.selected, {
          assetId: fixture.assets.video,
          targetToken: '0'.repeat(64),
        }),
      [409],
    );
    await alterDetails(runner.manager, fixture, (details) =>
      Object.assign(details, original),
    );
    await alterDetails(runner.manager, fixture, (details) => {
      details.creative.assets.find(
        (asset) => asset.id === fixture.assets.video,
      ).storageState = 'FAILED';
    });
    const unavailable = await tests.read({
      submissionVersion: 1,
      selectedFeedbackId: feedback.id,
    });
    assert.equal(
      unavailable.selectedFeedback.target.availability,
      'STORAGE_NOT_READY',
    );
    const beforeUnavailableReply = await sourceFingerprint(
      runner.manager,
      fixture,
    );
    feedback = (
      await tests.change(
        feedback,
        'REPLY',
        { body: 'Explain an unavailable historical source.' },
        people.writer,
      )
    ).feedback;
    await unchanged(beforeUnavailableReply);
    await alterDetails(runner.manager, fixture, (details) =>
      Object.assign(details, original),
    );
    await alterDetails(runner.manager, fixture, (details) => {
      const asset = details.creative.assets.find(
        (item) => item.id === fixture.assets.video,
      );
      asset.name = 'Explicitly changed historical metadata';
    });
    const superseded = await tests.read({
      submissionVersion: 1,
      selectedFeedbackId: feedback.id,
    });
    assert.equal(superseded.selectedFeedback.target.targetToken, null);
    assert(
      superseded.selectedFeedback.target.warnings.includes(
        'TARGET_CHANGED_SINCE_FEEDBACK',
      ),
    );
    assert.equal(
      superseded.selectedFeedback.target.asset.name,
      'Synthetic submitted video v1',
    );
    await denied(() => tests.create(v1), [409]);
    await alterDetails(runner.manager, fixture, (details) =>
      Object.assign(details, original),
    );
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$3 WHERE "workspaceId"=$1 AND id=$2',
      [
        workspaceId,
        fixture.projects.first,
        JSON.stringify([people.writer.memberId]),
      ],
    );
    await denied(() => tests.create(v1, command, people.reader));
    await denied(() => tests.history(feedback.id, {}, people.reader));
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$3 WHERE "workspaceId"=$1 AND id=$2',
      [
        workspaceId,
        fixture.projects.first,
        JSON.stringify([people.writer.memberId, people.reader.memberId]),
      ],
    );
    await alterDetails(runner.manager, fixture, (details) => {
      details.reviewerId = people.writer.memberId;
    });
    const selfReviewer = await tests.read({}, people.writer);
    assert.equal(selfReviewer.canResolve, false);
    assert.equal(selfReviewer.canReviewFinal, false);
    await denied(() =>
      tests.change(
        feedback,
        'RESOLVED',
        correction(selfReviewer.selected),
        people.writer,
      ),
    );
    await alterDetails(runner.manager, fixture, (details) =>
      Object.assign(details, original),
    );

    const beforeApproval = await sourceFingerprint(runner.manager, fixture);
    const ready = await tests.read();
    assert.equal(ready.canReviewFinal, true);
    const reviewCommand = {
      action: 'review',
      taskId,
      revision: ready.taskRevision,
      decision: 'APPROVED',
      feedback: 'Synthetic explicit independent final approval',
      selectedSubmissionVersion: 2,
      creativeVersion: 2,
      finalAssetId: fixture.assets.image,
    };
    await denied(() =>
      services.delivery.command(
        fixture.workspace,
        people.writer.memberId,
        people.writer.userWorkspaceId,
        reviewCommand,
      ),
    );
    await denied(
      () =>
        services.delivery.command(
          fixture.workspace,
          people.admin.memberId,
          people.admin.userWorkspaceId,
          {
            ...reviewCommand,
            selectedSubmissionVersion: 1,
            creativeVersion: 1,
            finalAssetId: fixture.assets.video,
          },
        ),
      [409],
    );
    await unchanged(beforeApproval);
    await services.delivery.command(
      fixture.workspace,
      people.admin.memberId,
      people.admin.userWorkspaceId,
      reviewCommand,
    );
    const [approved] = await runner.query(
      'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [workspaceId, taskId],
    );
    assert.equal(approved.details.state, 'APPROVED');
    assert.equal(approved.details.submissions[0].decision, 'CHANGES_REQUESTED');
    assert.equal(approved.details.submissions[1].decision, 'APPROVED');
    const afterApproval = await sourceFingerprint(runner.manager, fixture);
    for (const [key, value] of Object.entries(beforeApproval))
      if (!['deliveryTask', 'nativeTasks'].includes(key))
        assert.equal(afterApproval[key], value);
    console.log(
      'PASS rollback-only creative review: exact historical/current/intermediate/legacy/foreign targets, image/audio anchors, idempotent version-bound notes, addressed evidence and independent resolve/reopen, departed author/revocation, complete53 counts/paging/history, superseded-source provenance and explicit exact final approval. Annotation operations leave production/approval/fulfilment/finance/budgets unchanged. No files/providers/HTTP/persistent fixture.',
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

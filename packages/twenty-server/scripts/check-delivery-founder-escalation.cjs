const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  NOW,
  hash,
  createEscalationFixture,
  buildEscalationServices,
  escalationHarness,
  ruleDraft,
  outboxForRule,
  readOperations,
  updateOperations,
  setTask,
  setRole,
  sourceFingerprint,
  denied,
} = require('./check-delivery-founder-escalation-support.cjs');

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
    const fixture = await createEscalationFixture(runner.manager);
    const source = {
      manager: runner.manager,
      query: (...arguments_) => runner.query(...arguments_),
      getRepository: (entity) => runner.manager.getRepository(entity),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const services = buildEscalationServices(source, fixture);
    const tests = escalationHarness(services, fixture);
    const { workspaceId, people, projects } = fixture;
    const evaluate = (date = NOW) =>
      services.escalation.queueWorkspace(workspaceId, date);
    const episodes = (ruleId) =>
      runner.query(
        'SELECT * FROM core."deliveryFounderEscalationEpisode" WHERE "workspaceId"=$1 AND "ruleId"=$2 ORDER BY "firstSeenAt",id',
        [workspaceId, ruleId],
      );
    const alerts = (ruleId) =>
      runner.query(
        'SELECT * FROM core."deliveryFounderEscalationNotice" WHERE "workspaceId"=$1 AND "ruleId"=$2 AND kind=\'ALERT\' ORDER BY "createdAt",id',
        [workspaceId, ruleId],
      );
    const outbox = (ruleId) => outboxForRule(runner.manager, fixture, ruleId);
    const refreshRule = async (id) =>
      (await tests.read({ ruleId: id })).rules.find((rule) => rule.id === id);
    const enable = async (rule, person = people.admin) => {
      const preview = await tests.preview(rule, person);
      assert.equal(preview.canEnable, true);
      return (
        await tests.change(
          rule,
          {
            enabled: true,
            previewToken: preview.previewToken,
            adoptLegacyRouting: true,
          },
          person,
        )
      ).rule;
    };
    const createEnabled = async (fields = {}, person = people.admin) =>
      enable(
        (await tests.save(ruleDraft(fixture, fields), person)).rule,
        person,
      );
    const pause = async (ruleId) =>
      tests.change(await refreshRule(ruleId), { enabled: false });
    const claim = (entry, date = NOW) =>
      services.escalation.claimReminder(entry.id, date);
    const finish = (entry, status = 'SENT', date = NOW) =>
      services.escalation.finishReminder(
        entry.id,
        status,
        status === 'SENT' ? null : 'Synthetic transport receipt',
        date,
      );
    const assertSources = async (before) =>
      assert.deepEqual(
        await sourceFingerprint(runner.manager, fixture),
        before,
        'Rule/episode/outbox work must not mutate native work, commitments or financial sources.',
      );

    const legacy = [
      ['ALERT', 'PENDING'],
      ['ALERT', 'QUEUED'],
      ['ALERT', 'UNCONFIGURED'],
      ['MESSAGE', 'PENDING'],
      ['ASSIGNMENT', 'QUEUED'],
      ['FULFILMENT', 'UNCONFIGURED'],
    ].map(([kind, sendState]) => ({
      id: randomUUID(),
      taskId: fixture.otherTaskId,
      recipientId: people.admin.memberId,
      senderId: people.writer.memberId,
      kind,
      text: 'PRIVATE_LEGACY_NOTIFICATION',
      createdAt: NOW.toISOString(),
      remindAt: '2099-01-01T00:00:00.000Z',
      seenAt: null,
      acknowledgedAt: null,
      cancelled: false,
      sendState,
      attemptedAt: null,
      error: null,
    }));
    await updateOperations(runner.manager, fixture, (state) =>
      state.notices.push(...legacy),
    );
    for (const notice of legacy.filter(
      (notice) => notice.sendState !== 'PENDING',
    ))
      await runner.query(
        'INSERT INTO core."deliveryReminderOutbox" ("workspaceId","noticeId",status) VALUES($1,$2,$3)',
        [workspaceId, notice.id, notice.sendState],
      );
    const initialSource = await sourceFingerprint(runner.manager, fixture);
    const initial = await tests.read();
    assert.equal(initial.routingAdopted, false);
    assert.equal(initial.rules.length, 0);
    await denied(() => tests.read({}, people.writer));
    await denied(() => tests.read({}, people.admin, fixture.foreignWorkspace));

    const draft = ruleDraft(fixture);
    const previewBeforeSave = await tests.preview(draft);
    assert.equal(
      previewBeforeSave.matchCount,
      1,
      'Secondary TASK_OVERDUE must match a BLOCKED task.',
    );
    assert.equal(previewBeforeSave.items[0].sourceId, fixture.otherTaskId);
    for (const [category, sourceId] of Object.entries(fixture.manualAlertIds)) {
      const manual = await tests.preview(
        ruleDraft(fixture, { condition: `MANUAL_${category}_CONCERN` }),
      );
      assert.equal(
        manual.matchCount,
        1,
        'Legacy takeover must retain factual manual concerns.',
      );
      assert.equal(manual.items[0].sourceId, sourceId);
    }
    const saveCommandId = randomUUID();
    const saved = await tests.save(draft, people.admin, saveCommandId);
    assert.equal(saved.rule.enabled, false);
    assert.equal(saved.replayed, false);
    assert.equal(
      (await tests.save(draft, people.admin, saveCommandId)).replayed,
      true,
    );
    await denied(
      () =>
        tests.save(
          { ...draft, name: 'Different command payload' },
          people.admin,
          saveCommandId,
        ),
      [409],
    );
    await denied(() => tests.save(draft), [409]);
    assert.equal((await tests.read()).routingAdopted, false);
    assert.equal((await outbox(saved.rule.id)).length, 0);
    const preview = await tests.preview(saved.rule);
    await denied(
      () =>
        tests.change(saved.rule, {
          enabled: true,
          previewToken: preview.previewToken,
        }),
      [400, 409],
    );
    const enabled = await enable(saved.rule);
    assert.equal(enabled.enabled, true);
    assert.equal((await tests.read()).routingAdopted, true);
    await assertSources(initialSource);

    const legacyAfterAdoption = (await readOperations(runner.manager, fixture))
      .state.notices;
    for (const notice of legacy.filter((notice) => notice.kind !== 'ALERT'))
      assert.deepEqual(
        legacyAfterAdoption.find((candidate) => candidate.id === notice.id),
        notice,
        'Adoption must preserve employee message/assignment/fulfilment notifications.',
      );
    const {
      DeliveryCreativeService,
    } = require('../dist/modules/delivery/creative/delivery-creative.service');
    const {
      DeliveryOperationsService,
    } = require('../dist/modules/delivery/operations/delivery-operations.service');
    const operations = new DeliveryOperationsService(
      source,
      services.delivery,
      new DeliveryCreativeService(source, services.delivery, {}),
      services.telegram,
      services.config,
      { add: async () => {} },
    );
    for (const notice of legacy.filter((notice) => notice.kind === 'ALERT')) {
      const existing = (
        await runner.query(
          'SELECT * FROM core."deliveryReminderOutbox" WHERE "workspaceId"=$1 AND "noticeId"=$2',
          [workspaceId, notice.id],
        )
      )[0];
      if (existing?.status === 'QUEUED')
        assert.equal(await operations.claimReminder(existing.id, NOW), null);
    }
    await operations.dispatchWorkspace(fixture.workspace, NOW);
    const legacyAfterDispatch = (await readOperations(runner.manager, fixture))
      .state.notices;
    for (const notice of legacy.filter((notice) => notice.kind === 'ALERT')) {
      const current = legacyAfterDispatch.find(
        (candidate) => candidate.id === notice.id,
      );
      assert(
        current.cancelled ||
          ['SUPPRESSED', 'UNCONFIGURED'].includes(current.sendState),
        'Adopted legacy ALERT notices cannot remain eligible for future delivery.',
      );
    }
    for (const notice of legacy.filter((notice) => notice.kind !== 'ALERT'))
      assert.deepEqual(
        legacyAfterDispatch.find((candidate) => candidate.id === notice.id),
        notice,
      );

    await evaluate();
    const [episode] = await episodes(enabled.id);
    assert.equal(episode.status, 'OPEN');
    assert.equal((await alerts(enabled.id)).length, 1);
    const [firstEntry] = await outbox(enabled.id);
    assert.equal(firstEntry.status, 'QUEUED');
    assert.equal(await services.escalation.ownsReminder(firstEntry.id), true);
    await evaluate(new Date(NOW.getTime() + 1000));
    assert.equal((await episodes(enabled.id)).length, 1);
    assert.equal((await outbox(enabled.id)).length, 1);
    const firstNoticeHash = hash(await alerts(enabled.id));
    await setTask(runner.manager, fixture, fixture.otherTaskId, {
      title: 'PRIVATE_EDITED_TITLE',
    });
    const editedSource = await sourceFingerprint(runner.manager, fixture);
    await evaluate(new Date(NOW.getTime() + 2000));
    assert.equal((await episodes(enabled.id))[0].id, episode.id);
    assert.equal(
      hash(await alerts(enabled.id)),
      firstNoticeHash,
      'Original alert evidence is immutable after source edits.',
    );
    const payload = await claim(firstEntry);
    assert(payload);
    assert.equal(payload.chatId, '424242');
    assert.equal(payload.botToken, 'fixture-founder-token');
    assert(!payload.text.includes('PRIVATE_'));
    assert(payload.text.includes('founderPanel=alerts'));
    assert.equal(await claim(firstEntry), null);
    await finish(firstEntry);
    const currentEpisode = (
      await tests.read({ ruleId: enabled.id })
    ).episodes.find((candidate) => candidate.id === episode.id);
    const ackCommand = randomUUID();
    assert.equal(
      (await tests.acknowledge(currentEpisode, people.admin, ackCommand))
        .replayed,
      false,
    );
    assert.equal(
      (await tests.acknowledge(currentEpisode, people.admin, ackCommand))
        .replayed,
      true,
    );
    await evaluate(new Date(NOW.getTime() + 86400000));
    assert.equal((await outbox(enabled.id)).length, 1);
    assert((await episodes(enabled.id))[0].acknowledgedAt);
    await assertSources(editedSource);

    await setTask(runner.manager, fixture, fixture.otherTaskId, {
      state: 'IN_PROGRESS',
      dueAt: '2099-01-01',
    });
    await evaluate();
    assert.equal((await episodes(enabled.id))[0].status, 'RESOLVED');
    await setTask(runner.manager, fixture, fixture.otherTaskId, {
      state: 'BLOCKED',
      dueAt: '2020-01-01',
    });
    await evaluate();
    const reopened = (await episodes(enabled.id)).find(
      (candidate) => candidate.status === 'OPEN',
    );
    assert(reopened && reopened.id !== episode.id && !reopened.acknowledgedAt);
    assert.equal((await outbox(enabled.id)).length, 2);
    const reopenedEntry = (await outbox(enabled.id)).find(
      (entry) => entry.status === 'QUEUED',
    );
    await setTask(runner.manager, fixture, fixture.otherTaskId, {
      state: 'UNSUPPORTED',
    });
    await evaluate();
    const unavailable = (await episodes(enabled.id)).find(
      (candidate) => candidate.id === reopened.id,
    );
    assert.notEqual(
      unavailable.status,
      'RESOLVED',
      'Unavailable evidence cannot prove resolution.',
    );
    assert.equal(
      await claim(reopenedEntry),
      null,
      'Unknown source state cannot authorize a send.',
    );
    const suppressedEntry = (await outbox(enabled.id)).find(
      (entry) => entry.id === reopenedEntry.id,
    );
    assert.equal(suppressedEntry.status, 'SUPPRESSED');
    assert.equal(suppressedEntry.attemptedAt, null);
    assert.equal(suppressedEntry.error, 'SOURCE_UNAVAILABLE');
    const originalNotices = await alerts(enabled.id);
    await setTask(runner.manager, fixture, fixture.otherTaskId, {
      state: 'BLOCKED',
    });
    await evaluate();
    assert.equal((await episodes(enabled.id)).length, 2);
    assert.equal(
      (await episodes(enabled.id)).find(
        (candidate) => candidate.status === 'OPEN',
      ).id,
      reopened.id,
      'Restored evidence must preserve the existing unresolved episode.',
    );
    assert.equal((await outbox(enabled.id)).length, 3);
    assert.deepEqual(
      (await outbox(enabled.id)).find(
        (entry) => entry.id === suppressedEntry.id,
      ),
      suppressedEntry,
      'A replacement cannot rewrite the original unattempted suppression receipt.',
    );
    const replacementNotice = (await alerts(enabled.id)).find(
      (notice) =>
        !originalNotices.some((original) => original.id === notice.id),
    );
    assert.equal(replacementNotice.episodeId, reopened.id);
    assert.equal(replacementNotice.sequence, 2);
    assert.equal(replacementNotice.ruleRevision, enabled.revision);
    assert.deepEqual(
      (await alerts(enabled.id)).filter((notice) =>
        originalNotices.some((original) => original.id === notice.id),
      ),
      originalNotices,
    );
    const replacement = (await outbox(enabled.id)).find(
      (entry) => entry.noticeId === replacementNotice.id,
    );
    assert(await claim(replacement));
    await finish(replacement);
    await evaluate(new Date(NOW.getTime() + 86400000));
    assert.equal(
      (await outbox(enabled.id)).length,
      3,
      'One successful send fulfills the once-per-episode limit.',
    );
    await pause(enabled.id);
    assert.equal(
      (await tests.read()).routingAdopted,
      true,
      'Pausing all rules must not restore legacy routing.',
    );
    const staleRule = (await tests.save(ruleDraft(fixture))).rule;
    const stalePreview = await tests.preview(staleRule);
    await setTask(runner.manager, fixture, fixture.otherTaskId, {
      title: 'PRIVATE_NEW_REVIEW_VERSION',
    });
    await denied(
      () =>
        tests.change(staleRule, {
          enabled: true,
          previewToken: stalePreview.previewToken,
          adoptLegacyRouting: true,
        }),
      [409],
    );
    assert.equal((await refreshRule(staleRule.id)).enabled, false);

    const allRule = await createEnabled({ projectIds: [projects.first] });
    const completePreview = await tests.preview(allRule);
    assert.equal(completePreview.matchCount, 53);
    assert(completePreview.items.length <= 50);
    await evaluate();
    assert.equal(
      (await episodes(allRule.id)).length,
      53,
      'Evaluation must include matching sources beyond the UI page.',
    );
    assert.equal(
      new Set((await episodes(allRule.id)).map((item) => item.sourceKey)).size,
      53,
    );
    await evaluate();
    assert(
      (await outbox(allRule.id)).length <= 53,
      'Reevaluation cannot duplicate first occurrences.',
    );
    await pause(allRule.id);

    const repeatRule = await createEnabled({
      repeatMode: 'INTERVAL',
      repeatHours: 1,
      maxSends: 2,
    });
    await evaluate();
    const [repeatFirst] = await outbox(repeatRule.id);
    assert(await claim(repeatFirst));
    await finish(repeatFirst);
    await evaluate(new Date(NOW.getTime() + 3599000));
    assert.equal((await outbox(repeatRule.id)).length, 1);
    const repeatAt = new Date(NOW.getTime() + 3600001);
    await evaluate(repeatAt);
    const repeatSecond = (await outbox(repeatRule.id)).find(
      (entry) => entry.status === 'QUEUED',
    );
    assert(repeatSecond);
    assert(await claim(repeatSecond, repeatAt));
    await finish(repeatSecond, 'SENT', repeatAt);
    await evaluate(new Date(NOW.getTime() + 7200001));
    assert.equal(
      (await outbox(repeatRule.id)).length,
      2,
      'The configured maximum applies to successful repeat sends.',
    );
    await pause(repeatRule.id);

    const amendedIntervalRule = await createEnabled({
      repeatMode: 'INTERVAL',
      repeatHours: 1,
      maxSends: 3,
    });
    await evaluate();
    const [intervalFirst] = await outbox(amendedIntervalRule.id);
    assert(await claim(intervalFirst));
    await finish(intervalFirst);
    await evaluate(repeatAt);
    const intervalPending = (await outbox(amendedIntervalRule.id)).find(
      (entry) => entry.status === 'QUEUED',
    );
    assert(intervalPending);
    const originalIntervalNotices = await alerts(amendedIntervalRule.id);
    const revisedInterval = (
      await tests.save({
        ...(await refreshRule(amendedIntervalRule.id)),
        repeatHours: 24,
      })
    ).rule;
    assert.equal(revisedInterval.enabled, false);
    assert.equal(
      (await outbox(amendedIntervalRule.id)).find(
        (entry) => entry.id === intervalPending.id,
      ).status,
      'SUPPRESSED',
    );
    await enable(revisedInterval);
    await evaluate(repeatAt);
    assert.equal(
      (await outbox(amendedIntervalRule.id)).length,
      2,
      'Re-enabling a suppressed repeat must honor the newly reviewed interval from the last SENT receipt.',
    );
    await evaluate(new Date(NOW.getTime() + 86400000 - 1));
    assert.equal((await outbox(amendedIntervalRule.id)).length, 2);
    const revisedDueAt = new Date(NOW.getTime() + 86400000 + 1);
    await evaluate(revisedDueAt);
    assert.equal((await outbox(amendedIntervalRule.id)).length, 3);
    const revisedPending = (await outbox(amendedIntervalRule.id)).find(
      (entry) => entry.status === 'QUEUED',
    );
    assert(revisedPending);
    assert(await claim(revisedPending, revisedDueAt));
    await finish(revisedPending, 'SENT', revisedDueAt);
    assert.deepEqual(
      (await alerts(amendedIntervalRule.id)).filter((notice) =>
        originalIntervalNotices.some((original) => original.id === notice.id),
      ),
      originalIntervalNotices,
      'Historical one-hour configurations and source snapshots remain immutable after interval changes.',
    );
    await pause(amendedIntervalRule.id);

    for (const terminal of ['FAILED', 'UNCERTAIN']) {
      const rule = await createEnabled({
        repeatMode: 'INTERVAL',
        repeatHours: 1,
        maxSends: 3,
      });
      await evaluate();
      const [entry] = await outbox(rule.id);
      assert(await claim(entry));
      await finish(entry, terminal);
      await evaluate(new Date(NOW.getTime() + 172800000));
      assert.equal(
        (await outbox(rule.id)).length,
        1,
        `${terminal} cannot become an automatic retry.`,
      );
      assert.equal(await claim(entry), null);
      await pause(rule.id);
    }
    const revokedRecipient = await createEnabled();
    await evaluate();
    const [recipientEntry] = await outbox(revokedRecipient.id);
    await runner.query('UPDATE core."user" SET disabled=true WHERE id=$1', [
      people.admin.userId,
    ]);
    assert.equal(await claim(recipientEntry), null);
    await runner.query('UPDATE core."user" SET disabled=false WHERE id=$1', [
      people.admin.userId,
    ]);
    assert.equal((await outbox(revokedRecipient.id))[0].status, 'SUPPRESSED');
    await evaluate();
    assert.equal(
      (await outbox(revokedRecipient.id)).length,
      1,
      'Authority suppression is not source-unavailable first-send recovery.',
    );
    await pause(revokedRecipient.id);

    await setRole(runner.manager, fixture, 'reader', [
      'workspace.admin',
      'finance.read',
    ]);
    const revokedGrant = await createEnabled({}, people.reader);
    await evaluate();
    const [grantEntry] = await outbox(revokedGrant.id);
    await setRole(runner.manager, fixture, 'reader', ['finance.read']);
    assert.equal(
      await claim(grantEntry),
      null,
      'Revoked granting admin must not retain delegated notification authority.',
    );
    assert.equal((await outbox(revokedGrant.id))[0].status, 'SUPPRESSED');
    await pause(revokedGrant.id);

    const disabledRule = await createEnabled();
    await evaluate();
    const [disabledEntry] = await outbox(disabledRule.id);
    await pause(disabledRule.id);
    assert.equal(await claim(disabledEntry), null);
    const clearedRule = await createEnabled();
    await evaluate();
    const [clearedEntry] = await outbox(clearedRule.id);
    await setTask(runner.manager, fixture, fixture.otherTaskId, {
      state: 'IN_PROGRESS',
      dueAt: '2099-01-01',
    });
    assert.equal(await claim(clearedEntry), null);
    assert.equal((await outbox(clearedRule.id))[0].status, 'SUPPRESSED');
    assert.equal((await episodes(clearedRule.id))[0].status, 'RESOLVED');
    await setTask(runner.manager, fixture, fixture.otherTaskId, {
      state: 'BLOCKED',
      dueAt: '2020-01-01',
    });
    await pause(clearedRule.id);
    const disconnectedRule = await createEnabled();
    await evaluate();
    const [disconnectedEntry] = await outbox(disconnectedRule.id);
    services.transport.botActive = false;
    assert.equal(await claim(disconnectedEntry), null);
    assert.equal((await outbox(disconnectedRule.id))[0].status, 'UNCONFIGURED');
    services.transport.botActive = true;
    await evaluate();
    assert.equal(
      (await outbox(disconnectedRule.id)).length,
      1,
      'A terminal UNCONFIGURED receipt requires explicit fresh re-enable.',
    );
    await pause(disconnectedRule.id);
    const finalSource = await sourceFingerprint(runner.manager, fixture);
    await tests.read();
    await evaluate();
    await assertSources(finalSource);
    console.log(
      'PASS rollback-only founder rules: preview/save-paused/replay/stale control, explicit legacy adoption and preserved employee reminders, secondary facts, full53 selection, stable episode edits/clear/reopen/ack, incomplete evidence, current recipient/grantor revocation, repeat limits, terminal failure/uncertainty, scoped outbox dedup and unchanged business sources. No HTTP, real Telegram or persistent fixture.',
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

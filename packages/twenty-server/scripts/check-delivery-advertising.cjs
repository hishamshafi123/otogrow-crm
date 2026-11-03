const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  insertMetaReport,
} = require('../dist/modules/delivery/advertising/delivery-meta-report-store');
const {
  seedAdvertisingFixture,
  advertisingServices,
  advertisingHarness,
  newReviewInput,
  PRIVATE_REPORT,
  copy,
  hash,
  denied,
} = require('./check-delivery-advertising-support.cjs');

async function main() {
  assert.equal(process.argv.length, 2, 'This local checker always rolls back.');
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const originalFetch = global.fetch;
  let networkCalls = 0;
  global.fetch = async () => {
    networkCalls++;
    throw new Error('Network is forbidden in advertising acceptance.');
  };
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const originalQuery = runner.query.bind(runner);
  let reading = false;
  let failActivity = false;
  runner.query = async (...arguments_) => {
    const sql = arguments_[0];
    if (reading)
      assert(
        !/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql),
        'Advertising read attempted a write.',
      );
    if (
      failActivity &&
      /^\s*INSERT\b/i.test(sql) &&
      sql.includes('otogrowActivityEvent')
    )
      throw new Error('Synthetic advertising audit failure');
    return originalQuery(...arguments_);
  };
  try {
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const fixture = await seedAdvertisingFixture(runner.manager);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (work) => runner.manager.transaction(work),
    };
    const services = advertisingServices(source, fixture);
    const call = advertisingHarness(services, fixture, runner.manager);
    const query = async (method, input, person) => {
      reading = true;
      try {
        return await call(method, input, person);
      } finally {
        reading = false;
      }
    };
    const nativeTasks = async () =>
      await runner.query(
        `SELECT id,title,"assigneeId","dueAt",status FROM "${fixture.schemaName}".task WHERE "deletedAt" IS NULL ORDER BY id`,
      );
    const tasksBefore = await nativeTasks();
    const operationsBefore = (
      await runner.query(
        'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
        [fixture.workspaceId],
      )
    )[0].state;
    const sourceRef = { kind: 'META', id: fixture.metaReports[0].id };
    const manualRef = { kind: 'MANUAL', id: fixture.manualReports[0].id };
    const meta = await query('source', sourceRef);
    const manual = await query('source', manualRef);
    assert.equal(meta.source.spendMicros, '100120000');
    assert.equal(manual.source.spendMicros, '100120000');
    assert.equal(meta.adTotalCount, 55);
    assert.equal(meta.ads.length, 25);
    const adPageTwo = await query('source', {
      ...sourceRef,
      adOffset: meta.nextAdOffset,
    });
    const adPageThree = await query('source', {
      ...sourceRef,
      adOffset: adPageTwo.nextAdOffset,
    });
    assert.equal(adPageTwo.ads.length, 25);
    assert.equal(adPageThree.ads.length, 5);
    assert.equal(
      new Set(
        [...meta.ads, ...adPageTwo.ads, ...adPageThree.ads].map((ad) => ad.id),
      ).size,
      55,
    );
    const rawLeads = meta.metrics.filter(
      (metric) => metric.goalKinds.includes('LEADS') && metric.value === '6',
    );
    assert(rawLeads.length >= 1);
    assert(
      !meta.metrics.some(
        (metric) =>
          metric.goalKinds.includes('QUALIFIED_LEADS') && metric.value === '6',
      ),
      'Platform lead events are never qualified leads.',
    );
    assert(
      !meta.metrics.some((metric) => metric.value === '12'),
      'Overlapping raw events must not be summed.',
    );
    const manualZero = manual.metrics.filter(
      (metric) =>
        metric.goalKinds.includes('PURCHASES') && metric.unit === 'COUNT',
    );
    assert(
      manualZero.some((metric) => metric.value === '0'),
      'Explicit human zero remains known.',
    );
    assert(
      manual.metrics.some((metric) => metric.value === null),
      'Missing commerce revenue remains unknown.',
    );
    let after = null;
    const reports = [];
    do {
      const page = await query('sources', {
        projectId: fixture.projects.first,
        after,
      });
      assert.equal(page.totalCount, 69);
      assert(page.items.length <= 25);
      assert(!JSON.stringify(page).includes(PRIVATE_REPORT));
      reports.push(...page.items);
      after = page.nextCursor;
    } while (after);
    assert.equal(reports.length, 69);
    assert.equal(
      new Set(reports.map((report) => `${report.kind}:${report.id}`)).size,
      69,
    );
    assert.equal(
      reports.find((report) => report.id === fixture.metaReports[0].id)
        .accountId,
      '1234567890',
    );
    assert.equal(
      reports.find((report) => report.id === fixture.metaReports[0].id)
        .hasNewerVersion,
      true,
    );
    assert.equal(
      reports.find((report) => report.id === fixture.metaReports.at(-1).id)
        .hasNewerVersion,
      false,
    );
    for (const report of reports.filter((report) => report.kind === 'MANUAL')) {
      assert.equal(report.accountId, null);
      assert.equal(report.hasNewerVersion, false);
      assert.equal(report.archived, false);
    }
    const staffMeta = await query(
      'sources',
      { sourceKind: 'META' },
      fixture.people.writer,
    );
    assert.equal(
      staffMeta.totalCount,
      0,
      'Internal unapproved reports are hidden from the marketer.',
    );
    assert.equal(
      (await query('sources', {}, fixture.people.outsider)).totalCount,
      0,
    );
    await denied(
      query('source', { kind: 'META', id: fixture.foreignReport.id }),
    );
    await denied(
      query(
        'source',
        { kind: 'META', id: fixture.hiddenReport.id },
        fixture.people.reader,
      ),
    );
    const firstPage = await query('sources', {
      projectId: fixture.projects.first,
    });
    await denied(
      query('sources', {
        projectId: fixture.projects.otherClient,
        after: firstPage.nextCursor,
      }),
      [409],
    );
    const corruptCursor = JSON.parse(
      Buffer.from(firstPage.nextCursor, 'base64url').toString('utf8'),
    );
    corruptCursor.key = '2020-02-31|META';
    await denied(
      query('sources', {
        projectId: fixture.projects.first,
        after: Buffer.from(JSON.stringify(corruptCursor)).toString('base64url'),
      }),
      [409],
    );
    assert.deepEqual(await nativeTasks(), tasksBefore);
    assert.deepEqual(
      (
        await runner.query(
          'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].state,
      operationsBefore,
    );
    console.log(
      'Advertising source acceptance passed: 69 scoped sources, 25-row paging, exact ad pages, overlap/zero/unknown provenance, read-only source and staff privacy.',
    );

    const assistantId = randomUUID();
    const assistantConfiguration = {
      name: 'Synthetic bounded advertising brief helper',
      purpose: 'Support the human owner; no provider call in this fixture.',
      kind: 'BRIEF',
      enabled: true,
      instructions:
        'Use only the reviewed task brief and return proposals for human review.',
      requiredInputs: ['brief'],
      outputFormat: 'findings',
      tools: [],
      modelId: null,
      projectIds: [fixture.projects.first],
      roles: ['MEMBER'],
      dailyRunLimit: 1,
      maxOutputTokens: 256,
      humanConfirmation: true,
    };
    await runner.query(
      'INSERT INTO core."deliveryAgent" (id,"workspaceId",configuration,version) VALUES($1,$2,$3,1)',
      [assistantId, fixture.workspaceId, assistantConfiguration],
    );
    const assistantChoices = await query('choices', {
      sourceKind: 'META',
      sourceId: sourceRef.id,
      kind: 'ASSISTANT',
      ownerId: fixture.people.writer.memberId,
    });
    assert(
      assistantChoices.items.some(
        (choice) => choice.id === assistantId && choice.version === 1,
      ),
    );
    const input = newReviewInput(fixture, meta);
    input.actions[0].assistantId = assistantId;
    input.actions.push({
      ...input.actions[0],
      id: randomUUID(),
      title: 'Produce a second reviewed creative',
      ownerId: fixture.people.secondWriter.memberId,
    });
    const saved = await call('save', input);
    assert.equal(saved.receipt.reviewId, input.id);
    assert.equal(saved.receipt.revision, 1);
    assert.deepEqual(
      (await call('save', input)).receipt,
      saved.receipt,
      'Same immutable request returns its exact receipt.',
    );
    assert.deepEqual(
      (await query('receipt', { requestId: input.requestId })).receipt,
      saved.receipt,
    );
    await denied(
      call('save', {
        ...input,
        note: 'Different body under the same request identity.',
      }),
      [409],
    );
    await denied(call('save', newReviewInput(fixture, meta)), [409]);
    assert.deepEqual(
      await nativeTasks(),
      tasksBefore,
      'Saving a review draft creates no hidden work.',
    );
    await runner.query(
      'UPDATE core."deliveryProject" SET revision=revision+1 WHERE id=$1',
      [fixture.projects.first],
    );
    const staleAssign = {
      requestId: randomUUID(),
      id: input.id,
      revision: 1,
      sourceFingerprint: meta.fingerprint,
    };
    await denied(call('assign', staleAssign), [409]);
    assert.deepEqual(await nativeTasks(), tasksBefore);
    await runner.query(
      'UPDATE core."deliveryProject" SET revision=revision-1 WHERE id=$1',
      [fixture.projects.first],
    );
    const assignInput = { ...staleAssign, requestId: randomUUID() };
    await runner.query(
      'UPDATE core."deliveryAgent" SET version=2 WHERE id=$1',
      [assistantId],
    );
    await denied(
      call('assign', { ...assignInput, requestId: randomUUID() }),
      [409],
    );
    assert.deepEqual(await nativeTasks(), tasksBefore);
    await runner.query(
      'UPDATE core."deliveryAgent" SET version=1 WHERE id=$1',
      [assistantId],
    );
    const assigned = await call('assign', assignInput);
    assert.equal(assigned.receipt.state, 'ASSIGNED');
    assert.equal(assigned.receipt.actionTasks.length, 2);
    assert.equal((await nativeTasks()).length, tasksBefore.length + 2);
    assert.deepEqual(
      (await call('assign', assignInput)).receipt,
      assigned.receipt,
    );
    const detail = await query('review', { id: input.id });
    assert.equal(detail.review.actions.length, 2);
    assert.equal(detail.review.actions[0].assistantId, assistantId);
    assert.equal(detail.review.actions[0].assistantVersion, 1);
    assert.equal(
      (
        await runner.query(
          'SELECT count(*)::int AS count FROM core."deliveryAgentRun" WHERE "workspaceId"=$1',
          [fixture.workspaceId],
        )
      )[0].count,
      0,
      'Attaching support must not trigger inference.',
    );
    assert(
      detail.review.actions.every((action) => action.task?.state === 'PLANNED'),
    );
    for (const linked of assigned.receipt.actionTasks) {
      const [task] = await runner.query(
        'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, linked.taskId],
      );
      assert(
        !task.details.brief.includes(PRIVATE_REPORT),
        'Native task brief must not dump private account evidence.',
      );
      assert(task.details.brief.includes('Reviewed campaign evidence'));
    }
    const approvedSource = await query('source', sourceRef);
    assert.equal(approvedSource.source.sourceStatus, 'APPROVED');
    assert.equal(
      approvedSource.legacyTaskId,
      null,
      'New review creates no extra generic legacy task.',
    );
    assert.equal(
      (await query('sources', { sourceKind: 'META' }, fixture.people.writer))
        .totalCount,
      1,
    );
    await denied(
      call('save', {
        ...input,
        requestId: randomUUID(),
        revision: assigned.receipt.revision,
        sourceFingerprint: approvedSource.fingerprint,
      }),
      [409],
    );

    const followup = newReviewInput(fixture, approvedSource, {
      actions: [],
      noChangeReason:
        'Healthy report: existing work already covers the next review period.',
    });
    const followupSaved = await call('save', followup);
    assert.equal(
      (await query('source', sourceRef, fixture.people.writer)).currentDraftId,
      null,
    );
    const staffHistory = await query(
      'reviews',
      { sourceKind: 'META', sourceId: sourceRef.id },
      fixture.people.writer,
    );
    assert.equal(staffHistory.totalCount, 1);
    assert(staffHistory.items.every((packet) => packet.state === 'ASSIGNED'));
    await denied(query('review', { id: followup.id }, fixture.people.writer));
    await denied(query('state', { id: followup.id }, fixture.people.writer));
    await denied(
      query(
        'receipt',
        { requestId: followup.requestId },
        fixture.people.writer,
      ),
    );
    const taskCount = (await nativeTasks()).length;
    const noChange = await call('assign', {
      requestId: randomUUID(),
      id: followup.id,
      revision: followupSaved.receipt.revision,
      sourceFingerprint: approvedSource.fingerprint,
    });
    assert.equal(noChange.receipt.actionTasks.length, 0);
    assert.equal((await nativeTasks()).length, taskCount);
    const history = await query('reviews', {
      sourceKind: 'META',
      sourceId: sourceRef.id,
    });
    assert.equal(history.totalCount, 2);
    assert(history.items.every((packet) => packet.state === 'ASSIGNED'));
    assert.equal(history.currentDraftId, null);
    const oldPacket = await query('review', { id: input.id });
    assert.deepEqual(oldPacket.review.goal, detail.review.goal);
    assert.deepEqual(oldPacket.review.source, detail.review.source);
    console.log(
      'Advertising commands passed: exact request receipts, stale routing rollback, two native tasks once, approved source without generic work, immutable follow-up packets and no-change decisions.',
    );

    const manualInput = newReviewInput(fixture, manual);
    const manualSaved = await call('save', manualInput);
    const manualAssigned = await call('assign', {
      requestId: randomUUID(),
      id: manualInput.id,
      revision: manualSaved.receipt.revision,
      sourceFingerprint: manual.fingerprint,
    });
    assert.equal(manualAssigned.receipt.actionTasks.length, 1);
    const reviewedManual = await query('source', manualRef);
    assert.equal(reviewedManual.source.sourceStatus, 'APPROVED');
    assert.equal(reviewedManual.source.sourceRevision, 2);
    assert.equal(reviewedManual.legacyTaskId, null);
    await denied(
      services.business.command(
        fixture.workspace,
        fixture.people.admin.memberId,
        fixture.people.admin.userWorkspaceId,
        {
          action: 'assign',
          id: manualRef.id,
          revision: 2,
          assigneeId: fixture.people.writer.memberId,
          reviewerId: fixture.people.reader.memberId,
          dueDate: '2030-02-23',
        },
      ),
      [409],
    );

    await runner.query(
      `UPDATE "${fixture.schemaName}".task SET "dueAt"='2030-02-23T23:59:00.000Z' WHERE id=$1`,
      [fixture.taskId],
    );
    await runner.query(
      `UPDATE core."deliveryTask" SET details=jsonb_set(details,'{state}','"APPROVED"') WHERE "workspaceId"=$1 AND "taskId"=$2`,
      [fixture.workspaceId, fixture.taskId],
    );
    const updateManual = async (id, fields) => {
      const [operations] = await runner.query(
        'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
        [fixture.workspaceId],
      );
      Object.assign(
        operations.state.business.records.find((record) => record.id === id),
        fields,
      );
      await runner.query(
        'UPDATE core."deliveryOperations" SET state=$2 WHERE "workspaceId"=$1',
        [fixture.workspaceId, operations.state],
      );
    };
    const authorId = fixture.manualReports[2].id;
    await updateManual(authorId, { createdBy: fixture.people.reader.memberId });
    const authorSource = await query(
      'source',
      { kind: 'MANUAL', id: authorId },
      fixture.people.reader,
    );
    assert.equal(authorSource.canManageDraft, true);
    assert.equal(authorSource.canReview, false);
    const authorDraft = newReviewInput(fixture, authorSource, {
      actions: [],
      noChangeReason: 'An independent manager must review this healthy report.',
    });
    const authorSaved = await call('save', authorDraft, fixture.people.reader);
    const authorAssignment = {
      requestId: randomUUID(),
      id: authorDraft.id,
      revision: authorSaved.receipt.revision,
      sourceFingerprint: authorSource.fingerprint,
    };
    await denied(call('assign', authorAssignment, fixture.people.reader));
    const independentSource = await query('source', {
      kind: 'MANUAL',
      id: authorId,
    });
    assert.equal(
      independentSource.fingerprint,
      authorSource.fingerprint,
      'Source identity must not change merely because an independent manager opens it.',
    );
    const independentDecision = await call('assign', {
      ...authorAssignment,
      requestId: randomUUID(),
    });
    assert.equal(independentDecision.receipt.actionTasks.length, 0);
    assert.equal(
      (await query('source', { kind: 'MANUAL', id: authorId })).source
        .sourceStatus,
      'APPROVED',
    );

    const legacyId = fixture.manualReports[1].id;
    await updateManual(legacyId, {
      status: 'APPROVED',
      taskId: fixture.taskId,
      decisionBy: fixture.people.admin.memberId,
    });
    const legacySource = await query('source', {
      kind: 'MANUAL',
      id: legacyId,
    });
    const legacyTask = legacySource.legacyTask;
    assert.equal(legacyTask.state, 'APPROVED');
    const adoptionInput = newReviewInput(fixture, legacySource);
    adoptionInput.actions[0] = {
      ...adoptionInput.actions[0],
      reviewerId: legacyTask.reviewerId,
      dueDate: legacyTask.dueAt.slice(0, 10),
      adoptTaskId: legacyTask.id,
    };
    adoptionInput.legacyHandling = {
      mode: 'ADOPT',
      taskId: legacyTask.id,
      taskRevision: legacyTask.revision,
      taskState: legacyTask.state,
      reason: '',
    };
    const taskBeforeAdoption = hash(
      await runner.query(
        `SELECT to_jsonb(native)::text AS native,to_jsonb(delivery)::text AS delivery FROM "${fixture.schemaName}".task native JOIN core."deliveryTask" delivery ON delivery."taskId"=native.id AND delivery."workspaceId"=$1 WHERE native.id=$2`,
        [fixture.workspaceId, fixture.taskId],
      ),
    );
    const countBeforeAdoption = (await nativeTasks()).length;
    const adoptionSaved = await call('save', adoptionInput);
    const adoptionAssigned = await call('assign', {
      requestId: randomUUID(),
      id: adoptionInput.id,
      revision: adoptionSaved.receipt.revision,
      sourceFingerprint: legacySource.fingerprint,
    });
    assert.equal(
      adoptionAssigned.receipt.actionTasks[0].taskId,
      fixture.taskId,
    );
    assert.equal((await nativeTasks()).length, countBeforeAdoption);
    assert.equal(
      hash(
        await runner.query(
          `SELECT to_jsonb(native)::text AS native,to_jsonb(delivery)::text AS delivery FROM "${fixture.schemaName}".task native JOIN core."deliveryTask" delivery ON delivery."taskId"=native.id AND delivery."workspaceId"=$1 WHERE native.id=$2`,
          [fixture.workspaceId, fixture.taskId],
        ),
      ),
      taskBeforeAdoption,
      'Adoption preserves every existing native and delivery task field.',
    );
    const legacyCurrent = await query('source', {
      kind: 'MANUAL',
      id: legacyId,
    });
    const duplicateAdoption = {
      ...copy(adoptionInput),
      id: randomUUID(),
      requestId: randomUUID(),
      sourceFingerprint: legacyCurrent.fingerprint,
    };
    duplicateAdoption.actions[0].id = randomUUID();
    await denied(call('save', duplicateAdoption), [409]);
    const additional = newReviewInput(fixture, legacyCurrent);
    additional.legacyHandling = {
      ...adoptionInput.legacyHandling,
      mode: 'ADDITIONAL_WORK',
      reason:
        'The completed generic review does not cover this new creative test.',
    };
    const additionalSaved = await call('save', additional);
    const additionalAssigned = await call('assign', {
      requestId: randomUUID(),
      id: additional.id,
      revision: additionalSaved.receipt.revision,
      sourceFingerprint: legacyCurrent.fingerprint,
    });
    assert.equal(additionalAssigned.receipt.actionTasks.length, 1);
    assert.notEqual(
      additionalAssigned.receipt.actionTasks[0].taskId,
      fixture.taskId,
    );
    assert.equal((await nativeTasks()).length, countBeforeAdoption + 1);
    console.log(
      'Manual/legacy workflows passed: independent manual approval, legacy direct-assignment guard, completed-task adoption without any overwrite, global duplicate-adoption denial and explicit separate new work.',
    );

    const nativeCommand = (person, input) =>
      services.delivery.command(
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
        runner.manager,
      );
    for (const taskId of [
      assigned.receipt.actionTasks[0].taskId,
      manualAssigned.receipt.actionTasks[0].taskId,
    ]) {
      await nativeCommand(fixture.people.writer, {
        action: 'progress',
        taskId,
        revision: 1,
        state: 'IN_PROGRESS',
        blocker: '',
        checklist: [],
        evidence: [],
      });
      await nativeCommand(fixture.people.writer, {
        action: 'submit',
        taskId,
        revision: 2,
        description: 'Synthetic reviewed recommendation evidence',
        evidence: ['https://example.invalid/completed-advertising-work'],
      });
      await denied(
        nativeCommand(fixture.people.writer, {
          action: 'review',
          taskId,
          revision: 3,
          selectedSubmissionVersion: 1,
          reviewAssignmentRevision: 0,
          decision: 'APPROVED',
          feedback: 'A producer cannot approve their own result.',
        }),
      );
      await nativeCommand(fixture.people.reader, {
        action: 'review',
        taskId,
        revision: 3,
        selectedSubmissionVersion: 1,
        reviewAssignmentRevision: 0,
        decision: 'APPROVED',
        feedback: 'Independent reviewer checked the submitted evidence.',
      });
    }
    const completedActions = await query('review', { id: input.id });
    assert.equal(completedActions.review.actions[0].task.state, 'APPROVED');
    assert.equal(
      completedActions.review.actions[0].task.submissionState,
      'APPROVED',
    );
    assert.equal(
      completedActions.review.actions[0].task.evidence[0].url,
      'https://example.invalid/completed-advertising-work',
    );
    assert.equal(
      (await query('observations', { reviewId: input.id })).totalCount,
      0,
      'Task approval never invents a campaign improvement observation.',
    );
    console.log(
      'Meta/manual assigned tasks passed through existing progress, evidence submission and independent review; self-approval denied and no campaign improvement inferred.',
    );

    const observationInput = {
      requestId: randomUUID(),
      id: randomUUID(),
      reviewId: input.id,
      actionId: input.actions[0].id,
      correctsId: null,
      assessment: 'INCONCLUSIVE',
      sourceKind: null,
      sourceId: null,
      metricKey: null,
      sourceFingerprint: null,
      metricAdId: null,
      value: null,
      fromDate: '2020-02-22',
      throughDate: '2020-02-22',
      evidence: 'https://example.invalid/synthetic-later-evidence',
      note: 'Work remains in progress; no causal performance conclusion.',
    };
    const observed = await call('observe', observationInput);
    assert.equal(observed.receipt.observationId, observationInput.id);
    assert.deepEqual(
      (await call('observe', observationInput)).receipt,
      observed.receipt,
    );
    const correctionInput = {
      ...observationInput,
      requestId: randomUUID(),
      id: randomUUID(),
      correctsId: observationInput.id,
      note: 'Correction: the observation window needs more delivery evidence.',
    };
    await call('observe', correctionInput);
    const observations = await query('observations', { reviewId: input.id });
    assert.equal(observations.totalCount, 2);
    assert.equal(
      observations.items.find((item) => item.id === observationInput.id)
        .correctedById,
      correctionInput.id,
    );
    assert.equal(
      observations.items.find((item) => item.id === observationInput.id).note,
      observationInput.note,
    );
    assert(observations.items.every((item) => item.task.state === 'APPROVED'));
    await denied(
      call('observe', {
        ...correctionInput,
        requestId: randomUUID(),
        id: randomUUID(),
      }),
      [409],
    );
    const later = await query('source', {
      kind: 'META',
      id: fixture.laterReport.id,
    });
    const laterMetric = later.metrics.find(
      (metric) =>
        metric.goalKinds.includes('PURCHASES') && metric.value === '10',
    );
    assert(laterMetric);
    const linkedObservation = {
      ...observationInput,
      requestId: randomUUID(),
      id: randomUUID(),
      assessment: 'IMPROVED',
      sourceKind: 'META',
      sourceId: later.source.id,
      sourceFingerprint: later.fingerprint,
      metricAdId: null,
      metricKey: laterMetric.key,
      value: laterMetric.value,
      note: 'Same-account reported purchases increased; this observation does not establish causation.',
    };
    await call('observe', linkedObservation);
    for (const change of [{ accountId: '9988776655' }, { timezone: 'UTC' }]) {
      const report = {
        ...copy(fixture.laterReport),
        ...change,
        id: randomUUID(),
      };
      await insertMetaReport(runner.manager, fixture.workspaceId, report);
      const other = await query('source', { kind: 'META', id: report.id });
      const observation = {
        ...linkedObservation,
        requestId: randomUUID(),
        id: randomUUID(),
        sourceId: report.id,
        sourceFingerprint: other.fingerprint,
      };
      await denied(call('observe', observation), [400]);
      await call('observe', {
        ...observation,
        requestId: randomUUID(),
        id: randomUUID(),
        assessment: 'INCONCLUSIVE',
        note: 'Different or incompatible reporting scope; retain this as inconclusive evidence only.',
      });
    }
    const routeReport = {
      ...copy(fixture.laterReport),
      id: randomUUID(),
      managerId: fixture.people.admin.memberId,
    };
    await insertMetaReport(runner.manager, fixture.workspaceId, routeReport);
    const laterList = await query('sources', {
      projectId: fixture.projects.first,
      fromDate: '2020-02-22',
      throughDate: '2020-02-22',
    });
    assert.equal(
      laterList.items.find((report) => report.id === fixture.laterReport.id)
        .hasNewerVersion,
      false,
      'Newer account/timezone/routing scopes must not masquerade as a newer version of the original report.',
    );
    await runner.query(
      'UPDATE core."deliveryMetaReport" SET "archivedAt"=now() WHERE "workspaceId"=$1 AND id=$2',
      [fixture.workspaceId, fixture.laterReport.id],
    );
    const archivedList = await query('sources', {
      projectId: fixture.projects.first,
      fromDate: '2020-02-22',
      throughDate: '2020-02-22',
    });
    assert.equal(
      archivedList.items.find((report) => report.id === fixture.laterReport.id)
        .archived,
      true,
    );
    console.log(
      'Observation comparability passed: exact matching account/timezone/metric accepted; different account or reporting timezone denied as conclusive and preserved only as explicit inconclusive evidence.',
    );
    const staffObservation = {
      ...observationInput,
      requestId: randomUUID(),
      id: randomUUID(),
      note: 'Task owner recorded an explicitly inconclusive observation.',
    };
    const staffObserved = await call(
      'observe',
      staffObservation,
      fixture.people.writer,
    );
    assert.deepEqual(
      (
        await query(
          'receipt',
          { requestId: staffObservation.requestId },
          fixture.people.writer,
        )
      ).receipt,
      staffObserved.receipt,
    );
    const beforeFailure = hash(
      await runner.query(
        'SELECT to_jsonb(event)::text AS value FROM core."deliveryAdvertisingEvent" event WHERE "workspaceId"=$1 ORDER BY id',
        [fixture.workspaceId],
      ),
    );
    failActivity = true;
    try {
      await assert.rejects(
        runner.manager.transaction(() =>
          call('observe', {
            ...observationInput,
            requestId: randomUUID(),
            id: randomUUID(),
          }),
        ),
        /Synthetic advertising audit failure/,
      );
    } finally {
      failActivity = false;
    }
    assert.equal(
      hash(
        await runner.query(
          'SELECT to_jsonb(event)::text AS value FROM core."deliveryAdvertisingEvent" event WHERE "workspaceId"=$1 ORDER BY id',
          [fixture.workspaceId],
        ),
      ),
      beforeFailure,
      'Audit failure rolls back command receipt and domain evidence together.',
    );
    const sourceStateBeforeRevocation = hash(
      await runner.query(
        'SELECT to_jsonb(row)::text AS value FROM core."deliveryAdvertisingReview" row WHERE "workspaceId"=$1 ORDER BY id',
        [fixture.workspaceId],
      ),
    );
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2,revision=revision+1 WHERE id=$1',
      [
        fixture.projects.first,
        JSON.stringify([fixture.people.secondWriter.memberId]),
      ],
    );
    await denied(query('review', { id: input.id }, fixture.people.writer));
    await denied(
      query('observations', { reviewId: input.id }, fixture.people.writer),
    );
    await denied(
      query(
        'receipt',
        { requestId: staffObservation.requestId },
        fixture.people.writer,
      ),
    );
    assert.equal(
      hash(
        await runner.query(
          'SELECT to_jsonb(row)::text AS value FROM core."deliveryAdvertisingReview" row WHERE "workspaceId"=$1 ORDER BY id',
          [fixture.workspaceId],
        ),
      ),
      sourceStateBeforeRevocation,
    );
    assert.equal(networkCalls, 0);
    console.log(
      'Advertising observations passed: append-only original/correction chain, exact task evidence, receipt recovery, atomic audit rollback and project revocation. All fixture data rolls back; no provider calls.',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
    global.fetch = originalFetch;
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

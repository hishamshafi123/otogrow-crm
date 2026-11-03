const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  seedAdvertisingFixture,
  advertisingServices,
} = require('./check-delivery-advertising-support.cjs');
const {
  originalDigest,
  deny,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryCreativeLearningService,
} = require('../dist/modules/delivery/creative/learning/delivery-creative-learning.service');
const {
  freezeCreativeSubmissionLearning,
} = require('../dist/modules/delivery/creative/learning/freeze-creative-submission-learning');
const {
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');
const {
  DeliveryProjectEntity,
} = require('../dist/modules/delivery/entities/delivery-project.entity');
const {
  DeliveryCreativeAdLinkEntity,
} = require('../dist/modules/delivery/creative/learning/entities/delivery-creative-ad-link.entity');
const {
  DeliveryCreativeAdVersionEntity,
} = require('../dist/modules/delivery/creative/learning/entities/delivery-creative-ad-version.entity');
const {
  DeliveryCreativeLearningEventEntity,
} = require('../dist/modules/delivery/creative/learning/entities/delivery-creative-learning-event.entity');
const {
  DeliveryCreativeLessonEntity,
} = require('../dist/modules/delivery/creative/learning/entities/delivery-creative-lesson.entity');
const copy = (value) => JSON.parse(JSON.stringify(value));

function learningServices(source, fixture) {
  const services = advertisingServices(source, fixture);
  const storage = {
    getCurrentDriver: () => ({
      readFile: async ({ filePath }) => {
        const allowed = [
          fixture.assets.image,
          fixture.assets.video,
          fixture.otherAssetId,
          ...(fixture.extraLearningAssets ?? []),
        ].some((id) => filePath.endsWith(`/${id}`));
        assert(
          allowed &&
            filePath.startsWith(`${fixture.workspaceId}/delivery-creative/`),
          'Only owned synthetic evidence bytes may be read.',
        );
        return Readable.from([
          Buffer.alloc(1024, fixture.tamperedBytes ? 0x43 : 0x42),
        ]);
      },
    }),
  };
  const creative = new DeliveryCreativeService(
    source,
    services.delivery,
    storage,
  );
  const learning = new DeliveryCreativeLearningService(
    source,
    services.delivery,
    creative,
    services.sources,
    storage,
  );
  return { ...services, creative, learning };
}
async function seedLearningFixture(manager) {
  const fixture = await seedAdvertisingFixture(manager);
  const scoped = {
    manager,
    query: (...arguments_) => manager.query(...arguments_),
    getRepository: (entity) => manager.getRepository(entity),
    transaction: (operation) => manager.transaction(operation),
  };
  const services = learningServices(scoped, fixture);
  const admin = fixture.people.admin;
  const writer = fixture.people.writer;
  const taskRepository = manager.getRepository(DeliveryTaskEntity);
  const task = await taskRepository.findOneByOrFail({
    workspaceId: fixture.workspaceId,
    taskId: fixture.taskId,
  });
  task.details.state = 'CHANGES_REQUESTED';
  task.details.submissions = [];
  task.details.draftCopy = 'FIXTURE original submitted copy';
  fixture.learningComponents = Object.fromEntries(
    ['BASE', 'HOOK', 'CTA'].map((role) => [role, randomUUID()]),
  );
  const final = task.details.creative.assets.find(
    (asset) => asset.id === fixture.assets.image,
  );
  assert(final);
  for (const [role, id] of Object.entries(fixture.learningComponents))
    task.details.creative.assets.push({
      ...copy(final),
      id,
      name: `FIXTURE approved ${role.toLowerCase()} video`,
      kind: role,
      mimeType: 'video/mp4',
      reviews: [
        {
          memberId: admin.memberId,
          at: '2020-02-20T01:00:00.000Z',
          decision: 'APPROVED',
          notes:
            'FIXTURE current component, association remains human-declared.',
        },
      ],
    });
  await taskRepository.save(task);
  await services.delivery.command(
    fixture.workspace,
    writer.memberId,
    writer.userWorkspaceId,
    {
      action: 'submit',
      taskId: fixture.taskId,
      revision: task.revision,
      description: 'FIXTURE approved creative for learning',
      evidence: [],
    },
    manager,
  );
  const submitted = await taskRepository.findOneByOrFail({
    workspaceId: fixture.workspaceId,
    taskId: fixture.taskId,
  });
  fixture.learningSubmissionVersion =
    submitted.details.submissions.at(-1).version;
  await services.delivery.command(
    fixture.workspace,
    admin.memberId,
    admin.userWorkspaceId,
    {
      action: 'review',
      taskId: fixture.taskId,
      revision: submitted.revision,
      selectedSubmissionVersion: fixture.learningSubmissionVersion,
      creativeVersion: submitted.details.creative.version,
      finalAssetId: fixture.assets.image,
      decision: 'APPROVED',
      feedback: 'FIXTURE independently approved exact source.',
    },
    manager,
  );
  const reportId = fixture.metaReports[0].id;
  const source = await services.sources.read(
    manager,
    fixture.workspace,
    admin.memberId,
    admin.userWorkspaceId,
    { kind: 'META', id: reportId },
    0,
    '1000',
  );
  await services.sources.approve(
    manager,
    fixture.workspace,
    admin.memberId,
    admin.userWorkspaceId,
    { kind: 'META', id: reportId },
    source.fingerprint,
    'FIXTURE source report independently approved.',
  );
  fixture.learningReportId = reportId;
  return fixture;
}
async function associationInput(
  services,
  fixture,
  person = fixture.people.writer,
  fields = {},
  manager,
) {
  assert(
    manager?.queryRunner?.isTransactionActive,
    'Exact source choices require the actual transaction manager.',
  );
  const source = await services.sources.read(
    manager,
    fixture.workspace,
    person.memberId,
    person.userWorkspaceId,
    { kind: 'META', id: fixture.learningReportId },
    0,
    '1000',
  );
  const metric = source.metrics.find((metric) =>
    metric.goalKinds.includes('PURCHASES'),
  );
  assert(metric);
  return {
    projectId: fixture.projects.first,
    sourceId: fixture.learningReportId,
    adId: '1000',
    taskId: fixture.taskId,
    submissionVersion: fixture.learningSubmissionVersion,
    assetId: fixture.assets.image,
    goal: {
      kind: 'PURCHASES',
      metricKey: metric.key,
      metricAdId: '1000',
      provenance: 'REPORT',
      value: metric.value,
      evidence: '',
      targetCostMicros: null,
    },
    declaredComponents: [],
    declaredCopy: null,
    associationEvidence:
      'FIXTURE human checked exact ad and approved source. Provider creative identity remains unavailable.',
    evidenceUrl: 'https://example.invalid/placement-evidence',
    note: 'FIXTURE independent association; no causal claim.',
    correctsId: null,
    ...fields,
  };
}
async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Rollback-only fixture; no live/browser mode.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const beforeFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Learning acceptance forbids network and provider calls.');
  };
  let runner;
  let baseline;
  let checks = 0;
  try {
    await connectionSource.initialize();
    baseline = await originalDigest((...arguments_) =>
      connectionSource.query(...arguments_),
    );
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const originalQuery = runner.query.bind(runner);
    let readOnly = false;
    let failActivity = false;
    runner.query = async (...arguments_) => {
      const sql = arguments_[0];
      if (readOnly)
        assert(
          !/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql),
          'Learning reads cannot change data.',
        );
      if (
        failActivity &&
        /^INSERT/i.test(sql) &&
        sql.includes('otogrowActivityEvent')
      )
        throw new Error('FIXTURE learning atomic activity failure');
      return originalQuery(...arguments_);
    };
    await runner.query("SET LOCAL lock_timeout='5s'");
    const fixture = await seedLearningFixture(runner.manager);
    const scoped = {
      manager: runner.manager,
      query: (...arguments_) => runner.query(...arguments_),
      getRepository: (entity) => runner.manager.getRepository(entity),
      transaction: (operation) => runner.manager.transaction(operation),
    };
    const services = learningServices(scoped, fixture);
    const writer = fixture.people.writer;
    const admin = fixture.people.admin;
    const manager = fixture.people.reader;
    const call = (method, input, person = writer) =>
      services.learning[method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const taskRepository = runner.manager.getRepository(DeliveryTaskEntity);
    const linkRepository = runner.manager.getRepository(
      DeliveryCreativeAdLinkEntity,
    );
    const versionRepository = runner.manager.getRepository(
      DeliveryCreativeAdVersionEntity,
    );
    const eventRepository = runner.manager.getRepository(
      DeliveryCreativeLearningEventEntity,
    );
    const lessonRepository = runner.manager.getRepository(
      DeliveryCreativeLessonEntity,
    );
    const task = await taskRepository.findOneByOrFail({
      workspaceId: fixture.workspaceId,
      taskId: fixture.taskId,
    });
    assert.equal(
      task.details.submissions[0].creativeLearning.projectId,
      fixture.projects.first,
    );
    assert.equal(
      task.details.submissions[0].creativeLearning.copyText,
      'FIXTURE original submitted copy',
    );
    assert.equal(
      task.details.submissions[0].creativeLearning.components.length,
      0,
    );
    const sourceBefore = copy(task.details);
    const input = await associationInput(
      services,
      fixture,
      writer,
      {},
      runner.manager,
    );
    const choiceInput = {
      sourceId: input.sourceId,
      adId: input.adId,
      projectId: input.projectId,
      selectedTaskId: input.taskId,
      selectedSubmissionVersion: input.submissionVersion,
      selectedAssetId: input.assetId,
    };
    readOnly = true;
    const selectedChoices = await call('choices', choiceInput);
    assert.deepEqual(selectedChoices.selectionWarnings, []);
    assert.deepEqual(selectedChoices.selected.provenComponents, []);
    assert.equal(selectedChoices.selected.hasSubmittedCopy, true);
    assert.deepEqual(
      selectedChoices.selected.components.map((component) => [
        component.role,
        component.assetId,
        component.name,
        component.provenance,
      ]),
      Object.entries(fixture.learningComponents).map(([role, id]) => [
        role,
        id,
        `FIXTURE approved ${role.toLowerCase()} video`,
        'AVAILABLE_FOR_HUMAN_DECLARATION',
      ]),
    );
    const declaredInput = {
      ...input,
      declaredComponents: [
        { role: 'HOOK', assetId: fixture.learningComponents.HOOK },
      ],
    };
    const declaredPreview = await call('preview', declaredInput);
    assert.equal(
      declaredPreview.body.components[0].provenance,
      'HUMAN_DECLARED',
    );
    assert.equal(
      declaredPreview.body.components[0].name,
      'FIXTURE approved hook video',
    );
    await deny(
      call('preview', {
        ...input,
        declaredComponents: [
          { role: 'CTA', assetId: fixture.learningComponents.HOOK },
        ],
      }),
      [400],
    );
    const preview = await call('preview', input);
    readOnly = false;
    const changedTask = copy(task);
    changedTask.details.creative.assets
      .find((asset) => asset.id === fixture.learningComponents.HOOK)
      .reviews.push({
        memberId: admin.memberId,
        at: '2020-02-20T02:00:00.000Z',
        decision: 'REJECTED',
        notes: 'FIXTURE retired component.',
      });
    await taskRepository.save(changedTask);
    readOnly = true;
    await deny(call('preview', declaredInput), [400]);
    const currentChoices = await call('choices', choiceInput);
    assert.equal(currentChoices.selected.components.length, 2);
    readOnly = false;
    await taskRepository.save(task);
    const missingTask = copy(task);
    missingTask.details.creative.assets.find(
      (asset) => asset.id === input.assetId,
    ).storageState = 'FAILED';
    await taskRepository.save(missingTask);
    readOnly = true;
    const unavailableChoices = await call('choices', choiceInput);
    assert.equal(unavailableChoices.selected, null);
    assert.deepEqual(unavailableChoices.selectionWarnings, [
      'SELECTED_CREATIVE_UNAVAILABLE',
    ]);
    assert.equal(unavailableChoices.totalCount, 0);
    readOnly = false;
    await taskRepository.save(task);
    const unapprovedTask = copy(task);
    unapprovedTask.details.submissions[0].decision = 'CHANGES_REQUESTED';
    await taskRepository.save(unapprovedTask);
    readOnly = true;
    const unapprovedChoices = await call('choices', choiceInput);
    assert.equal(unapprovedChoices.selected, null);
    assert.deepEqual(unapprovedChoices.selectionWarnings, [
      'SELECTED_CREATIVE_UNAVAILABLE',
    ]);
    await deny(
      call('choices', { ...choiceInput, selectedTaskId: randomUUID() }),
      [404],
    );
    readOnly = false;
    await taskRepository.save(task);
    checks += 14;
    assert(
      preview.body.assetSha256 &&
        preview.body.warnings.includes(
          'HUMAN_ASSOCIATION_NOT_PROVIDER_VERIFIED',
        ),
    );
    assert.equal(preview.body.adSpendMicros, '100120000');
    const savedInput = {
      ...input,
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 0,
      previewFingerprint: preview.body.previewFingerprint,
    };
    const saved = await call('save', savedInput);
    assert.equal(saved.receipt.action, 'SAVE');
    assert.equal(
      (await call('save', savedInput)).receipt.linkId,
      saved.receipt.linkId,
    );
    assert.equal(
      await versionRepository.countBy({
        workspaceId: fixture.workspaceId,
        linkId: savedInput.id,
      }),
      1,
    );
    await deny(
      call('save', { ...savedInput, note: 'different request body' }),
      [409],
    );
    await deny(
      call('receipt', { requestId: savedInput.requestId }, admin),
      [404],
    );
    const beforePrivate = await call(
      'list',
      { projectId: fixture.projects.first },
      fixture.people.secondWriter,
    );
    assert.equal(
      beforePrivate.totalCount,
      0,
      'Unrelated source readers must not learn private draft existence.',
    );
    for (let index = 1; index <= 28; index++) {
      const edited = { ...input, note: `FIXTURE draft correction ${index}` };
      const editedPreview = await call('preview', edited);
      await call('save', {
        ...edited,
        id: savedInput.id,
        requestId: randomUUID(),
        revision: index,
        previewFingerprint: editedPreview.body.previewFingerprint,
      });
    }
    const historyRows = await runner.query(
      'SELECT id,"requestId" FROM core."deliveryCreativeLearningEvent" WHERE "workspaceId"=$1 AND "linkId"=$2 ORDER BY "createdAt" DESC,id DESC',
      [fixture.workspaceId, savedInput.id],
    );
    readOnly = true;
    const historyFirst = await call('detail', { id: savedInput.id });
    const historySecond = await call('detail', {
      id: savedInput.id,
      afterEventId: historyFirst.nextEventCursor,
    });
    readOnly = false;
    assert.equal(historyRows.length, 29);
    assert.deepEqual(
      [...historyFirst.events, ...historySecond.events].map(
        (event) => event.requestId,
      ),
      historyRows.map((event) => event.requestId),
      'Newest-first exact tuple paging must neither duplicate nor skip history.',
    );
    assert.equal(historyFirst.nextEventCursor, historyRows[24].id);
    assert.equal(historySecond.nextEventCursor, null);
    await deny(
      call('detail', { id: savedInput.id, afterEventId: randomUUID() }),
      [400],
    );
    checks += 5;
    let detail = await call('detail', { id: savedInput.id });
    assert.equal(detail.body.copyText, 'FIXTURE original submitted copy');
    const submit = {
      id: savedInput.id,
      requestId: randomUUID(),
      revision: detail.link.revision,
      action: 'SUBMIT',
      previewFingerprint: detail.body.previewFingerprint,
      note: 'FIXTURE proposed association.',
    };
    await call('decide', submit);
    detail = await call('detail', { id: savedInput.id });
    await deny(
      call('decide', {
        ...submit,
        requestId: randomUUID(),
        revision: detail.link.revision,
        action: 'REVIEW',
      }),
      [403],
    );
    const reviewed = await call(
      'decide',
      {
        ...submit,
        requestId: randomUUID(),
        revision: detail.link.revision,
        action: 'REVIEW',
        note: 'FIXTURE independent manager checked association.',
      },
      manager,
    );
    assert.equal(reviewed.receipt.state, 'REVIEWED');
    detail = await call('detail', { id: savedInput.id }, manager);
    assert.equal(detail.canEdit, false);
    const secondWriterVisible = await call(
      'list',
      { projectId: fixture.projects.first },
      fixture.people.secondWriter,
    );
    assert.equal(
      secondWriterVisible.totalCount,
      0,
      'Creative project access alone must not reveal Meta report evidence.',
    );
    await deny(
      call('save', {
        ...savedInput,
        requestId: randomUUID(),
        revision: detail.link.revision,
      }),
      [409],
    );
    assert.deepEqual(
      (
        await taskRepository.findOneByOrFail({
          workspaceId: fixture.workspaceId,
          taskId: fixture.taskId,
        })
      ).details,
      sourceBefore,
      'Association writes do not change creative/tasks/approvals/copy.',
    );
    checks += 17;
    const lessonInput = {
      id: randomUUID(),
      requestId: randomUUID(),
      projectId: fixture.projects.first,
      linkIds: [detail.link.id],
      linkFingerprints: [detail.link.fingerprint],
      title: 'FIXTURE bounded creative lesson',
      assessment: 'NEEDS_ANOTHER_TEST',
      lesson:
        'The exact ad has zero observed purchases; this does not establish that its hook caused the outcome.',
      limitations:
        'FIXTURE one report/window only, human association and no provider creative verification.',
      nextTest: 'A human can design a controlled variant test.',
      correctsId: null,
    };
    await deny(call('recordLesson', lessonInput, writer), [403]);
    const lesson = await call('recordLesson', lessonInput, manager);
    assert.equal(lesson.receipt.action, 'LESSON');
    assert.equal(lesson.receipt.lessonId, lessonInput.id);
    assert.equal(
      (await call('recordLesson', lessonInput, manager)).receipt.lessonId,
      lessonInput.id,
    );
    const lessons = await call(
      'lessons',
      { projectId: fixture.projects.first, selectedId: lessonInput.id },
      manager,
    );
    assert.equal(lessons.totalCount, 1);
    assert.equal(
      lessons.selected.evidence[0].body.assetSha256,
      detail.body.assetSha256,
    );
    const withdrawn = await call(
      'decide',
      {
        id: detail.link.id,
        requestId: randomUUID(),
        revision: detail.link.revision,
        action: 'RETRACT',
        previewFingerprint: detail.body.previewFingerprint,
        note: 'FIXTURE association withdrawn, history retained.',
      },
      manager,
    );
    assert.equal(withdrawn.receipt.state, 'RETRACTED');
    assert.equal(
      (
        await call(
          'lessons',
          { projectId: fixture.projects.first, selectedId: lessonInput.id },
          manager,
        )
      ).selected.evidence[0].body.assetSha256,
      detail.body.assetSha256,
    );
    await deny(
      call(
        'recordLesson',
        { ...lessonInput, id: randomUUID(), requestId: randomUUID() },
        manager,
      ),
      [409],
    );
    checks += 8;
    const current = await taskRepository.findOneByOrFail({
      workspaceId: fixture.workspaceId,
      taskId: fixture.taskId,
    });
    current.details.draftCopy =
      'FIXTURE later draft must never replace approved submitted copy';
    current.details.creative.brief.concept = 'FIXTURE later live concept';
    for (let version = 2; version <= 56; version++)
      current.details.submissions.push({
        ...copy(current.details.submissions[0]),
        version,
      });
    await taskRepository.save(current);
    readOnly = true;
    const firstChoices = await call('choices', {
      sourceId: fixture.learningReportId,
      adId: '1000',
      projectId: fixture.projects.first,
    });
    const secondChoices = await call('choices', {
      sourceId: fixture.learningReportId,
      adId: '1000',
      projectId: fixture.projects.first,
      after: firstChoices.nextCursor,
    });
    const thirdChoices = await call('choices', {
      sourceId: fixture.learningReportId,
      adId: '1000',
      projectId: fixture.projects.first,
      after: secondChoices.nextCursor,
    });
    readOnly = false;
    assert.equal(firstChoices.totalCount, 56);
    assert.equal(
      new Set(
        [
          ...firstChoices.items,
          ...secondChoices.items,
          ...thirdChoices.items,
        ].map((row) => `${row.taskId}:${row.submissionVersion}`),
      ).size,
      56,
    );
    await deny(
      call('choices', {
        sourceId: fixture.learningReportId,
        adId: '1001',
        projectId: fixture.projects.first,
        after: firstChoices.nextCursor,
      }),
      [400],
    );
    const later = await call('preview', input);
    assert.equal(later.body.copyText, 'FIXTURE original submitted copy');
    assert.notEqual(
      later.body.submittedLearning.concept,
      'FIXTURE later live concept',
    );
    const crossClient = await associationInput(
      services,
      fixture,
      admin,
      {
        projectId: fixture.projects.otherClient,
        taskId: fixture.otherTaskId,
        assetId: fixture.otherAssetId,
        submissionVersion: 2,
      },
      runner.manager,
    );
    await deny(call('preview', crossClient, admin), [400, 403]);
    fixture.tamperedBytes = true;
    await deny(
      call('save', {
        ...savedInput,
        id: randomUUID(),
        requestId: randomUUID(),
      }),
      [409],
    );
    fixture.tamperedBytes = false;
    checks += 6;
    const corrected = await call('preview', {
      ...input,
      note: 'FIXTURE proposed correction.',
    });
    const atomicInput = {
      ...input,
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 0,
      previewFingerprint: corrected.body.previewFingerprint,
      note: 'FIXTURE proposed correction.',
    };
    const beforeAtomic = {
      links: await linkRepository.countBy({ workspaceId: fixture.workspaceId }),
      versions: await versionRepository.countBy({
        workspaceId: fixture.workspaceId,
      }),
      events: await eventRepository.countBy({
        workspaceId: fixture.workspaceId,
      }),
      lessons: await lessonRepository.countBy({
        workspaceId: fixture.workspaceId,
      }),
    };
    failActivity = true;
    await assert.rejects(call('save', atomicInput), /atomic activity failure/);
    failActivity = false;
    assert.equal(
      await linkRepository.countBy({ workspaceId: fixture.workspaceId }),
      beforeAtomic.links,
    );
    assert.equal(
      await versionRepository.countBy({ workspaceId: fixture.workspaceId }),
      beforeAtomic.versions,
    );
    assert.equal(
      await eventRepository.countBy({ workspaceId: fixture.workspaceId }),
      beforeAtomic.events,
    );
    const pendingPreview = await call('preview', input);
    const pendingInput = {
      ...input,
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 0,
      previewFingerprint: pendingPreview.body.previewFingerprint,
    };
    await call('save', pendingInput);
    let pending = await call('detail', { id: pendingInput.id });
    await call('decide', {
      id: pendingInput.id,
      requestId: randomUUID(),
      revision: pending.link.revision,
      action: 'SUBMIT',
      previewFingerprint: pending.body.previewFingerprint,
      note: '',
    });
    pending = await call('detail', { id: pendingInput.id }, manager);
    const projectRepository = runner.manager.getRepository(
      DeliveryProjectEntity,
    );
    const project = await projectRepository.findOneByOrFail({
      workspaceId: fixture.workspaceId,
      id: fixture.projects.first,
    });
    const originalCompany = project.companyId;
    const otherProject = await projectRepository.findOneByOrFail({
      workspaceId: fixture.workspaceId,
      id: fixture.projects.otherClient,
    });
    await projectRepository.update(
      { workspaceId: fixture.workspaceId, id: project.id },
      { companyId: otherProject.companyId },
    );
    assert.equal(
      (await call('list', { projectId: fixture.projects.first }, writer))
        .totalCount,
      0,
      'Client relinks withhold every stale association before counts.',
    );
    assert.equal(
      (await call('lessons', { projectId: fixture.projects.first }, writer))
        .totalCount,
      0,
    );
    await deny(
      call(
        'choices',
        {
          sourceId: fixture.learningReportId,
          adId: '1000',
          projectId: fixture.projects.first,
        },
        admin,
      ),
      [403],
    );
    await projectRepository.update(
      { workspaceId: fixture.workspaceId, id: project.id },
      { companyId: originalCompany },
    );
    checks += 7;
  } finally {
    try {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      if (runner && !runner.isReleased) await runner.release();
      try {
        if (baseline)
          assert.equal(
            await originalDigest((...arguments_) =>
              connectionSource.query(...arguments_),
            ),
            baseline,
            'All original data and inventory must remain unchanged.',
          );
      } finally {
        if (connectionSource.isInitialized) await connectionSource.destroy();
        global.fetch = beforeFetch;
      }
    }
  }
  console.log(
    `PASS creative/ad learning actual-service rollback: ${checks} source/version/approval/receipt/privacy/paging checks, no provider calls or retained fixtures.`,
  );
}
module.exports = { seedLearningFixture, learningServices, associationInput };
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const { createFixture } = require('./check-delivery-reconciliation.cjs');
const {
  seedCurrentWorkFixture,
  syntheticCurrentWork,
} = require('./check-otogrow-activity-current-work-support.cjs');
const {
  userTables,
  dataFingerprint,
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryReleaseSourceService,
} = require('../dist/modules/delivery/development/delivery-release-source.service');
const {
  DeliveryReleaseReadsService,
} = require('../dist/modules/delivery/development/delivery-release-reads.service');
const {
  DeliveryReleaseService,
} = require('../dist/modules/delivery/development/delivery-release.service');
const {
  recordOtogrowActivity,
} = require('../dist/modules/otogrow-activity/record-otogrow-activity');
const {
  AddDeveloperReleasesFastInstanceCommand: Migration,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793686027809-add-developer-releases');
const TABLES = [
  'deliveryRelease',
  'deliveryReleaseVersion',
  'deliveryReleaseEvent',
];
const checks = [];
const pass = (label) => checks.push(label);
const quote = (value) => {
  assert.match(value, /^\w+$/);
  return `"${value}"`;
};

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Rollback-only proof; no apply or commit mode.',
  );
  assert.equal(
    process.env.OTOGROW_DEVELOPMENT_PROOF_SERVICES_STOPPED,
    '1',
    'Pause the local API/workers before this strict whole-database preservation proof.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Provider calls are forbidden in developer acceptance.');
  };
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  let originalSchema, originalData, originalTables;
  try {
    await runner.connect();
    await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    originalTables = await userTables(runner);
    for (const table of originalTables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    originalSchema = await schemaFingerprint(runner);
    originalData = await dataFingerprint(runner, TABLES);
    const present = await runner.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='core' AND tablename=ANY($1::text[])",
      [TABLES],
    );
    assert(
      present.length === 0 || present.length === 3,
      'Investigate a partially installed developer release schema.',
    );
    const migration = new Migration();
    if (present.length) {
      for (const table of TABLES) {
        const [{ count }] = await runner.query(
          `SELECT count(*)::int AS count FROM core.${quote(table)}`,
        );
        assert.equal(
          count,
          0,
          'Never delete retained release history for acceptance.',
        );
      }
      await migration.down(runner);
    }
    await migration.up(runner);
    const constraints = await runner.query(
      'SELECT contype,convalidated FROM pg_constraint WHERE conrelid=ANY($1::regclass[])',
      [TABLES.map((table) => `core."${table}"`)],
    );
    assert(constraints.every((constraint) => constraint.convalidated));
    assert.equal(
      constraints.filter((constraint) => constraint.contype === 'p').length,
      3,
    );
    assert.equal(
      constraints.filter((constraint) => constraint.contype === 'f').length,
      7,
    );
    assert.equal(
      constraints.filter((constraint) => constraint.contype === 'c').length,
      12,
    );
    const [{ count: indexes }] = await runner.query(
      "SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1::text[])",
      [TABLES],
    );
    assert.equal(indexes, 8);
    pass('Additive three-table/five-index/seven-FK/twelve-check schema');

    await runner.query('SAVEPOINT development_fixture');
    const manager = runner.manager;
    const fixture = await createFixture(manager, 'developer_release_check');
    await seedCurrentWorkFixture(manager, fixture);
    await manager.query(
      'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
      [fixture.roles.reader, ['delivery.manage']],
    );
    const source = {
      manager,
      getRepository: (entity) => manager.getRepository(entity),
      query: (...arguments_) => manager.query(...arguments_),
      transaction: (operation) => manager.transaction(operation),
    };
    const access = new OtogrowAccessService(source, {
      userHasWorkspaceSettingPermission: async ({
        workspaceId,
        userWorkspaceId,
      }) =>
        workspaceId === fixture.workspaceId &&
        userWorkspaceId === fixture.people.admin.userWorkspaceId,
    });
    const native = syntheticCurrentWork(access, fixture);
    const releaseSource = new DeliveryReleaseSourceService(
      source,
      access,
      native.workspaceOrm,
      native.cache,
    );
    const releases = new DeliveryReleaseService(
      releaseSource,
      new DeliveryReleaseReadsService(releaseSource),
    );
    const call = (method, input, person = fixture.people.writer) =>
      releases[method](
        fixture.workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
      );
    const rejects = async (label, operation, status) => {
      await assert.rejects(operation, (error) =>
        status ? error.getStatus?.() === status : Boolean(error),
      );
      pass(label);
    };
    const project = (await call('projects', {})).items.find(
      (item) => item.id === fixture.projects.first,
    );
    assert(project);
    pass('Current project membership without legacy workspace hydration');
    let savepointSequence = 0;
    const isolated = async (operation) => {
      const name = `development_isolated_${++savepointSequence}`;
      await runner.query(`SAVEPOINT ${name}`);
      try {
        return await operation();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
    };
    const insert = async (table, values) => {
      assert(TABLES.includes(table));
      const keys = Object.keys(values);
      return (
        await runner.query(
          `INSERT INTO core.${quote(table)}(${keys.map(quote).join(',')}) VALUES(${keys.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`,
          keys.map((key) =>
            key === 'body' ? JSON.stringify(values[key]) : values[key],
          ),
        )
      )[0];
    };
    const releaseValues = (changes = {}) => ({
      id: randomUUID(),
      workspaceId: fixture.workspaceId,
      projectId: project.id,
      companyId: project.companyId,
      createdBy: fixture.people.writer.memberId,
      ownerId: fixture.people.writer.memberId,
      ownerName: 'FIXTURE developer',
      createdByName: 'FIXTURE author',
      revision: 1,
      currentVersion: 1,
      status: 'DRAFT',
      title: 'FIXTURE schema release',
      targetDate: '2026-11-05',
      approvedVersion: null,
      reviewedBy: null,
      reviewedAt: null,
      ...changes,
    });
    const versionValues = (releaseId, changes = {}) => ({
      workspaceId: fixture.workspaceId,
      releaseId,
      version: 1,
      body: {
        work: [],
        tasks: [],
        checks: [],
        sourceFingerprint: 'a'.repeat(64),
      },
      createdBy: fixture.people.writer.memberId,
      ...changes,
    });
    const eventValues = (releaseId, changes = {}) => ({
      workspaceId: fixture.workspaceId,
      releaseId,
      requestId: randomUUID(),
      actorId: fixture.people.writer.memberId,
      userWorkspaceId: fixture.people.writer.userWorkspaceId,
      actorName: 'FIXTURE developer',
      inputHash: 'a'.repeat(64),
      action: 'SAVE',
      note: '',
      evidenceUrl: '',
      commitSha: '',
      environment: '',
      revision: 1,
      version: 1,
      status: 'DRAFT',
      ...changes,
    });
    const rejectSql = async (label, operation, code) => {
      await isolated(() =>
        assert.rejects(operation, (error) => error.code === code),
      );
      pass(label);
    };
    await isolated(async () => {
      const header = await insert('deliveryRelease', releaseValues());
      await insert('deliveryReleaseVersion', versionValues(header.id));
      const event = await insert(
        'deliveryReleaseEvent',
        eventValues(header.id),
      );
      await rejectSql(
        'Database forbids cross-workspace project references',
        () =>
          insert(
            'deliveryRelease',
            releaseValues({ workspaceId: fixture.foreignWorkspaceId }),
          ),
        '23503',
      );
      await rejectSql(
        'Database forbids duplicate release identity',
        () => insert('deliveryRelease', releaseValues({ id: header.id })),
        '23505',
      );
      await rejectSql(
        'Database binds versions to their exact workspace release',
        () =>
          insert(
            'deliveryReleaseVersion',
            versionValues(header.id, {
              workspaceId: fixture.foreignWorkspaceId,
            }),
          ),
        '23503',
      );
      await rejectSql(
        'Database preserves immutable manifest version identity',
        () => insert('deliveryReleaseVersion', versionValues(header.id)),
        '23505',
      );
      await rejectSql(
        'Database binds events to an existing exact manifest',
        () =>
          insert(
            'deliveryReleaseEvent',
            eventValues(header.id, { revision: 2, version: 2 }),
          ),
        '23503',
      );
      await rejectSql(
        'Database preserves request identity',
        () =>
          insert(
            'deliveryReleaseEvent',
            eventValues(header.id, { revision: 2, requestId: event.requestId }),
          ),
        '23505',
      );
      await rejectSql(
        'Database preserves release action revision identity',
        () => insert('deliveryReleaseEvent', eventValues(header.id)),
        '23505',
      );
      for (const [label, changes] of [
        ['Database rejects revision zero', { revision: 0 }],
        ['Database rejects unknown release status', { status: 'PUBLISHED' }],
        ['Database rejects a blank release title', { title: ' ' }],
        [
          'Database approval requires an approved version',
          {
            status: 'APPROVED',
            reviewedBy: fixture.people.reader.memberId,
            reviewedAt: new Date(),
          },
        ],
        [
          'Database approval requires the current exact version',
          {
            status: 'APPROVED',
            approvedVersion: 2,
            reviewedBy: fixture.people.reader.memberId,
            reviewedAt: new Date(),
          },
        ],
        [
          'Database approval requires a named reviewer',
          { status: 'APPROVED', approvedVersion: 1 },
        ],
      ])
        await rejectSql(
          label,
          () => insert('deliveryRelease', releaseValues(changes)),
          '23514',
        );
      for (const [label, body] of [
        [
          'Database rejects missing manifest arrays',
          { sourceFingerprint: 'a'.repeat(64) },
        ],
        [
          'Database rejects missing source fingerprint',
          { work: [], tasks: [], checks: [] },
        ],
        [
          'Database rejects malformed source fingerprint',
          { work: [], tasks: [], checks: [], sourceFingerprint: 'not-a-hash' },
        ],
        [
          'Database bounds manifest tasks',
          {
            work: Array(31).fill({}),
            tasks: [],
            checks: [],
            sourceFingerprint: 'a'.repeat(64),
          },
        ],
      ])
        await rejectSql(
          label,
          () =>
            insert(
              'deliveryReleaseVersion',
              versionValues(header.id, { version: 2, body }),
            ),
          '23514',
        );
      await rejectSql(
        'Database rejects malformed command fingerprints',
        () =>
          insert(
            'deliveryReleaseEvent',
            eventValues(header.id, { revision: 2, inputHash: 'not-a-hash' }),
          ),
        '23514',
      );
    });
    const retained = async (label, seed) =>
      isolated(async () => {
        await seed();
        const before = await schemaFingerprint(runner);
        await assert.rejects(
          () => migration.down(runner),
          /Cannot remove retained developer release history/,
        );
        assert.equal(await schemaFingerprint(runner), before);
        pass(label);
      });
    await retained('Independent release-header retention guard', () =>
      insert('deliveryRelease', releaseValues()),
    );
    const dropParentForeignKeys = async (table) => {
      const foreign = await runner.query(
        "SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f' AND confrelid=ANY($2::regclass[])",
        [
          `core."${table}"`,
          ['core."deliveryRelease"', 'core."deliveryReleaseVersion"'],
        ],
      );
      for (const key of foreign)
        await runner.query(
          `ALTER TABLE core.${quote(table)} DROP CONSTRAINT ${quote(key.conname)}`,
        );
    };
    await retained('Independent orphaned-version retention guard', async () => {
      await dropParentForeignKeys('deliveryReleaseVersion');
      await insert('deliveryReleaseVersion', versionValues(randomUUID()));
    });
    await retained('Independent orphaned-event retention guard', async () => {
      await dropParentForeignKeys('deliveryReleaseEvent');
      await insert('deliveryReleaseEvent', eventValues(randomUUID()));
    });
    await retained('Independent retained-audit action-prefix guard', () =>
      recordOtogrowActivity(manager, {
        workspaceId: fixture.workspaceId,
        actorId: fixture.people.writer.memberId,
        category: 'DELIVERY',
        action: 'DEVELOPMENT_RELEASE_FIXTURE',
        outcome: 'RECORDED',
        summary: 'FIXTURE retained release evidence',
        sourceType: 'release',
        sourceId: randomUUID(),
        projectId: project.id,
      }),
    );
    const approvedDetails = {
      state: 'APPROVED',
      service: 'MOBILE_APP',
      submissions: [
        {
          version: 1,
          submittedBy: fixture.people.writer.memberId,
          submittedAt: '2020-02-21T10:00:00Z',
          decision: 'APPROVED',
          reviewedBy: fixture.people.reader.memberId,
          reviewedAt: '2020-02-21T11:00:00Z',
        },
      ],
    };
    for (const id of [
      fixture.currentTasks.approved,
      fixture.currentTasks.staleBackup,
    ])
      await manager.query(
        'UPDATE core."deliveryTask" SET details=$3 WHERE "workspaceId"=$1 AND "taskId"=$2',
        [fixture.workspaceId, id, JSON.stringify(approvedDetails)],
      );
    const added = [];
    for (let index = 0; index < 35; index++) {
      const id = randomUUID();
      added.push(id);
      await manager.query(
        `INSERT INTO ${quote(fixture.schemaName)}.task(id,title,"assigneeId") VALUES($1,$2,$3)`,
        [
          id,
          `Visible FIXTURE additional ${index}`,
          fixture.people.writer.memberId,
        ],
      );
      await manager.query(
        'INSERT INTO core."deliveryTask"("workspaceId","taskId","projectId",details) VALUES($1,$2,$3,$4)',
        [fixture.workspaceId, id, project.id, JSON.stringify(approvedDetails)],
      );
    }
    let page = await call('choices', { projectId: project.id });
    assert.equal(page.tasks.length, 25);
    assert.equal(page.totalCount, 41);
    assert(page.nextTaskId);
    const next = await call('choices', {
      projectId: project.id,
      afterTaskId: page.nextTaskId,
    });
    assert.equal(next.tasks.length, 16);
    assert.equal(next.totalCount, 41);
    assert.equal(next.nextTaskId, null);
    assert.equal(
      new Set([...page.tasks, ...next.tasks].map((task) => task.taskId)).size,
      41,
    );
    const selectedElsewhere = await call('choices', {
      projectId: project.id,
      selectedTaskIds: [next.tasks[0].taskId],
    });
    assert.equal(selectedElsewhere.selectedTasks.length, 1);
    assert.equal(
      selectedElsewhere.selectedTasks[0].taskId,
      next.tasks[0].taskId,
    );
    pass(
      'Exact selected task evidence is available independently of the picker page',
    );
    await rejects(
      'Hidden selected-task evidence does not fall back to a stale snapshot',
      () =>
        call('choices', {
          projectId: project.id,
          selectedTaskIds: [fixture.currentTasks.hidden],
        }),
      403,
    );
    await rejects(
      'Duplicate selected task identities are rejected',
      () =>
        call('choices', {
          projectId: project.id,
          selectedTaskIds: [next.tasks[0].taskId, next.tasks[0].taskId],
        }),
      400,
    );
    assert(
      !JSON.stringify([page, next]).includes('PRIVATE_NATIVE_RLS_HIDDEN_TASK'),
    );
    pass(
      'Forty-one visible tasks page once; private/deleted/other-project tasks excluded before counts',
    );
    const tasks = [...page.tasks, ...next.tasks];
    const chosen = [
      fixture.currentTasks.approved,
      fixture.currentTasks.staleBackup,
    ].map((id) => tasks.find((task) => task.taskId === id));
    assert(chosen.every((task) => task.approved));
    const body = {
      title: 'FIXTURE Mobile checkout release',
      ownerId: fixture.people.writer.memberId,
      targetDate: '2026-11-05',
      repositoryUrl: 'https://github.com/example/mobile',
      commitSha: 'a'.repeat(40),
      summary: 'FIXTURE checkout validation',
      acceptanceCriteria: 'FIXTURE verified checkout and retry.',
      rollbackPlan: 'FIXTURE reactivate the previous artifact.',
      work: chosen.map((task, index) => ({
        taskId: task.taskId,
        revision: task.revision,
        issueUrl: 'https://example.atlassian.net/browse/MOBILE-1',
        pullRequestUrl: `https://github.com/example/mobile/pull/${index + 1}`,
        blockedByTaskIds: index ? [chosen[0].taskId] : [],
      })),
      checks: ['TEST', 'CODE_REVIEW', 'ROLLBACK', 'HANDOVER'].map((kind) => ({
        id: randomUUID(),
        kind,
        label: `FIXTURE ${kind}`,
        status: 'PASSED',
        evidenceUrl: 'https://example.invalid/release-evidence',
        note: 'FIXTURE external human attestation; no provider verification.',
      })),
    };
    const saveInput = (changes = {}) => ({
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 0,
      projectId: project.id,
      projectRevision: project.revision,
      expectedCompanyId: project.companyId,
      body: structuredClone(body),
      ...changes,
    });
    const original = saveInput();
    const {
      advertisingHash,
    } = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
    const beforePreview = await dataFingerprint(runner, []);
    const preview = await call('preview', original);
    assert.equal(preview.inputHash, advertisingHash(original));
    assert.equal(preview.releaseId, original.id);
    assert.equal(preview.reviewBlockedReason, null);
    assert.deepEqual(await dataFingerprint(runner, []), beforePreview);
    pass(
      'Exact server-side plan validation is read-only and returns its canonical command hash',
    );
    const saved = await call('save', original);
    assert.equal(saved.status, 'DRAFT');
    assert.equal(saved.revision, 1);
    assert.equal(saved.version, 1);
    assert.deepEqual(await call('save', original), saved);
    pass('Exact save receipt is idempotent');
    assert.deepEqual(
      (await call('receipt', { requestId: original.requestId })).receipt,
      saved,
    );
    pass('Saved request recovery does not submit again');
    await rejects(
      'A changed body cannot reuse the saved request',
      () =>
        call('save', {
          ...original,
          body: { ...original.body, title: 'DIFFERENT' },
        }),
      409,
    );
    await rejects(
      'A different person cannot claim the saved request',
      () => call('save', original, fixture.people.secondWriter),
      409,
    );
    await rejects(
      'A different person cannot read another receipt',
      () =>
        call(
          'receipt',
          { requestId: original.requestId },
          fixture.people.secondWriter,
        ),
      403,
    );
    await rejects(
      'An outsider cannot enter the project',
      () => call('choices', { projectId: project.id }, fixture.people.outsider),
      403,
    );
    await rejects(
      'A foreign-workspace project cannot be selected',
      () => call('choices', { projectId: fixture.projects.foreign }),
      403,
    );
    await rejects(
      'A stale project/client preparation cannot create work',
      () => call('save', saveInput({ projectRevision: project.revision + 1 })),
      409,
    );
    await rejects(
      'An unavailable task is rejected before saving',
      () =>
        call(
          'save',
          saveInput({
            body: {
              ...body,
              work: [
                {
                  ...body.work[0],
                  taskId: fixture.currentTasks.hidden,
                  blockedByTaskIds: [],
                },
              ],
            },
          }),
        ),
      403,
    );
    await rejects(
      'An unrelated project task is rejected',
      () =>
        call(
          'save',
          saveInput({
            body: {
              ...body,
              work: [
                {
                  ...body.work[0],
                  taskId: fixture.currentTasks.otherProject,
                  blockedByTaskIds: [],
                },
              ],
            },
          }),
        ),
      403,
    );
    await rejects(
      'An owner outside the project cannot receive the release',
      () =>
        call(
          'save',
          saveInput({
            body: { ...body, ownerId: fixture.people.outsider.memberId },
          }),
        ),
      400,
    );
    await rejects(
      'A stale task revision cannot create a manifest',
      () =>
        call(
          'save',
          saveInput({
            body: {
              ...body,
              work: body.work.map((work) => ({
                ...work,
                revision: work.revision + 1,
              })),
            },
          }),
        ),
      409,
    );
    const detail = () => call('detail', { id: original.id });
    const decision = async (
      action,
      changes = {},
      person = fixture.people.writer,
    ) => {
      const current = await call('detail', { id: original.id }, person);
      return call(
        'decide',
        {
          id: original.id,
          requestId: randomUUID(),
          revision: current.release.revision,
          sourceFingerprint: current.currentSourceFingerprint,
          action,
          note: 'FIXTURE evidence reviewed',
          evidenceUrl: '',
          commitSha: '',
          environment: '',
          ...changes,
        },
        person,
      );
    };
    let current = await detail();
    assert.equal(current.sourceChanged, false);
    assert.equal(current.canEdit, true);
    await rejects(
      'A known wrong source fingerprint cannot submit',
      () => decision('SUBMIT', { sourceFingerprint: 'b'.repeat(64) }),
      409,
    );
    await decision('SUBMIT');
    await rejects(
      'A release owner cannot approve their own work',
      () => decision('APPROVE'),
      403,
    );
    await rejects(
      'A release author cannot edit after submission',
      () => call('save', { ...original, requestId: randomUUID(), revision: 2 }),
      409,
    );
    const pm = fixture.people.reader;
    const returned = await decision(
      'REQUEST_CHANGES',
      { note: 'FIXTURE add a test result' },
      pm,
    );
    assert.equal(returned.status, 'CHANGES_REQUESTED');
    pass('Independent manager returns with immutable actionable feedback');
    await call('save', {
      ...original,
      requestId: randomUUID(),
      revision: returned.revision,
    });
    await decision('SUBMIT');
    const approved = await decision('APPROVE', {}, pm);
    assert.equal(approved.status, 'APPROVED');
    pass('Exact second manifest independently approved');
    current = await detail();
    assert.equal(current.selectedVersion, 2);
    assert.equal(current.body.tasks.length, 2);
    assert.equal(current.canEdit, false);
    const historical = await call('detail', { id: original.id, version: 1 });
    assert.equal(historical.selectedVersion, 1);
    assert.equal(historical.canEdit, false);
    assert.equal(historical.body.commitSha, body.commitSha);
    pass('Historical manifests and event versions remain immutable');
    await rejects(
      'Handover cannot precede deployment',
      () =>
        decision(
          'RECORD_HANDOVER',
          {
            evidenceUrl: 'https://example.invalid/client-handover',
            commitSha: body.commitSha,
          },
          pm,
        ),
      403,
    );
    await rejects(
      'Deployment cannot claim a different commit',
      () =>
        decision('RECORD_DEPLOYMENT', {
          evidenceUrl: 'https://example.invalid/deploy',
          commitSha: 'b'.repeat(40),
          environment: 'Staging',
        }),
      400,
    );
    const failed = await decision('RECORD_DEPLOYMENT_FAILED', {
      evidenceUrl: 'https://example.invalid/failed-deploy',
      commitSha: body.commitSha,
      environment: 'Staging',
    });
    assert.equal(failed.status, 'APPROVED');
    pass(
      'Failed deployment retains approval and does not imply handover readiness',
    );
    const deployed = await decision('RECORD_DEPLOYMENT', {
      evidenceUrl: 'https://example.invalid/deploy',
      commitSha: body.commitSha,
      environment: 'Staging',
    });
    assert.equal(deployed.status, 'DEPLOYED');
    pass('Human-attested deployment bound to approved commit and environment');
    await rejects(
      'Developer cannot impersonate manager client handover',
      () =>
        decision('RECORD_HANDOVER', {
          evidenceUrl: 'https://example.invalid/handover',
          commitSha: body.commitSha,
        }),
      403,
    );
    await decision(
      'RECORD_HANDOVER',
      {
        evidenceUrl: 'https://example.invalid/handover',
        commitSha: body.commitSha,
      },
      pm,
    );
    const accepted = await decision(
      'RECORD_ACCEPTANCE',
      {
        evidenceUrl: 'https://example.invalid/client-acceptance',
        commitSha: body.commitSha,
      },
      pm,
    );
    assert.equal(accepted.status, 'ACCEPTED');
    pass('Client acceptance is a separate manager-recorded evidence event');
    const [taskAfter] = await manager.query(
      'SELECT details FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, chosen[0].taskId],
    );
    assert.deepEqual(taskAfter.details, approvedDetails);
    pass('Release acceptance never edits native task approval or fulfilment');
    const [operations] = await manager.query(
      'SELECT state FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [fixture.workspaceId],
    );
    assert.equal(operations, undefined);
    pass('Release work never creates or writes Operations JSON');
    const incomplete = saveInput({
      body: {
        ...body,
        work: [
          {
            taskId: fixture.currentTasks.inProgress,
            revision: 1,
            issueUrl: '',
            pullRequestUrl: '',
            blockedByTaskIds: [],
          },
        ],
      },
    });
    await call('save', incomplete);
    const incompleteDetail = await call('detail', { id: incomplete.id });
    assert.equal(incompleteDetail.canSubmit, false);
    assert(incompleteDetail.reviewBlockedReason);
    pass('Known incomplete work disables submission and explains the blocker');
    await rejects(
      'Incomplete task planning is saved but cannot pass release review',
      () =>
        call('decide', {
          id: incomplete.id,
          requestId: randomUUID(),
          revision: 1,
          sourceFingerprint: incompleteDetail.currentSourceFingerprint,
          action: 'SUBMIT',
          note: '',
          evidenceUrl: '',
          commitSha: '',
          environment: '',
        }),
      400,
    );
    await manager.query(
      'UPDATE core."deliveryTask" SET revision=revision+1 WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, chosen[0].taskId],
    );
    assert.equal((await detail()).sourceChanged, true);
    pass('Subsequently changed native work is visibly stale');
    await manager.query(
      'UPDATE core."deliveryTask" SET revision=revision-1 WHERE "workspaceId"=$1 AND "taskId"=$2',
      [fixture.workspaceId, chosen[0].taskId],
    );
    await manager.query(
      `UPDATE ${quote(fixture.schemaName)}.task SET title='PRIVATE_NATIVE_RLS_HIDDEN_TASK' WHERE id=$1`,
      [chosen[0].taskId],
    );
    const hiddenList = await call('list', { projectId: project.id });
    assert(!hiddenList.items.some((release) => release.id === original.id));
    assert.equal(hiddenList.totalCount, 1);
    await rejects(
      'Native row revocation withholds exact saved manifests',
      () => detail(),
      403,
    );
    pass('Native row scope applies before release counts');
    await manager.query(
      `UPDATE ${quote(fixture.schemaName)}.task SET title='Visible FIXTURE restored task' WHERE id=$1`,
      [chosen[0].taskId],
    );
    const permission =
      native.native.data.rolesPermissions[fixture.nativeRoleId][
        native.native.taskObject.id
      ];
    permission.restrictedFields[native.native.taskFields[3].id] = {
      canRead: false,
      canUpdate: false,
    };
    assert((await call('choices', { projectId: project.id })).tasks.length);
    pass('Unprojected due-date restriction does not block a release task list');
    permission.restrictedFields[native.native.taskFields[1].id] = {
      canRead: false,
      canUpdate: false,
    };
    await rejects(
      'Restricted projected task title fails closed',
      () => call('list', { projectId: project.id }),
      403,
    );
    delete permission.restrictedFields[native.native.taskFields[1].id];
    native.state.changingHash = true;
    await rejects(
      'Concurrent native metadata change fails closed',
      () => call('choices', { projectId: project.id }),
      409,
    );
    native.state.changingHash = false;
    await manager.query(
      'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
      [project.id, null],
    );
    assert.equal((await call('list', { projectId: project.id })).totalCount, 0);
    await rejects(
      'Client relinking withholds old manifest history',
      () => detail(),
      403,
    );
    pass('Client anchor applies before list counts');
    await manager.query(
      'UPDATE core."deliveryProject" SET "companyId"=$2 WHERE id=$1',
      [project.id, project.companyId],
    );
    await manager.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [fixture.people.writer.userWorkspaceId],
    );
    await rejects(
      'Inactive membership cannot recover or read a release',
      () => detail(),
      403,
    );
    await manager.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=null WHERE id=$1',
      [fixture.people.writer.userWorkspaceId],
    );
    const audits = await manager.query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"=\'development-release\'',
      [fixture.workspaceId],
    );
    assert(audits.length >= 10);
    assert(!JSON.stringify(audits).includes('example.invalid'));
    pass(
      'Immutable audit records identity/state without private URLs or manifest text',
    );
    await assert.rejects(
      () => migration.down(runner),
      /Cannot remove retained developer release history/,
    );
    pass('Retained source history prevents downgrade');
    await runner.query('ROLLBACK TO SAVEPOINT development_fixture');
    await runner.query('RELEASE SAVEPOINT development_fixture');
    assert.deepEqual(await dataFingerprint(runner, TABLES), originalData);
    await migration.down(runner);
    await migration.up(runner);
    pass('Empty down/up reversibility');
    if (present.length)
      assert.equal(await schemaFingerprint(runner), originalSchema);
    pass(
      `Original data preserved across ${originalTables.length} existing tables`,
    );
    await runner.rollbackTransaction();
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await dataFingerprint(runner, TABLES), originalData);
    process.stdout.write(
      JSON.stringify(
        {
          passed: checks.length,
          checks,
          providerRequests: 0,
          committedWrites: 0,
        },
        null,
        2,
      ) + '\n',
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
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const { isAbsolute } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  WORKSPACE_ID,
  additions,
  exactIds,
  fingerprint,
  isAuthenticationLifecycleTable,
  locked,
  noNativeAutomation,
  operations,
  quote,
  readTables,
  syncDirectory,
  withoutHeartbeat,
  writeJournal,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliverySeoResultsService,
} = require('../dist/modules/delivery/seo-results/delivery-seo-results.service');
const {
  seoSaveSchema,
  seoDecisionSchema,
} = require('../dist/modules/delivery/seo-results/delivery-seo-results.types');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const FILE = '/tmp/otogrow-seo-results-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SOURCES = [
  'deliveryseoreport',
  'deliveryseoversion',
  'deliveryseoevent',
  'otogrowactivityevent',
];
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const fault = (stage) => {
  if (process.env.OTOGROW_SEO_UI_TEST_FAILURE === stage)
    throw new Error(`Injected ${stage}; recover through guarded cleanup.`);
};
const staticEntries = (fixture) => [
  { schema: fixture.schema, name: 'company', ids: [fixture.companyId] },
  { schema: 'core', name: 'deliveryProject', ids: [fixture.projectId] },
  { schema: 'core', name: 'user', ids: [fixture.employee.userId] },
  {
    schema: 'core',
    name: 'userWorkspace',
    ids: [fixture.employee.userWorkspaceId],
  },
  {
    schema: fixture.schema,
    name: 'workspaceMember',
    ids: [fixture.employee.memberId],
  },
];
const parserFor = (method) =>
  method === 'save' ? seoSaveSchema : seoDecisionSchema;
const duringFixture = (fixture, value) =>
  assert(
    Date.parse(value) >= Date.parse(fixture.createdAt) - 60000 &&
      Date.parse(value) <= Date.now() + 60000,
    'Unexpected source creation time.',
  );
function read() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  assert.equal(fixture.marker, `seo-results-ui:${fixture.nonce}`);
  assert.equal(
    fixture.title,
    `Disposable SEO results ${fixture.nonce.slice(0, 8)}`,
  );
  assert.equal(new Date(fixture.createdAt).toISOString(), fixture.createdAt);
  assert(
    ['CREATING', 'PREPARED', 'READY', 'CLEANUP_PREPARED', 'CLEANED'].includes(
      fixture.status,
    ),
  );
  for (const id of [
    fixture.nonce,
    fixture.companyId,
    fixture.projectId,
    fixture.employee.memberId,
    fixture.employee.userId,
    fixture.employee.userWorkspaceId,
    ...Object.values(fixture.reportIds),
    ...fixture.metricIds,
  ])
    assert.match(id, UUID);
  assert(Array.isArray(fixture.plans) && fixture.plans.length <= 24);
  assert(Array.isArray(fixture.seedPlans) && fixture.seedPlans.length <= 7);
  assert(
    Array.isArray(fixture.cleanupAttempts) &&
      fixture.cleanupAttempts.length <= 20,
  );
  if (fixture.schema) quote(fixture.schema);
  for (const plan of [...fixture.seedPlans, ...fixture.plans]) {
    assert(['save', 'decide'].includes(plan.method));
    assert.deepEqual(parserFor(plan.method).parse(plan.input), plan.input);
    assert.equal(plan.hash, advertisingHash(plan.input));
    assert.match(plan.memberId, UUID);
    assert.match(plan.userWorkspaceId, UUID);
  }
  return fixture;
}
async function administrator(manager, fixture) {
  const rows = await manager.query(
    `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND NOT account.disabled AND role."canUpdateAllSettings"=true ORDER BY member.id`,
    [WORKSPACE_ID],
  );
  assert.equal(rows.length, 1, 'Use the unchanged actual local administrator.');
  if (fixture.actorId) {
    assert.equal(rows[0].memberId, fixture.actorId);
    assert.equal(rows[0].userId, fixture.actorUserId);
    assert.equal(rows[0].userWorkspaceId, fixture.userWorkspaceId);
  }
  return rows[0];
}
function service(manager) {
  const scoped = {
    manager,
    getRepository: (entity) => manager.getRepository(entity),
    query: (...arguments_) => manager.query(...arguments_),
    transaction: (operation) => manager.transaction(operation),
  };
  const access = new OtogrowAccessService(scoped, {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) => {
      const [row] = await manager.query(
        'SELECT EXISTS(SELECT 1 FROM core."roleTarget" target JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=target."workspaceId" WHERE target."workspaceId"=$1 AND target."userWorkspaceId"=$2 AND role."canUpdateAllSettings"=true) AS allowed',
        [workspaceId, userWorkspaceId],
      );
      return row.allowed;
    },
  });
  return new DeliverySeoResultsService(scoped, access);
}
const expectedStatus = (plan) =>
  plan.method === 'save'
    ? 'DRAFT'
    : {
        SUBMIT: 'SUBMITTED',
        APPROVE: 'APPROVED',
        REQUEST_CHANGES: 'CHANGES_REQUESTED',
      }[plan.input.action];
function planDefinition(fixture, method, input, actor, expectedVersion) {
  const canonical = parserFor(method).parse(input);
  return {
    method,
    input: canonical,
    hash: advertisingHash(canonical),
    memberId: actor.memberId,
    userWorkspaceId: actor.userWorkspaceId,
    expectedVersion,
  };
}
function validateInput(fixture, method, input) {
  if (method === 'save') {
    assert.equal(input.projectId, fixture.projectId);
    assert.equal(input.projectRevision, 1);
    assert.equal(input.expectedCompanyId, fixture.companyId);
    assert(input.body.title.startsWith(fixture.title));
    assert(input.body.summary.includes('FIXTURE'));
    assert(input.body.workNotes.includes('FIXTURE'));
    assert(
      [fixture.employee.memberId, fixture.actorId].includes(input.body.ownerId),
    );
    assert.equal(
      input.body.tasks.length,
      0,
      'This browser fixture cannot adopt a real task.',
    );
    assert(
      input.body.periodStart.startsWith('2020-') &&
        input.body.periodEnd.startsWith('2020-'),
    );
    assert(
      input.body.comparisonId === null ||
        (input.body.comparisonId === fixture.reportIds.baseline &&
          input.body.comparisonVersion === 1),
    );
    for (const metric of input.body.metrics) {
      assert.equal(new URL(metric.sourceUrl).hostname, 'example.invalid');
      assert.equal(metric.property, 'https://example.invalid/');
    }
    for (const evidence of input.body.evidence)
      assert.equal(new URL(evidence.url).hostname, 'example.invalid');
  } else
    assert(
      [
        fixture.reportIds.baseline,
        fixture.reportIds.approve,
        fixture.reportIds.return,
        ...fixture.plans
          .filter((plan) => plan.method === 'save')
          .map((plan) => plan.input.id),
      ].includes(input.id),
    );
}
async function descendants(manager, fixture) {
  const reports = await manager.query(
    `SELECT report.*,to_char(report."periodStart",'YYYY-MM-DD') AS "periodStartDate",to_char(report."periodEnd",'YYYY-MM-DD') AS "periodEndDate" FROM core."deliverySeoReport" report WHERE report."workspaceId"=$1 AND report."projectId"=$2 ORDER BY report.id`,
    [WORKSPACE_ID, fixture.projectId],
  );
  const reportIds = reports.map((report) => report.id);
  const versions = reportIds.length
    ? await manager.query(
        'SELECT * FROM core."deliverySeoVersion" WHERE "workspaceId"=$1 AND "reportId"=ANY($2::uuid[]) ORDER BY "reportId",version',
        [WORKSPACE_ID, reportIds],
      )
    : [];
  const events = reportIds.length
    ? await manager.query(
        'SELECT * FROM core."deliverySeoEvent" WHERE "workspaceId"=$1 AND "reportId"=ANY($2::uuid[]) ORDER BY "reportId",revision',
        [WORKSPACE_ID, reportIds],
      )
    : [];
  const activity = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2 ORDER BY "occurredAt",id',
    [WORKSPACE_ID, fixture.projectId],
  );
  return { reports, versions, events, activity };
}
const comparisonSnapshot = (body) => ({
  title: body.title,
  period: body.period,
  periodStart: body.periodStart,
  periodEnd: body.periodEnd,
  timezone: body.timezone,
  metrics: body.metrics,
});
async function validate(manager, fixture) {
  await noNativeAutomation(manager, fixture, SOURCES);
  await administrator(manager, fixture);
  const current = await operations(manager);
  assert.equal(current.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(withoutHeartbeat(current.state)),
    fixture.baseline.operations.hash,
  );
  const tables = await readTables(manager, fixture);
  const extra = additions(tables, fixture);
  const rows = await descendants(manager, fixture);
  const hasSeed =
    extra.find(
      (table) => table.schema === 'core' && table.name === 'deliveryProject',
    ).rows.length > 0;
  const expected = hasSeed ? staticEntries(fixture) : [];
  const allPlans = [...fixture.seedPlans, ...fixture.plans];
  if (hasSeed) {
    for (const event of rows.events) {
      const plan = allPlans.find(
        (candidate) => candidate.input.requestId === event.requestId,
      );
      assert(plan, 'No unknown report request may be adopted.');
      assert.equal(event.inputHash, plan.hash);
      assert.equal(event.reportId, plan.input.id);
      assert.equal(event.actorId, plan.memberId);
      assert.equal(event.userWorkspaceId, plan.userWorkspaceId);
      assert.equal(
        event.action,
        plan.method === 'save' ? 'SAVE' : plan.input.action,
      );
      assert.equal(event.note, plan.method === 'save' ? '' : plan.input.note);
      assert.equal(event.revision, plan.input.revision + 1);
      assert.equal(event.version, plan.expectedVersion);
      assert.equal(event.status, expectedStatus(plan));
      assert.equal(
        event.actorName,
        plan.memberId === fixture.actorId
          ? fixture.actorName
          : fixture.employeeName,
      );
      assert(
        Date.parse(event.createdAt) >= Date.parse(fixture.createdAt) - 60000 &&
          Date.parse(event.createdAt) <= Date.now() + 60000,
      );
    }
    for (const version of rows.versions) {
      const event = rows.events.find(
        (candidate) =>
          candidate.reportId === version.reportId &&
          candidate.version === version.version &&
          candidate.action === 'SAVE',
      );
      assert(event);
      const plan = allPlans.find(
        (candidate) => candidate.input.requestId === event.requestId,
      );
      assert(plan);
      const {
        taskSnapshots,
        comparisonSnapshot: comparison,
        ...body
      } = version.body;
      assert.deepEqual(body, plan.input.body);
      assert.deepEqual(taskSnapshots, []);
      assert.equal(version.createdBy, plan.memberId);
      duringFixture(fixture, version.createdAt);
      const baseline = plan.input.body.comparisonId
        ? rows.versions.find(
            (candidate) =>
              candidate.reportId === fixture.reportIds.baseline &&
              candidate.version === 1,
          )
        : null;
      assert.deepEqual(
        comparison,
        baseline ? comparisonSnapshot(baseline.body) : null,
      );
    }
    for (const report of rows.reports) {
      const history = rows.events.filter(
        (event) => event.reportId === report.id,
      );
      assert(history.length);
      assert.deepEqual(
        history.map((event) => event.revision),
        history.map((_event, index) => index + 1),
      );
      const first = history[0];
      assert.equal(first.action, 'SAVE');
      const last = history.at(-1);
      const version = rows.versions.find(
        (candidate) =>
          candidate.reportId === report.id &&
          candidate.version === report.currentVersion,
      );
      assert(version);
      assert.equal(report.createdBy, first.actorId);
      duringFixture(fixture, report.createdAt);
      assert.equal(report.companyId, fixture.companyId);
      assert.equal(report.projectId, fixture.projectId);
      assert.equal(report.status, last.status);
      assert.equal(report.revision, last.revision);
      assert.equal(report.currentVersion, last.version);
      assert.equal(report.title, version.body.title);
      assert.equal(report.ownerId, version.body.ownerId);
      assert.equal(report.periodStartDate, version.body.periodStart);
      assert.equal(report.periodEndDate, version.body.periodEnd);
      assert.equal(
        report.ownerName,
        report.ownerId === fixture.actorId
          ? fixture.actorName
          : fixture.employeeName,
      );
      assert.equal(
        report.createdByName,
        report.createdBy === fixture.actorId
          ? fixture.actorName
          : fixture.employeeName,
      );
      if (report.status === 'APPROVED') {
        assert.equal(last.action, 'APPROVE');
        assert.equal(report.approvedVersion, report.currentVersion);
        assert.equal(report.reviewedBy, last.actorId);
        duringFixture(fixture, report.reviewedAt);
        assert(![report.createdBy, report.ownerId].includes(last.actorId));
      } else assert.equal(report.approvedVersion, null);
    }
    assert.equal(rows.activity.length, rows.events.length);
    const paired = new Set();
    for (const audit of rows.activity) {
      const revision = audit.changes.find(
        (change) => change.field === 'revision',
      )?.after;
      const event = rows.events.find(
        (candidate) =>
          candidate.reportId === audit.sourceId &&
          String(candidate.revision) === revision,
      );
      assert(event);
      assert(!paired.has(event.id));
      paired.add(event.id);
      assert.equal(audit.sourceType, 'seo-report');
      assert.equal(audit.action, `SEO_REPORT_${event.action}`);
      assert.equal(audit.actorId, event.actorId);
      assert.equal(audit.actorName, event.actorName);
      assert.equal(audit.actorType, 'HUMAN');
      assert.equal(audit.category, 'DELIVERY');
      assert.equal(audit.projectId, fixture.projectId);
      assert.equal(audit.clientId, fixture.companyId);
      assert.equal(audit.taskId, null);
      assert.equal(
        audit.outcome,
        event.action === 'APPROVE'
          ? 'APPROVED'
          : event.action === 'REQUEST_CHANGES'
            ? 'CHANGES_REQUESTED'
            : 'RECORDED',
      );
      assert.deepEqual(audit.changes, [
        { field: 'state', before: null, after: event.status },
        { field: 'revision', before: null, after: String(event.revision) },
      ]);
    }
    for (const [name, key] of [
      ['deliverySeoReport', 'reports'],
      ['deliverySeoVersion', 'versions'],
      ['deliverySeoEvent', 'events'],
      ['otogrowActivityEvent', 'activity'],
    ])
      expected.push({
        schema: 'core',
        name,
        ids: rows[key].map((row) => row.id),
      });
  } else assert(Object.values(rows).every((list) => list.length === 0));
  for (const table of extra) {
    const entry = expected.find(
      (candidate) =>
        candidate.schema === table.schema && candidate.name === table.name,
    );
    exactIds(
      table.rows,
      entry?.ids ?? [],
      `Unexpected ${table.schema}.${table.name}; preserve journal.`,
    );
    for (const row of table.rows) {
      const seed = fixture.seed[`${table.schema}.${table.name}:${row.id}`];
      if (seed && table.name !== 'deliverySeoReport')
        assert.equal(row.hash, seed, 'An immutable seed row changed.');
    }
  }
  if (hasSeed) {
    assert.equal(
      rows.reports.filter((report) =>
        Object.values(fixture.reportIds).includes(report.id),
      ).length,
      3,
    );
    for (const entry of staticEntries(fixture))
      for (const id of entry.ids)
        assert(fixture.seed[`${entry.schema}.${entry.name}:${id}`]);
  }
  return { tables, extra, rows, hasSeed };
}
function seedBody(fixture, index) {
  return {
    title: `${fixture.title} ${['January approved baseline', 'February awaiting approval', 'February awaiting changes'][index]}`,
    ownerId: fixture.employee.memberId,
    period: 'MONTHLY',
    periodStart: index === 0 ? '2020-01-01' : '2020-02-01',
    periodEnd: index === 0 ? '2020-01-31' : '2020-02-29',
    timezone: 'Asia/Qatar',
    summary: `FIXTURE ${fixture.marker}: manually documented results; no analytics connection or live client work.`,
    workNotes: `FIXTURE work log only; task approval and measured outcomes are separate.`,
    tasks: [],
    evidence: [],
    metrics: [
      {
        id: fixture.metricIds[index],
        key: 'CLICKS',
        label: 'Organic search clicks',
        unit: 'COUNT',
        value: index === 0 ? '10' : '0',
        unknownReason: '',
        source: 'SEARCH_CONSOLE',
        sourceUrl: `https://example.invalid/${fixture.nonce}/manual-export`,
        property: 'https://example.invalid/',
        segment: 'Web · all countries · all devices',
        definition: 'Organic web clicks, excluding paid campaigns.',
        observedAt: '2020-03-01T12:00:00Z',
      },
    ],
    comparisonId: index === 0 ? null : fixture.reportIds.baseline,
    comparisonVersion: index === 0 ? null : 1,
  };
}
async function create() {
  assert(!existsSync(FILE), 'Recover the active SEO fixture first.');
  const nonce = randomUUID();
  const fixture = {
    version: 1,
    workspaceId: WORKSPACE_ID,
    nonce,
    createdAt: new Date().toISOString(),
    marker: `seo-results-ui:${nonce}`,
    title: `Disposable SEO results ${nonce.slice(0, 8)}`,
    status: 'CREATING',
    companyId: randomUUID(),
    projectId: randomUUID(),
    employee: {
      userId: randomUUID(),
      memberId: randomUUID(),
      userWorkspaceId: randomUUID(),
    },
    reportIds: {
      baseline: randomUUID(),
      approve: randomUUID(),
      return: randomUUID(),
    },
    metricIds: [randomUUID(), randomUUID(), randomUUID()],
    seedPlans: [],
    plans: [],
    seed: {},
    cleanupAttempts: [],
  };
  write(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT * FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert.equal(workspace.activationStatus, 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    quote(fixture.schema);
    const actor = await administrator(manager, fixture);
    fixture.actorId = actor.memberId;
    fixture.actorUserId = actor.userId;
    fixture.userWorkspaceId = actor.userWorkspaceId;
    fixture.actorName = actor.name;
    fixture.employeeName = `SEO fixture specialist ${nonce.slice(0, 8)}`;
    await noNativeAutomation(manager, fixture, SOURCES);
    const original = await operations(manager);
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      operations: {
        id: original.id,
        hash: fingerprint(withoutHeartbeat(original.state)),
      },
    };
    assert(
      fixture.baseline.tables.length >= 180,
      'Protect the full current scoped inventory.',
    );
    fixture.status = 'PREPARED';
    for (const [index, id] of Object.values(fixture.reportIds).entries()) {
      fixture.seedPlans.push(
        planDefinition(
          fixture,
          'save',
          {
            id,
            requestId: randomUUID(),
            revision: 0,
            projectId: fixture.projectId,
            projectRevision: 1,
            expectedCompanyId: fixture.companyId,
            body: seedBody(fixture, index),
          },
          fixture.employee,
          1,
        ),
      );
      fixture.seedPlans.push(
        planDefinition(
          fixture,
          'decide',
          {
            id,
            requestId: randomUUID(),
            revision: 1,
            action: 'SUBMIT',
            note: 'FIXTURE submitted measured source evidence.',
          },
          fixture.employee,
          1,
        ),
      );
      if (index === 0)
        fixture.seedPlans.push(
          planDefinition(
            fixture,
            'decide',
            {
              id,
              requestId: randomUUID(),
              revision: 2,
              action: 'APPROVE',
              note: 'FIXTURE approved baseline for descriptive comparison.',
            },
            actor,
            1,
          ),
        );
    }
    write(fixture);
    const email = `${fixture.employee.userId}+seo-ui@example.invalid`;
    await manager.query(
      'INSERT INTO core."user" (id,email,disabled) VALUES($1,$2,false)',
      [fixture.employee.userId, email],
    );
    await manager.query(
      'INSERT INTO core."userWorkspace" (id,"workspaceId","userId") VALUES($1,$2,$3)',
      [fixture.employee.userWorkspaceId, WORKSPACE_ID, fixture.employee.userId],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES($1,$2,$3,'SEO fixture specialist',$4)`,
      [
        fixture.employee.memberId,
        fixture.employee.userId,
        email,
        nonce.slice(0, 8),
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.company (id,name) VALUES($1,$2)`,
      [fixture.companyId, fixture.title],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,$4,$5)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.title,
        fixture.companyId,
        JSON.stringify([fixture.employee.memberId]),
      ],
    );
    const seo = service(manager);
    for (const plan of fixture.seedPlans) {
      validateInput(fixture, plan.method, plan.input);
      await seo[plan.method](
        workspace,
        plan.memberId,
        plan.userWorkspaceId,
        plan.input,
        manager,
      );
    }
    const observation = await readTables(manager, fixture);
    const extra = additions(observation, fixture);
    for (const table of extra)
      for (const row of table.rows)
        fixture.seed[`${table.schema}.${table.name}:${row.id}`] = row.hash;
    fixture.seedRows = extra.filter((table) => table.rows.length);
    write(fixture);
    await validate(manager, fixture);
    fault('create-before-commit');
  });
  fault('create-after-commit');
  fixture.status = 'READY';
  write(fixture);
  print(fixture);
}
async function plan(fixture, path) {
  assert(isAbsolute(path));
  const metadata = lstatSync(path);
  assert(
    metadata.isFile() && !metadata.isSymbolicLink() && metadata.size <= 500000,
  );
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(Object.keys(raw).sort(), ['input', 'method']);
  assert(['save', 'decide'].includes(raw.method));
  const input = parserFor(raw.method).parse(raw.input);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const observation = await validate(manager, fixture);
    assert(observation.hasSeed);
    validateInput(fixture, raw.method, input);
    const recorded = [...fixture.seedPlans, ...fixture.plans].find(
      (item) => item.input.requestId === input.requestId,
    );
    if (recorded) {
      assert.equal(recorded.method, raw.method);
      assert.deepEqual(recorded.input, input);
      assert.equal(recorded.memberId, fixture.actorId);
      assert.equal(recorded.userWorkspaceId, fixture.userWorkspaceId);
      return;
    }
    const report = observation.rows.reports.find(
      (candidate) => candidate.id === input.id,
    );
    if (raw.method === 'decide') assert(report);
    else if (!report) assert.equal(input.revision, 0);
    if (report)
      assert.equal(
        input.revision,
        report.revision,
        'Prepare from the current displayed report.',
      );
    const candidate = planDefinition(
      fixture,
      raw.method,
      input,
      { memberId: fixture.actorId, userWorkspaceId: fixture.userWorkspaceId },
      raw.method === 'save'
        ? (report?.currentVersion ?? 0) + 1
        : report.currentVersion,
    );
    assert(fixture.plans.length < 24);
    fixture.plans.push(candidate);
    write(fixture);
  });
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        plannedRequestId: input.requestId,
        reportId: input.id,
        method: raw.method,
        hash: advertisingHash(input),
        allowed:
          'Execute only this exact planned UI command; no real data, task, provider or account action.',
      },
      null,
      2,
    ),
  );
}
function print(fixture) {
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        status: fixture.status,
        title: fixture.title,
        projectId: fixture.projectId,
        companyId: fixture.companyId,
        ownerId: fixture.employee.memberId,
        ownerName: fixture.employeeName,
        actorId: fixture.actorId,
        reportIds: fixture.reportIds,
        urls: {
          library: `http://apple.localhost:3001/delivery?view=seo&seoProject=${fixture.projectId}`,
          baseline: `http://apple.localhost:3001/delivery?view=seo&seoProject=${fixture.projectId}&seoReport=${fixture.reportIds.baseline}`,
          approve: `http://apple.localhost:3001/delivery?view=seo&seoProject=${fixture.projectId}&seoReport=${fixture.reportIds.approve}`,
          return: `http://apple.localhost:3001/delivery?view=seo&seoProject=${fixture.projectId}&seoReport=${fixture.reportIds.return}`,
        },
        instructions:
          'Before every Save/Submit/Approve/Return, write {method:save|decide,input:exact GraphQL input} to a temporary JSON file and run plan <absolute path>. Titles must start with the disposable title, summary/work notes contain FIXTURE, source URLs/property use example.invalid, reporting dates use2020, task refs remain empty. A current manager may create/submit their own report but cannot approve it. Separate employee-owned submitted reports exercise independent review. No public share, task mutation, model/analytics/provider connection, role/account grant, email or deploy action.',
      },
      null,
      2,
    ),
  );
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      const [workspace] = await manager.query(
        'SELECT "databaseSchema" FROM core.workspace WHERE id=$1',
        [WORKSPACE_ID],
      );
      fixture.schema = workspace.databaseSchema;
      for (const entry of staticEntries(fixture)) {
        const rows = await manager.query(
          `SELECT id FROM ${quote(entry.schema)}.${quote(entry.name)} WHERE id=ANY($1::uuid[])`,
          [entry.ids],
        );
        assert.equal(rows.length, 0);
      }
      assert.equal((await descendants(manager, fixture)).reports.length, 0);
      return;
    }
    const observation = await validate(manager, fixture);
    const authentication = observation.tables.filter(
      isAuthenticationLifecycleTable,
    );
    if (observation.hasSeed) {
      fixture.status = 'CLEANUP_PREPARED';
      fixture.cleanupAttempts.push({
        at: new Date().toISOString(),
        rows: observation.extra.filter((table) => table.rows.length),
      });
      write(fixture);
      const order = [
        ['core', 'otogrowActivityEvent'],
        ['core', 'deliverySeoEvent'],
        ['core', 'deliverySeoVersion'],
        ['core', 'deliverySeoReport'],
        ['core', 'deliveryProject'],
        [fixture.schema, 'workspaceMember'],
        ['core', 'userWorkspace'],
        ['core', 'user'],
        [fixture.schema, 'company'],
      ];
      for (const [schema, name] of order) {
        const table = observation.extra.find(
          (candidate) => candidate.schema === schema && candidate.name === name,
        );
        const ids = table.rows.map((row) => row.id);
        const removed = await manager.query(
          `WITH removed AS(DELETE FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) RETURNING id)SELECT id FROM removed`,
          [ids],
        );
        exactIds(removed, ids);
      }
    }
    const after = await readTables(manager, fixture);
    for (const [index, table] of after.entries())
      assert.equal(
        table.hash,
        isAuthenticationLifecycleTable(table)
          ? authentication.find((candidate) => candidate.name === table.name)
              .hash
          : fixture.baseline.tables[index].hash,
        `Original ${table.schema}.${table.name} changed.`,
      );
    assert.equal(
      fingerprint(withoutHeartbeat((await operations(manager)).state)),
      fixture.baseline.operations.hash,
    );
    write(fixture);
    fault('cleanup-before-commit');
  });
  fault('cleanup-after-commit');
  fixture.status = 'CLEANED';
  write(fixture);
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  if (existsSync(receipt))
    assert.equal(
      fingerprint(JSON.parse(readFileSync(receipt, 'utf8'))),
      fingerprint(fixture),
    );
  else writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    `PASS exact SEO UI cleanup: ${fixture.baseline?.tables.length ?? 0} original scoped tables, Operations and locked current authentication preserved. Only canonical planned synthetic source descendants and their owned company/project/employee removed. Receipt: ${receipt}`,
  );
}
async function main() {
  const mode = process.argv[2];
  assert(['create', 'inspect', 'plan', 'cleanup'].includes(mode));
  assert.equal(process.argv.length, mode === 'plan' ? 4 : 3);
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('No network/provider calls in the SEO fixture.');
  };
  try {
    await connectionSource.initialize();
    if (mode === 'create') await create();
    else {
      const fixture = read();
      if (mode === 'cleanup') await cleanup(fixture);
      else if (mode === 'plan') await plan(fixture, process.argv[3]);
      else {
        await connectionSource.transaction(async (manager) => {
          await locked(manager);
          await validate(manager, fixture);
        });
        print(fixture);
      }
    }
  } finally {
    if (connectionSource.isInitialized) await connectionSource.destroy();
    global.fetch = originalFetch;
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`Preserve ${FILE}; guarded cleanup only.`);
    process.exitCode = 1;
  });

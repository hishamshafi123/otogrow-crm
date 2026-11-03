const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const guard = require('./check-delivery-assistants-ui-fixture.cjs');
const { services, body } = require('./check-delivery-development-support.cjs');
const {
  releaseSaveSchema,
  releaseDecisionSchema,
} = require('../dist/modules/delivery/development/delivery-release.types');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const FILE = '/tmp/otogrow-development-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DYNAMIC = [
  'deliveryRelease',
  'deliveryReleaseVersion',
  'deliveryReleaseEvent',
  'otogrowActivityEvent',
];
const {
  WORKSPACE_ID,
  quote,
  fingerprint,
  writeJournal,
  syncDirectory,
  readTables,
  additions,
  exactIds,
  locked,
  operations,
  withoutHeartbeat,
  noNativeAutomation,
} = guard;
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const parse = (method, input) =>
  (method === 'save' ? releaseSaveSchema : releaseDecisionSchema).parse(input);
const releaseIds = (fixture) => [
  fixture.releaseId,
  ...(fixture.draftIntent ? [fixture.draftIntent.id] : []),
];
const expectedSavedInput = (plan, version) => {
  if (!plan.uiCheckIdentities) return plan.input;
  assert.equal(plan.method, 'save');
  assert.equal(version.body.checks.length, 4);
  const checkIds = version.body.checks.map((check) => check.id);
  checkIds.forEach((id) => assert.match(id, UUID));
  assert.equal(new Set(checkIds).size, 4);
  return {
    ...plan.input,
    body: {
      ...plan.input.body,
      checks: plan.input.body.checks.map((check, index) => ({
        ...check,
        id: checkIds[index],
      })),
    },
  };
};
const entries = (fixture) => [
  { schema: 'core', name: 'user', ids: [fixture.employee.userId] },
  {
    schema: 'core',
    name: 'userWorkspace',
    ids: [fixture.employee.userWorkspaceId],
  },
  { schema: 'core', name: 'roleTarget', ids: [fixture.nativeTargetId] },
  {
    schema: fixture.schema,
    name: 'workspaceMember',
    ids: [fixture.employee.memberId],
  },
  { schema: 'core', name: 'deliveryProject', ids: [fixture.projectId] },
  { schema: fixture.schema, name: 'task', ids: [fixture.taskId] },
  { schema: 'core', name: 'deliveryTask', ids: [fixture.managedId] },
];
const journalPlan = (fixture, method, input, person) => {
  const canonical = parse(method, input);
  const plan = {
    method,
    input: canonical,
    hash: advertisingHash(canonical),
    memberId: person.memberId,
    userWorkspaceId: person.userWorkspaceId,
  };
  assert(
    !fixture.commands.some(
      (existing) => existing.input.requestId === input.requestId,
    ),
    'Each UI request needs its own precommit plan.',
  );
  fixture.commands.push(plan);
  write(fixture);
  return canonical;
};
function load() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, 'development-ui-v1');
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const id of [
    fixture.nonce,
    fixture.projectId,
    fixture.taskId,
    fixture.managedId,
    fixture.releaseId,
    ...Object.values(fixture.employee),
  ])
    assert.match(id, UUID);
  assert.equal(
    fixture.title,
    `Disposable development ${fixture.nonce.slice(0, 8)}`,
  );
  for (const plan of fixture.commands) {
    assert.deepEqual(parse(plan.method, plan.input), plan.input);
    assert.equal(advertisingHash(plan.input), plan.hash);
    assert(
      [fixture.actorId, fixture.employee.memberId].includes(plan.memberId),
    );
    assert(releaseIds(fixture).includes(plan.input.id));
    if (plan.uiCheckIdentities) {
      assert.equal(plan.input.id, fixture.draftIntent.id);
      assert.equal(plan.input.requestId, fixture.draftIntent.requestId);
    }
  }
  return fixture;
}
async function validated(manager, fixture) {
  await noNativeAutomation(manager, fixture, [
    'deliveryrelease',
    'deliveryreleaseversion',
    'deliveryreleaseevent',
    'otogrowactivityevent',
  ]);
  const currentOperations = await operations(manager);
  assert.equal(currentOperations.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(withoutHeartbeat(currentOperations.state)),
    fixture.baseline.operations.hash,
  );
  const extra = additions(await readTables(manager, fixture), fixture);
  const headers = await manager.query(
    'SELECT *,to_char("targetDate",\'YYYY-MM-DD\') AS "dateText" FROM core."deliveryRelease" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
    [WORKSPACE_ID, releaseIds(fixture)],
  );
  const versions = await manager.query(
    'SELECT * FROM core."deliveryReleaseVersion" WHERE "workspaceId"=$1 AND "releaseId"=ANY($2::uuid[])',
    [WORKSPACE_ID, releaseIds(fixture)],
  );
  const events = await manager.query(
    'SELECT * FROM core."deliveryReleaseEvent" WHERE "workspaceId"=$1 AND "releaseId"=ANY($2::uuid[])',
    [WORKSPACE_ID, releaseIds(fixture)],
  );
  const activity = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceId"=ANY($2::uuid[])',
    [WORKSPACE_ID, releaseIds(fixture)],
  );
  assert.equal(
    headers.length,
    new Set(versions.map((version) => version.releaseId)).size,
  );
  assert.equal(events.length, activity.length);
  for (const event of events) {
    const plan = fixture.commands.find(
      (item) => item.input.requestId === event.requestId,
    );
    assert(plan, 'Every action requires its private precommit intent.');
    assert.equal(event.releaseId, plan.input.id);
    const version = versions.find(
      (candidate) =>
        candidate.releaseId === event.releaseId &&
        candidate.version === event.version,
    );
    assert(version);
    assert.equal(
      event.inputHash,
      plan.uiCheckIdentities
        ? advertisingHash(expectedSavedInput(plan, version))
        : plan.hash,
    );
    assert.equal(event.actorId, plan.memberId);
    assert.equal(event.userWorkspaceId, plan.userWorkspaceId);
    assert.equal(event.revision, plan.input.revision + 1);
    assert.equal(
      event.action,
      plan.method === 'save' ? 'SAVE' : plan.input.action,
    );
    for (const key of ['note', 'evidenceUrl', 'environment', 'commitSha'])
      assert.equal(event[key], plan.method === 'save' ? '' : plan.input[key]);
  }
  for (const version of versions) {
    const saved = events.find(
      (event) =>
        event.releaseId === version.releaseId &&
        event.version === version.version &&
        event.action === 'SAVE',
    );
    assert(saved);
    const plan = fixture.commands.find(
      (item) => item.input.requestId === saved.requestId,
    );
    const { tasks, sourceFingerprint, ...canonical } = version.body;
    assert.deepEqual(canonical, expectedSavedInput(plan, version).body);
    assert.match(sourceFingerprint, /^[a-f0-9]{64}$/);
    assert.deepEqual(tasks, fixture.taskSnapshots);
    assert.equal(version.createdBy, plan.memberId);
  }
  for (const header of headers) {
    assert.equal(header.projectId, fixture.projectId);
    assert.equal(header.companyId, null);
    const creation = fixture.commands.find(
      (plan) =>
        plan.method === 'save' &&
        plan.input.revision === 0 &&
        plan.input.id === header.id,
    );
    assert(creation);
    assert.equal(header.createdBy, creation.memberId);
    assert.equal(header.ownerId, creation.input.body.ownerId);
    const version = versions.find(
      (item) =>
        item.releaseId === header.id && item.version === header.currentVersion,
    );
    assert(version);
    assert.equal(header.title, version.body.title);
    assert.equal(header.dateText, version.body.targetDate);
    const last = events
      .filter((event) => event.releaseId === header.id)
      .sort((left, right) => right.revision - left.revision)[0];
    assert(last);
    assert.equal(header.revision, last.revision);
    assert.equal(header.status, last.status);
  }
  for (const event of activity) {
    const recorded = events.find(
      (item) =>
        `DEVELOPMENT_RELEASE_${item.action}` === event.action &&
        item.actorId === event.actorId &&
        item.releaseId === event.sourceId &&
        Number(
          event.changes.find((change) => change.field === 'revision')?.after,
        ) === item.revision,
    );
    assert(recorded);
    assert.equal(event.sourceType, 'development-release');
    assert.equal(event.projectId, fixture.projectId);
  }
  const dynamic = {
    deliveryRelease: headers,
    deliveryReleaseVersion: versions,
    deliveryReleaseEvent: events,
    otogrowActivityEvent: activity,
  };
  const hasSeed = extra.some(
    (table) => !DYNAMIC.includes(table.name) && table.rows.length,
  );
  for (const table of extra) {
    const expected =
      dynamic[table.name] ??
      (hasSeed
        ? entries(fixture)
            .find(
              (entry) =>
                entry.schema === table.schema && entry.name === table.name,
            )
            ?.ids.map((id) => ({ id }))
        : []) ??
      [];
    exactIds(
      table.rows,
      expected.map((row) => row.id),
      `Unexpected ${table.schema}.${table.name}; preserve fixture.`,
    );
    if (!DYNAMIC.includes(table.name))
      for (const row of table.rows)
        assert.equal(
          row.hash,
          fixture.seed[`${table.schema}.${table.name}:${row.id}`],
        );
  }
  return { headers, versions, events, activity, extra };
}
async function create() {
  assert(!existsSync(FILE), 'Clean the owned development fixture first.');
  const fixture = {
    checker: 'development-ui-v1',
    workspaceId: WORKSPACE_ID,
    status: 'CREATING',
    nonce: randomUUID(),
    projectId: randomUUID(),
    taskId: randomUUID(),
    managedId: randomUUID(),
    nativeTargetId: randomUUID(),
    releaseId: randomUUID(),
    employee: {
      memberId: randomUUID(),
      userId: randomUUID(),
      userWorkspaceId: randomUUID(),
    },
    commands: [],
    seed: {},
    createdAt: new Date().toISOString(),
  };
  fixture.title = `Disposable development ${fixture.nonce.slice(0, 8)}`;
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
    const admins = await manager.query(
      `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId" FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true`,
      [WORKSPACE_ID],
    );
    assert.equal(admins.length, 1);
    fixture.actorId = admins[0].memberId;
    fixture.actorUserId = admins[0].userId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    await noNativeAutomation(manager, fixture, [
      'deliveryrelease',
      'deliveryreleaseversion',
      'deliveryreleaseevent',
      'otogrowactivityevent',
    ]);
    const originalOperations = await operations(manager);
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      operations: {
        id: originalOperations.id,
        hash: fingerprint(withoutHeartbeat(originalOperations.state)),
      },
    };
    fixture.status = 'PREPARED';
    write(fixture);
    await manager.query(
      'INSERT INTO core."user"(id,email,disabled) VALUES($1,$2,false)',
      [
        fixture.employee.userId,
        `${fixture.employee.userId}+development-ui@example.invalid`,
      ],
    );
    await manager.query(
      'INSERT INTO core."userWorkspace"(id,"userId","workspaceId") VALUES($1,$2,$3)',
      [fixture.employee.userWorkspaceId, fixture.employee.userId, WORKSPACE_ID],
    );
    await manager.query(
      'INSERT INTO core."roleTarget"(id,"workspaceId","roleId","userWorkspaceId","universalIdentifier","applicationId") VALUES($1,$2,$3,$4,$1,$5)',
      [
        fixture.nativeTargetId,
        WORKSPACE_ID,
        workspace.defaultRoleId,
        fixture.employee.userWorkspaceId,
        workspace.workspaceCustomApplicationId,
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}."workspaceMember"(id,"userId","nameFirstName","nameLastName") VALUES($1,$2,$3,$4)`,
      [
        fixture.employee.memberId,
        fixture.employee.userId,
        'Synthetic developer',
        fixture.nonce.slice(0, 8),
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject"(id,"workspaceId",name,"memberIds") VALUES($1,$2,$3,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.title,
        JSON.stringify([fixture.employee.memberId]),
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.task(id,title,"assigneeId",status) VALUES($1,$2,$3,'DONE')`,
      [
        fixture.taskId,
        `Visible FIXTURE ${fixture.title} checkout task`,
        fixture.employee.memberId,
      ],
    );
    const details = {
      state: 'APPROVED',
      service: 'MOBILE_APP',
      submissions: [
        {
          version: 1,
          submittedBy: fixture.employee.memberId,
          submittedAt: '2020-02-21T10:00:00Z',
          decision: 'APPROVED',
          reviewedBy: fixture.actorId,
          reviewedAt: '2020-02-21T11:00:00Z',
        },
      ],
    };
    await manager.query(
      'INSERT INTO core."deliveryTask"(id,"workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,$5,1)',
      [
        fixture.managedId,
        WORKSPACE_ID,
        fixture.taskId,
        fixture.projectId,
        JSON.stringify(details),
      ],
    );
    const synthetic = {
      ...fixture,
      workspace,
      schemaName: fixture.schema,
      nativeRoleId: workspace.defaultRoleId,
      people: { admin: { ...admins[0] }, writer: fixture.employee },
    };
    const release = services(connectionSource, synthetic).releases;
    const call = (method, input) =>
      release[method](
        workspace,
        fixture.employee.memberId,
        fixture.employee.userWorkspaceId,
        input,
        manager,
      );
    const choices = await call('choices', {
      projectId: fixture.projectId,
      selectedTaskIds: [fixture.taskId],
    });
    fixture.taskSnapshots = choices.selectedTasks;
    const planBody = body({ ...synthetic, taskId: fixture.taskId });
    planBody.title = `${fixture.title} release`;
    const input = journalPlan(
      fixture,
      'save',
      {
        id: fixture.releaseId,
        requestId: randomUUID(),
        revision: 0,
        projectId: fixture.projectId,
        projectRevision: 1,
        expectedCompanyId: null,
        body: planBody,
      },
      fixture.employee,
    );
    await call('save', input);
    const detail = await call('detail', { id: fixture.releaseId });
    await call(
      'decide',
      journalPlan(
        fixture,
        'decide',
        {
          id: fixture.releaseId,
          requestId: randomUUID(),
          revision: 1,
          sourceFingerprint: detail.currentSourceFingerprint,
          action: 'SUBMIT',
          note: 'FIXTURE independent review requested.',
          evidenceUrl: '',
          commitSha: '',
          environment: '',
        },
        fixture.employee,
      ),
    );
    for (const table of additions(
      await readTables(manager, fixture),
      fixture,
    ).filter((item) => !DYNAMIC.includes(item.name)))
      for (const row of table.rows)
        fixture.seed[`${table.schema}.${table.name}:${row.id}`] = row.hash;
    fixture.status = 'READY';
    write(fixture);
    await validated(manager, fixture);
    if (process.env.OTOGROW_DEVELOPMENT_UI_FAILURE === 'PRECOMMIT')
      throw new Error('Injected development UI PRECOMMIT failure.');
  });
  console.log(
    JSON.stringify({
      ready: true,
      title: fixture.title,
      projectId: fixture.projectId,
      releaseId: fixture.releaseId,
      url: `http://apple.localhost:3001/delivery?view=development&releaseProject=${fixture.projectId}&releaseId=${fixture.releaseId}`,
    }),
  );
}
async function cleanup() {
  const fixture = load();
  if (!fixture.baseline) {
    unlinkSync(FILE);
    syncDirectory(FILE);
    return;
  }
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    await validated(manager, fixture);
    fixture.status = 'CLEANUP_PREPARED';
    write(fixture);
    for (const table of [
      'deliveryReleaseEvent',
      'deliveryReleaseVersion',
      'deliveryRelease',
      'otogrowActivityEvent',
    ])
      await manager.query(
        `DELETE FROM core.${quote(table)} WHERE "workspaceId"=$1 AND ${table === 'deliveryRelease' ? 'id' : table === 'otogrowActivityEvent' ? '"sourceId"' : '"releaseId"'}=ANY($2::uuid[])`,
        [WORKSPACE_ID, releaseIds(fixture)],
      );
    for (const entry of [...entries(fixture)].reverse())
      await manager.query(
        `DELETE FROM ${quote(entry.schema)}.${quote(entry.name)} WHERE id=ANY($1::uuid[])`,
        [entry.ids],
      );
    await validated(manager, fixture);
    if (process.env.OTOGROW_DEVELOPMENT_UI_FAILURE === 'CLEANUP_PRECOMMIT')
      throw new Error('Injected development UI CLEANUP_PRECOMMIT failure.');
  });
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  if (!existsSync(receipt))
    writeJournal(
      {
        checker: fixture.checker,
        nonce: fixture.nonce,
        cleaned: true,
        protectedTables: fixture.baseline.tables.length,
      },
      receipt,
      true,
    );
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    'PASS exact development UI fixture cleanup; original records and Operations preserved.',
  );
}
async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert.equal(process.env.OTOGROW_DEVELOPMENT_UI_ISOLATED, '1');
  const command = process.argv[2];
  assert(
    [
      'create',
      'inspect',
      'plan',
      'plan-record',
      'plan-draft',
      'cleanup',
    ].includes(command),
  );
  await connectionSource.initialize();
  try {
    if (command === 'create') await create();
    else if (command === 'cleanup') await cleanup();
    else if (command === 'inspect') {
      const fixture = load();
      await connectionSource.transaction(async (manager) => {
        await locked(manager);
        const result = await validated(manager, fixture);
        console.log(
          JSON.stringify({
            valid: true,
            events: result.events.map(({ action, revision, status }) => ({
              action,
              revision,
              status,
            })),
            protectedTables: fixture.baseline.tables.length,
          }),
        );
      });
    } else if (command === 'plan-draft') {
      const fixture = load();
      assert(!fixture.draftIntent);
      const id = process.argv[3],
        requestId = process.argv[4];
      assert.match(id, UUID);
      assert.match(requestId, UUID);
      assert.notEqual(id, fixture.releaseId);
      await connectionSource.transaction(async (manager) => {
        await locked(manager);
        await validated(manager, fixture);
        assert.equal(
          (
            await manager.query(
              'SELECT id FROM core."deliveryRelease" WHERE id=$1',
              [id],
            )
          ).length,
          0,
        );
        fixture.draftIntent = { id, requestId };
        write(fixture);
        const input = {
          id,
          requestId,
          revision: 0,
          projectId: fixture.projectId,
          projectRevision: 1,
          expectedCompanyId: null,
          body: {
            title: 'Disposable new plan preview',
            ownerId: fixture.actorId,
            targetDate: '2026-11-06',
            repositoryUrl: 'https://github.com/example/mobile',
            commitSha: '',
            summary: '',
            acceptanceCriteria: '',
            rollbackPlan: '',
            work: [
              {
                taskId: fixture.taskId,
                revision: 1,
                issueUrl: '',
                pullRequestUrl: '',
                blockedByTaskIds: [],
              },
            ],
            checks: ['TEST', 'CODE_REVIEW', 'ROLLBACK', 'HANDOVER'].map(
              (kind, index) => ({
                id: randomUUID(),
                kind,
                label: [
                  'Tests',
                  'Code review',
                  'Rollback readiness',
                  'Handover readiness',
                ][index],
                status: 'NOT_RUN',
                evidenceUrl: '',
                note: '',
              }),
            ),
          },
        };
        journalPlan(fixture, 'save', input, {
          memberId: fixture.actorId,
          userWorkspaceId: fixture.userWorkspaceId,
        });
        fixture.commands.at(-1).uiCheckIdentities = true;
        write(fixture);
        console.log(
          'PASS new-draft record/request/actor and every editable field declared before saving; only four embedded non-record check UUIDs are opaque.',
        );
      });
    } else if (command === 'plan-record') {
      const fixture = load();
      const requestId = process.argv[3];
      const action = process.argv[4];
      assert.match(requestId, UUID);
      assert(
        [
          'RECORD_DEPLOYMENT_FAILED',
          'RECORD_DEPLOYMENT',
          'RECORD_HANDOVER',
          'RECORD_ACCEPTANCE',
        ].includes(action),
      );
      await connectionSource.transaction(async (manager) => {
        await locked(manager);
        const result = await validated(manager, fixture);
        assert.equal(result.headers.length, 1);
        const input = {
          id: fixture.releaseId,
          requestId,
          revision: result.headers[0].revision,
          sourceFingerprint: fixture.commands[1].input.sourceFingerprint,
          action,
          note: `FIXTURE browser evidence for ${action}.`,
          evidenceUrl: `https://example.invalid/${action.toLowerCase()}`,
          commitSha: fixture.commands[0].input.body.commitSha,
          environment: action.startsWith('RECORD_DEPLOYMENT')
            ? 'Disposable staging'
            : '',
        };
        journalPlan(fixture, 'decide', input, {
          memberId: fixture.actorId,
          userWorkspaceId: fixture.userWorkspaceId,
        });
        console.log(
          JSON.stringify({ planned: true, action, revision: input.revision }),
        );
      });
    } else {
      const fixture = load();
      const input = JSON.parse(process.argv[3]);
      journalPlan(fixture, 'decide', input, {
        memberId: fixture.actorId,
        userWorkspaceId: fixture.userWorkspaceId,
      });
      console.log(
        'PASS private exact action intent recorded before the UI commit.',
      );
    }
  } finally {
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    console.error(`Preserve ${FILE}; use guarded cleanup.`);
    process.exitCode = 1;
  });

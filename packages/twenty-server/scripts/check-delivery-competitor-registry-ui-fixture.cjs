const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const guard = require('./check-delivery-assistants-ui-fixture.cjs');
const {
  services,
} = require('./check-delivery-competitor-registry-support.cjs');
const {
  competitorSourceSaveSchema,
  competitorSourceChangeSchema,
} = require('../dist/modules/delivery/competitors/delivery-competitor.types');
const {
  canonicalCompetitorSource,
} = require('../dist/modules/delivery/competitors/delivery-competitor-source.policy');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');

const FILE = '/tmp/otogrow-competitor-registry-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DYNAMIC = [
  'deliveryCompetitorSource',
  'deliveryCompetitorSourceVersion',
  'deliveryCompetitorSourceEvent',
  'otogrowActivityEvent',
];
const SOURCES = [
  ...DYNAMIC,
  'otogrowRole',
  'otogrowRoleAssignment',
  'otogrowMemberAccess',
  'roleTarget',
].map((name) => name.toLowerCase());
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
  isAuthenticationLifecycleTable,
} = guard;
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const parse = (method, input) =>
  (method === 'save'
    ? competitorSourceSaveSchema
    : competitorSourceChangeSchema
  ).parse(input);
const sourceIds = (fixture) => [fixture.sourceId, ...fixture.browserSourceIds];
const people = (fixture) => [fixture.editor, fixture.reviewer];
const admin = (fixture) => ({
  memberId: fixture.actorId,
  userWorkspaceId: fixture.userWorkspaceId,
});
const entries = (fixture) => [
  {
    schema: 'core',
    name: 'user',
    ids: people(fixture).map((person) => person.userId),
  },
  {
    schema: 'core',
    name: 'userWorkspace',
    ids: people(fixture).map((person) => person.userWorkspaceId),
  },
  {
    schema: 'core',
    name: 'roleTarget',
    ids: people(fixture).map((person) => person.nativeTargetId),
  },
  {
    schema: fixture.schema,
    name: 'workspaceMember',
    ids: people(fixture).map((person) => person.memberId),
  },
  { schema: 'core', name: 'otogrowRole', ids: [fixture.reviewer.roleId] },
  {
    schema: 'core',
    name: 'otogrowMemberAccess',
    ids: [fixture.reviewer.accessId],
  },
  {
    schema: 'core',
    name: 'otogrowRoleAssignment',
    ids: [fixture.reviewer.assignmentId],
  },
  { schema: 'core', name: 'deliveryProject', ids: [fixture.projectId] },
];
const body = (fixture, index = 1) => ({
  projectId: fixture.projectId,
  label: `${fixture.title} saved source`,
  platform: 'X',
  accountReference: `@OgSeed${fixture.nonce.slice(0, 8)}`,
  ownerId: fixture.editor.memberId,
  reviewerId: fixture.reviewer.memberId,
  cadenceHours: 24,
  lookbackDays: 7,
  purpose: `FIXTURE public launch research, configuration ${index}. No provider collection.`,
});

function journalPlan(fixture, method, raw, person) {
  assert(['save', 'changeState'].includes(method));
  const input = parse(method, raw);
  assert.equal(input.projectId, fixture.projectId);
  assert.equal(input.projectRevision, 1);
  assert.equal(input.expectedCompanyId, null);
  assert(sourceIds(fixture).includes(input.id));
  assert(fixture.commands.length < 100, 'Keep the disposable journey bounded.');
  assert(
    !fixture.commands.some((plan) => plan.input.requestId === input.requestId),
  );
  if (method === 'save') {
    assert.equal(input.body.projectId, fixture.projectId);
    for (const id of [input.body.ownerId, input.body.reviewerId])
      assert(Object.hasOwn(fixture.names, id));
  }
  fixture.commands.push({
    method,
    input,
    hash: advertisingHash(input),
    memberId: person.memberId,
    userWorkspaceId: person.userWorkspaceId,
  });
  write(fixture);
  return input;
}

function load() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, 'competitor-registry-ui-v1');
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const id of [
    fixture.nonce,
    fixture.projectId,
    ...sourceIds(fixture),
    ...people(fixture).flatMap((person) => Object.values(person)),
  ])
    assert.match(id, UUID);
  assert.equal(
    fixture.title,
    `Disposable competitor ${fixture.nonce.slice(0, 8)}`,
  );
  for (const plan of fixture.commands) {
    assert.deepEqual(parse(plan.method, plan.input), plan.input);
    assert.equal(advertisingHash(plan.input), plan.hash);
    assert(sourceIds(fixture).includes(plan.input.id));
    const actor = [admin(fixture), ...people(fixture)].find(
      (person) => person.memberId === plan.memberId,
    );
    assert(actor);
    assert.equal(actor.userWorkspaceId, plan.userWorkspaceId);
  }
  return fixture;
}

async function validated(manager, fixture) {
  await noNativeAutomation(manager, fixture, SOURCES);
  const currentOperations = await operations(manager);
  assert.equal(currentOperations.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(withoutHeartbeat(currentOperations.state)),
    fixture.baseline.operations.hash,
  );
  const extra = additions(await readTables(manager, fixture), fixture);
  const ids = sourceIds(fixture);
  const headers = await manager.query(
    'SELECT * FROM core."deliveryCompetitorSource" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
    [WORKSPACE_ID, ids],
  );
  const versions = await manager.query(
    'SELECT * FROM core."deliveryCompetitorSourceVersion" WHERE "workspaceId"=$1 AND "sourceId"=ANY($2::uuid[])',
    [WORKSPACE_ID, ids],
  );
  const events = await manager.query(
    'SELECT * FROM core."deliveryCompetitorSourceEvent" WHERE "workspaceId"=$1 AND "sourceId"=ANY($2::uuid[])',
    [WORKSPACE_ID, ids],
  );
  const activity = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceId"=ANY($2::uuid[])',
    [WORKSPACE_ID, ids],
  );
  assert.equal(
    headers.length,
    new Set(versions.map((version) => version.sourceId)).size,
  );
  assert.equal(events.length, activity.length);
  for (const event of events) {
    const plan = fixture.commands.find(
      (candidate) => candidate.input.requestId === event.requestId,
    );
    assert(
      plan,
      'Every committed action needs an exact private precommit intent.',
    );
    assert.equal(event.sourceId, plan.input.id);
    assert.equal(event.inputHash, plan.hash);
    assert.equal(event.actorId, plan.memberId);
    assert.equal(event.userWorkspaceId, plan.userWorkspaceId);
    assert.equal(event.actorName, fixture.names[plan.memberId]);
    assert.equal(event.revision, plan.input.revision + 1);
    assert.equal(
      event.action,
      plan.method === 'save' ? 'SAVE' : plan.input.action,
    );
    assert.equal(event.note, plan.method === 'save' ? '' : plan.input.note);
    assert(
      versions.some(
        (version) =>
          version.sourceId === event.sourceId &&
          version.version === event.version,
      ),
    );
  }
  for (const version of versions) {
    const event = events.find(
      (candidate) =>
        candidate.sourceId === version.sourceId &&
        candidate.version === version.version &&
        candidate.action === 'SAVE',
    );
    assert(event);
    const plan = fixture.commands.find(
      (candidate) => candidate.input.requestId === event.requestId,
    );
    assert.equal(version.companyId, null);
    assert.equal(version.createdBy, plan.memberId);
    assert.deepEqual(version.body, {
      ...plan.input.body,
      ...canonicalCompetitorSource(
        plan.input.body.platform,
        plan.input.body.accountReference,
      ),
      ownerName: fixture.names[plan.input.body.ownerId],
      reviewerName: fixture.names[plan.input.body.reviewerId],
    });
  }
  for (const header of headers) {
    assert.equal(header.projectId, fixture.projectId);
    assert.equal(header.companyId, null);
    const history = events
      .filter((event) => event.sourceId === header.id)
      .sort((left, right) => left.revision - right.revision);
    assert(history.length);
    let status = null,
      versionNumber = 0;
    history.forEach((event, index) => {
      assert.equal(
        event.revision,
        index + 1,
        'Only contiguous planned descendants may be removed.',
      );
      if (event.action === 'SAVE') {
        versionNumber++;
        status ??= 'ACTIVE';
      } else if (event.action === 'PAUSE') {
        assert.equal(status, 'ACTIVE');
        status = 'PAUSED';
      } else if (event.action === 'ARCHIVE') {
        assert.notEqual(status, 'ARCHIVED');
        status = 'ARCHIVED';
      } else {
        assert(['PAUSED', 'ARCHIVED'].includes(status));
        status = status === 'ARCHIVED' ? 'PAUSED' : 'ACTIVE';
      }
      assert.equal(event.version, versionNumber);
      assert.equal(event.status, status);
    });
    const last = history.at(-1);
    const version = versions.find(
      (candidate) =>
        candidate.sourceId === header.id && candidate.version === versionNumber,
    );
    assert(version);
    assert.equal(header.createdBy, history[0].actorId);
    assert.equal(header.revision, last.revision);
    assert.equal(header.currentVersion, versionNumber);
    assert.equal(header.status, status);
    for (const field of [
      'label',
      'platform',
      'canonicalReference',
      'canonicalKey',
      'ownerId',
      'ownerName',
      'reviewerId',
      'reviewerName',
      'cadenceHours',
      'lookbackDays',
    ])
      assert.equal(header[field], version.body[field]);
  }
  const activityIds = new Set();
  for (const event of activity) {
    const recorded = events.find(
      (candidate) =>
        event.action === `COMPETITOR_SOURCE_${candidate.action}` &&
        event.actorId === candidate.actorId &&
        event.sourceId === candidate.sourceId &&
        Number(
          event.changes.find((change) => change.field === 'revision')?.after,
        ) === candidate.revision,
    );
    assert(recorded && !activityIds.has(recorded.id));
    activityIds.add(recorded.id);
    assert.equal(event.sourceType, 'competitor-source');
    assert.equal(event.projectId, fixture.projectId);
    assert.equal(event.category, 'DELIVERY');
    assert.equal(event.actorType, 'HUMAN');
    assert.equal(event.outcome, 'RECORDED');
    assert.equal(
      event.summary,
      'Recorded competitor source configuration. Collection remains off; no provider request was made.',
    );
    assert.deepEqual(event.changes, [
      { field: 'state', before: null, after: recorded.status },
      { field: 'revision', before: null, after: String(recorded.revision) },
    ]);
    const version = versions.find(
      (candidate) =>
        candidate.sourceId === recorded.sourceId &&
        candidate.version === recorded.version,
    );
    assert.equal(event.subjectMemberId, version.body.ownerId);
  }
  const dynamic = {
    deliveryCompetitorSource: headers,
    deliveryCompetitorSourceVersion: versions,
    deliveryCompetitorSourceEvent: events,
    otogrowActivityEvent: activity,
  };
  const hasSeed = extra.some(
    (table) => !DYNAMIC.includes(table.name) && table.rows.length,
  );
  if (hasSeed) {
    assert(headers.some((header) => header.id === fixture.sourceId));
    assert.equal(fixture.seedRequests.length, 27);
    for (const requestId of fixture.seedRequests)
      assert(
        events.some((event) => event.requestId === requestId),
        'Every seeded history action must remain present.',
      );
  }
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
      `Unexpected ${table.schema}.${table.name}; preserve the fixture.`,
    );
    if (!DYNAMIC.includes(table.name))
      for (const row of table.rows)
        assert.equal(
          row.hash,
          fixture.seed[`${table.schema}.${table.name}:${row.id}`],
        );
  }
  assert.equal(
    Boolean(headers.length),
    hasSeed,
    'Do not clean a partially missing seed.',
  );
  return { headers, versions, events, activity, hasSeed };
}

async function seed() {
  assert(!existsSync(FILE), 'Clean the owned competitor fixture first.');
  const person = () => ({
    memberId: randomUUID(),
    userId: randomUUID(),
    userWorkspaceId: randomUUID(),
    nativeTargetId: randomUUID(),
  });
  const fixture = {
    checker: 'competitor-registry-ui-v1',
    workspaceId: WORKSPACE_ID,
    status: 'CREATING',
    nonce: randomUUID(),
    projectId: randomUUID(),
    sourceId: randomUUID(),
    editor: person(),
    reviewer: {
      ...person(),
      roleId: randomUUID(),
      accessId: randomUUID(),
      assignmentId: randomUUID(),
    },
    browserSourceIds: [],
    commands: [],
    seed: {},
    createdAt: new Date().toISOString(),
  };
  fixture.title = `Disposable competitor ${fixture.nonce.slice(0, 8)}`;
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
      `SELECT DISTINCT member.id AS "memberId", member."userId", membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true`,
      [WORKSPACE_ID],
    );
    assert.equal(admins.length, 1);
    fixture.actorId = admins[0].memberId;
    fixture.actorUserId = admins[0].userId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    fixture.names = {
      [fixture.actorId]: admins[0].name || 'Workspace member',
      [fixture.editor.memberId]:
        `Synthetic researcher ${fixture.nonce.slice(0, 8)}`,
      [fixture.reviewer.memberId]:
        `Synthetic reviewer ${fixture.nonce.slice(0, 8)}`,
    };
    await noNativeAutomation(manager, fixture, SOURCES);
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
    for (const [index, member] of people(fixture).entries()) {
      await manager.query(
        'INSERT INTO core."user"(id,email,disabled) VALUES($1,$2,false)',
        [member.userId, `${member.userId}+competitor-ui@example.invalid`],
      );
      await manager.query(
        'INSERT INTO core."userWorkspace"(id,"userId","workspaceId") VALUES($1,$2,$3)',
        [member.userWorkspaceId, member.userId, WORKSPACE_ID],
      );
      await manager.query(
        'INSERT INTO core."roleTarget"(id,"workspaceId","roleId","userWorkspaceId","universalIdentifier","applicationId") VALUES($1,$2,$3,$4,$1,$5)',
        [
          member.nativeTargetId,
          WORKSPACE_ID,
          workspace.defaultRoleId,
          member.userWorkspaceId,
          workspace.workspaceCustomApplicationId,
        ],
      );
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}."workspaceMember"(id,"userId","nameFirstName","nameLastName") VALUES($1,$2,$3,$4)`,
        [
          member.memberId,
          member.userId,
          index === 0 ? 'Synthetic researcher' : 'Synthetic reviewer',
          fixture.nonce.slice(0, 8),
        ],
      );
    }
    await manager.query(
      'INSERT INTO core."otogrowRole"(id,"workspaceId",name,capabilities,revision) VALUES($1,$2,$3,$4,1)',
      [
        fixture.reviewer.roleId,
        WORKSPACE_ID,
        `${fixture.title} reviewer`,
        ['delivery.review'],
      ],
    );
    await manager.query(
      'INSERT INTO core."otogrowMemberAccess"(id,"workspaceId","workspaceMemberId",revision) VALUES($1,$2,$3,1)',
      [fixture.reviewer.accessId, WORKSPACE_ID, fixture.reviewer.memberId],
    );
    await manager.query(
      'INSERT INTO core."otogrowRoleAssignment"(id,"workspaceId","workspaceMemberId","roleId") VALUES($1,$2,$3,$4)',
      [
        fixture.reviewer.assignmentId,
        WORKSPACE_ID,
        fixture.reviewer.memberId,
        fixture.reviewer.roleId,
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject"(id,"workspaceId",name,"memberIds") VALUES($1,$2,$3,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.title,
        JSON.stringify(people(fixture).map((member) => member.memberId)),
      ],
    );
    const registry = services(connectionSource, {
      workspaceId: WORKSPACE_ID,
      people: { admin: admin(fixture) },
    }).registry;
    for (let index = 0; index < 27; index++) {
      const input = journalPlan(
        fixture,
        'save',
        {
          id: fixture.sourceId,
          requestId: randomUUID(),
          revision: index,
          projectId: fixture.projectId,
          projectRevision: 1,
          expectedCompanyId: null,
          body: body(fixture, index + 1),
        },
        index === 0 ? admin(fixture) : fixture.editor,
      );
      const actor = index === 0 ? admin(fixture) : fixture.editor;
      await registry.save(
        workspace,
        actor.memberId,
        actor.userWorkspaceId,
        input,
        manager,
      );
    }
    fixture.seedRequests = fixture.commands.map((plan) => plan.input.requestId);
    for (const table of additions(
      await readTables(manager, fixture),
      fixture,
    ).filter((entry) => !DYNAMIC.includes(entry.name)))
      for (const row of table.rows)
        fixture.seed[`${table.schema}.${table.name}:${row.id}`] = row.hash;
    fixture.status = 'READY';
    write(fixture);
    await validated(manager, fixture);
    if (process.env.OTOGROW_COMPETITOR_UI_FAILURE === 'SEED_PRECOMMIT')
      throw new Error('Injected competitor seed PRECOMMIT failure.');
  });
  if (process.env.OTOGROW_COMPETITOR_UI_FAILURE === 'SEED_POSTCOMMIT')
    throw new Error('Injected competitor seed POSTCOMMIT failure.');
  console.log(
    JSON.stringify({
      ready: true,
      title: fixture.title,
      projectId: fixture.projectId,
      sourceId: fixture.sourceId,
      researcher: {
        id: fixture.editor.memberId,
        name: fixture.names[fixture.editor.memberId],
      },
      reviewer: {
        id: fixture.reviewer.memberId,
        name: fixture.names[fixture.reviewer.memberId],
      },
      url: `http://apple.localhost:3001/delivery?view=competitors&competitorProject=${fixture.projectId}&competitorSource=${fixture.sourceId}`,
    }),
  );
}

async function plan() {
  const fixture = load();
  const method = process.argv[3];
  const input = parse(method, JSON.parse(process.argv[4]));
  assert(['save', 'changeState'].includes(method));
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    await validated(manager, fixture);
    if (!sourceIds(fixture).includes(input.id)) {
      assert.equal(method, 'save');
      assert.equal(input.revision, 0);
      assert(fixture.browserSourceIds.length < 3);
      assert.equal(
        (
          await manager.query(
            'SELECT id FROM core."deliveryCompetitorSource" WHERE id=$1',
            [input.id],
          )
        ).length,
        0,
      );
      fixture.browserSourceIds.push(input.id);
    }
    journalPlan(fixture, method, input, admin(fixture));
  });
  console.log(
    JSON.stringify({
      planned: true,
      sourceId: input.id,
      requestId: input.requestId,
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
    const before = await validated(manager, fixture);
    const authentication = (await readTables(manager, fixture)).filter(
      isAuthenticationLifecycleTable,
    );
    fixture.status = 'CLEANUP_PREPARED';
    fixture.cleanupAttempts ??= [];
    fixture.cleanupAttempts.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      events: before.events.length,
    });
    write(fixture);
    for (const name of [
      'deliveryCompetitorSourceEvent',
      'deliveryCompetitorSourceVersion',
      'deliveryCompetitorSource',
      'otogrowActivityEvent',
    ])
      await manager.query(
        `DELETE FROM core.${quote(name)} WHERE "workspaceId"=$1 AND ${name === 'deliveryCompetitorSource' ? 'id' : '"sourceId"'}=ANY($2::uuid[])`,
        [WORKSPACE_ID, sourceIds(fixture)],
      );
    for (const entry of [...entries(fixture)].reverse()) {
      const removed = await manager.query(
        `WITH removed AS (DELETE FROM ${quote(entry.schema)}.${quote(entry.name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
        [entry.ids],
      );
      exactIds(
        removed,
        before.hasSeed ? entry.ids : [],
        `Delete only exact owned ${entry.name} rows.`,
      );
    }
    await validated(manager, fixture);
    const after = await readTables(manager, fixture);
    for (const table of after)
      assert.equal(
        table.hash,
        isAuthenticationLifecycleTable(table)
          ? authentication.find((entry) => entry.name === table.name).hash
          : fixture.baseline.tables.find(
              (entry) =>
                entry.schema === table.schema && entry.name === table.name,
            ).hash,
        `Protected ${table.schema}.${table.name} changed during cleanup.`,
      );
    if (process.env.OTOGROW_COMPETITOR_UI_FAILURE === 'CLEANUP_PRECOMMIT')
      throw new Error('Injected competitor cleanup PRECOMMIT failure.');
  });
  if (process.env.OTOGROW_COMPETITOR_UI_FAILURE === 'CLEANUP_POSTCOMMIT')
    throw new Error('Injected competitor cleanup POSTCOMMIT failure.');
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  fixture.status = 'CLEANED';
  if (!existsSync(receipt)) writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    'PASS exact competitor UI fixture cleanup; original records, current authentication lifecycle and Operations preserved.',
  );
}

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Local database only.',
  );
  assert.equal(process.env.OTOGROW_COMPETITOR_UI_ISOLATED, '1');
  const command = process.argv[2];
  assert(['seed', 'inspect', 'plan', 'cleanup'].includes(command));
  await connectionSource.initialize();
  try {
    if (command === 'seed') await seed();
    else if (command === 'cleanup') await cleanup();
    else if (command === 'plan') await plan();
    else {
      const fixture = load();
      await connectionSource.transaction(async (manager) => {
        await locked(manager);
        const result = await validated(manager, fixture);
        console.log(
          JSON.stringify({
            valid: true,
            title: fixture.title,
            projectId: fixture.projectId,
            sourceId: fixture.sourceId,
            sources: result.headers.map(({ id, label, revision, status }) => ({
              id,
              label,
              revision,
              status,
            })),
            actions: result.events.length,
            protectedTables: fixture.baseline.tables.length,
          }),
        );
      });
    }
  } finally {
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    console.error(`Preserve ${FILE}; use guarded cleanup.`);
    process.exitCode = 1;
  });

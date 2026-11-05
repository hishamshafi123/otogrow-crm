const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  existsSync,
  lstatSync,
  readFileSync,
  unlinkSync,
  rmdirSync,
} = require('node:fs');
const { join, isAbsolute } = require('node:path');
const http = require('node:http');
const https = require('node:https');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const {
  contentAccountSchema,
  contentPlanSchema,
  contentSaveSchema,
  contentDecisionSchema,
} = require('../dist/modules/delivery/content/delivery-content.types');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  validateContentLedger,
} = require('./check-delivery-content-ledger.cjs');
const { CONTENT_TABLES } = require('./check-delivery-content-support.cjs');
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
  storageRoot,
  directory,
  verifyMedia,
  generateMedia,
  details,
  roleMap,
  refreshRoleCache,
  services,
} = require('./check-delivery-content-ui-support.cjs');

const FILE = '/tmp/otogrow-content-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DYNAMIC = [...CONTENT_TABLES, 'otogrowActivityEvent'];
const SOURCES = [...DYNAMIC, 'workspaceMember', 'task', 'deliveryTask'].map(
  (name) => name.toLowerCase(),
);
const schemas = {
  saveAccount: contentAccountSchema,
  savePlan: contentPlanSchema,
  save: contentSaveSchema,
  decide: contentDecisionSchema,
};
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const entries = (fixture) => [
  { schema: 'core', name: 'user', ids: [fixture.employee.userId] },
  {
    schema: 'core',
    name: 'userWorkspace',
    ids: [fixture.employee.userWorkspaceId],
  },
  { schema: 'core', name: 'roleTarget', ids: [fixture.nativeTargetId] },
  { schema: 'core', name: 'otogrowRole', ids: [fixture.roleId] },
  {
    schema: 'core',
    name: 'otogrowMemberAccess',
    ids: [fixture.memberAccessId],
  },
  {
    schema: 'core',
    name: 'otogrowRoleAssignment',
    ids: [fixture.roleAssignmentId],
  },
  {
    schema: fixture.schema,
    name: 'workspaceMember',
    ids: [fixture.employee.memberId],
  },
  { schema: 'core', name: 'deliveryProject', ids: [fixture.projectId] },
  { schema: fixture.schema, name: 'task', ids: [fixture.taskId] },
  { schema: 'core', name: 'deliveryTask', ids: [fixture.managedId] },
];
function load() {
  const metadata = lstatSync(FILE);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o077) === 0 &&
      metadata.uid === process.getuid(),
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, 'content-ui-v1');
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const id of [
    fixture.nonce,
    fixture.projectId,
    fixture.taskId,
    fixture.managedId,
    fixture.assetId,
    fixture.nativeTargetId,
    fixture.roleId,
    fixture.memberAccessId,
    fixture.roleAssignmentId,
    fixture.employee.userId,
    fixture.employee.userWorkspaceId,
    fixture.employee.memberId,
  ])
    assert.match(id, UUID);
  assert.equal(
    fixture.title,
    `Disposable content ${fixture.nonce.slice(0, 8)}`,
  );
  for (const command of fixture.commands) {
    assert(Object.hasOwn(schemas, command.method));
    assert.deepEqual(
      schemas[command.method].parse(command.input),
      command.input,
    );
    assert.equal(command.hash, advertisingHash(command.input));
    assert(
      Object.values(fixture.people).some(
        (person) =>
          person.memberId === command.memberId &&
          person.userWorkspaceId === command.userWorkspaceId,
      ),
    );
    if (command.method === 'save')
      assert.equal(
        command.body.sourceFingerprint,
        command.input.expectedSourceFingerprint,
      );
  }
  return fixture;
}
async function rows(manager, fixture) {
  const accounts = await manager.query(
    'SELECT * FROM core."deliveryContentAccount" WHERE "workspaceId"=$1 AND "projectId"=$2',
    [WORKSPACE_ID, fixture.projectId],
  );
  const plans = await manager.query(
    'SELECT * FROM core."deliveryContentPlan" WHERE "workspaceId"=$1 AND "projectId"=$2',
    [WORKSPACE_ID, fixture.projectId],
  );
  const variants = await manager.query(
    'SELECT * FROM core."deliveryContentVariant" WHERE "workspaceId"=$1 AND "projectId"=$2',
    [WORKSPACE_ID, fixture.projectId],
  );
  const ids = [...accounts, ...plans, ...variants].map((item) => item.id);
  return {
    deliveryContentAccount: accounts,
    deliveryContentPlan: plans,
    deliveryContentVariant: variants,
    deliveryContentVersion: await manager.query(
      'SELECT * FROM core."deliveryContentVersion" WHERE "workspaceId"=$1 AND "variantId"=ANY($2::uuid[])',
      [WORKSPACE_ID, variants.map((item) => item.id)],
    ),
    deliveryContentEvent: await manager.query(
      'SELECT * FROM core."deliveryContentEvent" WHERE "workspaceId"=$1 AND "targetId"=ANY($2::uuid[])',
      [WORKSPACE_ID, ids],
    ),
    otogrowActivityEvent: await manager.query(
      'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceId"=ANY($2::uuid[])',
      [WORKSPACE_ID, ids],
    ),
  };
}
async function validate(manager, fixture) {
  assert(fixture.baseline, 'Baseline must exist before validation.');
  assert.equal(
    await schemaFingerprint(manager),
    fixture.baseline.schema,
    'The schema changed; do not adopt or remove unrelated changes.',
  );
  await noNativeAutomation(manager, fixture, SOURCES);
  const currentOperations = await operations(manager);
  assert.equal(currentOperations.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(withoutHeartbeat(currentOperations.state)),
    fixture.baseline.operations.hash,
    'Content fixture cannot change Operations.',
  );
  const extra = additions(await readTables(manager, fixture), fixture);
  const dynamic = await rows(manager, fixture);
  validateContentLedger(fixture, dynamic);
  const owned = entries(fixture);
  const hasSeed = extra.some((table) =>
    owned.some(
      (entry) =>
        entry.schema === table.schema &&
        entry.name === table.name &&
        table.rows.some((row) => entry.ids.includes(row.id)),
    ),
  );
  for (const table of extra) {
    if (isAuthenticationLifecycleTable(table)) continue;
    const staticIds = hasSeed
      ? owned
          .filter(
            (entry) =>
              entry.schema === table.schema && entry.name === table.name,
          )
          .flatMap((entry) => entry.ids)
      : [];
    const dynamicIds =
      table.schema === 'core'
        ? (dynamic[table.name] ?? []).map((row) => row.id)
        : [];
    exactIds(
      table.rows,
      [...staticIds, ...dynamicIds],
      `Unexpected new ${table.schema}.${table.name} rows.`,
    );
    for (const id of staticIds)
      assert.equal(
        table.rows.find((row) => row.id === id).hash,
        fixture.staticHashes[`${table.schema}.${table.name}:${id}`],
        'A static synthetic source changed outside the declared fixture.',
      );
  }
  for (const item of owned) {
    const actual = await manager.query(
      `SELECT id FROM ${quote(item.schema)}.${quote(item.name)} WHERE id=ANY($1::uuid[])`,
      [item.ids],
    );
    exactIds(
      actual,
      hasSeed ? item.ids : [],
      'Synthetic rows must exist or be fully absent, including orphan users.',
    );
  }
  verifyMedia(fixture, !hasSeed);
  return { extra, dynamic, hasSeed };
}
async function declare(
  manager,
  fixture,
  method,
  proposed,
  person,
  seeded = false,
) {
  assert(Object.hasOwn(schemas, method));
  const domain = await services(manager, fixture);
  try {
    let input = proposed;
    let body = null;
    if (method === 'save') {
      assert.equal(input.planId, fixture.planId);
      assert.equal(input.body.asset?.taskId ?? fixture.taskId, fixture.taskId);
      if (input.body.asset) {
        assert.equal(input.body.asset.assetId, fixture.assetId);
        assert.equal(input.body.asset.submissionVersion, 1);
      }
      assert(fixture.accountIds.includes(input.body.accountId));
      assert(
        [fixture.actorId, fixture.employee.memberId].includes(
          input.body.ownerId,
        ),
      );
      assert(
        [fixture.actorId, fixture.employee.memberId].includes(
          input.body.reviewerId,
        ),
      );
      assert(input.body.caption.startsWith('FIXTURE'));
      const preview = await domain.call(
        'preview',
        { ...input, expectedSourceFingerprint: null },
        person,
      );
      if (input.expectedSourceFingerprint)
        assert.equal(
          input.expectedSourceFingerprint,
          preview.body.sourceFingerprint,
        );
      input = {
        ...input,
        expectedSourceFingerprint: preview.body.sourceFingerprint,
      };
      body = preview.body;
    } else if (method === 'decide') {
      assert(
        fixture.commands.some(
          (command) =>
            command.method === 'save' && command.input.id === input.id,
        ),
      );
      const current = await domain.call('detail', { id: input.id }, person);
      input = {
        ...input,
        sourceFingerprint:
          input.sourceFingerprint ?? current.currentSourceFingerprint,
        note: input.note ?? '',
        evidenceUrl: input.evidenceUrl ?? '',
        publishedAt: input.publishedAt ?? null,
        correctsEventId: input.correctsEventId ?? null,
      };
      assert.equal(input.revision, current.variant.revision);
      assert.equal(input.sourceFingerprint, current.currentSourceFingerprint);
      if (input.note) assert(input.note.startsWith('FIXTURE'));
      if (input.evidenceUrl)
        assert(
          input.evidenceUrl.includes('FIXTURE') ||
            input.evidenceUrl.includes('otogrowfixture'),
        );
    } else {
      assert(
        seeded,
        'Browser acceptance cannot add or retarget fixture account/plan scope.',
      );
      assert.equal(input.projectId, fixture.projectId);
      assert.equal(input.expectedCompanyId, null);
    }
    input = schemas[method].parse(input);
    assert(
      !fixture.commands.some(
        (command) => command.input.requestId === input.requestId,
      ),
      'Each command needs a fresh predeclared request identity.',
    );
    const command = {
      method,
      input,
      body,
      hash: advertisingHash(input),
      memberId: person.memberId,
      userWorkspaceId: person.userWorkspaceId,
      seeded,
    };
    fixture.commands.push(command);
    write(fixture);
    return {
      command,
      execute: () => domain.call(method, input, person),
      close: domain.close,
    };
  } catch (error) {
    await domain.close();
    throw error;
  }
}
async function seeded(manager, fixture, method, input, person) {
  const prepared = await declare(manager, fixture, method, input, person, true);
  try {
    return await prepared.execute();
  } finally {
    await prepared.close();
  }
}
async function create() {
  assert(!existsSync(FILE), 'Inspect and clean the existing fixture first.');
  const nonce = randomUUID();
  const fixture = {
    checker: 'content-ui-v1',
    workspaceId: WORKSPACE_ID,
    nonce,
    title: `Disposable content ${nonce.slice(0, 8)}`,
    status: 'CREATING',
    createdAt: new Date().toISOString(),
    projectId: randomUUID(),
    taskId: randomUUID(),
    managedId: randomUUID(),
    assetId: randomUUID(),
    nativeTargetId: randomUUID(),
    roleId: randomUUID(),
    memberAccessId: randomUUID(),
    roleAssignmentId: randomUUID(),
    employee: {
      userId: randomUUID(),
      userWorkspaceId: randomUUID(),
      memberId: randomUUID(),
    },
    accountIds: [randomUUID(), randomUUID()],
    planId: randomUUID(),
    variants: { review: randomUUID(), sibling: randomUUID() },
    commands: [],
    cacheIntents: [],
    staticHashes: {},
    people: {},
  };
  write(fixture, true);
  if (process.env.OTOGROW_CONTENT_UI_FAILURE === 'INITIAL_JOURNAL')
    throw new Error('Injected INITIAL_JOURNAL failure.');
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT * FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert.equal(workspace.activationStatus, 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    quote(fixture.schema);
    const actors = await manager.query(
      `SELECT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" person ON person.id=membership."userId" JOIN core."roleTarget" target ON target."workspaceId"=$1 AND target."userWorkspaceId"=membership.id JOIN core.role role ON role.id=target."roleId" WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND person."deletedAt" IS NULL AND NOT person.disabled AND role."canUpdateAllSettings"=true`,
      [WORKSPACE_ID],
    );
    assert.equal(actors.length, 1);
    const actor = actors[0];
    fixture.actorId = actor.memberId;
    fixture.actorUserId = actor.userId;
    fixture.userWorkspaceId = actor.userWorkspaceId;
    fixture.actorName = actor.name;
    fixture.employeeName = `Content fixture editor ${nonce.slice(0, 8)}`;
    fixture.people = {
      admin: { ...actor, displayName: actor.name },
      writer: { ...fixture.employee, displayName: fixture.employeeName },
    };
    const [nativeRole] = await manager.query(
      'SELECT id,"canReadAllObjectRecords","canUpdateAllSettings" FROM core.role WHERE id=$1 AND "workspaceId"=$2',
      [workspace.defaultRoleId, WORKSPACE_ID],
    );
    assert(
      nativeRole?.canReadAllObjectRecords && !nativeRole.canUpdateAllSettings,
    );
    fixture.nativeRoleId = nativeRole.id;
    await noNativeAutomation(manager, fixture, SOURCES);
    const original = await operations(manager);
    fixture.baseline = {
      schema: await schemaFingerprint(manager),
      tables: await readTables(manager, fixture),
      operations: {
        id: original.id,
        hash: fingerprint(withoutHeartbeat(original.state)),
      },
    };
    fixture.originalRoles = await roleMap(manager);
    const root = await storageRoot(manager);
    fixture.media = {
      root,
      directory: join(root, WORKSPACE_ID, 'delivery-creative', fixture.taskId),
    };
    fixture.status = 'PREPARED';
    write(fixture);
    generateMedia(fixture, write);
    const email = `${fixture.employee.userId}+content-ui@example.invalid`;
    await manager.query(
      'INSERT INTO core."user"(id,email,disabled) VALUES($1,$2,false)',
      [fixture.employee.userId, email],
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
        fixture.nativeRoleId,
        fixture.employee.userWorkspaceId,
        workspace.workspaceCustomApplicationId,
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}."workspaceMember"(id,"userId","userEmail","nameFirstName","nameLastName") VALUES($1,$2,$3,'Content fixture editor',$4)`,
      [
        fixture.employee.memberId,
        fixture.employee.userId,
        email,
        nonce.slice(0, 8),
      ],
    );
    await manager.query(
      'INSERT INTO core."otogrowRole"(id,"workspaceId",name,description,capabilities,revision) VALUES($1,$2,$3,$4,$5,1)',
      [
        fixture.roleId,
        WORKSPACE_ID,
        `${fixture.title} reviewer`,
        'FIXTURE independent review only.',
        ['delivery.review'],
      ],
    );
    await manager.query(
      'INSERT INTO core."otogrowMemberAccess"(id,"workspaceId","workspaceMemberId",revision) VALUES($1,$2,$3,1)',
      [fixture.memberAccessId, WORKSPACE_ID, fixture.employee.memberId],
    );
    await manager.query(
      'INSERT INTO core."otogrowRoleAssignment"(id,"workspaceId","workspaceMemberId","roleId") VALUES($1,$2,$3,$4)',
      [
        fixture.roleAssignmentId,
        WORKSPACE_ID,
        fixture.employee.memberId,
        fixture.roleId,
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject"(id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.title,
        JSON.stringify([fixture.actorId, fixture.employee.memberId]),
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.task(id,title,"assigneeId",status,"dueAt") VALUES($1,$2,$3,'DONE',NULL)`,
      [
        fixture.taskId,
        `${fixture.title} approved source image`,
        fixture.employee.memberId,
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryTask"(id,"workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,$5,1)',
      [
        fixture.managedId,
        WORKSPACE_ID,
        fixture.taskId,
        fixture.projectId,
        details(fixture),
      ],
    );
    const extra = additions(await readTables(manager, fixture), fixture);
    for (const item of entries(fixture)) {
      const table = extra.find(
        (entry) => entry.schema === item.schema && entry.name === item.name,
      );
      exactIds(table.rows, item.ids);
      for (const row of table.rows)
        fixture.staticHashes[`${item.schema}.${item.name}:${row.id}`] =
          row.hash;
    }
    fixture.status = 'BASE_READY';
    write(fixture);
    await validate(manager, fixture);
    if (process.env.OTOGROW_CONTENT_UI_FAILURE === 'SEED_PRECOMMIT')
      throw new Error('Injected SEED_PRECOMMIT failure.');
  });
  if (process.env.OTOGROW_CONTENT_UI_FAILURE === 'AFTER_BASE_COMMIT')
    throw new Error('Injected AFTER_BASE_COMMIT failure.');
  await refreshRoleCache(connectionSource.manager, fixture, write);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    await validate(manager, fixture);
    const accountNames = ['INSTAGRAM', 'FACEBOOK'];
    const handle = `otogrowfixture${nonce.slice(0, 8)}`;
    for (const [index, platform] of accountNames.entries())
      await seeded(
        manager,
        fixture,
        'saveAccount',
        {
          id: fixture.accountIds[index],
          requestId: randomUUID(),
          revision: 0,
          projectId: fixture.projectId,
          projectRevision: 1,
          expectedCompanyId: null,
          platform,
          name: `FIXTURE ${platform} manual destination`,
          handle: `@${handle}`,
          profileUrl: `https://www.${platform === 'INSTAGRAM' ? 'instagram' : 'facebook'}.com/${handle}`,
          archived: false,
        },
        fixture.people.admin,
      );
    await seeded(
      manager,
      fixture,
      'savePlan',
      {
        id: fixture.planId,
        requestId: randomUUID(),
        revision: 0,
        projectId: fixture.projectId,
        projectRevision: 1,
        expectedCompanyId: null,
        title: `${fixture.title} campaign`,
        purpose:
          'FIXTURE manual content workflow with independently approved media; no real account connected.',
        engagementId: null,
        service: null,
      },
      fixture.people.admin,
    );
    const planned = new Date(Date.parse(fixture.createdAt) + 86400000);
    planned.setUTCSeconds(0, 0);
    fixture.plannedAt = planned.toISOString();
    fixture.plannedLocal = new Date(planned.getTime() + 3 * 3600000)
      .toISOString()
      .slice(0, 16);
    write(fixture);
    for (const [index, key] of ['review', 'sibling'].entries()) {
      const input = {
        id: fixture.variants[key],
        requestId: randomUUID(),
        revision: 0,
        planId: fixture.planId,
        planRevision: 1,
        body: {
          accountId: fixture.accountIds[index],
          accountRevision: 1,
          ownerId: fixture.employee.memberId,
          reviewerId: fixture.actorId,
          format: 'IMAGE',
          caption: `FIXTURE ${key} posting package for independent review.`,
          plannedAt: fixture.plannedAt,
          plannedLocal: fixture.plannedLocal,
          timezone: 'Asia/Qatar',
          asset: {
            taskId: fixture.taskId,
            submissionVersion: 1,
            assetId: fixture.assetId,
          },
          notes:
            'FIXTURE image is a local test pattern; publication is recorded manually.',
        },
        expectedSourceFingerprint: null,
      };
      const saved = await seeded(
        manager,
        fixture,
        'save',
        input,
        fixture.people.writer,
      );
      const domain = await services(manager, fixture);
      let selected;
      try {
        selected = await domain.call(
          'detail',
          { id: input.id },
          fixture.people.writer,
        );
      } finally {
        await domain.close();
      }
      await seeded(
        manager,
        fixture,
        'decide',
        {
          id: input.id,
          requestId: randomUUID(),
          revision: saved.revision,
          action: 'SUBMIT',
          sourceFingerprint: selected.currentSourceFingerprint,
          note: '',
          evidenceUrl: '',
          publishedAt: null,
          correctsEventId: null,
        },
        fixture.people.writer,
      );
    }
    fixture.status = 'READY';
    write(fixture);
    await validate(manager, fixture);
    if (process.env.OTOGROW_CONTENT_UI_FAILURE === 'POSTS_PRECOMMIT')
      throw new Error('Injected POSTS_PRECOMMIT failure.');
  });
  print(fixture);
}
function print(fixture) {
  process.stdout.write(
    `${JSON.stringify({ status: fixture.status, title: fixture.title, url: `http://apple.localhost:3001/delivery?view=content&contentProject=${fixture.projectId}`, projectId: fixture.projectId, planId: fixture.planId, variants: fixture.variants, accountIds: fixture.accountIds, actorId: fixture.actorId, employee: fixture.employee.memberId, plannedAt: fixture.plannedAt, plannedLocal: fixture.plannedLocal, timezone: 'Asia/Qatar', publicationTime: fixture.createdAt, instructions: 'Before each Save/Submit/Approve/Record/Correct/Cancel, capture visible contentRequest/contentPostId URL IDs and write exact {method,input} JSON to a chmod600 /tmp file, then run plan <absolute path>. Source fingerprint may be omitted for decide or null for save and will be read and journalled exactly before the click. Use FIXTURE caption/notes/evidence, only this project/plan/account/media and these two members. No connected publishing, providers, native task edits, roles/settings, unrelated data or Operations changes. Root Tim reviews the employee package, records uncertain attempt then publication/correction; sibling stays independently pending. Root may prepare own separate package with synthetic reviewer; self-approval remains unavailable.' }, null, 2)}\n`,
  );
}
async function plan(fixture, path) {
  assert(isAbsolute(path));
  const info = lstatSync(path);
  assert(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0);
  const proposed = JSON.parse(readFileSync(path, 'utf8'));
  assert(['save', 'decide'].includes(proposed.method));
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const current = await validate(manager, fixture);
    assert(current.hasSeed);
    const prepared = await declare(
      manager,
      fixture,
      proposed.method,
      proposed.input,
      fixture.people.admin,
    );
    await prepared.close();
    process.stdout.write(
      `${JSON.stringify({ planned: true, method: prepared.command.method, input: prepared.command.input }, null, 2)}\n`,
    );
  });
}
async function cleanup(fixture) {
  if (!fixture.baseline) {
    assert.equal(fixture.status, 'CREATING');
    assert.equal(fixture.schema, undefined);
    assert.equal(fixture.media, undefined);
    assert.equal(fixture.originalRoles, undefined);
    assert.deepEqual(fixture.commands, []);
    assert.deepEqual(fixture.cacheIntents, []);
    assert.deepEqual(fixture.staticHashes, {});
    assert.deepEqual(fixture.people, {});
    await connectionSource.transaction(async (manager) => {
      await locked(manager, true);
      const [workspace] = await manager.query(
        'SELECT "databaseSchema" FROM core.workspace WHERE id=$1',
        [WORKSPACE_ID],
      );
      const resolved = { ...fixture, schema: workspace.databaseSchema };
      for (const item of entries(resolved))
        exactIds(
          await manager.query(
            `SELECT id FROM ${quote(item.schema)}.${quote(item.name)} WHERE id=ANY($1::uuid[])`,
            [item.ids],
          ),
          [],
        );
      for (const name of [
        'deliveryContentAccount',
        'deliveryContentPlan',
        'deliveryContentVariant',
        'otogrowActivityEvent',
      ])
        exactIds(
          await manager.query(
            `SELECT id FROM core.${quote(name)} WHERE "workspaceId"=$1 AND "projectId"=$2`,
            [WORKSPACE_ID, fixture.projectId],
          ),
          [],
        );
      const root = await storageRoot(manager);
      assert(
        !existsSync(
          join(root, WORKSPACE_ID, 'delivery-creative', fixture.taskId),
        ),
        'Unexpected media prevents initial-journal cleanup.',
      );
    });
    const receipt = `${FILE}.${fixture.nonce}.initial-cleaned.json`;
    writeJournal(
      {
        ...fixture,
        status: 'CLEANED_INITIAL',
        evidence:
          'No allocated fixture row or media existed; no database/cache/media write was performed.',
      },
      receipt,
      true,
    );
    unlinkSync(FILE);
    syncDirectory(FILE);
    process.stdout.write(
      `PASS guarded empty initial-journal cleanup. Receipt: ${receipt}\n`,
    );
    return;
  }
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    const current = await validate(manager, fixture);
    if (current.hasSeed) {
      const ordered = [
        ...DYNAMIC.map((name) => ({
          schema: 'core',
          name,
          ids: current.dynamic[name].map((row) => row.id),
        })),
        ...[
          'deliveryTask',
          'task',
          'deliveryProject',
          'otogrowRoleAssignment',
          'otogrowMemberAccess',
          'otogrowRole',
          'roleTarget',
          'workspaceMember',
          'userWorkspace',
          'user',
        ].map((name) => entries(fixture).find((item) => item.name === name)),
      ];
      for (const item of ordered) {
        const removed = await manager.query(
          `WITH removed AS (DELETE FROM ${quote(item.schema)}.${quote(item.name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
          [item.ids],
        );
        exactIds(removed, item.ids);
      }
    }
    await validate(manager, fixture);
    if (process.env.OTOGROW_CONTENT_UI_FAILURE === 'CLEANUP_PRECOMMIT')
      throw new Error('Injected CLEANUP_PRECOMMIT failure.');
  });
  fixture.status = 'DATA_CLEANED';
  write(fixture);
  await refreshRoleCache(connectionSource.manager, fixture, write);
  verifyMedia(fixture, true);
  if (fixture.media && existsSync(directory(fixture))) {
    const path = join(directory(fixture), fixture.assetId);
    if (existsSync(path)) unlinkSync(path);
    rmdirSync(directory(fixture));
  }
  fixture.status = 'CLEANED';
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  process.stdout.write(
    `PASS exact content UI cleanup; ${fixture.baseline.tables.length} original scoped tables and Operations protected, current authentication preserved, native role map restored, synthetic media removed. Receipt: ${receipt}\n`,
  );
}
async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const mode = process.argv[2] ?? 'inspect';
  assert(['create', 'inspect', 'plan', 'cleanup'].includes(mode));
  assert(process.argv.length === (mode === 'plan' ? 4 : 3));
  if (['create', 'cleanup'].includes(mode))
    assert.equal(
      process.env.OTOGROW_CONTENT_UI_SERVICES_STOPPED,
      '1',
      'Coordinate a stopped API/worker window for seed and cleanup.',
    );
  const transports = [
    [global, 'fetch'],
    [http, 'request'],
    [http, 'get'],
    [https, 'request'],
    [https, 'get'],
  ].map(([owner, key]) => ({ owner, key, original: owner[key] }));
  for (const { owner, key } of transports)
    owner[key] = () => {
      throw new Error(
        'No provider/network requests are allowed in the content UI fixture.',
      );
    };
  try {
    await connectionSource.initialize();
    if (mode === 'create') await create();
    else {
      const fixture = load();
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
    for (const { owner, key, original } of transports) owner[key] = original;
  }
}
if (require.main === module)
  main().catch((error) => {
    process.stderr.write(
      `${error.stack}\nPreserve ${FILE}; use only guarded inspection and cleanup.\n`,
    );
    process.exitCode = 1;
  });

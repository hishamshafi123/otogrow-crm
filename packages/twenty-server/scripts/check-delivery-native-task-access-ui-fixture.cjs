const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');
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
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  captureCache,
  withRedis,
  verifyCache,
  recomputeCache,
  restoreCache,
} = require('./check-delivery-native-task-access-ui-support.cjs');

const FILE = '/tmp/otogrow-native-task-access-ui-fixture.json';
const CHECKER = 'native-task-access-ui-v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const copy = (value) => JSON.parse(JSON.stringify(value));
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const fault = (stage) => {
  if (process.env.OTOGROW_NATIVE_ACCESS_UI_FAILURE === stage)
    throw new Error(`Injected native-access UI ${stage}.`);
};
function read() {
  const info = lstatSync(FILE);
  assert(
    info.isFile() &&
      !info.isSymbolicLink() &&
      (info.mode & 0o077) === 0 &&
      info.uid === process.getuid(),
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, CHECKER);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const key of [
    'nonce',
    'projectId',
    'nativeRoleId',
    'permissionId',
    'firstTaskId',
    'secondTaskId',
    'firstManagedId',
    'secondManagedId',
  ])
    assert.match(fixture[key], UUID);
  assert.equal(
    fixture.title,
    `Disposable native task access ${fixture.nonce.slice(0, 8)}`,
  );
  assert.equal(fixture.marker, `native-task-access-ui:${fixture.nonce}`);
  assert(['ALLOWED', 'DENIED'].includes(fixture.desired));
  return fixture;
}
function rowGroups(fixture) {
  return [
    ['core', 'deliveryProject', [fixture.projectId]],
    [fixture.schema, 'task', [fixture.firstTaskId, fixture.secondTaskId]],
    ['core', 'deliveryTask', [fixture.firstManagedId, fixture.secondManagedId]],
    ['core', 'role', [fixture.nativeRoleId]],
    ['core', 'objectPermission', [fixture.permissionId]],
  ];
}
async function validate(manager, fixture) {
  assert(fixture.baseline);
  assert.equal(await schemaFingerprint(manager), fixture.baseline.schema);
  assert.equal(
    fingerprint(withoutHeartbeat((await operations(manager)).state)),
    fixture.baseline.operations.hash,
  );
  await noNativeAutomation(manager, fixture, [
    'objectpermission',
    'role',
    'roletarget',
  ]);
  const groups = [];
  for (const [schema, name, ids] of rowGroups(fixture)) {
    const rows = await manager.query(
      `SELECT * FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [ids],
    );
    groups.push({ schema, name, rows });
  }
  const present = groups[0].rows.length === 1;
  for (const group of groups) {
    const expected = fixture.seeds?.[`${group.schema}.${group.name}`] ?? [];
    if (!present)
      assert.equal(
        group.rows.length,
        0,
        'Partial owned database state must be preserved for investigation.',
      );
    else {
      exactIds(
        group.rows,
        expected.map((row) => row.id),
      );
      const actual = copy(group.rows);
      // The assignment observer writes a receipt for the current assignee even for legacy tasks.
      if (group.schema === fixture.schema && group.name === 'task')
        for (const task of actual) assert.equal(task.assigneeId, null);
      if (group.name === 'objectPermission') {
        assert(
          fixture.transitions.includes(
            actual[0].canReadObjectRecords ? 'ALLOWED' : 'DENIED',
          ),
        );
        actual[0].canReadObjectRecords = true;
      }
      assert.equal(
        fingerprint(actual),
        fingerprint(expected),
        `Owned ${group.name} changed outside declared permission toggles.`,
      );
    }
  }
  const [target] = await manager.query(
    'SELECT * FROM core."roleTarget" WHERE id=$1 FOR UPDATE',
    [fixture.targetOriginal.id],
  );
  assert(target);
  assert.equal(
    fingerprint({ ...copy(target), roleId: fixture.targetOriginal.roleId }),
    fingerprint(fixture.targetOriginal),
  );
  assert.equal(
    target.roleId,
    present ? fixture.nativeRoleId : fixture.targetOriginal.roleId,
  );
  const tables = await readTables(manager, fixture);
  const normalizedTables = copy(tables);
  const targetTable = normalizedTables.find(
    (table) => table.schema === 'core' && table.name === 'roleTarget',
  );
  const originalTargetHash = fixture.baseline.tables
    .find((table) => table.schema === 'core' && table.name === 'roleTarget')
    .rows.find((row) => row.id === target.id).hash;
  targetTable.rows.find((row) => row.id === target.id).hash =
    originalTargetHash;
  targetTable.hash = fingerprint(targetTable.rows);
  for (const table of additions(normalizedTables, fixture)) {
    const group = groups.find(
      (item) => item.schema === table.schema && item.name === table.name,
    );
    exactIds(
      table.rows,
      group?.rows.map((row) => row.id) ?? [],
      `Unexpected added ${table.name}.`,
    );
  }
  await withRedis((client) => verifyCache(fixture, client));
  return { groups, tables, present };
}
function print(fixture) {
  console.log(
    JSON.stringify(
      {
        status: fixture.status,
        desired: fixture.desired,
        projectId: fixture.projectId,
        title: fixture.title,
        taskIds: [fixture.firstTaskId, fixture.secondTaskId],
        controls: ['inspect', 'deny', 'allow', 'cleanup'],
        boundary:
          'Read-only browser acceptance only. No task edits, assignment acknowledgements, comments, sends, approvals or other product writes.',
      },
      null,
      2,
    ),
  );
}
async function create() {
  assert.equal(process.env.OTOGROW_NATIVE_ACCESS_UI_SERVICES_STOPPED, '1');
  assert(!existsSync(FILE));
  const nonce = randomUUID();
  const fixture = {
    checker: CHECKER,
    workspaceId: WORKSPACE_ID,
    nonce,
    projectId: randomUUID(),
    nativeRoleId: randomUUID(),
    permissionId: randomUUID(),
    firstTaskId: randomUUID(),
    secondTaskId: randomUUID(),
    firstManagedId: randomUUID(),
    secondManagedId: randomUUID(),
    title: `Disposable native task access ${nonce.slice(0, 8)}`,
    marker: `native-task-access-ui:${nonce}`,
    desired: 'ALLOWED',
    transitions: ['ALLOWED'],
    status: 'CREATING',
    seeds: {},
    cacheIntents: [],
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
    const admins = await manager.query(
      `SELECT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId",target.id AS "targetId" FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(admins.length, 1);
    fixture.actorId = admins[0].memberId;
    fixture.actorUserId = admins[0].userId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    const [target] = await manager.query(
      'SELECT * FROM core."roleTarget" WHERE id=$1 FOR UPDATE',
      [admins[0].targetId],
    );
    fixture.targetOriginal = copy(target);
    const [role] = await manager.query('SELECT * FROM core.role WHERE id=$1', [
      target.roleId,
    ]);
    assert(role.canReadAllObjectRecords && role.canUpdateAllSettings);
    const taskMetadata = await manager.query(
      'SELECT id FROM core."objectMetadata" WHERE "workspaceId"=$1 AND "nameSingular"=\'task\'',
      [WORKSPACE_ID],
    );
    assert.equal(taskMetadata.length, 1);
    fixture.taskObjectId = taskMetadata[0].id;
    const originalOperations = await operations(manager);
    await noNativeAutomation(manager, fixture, [
      'objectpermission',
      'role',
      'roletarget',
    ]);
    fixture.cacheOriginal = await captureCache();
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      schema: await schemaFingerprint(manager),
      operations: {
        id: originalOperations.id,
        hash: fingerprint(withoutHeartbeat(originalOperations.state)),
      },
    };
    write(fixture);
    const roleSeed = {
      ...copy(role),
      id: fixture.nativeRoleId,
      universalIdentifier: fixture.nativeRoleId,
      label: fixture.title,
      description: fixture.marker,
    };
    await manager.query(
      'INSERT INTO core.role SELECT (jsonb_populate_record(NULL::core.role,$1::jsonb)).*',
      [roleSeed],
    );
    await manager.query(
      'INSERT INTO core."objectPermission" (id,"workspaceId","roleId","objectMetadataId","canReadObjectRecords","canUpdateObjectRecords","universalIdentifier","applicationId") VALUES($1,$2,$3,$4,true,true,$1,$5)',
      [
        fixture.permissionId,
        WORKSPACE_ID,
        fixture.nativeRoleId,
        fixture.taskObjectId,
        role.applicationId,
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.title,
        JSON.stringify([fixture.actorId]),
      ],
    );
    for (const [taskId, managedId, suffix] of [
      [fixture.firstTaskId, fixture.firstManagedId, 'first'],
      [fixture.secondTaskId, fixture.secondManagedId, 'second'],
    ]) {
      const creative = newCreativeDocument();
      creative.brief.concept = `${fixture.marker}: private ${suffix} creative concept`;
      const details = {
        brief: `${fixture.marker}: private ${suffix} task brief`,
        service: 'Design',
        priority: 'NORMAL',
        scheduledDate: null,
        reviewerId: fixture.actorId,
        state: 'PLANNED',
        blocker: '',
        checklist: [],
        evidence: [],
        submissions: [],
        events: [],
        creative,
      };
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}.task (id,title,"assigneeId","dueAt",status) VALUES($1,$2,$3,NULL,'TODO')`,
        [taskId, `${fixture.title} ${suffix}`, null],
      );
      await manager.query(
        'INSERT INTO core."deliveryTask" (id,"workspaceId","taskId","projectId",details,revision) VALUES($1,$2,$3,$4,$5,1)',
        [managedId, WORKSPACE_ID, taskId, fixture.projectId, details],
      );
    }
    await manager.query(
      'UPDATE core."roleTarget" SET "roleId"=$2 WHERE id=$1',
      [target.id, fixture.nativeRoleId],
    );
    for (const [schema, name, ids] of rowGroups(fixture))
      fixture.seeds[`${schema}.${name}`] = copy(
        await manager.query(
          `SELECT * FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
          [ids],
        ),
      );
    fixture.status = 'PREPARED';
    write(fixture);
    fault('CREATE_PRECOMMIT');
  });
  fault('CREATE_AFTER_COMMIT');
  await recomputeCache(connectionSource.manager, fixture, write);
  fixture.status = 'READY';
  write(fixture);
  print(fixture);
}
async function transition(fixture, desired) {
  assert(['ALLOWED', 'DENIED'].includes(desired));
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    assert((await validate(manager, fixture)).present);
    fixture.desired = desired;
    fixture.transitions.push(desired);
    fixture.status = 'TRANSITION_PREPARED';
    write(fixture);
    await manager.query(
      'UPDATE core."objectPermission" SET "canReadObjectRecords"=$2 WHERE id=$1 AND "roleId"=$3',
      [fixture.permissionId, desired === 'ALLOWED', fixture.nativeRoleId],
    );
    fault('TRANSITION_PRECOMMIT');
  });
  fault('TRANSITION_AFTER_COMMIT');
  await recomputeCache(connectionSource.manager, fixture, write);
  fixture.status = 'READY';
  write(fixture);
  print(fixture);
}
async function cleanup(fixture) {
  assert.equal(process.env.OTOGROW_NATIVE_ACCESS_UI_SERVICES_STOPPED, '1');
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      for (const table of [
        'role',
        'objectPermission',
        'deliveryProject',
        'deliveryTask',
      ])
        assert.equal(
          (
            await manager.query(
              `SELECT id FROM core.${quote(table)} WHERE id=ANY($1::uuid[])`,
              [
                [
                  fixture.nativeRoleId,
                  fixture.permissionId,
                  fixture.projectId,
                  fixture.firstManagedId,
                  fixture.secondManagedId,
                ],
              ],
            )
          ).length,
          0,
        );
      return;
    }
    const observed = await validate(manager, fixture);
    fixture.cleanupAttempts.push({
      at: new Date().toISOString(),
      groups: copy(observed.groups),
      authenticationLifecycle: observed.tables.filter(
        isAuthenticationLifecycleTable,
      ),
    });
    fixture.status = 'CLEANUP_PREPARED';
    write(fixture);
    if (observed.present) {
      await manager.query(
        'UPDATE core."roleTarget" SET "roleId"=$2 WHERE id=$1',
        [fixture.targetOriginal.id, fixture.targetOriginal.roleId],
      );
      for (const name of [
        'deliveryTask',
        'task',
        'deliveryProject',
        'objectPermission',
        'role',
      ]) {
        const group = observed.groups.find((item) => item.name === name);
        const removed = await manager.query(
          `WITH removed AS (DELETE FROM ${quote(group.schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
          [group.rows.map((row) => row.id)],
        );
        exactIds(
          removed,
          group.rows.map((row) => row.id),
        );
      }
    }
    const after = await readTables(manager, fixture);
    for (const [index, table] of after.entries())
      assert.equal(
        table.hash,
        isAuthenticationLifecycleTable(table)
          ? observed.tables[index].hash
          : fixture.baseline.tables[index].hash,
        `Preserve ${table.name}.`,
      );
    fault('CLEANUP_PRECOMMIT');
  });
  fault('CLEANUP_AFTER_COMMIT');
  if (fixture.cacheOriginal) await restoreCache(fixture, write);
  if (fixture.baseline)
    await connectionSource.transaction(async (manager) => {
      await locked(manager, true);
      assert.equal((await validate(manager, fixture)).present, false);
    });
  fixture.status = 'CLEANED';
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    `Exact native task UI cleanup preserved original data/schema/authentication/roleTarget and cache bytes. Receipt: ${receipt}`,
  );
}
async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const mode = process.argv[2];
  assert.equal(process.argv.length, 3);
  assert(['create', 'inspect', 'allow', 'deny', 'cleanup'].includes(mode));
  await connectionSource.initialize();
  try {
    if (mode === 'create') return await create();
    const fixture = read();
    if (mode === 'cleanup') return await cleanup(fixture);
    if (mode === 'allow' || mode === 'deny')
      return await transition(fixture, mode === 'allow' ? 'ALLOWED' : 'DENIED');
    await connectionSource.transaction(async (manager) => {
      await locked(manager);
      await validate(manager, fixture);
    });
    print(fixture);
  } finally {
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

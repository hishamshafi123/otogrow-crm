const {
  createIsolatedNativeTaskAccess,
} = require('./helpers/isolated-native-task-access.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryService,
} = require('../dist/modules/delivery/delivery.service');
const {
  DeliveryMetaService,
} = require('../dist/modules/delivery/advertising/delivery-meta.service');
const {
  DeliveryReadinessService,
} = require('../dist/modules/delivery/readiness/delivery-readiness.service');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');

const NOW = new Date('2026-10-27T03:00:00.000Z');
const PRIVATE_BOT_TOKEN = 'enc:v2:readiness-rollback-sentinel';
const PRIVATE_REPORT_TOKEN = 'enc:v2:private-reporting-rollback-sentinel';
const PRIVATE_CHAT_ID = 'private-telegram-chat-id';
const PRIVATE_PROVIDER_ERROR = 'private-provider-response-with-credential';

(async () => {
  assert.equal(process.argv.length, 2, 'This script is rollback-only.');
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
    const [workspace] = await runner.query(
      `SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL AND "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(workspace, 'An initialized local workspace is required.');
    assert.match(workspace.databaseSchema, /^[a-zA-Z0-9_]+$/);
    const schema = `"${workspace.databaseSchema}"`;
    const admin = randomUUID();
    const employee = randomUUID();
    const connectionOwner = randomUUID();
    const people = new Map();
    for (const [memberId, name] of [
      [admin, 'Readiness admin'],
      [employee, 'Readiness employee'],
      [connectionOwner, 'Readiness account owner'],
    ]) {
      const userId = randomUUID();
      people.set(memberId, userId);
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        userId,
        `${userId}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [memberId, userId, workspace.id],
      );
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName") VALUES ($1,$2,$3,$4)`,
        [memberId, userId, `${userId}@example.invalid`, name],
      );
    }
    const nativeAdministrators = new Set([admin, connectionOwner]);
    const source = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...arguments_) => runner.query(...arguments_),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const access = new OtogrowAccessService(source, {
      userHasWorkspaceSettingPermission: async ({
        workspaceId,
        userWorkspaceId,
      }) =>
        workspaceId === workspace.id &&
        nativeAdministrators.has(userWorkspaceId),
    });
    const delivery = new DeliveryService(
      source,
      access,
      createIsolatedNativeTaskAccess(),
    );
    const project = (
      await delivery.command(workspace, admin, admin, {
        action: 'project',
        name: `Readiness rollback fixture ${randomUUID()}`,
        companyId: null,
        memberIds: [employee],
      })
    ).projects.find((item) => item.memberIds.includes(employee));
    assert(project);

    let providerCalls = 0;
    const forbiddenExternalAction = async () => {
      providerCalls += 1;
      assert.fail(
        'Readiness must never call a provider or decrypt credentials.',
      );
    };
    const meta = new DeliveryMetaService(
      source,
      delivery,
      {
        encryptVersioned: forbiddenExternalAction,
        decryptVersionedOrThrow: forbiddenExternalAction,
      },
      { account: forbiddenExternalAction, insights: forbiddenExternalAction },
    );
    const readiness = new DeliveryReadinessService(
      source,
      delivery,
      meta,
      access,
    );
    const repository = runner.manager.getRepository(DeliveryOperationsEntity);
    const record =
      (await repository.findOneBy({ workspaceId: workspace.id })) ??
      repository.create({ workspaceId: workspace.id });
    const state = newDeliveryOperations();
    state.telegramEnabled = true;
    state.enabled = false;
    state.connections[employee] = {
      chatId: PRIVATE_CHAT_ID,
      linkedAt: NOW.toISOString(),
    };
    const connection = (accountId, fields = {}) => ({
      accountId,
      name: `Readiness fixture ${accountId}`,
      revision: 1,
      projectId: project.id,
      managerId: admin,
      marketerId: employee,
      enabled: true,
      time: '06:00',
      timezone: 'Asia/Qatar',
      currency: 'USD',
      ownerId: admin,
      userWorkspaceId: admin,
      ciphertext: PRIVATE_REPORT_TOKEN,
      lastSuccessAt: '2026-10-27T02:58:00.000Z',
      lastDate: '2026-10-26',
      error: null,
      retryAt: null,
      lease: null,
      ...fields,
    });
    state.metaReporting = {
      connections: [
        connection('123456789'),
        connection('123456790', { enabled: false }),
        connection('123456791', { error: PRIVATE_PROVIDER_ERROR }),
        connection('123456792', {
          ownerId: connectionOwner,
          userWorkspaceId: connectionOwner,
        }),
        connection('123456793', { projectId: randomUUID() }),
        connection('123456794', { lastSuccessAt: null }),
      ],
      reports: [],
      workerSeenAt: '2026-10-27T02:59:30.000Z',
    };
    const saveState = async () => {
      record.state = structuredClone(state);
      await repository.save(record);
    };
    await saveState();
    await runner.query(
      `INSERT INTO core."telegramConfig" ("workspaceId","botToken","botUsername","isActive")
       VALUES ($1,$2,'readiness_fixture_bot',true)
       ON CONFLICT ("workspaceId") DO UPDATE SET "botToken"=$2,"botUsername"='readiness_fixture_bot',"isActive"=true,"deletedAt"=NULL`,
      [workspace.id, PRIVATE_BOT_TOKEN],
    );
    await runner.query(
      'INSERT INTO core."deliveryReminderOutbox" ("workspaceId","noticeId",status,"finishedAt") VALUES ($1,$2,\'SENT\',$3)',
      [workspace.id, randomUUID(), NOW],
    );

    let observingRead = false;
    let readWriteAttempts = 0;
    const query = runner.query.bind(runner);
    runner.query = async (sql, ...arguments_) => {
      if (
        observingRead &&
        /^\s*(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(
          sql,
        )
      ) {
        readWriteAttempts += 1;
        assert.fail('Readiness issued a write query.');
      }
      return query(sql, ...arguments_);
    };
    const checkedSnapshot = async (
      memberId = admin,
      userWorkspaceId = memberId,
      targetWorkspace = workspace,
    ) => {
      observingRead = true;
      try {
        return await readiness.snapshot(
          targetWorkspace,
          memberId,
          userWorkspaceId,
          NOW,
        );
      } finally {
        observingRead = false;
      }
    };
    const storedEvidence = async () => ({
      operations: await repository.findOneByOrFail({
        workspaceId: workspace.id,
      }),
      activity: await runner.query(
        'SELECT id,"occurredAt",action FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 ORDER BY id',
        [workspace.id],
      ),
    });
    const beforeRead = await storedEvidence();
    const observed = await checkedSnapshot();
    assert.equal(observed.workspaceId, workspace.id);
    assert.equal(observed.memberId, admin);
    assert.equal(observed.userWorkspaceId, admin);
    assert.equal(observed.observedAt, NOW.toISOString());
    const byId = (snapshot, id) => {
      const item = snapshot.items.find((candidate) => candidate.id === id);
      assert(item, `Missing readiness item ${id}`);
      return item;
    };
    assert.equal(byId(observed, 'META:123456789').status, 'CONNECTED');
    assert.equal(byId(observed, 'META:123456790').status, 'PAUSED');
    assert.equal(byId(observed, 'META:123456791').reason, 'META_IMPORT_ERROR');
    assert.equal(byId(observed, 'META:123456792').status, 'CONNECTED');
    assert.equal(byId(observed, 'META:123456793').reason, 'META_MAPPING');
    assert.equal(byId(observed, 'META:123456794').reason, 'META_UNVERIFIED');
    assert.equal(byId(observed, 'TELEGRAM_CHAT').status, 'AVAILABLE');
    assert.equal(byId(observed, 'TELEGRAM_DELIVERY').status, 'PAUSED');
    assert.equal(
      byId(observed, 'TELEGRAM_DELIVERY').reason,
      'DELIVERY_REMINDERS_PAUSED',
    );
    for (const id of ['TELEGRAM_CHAT', 'TELEGRAM_DELIVERY'])
      assert.equal(
        byId(observed, id).lastSuccessAt,
        null,
        'A shared past outbox success must not imply either reminder type was verified.',
      );
    const serialized = JSON.stringify(observed);
    for (const privateValue of [
      PRIVATE_BOT_TOKEN,
      PRIVATE_REPORT_TOKEN,
      PRIVATE_CHAT_ID,
      PRIVATE_PROVIDER_ERROR,
      'ciphertext',
      'botToken',
    ])
      assert(!serialized.includes(privateValue));
    await checkedSnapshot();
    assert.deepEqual(await storedEvidence(), beforeRead);
    await assert.rejects(checkedSnapshot(employee), { status: 403 });
    await assert.rejects(checkedSnapshot(admin, employee), { status: 403 });
    await assert.rejects(
      checkedSnapshot(admin, admin, { ...workspace, id: randomUUID() }),
      { status: 403 },
    );
    nativeAdministrators.delete(admin);
    await assert.rejects(checkedSnapshot(), { status: 403 });
    nativeAdministrators.add(admin);

    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [connectionOwner],
    );
    assert.equal(
      byId(await checkedSnapshot(), 'META:123456792').reason,
      'META_OWNER',
    );
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
      [connectionOwner],
    );
    nativeAdministrators.delete(connectionOwner);
    assert.equal(
      byId(await checkedSnapshot(), 'META:123456792').reason,
      'META_OWNER',
    );
    nativeAdministrators.add(connectionOwner);

    state.enabled = true;
    await saveState();
    const bothEnabled = await checkedSnapshot();
    assert.equal(byId(bothEnabled, 'TELEGRAM_CHAT').status, 'AVAILABLE');
    assert.equal(byId(bothEnabled, 'TELEGRAM_DELIVERY').status, 'AVAILABLE');
    state.telegramEnabled = false;
    await saveState();
    const telegramDisabled = await checkedSnapshot();
    assert.equal(byId(telegramDisabled, 'TELEGRAM_CHAT').status, 'PAUSED');
    assert.equal(byId(telegramDisabled, 'TELEGRAM_DELIVERY').status, 'PAUSED');
    state.telegramEnabled = true;
    await saveState();
    for (const [disable, restore] of [
      [
        [
          `UPDATE ${schema}."workspaceMember" SET "deletedAt"=now() WHERE id=$1`,
          employee,
        ],
        [
          `UPDATE ${schema}."workspaceMember" SET "deletedAt"=NULL WHERE id=$1`,
          employee,
        ],
      ],
      [
        [
          'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
          employee,
        ],
        [
          'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
          employee,
        ],
      ],
      [
        [
          'UPDATE core."user" SET disabled=true WHERE id=$1',
          people.get(employee),
        ],
        [
          'UPDATE core."user" SET disabled=false WHERE id=$1',
          people.get(employee),
        ],
      ],
      [
        [
          'UPDATE core."user" SET "deletedAt"=now() WHERE id=$1',
          people.get(employee),
        ],
        [
          'UPDATE core."user" SET "deletedAt"=NULL WHERE id=$1',
          people.get(employee),
        ],
      ],
    ]) {
      await runner.query(disable[0], [disable[1]]);
      const removedRecipient = await checkedSnapshot();
      assert.equal(
        byId(removedRecipient, 'TELEGRAM_CHAT').reason,
        'TELEGRAM_RECIPIENTS',
      );
      assert.equal(
        byId(removedRecipient, 'TELEGRAM_DELIVERY').reason,
        'TELEGRAM_RECIPIENTS',
      );
      await runner.query(restore[0], [restore[1]]);
    }
    state.connections = {
      'not-a-member-id': {
        chatId: PRIVATE_CHAT_ID,
        linkedAt: NOW.toISOString(),
      },
    };
    await saveState();
    assert.equal(
      byId(await checkedSnapshot(), 'TELEGRAM_CHAT').reason,
      'TELEGRAM_RECIPIENTS',
    );
    await runner.query(
      'UPDATE core."telegramConfig" SET "isActive"=false WHERE "workspaceId"=$1',
      [workspace.id],
    );
    const unavailableBot = await checkedSnapshot();
    assert.equal(byId(unavailableBot, 'TELEGRAM_CHAT').reason, 'TELEGRAM_BOT');
    assert.equal(
      byId(unavailableBot, 'TELEGRAM_DELIVERY').reason,
      'TELEGRAM_BOT',
    );

    state.metaReporting.connections = [];
    await saveState();
    assert.equal(byId(await checkedSnapshot(), 'META').reason, 'META_SETUP');
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [admin],
    );
    await assert.rejects(checkedSnapshot(), { status: 403 });
    assert.equal(providerCalls, 0);
    assert.equal(readWriteAttempts, 0);
    console.log(
      'PASS: readiness admin/identity/workspace/revocation isolation, read-only state/activity, mixed Meta account states, inactive/revoked connection owner, safe reason codes without credentials, independent Telegram chat/delivery switches, disabled/deleted recipients and missing setup. Rolled back; no provider calls or bot sends.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryChatService,
} = require('../dist/modules/delivery/chat/delivery-chat.service');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const workspaceId = randomUUID(),
  schema = `chat_race_${workspaceId.replaceAll('-', '_')}`;
const members = [0, 1].map(() => ({ id: randomUUID(), user: randomUUID() }));
async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const sources = [0, 1].map(
    () =>
      new DataSource({
        ...connectionSource.options,
        logging: false,
        poolSize: 2,
      }),
  );
  let created = false;
  try {
    await Promise.all(sources.map((source) => source.initialize()));
    await sources[0].transaction(async (manager) => {
      const [existing] = await manager.query(
        'SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"=\'ACTIVE\' LIMIT 1',
      );
      await manager.query(`CREATE SCHEMA "${schema}"`);
      await manager.query(
        `CREATE TABLE "${schema}"."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
      );
      await manager.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,'Chat concurrency fixture',$2,$3,'ACTIVE',$4,$5)`,
        [
          workspaceId,
          schema.replaceAll('_', '-'),
          schema,
          existing.workspaceCustomApplicationId,
          existing.defaultRoleId,
        ],
      );
      for (const member of members) {
        await manager.query(
          'INSERT INTO core."user" (id,email) VALUES ($1,$2)',
          [member.user, `${member.user}+chat-race@example.invalid`],
        );
        await manager.query(
          'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
          [member.id, member.user, workspaceId],
        );
        await manager.query(
          `INSERT INTO "${schema}"."workspaceMember" (id,"userId","nameFirstName") VALUES ($1,$2,'Chat race fixture')`,
          [member.id, member.user],
        );
      }
      const state = newDeliveryOperations();
      state.telegramEnabled = true;
      state.connections[members[1].id] = {
        chatId: 'fixture',
        linkedAt: new Date().toISOString(),
      };
      await manager.query(
        'INSERT INTO core."deliveryOperations" ("workspaceId",state) VALUES ($1,$2)',
        [workspaceId, state],
      );
    });
    created = true;
    const factory = (source) =>
      new DeliveryChatService(
        source,
        new OtogrowAccessService(source, {
          userHasWorkspaceSettingPermission: async () => false,
        }),
        {
          findByWorkspaceId: async () => ({ isActive: true }),
          decryptBotToken: () => 'not-a-real-token',
        },
        { get: () => 'http://localhost:3001' },
      );
    const chats = sources.map(factory),
      sender = members[0].id,
      recipient = members[1].id;
    const now = new Date();
    const due = new Date(now.getTime() + 300000);
    const request = {
      recipientId: recipient,
      requestId: randomUUID(),
      text: 'Concurrent send fixture',
    };
    const ids = await Promise.all(
      chats.map((chat) => chat.send(workspaceId, sender, sender, request, now)),
    );
    assert.equal(ids[0], ids[1]);
    await chats[0].queueDue(due);
    const outbox = async (id) =>
      (
        await sources[0].query(
          'SELECT * FROM core."deliveryReminderOutbox" WHERE "workspaceId"=$1 AND "noticeId"=$2',
          [workspaceId, id],
        )
      )[0];
    const entry = await outbox(ids[0]);
    const locked = deferred(),
      release = deferred();
    const reading = sources[0].transaction(async (manager) => {
      const scoped = {
        manager,
        getRepository: (entity) => manager.getRepository(entity),
        query: (...args) => manager.query(...args),
        transaction: (callback) => manager.transaction(callback),
      };
      await factory(scoped).view(
        workspaceId,
        recipient,
        recipient,
        { messageIds: [ids[0]] },
        due,
      );
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const claiming = chats[1].claimReminder(entry.id, due);
    release.resolve();
    await reading;
    assert.equal(await claiming, null);
    assert.equal((await outbox(ids[0])).status, 'SUPPRESSED');
    const next = await chats[0].send(
      workspaceId,
      sender,
      sender,
      { ...request, requestId: randomUUID(), text: 'Concurrent claim fixture' },
      now,
    );
    await chats[0].queueDue(due);
    const nextEntry = await outbox(next);
    const claims = await Promise.all(
      chats.map((chat) => chat.claimReminder(nextEntry.id, due)),
    );
    assert.equal(claims.filter(Boolean).length, 1);
    await chats[0].view(
      workspaceId,
      recipient,
      recipient,
      { messageIds: [next] },
      due,
    );
    await chats[1].finishReminder(nextEntry.id, 'SENT', null, due);
    assert.equal((await outbox(next)).status, 'SENT');
    assert.equal(await chats[0].claimReminder(nextEntry.id, due), null);
    console.log(
      'PASS: concurrent send retry creates one message; committed viewed state suppresses a waiting claim; simultaneous workers claim once; viewing after claim cannot requeue a ping. No Telegram calls.',
    );
  } finally {
    if (created)
      await sources[0].transaction(async (manager) => {
        const rows = await manager.query(
          'SELECT "databaseSchema","displayName" FROM core.workspace WHERE id=$1',
          [workspaceId],
        );
        assert.equal(rows[0].databaseSchema, schema);
        assert.equal(rows[0].displayName, 'Chat concurrency fixture');
        await manager.query('DELETE FROM core.workspace WHERE id=$1', [
          workspaceId,
        ]);
        await manager.query(`DROP SCHEMA "${schema}" CASCADE`);
        for (const member of members)
          await manager.query(
            'DELETE FROM core."user" WHERE id=$1 AND email=$2',
            [member.user, `${member.user}+chat-race@example.invalid`],
          );
      });
    await Promise.all(
      sources
        .filter((source) => source.isInitialized)
        .map((source) => source.destroy()),
    );
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

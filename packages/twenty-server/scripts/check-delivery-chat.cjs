const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const axios = require('axios');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDeliveryTeamChatFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792969805124-add-delivery-team-chat');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryChatService,
} = require('../dist/modules/delivery/chat/delivery-chat.service');
const {
  DeliveryReminderService,
} = require('../dist/modules/delivery/operations/delivery-reminder.service');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');
async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  const originalPost = axios.post;
  try {
    await runner.connect();
    await runner.startTransaction();
    const migration = new AddDeliveryTeamChatFastInstanceCommand();
    const [{ name: existingTable }] = await runner.query(
      'SELECT to_regclass($1) AS name',
      ['core."deliveryChatMessage"'],
    );
    if (!existingTable) {
      await migration.up(runner);
      await migration.down(runner);
      await migration.up(runner);
    }
    const [existing] = await runner.query(
      'SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"=\'ACTIVE\' LIMIT 1',
    );
    const workspaceId = randomUUID(),
      schema = `chat_fixture_${workspaceId.replaceAll('-', '_')}`;
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(
      `CREATE TABLE "${schema}"."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
    );
    await runner.query(
      `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,'Chat regression',$2,$3,'ACTIVE',$4,$5)`,
      [
        workspaceId,
        schema.replaceAll('_', '-'),
        schema,
        existing.workspaceCustomApplicationId,
        existing.defaultRoleId,
      ],
    );
    const members = [];
    for (const name of ['Sender', 'Recipient', 'Outside participant']) {
      const id = randomUUID(),
        user = randomUUID();
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        user,
        `${user}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [id, user, workspaceId],
      );
      await runner.query(
        `INSERT INTO "${schema}"."workspaceMember" (id,"userId","nameFirstName") VALUES ($1,$2,$3)`,
        [id, user, name],
      );
      members.push(id);
    }
    const [sender, recipient, outsider] = members;
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const access = new OtogrowAccessService(scoped, {
      userHasWorkspaceSettingPermission: async () => false,
    });
    let botActive = true;
    const chat = new DeliveryChatService(
      scoped,
      access,
      {
        findByWorkspaceId: async () => ({ isActive: botActive }),
        decryptBotToken: () => 'fixture-not-a-real-token',
      },
      { get: () => 'http://localhost:3001' },
    );
    const state = newDeliveryOperations();
    state.telegramEnabled = true;
    state.connections[recipient] = {
      chatId: '123',
      linkedAt: new Date().toISOString(),
    };
    await runner.query(
      'INSERT INTO core."deliveryOperations" ("workspaceId",state) VALUES ($1,$2)',
      [workspaceId, state],
    );
    const now = new Date('2026-10-26T01:00:00Z'),
      due = new Date(now.getTime() + 300000);
    const send = (text, time = now) =>
      chat.send(
        workspaceId,
        sender,
        sender,
        { recipientId: recipient, requestId: randomUUID(), text },
        time,
      );
    const snap = (actor, peerId = sender, before) =>
      chat.snapshot(workspaceId, actor, actor, { peerId, before });
    const outbox = async (id) =>
      (
        await runner.query(
          'SELECT * FROM core."deliveryReminderOutbox" WHERE "noticeId"=$1',
          [id],
        )
      )[0];
    const request = {
      recipientId: recipient,
      requestId: randomUUID(),
      text: 'Private message must never enter Telegram or audit',
    };
    const id = await chat.send(workspaceId, sender, sender, request, now);
    assert.equal(
      await chat.send(workspaceId, sender, sender, request, now),
      id,
    );
    await assert.rejects(
      chat.send(
        workspaceId,
        sender,
        sender,
        { ...request, text: 'Changed' },
        now,
      ),
    );
    await assert.rejects(
      chat.send(
        workspaceId,
        sender,
        sender,
        { ...request, recipientId: outsider },
        now,
      ),
    );
    assert.equal((await snap(outsider, sender)).messages.length, 0);
    await assert.rejects(
      chat.view(workspaceId, outsider, outsider, { messageIds: [id] }, now),
    );
    await assert.rejects(
      chat.view(workspaceId, sender, sender, { messageIds: [id] }, now),
    );
    await assert.rejects(chat.snapshot(workspaceId, recipient, outsider, {}));
    assert.equal((await snap(recipient)).messages[0].viewedAt, null);
    assert.equal((await snap(recipient)).peer.unread, 1);
    await chat.queueDue(new Date(due.getTime() - 1));
    assert.equal(await outbox(id), undefined);
    await chat.queueDue(due);
    assert(await outbox(id));
    await chat.queueDue(due);
    assert.equal(
      (
        await runner.query(
          'SELECT count(*)::int AS count FROM core."deliveryReminderOutbox" WHERE "noticeId"=$1',
          [id],
        )
      )[0].count,
      1,
    );
    await chat.view(
      workspaceId,
      recipient,
      recipient,
      { messageIds: [id] },
      due,
    );
    assert.equal(await chat.claimReminder((await outbox(id)).id, due), null);
    assert.equal((await outbox(id)).status, 'SUPPRESSED');
    const second = await send('Second private message');
    await chat.queueDue(due);
    let sends = 0,
      uncertain = false;
    axios.post = async (url, payload) => {
      sends++;
      assert(!payload.text.includes('private message'));
      assert(payload.text.includes('view=chat'));
      assert(payload.text.includes(sender));
      if (uncertain) throw new Error('Simulated timeout');
      return { data: { ok: true } };
    };
    const legacy = {
      claimReminder: async () => {
        throw new Error('Wrong reminder owner');
      },
      enqueueReminder: async () => {},
      finishReminder: async () => {
        throw new Error('Wrong finish owner');
      },
    };
    const reminders = new DeliveryReminderService(scoped, legacy, chat, {
      ownsReminder: async () => false,
      queueDue: async () => {},
    });
    await reminders.execute((await outbox(second)).id, due);
    await reminders.execute((await outbox(second)).id, due);
    assert.equal(sends, 1);
    assert.equal((await outbox(second)).status, 'SENT');
    const third = await send('Unknown outcome');
    await chat.queueDue(due);
    uncertain = true;
    await reminders.execute((await outbox(third)).id, due);
    await reminders.execute((await outbox(third)).id, due);
    assert.equal(sends, 2);
    assert.equal((await outbox(third)).status, 'UNCERTAIN');
    uncertain = false;
    const fourth = await send('Missing configuration');
    await chat.queueDue(due);
    botActive = false;
    await reminders.execute((await outbox(fourth)).id, due);
    assert.equal((await outbox(fourth)).status, 'UNCONFIGURED');
    assert.equal(sends, 2);
    botActive = true;
    const fifth = await send('Revoked recipient');
    await chat.queueDue(due);
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=now() WHERE id=$1',
      [recipient],
    );
    await reminders.execute((await outbox(fifth)).id, due);
    assert.equal((await outbox(fifth)).status, 'SUPPRESSED');
    await assert.rejects(snap(recipient));
    await assert.rejects(send('Inactive member'));
    await runner.query(
      'UPDATE core."userWorkspace" SET "deletedAt"=NULL WHERE id=$1',
      [recipient],
    );
    for (let index = 0; index < 50; index++)
      await send(
        `Paged history ${index}`,
        new Date(now.getTime() + 60000 + index * 1000),
      );
    const latest = await snap(recipient);
    assert.equal(latest.messages.length, 50);
    assert(latest.olderCursor);
    const older = await snap(recipient, sender, latest.olderCursor);
    assert.equal(older.messages.length, 5);
    assert.equal(older.olderCursor, null);
    assert(
      !latest.messages.some((message) =>
        older.messages.some((old) => old.id === message.id),
      ),
    );
    await chat.view(
      workspaceId,
      recipient,
      recipient,
      { messageIds: [latest.messages[49].id] },
      due,
    );
    assert.equal((await snap(recipient)).peer.unread, 53);
    const activities = await runner.query(
      'SELECT summary,changes FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    assert.equal(activities.length, 55);
    assert(!JSON.stringify(activities).includes('Private message must never'));
    await assert.rejects(migration.down(runner), /Restore team chat history/);
    console.log(
      'PASS: additive chat schema, participant-only history, identity checks, retry-safe sends, exact viewed messages, 50-message pages, five-minute threshold, one ping, seen/revoked suppression, missing configuration, uncertain sends and content-free audit. Rolled back; Telegram stubbed.',
    );
  } finally {
    axios.post = originalPost;
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

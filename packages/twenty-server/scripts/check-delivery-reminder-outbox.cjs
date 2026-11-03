const noChat = { ownsReminder: async () => false, queueDue: async () => {} };
// Commit only an isolated fixture so independent database sessions can verify lock release; remove it exactly in finally.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const axios = require('axios');
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
  DeliveryCreativeService,
} = require('../dist/modules/delivery/creative/delivery-creative.service');
const {
  DeliveryOperationsService,
} = require('../dist/modules/delivery/operations/delivery-operations.service');
const {
  DeliveryReminderService,
} = require('../dist/modules/delivery/operations/delivery-reminder.service');
const {
  DeliveryOperationsEntity,
} = require('../dist/modules/delivery/entities/delivery-operations.entity');
const {
  DeliveryReminderOutboxEntity,
} = require('../dist/modules/delivery/entities/delivery-reminder-outbox.entity');

const WORKSPACE_ID = randomUUID();
const SCHEMA = `reminder_fixture_${WORKSPACE_ID.replaceAll('-', '_')}`;
const SENTINEL = `otogrow-reminder-fixture:${WORKSPACE_ID}`;
const MEMBERS = ['Founder', 'Editor'].map((name) => ({
  name,
  memberId: randomUUID(),
  userId: randomUUID(),
  userWorkspaceId: randomUUID(),
}));
const [FOUNDER, EDITOR] = MEMBERS;
const emailFor = (member) => `${member.userId}+reminder@example.invalid`;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const bounded = async (promise, label) => {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(label)), 4000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert.match(SCHEMA, /^reminder_fixture_[a-f0-9_]{36}$/);
  const sources = [0, 1].map(
    (index) =>
      new DataSource({
        ...connectionSource.options,
        poolSize: 1,
        logging: false,
        extra: {
          ...connectionSource.options.extra,
          max: 1,
          application_name: `${SENTINEL}:${index}`,
        },
      }),
  );
  let committed = false;
  let complete = false;
  let queueUnavailable = false;
  let botActive = true;
  let sends = 0;
  let behavior = 'success';
  const queued = [];
  const entered = deferred();
  const release = deferred();
  const pending = [];
  const originalPost = axios.post;
  const queue = {
    add: async (_name, data) => {
      if (queueUnavailable) throw new Error('Fixture Redis outage');
      queued.push(data.outboxId);
    },
  };
  const scoped = sources.map((source) => ({
    manager: source.manager,
    query: (...args) => source.query(...args),
    getRepository: (entity) => {
      const repository = source.getRepository(entity);
      // Recovery is global in production; this fixture must never claim another workspace's job.
      return entity === DeliveryReminderOutboxEntity
        ? new Proxy(repository, {
            get: (target, property) =>
              property === 'find'
                ? (options) =>
                    target.find({
                      ...options,
                      where: { ...options.where, workspaceId: WORKSPACE_ID },
                    })
                : Reflect.get(target, property),
          })
        : repository;
    },
    transaction: (callback) =>
      source.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout='3s'");
        await manager.query("SET LOCAL statement_timeout='10s'");
        return callback(manager);
      }),
  }));
  const permissions = {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) =>
      workspaceId === WORKSPACE_ID &&
      userWorkspaceId === FOUNDER.userWorkspaceId,
  };
  const deliveries = scoped.map(
    (source) =>
      new DeliveryService(
        source,
        new OtogrowAccessService(source, permissions),
      ),
  );
  const operations = new DeliveryOperationsService(
    scoped[0],
    deliveries[0],
    new DeliveryCreativeService(scoped[0], deliveries[0], {}),
    {
      findByWorkspaceId: async () => ({
        isActive: botActive,
        botUsername: 'fixture_bot',
      }),
      decryptBotToken: () => 'fixture-token',
    },
    { get: () => 'http://localhost:3001' },
    queue,
  );
  const reminders = new DeliveryReminderService(scoped[0], operations, noChat, noChat);
  let workspace;
  const command = (member, input, now) =>
    operations.command(
      workspace,
      member.memberId,
      member.userWorkspaceId,
      input,
      now,
    );
  const state = async () =>
    (
      await sources[0]
        .getRepository(DeliveryOperationsEntity)
        .findOneByOrFail({ workspaceId: WORKSPACE_ID })
    ).state;
  const outbox = (noticeId) =>
    sources[0]
      .getRepository(DeliveryReminderOutboxEntity)
      .findOneByOrFail({ workspaceId: WORKSPACE_ID, noticeId });
  const taskCommand = (index, member, input) =>
    deliveries[index].command(
      workspace,
      member.memberId,
      member.userWorkspaceId,
      input,
    );
  try {
    await connectionSource.initialize();
    await Promise.all(sources.map((source) => source.initialize()));
    await connectionSource.transaction(async (manager) => {
      const [existing] = await manager.query(
        `SELECT "workspaceCustomApplicationId","defaultRoleId" FROM core.workspace WHERE "activationStatus"='ACTIVE' AND "deletedAt" IS NULL LIMIT 1`,
      );
      assert(existing);
      await manager.query(`CREATE SCHEMA "${SCHEMA}"`);
      await manager.query(`COMMENT ON SCHEMA "${SCHEMA}" IS '${SENTINEL}'`);
      await manager.query(
        `CREATE TABLE "${SCHEMA}"."workspaceMember" (id uuid PRIMARY KEY,"userId" uuid NOT NULL,"userEmail" text,"nameFirstName" text,"nameLastName" text,"deletedAt" timestamptz)`,
      );
      await manager.query(
        `CREATE TABLE "${SCHEMA}".company (id uuid PRIMARY KEY,name text,"deletedAt" timestamptz)`,
      );
      await manager.query(
        `CREATE TABLE "${SCHEMA}".task (id uuid PRIMARY KEY,title text,"assigneeId" uuid,"dueAt" timestamptz,status text,"deletedAt" timestamptz,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now())`,
      );
      [workspace] = await manager.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"databaseSchema","activationStatus","workspaceCustomApplicationId","defaultRoleId") VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6) RETURNING *`,
        [
          WORKSPACE_ID,
          SENTINEL,
          `reminder-${WORKSPACE_ID}`,
          SCHEMA,
          existing.workspaceCustomApplicationId,
          existing.defaultRoleId,
        ],
      );
      for (const member of MEMBERS) {
        await manager.query(
          'INSERT INTO core."user" (id,email) VALUES ($1,$2)',
          [member.userId, emailFor(member)],
        );
        await manager.query(
          'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
          [member.userWorkspaceId, member.userId, WORKSPACE_ID],
        );
        await manager.query(
          `INSERT INTO "${SCHEMA}"."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,$4,'fixture')`,
          [member.memberId, member.userId, emailFor(member), member.name],
        );
      }
    });
    committed = true;
    const [{ pid: workerPid }] = await sources[0].query(
      'SELECT pg_backend_pid() AS pid',
    );
    const [{ pid: editorPid }] = await sources[1].query(
      'SELECT pg_backend_pid() AS pid',
    );
    assert.notEqual(workerPid, editorPid);
    let snapshot = await taskCommand(0, FOUNDER, {
      action: 'project',
      name: 'Reminder fixture project',
      companyId: null,
      memberIds: [EDITOR.memberId],
    });
    const project = snapshot.projects.find(
      (item) => item.name === 'Reminder fixture project',
    );
    snapshot = await taskCommand(0, FOUNDER, {
      action: 'create',
      projectId: project.id,
      fields: {
        title: 'Reminder fixture task',
        brief: 'Private fixture brief',
        service: 'SEO',
        priority: 'NORMAL',
        scheduledDate: null,
        dueAt: null,
        assigneeId: EDITOR.memberId,
        reviewerId: FOUNDER.memberId,
        checklist: [],
        evidence: [],
      },
    });
    const task = snapshot.tasks.find((item) => item.projectId === project.id);
    await command(FOUNDER, {
      action: 'settings',
      enabled: true,
      telegramEnabled: true,
      timezone: 'UTC',
      founderId: FOUNDER.memberId,
    });
    const link = (await command(EDITOR, { action: 'linkTelegram' })).link;
    await operations.handleTelegramUpdate(WORKSPACE_ID, {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 424242 },
        text: `/start ${new URL(link).searchParams.get('start')}`,
      },
    });
    let clock = new Date();
    const schedule = async () => {
      clock = new Date(clock.getTime() + 600000);
      await command(
        FOUNDER,
        {
          action: 'message',
          taskId: task.id,
          recipientId: EDITOR.memberId,
          text: 'Private fixture reminder',
        },
        clock,
      );
      const notice = (await state()).notices.at(-1);
      const due = new Date(clock.getTime() + 300000);
      await operations.dispatchWorkspace(workspace, due);
      return { notice, entry: await outbox(notice.id), due };
    };
    axios.post = async (url, body) => {
      assert.equal(
        url,
        'https://api.telegram.org/botfixture-token/sendMessage',
      );
      assert.equal(body.chat_id, '424242');
      assert(!body.text.includes('Private fixture'));
      const [{ transactionStart }] = await connectionSource.query(
        'SELECT xact_start AS "transactionStart" FROM pg_stat_activity WHERE pid=$1',
        [workerPid],
      );
      assert.equal(
        transactionStart,
        null,
        'Telegram HTTP must run with no active worker database transaction',
      );
      sends++;
      if (behavior === 'hold') {
        entered.resolve();
        await release.promise;
      }
      if (behavior === 'timeout')
        throw new Error('Fixture ambiguous network timeout');
      return { data: { ok: behavior !== 'reject' } };
    };
    queueUnavailable = true;
    const first = await schedule();
    assert.equal(first.entry.status, 'QUEUED');
    assert.equal(sends, 0);
    assert.equal(queued.length, 0);
    queueUnavailable = false;
    await new DeliveryReminderService(scoped[0], operations, noChat, noChat).recover(
      first.due,
    );
    assert(
      queued.includes(first.entry.id),
      'A new process must recover enqueue after Redis outage',
    );
    await operations.dispatchWorkspace(workspace, first.due);
    assert.equal(
      await sources[0]
        .getRepository(DeliveryReminderOutboxEntity)
        .countBy({ workspaceId: WORKSPACE_ID, noticeId: first.notice.id }),
      1,
    );
    behavior = 'hold';
    const sending = reminders.execute(first.entry.id, first.due);
    pending.push(sending.catch(() => undefined));
    await bounded(entered.promise, 'Mock HTTP did not start');
    await bounded(
      taskCommand(1, FOUNDER, {
        action: 'comment',
        taskId: task.id,
        revision: task.revision,
        text: 'Edit succeeds while Telegram is slow',
      }),
      'A slow Telegram request blocked an independent delivery edit',
    );
    await reminders.execute(first.entry.id, first.due);
    assert.equal(sends, 1, 'Duplicate workers must not repeat a claimed send');
    release.resolve();
    await sending;
    behavior = 'success';
    assert.equal((await outbox(first.notice.id)).status, 'SENT');

    const seen = await schedule();
    await command(
      EDITOR,
      { action: 'noticeSeen', id: seen.notice.id },
      seen.due,
    );
    const beforeSeen = sends;
    await reminders.execute(seen.entry.id, seen.due);
    assert.equal((await outbox(seen.notice.id)).status, 'SUPPRESSED');
    assert.equal(sends, beforeSeen);
    const acknowledged = await schedule();
    await command(
      EDITOR,
      { action: 'acknowledge', id: acknowledged.notice.id },
      acknowledged.due,
    );
    await reminders.execute(acknowledged.entry.id, acknowledged.due);
    assert.equal((await outbox(acknowledged.notice.id)).status, 'SUPPRESSED');
    assert.equal(sends, beforeSeen);
    const revoked = await schedule();
    await taskCommand(1, FOUNDER, {
      action: 'project',
      id: project.id,
      revision: project.revision,
      name: project.name,
      companyId: null,
      memberIds: [],
    });
    await reminders.execute(revoked.entry.id, revoked.due);
    assert.equal((await outbox(revoked.notice.id)).status, 'SUPPRESSED');
    assert.equal(sends, beforeSeen);
    await taskCommand(1, FOUNDER, {
      action: 'project',
      id: project.id,
      revision: project.revision + 1,
      name: project.name,
      companyId: null,
      memberIds: [EDITOR.memberId],
    });

    for (const failure of ['reject', 'timeout']) {
      const current = await schedule();
      behavior = failure;
      await reminders.execute(current.entry.id, current.due);
      assert.equal(
        (await outbox(current.notice.id)).status,
        failure === 'reject' ? 'FAILED' : 'UNCERTAIN',
      );
      const previous = sends;
      await reminders.execute(current.entry.id, current.due);
      await reminders.recover(current.due);
      assert.equal(
        sends,
        previous,
        'Terminal failure/uncertainty must never automatically resend',
      );
    }
    behavior = 'success';
    const crashed = await schedule();
    assert(await operations.claimReminder(crashed.entry.id, crashed.due));
    const beforeCrash = sends;
    await reminders.recover(new Date(crashed.due.getTime() + 180000));
    assert.equal((await outbox(crashed.notice.id)).status, 'UNCERTAIN');
    await reminders.execute(crashed.entry.id, crashed.due);
    assert.equal(sends, beforeCrash);

    const lostReceipt = await schedule();
    const receiptFailure = new DeliveryReminderService(
      scoped[0],
      {
        claimReminder: (...args) => operations.claimReminder(...args),
        finishReminder: async () => {
          throw new Error('Fixture database receipt failure');
        },
      },
      noChat,
      noChat,
    );
    await assert.rejects(
      receiptFailure.execute(lostReceipt.entry.id, lostReceipt.due),
      /receipt failure/,
    );
    const afterLostReceipt = sends;
    assert.equal((await outbox(lostReceipt.notice.id)).status, 'SENDING');
    await reminders.execute(lostReceipt.entry.id, lostReceipt.due);
    await reminders.recover(new Date(lostReceipt.due.getTime() + 180000));
    assert.equal((await outbox(lostReceipt.notice.id)).status, 'UNCERTAIN');
    assert.equal(sends, afterLostReceipt);
    const unavailable = await schedule();
    botActive = false;
    await reminders.execute(unavailable.entry.id, unavailable.due);
    assert.equal((await outbox(unavailable.notice.id)).status, 'UNCONFIGURED');
    assert.equal(sends, afterLostReceipt);
    botActive = true;
    const actualQueued = await schedule();
    const { Queue, Worker, QueueEvents } = require('bullmq');
    const Redis = require('ioredis');
    const {
      DeliveryReminderJob,
    } = require('../dist/modules/delivery/operations/delivery-reminder.job');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    assert(['localhost', '127.0.0.1'].includes(new URL(redisUrl).hostname));
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const queueName = `reminder-fixture-${randomUUID()}`;
    const actualQueue = new Queue(queueName, { connection: redis });
    const events = new QueueEvents(queueName, { connection: redis });
    const handler = new DeliveryReminderJob(reminders);
    const worker = new Worker(queueName, (job) => handler.handle(job.data), {
      connection: redis,
    });
    try {
      await events.waitUntilReady();
      await worker.waitUntilReady();
      const job = await actualQueue.add('delivery-telegram-reminder', {
        outboxId: actualQueued.entry.id,
      });
      await job.waitUntilFinished(events, 15000);
      assert.equal((await outbox(actualQueued.notice.id)).status, 'SENT');
    } finally {
      await worker.close();
      await events.close();
      await actualQueue.obliterate({ force: true });
      await actualQueue.close();
      await redis.quit();
    }
    const stored = JSON.stringify(
      await sources[0]
        .getRepository(DeliveryReminderOutboxEntity)
        .findBy({ workspaceId: WORKSPACE_ID }),
    );
    for (const secret of [
      'fixture-token',
      '424242',
      'Private fixture reminder',
    ])
      assert(!stored.includes(secret));
    complete = true;
  } finally {
    release.resolve();
    await Promise.all(pending);
    axios.post = originalPost;
    try {
      if (committed) {
        await connectionSource.transaction(async (manager) => {
          const [saved] = await manager.query(
            'SELECT "displayName","databaseSchema" FROM core.workspace WHERE id=$1 FOR UPDATE',
            [WORKSPACE_ID],
          );
          const [schema] = await manager.query(
            "SELECT obj_description(oid,'pg_namespace') AS sentinel FROM pg_namespace WHERE nspname=$1",
            [SCHEMA],
          );
          assert.equal(saved?.displayName, SENTINEL);
          assert.equal(saved?.databaseSchema, SCHEMA);
          assert.equal(schema?.sentinel, SENTINEL);
          for (const member of MEMBERS) {
            const [user] = await manager.query(
              'SELECT email FROM core."user" WHERE id=$1',
              [member.userId],
            );
            assert.equal(user?.email, emailFor(member));
            const [{ outside }] = await manager.query(
              'SELECT count(*)::int AS outside FROM core."userWorkspace" WHERE "userId"=$1 AND "workspaceId"<>$2',
              [member.userId, WORKSPACE_ID],
            );
            assert.equal(outside, 0);
          }
          await manager.query(
            'DELETE FROM core."otogrowRoleAssignment" WHERE "workspaceId"=$1',
            [WORKSPACE_ID],
          );
          await manager.query(
            'DELETE FROM core."userWorkspace" WHERE "workspaceId"=$1',
            [WORKSPACE_ID],
          );
          await manager.query(
            'DELETE FROM core.workspace WHERE id=$1 AND "displayName"=$2 AND "databaseSchema"=$3',
            [WORKSPACE_ID, SENTINEL, SCHEMA],
          );
          for (const member of MEMBERS)
            await manager.query(
              'DELETE FROM core."user" WHERE id=$1 AND email=$2',
              [member.userId, emailFor(member)],
            );
          await manager.query(`DROP SCHEMA "${SCHEMA}" CASCADE`);
        });
        assert.equal(
          (
            await connectionSource.query(
              'SELECT id FROM core.workspace WHERE id=$1',
              [WORKSPACE_ID],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await connectionSource.query(
              'SELECT id FROM core."deliveryReminderOutbox" WHERE "workspaceId"=$1',
              [WORKSPACE_ID],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await connectionSource.query(
              'SELECT nspname FROM pg_namespace WHERE nspname=$1',
              [SCHEMA],
            )
          ).length,
          0,
        );
      }
    } finally {
      await Promise.all(
        sources
          .filter((source) => source.isInitialized)
          .map((source) => source.destroy()),
      );
      if (connectionSource.isInitialized) await connectionSource.destroy();
    }
  }
  assert(complete);
  console.log(
    'PASS: actual HTTP outside all DB transactions, concurrent delivery edit, unique durable jobs, queue outage/restart, duplicate workers, seen/revoked scope, rejection/timeout/interruption/lost receipt without resend, real Redis worker routing and private payload exclusion. Disposable committed workspace and schema removed exactly; no Telegram network calls.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

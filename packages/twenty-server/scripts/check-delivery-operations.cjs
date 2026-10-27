const noChat = { ownsReminder: async () => false, queueDue: async () => {} };
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { randomUUID } = require('node:crypto');
const axios = require('axios');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
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
  DeliveryTaskEntity,
} = require('../dist/modules/delivery/entities/delivery-task.entity');
const {
  OtogrowActivityEventEntity,
} = require('../dist/modules/otogrow-activity/entities/otogrow-activity-event.entity');
(async () => {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const originalPost = axios.post;
  const OriginalDate = Date;
  // Task assignment timestamps and scheduler assertions must use the same fixture clock.
  global.Date = class extends OriginalDate {
    constructor(...values) {
      super(...(values.length ? values : ['2026-10-24T10:00:00Z']));
    }
    static now() {
      return OriginalDate.parse('2026-10-24T10:00:00Z');
    }
  };
  try {
    const [workspace] = await runner.query(
      process.argv.includes('--browser-fixture')
        ? `SELECT w.* FROM core.workspace w JOIN core."userWorkspace" uw ON uw."workspaceId"=w.id JOIN core."user" u ON u.id=uw."userId" WHERE u.email='tim@apple.dev' LIMIT 1`
        : `SELECT * FROM core.workspace WHERE "databaseSchema" IS NOT NULL AND "activationStatus"='ACTIVE' LIMIT 1`,
    );
    assert(/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema));
    const schema = `"${workspace.databaseSchema}"`;
    const admin = randomUUID(),
      editor = randomUUID(),
      outsider = randomUUID();
    for (const member of [admin, editor, outsider]) {
      const user = randomUUID();
      await runner.query('INSERT INTO core."user" (id,email) VALUES ($1,$2)', [
        user,
        `${user}@example.invalid`,
      ]);
      await runner.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES ($1,$2,$3)',
        [member, user, workspace.id],
      );
      await runner.query(
        `INSERT INTO ${schema}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES ($1,$2,$3,'Operations','fixture')`,
        [member, user, `${user}@example.invalid`],
      );
    }
    const scoped = {
      manager: runner.manager,
      getRepository: (entity) => runner.manager.getRepository(entity),
      query: (...args) => runner.query(...args),
      transaction: (callback) => runner.manager.transaction(callback),
    };
    const access = new OtogrowAccessService(scoped, {
      userHasWorkspaceSettingPermission: async ({ userWorkspaceId }) =>
        userWorkspaceId === admin,
    });
    const delivery = new DeliveryService(scoped, access);
    const creative = new DeliveryCreativeService(scoped, delivery, {});
    const queuedReminders = [];
    const operations = new DeliveryOperationsService(
      scoped,
      delivery,
      creative,
      {
        findByWorkspaceId: async () => ({
          isActive: true,
          botUsername: 'fixture_bot',
        }),
        decryptBotToken: () => 'fixture-token',
      },
      { get: () => 'http://localhost:3001' },
      {
        add: async (_name, data) => {
          queuedReminders.push(data.outboxId);
        },
      },
    );
    const reminders = new DeliveryReminderService(scoped, operations, noChat);
    const dispatchAndDrain = async (targetWorkspace, time) => {
      await operations.dispatchWorkspace(targetWorkspace, time);
      while (queuedReminders.length)
        await reminders.execute(queuedReminders.shift(), time);
    };
    let sent = 0;
    let fail = false;
    axios.post = async () => {
      assert.equal(
        runner.transactionDepth,
        1,
        'HTTP must run after the nested claim transaction commits',
      );
      sent++;
      if (fail) throw new Error('ambiguous transport failure');
      return { data: { ok: true } };
    };
    const now = new Date('2026-10-24T10:00:00Z');
    const later = (minutes) => new Date(now.getTime() + minutes * 60000);
    const command = (actor, input, time = now) =>
      operations.command(workspace, actor, actor, input, time);
    const taskCommand = (actor, input) =>
      delivery.command(workspace, actor, actor, input);
    const read = () =>
      runner.manager
        .getRepository(DeliveryOperationsEntity)
        .findOneBy({ workspaceId: workspace.id });
    // Keep test changes isolated even when the workspace already has saved settings.
    const previousOperations = await read();
    await runner.manager
      .getRepository(DeliveryOperationsEntity)
      .delete({ workspaceId: workspace.id });
    let snapshot = await taskCommand(admin, {
      action: 'project',
      name: 'Phase 4 fixture',
      companyId: null,
      memberIds: [editor],
    });
    const project = snapshot.projects.find(
      (item) => item.name === 'Phase 4 fixture',
    );
    const fields = {
      title: 'Recurring SEO fixture',
      brief: 'Submit backlink evidence',
      service: 'SEO',
      priority: 'NORMAL',
      scheduledDate: null,
      dueAt: null,
      assigneeId: editor,
      reviewerId: admin,
      checklist: [],
      evidence: [],
    };
    await assert.rejects(
      command(editor, {
        action: 'settings',
        enabled: true,
        telegramEnabled: true,
        timezone: 'UTC',
        founderId: admin,
      }),
    );
    await command(admin, {
      action: 'settings',
      enabled: true,
      telegramEnabled: true,
      timezone: 'UTC',
      founderId: admin,
    });
    await command(admin, {
      action: 'template',
      template: {
        projectId: project.id,
        fields,
        frequency: 'DAILY',
        weekdays: [1],
        monthDay: 31,
        time: '09:00',
        startDate: '2026-10-20',
        endDate: null,
        paused: false,
        dueHours: 24,
      },
    });
    await operations.tickWorkspace(workspace, now);
    let record = await read();
    const template = record.state.templates[0];
    assert.equal(template.skipped, 4);
    const taskId = template.lastTaskId;
    assert(taskId);
    if (process.argv.includes('--browser-fixture')) {
      const users = await runner.query(
        'SELECT "userId" FROM core."userWorkspace" WHERE id=ANY($1::uuid[])',
        [[admin, editor, outsider]],
      );
      record.state.enabled = false;
      record.state.telegramEnabled = false;
      await runner.manager.getRepository(DeliveryOperationsEntity).save(record);
      require('node:fs').writeFileSync(
        '/tmp/otogrow-phase4-browser.json',
        JSON.stringify({
          workspaceId: workspace.id,
          schema: workspace.databaseSchema,
          projectId: project.id,
          memberIds: [admin, editor, outsider],
          userIds: users.map((item) => item.userId),
          previousOperations,
        }),
        { mode: 0o600 },
      );
      await runner.commitTransaction();
      console.log(
        'Created temporary Phase 4 browser fixture with schedules and Telegram disabled.',
      );
      return;
    }

    const task = () =>
      runner.manager
        .getRepository(DeliveryTaskEntity)
        .findOneBy({ workspaceId: workspace.id, taskId });
    await operations.tickWorkspace(workspace, now);
    assert.equal((await read()).state.templates[0].lastTaskId, taskId);
    await assert.rejects(command(outsider, { action: 'seen', taskId }));
    await command(editor, { action: 'seen', taskId });
    await dispatchAndDrain(workspace, later(6));
    assert.equal(
      (await read()).state.notices.find(
        (item) => item.taskId === taskId && item.kind === 'ASSIGNMENT',
      ).sendState,
      'SUPPRESSED',
    );
    const link = (await command(editor, { action: 'linkTelegram' })).link;
    const payload = new URL(link).searchParams.get('start');
    await operations.handleTelegramUpdate(
      workspace.id,
      {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 123456 },
          text: `/start ${payload}`,
        },
      },
      now,
    );
    await operations.handleTelegramUpdate(
      workspace.id,
      {
        update_id: 2,
        message: {
          message_id: 2,
          chat: { id: 999999 },
          text: `/start ${payload}`,
        },
      },
      now,
    );
    assert.equal((await read()).state.connections[editor].chatId, '123456');
    await command(admin, {
      action: 'message',
      taskId,
      recipientId: editor,
      text: 'Review this assignment.',
    });
    const unreadNotice = (await read()).state.notices.at(-1);
    await command(editor, { action: 'seen', taskId }, later(1));
    assert.equal(
      (await read()).state.notices.find((item) => item.id === unreadNotice.id)
        .seenAt,
      null,
    );
    await command(admin, {
      action: 'message',
      taskId,
      recipientId: admin,
      text: 'Manager message remains unread on task open.',
    });
    const managerNotice = (await read()).state.notices.at(-1);
    await command(admin, { action: 'seen', taskId }, later(1));
    assert.equal(
      (await read()).state.notices.find((item) => item.id === managerNotice.id)
        .seenAt,
      null,
    );
    await command(
      admin,
      { action: 'acknowledge', id: managerNotice.id },
      later(1),
    );
    await dispatchAndDrain(workspace, later(4));
    assert.equal(sent, 0);
    await dispatchAndDrain(workspace, later(5));
    assert.equal(sent, 1);
    await dispatchAndDrain(workspace, later(10));
    assert.equal(sent, 1);
    await command(
      admin,
      {
        action: 'message',
        taskId,
        recipientId: editor,
        text: 'Acknowledge this.',
      },
      later(11),
    );
    let notice = (await read()).state.notices.at(-1);
    await command(editor, { action: 'acknowledge', id: notice.id }, later(12));
    await command(
      admin,
      {
        action: 'message',
        taskId,
        recipientId: editor,
        text: 'Read only this message.',
      },
      later(11),
    );
    const readNotice = (await read()).state.notices.at(-1);
    await assert.rejects(
      command(admin, { action: 'noticeSeen', id: readNotice.id }, later(12)),
    );
    await assert.rejects(
      command(outsider, { action: 'noticeSeen', id: readNotice.id }, later(12)),
    );
    await command(
      editor,
      { action: 'noticeSeen', id: readNotice.id },
      later(12),
    );
    await command(
      editor,
      { action: 'noticeSeen', id: readNotice.id },
      later(13),
    );
    assert.equal(
      (await read()).state.notices.find((item) => item.id === readNotice.id)
        .seenAt,
      later(12).toISOString(),
    );
    assert.equal(
      (await read()).state.notices.find((item) => item.id === unreadNotice.id)
        .seenAt,
      null,
    );
    await dispatchAndDrain(workspace, later(20));
    assert.equal(sent, 1);
    assert.equal(
      (await read()).state.notices.find((item) => item.id === readNotice.id)
        .sendState,
      'SUPPRESSED',
    );
    const expiredLink = (await command(editor, { action: 'linkTelegram' }))
      .link;
    await operations.handleTelegramUpdate(
      workspace.id,
      {
        update_id: 3,
        message: {
          message_id: 3,
          chat: { id: 999998 },
          text: `/start ${new URL(expiredLink).searchParams.get('start')}`,
        },
      },
      later(11),
    );
    assert.equal((await read()).state.connections[editor].chatId, '123456');
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2::jsonb WHERE id=$1',
      [project.id, JSON.stringify([editor, outsider])],
    );
    await taskCommand(admin, {
      action: 'edit',
      taskId,
      revision: (await task()).revision,
      fields: { ...fields, assigneeId: outsider },
    });
    await operations.tickWorkspace(workspace, later(20));
    assert(
      (await read()).state.notices.some(
        (item) =>
          item.taskId === taskId &&
          item.kind === 'ASSIGNMENT' &&
          item.recipientId === outsider &&
          !item.cancelled,
      ),
    );
    await taskCommand(admin, {
      action: 'edit',
      taskId,
      revision: (await task()).revision,
      fields,
    });
    await operations.tickWorkspace(workspace, later(20));
    await command(editor, { action: 'seen', taskId }, later(20));

    await command(
      admin,
      {
        action: 'message',
        taskId,
        recipientId: editor,
        text: 'Timeout fixture',
      },
      later(21),
    );
    fail = true;
    await dispatchAndDrain(workspace, later(26));
    assert.equal(sent, 2);
    await dispatchAndDrain(workspace, later(30));
    assert.equal(sent, 2);
    fail = false;
    assert.equal((await read()).state.notices.at(-1).sendState, 'UNCERTAIN');
    await command(
      admin,
      {
        action: 'message',
        taskId,
        recipientId: editor,
        text: 'Revocation fixture',
      },
      later(31),
    );
    const revokedNotice = (await read()).state.notices.at(-1);
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=\'[]\'::jsonb WHERE id=$1',
      [project.id],
    );
    await assert.rejects(
      command(
        editor,
        { action: 'noticeSeen', id: revokedNotice.id },
        later(32),
      ),
    );
    await assert.rejects(
      command(
        editor,
        { action: 'acknowledge', id: revokedNotice.id },
        later(32),
      ),
    );
    await dispatchAndDrain(workspace, later(36));
    assert.equal(sent, 2);
    assert.equal((await read()).state.notices.at(-1).sendState, 'SUPPRESSED');
    await runner.query(
      'UPDATE core."deliveryProject" SET "memberIds"=$2::jsonb WHERE id=$1',
      [project.id, JSON.stringify([editor])],
    );
    await taskCommand(editor, {
      action: 'submit',
      taskId,
      revision: (await task()).revision,
      description: 'Completed SEO work',
      evidence: ['https://example.com/evidence'],
    });
    await taskCommand(admin, {
      action: 'review',
      taskId,
      revision: (await task()).revision,
      decision: 'APPROVED',
      feedback: '',
    });
    await assert.rejects(
      command(editor, {
        action: 'delivered',
        taskId,
        revision: (await task()).revision,
        note: 'Sent',
      }),
    );
    await command(admin, {
      action: 'delivered',
      taskId,
      revision: (await task()).revision,
      note: 'Sent to synthetic client',
    });
    await operations.tickWorkspace(workspace, later(719));
    assert(
      !(await read()).state.notices.some(
        (item) =>
          item.taskId === taskId &&
          item.kind === 'FULFILMENT' &&
          !item.cancelled,
      ),
    );
    await operations.tickWorkspace(workspace, later(720));
    await operations.tickWorkspace(workspace, later(721));
    assert.equal(
      (await read()).state.notices.filter(
        (item) =>
          item.taskId === taskId &&
          item.kind === 'FULFILMENT' &&
          !item.cancelled,
      ).length,
      1,
    );
    const fulfilmentNotice = (await read()).state.notices.find(
      (item) =>
        item.taskId === taskId && item.kind === 'FULFILMENT' && !item.cancelled,
    );
    await command(admin, { action: 'seen', taskId }, later(721));
    assert.equal(
      (await read()).state.notices.find(
        (item) => item.id === fulfilmentNotice.id,
      ).seenAt,
      null,
    );
    await command(
      admin,
      {
        action: 'fulfilment',
        taskId,
        cycle: 1,
        historyLength: 1,
        decision: 'NOT_FULFILLED',
        note: 'Waiting for review',
      },
      later(722),
    );
    assert.equal(
      (await read()).state.fulfilments.find((item) => item.taskId === taskId)
        .nextCheckAt,
      later(1442).toISOString(),
    );
    await command(
      admin,
      {
        action: 'fulfilment',
        taskId,
        cycle: 1,
        historyLength: 2,
        decision: 'REDOING',
        note: 'Client requested a revision',
      },
      later(723),
    );
    assert.equal((await task()).details.state, 'CHANGES_REQUESTED');
    const [clientRevision] = await runner.query('SELECT source,reason FROM core."deliveryRevision" WHERE "taskId"=$1 ORDER BY round DESC LIMIT 1',[taskId]);
    assert.equal(clientRevision.source,'CLIENT_REDO');assert.equal(clientRevision.reason,'Client requested a revision');
    await assert.rejects(
      command(
        admin,
        {
          action: 'delivered',
          taskId,
          revision: (await task()).revision,
          note: 'Cannot deliver unapproved revision',
        },
        later(724),
      ),
    );
    await taskCommand(editor, {
      action: 'submit',
      taskId,
      revision: (await task()).revision,
      description: 'Revised work',
      evidence: ['https://example.com/v2'],
    });
    await taskCommand(admin, {
      action: 'review',
      taskId,
      revision: (await task()).revision,
      decision: 'APPROVED',
      feedback: '',
    });
    await command(
      admin,
      {
        action: 'delivered',
        taskId,
        revision: (await task()).revision,
        note: 'Redelivered',
      },
      later(730),
    );
    await command(
      admin,
      {
        action: 'fulfilment',
        taskId,
        cycle: 2,
        historyLength: 4,
        decision: 'FULFILLED',
        note: 'No objection; complete',
      },
      later(1450),
    );
    await assert.rejects(
      command(admin, {
        action: 'fulfilment',
        taskId,
        cycle: 1,
        historyLength: 2,
        decision: 'REDOING',
        note: 'Stale',
      }),
    );
    await command(admin, {
      action: 'alert',
      taskId,
      category: 'CLIENT',
      severity: 'URGENT',
      reason: 'Review concern',
      ownerId: admin,
    });
    await command(admin, {
      action: 'alert',
      taskId,
      category: 'CLIENT',
      severity: 'NORMAL',
      reason: 'Updated concern',
      ownerId: admin,
    });
    assert.equal(
      (await read()).state.alerts.filter(
        (item) => item.taskId === taskId && item.category === 'CLIENT',
      ).length,
      1,
    );
    const editorSnapshot = await operations.snapshot(workspace, editor, editor);
    assert.equal(editorSnapshot.alerts.length, 0);
    assert.equal(editorSnapshot.templates.length, 0);
    assert(!JSON.stringify(editorSnapshot).includes('123456'));
    await command(
      admin,
      {
        action: 'message',
        taskId,
        recipientId: editor,
        text: 'Overnight reminder fixture',
      },
      new Date('2026-10-24T23:58:00Z'),
    );
    const beforeOvernight = sent;
    await dispatchAndDrain(workspace, new Date('2026-10-25T00:02:00Z'));
    assert.equal(sent, beforeOvernight);
    await dispatchAndDrain(workspace, new Date('2026-10-25T00:03:00Z'));
    assert.equal(sent, beforeOvernight + 1);
    await dispatchAndDrain(workspace, new Date('2026-10-25T01:03:00Z'));
    assert.equal(sent, beforeOvernight + 1);
    await command(admin, {
      action: 'settings',
      enabled: true,
      telegramEnabled: true,
      timezone: 'UTC',
      founderId: admin,
    });
    await assert.rejects(
      command(editor, { action: 'pause', id: template.id, paused: true }),
    );
    await command(admin, { action: 'pause', id: template.id, paused: true });
    await command(admin, { action: 'pause', id: template.id, paused: true });
    await command(admin, { action: 'pause', id: template.id, paused: false });
    await command(admin, {
      action: 'template',
      template: {
        id: template.id,
        projectId: project.id,
        fields: { ...fields, brief: 'Private recurring template update' },
        frequency: 'DAILY',
        weekdays: [1],
        monthDay: 31,
        time: '09:00',
        startDate: '2026-10-20',
        endDate: null,
        paused: false,
        dueHours: 48,
      },
    });
    const setupEvents = await runner.query(
      `SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND (("sourceType"='recurrence' AND "sourceId"=$2) OR ("sourceType"='settings' AND "sourceId"=$1 AND "actorId"=$3))`,
      [workspace.id, template.id, admin],
    );
    assert.deepEqual(
      setupEvents.map((event) => event.action).sort(),
      [
        'DELIVERY_SETTINGS_UPDATED',
        'RECURRING_TEMPLATE_CREATED',
        'RECURRING_TEMPLATE_UPDATED',
        'RECURRING_TEMPLATE_PAUSED',
        'RECURRING_TEMPLATE_RESUMED',
      ].sort(),
    );
    assert(
      setupEvents.every(
        (event) => event.actorId === admin && event.actorType === 'HUMAN',
      ),
    );
    const templateUpdate = setupEvents.find(
      (event) => event.action === 'RECURRING_TEMPLATE_UPDATED',
    );
    assert(
      templateUpdate.changes.some(
        (change) =>
          change.field === 'dueHours' &&
          change.before === '24' &&
          change.after === '48',
      ),
    );
    assert(
      !JSON.stringify(setupEvents).includes(
        'Private recurring template update',
      ),
    );
    assert(!JSON.stringify(setupEvents).includes(fields.brief));
    const manualAlert = (await read()).state.alerts.find(
      (item) => item.taskId === taskId && item.category === 'CLIENT',
    );
    await assert.rejects(
      command(editor, {
        action: 'resolveAlert',
        id: manualAlert.id,
        resolve: true,
      }),
    );
    await command(admin, {
      action: 'resolveAlert',
      id: manualAlert.id,
      resolve: false,
    });
    await command(admin, {
      action: 'resolveAlert',
      id: manualAlert.id,
      resolve: false,
    });
    await command(admin, {
      action: 'resolveAlert',
      id: manualAlert.id,
      resolve: true,
    });
    await command(admin, {
      action: 'resolveAlert',
      id: manualAlert.id,
      resolve: true,
    });
    const alertEvents = await runner.query(
      `SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"='alert' AND "sourceId"=$2`,
      [workspace.id, manualAlert.id],
    );
    assert.deepEqual(
      alertEvents.map((event) => event.action).sort(),
      [
        'DELIVERY_ALERT_CREATED',
        'DELIVERY_ALERT_UPDATED',
        'DELIVERY_ALERT_ACKNOWLEDGED',
        'DELIVERY_ALERT_RESOLVED',
      ].sort(),
    );
    assert(
      alertEvents.every(
        (event) =>
          event.actorId === admin &&
          event.actorType === 'HUMAN' &&
          event.subjectMemberId === admin,
      ),
    );
    assert(!JSON.stringify(alertEvents).includes('Review concern'));
    assert(!JSON.stringify(alertEvents).includes('Updated concern'));
    await assert.rejects(
      command(outsider, {
        action: 'message',
        taskId,
        recipientId: editor,
        text: 'Forbidden message marker',
      }),
    );
    const messageEvents = await runner.query(
      `SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "taskId"=$2 AND action='TASK_MESSAGE_SENT'`,
      [workspace.id, taskId],
    );
    const messages = (await read()).state.notices.filter(
      (notice) => notice.taskId === taskId && notice.kind === 'MESSAGE',
    );
    assert.equal(messageEvents.length, messages.length);
    for (const message of messages) {
      const event = messageEvents.find((item) => item.sourceId === message.id);
      assert(event);
      assert.equal(event.actorId, message.senderId);
      assert.equal(event.subjectMemberId, message.recipientId);
      assert(!JSON.stringify(event).includes(message.text));
    }
    await command(editor, { action: 'unlinkTelegram' });
    await command(editor, { action: 'unlinkTelegram' });
    const connectionEvents = await runner.query(
      `SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceType"='connection' AND "sourceId"=$2`,
      [workspace.id, editor],
    );
    assert.deepEqual(connectionEvents.map((event) => event.action).sort(), [
      'TELEGRAM_LINKED',
      'TELEGRAM_UNLINKED',
    ]);
    assert(
      connectionEvents.every(
        (event) => event.actorId === editor && event.subjectMemberId === editor,
      ),
    );
    assert(!JSON.stringify(connectionEvents).includes('123456'));
    assert(!JSON.stringify(connectionEvents).includes(payload));
    const activityRows = () =>
      runner.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "taskId"=$2',
        [workspace.id, taskId],
      );
    const activity = await activityRows();
    const creation = activity.filter(
      (event) => event.action === 'TASK_CREATED',
    );
    assert.equal(
      creation.length,
      1,
      'Recurring retries must not duplicate task activity',
    );
    assert.equal(creation[0].actorType, 'SYSTEM');
    assert.equal(creation[0].actorId, null);
    assert.equal(creation[0].subjectMemberId, editor);
    const deliveries = activity.filter(
      (event) => event.action === 'TASK_DELIVERED',
    );
    assert.equal(
      deliveries.length,
      2,
      'Failed or unauthorized delivery must not create activity',
    );
    for (const event of deliveries) {
      assert.equal(event.actorId, admin);
      assert.equal(event.actorType, 'HUMAN');
      assert.equal(event.subjectMemberId, editor);
      assert.equal(event.projectId, project.id);
    }
    const checks = activity.filter(
      (event) => event.action === 'TASK_FULFILMENT_CHECKED',
    );
    assert.deepEqual(
      checks.map((event) => event.outcome).sort(),
      ['RECORDED', 'CHANGES_REQUESTED', 'FULFILLED'].sort(),
    );
    assert(
      checks
        .find((event) => event.outcome === 'CHANGES_REQUESTED')
        .changes.some(
          (change) =>
            change.field === 'state' &&
            change.before === 'APPROVED' &&
            change.after === 'CHANGES_REQUESTED',
        ),
    );
    const activityPayload = JSON.stringify(activity);
    for (const privateText of [
      'Sent to synthetic client',
      'Waiting for review',
      'Client requested a revision',
      'No objection; complete',
      'Review this assignment.',
      'Submit backlink evidence',
      'https://example.com/evidence',
    ]) {
      assert(
        !activityPayload.includes(privateText),
        'Unified activity must exclude notes, messages, briefs and evidence URLs',
      );
    }
    // Simulate another production flow reopening an already delivered task.
    await command(
      admin,
      {
        action: 'delivered',
        taskId,
        revision: (await task()).revision,
        note: 'Private reopen fixture',
      },
      later(1500),
    );
    const reopened = await task();
    reopened.details.state = 'CHANGES_REQUESTED';
    reopened.revision++;
    await runner.manager.getRepository(DeliveryTaskEntity).save(reopened);
    await taskCommand(admin, {
      action: 'edit',
      taskId,
      revision: (await task()).revision,
      fields: { ...fields, dueAt: later(1400).toISOString() },
    });
    await operations.tickWorkspace(workspace, later(1501));
    await operations.tickWorkspace(workspace, later(1502));
    const reopenEvents = (await activityRows()).filter(
      (event) => event.action === 'TASK_REOPENED',
    );
    assert.equal(reopenEvents.length, 1);
    assert.equal(reopenEvents[0].actorType, 'SYSTEM');
    assert.equal(reopenEvents[0].actorId, null);
    assert.equal(reopenEvents[0].subjectMemberId, editor);
    assert.equal(reopenEvents[0].outcome, 'CHANGES_REQUESTED');
    const overdueAlerts = await runner.query(
      `SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "taskId"=$2 AND action='DELIVERY_ALERT_CREATED' AND "actorType"='SYSTEM'`,
      [workspace.id, taskId],
    );
    assert.equal(
      overdueAlerts.length,
      1,
      'Scheduler retries must not duplicate overdue alerts',
    );
    assert.equal(overdueAlerts[0].actorId, null);
    assert.equal(overdueAlerts[0].subjectMemberId, admin);

    const countTasks = () =>
      runner.manager
        .getRepository(DeliveryTaskEntity)
        .countBy({ workspaceId: workspace.id, projectId: project.id });
    const countActivity = async () =>
      Number(
        (
          await runner.query(
            'SELECT count(*) FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "projectId"=$2',
            [workspace.id, project.id],
          )
        )[0].count,
      );
    const beforeFailedOccurrence = {
      tasks: await countTasks(),
      activity: await countActivity(),
      lastDate: (await read()).state.templates[0].lastDate,
    };
    const originalGetRepository = runner.manager.getRepository.bind(
      runner.manager,
    );
    let caughtFailure = false;
    try {
      runner.manager.getRepository = (entity) => {
        const repository = originalGetRepository(entity);
        return entity === OtogrowActivityEventEntity
          ? new Proxy(repository, {
              get: (target, property) =>
                property === 'insert'
                  ? async () => {
                      throw caughtFailure
                        ? new BadRequestException(
                            'Fixture recurrence activity failure',
                          )
                        : new Error('Fixture recurrence activity failure');
                    }
                  : Reflect.get(target, property),
            })
          : repository;
      };
      await assert.rejects(
        operations.tickWorkspace(workspace, later(3000)),
        /Fixture recurrence activity failure/,
      );
      assert.equal(await countTasks(), beforeFailedOccurrence.tasks);
      assert.equal(await countActivity(), beforeFailedOccurrence.activity);
      const beforeMessageFailure = (await read()).state.notices.length;
      await assert.rejects(
        command(admin, {
          action: 'message',
          taskId,
          recipientId: editor,
          text: 'Rollback message marker',
        }),
        /Fixture recurrence activity failure/,
      );
      assert.equal((await read()).state.notices.length, beforeMessageFailure);
      const beforeAlertFailure = (await read()).state.alerts.length;
      await assert.rejects(
        command(admin, {
          action: 'alert',
          taskId,
          category: 'BUDGET',
          severity: 'NORMAL',
          reason: 'Rollback alert marker',
          ownerId: admin,
        }),
        /Fixture recurrence activity failure/,
      );
      assert.equal((await read()).state.alerts.length, beforeAlertFailure);
      caughtFailure = true;
      await operations.tickWorkspace(workspace, later(3000));
    } finally {
      runner.manager.getRepository = originalGetRepository;
    }
    assert.equal(
      await countTasks(),
      beforeFailedOccurrence.tasks,
      'Caught recurrence errors must roll back task inserts',
    );
    assert.equal(await countActivity(), beforeFailedOccurrence.activity);
    assert.equal(
      (await read()).state.templates[0].lastDate,
      beforeFailedOccurrence.lastDate,
    );
    assert(
      (await read()).state.templates[0].error,
      'Keep an actionable schedule failure without orphan work',
    );
    await operations.tickWorkspace(workspace, later(3000));
    await operations.tickWorkspace(workspace, later(3001));
    assert.equal(await countTasks(), beforeFailedOccurrence.tasks + 1);
    assert.equal(await countActivity(), beforeFailedOccurrence.activity + 1);
    assert.equal((await read()).state.templates[0].error, null);
    const journey = async (actor = editor) => (await delivery.snapshot(workspace, actor, actor)).tasks.find((entry) => entry.id === taskId)?.delivery;
    assert.equal((await journey()).status, 'REDOING');
    assert.equal(await journey(outsider), undefined);
    await taskCommand(editor, {action: 'submit', taskId, revision: (await task()).revision, description: 'Current approved replacement', evidence: ['https://example.com/current']});
    await taskCommand(admin, {action: 'review', taskId, revision: (await task()).revision, decision: 'APPROVED', feedback: ''});
    const legacyOperations = await read();
    const legacyDelivery = legacyOperations.state.fulfilments.find((item) => item.taskId === taskId);
    legacyDelivery.status = 'WAITING';
    delete legacyDelivery.deliveredSubmissionVersion;
    await runner.manager.getRepository(DeliveryOperationsEntity).save(legacyOperations);
    const beforeJourneyRead = JSON.stringify((await read()).state);
    assert.equal((await journey()).status, 'NEEDS_RECONFIRMATION');
    assert.equal(JSON.stringify((await read()).state), beforeJourneyRead, 'Journey reads do not repair or mutate stored work');
    const confirmLegacy = {action: 'fulfilment', taskId, cycle: legacyDelivery.cycle, historyLength: legacyDelivery.history.length, decision: 'FULFILLED', note: 'Must not accept an unverified version'};
    await assert.rejects(command(admin, confirmLegacy, later(3100)), /approved version changed/);
    await command(admin, {action: 'delivered', taskId, revision: (await task()).revision, note: 'Current version redelivered'}, later(3100));
    const currentDelivery = (await read()).state.fulfilments.find((item) => item.taskId === taskId);
    assert.equal(currentDelivery.cycle, legacyDelivery.cycle + 1);
    assert.equal((await journey()).status, 'WAITING');
    assert.equal((await journey()).deliveredSubmissionVersion, (await task()).details.submissions.at(-1).version);
    assert.equal((await journey()).history, undefined, 'Workspace lists only expose a compact authorized summary');
    await command(admin, {action: 'fulfilment', taskId, cycle: currentDelivery.cycle, historyLength: currentDelivery.history.length, decision: 'FULFILLED', note: 'Current version accepted'}, later(3200));
    assert.equal((await journey()).status, 'FULFILLED');
    assert.equal((await journey()).nextCheckAt, null);
    console.log(
      'PASS: exact-version lifecycle, legacy redelivery, forbidden stale fulfilment and read-only summaries; recurring idempotency/catch-up, access isolation, task-open assignment-only reads, recipient-scoped message reads and acknowledgement, one-time/revoked/uncertain reminders, private single-use linking, delivery checks and redo/redelivery, founder deduplication, and safe human/system activity attribution with no duplicate events or orphan tasks after a caught recurrence failure. Synthetic transaction rolled back; no Telegram network calls.',
    );
  } finally {
    axios.post = originalPost;
    global.Date = OriginalDate;
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

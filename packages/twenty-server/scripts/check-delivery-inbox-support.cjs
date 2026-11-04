const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  createFixture,
  cleanupFixture,
  buildServices,
} = require('./check-delivery-reconciliation.cjs');
const {
  newDeliveryOperations,
} = require('../dist/modules/delivery/operations/delivery-operations.types');
const {
  ConnectedAccountEntity,
} = require('../dist/engine/metadata-modules/connected-account/entities/connected-account.entity');
const {
  MessageChannelEntity,
} = require('../dist/engine/metadata-modules/message-channel/entities/message-channel.entity');
const {
  DeliveryInboxService,
} = require('../dist/modules/delivery/inbox/delivery-inbox.service');
const {
  DeliveryInboxGmailService,
} = require('../dist/modules/delivery/inbox/gmail/delivery-inbox-gmail.service');
const {
  DeliveryInboxReplyService,
} = require('../dist/modules/delivery/inbox/delivery-inbox-reply.service');
const TABLES = [
  'deliveryInboxReply',
  'deliveryInboxConsent',
  'deliveryInboxBinding',
];
const PRIVATE = 'SYNTHETIC_SELECTED_GMAIL_QUESTION';
const HIDDEN = 'SYNTHETIC_OTHER_ACCOUNT_PRIVATE_MESSAGE';
const NOW = '2026-11-03T06:00:00.123456Z';
const quote = (value) => {
  assert.match(value, /^[a-zA-Z0-9_]+$/);
  return `"${value}"`;
};
async function seedInboxFixture(manager, prefix = 'inbox_rollback') {
  const fixture = await createFixture(manager, prefix);
  fixture.prefix = prefix;
  const schema = quote(fixture.schemaName);
  await manager.query(`COMMENT ON SCHEMA ${schema} IS '${fixture.sentinel}'`);
  await manager.query(
    `CREATE TABLE ${schema}.message (id uuid PRIMARY KEY,subject text,text text,"headerMessageId" text,"receivedAt" timestamptz,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now(),"isDraft" boolean NOT NULL DEFAULT false,"deletedAt" timestamptz)`,
  );
  await manager.query(
    `CREATE TABLE ${schema}."messageChannelMessageAssociation" (id uuid PRIMARY KEY,"messageId" uuid NOT NULL,"messageChannelId" uuid NOT NULL,"messageThreadExternalId" text,"messageExternalId" text,direction text,"createdAt" timestamptz DEFAULT now(),"updatedAt" timestamptz DEFAULT now(),"deletedAt" timestamptz)`,
  );
  await manager.query(
    `CREATE TYPE ${schema}.message_participant_role_enum AS ENUM ('FROM','TO','CC','BCC','REPLY_TO')`,
  );
  await manager.query(
    `CREATE TABLE ${schema}."messageParticipant" (id uuid PRIMARY KEY,"messageId" uuid NOT NULL,role ${schema}.message_participant_role_enum,handle text,"displayName" text,"deletedAt" timestamptz)`,
  );
  fixture.accounts = { owner: randomUUID(), other: randomUUID() };
  fixture.channels = { owner: randomUUID(), other: randomUUID() };
  for (const name of ['owner', 'other']) {
    const person =
      name === 'owner' ? fixture.people.admin : fixture.people.outsider;
    await manager.getRepository(ConnectedAccountEntity).insert({
      id: fixture.accounts[name],
      workspaceId: fixture.workspaceId,
      handle: `${name}@example.invalid`,
      provider: 'google',
      userWorkspaceId: person.userWorkspaceId,
      accessToken: null,
      refreshToken: null,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      visibility: 'user',
    });
    await manager.getRepository(MessageChannelEntity).insert({
      id: fixture.channels[name],
      workspaceId: fixture.workspaceId,
      connectedAccountId: fixture.accounts[name],
      handle: `${name}@example.invalid`,
      visibility: 'METADATA',
      type: 'EMAIL',
      pendingGroupEmailsAction: 'NONE',
      syncStage: 'PENDING_CONFIGURATION',
      isSyncEnabled: false,
    });
  }
  fixture.messages = [];
  fixture.associations = [];
  fixture.participants = [];
  fixture.conversations = Array.from({ length: 55 }, (_, index) => ({
    id: randomUUID(),
    kind: 'CONVERSATION',
    revision: 1,
    projectId: fixture.projects.first,
    title: `Synthetic Gmail conversation ${String(index).padStart(3, '0')}`,
    channel: 'EMAIL',
    sourceUrl: null,
    ownerId: fixture.people.admin.memberId,
    private: false,
    grants: [
      { memberId: fixture.people.writer.memberId, read: true, send: true },
    ],
    roleGrants: [],
    createdBy: fixture.people.admin.memberId,
    createdAt: NOW,
    updatedAt: NOW,
    status: 'DRAFT',
    decisionBy: null,
    evidence: null,
    taskId: null,
    history: [],
  }));
  fixture.thread = 'selected-thread';
  const insertMessage = async (index, channelId, thread, text, receivedAt) => {
    const id = randomUUID(),
      associationId = randomUUID(),
      participantId = randomUUID();
    fixture.messages.push(id);
    fixture.associations.push(associationId);
    fixture.participants.push(participantId);
    await manager.query(
      `INSERT INTO ${schema}.message(id,subject,text,"headerMessageId","receivedAt") VALUES($1,$2,$3,$4,$5)`,
      [
        id,
        `Question ${index}`,
        text,
        `<inbox-fixture-${id}@example.invalid>`,
        receivedAt,
      ],
    );
    await manager.query(
      `INSERT INTO ${schema}."messageChannelMessageAssociation"(id,"messageId","messageChannelId","messageThreadExternalId","messageExternalId",direction) VALUES($1,$2,$3,$4,$5,'INCOMING')`,
      [associationId, id, channelId, thread, `native-${id}`],
    );
    await manager.query(
      `INSERT INTO ${schema}."messageParticipant"(id,"messageId",role,handle,"displayName") VALUES($1,$2,'FROM','client@example.invalid','Synthetic client')`,
      [participantId, id],
    );
    return id;
  };
  for (let index = 0; index < 55; index++)
    await insertMessage(
      index,
      fixture.channels.owner,
      fixture.thread,
      `${PRIVATE} ${index}`,
      index === 54
        ? null
        : ['2026-11-03T06:00:00.123455Z', NOW, '2026-11-03T06:00:00.123457Z'][
            index % 3
          ],
    );
  fixture.selectedMessageId = fixture.messages[0];
  for (let index = 1; index < 55; index++)
    await insertMessage(
      index,
      fixture.channels.owner,
      `other-thread-${index}`,
      `Other permitted owner thread ${index}`,
      NOW,
    );
  fixture.hiddenMessageId = await insertMessage(
    999,
    fixture.channels.other,
    fixture.thread,
    HIDDEN,
    NOW,
  );
  const operations = newDeliveryOperations();
  operations.business = { records: fixture.conversations, inbox: [], seen: {} };
  await manager.query(
    'INSERT INTO core."deliveryOperations"("workspaceId",state) VALUES($1,$2)',
    [fixture.workspaceId, operations],
  );
  return fixture;
}
function inboxServices(source, fixture, options = {}) {
  const services = buildServices(source, fixture);
  const permission = {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) =>
      workspaceId === fixture.workspaceId &&
      userWorkspaceId === fixture.people.admin.userWorkspaceId &&
      options.senderAllowed !== false,
  };
  const gmail = new DeliveryInboxGmailService(services.delivery, permission);
  const inbox = new DeliveryInboxService(source, services.delivery, gmail);
  const calls = [],
    enqueued = [];
  const outbound = {
    sendMessage: async (input, account) => {
      if (options.beforeSend) await options.beforeSend(input, account);
      calls.push({ input, accountId: account.id });
      if (options.failSend) throw new Error('Synthetic ambiguous send');
      return {
        headerMessageId: input.headerMessageId,
        messageExternalId: `mock-sent-${calls.length}`,
      };
    },
  };
  const replies = new DeliveryInboxReplyService(
    inbox,
    options.business ?? services.business,
    outbound,
    {
      add: async (name, data, configuration) => {
        enqueued.push({ name, data, configuration });
      },
    },
  );
  services.delivery.snapshot = () => {
    throw new Error('Inbox must not load the workspace snapshot.');
  };
  services.business.snapshot = () => {
    throw new Error(
      'Connected inbox must not load the legacy business snapshot.',
    );
  };
  const call = (method, input, person = fixture.people.admin) =>
    inbox[method](
      fixture.workspace,
      person.memberId,
      person.userWorkspaceId,
      input,
    );
  const reply = (method, input, person = fixture.people.admin) =>
    replies[method](
      fixture.workspace,
      person.memberId,
      person.userWorkspaceId,
      input,
    );
  return { ...services, gmail, inbox, replies, calls, enqueued, call, reply };
}
async function consentInput(services, fixture, index = 0, changes = {}) {
  const selected = (
    await services.call('threads', {
      accountId: fixture.accounts.owner,
      selectedChannelId: fixture.channels.owner,
      selectedThreadExternalId: fixture.thread,
    })
  ).selected;
  return {
    id: randomUUID(),
    requestId: randomUUID(),
    conversationId: fixture.conversations[index].id,
    conversationRevision: 1,
    revision: 0,
    accountId: fixture.accounts.owner,
    channelId: fixture.channels.owner,
    threadExternalId: fixture.thread,
    sourceFingerprint: selected.sourceFingerprint,
    grants: [
      {
        kind: 'MEMBER',
        id: fixture.people.writer.memberId,
        read: true,
        draft: true,
        send: true,
      },
    ],
    includeHistoryAndFutureReplies: true,
    ...changes,
  };
}
async function manualInput(
  services,
  fixture,
  conversationId = fixture.conversations[0].id,
  person = fixture.people.writer,
) {
  const conversation = await services.call(
    'conversation',
    { id: conversationId },
    person,
  );
  const messages = await services.call('messages', { conversationId }, person);
  return {
    id: randomUUID(),
    requestId: randomUUID(),
    conversationId,
    bindingRevision: conversation.binding.revision,
    sourceFingerprint: messages.sourceFingerprint,
    replyToMessageId: fixture.selectedMessageId,
    text: 'Human-reviewed synthetic reply. No real recipient.',
    sourceIds: [],
  };
}
async function cleanupInboxFixture(manager, fixture) {
  assert.equal(
    fixture.schemaName,
    `${fixture.prefix}_${fixture.workspaceId.replaceAll('-', '_')}`,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  const [namespace] = await manager.query(
    "SELECT obj_description(oid,'pg_namespace') AS sentinel FROM pg_namespace WHERE nspname=$1",
    [fixture.schemaName],
  );
  assert.equal(namespace?.sentinel, fixture.sentinel);
  for (const [table, ids] of [
    ['message', fixture.messages],
    ['messageChannelMessageAssociation', fixture.associations],
    ['messageParticipant', fixture.participants],
  ]) {
    const rows = await manager.query(
      `SELECT id FROM ${quote(fixture.schemaName)}.${quote(table)} ORDER BY id`,
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      [...ids].sort(),
      `Unexpected ${table} rows; refusing cleanup.`,
    );
  }
  for (const table of TABLES)
    await manager.query(
      `DELETE FROM core.${quote(table)} WHERE "workspaceId"=ANY($1::uuid[])`,
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
  for (const [table, ids] of [
    ['messageChannel', Object.values(fixture.channels)],
    ['connectedAccount', Object.values(fixture.accounts)],
  ]) {
    const rows = await manager.query(
      `SELECT id FROM core.${quote(table)} WHERE "workspaceId"=$1 ORDER BY id`,
      [fixture.workspaceId],
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      [...ids].sort(),
    );
    await manager.query(
      `DELETE FROM core.${quote(table)} WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])`,
      [fixture.workspaceId, ids],
    );
  }
  await cleanupFixture(manager, fixture);
}
module.exports = {
  TABLES,
  PRIVATE,
  HIDDEN,
  quote,
  seedInboxFixture,
  inboxServices,
  consentInput,
  manualInput,
  cleanupInboxFixture,
};

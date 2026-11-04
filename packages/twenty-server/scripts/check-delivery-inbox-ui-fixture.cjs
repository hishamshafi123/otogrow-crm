const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const guard = require('./check-delivery-assistants-ui-fixture.cjs');
const { inboxServices } = require('./check-delivery-inbox-support.cjs');
const {
  inboxHash,
} = require('../dist/modules/delivery/inbox/delivery-inbox.policy');
const {
  inboxConsentSchema,
  inboxRevokeSchema,
  inboxPrepareSchema,
  inboxCancelSchema,
} = require('../dist/modules/delivery/inbox/delivery-inbox.types');
const {
  ConnectedAccountEntity,
} = require('../dist/engine/metadata-modules/connected-account/entities/connected-account.entity');
const {
  MessageChannelEntity,
} = require('../dist/engine/metadata-modules/message-channel/entities/message-channel.entity');

const FILE = '/tmp/otogrow-inbox-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const DYNAMIC = [
  'deliveryInboxBinding',
  'deliveryInboxConsent',
  'deliveryInboxReply',
  'otogrowActivityEvent',
];
const SOURCES = [
  ...DYNAMIC,
  'connectedAccount',
  'messageChannel',
  'message',
  'messageParticipant',
  'messageChannelMessageAssociation',
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
const schemas = {
  consent: inboxConsentSchema,
  revoke: inboxRevokeSchema,
  prepare: inboxPrepareSchema,
  cancel: inboxCancelSchema,
};
const actions = {
  consent: 'CONSENTED',
  revoke: 'REVOKED',
  prepare: 'PREPARED',
  cancel: 'CANCELLED',
};
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const entries = (fixture) => [
  { schema: 'core', name: 'user', ids: [fixture.teammate.userId] },
  {
    schema: 'core',
    name: 'userWorkspace',
    ids: [fixture.teammate.userWorkspaceId],
  },
  { schema: 'core', name: 'roleTarget', ids: [fixture.teammate.targetId] },
  {
    schema: fixture.schema,
    name: 'workspaceMember',
    ids: [fixture.teammate.memberId],
  },
  { schema: 'core', name: 'deliveryProject', ids: [fixture.projectId] },
  { schema: 'core', name: 'connectedAccount', ids: [fixture.accountId] },
  { schema: 'core', name: 'messageChannel', ids: [fixture.channelId] },
  {
    schema: fixture.schema,
    name: 'message',
    ids: fixture.messages.map((message) => message.id),
  },
  {
    schema: fixture.schema,
    name: 'messageChannelMessageAssociation',
    ids: fixture.messages.map((message) => message.associationId),
  },
  {
    schema: fixture.schema,
    name: 'messageParticipant',
    ids: fixture.messages.map((message) => message.participantId),
  },
];
const ownedState = (state, fixture) => ({
  ...state,
  business: {
    ...state.business,
    records: state.business.records.filter(
      (record) => record.id !== fixture.conversationId,
    ),
  },
});
const record = (fixture) => ({
  id: fixture.conversationId,
  kind: 'CONVERSATION',
  revision: 1,
  projectId: fixture.projectId,
  title: fixture.title,
  channel: 'EMAIL',
  sourceUrl: null,
  ownerId: fixture.actorId,
  private: false,
  grants: [{ memberId: fixture.teammate.memberId, read: true, send: true }],
  roleGrants: [],
  createdBy: fixture.actorId,
  createdAt: fixture.createdAt,
  updatedAt: fixture.createdAt,
  status: 'DRAFT',
  decisionBy: null,
  evidence: null,
  taskId: null,
  history: [],
});
function load() {
  const metadata = lstatSync(FILE);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o077) === 0 &&
      metadata.uid === process.getuid(),
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, 'inbox-ui-v1');
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const id of [
    fixture.nonce,
    fixture.projectId,
    fixture.conversationId,
    fixture.accountId,
    fixture.channelId,
    ...Object.values(fixture.teammate),
    ...fixture.messages.flatMap(({ id, associationId, participantId }) => [
      id,
      associationId,
      participantId,
    ]),
  ])
    assert.match(id, UUID);
  assert.equal(fixture.title, `Disposable inbox ${fixture.nonce.slice(0, 8)}`);
  for (const command of fixture.commands) {
    assert(Object.hasOwn(schemas, command.method));
    assert.deepEqual(
      schemas[command.method].parse(command.input),
      command.input,
    );
    assert.equal(command.hash, inboxHash(command.input));
    assert.equal(command.memberId, fixture.actorId);
    assert.equal(command.userWorkspaceId, fixture.userWorkspaceId);
  }
  return fixture;
}
async function validated(manager, fixture) {
  await noNativeAutomation(manager, fixture, SOURCES);
  const currentOperations = await operations(manager);
  assert.equal(currentOperations.id, fixture.baseline.operations.id);
  const extra = additions(await readTables(manager, fixture), fixture);
  const hasSeed = extra.some(
    (table) => !DYNAMIC.includes(table.name) && table.rows.length,
  );
  const conversations = currentOperations.state.business.records.filter(
    (candidate) => candidate.id === fixture.conversationId,
  );
  assert.deepEqual(conversations, hasSeed ? [record(fixture)] : []);
  assert.equal(
    fingerprint(withoutHeartbeat(ownedState(currentOperations.state, fixture))),
    fixture.baseline.operations.hash,
    'Only the exact synthetic conversation may change Operations.',
  );
  const bindings = await manager.query(
    'SELECT * FROM core."deliveryInboxBinding" WHERE "workspaceId"=$1 AND "conversationId"=$2',
    [WORKSPACE_ID, fixture.conversationId],
  );
  const consent = await manager.query(
    'SELECT * FROM core."deliveryInboxConsent" WHERE "workspaceId"=$1 AND "bindingId"=ANY($2::uuid[]) ORDER BY revision',
    [WORKSPACE_ID, bindings.map((binding) => binding.id)],
  );
  const replies = await manager.query(
    'SELECT * FROM core."deliveryInboxReply" WHERE "workspaceId"=$1 AND "conversationId"=$2',
    [WORKSPACE_ID, fixture.conversationId],
  );
  const activity = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND "sourceId"=$2',
    [WORKSPACE_ID, fixture.conversationId],
  );
  const planned = (requestId, method) => {
    const command = fixture.commands.find(
      (candidate) =>
        candidate.input.requestId === requestId && candidate.method === method,
    );
    assert(command, 'Every action must have exact precommit intent.');
    return command;
  };
  const receipt = (value, command, replyId, bindingId) => {
    assert.equal(value.requestId, command.input.requestId);
    assert.equal(value.action, actions[command.method]);
    assert.equal(value.actorId, fixture.actorId);
    assert.equal(value.userWorkspaceId, fixture.userWorkspaceId);
    assert.equal(value.conversationId, fixture.conversationId);
    assert.equal(value.replyId, replyId);
    assert.equal(value.bindingId, bindingId);
    assert.equal(value.bodyFingerprint, command.hash);
    assert(Number.isFinite(Date.parse(value.createdAt)));
  };
  for (const binding of bindings) {
    const history = consent.filter((item) => item.bindingId === binding.id);
    assert(history.length > 0);
    let snapshot = null;
    for (const [index, item] of history.entries()) {
      assert.equal(item.revision, index + 1);
      const method = item.receipt.action === 'CONSENTED' ? 'consent' : 'revoke';
      const command = planned(item.id, method);
      assert.equal(command.input.id, binding.id);
      assert.equal(command.input.revision, index);
      assert.equal(item.inputHash, command.hash);
      receipt(item.receipt, command, null, binding.id);
      if (method === 'consent')
        snapshot = {
          conversationRevision: 1,
          ownerMemberId: fixture.actorId,
          ownerUserWorkspaceId: fixture.userWorkspaceId,
          accountId: fixture.accountId,
          channelId: fixture.channelId,
          threadExternalId: fixture.thread,
          projectId: fixture.projectId,
          companyId: null,
          accountHandle: fixture.handle,
          sourceFingerprint: command.input.sourceFingerprint,
          grants: command.input.grants,
          historyAndFutureReplies: true,
        };
      assert.deepEqual(item.snapshot, snapshot);
    }
    assert.equal(binding.revision, history.length);
    assert.equal(
      binding.enabled,
      history.at(-1).receipt.action === 'CONSENTED',
    );
    assert.equal(binding.accountId, fixture.accountId);
    assert.equal(binding.channelId, fixture.channelId);
    assert.equal(binding.ownerMemberId, fixture.actorId);
    assert.equal(binding.ownerUserWorkspaceId, fixture.userWorkspaceId);
    assert.equal(binding.projectId, fixture.projectId);
    assert.equal(binding.companyId, null);
    assert.equal(binding.threadExternalId, fixture.thread);
    assert.deepEqual(binding.consent, snapshot);
  }
  for (const reply of replies) {
    const command = planned(reply.requestId, 'prepare');
    assert.equal(reply.id, command.input.id);
    assert.equal(reply.actorId, fixture.actorId);
    assert.equal(reply.userWorkspaceId, fixture.userWorkspaceId);
    assert.equal(reply.inputHash, command.hash);
    assert.deepEqual(reply.input, command.input);
    const message = fixture.messages.find(
      (candidate) => candidate.id === command.input.replyToMessageId,
    );
    assert(message);
    const body = {
      to: 'client@example.invalid',
      subject: `Re: ${message.subject}`,
      text: command.input.text,
      inReplyTo: `<${message.id}@example.invalid>`,
      threadExternalId: fixture.thread,
      replyToMessageId: message.id,
      sourceIds: [],
      agentId: null,
    };
    assert.deepEqual(reply.body, body);
    assert.equal(reply.bodyFingerprint, inboxHash(body));
    assert.equal(
      reply.headerMessageId,
      `<otogrow-inbox-${reply.id}@otogrow.invalid>`,
    );
    assert.equal(reply.status, reply.cancelRequestId ? 'CANCELLED' : 'DRAFT');
    for (const field of [
      'sendRequestId',
      'sendInputHash',
      'sendReceipt',
      'providerMessageId',
      'problem',
      'attemptedAt',
    ])
      assert.equal(
        reply[field],
        null,
        'No send, inference or worker dispatch is permitted.',
      );
    receipt(reply.preparationReceipt, command, reply.id, reply.bindingId);
    if (reply.cancelRequestId) {
      const cancel = planned(reply.cancelRequestId, 'cancel');
      assert.equal(cancel.input.id, reply.id);
      receipt(reply.cancelReceipt, cancel, reply.id, reply.bindingId);
      assert(reply.finishedAt instanceof Date);
    } else {
      assert.equal(reply.cancelReceipt, null);
      assert.equal(reply.finishedAt, null);
    }
    assert(bindings.some((binding) => binding.id === reply.bindingId));
  }
  const expectedActivity = [
    ...consent.map((item) => ({
      action:
        item.receipt.action === 'CONSENTED'
          ? 'INBOX_THREAD_CONSENTED'
          : 'INBOX_THREAD_REVOKED',
      outcome: 'RECORDED',
      changes: [
        {
          field: 'revision',
          before: String(item.revision - 1),
          after: String(item.revision),
        },
      ],
    })),
    ...replies
      .filter((reply) => reply.cancelRequestId)
      .map(() => ({
        action: 'INBOX_REPLY_CANCELLED',
        outcome: 'CANCELLED',
        changes: [{ field: 'state', before: 'DRAFT', after: 'CANCELLED' }],
      })),
  ];
  assert.equal(activity.length, expectedActivity.length);
  assert.deepEqual(
    activity
      .map(({ action, outcome, changes }) => ({ action, outcome, changes }))
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
    expectedActivity.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  );
  for (const event of activity) {
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.actorType, 'HUMAN');
    assert.equal(event.category, 'BUSINESS');
    assert.equal(event.sourceType, 'conversation');
    assert.equal(event.projectId, fixture.projectId);
    assert.equal(
      event.summary,
      event.action === 'INBOX_THREAD_CONSENTED'
        ? 'The Gmail owner authorized selected conversation permissions for one exact email thread.'
        : event.action === 'INBOX_THREAD_REVOKED'
          ? 'Withdrew OS access to the selected Gmail thread.'
          : 'Updated a human-requested email reply delivery status. Message text and addresses are excluded.',
    );
  }
  const dynamic = {
    deliveryInboxBinding: bindings,
    deliveryInboxConsent: consent,
    deliveryInboxReply: replies,
    otogrowActivityEvent: activity,
  };
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
      expected.map((item) => item.id),
      `Unexpected ${table.schema}.${table.name}; preserve fixture.`,
    );
    if (!DYNAMIC.includes(table.name))
      for (const row of table.rows)
        assert.equal(
          row.hash,
          fixture.seed[`${table.schema}.${table.name}:${row.id}`],
        );
  }
  if (!hasSeed)
    assert.equal(
      bindings.length + consent.length + replies.length + activity.length,
      0,
    );
  return { hasSeed, bindings, consent, replies, activity };
}
async function seed() {
  assert(!existsSync(FILE), 'Clean the existing owned inbox fixture first.');
  const fixture = {
    checker: 'inbox-ui-v1',
    workspaceId: WORKSPACE_ID,
    status: 'CREATING',
    nonce: randomUUID(),
    projectId: randomUUID(),
    conversationId: randomUUID(),
    accountId: randomUUID(),
    channelId: randomUUID(),
    teammate: {
      memberId: randomUUID(),
      userId: randomUUID(),
      userWorkspaceId: randomUUID(),
      targetId: randomUUID(),
    },
    messages: Array.from({ length: 28 }, (_, index) => ({
      id: randomUUID(),
      associationId: randomUUID(),
      participantId: randomUUID(),
      subject: `Synthetic client question ${String(index + 1).padStart(2, '0')}`,
      text: `SYNTHETIC UI MESSAGE ${index + 1}. Please confirm the approved delivery date.`,
      receivedAt: new Date(Date.UTC(2026, 10, 4, 0, index)).toISOString(),
    })),
    commands: [],
    seed: {},
    createdAt: new Date().toISOString(),
  };
  fixture.title = `Disposable inbox ${fixture.nonce.slice(0, 8)}`;
  fixture.thread = `synthetic-ui-${fixture.nonce}`;
  fixture.handle = `synthetic-inbox-${fixture.nonce.slice(0, 8)}@example.invalid`;
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
    await noNativeAutomation(manager, fixture, SOURCES);
    const original = await operations(manager);
    assert(Array.isArray(original.state.business?.records));
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      operations: {
        id: original.id,
        hash: fingerprint(withoutHeartbeat(original.state)),
      },
    };
    fixture.status = 'PREPARED';
    write(fixture);
    const person = fixture.teammate;
    await manager.query(
      'INSERT INTO core."user"(id,email,disabled) VALUES($1,$2,false)',
      [person.userId, `${person.userId}+inbox-ui@example.invalid`],
    );
    await manager.query(
      'INSERT INTO core."userWorkspace"(id,"userId","workspaceId") VALUES($1,$2,$3)',
      [person.userWorkspaceId, person.userId, WORKSPACE_ID],
    );
    await manager.query(
      'INSERT INTO core."roleTarget"(id,"workspaceId","roleId","userWorkspaceId","universalIdentifier","applicationId") VALUES($1,$2,$3,$4,$1,$5)',
      [
        person.targetId,
        WORKSPACE_ID,
        workspace.defaultRoleId,
        person.userWorkspaceId,
        workspace.workspaceCustomApplicationId,
      ],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}."workspaceMember"(id,"userId","nameFirstName","nameLastName") VALUES($1,$2,$3,$4)`,
      [
        person.memberId,
        person.userId,
        'Synthetic inbox teammate',
        fixture.nonce.slice(0, 8),
      ],
    );
    await manager.query(
      'INSERT INTO core."deliveryProject"(id,"workspaceId",name,"memberIds") VALUES($1,$2,$3,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.title,
        JSON.stringify([person.memberId]),
      ],
    );
    await manager.getRepository(ConnectedAccountEntity).insert({
      id: fixture.accountId,
      workspaceId: WORKSPACE_ID,
      handle: fixture.handle,
      provider: 'google',
      userWorkspaceId: fixture.userWorkspaceId,
      accessToken: null,
      refreshToken: null,
      scopes: [READ_SCOPE],
      visibility: 'user',
    });
    await manager.getRepository(MessageChannelEntity).insert({
      id: fixture.channelId,
      workspaceId: WORKSPACE_ID,
      connectedAccountId: fixture.accountId,
      handle: fixture.handle,
      visibility: 'METADATA',
      type: 'EMAIL',
      pendingGroupEmailsAction: 'NONE',
      syncStage: 'PENDING_CONFIGURATION',
      isSyncEnabled: false,
      isContactAutoCreationEnabled: false,
    });
    for (const message of fixture.messages) {
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}.message(id,subject,text,"headerMessageId","receivedAt","isDraft") VALUES($1,$2,$3,$4,$5,false)`,
        [
          message.id,
          message.subject,
          message.text,
          `<${message.id}@example.invalid>`,
          message.receivedAt,
        ],
      );
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}."messageChannelMessageAssociation"(id,"messageId","messageChannelId","messageThreadExternalId","messageExternalId",direction) VALUES($1,$2,$3,$4,$5,'INCOMING')`,
        [
          message.associationId,
          message.id,
          fixture.channelId,
          fixture.thread,
          `synthetic-${message.id}`,
        ],
      );
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}."messageParticipant"(id,"messageId",role,handle,"displayName") VALUES($1,$2,'FROM','client@example.invalid','Synthetic client')`,
        [message.participantId, message.id],
      );
    }
    await manager.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
      [
        original.id,
        {
          ...original.state,
          business: {
            ...original.state.business,
            records: [...original.state.business.records, record(fixture)],
          },
        },
      ],
    );
    for (const table of additions(await readTables(manager, fixture), fixture))
      for (const row of table.rows)
        fixture.seed[`${table.schema}.${table.name}:${row.id}`] = row.hash;
    fixture.status = 'READY';
    write(fixture);
    await validated(manager, fixture);
    if (process.env.OTOGROW_INBOX_UI_FAILURE === 'SEED_PRECOMMIT')
      throw new Error('Injected inbox UI seed PRECOMMIT failure.');
  });
  if (process.env.OTOGROW_INBOX_UI_FAILURE === 'SEED_POSTCOMMIT')
    throw new Error('Injected inbox UI seed POSTCOMMIT failure.');
  console.log(
    JSON.stringify({
      ready: true,
      title: fixture.title,
      handle: fixture.handle,
      conversationId: fixture.conversationId,
      teammateId: fixture.teammate.memberId,
      url: `http://apple.localhost:3001/delivery?view=inbox&inboxConversation=${fixture.conversationId}`,
    }),
  );
}
async function plan() {
  const fixture = load();
  const method = process.argv[3];
  assert(
    Object.hasOwn(schemas, method),
    'Only consent, revoke, manual prepare and pre-dispatch cancel are allowed.',
  );
  const raw = JSON.parse(readFileSync(process.argv[4], 'utf8'));
  assert.match(raw.id, UUID);
  assert.match(raw.requestId, UUID);
  assert(fixture.commands.length < 20);
  assert(
    !fixture.commands.some(
      (command) => command.input.requestId === raw.requestId,
    ),
  );
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const current = await validated(manager, fixture);
    assert(current.hasSeed);
    const [workspace] = await manager.query(
      'SELECT * FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    const services = inboxServices(connectionSource, {
      workspaceId: WORKSPACE_ID,
      workspace,
      people: {
        admin: {
          memberId: fixture.actorId,
          userWorkspaceId: fixture.userWorkspaceId,
        },
      },
    });
    let input;
    const binding = current.bindings[0];
    if (method === 'consent') {
      assert(!binding || binding.id === raw.id);
      const account = await manager
        .getRepository(ConnectedAccountEntity)
        .findOneByOrFail({ id: fixture.accountId });
      const channel = await manager
        .getRepository(MessageChannelEntity)
        .findOneByOrFail({ id: fixture.channelId });
      assert.equal(account.accessToken, null);
      assert.equal(account.refreshToken, null);
      assert.deepEqual(account.scopes, [READ_SCOPE]);
      assert.equal(channel.isSyncEnabled, false);
      const thread = await services.gmail.thread(
        manager,
        workspace,
        account,
        channel,
        fixture.thread,
      );
      const grants = raw.grants ?? [];
      assert(
        grants.every(
          (grant) =>
            grant.kind === 'MEMBER' && grant.id === fixture.teammate.memberId,
        ),
      );
      input = {
        id: raw.id,
        requestId: raw.requestId,
        conversationId: fixture.conversationId,
        conversationRevision: 1,
        revision: binding?.revision ?? 0,
        accountId: fixture.accountId,
        channelId: fixture.channelId,
        threadExternalId: fixture.thread,
        sourceFingerprint: thread.sourceFingerprint,
        grants,
        includeHistoryAndFutureReplies: true,
      };
    } else if (method === 'prepare') {
      assert(raw.text.startsWith('Synthetic UI reply'));
      assert(
        fixture.messages.some((message) => message.id === raw.replyToMessageId),
      );
      const source = await services.inbox.bound(
        manager,
        workspace,
        fixture.actorId,
        fixture.userWorkspaceId,
        fixture.conversationId,
      );
      assert.equal(source.canSend, false);
      input = {
        id: raw.id,
        requestId: raw.requestId,
        conversationId: fixture.conversationId,
        bindingRevision: source.binding.revision,
        sourceFingerprint: source.thread.sourceFingerprint,
        replyToMessageId: raw.replyToMessageId,
        text: raw.text.trim(),
        agentId: null,
        sourceIds: [],
        previewFingerprint: null,
        agentVersion: null,
        pricingRevision: null,
      };
    } else if (method === 'revoke') {
      assert.equal(raw.id, binding?.id);
      input = {
        id: raw.id,
        requestId: raw.requestId,
        revision: binding.revision,
      };
    } else {
      assert(
        current.replies.some(
          (reply) => reply.id === raw.id && reply.status === 'DRAFT',
        ),
      );
      input = { id: raw.id, requestId: raw.requestId };
    }
    input = schemas[method].parse(input);
    fixture.commands.push({
      method,
      input,
      hash: inboxHash(input),
      memberId: fixture.actorId,
      userWorkspaceId: fixture.userWorkspaceId,
    });
    write(fixture);
    console.log(
      JSON.stringify({ planned: true, method, input, hash: inboxHash(input) }),
    );
  });
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
    write(fixture);
    const remove = async (schema, name, ids) => {
      const removed = await manager.query(
        `WITH removed AS (DELETE FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
        [ids],
      );
      exactIds(removed, ids, `Delete only exact owned ${name} rows.`);
    };
    for (const [name, rows] of [
      ['otogrowActivityEvent', before.activity],
      ['deliveryInboxReply', before.replies],
      ['deliveryInboxConsent', before.consent],
      ['deliveryInboxBinding', before.bindings],
    ])
      await remove(
        'core',
        name,
        rows.map((row) => row.id),
      );
    for (const entry of [...entries(fixture)].reverse())
      await remove(entry.schema, entry.name, before.hasSeed ? entry.ids : []);
    const current = await operations(manager);
    if (before.hasSeed)
      await manager.query(
        'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1',
        [current.id, ownedState(current.state, fixture)],
      );
    await validated(manager, fixture);
    for (const table of await readTables(manager, fixture))
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
    if (process.env.OTOGROW_INBOX_UI_FAILURE === 'CLEANUP_PRECOMMIT')
      throw new Error('Injected inbox UI cleanup PRECOMMIT failure.');
  });
  if (process.env.OTOGROW_INBOX_UI_FAILURE === 'CLEANUP_POSTCOMMIT')
    throw new Error('Injected inbox UI cleanup POSTCOMMIT failure.');
  fixture.status = 'CLEANED';
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  if (!existsSync(receipt)) writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    'PASS exact inbox UI fixture cleanup; original records, current authentication lifecycle and Operations preserved.',
  );
}
async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Local database only.',
  );
  assert.equal(process.env.OTOGROW_INBOX_UI_ISOLATED, '1');
  const command = process.argv[2];
  assert(['seed', 'inspect', 'plan', 'cleanup'].includes(command));
  await connectionSource.initialize();
  try {
    if (command === 'seed') await seed();
    else if (command === 'plan') await plan();
    else if (command === 'cleanup') await cleanup();
    else {
      const fixture = load();
      await connectionSource.transaction(async (manager) => {
        await locked(manager);
        const result = await validated(manager, fixture);
        console.log(
          JSON.stringify({
            valid: true,
            title: fixture.title,
            conversationId: fixture.conversationId,
            bindings: result.bindings.map(({ id, revision, enabled }) => ({
              id,
              revision,
              enabled,
            })),
            replies: result.replies.map(({ id, status }) => ({ id, status })),
            consentEvents: result.consent.length,
            activity: result.activity.length,
            protectedTables: fixture.baseline.tables.length,
            hasSeed: result.hasSeed,
          }),
        );
      });
    }
  } finally {
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  console.error(`Preserve ${FILE}; no unverified cleanup is permitted.`);
  process.exitCode = 1;
});

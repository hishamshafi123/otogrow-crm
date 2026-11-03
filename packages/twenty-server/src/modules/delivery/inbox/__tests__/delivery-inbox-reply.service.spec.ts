import { type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type DeliveryBusinessService } from 'src/modules/delivery/business/delivery-business.service';
import { type MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { type DeliveryInboxService } from '../delivery-inbox.service';
import { DeliveryInboxReplyService } from '../delivery-inbox-reply.service';
import { DeliveryInboxReplyEntity } from '../entities/delivery-inbox-reply.entity';
import { inboxHash } from '../delivery-inbox.policy';

jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(async () => undefined),
}));
const identifier = (suffix: string) =>
  `10000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const workspace = Object.assign(new WorkspaceEntity(), {
  id: identifier('1'),
  databaseSchema: 'isolated_inbox',
});
const memberId = identifier('2');
const userWorkspaceId = identifier('3');
const fixture = () => {
  const body = {
    to: 'client@example.invalid',
    subject: 'Re: Question',
    text: 'Human-reviewed reply',
    inReplyTo: '<client@example.invalid>',
    threadExternalId: 'gmail-thread',
    replyToMessageId: identifier('4'),
    sourceIds: [],
    agentId: null,
  };
  const reply: DeliveryInboxReplyEntity = Object.assign(
    new DeliveryInboxReplyEntity(),
    {
      id: identifier('5'),
      workspaceId: workspace.id,
      requestId: identifier('6'),
      bindingId: identifier('7'),
      conversationId: identifier('8'),
      actorId: memberId,
      userWorkspaceId,
      inputHash: 'a'.repeat(64),
      input: {
        id: identifier('5'),
        requestId: identifier('6'),
        conversationId: identifier('8'),
        bindingRevision: 1,
        sourceFingerprint: 'b'.repeat(64),
        replyToMessageId: body.replyToMessageId,
        text: body.text,
        sourceIds: [],
      },
      body,
      bodyFingerprint: inboxHash(body),
      status: 'QUEUED' as const,
      headerMessageId: '<stable-test-reply@otogrow.invalid>',
      sendRequestId: identifier('9'),
      sendInputHash: 'c'.repeat(64),
      sendReceipt: {
        requestId: identifier('9'),
        action: 'SEND_REQUESTED' as const,
        actorId: memberId,
        userWorkspaceId,
        conversationId: identifier('8'),
        bindingId: identifier('7'),
        replyId: identifier('5'),
        bodyFingerprint: 'c'.repeat(64),
        createdAt: new Date().toISOString(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      attemptedAt: null,
      finishedAt: null,
      problem: null,
    },
  );
  let active = false;
  let tail = Promise.resolve();
  let refuseSentCommit = false;
  const query = jest.fn(async () => [] as { externalId: string }[]);
  const repository = {
    findOneBy: jest.fn(
      async (): Promise<DeliveryInboxReplyEntity | null> => ({ ...reply }),
    ),
    insert: jest.fn(async () => undefined),
    update: jest.fn(
      async (
        where: { status?: string },
        values: Partial<DeliveryInboxReplyEntity>,
      ) => {
        if (where.status && reply.status !== where.status)
          return { affected: 0 };
        if (values.status === 'SENT' && refuseSentCommit) {
          refuseSentCommit = false;
          throw new Error('Synthetic post-provider database failure');
        }
        Object.assign(reply, values);
        return { affected: 1 };
      },
    ),
  };
  const manager = {
    getRepository: () => repository,
    query,
  } as unknown as EntityManager;
  const scoped = {
    actor: {
      memberId,
      isAdmin: false,
      isManager: false,
      roleIds: [],
      capabilities: [],
    },
    conversation: { revision: 1 },
    binding: {
      id: reply.bindingId,
      revision: 1,
      ownerMemberId: identifier('10'),
      projectId: identifier('11'),
      threadExternalId: body.threadExternalId,
    },
    rights: { read: true, draft: true, send: true },
    account: { id: identifier('12'), handle: 'founder@example.invalid' },
    channel: { id: identifier('13') },
    thread: { sourceFingerprint: 'b'.repeat(64) },
    canSend: true,
  };
  const bound = jest.fn(async () => scoped);
  const inbox = {
    dataSource: {
      getRepository: (entity: unknown) =>
        entity === WorkspaceEntity
          ? { findOneBy: async () => workspace }
          : repository,
    },
    write: <TResult>(
      workspaceId: string,
      callback: (transaction: EntityManager) => Promise<TResult>,
    ) => {
      expect(workspaceId).toBe(workspace.id);
      const operation = tail.then(async () => {
        active = true;
        try {
          return await callback(manager);
        } finally {
          active = false;
        }
      });
      tail = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    read: async <TResult>(
      _workspaceId: string,
      callback: (transaction: EntityManager) => Promise<TResult>,
    ) => callback(manager),
    bound,
    identity: () => ({
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      actor: scoped.actor,
      scope: 'd'.repeat(64),
      observedAt: new Date().toISOString(),
    }),
    gmail: {
      selected: async () => [
        {
          id: body.replyToMessageId,
          subject: 'Question',
          headerMessageId: body.inReplyTo,
          text: 'Selected incoming question',
          textTruncated: false,
        },
      ],
      replyRecipient: () => body.to,
    },
    delivery: { schema: () => '"isolated_inbox"' },
  } as unknown as DeliveryInboxService;
  const sendMessage = jest.fn(async () => {
    expect(active).toBe(false);
    return {
      headerMessageId: reply.headerMessageId,
      messageExternalId: 'provider-sent-id',
    };
  });
  const queue = {
    add: jest.fn(async () => undefined),
  } as unknown as MessageQueueService;
  const previewConnectedInboxDraft = jest.fn(async () => ({
    agentId: identifier('20'),
    agentName: 'Reply helper',
    agentVersion: 2,
    modelId: 'synthetic-no-provider',
    budget: {
      maximumCostUsd: '0.010000',
      pricingRevision: 3,
      budgetReady: true,
      blockedReason: null,
      boundSource: 'MODEL_CONTEXT',
    },
  }));
  const business = {
    previewConnectedInboxDraft,
    failConnectedInboxDraft: jest.fn(async () => undefined),
  } as unknown as DeliveryBusinessService;
  const service = new DeliveryInboxReplyService(
    inbox,
    business,
    { sendMessage } as unknown as MessagingMessageOutboundService,
    queue,
  );
  return {
    service,
    reply,
    sendMessage,
    bound,
    scoped,
    query,
    repository,
    previewConnectedInboxDraft,
    refuseSentCommit: () => {
      refuseSentCommit = true;
    },
  };
};

describe('Gmail reply durable dispatch', () => {
  it('previews exact selected messages and reservation without sending or creating a reply', async () => {
    const test = fixture();
    const input = {
      id: test.reply.id,
      conversationId: test.reply.conversationId,
      bindingRevision: 1,
      sourceFingerprint: 'b'.repeat(64),
      replyToMessageId: test.reply.input.replyToMessageId,
      agentId: identifier('20'),
      sourceIds: [test.reply.input.replyToMessageId],
    };
    const preview = await test.service.preview(
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
    expect(preview.bodyFingerprint).toBe(inboxHash(input));
    expect(preview.budget).toMatchObject({
      maximumCostUsd: '0.010000',
      pricingRevision: 3,
      budgetReady: true,
    });
    expect(preview.sourceCount).toBe(1);
    expect(preview.sources[0].text).toBe('Selected incoming question');
    expect(preview.sources[0]).not.toHaveProperty('headerMessageId');
    expect(preview.sources[0]).not.toHaveProperty('externalId');
    expect(preview.to).toBe('client@example.invalid');
    expect(preview.subject).toBe('Re: Question');
    expect(preview.agentVersion).toBe(2);
    expect(test.repository.insert).not.toHaveBeenCalled();
    expect(test.sendMessage).not.toHaveBeenCalled();
  });
  it('rejects a changed paid preview before a preparation receipt is created', async () => {
    const test = fixture();
    test.repository.findOneBy.mockResolvedValueOnce(null);
    await expect(
      test.service.prepare(workspace, memberId, userWorkspaceId, {
        ...test.reply.input,
        text: '',
        agentId: identifier('20'),
        sourceIds: [test.reply.input.replyToMessageId],
        previewFingerprint: 'f'.repeat(64),
        agentVersion: 2,
        pricingRevision: 3,
      }),
    ).rejects.toThrow(/preview changed/);
    expect(test.repository.insert).not.toHaveBeenCalled();
    expect(test.sendMessage).not.toHaveBeenCalled();
  });
  it('claims once across duplicate workers and calls the provider outside the transaction', async () => {
    const test = fixture();
    await Promise.all([
      test.service.execute(test.reply.id),
      test.service.execute(test.reply.id),
    ]);
    expect(test.sendMessage).toHaveBeenCalledTimes(1);
    expect(test.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'client@example.invalid',
        headerMessageId: test.reply.headerMessageId,
        threadExternalId: 'gmail-thread',
        html: '',
      }),
      test.scoped.account,
    );
    expect(test.reply.status).toBe('SENT');
    expect(test.reply.providerMessageId).toBe('provider-sent-id');
  });
  it('rechecks revoked owner or delegated sender rights despite a previously accepted send request', async () => {
    const test = fixture();
    test.bound.mockRejectedValueOnce(new Error('Owner consent revoked'));
    await test.service.execute(test.reply.id);
    expect(test.sendMessage).not.toHaveBeenCalled();
    expect(test.reply.status).toBe('FAILED');
    expect(test.reply.problem).toBe('NOT_SENT_ACCESS_OR_SOURCE_CHANGED');
  });
  it('does not dispatch a reply whose reviewed thread changed', async () => {
    const test = fixture();
    test.scoped.thread.sourceFingerprint = 'e'.repeat(64);
    await test.service.execute(test.reply.id);
    expect(test.sendMessage).not.toHaveBeenCalled();
    expect(test.reply.status).toBe('FAILED');
  });
  it('retains an ambiguous provider result and never blindly sends it again', async () => {
    const test = fixture();
    test.sendMessage.mockRejectedValueOnce(
      new Error('Socket closed after possible acceptance'),
    );
    await test.service.execute(test.reply.id);
    expect(test.reply.status).toBe('UNCERTAIN');
    await test.service.execute(test.reply.id);
    expect(test.sendMessage).toHaveBeenCalledTimes(1);
  });
  it('treats a lost local sent receipt as uncertain even after provider success', async () => {
    const test = fixture();
    test.refuseSentCommit();
    await test.service.execute(test.reply.id);
    expect(test.reply.status).toBe('UNCERTAIN');
    expect(test.sendMessage).toHaveBeenCalledTimes(1);
    await test.service.execute(test.reply.id);
    expect(test.sendMessage).toHaveBeenCalledTimes(1);
  });
  it('requires exact positive synced sent-mail evidence; absence and ambiguity cannot authorize retry', async () => {
    const test = fixture();
    test.reply.status = 'UNCERTAIN';
    await test.service.reconcile(workspace, memberId, userWorkspaceId, {
      id: test.reply.id,
    });
    expect(test.reply.status).toBe('UNCERTAIN');
    test.query.mockResolvedValueOnce([
      { externalId: 'first' },
      { externalId: 'second' },
    ]);
    await test.service.reconcile(workspace, memberId, userWorkspaceId, {
      id: test.reply.id,
    });
    expect(test.reply.status).toBe('UNCERTAIN');
    test.query.mockResolvedValueOnce([
      { externalId: 'one-exact-provider-message' },
    ]);
    await test.service.reconcile(workspace, memberId, userWorkspaceId, {
      id: test.reply.id,
    });
    expect(test.reply.status).toBe('SENT');
    expect(test.reply.providerMessageId).toBe('one-exact-provider-message');
    expect(test.sendMessage).not.toHaveBeenCalled();
  });
});

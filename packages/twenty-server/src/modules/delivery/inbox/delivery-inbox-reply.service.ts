import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { sanitizeOutboundEmailSubject } from 'src/engine/core-modules/email/utils/sanitize-outbound-email-html.util';
import { DeliveryBusinessService } from 'src/modules/delivery/business/delivery-business.service';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryInboxService } from './delivery-inbox.service';
import { DeliveryInboxReplyEntity } from './entities/delivery-inbox-reply.entity';
import { DeliveryInboxConsentEntity } from './entities/delivery-inbox-consent.entity';
import { assertInboxRequestUnused } from './assert-inbox-request-unused';
import {
  inboxCursor,
  inboxHash,
  parseInbox,
  publicInboxMessage,
  readInboxCursor,
} from './delivery-inbox.policy';
import {
  INBOX_PAGE_SIZE,
  inboxCancelSchema,
  inboxDraftPreviewSchema,
  inboxMessagesSchema,
  inboxPrepareSchema,
  inboxRequestSchema,
  inboxSelectionSchema,
  inboxSendSchema,
  type InboxDraftPreviewInput,
  type InboxPrepareInput,
  type InboxReceipt,
  type InboxReplyBody,
} from './delivery-inbox.types';

export const DELIVERY_INBOX_SEND_JOB = 'delivery-inbox-send';

@Injectable()
export class DeliveryInboxReplyService {
  constructor(
    private readonly inbox: DeliveryInboxService,
    private readonly business: DeliveryBusinessService,
    private readonly outbound: MessagingMessageOutboundService,
    @InjectMessageQueue(MessageQueue.messagingQueue)
    private readonly queue: MessageQueueService,
  ) {}

  private async current(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    replyId: string,
  ) {
    const reply = await manager
      .getRepository(DeliveryInboxReplyEntity)
      .findOneBy({ workspaceId: workspace.id, id: replyId });
    if (!reply) throw new ForbiddenException('This reply is unavailable.');
    const source = await this.inbox.bound(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      reply.conversationId,
    );
    if (source.binding.id !== reply.bindingId)
      throw new ForbiddenException(
        'This reply belongs to a different thread binding.',
      );
    return { reply, source };
  }
  private async result(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    replyId: string,
  ) {
    const { reply, source } = await this.current(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      replyId,
    );
    const current =
      reply.input.bindingRevision === source.binding.revision &&
      reply.input.sourceFingerprint === source.thread.sourceFingerprint;
    return {
      ...this.inbox.identity(
        workspace,
        memberId,
        userWorkspaceId,
        source.actor,
        {
          bindingRevision: source.binding.revision,
          conversationRevision: source.conversation.revision,
        },
      ),
      id: reply.id,
      conversationId: reply.conversationId,
      status: reply.status,
      body: reply.body
        ? {
            to: reply.body.to,
            subject: reply.body.subject,
            text: reply.body.text,
            replyToMessageId: reply.body.replyToMessageId,
            sourceIds: reply.body.sourceIds,
            agentId: reply.body.agentId,
          }
        : null,
      bodyFingerprint: reply.bodyFingerprint,
      sourceFingerprint: source.thread.sourceFingerprint,
      canSend: current && source.canSend && reply.status === 'DRAFT',
      canCancel:
        source.rights.draft &&
        (reply.actorId === memberId ||
          source.binding.ownerMemberId === memberId) &&
        ['GENERATING', 'DRAFT', 'QUEUED'].includes(reply.status),
      problem:
        !current && reply.status === 'DRAFT'
          ? 'SOURCE_OR_CONSENT_CHANGED_PREPARE_AGAIN'
          : reply.problem,
      createdAt: reply.createdAt.toISOString(),
      attemptedAt: reply.attemptedAt?.toISOString() ?? null,
      finishedAt: reply.finishedAt?.toISOString() ?? null,
    };
  }
  detail(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxSelectionSchema, raw);
    return this.inbox.read(workspace.id, (manager) =>
      this.result(manager, workspace, memberId, userWorkspaceId, input.id),
    );
  }
  history(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxMessagesSchema, raw);
    return this.inbox.read(workspace.id, async (manager) => {
      const source = await this.inbox.bound(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.conversationId,
      );
      const [metadata]: { count: number; fingerprint: string }[] =
        await manager.query(
          'SELECT count(*)::int AS count,md5(COALESCE(max("updatedAt")::text,\'\')||\':\'||count(*)::text) AS fingerprint FROM core."deliveryInboxReply" WHERE "workspaceId"=$1 AND "bindingId"=$2',
          [workspace.id, source.binding.id],
        );
      const identity = this.inbox.identity(
        workspace,
        memberId,
        userWorkspaceId,
        source.actor,
        {
          bindingRevision: source.binding.revision,
          conversationRevision: source.conversation.revision,
          fingerprint: metadata.fingerprint,
        },
      );
      const after = readInboxCursor(input.after, identity.scope);
      const items: {
        id: string;
        requestId: string;
        actorId: string;
        actorName: string | null;
        status: string;
        createdAt: string;
        problem: string | null;
      }[] = await manager.query(
        `SELECT reply.id,reply."requestId",reply."actorId",left(trim(concat_ws(' ',person."nameFirstName",person."nameLastName")),200) AS "actorName",reply.status,reply."createdAt"::text AS "createdAt",reply.problem FROM core."deliveryInboxReply" reply LEFT JOIN ${this.inbox.delivery.schema(workspace)}."workspaceMember" person ON person.id=reply."actorId" AND person."deletedAt" IS NULL WHERE reply."workspaceId"=$1 AND reply."bindingId"=$2 AND ($3::text IS NULL OR reply.id::text>$3) ORDER BY reply.id LIMIT $4`,
        [workspace.id, source.binding.id, after, INBOX_PAGE_SIZE + 1],
      );
      const selected = items.slice(0, INBOX_PAGE_SIZE);
      return {
        ...identity,
        items: selected,
        totalCount: metadata.count,
        nextCursor:
          items.length > INBOX_PAGE_SIZE
            ? inboxCursor(identity.scope, selected[selected.length - 1].id)
            : null,
      };
    });
  }
  async reconcile(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxSelectionSchema, raw);
    await this.inbox.write(workspace.id, async (manager) => {
      const { reply, source } = await this.current(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.id,
      );
      if (reply.status !== 'UNCERTAIN') return;
      const matches: { externalId: string }[] = await manager.query(
        `SELECT association."messageExternalId" AS "externalId" FROM ${this.inbox.delivery.schema(workspace)}."messageChannelMessageAssociation" association JOIN ${this.inbox.delivery.schema(workspace)}.message message ON message.id=association."messageId" WHERE association."messageChannelId"=$1 AND association."messageThreadExternalId"=$2 AND association.direction::text='OUTGOING' AND association."deletedAt" IS NULL AND message."deletedAt" IS NULL AND NOT message."isDraft" AND message."headerMessageId"=$3 LIMIT 2`,
        [
          source.channel.id,
          source.binding.threadExternalId,
          reply.headerMessageId,
        ],
      );
      if (matches.length !== 1 || !matches[0].externalId) return;
      await manager.getRepository(DeliveryInboxReplyEntity).update(
        { workspaceId: workspace.id, id: reply.id, status: 'UNCERTAIN' },
        {
          status: 'SENT',
          providerMessageId: matches[0].externalId,
          problem: null,
          finishedAt: new Date(),
        },
      );
      await this.activity(
        manager,
        workspace.id,
        memberId,
        reply,
        source.binding.projectId,
        'INBOX_REPLY_RECONCILED',
        'SUCCEEDED',
      );
    });
    return this.detail(workspace, memberId, userWorkspaceId, input);
  }
  request(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxRequestSchema, raw);
    return this.inbox.read(workspace.id, async (manager) => {
      const actor = await this.inbox.delivery.actor(
        workspace,
        memberId,
        userWorkspaceId,
        manager,
      );
      const identity = this.inbox.identity(
        workspace,
        memberId,
        userWorkspaceId,
        actor,
      );
      const consent = await manager
        .getRepository(DeliveryInboxConsentEntity)
        .findOneBy({ workspaceId: workspace.id, id: input.requestId });
      if (consent) {
        if (
          consent.receipt.actorId !== memberId ||
          consent.receipt.userWorkspaceId !== userWorkspaceId
        )
          throw new ForbiddenException(
            'This receipt belongs to its original operator.',
          );
        await this.inbox.conversationRecord(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          consent.receipt.conversationId,
        );
        return { ...identity, receipt: consent.receipt, reply: null };
      }
      const reply = await manager
        .getRepository(DeliveryInboxReplyEntity)
        .findOne({
          where: [
            { workspaceId: workspace.id, requestId: input.requestId },
            { workspaceId: workspace.id, sendRequestId: input.requestId },
            { workspaceId: workspace.id, cancelRequestId: input.requestId },
          ],
        });
      if (!reply) return { ...identity, receipt: null, reply: null };
      const receipt =
        reply.requestId === input.requestId
          ? reply.preparationReceipt
          : reply.sendRequestId === input.requestId
            ? reply.sendReceipt
            : reply.cancelReceipt;
      if (
        !receipt ||
        receipt.actorId !== memberId ||
        receipt.userWorkspaceId !== userWorkspaceId
      )
        throw new ForbiddenException(
          'This receipt belongs to its original operator.',
        );
      return {
        ...identity,
        receipt,
        reply: await this.result(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          reply.id,
        ),
      };
    });
  }
  private async prepareBody(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: InboxPrepareInput,
  ) {
    const source = await this.inbox.bound(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      input.conversationId,
      'draft',
    );
    if (
      source.binding.revision !== input.bindingRevision ||
      source.thread.sourceFingerprint !== input.sourceFingerprint
    )
      throw new ConflictException(
        'The thread or owner consent changed. Refresh before preparing this reply.',
      );
    const [message] = await this.inbox.gmail.selected(
      manager,
      workspace,
      source.channel.id,
      source.binding.threadExternalId,
      [input.replyToMessageId],
    );
    const to = this.inbox.gmail.replyRecipient(message, source.account);
    const body: InboxReplyBody = {
      to,
      subject: await sanitizeOutboundEmailSubject(
        /^re:/i.test(message.subject)
          ? message.subject
          : `Re: ${message.subject}`,
      ),
      text: input.text,
      inReplyTo: message.headerMessageId!,
      threadExternalId: source.binding.threadExternalId,
      replyToMessageId: message.id,
      sourceIds: input.sourceIds,
      agentId: input.agentId ?? null,
    };
    return { source, body };
  }
  private async selectedDraftSources(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: InboxPrepareInput,
  ) {
    const { source, body } = await this.prepareBody(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      input,
    );
    const messages = await this.inbox.gmail.selected(
      manager,
      workspace,
      source.channel.id,
      source.binding.threadExternalId,
      input.sourceIds,
    );
    if (messages.some((message) => message.textTruncated))
      throw new BadRequestException(
        'A selected message is too long. Choose complete messages.',
      );
    for (const message of messages)
      this.inbox.gmail.replyRecipient(message, source.account);
    const sources = messages.map((message) => ({
      id: message.id,
      text: message.text,
      sourceUrl: null,
    }));
    if (JSON.stringify(sources).length > 20000)
      throw new BadRequestException(
        'Select fewer messages for this reply draft.',
      );
    return { source, sources, messages, body };
  }
  private async quote(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: InboxDraftPreviewInput,
  ) {
    const { source, sources, messages, body } = await this.selectedDraftSources(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      { ...input, requestId: input.id, text: '' },
    );
    const quoted = await this.business.previewConnectedInboxDraft(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      source.conversation,
      input.agentId,
      input.id,
    );
    const bodyFingerprint = inboxHash(input);
    return {
      ...this.inbox.identity(
        workspace,
        memberId,
        userWorkspaceId,
        source.actor,
        {
          bindingRevision: source.binding.revision,
          conversationRevision: source.conversation.revision,
        },
      ),
      ...quoted,
      bodyFingerprint,
      previewFingerprint: inboxHash({
        bodyFingerprint,
        sourceFingerprint: source.thread.sourceFingerprint,
        sources,
        agentVersion: quoted.agentVersion,
        modelId: quoted.modelId,
        pricingRevision: quoted.budget.pricingRevision,
        maximumCostUsd: quoted.budget.maximumCostUsd,
      }),
      sourceCount: sources.length,
      sources: messages.map(publicInboxMessage),
      to: body.to,
      subject: body.subject,
    };
  }
  preview(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxDraftPreviewSchema, raw);
    return this.inbox.write(workspace.id, (manager) =>
      this.quote(manager, workspace, memberId, userWorkspaceId, input),
    );
  }
  async prepare(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxPrepareSchema, raw);
    const inputHash = inboxHash(input);
    const created = await this.inbox.write(workspace.id, async (manager) => {
      const { source, body } = await this.prepareBody(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input,
      );
      const prior = await manager
        .getRepository(DeliveryInboxReplyEntity)
        .findOneBy({ requestId: input.requestId, workspaceId: workspace.id });
      if (prior) {
        if (
          prior.inputHash !== inputHash ||
          prior.actorId !== memberId ||
          prior.userWorkspaceId !== userWorkspaceId ||
          prior.id !== input.id
        )
          throw new ConflictException(
            'This preparation request belongs to another exact reply.',
          );
        return {
          created: false,
          conversationRevision: source.conversation.revision,
        };
      }
      if (input.agentId) {
        const preview = await this.quote(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          {
            id: input.id,
            conversationId: input.conversationId,
            bindingRevision: input.bindingRevision,
            sourceFingerprint: input.sourceFingerprint,
            replyToMessageId: input.replyToMessageId,
            agentId: input.agentId,
            sourceIds: input.sourceIds,
          },
        );
        if (
          !preview.budget.budgetReady ||
          preview.previewFingerprint !== input.previewFingerprint ||
          preview.agentVersion !== input.agentVersion ||
          preview.budget.pricingRevision !== input.pricingRevision
        )
          throw new ConflictException(
            'The reply context, assistant or budget preview changed. Preview again before generating.',
          );
      }
      await assertInboxRequestUnused(manager, input.requestId);
      const receipt: InboxReceipt = {
        requestId: input.requestId,
        action: 'PREPARED',
        actorId: memberId,
        userWorkspaceId,
        conversationId: input.conversationId,
        bindingId: source.binding.id,
        replyId: input.id,
        bodyFingerprint: inputHash,
        createdAt: new Date().toISOString(),
      };
      await manager.getRepository(DeliveryInboxReplyEntity).insert({
        id: input.id,
        workspaceId: workspace.id,
        requestId: input.requestId,
        bindingId: source.binding.id,
        conversationId: input.conversationId,
        actorId: memberId,
        userWorkspaceId,
        inputHash,
        input,
        body: input.agentId ? null : body,
        bodyFingerprint: input.agentId ? null : inboxHash(body),
        status: input.agentId ? 'GENERATING' : 'DRAFT',
        headerMessageId: `<otogrow-inbox-${input.id}@otogrow.invalid>`,
        preparationReceipt: receipt,
        sendRequestId: null,
        sendInputHash: null,
        sendReceipt: null,
        cancelRequestId: null,
        cancelReceipt: null,
        providerMessageId: null,
        problem: null,
        attemptedAt: null,
        finishedAt: null,
      });
      return {
        created: true,
        conversationRevision: source.conversation.revision,
      };
    });
    if (created.created && input.agentId) {
      try {
        await this.business.draftForConnectedInbox(
          workspace,
          memberId,
          userWorkspaceId,
          {
            id: input.conversationId,
            revision: created.conversationRevision,
            agentId: input.agentId,
            sourceIds: input.sourceIds,
          },
          {
            runId: input.id,
            quote: {
              agentVersion: input.agentVersion!,
              pricingRevision: input.pricingRevision!,
            },
            read: async (manager) => {
              const reply = await manager
                .getRepository(DeliveryInboxReplyEntity)
                .findOneBy({ workspaceId: workspace.id, id: input.id });
              if (reply?.status !== 'GENERATING')
                throw new ConflictException(
                  'This AI reply draft is no longer running.',
                );
              return (
                await this.selectedDraftSources(
                  manager,
                  workspace,
                  memberId,
                  userWorkspaceId,
                  input,
                )
              ).sources;
            },
            commit: async (manager, text) => {
              const { body } = await this.prepareBody(
                manager,
                workspace,
                memberId,
                userWorkspaceId,
                input,
              );
              const completed = { ...body, text };
              const result = await manager
                .getRepository(DeliveryInboxReplyEntity)
                .update(
                  {
                    workspaceId: workspace.id,
                    id: input.id,
                    status: 'GENERATING',
                  },
                  {
                    body: completed,
                    bodyFingerprint: inboxHash(completed),
                    status: 'DRAFT',
                  },
                );
              if (result.affected !== 1)
                throw new ConflictException(
                  'This AI reply draft stopped before its result could be saved.',
                );
            },
          },
        );
      } catch (error) {
        await this.inbox.write(workspace.id, (manager) =>
          manager.getRepository(DeliveryInboxReplyEntity).update(
            { workspaceId: workspace.id, id: input.id, status: 'GENERATING' },
            {
              status: 'FAILED',
              problem: 'DRAFT_FAILED_OR_ACCESS_CHANGED',
              finishedAt: new Date(),
            },
          ),
        );
        throw error;
      }
    }
    return this.request(workspace, memberId, userWorkspaceId, {
      requestId: input.requestId,
    });
  }
  async send(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxSendSchema, raw);
    const queued = await this.inbox.write(workspace.id, async (manager) => {
      const { reply } = await this.current(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.id,
      );
      const source = await this.inbox.bound(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        reply.conversationId,
        'send',
      );
      const inputHash = inboxHash(input);
      if (reply.sendRequestId) {
        if (
          reply.sendRequestId !== input.requestId ||
          reply.sendInputHash !== inputHash ||
          reply.sendReceipt?.actorId !== memberId ||
          reply.sendReceipt.userWorkspaceId !== userWorkspaceId
        )
          throw new ConflictException(
            'This prepared reply already has a different send request. Check its result.',
          );
        return false;
      }
      await assertInboxRequestUnused(manager, input.requestId);
      if (
        reply.status !== 'DRAFT' ||
        !reply.body ||
        !reply.bodyFingerprint ||
        input.bodyFingerprint !== reply.bodyFingerprint ||
        input.sourceFingerprint !== source.thread.sourceFingerprint ||
        input.sourceFingerprint !== reply.input.sourceFingerprint ||
        reply.input.bindingRevision !== source.binding.revision
      )
        throw new ConflictException(
          'Review the current thread, exact text, recipient and consent before sending.',
        );
      const { body } = await this.prepareBody(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        { ...reply.input, text: reply.body.text },
      );
      if (
        body.to !== reply.body.to ||
        body.subject !== reply.body.subject ||
        body.inReplyTo !== reply.body.inReplyTo
      )
        throw new ConflictException(
          'The original reply recipient or message identity changed. Prepare a new reply.',
        );
      const receipt: InboxReceipt = {
        requestId: input.requestId,
        action: 'SEND_REQUESTED',
        actorId: memberId,
        userWorkspaceId,
        conversationId: reply.conversationId,
        bindingId: reply.bindingId,
        replyId: reply.id,
        bodyFingerprint: inputHash,
        createdAt: new Date().toISOString(),
      };
      await manager.getRepository(DeliveryInboxReplyEntity).update(
        { workspaceId: workspace.id, id: reply.id, status: 'DRAFT' },
        {
          status: 'QUEUED',
          sendRequestId: input.requestId,
          sendInputHash: inputHash,
          sendReceipt: receipt,
        },
      );
      await this.activity(
        manager,
        workspace.id,
        memberId,
        reply,
        source.binding.projectId,
        'INBOX_REPLY_QUEUED',
        'QUEUED',
      );
      return true;
    });
    if (queued) await this.enqueue(input.id);
    return this.request(workspace, memberId, userWorkspaceId, {
      requestId: input.requestId,
    });
  }
  private async enqueue(replyId: string) {
    try {
      await this.queue.add(
        DELIVERY_INBOX_SEND_JOB,
        { replyId },
        { retryLimit: 0 },
      );
    } catch {
      /* The committed QUEUED row is recovered; a queue outage cannot turn a send into another request. */
    }
  }
  async cancel(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxCancelSchema, raw);
    const generating = await this.inbox.write(workspace.id, async (manager) => {
      const { reply, source } = await this.current(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.id,
      );
      if (
        !source.rights.draft ||
        (reply.actorId !== memberId &&
          source.binding.ownerMemberId !== memberId)
      )
        throw new ForbiddenException(
          'Only the draft author or Gmail owner can cancel this reply.',
        );
      if (reply.cancelRequestId) {
        if (
          reply.cancelRequestId !== input.requestId ||
          reply.cancelReceipt?.actorId !== memberId ||
          reply.cancelReceipt.userWorkspaceId !== userWorkspaceId
        )
          throw new ConflictException(
            'A different cancellation already exists.',
          );
        return false;
      }
      await assertInboxRequestUnused(manager, input.requestId);
      if (!['GENERATING', 'DRAFT', 'QUEUED'].includes(reply.status))
        throw new ConflictException(
          'This send has already started or finished. It cannot safely be recalled.',
        );
      const receipt: InboxReceipt = {
        requestId: input.requestId,
        action: 'CANCELLED',
        actorId: memberId,
        userWorkspaceId,
        conversationId: reply.conversationId,
        bindingId: reply.bindingId,
        replyId: reply.id,
        bodyFingerprint: inboxHash(input),
        createdAt: new Date().toISOString(),
      };
      await manager.getRepository(DeliveryInboxReplyEntity).update(
        { workspaceId: workspace.id, id: reply.id },
        {
          status: 'CANCELLED',
          cancelRequestId: input.requestId,
          cancelReceipt: receipt,
          finishedAt: new Date(),
        },
      );
      await this.activity(
        manager,
        workspace.id,
        memberId,
        reply,
        source.binding.projectId,
        'INBOX_REPLY_CANCELLED',
        'CANCELLED',
      );
      return reply.status === 'GENERATING';
    });
    if (generating)
      await this.business.failConnectedInboxDraft(workspace.id, input.id);
    return this.request(workspace, memberId, userWorkspaceId, {
      requestId: input.requestId,
    });
  }
  private activity(
    manager: EntityManager,
    workspaceId: string,
    actorId: string | null,
    reply: DeliveryInboxReplyEntity,
    projectId: string,
    action: string,
    outcome: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED',
  ) {
    return recordOtogrowActivity(manager, {
      workspaceId,
      actorId,
      actorType: actorId ? 'HUMAN' : 'SYSTEM',
      category: 'BUSINESS',
      action,
      outcome,
      summary:
        'Updated a human-requested email reply delivery status. Message text and addresses are excluded.',
      sourceType: 'conversation',
      sourceId: reply.conversationId,
      projectId,
      changes: [{ field: 'state', before: reply.status, after: outcome }],
    });
  }
  async execute(replyId: string) {
    const row = await this.inbox.dataSource
      .getRepository(DeliveryInboxReplyEntity)
      .findOneBy({ id: replyId });
    if (!row || row.status !== 'QUEUED') return;
    const workspace = await this.inbox.dataSource
      .getRepository(WorkspaceEntity)
      .findOneBy({ id: row.workspaceId });
    if (!workspace) return;
    let claimed: {
      reply: DeliveryInboxReplyEntity;
      account: ConnectedAccountEntity;
      body: InboxReplyBody;
      attemptedAt: Date;
      projectId: string;
    } | null;
    try {
      claimed = await this.inbox.write(workspace.id, async (manager) => {
        const reply = await manager
          .getRepository(DeliveryInboxReplyEntity)
          .findOneBy({ workspaceId: workspace.id, id: replyId });
        if (reply?.status !== 'QUEUED') return null;
        const receipt = reply.sendReceipt;
        if (!receipt || !reply.body || !reply.bodyFingerprint)
          throw new ConflictException('Missing reviewed send request.');
        const source = await this.inbox.bound(
          manager,
          workspace,
          receipt.actorId,
          receipt.userWorkspaceId,
          reply.conversationId,
          'send',
        );
        if (
          source.binding.revision !== reply.input.bindingRevision ||
          source.thread.sourceFingerprint !== reply.input.sourceFingerprint ||
          inboxHash(reply.body) !== reply.bodyFingerprint
        )
          throw new ConflictException(
            'Source or consent changed before dispatch.',
          );
        const { body } = await this.prepareBody(
          manager,
          workspace,
          receipt.actorId,
          receipt.userWorkspaceId,
          { ...reply.input, text: reply.body.text },
        );
        if (
          body.to !== reply.body.to ||
          body.subject !== reply.body.subject ||
          body.inReplyTo !== reply.body.inReplyTo
        )
          throw new ConflictException('Reply identity changed.');
        const attemptedAt = new Date();
        await manager
          .getRepository(DeliveryInboxReplyEntity)
          .update(
            { workspaceId: workspace.id, id: replyId, status: 'QUEUED' },
            { status: 'SENDING', attemptedAt },
          );
        await this.activity(
          manager,
          workspace.id,
          receipt.actorId,
          reply,
          source.binding.projectId,
          'INBOX_REPLY_DISPATCHED',
          'RUNNING',
        );
        return {
          reply,
          account: source.account,
          body: reply.body,
          attemptedAt,
          projectId: source.binding.projectId,
        };
      });
    } catch {
      await this.inbox.write(workspace.id, (manager) =>
        manager.getRepository(DeliveryInboxReplyEntity).update(
          { workspaceId: workspace.id, id: replyId, status: 'QUEUED' },
          {
            status: 'FAILED',
            problem: 'NOT_SENT_ACCESS_OR_SOURCE_CHANGED',
            finishedAt: new Date(),
          },
        ),
      );
      return;
    }
    if (!claimed) return;
    try {
      const sent = await this.outbound.sendMessage(
        {
          to: claimed.body.to,
          subject: claimed.body.subject,
          body: claimed.body.text,
          html: '',
          inReplyTo: claimed.body.inReplyTo,
          references: [claimed.body.inReplyTo],
          threadExternalId: claimed.body.threadExternalId,
          headerMessageId: claimed.reply.headerMessageId,
        },
        claimed.account,
      );
      await this.inbox.write(workspace.id, async (manager) => {
        const current = await manager
          .getRepository(DeliveryInboxReplyEntity)
          .findOneBy({ workspaceId: workspace.id, id: replyId });
        if (
          !current ||
          !['SENDING', 'UNCERTAIN'].includes(current.status) ||
          current.attemptedAt?.getTime() !== claimed.attemptedAt.getTime()
        )
          return;
        await manager.getRepository(DeliveryInboxReplyEntity).update(
          { workspaceId: workspace.id, id: replyId },
          {
            status: 'SENT',
            providerMessageId: sent.messageExternalId ?? null,
            problem: null,
            finishedAt: new Date(),
          },
        );
        await this.activity(
          manager,
          workspace.id,
          claimed.reply.sendReceipt!.actorId,
          current,
          claimed.projectId,
          'INBOX_REPLY_SENT',
          'SUCCEEDED',
        );
      });
    } catch {
      await this.inbox.write(workspace.id, (manager) =>
        manager.getRepository(DeliveryInboxReplyEntity).update(
          { workspaceId: workspace.id, id: replyId, status: 'SENDING' },
          {
            status: 'UNCERTAIN',
            problem: 'DELIVERY_UNCERTAIN_CHECK_SENT_MAIL_DO_NOT_RESEND',
            finishedAt: new Date(),
          },
        ),
      );
    }
  }
  @Cron('*/30 * * * * *')
  async recover(now = new Date()) {
    const pending = await this.inbox.dataSource
      .getRepository(DeliveryInboxReplyEntity)
      .createQueryBuilder('reply')
      .select(['reply.id', 'reply.workspaceId', 'reply.status'])
      .where('reply.status IN (:...statuses)', {
        statuses: ['SENDING', 'GENERATING'],
      })
      .orderBy('reply.updatedAt', 'ASC')
      .take(100)
      .getMany();
    for (const row of pending) {
      const timedOut = await this.inbox.write(
        row.workspaceId,
        async (manager) => {
          const reply = await manager
            .getRepository(DeliveryInboxReplyEntity)
            .findOneBy({ workspaceId: row.workspaceId, id: row.id });
          if (
            !reply ||
            reply.status !== row.status ||
            reply.updatedAt.getTime() > now.getTime() - 300000
          )
            return false;
          await manager.getRepository(DeliveryInboxReplyEntity).update(
            { workspaceId: row.workspaceId, id: row.id, status: row.status },
            {
              status: row.status === 'SENDING' ? 'UNCERTAIN' : 'FAILED',
              problem:
                row.status === 'SENDING'
                  ? 'DELIVERY_UNCERTAIN_CHECK_SENT_MAIL_DO_NOT_RESEND'
                  : 'DRAFT_INTERRUPTED_NO_EMAIL_SENT',
              finishedAt: now,
            },
          );
          return true;
        },
      );
      if (timedOut && row.status === 'GENERATING')
        await this.business.failConnectedInboxDraft(row.workspaceId, row.id);
    }
    const queued = await this.inbox.dataSource
      .getRepository(DeliveryInboxReplyEntity)
      .find({
        where: { status: 'QUEUED' },
        select: { id: true },
        order: { createdAt: 'ASC' },
        take: 100,
      });
    for (const reply of queued) await this.enqueue(reply.id);
  }
}

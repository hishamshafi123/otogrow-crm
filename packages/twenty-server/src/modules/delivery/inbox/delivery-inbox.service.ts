import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { v5 } from 'uuid';
import { escapeForIlike, isValidUuid } from 'twenty-shared/utils';
import {
  ConnectedAccountProvider,
  MessageChannelType,
} from 'twenty-shared/types';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { canReadBusinessRecord } from 'src/modules/delivery/business/delivery-business.policy';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { OtogrowRoleEntity } from 'src/modules/otogrow-access/entities/otogrow-role.entity';
import { OTOGROW_DEFAULT_ROLES } from 'src/modules/otogrow-access/otogrow-access.types';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryInboxGmailService } from './gmail/delivery-inbox-gmail.service';
import { DeliveryInboxBindingEntity } from './entities/delivery-inbox-binding.entity';
import { DeliveryInboxConsentEntity } from './entities/delivery-inbox-consent.entity';
import { assertInboxRequestUnused } from './assert-inbox-request-unused';
import {
  INBOX_CONVERSATIONS_SQL,
  inboxVisibleConversationsSql,
} from './inbox-conversation-sql';
import {
  assertInboxConsentWithinConversation,
  inboxCursor,
  inboxHash,
  inboxMessagePosition,
  inboxRights,
  parseInbox,
  publicInboxMessage,
  readInboxCursor,
  readInboxMessagePosition,
} from './delivery-inbox.policy';
import {
  INBOX_PAGE_SIZE,
  inboxConsentSchema,
  inboxMessagesSchema,
  inboxPageSchema,
  inboxRevokeSchema,
  inboxSelectionSchema,
  inboxThreadsSchema,
  type InboxConversation,
  type InboxGrant,
  type InboxReceipt,
} from './delivery-inbox.types';

type InboxActor = Awaited<ReturnType<DeliveryService['actor']>>;

@Injectable()
export class DeliveryInboxService {
  constructor(
    @InjectDataSource() readonly dataSource: DataSource,
    readonly delivery: DeliveryService,
    readonly gmail: DeliveryInboxGmailService,
  ) {}

  identity(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    actor: InboxActor,
    source: unknown = null,
  ) {
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      actor,
      scope: inboxHash({
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        actor,
        source,
      }),
      observedAt: new Date().toISOString(),
    };
  }
  read<TOutput>(
    workspaceId: string,
    callback: (manager: EntityManager) => Promise<TOutput>,
    manager?: EntityManager,
  ) {
    return readDeliverySnapshot(
      this.dataSource,
      workspaceId,
      callback,
      manager,
    );
  }
  async write<TOutput>(
    workspaceId: string,
    callback: (manager: EntityManager) => Promise<TOutput>,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${workspaceId}`],
        );
        return callback(manager);
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      )
        throw new ConflictException(
          'This inbox identity was already used. Check the exact request before trying again.',
        );
      throw error;
    }
  }
  context(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    return this.read(workspace.id, async (manager) => {
      const actor = await this.delivery.actor(
        workspace,
        memberId,
        userWorkspaceId,
        manager,
      );
      return {
        ...this.identity(workspace, memberId, userWorkspaceId, actor),
        canManageConversations: actor.isAdmin,
      };
    });
  }
  async conversationRecord(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    id: string,
  ) {
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    const [row]: { record: InboxConversation }[] = await manager.query(
      `${INBOX_CONVERSATIONS_SQL} AND item.value->>'id'=$2`,
      [workspace.id, id],
    );
    if (!row || !canReadBusinessRecord(row.record, actor, new Set()))
      throw new ForbiddenException(
        'This conversation is outside your current access.',
      );
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id: row.record.projectId });
    if (!project)
      throw new ForbiddenException('This conversation project is unavailable.');
    return { actor, conversation: row.record, project };
  }
  async bound(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    conversationId: string,
    permission: 'read' | 'draft' | 'send' = 'read',
  ) {
    const scoped = await this.conversationRecord(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      conversationId,
    );
    const binding = await manager
      .getRepository(DeliveryInboxBindingEntity)
      .findOneBy({ workspaceId: workspace.id, conversationId });
    if (
      !binding?.enabled ||
      scoped.conversation.channel !== 'EMAIL' ||
      scoped.conversation.ownerId !== binding.ownerMemberId ||
      scoped.project.id !== binding.projectId ||
      scoped.project.companyId !== binding.companyId
    )
      throw new ForbiddenException(
        'The Gmail thread is disconnected or its original client, owner or project changed.',
      );
    const rights = inboxRights(
      scoped.conversation,
      scoped.actor,
      binding.ownerMemberId,
      binding.consent.grants,
    );
    if (!rights[permission])
      throw new ForbiddenException(
        'The Gmail owner has not consented to this action for your current conversation permissions.',
      );
    const { account } = await this.gmail.account(
      manager,
      workspace,
      binding.ownerMemberId,
      binding.ownerUserWorkspaceId,
      binding.accountId,
    );
    const channel = await this.gmail.channel(
      manager,
      workspace.id,
      account.id,
      binding.channelId,
    );
    const thread = await this.gmail.thread(
      manager,
      workspace,
      account,
      channel,
      binding.threadExternalId,
    );
    const canSend =
      rights.send &&
      (await this.gmail.sendingAllowed(
        workspace.id,
        binding.ownerUserWorkspaceId,
        account,
      ));
    if (permission === 'send' && !canSend)
      throw new ForbiddenException(
        'The Gmail owner must restore the connection and native email sending permission before a reply can be sent.',
      );
    return { ...scoped, binding, rights, account, channel, thread, canSend };
  }
  private summary(
    conversation: InboxConversation,
    connected: boolean,
    projectName: string,
  ) {
    return {
      id: conversation.id,
      revision: conversation.revision,
      title: conversation.title,
      channel: conversation.channel,
      projectId: conversation.projectId,
      projectName,
      ownerId: conversation.ownerId,
      private: conversation.private,
      connected,
    };
  }
  private async grantNames(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    grants: InboxGrant[],
  ) {
    const members: { id: string; name: string }[] = await manager.query(
      `SELECT id,left(trim(concat_ws(' ',"nameFirstName","nameLastName")),200) AS name FROM ${this.delivery.schema(workspace)}."workspaceMember" WHERE id=ANY($1::uuid[]) AND "deletedAt" IS NULL`,
      [
        grants
          .filter((grant) => grant.kind === 'MEMBER')
          .map((grant) => grant.id),
      ],
    );
    const roles = await manager
      .getRepository(OtogrowRoleEntity)
      .findBy({ workspaceId: workspace.id });
    return grants.map((grant) => ({
      ...grant,
      name:
        grant.kind === 'MEMBER'
          ? (members.find((member) => member.id === grant.id)?.name ??
            'Unavailable person')
          : (roles.find((role) => role.id === grant.id)?.name ??
            OTOGROW_DEFAULT_ROLES.find(
              (role) =>
                v5(`otogrow-role:${role.key}`, workspace.id) === grant.id,
            )?.name ??
            'Unavailable role'),
    }));
  }
  async conversation(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxSelectionSchema, raw);
    return this.read(workspace.id, async (manager) => {
      const scoped = await this.conversationRecord(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.id,
      );
      const binding = await manager
        .getRepository(DeliveryInboxBindingEntity)
        .findOneBy({ workspaceId: workspace.id, conversationId: input.id });
      const owner = scoped.conversation.ownerId === memberId;
      const available =
        owner && !scoped.conversation.private
          ? [
              ...scoped.conversation.grants.map((grant) => ({
                kind: 'MEMBER' as const,
                id: grant.memberId,
                read: grant.read,
                draft: grant.send,
                send: false,
              })),
              ...(scoped.conversation.roleGrants ?? []).map((grant) => ({
                kind: 'ROLE' as const,
                id: grant.roleId,
                read: grant.read,
                draft: grant.send,
                send: false,
              })),
            ].filter((grant) => grant.read)
          : [];
      let connected = null;
      if (binding) {
        if (
          binding.ownerMemberId !== memberId &&
          (!binding.enabled ||
            !inboxRights(
              scoped.conversation,
              scoped.actor,
              binding.ownerMemberId,
              binding.consent.grants,
            ).read)
        )
          throw new ForbiddenException(
            'This Gmail conversation is no longer shared with you.',
          );
        const source = binding.enabled
          ? await this.bound(
              manager,
              workspace,
              memberId,
              userWorkspaceId,
              input.id,
            )
          : null;
        if (!source && !owner) throw new ForbiddenException();
        const account =
          source?.account ??
          (
            await this.gmail.account(
              manager,
              workspace,
              binding.ownerMemberId,
              binding.ownerUserWorkspaceId,
              binding.accountId,
            )
          ).account;
        connected = {
          id: binding.id,
          revision: binding.revision,
          enabled: binding.enabled,
          accountId: binding.accountId,
          channelId: binding.channelId,
          threadExternalId: binding.threadExternalId,
          accountHandle: account.handle,
          ownerMemberId: binding.ownerMemberId,
          canConsent: owner,
          canRead: source?.rights.read ?? false,
          canDraft: source?.rights.draft ?? false,
          canSend: source?.canSend ?? false,
          problem: !binding.enabled
            ? 'OWNER_CONSENT_REVOKED'
            : source?.account.authFailedAt
              ? 'RECONNECT_GMAIL'
              : !source?.channel.isSyncEnabled
                ? 'NATIVE_SYNC_PAUSED'
                : null,
          syncedAt: source?.channel.syncedAt?.toISOString() ?? null,
          syncStatus: source?.channel.syncStatus ?? 'UNAVAILABLE',
          grants: owner
            ? await this.grantNames(manager, workspace, binding.consent.grants)
            : [],
        };
      }
      return {
        ...this.identity(workspace, memberId, userWorkspaceId, scoped.actor, {
          conversation: scoped.conversation,
          bindingRevision: binding?.revision ?? 0,
        }),
        conversation: this.summary(
          scoped.conversation,
          binding?.enabled ?? false,
          scoped.project.name,
        ),
        binding: connected,
        availableGrants: await this.grantNames(manager, workspace, available),
      };
    });
  }
  async conversations(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxPageSchema, raw);
    return this.read(workspace.id, async (manager) => {
      const actor = await this.delivery.actor(
        workspace,
        memberId,
        userWorkspaceId,
        manager,
      );
      const schema = this.delivery.schema(workspace);
      const sql = inboxVisibleConversationsSql(schema);
      const params = [
        workspace.id,
        memberId,
        actor.isAdmin,
        actor.roleIds ?? [],
        input.search ? `%${escapeForIlike(input.search)}%` : '',
        ConnectedAccountProvider.GOOGLE,
        MessageChannelType.EMAIL,
      ];
      const [metadata]: { count: number; fingerprint: string }[] =
        await manager.query(
          `${sql} SELECT count(*)::int AS count,md5(COALESCE(string_agg((record->>'id')||':'||(record->>'revision')||':'||COALESCE("bindingRevision"::text,''),'|' ORDER BY record->>'id'),'')) AS fingerprint FROM visible`,
          params,
        );
      const identity = this.identity(
        workspace,
        memberId,
        userWorkspaceId,
        actor,
        { search: input.search, fingerprint: metadata.fingerprint },
      );
      const after = readInboxCursor(input.after, identity.scope);
      const rows: {
        record: InboxConversation;
        connected: boolean | null;
        projectName: string;
      }[] = await manager.query(
        `${sql} SELECT record,connected,(SELECT left(project.name,200) FROM core."deliveryProject" project WHERE project."workspaceId"=$1 AND project.id::text=record->>'projectId') AS "projectName" FROM visible WHERE ($8::text IS NULL OR record->>'id'>$8) ORDER BY record->>'id' LIMIT $9`,
        [...params, after, INBOX_PAGE_SIZE + 1],
      );
      const items = rows
        .slice(0, INBOX_PAGE_SIZE)
        .map((row) =>
          this.summary(row.record, row.connected ?? false, row.projectName),
        );
      return {
        ...identity,
        items,
        totalCount: metadata.count,
        nextCursor:
          rows.length > INBOX_PAGE_SIZE
            ? inboxCursor(identity.scope, items[items.length - 1].id)
            : null,
      };
    });
  }
  async accounts(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxPageSchema, raw);
    return this.read(workspace.id, async (manager) => {
      const actor = await this.delivery.actor(
        workspace,
        memberId,
        userWorkspaceId,
        manager,
      );
      const query = manager
        .getRepository(ConnectedAccountEntity)
        .createQueryBuilder('account')
        .where(
          'account."workspaceId"=:workspaceId AND account."userWorkspaceId"=:userWorkspaceId AND account.provider=:provider AND account."archivedAt" IS NULL',
          {
            workspaceId: workspace.id,
            userWorkspaceId,
            provider: ConnectedAccountProvider.GOOGLE,
          },
        );
      if (input.search)
        query.andWhere('account.handle ILIKE :search', {
          search: `%${escapeForIlike(input.search)}%`,
        });
      const totalCount = await query.getCount();
      const identity = this.identity(
        workspace,
        memberId,
        userWorkspaceId,
        actor,
        { search: input.search, totalCount },
      );
      const after = readInboxCursor(input.after, identity.scope);
      if (after && !isValidUuid(after))
        throw new BadRequestException('Invalid Gmail account page.');
      if (after) query.andWhere('account.id > :after', { after });
      const accounts = await query
        .orderBy('account.id', 'ASC')
        .take(INBOX_PAGE_SIZE + 1)
        .getMany();
      const items = await Promise.all(
        accounts.slice(0, INBOX_PAGE_SIZE).map(async (account) => {
          const channels = await manager
            .getRepository(MessageChannelEntity)
            .findBy({
              workspaceId: workspace.id,
              connectedAccountId: account.id,
              type: MessageChannelType.EMAIL,
            });
          return {
            id: account.id,
            handle: account.handle,
            needsReconnect: Boolean(account.authFailedAt),
            canSend: await this.gmail.sendingAllowed(
              workspace.id,
              userWorkspaceId,
              account,
            ),
            syncEnabled: channels.some((channel) => channel.isSyncEnabled),
            syncedAt:
              channels
                .map((channel) => channel.syncedAt?.toISOString())
                .filter((value): value is string => Boolean(value))
                .sort()
                .pop() ?? null,
          };
        }),
      );
      return {
        ...identity,
        items,
        totalCount,
        nextCursor:
          accounts.length > INBOX_PAGE_SIZE
            ? inboxCursor(identity.scope, items[items.length - 1].id)
            : null,
      };
    });
  }
  async threads(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxThreadsSchema, raw);
    return this.read(workspace.id, async (manager) => {
      const { account, actor } = await this.gmail.account(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.accountId,
      );
      const schema = this.delivery.schema(workspace);
      const sql = `FROM ${schema}."messageChannelMessageAssociation" association JOIN ${schema}.message message ON message.id=association."messageId" JOIN core."messageChannel" channel ON channel.id=association."messageChannelId" AND channel."workspaceId"=$1 AND channel."connectedAccountId"=$2 AND channel.type=$3 WHERE association."deletedAt" IS NULL AND message."deletedAt" IS NULL AND NOT message."isDraft" AND association."messageThreadExternalId" IS NOT NULL AND association."messageThreadExternalId"<>'' AND ($4='' OR message.subject ILIKE $4)`;
      const params = [
        workspace.id,
        account.id,
        MessageChannelType.EMAIL,
        input.search ? `%${escapeForIlike(input.search)}%` : '',
      ];
      const [metadata]: { count: number; fingerprint: string }[] =
        await manager.query(
          `SELECT count(DISTINCT (channel.id,association."messageThreadExternalId"))::int AS count,md5(COALESCE(max(message."updatedAt")::text,'')||':'||count(*)::text) AS fingerprint ${sql}`,
          params,
        );
      const identity = this.identity(
        workspace,
        memberId,
        userWorkspaceId,
        actor,
        {
          accountId: account.id,
          search: input.search,
          fingerprint: metadata.fingerprint,
        },
      );
      const after = readInboxCursor(input.after, identity.scope);
      const rows: {
        channelId: string;
        threadExternalId: string;
        key: string;
      }[] = await manager.query(
        `SELECT DISTINCT channel.id AS "channelId",association."messageThreadExternalId" AS "threadExternalId",channel.id::text||':'||association."messageThreadExternalId" AS key ${sql} AND ($5::text IS NULL OR channel.id::text||':'||association."messageThreadExternalId">$5) ORDER BY key LIMIT $6`,
        [...params, after, INBOX_PAGE_SIZE + 1],
      );
      const items = await Promise.all(
        rows
          .slice(0, INBOX_PAGE_SIZE)
          .map(async (row) =>
            this.gmail.thread(
              manager,
              workspace,
              account,
              await this.gmail.channel(
                manager,
                workspace.id,
                account.id,
                row.channelId,
              ),
              row.threadExternalId,
            ),
          ),
      );
      const selected =
        input.selectedChannelId && input.selectedThreadExternalId
          ? await this.gmail.thread(
              manager,
              workspace,
              account,
              await this.gmail.channel(
                manager,
                workspace.id,
                account.id,
                input.selectedChannelId,
              ),
              input.selectedThreadExternalId,
            )
          : null;
      return {
        ...identity,
        items,
        selected,
        totalCount: metadata.count,
        nextCursor:
          rows.length > INBOX_PAGE_SIZE
            ? inboxCursor(identity.scope, rows[INBOX_PAGE_SIZE - 1].key)
            : null,
      };
    });
  }
  async messages(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxMessagesSchema, raw);
    return this.read(workspace.id, async (manager) => {
      const scoped = await this.bound(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.conversationId,
      );
      const identity = this.identity(
        workspace,
        memberId,
        userWorkspaceId,
        scoped.actor,
        {
          conversationRevision: scoped.conversation.revision,
          bindingRevision: scoped.binding.revision,
          sourceFingerprint: scoped.thread.sourceFingerprint,
        },
      );
      const after = readInboxCursor(input.after, identity.scope);
      const position = readInboxMessagePosition(after);
      const rows = await this.gmail.messages(
        manager,
        workspace,
        scoped.channel.id,
        scoped.binding.threadExternalId,
        position,
        INBOX_PAGE_SIZE + 1,
      );
      const items = rows.slice(0, INBOX_PAGE_SIZE).map(publicInboxMessage);
      return {
        ...identity,
        conversationId: input.conversationId,
        sourceFingerprint: scoped.thread.sourceFingerprint,
        items,
        totalCount: scoped.thread.messageCount,
        nextCursor:
          rows.length > INBOX_PAGE_SIZE
            ? inboxCursor(
                identity.scope,
                inboxMessagePosition(items[items.length - 1]),
              )
            : null,
      };
    });
  }
  async consent(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxConsentSchema, raw);
    return this.write(workspace.id, async (manager) => {
      const { conversation, actor, project } = await this.conversationRecord(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.conversationId,
      );
      if (conversation.ownerId !== memberId || conversation.channel !== 'EMAIL')
        throw new ForbiddenException(
          'Only this email conversation’s current owner can consent to a Gmail thread.',
        );
      const { account } = await this.gmail.account(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        input.accountId,
      );
      const channel = await this.gmail.channel(
        manager,
        workspace.id,
        account.id,
        input.channelId,
      );
      const thread = await this.gmail.thread(
        manager,
        workspace,
        account,
        channel,
        input.threadExternalId,
      );
      const inputHash = inboxHash(input);
      const prior = await manager
        .getRepository(DeliveryInboxConsentEntity)
        .findOneBy({ id: input.requestId });
      if (prior) {
        if (
          prior.workspaceId !== workspace.id ||
          prior.inputHash !== inputHash ||
          prior.receipt.actorId !== memberId ||
          prior.receipt.userWorkspaceId !== userWorkspaceId
        )
          throw new ConflictException(
            'This request belongs to another consent.',
          );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, actor),
          receipt: prior.receipt,
          reply: null,
        };
      }
      if (
        conversation.revision !== input.conversationRevision ||
        thread.sourceFingerprint !== input.sourceFingerprint
      )
        throw new ConflictException(
          'The conversation permissions or imported thread changed. Review them again.',
        );
      await assertInboxRequestUnused(manager, input.requestId);
      assertInboxConsentWithinConversation(conversation, input.grants);
      const repository = manager.getRepository(DeliveryInboxBindingEntity);
      const current = await repository.findOneBy({ id: input.id });
      if (
        current &&
        (current.workspaceId !== workspace.id ||
          current.conversationId !== conversation.id ||
          current.ownerMemberId !== memberId ||
          current.ownerUserWorkspaceId !== userWorkspaceId ||
          current.accountId !== account.id ||
          current.channelId !== channel.id ||
          current.threadExternalId !== input.threadExternalId ||
          current.projectId !== project.id ||
          current.companyId !== project.companyId)
      )
        throw new ForbiddenException(
          'An existing thread binding cannot be moved to another account, client or conversation.',
        );
      if ((current?.revision ?? 0) !== input.revision)
        throw new ConflictException(
          'The owner consent changed. Refresh before changing it.',
        );
      const snapshot = {
        conversationRevision: conversation.revision,
        ownerMemberId: memberId,
        ownerUserWorkspaceId: userWorkspaceId,
        accountId: account.id,
        channelId: channel.id,
        threadExternalId: input.threadExternalId,
        projectId: project.id,
        companyId: project.companyId,
        accountHandle: account.handle,
        sourceFingerprint: thread.sourceFingerprint,
        grants: input.grants,
        historyAndFutureReplies: true as const,
      };
      const revision = input.revision + 1;
      if (current)
        await repository.update(
          {
            workspaceId: workspace.id,
            id: current.id,
            revision: input.revision,
          },
          { enabled: true, revision, consent: snapshot },
        );
      else
        await repository.insert({
          id: input.id,
          workspaceId: workspace.id,
          conversationId: conversation.id,
          accountId: account.id,
          channelId: channel.id,
          threadExternalId: input.threadExternalId,
          ownerMemberId: memberId,
          ownerUserWorkspaceId: userWorkspaceId,
          projectId: project.id,
          companyId: project.companyId,
          revision,
          enabled: true,
          consent: snapshot,
        });
      const receipt: InboxReceipt = {
        requestId: input.requestId,
        action: 'CONSENTED',
        actorId: memberId,
        userWorkspaceId,
        conversationId: conversation.id,
        bindingId: input.id,
        replyId: null,
        bodyFingerprint: inputHash,
        createdAt: new Date().toISOString(),
      };
      await manager.getRepository(DeliveryInboxConsentEntity).insert({
        id: input.requestId,
        workspaceId: workspace.id,
        bindingId: input.id,
        revision,
        inputHash,
        snapshot,
        receipt,
      });
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'BUSINESS',
        action: 'INBOX_THREAD_CONSENTED',
        outcome: 'RECORDED',
        summary:
          'The Gmail owner authorized selected conversation permissions for one exact email thread.',
        sourceType: 'conversation',
        sourceId: conversation.id,
        projectId: project.id,
        changes: [
          {
            field: 'revision',
            before: String(input.revision),
            after: String(revision),
          },
        ],
      });
      return {
        ...this.identity(workspace, memberId, userWorkspaceId, actor),
        receipt,
        reply: null,
      };
    });
  }
  async revoke(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    raw: unknown,
  ) {
    const input = parseInbox(inboxRevokeSchema, raw);
    return this.write(workspace.id, async (manager) => {
      const actor = await this.delivery.actor(
        workspace,
        memberId,
        userWorkspaceId,
        manager,
      );
      const binding = await manager
        .getRepository(DeliveryInboxBindingEntity)
        .findOneBy({ workspaceId: workspace.id, id: input.id });
      if (!binding || (binding.ownerMemberId !== memberId && !actor.isAdmin))
        throw new ForbiddenException(
          'Only the original owner or an administrator can withdraw this connection.',
        );
      const inputHash = inboxHash(input);
      const prior = await manager
        .getRepository(DeliveryInboxConsentEntity)
        .findOneBy({ id: input.requestId });
      if (prior) {
        if (
          prior.workspaceId !== workspace.id ||
          prior.inputHash !== inputHash ||
          prior.receipt.actorId !== memberId ||
          prior.receipt.userWorkspaceId !== userWorkspaceId ||
          prior.receipt.action !== 'REVOKED'
        )
          throw new ConflictException(
            'This request belongs to another action.',
          );
        return {
          ...this.identity(workspace, memberId, userWorkspaceId, actor),
          receipt: prior.receipt,
          reply: null,
        };
      }
      if (binding.revision !== input.revision)
        throw new ConflictException(
          'The consent changed. Refresh before revoking it.',
        );
      await assertInboxRequestUnused(manager, input.requestId);
      await manager.getRepository(DeliveryInboxBindingEntity).update(
        {
          workspaceId: workspace.id,
          id: binding.id,
          revision: input.revision,
        },
        { enabled: false, revision: input.revision + 1 },
      );
      const receipt: InboxReceipt = {
        requestId: input.requestId,
        action: 'REVOKED',
        actorId: memberId,
        userWorkspaceId,
        conversationId: binding.conversationId,
        bindingId: binding.id,
        replyId: null,
        bodyFingerprint: inputHash,
        createdAt: new Date().toISOString(),
      };
      await manager.getRepository(DeliveryInboxConsentEntity).insert({
        id: input.requestId,
        workspaceId: workspace.id,
        bindingId: binding.id,
        revision: input.revision + 1,
        inputHash,
        snapshot: binding.consent,
        receipt,
      });
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'BUSINESS',
        action: 'INBOX_THREAD_REVOKED',
        outcome: 'RECORDED',
        summary: 'Withdrew OS access to the selected Gmail thread.',
        sourceType: 'conversation',
        sourceId: binding.conversationId,
        projectId: binding.projectId,
        changes: [
          {
            field: 'revision',
            before: String(input.revision),
            after: String(input.revision + 1),
          },
        ],
      });
      return {
        ...this.identity(workspace, memberId, userWorkspaceId, actor),
        receipt,
        reply: null,
      };
    });
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { PermissionFlagType } from 'twenty-shared/constants';
import {
  ConnectedAccountProvider,
  MessageChannelType,
} from 'twenty-shared/types';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { isConnectedAccountUsableByCaller } from 'src/engine/metadata-modules/connected-account/utils/is-connected-account-usable-by-caller.util';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { inboxHash, inboxEmail } from '../delivery-inbox.policy';
import {
  INBOX_MESSAGE_LIMIT,
  type InboxNativeMessage,
} from '../delivery-inbox.types';

@Injectable()
export class DeliveryInboxGmailService {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly permissions: PermissionsService,
  ) {}

  async account(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    accountId: string,
  ) {
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    const account = await manager
      .getRepository(ConnectedAccountEntity)
      .findOneBy({ id: accountId, workspaceId: workspace.id });
    // Workspace-shared account access does not authorize consenting on behalf of its owner.
    if (
      !account ||
      account.provider !== ConnectedAccountProvider.GOOGLE ||
      account.archivedAt ||
      account.userWorkspaceId !== userWorkspaceId ||
      !isConnectedAccountUsableByCaller({
        connectedAccount: account,
        userWorkspaceId,
      })
    )
      throw new ForbiddenException(
        'The original Gmail owner or connection is no longer available.',
      );
    return { account, actor };
  }

  async channel(
    manager: EntityManager,
    workspaceId: string,
    accountId: string,
    channelId: string,
  ) {
    const channel = await manager
      .getRepository(MessageChannelEntity)
      .findOneBy({
        id: channelId,
        workspaceId,
        connectedAccountId: accountId,
        type: MessageChannelType.EMAIL,
      });
    if (!channel)
      throw new ForbiddenException('This Gmail email channel is unavailable.');
    return channel;
  }

  async sendingAllowed(
    workspaceId: string,
    userWorkspaceId: string,
    account: ConnectedAccountEntity,
  ) {
    if (
      account.authFailedAt ||
      account.archivedAt ||
      !account.scopes?.some((scope) =>
        [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://mail.google.com/',
        ].includes(scope),
      )
    )
      return false;
    return this.permissions.userHasWorkspaceSettingPermission({
      workspaceId,
      userWorkspaceId,
      setting: PermissionFlagType.SEND_EMAIL_TOOL,
    });
  }

  private sourceSql(workspace: WorkspaceEntity) {
    const schema = this.delivery.schema(workspace);
    return `FROM ${schema}."messageChannelMessageAssociation" association JOIN ${schema}.message message ON message.id=association."messageId" WHERE association."messageChannelId"=$1 AND association."messageThreadExternalId"=$2 AND association."deletedAt" IS NULL AND message."deletedAt" IS NULL AND message."isDraft"=false`;
  }

  async thread(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    account: ConnectedAccountEntity,
    channel: MessageChannelEntity,
    threadExternalId: string,
  ) {
    const rows: {
      count: number;
      fingerprint: string;
      subject: string;
      latestAt: string | null;
    }[] = await manager.query(
      `SELECT count(*)::int AS count, md5(COALESCE(string_agg(md5(jsonb_build_array(message.id,message."updatedAt",association."updatedAt",message.subject,message.text,message."headerMessageId")::text),'' ORDER BY message.id),'')) AS fingerprint, (array_agg(left(COALESCE(message.subject,''),300) ORDER BY message."receivedAt" DESC NULLS LAST,message.id DESC))[1] AS subject,to_char(max(message."receivedAt") AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "latestAt" ${this.sourceSql(workspace)}`,
      [channel.id, threadExternalId],
    );
    const row = rows[0];
    if (!row?.count)
      throw new ForbiddenException(
        'This exact imported Gmail thread is unavailable. Wait for native email sync or select another thread.',
      );
    return {
      accountId: account.id,
      accountHandle: account.handle,
      channelId: channel.id,
      threadExternalId,
      subject: row.subject,
      messageCount: row.count,
      latestAt: row.latestAt,
      sourceFingerprint: inboxHash({
        accountId: account.id,
        ownerId: account.userWorkspaceId,
        handle: account.handle,
        channelId: channel.id,
        visibility: channel.visibility,
        threadExternalId,
        facts: row.fingerprint,
      }),
    };
  }

  private messageProjection(workspace: WorkspaceEntity) {
    const participants = `SELECT participant.id,participant.role,left(COALESCE(participant.handle,''),254) AS handle,left(participant."displayName",160) AS "displayName" FROM ${this.delivery.schema(workspace)}."messageParticipant" participant WHERE participant."messageId"=message.id AND participant."deletedAt" IS NULL AND lower(participant.role::text) IN ('from','to','cc') ORDER BY participant.id`;
    return `message.id,to_char(message."receivedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "receivedAt",left(COALESCE(message.subject,''),300) AS subject,left(COALESCE(message.text,''),$4) AS text,length(COALESCE(message.text,''))>$4 AS "textTruncated",message."headerMessageId",association."messageExternalId" AS "externalId",association.direction,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('role',participant.role,'handle',participant.handle,'displayName',participant."displayName") ORDER BY participant.id) FROM (${participants} LIMIT 100) participant),'[]'::jsonb) AS participants,
      EXISTS(SELECT 1 FROM (${participants} OFFSET 100 LIMIT 1) extra) AS "participantsTruncated"`;
  }

  async messages(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    channelId: string,
    threadExternalId: string,
    after: { id: string; receivedAt: string | null } | null,
    limit = 25,
  ) {
    const rows: InboxNativeMessage[] = await manager.query(
      `SELECT ${this.messageProjection(workspace)} ${this.sourceSql(workspace)}
       AND ($3::uuid IS NULL OR ($6::timestamptz IS NULL AND message."receivedAt" IS NULL AND message.id<$3) OR ($6::timestamptz IS NOT NULL AND (message."receivedAt" IS NULL OR message."receivedAt"<$6 OR (message."receivedAt"=$6 AND message.id<$3))))
       ORDER BY message."receivedAt" DESC NULLS LAST,message.id DESC LIMIT $5`,
      [
        channelId,
        threadExternalId,
        after?.id ?? null,
        INBOX_MESSAGE_LIMIT,
        limit,
        after?.receivedAt ?? null,
      ],
    );
    return rows;
  }

  async selected(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    channelId: string,
    threadExternalId: string,
    ids: string[],
  ) {
    if (!ids.length || ids.length > 10 || new Set(ids).size !== ids.length)
      throw new BadRequestException(
        'Select one to ten different messages from this conversation.',
      );
    const rows: InboxNativeMessage[] = await manager.query(
      `SELECT ${this.messageProjection(workspace)} ${this.sourceSql(workspace)} AND message.id=ANY($3::uuid[]) ORDER BY message.id LIMIT 11`,
      [channelId, threadExternalId, ids, INBOX_MESSAGE_LIMIT],
    );
    if (
      rows.length !== ids.length ||
      new Set(rows.map((row) => row.id)).size !== ids.length
    )
      throw new ForbiddenException(
        'A selected message is outside the exact consented Gmail thread or has an ambiguous association.',
      );
    return rows;
  }

  replyRecipient(message: InboxNativeMessage, account: ConnectedAccountEntity) {
    const senders = [
      ...new Set(
        message.participants
          .filter((participant) => participant.role.toLowerCase() === 'from')
          .map((participant) => inboxEmail(participant.handle)),
      ),
    ];
    const own = [account.handle, ...(account.handleAliases ?? [])].map(
      (handle) => handle.toLowerCase(),
    );
    if (
      message.direction !== 'INCOMING' ||
      message.participantsTruncated ||
      senders.length !== 1 ||
      own.includes(senders[0].toLowerCase()) ||
      !message.headerMessageId ||
      /[\r\n]/.test(message.headerMessageId) ||
      message.headerMessageId.length > 1000
    )
      throw new BadRequestException(
        'Choose an imported incoming message with one external sender and a valid reply identity.',
      );
    return senders[0];
  }
}

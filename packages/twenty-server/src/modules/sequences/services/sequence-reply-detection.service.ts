import { Injectable, type Type } from '@nestjs/common';

import { MessageParticipantRole } from 'twenty-shared/types';
import { MoreThan, type ObjectLiteral } from 'typeorm';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { ChannelMessageWorkspaceEntity } from 'src/modules/messaging/channels/standard-objects/channel-message.workspace-entity';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';

@Injectable()
export class SequenceReplyDetectionService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  private getSystemRepository<T extends ObjectLiteral>(
    workspaceId: string,
    entity: Type<T>,
  ) {
    return this.globalWorkspaceOrmManager.getRepository(workspaceId, entity, {
      shouldBypassPermissionChecks: true,
    });
  }

  // A reply on any channel (email thread participant or inbound WhatsApp/SMS)
  // stops the sequence for the person.
  async hasRepliedSince({
    workspaceId,
    personId,
    since,
  }: {
    workspaceId: string;
    personId: string;
    since: Date;
  }): Promise<boolean> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const participantRepository = await this.getSystemRepository(
          workspaceId,
          MessageParticipantWorkspaceEntity,
        );

        const emailReplyCount = await participantRepository
          .createQueryBuilder('participant')
          .innerJoin('participant.message', 'message')
          .innerJoin('message.messageChannelMessageAssociations', 'association')
          .where('participant.personId = :personId', { personId })
          .andWhere('participant.role = :role', {
            role: MessageParticipantRole.FROM,
          })
          .andWhere('association.direction = :direction', {
            direction: MessageDirection.INCOMING,
          })
          .andWhere('message.receivedAt > :since', { since })
          .getCount();

        if (emailReplyCount > 0) {
          return true;
        }

        const channelMessageRepository = await this.getSystemRepository(
          workspaceId,
          ChannelMessageWorkspaceEntity,
        );

        const channelReplyCount = await channelMessageRepository.count({
          where: {
            personId,
            direction: 'INBOUND',
            receivedAt: MoreThan(since),
          },
        });

        return channelReplyCount > 0;
      },
      buildSystemAuthContext(workspaceId),
    );
  }
}

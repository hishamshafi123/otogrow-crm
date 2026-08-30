import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailingDomainModule } from 'src/engine/core-modules/emailing-domain/emailing-domain.module';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { EmailingModule } from 'src/modules/emailing/emailing.module';
import { ChannelsModule } from 'src/modules/messaging/channels/channels.module';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';
import { TwilioConfigModule } from 'src/engine/metadata-modules/twilio-config/twilio-config.module';
import { SequenceSchedulerCronCommand } from 'src/modules/sequences/crons/commands/sequence-scheduler.cron.command';
import { SequenceResolver } from 'src/modules/sequences/resolvers/sequence.resolver';
import { SequenceEnrollmentService } from 'src/modules/sequences/services/sequence-enrollment.service';
import { SequenceReplyDetectionService } from 'src/modules/sequences/services/sequence-reply-detection.service';
import { SequenceSendService } from 'src/modules/sequences/services/sequence-send.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConnectedAccountEntity,
      UserWorkspaceEntity,
      WorkspaceEntity,
    ]),
    EmailingModule,
    EmailingDomainModule,
    MessagingSendManagerModule,
    ChannelsModule,
    TwilioConfigModule,
    PermissionsModule,
    TwentyConfigModule,
  ],
  providers: [
    SequenceEnrollmentService,
    SequenceSendService,
    SequenceReplyDetectionService,
    SequenceResolver,
    SequenceSchedulerCronCommand,
  ],
  exports: [
    SequenceEnrollmentService,
    SequenceSendService,
    SequenceSchedulerCronCommand,
  ],
})
export class SequencesModule {}

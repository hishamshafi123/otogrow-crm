import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { TwilioConfigModule } from 'src/engine/metadata-modules/twilio-config/twilio-config.module';
import { ObjectMetadataRepositoryModule } from 'src/engine/object-metadata-repository/object-metadata-repository.module';
import { ContactCreationManagerModule } from 'src/modules/contact-creation-manager/contact-creation-manager.module';
import { TwilioWebhookController } from 'src/modules/messaging/channels/controllers/twilio-webhook.controller';
import { ChannelMessageDriverFactory } from 'src/modules/messaging/channels/drivers/channel-message-driver.factory';
import { ChannelMessageTimelineService } from 'src/modules/messaging/channels/services/channel-message-timeline.service';
import { ChannelMessageWebhookService } from 'src/modules/messaging/channels/services/channel-message-webhook.service';
import { SendChannelMessageService } from 'src/modules/messaging/channels/services/send-channel-message.service';
import { TimelineActivityModule } from 'src/modules/timeline/timeline-activity.module';
import { TimelineActivityWorkspaceEntity } from 'src/modules/timeline/standard-objects/timeline-activity.workspace-entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ObjectMetadataEntity]),
    ObjectMetadataRepositoryModule.forFeature([
      TimelineActivityWorkspaceEntity,
    ]),
    TwilioConfigModule,
    ContactCreationManagerModule,
    TimelineActivityModule,
    ThrottlerModule,
    TwentyConfigModule,
  ],
  controllers: [TwilioWebhookController],
  providers: [
    ChannelMessageDriverFactory,
    SendChannelMessageService,
    ChannelMessageWebhookService,
    ChannelMessageTimelineService,
  ],
  exports: [SendChannelMessageService, ChannelMessageWebhookService],
})
export class ChannelsModule {}

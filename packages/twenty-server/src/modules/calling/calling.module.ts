import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { TwilioConfigModule } from 'src/engine/metadata-modules/twilio-config/twilio-config.module';
import { ObjectMetadataRepositoryModule } from 'src/engine/object-metadata-repository/object-metadata-repository.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { CallRecordingController } from 'src/modules/calling/controllers/call-recording.controller';
import { TwilioVoiceWebhookController } from 'src/modules/calling/controllers/twilio-voice-webhook.controller';
import { CallLogService } from 'src/modules/calling/services/call-log.service';
import { CallTimelineService } from 'src/modules/calling/services/call-timeline.service';
import { CallAccessService } from 'src/modules/calling/services/call-access.service';
import { OtogrowAccessModule } from 'src/modules/otogrow-access/otogrow-access.module';
import { ContactCreationManagerModule } from 'src/modules/contact-creation-manager/contact-creation-manager.module';
import { TimelineActivityModule } from 'src/modules/timeline/timeline-activity.module';
import { TimelineActivityWorkspaceEntity } from 'src/modules/timeline/standard-objects/timeline-activity.workspace-entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ObjectMetadataEntity]),
    ObjectMetadataRepositoryModule.forFeature([
      TimelineActivityWorkspaceEntity,
    ]),
    TwilioConfigModule,
    OtogrowAccessModule,
    ContactCreationManagerModule,
    TimelineActivityModule,
    ThrottlerModule,
    TwentyConfigModule,
    TokenModule,
    WorkspaceCacheStorageModule,
  ],
  controllers: [TwilioVoiceWebhookController, CallRecordingController],
  providers: [CallLogService, CallTimelineService, CallAccessService],
  exports: [CallLogService],
})
export class CallingModule {}

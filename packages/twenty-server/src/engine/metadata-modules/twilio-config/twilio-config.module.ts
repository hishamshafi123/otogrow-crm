import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecretEncryptionModule } from 'src/engine/core-modules/secret-encryption/secret-encryption.module';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { TwilioConfigEntity } from 'src/engine/metadata-modules/twilio-config/entities/twilio-config.entity';
import { TwilioCallingProvisioningService } from 'src/engine/metadata-modules/twilio-config/services/twilio-calling-provisioning.service';
import { TwilioConfigEncryptionService } from 'src/engine/metadata-modules/twilio-config/services/twilio-config-encryption.service';
import { TwilioClientService } from 'src/engine/metadata-modules/twilio-config/services/twilio-client.service';
import { TwilioVoiceTokenService } from 'src/engine/metadata-modules/twilio-config/services/twilio-voice-token.service';
import { TwilioConfigResolver } from 'src/engine/metadata-modules/twilio-config/twilio-config.resolver';
import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';
import { OtogrowAccessModule } from 'src/modules/otogrow-access/otogrow-access.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TwilioConfigEntity]),
    SecretEncryptionModule,
    TwentyConfigModule,
    PermissionsModule,
    OtogrowAccessModule,
  ],
  providers: [
    TwilioConfigService,
    TwilioConfigEncryptionService,
    TwilioClientService,
    TwilioVoiceTokenService,
    TwilioCallingProvisioningService,
    TwilioConfigResolver,
  ],
  exports: [TwilioConfigService, TwilioClientService],
})
export class TwilioConfigModule {}

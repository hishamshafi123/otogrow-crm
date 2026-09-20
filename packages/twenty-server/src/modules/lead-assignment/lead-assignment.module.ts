import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecretEncryptionModule } from 'src/engine/core-modules/secret-encryption/secret-encryption.module';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { SetterAssignmentEntity } from 'src/modules/lead-assignment/entities/setter-assignment.entity';
import { SetterProfileEntity } from 'src/modules/lead-assignment/entities/setter-profile.entity';
import { TelegramConfigEntity } from 'src/modules/lead-assignment/entities/telegram-config.entity';
import { LeadAssignmentJob } from 'src/modules/lead-assignment/jobs/lead-assignment.job';
import { LeadAssignmentPersonListener } from 'src/modules/lead-assignment/listeners/lead-assignment-person.listener';
import { LeadAssignmentResolver } from 'src/modules/lead-assignment/lead-assignment.resolver';
import { LeadAssignmentService } from 'src/modules/lead-assignment/services/lead-assignment.service';
import { SetterProfileService } from 'src/modules/lead-assignment/services/setter-profile.service';
import { TelegramConfigEncryptionService } from 'src/modules/lead-assignment/services/telegram-config-encryption.service';
import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import { TelegramService } from 'src/modules/lead-assignment/services/telegram.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SetterProfileEntity,
      TelegramConfigEntity,
      SetterAssignmentEntity,
    ]),
    SecretEncryptionModule,
    TwentyConfigModule,
    PermissionsModule,
  ],
  providers: [
    SetterProfileService,
    TelegramConfigService,
    TelegramConfigEncryptionService,
    TelegramService,
    LeadAssignmentService,
    LeadAssignmentJob,
    LeadAssignmentPersonListener,
    LeadAssignmentResolver,
  ],
  exports: [SetterProfileService, TelegramConfigService, TelegramService],
})
export class LeadAssignmentModule {}

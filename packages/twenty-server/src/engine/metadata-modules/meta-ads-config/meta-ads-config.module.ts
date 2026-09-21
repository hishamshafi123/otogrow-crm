import { KeyValuePairModule } from 'src/engine/core-modules/key-value-pair/key-value-pair.module';
import { KeyValuePairEntity } from 'src/engine/core-modules/key-value-pair/key-value-pair.entity';
import { MetaLeadFormReadService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-form-read.service';
import { MetaLeadFormEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-lead-form.entity';
import { MetaSheetLeadEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-sheet-lead.entity';
import { MetaLeadFormResolver } from 'src/engine/metadata-modules/meta-ads-config/meta-lead-form.resolver';
import { MetaLeadFormService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-form.service';
import { MetaSheetReaderService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-sheet-reader.service';
import { LeadAssignmentModule } from 'src/modules/lead-assignment/lead-assignment.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecretEncryptionModule } from 'src/engine/core-modules/secret-encryption/secret-encryption.module';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { MetaLeadgenWebhookController } from 'src/engine/metadata-modules/meta-ads-config/controllers/meta-leadgen-webhook.controller';
import { MetaAdsConfigEntity } from 'src/engine/metadata-modules/meta-ads-config/entities/meta-ads-config.entity';
import { MetaAdsConfigResolver } from 'src/engine/metadata-modules/meta-ads-config/meta-ads-config.resolver';
import { MetaAdsConfigService } from 'src/engine/metadata-modules/meta-ads-config/meta-ads-config.service';
import { MetaAdsConfigEncryptionService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-ads-config-encryption.service';
import { MetaGraphApiService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-graph-api.service';
import { MetaLeadIntakeService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-intake.service';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { ContactCreationManagerModule } from 'src/modules/contact-creation-manager/contact-creation-manager.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MetaAdsConfigEntity,
      MetaLeadFormEntity,
      MetaSheetLeadEntity,
      KeyValuePairEntity,
    ]),
    LeadAssignmentModule,
    KeyValuePairModule,
    SecretEncryptionModule,
    TwentyConfigModule,
    PermissionsModule,
    ThrottlerModule,
    ContactCreationManagerModule,
  ],
  controllers: [MetaLeadgenWebhookController],
  providers: [
    MetaLeadFormResolver,
    MetaLeadFormReadService,
    MetaLeadFormService,
    MetaSheetReaderService,
    MetaAdsConfigService,
    MetaAdsConfigEncryptionService,
    MetaGraphApiService,
    MetaLeadIntakeService,
    MetaAdsConfigResolver,
  ],
  exports: [MetaAdsConfigService, MetaLeadFormService],
})
export class MetaAdsConfigModule {}

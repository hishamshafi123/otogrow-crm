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
    TypeOrmModule.forFeature([MetaAdsConfigEntity]),
    SecretEncryptionModule,
    TwentyConfigModule,
    PermissionsModule,
    ThrottlerModule,
    ContactCreationManagerModule,
  ],
  controllers: [MetaLeadgenWebhookController],
  providers: [
    MetaAdsConfigService,
    MetaAdsConfigEncryptionService,
    MetaGraphApiService,
    MetaLeadIntakeService,
    MetaAdsConfigResolver,
  ],
  exports: [MetaAdsConfigService],
})
export class MetaAdsConfigModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtogrowAccessModule } from 'src/modules/otogrow-access/otogrow-access.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { DeliveryContentAccountEntity } from './entities/delivery-content-account.entity';
import { DeliveryContentPlanEntity } from './entities/delivery-content-plan.entity';
import { DeliveryContentVariantEntity } from './entities/delivery-content-variant.entity';
import { DeliveryContentVersionEntity } from './entities/delivery-content-version.entity';
import { DeliveryContentEventEntity } from './entities/delivery-content-event.entity';
import { DeliveryContentSourceService } from './delivery-content-source.service';
import { DeliveryContentReadsService } from './delivery-content-reads.service';
import { DeliveryContentService } from './delivery-content.service';
import { DeliveryContentResolver } from './delivery-content.resolver';
@Module({
  imports: [
    OtogrowAccessModule,
    WorkspaceCacheModule,
    TypeOrmModule.forFeature([
      DeliveryContentAccountEntity,
      DeliveryContentPlanEntity,
      DeliveryContentVariantEntity,
      DeliveryContentVersionEntity,
      DeliveryContentEventEntity,
    ]),
  ],
  providers: [
    DeliveryContentSourceService,
    DeliveryContentReadsService,
    DeliveryContentService,
    DeliveryContentResolver,
  ],
  exports: [DeliveryContentService],
})
export class DeliveryContentModule {}

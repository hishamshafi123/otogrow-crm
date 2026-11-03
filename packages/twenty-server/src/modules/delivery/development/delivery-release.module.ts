import { DeliveryReleaseSourceService } from './delivery-release-source.service';
import { DeliveryReleaseReadsService } from './delivery-release-reads.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtogrowAccessModule } from 'src/modules/otogrow-access/otogrow-access.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { DeliveryReleaseEntity } from './entities/delivery-release.entity';
import { DeliveryReleaseVersionEntity } from './entities/delivery-release-version.entity';
import { DeliveryReleaseEventEntity } from './entities/delivery-release-event.entity';
import { DeliveryReleaseService } from './delivery-release.service';
import { DeliveryReleaseResolver } from './delivery-release.resolver';
@Module({
  imports: [
    OtogrowAccessModule,
    WorkspaceCacheModule,
    TypeOrmModule.forFeature([
      DeliveryReleaseEntity,
      DeliveryReleaseVersionEntity,
      DeliveryReleaseEventEntity,
    ]),
  ],
  providers: [
    DeliveryReleaseSourceService,
    DeliveryReleaseReadsService,
    DeliveryReleaseService,
    DeliveryReleaseResolver,
  ],
  exports: [DeliveryReleaseService],
})
export class DeliveryReleaseModule {}

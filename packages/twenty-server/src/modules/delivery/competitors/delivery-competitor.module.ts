import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtogrowAccessModule } from 'src/modules/otogrow-access/otogrow-access.module';
import { DeliveryCompetitorSourceEntity } from './entities/delivery-competitor-source.entity';
import { DeliveryCompetitorSourceVersionEntity } from './entities/delivery-competitor-source-version.entity';
import { DeliveryCompetitorSourceEventEntity } from './entities/delivery-competitor-source-event.entity';
import { DeliveryCompetitorSourceService } from './delivery-competitor-source.service';
import { DeliveryCompetitorReadsService } from './delivery-competitor-reads.service';
import { DeliveryCompetitorService } from './delivery-competitor.service';
import { DeliveryCompetitorResolver } from './delivery-competitor.resolver';

@Module({
  imports: [
    OtogrowAccessModule,
    TypeOrmModule.forFeature([
      DeliveryCompetitorSourceEntity,
      DeliveryCompetitorSourceVersionEntity,
      DeliveryCompetitorSourceEventEntity,
    ]),
  ],
  providers: [
    DeliveryCompetitorSourceService,
    DeliveryCompetitorReadsService,
    DeliveryCompetitorService,
    DeliveryCompetitorResolver,
  ],
  exports: [DeliveryCompetitorService],
})
export class DeliveryCompetitorModule {}

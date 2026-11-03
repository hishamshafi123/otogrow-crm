import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtogrowAccessModule } from 'src/modules/otogrow-access/otogrow-access.module';
import { DeliverySeoReportEntity } from './entities/delivery-seo-report.entity';
import { DeliverySeoVersionEntity } from './entities/delivery-seo-version.entity';
import { DeliverySeoEventEntity } from './entities/delivery-seo-event.entity';
import { DeliverySeoResultsService } from './delivery-seo-results.service';
import { DeliverySeoResultsResolver } from './delivery-seo-results.resolver';
@Module({
  imports: [
    OtogrowAccessModule,
    TypeOrmModule.forFeature([
      DeliverySeoReportEntity,
      DeliverySeoVersionEntity,
      DeliverySeoEventEntity,
    ]),
  ],
  providers: [DeliverySeoResultsService, DeliverySeoResultsResolver],
  exports: [DeliverySeoResultsService],
})
export class DeliverySeoResultsModule {}

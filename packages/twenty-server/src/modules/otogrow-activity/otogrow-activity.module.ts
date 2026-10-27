import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OtogrowAccessModule } from 'src/modules/otogrow-access/otogrow-access.module';
import { OtogrowActivityEventEntity } from 'src/modules/otogrow-activity/entities/otogrow-activity-event.entity';
import { OtogrowActivityResolver } from 'src/modules/otogrow-activity/otogrow-activity.resolver';
import { OtogrowActivityService } from 'src/modules/otogrow-activity/otogrow-activity.service';

@Module({
  imports: [
    OtogrowAccessModule,
    TypeOrmModule.forFeature([OtogrowActivityEventEntity]),
  ],
  providers: [OtogrowActivityService, OtogrowActivityResolver],
})
export class OtogrowActivityModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';
import { PortalPublicController } from 'src/modules/portal/controllers/portal-public.controller';
import { PortalAccessEntity } from 'src/modules/portal/entities/portal-access.entity';
import { PortalResolver } from 'src/modules/portal/portal.resolver';
import { PortalAccessService } from 'src/modules/portal/services/portal-access.service';
import { PortalDataService } from 'src/modules/portal/services/portal-data.service';
import { QuotingModule } from 'src/modules/quoting/quoting.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PortalAccessEntity]),
    ThrottlerModule,
    QuotingModule,
  ],
  controllers: [PortalPublicController],
  providers: [PortalAccessService, PortalDataService, PortalResolver],
  exports: [PortalAccessService],
})
export class PortalModule {}

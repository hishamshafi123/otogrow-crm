import { MeetingAvailabilityService } from 'src/modules/meeting-booking/services/meeting-availability.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { CalendarEventImportManagerModule } from 'src/modules/calendar/calendar-event-import-manager/calendar-event-import-manager.module';
import { MeetingBookingResolver } from 'src/modules/meeting-booking/meeting-booking.resolver';
import { MeetingBookingService } from 'src/modules/meeting-booking/services/meeting-booking.service';
import { OAuth2ClientManagerModule } from 'src/modules/connected-account/oauth2-client-manager/oauth2-client-manager.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConnectedAccountEntity, CalendarChannelEntity]),
    OAuth2ClientManagerModule,
    CalendarEventImportManagerModule,
  ],
  providers: [
    MeetingBookingService,
    MeetingBookingResolver,
    MeetingAvailabilityService,
  ],
  exports: [MeetingBookingService],
})
export class MeetingBookingModule {}

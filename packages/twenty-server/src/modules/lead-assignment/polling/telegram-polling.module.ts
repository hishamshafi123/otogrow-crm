import { Module } from '@nestjs/common';

import { LeadAssignmentModule } from 'src/modules/lead-assignment/lead-assignment.module';
import { TelegramPollerService } from 'src/modules/lead-assignment/polling/telegram-poller.service';

// Imported ONLY by QueueWorkerModule: the Telegram Bot API allows a single
// getUpdates consumer per bot token, and a long-polling loop has no place in
// the API process (it would also duplicate polls across API replicas).
@Module({
  imports: [LeadAssignmentModule],
  providers: [TelegramPollerService],
})
export class TelegramPollingModule {}

import { Module } from '@nestjs/common';

import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { FileUrlModule } from 'src/engine/core-modules/file/file-url/file-url.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { QuotingResolver } from 'src/modules/quoting/quoting.resolver';
import { QuoteNumberService } from 'src/modules/quoting/services/quote-number.service';
import { QuotePdfService } from 'src/modules/quoting/services/quote-pdf.service';
import { QuoteStatusService } from 'src/modules/quoting/services/quote-status.service';
import { QuoteTotalsService } from 'src/modules/quoting/services/quote-totals.service';
import { QuoteService } from 'src/modules/quoting/services/quote.service';

// FileStorageService is provided by a @Global() module.
@Module({
  imports: [FileUrlModule, ApplicationModule, PermissionsModule],
  providers: [
    QuoteService,
    QuoteNumberService,
    QuoteTotalsService,
    QuotePdfService,
    QuoteStatusService,
    QuotingResolver,
  ],
  exports: [QuoteTotalsService, QuotePdfService],
})
export class QuotingModule {}

import {
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { MetaAdsConfigModule } from 'src/engine/metadata-modules/meta-ads-config/meta-ads-config.module';
import { MetaLeadFormService } from 'src/engine/metadata-modules/meta-ads-config/services/meta-lead-form.service';

@Injectable()
class MetaSheetPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetaSheetPoller.name);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(private readonly service: MetaLeadFormService) {}

  onModuleInit() {
    void this.poll();
  }

  onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private async poll() {
    try {
      await this.service.syncActiveForms();
    } catch {
      this.logger.warn('Meta sheet polling failed; retrying in 30 seconds.');
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => void this.poll(), 30000);
    }
  }
}

@Module({ imports: [MetaAdsConfigModule], providers: [MetaSheetPoller] })
export class MetaSheetPollingModule {}

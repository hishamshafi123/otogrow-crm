import { DeliveryOperationsService } from 'src/modules/delivery/operations/delivery-operations.service';
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import { TelegramService } from 'src/modules/lead-assignment/services/telegram.service';

const SUPERVISOR_INTERVAL_MS = 30_000;
const ERROR_BACKOFF_MS = 5_000;
const LONG_POLL_TIMEOUT_SECONDS = 30;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable()
export class TelegramPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramPollerService.name);
  private isStopped = false;
  private readonly runningWorkspaceIds = new Set<string>();

  constructor(
    private readonly telegramConfigService: TelegramConfigService,
    private readonly telegramService: TelegramService,
    private readonly deliveryOperations: DeliveryOperationsService,
  ) {}

  onModuleInit() {
    // Fire-and-forget: the loop must never block Nest lifecycle
    void this.supervise();
  }

  onModuleDestroy() {
    this.isStopped = true;
  }

  private async supervise(): Promise<void> {
    while (!this.isStopped) {
      try {
        const configs = await this.telegramConfigService.findAllActive();

        for (const config of configs) {
          if (!this.runningWorkspaceIds.has(config.workspaceId)) {
            this.runningWorkspaceIds.add(config.workspaceId);
            void this.pollWorkspace(config.workspaceId);
          }
        }
      } catch (error) {
        this.logger.warn(
          `Telegram poller supervisor tick failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      await sleep(SUPERVISOR_INTERVAL_MS);
    }
  }

  private async pollWorkspace(workspaceId: string): Promise<void> {
    let offset = 0;

    while (!this.isStopped) {
      try {
        const config =
          await this.telegramConfigService.findByWorkspaceId(workspaceId);

        if (!isDefined(config) || !config.isActive) {
          this.runningWorkspaceIds.delete(workspaceId);

          return;
        }

        const botToken = this.telegramConfigService.decryptBotToken(config);
        const updates = await this.telegramService.getUpdates(
          botToken,
          offset,
          LONG_POLL_TIMEOUT_SECONDS,
        );

        for (const update of updates) {
          offset = update.update_id + 1;
          if (update.message?.text?.includes('delivery_')) {
            await this.deliveryOperations.handleTelegramUpdate(
              workspaceId,
              update,
            );
          } else {
            await this.telegramService.handleUpdate(config, update);
          }
        }
      } catch (error) {
        // A Telegram outage or bad token must never crash the worker
        this.logger.warn(
          `Telegram polling failed for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await sleep(ERROR_BACKOFF_MS);
      }
    }
  }
}

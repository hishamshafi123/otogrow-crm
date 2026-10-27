import { DeliveryChatService } from 'src/modules/delivery/chat/delivery-chat.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import axios from 'axios';
import { DataSource, LessThan } from 'typeorm';

import { DeliveryReminderOutboxEntity } from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import { DeliveryOperationsService } from 'src/modules/delivery/operations/delivery-operations.service';
import { DELIVERY_REMINDER_CLAIM_TIMEOUT } from 'src/modules/delivery/operations/delivery-reminder.constants';

@Injectable()
export class DeliveryReminderService {
  private readonly logger = new Logger(DeliveryReminderService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly operations: DeliveryOperationsService,
    private readonly chat: DeliveryChatService,
  ) {}

  async execute(outboxId: string, now = new Date()) {
    const owner = (await this.chat.ownsReminder(outboxId))
      ? this.chat
      : this.operations;
    const payload = await owner.claimReminder(outboxId, now);
    if (!payload) return;
    let status: 'SENT' | 'FAILED' | 'UNCERTAIN';
    let error: string | null = null;
    // Telegram has no idempotency key; a committed claim is never sent twice.
    try {
      const response = await axios.post(
        `https://api.telegram.org/bot${payload.botToken}/sendMessage`,
        {
          chat_id: payload.chatId,
          text: payload.text,
          link_preview_options: { is_disabled: true },
        },
        { timeout: 10000, maxRedirects: 0, proxy: false },
      );
      status = response.data?.ok === true ? 'SENT' : 'FAILED';
      if (status === 'FAILED') error = 'Telegram rejected the notification.';
    } catch (failure) {
      status =
        axios.isAxiosError(failure) &&
        failure.response &&
        failure.response.status >= 400 &&
        failure.response.status < 500
          ? 'FAILED'
          : 'UNCERTAIN';
      error =
        status === 'FAILED'
          ? 'Telegram rejected the notification. Check the bot connection.'
          : 'Delivery is uncertain. Check Telegram before following up; no automatic resend.';
    }
    await owner.finishReminder(outboxId, status, error, new Date());
  }

  @Cron('*/30 * * * * *')
  async recover(now = new Date()) {
    try {
      await this.chat.queueDue(now);
    } catch {
      this.logger.warn(
        'Team chat reminder scheduling failed; the next pass will retry.',
      );
    }
    const repository = this.dataSource.getRepository(
      DeliveryReminderOutboxEntity,
    );
    const expiredBefore = new Date(
      now.getTime() - DELIVERY_REMINDER_CLAIM_TIMEOUT,
    );
    const interrupted = await repository.find({
      where: { status: 'SENDING', attemptedAt: LessThan(expiredBefore) },
      order: { attemptedAt: 'ASC' },
      take: 100,
    });
    for (const entry of interrupted) {
      try {
        const owner = (await this.chat.ownsReminder(entry.id))
          ? this.chat
          : this.operations;
        await owner.finishReminder(
          entry.id,
          'UNCERTAIN',
          'Worker interrupted after claiming send. Check Telegram before any manual follow-up; no automatic resend.',
          now,
          expiredBefore,
        );
      } catch {
        this.logger.warn(
          'Telegram reminder recovery could not reconcile a claimed job.',
        );
      }
    }
    const queued = await repository.find({
      where: { status: 'QUEUED' },
      order: { createdAt: 'ASC' },
      take: 100,
    });
    for (const entry of queued) await this.operations.enqueueReminder(entry.id);
  }
}

import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { TelegramConfigEntity } from 'src/modules/lead-assignment/entities/telegram-config.entity';
import { SetterProfileService } from 'src/modules/lead-assignment/services/setter-profile.service';
import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import {
  formatLeadTelegramMessage,
  type LeadTelegramMessageInput,
} from 'src/modules/lead-assignment/utils/format-lead-telegram-message.util';

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
};

export type TelegramBotInfo = {
  id: number;
  username: string;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly telegramConfigService: TelegramConfigService,
    private readonly setterProfileService: SetterProfileService,
  ) {}

  async getMe(botToken: string): Promise<TelegramBotInfo> {
    return this.callTelegramApi<TelegramBotInfo>(botToken, 'getMe', {});
  }

  async sendMessage(
    botToken: string,
    chatId: string,
    text: string,
  ): Promise<void> {
    await this.callTelegramApi(botToken, 'sendMessage', {
      chat_id: chatId,
      text,
    });
  }

  async getUpdates(
    botToken: string,
    offset: number,
    timeoutSeconds: number,
  ): Promise<TelegramUpdate[]> {
    return this.callTelegramApi<TelegramUpdate[]>(botToken, 'getUpdates', {
      offset,
      timeout: timeoutSeconds,
    });
  }

  async sendLeadAssignmentMessage(
    config: TelegramConfigEntity,
    chatId: string,
    messageInput: LeadTelegramMessageInput,
  ): Promise<void> {
    const botToken = this.telegramConfigService.decryptBotToken(config);

    await this.sendMessage(
      botToken,
      chatId,
      formatLeadTelegramMessage(messageInput),
    );
  }

  // Only '/start <workspaceMemberId>' (the deep link shown in Settings) is
  // handled; every other message is noise for a notification-only bot.
  async handleUpdate(
    config: TelegramConfigEntity,
    update: TelegramUpdate,
  ): Promise<void> {
    const text = update.message?.text;
    const chatId = update.message?.chat.id;

    if (!isDefined(text) || !text.startsWith('/start') || !isDefined(chatId)) {
      return;
    }

    const workspaceMemberId = text.slice('/start'.length).trim();
    const botToken = this.telegramConfigService.decryptBotToken(config);

    if (!isNonEmptyString(workspaceMemberId)) {
      await this.sendMessage(
        botToken,
        String(chatId),
        'Open your personal link from Settings → Setters & Telegram to link your account.',
      );

      return;
    }

    const profile = await this.setterProfileService.setTelegramChatId(
      config.workspaceId,
      workspaceMemberId,
      String(chatId),
    );

    if (!isDefined(profile)) {
      this.logger.warn(
        `Telegram /start received for unknown workspace member ${workspaceMemberId} in workspace ${config.workspaceId}`,
      );

      return;
    }

    await this.sendMessage(
      botToken,
      String(chatId),
      'Telegram linked. You will now receive new lead assignments here.',
    );
  }

  private async callTelegramApi<T>(
    botToken: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(
      `${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const payload = (await response.json()) as TelegramApiResponse<T>;

    if (!response.ok || !payload.ok || !isDefined(payload.result)) {
      throw new Error(
        `Telegram API ${method} failed: ${payload.description ?? response.status}`,
      );
    }

    return payload.result;
  }
}

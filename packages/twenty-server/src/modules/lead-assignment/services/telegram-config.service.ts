import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { type Repository } from 'typeorm';

import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { type UpsertTelegramConfigInput } from 'src/modules/lead-assignment/dtos/upsert-telegram-config.input';
import { TelegramConfigEntity } from 'src/modules/lead-assignment/entities/telegram-config.entity';
import { TelegramConfigEncryptionService } from 'src/modules/lead-assignment/services/telegram-config-encryption.service';

@Injectable()
export class TelegramConfigService {
  constructor(
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- findAllActive sweeps every workspace for the Telegram poller
    @InjectRepository(TelegramConfigEntity)
    private readonly telegramConfigRepository: Repository<TelegramConfigEntity>,
    private readonly telegramConfigEncryptionService: TelegramConfigEncryptionService,
  ) {}

  async findByWorkspaceId(
    workspaceId: string,
  ): Promise<TelegramConfigEntity | null> {
    return this.telegramConfigRepository.findOne({ where: { workspaceId } });
  }

  async findAllActive(): Promise<TelegramConfigEntity[]> {
    return this.telegramConfigRepository.find({ where: { isActive: true } });
  }

  async upsert(
    input: UpsertTelegramConfigInput,
    workspaceId: string,
  ): Promise<TelegramConfigEntity> {
    const existing = await this.findByWorkspaceId(workspaceId);

    if (!isDefined(existing) && !isNonEmptyString(input.botToken)) {
      throw new BadRequestException(
        'A bot token is required to configure Telegram',
      );
    }

    const encryptedBotToken = isNonEmptyString(input.botToken)
      ? this.telegramConfigEncryptionService.encrypt({
          plaintext: input.botToken as PlaintextString,
          workspaceId,
        })
      : existing?.botToken;

    if (!isDefined(encryptedBotToken)) {
      throw new BadRequestException(
        'A bot token is required to configure Telegram',
      );
    }

    if (isDefined(existing)) {
      return this.telegramConfigRepository.save({
        ...existing,
        botToken: encryptedBotToken,
        botUsername:
          input.botUsername !== undefined
            ? input.botUsername
            : existing.botUsername,
        isActive: input.isActive ?? existing.isActive,
      });
    }

    return this.telegramConfigRepository.save({
      botToken: encryptedBotToken,
      botUsername: input.botUsername ?? null,
      isActive: input.isActive ?? true,
      workspaceId,
    });
  }

  async delete(workspaceId: string): Promise<TelegramConfigEntity> {
    const existing = await this.findByWorkspaceId(workspaceId);

    if (!isDefined(existing)) {
      throw new NotFoundException('Telegram is not configured');
    }

    return this.telegramConfigRepository.softRemove(existing);
  }

  decryptBotToken(config: TelegramConfigEntity): PlaintextString {
    return this.telegramConfigEncryptionService.decrypt({
      ciphertext: config.botToken,
      workspaceId: config.workspaceId,
    });
  }
}

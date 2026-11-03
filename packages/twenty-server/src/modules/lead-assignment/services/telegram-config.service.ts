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
    return this.transact(workspaceId, async (repository) => {
      const existing = await repository.findOne({
        where: { workspaceId },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
      const reconnecting = isDefined(existing?.deletedAt);
      const replacingToken = isNonEmptyString(input.botToken?.trim());

      if ((!isDefined(existing) || reconnecting) && !replacingToken) {
        throw new BadRequestException(
          reconnecting
            ? 'A new bot token is required to reconnect Telegram'
            : 'A bot token is required to configure Telegram',
        );
      }

      const encryptedBotToken = replacingToken
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

      return repository.save({
        ...(existing ?? { workspaceId }),
        botToken: encryptedBotToken,
        botUsername:
          input.botUsername !== undefined
            ? input.botUsername
            : reconnecting
              ? null
              : (existing?.botUsername ?? null),
        isActive:
          input.isActive ??
          (reconnecting ? true : (existing?.isActive ?? true)),
        deletedAt: null,
      });
    });
  }

  async delete(workspaceId: string): Promise<TelegramConfigEntity> {
    return this.transact(workspaceId, async (repository) => {
      const existing = await repository.findOne({
        where: { workspaceId },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });

      if (!isDefined(existing) || isDefined(existing.deletedAt)) {
        throw new NotFoundException('Telegram is not configured');
      }

      return repository.softRemove(existing);
    });
  }

  private async transact<TResult>(
    workspaceId: string,
    change: (repository: Repository<TelegramConfigEntity>) => Promise<TResult>,
  ): Promise<TResult> {
    return this.telegramConfigRepository.manager.transaction(
      async (manager) => {
        // Share reminder-claim serialization so replacing or disabling a bot cannot race a committed claim.
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`delivery:${workspaceId}`],
        );
        return change(manager.getRepository(TelegramConfigEntity));
      },
    );
  }

  decryptBotToken(config: TelegramConfigEntity): PlaintextString {
    return this.telegramConfigEncryptionService.decrypt({
      ciphertext: config.botToken,
      workspaceId: config.workspaceId,
    });
  }
}

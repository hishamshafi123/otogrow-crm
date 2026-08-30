import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { type Repository } from 'typeorm';

import { type UpsertTwilioConfigInput } from 'src/engine/metadata-modules/twilio-config/dtos/upsert-twilio-config.input';
import { TwilioConfigEntity } from 'src/engine/metadata-modules/twilio-config/entities/twilio-config.entity';
import { TwilioConfigEncryptionService } from 'src/engine/metadata-modules/twilio-config/services/twilio-config-encryption.service';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';

@Injectable()
export class TwilioConfigService {
  constructor(
    @InjectRepository(TwilioConfigEntity)
    private readonly twilioConfigRepository: Repository<TwilioConfigEntity>,
    private readonly twilioConfigEncryptionService: TwilioConfigEncryptionService,
  ) {}

  async findByWorkspaceId(
    workspaceId: string,
  ): Promise<TwilioConfigEntity | null> {
    return this.twilioConfigRepository.findOne({ where: { workspaceId } });
  }

  async upsert(
    input: UpsertTwilioConfigInput,
    workspaceId: string,
  ): Promise<TwilioConfigEntity> {
    const existing = await this.findByWorkspaceId(workspaceId);

    if (!isDefined(existing) && !isNonEmptyString(input.authToken)) {
      throw new BadRequestException(
        'An auth token is required to configure Twilio',
      );
    }

    const encryptedAuthToken = isNonEmptyString(input.authToken)
      ? this.twilioConfigEncryptionService.encrypt({
          plaintext: input.authToken as PlaintextString,
          workspaceId,
        })
      : existing?.authToken;

    if (!isDefined(encryptedAuthToken)) {
      throw new BadRequestException(
        'An auth token is required to configure Twilio',
      );
    }

    if (isDefined(existing)) {
      return this.twilioConfigRepository.save({
        ...existing,
        accountSid: input.accountSid,
        authToken: encryptedAuthToken,
        whatsappSenderNumber:
          input.whatsappSenderNumber !== undefined
            ? input.whatsappSenderNumber
            : existing.whatsappSenderNumber,
        smsNumber:
          input.smsNumber !== undefined ? input.smsNumber : existing.smsNumber,
        isActive: input.isActive ?? existing.isActive,
      });
    }

    return this.twilioConfigRepository.save({
      accountSid: input.accountSid,
      authToken: encryptedAuthToken,
      whatsappSenderNumber: input.whatsappSenderNumber ?? null,
      smsNumber: input.smsNumber ?? null,
      isActive: input.isActive ?? true,
      workspaceId,
    });
  }

  async delete(workspaceId: string): Promise<TwilioConfigEntity> {
    const existing = await this.findByWorkspaceId(workspaceId);

    if (!isDefined(existing)) {
      throw new NotFoundException('Twilio is not configured');
    }

    return this.twilioConfigRepository.softRemove(existing);
  }

  decryptAuthToken(config: TwilioConfigEntity): PlaintextString {
    return this.twilioConfigEncryptionService.decrypt({
      ciphertext: config.authToken,
      workspaceId: config.workspaceId,
    });
  }
}

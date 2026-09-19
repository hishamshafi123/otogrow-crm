import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { ApiPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { TwilioClientService } from 'src/engine/metadata-modules/twilio-config/services/twilio-client.service';
import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';
import { type TwilioConfigEntity } from 'src/engine/metadata-modules/twilio-config/entities/twilio-config.entity';

@Injectable()
export class TwilioCallingProvisioningService {
  constructor(
    private readonly twilioConfigService: TwilioConfigService,
    private readonly twilioClientService: TwilioClientService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async provisionCalling(workspaceId: string): Promise<TwilioConfigEntity> {
    const config =
      await this.twilioConfigService.findByWorkspaceId(workspaceId);

    if (!isDefined(config)) {
      throw new NotFoundException('Twilio is not configured');
    }

    const client = await this.twilioClientService.getClient(workspaceId);

    if (!isDefined(client)) {
      throw new BadRequestException('Twilio is not active');
    }

    const voiceWebhookUrl = `${this.twentyConfigService.get('SERVER_URL')}/${ApiPath.Webhooks}/twilio/${workspaceId}/voice`;

    // The TwiML app voice URL must always point at the current SERVER_URL so
    // a tunnel/domain change only requires re-running provisioning.
    let twimlAppSid = config.twimlAppSid;

    if (isNonEmptyString(twimlAppSid)) {
      await client.applications(twimlAppSid).update({
        voiceUrl: voiceWebhookUrl,
        voiceMethod: 'POST',
      });
    } else {
      const application = await client.applications.create({
        friendlyName: `Otogrow Voice (${workspaceId})`,
        voiceUrl: voiceWebhookUrl,
        voiceMethod: 'POST',
      });

      twimlAppSid = application.sid;
    }

    // API key secrets are only returned at creation time, so an existing key
    // pair is reused rather than rotated.
    let apiKeySid = config.apiKeySid;
    let apiKeySecret =
      this.twilioConfigService.decryptApiKeySecret(config) ?? null;

    if (!isNonEmptyString(apiKeySid) || !isDefined(apiKeySecret)) {
      const newKey = await client.newKeys.create({
        friendlyName: `Otogrow Voice SDK (${workspaceId})`,
      });

      apiKeySid = newKey.sid;
      apiKeySecret = newKey.secret as PlaintextString;
    }

    const voiceNumber =
      config.voiceNumber ??
      (await this.pickVoiceNumber(client, voiceWebhookUrl));

    if (!isDefined(voiceNumber)) {
      throw new BadRequestException(
        'No voice-capable phone number found on the Twilio account',
      );
    }

    // Re-pointing the number's voice webhook on every provision is what makes
    // "re-run after a SERVER_URL change" actually work; pickVoiceNumber only
    // runs when no number was stored yet.
    await this.updateNumberVoiceWebhook(client, voiceNumber, voiceWebhookUrl);

    if (!isDefined(apiKeySecret) || !isNonEmptyString(apiKeySid)) {
      throw new BadRequestException('Twilio API key could not be created');
    }

    return this.twilioConfigService.saveCallingConfig({
      workspaceId,
      voiceNumber,
      apiKeySid,
      apiKeySecret,
      twimlAppSid,
    });
  }

  private async pickVoiceNumber(
    client: NonNullable<Awaited<ReturnType<TwilioClientService['getClient']>>>,
    voiceWebhookUrl: string,
  ): Promise<string | null> {
    const incomingPhoneNumbers = await client.incomingPhoneNumbers.list({
      limit: 100,
    });

    const voiceCapableNumber = incomingPhoneNumbers.find(
      (number) => number.capabilities.voice === true,
    );

    if (!isDefined(voiceCapableNumber)) {
      return null;
    }

    // Inbound PSTN calls to the number hit the same voice webhook that the
    // TwiML app points at for SDK-originated calls.
    await client.incomingPhoneNumbers(voiceCapableNumber.sid).update({
      voiceUrl: voiceWebhookUrl,
      voiceMethod: 'POST',
    });

    return voiceCapableNumber.phoneNumber;
  }

  private async updateNumberVoiceWebhook(
    client: NonNullable<Awaited<ReturnType<TwilioClientService['getClient']>>>,
    voiceNumber: string,
    voiceWebhookUrl: string,
  ): Promise<void> {
    const matches = await client.incomingPhoneNumbers.list({
      phoneNumber: voiceNumber,
      limit: 1,
    });

    const incomingPhoneNumber = matches[0];

    if (!isDefined(incomingPhoneNumber)) {
      return;
    }

    if (
      incomingPhoneNumber.voiceUrl === voiceWebhookUrl &&
      incomingPhoneNumber.voiceMethod === 'POST'
    ) {
      return;
    }

    await client.incomingPhoneNumbers(incomingPhoneNumber.sid).update({
      voiceUrl: voiceWebhookUrl,
      voiceMethod: 'POST',
    });
  }
}

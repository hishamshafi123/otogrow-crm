import { Injectable, NotFoundException } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';
import { jwt } from 'twilio';

import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';

const VOICE_TOKEN_TTL_SECONDS = 3600;

@Injectable()
export class TwilioVoiceTokenService {
  constructor(
    private readonly twilioConfigService: TwilioConfigService,
    private readonly otogrowAccessService: OtogrowAccessService,
  ) {}

  async generateVoiceToken({
    workspaceId,
    workspaceMemberId,
  }: {
    workspaceId: string;
    workspaceMemberId: string | undefined;
  }): Promise<string> {
    const access = await this.otogrowAccessService.requireCapability(
      workspaceId,
      workspaceMemberId,
      'phone.use',
    );
    const config =
      await this.twilioConfigService.findByWorkspaceId(workspaceId);

    if (
      !isDefined(config) ||
      !config.isActive ||
      !isDefined(config.apiKeySid) ||
      !isDefined(config.twimlAppSid)
    ) {
      throw new NotFoundException('Calling is not provisioned');
    }

    const apiKeySecret = this.twilioConfigService.decryptApiKeySecret(config);

    if (!isDefined(apiKeySecret)) {
      throw new NotFoundException('Calling is not provisioned');
    }

    const accessToken = new jwt.AccessToken(
      config.accountSid,
      config.apiKeySid,
      apiKeySecret,
      { identity: access.memberId, ttl: VOICE_TOKEN_TTL_SECONDS },
    );

    accessToken.addGrant(
      new jwt.AccessToken.VoiceGrant({
        outgoingApplicationSid: config.twimlAppSid,
        // The browser client must be addressable so inbound PSTN calls can
        // ring the CRM dialer via <Dial><Client>.
        incomingAllow: true,
      }),
    );

    return accessToken.toJwt();
  }
}

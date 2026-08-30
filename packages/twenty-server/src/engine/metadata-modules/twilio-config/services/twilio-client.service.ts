import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';
import twilio, { type Twilio } from 'twilio';

import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';

// Clients are cheap to build (no I/O until first request), so no caching: a
// stale client would outlive an auth token rotation.
@Injectable()
export class TwilioClientService {
  constructor(private readonly twilioConfigService: TwilioConfigService) {}

  async getClient(workspaceId: string): Promise<Twilio | null> {
    const config =
      await this.twilioConfigService.findByWorkspaceId(workspaceId);

    if (!isDefined(config) || !config.isActive) {
      return null;
    }

    const authToken = this.twilioConfigService.decryptAuthToken(config);

    return twilio(config.accountSid, authToken);
  }
}

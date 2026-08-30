import { isDefined } from 'twenty-shared/utils';

import { TwilioClientService } from 'src/engine/metadata-modules/twilio-config/services/twilio-client.service';
import {
  type ChannelMessageDriverInterface,
  type ChannelMessageDriverSendInput,
  type ChannelMessageDriverSendResult,
} from 'src/modules/messaging/channels/drivers/interfaces/channel-message-driver.interface';

export class TwilioChannelMessageDriver implements ChannelMessageDriverInterface {
  constructor(private readonly twilioClientService: TwilioClientService) {}

  async send({
    workspaceId,
    channel,
    fromNumber,
    toNumber,
    body,
    contentSid,
    contentVariables,
  }: ChannelMessageDriverSendInput): Promise<ChannelMessageDriverSendResult> {
    const client = await this.twilioClientService.getClient(workspaceId);

    if (!isDefined(client)) {
      throw new Error(`Twilio is not configured for workspace ${workspaceId}`);
    }

    // WhatsApp addressing requires the whatsapp: prefix on both ends; SMS
    // stays plain E.164.
    const from = channel === 'WHATSAPP' ? `whatsapp:${fromNumber}` : fromNumber;
    const to = channel === 'WHATSAPP' ? `whatsapp:${toNumber}` : toNumber;

    const message = await client.messages.create({
      from,
      to,
      ...(isDefined(contentSid)
        ? {
            contentSid,
            contentVariables: JSON.stringify(contentVariables ?? {}),
          }
        : { body }),
    });

    return { externalId: message.sid, status: 'SENT' };
  }
}

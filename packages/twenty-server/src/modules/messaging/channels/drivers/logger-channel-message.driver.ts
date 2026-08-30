import { Logger } from '@nestjs/common';

import { randomBytes } from 'crypto';

import {
  type ChannelMessageDriverInterface,
  type ChannelMessageDriverSendInput,
  type ChannelMessageDriverSendResult,
} from 'src/modules/messaging/channels/drivers/interfaces/channel-message-driver.interface';

export class LoggerChannelMessageDriver implements ChannelMessageDriverInterface {
  private readonly logger = new Logger(LoggerChannelMessageDriver.name);

  async send(
    input: ChannelMessageDriverSendInput,
  ): Promise<ChannelMessageDriverSendResult> {
    // Twilio SIDs are "SM" + 32 hex chars; mirroring that shape keeps
    // externalId consumers honest in dev.
    const externalId = `SM${randomBytes(16).toString('hex')}`;

    this.logger.log(
      `Sent ${input.channel} message from ${input.fromNumber} to ${input.toNumber} (workspace ${input.workspaceId})\n` +
        (input.contentSid
          ? `Content SID: ${input.contentSid}\nContent variables: ${JSON.stringify(input.contentVariables ?? {})}\n`
          : `Body: ${input.body}\n`) +
        `External id: ${externalId}`,
    );

    return { externalId, status: 'SENT' };
  }
}

import {
  type ChannelMessageChannel,
  type ChannelMessageStatus,
} from 'src/modules/messaging/channels/constants/channel-message.constant';

export type ChannelMessageDriverSendInput = {
  workspaceId: string;
  channel: ChannelMessageChannel;
  fromNumber: string;
  toNumber: string;
  body: string;
  contentSid: string | null;
  contentVariables: Record<string, string> | null;
};

export type ChannelMessageDriverSendResult = {
  externalId: string;
  status: ChannelMessageStatus;
};

export interface ChannelMessageDriverInterface {
  send(
    input: ChannelMessageDriverSendInput,
  ): Promise<ChannelMessageDriverSendResult>;
}

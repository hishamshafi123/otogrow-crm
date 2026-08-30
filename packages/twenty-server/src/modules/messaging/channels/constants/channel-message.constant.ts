export const CHANNEL_MESSAGE_CHANNELS = ['WHATSAPP', 'SMS'] as const;

export type ChannelMessageChannel = (typeof CHANNEL_MESSAGE_CHANNELS)[number];

export const CHANNEL_MESSAGE_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;

export type ChannelMessageDirection =
  (typeof CHANNEL_MESSAGE_DIRECTIONS)[number];

export const CHANNEL_MESSAGE_STATUSES = [
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'RECEIVED',
] as const;

export type ChannelMessageStatus = (typeof CHANNEL_MESSAGE_STATUSES)[number];

export const SEQUENCE_STEP_CHANNELS = ['EMAIL', 'WHATSAPP', 'SMS'] as const;

export type SequenceStepChannel = (typeof SEQUENCE_STEP_CHANNELS)[number];

// Meta only allows free-form WhatsApp replies within 24h of the person's last
// inbound message; outside the window an approved template is required.
export const WHATSAPP_FREE_FORM_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SequenceDelayUnit = 'MINUTES' | 'HOURS' | 'DAYS';

export type SequenceStepChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';

export type SequenceStep = {
  __typename: 'SequenceStep';
  id: string;
  stepPosition: number;
  delayValue: number;
  delayUnit: SequenceDelayUnit;
  channel: SequenceStepChannel;
  subject: string | null;
  body: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateParams: string | null;
  sequenceId: string;
};

export const SEQUENCE_DELAY_UNITS: SequenceDelayUnit[] = [
  'MINUTES',
  'HOURS',
  'DAYS',
];

export const SEQUENCE_STEP_CHANNELS: SequenceStepChannel[] = [
  'EMAIL',
  'WHATSAPP',
  'SMS',
];

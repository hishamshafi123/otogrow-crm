export type SequenceStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export type Sequence = {
  __typename: 'Sequence';
  id: string;
  name: string;
  status: SequenceStatus;
  dailySendCap: number | null;
  businessHoursTimeZone: string | null;
};

export const SEQUENCE_STATUSES: SequenceStatus[] = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
];

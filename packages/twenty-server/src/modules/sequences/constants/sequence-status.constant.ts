export const SEQUENCE_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;

export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

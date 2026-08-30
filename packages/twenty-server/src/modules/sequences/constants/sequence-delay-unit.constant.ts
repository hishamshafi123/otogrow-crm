export const SEQUENCE_DELAY_UNITS = ['MINUTES', 'HOURS', 'DAYS'] as const;

export type SequenceDelayUnit = (typeof SEQUENCE_DELAY_UNITS)[number];

export const SEQUENCE_ENROLLMENT_STATUSES = [
  'ACTIVE',
  'REPLIED',
  'UNSUBSCRIBED',
  'BOUNCED',
  'COMPLETED',
  'REMOVED',
  'ERROR',
] as const;

export type SequenceEnrollmentStatus =
  (typeof SEQUENCE_ENROLLMENT_STATUSES)[number];

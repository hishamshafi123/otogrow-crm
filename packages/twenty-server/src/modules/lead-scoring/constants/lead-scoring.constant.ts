export const LEAD_SCORING_RECOMPUTE_PERSON_JOB =
  'lead-scoring:recompute-person';
export const LEAD_SCORING_FORM_SUBMISSION_JOB = 'lead-scoring:form-submission';
export const LEAD_SCORING_CHANNEL_MESSAGE_JOB = 'lead-scoring:channel-message';
export const LEAD_SCORING_SEQUENCE_ENROLLMENT_JOB =
  'lead-scoring:sequence-enrollment';

// The form module records a submission as a note with this title prefix
// targeted at the person; it is the only form provenance available on records
export const FORM_SUBMISSION_NOTE_TITLE_PREFIX = 'Form submission: ';

// Debounce window for person updates so a burst of writes (including our own
// leadScore write-back) collapses into a single recompute
export const LEAD_SCORING_RECOMPUTE_LOCK_TTL_MS = 2000;

export const LEAD_SCORE_BANDS = ['COLD', 'WARM', 'HOT'] as const;

export type LeadScoreBand = (typeof LEAD_SCORE_BANDS)[number];

// Inclusive lower bounds; anything below WARM is COLD
export const LEAD_SCORE_BAND_WARM_MIN = 20;
export const LEAD_SCORE_BAND_HOT_MIN = 50;

export const LEAD_SCORING_RULE_TYPES = ['PROPERTY', 'EVENT'] as const;

export type LeadScoringRuleType = (typeof LEAD_SCORING_RULE_TYPES)[number];

export const LEAD_SCORING_OPERATORS = [
  'EQ',
  'NEQ',
  'CONTAINS',
  'GT',
  'LT',
  'IS_SET',
] as const;

export type LeadScoringOperator = (typeof LEAD_SCORING_OPERATORS)[number];

export const LEAD_SCORING_EVENT_TYPES = [
  'FORM_SUBMISSION',
  'INBOUND_EMAIL',
  'INBOUND_WHATSAPP',
  'INBOUND_SMS',
  'SEQUENCE_ENROLLED',
  'SEQUENCE_REPLIED',
  'SEQUENCE_COMPLETED',
] as const;

export type LeadScoringEventType = (typeof LEAD_SCORING_EVENT_TYPES)[number];

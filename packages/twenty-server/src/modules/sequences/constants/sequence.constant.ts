export const SEND_SEQUENCE_STEP_JOB = 'SendSequenceStepJob';

export const SEQUENCE_SCHEDULER_CRON_JOB_NAME = 'SequenceSchedulerCronJob';

export const SEQUENCE_SCHEDULER_CRON_PATTERN = '*/5 * * * *';

// Failed sends are rethrown for a Bull retry until this many attempts, then
// the enrollment is parked in ERROR with lastError set.
export const SEQUENCE_SEND_RETRY_LIMIT = 3;

export const SEQUENCE_SEND_ATTEMPT_COUNTER_TTL_MS = 24 * 60 * 60 * 1000;

export const SEQUENCE_DAILY_COUNTER_TTL_MS = 48 * 60 * 60 * 1000;

export const SEQUENCE_SCHEDULER_BATCH_SIZE = 100;

export const SEQUENCES_UNSUBSCRIBE_TOPIC_NAME = 'Sequences';

export const BUSINESS_HOURS_START = 9;

export const BUSINESS_HOURS_END = 17;

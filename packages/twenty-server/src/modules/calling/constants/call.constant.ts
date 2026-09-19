export type CallDirection = 'INBOUND' | 'OUTBOUND';

export type CallStatus =
  | 'INITIATED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'FAILED'
  | 'CANCELED';

export const TWILIO_CALL_STATUS_TO_CALL_STATUS: Record<string, CallStatus> = {
  queued: 'INITIATED',
  initiated: 'INITIATED',
  ringing: 'RINGING',
  answered: 'IN_PROGRESS',
  'in-progress': 'IN_PROGRESS',
  completed: 'COMPLETED',
  busy: 'BUSY',
  'no-answer': 'NO_ANSWER',
  failed: 'FAILED',
  canceled: 'CANCELED',
};

export const TERMINAL_CALL_STATUSES: CallStatus[] = [
  'COMPLETED',
  'NO_ANSWER',
  'BUSY',
  'FAILED',
  'CANCELED',
];

import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type DialerCallStatus =
  | 'IDLE'
  | 'INCOMING'
  | 'CONNECTING'
  | 'RINGING'
  | 'IN_CALL'
  | 'ENDED';

export const callStatusState = createAtomState<DialerCallStatus>({
  key: 'callStatusState',
  defaultValue: 'IDLE',
});

import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

// Epoch ms when the active call was answered; null outside an answered call.
export const callAnsweredAtState = createAtomState<number | null>({
  key: 'callAnsweredAtState',
  defaultValue: null,
});

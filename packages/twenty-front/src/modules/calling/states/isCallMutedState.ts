import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const isCallMutedState = createAtomState<boolean>({
  key: 'isCallMutedState',
  defaultValue: false,
});

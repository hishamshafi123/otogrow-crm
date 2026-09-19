import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const dialerErrorState = createAtomState<string | null>({
  key: 'dialerErrorState',
  defaultValue: null,
});

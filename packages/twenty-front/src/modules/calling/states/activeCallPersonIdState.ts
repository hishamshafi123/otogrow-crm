import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const activeCallPersonIdState = createAtomState<string | null>({
  key: 'activeCallPersonIdState',
  defaultValue: null,
});

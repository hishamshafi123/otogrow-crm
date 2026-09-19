import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const dialerNumberState = createAtomState<string>({
  key: 'dialerNumberState',
  defaultValue: '',
});

import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const isDialerOpenState = createAtomState<boolean>({
  key: 'isDialerOpenState',
  defaultValue: false,
});

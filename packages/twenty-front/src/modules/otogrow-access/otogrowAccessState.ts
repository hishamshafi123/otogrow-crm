import { type OtogrowAccess } from '@/otogrow-access/otogrow-access.types';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

type OtogrowAccessSnapshot = {
  identity: string | null;
  access?: OtogrowAccess;
  loading: boolean;
  error?: { message: string };
  refetch: () => Promise<unknown>;
};

export const EMPTY_OTOGROW_ACCESS: OtogrowAccessSnapshot = {
  identity: null,
  loading: false,
  refetch: async () => undefined,
};

export const otogrowAccessState = createAtomState<OtogrowAccessSnapshot>({
  key: 'otogrowAccessState',
  defaultValue: EMPTY_OTOGROW_ACCESS,
});

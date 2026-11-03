import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { type ReleaseIdentity } from '@/delivery/development/release.types';

export const useReleaseAccess = () => {
  const state = useAssistantAccess();
  return {
    ...state,
    matches: (value: ReleaseIdentity) =>
      state.permission.matches(value) &&
      value.isManager === state.permission.manager &&
      /^[a-f0-9]{64}$/.test(value.scope),
  };
};

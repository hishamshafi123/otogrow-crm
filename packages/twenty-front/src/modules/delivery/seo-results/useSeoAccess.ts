import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { type SeoIdentity } from '@/delivery/seo-results/seo-results.types';

export const useSeoAccess = () => {
  const state = useAssistantAccess();
  return {
    ...state,
    matches: (value: SeoIdentity) =>
      state.permission.matches(value) &&
      value.actor.memberId === value.memberId &&
      value.actor.isManager === state.permission.manager &&
      value.actor.isAdmin === state.administrator,
  };
};

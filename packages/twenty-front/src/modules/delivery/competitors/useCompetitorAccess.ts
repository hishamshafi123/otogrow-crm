import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { type CompetitorIdentity } from '@/delivery/competitors/competitor.types';

export const useCompetitorAccess = () => {
  const state = useAssistantAccess();
  return {
    ...state,
    matches: (value: CompetitorIdentity) =>
      state.permission.matches(value) &&
      value.isManager === state.permission.manager &&
      /^[a-f0-9]{64}$/.test(value.scope),
  };
};

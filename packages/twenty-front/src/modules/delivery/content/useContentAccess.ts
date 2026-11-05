import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { type ContentIdentity } from '@/delivery/content/content.types';

export const useContentAccess = () => {
  const access = useAssistantAccess();
  return {
    ...access,
    matches: (value: ContentIdentity) =>
      access.permission.matches(value) &&
      value.isManager === access.permission.manager &&
      /^[a-f0-9]{64}$/.test(value.scope),
  };
};

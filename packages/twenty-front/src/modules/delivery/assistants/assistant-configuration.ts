import { type AssistantConfigurationDetail } from '@/delivery/assistants/assistant.types';
import { type DeliveryAgent } from '@/delivery/delivery-agent.types';

export const assistantForForm = (
  value: AssistantConfigurationDetail,
): DeliveryAgent | null => {
  const configuration = value.configuration;
  const kind = configuration.kind;
  const outputFormat = configuration.outputFormat;
  const requiredInputs = configuration.requiredInputs.filter(
    (
      input,
    ): input is
      | 'brief'
      | 'copy'
      | 'requirements'
      | 'report'
      | 'activity'
      | 'question' =>
      [
        'brief',
        'copy',
        'requirements',
        'report',
        'activity',
        'question',
      ].includes(input),
  );
  const tools = configuration.tools.filter(
    (tool): tool is 'public_page_check' => tool === 'public_page_check',
  );
  const roles = configuration.roles.filter(
    (role): role is 'ADMIN' | 'MANAGER' | 'MEMBER' =>
      ['ADMIN', 'MANAGER', 'MEMBER'].includes(role),
  );
  if (
    (kind !== 'BRIEF' &&
      kind !== 'COPY' &&
      kind !== 'SEO' &&
      kind !== 'ADVERTISING' &&
      kind !== 'ACTIVITY') ||
    (outputFormat !== 'findings' &&
      outputFormat !== 'findings_and_edits' &&
      outputFormat !== 'recommendations' &&
      outputFormat !== 'analysis') ||
    (kind === 'ACTIVITY'
      ? outputFormat !== 'analysis' ||
        tools.length > 0 ||
        configuration.projectIds.length !== 0 ||
        roles.length !== 1 ||
        roles[0] !== 'ADMIN' ||
        requiredInputs.length !== 2 ||
        !requiredInputs.includes('activity') ||
        !requiredInputs.includes('question')
      : outputFormat === 'analysis' ||
        configuration.projectIds.length === 0 ||
        requiredInputs.some((input) =>
          ['activity', 'question'].includes(input),
        )) ||
    (kind === 'ADVERTISING'
      ? outputFormat !== 'recommendations' ||
        tools.length > 0 ||
        !requiredInputs.includes('report') ||
        requiredInputs.some(
          (input) => !['report', 'requirements'].includes(input),
        )
      : outputFormat === 'recommendations' ||
        requiredInputs.includes('report')) ||
    !configuration.humanConfirmation ||
    requiredInputs.length !== configuration.requiredInputs.length ||
    new Set(requiredInputs).size !== requiredInputs.length ||
    tools.length !== configuration.tools.length ||
    roles.length !== configuration.roles.length
  )
    return null;
  return {
    id: value.id,
    version: value.version,
    configuration: {
      name: configuration.name,
      purpose: configuration.purpose,
      kind,
      enabled: configuration.enabled,
      instructions: configuration.instructions,
      outputFormat,
      requiredInputs,
      tools,
      modelId: configuration.modelId ?? null,
      projectIds: [...configuration.projectIds],
      roles,
      ...(configuration.roleIds !== undefined
        ? {
            roleIds:
              configuration.roleIds === null
                ? null
                : [...configuration.roleIds],
          }
        : {}),
      dailyRunLimit: configuration.dailyRunLimit,
      maxOutputTokens: configuration.maxOutputTokens,
      humanConfirmation: true,
    },
  };
};

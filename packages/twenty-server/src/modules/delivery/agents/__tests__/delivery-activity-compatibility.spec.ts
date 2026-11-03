import { canUseDeliveryAgent } from 'src/modules/delivery/agents/delivery-agent-access';
import { deliveryAgentConfigurationSchema } from 'src/modules/delivery/agents/delivery-agent.types';

const PROJECT = '61000000-0000-4000-8000-000000000001';
const ROLE = '61000000-0000-4000-8000-000000000002';
const activityConfiguration = () => ({
  name: 'Recorded work analysis',
  purpose: 'Answer from cited activity, not productivity ratings.',
  kind: 'ACTIVITY',
  enabled: true,
  instructions: 'Keep missing history unknown and cite every factual claim.',
  requiredInputs: ['activity', 'question'],
  outputFormat: 'analysis',
  tools: [],
  modelId: 'test-model',
  projectIds: [],
  roles: ['ADMIN'],
  roleIds: null,
  dailyRunLimit: 3,
  maxOutputTokens: 1024,
  humanConfirmation: true,
});

it('accepts explicit workspace activity scope and retains additional named-role restrictions', () => {
  const configuration = deliveryAgentConfigurationSchema.parse(
    activityConfiguration(),
  );
  expect(configuration.projectIds).toEqual([]);
  expect(configuration.requiredInputs).toEqual(['activity', 'question']);
  expect(
    deliveryAgentConfigurationSchema.parse({
      ...configuration,
      roleIds: [ROLE],
    }).roleIds,
  ).toEqual([ROLE]);
});

it.each([
  { projectIds: [PROJECT] },
  { requiredInputs: ['activity'] },
  { requiredInputs: ['question'] },
  { requiredInputs: ['activity', 'question', 'report'] },
  { requiredInputs: ['activity', 'activity'] },
  { outputFormat: 'findings' },
  { tools: ['public_page_check'] },
  { roles: ['ADMIN', 'MANAGER'] },
  { roles: ['MANAGER'] },
  { maxOutputTokens: 4097 },
])('rejects incompatible activity configuration %j', (patch) => {
  expect(
    deliveryAgentConfigurationSchema.safeParse({
      ...activityConfiguration(),
      ...patch,
    }).success,
  ).toBe(false);
});

it.each(['BRIEF', 'COPY', 'SEO', 'ADVERTISING'])(
  'keeps %s project-scoped and rejects workspace-analysis inputs',
  (kind) => {
    const configuration = {
      ...activityConfiguration(),
      kind,
      requiredInputs:
        kind === 'SEO' ? [] : kind === 'ADVERTISING' ? ['report'] : ['brief'],
      outputFormat: kind === 'ADVERTISING' ? 'recommendations' : 'findings',
      tools: kind === 'SEO' ? ['public_page_check'] : [],
    };
    expect(
      deliveryAgentConfigurationSchema.safeParse(configuration).success,
    ).toBe(false);
    expect(
      deliveryAgentConfigurationSchema.safeParse({
        ...configuration,
        projectIds: [PROJECT],
      }).success,
    ).toBe(true);
    expect(
      deliveryAgentConfigurationSchema.safeParse({
        ...configuration,
        projectIds: [PROJECT],
        requiredInputs: ['activity', 'question'],
        outputFormat: 'analysis',
      }).success,
    ).toBe(false);
  },
);

it('requires current administrator authority in addition to any selected named role', () => {
  const configuration = deliveryAgentConfigurationSchema.parse({
    ...activityConfiguration(),
    roleIds: [ROLE],
  });
  expect(
    canUseDeliveryAgent(configuration, {
      isAdmin: false,
      isManager: true,
      roleIds: [ROLE],
    }),
  ).toBe(false);
  expect(
    canUseDeliveryAgent(configuration, {
      isAdmin: false,
      isManager: false,
      roleIds: [ROLE],
    }),
  ).toBe(false);
  expect(
    canUseDeliveryAgent(configuration, {
      isAdmin: true,
      isManager: true,
      roleIds: [],
    }),
  ).toBe(false);
  expect(
    canUseDeliveryAgent(configuration, {
      isAdmin: true,
      isManager: true,
      roleIds: [ROLE],
    }),
  ).toBe(true);
  expect(
    canUseDeliveryAgent(
      deliveryAgentConfigurationSchema.parse(activityConfiguration()),
      { isAdmin: true, isManager: false, roleIds: [] },
    ),
  ).toBe(true);
});

import { assistantInputProblems } from '@/delivery/assistants/assistant-inputs';
import { assistantForForm } from '@/delivery/assistants/assistant-configuration';
import { assistantConfiguration } from '@/delivery/assistants/__tests__/assistants.fixtures';

const values = {
  kind: 'COPY',
  requiredInputs: ['brief', 'copy', 'requirements'],
  brief: 'Approved brief',
  copy: 'Prepared copy',
  requirements: 'Current brand requirements',
  sourceUrl: '',
  targetUrl: '',
};
it('requires exactly the configured input fields without inventing task or brand content', () => {
  expect(assistantInputProblems(values)).toEqual([]);
  expect(
    assistantInputProblems({ ...values, brief: ' ', requirements: '' }),
  ).toEqual(['brief', 'requirements']);
  expect(
    assistantInputProblems({
      ...values,
      requiredInputs: [],
      brief: '',
      copy: '',
      requirements: '',
    }),
  ).toEqual([]);
  expect(
    assistantInputProblems({ ...values, requiredInputs: ['unrecognized'] }),
  ).toEqual(['unrecognized']);
});
it.each([
  'ftp://example.com/source',
  'file:///private',
  // oxlint-disable-next-line no-script-url -- Unsupported protocols must never become public-page check inputs.
  'javascript:alert(1)',
  'not a URL',
])('blocks a non-HTTP public-page input: %s', (sourceUrl) => {
  expect(
    assistantInputProblems({
      ...values,
      kind: 'SEO',
      requiredInputs: [],
      sourceUrl,
      targetUrl: 'https://example.com/destination',
    }),
  ).toEqual(['sourceUrl']);
});
it('accepts explicit HTTP(S) source/destination and keeps the full URL value intact', () => {
  const input = {
    ...values,
    kind: 'SEO',
    requiredInputs: [],
    sourceUrl: 'http://example.com/source?one=1',
    targetUrl: 'https://example.com/destination',
  };
  expect(assistantInputProblems(input)).toEqual([]);
  expect(input.sourceUrl).toBe('http://example.com/source?one=1');
});
it('maps only editable fields from GraphQL into the real form and preserves legacy role semantics for edit/duplicate', () => {
  const detail = assistantConfiguration();
  detail.configuration.__typename = 'DeliveryAssistantConfiguration';
  const mapped = assistantForForm(detail);
  expect(mapped).not.toBeNull();
  expect(mapped?.configuration).not.toHaveProperty('__typename');
  expect(mapped?.configuration.roleIds).toBeNull();
  expect(mapped?.configuration.roles).toEqual(['ADMIN', 'MANAGER', 'MEMBER']);
  const saved = {
    createId: 'stable-duplicate-id',
    configuration: mapped?.configuration,
  };
  expect(JSON.stringify(saved)).not.toContain('__typename');
  expect(saved.configuration?.projectIds).toEqual(
    detail.configuration.projectIds,
  );
  expect(
    assistantForForm({
      ...detail,
      configuration: {
        ...detail.configuration,
        modelId: undefined,
        roleIds: undefined,
      },
    })?.configuration,
  ).toEqual(
    expect.objectContaining({
      modelId: null,
      roles: ['ADMIN', 'MANAGER', 'MEMBER'],
    }),
  );
  expect(
    assistantForForm({
      ...detail,
      configuration: { ...detail.configuration, roleIds: ['selected-role'] },
    })?.configuration.roleIds,
  ).toEqual(['selected-role']);
});
it('refuses unsupported saved workflow metadata instead of silently changing it', () => {
  const detail = assistantConfiguration();
  expect(
    assistantForForm({
      ...detail,
      configuration: { ...detail.configuration, kind: 'UNSUPPORTED' },
    }),
  ).toBeNull();
  expect(
    assistantForForm({
      ...detail,
      configuration: {
        ...detail.configuration,
        requiredInputs: ['hidden-extra-input'],
      },
    }),
  ).toBeNull();
});

it('round-trips advertising settings explicitly and refuses incompatible task/report metadata', () => {
  const detail = assistantConfiguration();
  const configuration = {
    ...detail.configuration,
    kind: 'ADVERTISING',
    requiredInputs: ['report', 'requirements'],
    outputFormat: 'recommendations',
    tools: [],
  };
  const mapped = assistantForForm({ ...detail, configuration });
  expect(mapped?.configuration).toMatchObject({
    kind: 'ADVERTISING',
    requiredInputs: ['report', 'requirements'],
    outputFormat: 'recommendations',
    tools: [],
  });
  expect(mapped?.configuration.roleIds).toBeNull();
  for (const invalid of [
    { requiredInputs: [] },
    { requiredInputs: ['report', 'copy'] },
    { requiredInputs: ['report', 'report'] },
    { outputFormat: 'findings' },
    { tools: ['public_page_check'] },
  ])
    expect(
      assistantForForm({
        ...detail,
        configuration: { ...configuration, ...invalid },
      }),
    ).toBeNull();
  expect(
    assistantForForm({
      ...detail,
      configuration: { ...detail.configuration, requiredInputs: ['report'] },
    }),
  ).toBeNull();
  expect(
    assistantForForm({
      ...detail,
      configuration: {
        ...detail.configuration,
        outputFormat: 'recommendations',
      },
    }),
  ).toBeNull();
});

it('preserves workspace activity scope and refuses to widen it to other roles or project workflows', () => {
  const detail = assistantConfiguration();
  const configuration = {
    ...detail.configuration,
    kind: 'ACTIVITY',
    projectIds: [],
    roles: ['ADMIN'],
    requiredInputs: ['activity', 'question'],
    outputFormat: 'analysis',
    tools: [],
  };
  expect(
    assistantForForm({ ...detail, configuration })?.configuration,
  ).toMatchObject({
    kind: 'ACTIVITY',
    projectIds: [],
    roles: ['ADMIN'],
    requiredInputs: ['activity', 'question'],
    outputFormat: 'analysis',
    tools: [],
  });
  for (const patch of [
    { projectIds: detail.configuration.projectIds },
    { roles: ['ADMIN', 'MANAGER'] },
    { requiredInputs: ['activity'] },
    { tools: ['public_page_check'] },
    { outputFormat: 'findings' },
    { kind: 'COPY' },
  ])
    expect(
      assistantForForm({
        ...detail,
        configuration: { ...configuration, ...patch },
      }),
    ).toBeNull();
});

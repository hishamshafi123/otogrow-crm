import { useState } from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryAgentForm } from '@/delivery/DeliveryAgentForm';
import { DeliveryAgentPermissions } from '@/delivery/DeliveryAgentPermissions';
import { agentRoleDirectory } from '@/delivery/__tests__/agentRoleFixture';
import { type DeliveryAgentConfiguration } from '@/delivery/delivery-agent.types';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'admin', isAdmin: true, isManager: true },
  projects: [
    {
      revision: 1,
      id: 'project',
      name: 'Brand',
      companyId: null,
      memberIds: ['editor'],
    },
  ],
  tasks: [],
  members: [],
  companies: [],
};
const configuration: DeliveryAgentConfiguration = {
  name: 'Evidence checker',
  purpose: 'Verify links',
  kind: 'SEO',
  enabled: true,
  instructions: 'Check links',
  tools: ['public_page_check'],
  requiredInputs: [],
  outputFormat: 'findings',
  modelId: null,
  projectIds: ['project'],
  roles: ['ADMIN', 'MANAGER', 'MEMBER'],
  dailyRunLimit: 20,
  maxOutputTokens: 512,
  humanConfirmation: true,
};
beforeEach(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));
it('shows role unions, project limits and no administrator bypass', async () => {
  const Harness = () => {
    const [value, setValue] = useState({
      ...configuration,
      roleIds: [] as string[],
    });
    return (
      <DeliveryAgentPermissions
        configuration={value}
        workspace={workspace}
        directory={agentRoleDirectory}
        update={(next) =>
          setValue((current) => ({
            ...current,
            ...next,
            roleIds: next.roleIds ?? current.roleIds,
          }))
        }
      />
    );
  };
  render(
    <I18nProvider i18n={i18n}>
      <Harness />
    </I18nProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByText('Preview team access'));
  const person = (name: string) =>
    within(screen.getByRole('listitem', { name }));
  expect(person('Editor').getByText('No allowed role')).toBeVisible();
  await user.click(screen.getByLabelText('Production team'));
  expect(person('Editor').getByText('Can use in: Brand')).toBeVisible();
  expect(
    person('Outside specialist').getByText('No allowed project access'),
  ).toBeVisible();
  expect(person('Founder').getByText('No allowed role')).toBeVisible();
  await user.click(screen.getByLabelText('SEO team'));
  await user.click(screen.getByLabelText('Production team'));
  expect(person('Editor').getByText('Allowed through: SEO team')).toBeVisible();
});
it('preserves legacy access until explicitly switching, then requires a selected role', async () => {
  const save = jest.fn().mockResolvedValue(false);
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryAgentForm
        agent={{ id: 'agent', version: 1, configuration }}
        workspace={workspace}
        directory={agentRoleDirectory}
        models={[]}
        busy={false}
        save={save}
        close={jest.fn()}
      />
    </I18nProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Save agent' }));
  expect(save.mock.calls[0][0].configuration.roleIds).toBeUndefined();
  await user.click(
    screen.getByRole('button', { name: 'Choose specific team roles' }),
  );
  expect(screen.getByRole('button', { name: 'Save agent' })).toBeDisabled();
  await user.click(screen.getByLabelText('Production team'));
  await user.click(screen.getByRole('button', { name: 'Save agent' }));
  expect(save.mock.calls[1][0].configuration.roleIds).toEqual(['editor-role']);
});
it('blocks saving when team access cannot be verified and retains role choices on recovery', async () => {
  const save = jest.fn();
  const view = (ready: boolean) => (
    <I18nProvider i18n={i18n}>
      <DeliveryAgentForm
        agent={{
          id: 'agent',
          version: 1,
          configuration: { ...configuration, roleIds: ['editor-role'] },
        }}
        workspace={workspace}
        directory={ready ? agentRoleDirectory : undefined}
        models={[]}
        busy={false}
        save={save}
        close={jest.fn()}
      />
    </I18nProvider>
  );
  const { rerender } = render(view(true));
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('SEO team'));
  rerender(view(false));
  expect(screen.getByRole('button', { name: 'Save agent' })).toBeDisabled();
  expect(screen.queryByLabelText('Production team')).not.toBeInTheDocument();
  rerender(view(true));
  expect(screen.getByLabelText('Production team')).toBeChecked();
  expect(screen.getByLabelText('SEO team')).toBeChecked();
  expect(save).not.toHaveBeenCalled();
});

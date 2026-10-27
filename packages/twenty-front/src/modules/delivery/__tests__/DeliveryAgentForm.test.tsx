import { agentRoleDirectory } from '@/delivery/__tests__/agentRoleFixture';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryAgentForm } from '@/delivery/DeliveryAgentForm';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'admin', isAdmin: true, isManager: true },
  projects: [
    {
      revision: 1,
      id: 'project',
      name: 'Launch project',
      companyId: null,
      memberIds: [],
    },
  ],
  tasks: [],
  members: [],
  companies: [],
};
const setup = () => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const save = jest.fn().mockResolvedValue(true);
  const close = jest.fn();
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryAgentForm
        directory={agentRoleDirectory}
        workspace={workspace}
        models={[]}
        busy={false}
        save={save}
        close={close}
      />
    </I18nProvider>,
  );
  return { save, close, user: userEvent.setup() };
};

describe('Delivery agent configuration', () => {
  it('requires a project and clearly reports unavailable models', async () => {
    const { user, save } = setup();
    expect(screen.getByRole('status')).toHaveTextContent(
      'No enabled model connection',
    );
    expect(screen.getByRole('button', { name: 'Save agent' })).toBeDisabled();
    await user.click(screen.getByLabelText('Launch project'));
    await user.click(screen.getByLabelText('Production team'));
    await user.click(screen.getByRole('button', { name: 'Save agent' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({
          enabled: false,
          modelId: null,
          humanConfirmation: true,
          projectIds: ['project'],
        }),
      }),
    );
  });

  it('configures public page verification without a model or automatic edits', async () => {
    const { user, save, close } = setup();
    await user.selectOptions(screen.getByLabelText('Starter workflow'), 'SEO');
    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
    expect(screen.getByText(/without an AI model/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Launch project'));
    await user.click(screen.getByLabelText('Production team'));
    await user.click(screen.getByRole('button', { name: 'Save agent' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({
          kind: 'SEO',
          tools: ['public_page_check'],
          modelId: null,
          outputFormat: 'findings',
          humanConfirmation: true,
        }),
      }),
    );
    expect(close).toHaveBeenCalled();
  });

  it('retains run settings when collapsed and includes them in the saved configuration', async () => {
    const { user, save } = setup();
    const settings = screen.getByText(/Run settings/);
    expect(screen.getByLabelText('Output')).not.toBeVisible();
    await user.click(settings);
    await user.selectOptions(screen.getByLabelText('Output'), 'findings');
    await user.click(screen.getByLabelText('Brand requirements'));
    await user.clear(
      screen.getByLabelText('Runs per day, shared across the team (UTC)'),
    );
    await user.type(
      screen.getByLabelText('Runs per day, shared across the team (UTC)'),
      '5',
    );
    await user.click(settings);
    expect(settings).toHaveTextContent('5 runs per day');
    expect(screen.getByLabelText('Output')).not.toBeVisible();
    await user.click(settings);
    expect(screen.getByLabelText('Output')).toHaveValue('findings');
    expect(screen.getByLabelText('Brand requirements')).toBeChecked();
    await user.click(settings);
    await user.click(screen.getByLabelText('Launch project'));
    await user.click(screen.getByLabelText('Production team'));
    await user.click(screen.getByRole('button', { name: 'Save agent' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({
          dailyRunLimit: 5,
          outputFormat: 'findings',
          requiredInputs: ['brief', 'requirements'],
          humanConfirmation: true,
        }),
      }),
    );
  });

  it('reveals an invalid collapsed run setting before allowing a save', async () => {
    const { user, save } = setup();
    await user.click(screen.getByLabelText('Launch project'));
    await user.click(screen.getByLabelText('Production team'));
    const settings = screen.getByText(/Run settings/);
    await user.click(settings);
    const tokenLimit = screen.getByLabelText('Maximum output tokens per run');
    await user.clear(tokenLimit);
    await user.type(tokenLimit, '128');
    await user.click(settings);
    expect(tokenLimit).not.toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save agent' }));
    expect(save).not.toHaveBeenCalled();
    expect(tokenLimit).toBeVisible();
    expect(tokenLimit).toBeInvalid();
    await user.clear(tokenLimit);
    await user.type(tokenLimit, '1024');
    await user.click(settings);
    await user.click(screen.getByRole('button', { name: 'Save agent' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({ maxOutputTokens: 1024 }),
      }),
    );
  });
});

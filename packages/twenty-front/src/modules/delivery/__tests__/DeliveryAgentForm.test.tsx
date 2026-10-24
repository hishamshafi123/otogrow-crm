import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryAgentForm } from '@/delivery/DeliveryAgentForm';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'admin', isAdmin: true, isManager: true },
  projects: [
    { id: 'project', name: 'Launch project', companyId: null, memberIds: [] },
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
});

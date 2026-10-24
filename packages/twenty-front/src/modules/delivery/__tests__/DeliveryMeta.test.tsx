import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryMeta } from '@/delivery/DeliveryMeta';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
const mockMutate = jest.fn().mockResolvedValue({});
const mockRefetch = jest.fn().mockResolvedValue({});
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutate, { loading: false }],
  useQuery: () => ({
    data: {
      deliveryMeta: { connections: [], reports: [], workerSeenAt: null },
    },
    refetch: mockRefetch,
  }),
}));
const setup = (isAdmin = true) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const workspace: DeliveryWorkspace = {
    actor: { memberId: 'member', isAdmin, isManager: isAdmin },
    projects: [],
    members: [],
    tasks: [],
    companies: [],
  };
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryMeta
        workspace={workspace}
        onChanged={mockRefetch}
        onOpenTask={jest.fn()}
      />
    </I18nProvider>,
  );
};
beforeEach(() => mockMutate.mockClear());
it('keeps connection administration unavailable to team members', () => {
  setup(false);
  expect(
    screen.queryByRole('button', { name: 'Connect Meta account' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Reporting access token'),
  ).not.toBeInTheDocument();
});
it('defaults to 6 AM with scheduling off and clears the secret form after saving', async () => {
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Connect Meta account' }),
  );
  expect(
    screen.getByLabelText('Daily reporting time in the ad-account timezone'),
  ).toHaveValue('06:00');
  expect(screen.getByLabelText('Enable daily reporting')).not.toBeChecked();
  const token = screen.getByLabelText('Reporting access token');
  expect(token).toHaveAttribute('type', 'password');
  await userEvent.type(
    screen.getByLabelText('Meta ad-account ID'),
    '1657332765534462',
  );
  await userEvent.type(token, 'synthetic-token-for-test');
  await userEvent.click(
    screen.getByRole('button', { name: 'Test and save connection' }),
  );
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  expect(
    mockMutate.mock.calls[0][0].variables.input.configuration,
  ).toMatchObject({
    accountId: '1657332765534462',
    time: '06:00',
    enabled: false,
    projectId: null,
    managerId: null,
    marketerId: null,
  });
  await waitFor(() =>
    expect(
      screen.queryByLabelText('Reporting access token'),
    ).not.toBeInTheDocument(),
  );
});

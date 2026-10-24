import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryBusiness } from '@/delivery/DeliveryBusiness';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { type BusinessSnapshot } from '@/delivery/delivery-business.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryButton: 'button',
  StyledDeliveryBadge: 'span',
}));
const mockMutate = jest.fn().mockResolvedValue({});
const mockRefetch = jest.fn().mockResolvedValue({});
let mockData: BusinessSnapshot;
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutate, { loading: false }],
  useQuery: () => ({
    data: { deliveryBusiness: mockData, deliveryAgents: { agents: [] } },
    refetch: mockRefetch,
  }),
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'admin', isAdmin: true, isManager: true },
  projects: [],
  tasks: [],
  members: [],
  companies: [],
};
const setup = (view: string, value = workspace) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryBusiness
        workspace={value}
        view={view}
        onChanged={mockRefetch}
        onOpenTask={jest.fn()}
      />
    </I18nProvider>,
  );
};
beforeEach(() => {
  mockMutate.mockClear();
  mockData = { records: [], inbox: [], seen: {}, finance: [], connections: [] };
});
it('preserves currency and decimal cents when entering a receipt', async () => {
  setup('finance');
  await userEvent.click(
    screen.getByRole('button', { name: 'New Financial entry' }),
  );
  await userEvent.type(screen.getByLabelText('Title'), 'Receipt');
  await userEvent.selectOptions(screen.getByLabelText('Currency'), 'AED');
  await userEvent.selectOptions(
    screen.getByLabelText('Entry category *'),
    'INCOME',
  );
  await userEvent.type(screen.getByLabelText('Amount *'), '12.34');
  await userEvent.type(
    screen.getByLabelText('Transaction date *'),
    '2026-10-24',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save record' }));
  await waitFor(() => expect(mockMutate).toHaveBeenCalled());
  expect(mockMutate.mock.calls[0][0].variables.input.record).toMatchObject({
    kind: 'FINANCE',
    category: 'INCOME',
    currency: 'AED',
    amount: 1234,
    projectId: null,
  });
});
it('does not show financial editing or exports to an employee', () => {
  setup('finance', {
    ...workspace,
    actor: { memberId: 'employee', isAdmin: false, isManager: false },
  });
  expect(
    screen.queryByRole('button', { name: 'Export CSV' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'New Financial entry' }),
  ).not.toBeInTheDocument();
});
it('shows a read-only conversation without draft or model execution controls', async () => {
  mockData.records = [
    {
      id: 'conversation',
      revision: 1,
      kind: 'CONVERSATION',
      projectId: null,
      title: 'Client conversation',
      status: 'DRAFT',
      createdBy: 'admin',
      taskId: null,
      history: [],
      private: false,
      ownerId: 'admin',
      grants: [{ memberId: 'employee', read: true, send: false }],
    },
  ];
  setup('inbox', {
    ...workspace,
    actor: { memberId: 'employee', isAdmin: false, isManager: false },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Open details' }));
  expect(
    screen.getByText('You have view-only access to this conversation.'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save inside OS' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Generate unsent reply draft' }),
  ).not.toBeInTheDocument();
});
it('does not offer self-approval of a release', async () => {
  mockData.records = [
    {
      id: 'release',
      revision: 2,
      kind: 'RELEASE',
      projectId: null,
      title: 'Release',
      status: 'REVIEW',
      createdBy: 'admin',
      ownerId: 'admin',
      taskId: 'task',
      history: [],
    },
  ];
  setup('development');
  await userEvent.click(screen.getByRole('button', { name: 'Open details' }));
  expect(
    screen.queryByRole('button', { name: 'Record decision' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Open assigned task' }),
  ).toBeInTheDocument();
});

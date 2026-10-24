import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryOperations } from '@/delivery/DeliveryOperations';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import { type OperationsSnapshot } from '@/delivery/delivery-operations.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryGrid: 'div',
  StyledDeliveryBadge: 'span',
}));
const mockMutate = jest.fn();
const mockRefetch = jest.fn().mockResolvedValue(undefined);
const mockWriteQuery = jest.fn();
let mockData: OperationsSnapshot;
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutate, { loading: false }],
  useQuery: () => ({
    data: { deliveryOperations: mockData },
    refetch: mockRefetch,
    client: { writeQuery: mockWriteQuery },
  }),
}));
const task: DeliveryTask = {
  id: 'task',
  title: 'Monthly SEO report',
  assigneeId: 'editor',
  projectId: 'project',
  dueAt: null,
  revision: 4,
  details: {
    brief: 'Report',
    service: 'SEO',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: 'manager',
    state: 'APPROVED',
    blocker: '',
    checklist: [],
    evidence: [],
    events: [],
    submissions: [],
  },
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'manager', isAdmin: true, isManager: true },
  tasks: [task],
  projects: [
    { id: 'project', name: 'Brand', companyId: null, memberIds: ['editor'] },
  ],
  members: [
    { id: 'manager', name: 'Amna', access: 'ADMIN', roleLabel: '' },
    { id: 'editor', name: 'Editor', access: 'MEMBER', roleLabel: '' },
  ],
  companies: [],
};
const setup = (value = workspace, selectedTask?: DeliveryTask) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  render(
    <I18nProvider i18n={i18n}>
      <DeliveryOperations
        workspace={value}
        task={selectedTask}
        onChanged={mockRefetch}
      />
    </I18nProvider>,
  );
  return userEvent.setup();
};
beforeEach(() => {
  mockData = {
    enabled: false,
    timezone: 'UTC',
    telegramEnabled: false,
    founderId: null,
    botAvailable: false,
    templates: [],
    notices: [],
    fulfilments: [],
    alerts: [],
    connections: [],
  };
  mockMutate
    .mockReset()
    .mockResolvedValue({ data: { changeDeliveryOperations: mockData } });
});
describe('delivery follow-through', () => {
  it('keeps recurrence administration and founder settings unavailable to employees', () => {
    setup({
      ...workspace,
      actor: { memberId: 'editor', isAdmin: false, isManager: false },
    });
    expect(
      screen.queryByText('Follow-through settings'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save recurring template' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create private link' }),
    ).toBeDisabled();
  });
  it('does not treat approval as recorded delivery', async () => {
    const user = setup(workspace, task);
    expect(
      screen.getByText(
        'No delivery recorded. Approval alone does not confirm delivery.',
      ),
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText('Delivery evidence or note'),
      'Sent the approved report by email',
    );
    await user.click(
      screen.getByRole('button', { name: 'Record delivery now' }),
    );
    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith({
        variables: {
          input: {
            action: 'delivered',
            taskId: 'task',
            revision: 4,
            note: 'Sent the approved report by email',
          },
        },
      }),
    );
  });
  it('sends the current fulfilment history version with a redo decision', async () => {
    mockData.fulfilments = [
      {
        taskId: 'task',
        status: 'WAITING',
        deliveredAt: '2026-10-24T00:00:00Z',
        nextCheckAt: '2026-10-24T12:00:00Z',
        cycle: 2,
        history: [
          {
            at: '2026-10-24T00:00:00Z',
            actorId: 'manager',
            action: 'DELIVERED',
            note: 'Sent',
          },
        ],
      },
    ];
    const user = setup(workspace, task);
    await user.selectOptions(
      screen.getByLabelText('Fulfilment decision'),
      'REDOING',
    );
    await user.type(
      screen.getByLabelText('Decision note'),
      'Client requested corrections',
    );
    await user.click(
      screen.getByRole('button', { name: 'Save fulfilment decision' }),
    );
    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith({
        variables: {
          input: {
            action: 'fulfilment',
            taskId: 'task',
            cycle: 2,
            historyLength: 1,
            decision: 'REDOING',
            note: 'Client requested corrections',
          },
        },
      }),
    );
  });
});

import { useState } from 'react';
import { Request } from 'cross-fetch';
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    submissions: [
      {
        version: 1,
        description: 'Approved report',
        evidence: [],
        submittedBy: 'editor',
        submittedAt: '2026-10-23T00:00:00Z',
        decision: 'APPROVED',
        reviewedBy: 'manager',
        reviewedAt: '2026-10-23T01:00:00Z',
      },
    ],
  },
};
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'manager', isAdmin: true, isManager: true },
  tasks: [task],
  projects: [
    {
      revision: 1,
      id: 'project',
      name: 'Brand',
      companyId: null,
      memberIds: ['editor'],
    },
  ],
  members: [
    { id: 'manager', name: 'Amna', access: 'ADMIN', roleLabel: '' },
    { id: 'editor', name: 'Editor', access: 'MEMBER', roleLabel: '' },
  ],
  companies: [],
};
const message = (
  id: string,
  recipientId = 'editor',
): OperationsSnapshot['notices'][number] => ({
  id,
  taskId: task.id,
  recipientId,
  senderId: 'manager',
  kind: 'MESSAGE',
  text: `Message ${id}`,
  createdAt: '2026-10-24T00:00:00Z',
  remindAt: '2026-10-24T00:05:00Z',
  seenAt: null,
  acknowledgedAt: null,
  sendState: 'PENDING',
  error: null,
});
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
  it('opens the exact daily Meta report in the typed workbench without marking the notice seen', () => {
    const reportId = '5a5adf3e-cbb0-4235-8de7-25d5b5072943';
    mockData.notices = [
      {
        ...message('daily-report', 'manager'),
        taskId: `meta-report:${reportId}`,
      },
    ];
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <DeliveryOperations workspace={workspace} onChanged={mockRefetch} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(
      screen.getByRole('link', { name: 'Open advertising report' }),
    ).toHaveAttribute(
      'href',
      `/delivery?view=ads&adSource=META&adReport=${reportId}`,
    );
    expect(mockMutate).not.toHaveBeenCalled();
  });
  it('opens the exact review submission and keeps reviewer notices separate from production read receipts', () => {
    const taskId = '5a5adf3e-cbb0-4235-8de7-25d5b5072943';
    mockData.notices = [
      {
        ...message('review', 'manager'),
        taskId,
        kind: 'REVIEW_ASSIGNMENT',
        reviewAssignment: {
          submissionVersion: 3,
          assignmentId: 'aff8ec4c-566d-4235-8af6-aad3a8007473',
          assignmentRevision: 2,
          recipientId: 'manager',
        },
      },
    ];
    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter
          initialEntries={[
            '/delivery?view=operations&search=keep&creativeCompare=1',
          ]}
        >
          <DeliveryOperations
            workspace={workspace}
            onChanged={mockRefetch}
            onOpenTask={jest.fn()}
          />
        </MemoryRouter>
      </I18nProvider>,
    );
    const link = screen.getByRole('link', {
      name: 'Open assigned submission review',
    });
    const params = new URL(link.getAttribute('href')!, 'http://localhost')
      .searchParams;
    expect(params.get('view')).toBe('reviews');
    expect(params.get('task')).toBe(taskId);
    expect(params.get('creativeSubmission')).toBe('3');
    expect(params.get('search')).toBe('keep');
    expect(params.has('creativeCompare')).toBe(false);
    expect(
      screen.queryByRole('button', { name: 'Mark as read' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open task' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeVisible();
    expect(mockMutate).not.toHaveBeenCalled();
  });
  it('leaves messages unread when opening a task and marks only the selected message read', async () => {
    mockData.notices = [message('first'), message('second')];
    const user = setup(
      {
        ...workspace,
        actor: { memberId: 'editor', isAdmin: false, isManager: false },
      },
      task,
    );
    expect(screen.getByText('Message first')).toBeInTheDocument();
    expect(screen.getByText('Message second')).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
    const firstMessage = screen.getByText('Message first').closest('section');
    expect(firstMessage).not.toBeNull();
    await user.click(
      within(firstMessage!).getByRole('button', { name: 'Mark as read' }),
    );
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    expect(mockMutate).toHaveBeenCalledWith({
      variables: { input: { action: 'noticeSeen', id: 'first' } },
    });
  });
  it('keeps marking read and acknowledgement restricted to the recipient', async () => {
    mockData.notices = [message('employee'), message('manager', 'manager')];
    const user = setup(workspace, task);
    const employeeMessage = screen
      .getByText('Message employee')
      .closest('section');
    const managerMessage = screen
      .getByText('Message manager')
      .closest('section');
    expect(employeeMessage).not.toBeNull();
    expect(managerMessage).not.toBeNull();
    expect(
      within(employeeMessage!).queryByRole('button', { name: 'Mark as read' }),
    ).not.toBeInTheDocument();
    expect(
      within(employeeMessage!).queryByRole('button', { name: 'Acknowledge' }),
    ).not.toBeInTheDocument();
    await user.click(
      within(managerMessage!).getByRole('button', { name: 'Acknowledge' }),
    );
    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith({
        variables: { input: { action: 'acknowledge', id: 'manager' } },
      }),
    );
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
  it('keeps recurrence administration and founder settings unavailable to employees', () => {
    setup({
      ...workspace,
      actor: { memberId: 'editor', isAdmin: false, isManager: false },
    });
    expect(
      screen.queryByText('Delivery and reminder settings'),
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
        deliveredSubmissionVersion: 1,
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

const GuardedOperations = ({
  selectedTask,
}: {
  selectedTask?: DeliveryTask;
}) => {
  const [, refresh] = useState(0);
  return (
    <>
      <Link to="/other">Other view</Link>
      <button onClick={() => refresh((value) => value + 1)}>
        Refresh test data
      </button>
      <DeliveryOperations
        workspace={workspace}
        task={selectedTask}
        onChanged={mockRefetch}
      />
    </>
  );
};
const setupGuardedOperations = (selectedTask?: DeliveryTask) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <GuardedOperations selectedTask={selectedTask} />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other view opened</p> },
    ],
    { initialEntries: ['/delivery'] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return userEvent.setup();
};

it('preserves failed internal messages but clears a successful message even when the subsequent refresh fails', async () => {
  const user = setupGuardedOperations(task);
  await user.type(
    screen.getByLabelText('Message'),
    'Please check the finished work',
  );
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  mockMutate.mockRejectedValueOnce(new Error('Message not saved'));
  await user.click(
    screen.getByRole('button', { name: 'Send internal message' }),
  );
  expect(screen.getByLabelText('Message')).toHaveValue(
    'Please check the finished work',
  );
  mockRefetch.mockRejectedValueOnce(new Error('Refresh unavailable'));
  await user.click(
    screen.getByRole('button', { name: 'Send internal message' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('operation was saved');
  expect(screen.getByLabelText('Message')).toHaveValue('');
  expect(mockMutate).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByText('Other view opened')).toBeInTheDocument();
});

it('keeps settings through a polling conflict until an explicit reload', async () => {
  const user = setupGuardedOperations();
  await user.clear(screen.getByLabelText('Workspace timezone (IANA)'));
  await user.type(
    screen.getByLabelText('Workspace timezone (IANA)'),
    'Asia/Qatar',
  );
  mockData = { ...mockData, timezone: 'Asia/Dubai' };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.getByLabelText('Workspace timezone (IANA)')).toHaveValue(
    'Asia/Qatar',
  );
  expect(
    screen.getByRole('button', { name: 'Save follow-through settings' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Workspace timezone (IANA)')).toHaveValue(
    'Asia/Qatar',
  );
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Workspace timezone (IANA)')).toHaveValue(
    'Asia/Dubai',
  );
});

it('guards replacing a recurring draft and ignores scheduler counters while detecting template edits', async () => {
  mockData.templates = [
    {
      id: 'template',
      projectId: 'project',
      fields: {
        ...task.details,
        title: task.title,
        assigneeId: 'editor',
        dueAt: null,
      },
      frequency: 'WEEKLY',
      weekdays: [1],
      monthDay: 1,
      time: '09:00',
      startDate: '2026-10-25',
      endDate: null,
      paused: false,
      dueHours: 24,
      skipped: 0,
      error: null,
      lastDate: null,
      lastTaskId: null,
    },
  ];
  const user = setupGuardedOperations();
  await user.type(
    screen.getByLabelText('Task title'),
    'Unfinished new schedule',
  );
  await user.click(screen.getByRole('button', { name: 'Edit template' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Task title')).toHaveValue(
    'Unfinished new schedule',
  );
  await user.click(screen.getByRole('button', { name: 'Edit template' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  await user.type(screen.getByLabelText('Task title'), ' updated');
  mockData.templates = [
    { ...mockData.templates[0], skipped: 2, lastDate: '2026-10-26' },
  ];
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.getByRole('button', { name: 'Save recurring template' }),
  ).toBeEnabled();
  mockData.templates = [{ ...mockData.templates[0], time: '10:00' }];
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.getByRole('button', { name: 'Save recurring template' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Task title')).toHaveValue(
    'Monthly SEO report updated',
  );
});

it('keeps an internal message when the server response contains no confirmed operation result', async () => {
  const user = setupGuardedOperations(task);
  await user.type(
    screen.getByLabelText('Message'),
    'Keep this unconfirmed message',
  );
  mockMutate.mockResolvedValueOnce({ data: undefined });
  await user.click(
    screen.getByRole('button', { name: 'Send internal message' }),
  );
  expect(screen.getByLabelText('Message')).toHaveValue(
    'Keep this unconfirmed message',
  );
});
it('prevents invalid timezone settings before any operation is submitted', async () => {
  const user = setupGuardedOperations();
  await user.clear(screen.getByLabelText('Workspace timezone (IANA)'));
  await user.type(
    screen.getByLabelText('Workspace timezone (IANA)'),
    'Not/A_Timezone',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save follow-through settings' }),
  );
  expect(screen.getByLabelText('Workspace timezone (IANA)')).toBeInvalid();
  expect(mockMutate).not.toHaveBeenCalled();
});

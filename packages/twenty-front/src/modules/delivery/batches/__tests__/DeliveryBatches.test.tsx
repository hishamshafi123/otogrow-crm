import { useState } from 'react';
import { Request } from 'cross-fetch';
import { type DocumentNode } from 'graphql';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryBatches } from '@/delivery/batches/DeliveryBatches';
import { type BatchSnapshot } from '@/delivery/batches/batch.types';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/workflows/workflowStyles', () => ({
  StyledWorkflowActions: 'div',
  StyledWorkflowList: 'ul',
}));
let mockData: BatchSnapshot;
let mockManager: boolean;
let mockReadError: Error | undefined;
let mockLoading: boolean;
let mockMember: string;
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
const mockQueries = jest.fn();
const mockOpen = jest.fn();
jest.mock('@/otogrow-access/useOtogrowIdentity', () => ({
  useOtogrowIdentity: () => ({ identity: `workspace:${mockMember}` }),
}));
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => ({
    access: {
      workspaceId: 'workspace',
      memberId: mockMember,
      userWorkspaceId: 'membership',
      capabilities: mockManager ? ['delivery.manage'] : [],
    },
    scopeKey: `workspace:${mockMember}:membership`,
    loading: mockLoading,
    error: undefined,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    _document: DocumentNode,
    options: { variables: { input: { batchId?: string } } },
  ) => {
    mockQueries(options);
    return {
      data: {
        deliveryBatches: {
          ...mockData,
          selected: options.variables.input.batchId ? mockData.selected : null,
        },
      },
      loading: false,
      error: mockReadError,
      refetch: mockRefetch,
    };
  },
  useMutation: (document: DocumentNode) => {
    const operation = document.definitions.find(
      (definition) => definition.kind === 'OperationDefinition',
    );
    return [
      (options: unknown) =>
        mockMutate(
          operation?.kind === 'OperationDefinition'
            ? operation.name?.value
            : '',
          options,
        ),
      { loading: false },
    ];
  },
}));
const Harness = () => {
  const [, refresh] = useState(0);
  const workspace: DeliveryWorkspace = {
    actor: { memberId: mockMember, isAdmin: false, isManager: mockManager },
    projects: [
      {
        revision: 1,
        id: 'project',
        name: 'Brand',
        companyId: 'client',
        memberIds: [],
      },
    ],
    tasks: [],
    members: [],
    companies: [],
  };
  return (
    <>
      <Link to="/other">Other view</Link>
      <button onClick={() => refresh((value) => value + 1)}>
        Refresh test state
      </button>
      <DeliveryBatches workspace={workspace} onOpenTask={mockOpen} />
    </>
  );
};
const setup = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Harness />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other destination</p> },
    ],
    {
      initialEntries: [
        '/delivery?view=batches&batchProject=project&batch=batch',
      ],
    },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return userEvent.setup();
};
beforeAll(() => {
  global.Request = Request as typeof global.Request;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    value() {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    value() {
      this.removeAttribute('open');
    },
  });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});
beforeEach(() => {
  jest.clearAllMocks();
  mockManager = true;
  mockReadError = undefined;
  mockLoading = false;
  mockMember = 'manager';
  const batch = {
    id: 'batch',
    label: 'October creative',
    revision: 4,
    closed: false,
    periodId: null,
    startDate: null,
    endDate: null,
    timezone: 'Asia/Qatar',
  };
  mockData = {
    workspaceId: 'workspace',
    memberId: 'manager',
    userWorkspaceId: 'membership',
    projectId: 'project',
    canManage: true,
    batches: [batch],
    selected: batch,
    periods: [],
    tasks: [
      {
        taskId: 'video',
        title: 'Original product video',
        concept: 'Comfort after a long day',
        available: true,
        state: 'IN_REVIEW',
        taskRevision: 3,
        assigneeName: 'Editor',
        reviewerName: 'Amna',
        submissionVersion: 2,
        unit: 'UNIQUE_VIDEO',
        approved: false,
        fulfilled: false,
      },
    ],
    counts: [
      { key: 'ALL', total: 5, approved: 2, fulfilled: 1 },
      { key: 'UNIQUE_VIDEO', total: 2, approved: 1, fulfilled: 0 },
      { key: 'VARIATION', total: 3, approved: 1, fulfilled: 1 },
    ],
    history: [],
    taskOptions: [
      { taskId: 'new-task', title: 'New hook variation', taskRevision: 7 },
    ],
    moreTaskOptions: false,
    nextCursor: null,
    nextTaskCursor: 'page-2',
    nextHistoryCursor: null,
  };
  mockRefetch.mockResolvedValue({ data: { deliveryBatches: mockData } });
  mockMutate.mockRejectedValue(new Error('Another manager changed this plan.'));
});
test('separates whole-batch totals from the visible task page and opens exact review', async () => {
  const user = setup();
  expect(
    within(screen.getByRole('region', { name: 'Unique videos' })).getByText(
      '2 planned · 1 approved · 0 fulfilled',
    ),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('region', { name: 'Variations' })).getByText(
      '3 planned · 1 approved · 1 fulfilled',
    ),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Inspect submission and review' }),
  );
  expect(mockOpen).toHaveBeenCalledWith('video');
  expect(mockMutate).not.toHaveBeenCalled();
});
test('adds an existing task with its observed revision and preserves a failed draft', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Add a task' }));
  await user.selectOptions(
    screen.getByRole('combobox', { name: /^Task$/ }),
    'new-task',
  );
  await user.type(
    screen.getByRole('textbox', {
      name: 'Concept or grouping note (optional)',
    }),
    'Hook family B',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for this change' }),
    'Plan next week',
  );
  await user.click(screen.getByRole('button', { name: 'Save plan change' }));
  expect(mockMutate).toHaveBeenCalledWith('SaveDeliveryBatchItem', {
    variables: {
      input: {
        projectId: 'project',
        batchId: 'batch',
        revision: 4,
        taskId: 'new-task',
        taskRevision: 7,
        active: true,
        concept: 'Hook family B',
        reason: 'Plan next week',
      },
    },
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Another manager');
  expect(
    screen.getByRole('textbox', { name: 'Reason for this change' }),
  ).toHaveValue('Plan next week');
});
test('protects a changed plan on navigation and retains it when keeping editing', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit plan' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Batch name' }),
    ' changed',
  );
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox', { name: 'Batch name' })).toHaveValue(
    'October creative changed',
  );
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByText('Other destination')).toBeInTheDocument();
});
test('rejects an incompatible date pair before sending', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit plan' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for this change' }),
    'Update date',
  );
  await user.type(screen.getByLabelText('First day (optional)'), '2026-11-20');
  expect(
    screen.getByRole('button', { name: 'Save plan change' }),
  ).toBeDisabled();
  expect(mockMutate).not.toHaveBeenCalled();
});
test('blocks stale planning edits without replacing the draft', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit plan' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for this change' }),
    'Change scope',
  );
  mockData = { ...mockData, selected: { ...mockData.selected!, revision: 5 } };
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(
    screen.getByRole('button', { name: 'Save plan change' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('textbox', { name: 'Reason for this change' }),
  ).toHaveValue('Change scope');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'changed while you were editing',
  );
});
test('closed plans retain task review while hiding plan edits', () => {
  mockData.selected!.closed = true;
  setup();
  expect(
    screen.getByRole('button', { name: 'Reopen planning' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Add a task' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Inspect submission and review' }),
  ).toBeInTheDocument();
});
test('staff can read permitted progress but cannot change plans', () => {
  mockManager = false;
  mockData.canManage = false;
  setup();
  expect(
    screen.getByRole('button', { name: 'Original product video' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Edit plan' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'New batch' }),
  ).not.toBeInTheDocument();
});
test('read errors and fresh permission loading hide previous data and recover the draft', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit plan' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for this change' }),
    'Keep draft',
  );
  mockReadError = new Error('Temporary read failure');
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(
    screen.queryByRole('textbox', { name: 'Reason for this change' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Original product video' }),
  ).not.toBeInTheDocument();
  mockReadError = undefined;
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(
    screen.getByRole('textbox', { name: 'Reason for this change' }),
  ).toHaveValue('Keep draft');
  mockLoading = true;
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(
    screen.queryByRole('button', { name: 'Original product video' }),
  ).not.toBeInTheDocument();
});
test('a changed identity cannot see the previous batch or draft', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit plan' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for this change' }),
    'Private draft',
  );
  mockMember = 'different-member';
  await user.click(screen.getByRole('button', { name: 'Refresh test state' }));
  expect(
    screen.queryByRole('textbox', { name: 'Reason for this change' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'October creative' }),
  ).not.toBeInTheDocument();
});
test('unavailable tasks show no stale owner or actionable review', () => {
  mockData.tasks = [
    {
      ...mockData.tasks[0],
      available: false,
      state: null,
      assigneeName: null,
      reviewerName: null,
      approved: false,
      fulfilled: false,
    },
  ];
  setup();
  expect(
    screen.getByText('No longer available in this project'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Original product video' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Inspect submission and review' }),
  ).not.toBeInTheDocument();
});

test('a successful save closes the editor even when refreshing the list fails', async () => {
  mockMutate.mockResolvedValue({ data: { saveDeliveryBatch: mockData } });
  mockRefetch.mockRejectedValue(new Error('Refresh unavailable'));
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit plan' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Batch name' }),
    ' revised',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Reason for this change' }),
    'Updated planning scope',
  );
  await user.click(screen.getByRole('button', { name: 'Save plan change' }));
  expect(
    screen.queryByRole('form', { name: 'Edit batch plan' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Saved, but the list could not refresh',
  );
  expect(mockMutate).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByText('Other destination')).toBeInTheDocument();
});

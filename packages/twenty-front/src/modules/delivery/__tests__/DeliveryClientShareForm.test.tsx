import { useState } from 'react';
import { Request } from 'cross-fetch';
import { type DocumentNode } from 'graphql';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryClientShareForm } from '@/delivery/DeliveryClientShareForm';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type ClientEngagement } from '@/delivery/delivery-clients.types';
import {
  MANAGER_ID,
  PROJECT_ID,
  TASK_ID,
  taskDetailFixture,
  taskListFixture,
} from '@/delivery/tasks/__tests__/tasks.fixtures';

let mockList = taskListFixture();
let mockDetail = taskDetailFixture();
let mockListError: Error | undefined;
let mockDetailError: Error | undefined;
let mockListLoading = false;
let mockDetailLoading = false;
let mockManager = true;
let mockSource = 'workspace:membership:manager';
let mockRefresh: () => void;
const mockListRefetch = jest.fn();
const mockDetailRefetch = jest.fn();
const mockRun = jest.fn();
const mockQueries = jest.fn();
const engagement: ClientEngagement = {
  id: '733f330f-1436-464b-a9d1-55f1be012233',
  projectId: PROJECT_ID,
  companyId: 'ff3ce27f-21ee-41bf-a05a-61a907f71061',
  revision: 1,
  name: 'Brand videos',
  services: ['Video'],
  billing: 'RETAINER',
  scope: '',
  allowance: '',
  contact: '',
  fields: [],
  submissions: [],
  assets: [],
};
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@linaria/react', () => ({
  styled: { div: () => 'div', dialog: () => 'dialog' },
}));
jest.mock('@/delivery/assistants/useAssistantAccess', () => ({
  useAssistantAccess: () => ({
    source: mockSource,
    permission: {
      ready: true,
      manager: mockManager,
      denied: false,
      refetch: async () => undefined,
      matches: (value?: {
        workspaceId: string;
        memberId: string;
        userWorkspaceId: string;
      }) =>
        value?.workspaceId === 'workspace' &&
        value.memberId === MANAGER_ID &&
        value.userWorkspaceId === 'membership',
    },
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (document: DocumentNode, options: { variables: unknown }) => {
    const definition = document.definitions.find(
      (item) => item.kind === 'OperationDefinition',
    );
    const name =
      definition?.kind === 'OperationDefinition' ? definition.name?.value : '';
    mockQueries(name, options.variables);
    return name === 'DeliveryTaskList'
      ? {
          data: { deliveryTaskList: mockList },
          loading: mockListLoading,
          error: mockListError,
          refetch: mockListRefetch,
        }
      : {
          data: { deliveryTaskDetail: mockDetail },
          loading: mockDetailLoading,
          error: mockDetailError,
          refetch: mockDetailRefetch,
        };
  },
}));
const denied = () =>
  new CombinedGraphQLErrors({
    errors: [
      { message: 'Task unavailable', extensions: { code: 'FORBIDDEN' } },
    ],
  });
const setup = () => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    return (
      <>
        <Link to="/other">Another page</Link>
        <DeliveryClientShareForm
          engagement={engagement}
          busy={false}
          run={mockRun}
        />
      </>
    );
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Page />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
      { path: '/other', element: <p>Other route</p> },
    ],
    { initialEntries: ['/delivery'] },
  );
  render(<RouterProvider router={router} />);
  return router;
};
const selectTask = async () => {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Task'), TASK_ID);
  return user;
};
beforeEach(() => {
  jest.clearAllMocks();
  mockList = taskListFixture();
  mockDetail = taskDetailFixture();
  mockList.items[0].state = 'APPROVED';
  mockDetail.task.details.state = 'APPROVED';
  mockListError = undefined;
  mockDetailError = undefined;
  mockListLoading = false;
  mockDetailLoading = false;
  mockManager = true;
  mockSource = 'workspace:membership:manager';
  mockRun.mockResolvedValue(true);
  mockListRefetch.mockImplementation(async () => ({
    data: { deliveryTaskList: mockList },
  }));
  mockDetailRefetch.mockImplementation(async () => ({
    data: { deliveryTaskDetail: mockDetail },
  }));
  Object.assign(globalThis, { Request });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
it('uses a bounded project query and verifies the exact current version before sharing', async () => {
  setup();
  const user = await selectTask();
  expect(mockQueries).toHaveBeenCalledWith(
    'DeliveryTaskList',
    expect.objectContaining({
      input: expect.objectContaining({
        view: 'PLANNER',
        projectId: PROJECT_ID,
        limit: 25,
      }),
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Share approved submission' }),
  );
  expect(mockDetailRefetch).toHaveBeenCalledTimes(1);
  expect(mockRun).toHaveBeenCalledWith({
    action: 'share',
    engagementId: engagement.id,
    taskId: TASK_ID,
    revision: 4,
    kind: 'SUBMISSION',
  });
  expect(mockDetailRefetch.mock.invocationCallOrder[0]).toBeLessThan(
    mockRun.mock.invocationCallOrder[0],
  );
  expect(screen.getByLabelText('Task')).toHaveValue('');
});
it('clears selected private work on independent list denial and recovers without the old selection', async () => {
  setup();
  const user = await selectTask();
  mockListError = denied();
  act(() => mockRefresh());
  expect(screen.queryByText('Current product edit')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Share approved submission' }),
  ).not.toBeInTheDocument();
  mockListError = undefined;
  act(() => mockRefresh());
  await user.click(screen.getByRole('button', { name: 'Check task access' }));
  expect(screen.getByLabelText('Task')).toHaveValue('');
  expect(mockRun).not.toHaveBeenCalled();
});
it('clears the exact selected row after revocation even while other list work remains readable', async () => {
  setup();
  const user = await selectTask();
  mockDetailError = denied();
  act(() => mockRefresh());
  expect(screen.queryByText('Current product edit')).not.toBeInTheDocument();
  expect(mockRun).not.toHaveBeenCalled();
  await user.click(screen.getByRole('link', { name: 'Another page' }));
  expect(screen.getByText('Other route')).toBeVisible();
  expect(screen.queryByText('Keep your changes?')).not.toBeInTheDocument();
});
it('preserves an exactly readable selected task when it is absent from a later list page', async () => {
  setup();
  const user = await selectTask();
  await user.click(screen.getByRole('button', { name: 'Next task page' }));
  mockList = { ...mockList, items: [], nextCursor: null };
  act(() => mockRefresh());
  expect(
    screen.getByRole('option', { name: 'Current product edit' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Share approved submission' }),
  ).toBeEnabled();
});
it('hides task choices through an outage and restores the exact unsent selection', async () => {
  setup();
  await selectTask();
  mockListError = new Error('Offline');
  act(() => mockRefresh());
  expect(screen.queryByText('Current product edit')).not.toBeInTheDocument();
  mockListError = undefined;
  act(() => mockRefresh());
  expect(screen.getByLabelText('Task')).toHaveValue(TASK_ID);
  expect(
    screen.getByRole('button', { name: 'Share approved submission' }),
  ).toBeEnabled();
  expect(mockRun).not.toHaveBeenCalled();
});
it('does not automatically accept a changed selected revision', async () => {
  setup();
  await selectTask();
  mockDetail = { ...mockDetail, task: { ...mockDetail.task, revision: 5 } };
  act(() => mockRefresh());
  expect(
    screen.getByRole('button', { name: 'Share approved submission' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Reload selected version' }),
  ).toBeVisible();
  expect(mockRun).not.toHaveBeenCalled();
});
it('rejects a revision change discovered by the final action check without writing', async () => {
  setup();
  const user = await selectTask();
  mockDetailRefetch.mockResolvedValueOnce({
    data: {
      deliveryTaskDetail: {
        ...mockDetail,
        task: { ...mockDetail.task, revision: 5 },
      },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Share approved submission' }),
  );
  expect(
    screen.getByText(
      'The selected task changed. Review the latest approved version before sharing.',
    ),
  ).toBeVisible();
  expect(mockRun).not.toHaveBeenCalled();
});
it('ignores a late exact check after management authority changes', async () => {
  setup();
  const user = await selectTask();
  let resolve: (result: {
    data: { deliveryTaskDetail: typeof mockDetail };
  }) => void = () => undefined;
  mockDetailRefetch.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Share approved submission' }),
  );
  mockManager = false;
  mockSource = 'workspace:membership:reader';
  act(() => mockRefresh());
  await act(async () => resolve({ data: { deliveryTaskDetail: mockDetail } }));
  expect(mockRun).not.toHaveBeenCalled();
  expect(screen.queryByText('Current product edit')).not.toBeInTheDocument();
});
it('keeps focus on an outside control when private task choices disappear', async () => {
  setup();
  const user = await selectTask();
  const outside = screen.getByRole('link', { name: 'Another page' });
  outside.focus();
  mockListError = denied();
  act(() => mockRefresh());
  expect(outside).toHaveFocus();
  await user.click(outside);
  expect(screen.getByText('Other route')).toBeVisible();
});

it('offers the first task page after a policy-bound cursor becomes invalid', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Next task page' }));
  mockListError = new CombinedGraphQLErrors({
    errors: [
      { message: 'Return to the first page', extensions: { code: 'CONFLICT' } },
    ],
  });
  act(() => mockRefresh());
  expect(screen.queryByText('Current product edit')).not.toBeInTheDocument();
  mockQueries.mockClear();
  await user.click(screen.getByRole('button', { name: 'First task page' }));
  expect(mockQueries).toHaveBeenCalledWith(
    'DeliveryTaskList',
    expect.objectContaining({
      input: expect.objectContaining({ after: null }),
    }),
  );
  expect(mockRun).not.toHaveBeenCalled();
});

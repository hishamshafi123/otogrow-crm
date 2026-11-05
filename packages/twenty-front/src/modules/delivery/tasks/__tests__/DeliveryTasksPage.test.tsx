import type * as React from 'react';
import { type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { createStore, Provider } from 'jotai';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import type * as DraftGuard from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryTasksPage } from '@/delivery/tasks/DeliveryTasksPage';
import {
  type DeliveryTask,
  type DeliveryCommandRunner,
} from '@/delivery/delivery.types';
import { type OtogrowAccess } from '@/otogrow-access/otogrow-access.types';
import {
  taskContextFixture,
  taskListFixture,
  taskDetailFixture,
  TASK_ID,
  OFF_PAGE_TASK_ID,
  MANAGER_ID,
  PROJECT_ID,
} from '@/delivery/tasks/__tests__/tasks.fixtures';
let mockContext = taskContextFixture();
let mockList = taskListFixture();
let mockDetail = taskDetailFixture();
let mockReady = true;
let mockManager = true;
let mockMobile = false;
let mockAccess: OtogrowAccess;
let mockError: Error | undefined;
let mockContextError: Error | undefined;
let mockDetailError: Error | undefined;
let mockDetailLoading = false;
let mockRefresh: () => void;
const mockMutate = jest.fn();
const mockSeen = jest.fn();
const mockQuery = jest.fn();
const mockRefetch = jest.fn();
const mockRefetchQueries = jest.fn();
const mockReviewQueue = jest.fn();
const observers = new Map<Element, IntersectionObserverCallback>();
const observer: IntersectionObserver = {
  root: null,
  rootMargin: '0px',
  thresholds: [0, 0.1, 0.5, 1],
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
  takeRecords: () => [],
};
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryCanvas: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryDrawer: 'dialog',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryBadge: 'span',
  StyledDeliveryBoard: 'div',
}));
jest.mock('@/ui/layout/page/components/PageBody', () => ({ PageBody: 'main' }));
jest.mock('@/ui/layout/page/components/PageContainer', () => ({
  PageContainer: 'div',
}));
jest.mock('@/navigation/hooks/useNavigationDrawerExpanded', () => ({
  useNavigationDrawerExpanded: () => true,
}));
jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerCollapseButton',
  () => ({ NavigationDrawerCollapseButton: () => null }),
);
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => mockMobile,
}));
jest.mock('@/delivery/reviews/DeliveryAssignedReviewsToday', () => ({
  DeliveryAssignedReviewsToday: () => (
    <p>Independent current assigned review count</p>
  ),
}));
jest.mock('@/delivery/capacity/read/DeliveryPlannerCapacity', () => {
  const { useState } = jest.requireActual<typeof React>('react');
  const { useDeliveryDraftStatus } = jest.requireActual<typeof DraftGuard>(
    '@/delivery/drafts/DeliveryDraftGuard',
  );
  return {
    DeliveryPlannerCapacity: () => {
      const [draft, setDraft] = useState('');
      useDeliveryDraftStatus({ dirty: draft !== '', saving: false });
      return (
        <section aria-label="Complete all-project capacity">
          <p>Complete all-project capacity</p>
          <label>
            Availability draft
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
        </section>
      );
    },
  };
});
jest.mock('@/delivery/reviews/useTaskReview', () => ({
  useTaskReview: () => ({ data: null, available: false }),
}));
jest.mock('@/delivery/reviews/DeliveryReviewQueue', () => ({
  DeliveryReviewQueue: (props: { enabled: boolean; readScope: string }) => {
    mockReviewQueue(props);
    return <p>Scoped pending review queue</p>;
  },
}));
jest.mock('@/delivery/DeliveryTaskDetail', () => {
  const { useState } = jest.requireActual<typeof React>('react');
  const { useDeliveryDraftStatus } = jest.requireActual<typeof DraftGuard>(
    '@/delivery/drafts/DeliveryDraftGuard',
  );
  return {
    DeliveryTaskDetail: ({
      task,
      run,
      busy,
    }: {
      task: DeliveryTask;
      run: DeliveryCommandRunner;
      busy: boolean;
    }) => {
      const [draft, setDraft] = useState('');
      useDeliveryDraftStatus({ dirty: Boolean(draft), saving: busy });
      return (
        <section aria-label="Exact loaded task">
          <h3>{task.title}</h3>
          <p>{task.details.brief}</p>
          <label>
            Task draft
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button
            disabled={busy}
            onClick={async () => {
              if (
                await run({
                  action: 'comment',
                  taskId: task.id,
                  revision: task.revision,
                  text: draft,
                })
              )
                setDraft('');
            }}
          >
            Save task note
          </button>
        </section>
      );
    },
  };
});
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    manager: mockManager && mockReady,
    denied: false,
    scope: 'workspace:task-page:membership',
    access: mockReady ? mockAccess : undefined,
    canReadFinance: mockManager,
    refetch: mockRefetch,
    error: mockError,
    matches: (
      data?: {
        workspaceId: string;
        memberId: string;
        userWorkspaceId: string;
      } | null,
    ) =>
      mockReady &&
      data?.workspaceId === 'workspace' &&
      data.memberId === MANAGER_ID &&
      data.userWorkspaceId === 'membership',
  }),
}));
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => ({
    access: mockReady ? mockAccess : undefined,
    scopeKey: mockReady ? 'task-page-member' : null,
    loading: !mockReady,
    error: mockError,
    refetch: mockRefetch,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useMutation: (document: DocumentNode) => [
    document.definitions.some(
      (definition) =>
        definition.kind === 'OperationDefinition' &&
        definition.name?.value === 'SeeDeliveryTaskAssignment',
    )
      ? mockSeen
      : mockMutate,
  ],
  useQuery: (document: DocumentNode, options: unknown) => {
    const definition = document.definitions.find(
      (entry) => entry.kind === 'OperationDefinition',
    );
    const name =
      definition?.kind === 'OperationDefinition' ? definition.name?.value : '';
    mockQuery(name, options);
    const common = {
      loading: false,
      networkStatus: NetworkStatus.ready,
      error: mockError,
      refetch: mockRefetch,
      client: { refetchQueries: mockRefetchQueries },
    };
    if (name === 'DeliveryWorkspaceContext')
      return {
        ...common,
        error: mockContextError ?? mockError,
        data: { deliveryWorkspaceContext: mockContext },
      };
    if (name === 'DeliveryTaskList')
      return { ...common, data: { deliveryTaskList: mockList } };
    if (name === 'DeliveryTaskDetail')
      return {
        ...common,
        loading: mockDetailLoading,
        error: mockDetailError ?? mockError,
        data: { deliveryTaskDetail: mockDetail },
      };
    throw new Error(`Unexpected legacy or domain query: ${name}`);
  },
}));
const setup = (entry = '/delivery?view=mine&taskTimezone=Asia%2FQatar') => {
  const Page = () => {
    const [, update] = ReactActual.useState(0);
    mockRefresh = () => update((value) => value + 1);
    return <DeliveryTasksPage />;
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <Provider store={createStore()}>
            <I18nProvider i18n={i18n}>
              <DeliveryDraftGuardProvider>
                <Page />
              </DeliveryDraftGuardProvider>
            </I18nProvider>
          </Provider>
        ),
      },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return router;
};
const ReactActual = jest.requireActual<typeof React>('react');
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  localStorage.clear();
  jest.clearAllMocks();
  observers.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: jest.fn((callback: IntersectionObserverCallback) => ({
      ...observer,
      observe: (element: Element) => observers.set(element, callback),
    })),
  });
  mockContext = taskContextFixture();
  mockList = taskListFixture();
  mockDetail = taskDetailFixture();
  mockReady = true;
  mockManager = true;
  mockMobile = false;
  mockError = undefined;
  mockContextError = undefined;
  mockDetailError = undefined;
  mockDetailLoading = false;
  mockAccess = {
    workspaceId: 'workspace',
    memberId: MANAGER_ID,
    userWorkspaceId: 'membership',
    roleIds: [],
    capabilities: ['workspace.admin'],
    grants: [],
    nativeAdministrator: true,
  };
  mockRefetch.mockResolvedValue({});
  mockRefetchQueries.mockResolvedValue([]);
  mockMutate.mockResolvedValue({
    data: {
      changeDeliveryTask: {
        workspaceId: 'workspace',
        memberId: MANAGER_ID,
        userWorkspaceId: 'membership',
        taskId: TASK_ID,
        revision: 5,
        state: 'BLOCKED',
      },
    },
  });
  mockSeen.mockResolvedValue({
    data: {
      seeDeliveryTaskAssignment: {
        workspaceId: 'workspace',
        memberId: MANAGER_ID,
        userWorkspaceId: 'membership',
        taskId: TASK_ID,
        seen: true,
      },
    },
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it('keeps active mobile filters collapsed, with Clear filters inside and timing details below a disclosure', async () => {
  mockMobile = true;
  const router = setup(
    '/delivery?view=mine&taskTimezone=Asia%2FQatar&search=edit&status=BLOCKED',
  );
  const summary = screen.getByText(/Filter tasks/);
  expect(summary).toHaveTextContent('2 active');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  expect(
    within(summary.closest('details')!).getByRole('button', {
      name: 'Clear filters',
    }),
  ).not.toBeVisible();
  expect(screen.getByText(/Checked at/)).not.toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Current product edit' }),
  ).toBeVisible();
  const user = userEvent.setup();
  await user.click(summary);
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  const params = new URLSearchParams(router.state.location.search);
  expect(params.has('search')).toBe(false);
  expect(params.has('status')).toBe(false);
  expect(params.get('taskTimezone')).toBe('Asia/Qatar');
});
it('keeps unavailable project and teammate filters explicit until the user clears them', async () => {
  mockList = { ...mockList, items: [], totalCount: 0 };
  const router = setup(
    `/delivery?view=planner&taskTimezone=Asia%2FQatar&project=${OFF_PAGE_TASK_ID}&member=${OFF_PAGE_TASK_ID}&search=keep`,
  );
  const project = screen.getByRole('combobox', { name: 'Project / client' });
  const member = screen.getByRole('combobox', { name: 'Assignee' });
  expect(project).toHaveDisplayValue('Selected project unavailable');
  expect(member).toHaveDisplayValue('Selected teammate unavailable');
  expect(project).toHaveValue(OFF_PAGE_TASK_ID);
  expect(member).toHaveValue(OFF_PAGE_TASK_ID);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  const params = new URLSearchParams(router.state.location.search);
  expect(params.has('project')).toBe(false);
  expect(params.has('member')).toBe(false);
  expect(params.has('search')).toBe(false);
  expect(params.get('view')).toBe('planner');
});
it('opens scoped Approvals with exact off-page detail and no task-list input or management grant', () => {
  mockManager = false;
  mockAccess = {
    ...mockAccess,
    capabilities: ['delivery.review'],
    nativeAdministrator: false,
  };
  mockContext.actor = {
    ...mockContext.actor,
    isAdmin: false,
    isManager: false,
    capabilities: ['delivery.review'],
  };
  mockDetail = taskDetailFixture(OFF_PAGE_TASK_ID);
  setup(
    `/delivery?view=reviews&task=${OFF_PAGE_TASK_ID}&creativeSubmission=1&reviewBatch=${OFF_PAGE_TASK_ID}:1&reviewBatchIndex=0`,
  );
  expect(
    screen.getByRole('heading', { name: 'Approvals', level: 1 }),
  ).toBeVisible();
  expect(screen.getByText('Scoped pending review queue')).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'Exact loaded task' }),
  ).toHaveTextContent('Off-page task');
  expect(
    screen.queryByRole('button', { name: 'New task' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Filter tasks/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Tasks in this selection/)).not.toBeInTheDocument();
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskList',
    expect.objectContaining({
      variables: expect.objectContaining({ input: null }),
      skip: true,
    }),
  );
  expect(mockQuery).not.toHaveBeenCalledWith(
    'DeliveryTaskList',
    expect.objectContaining({ skip: false }),
  );
  expect(mockReviewQueue).toHaveBeenCalledWith(
    expect.objectContaining({
      enabled: true,
      readScope: expect.stringContaining(PROJECT_ID),
    }),
  );
});
it('protects an exact Approvals draft through Keep, outage recovery and confirmed close without losing queue selection', async () => {
  const selected = `${TASK_ID}:1`;
  const router = setup(
    `/delivery?view=reviews&task=${TASK_ID}&creativeSubmission=1&reviewBatch=${selected}&reviewBatchIndex=0&reviewsSelected=${selected}&reviewsMine=1`,
  );
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Task draft'),
    'Review notes stay exact',
  );
  const draft = screen.getByLabelText('Task draft');
  await user.click(screen.getByRole('button', { name: /^Close$/ }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(draft).toHaveValue('Review notes stay exact');
  mockReady = false;
  mockError = new Error('Offline');
  act(mockRefresh);
  expect(draft).not.toBeVisible();
  expect(draft).toBeDisabled();
  expect(screen.queryByText('Scoped pending review queue')).not.toBeVisible();
  mockReady = true;
  mockError = undefined;
  act(mockRefresh);
  expect(screen.getByLabelText('Task draft')).toBe(draft);
  expect(draft).toHaveValue('Review notes stay exact');
  await user.click(screen.getByRole('button', { name: /^Close$/ }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('view')).toBe('reviews');
  expect(params.get('reviewsSelected')).toBe(selected);
  expect(params.get('reviewsMine')).toBe('1');
  expect(params.has('task')).toBe(false);
  expect(params.has('reviewBatch')).toBe(false);
  expect(params.has('creativeSubmission')).toBe(false);
  expect(mockMutate).not.toHaveBeenCalled();
});
it('hides Approvals and exact evidence immediately after a current review-role revocation', () => {
  mockManager = false;
  mockAccess = {
    ...mockAccess,
    capabilities: ['delivery.review'],
    nativeAdministrator: false,
  };
  mockContext.actor = {
    ...mockContext.actor,
    isAdmin: false,
    isManager: false,
    capabilities: ['delivery.review'],
  };
  setup(`/delivery?view=reviews&task=${TASK_ID}`);
  expect(screen.getByText('Scoped pending review queue')).toBeVisible();
  mockAccess = { ...mockAccess, capabilities: [] };
  mockContext.actor = { ...mockContext.actor, capabilities: [] };
  act(mockRefresh);
  expect(
    screen.getByRole('heading', { name: 'Workspace unavailable' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Go to Today' })).toBeVisible();
  expect(
    screen.queryByText('Scoped pending review queue'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('PRIVATE_EXACT_DETAIL_ONLY'),
  ).not.toBeInTheDocument();
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskDetail',
    expect.objectContaining({ skip: true }),
  );
});
it('uses manager-only PLANNER reads and keeps unknown-state rows in a bounded board with complete totals', () => {
  mockList = {
    ...mockList,
    totalCount: 63,
    overview: { ...mockList.overview, totalCount: 63 },
    byState: [
      { key: 'PLANNED', count: 10 },
      { key: 'IN_PROGRESS', count: 20 },
      { key: 'BLOCKED', count: 3 },
      { key: 'IN_REVIEW', count: 4 },
      { key: 'CHANGES_REQUESTED', count: 9 },
      { key: 'APPROVED', count: 12 },
      { key: 'UNKNOWN', count: 5 },
    ],
    items: [{ ...mockList.items[0], state: 'UNKNOWN' }],
  };
  setup('/delivery?view=planner&layout=board&taskTimezone=Asia%2FQatar');
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskList',
    expect.objectContaining({
      variables: expect.objectContaining({
        input: expect.objectContaining({ view: 'PLANNER', limit: 25 }),
      }),
      skip: false,
    }),
  );
  expect(
    screen.queryByText('Complete all-project capacity'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /^Tasks$/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const column = screen.getByRole('region', { name: 'State unavailable' });
  expect(
    within(column).getByRole('link', { name: 'Current product edit' }),
  ).toBeVisible();
  expect(column).toHaveTextContent('On this page: 1');
  expect(column).toHaveTextContent('In this selection: 5');
  expect(screen.getByText(/Board columns show only this page/)).toBeVisible();
});
it('renders an explicit unavailable Planner deep link for staff and disposes prior planning figures after manager loss', () => {
  setup(
    `/delivery?view=planner&plannerView=capacity&taskTimezone=Asia%2FQatar&task=${TASK_ID}`,
  );
  expect(screen.getByText('Complete all-project capacity')).toBeVisible();
  mockManager = false;
  mockAccess = { ...mockAccess, capabilities: [], nativeAdministrator: false };
  mockContext.actor = {
    ...mockContext.actor,
    isManager: false,
    isAdmin: false,
    capabilities: [],
  };
  act(mockRefresh);
  expect(
    screen.getByRole('heading', { name: 'Workspace unavailable' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Go to Today' })).toHaveAttribute(
    'href',
    expect.stringContaining('view=home'),
  );
  expect(
    screen.queryByText('Complete all-project capacity'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('PRIVATE_EXACT_DETAIL_ONLY'),
  ).not.toBeInTheDocument();
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskList',
    expect.objectContaining({ skip: true }),
  );
});
it.each(['plannerView=capacity', 'capacityFrom=2026-10-29'])(
  'opens an explicit or existing workload link without fetching task cards: %s',
  (selection) => {
    setup(`/delivery?view=planner&${selection}&taskTimezone=Asia%2FQatar`);
    expect(screen.getByText('Complete all-project capacity')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Team workload' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByText(/Filter tasks/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Tasks in this selection/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Board view' }),
    ).not.toBeInTheDocument();
    expect(mockQuery).toHaveBeenCalledWith(
      'DeliveryTaskList',
      expect.objectContaining({ skip: true }),
    );
    expect(mockQuery).not.toHaveBeenCalledWith(
      'DeliveryTaskList',
      expect.objectContaining({ skip: false }),
    );
  },
);
it('preserves task filters and exact detail through Planner view links and browser history', async () => {
  const router = setup(
    `/delivery?view=planner&plannerView=tasks&taskTimezone=Asia%2FQatar&search=edit&layout=board&capacityFrom=2026-10-29&task=${TASK_ID}`,
  );
  const user = userEvent.setup();
  expect(
    screen.getByRole('region', { name: 'Exact loaded task' }),
  ).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Team workload' }));
  let params = new URLSearchParams(router.state.location.search);
  expect(params.get('plannerView')).toBe('capacity');
  expect(params.get('search')).toBe('edit');
  expect(params.get('layout')).toBe('board');
  expect(params.get('task')).toBe(TASK_ID);
  expect(screen.getByText('Complete all-project capacity')).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'Exact loaded task' }),
  ).toBeVisible();
  await user.click(screen.getByRole('link', { name: /^Tasks$/ }));
  expect(
    screen.queryByText('Complete all-project capacity'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Current product edit' }),
  ).toBeVisible();
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByText('Complete all-project capacity')).toBeVisible();
  await act(async () => {
    await router.navigate(1);
  });
  expect(
    screen.queryByText('Complete all-project capacity'),
  ).not.toBeInTheDocument();
  params = new URLSearchParams(router.state.location.search);
  expect(params.get('plannerView')).toBe('tasks');
  expect(params.get('search')).toBe('edit');
  expect(params.get('task')).toBe(TASK_ID);
});
it('keeps a workload draft on cancelled view navigation and discards it only after confirmation', async () => {
  const router = setup(
    '/delivery?view=planner&plannerView=capacity&taskTimezone=Asia%2FQatar&search=keep',
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Availability draft'), '240');
  await user.click(screen.getByRole('link', { name: /^Tasks$/ }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    new URLSearchParams(router.state.location.search).get('plannerView'),
  ).toBe('capacity');
  expect(screen.getByLabelText('Availability draft')).toHaveValue('240');
  await user.click(screen.getByRole('link', { name: /^Tasks$/ }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(
    new URLSearchParams(router.state.location.search).get('plannerView'),
  ).toBe('tasks');
  await user.click(screen.getByRole('link', { name: 'Team workload' }));
  expect(screen.getByLabelText('Availability draft')).toHaveValue('');
  expect(new URLSearchParams(router.state.location.search).get('search')).toBe(
    'keep',
  );
  expect(mockMutate).not.toHaveBeenCalled();
});
it('renders full counts and bounded summaries without reading any legacy workspace or detail history', () => {
  setup();
  expect(screen.getByText('Tasks in this selection: 58')).toBeVisible();
  expect(screen.getByText(/Showing 1 tasks on this page/)).toBeVisible();
  expect(screen.getByText('Waiting for approved logo')).toBeVisible();
  expect(
    screen.queryByText('PRIVATE_EXACT_DETAIL_ONLY'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('HISTORICAL_DETAIL_SENTINEL'),
  ).not.toBeInTheDocument();
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskDetail',
    expect.objectContaining({ skip: true }),
  );
  expect(mockMutate).not.toHaveBeenCalled();
  expect(mockSeen).not.toHaveBeenCalled();
});
it('resolves a staff default entry to My tasks without hydrating a legacy snapshot', async () => {
  mockManager = false;
  mockAccess = { ...mockAccess, capabilities: [], nativeAdministrator: false };
  mockContext.actor = {
    ...mockContext.actor,
    capabilities: [],
    isManager: false,
    isAdmin: false,
  };
  const router = setup('/delivery');
  await waitFor(() =>
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
      'mine',
    ),
  );
  expect(screen.getByRole('heading', { name: 'My tasks' })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'New task' }),
  ).not.toBeInTheDocument();
});
it('opens the exact off-page task without substituting the first summary row', () => {
  mockDetail = taskDetailFixture(OFF_PAGE_TASK_ID);
  setup(
    `/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${OFF_PAGE_TASK_ID}`,
  );
  const detail = screen.getByRole('region', { name: 'Exact loaded task' });
  expect(detail).toHaveTextContent('Off-page task');
  expect(detail).toHaveTextContent('PRIVATE_EXACT_DETAIL_ONLY');
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskDetail',
    expect.objectContaining({
      variables: expect.objectContaining({
        input: { taskId: OFF_PAGE_TASK_ID },
      }),
      skip: false,
    }),
  );
});
it('keeps an unavailable exact link explicit and does not use the current page task instead', () => {
  setup(
    `/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${OFF_PAGE_TASK_ID}`,
  );
  expect(screen.getByText(/No other task has been substituted/)).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'Exact loaded task' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Dismiss task link' }),
  ).toBeVisible();
});
it('preserves URL filters and a selected task when moving between bounded task pages', async () => {
  const router = setup(
    `/delivery?view=mine&taskTimezone=Asia%2FQatar&search=edit&task=${TASK_ID}`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'Next tasks page' }));
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('tasksAfter')).toBe('opaque-next-page');
  expect(params.get('search')).toBe('edit');
  expect(params.get('task')).toBe(TASK_ID);
  expect(
    screen.getByRole('region', { name: 'Exact loaded task' }),
  ).toBeVisible();
});
it('retains a same-identity task draft hidden during failed reads and restores it without writing', async () => {
  setup(`/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${TASK_ID}`);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Task draft'), 'Keep this work');
  const draft = screen.getByLabelText('Task draft');
  mockError = new Error('Offline');
  mockReady = false;
  act(mockRefresh);
  expect(draft).not.toBeVisible();
  expect(draft).toBeDisabled();
  const recoveryDialog = screen.getByRole('dialog', { name: 'Task details' });
  expect(recoveryDialog).toHaveAttribute('open');
  const retry = within(recoveryDialog).getByRole('button', {
    name: 'Retry workspace access',
  });
  expect(retry).toBeVisible();
  expect(retry).toBeEnabled();
  expect(retry).toHaveFocus();
  expect(retry.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull();
  expect(
    within(recoveryDialog).getByRole('button', { name: 'Close' }),
  ).toBeEnabled();
  await user.click(retry);
  expect(mockRefetch).toHaveBeenCalled();
  expect(draft).not.toBeVisible();
  expect(mockMutate).not.toHaveBeenCalled();
  mockError = undefined;
  mockReady = true;
  act(mockRefresh);
  expect(screen.getByLabelText('Task draft')).toBe(draft);
  expect(draft).toHaveValue('Keep this work');
  expect(draft).toBeVisible();
});
it('describes the first exact task read as loading without falsely claiming a failed check', () => {
  mockDetailLoading = true;
  setup(`/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${TASK_ID}`);
  expect(screen.getByText('Loading requested task…')).toBeVisible();
  expect(
    screen.queryByText(/The requested task could not be verified/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry requested task' }),
  ).toBeDisabled();
  expect(screen.queryByLabelText('Task draft')).not.toBeInTheDocument();
  mockDetailLoading = false;
  act(mockRefresh);
  expect(screen.getByLabelText('Task draft')).toBeVisible();
});
it.each(['FORBIDDEN', 'NOT_FOUND'])(
  'discards a private task draft and pending navigation on %s, then reopens a fresh editor only after checking access',
  async (code) => {
    setup(`/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${TASK_ID}`);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText('Task draft'),
      'PRIVATE_REVOKED_NOTE',
    );
    const previousEditor = screen.getByLabelText('Task draft');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeVisible();
    mockDetailError = new CombinedGraphQLErrors({
      errors: [{ message: 'Unavailable', extensions: { code } }],
    });
    act(mockRefresh);
    expect(screen.queryByLabelText('Task draft')).not.toBeInTheDocument();
    expect(
      screen.queryByText('PRIVATE_EXACT_DETAIL_ONLY'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Keep editing' }),
    ).not.toBeInTheDocument();
    const retry = screen.getByRole('button', {
      name: 'Check current task access',
    });
    expect(retry).toHaveFocus();
    mockDetailError = undefined;
    act(mockRefresh);
    expect(screen.queryByLabelText('Task draft')).not.toBeInTheDocument();
    mockRefetch.mockResolvedValueOnce({
      data: { deliveryTaskDetail: mockDetail },
    });
    await user.click(retry);
    expect(screen.getByLabelText('Task draft')).not.toBe(previousEditor);
    expect(screen.getByLabelText('Task draft')).toHaveValue('');
    expect(mockMutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(
      screen.getByRole('link', { name: 'Current product edit' }),
    ).toHaveFocus();
  },
);
it('returns focus to the page heading when a closed exact task is not in the current list', async () => {
  mockDetail = taskDetailFixture(OFF_PAGE_TASK_ID);
  setup(
    `/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${OFF_PAGE_TASK_ID}`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(
    screen.getByRole('heading', { level: 1, name: 'My tasks' }),
  ).toHaveFocus();
});
it('removes the task editor immediately when its attempted save is denied', async () => {
  setup(`/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${TASK_ID}`);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Task draft'), 'PRIVATE_DENIED_SAVE');
  mockMutate.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [{ message: 'Update denied', extensions: { code: 'FORBIDDEN' } }],
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Save task note' }));
  expect(screen.queryByLabelText('Task draft')).not.toBeInTheDocument();
  expect(
    screen.queryByText('PRIVATE_EXACT_DETAIL_ONLY'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check current task access' }),
  ).toHaveFocus();
  expect(mockMutate).toHaveBeenCalledTimes(1);
});
it('recovers an exact task through visible access checks after context-first native denial without reviving the old draft', async () => {
  setup(`/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${TASK_ID}`);
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Task draft'),
    'PRIVATE_CONTEXT_DENIAL',
  );
  mockContextError = new CombinedGraphQLErrors({
    errors: [
      {
        message: 'Native object access denied',
        extensions: { code: 'FORBIDDEN' },
      },
    ],
  });
  act(mockRefresh);
  expect(screen.queryByLabelText('Task draft')).not.toBeInTheDocument();
  expect(
    screen.queryByText('PRIVATE_EXACT_DETAIL_ONLY'),
  ).not.toBeInTheDocument();
  const workspaceRetry = screen.getByRole('button', {
    name: 'Retry workspace access',
  });
  expect(workspaceRetry).toBeEnabled();
  expect(workspaceRetry).toHaveFocus();
  await user.click(workspaceRetry);
  expect(mockRefetch).toHaveBeenCalled();
  mockContextError = undefined;
  act(mockRefresh);
  expect(screen.queryByLabelText('Task draft')).not.toBeInTheDocument();
  mockRefetch.mockResolvedValueOnce({
    data: { deliveryTaskDetail: mockDetail },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check current task access' }),
  );
  expect(screen.getByLabelText('Task draft')).toHaveValue('');
  expect(mockMutate).not.toHaveBeenCalled();
});
it('disposes create preparation on confirmed native context denial', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'New task' }));
  await user.type(
    screen.getByLabelText('Title'),
    'PRIVATE_CREATE_CONTEXT_DENIAL',
  );
  mockContextError = new CombinedGraphQLErrors({
    errors: [
      {
        message: 'Native object access denied',
        extensions: { code: 'FORBIDDEN' },
      },
    ],
  });
  act(mockRefresh);
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  mockContextError = undefined;
  act(mockRefresh);
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'New task' }));
  expect(screen.getByLabelText('Title')).toHaveValue('');
});
it('keeps native-modal recovery accessible while hiding a retained create draft on context-source failure', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'New task' }));
  await user.type(screen.getByLabelText('Title'), 'PRIVATE_CREATE_DRAFT');
  const title = screen.getByLabelText('Title');
  mockError = new Error('Context unavailable');
  act(mockRefresh);
  const dialog = screen.getByRole('dialog', { name: 'Create task' });
  const retry = within(dialog).getByRole('button', {
    name: 'Retry workspace access',
  });
  expect(dialog).toHaveAttribute('open');
  expect(retry).toHaveFocus();
  expect(retry).toBeEnabled();
  expect(retry.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull();
  expect(title).not.toBeVisible();
  expect(title).toBeDisabled();
  expect(mockMutate).not.toHaveBeenCalled();
  mockError = undefined;
  act(mockRefresh);
  expect(screen.getByLabelText('Title')).toBe(title);
  expect(title).toHaveValue('PRIVATE_CREATE_DRAFT');
  expect(title).toBeVisible();
});
it('offers manager setup at an empty project directory and disposes a create draft after verified management loss', async () => {
  mockContext.projects = [];
  const router = setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Set up first project' }),
  );
  expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
    'team',
  );
});
it('unmounts management-only creation on known role revocation rather than reviving the old form after a regrant', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'New task' }));
  await user.type(screen.getByLabelText('Title'), 'Do not revive this draft');
  mockManager = false;
  mockAccess = { ...mockAccess, capabilities: [], nativeAdministrator: false };
  mockContext.actor = {
    ...mockContext.actor,
    isManager: false,
    isAdmin: false,
    capabilities: [],
  };
  act(mockRefresh);
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  mockManager = true;
  mockAccess = {
    ...mockAccess,
    capabilities: ['workspace.admin'],
    nativeAdministrator: true,
  };
  mockContext.actor = {
    ...mockContext.actor,
    isManager: true,
    isAdmin: true,
    capabilities: ['workspace.admin'],
  };
  act(mockRefresh);
  await user.click(screen.getByRole('button', { name: 'New task' }));
  expect(screen.getByLabelText('Title')).toHaveValue('');
});
it('keeps mobile navigation role appropriate and guards an unsaved task draft before changing destinations', async () => {
  mockMobile = true;
  mockManager = false;
  mockAccess = { ...mockAccess, capabilities: [], nativeAdministrator: false };
  mockContext.actor = {
    ...mockContext.actor,
    isAdmin: false,
    isManager: false,
    capabilities: [],
  };
  const router = setup(
    `/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${TASK_ID}`,
  );
  const user = userEvent.setup();
  const navigation = screen.getByRole('combobox', { name: 'Go to workspace' });
  expect(
    within(navigation).queryByRole('option', { name: 'Team planner' }),
  ).not.toBeInTheDocument();
  await user.type(
    screen.getByLabelText('Task draft'),
    'Keep before navigation',
  );
  await user.selectOptions(navigation, 'creative');
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
    'mine',
  );
  expect(screen.getByLabelText('Task draft')).toHaveValue(
    'Keep before navigation',
  );
  await user.selectOptions(navigation, 'creative');
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
    'creative',
  );
});
it('links specialized creative production explicitly while preserving this exact task context', async () => {
  const router = setup(
    `/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${TASK_ID}&creativeSubmission=1`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Creative production' }));
  const link = screen.getByRole('link', { name: 'Open creative production' });
  const params = new URL(link.getAttribute('href')!, 'http://localhost')
    .searchParams;
  expect(params.get('view')).toBe('creative');
  expect(params.get('task')).toBe(TASK_ID);
  expect(params.get('creativeSubmission')).toBe('1');
  expect(new URLSearchParams(router.state.location.search).get('panel')).toBe(
    'creative',
  );
});
it('records the exact native assignment seen only after its verified recipient card becomes visible', async () => {
  jest.useFakeTimers();
  jest.spyOn(document, 'hasFocus').mockReturnValue(true);
  jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  mockDetail.task.assigneeId = MANAGER_ID;
  mockDetail.task.details.assignmentAt = '2026-10-29T07:00:00Z';
  setup(`/delivery?view=mine&taskTimezone=Asia%2FQatar&task=${TASK_ID}`);
  expect(mockSeen).not.toHaveBeenCalled();
  const card = screen.getByRole('region', {
    name: 'Your production assignment',
  });
  const bounds = new DOMRect(0, 0, 200, 100);
  const entry: IntersectionObserverEntry = {
    target: card,
    isIntersecting: true,
    intersectionRatio: 1,
    intersectionRect: bounds,
    boundingClientRect: bounds,
    rootBounds: new DOMRect(0, 0, 390, 844),
    time: 0,
  };
  await act(async () => {
    observers.get(card)?.([entry], observer);
    jest.advanceTimersByTime(400);
    await Promise.resolve();
  });
  expect(mockSeen).toHaveBeenCalledWith({
    variables: {
      input: {
        taskId: TASK_ID,
        expectedAssignmentKey: `${MANAGER_ID}:2026-10-29T07:00:00Z`,
      },
    },
  });
  expect(mockMutate).not.toHaveBeenCalled();
});

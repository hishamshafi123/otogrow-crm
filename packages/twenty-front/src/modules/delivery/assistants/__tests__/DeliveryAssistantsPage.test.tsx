import { StrictMode } from 'react';
import type * as ReactTypes from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOperationAST, type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom';
import { DeliveryAssistantsPage } from '@/delivery/assistants/DeliveryAssistantsPage';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { agentRoleDirectory } from '@/delivery/__tests__/agentRoleFixture';
import {
  ASSISTANT_ID,
  TASK_ID,
  RUN_ID,
  PROJECT_ID,
  IDENTITY,
  assistantContext,
  assistantCatalog,
  assistantConfiguration,
  assistantRun,
  assistantRuns,
  assistantTask,
} from '@/delivery/assistants/__tests__/assistants.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryCanvas: 'main',
}));
jest.mock('@/delivery/assistants/assistantStyles', () => ({
  StyledAssistantBoundary: 'fieldset',
  StyledAssistantNavigation: 'nav',
  StyledAssistantItem: 'article',
  StyledAssistantText: 'pre',
}));
jest.mock('@/ui/layout/page/components/PageBody', () => ({
  PageBody: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/layout/page/components/PageContainer', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/delivery/creative/atlas/DeliveryAiWorkspaceNavigation', () => ({
  DeliveryAiWorkspaceNavigation: () => null,
}));
let mockVisible = false;
const mockAttach = () => undefined;
jest.mock('@/delivery/assistants/useAssistantVisibility', () => ({
  useAssistantVisibility: () => ({ attach: mockAttach, visible: mockVisible }),
}));
let mockReady = true;
let mockAdmin = true;
const mockAccess = {
  ...IDENTITY,
  capabilities: ['workspace.admin'],
  roleIds: ['admin-role'],
  grants: [],
};
const mockMatches = (value: typeof IDENTITY | null | undefined) =>
  mockReady &&
  value?.workspaceId === IDENTITY.workspaceId &&
  value.memberId === IDENTITY.memberId &&
  value.userWorkspaceId === IDENTITY.userWorkspaceId;
const mockSubscribers = new Set<() => void>();
let mockVersion = 0;
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => {
    const { useSyncExternalStore } =
      jest.requireActual<typeof ReactTypes>('react');
    useSyncExternalStore(
      (listener) => {
        mockSubscribers.add(listener);
        return () => {
          mockSubscribers.delete(listener);
        };
      },
      () => mockVersion,
    );
    return {
      ready: mockReady,
      scope: 'current-identity',
      canManageRoles: mockAdmin,
      manager: mockAdmin,
      access: {
        ...mockAccess,
        capabilities: mockAdmin ? ['workspace.admin'] : [],
      },
      matches: mockMatches,
      refetch: mockRefetch,
    };
  },
}));
let mockContext = assistantContext();
let mockCatalog = assistantCatalog();
let mockConfiguration = assistantConfiguration();
let mockError: Error | undefined;
let mockRunError: Error | undefined;
let mockConfigError: Error | undefined;
let mockDirectoryError: Error | undefined;
let mockLoading = false;
let mockNetworkStatus = NetworkStatus.ready;
const mockQueryCalls = jest.fn();
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
const mockClientQuery = jest.fn();
const mockStartPolling = jest.fn();
const mockStopPolling = jest.fn();
const mockRefreshQueries = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useMutation: (document: DocumentNode) => [
    (options: unknown) =>
      mockMutate(getOperationAST(document)?.name?.value, options),
  ],
  useQuery: (
    document: DocumentNode,
    options: { skip?: boolean; variables?: { input?: { taskId?: string } } },
  ) => {
    const name = getOperationAST(document)?.name?.value;
    mockQueryCalls(name, options);
    const data =
      name === 'DeliveryAssistantContext'
        ? { deliveryAssistantContext: mockContext }
        : name === 'DeliveryAssistantCatalog'
          ? { deliveryAssistantCatalog: mockCatalog }
          : name === 'DeliveryAssistant'
            ? {
                deliveryAssistant: {
                  ...IDENTITY,
                  observedAt: mockContext.observedAt,
                  assistant: mockCatalog.items[0],
                },
              }
            : name === 'DeliveryAssistantConfiguration'
              ? { deliveryAssistantConfiguration: mockConfiguration }
              : name === 'OtogrowRoleDirectory'
                ? {
                    otogrowRoleDirectory: {
                      ...agentRoleDirectory,
                      actor: IDENTITY,
                    },
                  }
                : name === 'DeliveryAssistantRuns'
                  ? { deliveryAssistantRuns: assistantRuns() }
                  : name === 'DeliveryAssistantRun'
                    ? { deliveryAssistantRun: assistantRun() }
                    : name === 'DeliveryAssistantTaskChoices'
                      ? {
                          deliveryTaskList: {
                            ...IDENTITY,
                            observedAt: mockContext.observedAt,
                            totalCount: 83,
                            nextCursor: 'tasks-next',
                            items: [
                              {
                                id: TASK_ID,
                                title: 'Off-page permitted task',
                                projectId: PROJECT_ID,
                                projectName: 'Launch project',
                                revision: 3,
                                state: 'IN_PROGRESS',
                                service: 'COPY',
                              },
                            ],
                          },
                        }
                      : undefined;
    return {
      data: options.skip ? undefined : data,
      loading: mockLoading,
      networkStatus: mockNetworkStatus,
      error:
        name === 'DeliveryAssistantContext'
          ? mockError
          : name === 'DeliveryAssistantRun'
            ? mockRunError
            : name === 'DeliveryAssistantConfiguration'
              ? mockConfigError
              : name === 'OtogrowRoleDirectory'
                ? mockDirectoryError
                : undefined,
      refetch: mockRefetch,
      startPolling: mockStartPolling,
      stopPolling: mockStopPolling,
      client: { query: mockClientQuery, refetchQueries: mockRefreshQueries },
    };
  },
}));
const mount = (url = '/delivery?view=agents', strict = false) => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Link to="/other">Other work</Link>
            <DeliveryAssistantsPage />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other work opened</p> },
    ],
    { initialEntries: [url] },
  );
  const element = (
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>
  );
  render(strict ? <StrictMode>{element}</StrictMode> : element);
  return {
    router,
    user: userEvent.setup(),
    rerender: () =>
      act(() => {
        mockVersion += 1;
        mockSubscribers.forEach((listener) => listener());
      }),
  };
};
beforeAll(() => {
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockVisible = false;
  mockReady = true;
  mockAdmin = true;
  mockContext = assistantContext();
  mockCatalog = assistantCatalog();
  mockConfiguration = assistantConfiguration();
  mockError = undefined;
  mockRunError = undefined;
  mockConfigError = undefined;
  mockDirectoryError = undefined;
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  jest.clearAllMocks();
  mockMutate.mockReset();
  mockClientQuery.mockReset();
  mockRefetch.mockResolvedValue({});
  mockRefreshQueries.mockResolvedValue([]);
});

it('shows complete catalog counts and URL pages without reading private configuration, runs or a legacy workspace', async () => {
  const { user, router } = mount('/delivery?view=agents&search=keep');
  expect(
    screen.getByText('Showing 1 of 57 matching assistants.'),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('PRIVATE_INSTRUCTIONS_EXACT_DETAIL'),
  ).not.toBeInTheDocument();
  expect(
    mockQueryCalls.mock.calls.some(
      ([name, options]) =>
        [
          'DeliveryAgents',
          'DeliveryWorkspace',
          'DeliveryAssistantConfiguration',
          'DeliveryAssistantRun',
        ].includes(name) && !options.skip,
    ),
  ).toBe(false);
  await user.click(screen.getByRole('link', { name: 'More assistants' }));
  expect(router.state.location.search).toContain('assistantAfter=catalog-next');
  expect(router.state.location.search).toContain('search=keep');
});
it('keeps an exact selection while searching and changing pages', async () => {
  const { user, router } = mount(
    `/delivery?view=agents&assistant=${ASSISTANT_ID}`,
  );
  await user.click(screen.getByText('Filter assistants'));
  await user.type(screen.getByLabelText('Search assistants'), 'SEO');
  await user.click(
    screen.getByRole('button', { name: 'Apply assistant filters' }),
  );
  expect(router.state.location.search).toContain(`assistant=${ASSISTANT_ID}`);
  expect(router.state.location.search).toContain('assistantSearch=SEO');
  expect(
    screen.queryByText('PRIVATE_INSTRUCTIONS_EXACT_DETAIL'),
  ).not.toBeInTheDocument();
  expect(
    mockQueryCalls.mock.calls.some(
      ([name, options]) =>
        ['DeliveryAssistantConfiguration', 'OtogrowRoleDirectory'].includes(
          name,
        ) && !options.skip,
    ),
  ).toBe(false);
  await user.click(screen.getByRole('link', { name: 'Edit assistant' }));
  expect(router.state.location.search).toContain('assistantEdit=1');
  expect(
    screen.getByText('PRIVATE_INSTRUCTIONS_EXACT_DETAIL'),
  ).toBeInTheDocument();
});
it('retains a dirty configuration during outage, protects navigation, and disposes it after verified admin loss', async () => {
  const { user, rerender } = mount();
  await user.click(screen.getByRole('button', { name: 'Create assistant' }));
  await user.clear(screen.getByLabelText('Name'));
  await user.type(screen.getByLabelText('Name'), 'Private unsaved checker');
  await user.click(screen.getByRole('link', { name: 'Other work' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Name')).toHaveValue('Private unsaved checker');
  mockError = new Error('Disconnected');
  rerender();
  expect(screen.getByLabelText('Name')).not.toBeVisible();
  expect(screen.getByLabelText('Name')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Retry assistant access' }),
  ).toBeEnabled();
  mockError = undefined;
  rerender();
  expect(screen.getByLabelText('Name')).toHaveValue('Private unsaved checker');
  mockAdmin = false;
  mockContext = {
    ...mockContext,
    canConfigure: false,
    actor: {
      ...mockContext.actor,
      isAdmin: false,
      isManager: false,
      capabilities: [],
    },
  };
  rerender();
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  expect(mockMutate).not.toHaveBeenCalled();
});
it('reads an old exact disabled-agent run independently from current runnable access and distinguishes zero usage from unknown cost', async () => {
  mockAdmin = false;
  mockContext.canConfigure = false;
  mockContext.actor = {
    ...mockContext.actor,
    isAdmin: false,
    isManager: false,
    capabilities: [],
  };
  const { user, rerender } = mount(
    `/delivery?view=agents&assistantView=history&assistantRun=${RUN_ID}`,
  );
  expect(
    screen.getByText('Showing 1 of 601 matching runs.'),
  ).toBeInTheDocument();
  expect(screen.getByText('PRIVATE_SAVED_FINDING')).toBeInTheDocument();
  expect(screen.getByText(/^Input tokens: 0/)).toBeInTheDocument();
  expect(screen.getByText(/Output tokens: Unknown$/)).toBeInTheDocument();
  expect(screen.getByText('Recorded cost: Unknown')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Apply proposed brief' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByLabelText(/I reviewed these findings/));
  expect(
    screen.getByRole('button', { name: 'Reject suggestions' }),
  ).toBeEnabled();
  mockRunError = new Error('Unavailable');
  rerender();
  expect(screen.queryByText('PRIVATE_SAVED_FINDING')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Refresh opened run' }));
  expect(mockRefetch).toHaveBeenCalled();
  expect(mockMutate).not.toHaveBeenCalled();
});
it('uses a paged task picker with a complete total and retains the selected assistant', async () => {
  mockAdmin = false;
  mockContext.canConfigure = false;
  mockContext.actor = {
    ...mockContext.actor,
    isAdmin: false,
    isManager: false,
    capabilities: [],
  };
  const { user, router } = mount(
    `/delivery?view=agents&assistant=${ASSISTANT_ID}`,
  );
  await user.click(
    screen.getByRole('link', { name: 'Choose task for this assistant' }),
  );
  expect(
    screen.getByText('Showing 1 of 83 matching tasks.'),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'More tasks' }));
  expect(router.state.location.search).toContain(
    'assistantTasksAfter=tasks-next',
  );
  mockContext.selectedTask = assistantTask();
  await user.click(
    screen.getByRole('link', {
      name: 'Off-page permitted task · Launch project',
    }),
  );
  expect(router.state.location.search).toContain(`assistant=${ASSISTANT_ID}`);
  expect(router.state.location.search).toContain(`task=${TASK_ID}`);
  expect(screen.getByRole('button', { name: 'Prepare one run' })).toBeEnabled();
});
it('masks a foreign identity even if Apollo still holds successful private data', () => {
  mockContext.memberId = 'another-member';
  mount(`/delivery?view=agents&assistantRun=${RUN_ID}`);
  expect(screen.queryByText('PRIVATE_SAVED_FINDING')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry assistant access' }),
  ).toBeEnabled();
});
it('retains the same catalog reading during a benign poll but hides it after an error', () => {
  const { rerender } = mount();
  mockLoading = true;
  mockNetworkStatus = NetworkStatus.poll;
  rerender();
  expect(
    screen.getByText('Showing 1 of 57 matching assistants.'),
  ).toBeVisible();
  mockError = new Error('Lost read');
  rerender();
  expect(
    screen.queryByText('Showing 1 of 57 matching assistants.'),
  ).not.toBeInTheDocument();
});
it('records one create UUID before saving and recovers an uncertain committed configuration without creating another ID', async () => {
  const { user, router } = mount();
  await user.click(screen.getByRole('button', { name: 'Create assistant' }));
  const id = new URLSearchParams(router.state.location.search).get(
    'assistantCreate',
  );
  expect(id).toMatch(/^[a-f0-9-]{36}$/);
  await user.click(screen.getByLabelText('Launch project'));
  await user.click(screen.getByLabelText('Production team'));
  mockMutate.mockRejectedValueOnce(new Error('Commit response lost'));
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockMutate.mock.calls[0][1].variables.input.createId).toBe(id);
  expect(screen.getByLabelText('Name')).toBeDisabled();
  mockClientQuery.mockResolvedValueOnce({
    data: {
      deliveryAssistantConfiguration: {
        ...assistantConfiguration(),
        id,
        version: 1,
      },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check saved assistant' }),
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.objectContaining({
      fetchPolicy: 'no-cache',
      variables: { input: { agentId: id } },
    }),
  );
  expect(
    screen.getByRole('link', { name: 'Review current saved configuration' }),
  ).toHaveAttribute('href', expect.stringContaining(`assistant=${id}`));
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(router.state.location.search).toContain(`assistantCreate=${id}`);
});
it('allows only the same frozen create payload after a fresh exact NOT_FOUND and never treats transport failure as missing', async () => {
  const { user } = mount();
  await user.click(screen.getByRole('button', { name: 'Create assistant' }));
  await user.click(screen.getByLabelText('Launch project'));
  await user.click(screen.getByLabelText('Production team'));
  mockMutate.mockRejectedValueOnce(new Error('Unknown save'));
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  const original = mockMutate.mock.calls[0][1];
  mockClientQuery.mockRejectedValueOnce(new Error('No connection'));
  await user.click(
    screen.getByRole('button', { name: 'Check saved assistant' }),
  );
  expect(
    screen.queryByRole('button', { name: 'Retry exact original save' }),
  ).not.toBeInTheDocument();
  mockClientQuery.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [{ message: 'Missing', extensions: { code: 'NOT_FOUND' } }],
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Check saved assistant' }),
  );
  mockMutate.mockResolvedValueOnce({
    data: {
      saveDeliveryAssistant: {
        ...IDENTITY,
        saved: original.variables.input.createId,
        version: 1,
        replayed: true,
      },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Retry exact original save' }),
  );
  expect(mockMutate.mock.calls[1][1]).toEqual(original);
  expect(mockMutate).toHaveBeenCalledTimes(2);
  expect(
    screen.getByText(/original saved assistant was confirmed/),
  ).toBeInTheDocument();
});
it('requires exact-ID recovery for a create URL reopened after reload', async () => {
  const id = '66666666-6666-4666-8666-666666666666';
  const { user } = mount(`/delivery?view=agents&assistantCreate=${id}`);
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  expect(mockMutate).not.toHaveBeenCalled();
  mockClientQuery.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [{ message: 'Missing', extensions: { code: 'NOT_FOUND' } }],
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Check saved assistant' }),
  );
  expect(screen.getByLabelText('Name')).toHaveValue('Brief checker');
  expect(mockMutate).not.toHaveBeenCalled();
});
it('freezes an unknown start and checks the original request without automatic generation or another UUID', async () => {
  mockAdmin = false;
  mockContext = {
    ...mockContext,
    canConfigure: false,
    selectedTask: assistantTask(),
    actor: {
      ...mockContext.actor,
      isAdmin: false,
      isManager: false,
      capabilities: [],
    },
  };
  const { user, router, rerender } = mount(
    `/delivery?view=agents&task=${TASK_ID}&assistant=${ASSISTANT_ID}`,
  );
  await user.click(screen.getByRole('button', { name: 'Prepare one run' }));
  const requestId = new URLSearchParams(router.state.location.search).get(
    'assistantRequest',
  );
  expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(screen.getByLabelText('Copy to check')).toHaveValue(
    'Current task draft copy',
  );
  mockMutate.mockResolvedValueOnce({
    data: {
      previewDeliveryAssistant: {
        ...IDENTITY,
        taskId: TASK_ID,
        agentId: ASSISTANT_ID,
        taskRevision: 3,
        agentVersion: 2,
        context: {
          brief: 'Exact task brief',
          brandKnowledge: { fingerprint: 'knowledge-v1' },
        },
        budget: {
          maximumCostUsd: '0.04',
          pricingRevision: 1,
          budgetReady: true,
          blockedReason: null,
          boundSource: 'Reviewed price',
        },
      },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Preview current inputs' }),
  );
  await user.click(screen.getByLabelText(/I reviewed these exact inputs/));
  mockMutate.mockRejectedValueOnce(new Error('Start response lost'));
  await user.click(screen.getByRole('button', { name: 'Start one run' }));
  expect(mockMutate.mock.calls[1][1].variables.input.requestId).toBe(requestId);
  expect(screen.getByLabelText('Copy to check')).toBeDisabled();
  mockError = new Error('Outage');
  rerender();
  expect(screen.getByLabelText('Copy to check')).not.toBeVisible();
  mockError = undefined;
  rerender();
  expect(screen.getByLabelText('Copy to check')).toHaveValue(
    'Current task draft copy',
  );
  mockClientQuery.mockResolvedValueOnce({
    data: {
      deliveryAssistantRequest: {
        ...IDENTITY,
        requestId,
        receipt: {
          ...IDENTITY,
          runId: RUN_ID,
          taskId: TASK_ID,
          agentId: ASSISTANT_ID,
          status: 'WAITING_REVIEW',
          updatedAt: '2026-10-30T08:01:00Z',
        },
      },
    },
  });
  await user.click(screen.getByRole('button', { name: 'Check saved request' }));
  expect(
    screen.getByRole('button', { name: 'Open original saved run' }),
  ).toBeEnabled();
  expect(mockMutate).toHaveBeenCalledTimes(2);
  expect(router.state.location.search).toContain(
    `assistantRequest=${requestId}`,
  );
  await user.click(
    screen.getByRole('button', { name: 'Open original saved run' }),
  );
  expect(router.state.location.search).toContain(`assistantRun=${RUN_ID}`);
});
it('polls only the visible active summary page faster and stops when it leaves the visible area', () => {
  const { rerender } = mount('/delivery?view=agents&assistantView=history');
  expect(mockStartPolling).not.toHaveBeenCalled();
  mockVisible = true;
  rerender();
  expect(mockStartPolling).toHaveBeenLastCalledWith(5000);
  mockVisible = false;
  rerender();
  expect(mockStopPolling).toHaveBeenCalled();
  expect(
    mockQueryCalls.mock.calls.some(
      ([name, options]) => name === 'DeliveryAssistantRun' && !options.skip,
    ),
  ).toBe(false);
});
it('shows configured missing requirements before preview and never submits a known invalid paid start', async () => {
  mockAdmin = false;
  mockContext = {
    ...mockContext,
    canConfigure: false,
    selectedTask: assistantTask(),
    actor: {
      ...mockContext.actor,
      isAdmin: false,
      isManager: false,
      capabilities: [],
    },
  };
  mockCatalog.items[0].requiredInputs = ['brief', 'copy', 'requirements'];
  const { user } = mount(
    `/delivery?view=agents&task=${TASK_ID}&assistant=${ASSISTANT_ID}`,
  );
  await user.click(screen.getByRole('button', { name: 'Prepare one run' }));
  expect(
    screen.getByText('Enter the brand requirements this assistant needs.'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Preview current inputs' }),
  ).toBeDisabled();
  await user.type(
    screen.getByLabelText('Brand requirements'),
    'Use the approved claim only',
  );
  expect(
    screen.getByRole('button', { name: 'Preview current inputs' }),
  ).toBeEnabled();
  expect(mockMutate).not.toHaveBeenCalled();
});
it('duplicates the exact opened GraphQL configuration without forwarding typename metadata or changing legacy role access', async () => {
  const { user, router } = mount(
    `/delivery?view=agents&assistant=${ASSISTANT_ID}&assistantEdit=1`,
  );
  await user.click(screen.getByRole('button', { name: 'Duplicate assistant' }));
  const id = new URLSearchParams(router.state.location.search).get(
    'assistantCreate',
  );
  expect(screen.getByLabelText('Name')).toHaveValue('Copy checker (copy)');
  mockMutate.mockResolvedValueOnce({
    data: {
      saveDeliveryAssistant: {
        ...IDENTITY,
        saved: id,
        version: 1,
        replayed: false,
      },
    },
  });
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  const input = mockMutate.mock.calls[0][1].variables.input;
  expect(input.createId).toBe(id);
  expect(input).not.toHaveProperty('id');
  expect(input.configuration).not.toHaveProperty('__typename');
  expect(input.configuration.roleIds).toBeNull();
  expect(input.configuration.roles).toEqual(['ADMIN', 'MANAGER', 'MEMBER']);
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Open saved assistant' }),
  ).toHaveAttribute('href', expect.stringContaining(`assistant=${id}`));
});
it('focuses an opened editor once, preserves keyboard focus during a poll, and returns focus after deliberate close', async () => {
  const { user, rerender } = mount();
  const opener = screen.getByRole('button', { name: 'Create assistant' });
  await user.click(opener);
  expect(
    screen.getByRole('region', { name: 'Assistant configuration' }),
  ).toHaveFocus();
  const name = screen.getByLabelText('Name');
  await user.click(name);
  mockLoading = true;
  mockNetworkStatus = NetworkStatus.poll;
  rerender();
  expect(name).toHaveFocus();
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  rerender();
  await user.click(screen.getByRole('button', { name: 'Close configuration' }));
  expect(opener).toHaveFocus();
});
it('keeps a reloaded run request read-only after fresh NULL because the original private body is absent', async () => {
  mockAdmin = false;
  mockContext = {
    ...mockContext,
    canConfigure: false,
    selectedTask: assistantTask(),
    actor: {
      ...mockContext.actor,
      isAdmin: false,
      isManager: false,
      capabilities: [],
    },
  };
  const requestId = '77777777-7777-4777-8777-777777777777';
  const { user, router } = mount(
    `/delivery?view=agents&task=${TASK_ID}&assistant=${ASSISTANT_ID}&assistantRequest=${requestId}`,
  );
  expect(screen.getByLabelText('Copy to check')).toBeDisabled();
  mockClientQuery.mockResolvedValueOnce({
    data: {
      deliveryAssistantRequest: { ...IDENTITY, requestId, receipt: null },
    },
  });
  await user.click(screen.getByRole('button', { name: 'Check saved request' }));
  expect(screen.getByLabelText('Copy to check')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Preview current inputs' }),
  ).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Retry exact original start' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/original prepared inputs are not saved in this link/),
  ).toBeInTheDocument();
  expect(mockMutate).not.toHaveBeenCalled();
  expect(router.state.location.search).toContain(
    `assistantRequest=${requestId}`,
  );
});
it('does not publish a deferred create response after authority was revoked and restored', async () => {
  const { user, rerender } = mount();
  await user.click(screen.getByRole('button', { name: 'Create assistant' }));
  await user.click(screen.getByLabelText('Launch project'));
  await user.click(screen.getByLabelText('Production team'));
  let finish:
    | ((value: {
        data: {
          saveDeliveryAssistant: typeof IDENTITY & {
            saved: string;
            version: number;
            replayed: boolean;
          };
        };
      }) => void)
    | undefined;
  mockMutate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  const input = mockMutate.mock.calls[0][1].variables.input;
  mockAdmin = false;
  mockContext = {
    ...mockContext,
    canConfigure: false,
    actor: {
      ...mockContext.actor,
      isAdmin: false,
      isManager: false,
      capabilities: [],
    },
  };
  rerender();
  mockAdmin = true;
  mockContext = assistantContext();
  rerender();
  await act(async () => {
    finish?.({
      data: {
        saveDeliveryAssistant: {
          ...IDENTITY,
          saved: input.createId,
          version: 1,
          replayed: false,
        },
      },
    });
  });
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved assistant' }),
  ).toBeEnabled();
  expect(
    screen.queryByRole('link', { name: 'Open saved assistant' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Assistant save confirmed/),
  ).not.toBeInTheDocument();
});
it('disposes a prepared run on confirmed source denial and requires exact recovery after regrant', async () => {
  mockAdmin = false;
  mockContext = {
    ...mockContext,
    canConfigure: false,
    selectedTask: assistantTask(),
    actor: {
      ...mockContext.actor,
      isAdmin: false,
      isManager: false,
      capabilities: [],
    },
  };
  const { user, rerender } = mount(
    `/delivery?view=agents&task=${TASK_ID}&assistant=${ASSISTANT_ID}`,
  );
  await user.click(screen.getByRole('button', { name: 'Prepare one run' }));
  await user.type(
    screen.getByLabelText('Brand requirements'),
    'Private original requirement',
  );
  mockError = new CombinedGraphQLErrors({
    errors: [{ message: 'Scope removed', extensions: { code: 'FORBIDDEN' } }],
  });
  rerender();
  expect(screen.queryByLabelText('Brand requirements')).not.toBeInTheDocument();
  mockError = undefined;
  rerender();
  expect(screen.getByLabelText('Brand requirements')).toHaveValue('');
  expect(screen.getByLabelText('Brand requirements')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Check saved request' }),
  ).toBeEnabled();
  expect(mockMutate).not.toHaveBeenCalled();
});
it('cancels a blocked navigation when verified administration is removed instead of executing it as the form disappears', async () => {
  const { user, router, rerender } = mount();
  await user.click(screen.getByRole('button', { name: 'Create assistant' }));
  await user.type(screen.getByLabelText('Name'), ' private');
  await user.click(screen.getByRole('link', { name: 'Other work' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  mockAdmin = false;
  mockContext = {
    ...mockContext,
    canConfigure: false,
    actor: {
      ...mockContext.actor,
      isAdmin: false,
      isManager: false,
      capabilities: [],
    },
  };
  rerender();
  expect(router.state.location.pathname).toBe('/delivery');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  mockAdmin = true;
  mockContext = assistantContext();
  rerender();
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved assistant' }),
  ).toBeEnabled();
  expect(router.state.location.pathname).toBe('/delivery');
});
it.each(['configuration', 'role directory'])(
  'discards a private editor on exact %s denial while context stays verified, cancels its pending duplicate and recovers only current saved data',
  async (source) => {
    const { user, router, rerender } = mount(
      `/delivery?view=agents&assistant=${ASSISTANT_ID}&assistantEdit=1`,
    );
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Private unsaved override');
    await user.click(
      screen.getByRole('button', { name: 'Duplicate assistant' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const denial = new CombinedGraphQLErrors({
      errors: [
        { message: 'Access removed', extensions: { code: 'FORBIDDEN' } },
      ],
    });
    if (source === 'configuration') mockConfigError = denial;
    else mockDirectoryError = denial;
    rerender();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      new URLSearchParams(router.state.location.search).has('assistantCreate'),
    ).toBe(false);
    expect(
      screen.getByText('Showing 1 of 57 matching assistants.'),
    ).toBeInTheDocument();
    mockConfigError = undefined;
    mockDirectoryError = undefined;
    mockRefetch.mockResolvedValue({
      data: {
        otogrowRoleDirectory: { ...agentRoleDirectory, actor: IDENTITY },
        deliveryAssistantConfiguration: assistantConfiguration(),
      },
    });
    await user.click(
      screen.getByRole('button', {
        name: 'Refresh current configuration access',
      }),
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Copy checker');
    expect(
      screen.queryByDisplayValue('Private unsaved override'),
    ).not.toBeInTheDocument();
    expect(
      new URLSearchParams(router.state.location.search).has('assistantCreate'),
    ).toBe(false);
    expect(mockMutate).not.toHaveBeenCalled();
  },
);
it('discards an uncertain duplicate seed after direct recovery denial and never resurrects it after same-ID NOT_FOUND', async () => {
  const { user } = mount(
    `/delivery?view=agents&assistant=${ASSISTANT_ID}&assistantEdit=1`,
  );
  await user.click(screen.getByRole('button', { name: 'Duplicate assistant' }));
  expect(screen.getByLabelText('Name')).toHaveValue('Copy checker (copy)');
  mockMutate.mockRejectedValueOnce(new Error('Save response lost'));
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  mockClientQuery.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [
        { message: 'Access revoked', extensions: { code: 'FORBIDDEN' } },
      ],
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Check saved assistant' }),
  );
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  mockRefetch.mockResolvedValue({
    data: { otogrowRoleDirectory: { ...agentRoleDirectory, actor: IDENTITY } },
  });
  await user.click(
    screen.getByRole('button', {
      name: 'Refresh current configuration access',
    }),
  );
  mockClientQuery.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [{ message: 'No record', extensions: { code: 'NOT_FOUND' } }],
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Check saved assistant' }),
  );
  expect(screen.getByLabelText('Name')).toHaveValue('Brief checker');
  expect(
    screen.queryByDisplayValue('Copy checker (copy)'),
  ).not.toBeInTheDocument();
  expect(mockMutate).toHaveBeenCalledTimes(1);
});
it('ignores a deferred save receipt after exact configuration denial even though context remains200 and current access is restored', async () => {
  const { user, rerender } = mount(
    `/delivery?view=agents&assistant=${ASSISTANT_ID}&assistantEdit=1`,
  );
  await user.clear(screen.getByLabelText('Name'));
  await user.type(screen.getByLabelText('Name'), 'Unconfirmed private edit');
  let finish:
    | ((response: { data: Record<string, unknown> }) => void)
    | undefined;
  mockMutate.mockImplementationOnce(
    () =>
      new Promise<{ data: Record<string, unknown> }>((resolve) => {
        finish = resolve;
      }),
  );
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  mockConfigError = new CombinedGraphQLErrors({
    errors: [{ message: 'Config denied', extensions: { code: 'FORBIDDEN' } }],
  });
  rerender();
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  expect(
    screen.getByText('Showing 1 of 57 matching assistants.'),
  ).toBeInTheDocument();
  mockConfigError = undefined;
  mockRefetch.mockResolvedValue({
    data: {
      otogrowRoleDirectory: { ...agentRoleDirectory, actor: IDENTITY },
      deliveryAssistantConfiguration: assistantConfiguration(),
    },
  });
  await user.click(
    screen.getByRole('button', {
      name: 'Refresh current configuration access',
    }),
  );
  await act(async () => {
    finish?.({
      data: {
        saveDeliveryAssistant: {
          ...IDENTITY,
          saved: ASSISTANT_ID,
          version: 3,
          replayed: false,
        },
      },
    });
  });
  expect(screen.getByLabelText('Name')).toHaveValue('Copy checker');
  expect(
    screen.queryByRole('button', { name: 'Review saved configuration' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Open saved assistant' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByDisplayValue('Unconfirmed private edit'),
  ).not.toBeInTheDocument();
});
it.each(['preview', 'start'])(
  'ignores a deferred %s payload after selected assistant access is lost and restored',
  async (operation) => {
    mockAdmin = false;
    mockContext = {
      ...mockContext,
      canConfigure: false,
      selectedTask: assistantTask(),
      actor: {
        ...mockContext.actor,
        isAdmin: false,
        isManager: false,
        capabilities: [],
      },
    };
    const { user, rerender } = mount(
      `/delivery?view=agents&task=${TASK_ID}&assistant=${ASSISTANT_ID}`,
    );
    await user.click(screen.getByRole('button', { name: 'Prepare one run' }));
    const preview = {
      ...IDENTITY,
      taskId: TASK_ID,
      agentId: ASSISTANT_ID,
      taskRevision: 3,
      agentVersion: 2,
      context: { brief: 'LATE_PRIVATE_PREVIEW' },
      budget: {
        maximumCostUsd: '0.04',
        pricingRevision: 1,
        budgetReady: true,
        blockedReason: null,
        boundSource: 'Reviewed price',
      },
    };
    if (operation === 'start') {
      mockMutate.mockResolvedValueOnce({
        data: { previewDeliveryAssistant: preview },
      });
      await user.click(
        screen.getByRole('button', { name: 'Preview current inputs' }),
      );
      await user.click(screen.getByLabelText(/I reviewed these exact inputs/));
    }
    let finish:
      | ((response: { data: Record<string, unknown> }) => void)
      | undefined;
    mockMutate.mockImplementationOnce(
      () =>
        new Promise<{ data: Record<string, unknown> }>((resolve) => {
          finish = resolve;
        }),
    );
    await user.click(
      screen.getByRole('button', {
        name:
          operation === 'preview' ? 'Preview current inputs' : 'Start one run',
      }),
    );
    mockCatalog.items[0].canRun = false;
    rerender();
    mockCatalog.items[0].canRun = true;
    rerender();
    await act(async () => {
      finish?.({
        data:
          operation === 'preview'
            ? { previewDeliveryAssistant: preview }
            : {
                startDeliveryAssistant: {
                  ...IDENTITY,
                  runId: RUN_ID,
                  taskId: TASK_ID,
                  agentId: ASSISTANT_ID,
                  status: 'WAITING_REVIEW',
                  updatedAt: '2026-10-30T08:01:00Z',
                },
              },
      });
    });
    if (operation === 'preview')
      expect(
        screen.queryByText('LATE_PRIVATE_PREVIEW'),
      ).not.toBeInTheDocument();
    else {
      expect(
        screen.queryByRole('button', { name: 'Open original saved run' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Check saved request' }),
      ).toBeEnabled();
    }
  },
);
it('uses one discard confirmation to duplicate the saved configuration after dirty edits', async () => {
  const { user, router } = mount(
    `/delivery?view=agents&assistant=${ASSISTANT_ID}&assistantEdit=1`,
  );
  await user.clear(screen.getByLabelText('Name'));
  await user.type(screen.getByLabelText('Name'), 'Unsaved private name');
  await user.click(screen.getByRole('button', { name: 'Duplicate assistant' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Name')).toHaveValue('Unsaved private name');
  await user.click(screen.getByRole('button', { name: 'Duplicate assistant' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Name')).toHaveValue('Copy checker (copy)');
  expect(
    new URLSearchParams(router.state.location.search).get('assistantCreate'),
  ).toMatch(/^[a-f0-9-]{36}$/);
  expect(mockMutate).not.toHaveBeenCalled();
});
it('adopts a freshly found update record after one deliberate discard and saves its current version', async () => {
  mockConfiguration.version = 1;
  const { user } = mount(
    `/delivery?view=agents&assistant=${ASSISTANT_ID}&assistantEdit=1`,
  );
  await user.clear(screen.getByLabelText('Name'));
  await user.type(screen.getByLabelText('Name'), 'Unconfirmed update');
  mockMutate.mockRejectedValueOnce(new Error('Update response lost'));
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  const found = {
    ...assistantConfiguration(),
    configuration: {
      ...assistantConfiguration().configuration,
      name: 'Fresh saved version 2',
    },
  };
  mockClientQuery.mockResolvedValueOnce({
    data: { deliveryAssistantConfiguration: found },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check saved assistant' }),
  );
  expect(screen.getByLabelText('Name')).toHaveValue('Unconfirmed update');
  expect(screen.getByLabelText('Name')).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Review current saved configuration' }),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Name')).toHaveValue('Fresh saved version 2');
  expect(screen.getByLabelText('Name')).toBeEnabled();
  mockMutate.mockResolvedValueOnce({
    data: {
      saveDeliveryAssistant: {
        ...IDENTITY,
        saved: ASSISTANT_ID,
        version: 3,
        replayed: false,
      },
    },
  });
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  expect(mockMutate.mock.calls[1][1].variables.input).toEqual(
    expect.objectContaining({
      id: ASSISTANT_ID,
      version: 2,
      configuration: expect.objectContaining({ name: 'Fresh saved version 2' }),
    }),
  );
  expect(mockMutate.mock.calls[1][1].variables.input).not.toHaveProperty(
    'createId',
  );
});
it('restores an explicit edit deep link and closes only configuration while keeping the selected assistant', async () => {
  const { user, router } = mount(
    `/delivery?view=agents&assistant=${ASSISTANT_ID}&assistantEdit=1&search=keep`,
  );
  expect(screen.getByLabelText('Name')).toHaveValue('Copy checker');
  await user.click(screen.getByRole('button', { name: 'Close configuration' }));
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('assistant')).toBe(ASSISTANT_ID);
  expect(params.has('assistantEdit')).toBe(false);
  expect(params.get('search')).toBe('keep');
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Choose task for this assistant' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Edit assistant' }),
  ).toBeInTheDocument();
});
it('returns focus to the newly mounted Edit action after guarded configuration close', async () => {
  mockContext.selectedTask = assistantTask();
  const { user, router } = mount(
    `/delivery?view=agents&assistant=${ASSISTANT_ID}&task=${TASK_ID}&assistantSearch=copy`,
  );
  const opener = screen.getByRole('link', { name: 'Edit assistant' });
  await user.click(opener);
  await user.type(screen.getByLabelText('Name'), ' private edit');
  await user.click(screen.getByRole('button', { name: 'Close configuration' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Name')).toHaveValue(
    'Copy checker private edit',
  );
  await user.click(screen.getByRole('button', { name: 'Close configuration' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(opener).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Edit assistant' })).toHaveFocus();
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('task')).toBe(TASK_ID);
  expect(params.get('assistant')).toBe(ASSISTANT_ID);
  expect(params.get('assistantSearch')).toBe('copy');
});
it('requires exact recovery when Browser Back revisits a closed uncertain create request', async () => {
  const { user, router } = mount();
  await user.click(screen.getByRole('button', { name: 'Create assistant' }));
  const createId = new URLSearchParams(router.state.location.search).get(
    'assistantCreate',
  );
  await user.click(screen.getByLabelText('Launch project'));
  await user.click(screen.getByLabelText('Production team'));
  mockMutate.mockRejectedValueOnce(new Error('Save response lost'));
  await user.click(screen.getByRole('button', { name: 'Save assistant' }));
  await user.click(screen.getByRole('button', { name: 'Close configuration' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(
    new URLSearchParams(router.state.location.search).get('assistantCreate'),
  ).toBe(createId);
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved assistant' }),
  ).toBeEnabled();
  expect(mockMutate).toHaveBeenCalledTimes(1);
});
it('keeps a consumed duplicate seed and its draft within the mounted editor under StrictMode and temporary outages', async () => {
  const { user, rerender } = mount(
    `/delivery?view=agents&assistant=${ASSISTANT_ID}&assistantEdit=1`,
    true,
  );
  await user.click(screen.getByRole('button', { name: 'Duplicate assistant' }));
  expect(screen.getByLabelText('Name')).toHaveValue('Copy checker (copy)');
  await user.type(screen.getByLabelText('Name'), ' strict draft');
  mockError = new Error('Temporary connection loss');
  rerender();
  expect(screen.getByLabelText('Name')).not.toBeVisible();
  mockError = undefined;
  rerender();
  expect(screen.getByLabelText('Name')).toHaveValue(
    'Copy checker (copy) strict draft',
  );
  expect(screen.getByRole('button', { name: 'Save assistant' })).toBeEnabled();
  expect(mockMutate).not.toHaveBeenCalled();
});

import { type ReactNode } from 'react';
import { type DocumentNode } from 'graphql';
import { NetworkStatus } from '@apollo/client';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook } from '@testing-library/react';
import { useDeliveryTasks } from '@/delivery/tasks/useDeliveryTasks';
import { type OtogrowAccess } from '@/otogrow-access/otogrow-access.types';
import { taskListInput } from '@/delivery/tasks/task-navigation';
import {
  taskContextFixture,
  taskListFixture,
  taskDetailFixture,
  TASK_ID,
  PROJECT_ID,
  MANAGER_ID,
} from '@/delivery/tasks/__tests__/tasks.fixtures';
let mockContext = taskContextFixture();
let mockList = taskListFixture();
let mockDetail = taskDetailFixture();
let mockReady = true;
let mockManager = true;
let mockMembership = 'membership';
let mockContextError: Error | undefined;
let mockDetailError: Error | undefined;
let mockListError: Error | undefined;
let mockLoading = false;
let mockNetworkStatus = NetworkStatus.ready;
let mockAccess: OtogrowAccess;
const mockMutate = jest.fn();
const mockQuery = jest.fn();
const mockContextRefetch = jest.fn();
const mockListRefetch = jest.fn();
const mockDetailRefetch = jest.fn();
const mockRefetchQueries = jest.fn();
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    manager: mockManager,
    scope: `workspace:${MANAGER_ID}:${mockMembership}`,
    access: mockReady ? mockAccess : undefined,
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
      data.userWorkspaceId === mockMembership,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutate],
  useQuery: (document: DocumentNode, options: unknown) => {
    const operation = document.definitions.find(
      (definition) => definition.kind === 'OperationDefinition',
    );
    const name =
      operation?.kind === 'OperationDefinition' ? operation.name?.value : '';
    mockQuery(name, options);
    const common = {
      loading: mockLoading,
      networkStatus: mockNetworkStatus,
      client: { refetchQueries: mockRefetchQueries },
    };
    if (name === 'DeliveryWorkspaceContext')
      return {
        ...common,
        data: { deliveryWorkspaceContext: mockContext },
        error: mockContextError,
        refetch: mockContextRefetch,
      };
    if (name === 'DeliveryTaskList')
      return {
        ...common,
        data: { deliveryTaskList: mockList },
        error: mockListError,
        refetch: mockListRefetch,
      };
    if (name === 'DeliveryTaskDetail')
      return {
        ...common,
        data: { deliveryTaskDetail: mockDetail },
        error: mockDetailError,
        refetch: mockDetailRefetch,
      };
    throw new Error(`Unexpected full-workspace or other query: ${name}`);
  },
}));
const input = () =>
  taskListInput(new URLSearchParams('view=home&taskTimezone=Asia%2FQatar'));
const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider i18n={i18n}>{children}</I18nProvider>
);
const create = () => ({
  action: 'create',
  projectId: PROJECT_ID,
  fields: {
    title: 'Create once',
    brief: '',
    service: 'Video',
    priority: 'NORMAL',
    scheduledDate: null,
    dueAt: null,
    assigneeId: MANAGER_ID,
    reviewerId: 'independent-manager',
    checklist: [],
    evidence: [],
  },
});
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.clearAllMocks();
  mockContext = taskContextFixture();
  mockList = taskListFixture();
  mockDetail = taskDetailFixture();
  mockReady = true;
  mockManager = true;
  mockMembership = 'membership';
  mockContextError = undefined;
  mockListError = undefined;
  mockDetailError = undefined;
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  mockAccess = {
    workspaceId: 'workspace',
    memberId: MANAGER_ID,
    userWorkspaceId: 'membership',
    capabilities: ['workspace.admin'],
    roleIds: [],
    grants: [],
    nativeAdministrator: true,
  };
  mockContextRefetch.mockImplementation(async () => ({
    data: { deliveryWorkspaceContext: mockContext },
  }));
  mockListRefetch.mockImplementation(async () => ({
    data: { deliveryTaskList: mockList },
  }));
  mockDetailRefetch.mockImplementation(async () => ({
    data: { deliveryTaskDetail: mockDetail },
  }));
  mockRefetchQueries.mockResolvedValue([]);
  mockMutate.mockResolvedValue({
    data: {
      changeDeliveryTask: {
        workspaceId: 'workspace',
        memberId: MANAGER_ID,
        userWorkspaceId: 'membership',
        taskId: TASK_ID,
        revision: 5,
        state: 'IN_PROGRESS',
      },
    },
  });
});
it('uses task-free context and a genuine summary list, skipping exact detail without a selected task', () => {
  const { result } = renderHook(() => useDeliveryTasks(input(), null), {
    wrapper,
  });
  expect(result.current.list?.totalCount).toBe(58);
  expect(result.current.context).not.toHaveProperty('tasks');
  expect(result.current.list?.items[0]).not.toHaveProperty('details');
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskDetail',
    expect.objectContaining({ skip: true }),
  );
  expect(mockMutate).not.toHaveBeenCalled();
});
it.each([NetworkStatus.poll, NetworkStatus.refetch])(
  'retains verified reading context during same-scope refresh %s but hides it on source failure',
  (status) => {
    const view = renderHook(() => useDeliveryTasks(input(), TASK_ID), {
      wrapper,
    });
    mockLoading = true;
    mockNetworkStatus = status;
    view.rerender();
    expect(view.result.current.list?.totalCount).toBe(58);
    expect(view.result.current.detail?.details.brief).toBe(
      'PRIVATE_EXACT_DETAIL_ONLY',
    );
    mockDetailError = new Error('Offline');
    mockListError = new Error('Offline');
    view.rerender();
    expect(view.result.current.list).toBeNull();
    expect(view.result.current.detail).toBeNull();
    expect(view.result.current.retainedDetail?.details.brief).toBe(
      'PRIVATE_EXACT_DETAIL_ONLY',
    );
  },
);
it('immediately hides old manager or finance reads after known authorization loss and binds new requests to that authority', () => {
  const view = renderHook(() => useDeliveryTasks(input(), TASK_ID), {
    wrapper,
  });
  mockAccess = {
    ...mockAccess,
    capabilities: ['delivery.review'],
    nativeAdministrator: false,
  };
  mockManager = false;
  view.rerender();
  expect(view.result.current.contextVerified).toBe(false);
  expect(view.result.current.list).toBeNull();
  expect(view.result.current.detail).toBeNull();
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryWorkspaceContext',
    expect.objectContaining({
      variables: expect.objectContaining({
        authorization: expect.stringContaining('delivery.review'),
      }),
    }),
  );
});
it('immediately hides an old project source after the verified directory removes that membership', () => {
  const view = renderHook(() => useDeliveryTasks(input(), TASK_ID), {
    wrapper,
  });
  mockContext = { ...mockContext, projects: [] };
  view.rerender();
  expect(view.result.current.list).toBeNull();
  expect(view.result.current.detail).toBeNull();
});
it.each(['outage', 'grant-loss'] as const)(
  'retains a known committed create receipt across %s and never repeats that form attempt',
  async (condition) => {
    let finish!: (value: unknown) => void;
    mockMutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderHook(() => useDeliveryTasks(input(), null), { wrapper });
    let pending!: Promise<boolean>;
    act(() => {
      pending = view.result.current.run(create(), 'create:1');
    });
    if (condition === 'outage') {
      mockReady = false;
      mockContextError = new Error('Offline');
    } else {
      mockAccess = { ...mockAccess, capabilities: [] };
      mockManager = false;
    }
    view.rerender();
    let saved = false;
    await act(async () => {
      finish({
        data: {
          changeDeliveryTask: {
            workspaceId: 'workspace',
            memberId: MANAGER_ID,
            userWorkspaceId: 'membership',
            taskId: TASK_ID,
            revision: 1,
            state: 'PLANNED',
          },
        },
      });
      saved = await pending;
    });
    expect(saved).toBe(true);
    await act(async () => {
      expect(await view.result.current.run(create(), 'create:1')).toBe(true);
    });
    expect(mockMutate).toHaveBeenCalledTimes(1);
  },
);
it('blocks an unknown network create outcome from blind replay even when the same form is edited', async () => {
  mockMutate.mockRejectedValueOnce(new Error('Connection lost'));
  const view = renderHook(() => useDeliveryTasks(input(), null), { wrapper });
  await act(async () => {
    expect(await view.result.current.run(create(), 'create:1')).toBe(false);
  });
  expect(view.result.current.unknownCreate).toBe('create:1');
  await act(async () => {
    expect(
      await view.result.current.run(
        {
          ...create(),
          fields: { ...create().fields, title: 'Edited same uncertain form' },
        },
        'create:1',
      ),
    ).toBe(false);
  });
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(view.result.current.error).toMatch(/Check new work/);
});
it('treats a verified commit as success when follow-up reads fail and does not write a legacy cache snapshot', async () => {
  mockDetailRefetch.mockRejectedValueOnce(new Error('Refresh failed'));
  const view = renderHook(() => useDeliveryTasks(input(), TASK_ID), {
    wrapper,
  });
  await act(async () => {
    expect(
      await view.result.current.run({
        action: 'comment',
        taskId: TASK_ID,
        revision: 4,
        text: 'Current note',
      }),
    ).toBe(true);
  });
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockRefetchQueries).toHaveBeenCalledWith(
    expect.objectContaining({ include: 'active' }),
  );
});
it('rejects foreign exact task receipts and hides mismatched detail identity without substituting a page row', () => {
  mockDetail = { ...mockDetail, userWorkspaceId: 'foreign' };
  const view = renderHook(() => useDeliveryTasks(input(), TASK_ID), {
    wrapper,
  });
  expect(view.result.current.detail).toBeNull();
  expect(view.result.current.list?.items[0].id).toBe(TASK_ID);
});
it('pauses task-card reads and refreshes in workload view while keeping exact task commands available', async () => {
  const plannerInput = taskListInput(
    new URLSearchParams('view=planner&taskTimezone=Asia%2FQatar'),
  );
  const view = renderHook(
    () => useDeliveryTasks(plannerInput, TASK_ID, { listEnabled: false }),
    { wrapper },
  );
  expect(view.result.current.list).toBeNull();
  expect(view.result.current.detailVerified).toBe(true);
  expect(view.result.current.detail?.id).toBe(TASK_ID);
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskList',
    expect.objectContaining({ skip: true }),
  );
  await act(async () => {
    expect(
      await view.result.current.run({
        action: 'comment',
        taskId: TASK_ID,
        revision: 4,
        text: 'Note from an exact workload source',
      }),
    ).toBe(true);
  });
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockListRefetch).not.toHaveBeenCalled();
  expect(mockContextRefetch).toHaveBeenCalled();
  expect(mockDetailRefetch).toHaveBeenCalled();
  expect(mockRefetchQueries).toHaveBeenCalledWith(
    expect.objectContaining({ include: 'active' }),
  );
});
it('uses no list input for scoped Approvals and immediately refreshes the active queue after a thin decision', async () => {
  mockManager = false;
  mockAccess = {
    ...mockAccess,
    capabilities: ['delivery.review'],
    nativeAdministrator: false,
  };
  mockContext.actor = {
    ...mockContext.actor,
    capabilities: ['delivery.review'],
    isAdmin: false,
    isManager: false,
  };
  const queueRefetch = jest.fn().mockResolvedValue({});
  mockRefetchQueries.mockImplementation(
    async ({
      onQueryUpdated,
    }: {
      onQueryUpdated: (query: {
        queryName: string;
        refetch: () => Promise<unknown>;
      }) => unknown;
    }) => {
      await onQueryUpdated({
        queryName: 'DeliveryReviewQueue',
        refetch: queueRefetch,
      });
      return [];
    },
  );
  const view = renderHook(
    () =>
      useDeliveryTasks(null, TASK_ID, { listEnabled: false, reviewView: true }),
    { wrapper },
  );
  expect(view.result.current.contextVerified).toBe(true);
  expect(view.result.current.detailVerified).toBe(true);
  expect(view.result.current.list).toBeNull();
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskList',
    expect.objectContaining({
      variables: expect.objectContaining({ input: null }),
      skip: true,
    }),
  );
  await act(async () => {
    expect(
      await view.result.current.run({
        action: 'review',
        taskId: TASK_ID,
        revision: 4,
        decision: 'APPROVED',
        selectedSubmissionVersion: 1,
        reviewAssignmentRevision: 0,
      }),
    ).toBe(true);
  });
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        action: 'review',
        selectedSubmissionVersion: 1,
        reviewAssignmentRevision: 0,
      }),
    },
  });
  expect(queueRefetch).toHaveBeenCalledTimes(1);
  expect(mockListRefetch).not.toHaveBeenCalled();
});
it('does not request exact Approvals detail for a known non-review role', () => {
  mockManager = false;
  mockAccess = { ...mockAccess, capabilities: [], nativeAdministrator: false };
  mockContext.actor = {
    ...mockContext.actor,
    capabilities: [],
    isAdmin: false,
    isManager: false,
  };
  const view = renderHook(
    () =>
      useDeliveryTasks(null, TASK_ID, { listEnabled: false, reviewView: true }),
    { wrapper },
  );
  expect(view.result.current.contextVerified).toBe(true);
  expect(view.result.current.detail).toBeNull();
  expect(view.result.current.detailVerified).toBe(false);
  expect(view.result.current.list).toBeNull();
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskDetail',
    expect.objectContaining({ skip: true }),
  );
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryTaskList',
    expect.objectContaining({ skip: true }),
  );
});

import { useState } from 'react';
import { Request } from 'cross-fetch';
import { type DocumentNode } from 'graphql';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryCommitments } from '@/delivery/commitments/DeliveryCommitments';
import { DeliveryCommitmentDirectory } from '@/delivery/commitments/DeliveryCommitmentDirectory';
import { DeliveryClients } from '@/delivery/DeliveryClients';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type CommitmentSnapshot } from '@/delivery/commitments/commitment.types';
import { type OtogrowAccess } from '@/otogrow-access/otogrow-access.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/commitments/commitmentStyles', () => ({
  StyledCommitmentActions: 'div',
  StyledCommitmentCounts: 'dl',
  StyledCommitmentList: 'ul',
}));
let mockAccess: OtogrowAccess;
let mockFeed: CommitmentSnapshot;
let mockError: Error | undefined;
let mockPermissionLoading: boolean;
let mockPermissionError: Error | undefined;
let mockDirectoryWorkspace: string;
let mockSelectedTaskMissing = false;
let mockSelectedParentMissing = false;
const mockReceipt = jest.fn();
const mockQueries = jest.fn();
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/otogrow-access/useOtogrowIdentity', () => ({
  useOtogrowIdentity: () => ({
    identity: `${mockAccess.workspaceId}:${mockAccess.memberId}:user`,
  }),
}));
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => ({
    access: mockAccess,
    scopeKey:
      mockPermissionLoading || mockPermissionError
        ? null
        : `${mockAccess.workspaceId}:${mockAccess.memberId}:${mockAccess.userWorkspaceId}`,
    loading: mockPermissionLoading,
    error: mockPermissionError,
    refetch: mockRefetch,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    document: DocumentNode,
    options: {
      variables?: {
        input?: { selectedTaskId?: string; selectedParentTaskId?: string };
      };
      skip?: boolean;
    },
  ) => {
    const operation = document.definitions.find(
      (item) => item.kind === 'OperationDefinition',
    );
    const name =
      operation?.kind === 'OperationDefinition' ? operation.name?.value : '';
    mockQueries(name, options);
    return {
      data: {
        deliveryCommitments: {
          ...mockFeed,
          selectedTask:
            !options.variables?.input?.selectedTaskId || mockSelectedTaskMissing
              ? null
              : (mockFeed.taskOptions.find(
                  (item) =>
                    item.taskId === options.variables?.input?.selectedTaskId,
                ) ?? mockFeed.selectedTask),
          selectedParent:
            !options.variables?.input?.selectedParentTaskId ||
            mockSelectedParentMissing
              ? null
              : (mockFeed.taskOptions.find(
                  (item) =>
                    item.taskId ===
                    options.variables?.input?.selectedParentTaskId,
                ) ?? mockFeed.selectedParent),
        },
        deliveryCommitmentEngagements: {
          workspaceId: mockDirectoryWorkspace,
          memberId: mockAccess.memberId,
          userWorkspaceId: mockAccess.userWorkspaceId,
          roleIds: [],
          engagements: [
            {
              id: 'engagement',
              name: 'Brand retainer',
              projectId: 'project',
              billing: 'RETAINER',
            },
          ],
        },
        deliveryClients: {
          workspaceId: 'workspace',
          memberId: 'manager',
          userWorkspaceId: 'user-workspace',
          engagements: [
            {
              id: 'engagement',
              projectId: 'project',
              companyId: 'client',
              revision: 1,
              name: 'Brand retainer',
              billing: 'RETAINER',
              services: ['Video'],
              scope: 'Create brand videos',
              allowance: 'Six unique videos',
              contact: 'Founder',
              fields: [],
              submissions: [],
              assets: [],
            },
          ],
          shares: [],
          links: [],
        },
      },
      loading: false,
      error: mockError,
      refetch: mockRefetch,
    };
  },
  useMutation: () => [mockMutate, { loading: false }],
  useApolloClient: () => ({ query: mockReceipt }),
}));
const initialFeed = (): CommitmentSnapshot => ({
  workspaceId: 'workspace',
  memberId: 'manager',
  userWorkspaceId: 'user-workspace',
  engagementId: 'engagement',
  engagementName: 'Brand retainer',
  projectId: 'project',
  canManage: true,
  taskDetailsAvailable: true,
  selectedTask: null,
  selectedParent: null,
  orphanAllocations: [],
  nextOrphanAllocationCursor: null,
  legacyAllowance:
    'Six original videos; extra hooks discussed separately.\nKeep this wording.',
  selectedPeriodId: 'period',
  periods: [
    {
      id: 'period',
      label: 'October delivery',
      billing: 'RETAINER',
      startDate: '2026-10-01',
      endDateExclusive: '2026-11-01',
      timezone: 'Asia/Qatar',
      state: 'OPEN',
      revision: 3,
    },
    {
      id: 'next-period',
      label: 'November delivery',
      billing: 'RETAINER',
      startDate: '2026-11-01',
      endDateExclusive: '2026-12-01',
      timezone: 'Asia/Qatar',
      state: 'OPEN',
      revision: 1,
    },
  ],
  lines: [
    {
      id: 'originals',
      periodId: 'period',
      label: 'Original ads',
      unit: 'UNIQUE_VIDEO',
      revision: 4,
      promisedQuantity: 6,
      assignedQuantity: 3,
      fulfilledQuantity: 2,
      remainingQuantity: 4,
      overdeliveredQuantity: 0,
    },
    {
      id: 'variations',
      periodId: 'period',
      label: 'Hook versions',
      unit: 'VARIATION',
      revision: 2,
      promisedQuantity: 3,
      assignedQuantity: 1,
      fulfilledQuantity: 0,
      remainingQuantity: 3,
      overdeliveredQuantity: 0,
    },
  ],
  allocations: [
    {
      taskId: 'task',
      taskName: 'Approved original video',
      periodId: 'period',
      lineId: 'originals',
      parentTaskId: null,
      revision: 1,
      state: 'ASSIGNED',
      credited: false,
      creditReason: 'Client fulfilment has not been confirmed.',
      fulfilledAt: null,
      creditedCycle: null,
      creditedSubmissionVersion: null,
    },
  ],
  taskOptions: [
    {
      taskId: 'original-task',
      name: 'Original product video',
      taskRevision: 8,
      state: 'FULFILLED',
      allocationRevision: 2,
      allocatedPeriodId: 'period',
      allocatedLineId: 'originals',
      allocatedUnit: 'UNIQUE_VIDEO',
    },
    {
      taskId: 'variation-task',
      name: 'Hook version A',
      taskRevision: 5,
      state: 'PLANNED',
      allocationRevision: 0,
      allocatedPeriodId: null,
      allocatedLineId: null,
      allocatedUnit: null,
    },
  ],
  moreTaskOptions: false,
  history: [
    {
      id: 'event',
      action: 'COMMITMENT_LINE_CREATED',
      actorName: 'Amna',
      actorType: 'HUMAN',
      occurredAt: '2026-10-01T06:00:00Z',
      taskId: null,
      taskName: null,
      reason: 'Signed agreement',
      changes: [{ field: 'promisedQuantity', before: null, after: '6' }],
    },
  ],
  nextAllocationCursor: 'next-task-page',
  nextHistoryCursor: 'older-history',
});
const Harness = ({
  staffClients = false,
  managerClients = false,
  directory = false,
}: {
  staffClients?: boolean;
  managerClients?: boolean;
  directory?: boolean;
}) => {
  const [, refresh] = useState(0);
  return (
    <>
      <Link to="/other">Other view</Link>
      <button onClick={() => refresh((value) => value + 1)}>
        Refresh test data
      </button>
      {directory ? (
        <DeliveryCommitmentDirectory />
      ) : staffClients || managerClients ? (
        <DeliveryClients
          workspace={{
            actor: {
              memberId: 'manager',
              isManager: managerClients,
              isAdmin: false,
            },
            projects: [
              {
                revision: 1,
                id: 'project',
                name: 'Brand',
                companyId: 'client',
                memberIds: [],
              },
            ],
            members: [],
            tasks: [],
            companies: [],
          }}
          onChanged={mockRefetch}
        />
      ) : (
        <DeliveryCommitments engagementId="engagement" billing="RETAINER" />
      )}
    </>
  );
};
const setup = (
  staffClients = false,
  managerClients = false,
  entry = '/delivery',
  directory = false,
) => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Harness
              staffClients={staffClients}
              managerClients={managerClients}
              directory={directory}
            />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other view opened</p> },
    ],
    { initialEntries: [entry] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return Object.assign(userEvent.setup(), { router });
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
  mockAccess = {
    workspaceId: 'workspace',
    memberId: 'manager',
    userWorkspaceId: 'user-workspace',
    roleIds: [],
    capabilities: ['delivery.manage'],
    nativeAdministrator: false,
    grants: [],
  };
  mockFeed = initialFeed();
  mockError = undefined;
  mockPermissionLoading = false;
  mockPermissionError = undefined;
  mockDirectoryWorkspace = 'workspace';
  mockSelectedTaskMissing = false;
  mockSelectedParentMissing = false;
  sessionStorage.clear();
  mockReceipt.mockReset();
  mockQueries.mockReset();
  mockRefetch
    .mockReset()
    .mockResolvedValue({ data: { deliveryCommitments: mockFeed } });
  mockMutate.mockReset().mockImplementation(async () => ({
    data: {
      saveDeliveryCommitmentPeriod: mockFeed,
      saveDeliveryCommitmentLine: mockFeed,
      assignDeliveryCommitmentTask: mockFeed,
      removeDeliveryCommitmentTask: mockFeed,
      setDeliveryCommitmentPeriodState: mockFeed,
    },
  }));
});

it('opens an exact manager engagement and period directly from a founder source link', () => {
  setup(
    false,
    true,
    '/delivery?view=clients&clientEngagement=engagement&commitmentPeriod=period&task=task&search=launch',
  );
  expect(screen.getByLabelText('Client service plan')).toHaveValue(
    'engagement',
  );
  expect(screen.getByLabelText('Commitment period')).toHaveValue('period');
  expect(screen.getByLabelText('Commitment period')).toHaveFocus();
  expect(screen.getByRole('heading', { name: 'Brand retainer' })).toBeVisible();
  expect(mockQueries).toHaveBeenCalledWith(
    'DeliveryCommitments',
    expect.objectContaining({
      variables: expect.objectContaining({
        input: expect.objectContaining({
          engagementId: 'engagement',
          periodId: 'period',
        }),
      }),
    }),
  );
});

it('focuses a verified linked period once without taking focus again after refresh or outage recovery', async () => {
  const user = setup(
    false,
    false,
    '/delivery?clientEngagement=engagement&commitmentPeriod=period',
  );
  expect(screen.getByLabelText('Commitment period')).toHaveFocus();
  const refresh = screen.getByRole('button', { name: 'Refresh test data' });
  mockFeed = { ...mockFeed };
  await user.click(refresh);
  expect(refresh).toHaveFocus();
  mockError = new Error('Temporary outage');
  await user.click(refresh);
  expect(screen.queryByLabelText('Commitment period')).not.toBeInTheDocument();
  mockError = undefined;
  await user.click(refresh);
  expect(screen.getByLabelText('Commitment period')).toHaveValue('period');
  expect(refresh).toHaveFocus();
});

it('does not focus ordinary unlinked browsing or an unverified linked response', async () => {
  const user = setup();
  expect(screen.getByLabelText('Commitment period')).not.toHaveFocus();
  mockFeed = { ...mockFeed, workspaceId: 'prior-workspace' };
  await act(() =>
    user.router.navigate(
      '/delivery?clientEngagement=engagement&commitmentPeriod=period',
    ),
  );
  expect(screen.queryByLabelText('Commitment period')).not.toBeInTheDocument();
  const refresh = screen.getByRole('button', { name: 'Refresh test data' });
  mockFeed = initialFeed();
  await user.click(refresh);
  expect(screen.getByLabelText('Commitment period')).toHaveFocus();
});

it('opens assigned staff commitments without exposing the linked commercial agreement', () => {
  mockAccess.capabilities = [];
  mockFeed.canManage = false;
  setup(
    true,
    false,
    '/delivery?view=clients&clientEngagement=engagement&commitmentPeriod=period',
  );
  expect(screen.getByLabelText('Client service plan')).toHaveValue(
    'engagement',
  );
  expect(screen.getByLabelText('Commitment period')).toHaveValue('period');
  expect(screen.getByText('Original ads')).toBeVisible();
  expect(screen.queryByText('Create brand videos')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Edit client service plan' }),
  ).not.toBeInTheDocument();
});

it('preserves source filters and exact selections through period changes and browser back and forward', async () => {
  const original = initialFeed();
  const next = {
    ...original,
    selectedPeriodId: 'next-period',
    lines: [],
    allocations: [],
    history: [],
  };
  const user = setup(
    false,
    true,
    '/delivery?view=clients&clientEngagement=engagement&commitmentPeriod=period&task=task&search=launch',
  );
  mockFeed = next;
  await user.selectOptions(
    screen.getByLabelText('Commitment period'),
    'next-period',
  );
  const selected = new URLSearchParams(user.router.state.location.search);
  expect(selected.get('clientEngagement')).toBe('engagement');
  expect(selected.get('commitmentPeriod')).toBe('next-period');
  expect(selected.get('task')).toBe('task');
  expect(selected.get('search')).toBe('launch');
  mockFeed = original;
  await act(async () => user.router.navigate(-1));
  expect(screen.getByLabelText('Commitment period')).toHaveValue('period');
  mockFeed = next;
  await act(async () => user.router.navigate(1));
  expect(screen.getByLabelText('Commitment period')).toHaveValue('next-period');
});

it('keeps an unavailable engagement explicit until the user clears or replaces the source link', async () => {
  const user = setup(
    false,
    true,
    '/delivery?view=clients&clientEngagement=missing-engagement&commitmentPeriod=missing-period&task=task&search=launch',
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'This linked client service plan is unavailable',
  );
  expect(
    screen.queryByRole('heading', { name: 'Delivery commitments' }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Client service plan')).toHaveValue(
    'missing-engagement',
  );
  await user.click(
    screen.getByRole('button', { name: 'Clear service plan selection' }),
  );
  const cleared = new URLSearchParams(user.router.state.location.search);
  expect(cleared.has('clientEngagement')).toBe(false);
  expect(cleared.has('commitmentPeriod')).toBe(false);
  expect(cleared.get('task')).toBe('task');
  expect(cleared.get('search')).toBe('launch');
  await user.selectOptions(
    screen.getByLabelText('Client service plan'),
    'engagement',
  );
  expect(
    new URLSearchParams(user.router.state.location.search).get(
      'clientEngagement',
    ),
  ).toBe('engagement');
  expect(mockMutate).not.toHaveBeenCalled();
});

it('requires deliberate recovery from an unavailable explicit period instead of showing another promise', async () => {
  mockError = new Error('Selected period is unavailable');
  const user = setup(
    false,
    false,
    '/delivery?view=clients&clientEngagement=engagement&commitmentPeriod=missing-period&commitmentHistoryBefore=old-cursor&task=task',
  );
  expect(screen.queryByText('Original ads')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Choose another commitment period' }),
  ).toBeVisible();
  mockError = undefined;
  await user.click(
    screen.getByRole('button', { name: 'Choose another commitment period' }),
  );
  const recovered = new URLSearchParams(user.router.state.location.search);
  expect(recovered.has('commitmentPeriod')).toBe(false);
  expect(recovered.has('commitmentHistoryBefore')).toBe(false);
  expect(recovered.get('clientEngagement')).toBe('engagement');
  expect(recovered.get('task')).toBe('task');
  expect(screen.getByText('Original ads')).toBeVisible();
});

it('protects a dirty commitment before changing the linked URL and discards it only when requested', async () => {
  const user = setup(
    false,
    false,
    '/delivery?view=clients&clientEngagement=engagement&commitmentPeriod=period&task=task',
  );
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(screen.getByLabelText('Promised item name'), ' draft');
  await user.selectOptions(
    screen.getByLabelText('Commitment period'),
    'next-period',
  );
  expect(
    new URLSearchParams(user.router.state.location.search).get(
      'commitmentPeriod',
    ),
  ).toBe('period');
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads draft',
  );
  await user.selectOptions(
    screen.getByLabelText('Commitment period'),
    'next-period',
  );
  mockFeed = {
    ...initialFeed(),
    selectedPeriodId: 'next-period',
    lines: [],
    allocations: [],
    history: [],
  };
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(
    new URLSearchParams(user.router.state.location.search).get(
      'commitmentPeriod',
    ),
  ).toBe('next-period');
  expect(screen.queryByLabelText('Promised item name')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Commitment period')).toHaveValue('next-period');
});

it('hides commercial client details when a retained response belongs to a prior workspace', async () => {
  const user = setup(
    false,
    true,
    '/delivery?view=clients&clientEngagement=engagement&commitmentPeriod=period',
  );
  expect(screen.getByRole('heading', { name: 'Brand retainer' })).toBeVisible();
  mockAccess = { ...mockAccess, workspaceId: 'another-workspace' };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.queryByRole('heading', { name: 'Brand retainer' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Create brand videos')).not.toBeInTheDocument();
  expect(
    screen.getByText(/Client details are hidden until your current access/),
  ).toBeVisible();
});

it('separates unique videos from variations and shows why an approved task is not fulfilled', async () => {
  const user = setup();
  const rows = within(
    screen.getByRole('list', { name: 'Promised work' }),
  ).getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('Unique videos');
  expect(rows[0]).toHaveTextContent('Promised6Fulfilled2Remaining4');
  expect(rows[1]).toHaveTextContent('Video variations');
  expect(rows[1]).toHaveTextContent('Promised3Fulfilled0Remaining3');
  await user.click(screen.getByText('Existing allowance notes'));
  expect(
    screen.getByText(/Six original videos; extra hooks discussed separately/),
  ).toHaveTextContent('Keep this wording.');
  await user.click(screen.getByText('Linked work you can access'));
  expect(
    screen.getByText('Client fulfilment has not been confirmed.'),
  ).toBeVisible();
  expect(screen.getByText(/Not counted as fulfilled/)).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Approved original video' }),
  ).toHaveAttribute('href', '/delivery?view=mine&task=task');
});
it('keeps staff read-only and isolates the directory from commercial client data', async () => {
  mockAccess.capabilities = [];
  mockFeed.canManage = false;
  const user = setup(true);
  expect(mockQueries).toHaveBeenCalledWith(
    'DeliveryClients',
    expect.objectContaining({ skip: true }),
  );
  expect(screen.queryByText('New client service plan')).not.toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText('Client service plan'),
    'engagement',
  );
  expect(screen.getByText('Original ads')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Plan a period' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('Existing allowance notes'),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Commitment history')).not.toBeInTheDocument();
});
it('retains a failed quantity edit and requires an explicit conflict reload', async () => {
  mockMutate.mockRejectedValueOnce(
    new Error('This commitment changed. Reload the latest plan.'),
  );
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.clear(screen.getByLabelText('Promised quantity'));
  await user.type(screen.getByLabelText('Promised quantity'), '8');
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Expanded agreement',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('commitment changed');
  expect(screen.getByLabelText('Promised quantity')).toHaveValue(8);
  mockFeed = {
    ...mockFeed,
    lines: mockFeed.lines.map((line) =>
      line.id === 'originals'
        ? { ...line, revision: 5, promisedQuantity: 7 }
        : line,
    ),
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.getByRole('button', { name: 'Save commitment change' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Promised quantity')).toHaveValue(8);
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Promised quantity')).toHaveValue(7),
  );
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Confirm latest scope',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  expect(mockMutate).toHaveBeenLastCalledWith({
    variables: {
      input: expect.objectContaining({
        id: 'originals',
        revision: 5,
        periodRevision: 3,
        promisedQuantity: 7,
      }),
    },
  });
});
it('keeps a new period identifier stable across failed retries and requires explicit dates', async () => {
  mockMutate.mockRejectedValue(new Error('Save unavailable'));
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Plan a period' }));
  await user.type(
    screen.getByLabelText('Period or package name'),
    'December delivery',
  );
  await user.type(screen.getByLabelText('Start date'), '2026-12-01');
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Client renewal',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  expect(mockMutate).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Last day'), '2026-12-31');
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  expect(mockMutate).toHaveBeenCalledTimes(2);
  expect(mockMutate.mock.calls[1][0].variables.input.id).toBe(
    mockMutate.mock.calls[0][0].variables.input.id,
  );
  expect(mockMutate.mock.calls[0][0].variables.input).toEqual(
    expect.objectContaining({
      revision: 0,
      startDate: '2026-12-01',
      endDateExclusive: '2027-01-01',
      timezone: 'Asia/Qatar',
    }),
  );
});
it('requires a linked original video for a variation and submits captured assignment revisions', async () => {
  const user = setup();
  await user.click(screen.getByText('Linked work you can access'));
  await user.click(screen.getByRole('button', { name: 'Link a task' }));
  await user.selectOptions(
    screen.getByLabelText('Commitment item'),
    'variations',
  );
  await user.selectOptions(
    screen.getByLabelText('Task to link'),
    'variation-task',
  );
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Approved hook variation',
  );
  expect(
    screen.getByRole('button', { name: 'Save commitment change' }),
  ).toBeDisabled();
  await user.selectOptions(
    screen.getByLabelText('Original unique-video task'),
    'original-task',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: {
        engagementId: 'engagement',
        periodId: 'period',
        periodRevision: 3,
        lineId: 'variations',
        lineRevision: 2,
        taskId: 'variation-task',
        taskRevision: 5,
        revision: 0,
        parentTaskId: 'original-task',
        reason: 'Approved hook variation',
      },
    },
  });
});
it('guards period replacement and hides uncertain data without losing an in-memory edit', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(screen.getByLabelText('Promised item name'), ' revised');
  await user.selectOptions(
    screen.getByLabelText('Commitment period'),
    'next-period',
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads revised',
  );
  mockError = new Error('Cannot verify access');
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.queryByRole('textbox', { name: 'Promised item name' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Original ads')).not.toBeInTheDocument();
  mockError = undefined;
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads revised',
  );
  mockAccess = { ...mockAccess, workspaceId: 'another-workspace' };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.queryByText('Original ads')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('textbox', { name: 'Promised item name' }),
  ).not.toBeInTheDocument();
});
it('pages linked tasks and history without changing the promise', async () => {
  const user = setup();
  await user.click(screen.getByText('Linked work you can access'));
  await user.click(screen.getByRole('button', { name: 'Next task page' }));
  expect(mockQueries).toHaveBeenCalledWith(
    'DeliveryCommitments',
    expect.objectContaining({
      variables: expect.objectContaining({
        input: expect.objectContaining({ allocationCursor: 'next-task-page' }),
      }),
    }),
  );
  await user.click(screen.getByText('Commitment history'));
  expect(screen.getByText('Promised work added')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Older history' }));
  expect(mockQueries).toHaveBeenCalledWith(
    'DeliveryCommitments',
    expect.objectContaining({
      variables: expect.objectContaining({
        input: expect.objectContaining({ historyCursor: 'older-history' }),
      }),
    }),
  );
  expect(mockMutate).not.toHaveBeenCalled();
});
it('shows an empty plan without inventing quantities from legacy allowance prose', () => {
  mockFeed = {
    ...mockFeed,
    periods: [],
    lines: [],
    allocations: [],
    history: [],
    selectedPeriodId: null,
  };
  setup();
  expect(
    screen.getByText(
      'No commitment period has been planned for this engagement.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('list', { name: 'Promised work' }),
  ).not.toBeInTheDocument();
});

it.each(['loading', 'error'])(
  'hides prior commitments and draft controls during fresh permission %s, then restores the draft',
  async (state) => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
    await user.type(
      screen.getByLabelText('Promised item name'),
      ' retained draft',
    );
    if (state === 'loading') mockPermissionLoading = true;
    else mockPermissionError = new Error('Permission check failed');
    await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
    expect(
      screen.queryByRole('list', { name: 'Promised work' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Promised item name' }),
    ).not.toBeInTheDocument();
    expect(mockQueries).toHaveBeenCalledWith(
      'DeliveryCommitments',
      expect.objectContaining({ skip: true }),
    );
    mockPermissionLoading = false;
    mockPermissionError = undefined;
    await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
    expect(screen.getByLabelText('Promised item name')).toHaveValue(
      'Original ads retained draft',
    );
  },
);

it('hides the staff directory during fresh permission failure even when prior data is present', async () => {
  mockAccess.capabilities = [];
  mockFeed.canManage = false;
  const user = setup(true);
  expect(screen.getByRole('option', { name: 'Brand retainer' })).toBeVisible();
  mockPermissionError = new Error('Could not verify current access');
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.queryByRole('option', { name: 'Brand retainer' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check client access again' }),
  ).toBeVisible();
});

it('allows an open-ended one-time package and preserves its null end date', async () => {
  mockFeed = {
    ...mockFeed,
    periods: mockFeed.periods.map((period) =>
      period.id === 'period'
        ? { ...period, billing: 'ONE_TIME', endDateExclusive: null }
        : period,
    ),
  };
  const user = setup();
  expect(screen.getByText(/One-time package/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Edit period' }));
  expect(screen.getByLabelText('Last day')).not.toBeRequired();
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Confirm one-time package',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({ revision: 3, endDateExclusive: null }),
    },
  });
});

it('requires a reason to reopen a closed period and keeps its plan read-only until then', async () => {
  mockFeed = {
    ...mockFeed,
    periods: mockFeed.periods.map((period) =>
      period.id === 'period' ? { ...period, state: 'CLOSED' } : period,
    ),
  };
  const user = setup();
  expect(
    screen.queryByRole('button', { name: 'Add promised work' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Edit Original ads' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reopen period' }));
  expect(
    screen.getByRole('button', { name: 'Save commitment change' }),
  ).toBeDisabled();
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Client extended the scope',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: {
        engagementId: 'engagement',
        periodId: 'period',
        revision: 3,
        state: 'OPEN',
        reason: 'Client extended the scope',
      },
    },
  });
});

it('distinguishes a saved change from refresh failure without offering a duplicate submit', async () => {
  mockRefetch.mockRejectedValueOnce(new Error('Refresh unavailable'));
  const user = setup(
    false,
    false,
    '/delivery?clientEngagement=engagement&commitmentPeriod=period',
  );
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Confirm agreed amount',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('The change was saved');
  expect(
    screen.queryByRole('button', { name: 'Save commitment change' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Refresh commitments' }));
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  );
  expect(mockMutate).toHaveBeenCalledTimes(1);
});

it('keeps one editing context when moving from commitment changes to the engagement agreement', async () => {
  const user = setup(false, true);
  await user.selectOptions(
    screen.getByLabelText('Client service plan'),
    'engagement',
  );
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(screen.getByLabelText('Promised item name'), ' draft');
  await user.click(
    screen.getByRole('button', { name: 'Edit client service plan' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads draft',
  );
  expect(screen.queryByLabelText('Service plan name')).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Edit client service plan' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Brand retainer',
  );
  expect(screen.queryByLabelText('Promised item name')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads',
  );
});

it('explains required period dates and timezone before enabling Save', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Plan a period' }));
  await user.type(
    screen.getByLabelText('Period or package name'),
    'One day scope',
  );
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Confirmed plan',
  );
  expect(
    screen.getByRole('button', { name: 'Save commitment change' }),
  ).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Choose a valid start date',
  );
  await user.type(screen.getByLabelText('Start date'), '2026-12-01');
  expect(
    screen.getByRole('button', { name: 'Save commitment change' }),
  ).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Choose the last day');
  await user.type(screen.getByLabelText('Last day'), '2026-12-01');
  await user.clear(screen.getByLabelText('Timezone'));
  await user.type(screen.getByLabelText('Timezone'), 'Invalid/Timezone');
  expect(
    screen.getByRole('button', { name: 'Save commitment change' }),
  ).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Enter a valid timezone',
  );
  await user.clear(screen.getByLabelText('Timezone'));
  await user.type(screen.getByLabelText('Timezone'), 'Asia/Qatar');
  expect(
    screen.getByRole('button', { name: 'Save commitment change' }),
  ).toBeEnabled();
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: expect.objectContaining({
        startDate: '2026-12-01',
        endDateExclusive: '2026-12-02',
      }),
    },
  });
});

it('closes a discarded editor when changing linked task pages', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(screen.getByLabelText('Promised item name'), ' draft');
  await user.click(screen.getByText('Linked work you can access'));
  await user.click(screen.getByRole('button', { name: 'Next task page' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads draft',
  );
  await user.click(screen.getByRole('button', { name: 'Next task page' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.queryByLabelText('Promised item name')).not.toBeInTheDocument();
  expect(mockQueries).toHaveBeenCalledWith(
    'DeliveryCommitments',
    expect.objectContaining({
      variables: expect.objectContaining({
        input: expect.objectContaining({ allocationCursor: 'next-task-page' }),
      }),
    }),
  );
  expect(mockMutate).not.toHaveBeenCalled();
});

it('shows names and human statuses in commitment history without raw identifiers', async () => {
  mockFeed.history[0].changes = [
    { field: 'periodId', before: 'missing-period-id', after: 'period' },
    { field: 'lineId', before: null, after: 'originals' },
    {
      field: 'parentTaskId',
      before: 'missing-video-id',
      after: 'original-task',
    },
    { field: 'unit', before: 'UNIQUE_VIDEO', after: 'VARIATION' },
    { field: 'state', before: null, after: 'ASSIGNED' },
  ];
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByText('Commitment history'));
  const history = screen.getByText('Promised work added').closest('li')!;
  expect(
    within(history).getByText(
      /Previous or unavailable period.*October delivery/,
    ),
  ).toBeVisible();
  expect(
    within(history).getByText(
      /Previous or unavailable video task.*Original product video/,
    ),
  ).toBeVisible();
  expect(
    within(history).getByText(/Unique videos.*Video variations/),
  ).toBeVisible();
  expect(within(history).getByText(/→ Assigned/)).toBeVisible();
  expect(history.textContent).not.toMatch(
    /missing-period-id|missing-video-id|UNIQUE_VIDEO|VARIATION|ASSIGNED/,
  );
});

const denied = () =>
  new CombinedGraphQLErrors({
    errors: [
      { message: 'Contract unavailable', extensions: { code: 'FORBIDDEN' } },
    ],
  });
it('keeps contract totals and an unsaved quantity edit when native task details are revoked', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(
    screen.getByLabelText('Promised item name'),
    ' retained contract draft',
  );
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  mockFeed = {
    ...mockFeed,
    taskDetailsAvailable: false,
    taskOptions: [],
    allocations: [],
    history: [],
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads retained contract draft',
  );
  expect(screen.getByRole('list', { name: 'Promised work' })).toHaveTextContent(
    '6',
  );
  expect(screen.getByText(/Contract quantities, period editing/)).toBeVisible();
  expect(screen.queryByText('Approved original video')).not.toBeInTheDocument();
  expect(user.router.state.location.pathname).toBe('/delivery');
});

it('purges private linking preparation and queued navigation on exact selected-task loss, then opens only a blank editor after recheck', async () => {
  const user = setup();
  await user.click(screen.getByText('Linked work you can access'));
  await user.click(screen.getByRole('button', { name: 'Link a task' }));
  await user.selectOptions(
    screen.getByLabelText('Task to link'),
    'variation-task',
  );
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Private assignment reason',
  );
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  mockSelectedTaskMissing = true;
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Reason for this change'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Link a task' })).toBeDisabled();
  expect(user.router.state.location.pathname).toBe('/delivery');
  mockSelectedTaskMissing = false;
  await user.click(screen.getByRole('button', { name: 'Check task access' }));
  await user.click(screen.getByRole('button', { name: 'Link a task' }));
  expect(screen.getByLabelText('Task to link')).toHaveValue('');
  expect(screen.getByLabelText('Reason for this change')).toHaveValue('');
});

it('keeps an exactly authorized selected task when it is absent from the search page, and purges it when its selected parent becomes unavailable', async () => {
  const user = setup();
  await user.click(screen.getByText('Linked work you can access'));
  await user.click(screen.getByRole('button', { name: 'Link a task' }));
  await user.selectOptions(
    screen.getByLabelText('Commitment item'),
    'variations',
  );
  await user.selectOptions(
    screen.getByLabelText('Task to link'),
    'variation-task',
  );
  await user.selectOptions(
    screen.getByLabelText('Original unique-video task'),
    'original-task',
  );
  const selected = mockFeed.taskOptions.find(
    (item) => item.taskId === 'variation-task',
  )!;
  mockFeed = {
    ...mockFeed,
    selectedTask: selected,
    taskOptions: mockFeed.taskOptions.filter(
      (item) => item.taskId !== selected.taskId,
    ),
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.getByLabelText('Task to link')).toHaveValue('variation-task');
  expect(screen.getByLabelText('Original unique-video task')).toHaveValue(
    'original-task',
  );
  mockSelectedParentMissing = true;
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.queryByLabelText('Task to link')).not.toBeInTheDocument();
  expect(
    screen.getByText(/Private task preparation was cleared/),
  ).toBeVisible();
});

it('purges contract drafts on confirmed contract loss but preserves them through network uncertainty', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(
    screen.getByLabelText('Promised item name'),
    ' private change',
  );
  mockError = new Error('Offline');
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.queryByRole('textbox', { name: 'Promised item name' }),
  ).not.toBeInTheDocument();
  mockError = undefined;
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads private change',
  );
  mockError = denied();
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.queryByLabelText('Promised item name')).not.toBeInTheDocument();
  mockError = undefined;
  await user.click(screen.getByRole('button', { name: 'Refresh commitments' }));
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads',
  );
});

it('discards a manager-only draft when the same member loses contract-edit authority', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(
    screen.getByLabelText('Promised item name'),
    ' former manager draft',
  );
  mockAccess = { ...mockAccess, capabilities: [] };
  mockFeed = { ...mockFeed, canManage: false };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.queryByLabelText('Promised item name')).not.toBeInTheDocument();
  mockAccess = { ...mockAccess, capabilities: ['delivery.manage'] };
  mockFeed = { ...mockFeed, canManage: true };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads',
  );
});

it('offers guarded first-page recovery when a stale policy cursor rejects the current read', async () => {
  const user = setup(
    false,
    false,
    '/delivery?clientEngagement=engagement&commitmentPeriod=period&commitmentHistoryBefore=old-policy',
  );
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(screen.getByLabelText('Promised item name'), ' unsaved');
  mockError = new CombinedGraphQLErrors({
    errors: [{ message: 'Policy changed', extensions: { code: 'CONFLICT' } }],
  });
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  await user.click(screen.getByRole('button', { name: 'Latest history' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(user.router.state.location.search).toContain('old-policy');
  await user.click(screen.getByRole('button', { name: 'Latest history' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(user.router.state.location.search).not.toContain(
    'commitmentHistoryBefore',
  );
});

it('keeps a redacted orphan confirmation through native-only loss but requires a fresh confirmation when the contract period changes', async () => {
  mockFeed.orphanAllocations = [
    {
      allocationId: 'redacted-allocation',
      periodId: 'period',
      lineId: 'originals',
      revision: 2,
      state: 'ASSIGNED',
      createdAt: '2026-10-01T08:00:00Z',
      updatedAt: '2026-10-01T08:00:00Z',
      canRemove: true,
      removalBlockReason: null,
    },
  ];
  const user = setup();
  await user.click(screen.getByText('Allocations with an unavailable source'));
  await user.click(
    screen.getByRole('button', { name: 'Release this allocation' }),
  );
  expect(
    screen.getByRole('heading', { name: 'Release one assigned work item?' }),
  ).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Confirm release' })).toBeEnabled();
  expect(screen.queryByText('redacted-allocation')).not.toBeInTheDocument();
  mockFeed = {
    ...mockFeed,
    taskDetailsAvailable: false,
    allocations: [],
    taskOptions: [],
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.getByRole('button', { name: 'Confirm release' })).toBeEnabled();
  mockFeed = {
    ...mockFeed,
    periods: mockFeed.periods.map((item) =>
      item.id === 'period' ? { ...item, revision: item.revision + 1 } : item,
    ),
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.getByRole('button', { name: 'Confirm release' }),
  ).toBeDisabled();
  expect(
    screen.getByText(/allocation changed or is no longer eligible/),
  ).toBeVisible();
  expect(mockMutate).not.toHaveBeenCalled();
});

it('fences a late successful assignment after native read loss and never restores the discarded private draft', async () => {
  let finish:
    | ((value: {
        data: { assignDeliveryCommitmentTask: CommitmentSnapshot };
      }) => void)
    | undefined;
  mockMutate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = setup();
  await user.click(screen.getByText('Linked work you can access'));
  await user.click(screen.getByRole('button', { name: 'Link a task' }));
  await user.selectOptions(
    screen.getByLabelText('Commitment item'),
    'originals',
  );
  await user.selectOptions(
    screen.getByLabelText('Task to link'),
    'variation-task',
  );
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Private late assignment',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save commitment change' }),
  );
  const earlier = mockFeed;
  mockFeed = {
    ...mockFeed,
    taskDetailsAvailable: false,
    allocations: [],
    taskOptions: [],
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.queryByLabelText('Reason for this change'),
  ).not.toBeInTheDocument();
  await act(async () =>
    finish?.({ data: { assignDeliveryCommitmentTask: earlier } }),
  );
  expect(user.router.state.location.search).toBe('');
  expect(screen.getByRole('button', { name: 'Link a task' })).toBeDisabled();
  expect(
    screen.queryByLabelText('Reason for this change'),
  ).not.toBeInTheDocument();
});

it('retains the canonical directory child and its hidden contract draft through a directory outage', async () => {
  const user = setup(
    false,
    false,
    '/delivery?clientEngagement=engagement&commitmentPeriod=period',
    true,
  );
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(
    screen.getByLabelText('Promised item name'),
    ' directory draft',
  );
  mockError = new Error('Directory offline');
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.queryByRole('textbox', { name: 'Promised item name' }),
  ).not.toBeInTheDocument();
  mockError = undefined;
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads directory draft',
  );
  mockError = denied();
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  mockError = undefined;
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.queryByLabelText('Promised item name')).not.toBeInTheDocument();
});

it('purges a manager draft immediately when verified management authority is lost during a simultaneous read outage', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(
    screen.getByLabelText('Promised item name'),
    ' revoked draft',
  );
  mockAccess = { ...mockAccess, capabilities: [] };
  mockError = new Error('Current snapshot offline');
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.queryByLabelText('Promised item name')).not.toBeInTheDocument();
  mockAccess = { ...mockAccess, capabilities: ['delivery.manage'] };
  mockError = undefined;
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads',
  );
});

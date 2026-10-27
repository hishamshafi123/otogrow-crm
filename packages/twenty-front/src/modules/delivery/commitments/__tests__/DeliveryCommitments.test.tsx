import { useState } from 'react';
import { Request } from 'cross-fetch';
import { type DocumentNode } from 'graphql';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryCommitments } from '@/delivery/commitments/DeliveryCommitments';
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
    options: { variables?: unknown; skip?: boolean },
  ) => {
    const operation = document.definitions.find(
      (item) => item.kind === 'OperationDefinition',
    );
    const name =
      operation?.kind === 'OperationDefinition' ? operation.name?.value : '';
    mockQueries(name, options);
    return {
      data: {
        deliveryCommitments: mockFeed,
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
}));
const initialFeed = (): CommitmentSnapshot => ({
  workspaceId: 'workspace',
  memberId: 'manager',
  userWorkspaceId: 'user-workspace',
  engagementId: 'engagement',
  engagementName: 'Brand retainer',
  projectId: 'project',
  canManage: true,
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
}: {
  staffClients?: boolean;
  managerClients?: boolean;
}) => {
  const [, refresh] = useState(0);
  return (
    <>
      <Link to="/other">Other view</Link>
      <button onClick={() => refresh((value) => value + 1)}>
        Refresh test data
      </button>
      {staffClients || managerClients ? (
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
const setup = (staffClients = false, managerClients = false) => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Harness
              staffClients={staffClients}
              managerClients={managerClients}
            />
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
  await user.click(screen.getByText('Linked tasks'));
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
  expect(screen.queryByText('New engagement')).not.toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText('Client engagement'),
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
  await user.click(screen.getByText('Linked tasks'));
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
  await user.click(screen.getByText('Linked tasks'));
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
  expect(mockQueries).toHaveBeenCalledWith(
    'DeliveryCommitmentEngagements',
    expect.objectContaining({ skip: true }),
  );
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
  const user = setup();
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
  await user.selectOptions(screen.getByLabelText('Engagement'), 'engagement');
  await user.click(screen.getByRole('button', { name: 'Edit Original ads' }));
  await user.type(screen.getByLabelText('Promised item name'), ' draft');
  await user.click(screen.getByRole('button', { name: 'Edit engagement' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Promised item name')).toHaveValue(
    'Original ads draft',
  );
  expect(screen.queryByLabelText('Engagement name')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Edit engagement' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Engagement name')).toHaveValue(
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
  await user.click(screen.getByText('Linked tasks'));
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

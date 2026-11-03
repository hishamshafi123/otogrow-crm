import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { NetworkStatus } from '@apollo/client';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryPlannerCapacity } from '@/delivery/capacity/read/DeliveryPlannerCapacity';
import {
  capacitySummaryFixture,
  capacityAssignmentsFixture,
} from '@/delivery/capacity/read/__tests__/capacity-read.fixtures';
import {
  taskContextFixture,
  MANAGER_ID,
  ASSIGNEE_ID,
  PROJECT_ID,
} from '@/delivery/tasks/__tests__/tasks.fixtures';
import { type DeliveryAvailabilityInput } from '~/generated-metadata/graphql';
let mockSummary = capacitySummaryFixture();
let mockAssignments = capacityAssignmentsFixture();
let mockContext = taskContextFixture();
let mockReadScope = 'current-directory-scope';
let mockReady = true;
let mockManager = true;
let mockError: Error | undefined;
let mockLoading = false;
let mockStatus = NetworkStatus.ready;
let mockMembership = 'membership';
let mockRefresh: () => void;
const mockQuery = jest.fn();
const mockRefetch = jest.fn();
const mockSave = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryBadge: 'span',
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    manager: mockManager,
    scope: `workspace:${mockMembership}`,
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
  useMutation: () => [mockSave],
  useQuery: (document: DocumentNode, options: unknown) => {
    const operation = document.definitions.find(
      (entry) => entry.kind === 'OperationDefinition',
    );
    const name =
      operation?.kind === 'OperationDefinition' ? operation.name?.value : '';
    mockQuery(name, options);
    const common = {
      loading: mockLoading,
      networkStatus: mockStatus,
      error: mockError,
      refetch: mockRefetch,
    };
    if (name === 'DeliveryCapacitySummary')
      return { ...common, data: { deliveryCapacitySummary: mockSummary } };
    if (name === 'DeliveryCapacityAssignments')
      return {
        ...common,
        data: { deliveryCapacityAssignments: mockAssignments },
      };
    throw new Error(`Unexpected legacy capacity/workspace query: ${name}`);
  },
}));
const setup = (extra = '') => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    return (
      <DeliveryPlannerCapacity
        context={mockContext}
        enabled={mockReady && mockManager}
        readScope={mockReadScope}
        businessDate="2026-10-29"
        timezone="Asia/Qatar"
      />
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
    ],
    {
      initialEntries: [
        `/delivery?view=planner&project=${PROJECT_ID}&search=keep&capacityFrom=2026-10-29${extra}`,
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return router;
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  jest.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockSummary = capacitySummaryFixture();
  mockAssignments = capacityAssignmentsFixture();
  mockContext = taskContextFixture();
  mockReadScope = 'current-directory-scope';
  mockReady = true;
  mockManager = true;
  mockError = undefined;
  mockLoading = false;
  mockStatus = NetworkStatus.ready;
  mockMembership = 'membership';
  mockRefetch.mockResolvedValue({});
  mockSave.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: DeliveryAvailabilityInput };
    }) => {
      const row = {
        memberId: input.memberId,
        date: input.date,
        minutes: input.minutes,
        revision: input.revision + 1,
      };
      mockSummary = {
        ...mockSummary,
        members: mockSummary.members.map((member) =>
          member.memberId !== input.memberId
            ? member
            : {
                ...member,
                days: member.days.map((day) =>
                  day.date !== input.date
                    ? day
                    : {
                        ...day,
                        availableMinutes: input.minutes ?? null,
                        availabilityInvalid: false,
                        availabilityRevision: row.revision,
                        overloadMinutes:
                          input.minutes == null
                            ? 0
                            : Math.max(0, day.workMinutes - input.minutes),
                      },
                ),
              },
        ),
      };
      return { data: { saveDeliveryAvailability: row } };
    },
  );
});
it('shows complete all-project totals, distinct zero/unknown/invalid availability and working-versus-waiting estimates', async () => {
  setup();
  const user = userEvent.setup();
  expect(screen.getByText('Teammates in this capacity view: 52')).toBeVisible();
  expect(screen.getByText(/Showing 1 teammates on this page/)).toBeVisible();
  expect(mockQuery).toHaveBeenCalledWith(
    'DeliveryCapacitySummary',
    expect.objectContaining({
      variables: {
        input: {
          startDate: '2026-10-29',
          timezone: 'Asia/Qatar',
          after: null,
          limit: 25,
        },
        identity: expect.any(String),
      },
    }),
  );
  await user.click(screen.getByText('Producer').closest('summary')!);
  const zero = screen.getByRole('region', { name: 'Producer · 2026-10-29' });
  expect(zero).toHaveTextContent('0 available min');
  expect(zero).toHaveTextContent('At least 120 estimated min');
  expect(zero).toHaveTextContent('Generation waiting 60 min');
  expect(zero).toHaveTextContent('Over capacity by at least 120 min.');
  expect(zero).toHaveTextContent('ineligible review reservations are retained');
  const unknown = screen.getByRole('region', { name: 'Producer · 2026-10-30' });
  expect(unknown).toHaveTextContent('Availability unknown');
  expect(unknown).not.toHaveTextContent('Saved availability is invalid');
  expect(
    screen.getByRole('region', { name: 'Producer · 2026-10-31' }),
  ).toHaveTextContent('Saved availability is invalid');
  expect(screen.getByText('Selected seven-day availability')).toBeVisible();
  expect(mockSave).not.toHaveBeenCalled();
});
it('keeps teammate and assignment pages URL-backed and distinguishes assignment rows from unique tasks', async () => {
  const router = setup(
    `&capacityAfter=member-page-two&capacityMember=${ASSIGNEE_ID}&capacityBucket=DAY&capacityDate=2026-10-29`,
  );
  const user = userEvent.setup();
  expect(screen.getByText('Assignments in this selection: 31')).toBeVisible();
  expect(screen.getByText('Showing 2 assignments on this page')).toBeVisible();
  expect(
    screen.queryByText('Teammates in this capacity view: 52'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Producer · 2026-10-29' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Next teammate page' }),
  ).not.toBeInTheDocument();
  const review = screen.getByRole('region', {
    name: 'Shared production and review task · Planned review',
  });
  expect(review).toHaveTextContent('Working estimate: Unknown');
  expect(review).toHaveTextContent('reservation is retained');
  const exact = within(review).getByRole('link', {
    name: 'Shared production and review task',
  });
  expect(
    new URL(exact.getAttribute('href')!, 'http://localhost').searchParams.get(
      'creativeSubmission',
    ),
  ).toBeNull();
  await user.click(screen.getByRole('link', { name: 'Next assignment page' }));
  expect(
    new URLSearchParams(router.state.location.search).get(
      'capacityAssignmentsAfter',
    ),
  ).toBe('next-assignment-page');
  expect(new URLSearchParams(router.state.location.search).get('search')).toBe(
    'keep',
  );
  await user.click(screen.getByRole('link', { name: 'Back to team workload' }));
  const restored = new URLSearchParams(router.state.location.search);
  expect(restored.get('plannerView')).toBe('capacity');
  expect(restored.get('capacityAfter')).toBe('member-page-two');
  expect(restored.get('capacityFrom')).toBe('2026-10-29');
  expect(restored.get('project')).toBe(PROJECT_ID);
  expect(restored.get('search')).toBe('keep');
  expect(restored.has('capacityBucket')).toBe(false);
  expect(restored.has('capacityMember')).toBe(false);
  expect(restored.has('capacityAssignmentsAfter')).toBe(false);
  expect(screen.getByText('Teammates in this capacity view: 52')).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'Capacity assignments' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Next teammate page' }));
  expect(
    new URLSearchParams(router.state.location.search).get('capacityAfter'),
  ).toBe('next-member-page');
  expect(new URLSearchParams(router.state.location.search).get('project')).toBe(
    PROJECT_ID,
  );
});
it('distinguishes an initial workload and assignment load from a failed verification', () => {
  mockLoading = true;
  mockStatus = NetworkStatus.loading;
  setup(
    `&capacityMember=${ASSIGNEE_ID}&capacityBucket=DAY&capacityDate=2026-10-29`,
  );
  expect(screen.getByText('Loading team workload…')).toBeVisible();
  expect(screen.getByText('Loading capacity assignments…')).toBeVisible();
  expect(screen.queryByText(/could not be verified/)).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Back to team workload' }),
  ).toBeVisible();
  mockLoading = false;
  mockStatus = NetworkStatus.error;
  mockError = new Error('Offline');
  act(mockRefresh);
  expect(
    screen.getByText(/These capacity assignments could not be verified/),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Retry capacity assignments' }),
  ).toBeEnabled();
});
it('opens a pending review with its exact submission while planned review reservations stay unpinned', () => {
  mockAssignments = {
    ...mockAssignments,
    items: [{ ...mockAssignments.items[1], state: 'IN_REVIEW' }],
  };
  setup(
    `&capacityMember=${ASSIGNEE_ID}&capacityBucket=DAY&capacityDate=2026-10-29`,
  );
  const review = screen.getByRole('region', {
    name: 'Shared production and review task · Review',
  });
  const destination = within(review).getByRole('link', {
    name: 'Shared production and review task',
  });
  expect(
    new URL(
      destination.getAttribute('href')!,
      'http://localhost',
    ).searchParams.get('creativeSubmission'),
  ).toBe('3');
});
it('exposes unavailable owners across open planning including later dated reservations without a primary fallback', () => {
  mockAssignments = {
    ...mockAssignments,
    selectedMemberId: null,
    bucket: 'UNAVAILABLE_OWNER',
    selectionScope: 'OPEN_PLANNING',
    date: null,
    items: [
      {
        ...mockAssignments.items[1],
        ownerId: null,
        ownerName: null,
        date: '2030-01-01',
        warnings: ['UNAVAILABLE_REVIEW_OWNER'],
      },
    ],
  };
  setup('&capacityMissingOwner=1&capacityBucket=UNAVAILABLE_OWNER');
  expect(
    screen.getByRole('heading', {
      name: 'Unavailable owners across open planning',
    }),
  ).toBeVisible();
  expect(
    screen.getByText(/including work outside this seven-day window/),
  ).toBeVisible();
  const row = screen.getByRole('region', {
    name: 'Shared production and review task · Planned review',
  });
  expect(row).toHaveTextContent('Unavailable owner');
  expect(row).toHaveTextContent('2030-01-01');
  expect(row).toHaveTextContent('no primary fallback');
});
it.each([NetworkStatus.poll, NetworkStatus.refetch])(
  'retains an expanded member disclosure during benign refresh %s and hides private figures on failure',
  async (status) => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByText('Producer').closest('summary')!);
    const disclosure = screen.getByText('Producer').closest('details')!;
    mockLoading = true;
    mockStatus = status;
    act(mockRefresh);
    expect(disclosure).toHaveAttribute('open');
    expect(
      screen.getByRole('region', { name: 'Producer · 2026-10-29' }),
    ).toBeVisible();
    mockError = new Error('Offline');
    act(mockRefresh);
    expect(
      screen.queryByText('Teammates in this capacity view: 52'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Producer · 2026-10-29' }),
    ).not.toBeInTheDocument();
  },
);
it('keeps an availability draft hidden during source failure, retries safely, and restores exact fields without writing', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByText('Producer').closest('summary')!);
  await user.click(
    screen.getByRole('button', {
      name: 'Set availability for Producer on 2026-10-29',
    }),
  );
  const minutes = screen.getByRole('spinbutton', {
    name: 'Available working minutes',
  });
  await user.clear(minutes);
  await user.type(minutes, '240');
  mockError = new Error('Offline');
  act(mockRefresh);
  expect(minutes).not.toBeVisible();
  expect(minutes).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Retry capacity' }));
  expect(mockSave).not.toHaveBeenCalled();
  mockError = undefined;
  act(mockRefresh);
  expect(
    screen.getByRole('spinbutton', { name: 'Available working minutes' }),
  ).toBe(minutes);
  expect(minutes).toHaveValue(240);
  expect(minutes).toBeVisible();
});
it('retains a same-identity availability draft through directory and project scope refresh while hiding unverified evidence', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByText('Producer').closest('summary')!);
  await user.click(
    screen.getByRole('button', {
      name: 'Set availability for Producer on 2026-10-29',
    }),
  );
  const minutes = screen.getByRole('spinbutton', {
    name: 'Available working minutes',
  });
  await user.clear(minutes);
  await user.type(minutes, '480');
  mockReadScope = 'new-project-revision';
  mockContext = {
    ...mockContext,
    members: mockContext.members.map((member) => ({
      ...member,
      name: `${member.name} updated`,
    })),
    projects: mockContext.projects.map((project) => ({
      ...project,
      companyId: project.companyId ?? null,
      revision: project.revision + 1,
    })),
  };
  mockLoading = true;
  mockStatus = NetworkStatus.setVariables;
  act(mockRefresh);
  expect(minutes).not.toBeVisible();
  expect(minutes).toBeDisabled();
  expect(
    screen.queryByText('Teammates in this capacity view: 52'),
  ).not.toBeInTheDocument();
  mockLoading = false;
  mockStatus = NetworkStatus.ready;
  act(mockRefresh);
  expect(
    screen.getByRole('spinbutton', { name: 'Available working minutes' }),
  ).toBe(minutes);
  expect(minutes).toHaveValue(480);
  expect(minutes).toBeVisible();
  mockManager = false;
  act(mockRefresh);
  expect(minutes).not.toBeVisible();
  expect(minutes).toBeDisabled();
  mockManager = true;
  act(mockRefresh);
  expect(minutes).toHaveValue(480);
  expect(minutes).toBeVisible();
  expect(mockSave).not.toHaveBeenCalled();
});
it('disposes an availability draft on a real membership identity change', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByText('Producer').closest('summary')!);
  await user.click(
    screen.getByRole('button', {
      name: 'Set availability for Producer on 2026-10-29',
    }),
  );
  await user.type(
    screen.getByRole('spinbutton', { name: 'Available working minutes' }),
    '480',
  );
  mockMembership = 'new-membership';
  mockContext = { ...mockContext, userWorkspaceId: mockMembership };
  mockSummary = { ...mockSummary, userWorkspaceId: mockMembership };
  act(mockRefresh);
  expect(
    screen.queryByRole('spinbutton', { name: 'Available working minutes' }),
  ).not.toBeInTheDocument();
  expect(mockSave).not.toHaveBeenCalled();
});
it('preserves availability revision conflicts, then explicitly reloads and saves blank as unknown instead of zero', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByText('Producer').closest('summary')!);
  await user.click(
    screen.getByRole('button', {
      name: 'Set availability for Producer on 2026-10-29',
    }),
  );
  const minutes = screen.getByRole('spinbutton', {
    name: 'Available working minutes',
  });
  await user.clear(minutes);
  await user.type(minutes, '120');
  mockSummary = {
    ...mockSummary,
    members: mockSummary.members.map((member) => ({
      ...member,
      days: member.days.map((day) =>
        day.date === '2026-10-29'
          ? { ...day, availableMinutes: 30, availabilityRevision: 2 }
          : day,
      ),
    })),
  };
  act(mockRefresh);
  expect(
    screen.getByRole('button', { name: 'Save availability' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload latest availability' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(minutes).toHaveValue(120);
  await user.click(
    screen.getByRole('button', { name: 'Reload latest availability' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(minutes).toHaveValue(30);
  await user.clear(minutes);
  await user.click(screen.getByRole('button', { name: 'Save availability' }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({
      variables: {
        input: {
          memberId: ASSIGNEE_ID,
          date: '2026-10-29',
          minutes: null,
          revision: 2,
        },
      },
    }),
  );
  expect(mockRefetch).toHaveBeenCalled();
});
it.each(['manager', 'identity'] as const)(
  'hides retained planning figures after current %s revocation',
  (condition) => {
    setup();
    if (condition === 'manager') mockManager = false;
    else mockMembership = 'new-membership';
    act(mockRefresh);
    expect(
      screen.queryByText('Teammates in this capacity view: 52'),
    ).not.toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  },
);
it('repairs the explicitly invalid day using its stored revision and preserves an intentional zero', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByText('Producer').closest('summary')!);
  await user.click(
    screen.getByRole('button', {
      name: 'Set availability for Producer on 2026-10-31',
    }),
  );
  const minutes = screen.getByRole('spinbutton', {
    name: 'Available working minutes',
  });
  expect(minutes).toHaveValue(null);
  await user.type(minutes, '0');
  await user.click(screen.getByRole('button', { name: 'Save availability' }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({
      variables: {
        input: {
          memberId: ASSIGNEE_ID,
          date: '2026-10-31',
          minutes: 0,
          revision: 5,
        },
      },
    }),
  );
});

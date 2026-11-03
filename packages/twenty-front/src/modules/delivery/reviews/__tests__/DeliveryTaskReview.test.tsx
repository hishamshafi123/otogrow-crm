import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { NetworkStatus } from '@apollo/client';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Request } from 'cross-fetch';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryTaskReview } from '@/delivery/reviews/DeliveryTaskReview';
import { DeliveryTaskJourney } from '@/delivery/lifecycle/DeliveryTaskJourney';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';
import { useTaskReview } from '@/delivery/reviews/useTaskReview';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type TaskReviewSnapshot } from '@/delivery/reviews/review.types';
import {
  REVIEW_TASK_ID,
  NEXT_REVIEW_TASK_ID,
  PRIMARY_REVIEWER_ID,
  BACKUP_REVIEWER_ID,
  taskReviewFixture,
} from '@/delivery/reviews/__tests__/reviews.fixtures';
let mockSnapshot: TaskReviewSnapshot;
let mockError: Error | undefined;
let mockLoading = false;
let mockNetworkStatus = NetworkStatus.ready;
let mockReady = true;
let mockManager = true;
let mockReviewCapability = true;
let mockMembership = 'membership';
let mockSelectedTaskId = REVIEW_TASK_ID;
let mockRefresh: () => void;
const mockAssign = jest.fn();
const mockRefetch = jest.fn();
const mockSummariesChanged = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCard: 'section',
  StyledDeliveryStack: 'div',
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
}));
jest.mock('@/delivery/reviews/reviewStyles', () => ({
  StyledAssignmentBoundary: 'fieldset',
  StyledReviewQueueItem: 'article',
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    manager: mockManager,
    scope: `workspace:member:${mockMembership}`,
    access: { capabilities: mockReviewCapability ? ['delivery.review'] : [] },
    matches: (
      data?: {
        workspaceId: string;
        memberId: string;
        userWorkspaceId: string;
      } | null,
    ) =>
      mockReady &&
      data?.workspaceId === 'workspace' &&
      data.memberId === 'member' &&
      data.userWorkspaceId === mockMembership,
    refetch: mockRefetch,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockAssign],
  useQuery: (document: DocumentNode) =>
    document.definitions.some(
      (definition) =>
        definition.kind === 'OperationDefinition' &&
        definition.name?.value === 'DeliveryReviewAssignmentHistory',
    )
      ? {
          data: {
            deliveryReviewAssignmentHistory: {
              workspaceId: 'workspace',
              memberId: 'member',
              userWorkspaceId: 'membership',
              taskId: REVIEW_TASK_ID,
              submissionVersion: 3,
              events: [],
              nextBeforeId: null,
            },
          },
          loading: false,
          refetch: mockRefetch,
        }
      : {
          data: { deliveryTaskReview: mockSnapshot },
          error: mockError,
          loading: mockLoading,
          networkStatus: mockNetworkStatus,
          refetch: mockRefetch,
        },
}));
const setup = (withJourney = false) => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((version) => version + 1);
    const controller = useTaskReview({
      taskId: mockSelectedTaskId,
      taskRevision: 4,
      onChanged: mockSummariesChanged,
    });
    return (
      <>
        <p>
          {controller.data?.canApprove
            ? 'Current approval authority'
            : 'Approval unavailable'}
        </p>
        <DeliveryTaskReview controller={controller} submissionVersion={3} />
        {withJourney && (
          <DeliveryTaskJourney
            task={journeyTask}
            workspace={journeyWorkspace}
            review={controller.data}
            onOpenPanel={jest.fn()}
          />
        )}
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
    ],
    { initialEntries: ['/delivery?view=reviews'] },
  );
  render(<RouterProvider router={router} />);
  return { refresh: () => act(() => mockRefresh()) };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  jest.clearAllMocks();
  mockSnapshot = taskReviewFixture();
  mockError = undefined;
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  mockReady = true;
  mockManager = true;
  mockReviewCapability = true;
  mockMembership = 'membership';
  mockSelectedTaskId = REVIEW_TASK_ID;
  mockSummariesChanged.mockResolvedValue(undefined);
  mockRefetch.mockImplementation(async () => ({
    data: { deliveryTaskReview: mockSnapshot },
  }));
  mockAssign.mockResolvedValue({
    data: {
      assignDeliveryReview: {
        taskReview: taskReviewFixture(),
        assignment: taskReviewFixture().assignment,
        replayed: false,
      },
    },
  });
});
const journeyTask: DeliveryTask = {
  id: REVIEW_TASK_ID,
  title: 'Oldest product edit',
  projectId: 'project',
  assigneeId: 'producer',
  revision: 4,
  dueAt: null,
  review: {
    submissionVersion: 3,
    effectiveReviewerId: 'member',
    primaryReviewerId: PRIMARY_REVIEWER_ID,
    assignmentRevision: 0,
    assignmentMode: 'PRIMARY',
    reviewerState: 'ACTIVE',
  },
  details: {
    brief: '',
    service: 'Video',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: PRIMARY_REVIEWER_ID,
    state: 'IN_REVIEW',
    blocker: '',
    checklist: [],
    evidence: [],
    events: [],
    submissions: [
      {
        version: 3,
        submittedBy: 'producer',
        submittedAt: '2026-10-28T08:00:00Z',
        description: 'Exact submitted cut',
        evidence: [],
      },
    ],
  },
};
const journeyWorkspace: DeliveryWorkspace = {
  actor: { memberId: 'member', isManager: true, isAdmin: false },
  tasks: [journeyTask],
  projects: [],
  companies: [],
  members: [
    {
      id: 'member',
      name: 'Original reviewer',
      access: 'MEMBER',
      roleLabel: '',
    },
    { id: PRIMARY_REVIEWER_ID, name: 'Amna', access: 'MEMBER', roleLabel: '' },
    {
      id: BACKUP_REVIEWER_ID,
      name: 'Scoped reviewer',
      access: 'MEMBER',
      roleLabel: '',
    },
  ],
};
it('updates the journey owner from the verified assignment result immediately while workspace and refetched data still name the prior owner', async () => {
  mockSnapshot.assignment = null;
  mockSnapshot.pending = {
    ...mockSnapshot.pending!,
    effectiveReviewerId: 'member',
    effectiveReviewerName: 'Original reviewer',
    assignmentMode: 'PRIMARY',
    assignmentRevision: 0,
  };
  const saved = taskReviewFixture();
  saved.canApprove = false;
  saved.canReviewSubmission = false;
  saved.pending!.canReviewSubmission = false;
  mockAssign.mockResolvedValue({
    data: {
      assignDeliveryReview: {
        assignment: saved.assignment,
        taskReview: saved,
        replayed: false,
      },
    },
  });
  const view = setup(true);
  const journey = () =>
    within(screen.getByRole('region', { name: 'Deliverable journey' }));
  expect(journey().getByText('Original reviewer')).toBeVisible();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', {
      name: 'Choose or change submission reviewer',
    }),
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Review assignment' }),
    'BACKUP',
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Eligible submission backup' }),
    BACKUP_REVIEWER_ID,
  );
  await user.type(
    screen.getByLabelText('Reason for reviewer assignment'),
    'Cover the current submitted work',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save submission reviewer' }),
  );
  expect(await journey().findByText('Scoped reviewer')).toBeVisible();
  expect(journey().queryByText('Original reviewer')).not.toBeInTheDocument();
  expect(
    journey().getByRole('button', { name: 'View submission' }),
  ).toBeVisible();
  expect(mockSummariesChanged).toHaveBeenCalledTimes(1);
  expect(journeyTask.review?.effectiveReviewerId).toBe('member');
  mockError = new Error('Review source offline');
  view.refresh();
  expect(journey().getByText('Review owner unverified')).toBeVisible();
  expect(journey().queryByText('Scoped reviewer')).not.toBeInTheDocument();
  expect(journey().queryByText('Original reviewer')).not.toBeInTheDocument();
});
it('separates effective review responsibility from primary delivery ownership', () => {
  setup();
  expect(screen.getByText('Scoped reviewer')).toBeInTheDocument();
  expect(
    screen.getByText('Primary manager for client delivery: Amna'),
  ).toBeInTheDocument();
});
it('does not carry a task assignment success or read error into another exact submission', async () => {
  const saved = taskReviewFixture();
  saved.assignment!.revision = 3;
  saved.pending!.assignmentRevision = 3;
  mockAssign.mockResolvedValue({
    data: {
      assignDeliveryReview: {
        assignment: saved.assignment,
        taskReview: saved,
        replayed: false,
      },
    },
  });
  const view = setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', {
      name: 'Choose or change submission reviewer',
    }),
  );
  await user.type(
    screen.getByLabelText('Reason for reviewer assignment'),
    'Document this cover assignment',
  );
  await user.click(
    screen.getByRole('button', { name: 'Save submission reviewer' }),
  );
  expect(
    await screen.findByText(
      'Submission review assignment saved. The primary delivery manager is unchanged.',
    ),
  ).toBeVisible();
  mockError = new Error('Offline');
  mockRefetch.mockRejectedValueOnce(new Error('Offline'));
  view.refresh();
  await user.click(
    screen.getByRole('button', { name: 'Retry submission review access' }),
  );
  expect(
    await screen.findByText(
      'Current review access could not refresh. Previous evidence is hidden and your draft is kept.',
    ),
  ).toBeVisible();
  mockSelectedTaskId = NEXT_REVIEW_TASK_ID;
  mockError = undefined;
  mockSnapshot = {
    ...taskReviewFixture(),
    taskId: NEXT_REVIEW_TASK_ID,
    pending: {
      ...taskReviewFixture().pending!,
      taskId: NEXT_REVIEW_TASK_ID,
      submissionVersion: 1,
      effectiveReviewerName: 'Next submission reviewer',
    },
    assignment: {
      ...taskReviewFixture().assignment!,
      taskId: NEXT_REVIEW_TASK_ID,
      submissionVersion: 1,
    },
  };
  view.refresh();
  expect(screen.getByText('Next submission reviewer')).toBeVisible();
  expect(
    screen.queryByText(
      'Submission review assignment saved. The primary delivery manager is unchanged.',
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      'Current review access could not refresh. Previous evidence is hidden and your draft is kept.',
    ),
  ).not.toBeInTheDocument();
  expect(mockAssign).toHaveBeenCalledTimes(1);
});
it('keeps an assignment reason hidden through failed access/source checks and restores it without writing', async () => {
  const view = setup();
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Choose or change submission reviewer',
    }),
  );
  await userEvent.type(
    screen.getByLabelText('Reason for reviewer assignment'),
    'Keep the cover plan',
  );
  const reason = screen.getByLabelText('Reason for reviewer assignment');
  mockError = new Error('offline');
  view.refresh();
  expect(reason).not.toBeVisible();
  expect(reason).toBeDisabled();
  expect(
    screen.queryByText('Submission 3 review owner'),
  ).not.toBeInTheDocument();
  mockError = undefined;
  mockReady = false;
  view.refresh();
  expect(reason).not.toBeVisible();
  mockReady = true;
  view.refresh();
  expect(screen.getByLabelText('Reason for reviewer assignment')).toBe(reason);
  expect(reason).toHaveValue('Keep the cover plan');
  expect(reason).toBeVisible();
  expect(mockAssign).not.toHaveBeenCalled();
});
it('allows scoped server review authority without management and removes it immediately on current capability loss', () => {
  mockManager = false;
  const view = setup();
  expect(screen.getByText('Current approval authority')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', {
      name: 'Choose or change submission reviewer',
    }),
  ).not.toBeInTheDocument();
  mockReviewCapability = false;
  view.refresh();
  expect(screen.getByText('Approval unavailable')).toBeInTheDocument();
});
it.each([NetworkStatus.poll, NetworkStatus.refetch])(
  'masks retained review and assignment authority during refresh status %s after current role loss',
  async (networkStatus) => {
    const view = setup();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Choose or change submission reviewer',
      }),
    );
    await userEvent.type(
      screen.getByLabelText('Reason for reviewer assignment'),
      'Retained cover reason',
    );
    mockLoading = true;
    mockNetworkStatus = networkStatus;
    mockManager = false;
    mockReviewCapability = false;
    view.refresh();
    expect(screen.getByText('Approval unavailable')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Choose or change submission reviewer',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Reason for reviewer assignment')).toHaveValue(
      'Retained cover reason',
    );
    expect(
      screen.getByRole('button', { name: 'Save submission reviewer' }),
    ).toBeDisabled();
    expect(mockAssign).not.toHaveBeenCalled();
  },
);
it('does not restore an explicit unavailable backup to the primary manager silently', () => {
  mockSnapshot.pending = {
    ...mockSnapshot.pending!,
    reviewerState: 'UNAVAILABLE',
    effectiveReviewerName: 'Former backup',
    canReviewSubmission: false,
  };
  setup();
  expect(
    screen.getByText(/does not silently return to the primary manager/),
  ).toBeInTheDocument();
  expect(screen.getByText('Former backup')).toBeInTheDocument();
});
it('hides review authority and history after a membership identity mismatch', () => {
  const view = setup();
  mockMembership = 'new-membership';
  view.refresh();
  expect(screen.getByText('Approval unavailable')).toBeInTheDocument();
  expect(
    screen.queryByText('Submission 3 review owner'),
  ).not.toBeInTheDocument();
});

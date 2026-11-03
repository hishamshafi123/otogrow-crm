import { useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Request } from 'cross-fetch';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryReviewQueue } from '@/delivery/reviews/DeliveryReviewQueue';
import { type ReviewQueueSnapshot } from '@/delivery/reviews/review.types';
import {
  NEXT_REVIEW_TASK_ID,
  REVIEW_PROJECT_ID,
  REVIEW_TASK_ID,
  reviewItemFixture,
  reviewQueueFixture,
} from '@/delivery/reviews/__tests__/reviews.fixtures';
let mockSnapshot: ReviewQueueSnapshot;
let mockReady = true;
let mockAllowed = true;
let mockError: Error | undefined;
let mockEnabled = true;
let mockReadScope = 'verified-context-v1';
let mockLoading = false;
let mockMobile = false;
let mockNetworkStatus = NetworkStatus.ready;
let mockRefresh: () => void;
const mockRefetch = jest.fn();
const mockQuery = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCard: 'section',
  StyledDeliveryStack: 'div',
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
}));
jest.mock('@/delivery/reviews/reviewStyles', () => ({
  StyledReviewQueueItem: 'article',
  StyledReviewQueueStack: 'div',
  StyledReviewQueueCard: 'section',
  StyledReviewQueueHeading: 'div',
}));
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => mockMobile,
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    denied: false,
    scope: 'workspace:member',
    access: { capabilities: mockAllowed ? ['delivery.review'] : [] },
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
      data.userWorkspaceId === 'membership',
    refetch: mockRefetch,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => {
    mockQuery(...args);
    return {
      data: { deliveryReviewQueue: mockSnapshot },
      loading: mockLoading,
      networkStatus: mockNetworkStatus,
      error: mockError,
      refetch: mockRefetch,
    };
  },
}));
const setup = (extra = '') => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((version) => version + 1);
    return (
      <DeliveryReviewQueue enabled={mockEnabled} readScope={mockReadScope} />
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
    { initialEntries: [`/delivery?view=reviews&search=retained${extra}`] },
  );
  render(<RouterProvider router={router} />);
  return { router, refresh: () => act(() => mockRefresh()) };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  jest.clearAllMocks();
  mockSnapshot = reviewQueueFixture();
  mockReady = true;
  mockAllowed = true;
  mockError = undefined;
  mockEnabled = true;
  mockReadScope = 'verified-context-v1';
  mockLoading = false;
  mockMobile = false;
  mockNetworkStatus = NetworkStatus.ready;
  mockRefetch.mockResolvedValue({});
});
it('keeps the queue counts and work visible without an empty selection panel or expanded explanation', async () => {
  setup();
  expect(screen.getByText('Pending in this selection: 54')).toBeVisible();
  expect(screen.getByText(/Unknown or future waiting time: 2/)).toBeVisible();
  expect(
    screen.getByRole('article', { name: 'Oldest product edit' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'Selected reviews' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Start selected reviews' }),
  ).not.toBeInTheDocument();
  const explanation = screen.getByText('About approvals').closest('details');
  expect(explanation).not.toHaveAttribute('open');
  expect(screen.getByText(/Checked at:/)).not.toBeVisible();
  await userEvent.click(screen.getByText('About approvals'));
  expect(screen.getByText(/Checked at:/)).toBeVisible();
});
it('collapses mobile filters with their active count while recovery and current work remain reachable', async () => {
  mockMobile = true;
  const { router } = setup(
    `&reviewProject=${REVIEW_PROJECT_ID}&reviewsMine=1&reviewsAfter=current-page`,
  );
  const filterSummary = screen.getByText(/Filter approvals/);
  expect(filterSummary).toHaveTextContent('2 active');
  expect(filterSummary.closest('details')).not.toHaveAttribute('open');
  expect(
    screen.getByRole('combobox', { name: 'Approval client / project' }),
  ).not.toBeVisible();
  expect(
    screen.getByRole('combobox', { name: 'Submission reviewer' }),
  ).not.toBeVisible();
  expect(
    screen.getByRole('link', { name: 'First approval page' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Clear approval filters' }),
  ).toBeVisible();
  expect(screen.getByText('Pending in this selection: 54')).toBeVisible();
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Select Oldest product edit submission 3',
    }),
  );
  expect(
    screen.getByRole('region', { name: 'Selected reviews' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Start selected reviews' }),
  ).toBeVisible();
  await userEvent.click(screen.getByText(/Filter approvals/));
  expect(
    screen.getByRole('combobox', { name: 'Approval client / project' }),
  ).toBeVisible();
  expect(
    new URLSearchParams(router.state.location.search).get('reviewsSelected'),
  ).toBe(`${REVIEW_TASK_ID}:3`);
});
it('keeps invalid-page recovery outside collapsed mobile disclosures and preserves pinned review context', async () => {
  mockMobile = true;
  mockError = new Error('The approval page changed');
  const selected = `${REVIEW_TASK_ID}:3`;
  const { router } = setup(
    `&reviewsAfter=stale&reviewProject=${REVIEW_PROJECT_ID}&reviewsSelected=${selected}&task=${REVIEW_TASK_ID}&creativeSubmission=3`,
  );
  expect(screen.getByRole('alert')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Clear approval filters' }),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole('link', { name: 'First approval page' }),
  );
  const params = new URLSearchParams(router.state.location.search);
  expect(params.has('reviewsAfter')).toBe(false);
  expect(params.get('reviewProject')).toBe(REVIEW_PROJECT_ID);
  expect(params.get('reviewsSelected')).toBe(selected);
  expect(params.get('task')).toBe(REVIEW_TASK_ID);
  expect(params.get('creativeSubmission')).toBe('3');
});
it('keeps unavailable selected project and reviewer filters explicit until a deliberate reset', async () => {
  mockSnapshot = { ...mockSnapshot, totalCount: 0, items: [] };
  const { router } = setup(
    `&reviewProject=${REVIEW_TASK_ID}&reviewReviewer=${NEXT_REVIEW_TASK_ID}`,
  );
  const project = screen.getByRole('combobox', {
    name: 'Approval client / project',
  });
  const reviewer = screen.getByRole('combobox', {
    name: 'Submission reviewer',
  });
  expect(project).toHaveDisplayValue('Selected project unavailable');
  expect(reviewer).toHaveDisplayValue('Selected reviewer unavailable');
  expect(project).toHaveValue(REVIEW_TASK_ID);
  expect(reviewer).toHaveValue(NEXT_REVIEW_TASK_ID);
  const user = userEvent.setup();
  await user.selectOptions(project, '');
  expect(
    new URLSearchParams(router.state.location.search).has('reviewProject'),
  ).toBe(false);
  const currentReviewer = screen.getByRole('combobox', {
    name: 'Submission reviewer',
  });
  expect(currentReviewer).toHaveValue(NEXT_REVIEW_TASK_ID);
  expect(currentReviewer).toHaveDisplayValue('Selected reviewer unavailable');
  await user.selectOptions(currentReviewer, '');
  const params = new URLSearchParams(router.state.location.search);
  expect(params.has('reviewProject')).toBe(false);
  expect(params.has('reviewReviewer')).toBe(false);
  expect(params.get('search')).toBe('retained');
});
it('hides old queue evidence until a changed current project scope has been freshly verified', () => {
  const view = setup();
  expect(
    screen.getByRole('article', { name: 'Oldest product edit' }),
  ).toBeVisible();
  mockReadScope = 'verified-context-new-project-membership';
  mockLoading = true;
  mockNetworkStatus = NetworkStatus.setVariables;
  view.refresh();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.queryByText('Pending in this selection: 54'),
  ).not.toBeInTheDocument();
  expect(mockQuery).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      variables: expect.objectContaining({ identity: mockReadScope }),
    }),
  );
  mockSnapshot = { ...mockSnapshot, totalCount: 0, items: [], projects: [] };
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  view.refresh();
  expect(screen.getByText('Pending in this selection: 0')).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});
it('does not request or reveal the queue while its current context boundary is unavailable', () => {
  const view = setup();
  mockEnabled = false;
  view.refresh();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(mockQuery).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ skip: true }),
  );
});
it('offers guarded first-page recovery for an invalidated cursor without clearing exact selection or filters', async () => {
  mockError = new Error('This approval page changed');
  const selected = `${REVIEW_TASK_ID}:3`;
  const { router, refresh } = setup(
    `&reviewsAfter=stale-page&reviewProject=${REVIEW_PROJECT_ID}&reviewsSelected=${selected}&task=${REVIEW_TASK_ID}&creativeSubmission=3&reviewBatch=${selected}&reviewBatchIndex=0`,
  );
  const user = userEvent.setup();
  expect(screen.getByText(/This page may have changed/)).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'First approval page' }));
  const params = new URLSearchParams(router.state.location.search);
  expect(params.has('reviewsAfter')).toBe(false);
  expect(params.get('reviewProject')).toBe(REVIEW_PROJECT_ID);
  expect(params.get('reviewsSelected')).toBe(selected);
  expect(params.get('task')).toBe(REVIEW_TASK_ID);
  expect(params.get('creativeSubmission')).toBe('3');
  expect(params.get('reviewBatch')).toBe(selected);
  expect(params.get('search')).toBe('retained');
  mockError = undefined;
  refresh();
  expect(screen.getByText('Pending in this selection: 54')).toBeVisible();
});
it('shows complete counts before the page and factual oldest-first waiting time without granting planning', () => {
  setup();
  expect(screen.getByText('Pending in this selection: 54')).toBeInTheDocument();
  expect(
    screen.getByText(/Unknown or future waiting time: 2/),
  ).toBeInTheDocument();
  expect(
    screen
      .getAllByRole('article')
      .map((item) => item.getAttribute('aria-label')),
  ).toEqual(['Oldest product edit', 'Newer image']);
  expect(screen.getByText('Waiting 1 day')).toBeInTheDocument();
  expect(
    screen.getAllByRole('link', { name: 'Review exact submission' })[0],
  ).toHaveAttribute('href', expect.stringContaining('creativeSubmission=3'));
  expect(
    screen.queryByRole('button', { name: /Approve/ }),
  ).not.toBeInTheDocument();
});
it('keeps unknown/future time and malformed source requirements explicit', () => {
  mockSnapshot.items = [
    {
      ...reviewItemFixture(),
      ageState: 'UNKNOWN',
      ageSeconds: null,
      submittedAt: null,
      submissionVersion: null,
      requiredCheckCount: null,
      canReviewSubmission: false,
    },
    {
      ...reviewItemFixture(),
      taskId: NEXT_REVIEW_TASK_ID,
      title: 'Future date',
      ageState: 'FUTURE',
      ageSeconds: null,
      submittedAt: '2099-01-01T00:00:00Z',
    },
  ];
  setup();
  expect(screen.getByText('Waiting time unknown')).toBeInTheDocument();
  expect(
    screen.getByText('Submitted time is in the future'),
  ).toBeInTheDocument();
  const invalid = screen.getByRole('article', { name: 'Oldest product edit' });
  expect(invalid).toHaveTextContent('Submission identity unavailable');
  expect(invalid).toHaveTextContent('Review requirements unavailable');
  expect(invalid).toHaveTextContent('Submitted time unknown');
  expect(
    screen.getByRole('article', { name: 'Future date' }),
  ).toHaveTextContent('Recorded future submitted time');
  expect(within(invalid).queryByRole('checkbox')).not.toBeInTheDocument();
});
it('labels the exact submitted instant in UTC consistently with the checked-at timestamp', () => {
  mockSnapshot.items = [
    { ...reviewItemFixture(), submittedAt: '2026-10-28T16:00:00+08:00' },
  ];
  setup();
  const submitted = new Date('2026-10-28T08:00:00Z').toLocaleString(undefined, {
    timeZone: 'UTC',
  });
  expect(
    screen.getByRole('article', { name: 'Oldest product edit' }),
  ).toHaveTextContent(`Submitted: ${submitted} UTC`);
  expect(screen.getByText(/Checked at:/)).toHaveTextContent('UTC');
});
it('persists filters and explicit exact selections through paging, with no blanket approval', async () => {
  const { router } = setup();
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Select Oldest product edit submission 3',
    }),
  );
  expect(
    new URLSearchParams(router.state.location.search).get('reviewsSelected'),
  ).toBe(`${REVIEW_TASK_ID}:3`);
  await userEvent.click(
    screen.getByRole('link', { name: 'More pending submissions' }),
  );
  expect(
    screen.getByRole('checkbox', {
      name: 'Select Oldest product edit submission 3',
    }),
  ).toBeChecked();
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Select Newer image submission 1' }),
  );
  await userEvent.click(
    screen.getByRole('link', { name: 'Start selected reviews' }),
  );
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('reviewBatch')).toBe(
    `${REVIEW_TASK_ID}:3,${NEXT_REVIEW_TASK_ID}:1`,
  );
  expect(params.get('task')).toBe(REVIEW_TASK_ID);
  expect(params.get('creativeSubmission')).toBe('3');
  expect(params.get('search')).toBe('retained');
});
it('changes URL-backed project filters and clears the old selection explicitly', async () => {
  const { router } = setup();
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Select Oldest product edit submission 3',
    }),
  );
  await userEvent.selectOptions(
    screen.getByLabelText('Approval client / project', { exact: true }),
    REVIEW_PROJECT_ID,
  );
  expect(router.state.location.search).toContain(
    `reviewProject=${REVIEW_PROJECT_ID}`,
  );
  expect(
    new URLSearchParams(router.state.location.search).has('reviewsSelected'),
  ).toBe(false);
  expect(
    screen.queryByRole('region', { name: 'Selected reviews' }),
  ).not.toBeInTheDocument();
});
it('uses URL selection as the single source of truth through Back and Forward before starting a batch', async () => {
  const { router } = setup();
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'Select Oldest product edit submission 3',
    }),
  );
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Select Newer image submission 1' }),
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByText('Selected 1 submissions')).toBeInTheDocument();
  expect(
    screen.getByRole('checkbox', { name: 'Select Newer image submission 1' }),
  ).not.toBeChecked();
  await act(async () => {
    await router.navigate(1);
  });
  expect(screen.getByText('Selected 2 submissions')).toBeInTheDocument();
  expect(
    screen.getByRole('checkbox', { name: 'Select Newer image submission 1' }),
  ).toBeChecked();
  await act(async () => {
    await router.navigate(-1);
  });
  await userEvent.click(
    screen.getByRole('link', { name: 'Start selected reviews' }),
  );
  expect(
    new URLSearchParams(router.state.location.search).get('reviewBatch'),
  ).toBe(`${REVIEW_TASK_ID}:3`);
});
it.each(['error', 'access', 'identity', 'role'])(
  'hides saved queue evidence after %s loss and allows current recovery',
  (cause) => {
    const view = setup();
    if (cause === 'error') mockError = new Error('offline');
    if (cause === 'access') mockReady = false;
    if (cause === 'identity') mockSnapshot.userWorkspaceId = 'foreign';
    if (cause === 'role') mockAllowed = false;
    view.refresh();
    expect(
      screen.queryByRole('article', { name: 'Oldest product edit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Pending in this selection: 54'),
    ).not.toBeInTheDocument();
  },
);

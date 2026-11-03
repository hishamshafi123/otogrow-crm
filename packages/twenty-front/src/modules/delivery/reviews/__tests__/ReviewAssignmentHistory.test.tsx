import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type DeliveryReviewAssignmentHistoryQuery } from '~/generated-metadata/graphql';
import { ReviewAssignmentHistory } from '@/delivery/reviews/ReviewAssignmentHistory';
import {
  BACKUP_REVIEWER_ID,
  NEXT_REVIEW_TASK_ID,
  PRIMARY_REVIEWER_ID,
  REVIEW_PROJECT_ID,
  REVIEW_TASK_ID,
} from '@/delivery/reviews/__tests__/reviews.fixtures';

type ReviewerHistory =
  DeliveryReviewAssignmentHistoryQuery['deliveryReviewAssignmentHistory'];
const EVENT_ID = '58cfaa8b-4dba-4917-bb18-d6040c4ab26f';
const EARLIER_EVENT_ID = '38199d2c-f465-4cdc-adca-3db019b6c429';
const ORIGINAL_REASON =
  'Cover this exact submission while the primary is away.';
const mockRefetch = jest.fn();
const mockUseQuery = jest.fn();
let mockHistory: ReviewerHistory | undefined;
let mockError: Error | undefined;
let mockLoading = false;
let mockReady = true;
let mockIdentity = {
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
};

jest.mock('@apollo/client/react', () => ({
  useQuery: (...input: unknown[]) => mockUseQuery(...input),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    scope: `${mockIdentity.workspaceId}:${mockIdentity.memberId}:${mockIdentity.userWorkspaceId}`,
    matches: (value: ReviewerHistory | undefined) =>
      mockReady &&
      value?.workspaceId === mockIdentity.workspaceId &&
      value?.memberId === mockIdentity.memberId &&
      value?.userWorkspaceId === mockIdentity.userWorkspaceId,
  }),
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/reviews/reviewStyles', () => ({
  StyledReviewQueueItem: 'article',
}));

const historyFixture = (): ReviewerHistory => ({
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
  taskId: REVIEW_TASK_ID,
  submissionVersion: 3,
  nextBeforeId: EARLIER_EVENT_ID,
  events: [
    {
      id: EVENT_ID,
      revision: 1,
      mode: 'BACKUP',
      reviewerId: BACKUP_REVIEWER_ID,
      reviewerName: 'Original backup reviewer',
      primaryReviewerId: PRIMARY_REVIEWER_ID,
      primaryReviewerName: 'Original delivery manager',
      previousMode: 'PRIMARY',
      previousReviewerId: PRIMARY_REVIEWER_ID,
      previousReviewerName: 'Original delivery manager',
      reason: ORIGINAL_REASON,
      actorName: 'Assigning manager at the time',
      createdAt: '2026-10-29T06:15:00Z',
    },
  ],
});
const setup = async ({
  initialRoute = `/delivery?view=reviews&reviewProject=${REVIEW_PROJECT_ID}&reviewReviewer=${BACKUP_REVIEWER_ID}&reviewsMine=1&task=${REVIEW_TASK_ID}&creativeSubmission=3&reviewBatch=${REVIEW_TASK_ID}:3,${NEXT_REVIEW_TASK_ID}:1&reviewBatchDone=${NEXT_REVIEW_TASK_ID}:1`,
} = {}) => {
  let update: () => void = () => undefined;
  let taskId = REVIEW_TASK_ID;
  let submissionVersion = 3;
  let enabled = true;
  const Harness = () => {
    const [, setVersion] = useState(0);
    update = () => setVersion((version) => version + 1);
    return (
      <ReviewAssignmentHistory
        taskId={taskId}
        submissionVersion={submissionVersion}
        enabled={enabled}
      />
    );
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <Harness />
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: [initialRoute] },
  );
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  await userEvent.click(screen.getByText(/Submission reviewer history/));
  return {
    router,
    refresh: () => act(() => update()),
    disable: () =>
      act(() => {
        enabled = false;
        update();
      }),
    changeSource: (nextTaskId: string, nextSubmissionVersion: number) =>
      act(() => {
        taskId = nextTaskId;
        submissionVersion = nextSubmissionVersion;
        update();
      }),
  };
};

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  mockHistory = historyFixture();
  mockError = undefined;
  mockLoading = false;
  mockReady = true;
  mockIdentity = {
    workspaceId: 'workspace',
    memberId: 'member',
    userWorkspaceId: 'membership',
  };
  mockRefetch.mockReset().mockResolvedValue({});
  mockUseQuery.mockReset().mockImplementation(() => ({
    data: mockHistory
      ? { deliveryReviewAssignmentHistory: mockHistory }
      : undefined,
    loading: mockLoading,
    error: mockError,
    refetch: mockRefetch,
  }));
});

it('shows immutable primary, previous and backup attribution beside the exact submission history', async () => {
  const original = historyFixture().events[0];
  mockHistory = {
    ...historyFixture(),
    events: [
      {
        ...original,
        id: EARLIER_EVENT_ID,
        revision: 2,
        mode: 'PRIMARY',
        reviewerId: null,
        reviewerName: null,
        previousMode: 'BACKUP',
        previousReviewerId: BACKUP_REVIEWER_ID,
        previousReviewerName: 'Original backup reviewer',
        reason:
          'Explicitly return this same submission to its delivery manager.',
        actorName: 'Later assigning manager',
        createdAt: '2026-10-29T08:00:00Z',
      },
      original,
    ],
  };
  await setup();
  const [restored, assigned] = screen.getAllByRole('article');
  expect(within(assigned).getByText(ORIGINAL_REASON)).toBeVisible();
  expect(within(assigned).getByText(/Original backup reviewer/)).toBeVisible();
  expect(
    within(assigned).getByText(/Previously:.*Original delivery manager/),
  ).toBeVisible();
  expect(
    within(assigned).getByText(/Assigning manager at the time/),
  ).toHaveTextContent('Version 1');
  expect(
    within(assigned).getByText(/Assigning manager at the time/),
  ).toHaveTextContent('UTC');
  expect(
    within(restored).getByText(/Previously:.*Original backup reviewer/),
  ).toBeVisible();
  expect(
    within(restored).getByText(/Later assigning manager/),
  ).toHaveTextContent('Version 2');
  expect(
    within(restored).getByText(
      'Explicitly return this same submission to its delivery manager.',
    ),
  ).toBeVisible();
  expect(screen.getByText(/Submission reviewer history/)).toHaveTextContent(
    'Submission 3',
  );
});

it('pages history with the exact task, submission, queue filters and guided batch context intact', async () => {
  const page = await setup();
  expect(screen.getAllByRole('article')).toHaveLength(1);
  await userEvent.click(
    screen.getByRole('link', { name: 'Older reviewer events' }),
  );
  const older = new URLSearchParams(page.router.state.location.search);
  expect(older.get('reviewAssignmentBefore')).toBe(EARLIER_EVENT_ID);
  expect(older.get('task')).toBe(REVIEW_TASK_ID);
  expect(older.get('creativeSubmission')).toBe('3');
  expect(older.get('reviewProject')).toBe(REVIEW_PROJECT_ID);
  expect(older.get('reviewReviewer')).toBe(BACKUP_REVIEWER_ID);
  expect(older.get('reviewsMine')).toBe('1');
  expect(older.get('reviewBatch')).toBe(
    `${REVIEW_TASK_ID}:3,${NEXT_REVIEW_TASK_ID}:1`,
  );
  expect(older.get('reviewBatchDone')).toBe(`${NEXT_REVIEW_TASK_ID}:1`);
  await userEvent.click(
    screen.getByRole('link', { name: 'Latest reviewer events' }),
  );
  const latest = new URLSearchParams(page.router.state.location.search);
  expect(latest.has('reviewAssignmentBefore')).toBe(false);
  expect(latest.get('task')).toBe(REVIEW_TASK_ID);
  expect(latest.get('reviewProject')).toBe(REVIEW_PROJECT_ID);
  expect(latest.get('reviewBatch')).toBe(older.get('reviewBatch'));
});

it('shows a genuine empty history without inventing reassignment or changing source ownership', async () => {
  mockHistory = { ...historyFixture(), events: [], nextBeforeId: null };
  await setup();
  expect(
    screen.getByText(
      /No reviewer change has been recorded for this submission/,
    ),
  ).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Older reviewer events' }),
  ).not.toBeInTheDocument();
});

it('keeps an unavailable recorded backup distinct from the known primary manager', async () => {
  mockHistory = {
    ...historyFixture(),
    events: [
      {
        ...historyFixture().events[0],
        reviewerName: null,
        previousMode: 'BACKUP',
        previousReviewerId: BACKUP_REVIEWER_ID,
        previousReviewerName: null,
      },
    ],
  };
  await setup();
  expect(screen.getAllByText(/Recorded reviewer unavailable/)).toHaveLength(2);
  expect(
    screen.queryByText(/Original delivery manager/),
  ).not.toBeInTheDocument();
  expect(screen.getByText(ORIGINAL_REASON)).toBeVisible();
});

it('retains the actual previous primary reviewer when the canonical manager changed before delegation', async () => {
  mockHistory = {
    ...historyFixture(),
    events: [
      {
        ...historyFixture().events[0],
        primaryReviewerName: 'New primary manager',
        previousMode: 'PRIMARY',
        previousReviewerName: 'Former primary manager',
      },
    ],
  };
  await setup();
  expect(
    screen.getByText('Previously: Primary manager · Former primary manager'),
  ).toBeVisible();
  expect(
    screen.queryByText(/Previously: Primary manager · New primary manager/),
  ).not.toBeInTheDocument();
});
it('uses the recorded primary identity for a primary restoration instead of a retained backup name', async () => {
  mockHistory = {
    ...historyFixture(),
    events: [
      {
        ...historyFixture().events[0],
        mode: 'PRIMARY',
        reviewerId: null,
        reviewerName: 'Unrelated retained name',
        previousMode: 'BACKUP',
        previousReviewerId: BACKUP_REVIEWER_ID,
        previousReviewerName: 'Original backup reviewer',
      },
    ],
  };
  await setup();
  expect(screen.getByText(/Original delivery manager/)).toBeVisible();
  expect(screen.queryByText(/Unrelated retained name/)).not.toBeInTheDocument();
  expect(
    screen.getByText(/Previously:.*Original backup reviewer/),
  ).toBeVisible();
});

it('hides cached attribution after failure and supports a failed retry followed by recovery', async () => {
  const page = await setup();
  expect(screen.getByText(ORIGINAL_REASON)).toBeVisible();
  mockError = new Error('Offline');
  page.refresh();
  expect(screen.queryByText(ORIGINAL_REASON)).not.toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Reviewer history could not be verified.',
  );
  const retry = screen.getByRole('button', { name: 'Retry reviewer history' });
  expect(retry).toBeEnabled();
  mockRefetch.mockRejectedValueOnce(new Error('Still offline'));
  await userEvent.click(retry);
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(retry).toBeEnabled();
  mockError = undefined;
  page.refresh();
  expect(screen.getByText(ORIGINAL_REASON)).toBeVisible();
});

it.each(['unverified access', 'workspace', 'member', 'membership'])(
  'hides cached private history after current %s changes',
  async (change) => {
    const page = await setup();
    if (change === 'unverified access') mockReady = false;
    if (change === 'workspace')
      mockIdentity = { ...mockIdentity, workspaceId: 'another-workspace' };
    if (change === 'member')
      mockIdentity = { ...mockIdentity, memberId: 'another-member' };
    if (change === 'membership')
      mockIdentity = {
        ...mockIdentity,
        userWorkspaceId: 'another-membership',
      };
    page.refresh();
    expect(screen.queryByText(ORIGINAL_REASON)).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Older reviewer events' }),
    ).not.toBeInTheDocument();
  },
);

it.each(['task', 'submission'])(
  'hides the previous response while another exact %s is selected',
  async (change) => {
    const page = await setup();
    page.changeSource(
      change === 'task' ? NEXT_REVIEW_TASK_ID : REVIEW_TASK_ID,
      change === 'submission' ? 4 : 3,
    );
    expect(screen.queryByText(ORIGINAL_REASON)).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking reviewer history',
    );
  },
);

it('keeps missing or loading evidence private and only disables retry while loading', async () => {
  mockHistory = undefined;
  const page = await setup();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.queryByText(/No reviewer change has been recorded/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry reviewer history' }),
  ).toBeEnabled();
  mockHistory = historyFixture();
  mockLoading = true;
  page.refresh();
  expect(screen.queryByText(ORIGINAL_REASON)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry reviewer history' }),
  ).toBeDisabled();
});

it('hides history and disables its retry when the parent revokes the read surface', async () => {
  const page = await setup();
  page.disable();
  expect(screen.queryByText(ORIGINAL_REASON)).not.toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry reviewer history' }),
  ).toBeDisabled();
});

it('rejects an invalid page link without exposing cached events and preserves a latest-events recovery link', async () => {
  const page = await setup({
    initialRoute: `/delivery?view=reviews&reviewProject=${REVIEW_PROJECT_ID}&task=${REVIEW_TASK_ID}&creativeSubmission=3&reviewAssignmentBefore=not-a-uuid`,
  });
  expect(screen.queryByText(ORIGINAL_REASON)).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Reviewer history could not be verified.',
  );
  expect(
    screen.getByRole('button', { name: 'Retry reviewer history' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('link', { name: 'Latest reviewer events' }),
  );
  const recovered = new URLSearchParams(page.router.state.location.search);
  expect(recovered.has('reviewAssignmentBefore')).toBe(false);
  expect(recovered.get('task')).toBe(REVIEW_TASK_ID);
  expect(recovered.get('creativeSubmission')).toBe('3');
  expect(recovered.get('reviewProject')).toBe(REVIEW_PROJECT_ID);
  expect(screen.getByText(ORIGINAL_REASON)).toBeVisible();
});

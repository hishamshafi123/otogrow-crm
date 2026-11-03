import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreativeFeedbackHistory } from '@/delivery/creative/review/CreativeFeedbackHistory';
import { type CreativeFeedbackHistory as FeedbackHistorySnapshot } from '@/delivery/creative/review/creative-review.types';
import {
  FEEDBACK_ID,
  REVIEW_TASK_ID,
  targetFixture,
} from '@/delivery/creative/review/__tests__/creative-review.fixtures';
let mockReady = true;
let mockError: Error | undefined;
let mockHistory: FeedbackHistorySnapshot;
const mockRefetch = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/creative/review/creativeReviewStyles', () => ({
  StyledFeedback: 'article',
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    scope: 'workspace:member',
    matches: (data?: { workspaceId: string } | null) =>
      mockReady && data?.workspaceId === 'workspace',
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { deliveryCreativeFeedbackHistory: mockHistory },
    loading: false,
    error: mockError,
    refetch: mockRefetch,
  }),
}));
const setup = (enabled = true) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter
        initialEntries={[
          '/delivery?view=reviews&project=client-filter&creativeFeedback=' +
            FEEDBACK_ID,
        ]}
      >
        <CreativeFeedbackHistory
          taskId={REVIEW_TASK_ID}
          feedbackId={FEEDBACK_ID}
          enabled={enabled}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockReady = true;
  mockError = undefined;
  mockHistory = {
    workspaceId: 'workspace',
    memberId: 'member',
    userWorkspaceId: 'membership',
    taskId: REVIEW_TASK_ID,
    feedbackId: FEEDBACK_ID,
    nextBeforeId: '1807f5ce-fbb1-447b-b704-9dc8f5171c15',
    events: [
      {
        id: FEEDBACK_ID,
        action: 'ADDRESSED',
        revision: 2,
        body: 'Replaced product label in the second submitted cut',
        actorName: 'Original editor',
        createdAt: '2026-10-29T07:00:00Z',
        beforeStatus: 'OPEN',
        afterStatus: 'ADDRESSED',
        correction: targetFixture(2),
      },
    ],
  };
});
it('shows attributed immutable correction evidence and exact source and paging links', () => {
  setup();
  expect(
    screen.getByText('Original editor', { exact: false }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Replaced product label in the second submitted cut'),
  ).toBeInTheDocument();
  expect(screen.getByText(/Lineage as recorded/)).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Open recorded correction evidence' }),
  ).toHaveAttribute('href', expect.stringContaining('creativeSubmission=2'));
  expect(
    screen.getByRole('link', { name: 'Older feedback events' }),
  ).toHaveAttribute('href', expect.stringContaining('project=client-filter'));
});
it.each(['error', 'access', 'identity', 'disabled'])(
  'hides all historical feedback when %s prevents current verification',
  (cause) => {
    if (cause === 'error') mockError = new Error('offline');
    if (cause === 'access') mockReady = false;
    if (cause === 'identity') mockHistory.workspaceId = 'foreign';
    setup(cause !== 'disabled');
    expect(
      screen.queryByText('Replaced product label in the second submitted cut'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open recorded correction evidence' }),
    ).not.toBeInTheDocument();
  },
);

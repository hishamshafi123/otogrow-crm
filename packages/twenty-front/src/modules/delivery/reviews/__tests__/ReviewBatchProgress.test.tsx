import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReviewBatchProgress } from '@/delivery/reviews/ReviewBatchProgress';
import { useTaskReview } from '@/delivery/reviews/useTaskReview';
import { type TaskReviewSnapshot } from '@/delivery/reviews/review.types';
import {
  NEXT_REVIEW_TASK_ID,
  REVIEW_TASK_ID,
  taskReviewFixture,
} from '@/delivery/reviews/__tests__/reviews.fixtures';
let mockData: TaskReviewSnapshot | null;
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCard: 'section',
}));
jest.mock('@/delivery/reviews/useTaskReview', () => ({
  useTaskReview: () => ({ data: mockData }),
}));
const Content = ({ version }: { version: number }) => (
  <ReviewBatchProgress
    controller={useTaskReview({ taskId: REVIEW_TASK_ID, taskRevision: 4 })}
    taskId={REVIEW_TASK_ID}
    latestSubmissionVersion={version}
  />
);
const content = (version = 3) => (
  <I18nProvider i18n={i18n}>
    <MemoryRouter
      initialEntries={[
        `/delivery?view=reviews&task=${REVIEW_TASK_ID}&creativeSubmission=3&reviewBatch=${REVIEW_TASK_ID}:3,${NEXT_REVIEW_TASK_ID}:1&reviewBatchIndex=0&reviewProject=client-filter`,
      ]}
    >
      <Content version={version} />
    </MemoryRouter>
  </I18nProvider>
);
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockData = taskReviewFixture();
});
it('requires an explicit individual decision and never advances a pending or failed/unverified item', () => {
  const view = render(content());
  expect(screen.getByText('Selected review 1 of 2')).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Next selected review' }),
  ).not.toBeInTheDocument();
  mockData = null;
  view.rerender(content());
  expect(
    screen.getByText(
      /failed save or unavailable source is not a completed review/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Next selected review' }),
  ).not.toBeInTheDocument();
});
it('links only the next explicitly selected exact version after verified individual completion', () => {
  mockData = { ...taskReviewFixture(), state: 'APPROVED', pending: null };
  render(content());
  const link = screen.getByRole('link', { name: 'Next selected review' });
  expect(link).toHaveAttribute(
    'href',
    expect.stringContaining(`task=${NEXT_REVIEW_TASK_ID}`),
  );
  expect(link).toHaveAttribute(
    'href',
    expect.stringContaining('creativeSubmission=1'),
  );
  expect(link).toHaveAttribute(
    'href',
    expect.stringContaining('reviewBatchIndex=1'),
  );
  const destination = new URL(link.getAttribute('href')!, 'http://localhost')
    .searchParams;
  expect(destination.get('reviewBatch')).toBe(
    `${REVIEW_TASK_ID}:3,${NEXT_REVIEW_TASK_ID}:1`,
  );
  expect(link).toHaveAttribute(
    'href',
    expect.stringContaining('reviewProject=client-filter'),
  );
});
it('does not imply a decision when the selected version was replaced', () => {
  mockData = {
    ...taskReviewFixture(),
    pending: { ...taskReviewFixture().pending!, submissionVersion: 4 },
  };
  render(content(4));
  expect(
    screen.getByText(/No decision on the newer version is implied/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('link', {
      name: 'Continue without deciding the changed item',
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Next selected review' }),
  ).not.toBeInTheDocument();
});
it('blocks continuation when a still-pending source has no verified submission identity', () => {
  mockData = {
    ...taskReviewFixture(),
    pending: { ...taskReviewFixture().pending!, submissionVersion: null },
  };
  render(content());
  expect(
    screen.getByText(/current submission identity could not be established/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Next selected review' }),
  ).not.toBeInTheDocument();
});

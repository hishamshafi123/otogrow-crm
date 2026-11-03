import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewAssignmentForm } from '@/delivery/reviews/ReviewAssignmentForm';
import { type TaskReviewSnapshot } from '@/delivery/reviews/review.types';
import {
  BACKUP_REVIEWER_ID,
  REVIEW_TASK_ID,
  taskReviewFixture,
} from '@/delivery/reviews/__tests__/reviews.fixtures';
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/reviews/reviewStyles', () => ({
  StyledAssignmentBoundary: 'fieldset',
}));
const mockSave = jest.fn();
const mockReload = jest.fn();
const mockCancel = jest.fn();
const form = (snapshot: TaskReviewSnapshot, readOnly = false) => (
  <I18nProvider i18n={i18n}>
    <ReviewAssignmentForm
      snapshot={snapshot}
      readOnly={readOnly}
      onSave={mockSave}
      onCancel={mockCancel}
      onReload={mockReload}
    />
  </I18nProvider>
);
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.clearAllMocks();
  mockSave.mockResolvedValue(true);
});
it('requires an explicit reason and eligible existing project reviewer, preserving exact assignment identity', async () => {
  const snapshot = { ...taskReviewFixture(), assignment: null };
  render(form(snapshot));
  await userEvent.selectOptions(
    screen.getByLabelText('Review assignment', { exact: true }),
    'BACKUP',
  );
  expect(
    screen.getByLabelText('Eligible submission backup', { exact: true }),
  ).toHaveValue('');
  expect(
    screen.getByRole('button', { name: 'Save submission reviewer' }),
  ).toBeDisabled();
  await userEvent.selectOptions(
    screen.getByLabelText('Eligible submission backup', { exact: true }),
    BACKUP_REVIEWER_ID,
  );
  await userEvent.type(
    screen.getByLabelText('Reason for reviewer assignment'),
    'Cover the primary reviewer today',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save submission reviewer' }),
  );
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      commandId: expect.any(String),
      taskId: REVIEW_TASK_ID,
      taskRevision: 4,
      submissionVersion: 3,
      assignmentRevision: 0,
      mode: 'BACKUP',
      reviewerId: BACKUP_REVIEWER_ID,
    }),
  );
  expect(
    screen.getByText(/does not transfer client-delivery responsibility/),
  ).toBeInTheDocument();
});
it('restores primary explicitly with a reason and no inherited backup identifier', async () => {
  render(form(taskReviewFixture()));
  await userEvent.selectOptions(
    screen.getByLabelText('Review assignment', { exact: true }),
    'PRIMARY',
  );
  await userEvent.type(
    screen.getByLabelText('Reason for reviewer assignment'),
    'Primary reviewer is available again',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save submission reviewer' }),
  );
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: 'PRIMARY',
      reviewerId: null,
      assignmentRevision: 2,
    }),
  );
});
it('preserves the typed reason on stale assignment and retries only the frozen earlier command', async () => {
  mockSave.mockResolvedValueOnce(false);
  const original = taskReviewFixture();
  const view = render(form(original));
  await userEvent.type(
    screen.getByLabelText('Reason for reviewer assignment'),
    'Retain the exact request',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save submission reviewer' }),
  );
  const request = mockSave.mock.calls[0][0];
  view.rerender(
    form({ ...original, assignment: { ...original.assignment!, revision: 3 } }),
  );
  expect(screen.getByLabelText('Reason for reviewer assignment')).toHaveValue(
    'Retain the exact request',
  );
  expect(
    screen.getByRole('button', { name: 'Save submission reviewer' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check earlier assignment request' }),
  );
  expect(mockSave.mock.calls[1][0]).toEqual(request);
});
it('blocks unavailable current authority without losing the reason', async () => {
  const view = render(form(taskReviewFixture()));
  await userEvent.type(
    screen.getByLabelText('Reason for reviewer assignment'),
    'Keep this reason',
  );
  view.rerender(form(taskReviewFixture(), true));
  expect(
    screen.getByRole('button', { name: 'Save submission reviewer' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Reason for reviewer assignment')).toHaveValue(
    'Keep this reason',
  );
  expect(
    within(
      screen.getByRole('region', { name: 'Assign submission reviewer' }),
    ).getByRole('button', { name: 'Cancel reviewer assignment' }),
  ).toBeEnabled();
  expect(mockSave).not.toHaveBeenCalled();
});

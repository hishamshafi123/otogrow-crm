import { type DocumentNode } from 'graphql';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewAssignmentNotice } from '@/delivery/reviews/ReviewAssignmentNotice';
import { type TaskReviewSnapshot } from '@/delivery/reviews/review.types';
import {
  taskReviewFixture,
  BACKUP_REVIEWER_ID,
} from '@/delivery/reviews/__tests__/reviews.fixtures';
let mockReady = true;
let mockCapability = true;
let observerCallback: IntersectionObserverCallback;
const mockSeen = jest.fn();
const mockAcknowledge = jest.fn();
const onRefresh = jest.fn();
const onUnavailable = jest.fn();
const disconnect = jest.fn();
const observer: IntersectionObserver = {
  root: null,
  rootMargin: '0px',
  thresholds: [0, 0.1, 0.5, 1],
  observe: jest.fn(),
  disconnect,
  unobserve: jest.fn(),
  takeRecords: () => [],
};
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    scope: 'workspace:backup:membership',
    access: { capabilities: mockCapability ? ['delivery.review'] : [] },
    matches: (data?: TaskReviewSnapshot | null) =>
      mockReady &&
      data?.workspaceId === 'workspace' &&
      data.memberId === BACKUP_REVIEWER_ID &&
      data.userWorkspaceId === 'membership',
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useMutation: (document: DocumentNode) => {
    const operation = document.definitions.find(
      (definition) => definition.kind === 'OperationDefinition',
    );
    const name =
      operation?.kind === 'OperationDefinition' ? operation.name?.value : '';
    if (name === 'SeeDeliveryReviewAssignment') return [mockSeen];
    if (name === 'AcknowledgeDeliveryReviewAssignment')
      return [mockAcknowledge];
    throw new Error(`Unexpected legacy notice mutation: ${name}`);
  },
}));
const fixture = (): TaskReviewSnapshot => ({
  ...taskReviewFixture(),
  memberId: BACKUP_REVIEWER_ID,
  assignmentNotice: {
    id: '8c8b8540-3bb8-4bad-8dcf-3bb416506126',
    submissionVersion: 3,
    assignmentId: taskReviewFixture().assignment!.id!,
    assignmentRevision: 1,
    recipientId: BACKUP_REVIEWER_ID,
    createdAt: '2026-10-29T08:00:00Z',
    remindAt: '2026-10-29T08:05:00Z',
    seenAt: null,
    acknowledgedAt: null,
    sendState: 'UNCONFIGURED',
  },
});
const acknowledgementFixture = () => ({
  workspaceId: 'workspace',
  memberId: BACKUP_REVIEWER_ID,
  userWorkspaceId: 'membership',
  taskId: fixture().taskId,
  taskRevision: fixture().taskRevision,
  submissionVersion: 3,
  assignmentRevision: 2,
  noticeId: fixture().assignmentNotice!.id,
  acknowledgedAt: '2026-10-29T09:00:00Z',
});
const content = (snapshot = fixture()) => (
  <I18nProvider i18n={i18n}>
    <ReviewAssignmentNotice
      snapshot={snapshot}
      onRefresh={onRefresh}
      onUnavailable={onUnavailable}
    />
  </I18nProvider>
);
const visible = (isIntersecting = true) => {
  const target = screen.getByRole('region', {
    name: 'Your assigned submission review',
  });
  const bounds = new DOMRect(0, 0, 100, 100);
  const entry: IntersectionObserverEntry = {
    target,
    isIntersecting,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: isIntersecting ? bounds : new DOMRect(),
    boundingClientRect: bounds,
    rootBounds: new DOMRect(0, 0, 390, 844),
    time: performance.now(),
  };
  act(() => observerCallback([entry], observer));
};
const advance = () =>
  act(async () => {
    jest.advanceTimersByTime(400);
    await Promise.resolve();
  });
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockReady = true;
  mockCapability = true;
  jest.spyOn(document, 'hasFocus').mockReturnValue(true);
  jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: jest.fn((callback: IntersectionObserverCallback) => {
      observerCallback = callback;
      return observer;
    }),
  });
  const result = fixture();
  result.assignmentNotice!.seenAt = '2026-10-29T09:00:00Z';
  mockSeen.mockResolvedValue({ data: { seeDeliveryReviewAssignment: result } });
  mockAcknowledge.mockResolvedValue({
    data: { acknowledgeDeliveryReviewAssignment: acknowledgementFixture() },
  });
  onRefresh.mockResolvedValue(true);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it('keeps normal reads pure and records only a visibly read exact current assignment revision', async () => {
  render(content());
  await advance();
  expect(mockSeen).not.toHaveBeenCalled();
  visible();
  await advance();
  expect(mockSeen).toHaveBeenCalledTimes(1);
  expect(mockSeen).toHaveBeenCalledWith({
    variables: {
      input: {
        taskId: fixture().taskId,
        taskRevision: 4,
        submissionVersion: 3,
        assignmentRevision: 2,
        noticeId: fixture().assignmentNotice!.id,
      },
    },
  });
  expect(screen.getByText('Assignment seen')).toBeVisible();
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
it('preserves a default primary notice with null origin and uses the current zero assignment revision', async () => {
  const snapshot = fixture();
  snapshot.assignment = null;
  snapshot.pending!.assignmentMode = 'PRIMARY';
  snapshot.pending!.assignmentRevision = 0;
  snapshot.assignmentNotice!.assignmentId = null;
  snapshot.assignmentNotice!.assignmentRevision = 0;
  const result = {
    ...snapshot,
    assignmentNotice: {
      ...snapshot.assignmentNotice!,
      seenAt: '2026-10-29T09:00:00Z',
    },
  };
  mockSeen.mockResolvedValue({ data: { seeDeliveryReviewAssignment: result } });
  render(content(snapshot));
  visible();
  await advance();
  expect(mockSeen).toHaveBeenCalledWith({
    variables: {
      input: {
        taskId: snapshot.taskId,
        taskRevision: 4,
        submissionVersion: 3,
        assignmentRevision: 0,
        noticeId: snapshot.assignmentNotice!.id,
      },
    },
  });
  expect(screen.getByText('Assignment seen')).toBeVisible();
});
it('does not read a hidden or unfocused card and cancels when it leaves the viewport', async () => {
  const focus = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
  const visibility = jest.spyOn(document, 'visibilityState', 'get');
  render(content());
  visible();
  await advance();
  expect(mockSeen).not.toHaveBeenCalled();
  focus.mockReturnValue(true);
  visibility.mockReturnValue('hidden');
  act(() => window.dispatchEvent(new Event('focus')));
  await advance();
  expect(mockSeen).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  visible(false);
  await advance();
  expect(mockSeen).not.toHaveBeenCalled();
});
it.each([
  'access',
  'capability',
  'recipient',
  'submission',
  'assignment',
] as const)('never observes or reads an unavailable %s', async (condition) => {
  const snapshot = fixture();
  if (condition === 'access') mockReady = false;
  if (condition === 'capability') mockCapability = false;
  if (condition === 'recipient')
    snapshot.assignmentNotice!.recipientId = 'other';
  if (condition === 'submission')
    snapshot.assignmentNotice!.submissionVersion = 2;
  if (condition === 'assignment') snapshot.assignment!.revision = 1;
  render(content(snapshot));
  await advance();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(mockSeen).not.toHaveBeenCalled();
});
it('ignores a receipt completing after current assignment revision changes', async () => {
  let finish!: (value: unknown) => void;
  mockSeen.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(content());
  visible();
  await advance();
  const next = fixture();
  next.pending!.assignmentRevision = 3;
  next.assignment!.revision = 3;
  view.rerender(content(next));
  const old = fixture();
  old.assignmentNotice!.seenAt = '2026-10-29T09:00:00Z';
  await act(async () => finish({ data: { seeDeliveryReviewAssignment: old } }));
  expect(onRefresh).not.toHaveBeenCalled();
  expect(screen.getByText('Unread review assignment')).toBeVisible();
});
it('keeps failed receipts honest and requires an explicit retry', async () => {
  mockSeen.mockRejectedValueOnce(new Error('Offline'));
  render(content());
  visible();
  await advance();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'read receipt was not confirmed',
  );
  await advance();
  expect(mockSeen).toHaveBeenCalledTimes(1);
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await user.click(
    screen.getByRole('button', { name: 'Retry assignment read receipt' }),
  );
  expect(mockSeen).toHaveBeenCalledTimes(2);
  expect(await screen.findByText('Assignment seen')).toBeVisible();
});
it('offers explicit acknowledgement without deciding or resolving the submission', async () => {
  render(content());
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await user.click(
    screen.getByRole('button', { name: 'Acknowledge review assignment' }),
  );
  expect(mockAcknowledge).toHaveBeenCalledWith({
    variables: {
      input: {
        taskId: fixture().taskId,
        taskRevision: 4,
        submissionVersion: 3,
        assignmentRevision: 2,
        noticeId: fixture().assignmentNotice!.id,
      },
    },
  });
  expect(await screen.findByText('Assignment acknowledged')).toBeVisible();
  expect(mockSeen).not.toHaveBeenCalled();
});
it('allows a readable assigned reviewer to see and acknowledge work when final decisions are unavailable', async () => {
  const snapshot = fixture();
  snapshot.canReviewSubmission = false;
  snapshot.canApprove = false;
  snapshot.pending!.canReviewSubmission = false;
  snapshot.pending!.reviewerState = 'UNAVAILABLE';
  snapshot.pending!.warnings = ['REVIEWER_NATIVE_ACCESS_UNAVAILABLE'];
  mockSeen.mockResolvedValueOnce({
    data: {
      seeDeliveryReviewAssignment: {
        ...snapshot,
        assignmentNotice: {
          ...snapshot.assignmentNotice!,
          seenAt: '2026-10-29T09:00:00Z',
        },
      },
    },
  });
  render(content(snapshot));
  expect(
    screen.getByText(
      /check your task permissions before making a review decision/,
    ),
  ).toBeVisible();
  visible();
  await advance();
  expect(screen.getByText('Assignment seen')).toBeVisible();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await user.click(
    screen.getByRole('button', { name: 'Acknowledge review assignment' }),
  );
  expect(await screen.findByText('Assignment acknowledged')).toBeVisible();
  expect(onUnavailable).not.toHaveBeenCalled();
});
it.each(['seen', 'acknowledge'])(
  'propagates a confirmed %s denial without offering a private retry',
  async (operation) => {
    const denied = new CombinedGraphQLErrors({
      errors: [
        { message: 'Task unavailable', extensions: { code: 'NOT_FOUND' } },
      ],
    });
    render(content());
    if (operation === 'seen') {
      mockSeen.mockRejectedValueOnce(denied);
      visible();
      await advance();
    } else {
      mockAcknowledge.mockRejectedValueOnce(denied);
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await user.click(
        screen.getByRole('button', { name: 'Acknowledge review assignment' }),
      );
    }
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  },
);
it.each([
  { workspaceId: 'foreign' },
  { memberId: 'other' },
  { userWorkspaceId: 'other-account' },
  { taskId: 'other-task' },
  { taskRevision: 3 },
  { submissionVersion: 2 },
  { assignmentRevision: 1 },
  { noticeId: 'old-notice' },
  { acknowledgedAt: 'not-a-date' },
])(
  'rejects a mismatched bounded acknowledgement receipt: %j',
  async (change) => {
    mockAcknowledge.mockResolvedValueOnce({
      data: {
        acknowledgeDeliveryReviewAssignment: {
          ...acknowledgementFixture(),
          ...change,
        },
      },
    });
    render(content());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(
      screen.getByRole('button', { name: 'Acknowledge review assignment' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Acknowledgement was not confirmed',
    );
    expect(screen.getByText('Unread review assignment')).toBeVisible();
    expect(onRefresh).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Acknowledge review assignment' }),
    );
    expect(await screen.findByText('Assignment acknowledged')).toBeVisible();
    expect(mockAcknowledge).toHaveBeenCalledTimes(2);
  },
);
it('ignores acknowledgement completion after the current exact assignment changes', async () => {
  let finish!: (value: unknown) => void;
  mockAcknowledge.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(content());
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await user.click(
    screen.getByRole('button', { name: 'Acknowledge review assignment' }),
  );
  const next = fixture();
  next.pending!.assignmentRevision = 3;
  next.assignment!.revision = 3;
  view.rerender(content(next));
  await act(async () =>
    finish({
      data: { acknowledgeDeliveryReviewAssignment: acknowledgementFixture() },
    }),
  );
  expect(screen.getByText('Unread review assignment')).toBeVisible();
  expect(onRefresh).not.toHaveBeenCalled();
});
it('acknowledges a legacy primary notice with an explicit current zero assignment revision', async () => {
  const snapshot = fixture();
  snapshot.assignment = null;
  snapshot.pending!.assignmentMode = 'PRIMARY';
  snapshot.pending!.assignmentRevision = 0;
  snapshot.assignmentNotice!.assignmentId = null;
  snapshot.assignmentNotice!.assignmentRevision = 0;
  mockAcknowledge.mockResolvedValueOnce({
    data: {
      acknowledgeDeliveryReviewAssignment: {
        ...acknowledgementFixture(),
        assignmentRevision: 0,
      },
    },
  });
  render(content(snapshot));
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await user.click(
    screen.getByRole('button', { name: 'Acknowledge review assignment' }),
  );
  expect(mockAcknowledge).toHaveBeenCalledWith({
    variables: { input: expect.objectContaining({ assignmentRevision: 0 }) },
  });
  expect(await screen.findByText('Assignment acknowledged')).toBeVisible();
});

import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryAssignedReviewsToday } from '@/delivery/reviews/DeliveryAssignedReviewsToday';
import { reviewQueueFixture } from '@/delivery/reviews/__tests__/reviews.fixtures';
import { type ReviewQueueSnapshot } from '@/delivery/reviews/review.types';
import {
  DeliveryDraftGuardProvider,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
let mockSnapshot: ReviewQueueSnapshot;
let mockReady = true;
let mockCapability = true;
let mockError: Error | undefined;
let mockLoading = false;
let mockRefresh: () => void;
const mockQuery = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryCard: 'section',
  StyledDeliveryStack: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    scope: 'workspace:member:membership',
    access: { capabilities: mockCapability ? ['delivery.review'] : [] },
    matches: (data?: ReviewQueueSnapshot) =>
      mockReady &&
      data?.workspaceId === 'workspace' &&
      data.memberId === 'member' &&
      data.userWorkspaceId === 'membership',
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => {
    mockQuery(...args);
    return {
      data: { deliveryReviewQueue: mockSnapshot },
      loading: mockLoading,
      error: mockError,
      refetch: mockRefetch,
    };
  },
}));
const setup = () => {
  const Page = () => {
    const [, update] = useState(0);
    const [draft, setDraft] = useState('');
    mockRefresh = () => update((current) => current + 1);
    useDeliveryDraftStatus({ dirty: Boolean(draft), saving: false });
    return (
      <>
        <label>
          Separate task draft
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <DeliveryAssignedReviewsToday />
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
    {
      initialEntries: [
        '/delivery?view=home&search=retained&reviewProject=old&reviewsAfter=old&task=old&creativeCompare=1',
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return router;
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
  mockSnapshot = reviewQueueFixture();
  mockReady = true;
  mockCapability = true;
  mockError = undefined;
  mockLoading = false;
  jest.clearAllMocks();
  mockRefetch.mockResolvedValue({});
});
it('uses the complete current-person queue count rather than page length or production assignments', () => {
  setup();
  expect(screen.getByText('54')).toBeVisible();
  expect(mockQuery).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      variables: {
        input: { mine: true, limit: 1 },
        identity: 'workspace:member:membership',
      },
      fetchPolicy: 'no-cache',
    }),
  );
  const link = screen.getByRole('link', { name: 'Reviews assigned to you' });
  const params = new URL(link.getAttribute('href')!, 'http://localhost')
    .searchParams;
  expect(params.get('view')).toBe('reviews');
  expect(params.get('reviewsMine')).toBe('1');
  expect(params.get('search')).toBe('retained');
  for (const name of [
    'reviewProject',
    'reviewsAfter',
    'task',
    'creativeCompare',
  ])
    expect(params.has(name)).toBe(false);
  expect(mockRefetch).not.toHaveBeenCalled();
});
it('explains review responsibility without confusing it with production assignments', async () => {
  setup();
  const user = userEvent.setup();
  const explanation = screen.getByText(
    'Submission review responsibility; separate from your production assignments.',
  );
  expect(explanation).not.toBeVisible();
  await user.click(screen.getByText('About review assignments'));
  expect(explanation).toBeVisible();
  expect(screen.getByText('54')).toBeVisible();
});
it.each(['error', 'loading', 'identity', 'authority'] as const)(
  'hides stale counts when current %s is unverified',
  (condition) => {
    setup();
    if (condition === 'error') mockError = new Error('Offline');
    if (condition === 'loading') mockLoading = true;
    if (condition === 'identity')
      mockSnapshot = { ...mockSnapshot, userWorkspaceId: 'foreign' };
    if (condition === 'authority') mockCapability = false;
    act(() => mockRefresh());
    expect(screen.queryByText('54')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Reviews assigned to you' }),
    ).not.toBeInTheDocument();
  },
);
it('keeps a separate dirty draft until assigned-review navigation is explicitly accepted', async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Separate task draft' }),
    'Keep this',
  );
  await user.click(
    screen.getByRole('link', { name: 'Reviews assigned to you' }),
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(router.state.location.search).toContain('view=home');
  expect(
    screen.getByRole('textbox', { name: 'Separate task draft' }),
  ).toHaveValue('Keep this');
  await user.click(
    screen.getByRole('link', { name: 'Reviews assigned to you' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(router.state.location.search).toContain('reviewsMine=1');
});

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Request } from 'cross-fetch';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import {
  createMemoryRouter,
  Link,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { DeliveryChat } from '@/delivery/chat/DeliveryChat';
import { SEND_DELIVERY_CHAT } from '@/delivery/chat/deliveryChatGraphql';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type DeliveryChatQuery } from '~/generated-metadata/graphql';

const mockSend = jest.fn();
const mockViewed = jest.fn();
const mockRefetch = jest.fn();
let mockData: DeliveryChatQuery['deliveryChat'];
let mockError: Error | undefined;
let mockReady = true;
let observerCallback: IntersectionObserverCallback;
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    scope: 'workspace:member',
    ready: mockReady,
    matches: (data: DeliveryChatQuery['deliveryChat'] | undefined) =>
      mockReady && data?.workspaceId === 'workspace',
    refetch: mockRefetch,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { deliveryChat: mockData },
    error: mockError,
    refetch: mockRefetch,
  }),
  useMutation: (query: unknown) => [
    query === SEND_DELIVERY_CHAT ? mockSend : mockViewed,
    { loading: false },
  ],
}));
const page = () => (
  <I18nProvider i18n={i18n}>
    <ThemeProvider colorScheme="light">
      <MemoryRouter initialEntries={['/delivery?view=chat&chatWith=peer']}>
        <DeliveryChat />
      </MemoryRouter>
    </ThemeProvider>
  </I18nProvider>
);
let refreshGuardedChat: () => void = () => undefined;
const GuardedChat = () => {
  const [, refresh] = useState(0);
  refreshGuardedChat = () => refresh((revision) => revision + 1);
  return (
    <DeliveryDraftGuardProvider>
      <Link to="/elsewhere">Other work</Link>
      <DeliveryChat />
    </DeliveryDraftGuardProvider>
  );
};
const guardedPage = () => {
  const router = createMemoryRouter(
    [
      { path: '/delivery', element: <GuardedChat /> },
      { path: '/elsewhere', element: <p>Other work opened</p> },
    ],
    {
      initialEntries: ['/elsewhere', '/delivery?view=chat&chatWith=peer'],
      initialIndex: 1,
    },
  );
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <RouterProvider router={router} />
      </ThemeProvider>
    </I18nProvider>,
  );
  return {
    router,
    user: userEvent.setup(),
    update: () => act(() => refreshGuardedChat()),
  };
};
const forbidden = () =>
  new CombinedGraphQLErrors({
    errors: [
      {
        message: 'Conversation unavailable',
        extensions: { code: 'FORBIDDEN' },
      },
    ],
  });
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
  jest.spyOn(document, 'hasFocus').mockReturnValue(true);
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: jest.fn((callback: IntersectionObserverCallback) => {
      observerCallback = callback;
      return { observe: jest.fn(), disconnect: jest.fn() };
    }),
  });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockSend
    .mockReset()
    .mockResolvedValue({ data: { sendDeliveryChatMessage: 'message' } });
  mockViewed.mockReset();
  mockRefetch
    .mockReset()
    .mockImplementation(async () => ({ data: { deliveryChat: mockData } }));
  mockReady = true;
  mockError = undefined;
  mockData = {
    workspaceId: 'workspace',
    memberId: 'member',
    userWorkspaceId: 'membership',
    before: null,
    olderCursor: null,
    telegramReady: false,
    peopleTotal: 1,
    people: [
      {
        id: 'peer',
        name: 'Amna',
        active: true,
        unread: 1,
        lastMessageAt: null,
      },
    ],
    peer: {
      id: 'peer',
      name: 'Amna',
      active: true,
      unread: 1,
      lastMessageAt: null,
    },
    messages: [
      {
        id: 'incoming',
        position: '1',
        senderId: 'peer',
        recipientId: 'member',
        senderName: 'Amna',
        text: 'Please review the new brief.',
        createdAt: '2026-10-26T01:00:00Z',
        viewedAt: null,
        reminderState: 'WAITING',
      },
    ],
  };
});
afterEach(() => jest.restoreAllMocks());
const viewIncomingMessage = () => {
  const target = screen
    .getByText('Please review the new brief.')
    .closest('article')!;
  act(() =>
    observerCallback(
      [
        {
          target,
          isIntersecting: true,
          intersectionRect: new DOMRect(0, 0, 100, 100),
          boundingClientRect: new DOMRect(0, 0, 100, 100),
          intersectionRatio: 1,
          rootBounds: null,
          time: 0,
        },
      ],
      {} as IntersectionObserver,
    ),
  );
};
it('retries a failed viewed receipt for visible messages without requiring a changed history response', async () => {
  mockViewed
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValue({});
  render(page());
  viewIncomingMessage();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Viewed status could not be saved',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Retry viewed status' }),
  );
  viewIncomingMessage();
  await waitFor(() => expect(mockViewed).toHaveBeenCalledTimes(2));
  expect(mockViewed).toHaveBeenLastCalledWith({
    variables: { input: { messageIds: ['incoming'] } },
  });
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  );
});
it('opens a conversation without marking all messages viewed and explains Telegram setup', () => {
  render(page());
  expect(screen.getByText('Please review the new brief.')).toBeVisible();
  expect(mockViewed).not.toHaveBeenCalled();
  expect(
    screen.getByText(/Your Telegram reminders are not ready/),
  ).toBeVisible();
});
it('retries an uncertain send with the same request identifier and clears only after success', async () => {
  mockSend.mockRejectedValueOnce(new Error('Connection lost'));
  render(page());
  await userEvent.type(screen.getByLabelText('Message'), 'Reviewed and ready');
  await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Retry send safely',
  );
  expect(screen.getByLabelText('Message')).toHaveValue('Reviewed and ready');
  expect(screen.getByLabelText('Message')).toBeDisabled();
  const first = mockSend.mock.calls[0][0];
  await userEvent.click(screen.getByRole('button', { name: 'Retry send' }));
  await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(2));
  expect(mockSend.mock.calls[1][0]).toEqual(first);
  expect(screen.getByLabelText('Message')).toHaveValue('');
});
it('preserves a draft while hiding messages during a failed refresh', async () => {
  const rendered = render(page());
  await userEvent.type(screen.getByLabelText('Message'), 'Draft reply');
  mockError = new Error('Unavailable');
  rendered.rerender(page());
  expect(screen.getByText('Please review the new brief.')).not.toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Send message' }),
  ).not.toBeInTheDocument();
  mockError = undefined;
  rendered.rerender(page());
  expect(screen.getByLabelText('Message')).toHaveValue('Draft reply');
});
it('cannot send to an inactive teammate but retains readable history', () => {
  mockData.peer!.active = false;
  render(page());
  expect(screen.getByText('Please review the new brief.')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Send message' }),
  ).not.toBeInTheDocument();
});
it('does not display data from a different workspace', () => {
  mockData.workspaceId = 'other';
  render(page());
  expect(
    screen.queryByText('Please review the new brief.'),
  ).not.toBeInTheDocument();
});

it('disposes private state on a denied chat query and requires a verified refetch before restoring current history', async () => {
  const rendered = render(page());
  await userEvent.type(
    screen.getByLabelText('Message'),
    'Private unsent reply.',
  );
  mockError = forbidden();
  rendered.rerender(page());
  expect(screen.getByRole('alert')).toHaveTextContent('Chat access changed');
  expect(
    screen.queryByText('Please review the new brief.'),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  mockError = undefined;
  rendered.rerender(page());
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Message')).toHaveValue('');
  expect(screen.getByText('Please review the new brief.')).toBeVisible();
  expect(mockSend).not.toHaveBeenCalled();
});

it('drops a denied send body and never restores its old request when current access is reverified', async () => {
  mockSend.mockRejectedValueOnce(forbidden());
  render(page());
  await userEvent.type(
    screen.getByLabelText('Message'),
    'This denied body must be discarded.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Chat access changed',
  );
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  const firstRequest = mockSend.mock.calls[0][0].variables.input.requestId;
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Message')).toHaveValue('');
  expect(
    screen.queryByRole('button', { name: 'Retry send' }),
  ).not.toBeInTheDocument();
  await userEvent.type(
    screen.getByLabelText('Message'),
    'A fresh reviewed reply.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
  expect(mockSend.mock.calls[1][0].variables.input.requestId).not.toBe(
    firstRequest,
  );
  expect(mockSend.mock.calls[1][0].variables.input.text).toBe(
    'A fresh reviewed reply.',
  );
});

it('does not release confirmed denial for a refetch response belonging to another conversation', async () => {
  const rendered = render(page());
  mockError = forbidden();
  rendered.rerender(page());
  mockError = undefined;
  rendered.rerender(page());
  mockRefetch.mockResolvedValueOnce({}).mockResolvedValueOnce({
    data: {
      deliveryChat: {
        ...mockData,
        peer: { ...mockData.peer, id: 'another-peer' },
      },
    },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Chat access changed');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Message')).toHaveValue('');
});

it('treats a denied viewed receipt as scope loss without treating it as saved or repeatedly retrying it', async () => {
  mockViewed.mockRejectedValueOnce(forbidden());
  render(page());
  await userEvent.type(
    screen.getByLabelText('Message'),
    'Private draft before read denial.',
  );
  viewIncomingMessage();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Chat access changed',
  );
  expect(
    screen.queryByText('Please review the new brief.'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry viewed status' }),
  ).not.toBeInTheDocument();
  expect(mockViewed).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Message')).toHaveValue('');
  expect(mockViewed).toHaveBeenCalledTimes(1);
});

it('cancels a pending conversation callback on local denial before clearing its dirty registration', async () => {
  mockData.people.push({
    id: 'another-peer',
    name: 'Felix',
    active: true,
    unread: 0,
    lastMessageAt: null,
  });
  const { user, router, update } = guardedPage();
  await user.type(
    screen.getByLabelText('Message'),
    'Keep this private until access is lost.',
  );
  await user.click(screen.getByRole('button', { name: 'Felix' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  mockError = forbidden();
  update();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(router.state.location.search).toBe('?view=chat&chatWith=peer');
  expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  mockError = undefined;
  update();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Message')).toHaveValue('');
  expect(router.state.location.search).toBe('?view=chat&chatWith=peer');
});

it('resets blocked browser Back after a local chat-query denial while global access remains current', async () => {
  const { user, router, update } = guardedPage();
  await user.type(
    screen.getByLabelText('Message'),
    'Private message preparation.',
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole('dialog')).toBeVisible();
  mockError = forbidden();
  update();
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(router.state.location.pathname).toBe('/delivery');
  expect(router.state.location.search).toBe('?view=chat&chatWith=peer');
  expect(screen.queryByText('Other work opened')).not.toBeInTheDocument();
});

it('ignores a late successful send from before confirmed denial instead of clearing a fresh current draft', async () => {
  let finishSend:
    | ((result: { data: { sendDeliveryChatMessage: string } }) => void)
    | undefined;
  mockSend.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSend = resolve;
      }),
  );
  const rendered = render(page());
  await userEvent.type(
    screen.getByLabelText('Message'),
    'The earlier submitted body.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
  mockError = forbidden();
  rendered.rerender(page());
  mockError = undefined;
  rendered.rerender(page());
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await userEvent.type(
    await screen.findByLabelText('Message'),
    'Fresh preparation after access check.',
  );
  expect(finishSend).toBeDefined();
  await act(async () => {
    finishSend?.({ data: { sendDeliveryChatMessage: 'old-message' } });
  });
  expect(screen.getByLabelText('Message')).toHaveValue(
    'Fresh preparation after access check.',
  );
  expect(screen.queryByText('Message sent.')).not.toBeInTheDocument();
});

it.each([
  {
    destination: '/delivery?view=chat&chatWith=another-peer',
    peer: 'another-peer',
    before: null,
  },
  {
    destination: '/delivery?view=chat&chatWith=peer&chatBefore=older-page',
    peer: 'peer',
    before: 'older-page',
  },
])(
  'owns drafts and uncertain send bodies by the exact conversation/page through direct navigation and POP: $destination',
  async ({ destination, peer, before }) => {
    const original = mockData;
    mockSend.mockRejectedValueOnce(new Error('Send outcome unavailable'));
    const { user, router } = guardedPage();
    await user.type(
      screen.getByLabelText('Message'),
      'Earlier uncertain message body.',
    );
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(
      await screen.findByRole('button', { name: 'Retry send' }),
    ).toBeVisible();
    await act(async () => {
      await router.navigate(destination);
    });
    expect(screen.getByRole('dialog')).toBeVisible();
    mockData = {
      ...original,
      before,
      peer: {
        id: peer,
        name: 'Current teammate',
        active: true,
        unread: 0,
        lastMessageAt: null,
      },
      messages: [],
    };
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(router.state.location.search).toBe(
      new URL(destination, 'http://localhost').search,
    );
    expect(screen.getByLabelText('Message')).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Retry send' }),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText('Message'),
      'New current-source preparation.',
    );
    await act(async () => {
      await router.navigate(-1);
    });
    expect(screen.getByRole('dialog')).toBeVisible();
    mockData = original;
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(router.state.location.search).toBe('?view=chat&chatWith=peer');
    expect(screen.getByLabelText('Message')).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Retry send' }),
    ).not.toBeInTheDocument();
    expect(mockSend).toHaveBeenCalledTimes(1);
  },
);

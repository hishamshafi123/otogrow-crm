import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'twenty-ui/theme-constants';
import { DeliveryChat } from '@/delivery/chat/DeliveryChat';
import { SEND_DELIVERY_CHAT } from '@/delivery/chat/deliveryChatGraphql';
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
  mockRefetch.mockReset().mockResolvedValue({});
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

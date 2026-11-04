import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { getOperationAST, type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { InboxConversationPanel } from '@/delivery/inbox/workspace/InboxConversationPanel';
import { InboxConversations } from '@/delivery/inbox/workspace/InboxConversations';
import { useInboxAccess } from '@/delivery/inbox/workspace/useInboxAccess';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { inboxCommandHash } from '@/delivery/inbox/workspace/inbox-command';
import { type ConsentDeliveryInboxThreadInput } from '~/generated-metadata/graphql';

const CONVERSATION_ID = '10000000-0000-4000-8000-000000000001';
const REPLY_ID = '10000000-0000-4000-8000-000000000002';
const MESSAGE_ID = '10000000-0000-4000-8000-000000000003';
const REQUEST_ID = '10000000-0000-4000-8000-000000000004';
const identity = {
  workspaceId: 'workspace',
  memberId: 'owner',
  userWorkspaceId: 'membership',
  scope: 'scope',
  observedAt: '2026-11-04T00:00:00.000Z',
  actor: {
    memberId: 'owner',
    isAdmin: true,
    isManager: true,
    roleIds: [],
    capabilities: [],
  },
};
const mockMutation = jest.fn();
const mockDenied = jest.fn();
const mockRefetch = jest.fn();
const mockInvalidate = jest.fn();
const mockCapture = () => () => true;
const mockMatches = () => true;
let mockCanSend = true;
let mockStatus = 'DRAFT';
let mockBodyFingerprint = 'a'.repeat(64);
let mockThreadFingerprint = 'c'.repeat(64);
let mockBindingRevision = 1;
let mockCanRead = true;
let mockCanDraft = true;

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/inbox/workspace/inboxWorkspaceStyles', () => ({
  StyledInboxBoundary: 'fieldset',
  StyledInboxMessage: 'article',
  StyledInboxFacts: 'dl',
  StyledInboxGrant: 'div',
}));
jest.mock('@/delivery/inbox/workspace/useInboxAccess', () => ({
  useInboxAccess: () => ({
    source: 'current-owner',
    data: { canManageConversations: true },
    permission: { access: { memberId: 'owner' } },
    administrator: true,
    matches: mockMatches,
    capture: mockCapture,
    invalidate: mockInvalidate,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({
    query: jest.fn(),
    refetchQueries: jest.fn().mockResolvedValue([]),
  }),
  useMutation: () => [mockMutation],
  useQuery: (
    document: DocumentNode,
    options: { variables?: { input?: { after?: string; search?: string } } },
  ) => {
    const operation = getOperationAST(document)?.name?.value;
    const after = options.variables?.input?.after;
    const brokenPage =
      Boolean(after) &&
      ['DeliveryInboxMessages', 'DeliveryInboxReplies'].includes(
        operation ?? '',
      );
    let data: unknown = {};
    if (operation === 'DeliveryInboxConversation')
      data = { deliveryInboxConversation: mockConversation() };
    if (operation === 'DeliveryInboxMessages')
      data = { deliveryInboxMessages: mockMessages() };
    if (operation === 'DeliveryInboxReplies')
      data = {
        deliveryInboxReplies: {
          ...identity,
          items: [],
          totalCount: 0,
          nextCursor: null,
        },
      };
    if (operation === 'DeliveryInboxConversations')
      data = {
        deliveryInboxConversations: {
          ...identity,
          items: [],
          totalCount: 0,
          nextCursor: null,
        },
      };
    if (operation === 'DeliveryInboxGmailAccounts')
      data = {
        deliveryInboxGmailAccounts: {
          ...identity,
          items: [
            {
              id: 'account',
              handle: 'owner@example.invalid',
              needsReconnect: false,
            },
          ],
          totalCount: 1,
          nextCursor: null,
        },
      };
    if (operation === 'DeliveryInboxGmailThreads') {
      const thread = {
        accountId: 'account',
        accountHandle: 'owner@example.invalid',
        channelId: 'channel',
        threadExternalId: 'thread',
        subject: 'Synthetic selected client conversation',
        messageCount: 2,
        latestAt: '2026-11-04T00:00:00.000Z',
        sourceFingerprint: mockThreadFingerprint,
      };
      data = {
        deliveryInboxGmailThreads: {
          ...identity,
          items: [thread],
          selected: thread,
          totalCount: 1,
          nextCursor: null,
        },
      };
    }
    if (
      ['DeliveryInboxReply', 'DeliveryInboxReplyState'].includes(
        operation ?? '',
      )
    )
      data = { deliveryInboxReply: mockReply() };
    return {
      data: brokenPage ? undefined : data,
      loading: false,
      error: brokenPage
        ? new Error('The saved page is no longer current.')
        : undefined,
      networkStatus: brokenPage ? 8 : 7,
      refetch: mockRefetch,
    };
  },
}));

const mockConversation = () => ({
  ...identity,
  conversation: {
    id: CONVERSATION_ID,
    revision: 1,
    title: 'Synthetic selected client conversation',
    channel: 'EMAIL',
    projectId: 'project',
    projectName: 'Synthetic client project',
    ownerId: 'owner',
    private: false,
    connected: true,
  },
  binding: {
    id: 'binding',
    revision: mockBindingRevision,
    enabled: true,
    accountId: 'account',
    channelId: 'channel',
    threadExternalId: 'thread',
    accountHandle: 'owner@example.invalid',
    ownerMemberId: 'owner',
    canConsent: true,
    canRead: mockCanRead,
    canDraft: mockCanDraft,
    canSend: true,
    problem: null,
    syncedAt: null,
    syncStatus: null,
    grants: [],
  },
  availableGrants: [
    {
      kind: 'MEMBER',
      id: 'teammate',
      name: 'Synthetic teammate',
      read: true,
      draft: true,
    },
  ],
});
const mockMessages = () => ({
  ...identity,
  conversationId: CONVERSATION_ID,
  sourceFingerprint: 'source',
  totalCount: 2,
  nextCursor: 'older-page',
  items: [
    {
      id: MESSAGE_ID,
      subject: 'Synthetic client question',
      text: 'Please confirm the delivery date.',
      direction: 'INCOMING',
      receivedAt: '2026-11-04T00:00:00.000Z',
      participants: [
        {
          role: 'from',
          handle: 'client@example.invalid',
          displayName: 'Client',
        },
      ],
      participantsTruncated: false,
      textTruncated: false,
    },
  ],
});
const mockReply = () => ({
  ...identity,
  id: REPLY_ID,
  conversationId: CONVERSATION_ID,
  status: mockStatus,
  body: {
    to: 'client@example.invalid',
    subject: 'Re: Synthetic client question',
    text: 'Synthetic reviewed reply.',
    replyToMessageId: MESSAGE_ID,
    sourceIds: [],
    agentId: null,
  },
  bodyFingerprint: mockBodyFingerprint,
  sourceFingerprint: 'source',
  canSend: mockCanSend,
  canCancel: true,
  problem: null,
  createdAt: '2026-11-04T00:00:00.000Z',
  attemptedAt: null,
  finishedAt: null,
});
const Harness = ({ list }: { list: boolean }) => {
  const state = useInboxAccess();
  return list ? (
    <InboxConversations state={state} onDenied={mockDenied} />
  ) : (
    <InboxConversationPanel
      state={state}
      conversationId={CONVERSATION_ID}
      enabled
      onDenied={mockDenied}
    />
  );
};
const setup = (search = '', list = false) => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Harness list={list} />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    {
      initialEntries: [
        `/delivery?view=inbox&inboxConversation=${CONVERSATION_ID}${search}`,
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return router;
};
beforeEach(() => {
  jest.clearAllMocks();
  mockCanSend = true;
  mockStatus = 'DRAFT';
  mockBodyFingerprint = 'a'.repeat(64);
  mockThreadFingerprint = 'c'.repeat(64);
  mockBindingRevision = 1;
  mockCanRead = true;
  mockCanDraft = true;
  mockMutation.mockResolvedValue({ data: {} });
  mockRefetch.mockResolvedValue({});
  Object.assign(globalThis, { Request, TextEncoder });
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

it('recovers a failed older-message page without losing the owned reply text or request', async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Prepare an unsent reply' }),
  );
  await user.selectOptions(
    screen.getByLabelText('Incoming message to answer'),
    MESSAGE_ID,
  );
  await user.type(
    screen.getByLabelText('Unsent reply text'),
    'Keep this unsent answer.',
  );
  const request = new URLSearchParams(router.state.location.search).get(
    'inboxRequest',
  );
  await user.click(screen.getByRole('link', { name: 'Earlier messages' }));
  expect(
    screen.queryByRole('textbox', { name: 'Unsent reply text' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Imported messages could not be verified/),
  ).toBeVisible();
  await user.click(
    screen.getByRole('link', { name: 'Return to newest messages' }),
  );
  expect(screen.getByLabelText('Unsent reply text')).toHaveValue(
    'Keep this unsent answer.',
  );
  expect(
    new URLSearchParams(router.state.location.search).get('inboxRequest'),
  ).toBe(request);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('offers a first-page recovery when reply history cannot verify a saved page', async () => {
  const router = setup('&inboxRepliesAfter=stale-history');
  const user = userEvent.setup();
  await user.click(
    screen.getByText('Recorded unsent replies and delivery outcomes'),
  );
  expect(screen.getByText('Reply history could not be checked.')).toBeVisible();
  await user.click(
    screen.getByRole('link', { name: 'First reply history page' }),
  );
  expect(
    new URLSearchParams(router.state.location.search).has('inboxRepliesAfter'),
  ).toBe(false);
  expect(screen.getByText('Showing 0 of 0 recorded replies.')).toBeVisible();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('keeps the visible conversation search aligned with back and forward navigation', async () => {
  const router = setup('&inboxSearch=First', true);
  const user = userEvent.setup();
  const search = screen.getByRole('textbox', { name: 'Find a conversation' });
  await user.clear(search);
  await user.type(search, 'Second');
  await user.click(screen.getByRole('button', { name: 'Find conversations' }));
  expect(
    screen.getByRole('textbox', { name: 'Find a conversation' }),
  ).toHaveValue('Second');
  await act(async () => router.navigate(-1));
  expect(
    screen.getByRole('textbox', { name: 'Find a conversation' }),
  ).toHaveValue('First');
  await act(async () => router.navigate(1));
  expect(
    screen.getByRole('textbox', { name: 'Find a conversation' }),
  ).toHaveValue('Second');
});

it.each(['send', 'cancel'])(
  'closes a %s receipt bookmark without leaving an orphan command',
  async (mode) => {
    const router = setup(
      `&inboxReply=${REPLY_ID}&inboxMode=${mode}&inboxCommandId=${REPLY_ID}&inboxRequest=${REQUEST_ID}`,
    );
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Close recorded reply' }));
    const params = new URLSearchParams(router.state.location.search);
    for (const key of [
      'inboxReply',
      'inboxMode',
      'inboxCommandId',
      'inboxRequest',
    ])
      expect(params.has(key)).toBe(false);
    expect(params.get('inboxConversation')).toBe(CONVERSATION_ID);
    expect(mockMutation).not.toHaveBeenCalled();
  },
);

it('preserves a separate owned composition when closing a previously recorded reply', async () => {
  const router = setup(`&inboxReply=${REPLY_ID}`);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Prepare an unsent reply' }),
  );
  await user.type(
    screen.getByLabelText('Unsent reply text'),
    'Continue this draft.',
  );
  const before = new URLSearchParams(router.state.location.search);
  await user.click(
    within(
      screen.getByRole('region', { name: 'Saved reply and delivery outcome' }),
    ).getByRole('link', { name: 'Close recorded reply' }),
  );
  const after = new URLSearchParams(router.state.location.search);
  expect(after.get('inboxMode')).toBe('prepare');
  expect(after.get('inboxRequest')).toBe(before.get('inboxRequest'));
  expect(screen.getByLabelText('Unsent reply text')).toHaveValue(
    'Continue this draft.',
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('requires an explicit final human review before requesting the exact saved reply send', async () => {
  setup(`&inboxReply=${REPLY_ID}`);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Review and request sending' }),
  );
  const submit = screen.getByRole('button', {
    name: 'Request this reviewed send',
  });
  expect(submit).toBeDisabled();
  expect(screen.getByText('client@example.invalid')).toBeVisible();
  expect(screen.getByText('Synthetic reviewed reply.')).toBeVisible();
  await user.click(
    screen.getByRole('checkbox', { name: /I reviewed the exact recipient/ }),
  );
  await user.click(submit);
  expect(mockMutation).toHaveBeenCalledTimes(1);
  expect(mockMutation).toHaveBeenCalledWith({
    variables: {
      input: {
        id: REPLY_ID,
        requestId: expect.any(String),
        bodyFingerprint: 'a'.repeat(64),
        sourceFingerprint: 'source',
      },
    },
  });
  expect(await screen.findByText(/This result is unconfirmed/)).toBeVisible();
});

it.each(['permission', 'body'])(
  'withholds a confirmed send after its %s changes',
  async (change) => {
    const router = setup(`&inboxReply=${REPLY_ID}`);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Review and request sending' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: /I reviewed the exact recipient/ }),
    );
    if (change === 'permission') mockCanSend = false;
    else mockBodyFingerprint = 'b'.repeat(64);
    await act(async () =>
      router.navigate(
        `${router.state.location.pathname}${router.state.location.search}&inboxRepliesAfter=stale-history`,
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Request this reviewed send' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/The source or sending state changed/),
    ).toBeVisible();
    expect(mockMutation).not.toHaveBeenCalled();
  },
);

it('never exposes resend for an uncertain reply and reports mismatched evidence honestly', async () => {
  mockStatus = 'UNCERTAIN';
  mockCanSend = false;
  mockMutation.mockResolvedValueOnce({
    data: {
      reconcileDeliveryInboxReply: {
        ...mockReply(),
        conversationId: 'another-conversation',
        status: 'SENT',
      },
    },
  });
  setup(`&inboxReply=${REPLY_ID}`);
  expect(
    screen.queryByRole('button', { name: 'Review and request sending' }),
  ).not.toBeInTheDocument();
  await userEvent.setup().click(
    screen.getByRole('button', {
      name: 'Check synchronized Sent-mail evidence',
    }),
  );
  expect(
    await screen.findByText(
      /The returned evidence does not match this saved reply/,
    ),
  ).toBeVisible();
  expect(screen.queryByText(/An exact copy was found/)).not.toBeInTheDocument();
  expect(mockRefetch).not.toHaveBeenCalled();
  expect(mockMutation).toHaveBeenCalledWith({
    variables: { input: { id: REPLY_ID } },
  });
});

it('requires exact owner consent again when delegated permissions change', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Review thread sharing' }),
  );
  const view = screen.getByRole('checkbox', {
    name: 'Synthetic teammate: view',
  });
  const draft = screen.getByRole('checkbox', {
    name: 'Synthetic teammate: prepare drafts',
  });
  const send = screen.getByRole('checkbox', {
    name: 'Synthetic teammate: send reviewed replies',
  });
  expect(view).not.toBeChecked();
  expect(draft).not.toBeChecked();
  expect(send).not.toBeChecked();
  await user.click(send);
  expect(view).toBeChecked();
  expect(draft).toBeChecked();
  const consent = screen.getByRole('checkbox', {
    name: /I authorize these maximum permissions/,
  });
  const submit = screen.getByRole('button', { name: 'Confirm owner consent' });
  expect(submit).toBeDisabled();
  await user.click(consent);
  expect(submit).toBeEnabled();
  await user.click(view);
  expect(draft).not.toBeChecked();
  expect(send).not.toBeChecked();
  expect(consent).not.toBeChecked();
  expect(submit).toBeDisabled();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('requires fresh owner confirmation when the selected thread changes', async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Review thread sharing' }),
  );
  const consent = screen.getByRole('checkbox', {
    name: /I authorize these maximum permissions/,
  });
  await user.click(consent);
  expect(
    screen.getByRole('button', { name: 'Confirm owner consent' }),
  ).toBeEnabled();
  mockThreadFingerprint = 'd'.repeat(64);
  await act(async () =>
    router.navigate(
      `${router.state.location.pathname}${router.state.location.search}&inboxRepliesAfter=stale-history`,
    ),
  );
  expect(consent).not.toBeChecked();
  expect(
    screen.getByRole('button', { name: 'Confirm owner consent' }),
  ).toBeDisabled();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('announces a verified consent result without calling its own saved revision stale', async () => {
  mockMutation.mockImplementationOnce(
    async ({
      variables: { input },
    }: {
      variables: { input: ConsentDeliveryInboxThreadInput };
    }) => {
      mockBindingRevision = 2;
      return {
        data: {
          consentDeliveryInboxThread: {
            ...identity,
            receipt: {
              requestId: input.requestId,
              action: 'CONSENTED',
              actorId: identity.memberId,
              userWorkspaceId: identity.userWorkspaceId,
              conversationId: CONVERSATION_ID,
              bindingId: input.id,
              replyId: null,
              bodyFingerprint: await inboxCommandHash({
                kind: 'CONSENT',
                input,
              }),
              createdAt: '2026-11-04T00:00:00.000Z',
            },
            reply: null,
          },
        },
      };
    },
  );
  setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Review thread sharing' }),
  );
  await user.click(
    screen.getByRole('checkbox', {
      name: /I authorize these maximum permissions/,
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Confirm owner consent' }),
  );
  const saved = await screen.findByRole('region', {
    name: 'Saved inbox request',
  });
  expect(
    within(saved).getByText(/Your Gmail thread sharing permissions were saved/),
  ).toBeVisible();
  expect(saved).toHaveFocus();
  expect(
    screen.queryByText(/Conversation access or consent changed/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/a send request alone does not confirm delivery/),
  ).not.toBeInTheDocument();
});

it('disposes retained reply text after confirmed read loss for a read-only viewer', async () => {
  mockCanDraft = false;
  mockCanSend = false;
  const router = setup(`&inboxReply=${REPLY_ID}`);
  expect(screen.getByText('Synthetic reviewed reply.')).toBeVisible();
  expect(
    screen.getByText(
      /Sending is unavailable with the current account or conversation permissions/,
    ),
  ).toBeVisible();
  mockCanRead = false;
  await act(async () =>
    router.navigate(
      `${router.state.location.pathname}${router.state.location.search}&inboxRepliesAfter=stale-history`,
    ),
  );
  expect(
    screen.queryByText('Synthetic reviewed reply.'),
  ).not.toBeInTheDocument();
  expect(mockInvalidate).toHaveBeenCalled();
  expect(mockMutation).not.toHaveBeenCalled();
});

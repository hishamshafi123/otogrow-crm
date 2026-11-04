import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { useState } from 'react';
import { getOperationAST, type DocumentNode } from 'graphql';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { InboxAttempt } from '@/delivery/inbox/workspace/InboxAttempt';
import { inboxCommandHash } from '@/delivery/inbox/workspace/inbox-command';
import { type InboxRequest } from '@/delivery/inbox/workspace/inbox-workspace.types';
import { type InboxCommandAccess } from '@/delivery/inbox/workspace/useInboxCommands';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type SendDeliveryInboxReplyInput } from '~/generated-metadata/graphql';

const REPLY_ID = '10000000-0000-4000-8000-000000000001';
const REQUEST_ID = '10000000-0000-4000-8000-000000000002';
const CONVERSATION_ID = '10000000-0000-4000-8000-000000000003';
const identity = {
  workspaceId: 'workspace',
  memberId: 'operator',
  userWorkspaceId: 'membership',
};
let mockOwned = true;
let mockAccessCurrent = true;
const mockSend = jest.fn();
const mockQuery = jest.fn();
const mockRefetchQueries = jest.fn();
const mockSaved = jest.fn();
const mockDenied = jest.fn();
const access: InboxCommandAccess = {
  source: 'current-inbox-operator',
  capture: () => () => mockAccessCurrent,
  matches: (value) =>
    value.workspaceId === identity.workspaceId &&
    value.memberId === identity.memberId &&
    value.userWorkspaceId === identity.userWorkspaceId,
};

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/inbox/workspace/inboxWorkspaceStyles', () => ({
  StyledInboxBoundary: 'fieldset',
}));
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({
    query: mockQuery,
    refetchQueries: mockRefetchQueries,
  }),
  useMutation: (document: DocumentNode) => [
    getOperationAST(document)?.name?.value === 'SendDeliveryInboxReply'
      ? mockSend
      : jest.fn(),
  ],
}));

const result = (): InboxRequest => ({
  ...identity,
  scope: 'scope',
  observedAt: '2026-11-03T00:00:00.000Z',
  actor: {
    memberId: identity.memberId,
    isAdmin: false,
    isManager: false,
    roleIds: [],
    capabilities: [],
  },
  receipt: {
    requestId: REQUEST_ID,
    action: 'SEND_REQUESTED',
    actorId: identity.memberId,
    userWorkspaceId: identity.userWorkspaceId,
    conversationId: CONVERSATION_ID,
    bindingId: '10000000-0000-4000-8000-000000000004',
    replyId: REPLY_ID,
    bodyFingerprint: '',
    createdAt: '2026-11-03T00:00:00.000Z',
  },
  reply: null,
});
const noSavedRequest = () => ({
  data: { deliveryInboxRequest: { ...result(), receipt: null } },
});
const Harness = () => {
  const [sourceFingerprint, setSourceFingerprint] = useState('source-before');
  return (
    <>
      <InboxAttempt
        state={access}
        conversationId={CONVERSATION_ID}
        requestId={REQUEST_ID}
        id={REPLY_ID}
        kind="SEND"
        owned={mockOwned}
        enabled
        onDenied={mockDenied}
        onSaved={mockSaved}
      >
        {({ execute }) => (
          <>
            <label>
              Reviewed source fingerprint
              <input
                value={sourceFingerprint}
                onChange={(event) =>
                  setSourceFingerprint(event.currentTarget.value)
                }
              />
            </label>
            <button
              onClick={() =>
                void execute({
                  kind: 'SEND',
                  input: {
                    id: REPLY_ID,
                    requestId: REQUEST_ID,
                    bodyFingerprint: 'a'.repeat(64),
                    sourceFingerprint,
                  },
                })
              }
            >
              Request sending
            </button>
          </>
        )}
      </InboxAttempt>
      <Link to="/other">Other page</Link>
    </>
  );
};
const setup = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Harness />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
      { path: '/other', element: <p>Other page opened</p> },
    ],
    {
      initialEntries: [
        `/delivery?view=inbox&inboxConversation=${CONVERSATION_ID}&inboxReply=${REPLY_ID}&inboxRequest=${REQUEST_ID}&inboxMode=send`,
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return router;
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRefetchQueries.mockResolvedValue([]);
  mockOwned = true;
  mockAccessCurrent = true;
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
  mockQuery.mockResolvedValue(noSavedRequest());
  mockSend.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: SendDeliveryInboxReplyInput };
    }) => ({
      data: {
        sendDeliveryInboxReply: {
          ...result(),
          receipt: {
            ...result().receipt,
            bodyFingerprint: await inboxCommandHash({ kind: 'SEND', input }),
          },
        },
      },
    }),
  );
});

it('freezes a lost send response and retries only its exact body after a current absence check', async () => {
  mockSend.mockRejectedValueOnce(new Error('Response lost'));
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Request sending' }));
  expect(await screen.findByText(/This result is unconfirmed/)).toBeVisible();
  expect(screen.getByLabelText('Reviewed source fingerprint')).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Retry exact inbox request' }),
  ).not.toBeInTheDocument();
  const original = mockSend.mock.calls[0][0];
  await user.click(
    screen.getByRole('button', { name: 'Check saved inbox request' }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Retry exact inbox request' }),
  );
  expect(
    await screen.findByRole('link', { name: 'Open recorded reply' }),
  ).toBeVisible();
  expect(mockSend).toHaveBeenCalledTimes(2);
  expect(mockSend.mock.calls[1][0]).toEqual(original);
  expect(mockSaved).toHaveBeenCalledTimes(1);
});

it('recovers the saved send request without dispatching it again or claiming delivery', async () => {
  let saved: InboxRequest | undefined;
  mockSend.mockImplementationOnce(
    async ({
      variables: { input },
    }: {
      variables: { input: SendDeliveryInboxReplyInput };
    }) => {
      saved = {
        ...result(),
        receipt: {
          ...result().receipt!,
          bodyFingerprint: await inboxCommandHash({ kind: 'SEND', input }),
        },
      };
      throw new Error('Committed response lost');
    },
  );
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Request sending' }));
  await screen.findByText(/This result is unconfirmed/);
  mockQuery.mockImplementationOnce(async () => ({
    data: { deliveryInboxRequest: saved },
  }));
  await user.click(
    screen.getByRole('button', { name: 'Check saved inbox request' }),
  );
  expect(
    await screen.findByText(/a send request alone does not confirm delivery/),
  ).toBeVisible();
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockSaved).toHaveBeenCalledWith(saved);
  expect(screen.getByLabelText('Saved inbox request')).toHaveFocus();
  expect(mockRefetchQueries).toHaveBeenCalledWith({
    include: ['DeliveryInboxConversations', 'DeliveryInboxReplies'],
  });
});

it.each(['actor', 'conversation', 'body', 'operation'])(
  'withholds a mismatched %s receipt rather than accepting the send',
  async (mismatch) => {
    mockSend.mockImplementationOnce(
      async ({
        variables: { input },
      }: {
        variables: { input: SendDeliveryInboxReplyInput };
      }) => {
        const value = result();
        value.receipt!.bodyFingerprint = await inboxCommandHash({
          kind: 'SEND',
          input,
        });
        if (mismatch === 'actor') value.receipt!.actorId = 'other-operator';
        if (mismatch === 'conversation')
          value.receipt!.conversationId = 'other-conversation';
        if (mismatch === 'body')
          value.receipt!.bodyFingerprint = 'b'.repeat(64);
        if (mismatch === 'operation') value.receipt!.action = 'PREPARED';
        return { data: { sendDeliveryInboxReply: value } };
      },
    );
    setup();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Request sending' }));
    expect(await screen.findByText(/This result is unconfirmed/)).toBeVisible();
    expect(mockSaved).not.toHaveBeenCalled();
    expect(mockRefetchQueries).not.toHaveBeenCalled();
  },
);

it('cancels pending results after authority loss even if the old response eventually arrives', async () => {
  let finish: ((value: unknown) => void) | undefined;
  mockSend.mockImplementationOnce(
    ({
      variables: { input },
    }: {
      variables: { input: SendDeliveryInboxReplyInput };
    }) =>
      new Promise((resolve) => {
        finish = async () =>
          resolve({
            data: {
              sendDeliveryInboxReply: {
                ...result(),
                receipt: {
                  ...result().receipt!,
                  bodyFingerprint: await inboxCommandHash({
                    kind: 'SEND',
                    input,
                  }),
                },
              },
            },
          });
      }),
  );
  setup();
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Request sending' }));
  await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  await act(async () => {
    mockAccessCurrent = false;
    finish?.(null);
  });
  expect(mockSaved).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('link', { name: 'Open recorded reply' }),
  ).not.toBeInTheDocument();
});

it('treats a returned bookmark as check-only after deliberate discard', async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'Other page' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('button', { name: 'Request sending' })).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Other page' }));
  mockOwned = false;
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  await act(async () => router.navigate(-1));
  expect(
    screen.queryByRole('button', { name: 'Request sending' }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Check saved inbox request' }),
  );
  expect(
    await screen.findByText(/The unsaved preparation is no longer available/),
  ).toBeVisible();
  expect(mockSend).not.toHaveBeenCalled();
});

it('disposes private preparation when the current read explicitly denies access', async () => {
  mockOwned = false;
  mockQuery.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [{ message: 'Revoked', extensions: { code: 'FORBIDDEN' } }],
    }),
  );
  setup();
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Check saved inbox request' }));
  expect(mockDenied).toHaveBeenCalledTimes(1);
  expect(mockSend).not.toHaveBeenCalled();
});

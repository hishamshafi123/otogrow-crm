import { useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { getOperationAST, type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryVideoQa } from '@/delivery/creative/video-qa/DeliveryVideoQa';
import { type DeliveryVideoQaStartInput } from '~/generated-metadata/graphql';
import {
  VIDEO_QA_IDENTITY,
  VIDEO_QA_TASK_ID,
  VIDEO_QA_ASSET_ID,
  VIDEO_QA_RUN_ID,
  VIDEO_QA_REQUEST_ID,
  videoQaTaskFixture,
  videoQaPreviewFixture,
  videoQaRunFixture,
  videoQaReceiptFixture,
} from '@/delivery/creative/video-qa/__tests__/video-qa.fixtures';

const mockIdentity = VIDEO_QA_IDENTITY;
let mockReady = true;
let mockTaskRevision = 4;
let mockRoles: string[] = ['admin-role'];
let mockRefresh: () => void;
const mockStart = jest.fn();
const mockCancel = jest.fn();
const mockReceipt = jest.fn();
const mockClientQuery = jest.fn();
const mockChanged = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/creative/video-qa/videoQaStyles', () => ({
  StyledVideoQaBoundary: 'fieldset',
  StyledVideoQaFacts: 'dl',
  StyledVideoQaMedia: 'div',
  StyledVideoQaText: 'p',
}));
jest.mock('@/delivery/creative/video-qa/VideoQaEvidenceMedia', () => ({
  VideoQaEvidenceMedia: () => <p>Private evidence is loaded only on request</p>,
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    scope: 'qa-source',
    manager: true,
    canManageRoles: true,
    denied: false,
    access: {
      ...mockIdentity,
      roleIds: mockRoles,
      capabilities: ['workspace.admin', 'creative.modify'],
      grants: [],
    },
    matches: (value?: typeof mockIdentity | null) =>
      mockReady &&
      value?.workspaceId === mockIdentity.workspaceId &&
      value.memberId === mockIdentity.memberId &&
      value.userWorkspaceId === mockIdentity.userWorkspaceId,
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ query: mockClientQuery }),
  useMutation: (document: DocumentNode) => [
    getOperationAST(document)?.name?.value === 'StartDeliveryVideoQa'
      ? mockStart
      : mockCancel,
  ],
  useQuery: (document: DocumentNode) => {
    const name = getOperationAST(document)?.name?.value;
    const run = videoQaRunFixture();
    return {
      data:
        name === 'DeliveryVideoQaState'
          ? { deliveryVideoQaState: run }
          : { deliveryVideoQaRun: run },
      loading: false,
      error: undefined,
      networkStatus: NetworkStatus.ready,
      refetch: async () => ({
        data:
          name === 'DeliveryVideoQaState'
            ? { deliveryVideoQaState: run }
            : { deliveryVideoQaRun: run },
      }),
    };
  },
}));
const setup = (suffix = '') => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    return (
      <>
        <Link to="/other">Other page</Link>
        <DeliveryVideoQa
          task={{ ...videoQaTaskFixture(), revision: mockTaskRevision }}
          onChanged={mockChanged}
        />
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
      { path: '/other', element: <p>Other page opened</p> },
    ],
    {
      initialEntries: [
        `/delivery?view=creative&task=${VIDEO_QA_TASK_ID}&creativeStage=final${suffix}`,
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return router;
};
beforeEach(() => {
  jest.clearAllMocks();
  mockReady = true;
  mockTaskRevision = 4;
  mockRoles = ['admin-role'];
  Object.assign(globalThis, { Request });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockChanged.mockResolvedValue(undefined);
  mockStart.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: DeliveryVideoQaStartInput };
    }) => ({
      data: {
        startDeliveryVideoQa: {
          ...videoQaReceiptFixture(),
          requestId: input.requestId,
          action: 'STARTED',
        },
      },
    }),
  );
  mockReceipt.mockRejectedValue(
    new CombinedGraphQLErrors({
      errors: [{ message: 'Not recorded', extensions: { code: 'NOT_FOUND' } }],
    }),
  );
  mockClientQuery.mockImplementation(
    async ({
      query,
      variables,
    }: {
      query: DocumentNode;
      variables: { input: Record<string, unknown> };
    }) => {
      if (getOperationAST(query)?.name?.value === 'DeliveryVideoQaPreview')
        return {
          data: {
            deliveryVideoQaPreview: {
              ...videoQaPreviewFixture(),
              manualTranscript:
                typeof variables.input.manualTranscript === 'string'
                  ? variables.input.manualTranscript
                  : null,
            },
          },
        };
      return mockReceipt(variables.input);
    },
  );
});
const prepare = async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Prepare a video inspection' }),
  );
  await user.selectOptions(
    screen.getByLabelText('Video to inspect'),
    VIDEO_QA_ASSET_ID,
  );
  return { router, user };
};
it('publishes the stable request before preview and requires explicit reviewed spending confirmation before start', async () => {
  const { router, user } = await prepare();
  const requestId = new URLSearchParams(router.state.location.search).get(
    'creativeQaRequest',
  );
  expect(requestId).toBeTruthy();
  expect(mockStart).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('button', {
      name: 'Preview evidence and maximum reservation',
    }),
  );
  expect(
    await screen.findByText(/Maximum reservation: USD 0.01/),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Start video inspection' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed this evidence, coverage and maximum reservation.',
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Start video inspection' }),
  );
  expect(mockStart.mock.calls[0][0].variables.input).toEqual(
    expect.objectContaining({
      taskId: VIDEO_QA_TASK_ID,
      assetId: VIDEO_QA_ASSET_ID,
      requestId,
      confirm: true,
      sourceFingerprint: videoQaPreviewFixture().sourceFingerprint,
      preparationFingerprint: videoQaPreviewFixture().preparationFingerprint,
    }),
  );
});
it('keeps manual notes through an ordinary access outage and declined navigation', async () => {
  const { user } = await prepare();
  await user.type(
    screen.getByLabelText('Supplemental manual transcript'),
    'Unsent exact speech notes',
  );
  const input = screen.getByLabelText('Supplemental manual transcript');
  mockReady = false;
  act(mockRefresh);
  expect(input).not.toBeVisible();
  mockReady = true;
  act(mockRefresh);
  expect(screen.getByLabelText('Supplemental manual transcript')).toBe(input);
  expect(input).toHaveValue('Unsent exact speech notes');
  await user.click(screen.getByRole('link', { name: 'Other page' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(input).toHaveValue('Unsent exact speech notes');
});
it('preserves owned preparation while opening a recorded inspection in the same task', async () => {
  const { router, user } = await prepare();
  await user.type(
    screen.getByLabelText('Supplemental manual transcript'),
    'Keep while inspecting history',
  );
  await user.click(screen.getByText(/Recorded video inspections/));
  await user.click(
    screen.getByRole('button', { name: /Findings ready for review/ }),
  );
  expect(
    new URLSearchParams(router.state.location.search).get('creativeQaRun'),
  ).toBe(VIDEO_QA_RUN_ID);
  expect(screen.getByLabelText('Supplemental manual transcript')).toHaveValue(
    'Keep while inspecting history',
  );
  expect(
    screen.queryByRole('button', { name: 'Keep editing' }),
  ).not.toBeInTheDocument();
  expect(mockStart).not.toHaveBeenCalled();
});
it('freezes an unknown start and recovers its exact receipt without a second funded request', async () => {
  mockStart.mockRejectedValueOnce(new Error('Lost start reply'));
  const { user } = await prepare();
  await user.type(
    screen.getByLabelText('Supplemental manual transcript'),
    'Original submitted notes',
  );
  await user.click(
    screen.getByRole('button', {
      name: 'Preview evidence and maximum reservation',
    }),
  );
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed this evidence, coverage and maximum reservation.',
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Start video inspection' }),
  );
  expect(
    await screen.findByText(/The start result is unconfirmed/),
  ).toBeVisible();
  expect(
    screen.getByLabelText('Supplemental manual transcript'),
  ).toBeDisabled();
  const input = mockStart.mock.calls[0][0].variables.input;
  mockReceipt.mockResolvedValueOnce({
    data: {
      deliveryVideoQaReceipt: {
        ...videoQaReceiptFixture(),
        requestId: input.requestId,
        action: 'STARTED',
      },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check saved video inspection' }),
  );
  expect(
    await screen.findByText(/The inspection request was saved/),
  ).toBeVisible();
  expect(mockStart).toHaveBeenCalledTimes(1);
});
it('uses old start and cancellation URLs only for exact checking, never to reconstruct or submit a body', async () => {
  setup(
    `&creativeQaRequest=${VIDEO_QA_REQUEST_ID}&creativeQaRun=${VIDEO_QA_RUN_ID}&creativeQaCancel=70000000-0000-4000-8000-000000000001`,
  );
  expect(screen.queryByLabelText('Video to inspect')).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check saved video inspection' }),
  );
  expect(await screen.findByText(/No saved request was found/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Retry exact inspection request' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Confirm inspection cancellation' }),
  ).not.toBeInTheDocument();
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockCancel).not.toHaveBeenCalled();
});
it('cancels queued navigation and disposes private preparation on a confirmed preview denial', async () => {
  const { router, user } = await prepare();
  await user.type(
    screen.getByLabelText('Supplemental manual transcript'),
    'Private denied notes',
  );
  let deny: ((error: Error) => void) | undefined;
  mockClientQuery.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        void resolve;
        deny = reject;
      }),
  );
  await user.click(
    screen.getByRole('button', {
      name: 'Preview evidence and maximum reservation',
    }),
  );
  await user.click(screen.getByRole('link', { name: 'Other page' }));
  expect(screen.getByRole('button', { name: 'Keep editing' })).toBeVisible();
  if (!deny) throw new Error('Preview did not begin.');
  const reject = deny;
  await act(async () =>
    reject(
      new CombinedGraphQLErrors({
        errors: [{ message: 'Denied', extensions: { code: 'FORBIDDEN' } }],
      }),
    ),
  );
  expect(
    screen.queryByDisplayValue('Private denied notes'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Keep editing' }),
  ).not.toBeInTheDocument();
  expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
    'creative',
  );
  expect(mockStart).not.toHaveBeenCalled();
});
it('retries only the identical frozen start after a fresh not-found receipt check', async () => {
  mockStart.mockRejectedValueOnce(new Error('Unknown network outcome'));
  const { user } = await prepare();
  await user.type(
    screen.getByLabelText('Supplemental manual transcript'),
    'Frozen exact transcript',
  );
  await user.click(
    screen.getByRole('button', {
      name: 'Preview evidence and maximum reservation',
    }),
  );
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed this evidence, coverage and maximum reservation.',
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Start video inspection' }),
  );
  const original = mockStart.mock.calls[0][0];
  await user.click(
    screen.getByRole('button', { name: 'Check saved video inspection' }),
  );
  await user.click(
    await screen.findByRole('button', {
      name: 'Retry exact inspection request',
    }),
  );
  expect(mockStart.mock.calls[1][0]).toEqual(original);
  expect(mockStart).toHaveBeenCalledTimes(2);
});
it('retains the notes but blocks a stale prepared source before any funded request', async () => {
  const { user } = await prepare();
  await user.type(
    screen.getByLabelText('Supplemental manual transcript'),
    'Retain these draft notes',
  );
  await user.click(
    screen.getByRole('button', {
      name: 'Preview evidence and maximum reservation',
    }),
  );
  mockTaskRevision = 5;
  act(mockRefresh);
  expect(screen.getByLabelText('Supplemental manual transcript')).toHaveValue(
    'Retain these draft notes',
  );
  expect(
    screen.getByRole('button', { name: 'Start video inspection' }),
  ).toBeDisabled();
  expect(
    screen.getByText(/Production changed. Preview the current evidence again/),
  ).toBeVisible();
  expect(mockStart).not.toHaveBeenCalled();
});

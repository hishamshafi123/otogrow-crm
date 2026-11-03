import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { creativeLearningCommandHash } from '@/delivery/creative/learning/creative-learning-command';
import { type DeliveryCreativeAdLinkSaveInput } from '~/generated-metadata/graphql';
import { useLayoutEffect, useState } from 'react';
import { getOperationAST, type DocumentNode } from 'graphql';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { CreativeLearningAttempt } from '@/delivery/creative/learning/CreativeLearningAttempt';
import { type CreativeLearningCommandAccess } from '@/delivery/creative/learning/useCreativeLearningCommands';
import { type CreativeLearningReceipt } from '@/delivery/creative/learning/creative-learning.types';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
const LINK = '10000000-0000-4000-8000-000000000001',
  REQUEST = '10000000-0000-4000-8000-000000000002',
  PROJECT = '10000000-0000-4000-8000-000000000003';
const identity = {
  workspaceId: 'workspace',
  memberId: 'author',
  userWorkspaceId: 'membership',
};
const access: CreativeLearningCommandAccess = {
  source: 'same-current-author',
  capture: () => () => true,
  matches: (value) =>
    value.workspaceId === identity.workspaceId &&
    value.memberId === identity.memberId &&
    value.userWorkspaceId === identity.userWorkspaceId,
};
let mockFreshIntent = true;
const mockSave = jest.fn(),
  mockDecide = jest.fn(),
  mockQuery = jest.fn(),
  mockRefetchQueries = jest.fn(),
  mockSaved = jest.fn();
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/creative/learning/creativeLearningStyles', () => ({
  StyledLearningBoundary: 'fieldset',
}));
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({
    query: mockQuery,
    refetchQueries: mockRefetchQueries,
  }),
  useMutation: (document: DocumentNode) => [
    getOperationAST(document)?.name?.value === 'SaveDeliveryCreativeAdLink'
      ? mockSave
      : mockDecide,
  ],
}));
const receipt = (): CreativeLearningReceipt => ({
  ...identity,
  observedAt: '2026-11-03T00:00:00.000000Z',
  actor: {
    memberId: 'author',
    isAdmin: false,
    isManager: false,
    roleIds: [],
    capabilities: [],
  },
  inputHash: 'a'.repeat(64),
  receipt: {
    requestId: REQUEST,
    linkId: LINK,
    lessonId: null,
    action: 'SAVE',
    revision: 1,
    version: 1,
    state: 'DRAFT',
    actorName: 'Editor',
    note: '',
    createdAt: '2026-11-03T00:00:00.000000Z',
  },
});
const notFound = () =>
  new CombinedGraphQLErrors({
    errors: [{ message: 'Not recorded', extensions: { code: 'NOT_FOUND' } }],
  });
const Page = () => {
  const [owned] = useState(mockFreshIntent);
  useLayoutEffect(() => {
    mockFreshIntent = false;
  }, []);
  const [note, setNote] = useState('');
  return (
    <>
      <Link to="/other">Other page</Link>
      <CreativeLearningAttempt
        state={access}
        linkId={LINK}
        requestId={REQUEST}
        action="SAVE"
        owned={owned}
        enabled
        onDenied={() => undefined}
        onSaved={mockSaved}
      >
        {({ execute }) => (
          <>
            <label>
              Association notes
              <textarea
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
              />
            </label>
            <button
              onClick={() =>
                void execute({
                  kind: 'SAVE',
                  input: {
                    id: LINK,
                    requestId: REQUEST,
                    projectId: PROJECT,
                    sourceId: PROJECT,
                    adId: '12345',
                    taskId: PROJECT,
                    submissionVersion: 1,
                    assetId: PROJECT,
                    goal: {
                      kind: 'PURCHASES',
                      metricKey: 'meta:purchase',
                      metricAdId: '12345',
                      provenance: 'REPORT',
                      value: '0',
                      evidence: '',
                      targetCostMicros: null,
                    },
                    declaredComponents: [],
                    declaredCopy: null,
                    associationEvidence: 'Verified in the client ad review',
                    evidenceUrl: '',
                    note,
                    correctsId: null,
                    revision: 0,
                    previewFingerprint: 'b'.repeat(64),
                  },
                })
              }
            >
              Save proposal
            </button>
          </>
        )}
      </CreativeLearningAttempt>
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
              <Page />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
      { path: '/other', element: <p>Other page opened</p> },
    ],
    {
      initialEntries: [
        `/delivery?view=creative&creativeView=learning&learningLink=${LINK}&learningRequest=${REQUEST}&learningMode=new`,
      ],
    },
  );
  render(<RouterProvider router={router} />);
  return router;
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRefetchQueries.mockResolvedValue([]);
  mockFreshIntent = true;
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
  mockSave.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: DeliveryCreativeAdLinkSaveInput };
    }) => ({
      data: {
        saveDeliveryCreativeAdLink: {
          ...receipt(),
          inputHash: await creativeLearningCommandHash({ kind: 'SAVE', input }),
        },
      },
    }),
  );
  mockQuery.mockRejectedValue(notFound());
});
it('retains edited association notes on Keep editing and makes an abandoned Back/Forward preparation check-only', async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Association notes'),
    'Retain this explanation',
  );
  await user.click(screen.getByRole('link', { name: 'Other page' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Association notes')).toHaveValue(
    'Retain this explanation',
  );
  await user.click(screen.getByRole('link', { name: 'Other page' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByText('Other page opened')).toBeVisible();
  await act(async () => router.navigate(-1));
  expect(screen.queryByLabelText('Association notes')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Check saved request' }));
  expect(
    await screen.findByText(/Unsaved preparation is no longer available/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Retry exact submitted request' }),
  ).not.toBeInTheDocument();
  expect(mockSave).not.toHaveBeenCalled();
});
it('freezes an unknown save and retries only the exact submitted body after a fresh absence check', async () => {
  mockSave.mockRejectedValueOnce(new Error('Reply lost'));
  setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Association notes'),
    'Original frozen note',
  );
  await user.click(screen.getByRole('button', { name: 'Save proposal' }));
  expect(await screen.findByText(/The result is unconfirmed/)).toBeVisible();
  expect(screen.getByLabelText('Association notes')).toBeDisabled();
  const original = mockSave.mock.calls[0][0];
  await user.click(screen.getByRole('button', { name: 'Check saved request' }));
  await user.click(
    await screen.findByRole('button', {
      name: 'Retry exact submitted request',
    }),
  );
  expect(mockSave.mock.calls[1][0]).toEqual(original);
  expect(
    await screen.findByRole('link', { name: 'Open saved association' }),
  ).toBeVisible();
  expect(mockSaved).toHaveBeenCalledTimes(1);
  expect(mockRefetchQueries).toHaveBeenCalledWith({
    include: ['DeliveryCreativeAdLinks', 'DeliveryCreativeLessons'],
  });
});
it('recovers a committed save without a second mutation', async () => {
  mockSave.mockRejectedValueOnce(new Error('Lost committed reply'));
  setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Association notes'),
    'Committed original note',
  );
  await user.click(screen.getByRole('button', { name: 'Save proposal' }));
  const input = mockSave.mock.calls[0][0].variables.input;
  const recorded = {
    ...receipt(),
    inputHash: await creativeLearningCommandHash({ kind: 'SAVE', input }),
  };
  mockQuery.mockResolvedValueOnce({
    data: { deliveryCreativeLearningReceipt: recorded },
  });
  await user.click(
    await screen.findByRole('button', { name: 'Check saved request' }),
  );
  expect(
    await screen.findByText(/matches your submitted preparation/),
  ).toBeVisible();
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockSaved).toHaveBeenCalledWith(recorded);
});
it('keeps the form editable after a definite validation rejection while retaining all original notes', async () => {
  mockSave.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [
        {
          message: 'Select an eligible independently approved creative.',
          extensions: { code: 'BAD_USER_INPUT' },
        },
      ],
    }),
  );
  setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Association notes'),
    'Original validation note',
  );
  await user.click(screen.getByRole('button', { name: 'Save proposal' }));
  expect(
    await screen.findByText(
      'Select an eligible independently approved creative.',
    ),
  ).toBeVisible();
  expect(screen.getByLabelText('Association notes')).toBeEnabled();
  expect(screen.getByLabelText('Association notes')).toHaveValue(
    'Original validation note',
  );
  expect(
    screen.queryByRole('button', { name: 'Retry exact submitted request' }),
  ).not.toBeInTheDocument();
});
it('does not acknowledge a receipt belonging to a different association or action', async () => {
  mockFreshIntent = false;
  setup();
  mockQuery.mockResolvedValueOnce({
    data: {
      deliveryCreativeLearningReceipt: {
        ...receipt(),
        receipt: { ...receipt().receipt, action: 'REVIEW' },
      },
    },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Check saved request' }),
  );
  expect(
    await screen.findByText(/does not match this preparation/),
  ).toBeVisible();
  expect(mockSaved).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
});
it('keeps a conflicting request frozen and refuses a same-identity receipt for a different committed body', async () => {
  mockSave.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [
        {
          message: 'This request belongs to a different learning command.',
          extensions: { code: 'CONFLICT' },
        },
      ],
    }),
  );
  setup();
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText('Association notes'),
    'Keep the exact conflicting body',
  );
  await user.click(screen.getByRole('button', { name: 'Save proposal' }));
  expect(await screen.findByText(/This request conflicts/)).toBeVisible();
  expect(screen.getByLabelText('Association notes')).toBeDisabled();
  mockQuery.mockResolvedValueOnce({
    data: {
      deliveryCreativeLearningReceipt: {
        ...receipt(),
        inputHash: 'f'.repeat(64),
      },
    },
  });
  await user.click(screen.getByRole('button', { name: 'Check saved request' }));
  expect(
    await screen.findByText(/A different preparation was recorded/),
  ).toBeVisible();
  expect(screen.getByLabelText('Association notes')).toHaveValue(
    'Keep the exact conflicting body',
  );
  expect(screen.getByLabelText('Association notes')).toBeDisabled();
  expect(mockSaved).not.toHaveBeenCalled();
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', { name: 'Retry exact submitted request' }),
  ).not.toBeInTheDocument();
});
it('labels a bodyless immutable receipt as an earlier saved request rather than a restored preparation', async () => {
  mockFreshIntent = false;
  setup();
  mockQuery.mockResolvedValueOnce({
    data: { deliveryCreativeLearningReceipt: receipt() },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Check saved request' }),
  );
  expect(
    await screen.findByText(/An earlier saved request was found/),
  ).toBeVisible();
  expect(
    screen.queryByText(/matches your submitted preparation/),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Association notes')).not.toBeInTheDocument();
  expect(mockSave).not.toHaveBeenCalled();
});

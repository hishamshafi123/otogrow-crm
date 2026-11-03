import { StrictMode, useState } from 'react';
import type * as ReactTypes from 'react';
import { NetworkStatus } from '@apollo/client';
import { getOperationAST, type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { AdvertisingReviewForm } from '@/delivery/advertising/workbench/AdvertisingReviewForm';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  ADVERTISING_IDENTITY,
  ADVERTISING_REPORT_ID,
  ADVERTISING_REVIEW_ID,
  ADVERTISING_REQUEST_ID,
  advertisingContext,
  advertisingSource,
} from '@/delivery/advertising/workbench/__tests__/advertising-workbench.fixtures';
import {
  advertisingDraftDetail,
  advertisingDraftPreview,
  advertisingOwnedDraft,
  DRAFT_AGENT_ID,
} from '@/delivery/advertising/drafts/__tests__/advertising-draft.fixtures';
import {
  type AdvertisingDraftDetail,
  type AdvertisingDraftReceipt,
} from '@/delivery/advertising/drafts/advertising-draft-types';
import {
  type StartDeliveryAdvertisingDraftInput,
  type CancelDeliveryAdvertisingDraftInput,
  type DeliveryAdvertisingDraftPreviewInput,
  type SaveDeliveryAdvertisingReviewInput,
} from '~/generated-metadata/graphql';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
  StyledDeliveryGrid: 'div',
}));
jest.mock(
  '@/delivery/advertising/workbench/advertisingWorkbenchStyles',
  () => ({
    StyledAdvertisingBoundary: 'fieldset',
    StyledAdvertisingItem: 'article',
    StyledAdvertisingFacts: 'dl',
    StyledAdvertisingText: 'p',
  }),
);
jest.mock('@/ui/field/display/components/DateTimeDisplay', () => ({
  DateTimeDisplay: ({ value }: { value?: string | null }) => (
    <span>{value}</span>
  ),
}));

let mockReady = true;
let mockVersion = 0;
let mockLoseStart = false;
let mockStartQueued = false;
let mockLoseCancel = false;
let mockWithManualAction = true;
let mockSavedRun: AdvertisingDraftDetail | null = null;
let mockVerification: Promise<{
  data: { deliveryAdvertisingDraftRun: AdvertisingDraftDetail };
}> | null = null;
const mockListeners = new Set<() => void>();
const mockReceipts = new Map<string, AdvertisingDraftReceipt>();
const mockRefresh = jest.fn(async () => undefined);
const mockSave = jest.fn<
  Promise<boolean>,
  [SaveDeliveryAdvertisingReviewInput]
>(async () => false);
jest.mock('@/delivery/assistants/useAssistantAccess', () => ({
  useAssistantAccess: () => {
    const { useSyncExternalStore } =
      jest.requireActual<typeof ReactTypes>('react');
    useSyncExternalStore(
      (listener) => {
        mockListeners.add(listener);
        return () => {
          mockListeners.delete(listener);
        };
      },
      () => mockVersion,
    );
    const actor = advertisingContext().actor;
    return {
      source: 'advertising-flow-identity',
      administrator: true,
      permission: {
        ready: mockReady,
        denied: false,
        manager: true,
        canManageRoles: true,
        scope: 'workspace:member',
        access: {
          ...ADVERTISING_IDENTITY,
          capabilities: actor.capabilities,
          roleIds: actor.roleIds,
          grants: [],
        },
        matches: (value: typeof ADVERTISING_IDENTITY | null | undefined) =>
          mockReady &&
          value?.workspaceId === ADVERTISING_IDENTITY.workspaceId &&
          value.memberId === ADVERTISING_IDENTITY.memberId &&
          value.userWorkspaceId === ADVERTISING_IDENTITY.userWorkspaceId,
        refetch: mockRefresh,
      },
    };
  },
}));
const mockSummary = () =>
  mockSavedRun
    ? {
        id: mockSavedRun.run.id,
        requestId: mockSavedRun.run.requestId,
        initiatorId: mockSavedRun.run.initiatorId,
        initiatorName: mockSavedRun.run.initiatorName,
        sourceKind: mockSavedRun.run.sourceKind,
        sourceId: mockSavedRun.run.sourceId,
        projectId: mockSavedRun.run.projectId,
        status: mockSavedRun.run.status,
        revision: mockSavedRun.run.revision,
        agent: mockSavedRun.run.agent,
        createdAt: mockSavedRun.run.createdAt,
        startedAt: mockSavedRun.run.startedAt,
        finishedAt: mockSavedRun.run.finishedAt,
        error: mockSavedRun.run.error,
      }
    : null;
const mockQuery = (
  document: DocumentNode,
  options: { skip?: boolean; variables?: { input?: { id?: string } } } = {},
) => {
  const name = getOperationAST(document)?.name?.value;
  const context = advertisingContext();
  const identity = {
    ...ADVERTISING_IDENTITY,
    actor: context.actor,
    observedAt: context.observedAt,
  };
  let data: Record<string, unknown> | undefined;
  if (name === 'DeliveryAdvertisingContext')
    data = { deliveryAdvertisingContext: context };
  if (name === 'DeliveryAssistantCatalog')
    data = {
      deliveryAssistantCatalog: {
        ...ADVERTISING_IDENTITY,
        observedAt: context.observedAt,
        totalCount: 1,
        nextCursor: null,
        items: [
          {
            id: DRAFT_AGENT_ID,
            name: 'Account recommendation assistant',
            purpose: 'Prepare account-level proposals.',
            kind: 'ADVERTISING',
            enabled: true,
            version: 2,
            requiredInputs: ['report'],
            createdAt: context.observedAt,
            updatedAt: context.observedAt,
            canRun: true,
          },
        ],
      },
    };
  if (name === 'DeliveryAdvertisingDraftRuns')
    data = {
      deliveryAdvertisingDraftRuns: {
        ...identity,
        scope: 'runs',
        totalCount: mockSavedRun ? 1 : 0,
        nextCursor: null,
        items: mockSavedRun ? [mockSummary()] : [],
      },
    };
  if (
    name === 'DeliveryAdvertisingDraftRunState' &&
    mockSavedRun !== null &&
    mockSavedRun.run.id === options.variables?.input?.id
  )
    data = {
      deliveryAdvertisingDraftRunState: {
        ...identity,
        run: mockSummary(),
        currentSourceFingerprint: mockSavedRun.currentSourceFingerprint,
        canUseResult: mockSavedRun.run.status === 'SUCCEEDED',
        canCancel: ['QUEUED', 'RUNNING'].includes(mockSavedRun.run.status),
        blockingReasons: [],
      },
    };
  if (
    name === 'DeliveryAdvertisingDraftRun' &&
    mockSavedRun?.run.id === options.variables?.input?.id
  )
    data = { deliveryAdvertisingDraftRun: mockSavedRun };
  return {
    data: options.skip ? undefined : data,
    loading: false,
    networkStatus: NetworkStatus.ready,
    error: undefined,
    refetch: async () => ({ data }),
  };
};
const mockClientQuery = jest.fn(
  async (options: {
    query: DocumentNode;
    variables: {
      input:
        | DeliveryAdvertisingDraftPreviewInput
        | { requestId: string; action: string }
        | { id: string };
    };
  }) => {
    const name = getOperationAST(options.query)?.name?.value;
    const context = advertisingContext();
    const identity = {
      ...ADVERTISING_IDENTITY,
      actor: context.actor,
      observedAt: context.observedAt,
    };
    if (
      name === 'DeliveryAdvertisingDraftPreview' &&
      'goal' in options.variables.input
    ) {
      const preview = advertisingDraftPreview();
      return {
        data: {
          deliveryAdvertisingDraftPreview: {
            ...preview,
            context: {
              ...preview.context,
              instructions: options.variables.input.instructions,
              goal: {
                ...preview.context.goal,
                ...options.variables.input.goal,
              },
            },
          },
        },
      };
    }
    if (
      name === 'DeliveryAdvertisingDraftRequest' &&
      'requestId' in options.variables.input
    )
      return {
        data: {
          deliveryAdvertisingDraftRequest: {
            ...identity,
            receipt:
              mockReceipts.get(options.variables.input.requestId) ?? null,
            run: mockSummary(),
          },
        },
      };
    if (name === 'DeliveryAdvertisingDraftRun')
      return (
        mockVerification ?? {
          data: { deliveryAdvertisingDraftRun: mockSavedRun },
        }
      );
    throw new Error('Unexpected exact read');
  },
);
const mockStart = jest.fn(
  async (options: {
    variables: { input: StartDeliveryAdvertisingDraftInput };
  }) => {
    const input = options.variables.input;
    const detail = advertisingDraftDetail();
    mockSavedRun = {
      ...detail,
      run: {
        ...detail.run,
        id: input.id,
        requestId: input.requestId,
        status: mockStartQueued ? 'QUEUED' : 'SUCCEEDED',
        revision: mockStartQueued ? 1 : 3,
        context: {
          ...detail.run.context,
          instructions: input.instructions,
          goal: { ...detail.run.context.goal, ...input.goal },
        },
      },
    };
    const receipt: AdvertisingDraftReceipt = {
      action: 'STARTED',
      requestId: input.requestId,
      runId: input.id,
      actorId: ADVERTISING_IDENTITY.memberId,
      userWorkspaceId: ADVERTISING_IDENTITY.userWorkspaceId,
      inputHash: 'a'.repeat(64),
      bodyFingerprint: input.bodyFingerprint,
      createdAt: detail.run.createdAt,
      revision: 1,
      status: 'QUEUED',
    };
    mockReceipts.set(input.requestId, receipt);
    if (mockLoseStart) throw new Error('Lost response after commit');
    return {
      data: {
        startDeliveryAdvertisingDraft: {
          ...ADVERTISING_IDENTITY,
          actor: detail.actor,
          observedAt: detail.observedAt,
          receipt,
          run: mockSummary(),
        },
      },
    };
  },
);
const mockCancel = jest.fn(
  async (options: {
    variables: { input: CancelDeliveryAdvertisingDraftInput };
  }) => {
    if (!mockSavedRun) throw new Error('Missing run');
    const input = options.variables.input;
    const receipt: AdvertisingDraftReceipt = {
      action: 'CANCELLED',
      requestId: input.requestId,
      runId: input.id,
      actorId: ADVERTISING_IDENTITY.memberId,
      userWorkspaceId: ADVERTISING_IDENTITY.userWorkspaceId,
      inputHash: 'b'.repeat(64),
      bodyFingerprint: mockSavedRun.run.bodyFingerprint,
      createdAt: mockSavedRun.observedAt,
      revision: input.revision + 1,
      status: 'CANCELLED',
    };
    mockSavedRun = {
      ...mockSavedRun,
      canCancel: false,
      canUseResult: false,
      run: {
        ...mockSavedRun.run,
        revision: input.revision + 1,
        status: 'CANCELLED',
        result: null,
      },
    };
    mockReceipts.set(input.requestId, receipt);
    if (mockLoseCancel) throw new Error('Lost cancellation response');
    return {
      data: {
        cancelDeliveryAdvertisingDraft: {
          ...ADVERTISING_IDENTITY,
          actor: mockSavedRun.actor,
          observedAt: mockSavedRun.observedAt,
          receipt,
          run: mockSummary(),
        },
      },
    };
  },
);
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    document: DocumentNode,
    options: Parameters<typeof mockQuery>[1],
  ) => mockQuery(document, options),
  useApolloClient: () => ({ query: mockClientQuery }),
  useMutation: (document: DocumentNode) => [
    getOperationAST(document)?.name?.value === 'StartDeliveryAdvertisingDraft'
      ? mockStart
      : mockCancel,
    { loading: false },
  ],
}));

const Harness = () => {
  const state = useAdvertisingContext(true);
  const [initial] = useState(() => advertisingOwnedDraft(mockWithManualAction));
  return (
    <DeliveryDraftGuardProvider>
      <Link to="/other">Other work</Link>
      <AdvertisingReviewForm
        initial={initial}
        state={state}
        selection={{ kind: 'META', id: ADVERTISING_REPORT_ID }}
        source={advertisingSource()}
        scope="current-report"
        enabled={state.data !== null}
        busy={false}
        readOnly={false}
        stale={false}
        onSave={mockSave}
      />
    </DeliveryDraftGuardProvider>
  );
};
const mount = () => {
  const router = createMemoryRouter(
    [
      { path: '/delivery', element: <Harness /> },
      { path: '/other', element: <p>Other work opened</p> },
    ],
    {
      initialEntries: [
        `/delivery?view=ads&adSource=META&adReport=${ADVERTISING_REPORT_ID}&adMode=review&adReview=${ADVERTISING_REVIEW_ID}&adRequest=${ADVERTISING_REQUEST_ID}`,
      ],
    },
  );
  render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nProvider>
    </StrictMode>,
  );
  return {
    router,
    user: userEvent.setup(),
    update: () =>
      act(() => {
        mockVersion += 1;
        mockListeners.forEach((listener) => listener());
      }),
  };
};
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
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockReady = true;
  mockLoseStart = false;
  mockStartQueued = false;
  mockLoseCancel = false;
  mockWithManualAction = true;
  mockSavedRun = null;
  mockVerification = null;
  mockReceipts.clear();
  jest.clearAllMocks();
});
const prepare = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole('button', { name: 'Choose an advertising assistant' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Prepare with this assistant' }),
  );
  await user.type(
    screen.getByLabelText('Additional requirements for these suggestions'),
    'Use only supported claims.',
  );
  await user.click(
    screen.getByRole('button', { name: 'Preview report inputs and cost' }),
  );
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed this evidence, its limits and the maximum reservation.',
    }),
  );
};

it('records the paid intent in the URL, starts explicitly and appends to the latest manual draft without a save or assignment', async () => {
  const { user, router } = mount();
  await user.type(
    screen.getByLabelText('Recommendation review summary'),
    ' Keep this additional manual context.',
  );
  await prepare(user);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const parameters = new URLSearchParams(router.state.location.search);
  expect(parameters.get('adRequest')).toBe(ADVERTISING_REQUEST_ID);
  expect(parameters.get('adDraftRequest')).not.toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'Start one suggestion run' }),
  );
  expect(mockStart.mock.calls[0][0].variables.input.requestId).toBe(
    parameters.get('adDraftRequest'),
  );
  expect(mockSave).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Open saved AI run' }));
  await user.click(
    screen.getAllByRole('checkbox', { name: 'Select this suggestion' })[0],
  );
  let completeVerification:
    | ((value: {
        data: { deliveryAdvertisingDraftRun: AdvertisingDraftDetail };
      }) => void)
    | undefined;
  mockVerification = new Promise((resolve) => {
    completeVerification = resolve;
  });
  await user.click(
    screen.getByRole('button', { name: 'Append selected suggestions' }),
  );
  expect(
    screen.getByRole('button', { name: 'Save recommendations for review' }),
  ).toBeDisabled();
  await user.type(
    screen.getByLabelText('Recommendation review summary'),
    ' Written while verification was pending.',
  );
  if (!mockSavedRun) throw new Error('Expected saved run');
  await act(async () => {
    completeVerification?.({
      data: { deliveryAdvertisingDraftRun: mockSavedRun! },
    });
  });
  expect(screen.getByLabelText('Recommendation review summary')).toHaveValue(
    'Keep this manager-written summary. Keep this additional manual context. Written while verification was pending.',
  );
  expect(
    screen
      .getAllByLabelText('Action title')
      .map((input) => (input as HTMLInputElement).value),
  ).toEqual([
    'Keep this manually planned work',
    'Test an alternative product opening',
  ]);
  expect(screen.getAllByLabelText('Due date')[1]).toHaveValue('');
  expect(
    screen.getByRole('checkbox', { name: 'Already added to this draft' }),
  ).toBeDisabled();
  await user.type(
    screen.getAllByLabelText('Action title')[1],
    ' — human revision',
  );
  expect(
    screen.getByText(/Edited by a person\./u, { selector: 'p' }),
  ).toBeVisible();
  expect(mockSave).not.toHaveBeenCalled();
});

it('recovers a lost start by immutable receipt and keeps Back recovery-only without another paid request', async () => {
  mockLoseStart = true;
  const { user, router } = mount();
  await prepare(user);
  const requestUrl = router.state.location.search;
  await user.click(
    screen.getByRole('button', { name: 'Start one suggestion run' }),
  );
  expect(
    screen.getByLabelText('Additional requirements for these suggestions'),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Save recommendations for review' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Check saved AI request' }),
  );
  await user.click(screen.getByRole('button', { name: 'Open saved AI run' }));
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.search).toBe(requestUrl);
  expect(
    screen.queryByLabelText('Additional requirements for these suggestions'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved AI request' }),
  ).toBeEnabled();
  expect(mockStart).toHaveBeenCalledTimes(1);
});

it('retains a same-source prompt during an outage and discards only that prompt when closing AI preparation', async () => {
  const { user, router, update } = mount();
  await user.type(
    screen.getByLabelText('Recommendation review summary'),
    ' Unsaved manual context.',
  );
  await prepare(user);
  mockReady = false;
  update();
  expect(
    screen.getByLabelText('Additional requirements for these suggestions'),
  ).not.toBeVisible();
  mockReady = true;
  update();
  expect(
    screen.getByLabelText('Additional requirements for these suggestions'),
  ).toHaveValue('Use only supported claims.');
  await user.click(
    screen.getByRole('button', { name: 'Close AI preparation' }),
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  await user.click(
    screen.getByRole('button', { name: 'Close AI preparation' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Recommendation review summary')).toHaveValue(
    'Keep this manager-written summary. Unsaved manual context.',
  );
  await user.click(screen.getByRole('link', { name: 'Other work' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  await act(async () => {
    await router.navigate(-1);
  });
  expect(
    screen.queryByLabelText('Additional requirements for these suggestions'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved AI request' }),
  ).toBeEnabled();
  expect(mockStart).not.toHaveBeenCalled();
});

it('keeps an uncertain cancellation protected until its immutable receipt is checked without another command', async () => {
  mockStartQueued = true;
  mockLoseCancel = true;
  const { user, router } = mount();
  await prepare(user);
  await user.click(
    screen.getByRole('button', { name: 'Start one suggestion run' }),
  );
  await user.click(screen.getByRole('button', { name: 'Open saved AI run' }));
  await user.click(
    screen.getByRole('button', { name: 'Cancel suggestion run' }),
  );
  const request = new URLSearchParams(router.state.location.search).get(
    'adDraftCancelRequest',
  );
  expect(request).not.toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'Confirm cancellation' }),
  );
  expect(
    screen.getByRole('button', { name: 'Save recommendations for review' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Check saved cancellation' }),
  );
  expect(screen.getByText('The saved cancellation was found.')).toBeVisible();
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(mockCancel.mock.calls[0][0].variables.input.requestId).toBe(request);
  expect(mockSave).not.toHaveBeenCalled();
});

it('copies a no-change proposal only by explicit action and keeps the manual summary separate', async () => {
  mockWithManualAction = false;
  mockSavedRun = advertisingDraftDetail();
  const { user } = mount();
  await user.click(
    screen.getByRole('button', { name: 'Review previous AI runs' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Open saved suggestions' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Add proposed no-change explanation' }),
  );
  expect(screen.getByLabelText('Recommendation review summary')).toHaveValue(
    'Keep this manager-written summary.',
  );
  expect(screen.getByLabelText('Why no changes are needed')).toHaveValue(
    'Keep current work while gathering comparable evidence.',
  );
  expect(mockSave).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('button', { name: 'Save recommendations for review' }),
  );
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0]).toMatchObject({
    note: 'Keep this manager-written summary.',
    noChangeReason: 'Keep current work while gathering comparable evidence.',
    actions: [],
  });
});

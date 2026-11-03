import { StrictMode } from 'react';
import type * as ReactTypes from 'react';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { getOperationAST, type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { ActivityWorkspace } from '@/otogrow-activity/ActivityWorkspace';
import {
  type ActivityAnalysisDetail,
  type ActivityAnalysisReceipt,
} from '@/otogrow-activity/analysis/activity-analysis.types';
import {
  activityIdentity,
  activityPageContext,
  activityAnalysisPreview,
  activityAnalysisDetail,
  activityAnalysisContext,
  activityCurrentWork,
  activityCurrentAnalysisDetail,
  ACTIVITY_CURRENT_TASK_ID,
  ACTIVITY_AGENT_ID,
  ACTIVITY_EVENT_ID,
} from '@/otogrow-activity/analysis/__tests__/activity-analysis.fixtures';
import {
  type OtogrowActivityAnalysisPreviewInput,
  type StartOtogrowActivityAnalysisInput,
  type CancelOtogrowActivityAnalysisInput,
} from '~/generated-metadata/graphql';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryBadge: 'span',
}));
jest.mock('@/otogrow-activity/activityStyles', () => ({
  StyledActivityBoundary: 'fieldset',
  StyledActivityList: 'ol',
  StyledActivityActions: 'div',
  StyledActivityFilters: 'div',
  StyledActivityEntry: 'div',
  StyledActivityChanges: 'dl',
}));
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));
let mockReady = true;
let mockVersion = 0;
let mockRoleId = 'admin-role';
let mockPageError: Error | undefined;
let mockLoseStart = false;
let mockLoseCancel = false;
let mockStartQueued = false;
let mockEmptyEvidence = false;
let mockTruncatedPage = false;
let mockCurrentIncomplete = false;
let mockCurrentTaskUnavailable = false;
let mockTaskError: Error | undefined;
let mockFreshOwner = 'Editor';
let mockFreshTime = '2026-11-02T10:00:00.000222Z';
const mockTaskReads: unknown[] = [];
let mockSavedRun: ActivityAnalysisDetail | null = null;
const mockListeners = new Set<() => void>();
const mockReceipts = new Map<string, ActivityAnalysisReceipt>();
const mockCurrentIdentity = () => {
  const value = activityIdentity();
  return mockRoleId === 'admin-role'
    ? value
    : {
        ...value,
        scope: `${value.scope}:${mockRoleId}`,
        actor: { ...value.actor, roleIds: [mockRoleId] },
      };
};
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
    const identity = mockCurrentIdentity();
    return {
      source: `current-activity-test-identity:${mockRoleId}`,
      administrator: mockReady,
      permission: {
        ready: mockReady,
        denied: false,
        canManageRoles: true,
        manager: true,
        scope: 'activity-test-membership',
        access: {
          ...identity,
          roleIds: identity.actor.roleIds,
          capabilities: identity.actor.capabilities,
          grants: [],
        },
        matches: (
          value:
            | Pick<
                typeof identity,
                'workspaceId' | 'memberId' | 'userWorkspaceId'
              >
            | null
            | undefined,
        ) =>
          mockReady &&
          value?.workspaceId === identity.workspaceId &&
          value.memberId === identity.memberId &&
          value.userWorkspaceId === identity.userWorkspaceId,
        refetch: jest.fn(),
      },
    };
  },
}));
type QueryOptions = { skip?: boolean; variables?: { input?: unknown } };
const mockQuery = (document: DocumentNode, options: QueryOptions = {}) => {
  const name = getOperationAST(document)?.name?.value;
  const input = options.variables?.input;
  const identity = mockCurrentIdentity();
  let data: Record<string, unknown> | undefined;
  if (name === 'OtogrowActivityContext')
    data = {
      otogrowActivityContext: { ...activityPageContext(), ...identity },
    };
  if (name === 'OtogrowActivityPage')
    data = {
      otogrowActivityPage: {
        ...identity,
        filters:
          input && typeof input === 'object' && 'filters' in input
            ? input.filters
            : activityAnalysisContext().filters,
        events: activityAnalysisContext().events.map((event) => ({
          ...event,
          detailsTruncated: mockTruncatedPage,
        })),
        totalCount: 1,
        nextCursor: null,
        coverageStartedAt: activityPageContext().coverageStartedAt,
      },
    };
  if (name === 'OtogrowActivityOptions')
    data = {
      otogrowActivityOptions: {
        ...identity,
        items: [],
        selected:
          input &&
          typeof input === 'object' &&
          'selectedId' in input &&
          typeof input.selectedId === 'string'
            ? { id: input.selectedId, name: 'Amna' }
            : null,
        totalCount: 0,
        nextCursor: null,
      },
    };
  if (name === 'OtogrowActivityEvent')
    data = {
      otogrowActivityEvent: {
        ...identity,
        event: activityAnalysisContext().events[0],
      },
    };
  if (name === 'OtogrowActivityCurrentTask') {
    const scope =
      input && typeof input === 'object' && 'scope' in input
        ? input.scope
        : null;
    if (!options.skip) mockTaskReads.push(input);
    data = {
      otogrowActivityCurrentTask: {
        ...identity,
        capturedAt: mockFreshTime,
        scopeSelection: scope ?? {
          personId: null,
          projectId: null,
          clientId: null,
        },
        task: mockCurrentTaskUnavailable
          ? null
          : { ...activityCurrentWork().items[0], ownerName: mockFreshOwner },
        unavailableReason: mockCurrentTaskUnavailable
          ? 'NOT_AVAILABLE_IN_SCOPE'
          : null,
      },
    };
  }
  if (name === 'DeliveryAssistantCatalog')
    data = {
      deliveryAssistantCatalog: {
        ...identity,
        items: [
          {
            id: ACTIVITY_AGENT_ID,
            name: 'Recorded-work assistant',
            purpose: 'Use cited structural events only.',
            kind: 'ACTIVITY',
            enabled: true,
            canRun: true,
            version: 2,
            requiredInputs: ['activity', 'question'],
            createdAt: identity.observedAt,
            updatedAt: identity.observedAt,
          },
        ],
        totalCount: 1,
        nextCursor: null,
      },
    };
  if (name === 'OtogrowActivityAnalysisRuns')
    data = {
      otogrowActivityAnalysisRuns: {
        ...identity,
        items: mockSavedRun ? [mockSavedRun.run] : [],
        totalCount: mockSavedRun ? 1 : 0,
        nextCursor: null,
      },
    };
  if (name === 'OtogrowActivityAnalysisRunState' && mockSavedRun)
    data = {
      otogrowActivityAnalysisRunState: {
        ...identity,
        run: mockSavedRun.run,
        canCancel: mockSavedRun.canCancel,
      },
    };
  if (name === 'OtogrowActivityAnalysisRun' && mockSavedRun)
    data = { otogrowActivityAnalysisRun: mockSavedRun };
  return {
    data: options.skip ? undefined : data,
    loading: false,
    error:
      name === 'OtogrowActivityPage'
        ? mockPageError
        : name === 'OtogrowActivityCurrentTask'
          ? mockTaskError
          : undefined,
    networkStatus: NetworkStatus.ready,
    refetch: async () => {
      if (name === 'OtogrowActivityCurrentTask') {
        mockVersion += 1;
        mockListeners.forEach((listener) => listener());
      }
      return { data };
    },
  };
};
const mockClientQuery = jest.fn(
  async (options: {
    query: DocumentNode;
    variables: {
      input:
        | OtogrowActivityAnalysisPreviewInput
        | { requestId: string; action: string };
    };
  }) => {
    const name = getOperationAST(options.query)?.name?.value;
    const input = options.variables.input;
    if (name === 'OtogrowActivityAnalysisPreview' && 'question' in input) {
      const value = activityAnalysisPreview();
      const currentWork = input.includeCurrentWork
        ? {
            ...activityCurrentWork(),
            scope: {
              personId: input.filters.personId ?? null,
              projectId: input.filters.projectId ?? null,
              clientId: input.filters.clientId ?? null,
            },
            complete: !mockCurrentIncomplete,
            totalCount: mockCurrentIncomplete ? 2 : 1,
            omittedCount: mockCurrentIncomplete ? 1 : 0,
          }
        : null;
      return {
        data: {
          otogrowActivityAnalysisPreview: {
            ...value,
            canStart:
              (!mockEmptyEvidence || currentWork !== null) &&
              !mockCurrentIncomplete,
            context: {
              ...value.context,
              filters: input.filters,
              question: input.question,
              ...(currentWork
                ? {
                    currentWork,
                    capturedAt: currentWork.capturedAt,
                    citations:
                      activityCurrentAnalysisDetail().context.citations,
                  }
                : {}),
              events: mockEmptyEvidence ? [] : value.context.events,
              totalCount: mockEmptyEvidence ? 0 : 1,
              includedCount: mockEmptyEvidence ? 0 : 1,
            },
            blockedReasons:
              mockEmptyEvidence && currentWork === null
                ? ['EMPTY_EVIDENCE']
                : [],
          },
        },
      };
    }
    if (name === 'OtogrowActivityAnalysisRequest' && 'requestId' in input)
      return {
        data: {
          otogrowActivityAnalysisRequest: {
            ...activityIdentity(),
            receipt: mockReceipts.get(input.requestId) ?? null,
            run: mockSavedRun?.run ?? null,
          },
        },
      };
    throw new Error('Unexpected exact read');
  },
);
const mockStart = jest.fn(
  async (options: {
    variables: { input: StartOtogrowActivityAnalysisInput };
  }) => {
    const input = options.variables.input;
    const value = input.includeCurrentWork
      ? activityCurrentAnalysisDetail()
      : activityAnalysisDetail();
    mockSavedRun = {
      ...value,
      canCancel: mockStartQueued,
      run: {
        ...value.run,
        id: input.id,
        requestId: input.requestId,
        status: mockStartQueued ? 'QUEUED' : 'SUCCEEDED',
        revision: mockStartQueued ? 1 : 3,
      },
      context: {
        ...value.context,
        filters: input.filters,
        question: input.question,
      },
    };
    const receipt: ActivityAnalysisReceipt = {
      requestId: input.requestId,
      runId: input.id,
      action: 'STARTED',
      actorId: value.memberId,
      userWorkspaceId: value.userWorkspaceId,
      inputHash: 'd'.repeat(64),
      bodyFingerprint: input.bodyFingerprint,
      revision: 1,
      status: 'QUEUED',
      createdAt: value.observedAt,
    };
    mockReceipts.set(receipt.requestId, receipt);
    if (mockLoseStart) throw new Error('Lost response after commit');
    return {
      data: {
        startOtogrowActivityAnalysis: {
          ...activityIdentity(),
          receipt,
          run: mockSavedRun.run,
        },
      },
    };
  },
);
const mockCancel = jest.fn(
  async (options: {
    variables: { input: CancelOtogrowActivityAnalysisInput };
  }) => {
    if (!mockSavedRun) throw new Error('Expected run');
    const input = options.variables.input;
    const receipt: ActivityAnalysisReceipt = {
      requestId: input.requestId,
      runId: input.id,
      action: 'CANCELLED',
      actorId: mockSavedRun.memberId,
      userWorkspaceId: mockSavedRun.userWorkspaceId,
      inputHash: 'e'.repeat(64),
      bodyFingerprint: mockSavedRun.run.bodyFingerprint,
      revision: input.revision + 1,
      status: 'CANCELLED',
      createdAt: mockSavedRun.observedAt,
    };
    mockReceipts.set(receipt.requestId, receipt);
    mockSavedRun = {
      ...mockSavedRun,
      canCancel: false,
      run: {
        ...mockSavedRun.run,
        status: 'CANCELLED',
        revision: receipt.revision,
      },
      result: null,
    };
    if (mockLoseCancel) throw new Error('Lost response after cancellation');
    return {
      data: {
        cancelOtogrowActivityAnalysis: {
          ...activityIdentity(),
          receipt,
          run: mockSavedRun.run,
        },
      },
    };
  },
);
jest.mock('@apollo/client/react', () => ({
  useQuery: (document: DocumentNode, options: QueryOptions) =>
    mockQuery(document, options),
  useApolloClient: () => ({ query: mockClientQuery }),
  useMutation: (document: DocumentNode) => [
    getOperationAST(document)?.name?.value === 'StartOtogrowActivityAnalysis'
      ? mockStart
      : mockCancel,
  ],
}));

const mount = (
  entry = '/delivery?view=activity&activityFrom=2026-10-26&activityThrough=2026-11-01&activityCursor=older-log-page',
) => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <ActivityWorkspace />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/outside', element: <p>Other page</p> },
    ],
    {
      initialEntries: [entry],
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
const prepare = async (
  user: ReturnType<typeof userEvent.setup>,
  includeCurrentWork = false,
) => {
  await user.click(screen.getByRole('button', { name: 'Prepare a question' }));
  await user.click(screen.getByRole('button', { name: 'Use this assistant' }));
  await user.type(
    screen.getByLabelText('Question about this recorded work'),
    'What decisions affected delivery?',
  );
  if (includeCurrentWork)
    await user.click(
      screen.getByRole('checkbox', { name: 'Include current work status' }),
    );
  await user.click(
    screen.getByRole('button', { name: 'Preview evidence and cost' }),
  );
};
const start = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed this evidence, its gaps and the maximum reservation.',
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Start one work analysis' }),
  );
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
  mockRoleId = 'admin-role';
  mockPageError = undefined;
  mockLoseStart = false;
  mockLoseCancel = false;
  mockStartQueued = false;
  mockEmptyEvidence = false;
  mockTruncatedPage = false;
  mockCurrentIncomplete = false;
  mockCurrentTaskUnavailable = false;
  mockTaskError = undefined;
  mockFreshOwner = 'Editor';
  mockFreshTime = '2026-11-02T10:00:00.000222Z';
  mockTaskReads.length = 0;
  mockSavedRun = null;
  mockReceipts.clear();
  jest.clearAllMocks();
});

it('previews the complete filter scope independently of the log cursor and retains the question through exact citations and Back', async () => {
  const { user, router } = mount();
  await prepare(user);
  const preparedUrl = router.state.location.search;
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockClientQuery.mock.calls[0][0].variables.input).toEqual(
    expect.objectContaining({
      filters: expect.not.objectContaining({ cursor: expect.anything() }),
    }),
  );
  expect(screen.getByText(/0\.02 USD/u, { selector: 'p' })).toBeVisible();
  await user.click(screen.getByText('Inspect the recorded evidence'));
  await user.click(
    screen.getByRole('button', { name: /Work reviewed · Amna/u }),
  );
  expect(
    new URLSearchParams(router.state.location.search).get('activityEvent'),
  ).toBe(ACTIVITY_EVENT_ID);
  expect(
    screen.getByRole('region', { name: 'Cited activity event' }),
  ).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.search).toBe(preparedUrl);
  expect(
    screen.getByLabelText('Question about this recorded work'),
  ).toHaveValue('What decisions affected delivery?');
  await start(user);
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockStart.mock.calls[0][0].variables.input).not.toHaveProperty(
    'includeCurrentWork',
  );
  expect(mockCancel).not.toHaveBeenCalled();
});
it('recovers a lost start by receipt and makes Back to an old preparation check-only', async () => {
  mockLoseStart = true;
  const { user, router } = mount();
  await prepare(user);
  const preparedUrl = router.state.location.search;
  await start(user);
  expect(
    screen.getByLabelText('Question about this recorded work'),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Check saved analysis request' }),
  );
  await user.click(screen.getByRole('button', { name: 'Open saved analysis' }));
  expect(
    screen.getByText('Amna recorded a changes request for the editor.'),
  ).toBeVisible();
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.search).toBe(preparedUrl);
  expect(
    screen.queryByLabelText('Question about this recorded work'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved analysis request' }),
  ).toBeEnabled();
  expect(mockStart).toHaveBeenCalledTimes(1);
});
it('retains a same-scope question through ordinary outage but guards a scope change', async () => {
  const { user, router, update } = mount();
  await prepare(user);
  mockReady = false;
  update();
  expect(
    screen.getByLabelText('Question about this recorded work'),
  ).not.toBeVisible();
  mockReady = true;
  update();
  expect(
    screen.getByLabelText('Question about this recorded work'),
  ).toHaveValue('What decisions affected delivery?');
  await act(async () => {
    await router.navigate(
      '/delivery?view=activity&activityFrom=2026-10-25&activityThrough=2026-11-01',
    );
  });
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    screen.getByLabelText('Question about this recorded work'),
  ).toHaveValue('What decisions affected delivery?');
});
it('cancels pending navigation and destroys private questions on a locally confirmed denial before regrant', async () => {
  const { user, router, update } = mount();
  await prepare(user);
  await act(async () => {
    await router.navigate('/outside');
  });
  expect(screen.getByRole('dialog')).toBeVisible();
  mockPageError = new CombinedGraphQLErrors({
    errors: [
      {
        message: 'No current activity access',
        extensions: { code: 'FORBIDDEN' },
      },
    ],
  });
  update();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Question about this recorded work'),
  ).not.toBeInTheDocument();
  mockPageError = undefined;
  update();
  await user.click(
    screen.getByRole('button', { name: 'Check activity access' }),
  );
  expect(router.state.location.pathname).toBe('/delivery');
  expect(
    screen.queryByLabelText('Question about this recorded work'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved analysis request' }),
  ).toBeEnabled();
});
it('does not start paid analysis for an empty evidence preview', async () => {
  mockEmptyEvidence = true;
  const { user } = mount();
  await prepare(user);
  expect(
    screen.getByText(
      'No recorded evidence matches these filters. No paid analysis will start.',
    ),
  ).toBeVisible();
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed this evidence, its gaps and the maximum reservation.',
    }),
  );
  expect(
    screen.getByRole('button', { name: 'Start one work analysis' }),
  ).toBeDisabled();
  expect(mockStart).not.toHaveBeenCalled();
});
it('checks an uncertain cancellation without issuing a second cancellation', async () => {
  mockStartQueued = true;
  mockLoseCancel = true;
  const { user, router } = mount();
  await prepare(user);
  await start(user);
  await user.click(screen.getByRole('button', { name: 'Open saved analysis' }));
  await user.click(
    screen.getByRole('button', { name: 'Prepare cancellation' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Confirm cancellation' }),
  );
  const cancellationId = new URLSearchParams(router.state.location.search).get(
    'activityAnalysisCancel',
  );
  const originalReceipt = cancellationId
    ? mockReceipts.get(cancellationId)
    : undefined;
  if (!cancellationId || !originalReceipt)
    throw new Error('Expected recorded cancellation');
  mockReceipts.set(cancellationId, {
    ...originalReceipt,
    actorId: ACTIVITY_AGENT_ID,
  });
  await user.click(
    screen.getByRole('button', { name: 'Check cancellation request' }),
  );
  expect(
    screen.getByText(
      'Cancellation could not be checked. Keep this view open and check again.',
    ),
  ).toBeVisible();
  mockReceipts.set(cancellationId, originalReceipt);
  await user.click(
    screen.getByRole('button', { name: 'Check cancellation request' }),
  );
  expect(screen.getByText('The saved cancellation was found.')).toBeVisible();
  expect(mockCancel).toHaveBeenCalledTimes(1);
});

it('labels a shortened page preview and opens the exact event without losing filters', async () => {
  mockTruncatedPage = true;
  const { user, router } = mount();
  expect(
    screen.getByText(
      'Preview shortened. Open the exact event to read the complete recorded details.',
    ),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Open exact event' }));
  expect(
    screen.getByRole('region', { name: 'Cited activity event' }),
  ).toBeVisible();
  const parameters = new URLSearchParams(router.state.location.search);
  expect(parameters.get('activityFrom')).toBe('2026-10-26');
  expect(parameters.get('activityEvent')).toBe(ACTIVITY_EVENT_ID);
  expect(mockStart).not.toHaveBeenCalled();
});

it('cancels queued navigation before replacing a question after a verified admin-preserving role change', async () => {
  const { user, router, update } = mount();
  await prepare(user);
  await act(async () => {
    await router.navigate('/outside');
  });
  expect(screen.getByRole('dialog')).toBeVisible();
  mockRoleId = 'another-current-admin-role';
  update();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/delivery');
  expect(
    screen.queryByLabelText('Question about this recorded work'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved analysis request' }),
  ).toBeEnabled();
});

it('retains person, dates and the question when keeping a guarded filter reset, then clears them together on discard', async () => {
  const personId = activityIdentity().memberId;
  const { user, router } = mount(
    `/delivery?view=activity&activityPerson=${personId}&activityFrom=2026-10-26&activityThrough=2026-11-01`,
  );
  await prepare(user);
  const preparedUrl = router.state.location.search;
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(router.state.location.search).toBe(preparedUrl);
  expect(screen.getByRole('button', { name: 'Person: Amna' })).toBeVisible();
  expect(screen.getByLabelText('From date (UTC)')).toHaveValue('2026-10-26');
  expect(screen.getByLabelText('Through date (UTC)')).toHaveValue('2026-11-01');
  expect(
    screen.getByLabelText('Question about this recorded work'),
  ).toHaveValue('What decisions affected delivery?');
  expect(screen.getByText('Filters · 3 active')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Person: All records' }),
  ).toBeVisible();
  expect(screen.getByLabelText('From date (UTC)')).toHaveValue('');
  expect(screen.getByLabelText('Through date (UTC)')).toHaveValue('');
  expect(
    screen.queryByLabelText('Question about this recorded work'),
  ).not.toBeInTheDocument();
  const parameters = new URLSearchParams(router.state.location.search);
  expect(parameters.has('activityPerson')).toBe(false);
  expect(parameters.has('activityFrom')).toBe(false);
  expect(parameters.has('activityAnalysisRequest')).toBe(false);
  expect(mockStart).not.toHaveBeenCalled();
});

it('keeps current work opt-in off and unavailable without a person, project or client scope', async () => {
  const { user } = mount();
  await prepare(user);
  const option = screen.getByRole('checkbox', {
    name: 'Include current work status',
  });
  expect(option).not.toBeChecked();
  expect(option).toBeDisabled();
  expect(
    screen.getByText(
      'Select a Person, Project or Client before including current work.',
    ),
  ).toBeVisible();
});

it('permits an explicit complete current-work question with zero matching audit events', async () => {
  mockEmptyEvidence = true;
  const personId = activityIdentity().memberId;
  const { user } = mount(
    `/delivery?view=activity&activityPerson=${personId}&activityFrom=2026-10-26&activityThrough=2026-11-01`,
  );
  await prepare(user, true);
  expect(
    screen.getByRole('region', { name: 'Current work snapshot' }),
  ).toBeVisible();
  expect(
    screen.queryByText(
      'No recorded evidence matches these filters. No paid analysis will start.',
    ),
  ).not.toBeInTheDocument();
  await start(user);
  expect(mockStart.mock.calls[0][0].variables.input.includeCurrentWork).toBe(
    true,
  );
  expect(mockStart).toHaveBeenCalledTimes(1);
});

it('retains an opted-in question and its frozen preview through a scoped current-task check and Back', async () => {
  const personId = activityIdentity().memberId;
  const { user, router } = mount(
    `/delivery?view=activity&activityPerson=${personId}&activityFrom=2026-10-26&activityThrough=2026-11-01`,
  );
  await prepare(user, true);
  const preparedUrl = router.state.location.search;
  await user.click(screen.getByText('Inspect captured current task facts'));
  await user.click(
    screen.getByRole('button', {
      name: /^Task snapshot · Launch video awaiting review/u,
    }),
  );
  expect(
    screen.getByRole('region', { name: 'Current task evidence' }),
  ).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mockTaskReads.at(-1)).toEqual({
    taskId: ACTIVITY_CURRENT_TASK_ID,
    scope: { personId, projectId: null, clientId: null },
  });
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.search).toBe(preparedUrl);
  expect(
    screen.getByLabelText('Question about this recorded work'),
  ).toHaveValue('What decisions affected delivery?');
  expect(
    screen.getByRole('checkbox', { name: 'Include current work status' }),
  ).toBeChecked();
  expect(mockStart).not.toHaveBeenCalled();
});

it('uses a saved run’s frozen task scope rather than unrelated visible filters and keeps fresh checks separate', async () => {
  mockSavedRun = activityCurrentAnalysisDetail();
  const visiblePersonId = '40000000-0000-4000-8000-000000000099';
  const { user } = mount(
    `/delivery?view=activity&activityPerson=${visiblePersonId}&activityFrom=2026-10-26&activityThrough=2026-11-01&activityAnalysis=history&activityAnalysisRun=${mockSavedRun.run.id}`,
  );
  await user.click(
    screen.getAllByRole('button', {
      name: /^Task snapshot · Launch video awaiting review/u,
    })[0],
  );
  expect(mockTaskReads.at(-1)).toEqual({
    taskId: ACTIVITY_CURRENT_TASK_ID,
    scope: activityCurrentWork().scope,
  });
  expect(screen.getByText(/Saved facts captured at/u)).toBeVisible();
  mockFreshOwner = 'New owner';
  mockFreshTime = '2026-11-02T11:00:00.000333Z';
  await user.click(
    screen.getByRole('button', { name: 'Refresh live task facts' }),
  );
  expect(screen.getByText('New owner')).toBeVisible();
  expect(
    screen.getByText(
      'The fresh facts differ from or add to the saved snapshot. The saved answer remains unchanged.',
    ),
  ).toBeVisible();
  expect(mockSavedRun.context.currentWork?.items[0].ownerName).toBe('Editor');
  mockCurrentTaskUnavailable = true;
  await user.click(
    screen.getByRole('button', { name: 'Refresh live task facts' }),
  );
  expect(
    screen.getByText(
      'This task is no longer available in the selected scope. Saved facts remain historical.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Open full task' }),
  ).not.toBeInTheDocument();
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockCancel).not.toHaveBeenCalled();
});

it('blocks incomplete current evidence and invalidates confirmation when the opt-in changes', async () => {
  mockCurrentIncomplete = true;
  const personId = activityIdentity().memberId;
  const { user } = mount(
    `/delivery?view=activity&activityPerson=${personId}&activityFrom=2026-10-26&activityThrough=2026-11-01`,
  );
  await prepare(user, true);
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed this evidence, its gaps and the maximum reservation.',
    }),
  );
  expect(
    screen.getByRole('button', { name: 'Start one work analysis' }),
  ).toBeDisabled();
  expect(
    screen.getByText(
      'Current-work evidence is incomplete or shortened. Narrow the selected people, projects or clients before starting.',
    ),
  ).toBeVisible();
  await user.click(
    screen.getByRole('checkbox', { name: 'Include current work status' }),
  );
  expect(
    screen.queryByRole('button', { name: 'Start one work analysis' }),
  ).not.toBeInTheDocument();
  expect(mockStart).not.toHaveBeenCalled();
});

it('disposes an opted-in private question and cancels pending navigation on current-task denial', async () => {
  const personId = activityIdentity().memberId;
  const { user, router, update } = mount(
    `/delivery?view=activity&activityPerson=${personId}&activityFrom=2026-10-26&activityThrough=2026-11-01`,
  );
  await prepare(user, true);
  await user.click(screen.getByText('Inspect captured current task facts'));
  await user.click(
    screen.getByRole('button', {
      name: /^Task snapshot · Launch video awaiting review/u,
    }),
  );
  await act(async () => {
    await router.navigate('/outside');
  });
  expect(screen.getByRole('dialog')).toBeVisible();
  mockTaskError = new CombinedGraphQLErrors({
    errors: [
      {
        message: 'Current task access denied',
        extensions: { code: 'FORBIDDEN' },
      },
    ],
  });
  update();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Question about this recorded work'),
  ).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/delivery');
  mockTaskError = undefined;
  update();
  await user.click(
    screen.getByRole('button', { name: 'Check activity access' }),
  );
  expect(
    screen.queryByLabelText('Question about this recorded work'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved analysis request' }),
  ).toBeEnabled();
});

it('keeps the opted-in submitted body frozen while recovering a lost response', async () => {
  mockLoseStart = true;
  const personId = activityIdentity().memberId;
  const { user } = mount(
    `/delivery?view=activity&activityPerson=${personId}&activityFrom=2026-10-26&activityThrough=2026-11-01`,
  );
  await prepare(user, true);
  await start(user);
  expect(
    screen.getByRole('checkbox', { name: 'Include current work status' }),
  ).toBeDisabled();
  const submitted = mockStart.mock.calls[0][0].variables.input;
  expect(submitted.includeCurrentWork).toBe(true);
  await user.click(
    screen.getByRole('button', { name: 'Check saved analysis request' }),
  );
  expect(
    screen.getByRole('button', { name: 'Open saved analysis' }),
  ).toBeEnabled();
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockStart.mock.calls[0][0].variables.input).toEqual(submitted);
});

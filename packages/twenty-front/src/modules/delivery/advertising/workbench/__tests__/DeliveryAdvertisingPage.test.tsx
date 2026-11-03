import { StrictMode } from 'react';
import type * as ReactTypes from 'react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOperationAST, type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryAdvertisingPage } from '@/delivery/advertising/workbench/DeliveryAdvertisingPage';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type AdvertisingReview } from '@/delivery/advertising/workbench/advertising-draft';
import { type AdvertisingReceipt } from '@/delivery/advertising/workbench/useAdvertisingCommands';
import {
  ADVERTISING_IDENTITY,
  ADVERTISING_REPORT_ID,
  ADVERTISING_TASK_ID,
  advertisingContext,
  advertisingSource,
} from '@/delivery/advertising/workbench/__tests__/advertising-workbench.fixtures';
import {
  type SaveDeliveryAdvertisingReviewInput,
  type AssignDeliveryAdvertisingReviewInput,
  type ObserveDeliveryAdvertisingActionInput,
} from '~/generated-metadata/graphql';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryCanvas: 'main',
}));
jest.mock(
  '@/delivery/advertising/workbench/advertisingWorkbenchStyles',
  () => ({
    StyledAdvertisingBoundary: 'fieldset',
    StyledAdvertisingFacts: 'dl',
    StyledAdvertisingItem: 'article',
    StyledAdvertisingText: 'p',
    StyledAdvertisingNavigation: 'nav',
  }),
);
jest.mock('@/ui/layout/page/components/PageBody', () => ({
  PageBody: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/layout/page/components/PageContainer', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/navigation/hooks/useNavigationDrawerExpanded', () => ({
  useNavigationDrawerExpanded: () => true,
}));
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));
jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerCollapseButton',
  () => ({ NavigationDrawerCollapseButton: () => null }),
);
jest.mock('@/ui/field/display/components/DateTimeDisplay', () => ({
  DateTimeDisplay: ({ value }: { value?: string | null }) => (
    <span>{value}</span>
  ),
}));

let mockReady = true;
let mockManager = true;
let mockVersion = 0;
let mockStoredReview: AdvertisingReview | null = null;
let mockVisibleReview: AdvertisingReview | null = null;
let mockLoseSaveResponse = false;
let mockAdPagesEnabled = false;
let mockEvidencePending = false;
let mockTransportUnavailable = false;
const mockSubscribers = new Set<() => void>();
const mockReceipts = new Map<string, AdvertisingReceipt>();
const mockNotify = () => {
  mockVersion += 1;
  mockSubscribers.forEach((listener) => listener());
};
const mockMatches = (value: typeof ADVERTISING_IDENTITY | null | undefined) =>
  mockReady &&
  value?.workspaceId === ADVERTISING_IDENTITY.workspaceId &&
  value.memberId === ADVERTISING_IDENTITY.memberId &&
  value.userWorkspaceId === ADVERTISING_IDENTITY.userWorkspaceId;
const mockContext = () => {
  const value = advertisingContext();
  return {
    ...value,
    canManage: mockManager,
    actor: {
      ...value.actor,
      isAdmin: mockManager,
      isManager: mockManager,
      capabilities: mockManager ? ['workspace.admin'] : [],
      roleIds: mockManager ? ['admin-role'] : ['staff-role'],
    },
  };
};
const mockSource = () => {
  const value = advertisingSource();
  const context = mockContext();
  const assigned = mockVisibleReview?.state === 'ASSIGNED';
  const fingerprint = assigned ? 'c'.repeat(64) : value.fingerprint;
  return {
    ...value,
    actor: context.actor,
    fingerprint,
    source: {
      ...value.source,
      fingerprint,
      sourceStatus: assigned ? 'APPROVED' : 'REVIEW',
    },
    canManageDraft: mockManager,
    canReview: mockManager,
    currentDraftId:
      mockManager && mockVisibleReview?.state === 'DRAFT'
        ? mockVisibleReview.id
        : null,
    latestAssignedId: assigned ? (mockVisibleReview?.id ?? null) : null,
  };
};
const mockRefetchAccess = jest.fn();
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => {
    const { useSyncExternalStore } =
      jest.requireActual<typeof ReactTypes>('react');
    useSyncExternalStore(
      (listener) => {
        mockSubscribers.add(listener);
        return () => {
          mockSubscribers.delete(listener);
        };
      },
      () => mockVersion,
    );
    return {
      ready: mockReady,
      manager: mockManager,
      canManageRoles: mockManager,
      denied: false,
      scope: 'advertising-identity',
      access: {
        ...ADVERTISING_IDENTITY,
        capabilities: mockManager ? ['workspace.admin'] : [],
        roleIds: mockManager ? ['admin-role'] : ['staff-role'],
        grants: [],
      },
      matches: mockMatches,
      refetch: mockRefetchAccess,
    };
  },
}));

type QueryOptions = {
  skip?: boolean;
  variables?: { input?: Record<string, unknown> };
};
const mockQueryCalls = jest.fn();
const mockRefresh = jest.fn(async () => {
  mockVisibleReview = mockStoredReview;
  mockNotify();
  return [];
});
const mockData = (name: string | undefined, options: QueryOptions) => {
  const context = mockContext();
  const source = mockSource();
  const identity = {
    ...ADVERTISING_IDENTITY,
    observedAt: context.observedAt,
    actor: context.actor,
  };
  if (name === 'DeliveryAdvertisingContext')
    return { deliveryAdvertisingContext: context };
  if (name === 'DeliveryAdvertisingSources')
    return {
      deliveryAdvertisingSources: {
        ...identity,
        items: [
          {
            kind: 'META',
            id: ADVERTISING_REPORT_ID,
            title: source.source.title,
            projectId: source.source.projectId,
            projectName: 'Launch client',
            accountId: source.source.accountId,
            channel: 'META',
            currency: 'USD',
            fromDate: source.source.fromDate,
            throughDate: source.source.throughDate,
            recordedAt: source.recordedAt,
            hasNewerVersion: false,
            archived: false,
            sourceStatus: source.source.sourceStatus,
            legacyTaskId: null,
            currentDraftId: source.currentDraftId,
            latestAssignedId: source.latestAssignedId,
          },
        ],
        totalCount: 61,
        nextCursor: 'more-reports',
        scope: 'sources',
      },
    };
  if (name === 'DeliveryAdvertisingSourceState')
    return {
      deliveryAdvertisingSource: {
        ...source,
        source: { ...source.source, spendMicros: null },
        evidenceLoaded: false,
      },
    };
  if (name === 'DeliveryAdvertisingSource') {
    if (!mockAdPagesEnabled) return { deliveryAdvertisingSource: source };
    const offset = Number(options.variables?.input?.adOffset ?? 0);
    return {
      deliveryAdvertisingSource: {
        ...source,
        adOffset: offset,
        adTotalCount: 26,
        nextAdOffset: offset === 0 ? 25 : null,
        ads: [
          {
            id: `ad-${offset}`,
            name: offset === 0 ? 'First page creative' : 'Later page creative',
            campaignName: 'Launch campaign',
            adsetName: 'Launch audience',
            spendMicros: '1000000',
            impressions: '100',
            clicks: '2',
          },
        ],
      },
    };
  }
  if (name === 'DeliveryAdvertisingReviews')
    return {
      deliveryAdvertisingReviews: {
        ...identity,
        items: mockVisibleReview
          ? [
              {
                id: mockVisibleReview.id,
                revision: mockVisibleReview.revision,
                state: mockVisibleReview.state,
                createdAt: mockVisibleReview.createdAt,
                assignedAt: mockVisibleReview.assignedAt,
                actionCount: mockVisibleReview.actions.length,
                goalKind: mockVisibleReview.goal.kind,
              },
            ]
          : [],
        totalCount: mockVisibleReview ? 1 : 0,
        nextCursor: null,
        scope: 'reviews',
        currentDraftId: source.currentDraftId,
      },
    };
  const requestedId = options.variables?.input?.id;
  const review =
    mockVisibleReview?.id === requestedId ? mockVisibleReview : null;
  if (name === 'DeliveryAdvertisingReviewState')
    return {
      deliveryAdvertisingReviewState: {
        ...identity,
        review: review
          ? {
              id: review.id,
              revision: review.revision,
              state: review.state,
              sourceKind: review.source.kind,
              sourceId: review.source.id,
            }
          : null,
        currentSourceFingerprint: source.fingerprint,
        canEdit: mockManager && review?.state === 'DRAFT',
        canAssign: mockManager && review?.state === 'DRAFT',
        blockingReasons: [],
        tasks:
          review?.actions
            .filter((action) => action.task !== null)
            .map((action) => ({
              actionId: action.id,
              taskId: action.taskId,
              revision: action.task?.revision,
              state: action.task?.state,
            })) ?? [],
      },
    };
  if (name === 'DeliveryAdvertisingReview')
    return {
      deliveryAdvertisingReview: {
        ...identity,
        review,
        currentSourceFingerprint: source.fingerprint,
        canEdit: mockManager && review?.state === 'DRAFT',
        canAssign: mockManager && review?.state === 'DRAFT',
        blockingReasons: [],
        legacyTask: null,
        legacyAdoptedReviewId: null,
      },
    };
  if (name === 'DeliveryAdvertisingObservations')
    return {
      deliveryAdvertisingObservations: {
        ...identity,
        items: [],
        totalCount: 0,
        nextCursor: null,
        scope: 'observations',
      },
    };
  return undefined;
};
const makeReview = (
  input: SaveDeliveryAdvertisingReviewInput,
): AdvertisingReview => {
  const source = mockSource();
  return {
    id: input.id,
    revision: input.revision + 1,
    state: 'DRAFT',
    source: source.source,
    goal: {
      kind: input.goal.kind,
      metricKey: input.goal.metricKey ?? null,
      metricAdId: input.goal.metricAdId ?? null,
      provenance: input.goal.provenance,
      value: input.goal.value ?? null,
      evidence: input.goal.evidence,
      targetCostMicros: input.goal.targetCostMicros ?? null,
      metricLabel: input.goal.metricKey ? 'Reported purchases' : null,
      metricProvenance:
        input.goal.provenance === 'HUMAN'
          ? 'HUMAN_REPORTED'
          : 'PLATFORM_REPORTED',
      metricReason: null,
      metricUnit: 'COUNT',
      currency: 'USD',
      fromDate: source.source.fromDate,
      throughDate: source.source.throughDate,
      timezone: source.source.timezone,
      sourceFingerprint: source.source.evidenceFingerprint,
    },
    note: input.note,
    noChangeReason: input.noChangeReason,
    legacyHandling: {
      mode: input.legacyHandling.mode,
      taskId: input.legacyHandling.taskId ?? null,
      taskRevision: input.legacyHandling.taskRevision ?? null,
      taskState: input.legacyHandling.taskState ?? null,
      reason: input.legacyHandling.reason,
    },
    createdBy: ADVERTISING_IDENTITY.memberId,
    assignedBy: null,
    assignedAt: null,
    createdAt: '2026-10-31T06:00:00.000Z',
    actions: input.actions.map((action) => ({
      id: action.id,
      title: action.title,
      rationale: action.rationale,
      expectedResult: action.expectedResult,
      evidence: action.evidence,
      ownerId: action.ownerId,
      ownerName: 'Assigned marketer',
      reviewerId: action.reviewerId,
      reviewerName: 'Amna',
      dueDate: action.dueDate,
      assistantId: action.assistantId ?? null,
      assistantName: null,
      assistantVersion: null,
      adoptTaskId: action.adoptTaskId ?? null,
      origin: action.origin ? { ...action.origin, humanEdited: false } : null,
      taskId: null,
      task: null,
    })),
  };
};
const mockMutation = jest.fn(
  async (
    name: string | undefined,
    options: {
      variables: {
        input:
          | SaveDeliveryAdvertisingReviewInput
          | AssignDeliveryAdvertisingReviewInput
          | ObserveDeliveryAdvertisingActionInput;
      };
    },
  ) => {
    const input = options.variables.input;
    if (name === 'SaveDeliveryAdvertisingReview' && 'goal' in input) {
      mockStoredReview = makeReview(input);
      const receipt: AdvertisingReceipt = {
        requestId: input.requestId,
        reviewId: input.id,
        action: 'SAVED',
        actorId: ADVERTISING_IDENTITY.memberId,
        createdAt: '2026-10-31T06:00:00.000Z',
        revision: mockStoredReview.revision,
        state: 'DRAFT',
        actionTasks: [],
        observationId: null,
      };
      mockReceipts.set(input.requestId, receipt);
      if (mockLoseSaveResponse) throw new Error('Lost successful response');
      return {
        data: { saveDeliveryAdvertisingReview: { ...mockContext(), receipt } },
      };
    }
    if (
      name === 'AssignDeliveryAdvertisingReview' &&
      !('goal' in input) &&
      !('reviewId' in input) &&
      mockStoredReview
    ) {
      mockStoredReview = {
        ...mockStoredReview,
        state: 'ASSIGNED',
        revision: mockStoredReview.revision + 1,
        assignedBy: ADVERTISING_IDENTITY.memberId,
        assignedAt: '2026-10-31T06:00:00.000Z',
        actions: mockStoredReview.actions.map((action) => ({
          ...action,
          taskId: ADVERTISING_TASK_ID,
          task: {
            id: ADVERTISING_TASK_ID,
            title: action.title,
            revision: 1,
            state: 'PLANNED',
            ownerId: action.ownerId,
            ownerName: action.ownerName,
            reviewerId: action.reviewerId,
            reviewerName: action.reviewerName,
            dueAt: `${action.dueDate}T00:00:00.000Z`,
            submissionVersion: null,
            submissionState: null,
            evidence: [],
          },
        })),
      };
      const receipt: AdvertisingReceipt = {
        requestId: input.requestId,
        reviewId: input.id,
        action: 'ASSIGNED',
        actorId: ADVERTISING_IDENTITY.memberId,
        createdAt: '2026-10-31T06:00:00.000Z',
        revision: mockStoredReview.revision,
        state: 'ASSIGNED',
        actionTasks: mockStoredReview.actions.map((action) => ({
          actionId: action.id,
          taskId: ADVERTISING_TASK_ID,
        })),
        observationId: null,
      };
      mockReceipts.set(input.requestId, receipt);
      return {
        data: {
          assignDeliveryAdvertisingReview: { ...mockContext(), receipt },
        },
      };
    }
    throw new Error('Unexpected command');
  },
);
const mockClientQuery = jest.fn(
  async (options: {
    query: DocumentNode;
    variables?: { input?: { requestId?: string } };
  }) => {
    if (
      getOperationAST(options.query)?.name?.value ===
      'DeliveryAdvertisingReceipt'
    )
      return {
        data: {
          deliveryAdvertisingReceipt: {
            ...mockContext(),
            receipt:
              mockReceipts.get(options.variables?.input?.requestId ?? '') ??
              null,
          },
        },
      };
    throw new Error('Unexpected exact query');
  },
);
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({
    query: mockClientQuery,
    refetchQueries: mockRefresh,
  }),
  useMutation: (document: DocumentNode) => [
    (options: Parameters<typeof mockMutation>[1]) =>
      mockMutation(getOperationAST(document)?.name?.value, options),
  ],
  useQuery: (document: DocumentNode, options: QueryOptions = {}) => {
    const name = getOperationAST(document)?.name?.value;
    mockQueryCalls(name, options);
    if (mockTransportUnavailable)
      return {
        data: undefined,
        loading: false,
        networkStatus: NetworkStatus.error,
        error: new Error('API connection unavailable'),
        refetch: async () => ({ data: undefined }),
      };
    if (name === 'DeliveryAdvertisingSource' && mockEvidencePending)
      return {
        data: undefined,
        loading: true,
        networkStatus: NetworkStatus.loading,
        error: undefined,
        refetch: async () => ({ data: undefined }),
      };
    const denied =
      !mockManager &&
      (name === 'DeliveryAdvertisingSourceState' ||
        name === 'DeliveryAdvertisingSource' ||
        name === 'DeliveryAdvertisingReviewState' ||
        name === 'DeliveryAdvertisingReview');
    return {
      data: options.skip ? undefined : mockData(name, options),
      loading: false,
      networkStatus: NetworkStatus.ready,
      error: denied
        ? new CombinedGraphQLErrors({
            errors: [{ message: 'Denied', extensions: { code: 'FORBIDDEN' } }],
          })
        : undefined,
      refetch: async () => {
        mockVisibleReview = mockStoredReview;
        mockNotify();
        return { data: mockData(name, options) };
      },
    };
  },
}));

const mount = (strict = false) => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Link to="/other">Other work</Link>
            <DeliveryAdvertisingPage />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other work opened</p> },
    ],
    { initialEntries: ['/delivery?view=ads'] },
  );
  const element = (
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>
  );
  render(strict ? <StrictMode>{element}</StrictMode> : element);
  return {
    router,
    user: userEvent.setup(),
    update: () => act(() => mockNotify()),
  };
};
const openDraft = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole('link', { name: 'Launch campaign report' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Prepare recommendations' }),
  );
};
const fillRecommendation = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.selectOptions(
    screen.getByLabelText('Business outcome'),
    'PURCHASES',
  );
  await user.selectOptions(
    screen.getByLabelText('Exact reported metric'),
    'account:actions:purchase',
  );
  await user.type(
    screen.getByLabelText('Recommendation review summary'),
    'Review the exact purchase result and test one new hook.',
  );
  await user.click(screen.getByRole('button', { name: 'Add recommendation' }));
  await user.type(
    screen.getByLabelText('Action title'),
    'Test the new product hook',
  );
  await user.type(
    screen.getByLabelText('Why this action is needed'),
    'The current opening needs a clearer product benefit.',
  );
  await user.type(
    screen.getByLabelText('Expected result and how to check it'),
    'Compare the next reported purchase outcome after review.',
  );
  await user.type(
    screen.getByLabelText(
      'Evidence and references for the person doing the work',
    ),
    'Use the reviewed purchase metric and approved brand rules.',
  );
  await user.type(screen.getByLabelText('Due date'), '2026-11-02');
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
  mockManager = true;
  mockStoredReview = null;
  mockVisibleReview = null;
  mockLoseSaveResponse = false;
  mockAdPagesEnabled = false;
  mockEvidencePending = false;
  mockTransportUnavailable = false;
  mockReceipts.clear();
  jest.clearAllMocks();
  mockRefetchAccess.mockResolvedValue({});
});

it('opens a unified bounded library without the legacy workspace or unselected evidence', () => {
  mount();
  expect(screen.getByText('Showing 1 of 61 matching reports.')).toBeVisible();
  expect(
    mockQueryCalls.mock.calls.some(
      ([name]) =>
        name === 'DeliveryWorkspace' ||
        name === 'DeliveryAdvertisingSource' ||
        name === 'DeliveryAdvertisingReview',
    ),
  ).toBe(false);
  expect(
    screen.getByRole('link', {
      name: 'Connections, manual reports and budgets',
    }),
  ).toHaveAttribute('href', '/delivery?view=ads&adView=legacy');
});

it('keeps report and ad disclosures open across an exact evidence page transition', async () => {
  mockAdPagesEnabled = true;
  const { user, update } = mount();
  await user.click(
    screen.getByRole('link', { name: 'Launch campaign report' }),
  );
  await user.click(screen.getByText('Inspect report evidence and ads'));
  await user.click(screen.getByText('Inspect ads in this report'));
  await user.click(screen.getByText('Reported metrics and their sources'));
  expect(screen.getByText('First page creative')).toBeVisible();
  expect(
    screen.queryByText(/Spend evidence not loaded/u, { selector: 'p' }),
  ).not.toBeInTheDocument();
  mockEvidencePending = true;
  await user.click(screen.getByRole('button', { name: 'More ads' }));
  expect(
    screen.queryByText('Inspect ads in this report'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('Inspect report evidence and ads').closest('details'),
  ).toHaveAttribute('open');
  expect(
    screen.getByText(/Spend evidence not loaded/u, { selector: 'p' }),
  ).toBeVisible();
  mockEvidencePending = false;
  update();
  expect(
    screen.getByText('Inspect ads in this report').closest('details'),
  ).toHaveAttribute('open');
  expect(
    screen.getByText('Reported metrics and their sources').closest('details'),
  ).toHaveAttribute('open');
  expect(screen.getByText('Later page creative')).toBeVisible();
  expect(
    screen.queryByText(/Spend evidence not loaded/u, { selector: 'p' }),
  ).not.toBeInTheDocument();
});

it('saves reviewed recommendations, assigns once after confirmation and opens actual task and outcome work', async () => {
  const { user, router } = mount();
  await openDraft(user);
  await fillRecommendation(user);
  const beforeSave = new URLSearchParams(router.state.location.search);
  expect(beforeSave.get('adRequest')).not.toBeNull();
  expect(beforeSave.get('adReview')).not.toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'Save recommendations for review' }),
  );
  await user.click(
    screen.getByRole('link', { name: 'Open saved recommendations' }),
  );
  await user.click(screen.getByRole('button', { name: 'Review assignment' }));
  expect(
    screen.getByRole('button', { name: 'Approve review and assign work' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed the outcome, evidence and recipients.',
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Approve review and assign work' }),
  );
  await user.click(screen.getByRole('link', { name: 'Open reviewed work' }));
  expect(
    screen.getByRole('link', { name: 'Open task, evidence and review' }),
  ).toHaveAttribute(
    'href',
    `/delivery?view=planner&task=${ADVERTISING_TASK_ID}`,
  );
  await user.click(screen.getByRole('button', { name: 'Record later result' }));
  expect(screen.getByRole('region', { name: 'Action outcomes' })).toBeVisible();
  expect(
    mockMutation.mock.calls.filter(
      ([name]) => name === 'AssignDeliveryAdvertisingReview',
    ),
  ).toHaveLength(1);
});

it('recovers a lost successful save from its immutable request without another draft or editable defaults on Back', async () => {
  mockLoseSaveResponse = true;
  const { user, router } = mount();
  await openDraft(user);
  await fillRecommendation(user);
  const requestUrl = router.state.location.search;
  await user.click(
    screen.getByRole('button', { name: 'Save recommendations for review' }),
  );
  expect(screen.getByLabelText('Action title')).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Check saved recommendation review' }),
  );
  await user.click(
    screen.getByRole('link', { name: 'Open saved recommendations' }),
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.search).toBe(requestUrl);
  expect(screen.queryByLabelText('Action title')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved recommendation review' }),
  ).toBeEnabled();
  expect(mockMutation).toHaveBeenCalledTimes(1);
});

it('keeps an opened assignment and its confirmation through an API connection outage', async () => {
  const { user, router, update } = mount();
  await openDraft(user);
  await fillRecommendation(user);
  await user.click(
    screen.getByRole('button', { name: 'Save recommendations for review' }),
  );
  await user.click(
    screen.getByRole('link', { name: 'Open saved recommendations' }),
  );
  await user.click(screen.getByRole('button', { name: 'Review assignment' }));
  const confirmation = 'I reviewed the outcome, evidence and recipients.';
  await user.click(screen.getByRole('checkbox', { name: confirmation }));
  const assignmentUrl = router.state.location.search;
  mockTransportUnavailable = true;
  update();
  expect(screen.getByLabelText(confirmation)).not.toBeVisible();
  mockTransportUnavailable = false;
  update();
  expect(router.state.location.search).toBe(assignmentUrl);
  expect(screen.getByRole('checkbox', { name: confirmation })).toBeChecked();
  expect(
    screen.getByRole('button', { name: 'Approve review and assign work' }),
  ).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: 'Check saved assignment' }),
  ).not.toBeInTheDocument();
  expect(
    mockMutation.mock.calls.filter(
      ([name]) => name === 'AssignDeliveryAdvertisingReview',
    ),
  ).toHaveLength(0);
  await user.click(
    screen.getByRole('button', { name: 'Back to reviewed recommendations' }),
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(
    screen.getByText(
      'This earlier preparation is no longer open. Check whether its assignment was saved before closing this view and reviewing the current recommendations.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Check saved assignment' }),
  ).toBeEnabled();
  expect(
    screen.queryByRole('checkbox', { name: confirmation }),
  ).not.toBeInTheDocument();
});

it('keeps a dirty draft through confirmation and a real hook-level transport interruption under StrictMode', async () => {
  const { user, update } = mount(true);
  await openDraft(user);
  await user.type(
    screen.getByLabelText('Recommendation review summary'),
    'Keep these exact review notes.',
  );
  await user.click(screen.getByRole('button', { name: 'Close preparation' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  mockReady = false;
  update();
  expect(
    screen.getByLabelText('Recommendation review summary'),
  ).not.toBeVisible();
  mockReady = true;
  update();
  expect(screen.getByLabelText('Recommendation review summary')).toHaveValue(
    'Keep these exact review notes.',
  );
  expect(mockMutation).not.toHaveBeenCalled();
});

it('cancels a pending private navigation and disposes draft inputs after verified management loss', async () => {
  const { user, router, update } = mount();
  await openDraft(user);
  await user.type(
    screen.getByLabelText('Recommendation review summary'),
    'Private preparation notes.',
  );
  const beforeLoss = router.state.location.search;
  await user.click(screen.getByRole('button', { name: 'Close preparation' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  mockManager = false;
  update();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Recommendation review summary'),
  ).not.toBeInTheDocument();
  expect(router.state.location.search).toBe(beforeLoss);
  mockManager = true;
  update();
  expect(
    screen.queryByLabelText('Recommendation review summary'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved recommendation review' }),
  ).toBeEnabled();
  expect(mockMutation).not.toHaveBeenCalled();
});

import { StrictMode, useState, type ReactNode } from 'react';
import type * as ReactTypes from 'react';
import type * as ReactRouterTypes from 'react-router-dom';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom';
import { DeliveryChatPage } from '@/delivery/operations-pages/DeliveryChatPage';
import { DeliveryCompanyOverviewPage } from '@/delivery/operations-pages/DeliveryCompanyOverviewPage';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import {
  DeliveryDraftGuardProvider,
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { type OtogrowAccess } from '@/otogrow-access/otogrow-access.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryCanvas: 'main',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
}));
jest.mock('@/ui/layout/page/components/PageBody', () => ({
  PageBody: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@/ui/layout/page/components/PageContainer', () => ({
  PageContainer: ({ children }: { children: ReactNode }) => children,
}));
jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerCollapseButton',
  () => ({
    NavigationDrawerCollapseButton: () => <button>Expand navigation</button>,
  }),
);
jest.mock('@/navigation/hooks/useNavigationDrawerExpanded', () => ({
  useNavigationDrawerExpanded: () => false,
}));
let mockMobile = false;
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => mockMobile,
}));
jest.mock('@/delivery/navigation/DeliveryNavigationPreferences', () => ({
  DeliveryNavigationPreferences: () => <p>Personal workspace preferences</p>,
}));
jest.mock('@/delivery/navigation/useDeliveryNavigationPreferences', () => ({
  useDeliveryNavigationPreferences: (
    _actor: unknown,
    groups: { items: { view: string; label: string }[] }[],
  ) => ({
    scope: 'workspace:member',
    pinnedPages: groups
      .flatMap((group) => group.items)
      .filter((page) => page.view === 'chat'),
  }),
}));

let mockRole: 'admin' | 'manager' | 'member' = 'admin';
let mockAccessLoading = false;
let mockAccessError: Error | undefined;
let mockAccessVersion = 0;
const mockAccessListeners = new Set<() => void>();
const mockAccessRefetch = jest.fn(async () => undefined);
const mockAccess = (): OtogrowAccess => ({
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
  roleIds: [mockRole],
  capabilities:
    mockRole === 'admin'
      ? ['workspace.admin']
      : mockRole === 'manager'
        ? ['delivery.manage']
        : [],
  nativeAdministrator: mockRole === 'admin',
  grants: [],
});
jest.mock('@/otogrow-access/useOtogrowIdentity', () => ({
  useOtogrowIdentity: () => ({
    identity: 'workspace:member:user',
    workspaceId: 'workspace',
    memberId: 'member',
  }),
}));
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => {
    const { useSyncExternalStore } =
      jest.requireActual<typeof ReactTypes>('react');
    useSyncExternalStore(
      (listener) => {
        mockAccessListeners.add(listener);
        return () => {
          mockAccessListeners.delete(listener);
        };
      },
      () => mockAccessVersion,
    );
    return {
      access: mockAccessLoading || mockAccessError ? undefined : mockAccess(),
      scopeKey:
        mockAccessLoading || mockAccessError
          ? null
          : 'workspace:member:user:membership',
      canManageRoles:
        !mockAccessLoading && !mockAccessError && mockRole === 'admin',
      canReadFinance:
        !mockAccessLoading && !mockAccessError && mockRole === 'admin',
      loading: mockAccessLoading,
      error: mockAccessError,
      refetch: mockAccessRefetch,
    };
  },
}));

const mockRefetchQueries = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ refetchQueries: mockRefetchQueries }),
}));
const mockPreparedAction = jest.fn();
const MockPrivateBody = ({ label }: { label: string }) => {
  const [value, setValue] = useState('');
  const { requestAction } = useDeliveryDraftGuard();
  useDeliveryDraftStatus({ dirty: value !== '', saving: false });
  return (
    <section>
      <label>
        {label}
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button onClick={() => requestAction(() => mockPreparedAction(value))}>
        Prepare follow-up
      </button>
    </section>
  );
};
jest.mock('@/delivery/chat/DeliveryChat', () => ({
  DeliveryChat: () => <MockPrivateBody label="Unsent teammate message" />,
}));
jest.mock('@/delivery/founder/DeliveryFounderExceptions', () => ({
  DeliveryFounderExceptions: () => {
    const { useSearchParams: useMockSearchParams, Link: MockLink } =
      jest.requireActual<typeof ReactRouterTypes>('react-router-dom');
    const [params] = useMockSearchParams();
    return params.get('founderPanel') === 'alerts' ? (
      <MockPrivateBody label="Private alert rule draft" />
    ) : (
      <>
        <p>Current founder risks</p>
        <MockLink to="/delivery?view=planner&task=task-one">
          Open accountable task
        </MockLink>
        <MockLink to="/delivery?view=health&founderPanel=alerts">
          Configure founder alerts
        </MockLink>
      </>
    );
  },
}));
jest.mock('@/delivery/readiness/DeliveryReadiness', () => ({
  DeliveryReadiness: () => <p>Current connection evidence</p>,
}));

const Route = () => {
  const [params] = useSearchParams();
  const permission = useWorkflowAccess();
  return (
    <DeliveryDraftGuardProvider key={permission.scope}>
      <Link to="/elsewhere">Other work</Link>
      {params.get('view') === 'chat' ? (
        <DeliveryChatPage />
      ) : params.get('view') === 'health' ? (
        <DeliveryCompanyOverviewPage />
      ) : params.get('view') === 'competitors' ? (
        <DeliveryOperationalPage view="competitors">
          <p>Current competitor sources</p>
        </DeliveryOperationalPage>
      ) : params.get('view') === 'clients' ? (
        <DeliveryOperationalPage view="clients">
          <p>Current client commitments</p>
        </DeliveryOperationalPage>
      ) : params.get('view') === 'content' ? (
        <DeliveryOperationalPage view="content">
          <p>Current content posting packages</p>
        </DeliveryOperationalPage>
      ) : params.get('view') === 'development' ? (
        <DeliveryOperationalPage view="development">
          <p>Current development releases</p>
        </DeliveryOperationalPage>
      ) : (
        <p>Accountable task opened</p>
      )}
    </DeliveryDraftGuardProvider>
  );
};
const mount = (entry = '/delivery?view=chat', strict = false) => {
  const router = createMemoryRouter(
    [
      { path: '/delivery', element: <Route /> },
      { path: '/elsewhere', element: <p>Other work opened</p> },
    ],
    { initialEntries: ['/elsewhere', entry], initialIndex: 1 },
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
    update: () =>
      act(() => {
        mockAccessVersion += 1;
        mockAccessListeners.forEach((listener) => listener());
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
  mockRole = 'admin';
  mockAccessLoading = false;
  mockAccessError = undefined;
  mockMobile = false;
  jest.clearAllMocks();
  mockAccessRefetch.mockResolvedValue(undefined);
  mockRefetchQueries.mockResolvedValue([]);
});

it('allows current active members into chat without a workspace snapshot', () => {
  mockRole = 'member';
  mount();
  expect(
    screen.getByRole('heading', { level: 1, name: 'Team chat' }),
  ).toBeVisible();
  expect(screen.getByLabelText('Unsent teammate message')).toBeVisible();
});

it('requires administrator authority for Company overview', () => {
  mockRole = 'manager';
  mount('/delivery?view=health&founderPanel=alerts');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Current administrator access is required',
  );
  expect(
    screen.queryByLabelText('Private alert rule draft'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('Current connection evidence'),
  ).not.toBeInTheDocument();
});

it('waits for current access before mounting private bodies', () => {
  mockAccessLoading = true;
  const { update } = mount();
  expect(
    screen.getByText('Checking your current workspace access…'),
  ).toBeVisible();
  expect(
    screen.queryByLabelText('Unsent teammate message'),
  ).not.toBeInTheDocument();
  mockAccessLoading = false;
  update();
  expect(screen.getByLabelText('Unsent teammate message')).toBeVisible();
});

it.each([
  '/delivery?view=health&readinessStatus=PAUSED',
  '/delivery?view=health#company-readiness',
])(
  'preserves readiness disclosure and normal task destinations for %s',
  async (entry) => {
    const { user, router } = mount(entry);
    expect(
      screen.getByText('Connection readiness').closest('details'),
    ).toHaveAttribute('open');
    expect(screen.getByText('Current connection evidence')).toBeVisible();
    await user.click(
      screen.getByRole('link', { name: 'Open accountable task' }),
    );
    expect(router.state.location.search).toBe('?view=planner&task=task-one');
    expect(screen.getByText('Accountable task opened')).toBeVisible();
  },
);

it.each([
  'chat',
  'health',
  'development',
  'competitors',
  'content',
  'clients',
] as const)(
  'refreshes only active typed %s queries and verifies current access',
  async (view) => {
    const queries = [
      'DeliveryChat',
      'DeliveryFounderExceptions',
      'DeliveryReadiness',
      'DeliveryFounderEscalations',
      'PreviewDeliveryFounderEscalationRule',
      'DeliveryWorkspace',
      'DeliveryCommitmentEngagements',
      'DeliveryCommitments',
      'DeliveryClients',
      'DeliveryOperations',
      'DeliveryBusiness',
      'DeliveryReleaseProjects',
      'DeliveryReleaseList',
      'DeliveryReleaseDetail',
      'DeliveryCompetitorProjects',
      'DeliveryCompetitorSources',
      'DeliveryCompetitorSourceChoices',
      'DeliveryCompetitorSource',
      'PreviewDeliveryCompetitorSource',
      'DeliveryCompetitorSourceReceipt',
      'SaveDeliveryCompetitorSource',
      'ChangeDeliveryCompetitorSourceState',
      'DeliveryContentProjects',
      'DeliveryContentProjectChoices',
      'DeliveryContentPlans',
      'DeliveryContentList',
      'DeliveryContentCalendar',
      'DeliveryContentAssetChoices',
      'DeliveryContentDetail',
      'DeliveryContentReceipt',
      'PreviewDeliveryContent',
    ];
    const refetches = new Map(
      queries.map((name) => [name, jest.fn(async () => undefined)]),
    );
    mockRefetchQueries.mockImplementation(
      async (options: {
        include: string;
        onQueryUpdated: (query: {
          queryName: string;
          refetch: () => Promise<void>;
        }) => Promise<void> | false;
      }) => {
        expect(options.include).toBe('active');
        await Promise.all(
          queries.map(async (queryName) => {
            const refetch = refetches.get(queryName);
            if (refetch) await options.onQueryUpdated({ queryName, refetch });
          }),
        );
      },
    );
    const { user } = mount(`/delivery?view=${view}`);
    await user.click(screen.getByRole('button', { name: 'Refresh page' }));
    expect(mockAccessRefetch).toHaveBeenCalledTimes(1);
    for (const [queryName, refetch] of refetches)
      expect(refetch).toHaveBeenCalledTimes(
        view === 'clients'
          ? Number(
              ['DeliveryCommitments', 'DeliveryCommitmentEngagements'].includes(
                queryName,
              ),
            )
          : view === 'chat'
            ? Number(queryName === 'DeliveryChat')
            : view === 'content'
              ? Number(queryName.includes('DeliveryContent'))
              : view === 'competitors'
                ? Number(queryName.includes('Competitor'))
                : view === 'development'
                  ? Number(queryName.startsWith('DeliveryRelease'))
                  : Number(
                      [
                        'DeliveryFounderExceptions',
                        'DeliveryReadiness',
                        'DeliveryFounderEscalations',
                        'PreviewDeliveryFounderEscalationRule',
                      ].includes(queryName),
                    ),
      );
  },
);

it.each([
  {
    entry: '/delivery?view=chat&chatWith=peer',
    label: 'Unsent teammate message',
  },
  {
    entry: '/delivery?view=health&founderPanel=alerts',
    label: 'Private alert rule draft',
  },
])(
  'retains $label through Keep editing and transient access failure under StrictMode',
  async ({ entry, label }) => {
    const { user, update } = mount(entry, true);
    await user.type(
      screen.getByLabelText(label),
      'Keep this exact unsaved preparation.',
    );
    await user.click(screen.getByRole('link', { name: 'Other work' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    mockAccessError = new Error('Connection unavailable');
    update();
    expect(screen.getByLabelText(label)).not.toBeVisible();
    expect(
      screen.queryByText('Personal workspace preferences'),
    ).not.toBeInTheDocument();
    mockAccessError = undefined;
    update();
    expect(screen.getByLabelText(label)).toBeVisible();
    expect(screen.getByLabelText(label)).toHaveValue(
      'Keep this exact unsaved preparation.',
    );
    expect(mockPreparedAction).not.toHaveBeenCalled();
  },
);

it('reports incomplete refresh without discarding the current private draft', async () => {
  mockRefetchQueries.mockRejectedValueOnce(
    new Error('Current messages unavailable'),
  );
  const { user } = mount();
  await user.type(
    screen.getByLabelText('Unsent teammate message'),
    'Keep this while refreshing.',
  );
  await user.click(screen.getByRole('button', { name: 'Refresh page' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The latest information could not be fully checked',
  );
  expect(screen.getByLabelText('Unsent teammate message')).toHaveValue(
    'Keep this while refreshing.',
  );
  expect(screen.getByRole('button', { name: 'Refresh page' })).toBeEnabled();
});

it('cancels a pending private callback and discards alert drafts after same-identity administrator loss', async () => {
  const { user, update } = mount('/delivery?view=health&founderPanel=alerts');
  await user.type(
    screen.getByLabelText('Private alert rule draft'),
    'Private escalation preparation.',
  );
  await user.click(screen.getByRole('button', { name: 'Prepare follow-up' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  mockRole = 'manager';
  update();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Private alert rule draft'),
  ).not.toBeInTheDocument();
  expect(mockPreparedAction).not.toHaveBeenCalled();
  mockRole = 'admin';
  update();
  expect(screen.getByLabelText('Private alert rule draft')).toHaveValue('');
  expect(mockPreparedAction).not.toHaveBeenCalled();
});

it('resets a blocked browser Back on known administrator revocation without leaving the current URL', async () => {
  const { user, router, update } = mount(
    '/delivery?view=health&founderPanel=alerts',
  );
  await user.type(
    screen.getByLabelText('Private alert rule draft'),
    'Retained only until verified revocation.',
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole('dialog')).toBeVisible();
  mockRole = 'manager';
  update();
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(router.state.location.search).toBe('?view=health&founderPanel=alerts');
  expect(screen.queryByText('Other work opened')).not.toBeInTheDocument();
});

it('removes a message draft on confirmed access denial instead of resurrecting it on regrant', async () => {
  const { user, update } = mount();
  await user.type(
    screen.getByLabelText('Unsent teammate message'),
    'Private unsent text.',
  );
  mockAccessError = new CombinedGraphQLErrors({
    errors: [{ message: 'Denied', extensions: { code: 'FORBIDDEN' } }],
  });
  update();
  expect(
    screen.queryByLabelText('Unsent teammate message'),
  ).not.toBeInTheDocument();
  mockAccessError = undefined;
  update();
  expect(screen.getByLabelText('Unsent teammate message')).toHaveValue('');
});

it('uses the normal compact navigation with draft confirmation', async () => {
  mockMobile = true;
  const { user, router } = mount();
  expect(
    screen.getByRole('button', { name: 'Expand navigation' }),
  ).toBeVisible();
  await user.type(
    screen.getByLabelText('Unsent teammate message'),
    'Check before leaving.',
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Go to workspace' }),
    'home',
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(router.state.location.search).toBe('?view=chat');
  expect(screen.getByRole('combobox', { name: 'Go to workspace' })).toHaveValue(
    'chat',
  );
});

it('identifies Development releases with its own heading and next workflow', () => {
  mount('/delivery?view=development');
  expect(
    screen.getByRole('heading', { name: 'Development releases', level: 1 }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Plan reviewed releases, record deployment and track client handover.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Company overview' }),
  ).not.toBeInTheDocument();
});

it('identifies competitor sources and states the collection limit', () => {
  mount('/delivery?view=competitors');
  expect(
    screen.getByRole('heading', { name: 'Competitor sources', level: 1 }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Register research sources, assign owners and preserve configuration history. Collection is OFF.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Company overview' }),
  ).not.toBeInTheDocument();
});

it('identifies the content planner without implying scheduled or connected posting', () => {
  mount('/delivery?view=content');
  expect(
    screen.getByRole('heading', { name: 'Content planner', level: 1 }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Prepare platform-specific posts, review each posting package and record manual publication.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Company overview' }),
  ).not.toBeInTheDocument();
});

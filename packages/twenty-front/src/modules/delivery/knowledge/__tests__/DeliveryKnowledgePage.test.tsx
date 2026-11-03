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
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryKnowledge } from '@/delivery/knowledge/DeliveryKnowledge';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryCanvas: 'main',
}));
jest.mock('@/delivery/knowledge/knowledgeStyles', () => ({
  StyledKnowledgeBoundary: 'fieldset',
  StyledKnowledgeItem: 'article',
  StyledKnowledgeText: 'p',
}));
jest.mock('@/delivery/knowledge/transcript/DeliveryTranscriptImport', () => ({
  DeliveryTranscriptImport: () => null,
}));
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

const PROJECT = '20000000-0000-4000-8000-000000000001';
const OTHER_PROJECT = '20000000-0000-4000-8000-000000000002';
const SOURCE = '20000000-0000-4000-8000-000000000003';
const IDENTITY = {
  workspaceId: '20000000-0000-4000-8000-000000000004',
  memberId: '20000000-0000-4000-8000-000000000005',
  userWorkspaceId: '20000000-0000-4000-8000-000000000006',
};
let mockReady = true;
let mockManager = true;
let mockContextError: Error | undefined;
let mockSourceError: Error | undefined;
let mockDetailError: Error | undefined;
let mockSourceExists = true;
let mockRevision = 1;
let mockDetailVersion = 1;
let mockCurrentVersion = 1;
let mockProjectIds = [PROJECT];
let mockVersion = 0;
const mockSubscribers = new Set<() => void>();
const mockRefetch = jest.fn();
const mockMatches = (value: typeof IDENTITY | null | undefined) =>
  mockReady &&
  value?.workspaceId === IDENTITY.workspaceId &&
  value.memberId === IDENTITY.memberId &&
  value.userWorkspaceId === IDENTITY.userWorkspaceId;
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
      scope: 'knowledge-identity',
      access: {
        ...IDENTITY,
        roleIds: mockManager ? ['admin-role'] : ['staff-role'],
        capabilities: mockManager ? ['workspace.admin'] : [],
        grants: [],
      },
      matches: mockMatches,
      refetch: mockRefetch,
    };
  },
}));
const mockActor = () => ({
  memberId: IDENTITY.memberId,
  isAdmin: mockManager,
  isManager: mockManager,
  roleIds: mockManager ? ['admin-role'] : ['staff-role'],
  capabilities: mockManager ? ['workspace.admin'] : [],
});
const mockProject = (id = PROJECT) => ({
  id,
  name: id === PROJECT ? 'Launch brand' : 'Other brand',
  revision: 1,
});
const mockEnvelope = (projectId = PROJECT) => ({
  ...IDENTITY,
  observedAt: '2026-10-31T00:00:00.000Z',
  actor: mockActor(),
  project: mockProject(projectId),
  canPublish: mockManager,
});
const mockSource = () => ({
  id: SOURCE,
  revision: mockRevision,
  title: 'Launch meeting',
  category: 'MEETING',
  meetingDate: '2026-10-30',
  version: 1,
  currentVersion: mockCurrentVersion,
  publishedVersion: 1,
  publishedAt: '2026-10-30T00:00:00.000Z',
  createdBy: 'another-author',
  canEdit: mockManager,
});
const mockDetail = () => ({
  ...mockSource(),
  sourceUrl: mockManager ? 'https://fathom.video/share/synthetic' : '',
  transcript: mockManager ? 'Private raw meeting notes' : null,
  knowledge: 'Approved launch rules',
});
type QueryOptions = {
  skip?: boolean;
  variables?: {
    input?: {
      projectId?: string;
      sourceId?: string;
      version?: number;
      after?: string;
      search?: string;
      limit?: number;
    };
  };
};
const mockQueryCalls = jest.fn();
const mockMutation = jest.fn();
const mockClientQuery = jest.fn();
const mockRefetchQueries = jest.fn().mockResolvedValue([]);
const mockData = (name: string | undefined, options: QueryOptions) => {
  const projectId = options.variables?.input?.projectId ?? PROJECT;
  if (name === 'DeliveryKnowledgeContext')
    return {
      deliveryKnowledgeContext: {
        ...IDENTITY,
        observedAt: '2026-10-31T00:00:00.000Z',
        actor: mockActor(),
        selectedProject: options.variables?.input?.projectId
          ? mockProject(projectId)
          : null,
        canPublish: mockManager,
      },
    };
  if (name === 'DeliveryKnowledgeProjects')
    return {
      deliveryKnowledgeProjects: {
        ...mockEnvelope(),
        scope: 'projects',
        items: mockProjectIds.map((id) => mockProject(id)),
        totalCount: 61,
        nextCursor: 'next-projects',
      },
    };
  if (name === 'DeliveryKnowledgeList')
    return {
      deliveryKnowledgeList: {
        ...mockEnvelope(projectId),
        scope: 'sources',
        items: [mockSource()],
        totalCount: 73,
        nextCursor: 'next-sources',
      },
    };
  if (name === 'DeliveryKnowledgeState')
    return {
      deliveryKnowledgeState: {
        ...mockEnvelope(projectId),
        source: mockSourceExists
          ? { ...mockSource(), version: options.variables?.input?.version ?? 1 }
          : null,
      },
    };
  if (name === 'DeliveryKnowledgeDetail')
    return {
      deliveryKnowledgeDetail: {
        ...mockEnvelope(projectId),
        detail: mockSourceExists
          ? { ...mockDetail(), version: mockDetailVersion }
          : null,
      },
    };
  return undefined;
};
jest.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({
    query: mockClientQuery,
    refetchQueries: mockRefetchQueries,
  }),
  useMutation: (document: DocumentNode) => [
    (options: unknown) =>
      mockMutation(getOperationAST(document)?.name?.value, options),
    { loading: false },
  ],
  useQuery: (document: DocumentNode, options: QueryOptions) => {
    const name = getOperationAST(document)?.name?.value;
    mockQueryCalls(name, options);
    return {
      data: options.skip ? undefined : mockData(name, options),
      loading: false,
      networkStatus: NetworkStatus.ready,
      error:
        name === 'DeliveryKnowledgeContext'
          ? mockContextError
          : name === 'DeliveryKnowledgeDetail'
            ? (mockDetailError ?? mockSourceError)
            : name === 'DeliveryKnowledgeState'
              ? mockSourceError
              : undefined,
      refetch: async () => ({ data: mockData(name, options) }),
    };
  },
}));

const mount = (
  url = `/delivery?view=knowledge&project=${PROJECT}`,
  strict = false,
  earlier: string[] = [],
) => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <DeliveryKnowledge />
          </DeliveryDraftGuardProvider>
        ),
      },
    ],
    { initialEntries: [...earlier, url], initialIndex: earlier.length },
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
        mockVersion += 1;
        mockSubscribers.forEach((listener) => listener());
      }),
  };
};
const prepareMeeting = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Add meeting' }));
  await user.type(
    screen.getByLabelText('Meeting title'),
    'New planning meeting',
  );
  await user.type(
    screen.getByLabelText('Transcript or meeting notes'),
    'Keep exact planned notes',
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
  mockManager = true;
  mockContextError = undefined;
  mockSourceError = undefined;
  mockDetailError = undefined;
  mockSourceExists = true;
  mockRevision = 1;
  mockDetailVersion = 1;
  mockCurrentVersion = 1;
  mockProjectIds = [PROJECT];
  jest.clearAllMocks();
  mockMutation.mockReset().mockRejectedValue(new Error('Lost response'));
  mockClientQuery.mockReset();
  mockRefetch.mockResolvedValue({});
});

it('opens a task-free searchable project directory with complete counts and bounded paging', async () => {
  const { user, router } = mount('/delivery?view=knowledge');
  expect(screen.getByText('Showing 1 of 61 matching projects.')).toBeVisible();
  await user.type(screen.getByLabelText('Find a client project'), 'Launch');
  await user.click(screen.getByRole('button', { name: 'Search projects' }));
  expect(router.state.location.search).toContain(
    'knowledgeProjectSearch=Launch',
  );
  expect(
    mockQueryCalls.mock.calls.some(
      ([name]) =>
        name === 'DeliveryWorkspace' || name === 'DeliveryKnowledgeDetail',
    ),
  ).toBe(false);
  await user.click(screen.getByRole('link', { name: 'Launch brand' }));
  expect(screen.getByText('Showing 1 of 73 matching sources.')).toBeVisible();
});

it('leads with the exact source, closes without losing source filters and returns focus to its list link', async () => {
  const { user, router } = mount(
    `/delivery?view=knowledge&project=${PROJECT}&source=${SOURCE}&knowledgeSearch=launch`,
  );
  const panel = screen.getByRole('region', {
    name: 'Selected knowledge source',
  });
  expect(panel).toHaveFocus();
  expect(
    panel.compareDocumentPosition(
      screen.getByRole('region', { name: 'Brand knowledge sources' }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Close source' }));
  expect(router.state.location.search).toContain('knowledgeSearch=launch');
  expect(router.state.location.search).not.toContain('source=');
  expect(screen.getByRole('link', { name: 'Launch meeting' })).toHaveFocus();
});

it('records a new source ID before saving and freezes an uncertain body until an exact check permits only identical retry', async () => {
  const { user, router } = mount();
  await prepareMeeting(user);
  expect(
    screen.getAllByRole('heading', { name: 'Add brand knowledge' }),
  ).toHaveLength(1);
  const id = new URLSearchParams(router.state.location.search).get(
    'knowledgeCreate',
  );
  expect(id).not.toBeNull();
  await user.click(screen.getByRole('button', { name: 'Save meeting draft' }));
  const first = mockMutation.mock.calls[0][1];
  expect(first.variables.input.id).toBe(id);
  expect(screen.getByLabelText('Transcript or meeting notes')).toBeDisabled();
  mockClientQuery.mockResolvedValueOnce({
    data: { deliveryKnowledgeDetail: { ...mockEnvelope(), detail: null } },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check saved knowledge source' }),
  );
  expect(
    screen.getByRole('button', { name: 'Retry submitted notes' }),
  ).toBeEnabled();
  await user.click(
    screen.getByRole('button', { name: 'Retry submitted notes' }),
  );
  expect(mockMutation.mock.calls[1][1]).toEqual(first);
});

it('requires Check after leaving an uncertain creation and returning with Back', async () => {
  const { user, router } = mount();
  await prepareMeeting(user);
  const requestUrl = router.state.location.search;
  await user.click(screen.getByRole('button', { name: 'Save meeting draft' }));
  await user.click(screen.getByRole('button', { name: 'Close source' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.search).toBe(requestUrl);
  expect(screen.queryByLabelText('Meeting title')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved knowledge source' }),
  ).toBeEnabled();
  expect(mockMutation).toHaveBeenCalledTimes(1);
});

it('discards an editor before Back changes its logical project', async () => {
  const { user, router } = mount(
    `/delivery?view=knowledge&project=${PROJECT}`,
    false,
    [`/delivery?view=knowledge&project=${OTHER_PROJECT}`],
  );
  await prepareMeeting(user);
  await act(async () => {
    await router.navigate(-2);
  });
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByRole('heading', { name: 'Other brand' })).toBeVisible();
  expect(
    screen.queryByLabelText('Transcript or meeting notes'),
  ).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('can select another project after discarding a new draft through the project directory', async () => {
  mockProjectIds = [PROJECT, OTHER_PROJECT];
  const { user, router } = mount();
  await prepareMeeting(user);
  await user.click(
    screen.getByRole('link', { name: 'Choose another project' }),
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(router.state.location.search).toBe('?view=knowledge');
  expect(
    screen.queryByLabelText('Transcript or meeting notes'),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Other brand' }));
  expect(new URLSearchParams(router.state.location.search).get('project')).toBe(
    OTHER_PROJECT,
  );
  expect(screen.getByRole('heading', { name: 'Other brand' })).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('preserves the consumed mounted create draft through a temporary outage under StrictMode', async () => {
  const { user, update } = mount(undefined, true);
  await prepareMeeting(user);
  mockReady = false;
  update();
  expect(
    screen.getByLabelText('Transcript or meeting notes'),
  ).not.toBeVisible();
  mockReady = true;
  update();
  expect(screen.getByLabelText('Transcript or meeting notes')).toHaveValue(
    'Keep exact planned notes',
  );
  expect(mockMutation).not.toHaveBeenCalled();
});

it('removes dirty private raw notes when a manager becomes a published-only reader', async () => {
  const { user, update } = mount(
    `/delivery?view=knowledge&project=${PROJECT}&source=${SOURCE}&knowledgeEdit=1`,
  );
  await user.type(
    screen.getByLabelText('Transcript or meeting notes'),
    ' local private correction',
  );
  mockManager = false;
  update();
  expect(
    screen.queryByLabelText('Transcript or meeting notes'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/local private correction/),
  ).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('hides and restores the same dirty editor through a source-only outage while context remains valid', async () => {
  const { user, update } = mount(
    `/delivery?view=knowledge&project=${PROJECT}&source=${SOURCE}&knowledgeEdit=1`,
  );
  await user.type(
    screen.getByLabelText('Transcript or meeting notes'),
    ' local correction',
  );
  mockSourceError = new Error('Temporary source outage');
  update();
  expect(
    screen.getByLabelText('Transcript or meeting notes'),
  ).not.toBeVisible();
  mockSourceError = undefined;
  update();
  expect(screen.getByLabelText('Transcript or meeting notes')).toHaveValue(
    'Private raw meeting notes local correction',
  );
  expect(mockMutation).not.toHaveBeenCalled();
});

it('disposes private notes and recording links from read mode after verified edit access is removed', async () => {
  const { user, update } = mount(
    `/delivery?view=knowledge&project=${PROJECT}&source=${SOURCE}`,
  );
  await user.click(screen.getByText('Original transcript or notes'));
  expect(screen.getByText('Private raw meeting notes')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Open original source' }),
  ).toBeVisible();
  mockManager = false;
  mockDetailError = new Error('Redacted detail refresh unavailable');
  update();
  expect(
    screen.queryByText('Private raw meeting notes'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Open original source', hidden: true }),
  ).not.toBeInTheDocument();
  expect(mockMutation).not.toHaveBeenCalled();
});

it('treats an omitted Check detail as unverified rather than permission to retry an absent source', async () => {
  const { user } = mount();
  await prepareMeeting(user);
  await user.click(screen.getByRole('button', { name: 'Save meeting draft' }));
  mockClientQuery.mockResolvedValueOnce({
    data: { deliveryKnowledgeDetail: mockEnvelope() },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check saved knowledge source' }),
  );
  expect(screen.getByText(/Your draft could not be checked/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Retry submitted notes' }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Transcript or meeting notes')).toBeDisabled();
  expect(mockMutation).toHaveBeenCalledTimes(1);
});

it('recognizes matching current content after Check without repeating a committed save', async () => {
  const { user, router } = mount();
  await prepareMeeting(user);
  const id = new URLSearchParams(router.state.location.search).get(
    'knowledgeCreate',
  );
  await user.click(screen.getByRole('button', { name: 'Save meeting draft' }));
  const submitted = mockMutation.mock.calls[0][1].variables.input;
  mockClientQuery.mockResolvedValueOnce({
    data: {
      deliveryKnowledgeDetail: {
        ...mockEnvelope(),
        detail: {
          ...mockDetail(),
          ...submitted,
          id,
          revision: 1,
          canEdit: true,
        },
      },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check saved knowledge source' }),
  );
  expect(
    screen.getByText(/current saved draft matches your submitted notes/),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Open saved knowledge' }),
  ).toBeVisible();
  expect(mockMutation).toHaveBeenCalledTimes(1);
});

it('does not let a source denial erase the separately loaded knowledge list', async () => {
  mockSourceError = new CombinedGraphQLErrors({
    errors: [{ message: 'Denied', extensions: { code: 'FORBIDDEN' } }],
  });
  const { user } = mount(
    `/delivery?view=knowledge&project=${PROJECT}&source=${SOURCE}`,
  );
  expect(screen.getByText('Showing 1 of 73 matching sources.')).toBeVisible();
  expect(
    screen.queryByText('Private raw meeting notes'),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Close source' }));
  expect(screen.getByRole('link', { name: 'Launch meeting' })).toBeVisible();
});

it('keeps an unavailable selected source recoverable without failing the list', () => {
  mockSourceExists = false;
  mount(`/delivery?view=knowledge&project=${PROJECT}&source=${SOURCE}`);
  expect(screen.getByText(/This source is unavailable/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Close source' })).toBeEnabled();
  expect(screen.getByText('Showing 1 of 73 matching sources.')).toBeVisible();
});

it('rejects a late detail from another historical version under the same source revision', () => {
  mockCurrentVersion = 2;
  const { update } = mount(
    `/delivery?view=knowledge&project=${PROJECT}&source=${SOURCE}&knowledgeVersion=2`,
  );
  expect(screen.queryByText('Approved launch rules')).not.toBeInTheDocument();
  mockDetailVersion = 2;
  update();
  expect(screen.getByText('Approved launch rules')).toBeVisible();
});

it('refreshes only active knowledge reads after current project access is checked', async () => {
  const { user } = mount();
  await user.click(screen.getByRole('button', { name: 'Refresh page' }));
  expect(mockRefetchQueries).toHaveBeenCalledWith(
    expect.objectContaining({
      include: 'active',
      onQueryUpdated: expect.any(Function),
    }),
  );
  const refresh = mockRefetchQueries.mock.calls[0][0].onQueryUpdated;
  const refetch = jest.fn();
  refresh({ queryName: 'DeliveryKnowledgeList', refetch });
  refresh({ queryName: 'DeliveryKnowledgeDetail', refetch });
  expect(refetch).toHaveBeenCalledTimes(2);
  expect(refresh({ queryName: 'DeliveryWorkspace', refetch })).toBe(false);
});

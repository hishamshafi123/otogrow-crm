import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { useState, type ReactNode } from 'react';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { getOperationAST, type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryCompetitorSourcesPage } from '@/delivery/competitors/DeliveryCompetitorSourcesPage';
import { newCompetitorBody } from '@/delivery/competitors/competitor-body';
import { hashCanonicalCommandInput } from '@/delivery/commands/canonical-command-hash';
import {
  type CompetitorBody,
  type CompetitorSaveInput,
  type CompetitorChangeInput,
  type CompetitorStatus,
} from '@/delivery/competitors/competitor.types';

const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_ID = '44444444-4444-4444-8444-444444444444';
const REVIEWER_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
const SCOPE = 'b'.repeat(64);
const ALTERNATE_REVIEWER_ID = '77777777-7777-4777-8777-777777777777';
let mockScope = SCOPE;
let mockSourcesCursorError = false;
let mockHistoryCursorError = false;
let mockReady = true;
let mockManager = true;
let mockQueryError: Error | undefined;
let mockChoicesLoading = false;
let mockReviewerAvailable = true;
let mockRevision = 1;
let mockProjectRevision = 1;
let mockStatus: CompetitorStatus = 'ACTIVE';
let mockRoleIds: string[] = [];
let mockRefresh: () => void;
let mockReceiptHash = '';
let mockReceiptActor = MEMBER_ID;
let mockPreviewFault:
  | 'hash'
  | 'body'
  | 'actor'
  | 'scope'
  | 'collection'
  | null = null;
let mockBody: CompetitorBody;
let mockNextCursor: string | null = null;
const mockSave = jest.fn(),
  mockChange = jest.fn(),
  mockQuery = jest.fn(),
  mockRead = jest.fn();
const project = () => ({
  id: PROJECT_ID,
  name: 'Otogrow research',
  revision: mockProjectRevision,
  companyId: null,
});
const identity = () => ({
  workspaceId: WORKSPACE_ID,
  memberId: MEMBER_ID,
  userWorkspaceId: 'membership',
  scope: mockScope,
  observedAt: '2026-11-04T06:00:00Z',
  isManager: mockManager,
});
const savedBody = (body: CompetitorBody) => ({
  ...body,
  canonicalReference: 'https://x.com/example',
  canonicalKey: 'a'.repeat(64),
  ownerName: 'Researcher',
  reviewerName: 'Reviewer',
});
const summary = () => ({
  id: SOURCE_ID,
  projectId: PROJECT_ID,
  companyId: null,
  label: mockBody.label,
  platform: mockBody.platform,
  canonicalReference: 'https://x.com/example',
  ownerId: MEMBER_ID,
  ownerName: 'Researcher',
  reviewerId: REVIEWER_ID,
  reviewerName: 'Reviewer',
  revision: mockRevision,
  currentVersion: 2,
  status: mockStatus,
  cadenceHours: mockBody.cadenceHours,
  lookbackDays: mockBody.lookbackDays,
});
const detail = (version?: number) => ({
  ...identity(),
  project: project(),
  source: summary(),
  selectedVersion: version ?? 2,
  body: savedBody(mockBody),
  history: [],
  nextCursor: mockNextCursor,
  canEdit: mockStatus !== 'ARCHIVED' && !version,
  canPause: mockStatus === 'ACTIVE' && !version,
  canArchive: mockStatus !== 'ARCHIVED' && !version,
  canRestore:
    mockStatus !== 'ACTIVE' &&
    (mockStatus !== 'ARCHIVED' || mockManager) &&
    !version,
  collectionEnabled: false,
  collectionState: 'NOT_CONNECTED',
});
const receipt = (
  input: CompetitorSaveInput | CompetitorChangeInput,
  hash: string,
) => ({
  workspaceId: WORKSPACE_ID,
  actorId: mockReceiptActor,
  userWorkspaceId: 'membership',
  requestId: input.requestId,
  sourceId: input.id,
  inputHash: mockReceiptHash || hash,
  action: 'action' in input ? input.action : 'SAVE',
  revision: input.revision + 1,
  version: 2,
  status:
    'action' in input
      ? input.action === 'ARCHIVE'
        ? 'ARCHIVED'
        : input.action === 'PAUSE' || mockStatus === 'ARCHIVED'
          ? 'PAUSED'
          : 'ACTIVE'
      : mockStatus,
  actorName: 'Researcher',
  note: 'note' in input ? input.note : '',
  createdAt: '2026-11-04T06:00:00Z',
});
const queryData = (name: string, input: Record<string, unknown>) => {
  if (name === 'DeliveryCompetitorProjects')
    return {
      deliveryCompetitorProjects: {
        ...identity(),
        items: [project()],
        totalCount: 1,
        nextCursor: mockNextCursor,
      },
    };
  if (name === 'DeliveryCompetitorSources')
    return {
      deliveryCompetitorSources: {
        ...identity(),
        project: project(),
        items: [summary()],
        totalCount: 1,
        nextCursor: mockNextCursor,
      },
    };
  if (name === 'DeliveryCompetitorSourceChoices')
    return {
      deliveryCompetitorSourceChoices: {
        ...identity(),
        project: project(),
        owners: [{ id: MEMBER_ID, name: 'Researcher' }],
        reviewers: mockReviewerAvailable
          ? [
              { id: MEMBER_ID, name: 'Researcher' },
              { id: REVIEWER_ID, name: 'Reviewer' },
            ]
          : [{ id: ALTERNATE_REVIEWER_ID, name: 'Replacement reviewer' }],
      },
    };
  if (name === 'DeliveryCompetitorSource')
    return {
      deliveryCompetitorSource: detail(
        typeof input.version === 'number' ? input.version : undefined,
      ),
    };
  throw new Error(`Unexpected query ${name}`);
};
jest.mock('@/delivery/operations-pages/DeliveryOperationalPage', () => ({
  DeliveryOperationalPage: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryBadge: 'span',
  StyledDeliveryButton: 'button',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryGrid: 'div',
}));
jest.mock('@/delivery/competitors/competitorStyles', () => ({
  StyledCompetitorBoundary: 'fieldset',
  StyledCompetitorItem: 'li',
  StyledCompetitorList: 'ul',
  StyledCompetitorFacts: 'dl',
  StyledCompetitorText: 'p',
  StyledCompetitorForm: 'form',
  StyledCompetitorFields: 'div',
  StyledCompetitorReview: 'section',
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    manager: mockReady && mockManager,
    canManageRoles: mockManager,
    scope: SCOPE,
    denied: false,
    access: mockReady
      ? {
          workspaceId: WORKSPACE_ID,
          memberId: MEMBER_ID,
          userWorkspaceId: 'membership',
          capabilities: mockManager ? ['workspace.admin'] : [],
          roleIds: mockRoleIds,
          grants: [],
        }
      : undefined,
    matches: (
      value?: {
        workspaceId: string;
        memberId: string;
        userWorkspaceId: string;
      } | null,
    ) =>
      mockReady &&
      value?.workspaceId === WORKSPACE_ID &&
      value.memberId === MEMBER_ID &&
      value.userWorkspaceId === 'membership',
  }),
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    document: DocumentNode,
    options: { variables: { input: Record<string, unknown> }; skip?: boolean },
  ) => {
    const name = getOperationAST(document)?.name?.value ?? '';
    if (!options.skip) mockRead(name, options.variables.input);
    const loading =
      name === 'DeliveryCompetitorSourceChoices' && mockChoicesLoading;
    return {
      data:
        options.skip || loading
          ? undefined
          : queryData(name, options.variables.input),
      loading,
      error:
        mockQueryError ??
        ((name === 'DeliveryCompetitorSources' &&
          mockSourcesCursorError &&
          options.variables.input.after) ||
        (name === 'DeliveryCompetitorSource' &&
          mockHistoryCursorError &&
          options.variables.input.after)
          ? new Error('This page changed; open the first page')
          : undefined),
      networkStatus: loading ? NetworkStatus.setVariables : NetworkStatus.ready,
      refetch: async () => ({ data: queryData(name, options.variables.input) }),
    };
  },
  useApolloClient: () => ({ query: mockQuery }),
  useMutation: (document: DocumentNode) => [
    getOperationAST(document)?.name?.value === 'SaveDeliveryCompetitorSource'
      ? mockSave
      : mockChange,
  ],
}));
const setup = (
  entry = `/delivery?view=competitors&competitorProject=${PROJECT_ID}`,
) => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    return (
      <>
        <Link to="/other">Other page</Link>
        <DeliveryCompetitorSourcesPage />
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
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return router;
};
beforeEach(() => {
  jest.clearAllMocks();
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request, TextEncoder });
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockReady = true;
  mockScope = SCOPE;
  mockSourcesCursorError = false;
  mockHistoryCursorError = false;
  mockManager = true;
  mockQueryError = undefined;
  mockChoicesLoading = false;
  mockReviewerAvailable = true;
  mockRevision = 1;
  mockProjectRevision = 1;
  mockStatus = 'ACTIVE';
  mockRoleIds = [];
  mockReceiptHash = '';
  mockReceiptActor = MEMBER_ID;
  mockPreviewFault = null;
  mockNextCursor = null;
  mockBody = {
    ...newCompetitorBody(PROJECT_ID, MEMBER_ID),
    label: 'Example competitor',
    reviewerId: REVIEWER_ID,
    accountReference: '@example',
    purpose: 'Compare public content themes',
  };
  mockSave.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: CompetitorSaveInput };
    }) => ({
      data: {
        saveDeliveryCompetitorSource: receipt(
          input,
          await hashCanonicalCommandInput(input),
        ),
      },
    }),
  );
  mockChange.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: CompetitorChangeInput };
    }) => ({
      data: {
        changeDeliveryCompetitorSourceState: receipt(
          input,
          await hashCanonicalCommandInput(input),
        ),
      },
    }),
  );
  mockQuery.mockImplementation(
    async ({
      query,
      variables: { input },
    }: {
      query: DocumentNode;
      variables: { input: CompetitorSaveInput };
    }) => {
      const name = getOperationAST(query)?.name?.value;
      if (name === 'PreviewDeliveryCompetitorSource')
        return {
          data: {
            previewDeliveryCompetitorSource: {
              ...identity(),
              memberId: mockPreviewFault === 'actor' ? REVIEWER_ID : MEMBER_ID,
              scope: mockPreviewFault === 'scope' ? 'e'.repeat(64) : SCOPE,
              project: project(),
              sourceId: input.id,
              requestId: input.requestId,
              inputHash:
                mockPreviewFault === 'hash'
                  ? 'f'.repeat(64)
                  : await hashCanonicalCommandInput(input),
              body: savedBody({
                ...input.body,
                label:
                  mockPreviewFault === 'body'
                    ? 'Wrong source'
                    : input.body.label,
              }),
              collectionEnabled: mockPreviewFault === 'collection',
              collectionState: ['MANUAL', 'META_AD_LIBRARY'].includes(
                input.body.platform,
              )
                ? 'MANUAL_ONLY'
                : 'NOT_CONNECTED',
            },
          },
        };
      if (name === 'DeliveryCompetitorSourceReceipt')
        return {
          data: {
            deliveryCompetitorSourceReceipt: { ...identity(), receipt: null },
          },
        };
      throw new Error(`Unexpected imperative query ${name}`);
    },
  );
});
const openNewSource = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Add a source' }));
  await user.type(
    screen.getByLabelText('Source name'),
    'New public competitor',
  );
  await user.type(
    screen.getByLabelText('Public account or source reference'),
    '@example',
  );
  await user.selectOptions(
    screen.getByLabelText('Independent reviewer'),
    REVIEWER_ID,
  );
  await user.type(
    screen.getByLabelText('Research purpose'),
    'Compare public themes',
  );
  return user;
};
const previewSource = async () => {
  const user = await openNewSource();
  await user.click(
    screen.getByRole('button', { name: 'Review source before saving' }),
  );
  await screen.findByRole('heading', { name: 'Review prepared source action' });
  return user;
};
const confirmSource = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole('checkbox', { name: /I checked this exact source/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Save source' }));
};

it('reads a compact task-free source directory and preserves the earlier findings link', () => {
  setup();
  expect(
    screen.getByRole('link', { name: 'Example competitor' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Earlier manual findings' }),
  ).toHaveAttribute('href', '/delivery?view=competitors&competitorView=legacy');
  expect(
    screen.getByText('Saved source (collection OFF) · Owner: Researcher'),
  ).toBeVisible();
  expect(mockRead.mock.calls.flat()).not.toContain('DeliveryWorkspace');
  expect(mockSave).not.toHaveBeenCalled();
});
it('previews the server-recognized source then requires a separate explicit save', async () => {
  setup();
  const user = await previewSource();
  expect(screen.getByText('https://x.com/example')).toBeVisible();
  expect(mockSave).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save source' })).toBeDisabled();
  await confirmSource(user);
  expect(await screen.findByText(/Source saved/)).toBeVisible();
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockChange).not.toHaveBeenCalled();
  expect(mockSave.mock.calls[0][0].variables.input).toMatchObject({
    revision: 0,
    projectId: PROJECT_ID,
    projectRevision: 1,
    expectedCompanyId: null,
    body: {
      projectId: PROJECT_ID,
      ownerId: MEMBER_ID,
      reviewerId: REVIEWER_ID,
      cadenceHours: 24,
      lookbackDays: 7,
    },
  });
});
it('lets the owner edit purpose and cadence while keeping source identity fixed', async () => {
  mockManager = false;
  setup(
    `/delivery?view=competitors&competitorProject=${PROJECT_ID}&competitorSource=${SOURCE_ID}`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit source' }));
  expect(screen.getByLabelText('Platform')).toBeDisabled();
  expect(
    screen.getByLabelText('Public account or source reference'),
  ).toHaveAttribute('readonly');
  expect(screen.queryByLabelText('Source owner')).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText('Planned interval in hours'));
  await user.type(screen.getByLabelText('Planned interval in hours'), '48');
  await user.click(
    screen.getByRole('button', { name: 'Review source before saving' }),
  );
  await screen.findByRole('heading', { name: 'Review prepared source action' });
  await confirmSource(user);
  expect(mockSave.mock.calls[0][0].variables.input.body).toMatchObject({
    platform: 'X',
    accountReference: '@example',
    ownerId: MEMBER_ID,
    reviewerId: REVIEWER_ID,
    cadenceHours: 48,
  });
});
it('keeps creation manager-only', () => {
  mockManager = false;
  setup();
  expect(
    screen.queryByRole('button', { name: 'Add a source' }),
  ).not.toBeInTheDocument();
});
it('requires a different reviewer and current source people', async () => {
  setup();
  await openNewSource();
  expect(
    screen.getByRole('option', { name: 'Researcher', selected: false }),
  ).toBeDisabled();
  mockReviewerAvailable = false;
  act(mockRefresh);
  expect(
    screen.getByRole('button', { name: 'Review source before saving' }),
  ).toBeDisabled();
  expect(
    screen.getByText('Current reviewer unavailable — choose again'),
  ).toBeInTheDocument();
  expect(mockSave).not.toHaveBeenCalled();
});
it('keeps entered fields while people are refreshed and blocks preview until they return', async () => {
  setup();
  await openNewSource();
  mockChoicesLoading = true;
  act(mockRefresh);
  expect(screen.getByLabelText('Source name')).toHaveValue(
    'New public competitor',
  );
  expect(
    screen.getByRole('button', { name: 'Review source before saving' }),
  ).toBeDisabled();
  mockChoicesLoading = false;
  act(mockRefresh);
  expect(
    screen.getByRole('button', { name: 'Review source before saving' }),
  ).toBeEnabled();
});
it('keeps a source draft through an outage and declined navigation', async () => {
  setup();
  const user = await openNewSource();
  mockQueryError = new Error('Offline');
  act(mockRefresh);
  expect(screen.getByLabelText('Source name')).not.toBeVisible();
  mockQueryError = undefined;
  act(mockRefresh);
  expect(screen.getByLabelText('Source name')).toHaveValue(
    'New public competitor',
  );
  await user.click(screen.getByRole('link', { name: 'Other page' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Source name')).toHaveValue(
    'New public competitor',
  );
  expect(mockSave).not.toHaveBeenCalled();
});
it('clears private preparation after a real role identity change', async () => {
  setup();
  await openNewSource();
  mockRoleIds = ['new-role'];
  act(mockRefresh);
  await waitFor(() =>
    expect(screen.queryByLabelText('Source name')).not.toBeInTheDocument(),
  );
  expect(screen.getByText(/Unsaved preparation is not restored/)).toBeVisible();
  expect(mockSave).not.toHaveBeenCalled();
});
it.each(['hash', 'body', 'actor', 'scope', 'collection'] as const)(
  'retains the entered source when a preview has a mismatched %s',
  async (fault) => {
    setup();
    const user = await openNewSource();
    mockPreviewFault = fault;
    await user.click(
      screen.getByRole('button', { name: 'Review source before saving' }),
    );
    expect(
      await screen.findByText(/current source preview could not be confirmed/),
    ).toBeVisible();
    expect(screen.getByLabelText('Source name')).toHaveValue(
      'New public competitor',
    );
    expect(
      screen.queryByRole('heading', { name: 'Review prepared source action' }),
    ).not.toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  },
);
it.each(['hash', 'actor'] as const)(
  'never accepts a save receipt with a different %s',
  async (fault) => {
    setup();
    const user = await previewSource();
    if (fault === 'hash') mockReceiptHash = 'e'.repeat(64);
    else mockReceiptActor = REVIEWER_ID;
    await confirmSource(user);
    expect(
      await screen.findByText(/saved result could not be confirmed/),
    ).toBeVisible();
    expect(screen.queryByText(/Source saved/)).not.toBeInTheDocument();
    expect(mockSave).toHaveBeenCalledTimes(1);
  },
);
it('never dispatches on a refreshed request bookmark and checks its exact receipt identity', async () => {
  setup(
    `/delivery?view=competitors&competitorProject=${PROJECT_ID}&competitorSource=${SOURCE_ID}&competitorRequest=${REQUEST_ID}&competitorMode=PAUSE`,
  );
  const user = userEvent.setup();
  expect(screen.getByText(/Unsaved preparation is not restored/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Pause source' }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Check saved source action' }),
  );
  await screen.findByText(/No saved action was found/);
  expect(mockQuery.mock.calls[0][0].variables.input).toEqual({
    projectId: PROJECT_ID,
    sourceId: SOURCE_ID,
    requestId: REQUEST_ID,
  });
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockChange).not.toHaveBeenCalled();
});
it('freezes response loss until checking for a receipt and retries the identical command explicitly', async () => {
  setup();
  const user = await previewSource();
  mockSave.mockRejectedValueOnce(new Error('Response lost'));
  await confirmSource(user);
  await screen.findByText(/saved result could not be confirmed/);
  expect(
    screen.queryByRole('button', { name: 'Return to editing' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry exact source action' }),
  ).not.toBeInTheDocument();
  const original = mockSave.mock.calls[0][0].variables.input;
  await user.click(
    screen.getByRole('button', { name: 'Check saved source action' }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Retry exact source action' }),
  );
  await screen.findByText(/Source saved/);
  expect(mockSave).toHaveBeenCalledTimes(2);
  expect(mockSave.mock.calls[1][0].variables.input).toEqual(original);
});
it('keeps conflict responses frozen until the exact result is checked', async () => {
  setup();
  const user = await previewSource();
  mockSave.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [
        { message: 'Project changed', extensions: { code: 'CONFLICT' } },
      ],
    }),
  );
  await confirmSource(user);
  expect(await screen.findByText('Project changed')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Return to editing' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved source action' }),
  ).toBeEnabled();
});
it('blocks a stale preview and preserves the draft in a deliberately prepared new request', async () => {
  const router = setup();
  const user = await previewSource();
  const original = new URLSearchParams(router.state.location.search).get(
    'competitorRequest',
  );
  mockProjectRevision = 2;
  act(mockRefresh);
  expect(screen.getByText(/project, source or access changed/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save source' })).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', { name: /I reviewed the current source/ }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Prepare new request with my draft' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Source name')).toBeVisible(),
  );
  expect(screen.getByLabelText('Source name')).toHaveValue(
    'New public competitor',
  );
  expect(
    new URLSearchParams(router.state.location.search).get('competitorRequest'),
  ).not.toBe(original);
  expect(mockSave).not.toHaveBeenCalled();
});
it('blocks saving when the selected reviewer is removed after preview', async () => {
  setup();
  const user = await previewSource();
  mockReviewerAvailable = false;
  act(mockRefresh);
  await user.click(
    screen.getByRole('checkbox', { name: /I checked this exact source/ }),
  );
  expect(screen.getByRole('button', { name: 'Save source' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Return to editing' }));
  expect(
    screen.getByText('Current reviewer unavailable — choose again'),
  ).toBeInTheDocument();
  expect(mockSave).not.toHaveBeenCalled();
});
it('restores an archived source as paused and shows the resulting state with collection off', async () => {
  mockStatus = 'ARCHIVED';
  setup(
    `/delivery?view=competitors&competitorProject=${PROJECT_ID}&competitorSource=${SOURCE_ID}`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Restore source' }));
  expect(
    screen.getByText(/Restore this archived source as Paused/),
  ).toBeVisible();
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Return for source review',
  );
  await user.click(screen.getByRole('button', { name: 'Review this change' }));
  await user.click(
    screen.getByRole('checkbox', { name: /I checked this exact source/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Restore source' }));
  expect(await screen.findByText(/Source restored/)).toBeVisible();
  expect(screen.getByText(/Paused · Collection remains OFF/)).toBeVisible();
  expect(mockChange.mock.calls[0][0].variables.input).toMatchObject({
    action: 'RESTORE',
    projectRevision: 1,
    expectedCompanyId: null,
    revision: 1,
    note: 'Return for source review',
  });
  expect(mockSave).not.toHaveBeenCalled();
});
it('loads an exact earlier configuration and keeps edits on the current version', () => {
  setup(
    `/delivery?view=competitors&competitorProject=${PROJECT_ID}&competitorSource=${SOURCE_ID}&competitorVersion=1`,
  );
  expect(screen.getByText('Configuration version 1 of 2')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Open current version' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Edit source' }),
  ).not.toBeInTheDocument();
  expect(
    mockRead.mock.calls.find(
      ([name]) => name === 'DeliveryCompetitorSource',
    )?.[1],
  ).toMatchObject({ id: SOURCE_ID, version: 1 });
});
it('passes opaque page cursors unchanged without treating their content as authority', () => {
  const cursor = 'opaque-token_123';
  mockNextCursor = 'another-page';
  setup(
    `/delivery?view=competitors&competitorProject=${PROJECT_ID}&competitorAfter=${cursor}`,
  );
  expect(
    mockRead.mock.calls.find(
      ([name]) => name === 'DeliveryCompetitorSources',
    )?.[1],
  ).toMatchObject({ after: cursor });
  expect(screen.getByRole('link', { name: 'More sources' })).toHaveAttribute(
    'href',
    expect.stringContaining('competitorAfter=another-page'),
  );
});
it('rejects an invalid source/action URL without fetching private source data', () => {
  setup(
    `/delivery?view=competitors&competitorProject=${PROJECT_ID}&competitorSource=${SOURCE_ID}&competitorMode=PAUSE`,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'This source link is incomplete or invalid',
  );
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockChange).not.toHaveBeenCalled();
});

it('recovers a committed save after response loss without dispatching it again', async () => {
  setup();
  const user = await previewSource();
  mockSave.mockRejectedValueOnce(new Error('Response lost after commit'));
  await confirmSource(user);
  await screen.findByText(/saved result could not be confirmed/);
  const original: CompetitorSaveInput =
    mockSave.mock.calls[0][0].variables.input;
  mockQuery.mockResolvedValueOnce({
    data: {
      deliveryCompetitorSourceReceipt: {
        ...identity(),
        receipt: receipt(original, await hashCanonicalCommandInput(original)),
      },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check saved source action' }),
  );
  expect(await screen.findByText(/Source saved/)).toBeVisible();
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', { name: 'Retry exact source action' }),
  ).not.toBeInTheDocument();
});
it('refuses a checked receipt for another prepared body', async () => {
  setup();
  const user = await previewSource();
  mockSave.mockRejectedValueOnce(new Error('Response lost'));
  await confirmSource(user);
  await screen.findByText(/saved result could not be confirmed/);
  const original: CompetitorSaveInput =
    mockSave.mock.calls[0][0].variables.input;
  mockQuery.mockResolvedValueOnce({
    data: {
      deliveryCompetitorSourceReceipt: {
        ...identity(),
        receipt: receipt(original, 'f'.repeat(64)),
      },
    },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check saved source action' }),
  );
  expect(
    await screen.findByText(/saved action could not be checked/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Retry exact source action' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Source saved/)).not.toBeInTheDocument();
  expect(mockSave).toHaveBeenCalledTimes(1);
});
it('returns logical focus to the project directory when source detail closes', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'Example competitor' }));
  expect(screen.getByRole('region', { name: 'Source detail' })).toHaveFocus();
  await user.click(screen.getByRole('link', { name: 'Back to sources' }));
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Otogrow research' }),
    ).toHaveFocus(),
  );
});

it('repairs revoked reviewer selection in a new request only after a dispatched rejection is confirmed absent', async () => {
  const router = setup();
  const user = await previewSource();
  const oldRequest = new URLSearchParams(router.state.location.search).get(
    'competitorRequest',
  );
  mockSave.mockImplementationOnce(async () => {
    mockReviewerAvailable = false;
    throw new CombinedGraphQLErrors({
      errors: [
        {
          message: 'The reviewer is no longer available.',
          extensions: { code: 'BAD_USER_INPUT' },
        },
      ],
    });
  });
  await confirmSource(user);
  await screen.findByText('The reviewer is no longer available.');
  expect(
    screen.queryByRole('button', { name: 'Return to editing' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Prepare new request with my draft' }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Check saved source action' }),
  );
  await screen.findByText(/No saved action was found/);
  expect(
    screen.queryByRole('button', { name: 'Retry exact source action' }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('checkbox', { name: /I reviewed the current source/ }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Prepare new request with my draft' }),
  );
  expect(await screen.findByLabelText('Source name')).toHaveValue(
    'New public competitor',
  );
  expect(
    screen.getByRole('button', { name: 'Review source before saving' }),
  ).toBeDisabled();
  expect(
    new URLSearchParams(router.state.location.search).get('competitorRequest'),
  ).not.toBe(oldRequest);
  await user.selectOptions(
    screen.getByLabelText('Independent reviewer'),
    ALTERNATE_REVIEWER_ID,
  );
  await user.click(
    screen.getByRole('button', { name: 'Review source before saving' }),
  );
  await screen.findByRole('heading', { name: 'Review prepared source action' });
  await confirmSource(user);
  expect(await screen.findByText(/Source saved/)).toBeVisible();
  expect(mockSave).toHaveBeenCalledTimes(2);
  expect(mockSave.mock.calls[1][0].variables.input.body.reviewerId).toBe(
    ALTERNATE_REVIEWER_ID,
  );
});
it('resets a stale second-page cursor without losing the exact draft, then requires reviewed preparation under current scope', async () => {
  const router = setup(
    `/delivery?view=competitors&competitorProject=${PROJECT_ID}&competitorAfter=second-page`,
  );
  const user = await openNewSource();
  const oldRequest = new URLSearchParams(router.state.location.search).get(
    'competitorRequest',
  );
  mockSourcesCursorError = true;
  mockProjectRevision = 2;
  mockScope = 'c'.repeat(64);
  act(mockRefresh);
  expect(screen.getByLabelText('Source name')).not.toBeVisible();
  await user.click(screen.getByRole('link', { name: 'First source page' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    new URLSearchParams(router.state.location.search).has('competitorAfter'),
  ).toBe(false);
  expect(
    new URLSearchParams(router.state.location.search).get('competitorRequest'),
  ).toBe(oldRequest);
  expect(screen.getByText(/project, source or access changed/)).toBeVisible();
  await user.click(
    screen.getByRole('checkbox', { name: /I reviewed the current source/ }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Prepare new request with my draft' }),
  );
  expect(await screen.findByLabelText('Source name')).toHaveValue(
    'New public competitor',
  );
  expect(
    new URLSearchParams(router.state.location.search).get('competitorRequest'),
  ).not.toBe(oldRequest);
  expect(mockSave).not.toHaveBeenCalled();
});
it('recovers stale source history by reopening the latest history page', async () => {
  setup(
    `/delivery?view=competitors&competitorProject=${PROJECT_ID}&competitorSource=${SOURCE_ID}&competitorHistoryAfter=old-history&competitorVersion=1`,
  );
  mockHistoryCursorError = true;
  act(mockRefresh);
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'Latest changes' }));
  expect(await screen.findByText('Configuration version 1 of 2')).toBeVisible();
  expect(mockSave).not.toHaveBeenCalled();
});

it('moves keyboard focus through preview and saved-result stages as their controls disappear', async () => {
  setup();
  const user = await openNewSource();
  screen.getByRole('button', { name: 'Review source before saving' }).focus();
  await user.keyboard('{Enter}');
  const preview = await screen.findByRole('region', {
    name: 'Review prepared source action',
  });
  expect(preview).toHaveFocus();
  await user.tab();
  expect(
    screen.getByRole('link', { name: 'https://x.com/example' }),
  ).toHaveFocus();
  await user.tab();
  expect(
    screen.getByRole('checkbox', { name: /I checked this exact source/ }),
  ).toHaveFocus();
  await user.keyboard(' ');
  await user.tab();
  expect(screen.getByRole('button', { name: 'Save source' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(
    await screen.findByRole('status', { name: 'Saved source action' }),
  ).toHaveFocus();
  expect(
    screen.getByRole('heading', { name: 'Saved source action' }),
  ).toBeVisible();
  await user.tab();
  expect(
    screen.getByRole('link', { name: 'Open saved configuration' }),
  ).toHaveFocus();
  expect(mockSave).toHaveBeenCalledTimes(1);
});

it('identifies the selected source in archive preparation and exact confirmation', async () => {
  setup(
    `/delivery?view=competitors&competitorProject=${PROJECT_ID}&competitorSource=${SOURCE_ID}`,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Archive source' }));
  expect(
    screen.getByText('Example competitor', { selector: 'strong' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'https://x.com/example' }),
  ).toHaveAttribute('href', 'https://x.com/example');
  await user.type(
    screen.getByLabelText('Reason for this change'),
    'Research scope changed',
  );
  await user.click(screen.getByRole('button', { name: 'Review this change' }));
  const confirmation = await screen.findByRole('region', {
    name: 'Review prepared source action',
  });
  expect(
    within(confirmation).getByText('Example competitor', {
      selector: 'strong',
    }),
  ).toBeVisible();
  expect(
    within(confirmation).getByText(/· X ·/, { selector: 'p' }),
  ).toBeVisible();
  expect(
    within(confirmation).getByRole('link', { name: 'https://x.com/example' }),
  ).toHaveAttribute('href', 'https://x.com/example');
  expect(mockChange).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('checkbox', { name: /I checked this exact source/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Archive source' }));
  expect(await screen.findByText(/Source archived/)).toBeVisible();
  expect(mockChange).toHaveBeenCalledTimes(1);
  expect(mockChange.mock.calls[0][0].variables.input).toMatchObject({
    id: SOURCE_ID,
    action: 'ARCHIVE',
    note: 'Research scope changed',
  });
});

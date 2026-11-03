import { useState, type ReactNode } from 'react';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type SeoBody } from '@/delivery/seo-results/seo-results.types';
import { DeliverySeoResultsPage } from '@/delivery/seo-results/DeliverySeoResultsPage';
import {
  type DeliverySeoDecisionInput,
  type DeliverySeoSaveInput,
} from '~/generated-metadata/graphql';

const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '55555555-5555-4555-8555-555555555555';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const REPORT_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
let mockReady = true;
let mockManager = true;
let mockQueryError: Error | undefined;
let mockReportExists = true;
let mockRevision = 1;
let mockStatus = 'DRAFT';
let mockRoleIds: string[] = [];
let mockRefresh: () => void;
const mockSave = jest.fn();
const mockDecide = jest.fn();
const mockQuery = jest.fn();
const mockRead = jest.fn();
const actor = () => ({
  memberId: MEMBER_ID,
  isManager: mockManager,
  isAdmin: mockManager,
});
const identity = () => ({
  workspaceId: WORKSPACE_ID,
  memberId: MEMBER_ID,
  userWorkspaceId: 'membership',
  scope: 'scope',
  observedAt: '2026-11-03T06:00:00Z',
  actor: actor(),
});
const project = {
  id: PROJECT_ID,
  name: 'Example brand',
  revision: 1,
  companyId: null,
};
const body = (): SeoBody => ({
  title: 'Weekly SEO results',
  ownerId: OWNER_ID,
  period: 'WEEKLY',
  periodStart: '2026-10-19',
  periodEnd: '2026-10-25',
  timezone: 'Asia/Qatar',
  summary: 'Search performance from recorded evidence',
  workNotes: 'Published reviewed technical fixes',
  tasks: [],
  evidence: [],
  metrics: [
    {
      id: REQUEST_ID,
      key: 'CLICKS',
      label: 'Organic clicks',
      unit: 'COUNT',
      value: '0',
      unknownReason: '',
      source: 'SEARCH_CONSOLE',
      sourceUrl: 'https://example.com/evidence',
      property: 'https://example.com',
      segment: 'All search',
      definition: 'Clicks reported in this period',
      observedAt: '2026-10-26T06:00:00+03:00',
    },
  ],
  comparisonId: null,
  comparisonVersion: null,
});
const summary = () => ({
  id: REPORT_ID,
  projectId: PROJECT_ID,
  title: body().title,
  status: mockStatus,
  revision: mockRevision,
  currentVersion: 1,
  approvedVersion: mockStatus === 'APPROVED' ? 1 : null,
  periodStart: body().periodStart,
  periodEnd: body().periodEnd,
  createdBy: OWNER_ID,
  ownerId: OWNER_ID,
  ownerName: 'SEO specialist',
  createdByName: 'SEO specialist',
});
const receipt = (
  requestId = REQUEST_ID,
  reportId = REPORT_ID,
  action = 'SAVE',
  revision = 2,
) => ({
  requestId,
  reportId,
  action,
  revision,
  version: 1,
  status: mockStatus,
  actorName: 'Reviewing manager',
  note: '',
  createdAt: '2026-11-03T06:00:00Z',
  workspaceId: WORKSPACE_ID,
  actorId: MEMBER_ID,
  userWorkspaceId: 'membership',
  inputHash: 'a'.repeat(64),
});
const operationName = (document: DocumentNode) => {
  const operation = document.definitions.find(
    (entry) => entry.kind === 'OperationDefinition',
  );
  return operation?.kind === 'OperationDefinition' ? operation.name?.value : '';
};
const queryData = (name: string, input: Record<string, unknown>) => {
  const permissions = {
    canEdit: mockStatus === 'DRAFT' || mockStatus === 'CHANGES_REQUESTED',
    canSubmit: mockStatus === 'DRAFT' || mockStatus === 'CHANGES_REQUESTED',
    canReview: mockStatus === 'SUBMITTED' && mockManager,
    clientAnchorChanged: false,
  };
  if (name === 'DeliverySeoProjects')
    return {
      deliverySeoProjects: {
        ...identity(),
        items: [project],
        totalCount: 1,
        nextId: null,
      },
    };
  if (name === 'DeliverySeoReports')
    return {
      deliverySeoReports: {
        ...identity(),
        project,
        items: mockReportExists ? [summary()] : [],
        totalCount: mockReportExists ? 1 : 0,
        nextId: null,
      },
    };
  if (name === 'DeliverySeoChoices')
    return {
      deliverySeoChoices: {
        ...identity(),
        members: [{ id: OWNER_ID, name: 'SEO specialist' }],
        tasks: [],
        totalTaskCount: 0,
        nextTaskId: null,
        nextMemberId: null,
      },
    };
  if (name === 'DeliverySeoReportState')
    return {
      deliverySeoReportState: {
        ...identity(),
        project,
        report: summary(),
        ...permissions,
      },
    };
  if (name === 'DeliverySeoReport')
    return {
      deliverySeoReport: {
        ...identity(),
        project,
        report: summary(),
        version: input.version ?? 1,
        body: body(),
        taskSnapshots: [],
        comparison: [],
        comparisonTitle: null,
        comparisonPeriodStart: null,
        comparisonPeriodEnd: null,
        comparisonTimezone: null,
        history: [],
        nextEventId: null,
        ...permissions,
      },
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
jest.mock('@/delivery/seo-results/seoStyles', () => ({
  StyledSeoBoundary: 'fieldset',
  StyledSeoItem: 'article',
  StyledSeoFacts: 'dl',
  StyledSeoText: 'p',
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    manager: mockReady && mockManager,
    canManageRoles: mockManager,
    scope: 'scope',
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
    options: { variables: { input: Record<string, unknown> } },
  ) => {
    const name = operationName(document) ?? '';
    mockRead(name);
    return {
      data: queryData(name, options.variables.input),
      loading: false,
      error: mockQueryError,
      networkStatus: NetworkStatus.ready,
      refetch: async () => ({ data: queryData(name, options.variables.input) }),
    };
  },
  useApolloClient: () => ({ query: mockQuery }),
  useMutation: (document: DocumentNode) => [
    operationName(document) === 'SaveDeliverySeoReport' ? mockSave : mockDecide,
  ],
}));
const setup = (entry = `/delivery?view=seo&seoProject=${PROJECT_ID}`) => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    return (
      <>
        <Link to="/delivery?view=home">Today</Link>
        <DeliverySeoResultsPage />
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
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return router;
};
beforeEach(() => {
  jest.clearAllMocks();
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockReady = true;
  mockManager = true;
  mockQueryError = undefined;
  mockReportExists = true;
  mockRevision = 1;
  mockStatus = 'DRAFT';
  mockRoleIds = [];
  mockSave.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: DeliverySeoSaveInput };
    }) => ({
      data: {
        saveDeliverySeoReport: receipt(
          input.requestId,
          input.id,
          'SAVE',
          input.revision + 1,
        ),
      },
    }),
  );
  mockDecide.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: DeliverySeoDecisionInput };
    }) => ({
      data: {
        decideDeliverySeoReport: receipt(
          input.requestId,
          input.id,
          input.action,
          input.revision + 1,
        ),
      },
    }),
  );
  mockQuery.mockRejectedValue(
    new CombinedGraphQLErrors({
      errors: [
        { message: 'No saved request', extensions: { code: 'NOT_FOUND' } },
      ],
    }),
  );
});
it('opens a task-free report library and clearly separates recorded metrics from automatic connections', () => {
  setup();
  expect(
    screen.getByRole('link', { name: 'Weekly SEO results' }),
  ).toBeVisible();
  expect(
    screen.getByText(
      /Search Console and Analytics are not automatically connected/,
    ),
  ).toBeVisible();
  expect(mockRead.mock.calls.flat()).not.toContain('DeliveryWorkspace');
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockDecide).not.toHaveBeenCalled();
});
it('saves a genuine new draft without automatically submitting or approving it', async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'New SEO report' }));
  await user.type(screen.getByLabelText('Report title'), 'A new weekly report');
  await user.type(screen.getByLabelText('Period starts'), '2026-10-19');
  await user.type(screen.getByLabelText('Period ends'), '2026-10-25');
  await user.selectOptions(screen.getByLabelText('Report owner'), OWNER_ID);
  await user.click(screen.getByRole('button', { name: 'Save report draft' }));
  expect(
    await screen.findByText(/The saved report action was confirmed/),
  ).toBeVisible();
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockDecide).not.toHaveBeenCalled();
  expect(mockSave.mock.calls[0][0].variables.input.body.metrics).toEqual([]);
});
it('keeps a draft through transport failure and keeps its exact fields when leaving is declined', async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'New SEO report' }));
  await user.type(
    screen.getByLabelText('Report title'),
    'Unsent private report',
  );
  mockQueryError = new Error('Offline');
  act(mockRefresh);
  expect(screen.getByLabelText('Report title')).not.toBeVisible();
  mockQueryError = undefined;
  act(mockRefresh);
  expect(screen.getByLabelText('Report title')).toHaveValue(
    'Unsent private report',
  );
  await user.click(screen.getByRole('link', { name: 'Today' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
    'seo',
  );
  expect(screen.getByLabelText('Report title')).toHaveValue(
    'Unsent private report',
  );
});
it('never reconstructs an editable report from a reloaded command URL', async () => {
  setup(
    `/delivery?view=seo&seoProject=${PROJECT_ID}&seoReport=${REPORT_ID}&seoMode=edit&seoRequest=${REQUEST_ID}`,
  );
  expect(screen.queryByLabelText('Report title')).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Check saved report action' }),
  );
  expect(await screen.findByText(/No saved action was found/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Retry exact report action' }),
  ).not.toBeInTheDocument();
  expect(mockSave).not.toHaveBeenCalled();
});
it('recovers an unknown save by exact actor-bound receipt without creating a second version', async () => {
  mockSave.mockRejectedValueOnce(new Error('Lost reply'));
  setup(`/delivery?view=seo&seoProject=${PROJECT_ID}&seoReport=${REPORT_ID}`);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit report draft' }));
  await user.type(
    screen.getByLabelText('Results summary'),
    ' Additional reviewed evidence.',
  );
  await user.click(screen.getByRole('button', { name: 'Save report draft' }));
  expect(
    await screen.findByText(/Your exact submitted report action is kept/),
  ).toBeVisible();
  const input = mockSave.mock.calls[0][0].variables.input;
  expect(screen.getByLabelText('Report title')).toBeDisabled();
  mockQuery.mockResolvedValueOnce({
    data: { deliverySeoReceipt: receipt(input.requestId, input.id) },
  });
  await user.click(
    screen.getByRole('button', { name: 'Check saved report action' }),
  );
  expect(
    await screen.findByText(/The saved report action was confirmed/),
  ).toBeVisible();
  expect(mockSave).toHaveBeenCalledTimes(1);
});
it('requires an explicit independent manager review and records return notes separately from report content', async () => {
  mockStatus = 'SUBMITTED';
  setup(`/delivery?view=seo&seoProject=${PROJECT_ID}&seoReport=${REPORT_ID}`);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Return for changes' }));
  expect(
    screen.getByRole('button', { name: 'Request report changes' }),
  ).toBeDisabled();
  await user.type(
    screen.getByLabelText('Review notes'),
    'Clarify the source property.',
  );
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed the report evidence and this decision.',
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Request report changes' }),
  );
  expect(mockDecide.mock.calls[0][0].variables.input).toEqual(
    expect.objectContaining({
      action: 'REQUEST_CHANGES',
      note: 'Clarify the source property.',
      revision: 1,
    }),
  );
  expect(mockSave).not.toHaveBeenCalled();
});
it('cancels queued navigation and disposes private preparation on a confirmed source denial', async () => {
  const router = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'New SEO report' }));
  await user.type(screen.getByLabelText('Report title'), 'Do not resurrect');
  await user.click(screen.getByRole('link', { name: 'Today' }));
  expect(screen.getByRole('button', { name: 'Keep editing' })).toBeVisible();
  mockQueryError = new CombinedGraphQLErrors({
    errors: [
      { message: 'Forbidden report', extensions: { code: 'FORBIDDEN' } },
    ],
  });
  act(mockRefresh);
  expect(
    screen.queryByDisplayValue('Do not resurrect'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Keep editing' }),
  ).not.toBeInTheDocument();
  expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
    'seo',
  );
  mockQueryError = undefined;
  act(mockRefresh);
  await user.click(screen.getByRole('button', { name: 'Check SEO access' }));
  expect(screen.queryByLabelText('Report title')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved report action' }),
  ).toBeVisible();
});
it('keeps authorized text through a revision conflict and never submits its stale revision', async () => {
  setup(`/delivery?view=seo&seoProject=${PROJECT_ID}&seoReport=${REPORT_ID}`);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit report draft' }));
  await user.type(
    screen.getByLabelText('Results summary'),
    ' Retained unsaved analysis.',
  );
  const retainedInput = screen.getByLabelText('Results summary');
  mockRevision = 2;
  act(mockRefresh);
  expect(screen.getByLabelText('Results summary')).toBe(retainedInput);
  expect(retainedInput).toHaveValue(
    'Search performance from recorded evidence Retained unsaved analysis.',
  );
  expect(
    screen.getByRole('button', { name: 'Save report draft' }),
  ).toBeDisabled();
  expect(mockSave).not.toHaveBeenCalled();
});
it('shows a definitive validation rejection and allows the retained report notes to be corrected', async () => {
  mockSave.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [
        {
          message: 'Choose distinct metric labels.',
          extensions: { code: 'BAD_USER_INPUT' },
        },
      ],
    }),
  );
  setup(`/delivery?view=seo&seoProject=${PROJECT_ID}&seoReport=${REPORT_ID}`);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit report draft' }));
  await user.type(
    screen.getByLabelText('Results summary'),
    ' Retained correction.',
  );
  await user.click(screen.getByRole('button', { name: 'Save report draft' }));
  expect(
    await screen.findByText('Choose distinct metric labels.'),
  ).toBeVisible();
  expect(screen.getByLabelText('Results summary')).toBeEnabled();
  expect(screen.getByLabelText('Results summary')).toHaveValue(
    'Search performance from recorded evidence Retained correction.',
  );
  expect(
    screen.queryByRole('button', { name: 'Retry exact report action' }),
  ).not.toBeInTheDocument();
});
it('permits only the identical frozen retry after a fresh not-found receipt check', async () => {
  mockSave.mockRejectedValueOnce(new Error('Unknown connection outcome'));
  setup(`/delivery?view=seo&seoProject=${PROJECT_ID}&seoReport=${REPORT_ID}`);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit report draft' }));
  await user.type(
    screen.getByLabelText('Results summary'),
    ' Original submitted notes.',
  );
  await user.click(screen.getByRole('button', { name: 'Save report draft' }));
  const original = mockSave.mock.calls[0][0];
  await user.click(
    screen.getByRole('button', { name: 'Check saved report action' }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Retry exact report action' }),
  );
  expect(mockSave.mock.calls[1][0]).toEqual(original);
  expect(mockSave).toHaveBeenCalledTimes(2);
});

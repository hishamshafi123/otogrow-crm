import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { useState, type ReactNode } from 'react';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { getOperationAST, type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryDevelopmentPage } from '@/delivery/development/DeliveryDevelopmentPage';
import { newReleaseBody } from '@/delivery/development/release-body';
import { hashCanonicalCommandInput } from '@/delivery/commands/canonical-command-hash';
import {
  type ReleaseBody,
  type ReleaseTask,
} from '@/delivery/development/release.types';
import {
  type DeliveryReleaseSaveInput,
  type DeliveryReleaseDecisionInput,
} from '~/generated-metadata/graphql';

const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const RELEASE_ID = '44444444-4444-4444-8444-444444444444';
const TASK_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
const SCOPE = 'b'.repeat(64);
let mockReady = true;
let mockManager = true;
let mockQueryError: Error | undefined;
let mockChoicesLoading = false;
let mockRevision = 1;
let mockProjectRevision = 1;
let mockStatus = 'DRAFT';
let mockRoleIds: string[] = [];
let mockRefresh: () => void;
let mockReceiptHash = '';
let mockReceiptActor = MEMBER_ID;
let mockPreviewFault: 'hash' | 'body' | 'actor' | 'scope' | null = null;
let mockBody: ReleaseBody;
const mockSave = jest.fn(),
  mockDecide = jest.fn(),
  mockQuery = jest.fn(),
  mockRead = jest.fn();
const project = () => ({
  id: PROJECT_ID,
  name: 'Example app',
  revision: mockProjectRevision,
  companyId: null,
});
const identity = () => ({
  workspaceId: WORKSPACE_ID,
  memberId: MEMBER_ID,
  userWorkspaceId: 'membership',
  scope: SCOPE,
  observedAt: '2026-11-03T06:00:00Z',
  isManager: mockManager,
});
const task: ReleaseTask = {
  taskId: TASK_ID,
  title: 'Fix checkout',
  revision: 3,
  assigneeId: MEMBER_ID,
  state: 'APPROVED',
  submissionVersion: 2,
  submittedBy: MEMBER_ID,
  reviewedBy: 'independent-manager',
  reviewedAt: '2026-11-03T05:00:00Z',
  approved: true,
  sourceHash: 'd'.repeat(64),
};
const summary = () => ({
  id: RELEASE_ID,
  projectId: PROJECT_ID,
  companyId: null,
  title: mockBody.title,
  status: mockStatus,
  revision: mockRevision,
  currentVersion: 1,
  targetDate: mockBody.targetDate,
  createdBy: TASK_ID,
  ownerId: MEMBER_ID,
  ownerName: 'Developer',
});
const detail = () => ({
  ...identity(),
  project: project(),
  release: summary(),
  selectedVersion: 1,
  body: { ...mockBody, tasks: [], sourceFingerprint: 'a'.repeat(64) },
  history: [],
  nextEventId: null,
  currentSourceFingerprint: 'a'.repeat(64),
  sourceChanged: false,
  canEdit: mockStatus === 'DRAFT' || mockStatus === 'CHANGES_REQUESTED',
  canSubmit: mockStatus === 'DRAFT',
  canReview: mockStatus === 'SUBMITTED' && mockManager,
  canRecordDeployment: mockStatus === 'APPROVED',
  canRecordHandover: mockStatus === 'DEPLOYED',
  canRecordAcceptance: mockStatus === 'HANDED_OVER',
  reviewBlockedReason: null,
});
const receipt = (
  input: DeliveryReleaseSaveInput | DeliveryReleaseDecisionInput,
  hash: string,
) => ({
  workspaceId: WORKSPACE_ID,
  actorId: mockReceiptActor,
  userWorkspaceId: 'membership',
  requestId: input.requestId,
  releaseId: input.id,
  inputHash: mockReceiptHash || hash,
  action: 'action' in input ? input.action : 'SAVE',
  revision: input.revision + 1,
  version: 1,
  status: mockStatus,
  actorName: 'Developer',
  note: '',
  evidenceUrl: '',
  environment: '',
  commitSha: '',
  createdAt: '2026-11-03T06:00:00Z',
});
const queryData = (name: string, input: Record<string, unknown>) => {
  if (name === 'DeliveryReleaseProjects')
    return {
      deliveryReleaseProjects: {
        ...identity(),
        items: [project()],
        totalCount: 1,
        nextId: null,
      },
    };
  if (name === 'DeliveryReleaseList')
    return {
      deliveryReleaseList: {
        ...identity(),
        project: project(),
        items: [summary()],
        totalCount: 1,
        nextId: null,
      },
    };
  if (name === 'DeliveryReleaseChoices')
    return {
      deliveryReleaseChoices: {
        ...identity(),
        project: project(),
        owners: [{ id: MEMBER_ID, name: 'Developer' }],
        tasks: [task],
        selectedTasks:
          Array.isArray(input.selectedTaskIds) &&
          input.selectedTaskIds.includes(TASK_ID)
            ? [task]
            : [],
        totalCount: 1,
        nextTaskId: null,
      },
    };
  if (name === 'DeliveryReleaseDetail')
    return { deliveryReleaseDetail: detail() };
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
jest.mock('@/delivery/development/releaseStyles', () => ({
  StyledReleaseBoundary: 'fieldset',
  StyledReleaseItem: 'article',
  StyledReleaseFacts: 'dl',
  StyledReleaseText: 'p',
  StyledReleaseActions: 'div',
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
    mockRead(name);
    const loading = name === 'DeliveryReleaseChoices' && mockChoicesLoading;
    return {
      data:
        options.skip || loading
          ? undefined
          : queryData(name, options.variables.input),
      loading,
      error: mockQueryError,
      networkStatus: loading ? NetworkStatus.setVariables : NetworkStatus.ready,
      refetch: async () => ({ data: queryData(name, options.variables.input) }),
    };
  },
  useApolloClient: () => ({ query: mockQuery }),
  useMutation: (document: DocumentNode) => [
    getOperationAST(document)?.name?.value === 'SaveDeliveryRelease'
      ? mockSave
      : mockDecide,
  ],
}));
const setup = (
  entry = `/delivery?view=development&releaseProject=${PROJECT_ID}`,
) => {
  const Page = () => {
    const [, update] = useState(0);
    mockRefresh = () => update((value) => value + 1);
    return (
      <>
        <Link to="/other">Other page</Link>
        <DeliveryDevelopmentPage />
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
  mockManager = true;
  mockQueryError = undefined;
  mockChoicesLoading = false;
  mockRevision = 1;
  mockProjectRevision = 1;
  mockStatus = 'DRAFT';
  mockRoleIds = [];
  mockReceiptHash = '';
  mockReceiptActor = MEMBER_ID;
  mockPreviewFault = null;
  mockBody = {
    ...newReleaseBody(MEMBER_ID, (kind) => kind),
    title: 'Checkout release',
    targetDate: '2026-11-04',
    repositoryUrl: 'https://github.com/example/app',
    commitSha: 'a'.repeat(40),
  };
  mockSave.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: DeliveryReleaseSaveInput };
    }) => ({
      data: {
        saveDeliveryRelease: receipt(
          input,
          await hashCanonicalCommandInput(input),
        ),
      },
    }),
  );
  mockDecide.mockImplementation(
    async ({
      variables: { input },
    }: {
      variables: { input: DeliveryReleaseDecisionInput };
    }) => ({
      data: {
        decideDeliveryRelease: receipt(
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
      variables: { input: DeliveryReleaseSaveInput };
    }) => {
      const name = getOperationAST(query)?.name?.value;
      if (name === 'PreviewDeliveryRelease')
        return {
          data: {
            previewDeliveryRelease: {
              ...identity(),
              memberId: mockPreviewFault === 'actor' ? TASK_ID : MEMBER_ID,
              scope: mockPreviewFault === 'scope' ? 'e'.repeat(64) : SCOPE,
              releaseId: input.id,
              requestId: input.requestId,
              inputHash:
                mockPreviewFault === 'hash'
                  ? 'f'.repeat(64)
                  : await hashCanonicalCommandInput(input),
              ownerName: 'Developer',
              body: {
                ...input.body,
                title:
                  mockPreviewFault === 'body'
                    ? 'Another plan'
                    : input.body.title,
                tasks: [],
                sourceFingerprint: 'a'.repeat(64),
              },
              reviewBlockedReason:
                'Include at least one approved task before submitting.',
            },
          },
        };
      if (name === 'DeliveryReleaseReceipt')
        return {
          data: { deliveryReleaseReceipt: { ...identity(), receipt: null } },
        };
      throw new Error(`Unexpected imperative query ${name}`);
    },
  );
});
const openNewPlan = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Plan a release' }));
  await user.type(
    screen.getByLabelText('Release title'),
    'New checkout release',
  );
  await user.type(screen.getByLabelText('Target release date'), '2026-11-04');
  await user.type(
    screen.getByLabelText('Repository link'),
    'https://github.com/example/app',
  );
  return user;
};
it('uses a task-free release library and keeps legacy records reachable', () => {
  setup();
  expect(screen.getByRole('link', { name: 'Checkout release' })).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Earlier release checklists' }),
  ).toBeVisible();
  expect(mockRead.mock.calls.flat()).not.toContain('DeliveryWorkspace');
  expect(mockSave).not.toHaveBeenCalled();
});
it('previews and separately confirms a draft without auto-reviewing or deploying', async () => {
  setup();
  const user = await openNewPlan();
  await user.click(
    screen.getByRole('button', { name: 'Review plan before saving' }),
  );
  expect(await screen.findByText('Review prepared action')).toBeVisible();
  expect(screen.getByText(/Include at least one approved task/)).toBeVisible();
  expect(mockSave).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Save release plan' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', { name: /I checked this exact plan/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Save release plan' }));
  expect(await screen.findByText(/Plan saved/)).toBeVisible();
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockDecide).not.toHaveBeenCalled();
  expect(
    mockSave.mock.calls[0][0].variables.input.body.checks.every(
      (check: ReleaseBody['checks'][number]) => check.status === 'NOT_RUN',
    ),
  ).toBe(true);
});
it('keeps the form visible during task-picker changes while blocking preview until current access returns', async () => {
  setup();
  await openNewPlan();
  mockChoicesLoading = true;
  act(mockRefresh);
  expect(screen.getByLabelText('Release title')).toBeVisible();
  expect(screen.getByLabelText('Release title')).toHaveValue(
    'New checkout release',
  );
  expect(
    screen.getByRole('button', { name: 'Review plan before saving' }),
  ).toBeDisabled();
  mockChoicesLoading = false;
  act(mockRefresh);
  expect(
    screen.getByRole('button', { name: 'Review plan before saving' }),
  ).toBeEnabled();
});
it('hides a retained draft through an outage and preserves it when leaving is declined', async () => {
  setup();
  const user = await openNewPlan();
  mockQueryError = new Error('Offline');
  act(mockRefresh);
  expect(screen.getByLabelText('Release title')).not.toBeVisible();
  mockQueryError = undefined;
  act(mockRefresh);
  expect(screen.getByLabelText('Release title')).toHaveValue(
    'New checkout release',
  );
  await user.click(screen.getByRole('link', { name: 'Other page' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Release title')).toHaveValue(
    'New checkout release',
  );
  expect(mockSave).not.toHaveBeenCalled();
});
it.each(['body', 'actor'])(
  'does not accept a saved response with a different %s',
  async (mismatch) => {
    setup();
    const user = await openNewPlan();
    await user.click(
      screen.getByRole('button', { name: 'Review plan before saving' }),
    );
    await screen.findByText('Review prepared action');
    if (mismatch === 'body') mockReceiptHash = 'f'.repeat(64);
    else mockReceiptActor = TASK_ID;
    await user.click(
      screen.getByRole('checkbox', { name: /I checked this exact plan/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Save release plan' }));
    expect(
      await screen.findByText(/saved result could not be confirmed/),
    ).toBeVisible();
    expect(screen.queryByText(/Plan saved/)).not.toBeInTheDocument();
    expect(mockSave).toHaveBeenCalledTimes(1);
  },
);
it('never dispatches from a refreshed action bookmark and only checks its receipt', async () => {
  setup(
    `/delivery?view=development&releaseProject=${PROJECT_ID}&releaseId=${RELEASE_ID}&releaseRequest=${REQUEST_ID}&releaseMode=APPROVE`,
  );
  const user = userEvent.setup();
  expect(screen.getByText(/Unsaved preparation is not restored/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Approve release' }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Check saved release action' }),
  );
  await screen.findByText(/No saved action was found/);
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockDecide).not.toHaveBeenCalled();
});
it('clears private preparation after role identity changes', async () => {
  setup();
  await openNewPlan();
  mockRoleIds = ['new-role'];
  act(mockRefresh);
  await waitFor(() =>
    expect(screen.queryByLabelText('Release title')).not.toBeInTheDocument(),
  );
  expect(screen.getByText(/Unsaved preparation is not restored/)).toBeVisible();
  expect(mockSave).not.toHaveBeenCalled();
});
it('freezes an uncertain save and permits only an explicit exact retry after confirmed absence', async () => {
  setup();
  const user = await openNewPlan();
  await user.click(
    screen.getByRole('button', { name: 'Review plan before saving' }),
  );
  await screen.findByText('Review prepared action');
  mockSave.mockRejectedValueOnce(new Error('Response lost'));
  await user.click(
    screen.getByRole('checkbox', { name: /I checked this exact plan/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Save release plan' }));
  await screen.findByText(/saved result could not be confirmed/);
  expect(
    screen.queryByRole('button', { name: 'Return to editing' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry exact release action' }),
  ).not.toBeInTheDocument();
  const first = mockSave.mock.calls[0][0].variables.input;
  await user.click(
    screen.getByRole('button', { name: 'Check saved release action' }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Retry exact release action' }),
  );
  await screen.findByText(/Plan saved/);
  expect(mockSave).toHaveBeenCalledTimes(2);
  expect(mockSave.mock.calls[1][0].variables.input).toEqual(first);
});
it('keeps server rejections frozen until the saved action has been checked', async () => {
  setup();
  const user = await openNewPlan();
  await user.click(
    screen.getByRole('button', { name: 'Review plan before saving' }),
  );
  await screen.findByText('Review prepared action');
  mockSave.mockRejectedValueOnce(
    new CombinedGraphQLErrors({
      errors: [
        { message: 'Project changed', extensions: { code: 'CONFLICT' } },
      ],
    }),
  );
  await user.click(
    screen.getByRole('checkbox', { name: /I checked this exact plan/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Save release plan' }));
  await screen.findByText('Project changed');
  expect(
    screen.queryByRole('button', { name: 'Return to editing' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Check saved release action' }),
  ).toBeEnabled();
});
it('retains the entered plan in an explicitly reviewed new request after project changes', async () => {
  const router = setup();
  const user = await openNewPlan();
  const oldRequest = new URLSearchParams(router.state.location.search).get(
    'releaseRequest',
  );
  mockProjectRevision = 2;
  act(mockRefresh);
  expect(
    screen.getByText(/project, release or task evidence changed/),
  ).toBeVisible();
  await user.click(
    screen.getByRole('checkbox', { name: /I reviewed the current source/ }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Prepare new request with my draft' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Release title')).toBeVisible(),
  );
  expect(screen.getByLabelText('Release title')).toHaveValue(
    'New checkout release',
  );
  expect(
    new URLSearchParams(router.state.location.search).get('releaseRequest'),
  ).not.toBe(oldRequest);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mockSave).not.toHaveBeenCalled();
});
it('records failed deployment evidence separately without recording success or handover', async () => {
  mockStatus = 'APPROVED';
  setup(
    `/delivery?view=development&releaseProject=${PROJECT_ID}&releaseId=${RELEASE_ID}`,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Record failed deployment' }),
  );
  await user.type(
    screen.getByLabelText('Decision notes'),
    'Deployment failed; rollback completed',
  );
  await user.type(
    screen.getByLabelText('Outcome evidence link'),
    'https://github.com/example/app/actions/runs/1',
  );
  await user.type(screen.getByLabelText('Deployment environment'), 'Staging');
  await user.click(screen.getByRole('button', { name: 'Review this action' }));
  expect(mockDecide).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('checkbox', { name: /I checked this exact plan/ }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Record failed deployment' }),
  );
  expect(await screen.findByText(/Failed deployment recorded/)).toBeVisible();
  expect(mockDecide).toHaveBeenCalledTimes(1);
  expect(mockDecide.mock.calls[0][0].variables.input).toMatchObject({
    action: 'RECORD_DEPLOYMENT_FAILED',
    commitSha: mockBody.commitSha,
    environment: 'Staging',
  });
});
it('shows the task already included and preserves its exact revision when adding from the picker', async () => {
  setup();
  const user = await openNewPlan();
  await user.click(screen.getByText('Add existing tasks'));
  await user.click(screen.getByRole('button', { name: 'Include task' }));
  expect(screen.getByRole('button', { name: 'Included' })).toBeDisabled();
  expect(screen.getByText(/Task revision 3/)).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: 'Review plan before saving' }),
  );
  await screen.findByText('Review prepared action');
  await user.click(
    screen.getByRole('checkbox', { name: /I checked this exact plan/ }),
  );
  await user.click(screen.getByRole('button', { name: 'Save release plan' }));
  await screen.findByText(/Plan saved/);
  expect(mockSave.mock.calls[0][0].variables.input.body.work).toEqual([
    {
      taskId: TASK_ID,
      revision: 3,
      issueUrl: '',
      pullRequestUrl: '',
      blockedByTaskIds: [],
    },
  ]);
});
it('rejects an invalid action URL without loading a private release', () => {
  setup(
    `/delivery?view=development&releaseProject=${PROJECT_ID}&releaseId=${RELEASE_ID}&releaseMode=APPROVE`,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'This release link is incomplete or invalid',
  );
  expect(mockRead.mock.calls.flat()).not.toContain('DeliveryReleaseDetail');
  expect(mockDecide).not.toHaveBeenCalled();
});

it.each(['hash', 'body', 'actor', 'scope'] as const)(
  'retains the entered plan and explains an unconfirmed preview %s',
  async (mismatch) => {
    setup();
    const user = await openNewPlan();
    mockPreviewFault = mismatch;
    await user.click(
      screen.getByRole('button', { name: 'Review plan before saving' }),
    );
    expect(
      await screen.findByText(/current plan preview could not be confirmed/),
    ).toBeVisible();
    expect(screen.getByLabelText('Release title')).toHaveValue(
      'New checkout release',
    );
    expect(
      screen.queryByRole('heading', { name: 'Review prepared action' }),
    ).not.toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  },
);

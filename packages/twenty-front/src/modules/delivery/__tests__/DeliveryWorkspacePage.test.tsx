import { useState } from 'react';
import { createStore, Provider } from 'jotai';
import type * as React from 'react';
import type * as DeliveryDraftGuard from '@/delivery/drafts/DeliveryDraftGuard';
import { Request, Response } from 'cross-fetch';
import { type DocumentNode } from 'graphql';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { DeliveryWorkspacePage } from '@/delivery/DeliveryWorkspacePage';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
  type DeliveryCommandRunner,
} from '@/delivery/delivery.types';

jest.mock('@/otogrow-access/useOtogrowIdentity', () => ({
  useOtogrowIdentity: () => ({ identity: 'workspace:manager:user' }),
}));

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryBadge: 'span',
  StyledDeliveryBoard: 'div',
  StyledDeliveryButton: 'button',
  StyledDeliveryCanvas: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryDrawer: 'dialog',
  StyledDeliveryGrid: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
  StyledDeliveryTaskButton: 'button',
}));
jest.mock('@/ui/layout/page/components/PageBody', () => ({ PageBody: 'main' }));
jest.mock('@/ui/layout/page/components/PageContainer', () => ({
  PageContainer: 'div',
}));
jest.mock('@/navigation/hooks/useNavigationDrawerExpanded', () => ({
  useNavigationDrawerExpanded: () => true,
}));
jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerCollapseButton',
  () => ({
    NavigationDrawerCollapseButton: () => (
      <button>Collapse navigation panel</button>
    ),
  }),
);
jest.mock('@/delivery/DeliveryTaskDetail', () => ({
  DeliveryTaskDetail: ({ run }: { run: DeliveryCommandRunner }) => (
    <>
      <p>Task detail content</p>
      <button
        onClick={() =>
          void run({
            action: 'review',
            taskId: 'launch',
            revision: 1,
            selectedSubmissionVersion: 1,
            reviewAssignmentRevision: 0,
            decision: 'APPROVED',
            workflowReview: { checkedIds: [] },
          })
        }
      >
        Save review decision
      </button>
    </>
  ),
}));
jest.mock('@/delivery/advertising/workbench/DeliveryAdvertisingPage', () => ({
  DeliveryAdvertisingPage: () => (
    <>
      <h1>Advertising</h1>
      <p>Advertising reports and reviewed recommendations</p>
    </>
  ),
}));
jest.mock('@/delivery/tasks/DeliveryTasksPage', () => ({
  DeliveryTasksPage: () => <p>Primary task workspace</p>,
}));
jest.mock('@/delivery/operations-pages/DeliveryChatPage', () => ({
  DeliveryChatPage: () => <p>Task-free team chat</p>,
}));
jest.mock('@/otogrow-activity/OtogrowActivityPage', () => ({
  OtogrowActivityPage: () => <p>Task-free activity and evidence analysis</p>,
}));
jest.mock('@/delivery/operations-pages/DeliveryCompanyOverviewPage', () => ({
  DeliveryCompanyOverviewPage: () => (
    <>
      <p>Founder exception content</p>
      <details open>
        <summary>Connection readiness</summary>
        <p>Capability readiness content</p>
      </details>
    </>
  ),
}));
jest.mock('@/delivery/creative/atlas/AtlasMediaPage', () => ({
  AtlasMediaPage: () => <p>Task-free media model configuration</p>,
}));
jest.mock(
  '@/delivery/creative/production/DeliveryCreativeProductionPage',
  () => ({
    DeliveryCreativeProductionPage: () => (
      <p>Bounded creative production workspace</p>
    ),
  }),
);
jest.mock('@/delivery/seo-results/DeliverySeoResultsPage', () => ({
  DeliverySeoResultsPage: () => <p>Bounded SEO results workspace</p>,
}));
jest.mock('@/delivery/inbox/workspace/DeliveryInboxPage', () => ({
  DeliveryInboxPage: () => <p>Bounded connected inbox workspace</p>,
}));
jest.mock('@/delivery/onboarding/DeliveryClientSetupPage', () => ({
  DeliveryClientSetupPage: () => <p>Task-free client work setup</p>,
}));
jest.mock('@/delivery/assistants/DeliveryAssistantsPage', () => ({
  DeliveryAssistantsPage: () => (
    <p>Task-free assistant library and run history</p>
  ),
}));
jest.mock('@/delivery/knowledge/DeliveryKnowledge', () => ({
  DeliveryKnowledgePage: () => <p>Task-free brand knowledge and meetings</p>,
  DeliveryKnowledge: () => <p>Brand knowledge</p>,
}));
jest.mock('@/delivery/reviews/DeliveryAssignedReviewsToday', () => ({
  DeliveryAssignedReviewsToday: () => <p>Current assigned review count</p>,
}));
jest.mock('@/delivery/DeliveryCreative', () => {
  const { useState } = jest.requireActual<typeof React>('react');
  const { useDeliveryDraftStatus } = jest.requireActual<
    typeof DeliveryDraftGuard
  >('@/delivery/drafts/DeliveryDraftGuard');
  return {
    DeliveryCreative: () => {
      const [prompt, setPrompt] = useState('');
      const [model, setModel] = useState('seedream');
      useDeliveryDraftStatus({
        dirty: prompt !== '' || model !== 'seedream',
        saving: false,
      });
      return (
        <>
          <p>Creative production content</p>
          <label>
            Prepared media model
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              <option value="seedream">Seedream 5 Pro</option>
              <option value="nano">Nano Banana Pro</option>
            </select>
          </label>
          <label>
            Prepared media prompt
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
        </>
      );
    },
  };
});
jest.mock('@/delivery/DeliveryOperations', () => ({
  DeliveryOperations: () => <p>Delivery message content</p>,
}));
jest.mock('@/delivery/DeliveryAgents', () => ({
  DeliveryAgents: () => <p>Assistant content</p>,
}));
jest.mock('@/delivery/DeliveryClients', () => ({
  DeliveryClients: () => <p>Client content</p>,
}));
jest.mock('@/delivery/DeliveryTeam', () => ({
  DeliveryTeam: () => <p>Project setup content</p>,
}));
jest.mock('@/delivery/DeliveryTaskForm', () => {
  const { useState } = jest.requireActual<typeof React>('react');
  const { useDeliveryDraftStatus } = jest.requireActual<
    typeof DeliveryDraftGuard
  >('@/delivery/drafts/DeliveryDraftGuard');
  return {
    DeliveryTaskForm: () => {
      const [title, setTitle] = useState('');
      useDeliveryDraftStatus({ dirty: title.length > 0, saving: false });
      return (
        <>
          <p>New task form content</p>
          <label>
            Draft task title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
        </>
      );
    },
  };
});
jest.mock('@/delivery/finance/DeliveryFinance', () => {
  const { useState } = jest.requireActual<typeof React>('react');
  return {
    DeliveryFinance: () => {
      const [amount, setAmount] = useState('');
      return (
        <>
          <p>Monthly and cash finance workspace</p>
          <label>
            Draft finance amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
        </>
      );
    },
  };
});
jest.mock('@/delivery/founder/DeliveryFounderExceptions', () => ({
  DeliveryFounderExceptions: () => <p>Founder exception content</p>,
}));
jest.mock('@/delivery/readiness/DeliveryReadiness', () => ({
  DeliveryReadiness: () => <p>Capability readiness content</p>,
}));
jest.mock('@/delivery/DeliveryBusiness', () => ({
  DeliveryBusiness: ({ view }: { view: string }) => (
    <p>Business content: {view}</p>
  ),
}));
let mockMobile = false;
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => mockMobile,
}));
const mockMarkSeen = jest.fn();
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
const mockRefetchQueries = jest.fn();
const mockReadWorkspace = jest.fn();
let mockWorkspace: DeliveryWorkspace | undefined;
let mockWorkspaceError: Error | undefined;
let mockWorkspaceLoading = false;
let mockAccessLoading = false;
let mockAccessError: Error | undefined;
let mockFinanceDenied = false;
let mockManagementDenied = false;
let mockUpdatePage: () => void = () => undefined;
jest.mock('@/otogrow-access/useOtogrowAccess', () => ({
  useOtogrowAccess: () => ({
    access:
      mockAccessLoading || mockAccessError
        ? undefined
        : {
            workspaceId: 'workspace',
            memberId: mockWorkspace?.actor.memberId ?? 'manager',
            userWorkspaceId: 'membership',
            roleIds: [],
            capabilities: mockManagementDenied
              ? ['finance.read', 'finance.manage']
              : mockWorkspace?.actor.isAdmin
                ? ['workspace.admin']
                : mockWorkspace?.actor.isManager
                  ? ['delivery.manage']
                  : [],
          },
    scopeKey:
      mockAccessLoading || mockAccessError
        ? null
        : 'workspace-navigation-tests',
    loading: mockAccessLoading,
    error: mockAccessError,
    refetch: mockRefetch,
    canReadFinance:
      !mockAccessLoading &&
      !mockAccessError &&
      !mockFinanceDenied &&
      mockWorkspace?.actor.isAdmin === true,
  }),
}));

jest.mock('@apollo/client/react', () => ({
  useMutation: (document: DocumentNode) => [
    document.definitions.some(
      (definition) =>
        definition.kind === 'OperationDefinition' &&
        definition.name?.value === 'SeeDeliveryTask',
    )
      ? mockMarkSeen
      : mockMutate,
    { loading: false },
  ],
  useQuery: () => {
    mockReadWorkspace();
    return {
      data: mockWorkspace ? { deliveryWorkspace: mockWorkspace } : undefined,
      error: mockWorkspaceError,
      loading: mockWorkspaceLoading,
      refetch: mockRefetch,
      client: { refetchQueries: mockRefetchQueries, writeQuery: jest.fn() },
    };
  },
}));

const task: DeliveryTask = {
  id: 'launch',
  title: 'Launch video',
  assigneeId: 'editor',
  projectId: 'alpha',
  dueAt: null,
  revision: 1,
  details: {
    brief: 'Product launch',
    service: 'Video',
    priority: 'NORMAL',
    scheduledDate: '2026-10-26',
    reviewerId: 'manager',
    state: 'PLANNED',
    blocker: '',
    checklist: [],
    evidence: [],
    events: [],
    submissions: [],
  },
};
const workspace: DeliveryWorkspace = {
  workspaceId: 'workspace',
  memberId: 'manager',
  userWorkspaceId: 'membership',
  actor: { memberId: 'manager', isAdmin: true, isManager: true },
  tasks: [
    task,
    {
      ...task,
      id: 'seo',
      title: 'SEO report',
      projectId: 'beta',
      assigneeId: 'manager',
      details: { ...task.details, service: 'SEO', state: 'IN_REVIEW' },
    },
  ],
  projects: [
    {
      revision: 1,
      id: 'alpha',
      name: 'Alpha client',
      companyId: null,
      memberIds: ['editor'],
    },
    {
      revision: 1,
      id: 'beta',
      name: 'Beta client',
      companyId: null,
      memberIds: ['manager'],
    },
  ],
  members: [
    { id: 'manager', name: 'Amna', access: 'ADMIN', roleLabel: '' },
    { id: 'editor', name: 'Editor', access: 'MEMBER', roleLabel: '' },
  ],
  companies: [],
};
// oxlint-disable twenty/no-navigate-prefer-link -- These controls simulate browser back/forward history, which destination links cannot do.
const BrowserHistory = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const goBack = () => navigate(-1);
  const goForward = () => navigate(1);
  return (
    <>
      <output aria-label="Current location">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={goBack}>Browser back</button>
      <button onClick={goForward}>Browser forward</button>
    </>
  );
};
// oxlint-enable twenty/no-navigate-prefer-link
const locationParams = () =>
  new URL(
    screen.getByLabelText('Current location').textContent ?? '',
    'http://localhost',
  ).searchParams;
const WorkspacePageHarness = () => {
  const [, setVersion] = useState(0);
  mockUpdatePage = () => setVersion((value) => value + 1);
  return (
    <>
      <BrowserHistory />
      <DeliveryWorkspacePage />
    </>
  );
};
const setup = (entry = '/delivery?view=creative&creativeView=legacy') => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  render(
    <Provider store={createStore()}>
      <I18nProvider i18n={i18n}>
        <RouterProvider
          router={createMemoryRouter(
            [
              {
                path: '*',
                element: <WorkspacePageHarness />,
              },
            ],
            { initialEntries: [entry] },
          )}
        />
      </I18nProvider>
    </Provider>,
  );
  return userEvent.setup();
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
  localStorage.clear();
  mockMobile = false;
  mockWorkspace = workspace;
  mockWorkspaceError = undefined;
  mockWorkspaceLoading = false;
  mockAccessLoading = false;
  mockAccessError = undefined;
  mockFinanceDenied = false;
  mockManagementDenied = false;
  mockMarkSeen.mockReset().mockResolvedValue({});
  mockMutate.mockReset().mockResolvedValue({});
  mockRefetch.mockReset().mockResolvedValue({});
  mockRefetchQueries.mockReset().mockResolvedValue([]);
  mockReadWorkspace.mockReset();
});

describe('delivery workspace navigation', () => {
  it('opens connection readiness from the founder source link', () => {
    setup('/delivery?view=health#company-readiness');
    expect(screen.getByText('Capability readiness content')).toBeVisible();
  });

  it('opens typed founder exceptions with connection readiness for an administrator', () => {
    setup('/delivery?view=health');
    expect(screen.getByText('Founder exception content')).toBeVisible();
    expect(screen.getByText('Connection readiness')).toBeVisible();
    expect(
      screen.queryByText('Business content: health'),
    ).not.toBeInTheDocument();
  });

  it('clears a Finance draft after a forbidden membership check and requires a fresh draft after access returns', async () => {
    const user = setup('/delivery?view=finance');
    await user.type(
      screen.getByRole('textbox', { name: 'Draft finance amount' }),
      '50',
    );
    mockAccessError = new CombinedGraphQLErrors({
      data: null,
      errors: [
        {
          message: 'Active membership required',
          extensions: { code: 'FORBIDDEN' },
        },
      ],
    });
    act(mockUpdatePage);
    expect(
      screen.queryByLabelText('Draft finance amount'),
    ).not.toBeInTheDocument();
    mockAccessError = new Error('Later transport error');
    act(mockUpdatePage);
    expect(
      screen.queryByLabelText('Draft finance amount'),
    ).not.toBeInTheDocument();
    mockAccessError = undefined;
    act(mockUpdatePage);
    expect(
      screen.getByRole('textbox', { name: 'Draft finance amount' }),
    ).toHaveValue('');
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('removes an open task creation form after verified management revocation despite an older workspace actor', async () => {
    const user = setup('/delivery?view=creative&creativeView=legacy');
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Draft task title' }),
      'Prior manager draft',
    );
    mockManagementDenied = true;
    act(mockUpdatePage);
    expect(mockWorkspace?.actor.isManager).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'New task' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Draft task title')).not.toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
    mockManagementDenied = false;
    act(mockUpdatePage);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Draft task title')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New task' }));
    expect(
      screen.getByRole('textbox', { name: 'Draft task title' }),
    ).toHaveValue('');
  });
  it.each([
    {
      label: 'GraphQL FORBIDDEN',
      error: () =>
        new CombinedGraphQLErrors({
          errors: [
            {
              message: 'Workspace access revoked',
              extensions: { code: 'FORBIDDEN' },
            },
          ],
        }),
    },
    {
      label: 'HTTP 401',
      error: () =>
        new ServerError('Unauthorized workspace', {
          response: new Response('', { status: 401 }),
          bodyText: '',
        }),
    },
    {
      label: 'HTTP 403',
      error: () =>
        new ServerError('Forbidden workspace', {
          response: new Response('', { status: 403 }),
          bodyText: '',
        }),
    },
  ])(
    'disposes private drafts and pending navigation on workspace-only $label while the access atom remains ready',
    async ({ error }) => {
      const user = setup(
        '/delivery?view=creative&creativeView=legacy&task=launch&panel=creative&search=keep',
      );
      await user.type(
        screen.getByRole('textbox', { name: 'Prepared media prompt' }),
        'Do not revive denied source draft',
      );
      await user.click(screen.getByRole('button', { name: 'Close' }));
      expect(
        screen.getByRole('button', { name: 'Discard and continue' }),
      ).toBeVisible();
      mockWorkspaceError = error();
      act(mockUpdatePage);
      expect(mockAccessError).toBeUndefined();
      expect(mockAccessLoading).toBe(false);
      expect(
        screen.queryByDisplayValue('Do not revive denied source draft'),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(locationParams().get('task')).toBe('launch');
      expect(locationParams().get('search')).toBe('keep');
      mockWorkspaceError = new Error('Transport still unavailable');
      act(mockUpdatePage);
      expect(
        screen.queryByLabelText('Prepared media prompt'),
      ).not.toBeInTheDocument();
      mockWorkspaceError = undefined;
      mockWorkspaceLoading = true;
      act(mockUpdatePage);
      expect(
        screen.queryByLabelText('Prepared media prompt'),
      ).not.toBeInTheDocument();
      mockWorkspaceLoading = false;
      act(mockUpdatePage);
      expect(
        screen.getByRole('textbox', { name: 'Prepared media prompt' }),
      ).toHaveValue('');
      expect(locationParams().get('task')).toBe('launch');
      expect(mockMutate).not.toHaveBeenCalled();
    },
  );
  it('keeps an open creative modal outside the hidden workspace so recovery and Close remain reachable while its exact draft is retained', async () => {
    const user = setup(
      '/delivery?view=creative&creativeView=legacy&task=launch&panel=creative',
    );
    const dialog = screen.getByRole('dialog', { name: 'Launch video' });
    const prompt = within(dialog).getByRole('textbox', {
      name: 'Prepared media prompt',
    });
    await user.type(prompt, 'Keep exact Seedream product prompt');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Prepared media model' }),
      'nano',
    );
    expect(dialog).toHaveAttribute('open');
    mockAccessError = new Error('API unavailable during media preparation');
    act(mockUpdatePage);
    expect(screen.getByRole('dialog', { name: 'Task details' })).toBe(dialog);
    expect(dialog.closest('[hidden], [inert]')).toBeNull();
    const retry = within(dialog).getByRole('button', {
      name: 'Retry workspace access',
    });
    expect(retry.closest('[hidden], [inert]')).toBeNull();
    expect(retry).toBeVisible();
    expect(retry).toBeEnabled();
    expect(retry).toHaveFocus();
    expect(prompt).toHaveValue('Keep exact Seedream product prompt');
    expect(prompt).not.toBeVisible();
    expect(prompt).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /SEO report/ }),
    ).not.toBeInTheDocument();
    await user.click(retry);
    expect(mockRefetch).toHaveBeenCalledTimes(2);
    expect(prompt).not.toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(dialog).toHaveAttribute('open');
    expect(prompt).not.toBeVisible();
    mockAccessError = undefined;
    act(mockUpdatePage);
    expect(
      within(dialog).getByRole('textbox', { name: 'Prepared media prompt' }),
    ).toBe(prompt);
    expect(prompt).toBeVisible();
    expect(prompt).toHaveValue('Keep exact Seedream product prompt');
    expect(
      within(dialog).getByRole('combobox', { name: 'Prepared media model' }),
    ).toHaveValue('nano');
    expect(mockMutate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('disposes the private creative draft after verified membership denial rather than restoring it after a regrant', async () => {
    const user = setup(
      '/delivery?view=creative&creativeView=legacy&task=launch&panel=creative',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Prepared media prompt' }),
      'Private prior membership prompt',
    );
    mockAccessError = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'Active membership required',
          extensions: { code: 'FORBIDDEN' },
        },
      ],
    });
    act(mockUpdatePage);
    expect(
      screen.queryByDisplayValue('Private prior membership prompt'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    mockAccessError = undefined;
    act(mockUpdatePage);
    expect(
      screen.getByRole('textbox', { name: 'Prepared media prompt' }),
    ).toHaveValue('');
  });
  it('keeps Finance mounted but hidden through an access outage and clears it after verified denial', async () => {
    const user = setup('/delivery?view=finance');
    const amount = screen.getByRole('textbox', {
      name: 'Draft finance amount',
    });
    await user.type(amount, '50');
    mockAccessError = new Error('Access check offline');
    act(mockUpdatePage);
    expect(screen.getByLabelText('Draft finance amount')).toBe(amount);
    expect(amount).toHaveValue('50');
    expect(amount).not.toBeVisible();
    expect(amount).toBeDisabled();
    expect(screen.queryByText('Workspace unavailable')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry workspace access' }),
    ).toBeVisible();
    mockAccessError = undefined;
    act(mockUpdatePage);
    expect(screen.getByRole('textbox', { name: 'Draft finance amount' })).toBe(
      amount,
    );
    expect(amount).toHaveValue('50');
    mockFinanceDenied = true;
    act(mockUpdatePage);
    expect(screen.getByText('Workspace unavailable')).toBeVisible();
    expect(
      screen.queryByLabelText('Draft finance amount'),
    ).not.toBeInTheDocument();
    mockFinanceDenied = false;
    act(mockUpdatePage);
    expect(
      screen.getByRole('textbox', { name: 'Draft finance amount' }),
    ).toHaveValue('');
    expect(mockMutate).not.toHaveBeenCalled();
  });
  it('preserves filters across task panels, close and browser history', async () => {
    const user = setup(
      '/delivery?view=creative&creativeView=legacy&project=alpha&service=Video&status=PLANNED',
    );
    expect(screen.getByLabelText('Project / client')).toHaveValue('alpha');
    expect(
      screen.queryByRole('button', { name: /SEO report/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Launch video/ }));
    expect(screen.getByRole('dialog', { name: 'Launch video' })).toBeVisible();
    expect(locationParams().get('task')).toBe('launch');
    await user.click(
      screen.getByRole('button', { name: 'Creative production' }),
    );
    expect(screen.getByText('Creative production content')).toBeInTheDocument();
    expect(locationParams().get('panel')).toBe('creative');
    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Project / client')).toHaveValue('alpha');
    expect(locationParams().get('service')).toBe('Video');
    await user.click(screen.getByRole('button', { name: 'Browser forward' }));
    expect(screen.getByText('Creative production content')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(locationParams().has('task')).toBe(false);
    expect(locationParams().has('panel')).toBe(false);
    expect(locationParams().get('status')).toBe('PLANNED');
    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(screen.getByText('Creative production content')).toBeInTheDocument();
  });

  it('writes filter changes into a shareable URL and renders a direct task panel link', async () => {
    const user = setup(
      '/delivery?view=creative&creativeView=legacy&task=launch&panel=operations',
    );
    expect(screen.getByText('Delivery message content')).toBeInTheDocument();
    expect(screen.queryByText('Task detail content')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.selectOptions(
      screen.getByLabelText('Project / client'),
      'alpha',
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'PLANNED');
    await user.type(screen.getByLabelText('Search'), 'Launch');
    expect(locationParams().get('project')).toBe('alpha');
    expect(locationParams().get('status')).toBe('PLANNED');
    expect(locationParams().get('search')).toBe('Launch');
    expect(
      screen.getByRole('button', { name: /Launch video/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /SEO report/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    { memberId: 'editor', isAdmin: false, isManager: false, expected: 1 },
    { memberId: 'manager', isAdmin: true, isManager: true, expected: 0 },
  ])(
    'marks an opened assignment seen only for its assignee: $memberId',
    async ({ expected, ...actor }) => {
      mockWorkspace = { ...workspace, actor, memberId: actor.memberId };
      setup('/delivery?view=creative&creativeView=legacy&task=launch');
      await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
      expect(mockMarkSeen).toHaveBeenCalledTimes(expected);
      if (expected)
        expect(mockMarkSeen).toHaveBeenCalledWith({
          variables: {
            input: {
              action: 'seen',
              taskId: 'launch',
              expectedAssignmentKey: 'editor:legacy',
            },
          },
        });
    },
  );

  it('does not mark an assignment seen before workspace access has loaded', () => {
    mockWorkspace = undefined;
    setup('/delivery?view=creative&creativeView=legacy&task=launch');
    expect(screen.getByText('Loading your work…')).toBeInTheDocument();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('falls back to task details for an unknown panel in a saved link', () => {
    setup(
      '/delivery?view=creative&creativeView=legacy&task=launch&panel=retired-panel',
    );
    expect(screen.getByRole('dialog', { name: 'Launch video' })).toBeVisible();
    expect(screen.getByText('Task detail content')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Task and final approval' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('explains an unavailable task link and dismisses it without losing filters', async () => {
    const user = setup(
      '/delivery?view=creative&creativeView=legacy&project=alpha&task=missing&panel=creative',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This task is no longer available or you do not have access to it.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockMarkSeen).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Dismiss task link' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(locationParams().has('task')).toBe(false);
    expect(locationParams().has('panel')).toBe(false);
    expect(locationParams().get('project')).toBe('alpha');
    expect(screen.getByLabelText('Project / client')).toHaveValue('alpha');
  });

  it('opens the finance workspace for an authorized reader', () => {
    setup('/delivery?view=finance&financeView=monthly&financeMonth=2026-10');
    expect(
      screen.getByText('Monthly and cash finance workspace'),
    ).toBeVisible();
    expect(locationParams().get('financeMonth')).toBe('2026-10');
  });

  it('blocks employee finance deep links and provides a way back to Today', async () => {
    mockWorkspace = {
      ...workspace,
      memberId: 'editor',
      actor: { memberId: 'editor', isAdmin: false, isManager: false },
    };
    const user = setup('/delivery?view=finance&task=launch');
    expect(
      screen.getByRole('heading', { name: 'Workspace unavailable' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Monthly and cash finance workspace'),
    ).not.toBeInTheDocument();
    expect(mockMarkSeen).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Go to Today' }));
    expect(screen.getByText('Primary task workspace')).toBeInTheDocument();
    expect(locationParams().get('view')).toBe('home');
  });

  it('shows role-appropriate mobile destinations and navigates using their names', async () => {
    mockMobile = true;
    mockWorkspace = {
      ...workspace,
      memberId: 'editor',
      actor: { memberId: 'editor', isAdmin: false, isManager: false },
    };
    const user = setup('/delivery?view=creative&creativeView=legacy');
    const destinations = screen.getByRole('combobox', {
      name: 'Go to workspace',
    });
    expect(
      within(destinations).getByRole('option', { name: 'My tasks' }),
    ).toBeInTheDocument();
    expect(
      within(destinations).getByRole('option', {
        name: 'Delivery & reminders',
      }),
    ).toBeInTheDocument();
    expect(
      within(destinations).getByRole('option', { name: 'Advertising' }),
    ).toBeInTheDocument();
    for (const name of [
      'Finance',
      'Team planner',
      'Approvals',
      'Team & projects',
      'Company overview',
    ])
      expect(
        within(destinations).queryByRole('option', { name }),
      ).not.toBeInTheDocument();
    await user.selectOptions(destinations, 'ads');
    expect(
      screen.getByRole('heading', { name: 'Advertising' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Advertising reports and reviewed recommendations'),
    ).toBeInTheDocument();
  });

  it('keeps mobile filters collapsed until opened, preserves edits and clears filters without changing the view or layout', async () => {
    mockMobile = true;
    const user = setup(
      '/delivery?view=creative&creativeView=legacy&layout=board&project=alpha&search=unmatched',
    );
    expect(screen.getByLabelText('Search')).not.toBeVisible();
    await user.click(screen.getByText('Filters · 2 active'));
    expect(screen.getByLabelText('Search')).toBeVisible();
    await user.clear(screen.getByLabelText('Search'));
    expect(screen.getByText('Filters · 1 active')).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toBeVisible();
    await user.type(screen.getByLabelText('Search'), 'missing video');
    expect(screen.getByLabelText('Search')).toBeVisible();
    expect(locationParams().get('search')).toBe('missing video');
    await user.click(screen.getByText('Filters · 2 active'));
    expect(screen.getByLabelText('Search')).not.toBeVisible();
    await user.click(screen.getByText('Filters · 2 active'));
    expect(screen.getByLabelText('Search')).toHaveValue('missing video');
    expect(screen.getByLabelText('Project / client')).toHaveValue('alpha');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(locationParams().get('view')).toBe('creative');
    expect(locationParams().get('layout')).toBe('board');
    expect(locationParams().has('search')).toBe(false);
    expect(locationParams().has('project')).toBe(false);
    expect(screen.getByLabelText('Search')).toHaveValue('');
    expect(screen.getByLabelText('Project / client')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: /Launch video/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /SEO report/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();
  });

  it('takes a manager with no projects to setup instead of a disabled New task action', async () => {
    mockWorkspace = { ...workspace, projects: [], tasks: [] };
    const user = setup('/delivery?view=creative&creativeView=legacy');
    expect(
      screen.queryByRole('button', { name: 'New task' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Set up first project' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Team & projects' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Project setup content')).toBeInTheDocument();
    expect(screen.queryByText('New task form content')).not.toBeInTheDocument();
  });

  it('refreshes active delivery queries while leaving unrelated CRM queries alone', async () => {
    const refetchWorkspace = jest.fn().mockResolvedValue({});
    const refetchAdvertising = jest.fn().mockResolvedValue({});
    const refetchAccess = jest.fn().mockResolvedValue({});
    const refetchRoles = jest.fn().mockResolvedValue({});
    const refetchCompanies = jest.fn().mockResolvedValue({});
    mockRefetchQueries.mockImplementation(
      async ({
        onQueryUpdated,
      }: {
        onQueryUpdated: (query: {
          queryName: string;
          refetch: () => Promise<unknown>;
        }) => unknown;
      }) =>
        Promise.all([
          onQueryUpdated({
            queryName: 'DeliveryWorkspace',
            refetch: refetchWorkspace,
          }),
          onQueryUpdated({
            queryName: 'DeliveryMeta',
            refetch: refetchAdvertising,
          }),
          onQueryUpdated({
            queryName: 'OtogrowAccess',
            refetch: refetchAccess,
          }),
          onQueryUpdated({
            queryName: 'OtogrowRoleDirectory',
            refetch: refetchRoles,
          }),
          onQueryUpdated({
            queryName: 'FindManyCompanies',
            refetch: refetchCompanies,
          }),
        ]),
    );
    const user = setup('/delivery?view=ads&adView=legacy');
    await user.click(screen.getByRole('button', { name: 'Refresh page' }));
    await waitFor(() => expect(refetchAdvertising).toHaveBeenCalledTimes(1));
    expect(refetchWorkspace).toHaveBeenCalledTimes(1);
    expect(refetchAccess).toHaveBeenCalledTimes(1);
    expect(refetchRoles).toHaveBeenCalledTimes(1);
    expect(refetchCompanies).not.toHaveBeenCalled();
    expect(mockRefetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({ include: 'active' }),
    );
    expect(screen.getByRole('button', { name: 'Refresh page' })).toBeEnabled();
  });
});

it('hides an older workspace response when membership identity changes and offers recovery', async () => {
  setup('/delivery?view=creative&creativeView=legacy&task=launch');
  expect(screen.getByText('Task detail content')).toBeVisible();
  mockWorkspace = { ...workspace, userWorkspaceId: 'old-membership' };
  act(() => mockUpdatePage());
  expect(screen.getByText('Task detail content')).not.toBeVisible();
});
it('does not display a workspace snapshot missing current identity fields', () => {
  mockWorkspace = {
    ...workspace,
    workspaceId: undefined,
    userWorkspaceId: undefined,
  };
  setup('/delivery?view=creative&creativeView=legacy');
  expect(
    screen.queryByRole('button', { name: /Launch video/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('Your workspace access could not be verified.'),
  ).toBeInTheDocument();
});
it.each([
  '/delivery',
  '/delivery?view=home',
  '/delivery?view=mine',
  '/delivery?view=planner',
  '/delivery?view=reviews',
])(
  'delegates primary task entry without mounting legacy reads: %s',
  (entry) => {
    setup(entry);
    expect(screen.getByText('Primary task workspace')).toBeInTheDocument();
    expect(mockReadWorkspace).not.toHaveBeenCalled();
  },
);
it('opens media model administration without mounting legacy workspace reads', () => {
  setup('/delivery?view=agents&agentView=media&search=keep');
  expect(
    screen.getByText('Task-free media model configuration'),
  ).toBeInTheDocument();
  expect(mockReadWorkspace).not.toHaveBeenCalled();
});
it('opens guided client setup without mounting legacy workspace reads', () => {
  setup('/delivery?view=onboarding&search=keep');
  expect(screen.getByText('Task-free client work setup')).toBeInTheDocument();
  expect(mockReadWorkspace).not.toHaveBeenCalled();
});
it.each([
  '/delivery?view=chat',
  '/delivery?view=chat&chatWith=editor&chatBefore=older',
])('opens team chat without mounting legacy reads: %s', (entry) => {
  mockWorkspace = undefined;
  mockWorkspaceError = new Error('Unrelated task snapshot unavailable');
  setup(entry);
  expect(screen.getByText('Task-free team chat')).toBeInTheDocument();
  expect(mockReadWorkspace).not.toHaveBeenCalled();
  expect(mockMarkSeen).not.toHaveBeenCalled();
});
it.each([
  '/delivery?view=health',
  '/delivery?view=health#company-readiness',
  '/delivery?view=health&readinessStatus=NEEDS_ATTENTION',
  '/delivery?view=health&founderPanel=alerts&founderRule=rule',
])('opens company overview without mounting legacy reads: %s', (entry) => {
  mockWorkspace = undefined;
  mockWorkspaceError = new Error('Unrelated task snapshot unavailable');
  setup(entry);
  expect(screen.getByText('Founder exception content')).toBeInTheDocument();
  expect(mockReadWorkspace).not.toHaveBeenCalled();
  expect(mockMarkSeen).not.toHaveBeenCalled();
});
it.each([
  '/delivery?view=activity',
  '/delivery?view=activity&activityPerson=editor&activityFrom=2026-10-25',
  '/delivery?view=activity&activityAnalysisRun=run&activityEvent=event',
])('opens team activity without mounting legacy reads: %s', (entry) => {
  mockWorkspace = undefined;
  mockWorkspaceError = new Error('Unrelated task snapshot unavailable');
  setup(entry);
  expect(
    screen.getByText('Task-free activity and evidence analysis'),
  ).toBeInTheDocument();
  expect(mockReadWorkspace).not.toHaveBeenCalled();
  expect(mockMarkSeen).not.toHaveBeenCalled();
});
it.each(['chat', 'health', 'activity'])(
  'preserves earlier %s task drawer bookmarks',
  (view) => {
    setup(`/delivery?view=${view}&task=launch`);
    expect(screen.getByText('Task detail content')).toBeInTheDocument();
    expect(mockReadWorkspace).toHaveBeenCalled();
  },
);
it.each([
  '/delivery?view=knowledge',
  '/delivery?view=knowledge&project=project&source=source&knowledgeVersion=2',
])(
  'opens brand knowledge without mounting legacy workspace reads: %s',
  (entry) => {
    setup(entry);
    expect(
      screen.getByText('Task-free brand knowledge and meetings'),
    ).toBeInTheDocument();
    expect(mockReadWorkspace).not.toHaveBeenCalled();
  },
);
it.each([
  '/delivery?view=agents',
  '/delivery?view=agents&agentView=assistants',
  '/delivery?view=agents&assistantView=history',
  '/delivery?view=agents&agentView=unknown',
])(
  'opens assistant work without mounting legacy workspace reads: %s',
  (entry) => {
    setup(entry);
    expect(
      screen.getByText('Task-free assistant library and run history'),
    ).toBeInTheDocument();
    expect(mockReadWorkspace).not.toHaveBeenCalled();
  },
);
it('clears exact creative review context when closing a task while preserving queue filters', async () => {
  const user = setup(
    '/delivery?view=creative&creativeView=legacy&task=launch&panel=creative&search=SEO&creativeSubmission=2&creativeCompare=1&creativeAsset=asset&creativeFeedback=note&creativeFeedbackAfter=older&creativeFeedbackBefore=event&creativeSubmissionsBefore=3&reviewBatch=oldsequence&reviewBatchIndex=1&reviewsSelected=keepselection',
  );
  expect(screen.getByText('Creative production content')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  const params = locationParams();
  expect(params.get('view')).toBe('creative');
  expect(params.get('search')).toBe('SEO');
  expect(params.get('reviewsSelected')).toBe('keepselection');
  for (const name of [
    'task',
    'panel',
    'creativeSubmission',
    'creativeCompare',
    'creativeAsset',
    'creativeFeedback',
    'creativeFeedbackAfter',
    'creativeFeedbackBefore',
    'creativeSubmissionsBefore',
    'reviewBatch',
    'reviewBatchIndex',
  ])
    expect(params.has(name)).toBe(false);
});
it('opens another task without inheriting stale submission, comparison or feedback selections', async () => {
  const user = setup(
    '/delivery?view=creative&creativeView=legacy&search=SEO&creativeSubmission=2&creativeCompare=1&creativeAsset=asset&creativeFeedback=note&creativeFeedbackAfter=older&creativeFeedbackBefore=event&creativeSubmissionsBefore=3&reviewBatch=oldsequence&reviewBatchIndex=1&reviewsSelected=keepselection',
  );
  await user.click(screen.getByRole('button', { name: /SEO report/ }));
  const params = locationParams();
  expect(params.get('task')).toBe('seo');
  expect(params.get('view')).toBe('creative');
  expect(params.get('panel')).toBe('creative');
  expect(params.get('search')).toBe('SEO');
  expect(params.get('reviewsSelected')).toBe('keepselection');
  for (const name of [
    'creativeSubmission',
    'creativeCompare',
    'creativeAsset',
    'creativeFeedback',
    'creativeFeedbackAfter',
    'creativeFeedbackBefore',
    'creativeSubmissionsBefore',
    'reviewBatch',
    'reviewBatchIndex',
  ])
    expect(params.has(name)).toBe(false);
  expect(screen.getByText('Creative production content')).toBeInTheDocument();
});
it('refreshes active approval queues immediately after a confirmed final review command', async () => {
  mockMutate.mockResolvedValue({
    data: { changeDeliveryWorkspace: workspace },
  });
  const user = setup('/delivery?view=creative&creativeView=legacy&task=launch');
  await user.click(
    screen.getByRole('button', { name: 'Save review decision' }),
  );
  await waitFor(() =>
    expect(mockRefetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({ include: 'active' }),
    ),
  );
  expect(mockMutate).toHaveBeenCalledTimes(1);
});
it('keeps an explicit task link when personal start preferences change', async () => {
  const user = setup('/delivery?view=creative&creativeView=legacy&task=launch');
  await user.click(screen.getByText('Personalize workspace'));
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Start page' }),
    'mine',
  );
  expect(locationParams().get('view')).toBe('creative');
  expect(locationParams().get('task')).toBe('launch');
});

it('keeps a new-task draft mounted when mobile navigation is declined', async () => {
  mockMobile = true;
  const user = setup('/delivery?view=creative&creativeView=legacy');
  await user.click(screen.getByRole('button', { name: 'New task' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Draft task title' }),
    'Do not lose this task',
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Go to workspace' }),
    'team',
  );
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox', { name: 'Draft task title' })).toHaveValue(
    'Do not lose this task',
  );
  expect(locationParams().get('view')).toBe('creative');
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Go to workspace' }),
    'team',
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(locationParams().get('view')).toBe('team');
  expect(
    screen.queryByRole('textbox', { name: 'Draft task title' }),
  ).not.toBeInTheDocument();
});

it.each([
  '/delivery?view=ads',
  '/delivery?view=ads&adSource=META&adReport=report&adReview=review',
])('opens advertising work without mounting legacy reads: %s', (entry) => {
  setup(entry);
  expect(
    screen.getByText('Advertising reports and reviewed recommendations'),
  ).toBeInTheDocument();
  expect(mockReadWorkspace).not.toHaveBeenCalled();
});
it.each([
  '/delivery?view=ads&adView=legacy',
  '/delivery?view=ads&metaReport=report',
  '/delivery?view=ads&businessRecord=report',
])(
  'preserves explicit advertising setup and earlier report links: %s',
  (entry) => {
    setup(entry);
    expect(
      screen.queryByText('Advertising reports and reviewed recommendations'),
    ).not.toBeInTheDocument();
    expect(mockReadWorkspace).toHaveBeenCalled();
  },
);

it.each([
  ['/delivery?view=creative', 'Bounded creative production workspace'],
  [
    '/delivery?view=creative&task=task',
    'Bounded creative production workspace',
  ],
  ['/delivery?view=seo', 'Bounded SEO results workspace'],
  ['/delivery?view=inbox', 'Bounded connected inbox workspace'],
  [
    '/delivery?view=inbox&inboxConversation=conversation&inboxReply=reply',
    'Bounded connected inbox workspace',
  ],
  [
    '/delivery?view=seo&seoProject=project&seoReport=report',
    'Bounded SEO results workspace',
  ],
])(
  'opens the canonical bounded destination without legacy reads: %s',
  (entry, label) => {
    mockWorkspace = undefined;
    mockWorkspaceError = new Error('Unrelated task snapshot unavailable');
    setup(entry);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(mockReadWorkspace).not.toHaveBeenCalled();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  },
);
it.each([
  '/delivery?view=inbox&inboxView=legacy',
  '/delivery?view=inbox&businessRecord=conversation',
])(
  'preserves the existing manual-conversation setup and bookmarks: %s',
  (entry) => {
    setup(entry);
    expect(
      screen.queryByText('Bounded connected inbox workspace'),
    ).not.toBeInTheDocument();
    expect(mockReadWorkspace).toHaveBeenCalled();
  },
);

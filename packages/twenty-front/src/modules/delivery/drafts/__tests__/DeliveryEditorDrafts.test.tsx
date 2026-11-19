import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryClients } from '@/delivery/DeliveryClients';
import { DeliveryBusiness } from '@/delivery/DeliveryBusiness';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { type ClientsSnapshot } from '@/delivery/delivery-clients.types';
import { type BusinessSnapshot } from '@/delivery/delivery-business.types';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';

jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: true,
    manager: true,
    scope: 'workspace:member',
    canReadFinance: true,
    canManageFinance: true,
    refetch: mockRefetch,
    matches: (data: BusinessSnapshot | undefined) =>
      data?.workspaceId === 'workspace',
  }),
}));
jest.mock('@/delivery/commitments/DeliveryCommitments', () => ({
  DeliveryCommitments: () => null,
}));
jest.mock('@/delivery/commitments/DeliveryCommitmentDirectory', () => ({
  DeliveryCommitmentDirectory: () => null,
}));

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryBadge: 'span',
}));
let mockClients: ClientsSnapshot;
let mockBusiness: BusinessSnapshot;
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutate, { loading: false }],
  useQuery: (_document: unknown, options?: { skip?: boolean }) => {
    const selectedTask = options?.skip ? undefined : workspace.tasks[0];
    const data = {
      deliveryClientServiceCatalog: {
        workspaceId: 'workspace',
        memberId: 'admin',
        userWorkspaceId: 'membership',
        services: [],
      },
      deliveryClients: mockClients,
      deliveryBusiness: mockBusiness,
      deliveryAgents: {
        actor: {
          workspaceId: 'workspace',
          memberId: 'admin',
          userWorkspaceId: 'user-workspace',
        },
        runnableAgentIds: ['copy-agent'],
        agents: [
          {
            id: 'copy-agent',
            configuration: {
              name: 'Copy reviewer',
              kind: 'COPY',
              enabled: true,
              projectIds: ['project'],
            },
          },
        ],
      },
      deliveryTaskList: {
        workspaceId: 'workspace',
        memberId: 'admin',
        userWorkspaceId: 'membership',
        items: workspace.tasks.map((task) => ({
          id: task.id,
          projectId: task.projectId,
          revision: task.revision,
        })),
      },
      deliveryTaskDetail: selectedTask
        ? {
            workspaceId: 'workspace',
            memberId: 'admin',
            userWorkspaceId: 'membership',
            task: selectedTask,
          }
        : undefined,
    };
    return {
      data,
      refetch: async () => {
        await mockRefetch();
        return { data };
      },
    };
  },
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'admin', isAdmin: true, isManager: true },
  projects: [
    {
      revision: 1,
      id: 'project',
      companyId: 'client',
      name: 'Brand',
      memberIds: ['admin', 'editor'],
    },
  ],
  tasks: [],
  companies: [],
  members: [
    { id: 'admin', name: 'Amna', access: 'ADMIN', roleLabel: '' },
    { id: 'editor', name: 'Editor', access: 'MEMBER', roleLabel: '' },
    {
      id: 'outside',
      name: 'Other project specialist',
      access: 'MEMBER',
      roleLabel: '',
    },
  ],
};
const Harness = ({
  mode,
}: {
  mode: 'clients' | 'business' | 'content' | 'inbox';
}) => {
  const [, setRefresh] = useState(0);
  return (
    <>
      <Link to="/other">Other view</Link>
      <button onClick={() => setRefresh((value) => value + 1)}>
        Refresh test data
      </button>
      {mode === 'clients' ? (
        <DeliveryClients workspace={workspace} onChanged={mockRefetch} />
      ) : (
        <DeliveryBusiness
          workspace={workspace}
          view={mode === 'business' ? 'finance' : mode}
          onChanged={mockRefetch}
          onOpenTask={jest.fn()}
        />
      )}
    </>
  );
};
const setup = (mode: 'clients' | 'business' | 'content' | 'inbox') => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <Harness mode={mode} />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other view opened</p> },
    ],
    { initialEntries: ['/delivery'] },
  );
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return userEvent.setup();
};
const editServicePlan = async () => {
  const user = setup('clients');
  await user.selectOptions(
    screen.getByLabelText('Client service plan'),
    'engagement',
  );
  await user.click(
    screen.getByRole('button', { name: 'Edit client service plan' }),
  );
  await user.clear(screen.getByLabelText('Service plan name'));
  await user.click(screen.getByRole('button', { name: 'Clear selection' }));
  await user.clear(screen.getByLabelText('Client-visible scope'));
  return user;
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
  mockMutate.mockReset().mockImplementation(async () => ({
    data: { changeDeliveryClients: mockClients },
  }));
  mockRefetch.mockReset().mockResolvedValue({});
  mockClients = {
    workspaceId: 'workspace',
    memberId: 'admin',
    userWorkspaceId: 'membership',
    engagements: [
      {
        id: 'engagement',
        projectId: 'project',
        companyId: 'client',
        revision: 3,
        name: 'Brand retainer',
        services: ['Video'],
        billing: 'RETAINER',
        scope: 'Monthly videos',
        allowance: 'Ten videos',
        contact: 'Client manager',
        fields: [],
        submissions: [],
        assets: [],
      },
    ],
    shares: [],
    links: [],
  };
  mockBusiness = {
    workspaceId: 'workspace',
    memberId: 'admin',
    userWorkspaceId: 'membership',
    financeAccess: { read: true, manage: true },
    financeProjects: [],
    conversationAccess: {},
    records: [],
    inbox: [],
    seen: {},
    finance: [],
    connections: [],
  };
});

it('protects native business fields on Cancel and navigation, but allows a reverted edit to leave', async () => {
  const user = setup('business');
  await user.click(screen.getByRole('button', { name: 'New financial entry' }));
  await user.type(screen.getByLabelText('Title'), 'Draft receipt');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Title')).toHaveValue('Draft receipt');
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  await user.clear(screen.getByLabelText('Title'));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
});

it('protects engagement selection and keeps a dirty editor through a refreshed server revision', async () => {
  const user = setup('clients');
  await user.selectOptions(
    screen.getByLabelText('Client service plan'),
    'engagement',
  );
  await user.click(
    screen.getByRole('button', { name: 'Edit client service plan' }),
  );
  await user.type(screen.getByLabelText('Service plan name'), ' revised');
  await user.selectOptions(screen.getByLabelText('Client service plan'), '');
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Client service plan')).toHaveValue(
    'engagement',
  );
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Brand retainer revised',
  );
  mockClients = {
    ...mockClients,
    engagements: [
      { ...mockClients.engagements[0], revision: 4, name: 'Updated agreement' },
    ],
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.getByRole('button', { name: 'Save client service plan' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Brand retainer revised',
  );
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Updated agreement',
  );
  await user.type(screen.getByLabelText('Service plan name'), ' ready');
  await user.click(
    screen.getByRole('button', { name: 'Save client service plan' }),
  );
  expect(mockMutate).toHaveBeenCalledWith(
    expect.objectContaining({
      variables: {
        input: expect.objectContaining({
          engagement: expect.objectContaining({
            revision: 4,
            name: 'Updated agreement ready',
          }),
        }),
      },
    }),
  );
  expect(screen.queryByLabelText('Service plan name')).not.toBeInTheDocument();
});

it('preserves dynamic onboarding questions and typed edits after a failed save', async () => {
  mockMutate.mockRejectedValueOnce(new Error('Save unavailable'));
  const user = setup('clients');
  await user.selectOptions(
    screen.getByLabelText('Client service plan'),
    'engagement',
  );
  await user.click(
    screen.getByRole('button', { name: 'Edit client service plan' }),
  );
  await user.type(screen.getByLabelText('Service plan name'), ' changed');
  await user.click(
    screen.getByRole('button', { name: 'Save client service plan' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Save unavailable');
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Brand retainer changed',
  );
  await user.click(screen.getByText(/Onboarding questions/));
  await user.click(screen.getByRole('button', { name: 'Add question' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Service plan name')).toHaveValue(
    'Brand retainer changed',
  );
});

it('preserves business review notes and follow-up assignments after failed writes and refresh conflicts', async () => {
  mockBusiness.records = [
    {
      id: 'content',
      revision: 3,
      kind: 'CONTENT',
      title: 'Launch post',
      status: 'REVIEW',
      createdBy: 'editor',
      ownerId: 'editor',
      projectId: 'project',
      taskId: null,
      history: [],
      copy: 'Launch copy',
    },
  ];
  const user = setup('content');
  await user.click(screen.getByRole('button', { name: 'Open details' }));
  await user.type(
    screen.getByLabelText('Reason / review notes'),
    'Needs a clearer promise',
  );
  await user.selectOptions(screen.getByLabelText('Task owner'), 'admin');
  await user.selectOptions(screen.getByLabelText('Reviewer'), 'admin');
  await user.type(screen.getByLabelText('Due date'), '2026-10-30');
  mockMutate.mockRejectedValueOnce(new Error('Review failed'));
  await user.click(screen.getByRole('button', { name: 'Record decision' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Review failed');
  expect(screen.getByLabelText('Reason / review notes')).toHaveValue(
    'Needs a clearer promise',
  );
  await user.click(screen.getByRole('button', { name: 'Close details' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Task owner')).toHaveValue('admin');
  mockBusiness.records = [
    { ...mockBusiness.records[0], revision: 4, status: 'PUBLISHED' },
  ];
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.getByRole('button', { name: 'Record decision' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Create follow-up task' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Reason / review notes')).toHaveValue(
    'Needs a clearer promise',
  );
  expect(screen.getByLabelText('Due date')).toHaveValue('2026-10-30');
});

it('keeps assistant sources and agent choices through failure and blocks closing an unsubmitted preparation', async () => {
  mockBusiness.conversationAccess = { conversation: { draft: true } };
  mockBusiness.records = [
    {
      id: 'conversation',
      revision: 3,
      kind: 'CONVERSATION',
      title: 'Brand chat',
      status: 'OPEN',
      createdBy: 'admin',
      ownerId: 'admin',
      projectId: 'project',
      taskId: null,
      history: [],
      private: true,
    },
  ];
  mockBusiness.inbox = [
    {
      id: 'note',
      conversationId: 'conversation',
      kind: 'INBOUND_NOTE',
      text: 'Please change the opening',
      sourceIds: [],
      createdAt: '2026-10-25T00:00:00Z',
      authorId: 'admin',
      sourceUrl: null,
    },
  ];
  const user = setup('inbox');
  await user.click(screen.getByRole('button', { name: 'Open details' }));
  await user.selectOptions(screen.getByLabelText('Copy agent'), 'copy-agent');
  await user.click(screen.getByLabelText('Please change the opening'));
  await user.click(screen.getByRole('button', { name: 'Close details' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  mockMutate.mockRejectedValueOnce(new Error('Draft unavailable'));
  await user.click(
    screen.getByRole('button', { name: 'Generate unsent reply draft' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Draft unavailable');
  expect(screen.getByLabelText('Please change the opening')).toBeChecked();
  expect(screen.getByLabelText('Copy agent')).toHaveValue('copy-agent');
  expect(mockMutate).toHaveBeenCalledWith(
    expect.objectContaining({
      variables: {
        input: expect.objectContaining({
          action: 'aiDraft',
          revision: 3,
          sourceIds: ['note'],
        }),
      },
    }),
  );
});

it('shows only applicable engagement settings and blocks missing basics before submission', async () => {
  const user = await editServicePlan();
  expect(
    screen.queryByRole('combobox', { name: 'Advertising project manager' }),
  ).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Service plan name'), 'SEO service');
  expect(
    screen.getByRole('button', { name: 'Save client service plan' }),
  ).toBeDisabled();
  const setupLink = new URL(
    screen
      .getByRole('link', { name: 'New client service plan' })
      .getAttribute('href') ?? '',
    'https://os.invalid',
  );
  expect(setupLink.searchParams.get('view')).toBe('onboarding');
  expect(setupLink.searchParams.get('setupCompany')).toBe('client');
  expect(setupLink.searchParams.get('setupProject')).toBe('project');
  expect(setupLink.searchParams.get('clientEngagement')).toBe('engagement');
  expect(screen.getByLabelText('Project')).toBeDisabled();
  expect(screen.getByLabelText('Project')).toHaveValue('project');
  await user.type(
    screen.getByLabelText('Client-visible scope'),
    'Improve site visibility',
  );
  expect(
    screen.getByRole('button', { name: 'Save client service plan' }),
  ).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: 'SEO' }));
  expect(
    screen.getByRole('button', { name: 'Save client service plan' }),
  ).toBeEnabled();
  await user.click(
    screen.getByRole('button', { name: 'Save client service plan' }),
  );
  expect(mockMutate).toHaveBeenCalledWith(
    expect.objectContaining({
      variables: {
        input: expect.objectContaining({
          engagement: expect.objectContaining({
            id: 'engagement',
            revision: 3,
            projectId: 'project',
            services: ['SEO'],
            advertising: null,
          }),
        }),
      },
    }),
  );
});

it('retains advertising choices across disclosure toggles and requires different eligible manager and marketer', async () => {
  const user = await editServicePlan();
  await user.type(screen.getByLabelText('Service plan name'), 'Ad management');
  await user.click(
    screen.getByRole('checkbox', { name: 'Performance marketing' }),
  );
  await user.type(
    screen.getByLabelText('Client-visible scope'),
    'Manage campaigns',
  );
  await user.click(
    screen.getByLabelText(
      'Configure the PM, marketer and client budget requests',
    ),
  );
  expect(
    screen.getByRole('button', { name: 'Save client service plan' }),
  ).toBeDisabled();
  await user.selectOptions(
    screen.getByLabelText('Advertising project manager'),
    'admin',
  );
  await user.selectOptions(screen.getByLabelText('Assigned marketer'), 'admin');
  expect(screen.getByRole('status')).toHaveTextContent(
    'must be different people',
  );
  expect(
    screen.getByRole('button', { name: 'Save client service plan' }),
  ).toBeDisabled();
  expect(
    screen.queryByRole('option', { name: 'Other project specialist' }),
  ).not.toBeInTheDocument();
  await user.selectOptions(
    screen.getByLabelText('Assigned marketer'),
    'editor',
  );
  await user.selectOptions(
    screen.getByLabelText('Advertising currency'),
    'AED',
  );
  await user.click(
    screen.getByLabelText(
      'Configure the PM, marketer and client budget requests',
    ),
  );
  expect(
    screen.queryByRole('combobox', { name: 'Advertising currency' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Save client service plan' }),
  ).toBeEnabled();
  await user.click(
    screen.getByLabelText(
      'Configure the PM, marketer and client budget requests',
    ),
  );
  expect(screen.getByLabelText('Assigned marketer')).toHaveValue('editor');
  expect(screen.getByLabelText('Advertising currency')).toHaveValue('AED');
  await user.click(
    screen.getByRole('button', { name: 'Save client service plan' }),
  );
  expect(mockMutate).toHaveBeenCalledWith(
    expect.objectContaining({
      variables: {
        input: expect.objectContaining({
          engagement: expect.objectContaining({
            advertising: {
              managerId: 'admin',
              marketerId: 'editor',
              currency: 'AED',
              channel: 'META',
              period: 'DAILY',
            },
          }),
        }),
      },
    }),
  );
});

it('guards client-share preparation, retains failed choices and requires reviewing a newer task version', async () => {
  workspace.tasks = [
    {
      id: 'approved-task',
      title: 'Approved video',
      projectId: 'project',
      assigneeId: 'editor',
      dueAt: null,
      revision: 3,
      details: {
        brief: '',
        service: 'Video',
        priority: 'NORMAL',
        scheduledDate: null,
        reviewerId: 'admin',
        state: 'APPROVED',
        blocker: '',
        checklist: [],
        evidence: [],
        events: [],
        submissions: [],
      },
    },
  ];
  const user = setup('clients');
  await user.selectOptions(
    screen.getByLabelText('Client service plan'),
    'engagement',
  );
  await user.selectOptions(screen.getByLabelText('Task'), 'approved-task');
  await user.selectOptions(screen.getByLabelText('Client service plan'), '');
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Task')).toHaveValue('approved-task');
  mockMutate.mockRejectedValueOnce(new Error('Share failed'));
  await user.click(
    screen.getByRole('button', { name: 'Share approved submission' }),
  );
  expect(screen.getByLabelText('Task')).toHaveValue('approved-task');
  workspace.tasks = [{ ...workspace.tasks[0], revision: 4 }];
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.getByRole('button', { name: 'Share approved submission' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Reload selected version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  mockRefetch.mockRejectedValueOnce(new Error('Refresh failed'));
  await user.click(
    screen.getByRole('button', { name: 'Share approved submission' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Share approved submission' }),
  );
  expect(mockMutate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      variables: {
        input: expect.objectContaining({ action: 'share', revision: 4 }),
      },
    }),
  );
  expect(screen.getByLabelText('Task')).toHaveValue('');
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByText('Other view opened')).toBeInTheDocument();
  workspace.tasks = [];
});

it('keeps onboarding disclosure changes clean and retains collapsed questions in the saved engagement', async () => {
  mockClients.engagements[0].fields = [
    { id: 'website', label: 'Website link', required: true },
  ];
  const user = setup('clients');
  await user.selectOptions(
    screen.getByLabelText('Client service plan'),
    'engagement',
  );
  await user.click(
    screen.getByRole('button', { name: 'Edit client service plan' }),
  );
  await user.click(screen.getByText(/Onboarding questions/));
  expect(screen.getByLabelText('Question')).toBeVisible();
  await user.click(screen.getByText(/Onboarding questions/));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Edit client service plan' }),
  );
  const questions = screen.getByText(/Onboarding questions/);
  expect(questions).toHaveTextContent('Onboarding questions: 1 · Required: 1');
  await user.click(questions);
  await user.clear(screen.getByLabelText('Question'));
  await user.click(questions);
  expect(questions).toHaveTextContent('Incomplete question');
  expect(
    screen.getByRole('button', { name: 'Save client service plan' }),
  ).toBeDisabled();
  await user.click(questions);
  await user.type(screen.getByLabelText('Question'), 'Brand website');
  await user.click(questions);
  expect(screen.getByLabelText('Question')).not.toBeVisible();
  expect(questions).not.toHaveTextContent('Incomplete question');
  await user.click(
    screen.getByRole('button', { name: 'Save client service plan' }),
  );
  expect(mockMutate).toHaveBeenCalledWith(
    expect.objectContaining({
      variables: {
        input: expect.objectContaining({
          engagement: expect.objectContaining({
            fields: [{ id: 'website', label: 'Brand website', required: true }],
          }),
        }),
      },
    }),
  );
});

it('removes advertising entitlement when Performance marketing is deselected and retains responsibility choices for reconfiguration', async () => {
  const user = await editServicePlan();
  await user.type(
    screen.getByLabelText('Service plan name'),
    'Services changed',
  );
  await user.click(screen.getByRole('checkbox', { name: 'SEO' }));
  expect(
    screen.getByLabelText(
      'Configure the PM, marketer and client budget requests',
    ),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Performance marketing',
    }),
  );
  await user.type(
    screen.getByLabelText('Client-visible scope'),
    'Changed service package',
  );
  await user.click(
    screen.getByLabelText(
      'Configure the PM, marketer and client budget requests',
    ),
  );
  await user.selectOptions(
    screen.getByLabelText('Advertising project manager'),
    'admin',
  );
  await user.selectOptions(
    screen.getByLabelText('Assigned marketer'),
    'editor',
  );
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Performance marketing',
    }),
  );
  expect(
    screen.getByLabelText(
      'Configure the PM, marketer and client budget requests',
    ),
  ).not.toBeChecked();
  expect(
    screen.getByLabelText(
      'Configure the PM, marketer and client budget requests',
    ),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Performance marketing',
    }),
  );
  await user.click(
    screen.getByLabelText(
      'Configure the PM, marketer and client budget requests',
    ),
  );
  expect(screen.getByLabelText('Assigned marketer')).toHaveValue('editor');
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Performance marketing',
    }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Save client service plan' }),
  );
  expect(mockMutate).toHaveBeenCalledWith(
    expect.objectContaining({
      variables: {
        input: expect.objectContaining({
          engagement: expect.objectContaining({
            services: ['SEO'],
            advertising: null,
          }),
        }),
      },
    }),
  );
});

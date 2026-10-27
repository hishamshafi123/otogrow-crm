import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOperationAST, type DocumentNode } from 'graphql';
import { DeliveryAgents } from '@/delivery/DeliveryAgents';
import { agentRoleDirectory } from '@/delivery/__tests__/agentRoleFixture';
import { type DeliveryAgentsSnapshot } from '@/delivery/delivery-agent.types';
import {
  type DeliveryTask,
  type DeliveryWorkspace,
} from '@/delivery/delivery.types';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryGrid: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
  StyledDeliveryBadge: 'span',
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: true,
    scope: 'workspace:admin',
    canManageRoles: mockAdmin,
    manager: true,
    matches: (value: { workspaceId: string; memberId: string } | undefined) =>
      value?.workspaceId === 'workspace' && value.memberId === 'admin',
  }),
}));
let mockAdmin = true;
let mockData: DeliveryAgentsSnapshot;
let mockError: Error | undefined;
const mockMutate = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutate, { loading: false }],
  useQuery: (query: DocumentNode) =>
    getOperationAST(query)?.name?.value === 'OtogrowRoleDirectory'
      ? {
          data: { otogrowRoleDirectory: agentRoleDirectory },
          refetch: mockRefetch,
        }
      : {
          data: { deliveryAgents: mockData },
          error: mockError,
          refetch: mockRefetch,
        },
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'admin', isAdmin: true, isManager: true },
  projects: [
    {
      revision: 1,
      id: 'project',
      name: 'Brand',
      companyId: null,
      memberIds: ['editor'],
    },
  ],
  tasks: [],
  members: [],
  companies: [],
};
const task: DeliveryTask = {
  id: 'task',
  title: 'Check copy',
  projectId: 'project',
  assigneeId: 'admin',
  revision: 1,
  dueAt: null,
  details: {
    brief: '',
    service: 'VIDEO',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: 'reviewer',
    state: 'PLANNED',
    blocker: '',
    checklist: [],
    evidence: [],
    submissions: [],
    events: [],
  },
};
const view = (withTask = false) => (
  <I18nProvider i18n={i18n}>
    <DeliveryAgents
      workspace={workspace}
      task={withTask ? task : undefined}
      onTaskChanged={jest.fn()}
    />
  </I18nProvider>
);
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockError = undefined;
  mockAdmin = true;
  mockMutate.mockReset();
  mockRefetch.mockResolvedValue({});
  mockData = {
    actor: {
      workspaceId: 'workspace',
      memberId: 'admin',
      userWorkspaceId: 'admin',
    },
    agents: [],
    runs: [],
    models: [],
    runnableAgentIds: [],
  };
});
it('hides an unverified snapshot, blocks actions and restores an unsaved assistant draft on recovery', async () => {
  const { rerender } = render(view());
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Create agent' }));
  await user.clear(screen.getByLabelText('Name'));
  await user.type(screen.getByLabelText('Name'), 'Unsaved assistant');
  await user.click(screen.getByLabelText('Production team'));
  mockError = new Error('Disconnected');
  rerender(view());
  expect(screen.getByRole('alert')).toHaveTextContent(
    'access could not be verified',
  );
  expect(screen.getByLabelText('Name')).not.toBeVisible();
  expect(screen.getByLabelText('Name')).toBeDisabled();
  mockError = undefined;
  rerender(view());
  expect(screen.getByLabelText('Name')).toHaveValue('Unsaved assistant');
  expect(screen.getByLabelText('Production team')).toBeChecked();
  expect(mockMutate).not.toHaveBeenCalled();
});
it('does not offer an admin an assistant excluded by server run permissions', () => {
  mockData.agents = [
    {
      id: 'excluded',
      version: 1,
      configuration: {
        name: 'Restricted checker',
        purpose: 'Only for production',
        kind: 'SEO',
        enabled: true,
        instructions: 'Check',
        requiredInputs: [],
        outputFormat: 'findings',
        tools: ['public_page_check'],
        modelId: null,
        projectIds: ['project'],
        roles: ['ADMIN', 'MANAGER', 'MEMBER'],
        roleIds: ['editor-role'],
        dailyRunLimit: 20,
        maxOutputTokens: 512,
        humanConfirmation: true,
      },
    },
  ];
  const { rerender } = render(view(true));
  expect(
    screen.queryByRole('option', { name: 'Restricted checker' }),
  ).not.toBeInTheDocument();
  mockData = { ...mockData, runnableAgentIds: ['excluded'] };
  rerender(view(true));
  expect(
    screen.getByRole('option', { name: 'Restricted checker' }),
  ).toBeInTheDocument();
});
it('rejects data returned for another member', () => {
  mockData.actor.memberId = 'another-member';
  render(view());
  expect(
    screen.queryByRole('button', { name: 'Create agent' }),
  ).not.toBeInTheDocument();
});

it('hides administrator drafts immediately after admin access is removed', async () => {
  const { rerender } = render(view());
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Create agent' }));
  await user.click(screen.getByLabelText('Production team'));
  mockAdmin = false;
  rerender(view());
  expect(screen.getByRole('status')).toHaveTextContent(
    'Administrator access is required',
  );
  expect(screen.getByLabelText('Name')).not.toBeVisible();
  expect(screen.getByLabelText('Name')).toBeDisabled();
  expect(screen.queryByLabelText('Production team')).not.toBeInTheDocument();
  mockAdmin = true;
  rerender(view());
  expect(screen.getByLabelText('Production team')).toBeChecked();
});

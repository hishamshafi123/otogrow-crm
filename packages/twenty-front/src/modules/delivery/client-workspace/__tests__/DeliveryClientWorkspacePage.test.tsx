import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { DeliveryClientWorkspacePage } from '@/delivery/client-workspace/DeliveryClientWorkspacePage';
import {
  clientSetupFixture,
  SETUP_COMPANY,
  SETUP_PROJECT,
} from '@/delivery/onboarding/__tests__/client-setup.fixtures';
import { type ClientSetupContext } from '@/delivery/onboarding/client-setup.types';
import { type ClientHubSnapshot } from '@/delivery/client-workspace/client-hub.types';
import {
  clientWorkspaceDestination,
  clientWorkspaceSelection,
} from '@/delivery/client-workspace/client-workspace-navigation';

let mockData: ClientSetupContext | null;
let mockDenied = false;
let mockManager = true;
let mockError: Error | null = null;
const mockRefetch = jest.fn().mockResolvedValue(undefined);
const mockRead = jest.fn();
const mockCancel = jest.fn();
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: true,
    manager: mockManager,
    scope: 'workspace',
    refetch: mockRefetch,
  }),
}));
jest.mock('@/delivery/onboarding/useClientSetup', () => ({
  useClientSetup: (input: unknown, valid: boolean) => {
    mockRead(input, valid);
    return {
      data: mockData,
      source: 'source',
      authority: 'authority',
      denied: mockDenied,
      permission: { refetch: mockRefetch },
      query: { error: mockError, loading: false, refetch: mockRefetch },
      recheckAccess: mockRefetch,
    };
  },
}));
jest.mock('@/delivery/drafts/DeliveryDraftGuard', () => ({
  useDeliveryDraftGuard: () => ({ cancelPendingNavigation: mockCancel }),
}));
jest.mock('@/delivery/operations-pages/DeliveryOperationalPage', () => ({
  DeliveryOperationalPage: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
jest.mock('@/delivery/commitments/DeliveryCommitmentsPage', () => ({
  DeliveryCommitmentsPage: () => <p>Assigned commitments</p>,
}));
jest.mock('@/delivery/onboarding/ClientSetupLink', () => ({
  ClientSetupLink: ({ children }: { children: React.ReactNode }) => (
    <a href="/delivery?view=onboarding">{children}</a>
  ),
}));
jest.mock('@/delivery/client-workspace/CompanyProfile', () => ({
  CompanyProfile: () => {
    const [value, setValue] = useState('');
    return (
      <input
        aria-label="Profile draft"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    );
  },
}));

let mockHubData: ClientHubSnapshot | null = null;
const mockUpdateRoster = jest.fn().mockResolvedValue(true);
const mockClearUpdateError = jest.fn();

jest.mock('@/delivery/client-workspace/useClientHub', () => ({
  useClientHub: () => ({
    data: mockHubData,
    loading: false,
    error: undefined,
    updating: false,
    updateError: null,
    clearUpdateError: mockClearUpdateError,
    refetch: mockRefetch,
    updateRoster: mockUpdateRoster,
  }),
}));
jest.mock('@/delivery/client-workspace/ClientRosterPickerModal', () => ({
  ClientRosterPickerModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">CRM Client Picker Modal</div> : null,
}));
jest.mock('@/delivery/client-workspace/ClientContacts', () => ({
  ClientContacts: () => <p>Linked contacts</p>,
}));
jest.mock('@/delivery/client-workspace/ClientServicePlans', () => ({
  ClientServicePlans: () => <p>Editable services</p>,
}));
jest.mock('@/delivery/client-workspace/client-workspace.styles', () => ({
  StyledClientLayout: 'div',
  StyledClientDirectory: 'aside',
  StyledClientMain: 'section',
  StyledClientTabs: 'nav',
  StyledClientProject: 'article',
  StyledClientBoundary: 'fieldset',
  StyledClientActions: 'div',
  StyledClientCommandBar: 'div',
  StyledClientCommandMeta: 'div',
  StyledClientSubtleButton: 'button',
  StyledClientTag: 'span',
  StyledClientTagRow: 'div',
  StyledDirectoryBadge: 'span',
  StyledDirectoryFooter: 'div',
  StyledDirectoryOverviewLink: 'div',
  StyledUndoBanner: 'div',
  StyledClientAvatar: 'div',
  StyledClientCard: 'article',
  StyledClientCardFooter: 'div',
  StyledClientCardHeader: 'div',
  StyledClientFilterBar: 'div',
  StyledClientFilterPill: 'button',
  StyledClientFilterPills: 'div',
  StyledClientIdentity: 'div',
  StyledClientKpiCard: 'div',
  StyledClientKpiGrid: 'div',
  StyledClientMetricStrip: 'div',
  StyledClientPortfolioGrid: 'div',
  StyledClientTitleBlock: 'div',
  StyledDueWorkItem: 'div',
  StyledDueWorkList: 'div',
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
  StyledDeliveryStack: 'div',
}));

const setup = (query = `clientCompany=${SETUP_COMPANY}`) => {
  const element = (
    <I18nProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/delivery?view=clients&${query}`]}>
        <DeliveryClientWorkspacePage />
      </MemoryRouter>
    </I18nProvider>
  );
  return { ...render(element), element, user: userEvent.setup() };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  mockData = clientSetupFixture();
  mockHubData = null;
  mockDenied = false;
  mockManager = true;
  mockError = null;
  jest.clearAllMocks();
});

it('shows profile and focused client sections', () => {
  setup();
  expect(
    screen.getByRole('heading', { name: 'Current client company' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('textbox', { name: 'Profile draft' })).toBeVisible();
});
it('retains but hides drafts during transient failure and restores them on recovery', async () => {
  const view = setup();
  await view.user.type(
    screen.getByRole('textbox', { name: 'Profile draft' }),
    'saved locally',
  );
  mockData = null;
  mockError = new Error('offline');
  view.rerender(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <DeliveryClientWorkspacePage />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(
    screen.queryByRole('textbox', { name: 'Profile draft' }),
  ).not.toBeInTheDocument();
  mockData = clientSetupFixture();
  mockError = null;
  view.rerender(
    <I18nProvider i18n={i18n}>
      <MemoryRouter
        initialEntries={[
          `/delivery?view=clients&clientCompany=${SETUP_COMPANY}`,
        ]}
      >
        <DeliveryClientWorkspacePage />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(screen.getByRole('textbox', { name: 'Profile draft' })).toHaveValue(
    'saved locally',
  );
});
it('clears private content after denial', () => {
  const view = setup();
  mockData = null;
  mockDenied = true;
  view.rerender(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <DeliveryClientWorkspacePage />
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(
    screen.queryByRole('textbox', { name: 'Profile draft', hidden: true }),
  ).not.toBeInTheDocument();
});
it('keeps staff on assigned commitments', () => {
  mockManager = false;
  setup();
  expect(screen.getByText('Assigned commitments')).toBeVisible();
  expect(mockRead).not.toHaveBeenCalled();
});
it('shows a single project’s services immediately without redundant selection', () => {
  setup(`clientCompany=${SETUP_COMPANY}&clientSection=services`);
  expect(screen.getByText('Editable services')).toBeVisible();
  expect(screen.getByLabelText('Client project')).toHaveValue(SETUP_PROJECT);
});
it('still requires explicit project selection when a client has multiple projects', () => {
  if (mockData)
    mockData.projects.push({
      ...mockData.projects[0],
      id: 'second-project',
      name: 'Second project',
    });
  setup(`clientCompany=${SETUP_COMPANY}&clientSection=services`);
  expect(screen.queryByText('Editable services')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Client project')).toBeVisible();
});
it('opens services only for a project found in the selected company context', () => {
  setup(
    `clientCompany=${SETUP_COMPANY}&clientProject=${SETUP_PROJECT}&clientSection=services`,
  );
  expect(screen.getByText('Editable services')).toBeVisible();
});
it('preserves client context in project task and knowledge links', () => {
  setup(`clientCompany=${SETUP_COMPANY}&clientSection=projects`);
  expect(
    screen.getByRole('link', { name: 'Project tasks' }).getAttribute('href'),
  ).toContain(`clientCompany=${SETUP_COMPANY}`);
  expect(
    screen
      .getByRole('link', { name: 'Brand knowledge & meetings' })
      .getAttribute('href'),
  ).toContain(`project=${SETUP_PROJECT}`);
});
it('rejects malformed client selections', () => {
  setup('clientCompany=bad');
  expect(screen.getByRole('alert')).toHaveTextContent('invalid');
  expect(mockRead).toHaveBeenCalledWith(expect.anything(), false);
});
it('constructs clean links without previous client details', () => {
  const destination = clientWorkspaceDestination({ companyId: SETUP_COMPANY });
  expect(destination).not.toContain('clientEngagement');
  expect(
    clientWorkspaceSelection(new URLSearchParams('clientProject=bad')).valid,
  ).toBe(false);
});

it('shows only designated clients, their due work, and opens the CRM client picker on Clients overview', async () => {
  mockData = { ...clientSetupFixture(), selectedCompany: null };
  mockHubData = {
    workspaceId: 'workspace',
    memberId: 'member',
    userWorkspaceId: 'membership',
    observedAt: '2026-11-24T12:00:00.000Z',
    rosterConfigured: true,
    includedCompanyIds: [SETUP_COMPANY],
    excludedCompanyIds: [],
    summary: {
      totalClients: 1,
      clientsNeedingAttention: 1,
      totalActiveProjects: 1,
      totalOpenTasks: 2,
      totalOverdueTasks: 1,
      totalDueSoonTasks: 1,
      totalInReviewTasks: 0,
      totalBlockedTasks: 0,
      totalPendingOnboarding: 0,
      canReadFinance: false,
      totalOpenReceivablesByCurrency: [],
    },
    clients: [
      {
        id: SETUP_COMPANY,
        name: 'Acme Client',
        domainName: 'acme.io',
        sourceToken: 'a'.repeat(64),
        isExplicitClient: true,
        hasDeliveryWork: true,
        needsAttention: true,
        projects: [
          {
            id: SETUP_PROJECT,
            name: 'Acme Retainer',
            memberIds: [],
            memberNames: [],
            openTasksCount: 2,
            overdueTasksCount: 1,
          },
        ],
        services: ['SEO', 'Meta Ads'],
        billingModes: ['RETAINER'],
        servicePlans: [],
        tasksSummary: {
          openCount: 2,
          overdueCount: 1,
          dueSoonCount: 1,
          inReviewCount: 0,
          blockedCount: 0,
          changesRequestedCount: 0,
          completedCount: 4,
        },
        dueTasks: [
          {
            id: 'task-1',
            title: 'Deliver November SEO report',
            projectId: SETUP_PROJECT,
            projectName: 'Acme Retainer',
            status: 'IN_PROGRESS',
            priority: 'HIGH',
            service: 'SEO',
            dueAt: '2026-11-20T12:00:00.000Z',
            scheduledDate: null,
            assigneeId: null,
            assigneeName: 'Maya',
            isOverdue: true,
            isDueSoon: false,
          },
        ],
        portal: {
          activeLinksCount: 1,
          pendingSubmissionsCount: 0,
          pendingClientReviewsCount: 0,
        },
        finance: null,
      },
    ],
  };

  const view = setup('');
  expect(
    screen.getByRole('link', { name: 'Deliver November SEO report' }),
  ).toBeVisible();
  expect(screen.getByText('SEO')).toBeVisible();
  expect(screen.getByText('Retainer')).toBeVisible();

  await view.user.click(
    screen.getByRole('button', { name: 'Select clients from CRM' }),
  );
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'CRM Client Picker Modal',
  );

  await view.user.click(screen.getByRole('button', { name: 'Remove' }));
  expect(mockUpdateRoster).toHaveBeenCalledWith({
    action: 'remove',
    companyIds: [SETUP_COMPANY],
  });
  expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
});

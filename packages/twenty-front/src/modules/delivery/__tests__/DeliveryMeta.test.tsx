import { useState } from 'react';
import { Request } from 'cross-fetch';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeliveryMeta } from '@/delivery/DeliveryMeta';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
jest.mock('@/delivery/advertising/metaReportStyles', () => ({
  StyledReportFilters: 'div',
  StyledReportActions: 'div',
  StyledReportStack: 'div',
  StyledReportBoundary: 'fieldset',
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
  StyledDeliveryGrid: 'div',
}));
let mockAccessReady = true;
let mockIdentity = 'same';
let mockQueryError: Error | undefined;
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockAccessReady,
    scope: mockIdentity,
    matches: (data: unknown) => Boolean(data) && mockAccessReady,
  }),
}));
const mockMutate = jest
  .fn()
  .mockImplementation(async () => ({ data: { changeDeliveryMeta: mockData } }));
const mockRefetch = jest.fn().mockResolvedValue({});
const mockQueryVariables = jest.fn();
const mockConnection = {
  scheduleTimezone: undefined as 'Asia/Qatar' | null | undefined,
  accountId: '1657332765534462',
  revision: 1,
  name: 'Otogrow',
  currency: 'USD',
  timezone: 'Asia/Qatar',
  projectId: null as string | null,
  managerId: null as string | null,
  marketerId: null as string | null,
  time: '06:00',
  enabled: false,
  running: false,
  lastSuccessAt: null,
  error: null,
  retryAt: null as string | null,
  catchUpDays: 14,
  refreshDays: 7,
  dailyImportLimit: 10,
  coverage: {
    fromDate: '2026-10-11',
    throughDate: '2026-10-24',
    missingDates: ['2026-10-20'],
    refreshDueDates: ['2026-10-23'],
    nextDate: '2026-10-20',
    attemptDate: '2026-10-25',
    attemptsToday: 2,
    remainingToday: 8,
  },
};
const mockReport = {
  engagementId: undefined as string | undefined,
  routing: undefined as
    | { projectId: string; managerId: string; marketerId: string }
    | undefined,
  id: 'a43f6f23-54ed-4230-b5ae-c050d2c65000',
  adCount: 0,
  archivedAt: null as string | null,
  accountId: mockConnection.accountId,
  date: '2026-10-24',
  currency: 'USD',
  timezone: 'Asia/Qatar',
  fetchedAt: '2026-10-25T03:00:00.000Z',
  account: null,
  ads: [],
  status: 'REVIEW',
  projectId: null as string | null,
  managerId: null as string | null,
  marketerId: null as string | null,
  note: '',
  taskId: null,
  lastCheckedAt: null as string | null,
  hasNewerVersion: false,
};
let mockData: {
  clientServices?: {
    id: string;
    name: string;
    projectId: string;
    managerId: string | null;
    marketerId: string | null;
    ready: boolean;
  }[];
  connections: (typeof mockConnection)[];
  reports: (typeof mockReport)[];
  workerSeenAt: null;
  nextCursor?: string | null;
  total?: number;
  selected?: typeof mockReport | null;
};
jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutate, { loading: false }],
  useQuery: (
    _document: unknown,
    options: { variables: { input: { selectedId?: string } } },
  ) => {
    mockQueryVariables(options.variables);
    Object.assign(mockData, {
      filter: options.variables.input,
      selected:
        mockData.reports.find(
          (report) => report.id === options.variables.input.selectedId,
        ) ??
        mockData.selected ??
        null,
    });
    return {
      data: { deliveryMeta: mockData },
      refetch: mockRefetch,
      error: mockQueryError,
    };
  },
}));
const setup = (isAdmin = true, entry = '/delivery?view=ads') => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  const workspace: DeliveryWorkspace = {
    actor: { memberId: 'member', isAdmin, isManager: isAdmin },
    projects: [],
    members: [],
    tasks: [],
    companies: [],
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryMeta
            workspace={workspace}
            onChanged={mockRefetch}
            onOpenTask={jest.fn()}
          />
        ),
      },
    ],
    { initialEntries: [entry] },
  );
  const rendered = render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return { router, unmount: rendered.unmount };
};
beforeEach(() => {
  mockQueryVariables.mockClear();
  mockAccessReady = true;
  mockIdentity = 'same';
  mockQueryError = undefined;
  mockMutate.mockReset().mockImplementation(async () => ({
    data: { changeDeliveryMeta: mockData },
  }));
  mockData = { connections: [], reports: [], workerSeenAt: null };
});
it('keeps connection administration unavailable to team members', () => {
  setup(false);
  expect(
    screen.queryByRole('button', { name: 'Connect Meta account' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Reporting access token'),
  ).not.toBeInTheDocument();
});
it('defaults to 6 AM with scheduling off and clears the secret form after saving', async () => {
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Connect Meta account' }),
  );
  expect(screen.getByLabelText('Daily reporting time')).toHaveValue('06:00');
  expect(screen.getByLabelText('Enable daily reporting')).not.toBeChecked();
  const token = screen.getByLabelText('Reporting access token');
  expect(token).toHaveAttribute('type', 'password');
  await userEvent.type(
    screen.getByLabelText('Meta ad-account ID'),
    '1657332765534462',
  );
  await userEvent.type(token, 'synthetic-token-for-test');
  await userEvent.click(
    screen.getByRole('button', { name: 'Test and save connection' }),
  );
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  expect(
    mockMutate.mock.calls[0][0].variables.input.configuration,
  ).toMatchObject({
    accountId: '1657332765534462',
    time: '06:00',
    engagementId: null,
    scheduleTimezone: 'Asia/Qatar',
    enabled: false,
    projectId: null,
    managerId: null,
    marketerId: null,
    catchUpDays: 14,
    refreshDays: 7,
    dailyImportLimit: 10,
  });
  await waitFor(() =>
    expect(
      screen.queryByLabelText('Reporting access token'),
    ).not.toBeInTheDocument(),
  );
});
it('shows missing dates and imports only a selected past account-local day', async () => {
  mockData.connections = [mockConnection];
  setup();
  await userEvent.click(
    screen.getByText('Import status and connection settings'),
  );
  expect(
    screen.getByText('Missing days: 1 · Due for refresh: 1'),
  ).toBeVisible();
  await userEvent.click(screen.getByText('Missing dates and recovery'));
  expect(screen.getByText('Missing reports: 2026-10-20')).toBeVisible();
  const date = screen.getByLabelText('Past date to import');
  const submit = screen.getByRole('button', { name: 'Import selected day' });
  expect(submit).toBeDisabled();
  await userEvent.type(date, '2026-10-25');
  expect(submit).toBeDisabled();
  await userEvent.clear(date);
  await userEvent.type(date, '2026-10-20');
  expect(submit).toBeEnabled();
  await userEvent.click(submit);
  await waitFor(() =>
    expect(mockMutate).toHaveBeenCalledWith({
      variables: {
        input: {
          action: 'sync',
          accountId: mockConnection.accountId,
          date: '2026-10-20',
        },
      },
    }),
  );
});
it('disables manual imports when the shared daily limit is exhausted', async () => {
  mockData.connections = [
    {
      ...mockConnection,
      coverage: {
        ...mockConnection.coverage,
        attemptsToday: 10,
        remainingToday: 0,
      },
    },
  ];
  setup();
  await userEvent.click(
    screen.getByText('Import status and connection settings'),
  );
  expect(
    screen.getByRole('button', { name: 'Import yesterday' }),
  ).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Today’s import limit is reached',
  );
  await userEvent.click(screen.getByText('Missing dates and recovery'));
  await userEvent.type(
    screen.getByLabelText('Past date to import'),
    '2026-10-20',
  );
  expect(
    screen.getByRole('button', { name: 'Import selected day' }),
  ).toBeDisabled();
  expect(mockMutate).not.toHaveBeenCalled();
});
it('requires the refresh window to fit within the recovery window', async () => {
  mockData.connections = [mockConnection];
  setup();
  await userEvent.click(
    screen.getByText('Import status and connection settings'),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit connection' }),
  );
  await userEvent.click(screen.getByText('Missed days and conversion refresh'));
  const recovery = screen.getByLabelText('Days to recover automatically');
  const refresh = screen.getByLabelText(
    'Recent days to refresh for conversions',
  );
  await userEvent.clear(recovery);
  await userEvent.type(recovery, '3');
  expect(
    screen.getByRole('button', { name: 'Test and save connection' }),
  ).toBeDisabled();
  await userEvent.clear(refresh);
  await userEvent.type(refresh, '2');
  await userEvent.click(
    screen.getByRole('button', { name: 'Test and save connection' }),
  );
  await waitFor(() => expect(mockMutate).toHaveBeenCalled());
  expect(
    mockMutate.mock.calls[0][0].variables.input.configuration,
  ).toMatchObject({
    catchUpDays: 3,
    refreshDays: 2,
    dailyImportLimit: 10,
    enabled: false,
  });
});
it('keeps approved report figures while explaining a newer version and its own freshness', () => {
  mockData.reports = [
    {
      ...mockReport,
      status: 'APPROVED',
      lastCheckedAt: '2026-10-25T03:05:00.000Z',
      hasNewerVersion: true,
    },
  ];
  setup(false);
  expect(
    screen.getByText('Approved', { exact: true, selector: 'span' }),
  ).toBeVisible();
  expect(screen.getByText(/This version last matched Meta:/)).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(
    'earlier decisions are preserved',
  );
  expect(
    screen.queryByText('Missing dates and recovery'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save report decision' }),
  ).not.toBeInTheDocument();
});
it('blocks an unmapped report decision and retains its recommendation while opening setup', async () => {
  mockData.connections = [mockConnection];
  mockData.reports = [mockReport];
  setup();
  const recommendation = screen.getByLabelText(
    'Recommendations for the marketer',
  );
  await userEvent.type(
    recommendation,
    'Check the landing page before increasing spend.',
  );
  const save = screen.getByRole('button', { name: 'Save report decision' });
  expect(save).toBeDisabled();
  expect(save).toHaveAccessibleDescription(
    /needs a project, a project manager/,
  );
  await userEvent.click(save);
  expect(mockMutate).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Set up report assignments' }),
  );
  expect(screen.getByLabelText('Meta ad-account ID')).toHaveValue(
    mockConnection.accountId,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Reporting project')).toHaveFocus(),
  );
  expect(recommendation).toHaveValue(
    'Check the landing page before increasing spend.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(recommendation).toHaveValue(
    'Check the landing page before increasing spend.',
  );
  expect(mockMutate).not.toHaveBeenCalled();
});
it.each([
  { managerId: null, marketerId: 'marketer' },
  { managerId: 'manager', marketerId: null },
  { managerId: 'manager', marketerId: 'manager' },
])('requires separate manager and marketer assignments: %o', (assignments) => {
  mockData.reports = [{ ...mockReport, projectId: 'project', ...assignments }];
  setup();
  expect(
    screen.getByRole('button', { name: 'Save report decision' }),
  ).toBeDisabled();
});
it('submits a mapped report and preserves the recommendation if saving fails', async () => {
  mockData.reports = [
    {
      ...mockReport,
      projectId: 'project',
      managerId: 'member',
      marketerId: 'marketer',
    },
  ];
  mockMutate.mockRejectedValueOnce(new Error('Connection assignments changed'));
  setup();
  const recommendation = screen.getByLabelText(
    'Recommendations for the marketer',
  );
  await userEvent.type(recommendation, 'Review the low-performing creative.');
  await userEvent.click(
    screen.getByRole('button', { name: 'Save report decision' }),
  );
  await waitFor(() =>
    expect(mockMutate).toHaveBeenCalledWith({
      variables: {
        input: {
          action: 'review',
          id: 'a43f6f23-54ed-4230-b5ae-c050d2c65000',
          status: 'APPROVED',
          note: 'Review the low-performing creative.',
        },
      },
    }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not complete the reporting action',
  );
  expect(recommendation).toHaveValue('Review the low-performing creative.');
});

const GuardedMeta = () => {
  const [, refresh] = useState(0);
  const workspace: DeliveryWorkspace = {
    actor: { memberId: 'member', isAdmin: true, isManager: true },
    projects: [],
    members: [],
    tasks: [],
    companies: [],
  };
  return (
    <>
      <Link to="/other">Other view</Link>
      <button onClick={() => refresh((value) => value + 1)}>
        Refresh test data
      </button>
      <DeliveryMeta
        workspace={workspace}
        onChanged={mockRefetch}
        onOpenTask={jest.fn()}
      />
    </>
  );
};
let guardedRouter: ReturnType<typeof createMemoryRouter>;
const setupGuardedMeta = (entry = '/delivery?view=ads') => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <DeliveryDraftGuardProvider>
            <GuardedMeta />
          </DeliveryDraftGuardProvider>
        ),
      },
      { path: '/other', element: <p>Other view opened</p> },
    ],
    { initialEntries: [entry] },
  );
  guardedRouter = router;
  render(
    <I18nProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return userEvent.setup();
};

it('explains provider backoff without trapping navigation as an unsaved operation', async () => {
  mockData.connections = [
    {
      ...mockConnection,
      retryAt: new Date(Date.now() + 3600000).toISOString(),
    },
  ];
  const user = setupGuardedMeta();
  await user.click(screen.getByText('Import status and connection settings'));
  expect(
    screen.getByRole('button', { name: 'Import yesterday' }),
  ).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(
    'after a failed attempt',
  );
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByText('Other view opened')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('protects failed connection inputs and clears them after a successful save with a failed refresh', async () => {
  const user = setupGuardedMeta();
  await user.click(
    screen.getByRole('button', { name: 'Connect Meta account' }),
  );
  await user.type(screen.getByLabelText('Meta ad-account ID'), '12345678');
  await user.type(
    screen.getByLabelText('Reporting access token'),
    'synthetic-draft-token',
  );
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  mockMutate.mockRejectedValueOnce(new Error('Failed connection'));
  await user.click(
    screen.getByRole('button', { name: 'Test and save connection' }),
  );
  expect(screen.getByLabelText('Reporting access token')).toHaveValue(
    'synthetic-draft-token',
  );
  mockRefetch.mockRejectedValueOnce(new Error('Refresh failed'));
  await user.click(
    screen.getByRole('button', { name: 'Test and save connection' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'reporting action was saved',
  );
  expect(
    screen.queryByLabelText('Reporting access token'),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Other view' }));
  expect(screen.getByText('Other view opened')).toBeInTheDocument();
});

it('retains edited connection settings on a newer revision until reload is confirmed', async () => {
  mockData.connections = [mockConnection];
  const user = setupGuardedMeta();
  await user.click(screen.getByText('Import status and connection settings'));
  await user.click(screen.getByRole('button', { name: 'Edit connection' }));
  await user.click(screen.getByLabelText('Enable daily reporting'));
  mockData.connections = [{ ...mockConnection, revision: 2, time: '07:00' }];
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.getByRole('button', { name: 'Test and save connection' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Enable daily reporting')).toBeChecked();
  await user.click(
    screen.getByRole('button', { name: 'Reload latest version' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Daily reporting time')).toHaveValue('07:00');
  expect(screen.getByLabelText('Enable daily reporting')).not.toBeChecked();
});

it('archives and restores reviewed reports without changing their figures or recommendation', async () => {
  mockData.reports = [
    { ...mockReport, status: 'APPROVED', note: 'Keep the original decision' },
  ];
  const user = setupGuardedMeta();
  await user.click(screen.getByRole('button', { name: 'Archive report' }));
  expect(mockMutate).toHaveBeenCalledWith({
    variables: {
      input: {
        action: 'archive',
        id: 'a43f6f23-54ed-4230-b5ae-c050d2c65000',
        archived: true,
      },
    },
  });
  expect(screen.getByText('Keep the original decision')).toBeVisible();
  mockData = {
    ...mockData,
    reports: [{ ...mockData.reports[0], archivedAt: '2026-10-25T03:00:00Z' }],
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  await user.click(
    screen.getByRole('button', { name: 'Restore to active reports' }),
  );
  expect(mockMutate).toHaveBeenLastCalledWith({
    variables: {
      input: {
        action: 'archive',
        id: 'a43f6f23-54ed-4230-b5ae-c050d2c65000',
        archived: false,
      },
    },
  });
});
it('keeps pending review active and sends bounded history filters and page cursors', async () => {
  mockData.reports = [mockReport];
  mockData.nextCursor = 'next-page';
  mockData.total = 505;
  setup();
  expect(
    screen.queryByRole('button', { name: 'Archive report' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('505 matching reports')).toBeVisible();
  await userEvent.selectOptions(
    screen.getByLabelText('Report history'),
    'ARCHIVED',
  );
  await userEvent.selectOptions(screen.getByLabelText('Decision'), 'APPROVED');
  await userEvent.type(screen.getByLabelText('Ad account ID'), '12345678');
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(mockQueryVariables).toHaveBeenLastCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        archive: 'ARCHIVED',
        status: 'APPROVED',
        accountId: '12345678',
      }),
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Older reports' }));
  expect(mockQueryVariables).toHaveBeenLastCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ after: 'next-page' }),
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Newer reports' }));
  expect(mockQueryVariables).toHaveBeenLastCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ after: undefined }),
    }),
  );
});
it('protects a recommendation when history filters change and discards only explicitly', async () => {
  mockData.reports = [mockReport];
  const user = setupGuardedMeta();
  await user.type(
    screen.getByLabelText('Recommendations for the marketer'),
    'Draft to preserve',
  );
  await user.selectOptions(screen.getByLabelText('Report history'), 'ALL');
  await user.click(screen.getByRole('button', { name: 'Apply filters' }));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Recommendations for the marketer')).toHaveValue(
    'Draft to preserve',
  );
  await user.click(screen.getByRole('button', { name: 'Apply filters' }));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Recommendations for the marketer')).toHaveValue(
    '',
  );
});
it('hides stale reporting on a read failure and restores the unsent draft after recovery', async () => {
  mockData.reports = [mockReport];
  const user = setupGuardedMeta();
  await user.type(
    screen.getByLabelText('Recommendations for the marketer'),
    'Preserved through outage',
  );
  mockQueryError = new Error('Unavailable');
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(
    screen.queryByRole('button', { name: 'Save report decision' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Connect Meta account' }),
  ).toBeDisabled();
  mockQueryError = undefined;
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.getByLabelText('Recommendations for the marketer')).toHaveValue(
    'Preserved through outage',
  );
});
it('clears an old identity draft when the active workspace changes', async () => {
  mockData.reports = [mockReport];
  const user = setupGuardedMeta();
  await user.type(
    screen.getByLabelText('Recommendations for the marketer'),
    'Old workspace draft',
  );
  mockIdentity = 'different';
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.getByLabelText('Recommendations for the marketer')).toHaveValue(
    '',
  );
});

it('keeps a selected recommendation when newer imports move it off the current page', async () => {
  mockData.reports = [mockReport];
  const user = setupGuardedMeta();
  await user.type(
    screen.getByLabelText('Recommendations for the marketer'),
    'Keep this report selected',
  );
  mockData = {
    ...mockData,
    selected: mockReport,
    reports: [
      {
        ...mockReport,
        id: 'a43f6f23-54ed-4230-b5ae-c050d2c65001',
        date: '2026-10-25',
      },
    ],
  };
  await user.click(screen.getByRole('button', { name: 'Refresh test data' }));
  expect(screen.getByLabelText('Select report')).toHaveValue(
    'a43f6f23-54ed-4230-b5ae-c050d2c65000',
  );
  expect(screen.getByLabelText('Recommendations for the marketer')).toHaveValue(
    'Keep this report selected',
  );
});

it('keeps import controls collapsed while the account status stays visible', async () => {
  mockData.connections = [mockConnection];
  setup();
  expect(screen.getByText(/Automatic reports off/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Edit connection' }),
  ).not.toBeVisible();
  await userEvent.click(
    screen.getByText('Import status and connection settings'),
  );
  expect(screen.getByRole('button', { name: 'Edit connection' })).toBeVisible();
});

it('restores filters and an explicitly selected report from a copied URL', async () => {
  const otherReport = {
    ...mockReport,
    id: 'a43f6f23-54ed-4230-b5ae-c050d2c65001',
  };
  mockData.reports = [mockReport, otherReport];
  const { router, unmount } = setup(true, '/delivery?view=ads&task=existing');
  await userEvent.selectOptions(screen.getByLabelText('Report history'), 'ALL');
  await userEvent.type(screen.getByLabelText('From date'), '2026-10-01');
  await userEvent.type(screen.getByLabelText('Through date'), '2026-10-27');
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await userEvent.selectOptions(
    screen.getByLabelText('Select report'),
    otherReport.id,
  );
  const entry = router.state.location.pathname + router.state.location.search;
  expect(new URLSearchParams(router.state.location.search).get('task')).toBe(
    'existing',
  );
  unmount();
  setup(true, entry);
  expect(screen.getByLabelText('Report history')).toHaveValue('ALL');
  expect(screen.getByLabelText('From date')).toHaveValue('2026-10-01');
  expect(screen.getByLabelText('Through date')).toHaveValue('2026-10-27');
  expect(screen.getByLabelText('Select report')).toHaveValue(otherReport.id);
});

it('restores report history filters and paging with browser back and forward', async () => {
  mockData.nextCursor = 'next-page';
  const { router } = setup();
  await userEvent.selectOptions(
    screen.getByLabelText('Report history'),
    'ARCHIVED',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await userEvent.click(screen.getByRole('button', { name: 'Older reports' }));
  await userEvent.click(screen.getByRole('button', { name: 'Newer reports' }));
  await act(() => router.navigate(-1));
  expect(mockQueryVariables).toHaveBeenLastCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        archive: 'ARCHIVED',
        after: 'next-page',
      }),
    }),
  );
  expect(screen.getByRole('button', { name: 'Newer reports' })).toBeVisible();
  await act(() => router.navigate(-1));
  expect(screen.getByLabelText('Report history')).toHaveValue('ARCHIVED');
  await act(() => router.navigate(-1));
  expect(screen.getByLabelText('Report history')).toHaveValue('ACTIVE');
  await act(() => router.navigate(1));
  expect(screen.getByLabelText('Report history')).toHaveValue('ARCHIVED');
});

it('offers a way back to latest results for an expired cursor opened directly', async () => {
  mockQueryError = new Error('Cursor unavailable');
  const { router } = setup(
    true,
    '/delivery?view=ads&metaArchive=ALL&metaAfter=expired',
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'This results page could not be loaded',
  );
  mockQueryError = undefined;
  await userEvent.click(screen.getByRole('button', { name: 'Latest reports' }));
  expect(
    new URLSearchParams(router.state.location.search).has('metaAfter'),
  ).toBe(false);
  expect(screen.getByLabelText('Report history')).toHaveValue('ALL');
});

it('offers reset without querying for a malformed reporting link', async () => {
  const { router } = setup(
    true,
    '/delivery?view=ads&metaFrom=invalid&task=existing',
  );
  expect(screen.getByRole('alert')).toHaveTextContent('invalid filters');
  expect(mockQueryVariables).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reset reporting link' }),
  );
  expect(router.state.location.search).toBe('?view=ads&task=existing');
  expect(screen.getByLabelText('Report history')).toHaveValue('ACTIVE');
});

it('does not silently replace an inaccessible explicitly selected report', () => {
  mockData.reports = [mockReport];
  setup(
    true,
    '/delivery?view=ads&metaReport=a43f6f23-54ed-4230-b5ae-c050d2c65002',
  );
  expect(screen.getByRole('status')).toHaveTextContent('no longer available');
  expect(screen.getByLabelText('Select report')).toHaveValue('');
  expect(
    screen.queryByLabelText('Recommendations for the marketer'),
  ).not.toBeInTheDocument();
});

it('protects a recommendation from browser back until discard is explicit', async () => {
  mockData.reports = [mockReport];
  const user = setupGuardedMeta();
  await user.selectOptions(screen.getByLabelText('Report history'), 'ALL');
  await user.click(screen.getByRole('button', { name: 'Apply filters' }));
  await user.type(
    screen.getByLabelText('Recommendations for the marketer'),
    'Keep these edits',
  );
  await act(() => guardedRouter.navigate(-1));
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Recommendations for the marketer')).toHaveValue(
    'Keep these edits',
  );
  expect(screen.getByLabelText('Report history')).toHaveValue('ALL');
  await act(() => guardedRouter.navigate(-1));
  await user.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByLabelText('Report history')).toHaveValue('ACTIVE');
  expect(screen.getByLabelText('Recommendations for the marketer')).toHaveValue(
    '',
  );
});

it('inherits client responsibilities instead of requiring a second staff mapping', async () => {
  mockData.clientServices = [
    {
      id: 'client-service',
      name: 'Brand performance',
      projectId: 'project',
      managerId: 'manager',
      marketerId: 'marketer',
      ready: true,
    },
  ];
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Connect Meta account' }),
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Report routing' }),
    'client-service',
  );
  expect(
    screen.getByRole('region', { name: 'Client report recipients' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('combobox', { name: 'Report project manager' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('combobox', { name: 'Reporting schedule timezone' }),
  ).toHaveValue('Asia/Qatar');
  await userEvent.type(
    screen.getByLabelText('Meta ad-account ID'),
    '123456789',
  );
  await userEvent.type(
    screen.getByLabelText('Reporting access token'),
    'synthetic-token-for-test',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Test and save connection' }),
  );
  expect(
    mockMutate.mock.calls[0][0].variables.input.configuration,
  ).toMatchObject({
    engagementId: 'client-service',
    projectId: 'project',
    managerId: 'manager',
    marketerId: 'marketer',
    scheduleTimezone: 'Asia/Qatar',
    time: '06:00',
  });
});
it('explains missing client responsibilities and prevents a misleading save', async () => {
  mockData.clientServices = [
    {
      id: 'client-service',
      name: 'Brand performance',
      projectId: 'project',
      managerId: null,
      marketerId: null,
      ready: false,
    },
  ];
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Connect Meta account' }),
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Report routing' }),
    'client-service',
  );
  expect(
    screen.getByRole('button', { name: 'Test and save connection' }),
  ).toBeDisabled();
  expect(
    screen.getByText(/Configure this client’s Meta responsibilities/),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open Clients' })).toHaveAttribute(
    'href',
    '/delivery?view=clients',
  );
});

it('reviews the current client responsibilities while preserving imported assignment history', async () => {
  mockData.reports = [
    {
      ...mockReport,
      engagementId: 'client-service',
      projectId: 'old-project',
      managerId: 'old-manager',
      marketerId: 'member',
      routing: {
        projectId: 'project',
        managerId: 'member',
        marketerId: 'new-marketer',
      },
    },
  ];
  setup();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Recommendations for the marketer' }),
    'Check the landing-page conversion evidence.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Save report decision' }),
  );
  expect(mockMutate.mock.calls[0][0].variables.input).toMatchObject({
    action: 'review',
    id: mockReport.id,
    expectedRouting: {
      projectId: 'project',
      managerId: 'member',
      marketerId: 'new-marketer',
    },
  });
});

it('explicitly clears a saved Qatar timezone when switching to the account timezone', async () => {
  mockData.connections = [
    { ...mockConnection, scheduleTimezone: 'Asia/Qatar' },
  ];
  setup();
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit connection' }),
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Reporting schedule timezone' }),
    '',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Test and save connection' }),
  );
  expect(
    mockMutate.mock.calls[0][0].variables.input.configuration.scheduleTimezone,
  ).toBeNull();
});

import { useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type DeliveryFounderPerformanceInput } from '~/generated-metadata/graphql';
import { DeliveryFounderExceptions } from '@/delivery/founder/DeliveryFounderExceptions';
import { GET_DELIVERY_FOUNDER_PERFORMANCE } from '@/delivery/founder/performance/delivery-founder-performance.graphql';
import { GET_DELIVERY_FOUNDER_EXECUTIVE_INSIGHTS } from '@/delivery/founder/performance/delivery-founder-executive-insights.graphql';
import { GET_DELIVERY_FINANCE_FORECAST } from '@/delivery/finance/delivery-finance-forecast.graphql';
import { GET_DELIVERY_FOUNDER_EXCEPTIONS } from '@/delivery/founder/delivery-founder.graphql';
import { GET_DELIVERY_READINESS } from '@/delivery/readiness/delivery-readiness.graphql';
import { GET_CAPACITY_SUMMARY } from '@/delivery/capacity/read/delivery-capacity-read.graphql';
import { GET_HANDOFFS } from '@/delivery/handoffs/delivery-handoffs.graphql';
import { GET_META_LEAD_FORMS } from '@/meta-lead-forms/metaLeadFormsGraphql';
import { GET_AI_BUDGET } from '@/otogrow-ai-budget/otogrow-ai-budget.graphql';
import {
  performanceFixture,
  PERFORMANCE_COMPANY_ID,
  PERFORMANCE_MEMBER_ID,
  PERFORMANCE_PROJECT_ID,
  type PerformanceFixture,
} from '@/delivery/founder/performance/__tests__/performance.fixtures';
import {
  currentPerformanceMonth,
  readPerformanceNavigation,
} from '@/delivery/founder/performance/performance-navigation';
import { formatPerformanceRate } from '@/delivery/founder/performance/performance-format';

let mockSnapshot: PerformanceFixture;
let mockExecutiveInsights: Record<string, unknown> | null = null;
let mockForecast: Record<string, unknown> | null = null;
let mockExceptions: Record<string, unknown> | null = null;
let mockReadiness: Record<string, unknown> | null = null;
let mockCapacity: Record<string, unknown> | null = null;
let mockHandoffs: Record<string, unknown> | null = null;
let mockMetaLeads: Record<string, unknown> | null = null;
let mockAiBudget: Record<string, unknown> | null = null;
let mockError: Error | undefined;
let mockLoading = false;
let mockNetworkStatus = NetworkStatus.ready;
let mockReady = true;
let mockAdmin = true;
let mockFinance = true;
let mockScope = 'workspace:member';
let mockRefreshPage: () => void;
const mockRefetch = jest.fn();
const mockQuery = jest.fn();
const mockAccessRefetch = jest.fn();

const performanceQueryCalls = () =>
  mockQuery.mock.calls.filter(
    (call) => call[0] === GET_DELIVERY_FOUNDER_PERFORMANCE,
  );

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliverySectionStack: 'div',
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
}));
jest.mock('@/delivery/founder/performance/performanceStyles', () => ({
  StyledPerformanceViewNavigation: 'nav',
  StyledPerformanceFilters: 'form',
  StyledPerformanceFiltersDisclosure: 'details',
  StyledPerformanceMetrics: 'dl',
  StyledPerformanceList: 'div',
  StyledPerformanceRecord: 'div',
  StyledPerformanceRecordMetrics: 'dl',
  StyledPerformanceMuted: 'span',
}));
jest.mock('@/delivery/founder/performance/adminDashboardStyles', () => ({
  StyledAdminPanel: 'section',
  StyledAdminSectionHeader: 'div',
  StyledAdminEyebrow: 'span',
  StyledLiveDot: 'span',
  StyledHeroBeam: 'span',
  StyledAdminExportButton: 'button',
  StyledAdminHeroBar: 'section',
  StyledAdminHeroTop: 'div',
  StyledAdminControlRow: 'div',
  StyledCurrencyPills: 'div',
  StyledCurrencyPill: 'button',
  StyledQuickLinks: 'div',
  StyledStatusPill: 'span',
  StyledPulseGrid: 'section',
  StyledPulseCard: 'article',
  StyledPulseLabelRow: 'div',
  StyledPulseValue: 'div',
  StyledPulseFoot: 'div',
  StyledAdminTwoColumn: 'div',
  StyledAdminThreeColumn: 'div',
  StyledChartFrame: 'div',
  StyledChartAxisLabels: 'div',
  StyledCostBarTrack: 'div',
  StyledCostBarSegment: 'span',
  StyledCostLegend: 'ul',
  StyledLegendDot: 'span',
  StyledCompactList: 'ul',
  StyledCompactListItem: 'li',
  StyledProgressTrack: 'div',
  StyledProgressFill: 'div',
  StyledFilterTabs: 'div',
  StyledFilterTab: 'button',
  StyledDataHealthDrawer: 'details',
  StyledDirectoryAvatar: 'span',
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockQuery(...args),
}));
jest.mock('@/delivery/finance/useFinanceLabels', () => ({
  PRIMARY_FINANCE_CURRENCIES: ['INR', 'USD', 'QAR', 'AED'],
  useFinanceLabels: () => ({
    currencies: ['INR', 'USD', 'QAR', 'AED', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD'],
  }),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canManageRoles: mockAdmin,
    canReadFinance: mockFinance,
    scope: mockScope,
    error: mockReady ? undefined : new Error('offline'),
    refetch: mockAccessRefetch,
    matches: (
      value:
        | { workspaceId?: string; memberId?: string; userWorkspaceId?: string }
        | undefined,
    ) =>
      mockReady &&
      value?.workspaceId === 'workspace' &&
      value.memberId === 'member' &&
      value.userWorkspaceId === 'membership',
  }),
}));
const setup = (extra = '') => {
  const Page = () => {
    const [, setVersion] = useState(0);
    mockRefreshPage = () => setVersion((value) => value + 1);
    return <DeliveryFounderExceptions />;
  };
  const initialParams = new URLSearchParams({
    view: 'health',
    founderPanel: 'performance',
    founderMonth: '2026-11',
    founderTimezone: 'Asia/Qatar',
  });
  for (const [key, value] of new URLSearchParams(extra))
    initialParams.set(key, value);
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <Page />
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: [`/delivery?${initialParams}`] },
  );
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return { router, refresh: () => act(() => mockRefreshPage()) };
};

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  mockSnapshot = performanceFixture();
  mockExecutiveInsights = null;
  mockForecast = null;
  mockExceptions = null;
  mockReadiness = null;
  mockCapacity = null;
  mockHandoffs = null;
  mockMetaLeads = null;
  mockAiBudget = null;
  mockError = undefined;
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  mockReady = true;
  mockAdmin = true;
  mockFinance = true;
  mockScope = 'workspace:member';
  jest.clearAllMocks();
  mockRefetch.mockResolvedValue({
    data: { deliveryFounderPerformance: mockSnapshot },
  });
  mockAccessRefetch.mockResolvedValue(undefined);
  mockQuery.mockImplementation((...args: unknown[]) => {
    const document = args[0];
    const options = (args[1] ?? {}) as {
      skip?: boolean;
      variables?: { input?: Record<string, unknown> };
    };
    if (document === GET_DELIVERY_FOUNDER_PERFORMANCE) {
      const input = options.variables?.input as DeliveryFounderPerformanceInput;
      const previousDate = new Date(`${input.month}-01T00:00:00.000Z`);
      previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
      const snapshot = {
        ...mockSnapshot,
        month: input.month,
        previousMonth: previousDate.toISOString().slice(0, 7),
        timezone: input.timezone,
        currency: input.currency ?? null,
      };
      return {
        data: { deliveryFounderPerformance: snapshot },
        error: mockError,
        loading: mockLoading,
        networkStatus: mockNetworkStatus,
        refetch: mockRefetch,
      };
    }
    if (options.skip) {
      return {
        data: undefined,
        error: undefined,
        loading: false,
        networkStatus: NetworkStatus.ready,
        refetch: jest.fn(),
      };
    }
    if (document === GET_DELIVERY_FOUNDER_EXECUTIVE_INSIGHTS) {
      return {
        data: mockExecutiveInsights
          ? { deliveryFounderExecutiveInsights: mockExecutiveInsights }
          : undefined,
        error: undefined,
        loading: false,
        networkStatus: NetworkStatus.ready,
        refetch: jest.fn(),
      };
    }
    if (document === GET_DELIVERY_FINANCE_FORECAST) {
      return {
        data: mockForecast
          ? { deliveryFinanceForecast: mockForecast }
          : undefined,
        error: undefined,
        loading: false,
        networkStatus: NetworkStatus.ready,
        refetch: jest.fn(),
      };
    }
    if (document === GET_DELIVERY_FOUNDER_EXCEPTIONS) {
      return {
        data: mockExceptions
          ? { deliveryFounderExceptions: mockExceptions }
          : undefined,
        error: undefined,
        loading: false,
        networkStatus: NetworkStatus.ready,
        refetch: jest.fn(),
      };
    }
    if (document === GET_DELIVERY_READINESS) {
      return {
        data: mockReadiness ? { deliveryReadiness: mockReadiness } : undefined,
        error: undefined,
        loading: false,
        networkStatus: NetworkStatus.ready,
        refetch: jest.fn(),
      };
    }
    if (document === GET_CAPACITY_SUMMARY) {
      return {
        data: mockCapacity
          ? { deliveryCapacitySummary: mockCapacity }
          : undefined,
        error: undefined,
        loading: false,
        networkStatus: NetworkStatus.ready,
        refetch: jest.fn(),
      };
    }
    if (document === GET_HANDOFFS) {
      return {
        data: mockHandoffs ? { deliveryHandoffs: mockHandoffs } : undefined,
        error: undefined,
        loading: false,
        networkStatus: NetworkStatus.ready,
        refetch: jest.fn(),
      };
    }
    if (document === GET_META_LEAD_FORMS) {
      return {
        data: mockMetaLeads ?? undefined,
        error: undefined,
        loading: false,
        networkStatus: NetworkStatus.ready,
        refetch: jest.fn(),
      };
    }
    if (document === GET_AI_BUDGET) {
      return {
        data: mockAiBudget
          ? { otogrowAiBudgetSnapshot: mockAiBudget }
          : undefined,
        error: undefined,
        loading: false,
        networkStatus: NetworkStatus.ready,
        refetch: jest.fn(),
      };
    }
    return {
      data: undefined,
      error: undefined,
      loading: false,
      networkStatus: NetworkStatus.ready,
      refetch: jest.fn(),
    };
  });
});

describe('founder performance dashboard', () => {
  it('shows current company, client and employee measures with exact source destinations', () => {
    setup();
    const company = screen.getByRole('region', {
      name: 'USD financial performance',
    });
    expect(company).toHaveTextContent('Recognized revenue');
    expect(company).toHaveTextContent('$10,000.00');
    expect(company).toHaveTextContent('45.00%');
    expect(company).toHaveTextContent('Cash collected this month');
    expect(company).toHaveTextContent('$6,000.00');
    expect(company).toHaveTextContent('October 2026');
    const client = screen.getByRole('article', { name: 'Client Alpha' });
    expect(client).toHaveTextContent('48.00%');
    expect(client).toHaveTextContent('$2,000.00');
    expect(
      within(client).getByRole('link', { name: 'Open client' }),
    ).toHaveAttribute(
      'href',
      `/delivery?view=clients&clientCompany=${PERFORMANCE_COMPANY_ID}&clientProject=${PERFORMANCE_PROJECT_ID}`,
    );
    expect(
      within(client).getByRole('link', { name: 'Financial sources' }),
    ).toHaveAttribute('href', expect.stringContaining('financeMonth=2026-11'));
    const employee = screen.getByRole('article', { name: 'Amna' });
    expect(employee).toHaveTextContent('Posted salary allocation: $4,000.00');
    expect(employee).toHaveTextContent('33.3% (1/3)');
    expect(
      within(employee).getByRole('link', { name: 'Open assigned work' }),
    ).toHaveAttribute('href', expect.stringContaining(PERFORMANCE_MEMBER_ID));
    expect(performanceQueryCalls()[0][1].variables.input).toEqual({
      month: '2026-11',
      timezone: 'Asia/Qatar',
      currency: null,
      afterProjectId: null,
      afterMemberId: null,
    });
  });

  it('keeps rates unavailable without a denominator', async () => {
    mockSnapshot.operations.dueTaskCount = 0;
    mockSnapshot.operations.onTimeApprovedTaskCount = 0;
    mockSnapshot.employees[0].operations.reviewedTaskCount = 0;
    mockSnapshot.employees[0].operations.firstPassApprovedTaskCount = 0;
    setup();
    expect(
      screen.getByRole('region', { name: 'Delivery performance' }),
    ).toHaveTextContent('Not measured');
    expect(screen.getByRole('article', { name: 'Amna' })).toHaveTextContent(
      'Not measured',
    );
    await userEvent.click(
      screen.getAllByText('Cost breakdown and company allocations')[0],
    );
    expect(screen.getByText('Company / unassigned costs')).toBeInTheDocument();
  });

  it('restores currency and cursors from the URL and preserves filters while paging', async () => {
    mockSnapshot.nextProjectId = PERFORMANCE_PROJECT_ID;
    mockSnapshot.nextMemberId = PERFORMANCE_MEMBER_ID;
    const { router } = setup('&founderCurrency=USD');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveValue(
      'USD',
    );
    expect(performanceQueryCalls()[0][1].variables.input.currency).toBe('USD');
    await userEvent.click(screen.getByRole('link', { name: 'More clients' }));
    await waitFor(() =>
      expect(router.state.location.search).toContain(
        `founderClientsAfter=${PERFORMANCE_PROJECT_ID}`,
      ),
    );
    expect(router.state.location.search).toContain('founderCurrency=USD');
    expect(router.state.location.search).toContain('founderMonth=2026-11');
    expect(
      screen.getByRole('link', { name: 'First clients page' }),
    ).toHaveAttribute(
      'href',
      expect.not.stringContaining('founderClientsAfter'),
    );
  });

  it('submits month, timezone and currency through browser history and resets both pages', async () => {
    const { router } = setup(
      `&founderClientsAfter=${PERFORMANCE_PROJECT_ID}&founderMembersAfter=${PERFORMANCE_MEMBER_ID}`,
    );
    fireEvent.change(screen.getByLabelText('Service month'), {
      target: { value: '2026-12' },
    });
    fireEvent.change(screen.getByLabelText('Reporting time zone'), {
      target: { value: 'UTC' },
    });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Currency' }),
      'USD',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply reporting period' }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toContain('founderMonth=2026-12'),
    );
    expect(router.state.location.search).toContain('founderTimezone=UTC');
    expect(router.state.location.search).toContain('founderCurrency=USD');
    expect(router.state.location.search).not.toContain('founderClientsAfter');
    expect(router.state.location.search).not.toContain('founderMembersAfter');
    expect(performanceQueryCalls().at(-1)?.[1].variables.input).toEqual(
      expect.objectContaining({
        month: '2026-12',
        timezone: 'UTC',
        currency: 'USD',
      }),
    );
    await act(async () => {
      await router.navigate(-1);
    });
    expect(screen.getByLabelText('Service month')).toHaveValue('2026-11');
  });

  it.each([
    '&founderMonth=2026-13',
    '&founderTimezone=Not%2FAtimezone',
    '&founderCurrency=XYZ',
    '&founderClientsAfter=bad',
  ])(
    'rejects malformed filters %s without exposing saved figures',
    async (extra) => {
      setup(extra);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'invalid reporting filters',
      );
      expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
      expect(performanceQueryCalls()[0][1].skip).toBe(true);
      await userEvent.click(
        screen.getByRole('button', { name: 'Reset performance filters' }),
      );
      expect(
        await screen.findByRole('article', { name: 'Client Alpha' }),
      ).toBeInTheDocument();
    },
  );

  it('hides previous figures after failure and retains a usable retry', async () => {
    const view = setup();
    expect(screen.getByText('Client Alpha')).toBeInTheDocument();
    mockError = new Error('offline');
    view.refresh();
    expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('$10,000.00')).not.toBeInTheDocument();
    mockRefetch.mockRejectedValueOnce(new Error('still offline'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Retry performance' }),
    );
    expect(
      screen.getByRole('button', { name: 'Retry performance' }),
    ).toBeEnabled();
    mockError = undefined;
    view.refresh();
    expect(screen.getByText('Client Alpha')).toBeInTheDocument();
  });

  it('unmounts figures during unknown access and after administrator revocation', async () => {
    const view = setup();
    mockReady = false;
    view.refresh();
    expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('$10,000.00')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry access' }));
    mockReady = true;
    view.refresh();
    expect(screen.getByText('Client Alpha')).toBeInTheDocument();
    mockAdmin = false;
    view.refresh();
    expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
    expect(performanceQueryCalls().at(-1)?.[1].skip).toBe(true);
  });

  it.each(['workspaceId', 'memberId', 'userWorkspaceId'] as const)(
    'redacts financial and employee evidence for a foreign %s',
    (field) => {
      const view = setup();
      mockSnapshot = { ...mockSnapshot, [field]: 'foreign' };
      view.refresh();
      expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
      expect(screen.queryByText('$10,000.00')).not.toBeInTheDocument();
    },
  );

  it.each([NetworkStatus.poll, NetworkStatus.refetch])(
    'retains verified figures only during %s and hides them on failure',
    (networkStatus) => {
      const view = setup();
      mockLoading = true;
      mockNetworkStatus = networkStatus;
      view.refresh();
      expect(screen.getByText('Client Alpha')).toBeInTheDocument();
      expect(
        screen.getByText(/Refreshing; showing the last verified figures/),
      ).toBeInTheDocument();
      mockError = new Error('offline');
      view.refresh();
      expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
    },
  );

  it.each([NetworkStatus.loading, NetworkStatus.setVariables])(
    'does not retain old figures during initial or variable loading status %s',
    (networkStatus) => {
      const view = setup();
      mockLoading = true;
      mockNetworkStatus = networkStatus;
      view.refresh();
      expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
    },
  );

  it('distinguishes restricted finance from empty finance and salary history', () => {
    mockFinance = false;
    mockForecast = {
      workspaceId: 'workspace',
      memberId: 'member',
      userWorkspaceId: 'membership',
      currency: 'USD',
      businessDate: '2026-11-18',
      timezone: 'Asia/Qatar',
      currentCashMicros: '12000000000',
      expectedInflowMicros: '5000000000',
      expectedOutflowMicros: '3000000000',
      endingCashMicros: '14000000000',
      firstNegativeDate: null,
      projectionComplete: true,
      exceptionCount: 0,
      itemCount: 0,
      knownUnscheduledInflowMicros: '0',
      knownUnscheduledOutflowMicros: '0',
      unknownCollectionCount: 0,
      unappliedActualOutflowMicros: '0',
      timeline: [{ date: '2026-11-18', closingMicros: '12000000000' }],
      items: [],
    };
    mockSnapshot = {
      ...mockSnapshot,
      canReadFinance: false,
      currencies: [],
      clients: mockSnapshot.clients.map((client) => ({
        ...client,
        finance: [],
      })),
      employees: mockSnapshot.employees.map((employee) => ({
        ...employee,
        salaryCosts: [],
      })),
      warnings: ['FINANCE_READ_REQUIRED'],
    };
    setup('&founderCurrency=USD');
    expect(
      screen.getByRole('heading', { name: 'Financial figures are restricted' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/remain unknown/)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'USD 90-day cash forecast' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', {
        name: 'USD 6-month revenue and cost trend',
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('$12,000.00')).not.toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Client Alpha' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Amna' })).toBeInTheDocument();
    expect(
      screen.queryByText(/No posted monthly finance/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/No posted salary allocation/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open monthly finance' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Review monthly source records' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Cash forecast' }),
    ).not.toBeInTheDocument();
  });

  it('uses empty coverage honestly and provides a source setup action', () => {
    mockSnapshot.currencies = [];
    mockSnapshot.clients = [];
    mockSnapshot.clientTotal = 0;
    mockSnapshot.employees = [];
    mockSnapshot.employeeTotal = 0;
    mockSnapshot.warnings = ['NO_MONTHLY_ENTRIES'];
    setup();
    expect(
      screen.getByText(/No posted monthly finance or cash records/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No client projects are available/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No active team members are available/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Open monthly finance' })[0],
    ).toHaveAttribute('href', expect.stringContaining('financeMonth=2026-11'));
    expect(screen.queryByText(/Company is healthy/)).not.toBeInTheDocument();
  });

  it('switches INR, USD, QAR and AED currencies strictly via switcher pills without blending', async () => {
    const { router } = setup();
    const switcher = screen.getByRole('group', {
      name: 'Primary currency filter',
    });
    expect(
      within(switcher).getByRole('button', { name: 'INR' }),
    ).toBeInTheDocument();
    expect(
      within(switcher).getByRole('button', { name: 'USD' }),
    ).toBeInTheDocument();
    expect(
      within(switcher).getByRole('button', { name: 'QAR' }),
    ).toBeInTheDocument();
    expect(
      within(switcher).getByRole('button', { name: 'AED' }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(switcher).getByRole('button', { name: 'QAR' }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toContain('founderCurrency=QAR'),
    );
    expect(performanceQueryCalls().at(-1)?.[1].variables.input.currency).toBe(
      'QAR',
    );
    expect(
      within(switcher).getByRole('button', { name: 'QAR' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders 90-day cash forecast, inline triage, Meta intake, handoffs, capacity, AI caps and client filters', async () => {
    mockForecast = {
      workspaceId: 'workspace',
      memberId: 'member',
      userWorkspaceId: 'membership',
      currency: 'USD',
      businessDate: '2026-11-18',
      timezone: 'Asia/Qatar',
      currentCashMicros: '12000000000',
      expectedInflowMicros: '8000000000',
      expectedOutflowMicros: '22000000000',
      endingCashMicros: '-2000000000',
      firstNegativeDate: '2026-12-10',
      projectionComplete: false,
      exceptionCount: 2,
      itemCount: 1,
      knownUnscheduledInflowMicros: '1500000000',
      knownUnscheduledOutflowMicros: '0',
      unknownCollectionCount: 1,
      unappliedActualOutflowMicros: '0',
      timeline: [
        { date: '2026-11-18', closingMicros: '12000000000' },
        { date: '2026-12-10', closingMicros: '-2000000000' },
      ],
      items: [
        {
          id: 'item-1',
          title: 'Retainer invoice #44',
          kind: 'INFLOW',
          status: 'OPEN',
          expectedDate: '2026-11-25',
          ownerName: 'Amna',
          amountMicros: '4000000000',
          remainingMicros: '4000000000',
          currency: 'USD',
        },
      ],
    };
    mockExceptions = {
      workspaceId: 'workspace',
      memberId: 'member',
      userWorkspaceId: 'membership',
      canReadFinance: true,
      totalCount: 3,
      counts: [{ domain: 'FINANCE', count: 2 }],
      items: [
        {
          key: 'exc-1',
          domain: 'FINANCE',
          reasonCode: 'FORECAST_NEGATIVE_CLOSING',
          title: 'USD projected shortfall',
          projectName: 'Client Alpha',
          ownerName: 'Amna',
          nextAction: {
            code: 'OPEN_FINANCE_FORECAST',
            currency: 'USD',
          },
        },
      ],
    };
    mockReadiness = {
      workspaceId: 'workspace',
      memberId: 'member',
      userWorkspaceId: 'membership',
      items: [
        {
          id: 'conn-1',
          capability: 'META_ADS',
          accountName: 'Otogrow Ads',
          status: 'NEEDS_ATTENTION',
          destination: 'clients',
        },
      ],
    };
    mockCapacity = {
      workspaceId: 'workspace',
      memberId: 'member',
      userWorkspaceId: 'membership',
      members: [
        {
          memberId: PERFORMANCE_MEMBER_ID,
          name: 'Amna',
          overloadDays: 2,
          needsPlanningCount: 3,
          days: [{ overloadMinutes: 120, reviewMinutes: 45, workMinutes: 480 }],
        },
      ],
    };
    mockHandoffs = {
      workspaceId: 'workspace',
      memberId: 'member',
      userWorkspaceId: 'membership',
      opportunities: [
        {
          id: 'opp-1',
          name: 'Doha Retail Launch',
          hasCompany: true,
          quotes: [{ id: 'q-1', name: 'Q1 Retainer' }],
        },
      ],
      handoffs: [],
    };
    mockMetaLeads = {
      metaLeadForms: [
        {
          id: 'form-1',
          name: 'Qatar Performance Form',
          isActive: true,
          lastError: 'Webhook token expired',
        },
      ],
      metaLeadFormActivity: [
        { formId: 'form-1', totalCount: 12, unreadCount: 4 },
      ],
    };
    mockAiBudget = {
      workspaceId: 'workspace',
      memberId: 'member',
      userWorkspaceId: 'membership',
      configured: true,
      chargedUsd: '45.00',
      heldUsd: '5.00',
      unresolvedCount: 1,
      budgets: [
        {
          id: 'bud-1',
          scope: 'WORKSPACE',
          scopeName: 'Workspace',
          enabled: true,
          capUsd: '100.00',
          chargedUsd: '45.00',
          heldUsd: '5.00',
          remainingUsd: '50.00',
        },
      ],
    };
    mockSnapshot.clients.push({
      projectId: '33cb9daf-4cdd-461d-bc1d-1a81f8b502b6',
      projectName: 'Client Steady',
      companyId: PERFORMANCE_COMPANY_ID,
      teamCount: 2,
      operations: {
        ...mockSnapshot.operations,
        overdueTaskCount: 0,
        blockedTaskCount: 0,
      },
      finance: [],
    });
    mockSnapshot.clientTotal = 2;

    setup('&founderCurrency=USD');

    const forecastPanel = screen.getByRole('region', {
      name: 'USD 90-day cash forecast',
    });
    expect(forecastPanel).toHaveTextContent('Shortfall on 2026-12-10');
    expect(forecastPanel).toHaveTextContent('Retainer invoice #44');
    expect(
      within(forecastPanel).getByRole('img', {
        name: '90-day projected closing cash curve for USD',
      }),
    ).toBeInTheDocument();

    const attentionPanel = screen.getByRole('region', {
      name: 'Needs attention now',
    });
    expect(attentionPanel).toHaveTextContent('USD projected shortfall');
    expect(attentionPanel).toHaveTextContent('Otogrow Ads');

    const intakePanel = screen.getByRole('region', {
      name: 'Sales intake and client handoffs',
    });
    expect(intakePanel).toHaveTextContent('Qatar Performance Form');
    expect(intakePanel).toHaveTextContent('Doha Retail Launch');

    const capacityPanel = screen.getByRole('region', {
      name: 'Team capacity and review load',
    });
    expect(capacityPanel).toHaveTextContent('1 overloaded');
    expect(capacityPanel).toHaveTextContent('+2h (2d)');

    const aiPanel = screen.getByRole('region', { name: 'AI spend and caps' });
    expect(aiPanel).toHaveTextContent('50% used');
    expect(aiPanel).toHaveTextContent('1 AI spend items need reconciliation.');

    // Filter Client Health Matrix to "Needs attention" and confirm steady client hides
    const clientSection = screen.getByRole('region', {
      name: 'Client performance',
    });
    expect(
      within(clientSection).getByRole('article', { name: 'Client Steady' }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(clientSection).getByRole('button', {
        name: /Needs attention/,
      }),
    );
    expect(
      within(clientSection).getByRole('article', { name: 'Client Alpha' }),
    ).toBeInTheDocument();
    expect(
      within(clientSection).queryByRole('article', { name: 'Client Steady' }),
    ).not.toBeInTheDocument();
  });

  it('renders 6-month currency trends, CRM sales funnel, renewal radar, inbox SLA and exports CSV safely', async () => {
    mockExecutiveInsights = {
      workspaceId: 'workspace',
      memberId: 'member',
      userWorkspaceId: 'membership',
      observedAt: '2026-11-18T10:00:00.000Z',
      month: '2026-11',
      currency: null,
      canReadFinance: true,
      trends: [
        {
          currency: 'USD',
          points: [
            {
              month: '2026-09',
              revenueMicros: '8000000000',
              costMicros: '5000000000',
              resultMicros: '3000000000',
            },
            {
              month: '2026-10',
              revenueMicros: '9000000000',
              costMicros: '5200000000',
              resultMicros: '3800000000',
            },
            {
              month: '2026-11',
              revenueMicros: '10000000000',
              costMicros: '5500000000',
              resultMicros: '4500000000',
            },
          ],
        },
        {
          currency: 'QAR',
          points: [
            {
              month: '2026-11',
              revenueMicros: '30000000000',
              costMicros: '18000000000',
              resultMicros: '12000000000',
            },
          ],
        },
      ],
      salesFunnel: {
        restricted: false,
        totalOpenDeals: 4,
        wonDealsCount: 2,
        expiringQuotesCount: 1,
        openValuesByCurrency: [
          { currency: 'QAR', amountMicros: '45000000000', dealCount: 3 },
          { currency: 'USD', amountMicros: '12000000000', dealCount: 1 },
        ],
        stages: [
          { stage: 'PROPOSAL', dealCount: 3 },
          { stage: 'MEETING', dealCount: 1 },
        ],
        expiringQuotes: [
          {
            id: 'q-1',
            quoteNumber: 'QT-2026-009',
            status: 'SENT',
            validUntil: '2026-11-22',
            daysRemaining: 4,
            currency: 'QAR',
            totalAmountMicros: '15000000000',
          },
        ],
      },
      renewals: [
        {
          periodId: 'period-1',
          projectId: PERFORMANCE_PROJECT_ID,
          companyId: PERFORMANCE_COMPANY_ID,
          projectName: 'Client Alpha',
          label: 'Q4 Growth Retainer',
          endDateExclusive: '2026-11-25',
          daysRemaining: 7,
        },
      ],
      inboxSla: {
        connectedThreadsCount: 8,
        pendingRepliesCount: 2,
        failedRepliesCount: 1,
        oldestPendingHours: 14,
        items: [
          {
            replyId: 'reply-1',
            projectId: PERFORMANCE_PROJECT_ID,
            projectName: 'Client Alpha',
            status: 'FAILED',
            ageHours: 14,
            problem: 'SMTP rejected recipient',
          },
        ],
      },
    };

    const createObjectUrl = jest.fn(() => 'blob:otogrow-csv');
    const revokeObjectUrl = jest.fn();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = revokeObjectUrl;
    const anchorClickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    try {
      setup();

      const usdTrend = screen.getByRole('region', {
        name: 'USD 6-month revenue and cost trend',
      });
      expect(
        within(usdTrend).getByRole('img', {
          name: '6-month recognized revenue and cost chart for USD',
        }),
      ).toBeInTheDocument();
      const qarTrend = screen.getByRole('region', {
        name: 'QAR 6-month revenue and cost trend',
      });
      expect(
        within(qarTrend).getByRole('img', {
          name: '6-month recognized revenue and cost chart for QAR',
        }),
      ).toBeInTheDocument();

      const funnelCard = screen.getByRole('region', {
        name: 'CRM sales funnel and expiring quotes',
      });
      expect(funnelCard).toHaveTextContent('QAR open pipeline (3 deals)');
      expect(funnelCard).toHaveTextContent('USD open pipeline (1 deals)');
      expect(funnelCard).toHaveTextContent('PROPOSAL');
      expect(funnelCard).toHaveTextContent('QT-2026-009');
      expect(funnelCard).toHaveTextContent('In 4d');

      const renewalCard = screen.getByRole('region', {
        name: 'Retainer renewals and client inbox SLA',
      });
      expect(renewalCard).toHaveTextContent('Q4 Growth Retainer');
      expect(renewalCard).toHaveTextContent('7d left');
      expect(renewalCard).toHaveTextContent('14h');
      expect(renewalCard).toHaveTextContent('SMTP rejected recipient');

      await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
      expect(createObjectUrl).toHaveBeenCalledTimes(1);
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:otogrow-csv');
    } finally {
      anchorClickSpy.mockRestore();
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
    }
  });

  it('shows CRM access required state when sales funnel permissions are restricted', () => {
    mockExecutiveInsights = {
      workspaceId: 'workspace',
      memberId: 'member',
      userWorkspaceId: 'membership',
      observedAt: '2026-11-18T10:00:00.000Z',
      month: '2026-11',
      currency: null,
      canReadFinance: true,
      trends: [],
      salesFunnel: {
        restricted: true,
        totalOpenDeals: 0,
        wonDealsCount: 0,
        expiringQuotesCount: 0,
        openValuesByCurrency: [],
        stages: [],
        expiringQuotes: [],
      },
      renewals: [],
      inboxSla: {
        connectedThreadsCount: 0,
        pendingRepliesCount: 0,
        failedRepliesCount: 0,
        oldestPendingHours: null,
        items: [],
      },
    };
    setup();
    const funnelCard = screen.getByRole('region', {
      name: 'CRM sales funnel and expiring quotes',
    });
    expect(funnelCard).toHaveTextContent('CRM access required');
    expect(funnelCard).toHaveTextContent(
      /CRM opportunity and quote read access is required/,
    );
  });
});

describe('performance navigation and formatting', () => {
  it('derives the selected month in the reporting timezone and validates current inputs', () => {
    expect(
      currentPerformanceMonth(
        'Asia/Qatar',
        new Date('2026-10-31T21:30:00.000Z'),
      ),
    ).toBe('2026-11');
    expect(
      readPerformanceNavigation(
        new URLSearchParams(
          'founderMonth=2026-11&founderTimezone=Asia%2FQatar',
        ),
        ['USD'],
        'UTC',
      ).success,
    ).toBe(true);
  });
  it.each([
    [1, 3, '33.3% (1/3)'],
    [0, 2, '0% (0/2)'],
  ])('formats a supported rate %s/%s', (numerator, denominator, expected) => {
    expect(formatPerformanceRate(numerator, denominator, 'en')).toBe(expected);
  });
  it('rejects missing or impossible rate evidence', () => {
    expect(formatPerformanceRate(0, 0)).toBeNull();
    expect(formatPerformanceRate(2, 1)).toBeNull();
    expect(formatPerformanceRate(-1, 2)).toBeNull();
  });
});

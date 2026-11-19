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
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockQuery(...args),
}));
jest.mock('@/delivery/finance/useFinanceLabels', () => ({
  useFinanceLabels: () => ({
    currencies: ['USD', 'AED', 'EUR', 'GBP', 'INR', 'SGD', 'AUD', 'CAD'],
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
    matches: (value: PerformanceFixture | undefined) =>
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
    const options = args[1] as {
      variables: { input: DeliveryFounderPerformanceInput };
    };
    const input = options.variables.input;
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
    expect(mockQuery.mock.calls[0][1].variables.input).toEqual({
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
    expect(mockQuery.mock.calls[0][1].variables.input.currency).toBe('USD');
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
    expect(mockQuery.mock.calls.at(-1)?.[1].variables.input).toEqual(
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
      expect(mockQuery.mock.calls[0][1].skip).toBe(true);
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
    expect(mockQuery.mock.calls.at(-1)?.[1].skip).toBe(true);
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
    setup();
    expect(
      screen.getByRole('heading', { name: 'Financial figures are restricted' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/remain unknown/)).toBeInTheDocument();
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

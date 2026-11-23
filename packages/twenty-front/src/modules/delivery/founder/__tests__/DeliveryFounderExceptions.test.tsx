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
import { DeliveryFounderExceptions } from '@/delivery/founder/DeliveryFounderExceptions';
import { type FounderSnapshot } from '@/delivery/founder/founder.types';
import {
  FOUNDER_OWNER_ID,
  FOUNDER_PROJECT_ID,
  founderSnapshotFixture,
} from '@/delivery/founder/__tests__/founder.fixtures';

let mockSnapshot: FounderSnapshot;
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
  StyledDeliveryButton: 'button',
  StyledDeliveryCard: 'section',
  StyledDeliveryRow: 'div',
}));
jest.mock('@/delivery/founder/founderStyles', () => ({
  StyledFounderFilters: 'div',
  StyledFounderList: 'ul',
  StyledFounderHeading: 'div',
  StyledFounderEvidence: 'dl',
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockQuery(...args),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canManageRoles: mockAdmin,
    canReadFinance: mockFinance,
    scope: mockScope,
    refetch: mockAccessRefetch,
    matches: (value: FounderSnapshot | undefined) =>
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
    {
      initialEntries: [
        `/delivery?view=health&founderPanel=attention&readinessStatus=NEEDS_SETUP${extra}`,
      ],
    },
  );
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return { router, refresh: () => act(() => mockRefreshPage()) };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  mockSnapshot = founderSnapshotFixture();
  mockError = undefined;
  mockLoading = false;
  mockNetworkStatus = NetworkStatus.ready;
  mockReady = true;
  mockAdmin = true;
  mockFinance = true;
  mockScope = 'workspace:member';
  jest.clearAllMocks();
  mockRefetch.mockResolvedValue({
    data: { deliveryFounderExceptions: mockSnapshot },
  });
  mockAccessRefetch.mockResolvedValue(undefined);
  mockQuery.mockImplementation(() => ({
    data: { deliveryFounderExceptions: mockSnapshot },
    error: mockError,
    loading: mockLoading,
    networkStatus: mockNetworkStatus,
    refetch: mockRefetch,
  }));
});

describe('founder company exceptions', () => {
  it('shows actionable client, dated evidence, current owner and source action with explicit coverage', () => {
    setup();
    const row = screen.getByRole('article', { name: 'Launch campaign assets' });
    expect(row).toHaveTextContent('Client Alpha');
    expect(row).toHaveTextContent('Amna');
    expect(within(row).getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('task='),
    );
    expect(
      screen.getByRole('region', { name: 'Evidence coverage' }),
    ).toHaveTextContent('Coverage is incomplete');
    expect(
      screen.getByLabelText('Recorded result month (optional)'),
    ).toHaveValue('');
    expect(mockQuery.mock.calls[0][1].variables.input).toEqual({
      domain: 'ALL',
      limit: 25,
    });
  });
  it('treats empty results with incomplete coverage as unknown coverage rather than company health', () => {
    mockSnapshot = { ...mockSnapshot, items: [], totalCount: 0, counts: [] };
    setup();
    expect(
      screen.getByText(/No known exceptions on this page/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Missing or restricted evidence is not a healthy result/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Company is healthy/)).not.toBeInTheDocument();
  });
  it('restores validated direct URL filters and never invents a service month', () => {
    setup(
      `&founderDomain=FINANCE&founderProject=${FOUNDER_PROJECT_ID}&founderOwner=${FOUNDER_OWNER_ID}&founderCurrency=USD&founderMonth=2026-09`,
    );
    expect(screen.getByRole('combobox', { name: 'Area' })).toHaveValue(
      'FINANCE',
    );
    expect(
      screen.getByRole('combobox', { name: 'Client project' }),
    ).toHaveValue(FOUNDER_PROJECT_ID);
    expect(
      screen.getByRole('combobox', { name: 'Accountable person' }),
    ).toHaveValue(FOUNDER_OWNER_ID);
    expect(
      screen.getByRole('combobox', { name: 'Evidence currency' }),
    ).toHaveValue('USD');
    expect(
      screen.getByLabelText('Recorded result month (optional)'),
    ).toHaveValue('2026-09');
    expect(mockQuery.mock.calls[0][1].variables.input).toEqual(
      expect.objectContaining({
        domain: 'FINANCE',
        projectId: FOUNDER_PROJECT_ID,
        ownerId: FOUNDER_OWNER_ID,
        currency: 'USD',
        serviceMonth: '2026-09',
        limit: 25,
      }),
    );
  });
  it('keeps filters in browser history and resets only the cursor when a filter changes', async () => {
    const { router } = setup('&founderAfter=page-two&founderCurrency=USD');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Area' }),
      'DELIVERY',
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Area' })).toHaveValue(
        'DELIVERY',
      ),
    );
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('founderAfter')).toBeNull();
    expect(params.get('founderCurrency')).toBe('USD');
    expect(params.get('readinessStatus')).toBe('NEEDS_SETUP');
    await act(async () => {
      await router.navigate(-1);
    });
    expect(screen.getByRole('combobox', { name: 'Area' })).toHaveValue('ALL');
    expect(router.state.location.search).toContain('founderAfter=page-two');
  });
  it('stores an explicitly selected month in the URL and keeps the current forecast distinction visible', async () => {
    const { router } = setup();
    await userEvent.click(
      screen.getByText('More filters', { selector: 'summary' }),
    );
    fireEvent.change(
      screen.getByLabelText('Recorded result month (optional)'),
      { target: { value: '2026-10' } },
    );
    await waitFor(() =>
      expect(router.state.location.search).toContain('founderMonth=2026-10'),
    );
    expect(
      screen.getByText(/current cash forecasts keep their own reporting dates/),
    ).toBeInTheDocument();
  });
  it('uses complete server counts while paging and preserves the original filter selection', async () => {
    mockSnapshot.totalCount = 71;
    mockSnapshot.counts[0].count = 71;
    mockSnapshot.nextCursor = 'opaque-next-page';
    const { router } = setup('&founderCurrency=USD');
    expect(
      screen.getByText(/Known exceptions in this selection: 71/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await userEvent.click(
      screen.getByRole('link', { name: 'More exceptions' }),
    );
    expect(
      await screen.findByRole('link', { name: 'First exceptions page' }),
    ).toHaveAttribute('href', expect.stringContaining('founderCurrency=USD'));
    expect(router.state.location.search).toContain(
      'founderAfter=opaque-next-page',
    );
    await userEvent.click(
      screen.getByRole('link', { name: 'First exceptions page' }),
    );
    await waitFor(() =>
      expect(router.state.location.search).not.toContain('founderAfter'),
    );
    expect(router.state.location.search).toContain('founderCurrency=USD');
  });
  it.each([
    '&founderDomain=UNKNOWN',
    '&founderProject=bad',
    '&founderOwner=bad',
    '&founderCurrency=XYZ',
    '&founderMonth=2026-13',
  ])(
    'rejects malformed filters %s without rendering cached results',
    async (extra) => {
      setup(extra);
      expect(screen.getByRole('alert')).toHaveTextContent('invalid filters');
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      expect(mockQuery.mock.calls[0][1].skip).toBe(true);
      await userEvent.click(
        screen.getByRole('button', { name: 'Reset exception filters' }),
      );
      expect(
        await screen.findByRole('article', { name: 'Launch campaign assets' }),
      ).toBeInTheDocument();
    },
  );
  it('hides previous evidence after a query failure and keeps failed retry usable before recovery', async () => {
    const view = setup();
    expect(screen.getByRole('article')).toBeInTheDocument();
    mockError = new Error('offline');
    view.refresh();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
    mockRefetch.mockRejectedValueOnce(new Error('still offline'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh exceptions' }),
    );
    expect(
      screen.getByRole('button', { name: 'Refresh exceptions' }),
    ).toBeEnabled();
    mockError = undefined;
    view.refresh();
    expect(screen.getByRole('article')).toBeInTheDocument();
  });
  it('offers a first-page recovery after a changed source invalidates its cursor', () => {
    mockError = new Error('Source evidence changed');
    setup('&founderAfter=old-page');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'return to the first page',
    );
    expect(
      screen.getByRole('link', { name: 'First exceptions page' }),
    ).toHaveAttribute('href', expect.not.stringContaining('founderAfter'));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('explains an evidence overflow without calling a partial result complete', () => {
    mockError = new Error(
      'The source queue exceeds the founder review limit; no sources were truncated.',
    );
    setup();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Narrow the area or client project',
    );
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Known exceptions in this selection/),
    ).not.toBeInTheDocument();
  });
  it('unmounts saved evidence during unknown access and restores it only after current access verifies', async () => {
    const view = setup();
    mockReady = false;
    view.refresh();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Retry overview access' }),
    );
    expect(mockAccessRefetch).toHaveBeenCalledTimes(1);
    mockReady = true;
    view.refresh();
    expect(screen.getByRole('article')).toBeInTheDocument();
  });
  it('requires current administrator authority even with old matching query data', () => {
    const view = setup();
    mockAdmin = false;
    view.refresh();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
    expect(
      screen.getByText(/An administrator can review company exceptions/),
    ).toBeInTheDocument();
    expect(mockQuery.mock.calls.at(-1)?.[1].skip).toBe(true);
  });
  it.each(['workspaceId', 'memberId', 'userWorkspaceId'] as const)(
    'redacts all source evidence for a foreign %s',
    (field) => {
      const view = setup();
      mockSnapshot = { ...mockSnapshot, [field]: 'foreign' };
      view.refresh();
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      expect(screen.queryByText('Client Alpha')).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Known exceptions in this selection/),
      ).not.toBeInTheDocument();
    },
  );
  it('does not display a stale finance grant after current finance authority changes', () => {
    const view = setup();
    mockFinance = false;
    view.refresh();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    mockSnapshot = {
      ...mockSnapshot,
      canReadFinance: false,
      coverage: [{ domain: 'FINANCE', status: 'RESTRICTED', codes: [] }],
    };
    view.refresh();
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Evidence coverage' }),
    ).toHaveTextContent('Coverage is incomplete');
  });
  it.each([
    NetworkStatus.loading,
    NetworkStatus.setVariables,
    NetworkStatus.fetchMore,
  ])(
    'does not retain figures for initial or variable loading status %s',
    (networkStatus) => {
      const view = setup();
      mockLoading = true;
      mockNetworkStatus = networkStatus;
      view.refresh();
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Refresh exceptions' }),
      ).toBeDisabled();
    },
  );
  it.each([NetworkStatus.poll, NetworkStatus.refetch])(
    'retains expanded verified evidence during refresh status %s, then hides it on error',
    async (networkStatus) => {
      const view = setup();
      const row = screen.getByRole('article');
      await userEvent.click(
        within(row).getByText('Evidence and source details', {
          selector: 'summary',
        }),
      );
      const details = within(row)
        .getByText('Evidence and source details')
        .closest('details');
      await userEvent.click(
        screen.getByText('Coverage and limits', { selector: 'summary' }),
      );
      const coverageDetails = screen
        .getByText('Coverage and limits')
        .closest('details');
      const observed = screen
        .getByText(/Known exceptions in this selection/)
        .querySelector('time');
      mockSnapshot = { ...mockSnapshot, observedAt: '2026-10-28T12:30:00Z' };
      mockLoading = true;
      mockNetworkStatus = networkStatus;
      view.refresh();
      expect(screen.getByRole('article')).toBe(row);
      expect(
        within(row).getByText('Evidence and source details').closest('details'),
      ).toBe(details);
      expect(screen.getByText('Coverage and limits').closest('details')).toBe(
        coverageDetails,
      );
      expect(details).toHaveAttribute('open');
      expect(coverageDetails).toHaveAttribute('open');
      expect(observed).toHaveAttribute('datetime', '2026-10-28T12:00:00Z');
      expect(
        screen.getByText(
          'Refreshing evidence; showing the last verified check.',
        ),
      ).toBeInTheDocument();
      mockError = new Error('offline');
      view.refresh();
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      expect(screen.queryByText('Coverage and limits')).not.toBeInTheDocument();
      mockError = undefined;
      mockNetworkStatus = NetworkStatus.refetch;
      view.refresh();
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      mockLoading = false;
      mockNetworkStatus = NetworkStatus.ready;
      view.refresh();
      expect(screen.getByRole('article')).toBeInTheDocument();
      expect(
        screen
          .getByText(/Known exceptions in this selection/)
          .querySelector('time'),
      ).toHaveAttribute('datetime', '2026-10-28T12:30:00Z');
    },
  );
  it.each(['identity', 'finance'] as const)(
    'hides retained evidence when %s verification changes during polling',
    (change) => {
      const view = setup();
      mockLoading = true;
      mockNetworkStatus = NetworkStatus.poll;
      if (change === 'identity')
        mockSnapshot = { ...mockSnapshot, memberId: 'foreign' };
      else mockFinance = false;
      view.refresh();
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Known exceptions in this selection/),
      ).not.toBeInTheDocument();
    },
  );
  it('does not reuse a polling snapshot after the URL query changes', async () => {
    const { router } = setup();
    mockLoading = true;
    mockNetworkStatus = NetworkStatus.poll;
    await act(async () => {
      await router.navigate('/delivery?view=health&founderDomain=DELIVERY');
    });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Known exceptions in this selection/),
    ).not.toBeInTheDocument();
  });
});

import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type DeliveryFinancePeriodHistoryQuery } from '~/generated-metadata/graphql';
import { FinancePeriodHistory } from '@/delivery/finance/FinancePeriodHistory';
import {
  PERIOD_ENTRY_ID,
  PERIOD_EVENT_ID,
  financePeriodHistoryFixture,
} from '@/delivery/finance/__tests__/finance-period.fixtures';

type PeriodHistory =
  DeliveryFinancePeriodHistoryQuery['deliveryFinancePeriodHistory'];

const MONTH = '2026-09';
const HISTORY_REASON = 'Reviewed the recorded September results.';
const mockRefetch = jest.fn();
const mockUseQuery = jest.fn();
let mockHistory: PeriodHistory;
let mockQueryError: Error | undefined;
let mockReady = true;
let mockCanReadFinance = true;
let mockIdentity = {
  workspaceId: 'workspace',
  memberId: 'finance-member',
  userWorkspaceId: 'membership',
};

jest.mock('@apollo/client/react', () => ({
  useQuery: (...input: unknown[]) => mockUseQuery(...input),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canReadFinance: mockCanReadFinance,
    scope: `${mockIdentity.workspaceId}:${mockIdentity.memberId}:${mockIdentity.userWorkspaceId}`,
    matches: (value: PeriodHistory | undefined) =>
      mockReady &&
      value?.workspaceId === mockIdentity.workspaceId &&
      value?.memberId === mockIdentity.memberId &&
      value?.userWorkspaceId === mockIdentity.userWorkspaceId,
  }),
}));
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryButton: 'button',
  StyledDeliveryStack: 'div',
}));

const setup = (
  initialRoute = `/delivery?view=finance&financeView=monthly&financeMonth=${MONTH}`,
) => {
  let update: () => void = () => undefined;
  let month = MONTH;
  let enabled = true;
  const Harness = () => {
    const [, setVersion] = useState(0);
    update = () => setVersion((version) => version + 1);
    return <FinancePeriodHistory month={month} enabled={enabled} />;
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <Harness />
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: [initialRoute] },
  );
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return {
    router,
    refresh: () => act(() => update()),
    changeMonth: (next: string) =>
      act(() => {
        month = next;
        update();
      }),
    disable: () =>
      act(() => {
        enabled = false;
        update();
      }),
  };
};

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  mockHistory = financePeriodHistoryFixture(MONTH);
  mockHistory.events[0] = { ...mockHistory.events[0], reason: HISTORY_REASON };
  mockQueryError = undefined;
  mockReady = true;
  mockCanReadFinance = true;
  mockIdentity = {
    workspaceId: 'workspace',
    memberId: 'finance-member',
    userWorkspaceId: 'membership',
  };
  mockRefetch.mockReset().mockResolvedValue({});
  mockUseQuery.mockReset().mockImplementation(() => ({
    data: { deliveryFinancePeriodHistory: mockHistory },
    loading: false,
    error: mockQueryError,
    refetch: mockRefetch,
  }));
});

it('keeps each historic currency result, actor and reason distinct after a later lock', async () => {
  const original = {
    ...mockHistory.events[0],
    actorName: 'Earlier finance operator',
  };
  const later = {
    ...original,
    id: 'fb1bdafa-4c9e-42d0-95bb-ab25c853a851',
    revision: 3,
    actorName: 'Amna',
    reason: 'Reviewed the corrected service-month cost.',
    createdAt: '2026-10-29T12:00:00Z',
    summaries: original.summaries.map((summary) =>
      summary.currency === 'USD'
        ? { ...summary, costMicros: '2000000', resultMicros: '500000' }
        : summary,
    ),
  };
  mockHistory = { ...mockHistory, events: [later, original] };
  setup();
  const [laterEvent, originalEvent] = screen.getAllByRole('region', {
    name: 'Month locked',
  });
  expect(within(laterEvent).getByText(/Amna/)).toHaveTextContent('Version 3');
  expect(
    within(laterEvent).getByText('Reviewed the corrected service-month cost.'),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText(/Earlier finance operator/),
  ).toHaveTextContent('Version 1');
  expect(within(originalEvent).getByText(HISTORY_REASON)).toBeVisible();
  const originalUsd = within(originalEvent).getByRole('region', {
    name: 'USD recorded result',
  });
  const originalEur = within(originalEvent).getByRole('region', {
    name: 'EUR recorded result',
  });
  expect(
    within(originalUsd).getByText(
      /^Revenue: \$2\.50 · Costs: \$1\.00 · Result: \$1\.50$/,
    ),
  ).toBeVisible();
  expect(
    within(originalEur).getByText(
      /Revenue: €0\.00 · Costs: €1\.00 · Result: -€1\.00/,
    ),
  ).toBeVisible();
  expect(
    within(
      within(laterEvent).getByRole('region', { name: 'USD recorded result' }),
    ).getByText(/Costs: \$2\.00 · Result: \$0\.50/),
  ).toBeVisible();
  await userEvent.click(
    within(originalEvent).getByText('Client and company allocation'),
  );
  expect(
    within(originalEvent).getByText(/Company \/ unassigned/),
  ).toBeVisible();
});

it('shows reopening attribution and its reason without replacing the prior lock event', () => {
  mockHistory = {
    ...mockHistory,
    events: [
      {
        ...mockHistory.events[0],
        id: '6b7b0de3-797f-4f90-bfe3-26669d490a98',
        action: 'FINANCE_PERIOD_REOPENED',
        beforeStatus: 'LOCKED',
        afterStatus: 'OPEN',
        revision: 2,
        actorName: 'Amna',
        reason: 'Reopen for a documented allocation correction.',
      },
      ...mockHistory.events,
    ],
  };
  setup();
  const reopened = screen.getByRole('region', { name: 'Month reopened' });
  expect(within(reopened).getByText('Locked → Open')).toBeVisible();
  expect(within(reopened).getByText(/Amna/)).toHaveTextContent('Version 2');
  expect(
    within(reopened).getByText(
      'Reopen for a documented allocation correction.',
    ),
  ).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Month locked' })).getByText(
      HISTORY_REASON,
    ),
  ).toBeVisible();
});

it('pages older events and returns to the latest page while preserving the selected finance context', async () => {
  mockHistory.nextBeforeId = PERIOD_EVENT_ID;
  const page = setup(
    `/delivery?view=finance&financeView=monthly&financeMonth=${MONTH}&financeCurrency=EUR&financeEntry=${PERIOD_ENTRY_ID}`,
  );
  await userEvent.click(
    screen.getByRole('link', { name: 'Older month events' }),
  );
  const older = new URLSearchParams(page.router.state.location.search);
  expect(older.get('financePeriodHistoryBefore')).toBe(PERIOD_EVENT_ID);
  expect(older.get('financeMonth')).toBe(MONTH);
  expect(older.get('financeCurrency')).toBe('EUR');
  expect(older.get('financeEntry')).toBe(PERIOD_ENTRY_ID);
  expect(older.get('financeView')).toBe('monthly');
  await userEvent.click(
    screen.getByRole('link', { name: 'Latest month events' }),
  );
  const latest = new URLSearchParams(page.router.state.location.search);
  expect(latest.has('financePeriodHistoryBefore')).toBe(false);
  expect(latest.get('financeMonth')).toBe(MONTH);
  expect(latest.get('financeCurrency')).toBe('EUR');
  expect(latest.get('financeEntry')).toBe(PERIOD_ENTRY_ID);
});

it('shows a genuine empty history without offering another page', () => {
  mockHistory = { ...mockHistory, events: [] };
  setup();
  expect(
    screen.getByText('No lock or reopen events for this month.'),
  ).toBeVisible();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Older month events' }),
  ).not.toBeInTheDocument();
});

it('hides previously received financial history after a query failure and keeps retry usable', async () => {
  const page = setup();
  expect(screen.getByText(HISTORY_REASON)).toBeVisible();
  mockQueryError = new Error('Connection unavailable');
  page.refresh();
  expect(screen.queryByText(HISTORY_REASON)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Month locked' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The month’s status history could not be checked.',
  );
  const retry = screen.getByRole('button', { name: 'Retry month history' });
  expect(retry).toBeEnabled();
  mockRefetch.mockRejectedValueOnce(new Error('Still unavailable'));
  await userEvent.click(retry);
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(retry).toBeEnabled();
  mockQueryError = undefined;
  page.refresh();
  expect(screen.getByText(HISTORY_REASON)).toBeVisible();
});

it.each([
  'unverified access',
  'read revocation',
  'workspace change',
  'member change',
  'membership change',
])('hides cached private history after %s', (change) => {
  const page = setup();
  expect(screen.getByText(HISTORY_REASON)).toBeVisible();
  if (change === 'unverified access') mockReady = false;
  if (change === 'read revocation') mockCanReadFinance = false;
  if (change === 'workspace change')
    mockIdentity = { ...mockIdentity, workspaceId: 'another-workspace' };
  if (change === 'member change')
    mockIdentity = { ...mockIdentity, memberId: 'another-member' };
  if (change === 'membership change')
    mockIdentity = { ...mockIdentity, userWorkspaceId: 'another-membership' };
  page.refresh();
  expect(screen.queryByText(HISTORY_REASON)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Month locked' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Older month events' }),
  ).not.toBeInTheDocument();
});

it('hides the old month’s history while a different month is being requested', () => {
  const page = setup();
  page.changeMonth('2026-10');
  expect(screen.queryByText(HISTORY_REASON)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Month locked' }),
  ).not.toBeInTheDocument();
});

it('removes historic figures when its parent disables the history view', () => {
  const page = setup();
  page.disable();
  expect(screen.queryByText(HISTORY_REASON)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Month locked' }),
  ).not.toBeInTheDocument();
});

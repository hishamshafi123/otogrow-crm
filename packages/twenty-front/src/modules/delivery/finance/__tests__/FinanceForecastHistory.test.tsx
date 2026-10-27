import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { FinanceForecastHistory } from '@/delivery/finance/FinanceForecastHistory';
import { type FinanceForecastHistorySnapshot } from '@/delivery/finance/finance-forecast.types';
import {
  financeForecastHistoryFixture,
  FORECAST_ANCHOR_ID,
  FORECAST_CASH_ID,
  FORECAST_EVENT_ID,
  FORECAST_ITEM_ID,
  FORECAST_INVOICE_ID,
  FORECAST_OWNER_ID,
  FORECAST_PLAN_ID,
  FORECAST_REALIZATION_ID,
} from '@/delivery/finance/__tests__/finance-forecast.fixtures';

type HistorySourceType = 'ANCHOR' | 'ITEM' | 'REALIZATION';
const HISTORY_REASON =
  'Reviewed supplier expectation from the original agreement.';
const mockRefetch = jest.fn();
const mockUseQuery = jest.fn();
let mockHistory: FinanceForecastHistorySnapshot | undefined;
let mockQueryError: Error | undefined;
let mockLoading = false;
let mockReady = true;
let mockCanReadFinance = true;
let mockIdentity = {
  workspaceId: 'workspace',
  memberId: FORECAST_OWNER_ID,
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
    matches: (value: FinanceForecastHistorySnapshot | undefined) =>
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

const setup = ({
  sourceType: initialSourceType = 'ITEM' as HistorySourceType,
  sourceId: initialSourceId = FORECAST_ITEM_ID,
  initialRoute = `/delivery?view=finance&financeView=forecast&financeCurrency=USD&financeForecastDays=90&financeForecastItem=${FORECAST_ITEM_ID}&financeForecastHistoryType=ITEM&financeForecastHistoryId=${FORECAST_ITEM_ID}`,
} = {}) => {
  let update: () => void = () => undefined;
  let sourceType = initialSourceType;
  let sourceId = initialSourceId;
  let enabled = true;
  const Harness = () => {
    const [, setVersion] = useState(0);
    update = () => setVersion((version) => version + 1);
    return (
      <FinanceForecastHistory
        sourceType={sourceType}
        sourceId={sourceId}
        enabled={enabled}
      />
    );
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
    disable: () =>
      act(() => {
        enabled = false;
        update();
      }),
    changeSource: (nextType: HistorySourceType, nextId: string) =>
      act(() => {
        sourceType = nextType;
        sourceId = nextId;
        update();
      }),
  };
};

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  mockHistory = financeForecastHistoryFixture();
  mockHistory.events[0] = { ...mockHistory.events[0], reason: HISTORY_REASON };
  mockQueryError = undefined;
  mockLoading = false;
  mockReady = true;
  mockCanReadFinance = true;
  mockIdentity = {
    workspaceId: 'workspace',
    memberId: FORECAST_OWNER_ID,
    userWorkspaceId: 'membership',
  };
  mockRefetch.mockReset().mockResolvedValue({});
  mockUseQuery.mockReset().mockImplementation(() => ({
    data: mockHistory
      ? { deliveryFinanceForecastHistory: mockHistory }
      : undefined,
    error: mockQueryError,
    loading: mockLoading,
    refetch: mockRefetch,
  }));
});

it('preserves earlier signed cash, closing date, time zone, evidence and attribution after a later anchor review', () => {
  const original = {
    ...financeForecastHistoryFixture().events[0],
    sourceType: 'ANCHOR',
    sourceId: FORECAST_ANCHOR_ID,
    action: 'FINANCE_FORECAST_ANCHOR_REVIEWED',
    revision: 1,
    title: null,
    amountMicros: '-25000001',
    date: '2026-10-26',
    timezone: 'Asia/Makassar',
    evidenceUrl: 'https://example.invalid/earlier-cash-evidence',
    actorName: 'Earlier finance operator',
    ownerName: null,
    reason: 'Confirmed original closing balance.',
    note: 'Original counted cash includes the recorded overdraft.',
    beforeStatus: null,
    afterStatus: null,
  };
  const later = {
    ...original,
    id: '146fa2dd-e39b-43ab-bb84-8355a1d83b82',
    revision: 2,
    amountMicros: '0',
    date: '2026-10-27',
    timezone: 'Asia/Qatar',
    evidenceUrl: 'https://example.invalid/later-cash-evidence',
    actorName: 'Amna',
    reason: 'Reviewed a later completed closing date.',
    note: 'A separate later cash count.',
  };
  mockHistory = {
    ...financeForecastHistoryFixture(),
    events: [later, original],
  };
  setup({ sourceType: 'ANCHOR', sourceId: FORECAST_ANCHOR_ID });
  const [laterEvent, originalEvent] = screen.getAllByRole('article', {
    name: 'Starting cash reviewed',
  });
  expect(
    within(originalEvent).getByText('Recorded amount: -$25.000001'),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText('Recorded date: 2026-10-26'),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText('Reporting time zone: Asia/Makassar'),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText(/Earlier finance operator/),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText(/Confirmed original closing balance/),
  ).toBeVisible();
  expect(
    within(originalEvent).getByRole('link', {
      name: 'Recorded balance evidence',
    }),
  ).toHaveAttribute('href', original.evidenceUrl);
  expect(within(laterEvent).getByText('Recorded amount: $0.00')).toBeVisible();
  expect(
    within(laterEvent).getByText('Reporting time zone: Asia/Qatar'),
  ).toBeVisible();
  expect(
    within(laterEvent).getByRole('link', { name: 'Recorded balance evidence' }),
  ).toHaveAttribute('href', later.evidenceUrl);
  expect(
    within(originalEvent).getByText(/Starting cash reviewed/),
  ).toHaveTextContent('Version 1');
  expect(
    within(laterEvent).getByText(/Starting cash reviewed/),
  ).toHaveTextContent('Version 2');
});

it('keeps reviewed expectation amounts, dates, owners and cancellation reasons as separate immutable versions', () => {
  const original = {
    ...financeForecastHistoryFixture().events[0],
    reason: HISTORY_REASON,
  };
  mockHistory = {
    ...financeForecastHistoryFixture(),
    events: [
      {
        ...original,
        id: 'b0093d08-36b6-416e-ab7f-dd0ab22cb31d',
        action: 'FINANCE_FORECAST_ITEM_CANCELLED',
        revision: 3,
        beforeStatus: 'ACTIVE',
        afterStatus: 'CANCELLED',
        actorName: 'Amna',
        reason: 'Cancel remaining expectation; keep actual payments.',
        note: 'Supplier obligation was cancelled.',
      },
      original,
    ],
  };
  setup();
  const originalEvent = screen.getByRole('article', {
    name: 'Expectation reviewed',
  });
  const cancelled = screen.getByRole('article', {
    name: 'Expectation cancelled',
  });
  expect(
    within(originalEvent).getByText('November supplier payment'),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText('Recorded amount: $1,000.00'),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText('Recorded date: 2026-11-01'),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText('Owner: Finance operator'),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText(`Reason: ${HISTORY_REASON}`),
  ).toBeVisible();
  expect(within(cancelled).getByText('Active → Cancelled')).toBeVisible();
  expect(
    within(cancelled).getByText(
      /Cancel remaining expectation; keep actual payments/,
    ),
  ).toBeVisible();
  expect(within(cancelled).getByText(/Amna/)).toBeVisible();
});

it('retains application and reversal amounts, dated attribution and explanation independently', () => {
  const applied = {
    ...financeForecastHistoryFixture().events[0],
    sourceType: 'REALIZATION',
    sourceId: FORECAST_REALIZATION_ID,
    action: 'FINANCE_FORECAST_REALIZATION_CREATED',
    revision: 1,
    amountMicros: '1',
    title: 'November supplier payment',
    date: null,
    ownerName: null,
    beforeStatus: null,
    afterStatus: 'ACTIVE',
    reason: 'Apply a recorded supplier transfer.',
    note: 'Part of the outgoing cash already recorded.',
    originSourceType: 'CASH',
    originSourceId: FORECAST_CASH_ID,
    cashId: FORECAST_CASH_ID,
    itemId: FORECAST_ITEM_ID,
    cashDate: '2026-10-27',
  };
  const reversed = {
    ...applied,
    id: 'f40c0cd1-e01a-403f-8b5c-50c20f09154b',
    action: 'FINANCE_FORECAST_REALIZATION_REVERSED',
    revision: 2,
    beforeStatus: 'ACTIVE',
    afterStatus: 'REVERSED',
    createdAt: '2026-10-29T04:00:00Z',
    actorName: 'Amna',
    reason: 'Correct the expectation link; keep the actual transfer.',
    reversedAt: '2026-10-29T03:59:59Z',
  };
  mockHistory = {
    ...financeForecastHistoryFixture(),
    events: [reversed, applied],
  };
  setup({ sourceType: 'REALIZATION', sourceId: FORECAST_REALIZATION_ID });
  const originalEvent = screen.getByRole('article', {
    name: 'Actual payment applied',
  });
  const reversalEvent = screen.getByRole('article', {
    name: 'Payment application reversed',
  });
  expect(
    within(originalEvent).getByText('Recorded amount: $0.000001'),
  ).toBeVisible();
  expect(within(originalEvent).getByText(/Finance operator/)).toHaveTextContent(
    new Date(applied.createdAt).toLocaleString(),
  );
  expect(
    within(originalEvent).getByText(/Apply a recorded supplier transfer/),
  ).toBeVisible();
  expect(
    within(reversalEvent).getByText('Recorded amount: $0.000001'),
  ).toBeVisible();
  expect(within(reversalEvent).getByText('Active → Reversed')).toBeVisible();
  expect(within(reversalEvent).getByText(/Amna/)).toHaveTextContent(
    new Date(reversed.createdAt).toLocaleString(),
  );
  expect(
    within(reversalEvent).getByText(
      /Correct the expectation link; keep the actual transfer/,
    ),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText(/Recorded payment date: 2026-10-27/),
  ).toBeVisible();
  expect(
    within(reversalEvent).getByText(/Recorded payment date: 2026-10-27/),
  ).toBeVisible();
  expect(
    within(reversalEvent).getByText(/Application reversed at:/),
  ).toHaveTextContent(new Date(reversed.reversedAt).toLocaleString());
  const actual = new URLSearchParams(
    within(reversalEvent)
      .getByRole('link', { name: 'Open recorded payment' })
      .getAttribute('href')
      ?.split('?')[1],
  );
  expect(actual.get('financeView')).toBe('payments');
  expect(actual.get('financeCash')).toBe(FORECAST_CASH_ID);
  expect(actual.get('financeCurrency')).toBe('USD');
  const expected = new URLSearchParams(
    within(reversalEvent)
      .getByRole('link', { name: 'Open expected payment' })
      .getAttribute('href')
      ?.split('?')[1],
  );
  expect(expected.get('financeView')).toBe('forecast');
  expect(expected.get('financeForecastItem')).toBe(FORECAST_ITEM_ID);
});

it('preserves reviewed plan-month terms separately from the deliberately confirmed payment amount', () => {
  const original = {
    ...financeForecastHistoryFixture().events[0],
    originSourceType: 'PLAN',
    originSourceId: FORECAST_PLAN_ID,
    planMonth: '2026-11',
    sourceRevision: 1,
    sourceAmountMicros: '1000000000',
    amountMicros: '777000001',
    reason: 'Reviewed a partial expected obligation from the original plan.',
  };
  const later = {
    ...original,
    id: 'f9140729-0792-4aa7-ad53-3dd943b20bbd',
    revision: 3,
    sourceRevision: 2,
    sourceAmountMicros: '2000000000',
    reason: 'Retain the reviewed payment amount after a source change.',
  };
  mockHistory = {
    ...financeForecastHistoryFixture(),
    events: [later, original],
  };
  setup();
  const [laterEvent, originalEvent] = screen.getAllByRole('article', {
    name: 'Expectation reviewed',
  });
  expect(
    within(originalEvent).getByText(
      'Reviewed source: Monthly cost plan · 2026-11 · Source version 1',
    ),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText('Source amount at review: $1,000.00'),
  ).toBeVisible();
  expect(
    within(originalEvent).getByText('Recorded amount: $777.000001'),
  ).toBeVisible();
  expect(
    within(laterEvent).getByText(
      'Reviewed source: Monthly cost plan · 2026-11 · Source version 2',
    ),
  ).toBeVisible();
  expect(
    within(laterEvent).getByText('Source amount at review: $2,000.00'),
  ).toBeVisible();
  expect(
    within(laterEvent).getByText('Recorded amount: $777.000001'),
  ).toBeVisible();
  const source = new URLSearchParams(
    within(originalEvent)
      .getByRole('link', { name: 'Open original cost plan' })
      .getAttribute('href')
      ?.split('?')[1],
  );
  expect(source.get('financeView')).toBe('plans');
  expect(source.get('financePlan')).toBe(FORECAST_PLAN_ID);
  expect(source.get('financeMonth')).toBe('2026-11');
  expect(source.get('financeCurrency')).toBe('USD');
});

it('links an invoice history to the exact original invoice and leaves absent legacy payment dates unknown', () => {
  mockHistory = {
    ...financeForecastHistoryFixture(),
    events: [
      {
        ...financeForecastHistoryFixture().events[0],
        originSourceType: 'RECEIVABLE',
        originSourceId: FORECAST_INVOICE_ID,
        sourceRevision: 4,
        sourceAmountMicros: '1200000000',
      },
    ],
  };
  const page = setup();
  expect(
    screen.getByText('Reviewed source: Invoice · Source version 4'),
  ).toBeVisible();
  const invoice = new URLSearchParams(
    screen
      .getByRole('link', { name: 'Open original invoice' })
      .getAttribute('href')
      ?.split('?')[1],
  );
  expect(invoice.get('financeView')).toBe('payments');
  expect(invoice.get('financeReceivable')).toBe(FORECAST_INVOICE_ID);
  mockHistory = {
    ...financeForecastHistoryFixture(),
    events: [
      {
        ...financeForecastHistoryFixture().events[0],
        sourceType: 'REALIZATION',
        sourceId: FORECAST_REALIZATION_ID,
        cashId: FORECAST_CASH_ID,
        cashDate: null,
        itemId: FORECAST_ITEM_ID,
      },
    ],
  };
  page.changeSource('REALIZATION', FORECAST_REALIZATION_ID);
  expect(
    screen.getByText(/Recorded payment date: Not recorded in this event/),
  ).toBeVisible();
  expect(
    screen.queryByText('Recorded payment date: 2026-11-01'),
  ).not.toBeInTheDocument();
});

it('does not turn unsupported evidence protocols into clickable history links', () => {
  mockHistory = {
    ...financeForecastHistoryFixture(),
    events: [
      {
        ...financeForecastHistoryFixture().events[0],
        // oxlint-disable-next-line no-script-url -- Stored evidence can contain unsafe URLs.
        evidenceUrl: 'javascript:alert(1)',
      },
    ],
  };
  setup();
  expect(
    screen.queryByRole('link', { name: 'Recorded balance evidence' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('article', { name: 'Expectation reviewed' }),
  ).toBeVisible();
});

it('pages bounded history without losing currency, horizon, selected item or exact source context', async () => {
  mockHistory = {
    ...financeForecastHistoryFixture(),
    nextBeforeId: FORECAST_EVENT_ID,
  };
  const page = setup();
  expect(screen.getAllByRole('article')).toHaveLength(1);
  await userEvent.click(
    screen.getByRole('link', { name: 'Earlier forecast changes' }),
  );
  const earlier = new URLSearchParams(page.router.state.location.search);
  expect(earlier.get('financeForecastHistoryBefore')).toBe(FORECAST_EVENT_ID);
  expect(earlier.get('financeCurrency')).toBe('USD');
  expect(earlier.get('financeForecastDays')).toBe('90');
  expect(earlier.get('financeForecastItem')).toBe(FORECAST_ITEM_ID);
  expect(earlier.get('financeForecastHistoryId')).toBe(FORECAST_ITEM_ID);
  expect(earlier.get('financeForecastHistoryType')).toBe('ITEM');
  await userEvent.click(
    screen.getByRole('link', { name: 'Latest forecast changes' }),
  );
  const latest = new URLSearchParams(page.router.state.location.search);
  expect(latest.has('financeForecastHistoryBefore')).toBe(false);
  expect(latest.get('financeForecastDays')).toBe('90');
  expect(latest.get('financeForecastItem')).toBe(FORECAST_ITEM_ID);
});

it('shows a genuine empty source history without invented events or another page', () => {
  mockHistory = { ...financeForecastHistoryFixture(), events: [] };
  setup();
  expect(
    screen.getByText('No recorded changes for this forecast source.'),
  ).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Earlier forecast changes' }),
  ).not.toBeInTheDocument();
});

it('hides cached historic amounts after failure and keeps refresh enabled through failed retry and recovery', async () => {
  const page = setup();
  expect(screen.getByText(`Reason: ${HISTORY_REASON}`)).toBeVisible();
  mockQueryError = new Error('Offline');
  page.refresh();
  expect(
    screen.queryByText(`Reason: ${HISTORY_REASON}`),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Forecast history could not be checked. Saved details are hidden.',
  );
  const retry = screen.getByRole('button', {
    name: 'Refresh forecast history',
  });
  expect(retry).toBeEnabled();
  mockRefetch.mockRejectedValueOnce(new Error('Still offline'));
  await userEvent.click(retry);
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(retry).toBeEnabled();
  mockQueryError = undefined;
  page.refresh();
  expect(screen.getByText(`Reason: ${HISTORY_REASON}`)).toBeVisible();
});

it.each([
  'unverified access',
  'read revocation',
  'workspace change',
  'member change',
  'membership change',
])('hides cached private history after %s', (change) => {
  const page = setup();
  expect(screen.getByText(`Reason: ${HISTORY_REASON}`)).toBeVisible();
  if (change === 'unverified access') mockReady = false;
  if (change === 'read revocation') mockCanReadFinance = false;
  if (change === 'workspace change')
    mockIdentity = { ...mockIdentity, workspaceId: 'other-workspace' };
  if (change === 'member change')
    mockIdentity = { ...mockIdentity, memberId: 'other-member' };
  if (change === 'membership change')
    mockIdentity = { ...mockIdentity, userWorkspaceId: 'other-membership' };
  page.refresh();
  expect(
    screen.queryByText(`Reason: ${HISTORY_REASON}`),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Earlier forecast changes' }),
  ).not.toBeInTheDocument();
});

it('hides a response with mixed source identities instead of displaying any of its private entries', () => {
  const original = financeForecastHistoryFixture();
  mockHistory = {
    ...original,
    events: [
      ...original.events,
      {
        ...original.events[0],
        id: '245bdb53-8464-432f-aed3-a84350b402d9',
        sourceId: FORECAST_REALIZATION_ID,
        title: 'Unrelated private expectation',
      },
    ],
  };
  setup();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.queryByText('Unrelated private expectation'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('November supplier payment'),
  ).not.toBeInTheDocument();
});

it('hides prior source history while another item or source kind is being requested', () => {
  const page = setup();
  page.changeSource('ANCHOR', FORECAST_ANCHOR_ID);
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.queryByText(`Reason: ${HISTORY_REASON}`),
  ).not.toBeInTheDocument();
});

it('keeps unknown/loading history private and refresh disabled only while the request is loading', () => {
  mockHistory = undefined;
  const page = setup();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Refresh forecast history' }),
  ).toBeEnabled();
  mockHistory = financeForecastHistoryFixture();
  mockLoading = true;
  page.refresh();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Refresh forecast history' }),
  ).toBeDisabled();
});

it('removes financial history when its parent disables the view', () => {
  const page = setup();
  page.disable();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.queryByText(`Reason: ${HISTORY_REASON}`),
  ).not.toBeInTheDocument();
});

import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { FinanceExportHistory } from '@/delivery/finance/export/FinanceExportHistory';
import { type FinanceExportHistory as FinanceExportHistorySnapshot } from '@/delivery/finance/export/finance-export.types';
import {
  EXPORT_BATCH_ID,
  EXPORT_PROFILE_ID,
  financeExportProfileFixture,
} from '@/delivery/finance/export/__tests__/finance-export.fixtures';

type ExportHistorySourceType = 'PROFILE' | 'BATCH';
const EVENT_ID = '3100aa11-31e2-4114-ae83-304917f18745';
const OTHER_EVENT_ID = '0266f11a-6915-4592-b286-8f04016b2707';
const HISTORY_REASON =
  'Reviewed the accountant handoff before external import.';
const CHECKSUM = 'c'.repeat(64);
const mockRefetch = jest.fn();
const mockUseQuery = jest.fn();
let mockHistory: FinanceExportHistorySnapshot | undefined;
let mockQueryError: Error | undefined;
let mockLoading = false;
let mockReady = true;
let mockCanReadFinance = true;
let mockIdentity = {
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
};

jest.mock('@apollo/client/react', () => ({
  useQuery: (...input: unknown[]) => mockUseQuery(...input),
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockReady,
    canReadFinance: mockCanReadFinance,
    canManageFinance: false,
    scope: `${mockIdentity.workspaceId}:${mockIdentity.memberId}:${mockIdentity.userWorkspaceId}`,
    matches: (value: FinanceExportHistorySnapshot | undefined) =>
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
jest.mock('@/delivery/finance/export/financeExportStyles', () => ({
  StyledExportRow: 'article',
}));

const historyFixture = (): FinanceExportHistorySnapshot => ({
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
  events: [
    {
      id: EVENT_ID,
      sourceType: 'BATCH',
      sourceId: EXPORT_BATCH_ID,
      action: 'FINANCE_EXPORT_BATCH_CREATED',
      revision: 1,
      actorId: 'finance-reader',
      actorName: 'Finance reader',
      createdAt: '2026-10-28T10:00:00Z',
      reason: HISTORY_REASON,
      importStatus: 'NOT_CONFIRMED',
      reference: null,
      evidenceUrl: null,
      checksum: CHECKSUM,
      profile: null,
    },
  ],
  nextBeforeId: null,
});

const setup = ({
  sourceType: initialSourceType = 'BATCH' as ExportHistorySourceType,
  sourceId: initialSourceId = EXPORT_BATCH_ID,
  initialRoute = `/delivery?view=finance&financeView=exports&financeCurrency=USD&financeExportSection=history&financeExportProfile=${EXPORT_PROFILE_ID}&financeExportBatch=${EXPORT_BATCH_ID}`,
} = {}) => {
  let update: () => void = () => undefined;
  let sourceType = initialSourceType;
  let sourceId = initialSourceId;
  let enabled = true;
  const Harness = () => {
    const [, setVersion] = useState(0);
    update = () => setVersion((version) => version + 1);
    return (
      <FinanceExportHistory
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
    changeSource: (nextType: ExportHistorySourceType, nextId: string) =>
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
  mockHistory = historyFixture();
  mockQueryError = undefined;
  mockLoading = false;
  mockReady = true;
  mockCanReadFinance = true;
  mockIdentity = {
    workspaceId: 'workspace',
    memberId: 'member',
    userWorkspaceId: 'membership',
  };
  mockRefetch.mockReset().mockResolvedValue({});
  mockUseQuery.mockReset().mockImplementation(() => ({
    data: mockHistory
      ? { deliveryFinanceExportHistory: mockHistory }
      : undefined,
    error: mockQueryError,
    loading: mockLoading,
    refetch: mockRefetch,
  }));
});

it('lets a finance reader inspect an attributed batch creation without claiming an import', async () => {
  setup();
  expect(
    screen.getByRole('region', { name: 'Accounting export history' }),
  ).toBeVisible();
  const event = screen.getByRole('article', {
    name: 'Immutable batch created',
  });
  expect(within(event).getByText(/Immutable batch created/)).toHaveTextContent(
    'Version 1',
  );
  expect(within(event).getByText(/Finance reader/)).toBeVisible();
  expect(within(event).getByText(`Reason: ${HISTORY_REASON}`)).toBeVisible();
  expect(
    within(event).getByText(
      'Import status at this change: Import not confirmed',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Record manual import' }),
  ).not.toBeInTheDocument();
  await userEvent.click(within(event).getByText('Recorded file identity'));
  expect(within(event).getByText(`SHA-256: ${CHECKSUM}`)).toBeVisible();
  expect(mockUseQuery).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      fetchPolicy: 'no-cache',
      skip: false,
      variables: {
        input: {
          sourceType: 'BATCH',
          sourceId: EXPORT_BATCH_ID,
          beforeId: null,
        },
        identity: 'workspace:member:membership',
      },
    }),
  );
});

it('keeps original profile columns, mappings and precision separate from a later version', async () => {
  const originalProfile = {
    ...financeExportProfileFixture(),
    name: 'Original reviewed template',
    precision: 6,
    columns: [
      { header: 'Original receipt', field: 'SOURCE_REFERENCE', constant: null },
    ],
    mappings: [
      {
        target: 'ACCOUNT',
        scope: 'DEFAULT',
        key: null,
        value: '4100-original',
      },
    ],
  };
  const laterProfile = {
    ...originalProfile,
    revision: 2,
    name: 'Later reviewed template',
    precision: 2,
    columns: [{ header: 'Later amount', field: 'AMOUNT', constant: null }],
    mappings: [
      { target: 'ACCOUNT', scope: 'DEFAULT', key: null, value: '4200-later' },
    ],
  };
  const original = {
    ...historyFixture().events[0],
    sourceType: 'PROFILE',
    sourceId: EXPORT_PROFILE_ID,
    action: 'FINANCE_EXPORT_PROFILE_SAVED',
    profile: originalProfile,
    actorName: 'Earlier finance operator',
    importStatus: null,
    checksum: null,
    reason: 'Approved the original accountant template.',
  };
  mockHistory = {
    ...historyFixture(),
    events: [
      {
        ...original,
        id: OTHER_EVENT_ID,
        revision: 2,
        profile: laterProfile,
        actorName: 'Amna',
        reason: 'Reviewed a later accountant template.',
      },
      original,
    ],
  };
  setup({ sourceType: 'PROFILE', sourceId: EXPORT_PROFILE_ID });
  const [laterEvent, originalEvent] = screen.getAllByRole('article', {
    name: 'Export profile saved',
  });
  await userEvent.click(
    within(originalEvent).getByText('Profile configuration · version 1'),
  );
  await userEvent.click(
    within(laterEvent).getByText('Profile configuration · version 2'),
  );
  expect(
    within(originalEvent).getByText(/Original reviewed template/),
  ).toBeVisible();
  expect(within(originalEvent).getByText(/Original receipt/)).toBeVisible();
  expect(within(originalEvent).getByText(/4100-original/)).toBeVisible();
  expect(within(originalEvent).getByText(/Decimal places: 6/)).toBeVisible();
  expect(
    within(originalEvent).getByText(/Earlier finance operator/),
  ).toBeVisible();
  expect(
    within(originalEvent).queryByText(/4200-later/),
  ).not.toBeInTheDocument();
  expect(within(laterEvent).getByText(/Later reviewed template/)).toBeVisible();
  expect(within(laterEvent).getByText(/Later amount/)).toBeVisible();
  expect(within(laterEvent).getByText(/4200-later/)).toBeVisible();
});

it('shows manual import confirmation and its reasoned reversal as separate historical events', () => {
  const original = historyFixture().events[0];
  mockHistory = {
    ...historyFixture(),
    events: [
      {
        ...original,
        id: OTHER_EVENT_ID,
        action: 'FINANCE_EXPORT_IMPORT_REVERSED',
        revision: 3,
        actorName: 'Founder',
        importStatus: 'REVERSED',
        reference: 'accountant-import-42',
        reason: 'The accountant corrected an earlier confirmation.',
      },
      {
        ...original,
        id: '2573f1a4-3f24-4ab6-b88f-921a00e6a354',
        action: 'FINANCE_EXPORT_IMPORT_CONFIRMED',
        revision: 2,
        actorName: 'Amna',
        importStatus: 'CONFIRMED',
        reference: 'accountant-import-42',
        evidenceUrl: 'https://example.invalid/import-evidence',
        reason: 'The accountant confirmed the manual import.',
      },
      original,
    ],
  };
  setup();
  const confirmed = screen.getByRole('article', {
    name: 'Manual import recorded',
  });
  const reversed = screen.getByRole('article', {
    name: 'Manual import confirmation reversed',
  });
  expect(
    within(confirmed).getByText(
      'Import status at this change: Manually marked imported',
    ),
  ).toBeVisible();
  expect(
    within(confirmed).getByText(
      'External import reference: accountant-import-42',
    ),
  ).toBeVisible();
  expect(within(confirmed).getByText(/Amna/)).toBeVisible();
  expect(
    within(confirmed).getByRole('link', { name: 'Recorded import evidence' }),
  ).toHaveAttribute('href', 'https://example.invalid/import-evidence');
  expect(
    within(reversed).getByText(
      'Import status at this change: Import confirmation reversed',
    ),
  ).toBeVisible();
  expect(
    within(reversed).getByText(
      /The accountant corrected an earlier confirmation/,
    ),
  ).toBeVisible();
  expect(within(reversed).getByText(/Founder/)).toBeVisible();
  expect(
    within(reversed).queryByText(
      'Import status at this change: Manually marked imported',
    ),
  ).not.toBeInTheDocument();
});

it('reports missing historic configuration without replacing it with a current profile', () => {
  mockHistory = {
    ...historyFixture(),
    events: [
      {
        ...historyFixture().events[0],
        sourceType: 'PROFILE',
        sourceId: EXPORT_PROFILE_ID,
        action: 'UNRECOGNIZED_PROFILE_EVENT',
        actorName: '',
        profile: null,
        importStatus: null,
      },
    ],
  };
  setup({ sourceType: 'PROFILE', sourceId: EXPORT_PROFILE_ID });
  expect(
    screen.getByRole('article', { name: 'Accounting export updated' }),
  ).toBeVisible();
  expect(screen.getByText(/Former finance operator/)).toBeVisible();
  expect(
    screen.getByText(
      'The original profile configuration is unavailable for this event.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByText(/Profile configuration · version/),
  ).not.toBeInTheDocument();
});

it.each([
  // oxlint-disable-next-line no-script-url -- Historic evidence may contain unsupported protocols.
  'javascript:alert(1)',
  'data:text/html,unsafe',
  'file:///tmp/private-evidence',
  'https://',
])('keeps unsupported evidence non-clickable: %s', (evidenceUrl) => {
  mockHistory = {
    ...historyFixture(),
    events: [{ ...historyFixture().events[0], evidenceUrl }],
  };
  setup();
  expect(
    screen.getByRole('article', { name: 'Immutable batch created' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'Recorded import evidence' }),
  ).not.toBeInTheDocument();
});

it('pages bounded history without losing its selected profile, batch, currency or section', async () => {
  mockHistory = { ...historyFixture(), nextBeforeId: EVENT_ID };
  const page = setup();
  expect(screen.getAllByRole('article')).toHaveLength(1);
  await userEvent.click(
    screen.getByRole('link', { name: 'Earlier export changes' }),
  );
  const earlier = new URLSearchParams(page.router.state.location.search);
  expect(earlier.get('financeExportHistoryBefore')).toBe(EVENT_ID);
  expect(earlier.get('financeExportProfile')).toBe(EXPORT_PROFILE_ID);
  expect(earlier.get('financeExportBatch')).toBe(EXPORT_BATCH_ID);
  expect(earlier.get('financeCurrency')).toBe('USD');
  expect(earlier.get('financeExportSection')).toBe('history');
  await userEvent.click(
    screen.getByRole('link', { name: 'Latest export changes' }),
  );
  const latest = new URLSearchParams(page.router.state.location.search);
  expect(latest.has('financeExportHistoryBefore')).toBe(false);
  expect(latest.get('financeExportBatch')).toBe(EXPORT_BATCH_ID);
});

it('shows a real empty history without inventing a change or another page', () => {
  mockHistory = { ...historyFixture(), events: [] };
  setup();
  expect(
    screen.getByText('No recorded changes for this export source.'),
  ).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Earlier export changes' }),
  ).not.toBeInTheDocument();
});

it('hides retained history on failure and supports repeated retry and verified recovery', async () => {
  const page = setup();
  expect(screen.getByText(`Reason: ${HISTORY_REASON}`)).toBeVisible();
  mockQueryError = new Error('Offline');
  page.refresh();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Accounting export history could not be checked. Saved details are hidden.',
  );
  const retry = screen.getByRole('button', { name: 'Refresh export history' });
  mockRefetch.mockRejectedValueOnce(new Error('Still offline'));
  await userEvent.click(retry);
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(retry).toBeEnabled();
  mockQueryError = undefined;
  page.refresh();
  expect(screen.getByText(`Reason: ${HISTORY_REASON}`)).toBeVisible();
});

it('offers latest-history recovery after an invalid or unavailable older cursor', async () => {
  mockQueryError = new Error('Invalid history cursor');
  const page = setup({
    initialRoute: `/delivery?view=finance&financeView=exports&financeExportBatch=${EXPORT_BATCH_ID}&financeExportHistoryBefore=${EVENT_ID}`,
  });
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('link', { name: 'Latest export changes' }),
  );
  const params = new URLSearchParams(page.router.state.location.search);
  expect(params.has('financeExportHistoryBefore')).toBe(false);
  expect(params.get('financeExportBatch')).toBe(EXPORT_BATCH_ID);
});

it.each([
  'access unverified',
  'read revoked',
  'workspace changed',
  'member changed',
  'membership changed',
  'parent disabled',
])('removes private history after %s', (change) => {
  mockHistory = { ...historyFixture(), nextBeforeId: EVENT_ID };
  const page = setup();
  expect(screen.getByText(`Reason: ${HISTORY_REASON}`)).toBeVisible();
  if (change === 'access unverified') mockReady = false;
  if (change === 'read revoked') mockCanReadFinance = false;
  if (change === 'workspace changed')
    mockIdentity = { ...mockIdentity, workspaceId: 'other-workspace' };
  if (change === 'member changed')
    mockIdentity = { ...mockIdentity, memberId: 'other-member' };
  if (change === 'membership changed')
    mockIdentity = { ...mockIdentity, userWorkspaceId: 'other-membership' };
  if (change === 'parent disabled') page.disable();
  else page.refresh();
  expect(
    screen.queryByText(`Reason: ${HISTORY_REASON}`),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Earlier export changes' }),
  ).not.toBeInTheDocument();
  if (
    ['access unverified', 'read revoked', 'parent disabled'].includes(change)
  ) {
    expect(
      screen.queryByRole('button', { name: 'Refresh export history' }),
    ).not.toBeInTheDocument();
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: true }),
    );
  }
});

it('hides all entries in a mixed-source response', () => {
  mockHistory = {
    ...historyFixture(),
    events: [
      historyFixture().events[0],
      {
        ...historyFixture().events[0],
        id: OTHER_EVENT_ID,
        sourceId: EXPORT_PROFILE_ID,
        reason: 'Another private source.',
      },
    ],
  };
  setup();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.queryByText('Another private source.')).not.toBeInTheDocument();
});

it.each(['another profile identity', 'another profile version'])(
  'hides a profile snapshot with %s',
  (change) => {
    const profile = {
      ...financeExportProfileFixture(),
      ...(change === 'another profile identity'
        ? { id: EXPORT_BATCH_ID }
        : { revision: 2 }),
    };
    mockHistory = {
      ...historyFixture(),
      events: [
        {
          ...historyFixture().events[0],
          sourceType: 'PROFILE',
          sourceId: EXPORT_PROFILE_ID,
          action: 'FINANCE_EXPORT_PROFILE_SAVED',
          profile,
        },
      ],
    };
    setup({ sourceType: 'PROFILE', sourceId: EXPORT_PROFILE_ID });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Accountant cash template/),
    ).not.toBeInTheDocument();
  },
);

it('hides prior history while another source is selected or its request is loading', () => {
  const page = setup();
  page.changeSource('PROFILE', EXPORT_PROFILE_ID);
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  page.changeSource('BATCH', EXPORT_BATCH_ID);
  expect(
    screen.getByRole('article', { name: 'Immutable batch created' }),
  ).toBeVisible();
  mockLoading = true;
  page.refresh();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Refresh export history' }),
  ).toBeDisabled();
});

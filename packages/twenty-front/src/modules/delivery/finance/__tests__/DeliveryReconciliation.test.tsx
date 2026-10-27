import { useState } from 'react';
import { type DocumentNode } from 'graphql';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type DeliveryFinancePaymentsQuery } from '~/generated-metadata/graphql';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryReconciliation } from '@/delivery/finance/DeliveryReconciliation';

type Snapshot = DeliveryFinancePaymentsQuery['deliveryFinancePayments'];
type QueryInput = {
  currency: string | null;
  selectedCashId: string | null;
  selectedReceivableId: string | null;
  selectedEntryId: string | null;
};
type MutationOptions = {
  variables: {
    input: {
      id?: string;
      kind?: string;
      revision?: number;
      reason?: string;
      amountMicros?: string;
      expectedCashToken?: string;
    };
  };
};
const MEMBER_ID = 'f29c76de-0e95-4483-b9d3-d02f12e754b0';
const CASH_ID = 'f9bb41bf-64a9-4b9f-8954-95b0ec972368';
const INVOICE_ID = '8a2f3884-55e6-4b43-bac3-c2b609da1485';
const ENTRY_ID = 'f72c9570-7c90-4343-9e8c-eb8e43acdf39';
const PROJECT_ID = '69184bbe-4718-40c5-bfb5-e076e2aeb646';
const SETTLEMENT_ID = 'baf4718e-5714-4332-8969-3a631d77521b';
const MATCH_ID = '5a7fd91a-759a-42c6-916d-52326da9c4dd';
const RECORDED_ID = '861f9745-3fae-4fcd-9819-8cc5fb81f627';
let mockSnapshot: Snapshot;
let mockQueryError: Error | undefined;
let mockCanRead = true;
let mockCanManage = true;
let mockAccessReady = true;
let mockLatestInput: QueryInput;
let mockRefreshPage: () => void = () => undefined;
const mockCache = new Map<string, Snapshot>();
const mockRefetch = jest.fn();
const mockChanged = jest.fn();
const mockMutation = jest.fn();
const mockOperationName = (document: DocumentNode) => {
  const operation = document.definitions.find(
    (definition) => definition.kind === 'OperationDefinition',
  );
  return operation?.kind === 'OperationDefinition'
    ? operation.name?.value
    : undefined;
};
const mockPaymentsQuery = (input: QueryInput) => {
  mockLatestInput = input;
  const key = JSON.stringify(input);
  let data = mockCache.get(key);
  if (!data) {
    data = {
      ...mockSnapshot,
      currency: input.currency,
      selectedCash:
        mockSnapshot.selectedCash?.id === input.selectedCashId
          ? mockSnapshot.selectedCash
          : (mockSnapshot.cash.find(
              (source) => source.id === input.selectedCashId,
            ) ?? null),
      selectedReceivable:
        mockSnapshot.selectedReceivable?.id === input.selectedReceivableId
          ? mockSnapshot.selectedReceivable
          : (mockSnapshot.receivables.find(
              (source) => source.id === input.selectedReceivableId,
            ) ?? null),
      selectedEntry:
        mockSnapshot.selectedEntry?.id === input.selectedEntryId
          ? mockSnapshot.selectedEntry
          : (mockSnapshot.entries.find(
              (source) => source.id === input.selectedEntryId,
            ) ?? null),
    };
    mockCache.set(key, data);
  }
  return data;
};
jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryCard: 'section',
  StyledDeliveryButton: 'button',
}));
jest.mock('@apollo/client/react', () => ({
  useQuery: (
    _document: DocumentNode,
    options: { variables: { input: QueryInput } },
  ) => ({
    data: {
      deliveryFinancePayments: mockPaymentsQuery(options.variables.input),
    },
    error: mockQueryError,
    loading: false,
    refetch: mockRefetch,
  }),
  useMutation: (document: DocumentNode) => [
    (options: MutationOptions) =>
      mockMutation(mockOperationName(document), options),
    { loading: false },
  ],
}));
jest.mock('@/delivery/workflows/useWorkflowAccess', () => ({
  useWorkflowAccess: () => ({
    ready: mockAccessReady,
    scope: 'workspace:member',
    canReadFinance: mockCanRead,
    lastVerifiedCanReadFinance: mockAccessReady ? mockCanRead : true,
    canManageFinance: mockCanManage,
    refetch: mockRefetch,
    matches: (value: Snapshot | undefined) =>
      mockAccessReady &&
      value?.workspaceId === 'workspace' &&
      value.memberId === MEMBER_ID &&
      value.userWorkspaceId === 'user-workspace',
  }),
}));
const cashFixture = (): Snapshot['cash'][number] => ({
  id: CASH_ID,
  revision: 2,
  title: 'Selected bank receipt',
  category: 'INCOME',
  currency: 'USD',
  amountMicros: '100000000',
  date: '2026-10-25',
  dueDate: null,
  projectId: PROJECT_ID,
  projectName: 'Client Alpha',
  status: 'POSTED',
  evidenceUrl: 'https://example.com/payment',
  note: 'Selected bank payment evidence',
  sourceReviewToken: 'cash-token-2',
  sourceWarnings: [],
  settledMicros: '20000000',
  remainingSettlementMicros: '80000000',
  matchedMicros: '30000000',
  remainingMatchMicros: '70000000',
  outstandingMicros: '0',
});
const invoiceFixture = (): Snapshot['receivables'][number] => ({
  ...cashFixture(),
  id: INVOICE_ID,
  title: 'Selected October invoice',
  category: 'RECEIVABLE',
  status: 'OPEN',
  dueDate: '2026-10-31',
  sourceReviewToken: 'invoice-token-2',
  outstandingMicros: '80000000',
});
const entryFixture = (): Snapshot['entries'][number] => ({
  id: ENTRY_ID,
  revision: 3,
  title: 'Selected September revenue',
  month: '2026-09',
  kind: 'REVENUE',
  currency: 'USD',
  status: 'POSTED',
  sourceReviewToken: 'entry-token-3',
  allocations: [
    {
      projectId: PROJECT_ID,
      projectName: 'Client Alpha',
      amountMicros: '100000000',
      matchedMicros: '30000000',
      remainingMatchMicros: '70000000',
    },
  ],
});
const relationFixture = (
  kind: 'SETTLEMENT' | 'MATCH',
): Snapshot['settlements'][number] => ({
  id: kind === 'SETTLEMENT' ? SETTLEMENT_ID : MATCH_ID,
  kind,
  revision: kind === 'SETTLEMENT' ? 2 : 4,
  cashId: CASH_ID,
  cashTitle: 'Selected bank receipt',
  receivableId: kind === 'SETTLEMENT' ? INVOICE_ID : null,
  entryId: kind === 'MATCH' ? ENTRY_ID : null,
  targetTitle:
    kind === 'SETTLEMENT'
      ? 'Selected October invoice'
      : 'Selected September revenue',
  month: kind === 'MATCH' ? '2026-09' : null,
  projectId: PROJECT_ID,
  projectName: 'Client Alpha',
  currency: 'USD',
  amountMicros: '20000000',
  status: 'ACTIVE',
  legacy: false,
  canReverse: true,
  createdBy: MEMBER_ID,
  createdByName: 'Amna',
  createdAt: '2026-10-25T10:00:00Z',
  reversedBy: null,
  reversedByName: null,
  reversedAt: null,
  reversalReason: null,
});
const snapshotFixture = (): Snapshot => ({
  workspaceId: 'workspace',
  memberId: MEMBER_ID,
  userWorkspaceId: 'user-workspace',
  currency: null,
  canManage: true,
  rejectedCashCount: 0,
  cash: [cashFixture()],
  receivables: [invoiceFixture()],
  entries: [entryFixture()],
  selectedCash: null,
  selectedReceivable: null,
  selectedEntry: null,
  cashTotal: 1,
  receivableTotal: 1,
  entryTotal: 1,
  nextCashId: null,
  nextReceivableId: null,
  nextEntryId: null,
  settlements: [],
  matches: [],
  settlementTotal: 0,
  matchTotal: 0,
  nextSettlementId: null,
  nextMatchId: null,
  projects: [{ id: PROJECT_ID, name: 'Client Alpha' }],
});
const setup = (
  params = `&financeCash=${CASH_ID}&financeReceivable=${INVOICE_ID}&financeMatchEntry=${ENTRY_ID}`,
) => {
  const Page = () => {
    const [, setVersion] = useState(0);
    mockRefreshPage = () => setVersion((value) => value + 1);
    return <DeliveryReconciliation onChanged={mockChanged} />;
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Page />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    {
      initialEntries: [`/delivery?view=finance&financeView=payments${params}`],
    },
  );
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return {
    router,
    update: () => {
      mockCache.clear();
      act(mockRefreshPage);
    },
  };
};
beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockSnapshot = snapshotFixture();
  mockQueryError = undefined;
  mockCanRead = true;
  mockCanManage = true;
  mockAccessReady = true;
  mockCache.clear();
  mockChanged.mockReset().mockResolvedValue(undefined);
  mockRefetch.mockReset().mockImplementation(async () => {
    mockCache.clear();
    mockRefreshPage();
    return {
      data: { deliveryFinancePayments: mockPaymentsQuery(mockLatestInput) },
    };
  });
  mockMutation.mockReset().mockImplementation(async (name: string) => ({
    data: {
      [name === 'RecordDeliveryFinancePayment'
        ? 'recordDeliveryFinancePayment'
        : name === 'SettleDeliveryFinanceReceivable'
          ? 'settleDeliveryFinanceReceivable'
          : name === 'MatchDeliveryFinanceCash'
            ? 'matchDeliveryFinanceCash'
            : 'reverseDeliveryFinanceRelation']:
        name === 'RecordDeliveryFinancePayment' ? RECORDED_ID : true,
    },
  }));
});

describe('payment workspace journeys', () => {
  it.each(['EXPENSE', 'SALARY'])(
    'hands a recorded %s payment to its exact forecast source without creating a payment',
    (category) => {
      mockSnapshot.cash[0] = { ...cashFixture(), category };
      setup(`&financeCash=${CASH_ID}`);
      const destination = new URL(
        screen
          .getByRole('link', { name: 'Review this payment in cash forecast' })
          .getAttribute('href') ?? '',
        'http://localhost',
      );
      expect(destination.searchParams.get('financeView')).toBe('forecast');
      expect(destination.searchParams.get('financeForecastKind')).toBe('CASH');
      expect(destination.searchParams.get('financeForecastSource')).toBe(
        CASH_ID,
      );
      expect(destination.searchParams.get('financeCurrency')).toBe('USD');
      expect(mockMutation).not.toHaveBeenCalled();
    },
  );
  it('links an outstanding invoice to collection scheduling while incoming cash remains separate', () => {
    setup(`&financeCash=${CASH_ID}&financeReceivable=${INVOICE_ID}`);
    expect(
      screen.getByRole('link', { name: 'Schedule this invoice’s collection' }),
    ).toHaveAttribute(
      'href',
      `/delivery?view=finance&financeView=forecast&financeCurrency=USD&financeForecastKind=RECEIVABLE&financeForecastSource=${INVOICE_ID}`,
    );
    expect(
      screen.queryByRole('link', {
        name: 'Review this payment in cash forecast',
      }),
    ).not.toBeInTheDocument();
    expect(mockMutation).not.toHaveBeenCalled();
  });
  it('keeps the original voided payment and reversed history without presenting its amount as available', () => {
    mockSnapshot.cash = [
      {
        ...cashFixture(),
        status: 'VOID',
        settledMicros: '0',
        matchedMicros: '0',
        remainingSettlementMicros: '100000000',
        remainingMatchMicros: '100000000',
        sourceWarnings: ['SOURCE_VOID'],
      },
    ];
    mockSnapshot.matches = [
      {
        ...relationFixture('MATCH'),
        status: 'REVERSED',
        canReverse: false,
        reversedBy: MEMBER_ID,
        reversedByName: 'Amna',
        reversedAt: '2026-10-26T10:00:00Z',
        reversalReason: 'Cash payment voided',
      },
    ];
    mockSnapshot.matchTotal = 1;
    setup(`&financeCash=${CASH_ID}`);
    expect(screen.getByRole('heading', { name: '$100.00' })).toBeVisible();
    expect(
      screen.getByText(
        'This payment was voided. No amount is available to apply to invoices or match to monthly entries.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText('No amount is available for new links.'),
    ).toBeVisible();
    expect(screen.queryByText(/Unapplied to invoices/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Unmatched to monthly entries/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Not yet matched to monthly entries/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply payment to invoice' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Match to monthly entry' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Monthly matching history' }),
    ).toHaveTextContent('Cash payment voided');
    expect(mockMutation).not.toHaveBeenCalled();
  });
  it('preserves a hidden match draft while access is unverified and restores it after a fresh check', async () => {
    const page = setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Match to monthly entry' }),
    );
    const amount = screen.getByRole('textbox', { name: 'Amount to link' });
    await userEvent.type(amount, '50');
    mockAccessReady = false;
    mockCanRead = false;
    mockCanManage = false;
    page.update();
    expect(screen.getByLabelText('Amount to link')).toBe(amount);
    expect(amount).toHaveValue('50');
    expect(amount).not.toBeVisible();
    expect(amount).toBeDisabled();
    expect(
      screen.queryByRole('heading', { name: 'Selected bank receipt' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Retry finance access' }),
    );
    mockAccessReady = true;
    mockCanRead = true;
    mockCanManage = true;
    page.update();
    expect(screen.getByRole('textbox', { name: 'Amount to link' })).toBe(
      amount,
    );
    expect(amount).toHaveValue('50');
    expect(mockMutation).not.toHaveBeenCalled();
  });

  it('discards a match draft after verified finance-read revocation', async () => {
    const page = setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Match to monthly entry' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '50',
    );
    mockCanRead = false;
    page.update();
    expect(screen.queryByLabelText('Amount to link')).not.toBeInTheDocument();
    mockCanRead = true;
    page.update();
    expect(screen.queryByLabelText('Amount to link')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Match to monthly entry' }),
    );
    expect(screen.getByRole('textbox', { name: 'Amount to link' })).toHaveValue(
      '',
    );
    expect(mockMutation).not.toHaveBeenCalled();
  });
  it('preserves deep-linked sources outside all paged lists and never creates money on selection', async () => {
    mockSnapshot = {
      ...mockSnapshot,
      cash: [],
      receivables: [],
      entries: [],
      selectedCash: cashFixture(),
      selectedReceivable: invoiceFixture(),
      selectedEntry: entryFixture(),
    };
    setup();
    expect(
      screen.getByRole('heading', { name: 'Selected bank receipt' }),
    ).toBeVisible();
    const entryLink = screen.getByRole('link', {
      name: 'Open recognized entry',
    });
    expect(entryLink).toHaveAttribute(
      'href',
      expect.stringContaining(
        `financeEntry=${ENTRY_ID}&financeMonth=2026-09&financeCurrency=USD`,
      ),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Match to monthly entry' }),
    );
    expect(
      screen.getByRole('combobox', { name: 'Actual payment' }),
    ).toHaveValue(CASH_ID);
    expect(
      screen.getByRole('combobox', { name: 'Posted monthly entry' }),
    ).toHaveValue(ENTRY_ID);
    expect(
      screen.getByRole('combobox', {
        name: 'Monthly client or company allocation',
      }),
    ).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Amount to link' })).toHaveValue(
      '',
    );
    expect(mockMutation).not.toHaveBeenCalled();
  });
  it('records an explicitly entered payment and offers its source link without settling an invoice', async () => {
    const { router } = setup(`&financeReceivable=${INVOICE_ID}`);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Record a payment for this invoice' }),
    );
    expect(screen.getByRole('textbox', { name: 'Payment title' })).toHaveValue(
      'Selected October invoice',
    );
    expect(
      screen.getByRole('textbox', { name: 'Actual payment amount' }),
    ).toHaveValue('');
    await user.type(
      screen.getByRole('textbox', { name: 'Actual payment amount' }),
      '12.34',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Payment notes' }),
      'Actual bank transfer',
    );
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    const link = await screen.findByRole('link', {
      name: 'Open recorded payment',
    });
    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(mockMutation.mock.calls[0][0]).toBe('RecordDeliveryFinancePayment');
    expect(mockMutation.mock.calls[0][1].variables.input.amountMicros).toBe(
      '12340000',
    );
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining(`financeCash=${RECORDED_ID}`),
    );
    await user.click(link);
    expect(router.state.location.search).toContain(
      `financeReceivable=${INVOICE_ID}`,
    );
    expect(mockMutation).toHaveBeenCalledTimes(1);
  });
  it('shows financial sources to readers without offering writes', () => {
    mockCanManage = false;
    setup();
    expect(
      screen.getByRole('heading', { name: 'Selected bank receipt' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Record money already moved' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply payment to invoice' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Match to monthly entry' }),
    ).not.toBeInTheDocument();
    expect(mockMutation).not.toHaveBeenCalled();
  });
  it('retains a disabled payment draft and available Cancel through edit access loss', async () => {
    const view = setup('');
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Record money already moved' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Payment title' }),
      'Actual October bank receipt',
    );
    mockCanManage = false;
    view.update();
    expect(screen.getByRole('textbox', { name: 'Payment title' })).toHaveValue(
      'Actual October bank receipt',
    );
    expect(
      screen.getByRole('textbox', { name: 'Payment title' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    mockCanManage = true;
    view.update();
    expect(screen.getByRole('textbox', { name: 'Payment title' })).toHaveValue(
      'Actual October bank receipt',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Actual payment amount' }),
      '15',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Payment notes' }),
      'Bank transfer',
    );
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    await screen.findByRole('link', { name: 'Open recorded payment' });
    expect(mockMutation).toHaveBeenCalledTimes(1);
  });
  it('hides unverifiable saved figures and retains a recoverable draft after a query failure', async () => {
    const view = setup();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Record money already moved' }),
    );
    await user.clear(screen.getByRole('textbox', { name: 'Payment title' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Payment title' }),
      'Retained receipt draft',
    );
    mockQueryError = new Error('Network unavailable');
    view.update();
    expect(screen.getByLabelText('Payment title')).toHaveValue(
      'Retained receipt draft',
    );
    expect(screen.getByLabelText('Payment title')).not.toBeVisible();
    expect(screen.getByLabelText('Payment title')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Discard payment draft' }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: 'Discard payment draft' }),
    );
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Payment title')).toHaveValue(
      'Retained receipt draft',
    );
    expect(
      screen.queryByRole('heading', { name: 'Selected bank receipt' }),
    ).not.toBeInTheDocument();
    expect(mockMutation).not.toHaveBeenCalled();
    mockQueryError = undefined;
    view.update();
    expect(screen.getByRole('textbox', { name: 'Payment title' })).toHaveValue(
      'Retained receipt draft',
    );
    expect(
      screen.getByRole('textbox', { name: 'Payment title' }),
    ).toBeEnabled();
    await user.type(
      screen.getByRole('textbox', { name: 'Actual payment amount' }),
      '15',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Payment notes' }),
      'Bank transfer',
    );
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    await screen.findByRole('link', { name: 'Open recorded payment' });
    expect(mockMutation).toHaveBeenCalledTimes(1);
  });
  it('requires guarded rereview after a balance-token change before an invoice link can be saved', async () => {
    const view = setup();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Apply payment to invoice' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '12.34',
    );
    mockSnapshot.cash = [
      {
        ...cashFixture(),
        sourceReviewToken: 'cash-token-3',
        remainingSettlementMicros: '10000000',
      },
    ];
    view.update();
    expect(screen.getByRole('textbox', { name: 'Amount to link' })).toHaveValue(
      '12.34',
    );
    expect(
      screen.getByRole('button', { name: 'Apply to invoice' }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Reload latest version' }),
    );
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(mockRefetch).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Reload latest version' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Amount to link' }),
      ).toHaveValue(''),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '5',
    );
    await user.click(screen.getByRole('button', { name: 'Apply to invoice' }));
    await waitFor(() => expect(mockMutation).toHaveBeenCalledTimes(1));
    expect(mockMutation.mock.calls[0][0]).toBe(
      'SettleDeliveryFinanceReceivable',
    );
    expect(
      mockMutation.mock.calls[0][1].variables.input.expectedCashToken,
    ).toBe('cash-token-3');
    expect(mockMutation.mock.calls[0][1].variables.input.amountMicros).toBe(
      '5000000',
    );
  });
  it.each(['SETTLEMENT', 'MATCH'] as const)(
    'reverses the selected %s relation with its own revision and explicit reason',
    async (kind) => {
      const relation = relationFixture(kind);
      if (kind === 'SETTLEMENT') {
        mockSnapshot.settlements = [relation];
        mockSnapshot.settlementTotal = 1;
      } else {
        mockSnapshot.matches = [relation];
        mockSnapshot.matchTotal = 1;
      }
      setup();
      const user = userEvent.setup();
      const history = screen.getByRole('region', {
        name:
          kind === 'SETTLEMENT'
            ? 'Invoice payment history'
            : 'Monthly matching history',
      });
      await user.click(within(history).getByText('Reverse this link'));
      await user.type(
        within(history).getByRole('textbox', {
          name: 'Reason for reversing this link',
        }),
        'Linked to wrong source',
      );
      await user.click(
        within(history).getByRole('button', {
          name: 'Reverse link and retain history',
        }),
      );
      await waitFor(() =>
        expect(mockMutation).toHaveBeenCalledWith(
          'ReverseDeliveryFinanceRelation',
          {
            variables: {
              input: {
                id: relation.id,
                kind,
                revision: relation.revision,
                reason: 'Linked to wrong source',
              },
            },
          },
        ),
      );
      expect(mockMutation).toHaveBeenCalledTimes(1);
    },
  );
  it('retains a reversal reason when edit access is revoked and keeps guarded discard available', async () => {
    mockSnapshot.settlements = [relationFixture('SETTLEMENT')];
    mockSnapshot.settlementTotal = 1;
    const view = setup();
    const user = userEvent.setup();
    const history = screen.getByRole('region', {
      name: 'Invoice payment history',
    });
    await user.click(within(history).getByText('Reverse this link'));
    await user.type(
      within(history).getByRole('textbox', {
        name: 'Reason for reversing this link',
      }),
      'Keep this correction reason',
    );
    mockCanManage = false;
    view.update();
    expect(
      within(history).getByRole('textbox', {
        name: 'Reason for reversing this link',
      }),
    ).toHaveValue('Keep this correction reason');
    expect(
      within(history).getByRole('textbox', {
        name: 'Reason for reversing this link',
      }),
    ).toBeDisabled();
    expect(
      within(history).getByRole('button', {
        name: 'Reverse link and retain history',
      }),
    ).toBeDisabled();
    expect(
      within(history).getByRole('button', { name: 'Discard reversal draft' }),
    ).toBeEnabled();
    await user.click(
      within(history).getByRole('button', { name: 'Discard reversal draft' }),
    );
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(
      within(history).getByRole('textbox', {
        name: 'Reason for reversing this link',
      }),
    ).toHaveValue('Keep this correction reason');
    mockCanManage = true;
    view.update();
    await user.click(
      within(history).getByRole('button', {
        name: 'Reverse link and retain history',
      }),
    );
    await waitFor(() => expect(mockMutation).toHaveBeenCalledTimes(1));
    expect(mockMutation.mock.calls[0][1].variables.input.reason).toBe(
      'Keep this correction reason',
    );
  });
  it('keeps a hidden reversal draft recoverable through an outage and allows guarded discard', async () => {
    mockSnapshot.matches = [relationFixture('MATCH')];
    mockSnapshot.matchTotal = 1;
    const view = setup();
    const user = userEvent.setup();
    const history = screen.getByRole('region', {
      name: 'Monthly matching history',
    });
    await user.click(within(history).getByText('Reverse this link'));
    await user.type(
      within(history).getByRole('textbox', {
        name: 'Reason for reversing this link',
      }),
      'Retained during outage',
    );
    mockQueryError = new Error('Cannot verify sources');
    view.update();
    expect(screen.getByLabelText('Reason for reversing this link')).toHaveValue(
      'Retained during outage',
    );
    expect(
      screen.getByLabelText('Reason for reversing this link'),
    ).not.toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Discard reversal drafts' }),
    );
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Reason for reversing this link')).toHaveValue(
      'Retained during outage',
    );
    await user.click(
      screen.getByRole('button', { name: 'Discard reversal drafts' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    mockQueryError = undefined;
    view.update();
    const restoredHistory = screen.getByRole('region', {
      name: 'Monthly matching history',
    });
    await user.click(within(restoredHistory).getByText('Reverse this link'));
    expect(
      within(restoredHistory).getByRole('textbox', {
        name: 'Reason for reversing this link',
      }),
    ).toHaveValue('');
    expect(mockMutation).not.toHaveBeenCalled();
  });
  it('locks a reversal when another reviewer changes the relation revision', async () => {
    mockSnapshot.matches = [relationFixture('MATCH')];
    mockSnapshot.matchTotal = 1;
    const view = setup();
    const user = userEvent.setup();
    const history = screen.getByRole('region', {
      name: 'Monthly matching history',
    });
    await user.click(within(history).getByText('Reverse this link'));
    await user.type(
      within(history).getByRole('textbox', {
        name: 'Reason for reversing this link',
      }),
      'Old reviewed reason',
    );
    mockSnapshot.matches = [{ ...relationFixture('MATCH'), revision: 5 }];
    view.update();
    expect(
      within(history).getByRole('textbox', {
        name: 'Reason for reversing this link',
      }),
    ).toHaveValue('Old reviewed reason');
    expect(
      within(history).getByRole('button', {
        name: 'Reverse link and retain history',
      }),
    ).toBeDisabled();
    await user.click(
      within(history).getByRole('button', { name: 'Reload latest version' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    await user.type(
      within(history).getByRole('textbox', {
        name: 'Reason for reversing this link',
      }),
      'Reviewed current relation',
    );
    await user.click(
      within(history).getByRole('button', {
        name: 'Reverse link and retain history',
      }),
    );
    await waitFor(() => expect(mockMutation).toHaveBeenCalledTimes(1));
    expect(mockMutation.mock.calls[0][1].variables.input.revision).toBe(5);
  });
  it('does not offer reversal of a preserved legacy relation', () => {
    mockSnapshot.settlements = [
      { ...relationFixture('SETTLEMENT'), legacy: true, canReverse: false },
    ];
    mockSnapshot.settlementTotal = 1;
    setup();
    expect(
      screen.getByText(
        /This preserved link came from the earlier full-payment workflow/,
      ),
    ).toBeVisible();
    expect(screen.queryByText('Reverse this link')).not.toBeInTheDocument();
    expect(mockMutation).not.toHaveBeenCalled();
  });
  it('removes financial data when read access is revoked', () => {
    const view = setup();
    mockCanRead = false;
    view.update();
    expect(
      screen.getByText(
        'Finance access is required to inspect payments and matching.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Selected bank receipt' }),
    ).not.toBeInTheDocument();
    expect(mockMutation).not.toHaveBeenCalled();
  });
});

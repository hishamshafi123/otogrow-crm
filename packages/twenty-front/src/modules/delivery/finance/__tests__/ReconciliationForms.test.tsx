import { type ComponentProps, type ReactElement, useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { ReconciliationPaymentForm } from '@/delivery/finance/ReconciliationPaymentForm';
import { ReconciliationAllocationForm } from '@/delivery/finance/ReconciliationAllocationForm';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryRow: 'div',
  StyledDeliveryButton: 'button',
}));
type PaymentProps = ComponentProps<typeof ReconciliationPaymentForm>;
type AllocationProps = ComponentProps<typeof ReconciliationAllocationForm>;
const CASH_ID = 'b5b3af29-4e87-4ca6-8a13-4d0a2ce0c906';
const INVOICE_ID = '2ae2f02c-7371-4f37-a128-37b500f6714d';
const ENTRY_ID = '97794657-03b5-4118-b7b7-23af1419d116';
const PROJECT_ID = '64ca508a-79dd-4340-b4db-0b025268dbed';
const OTHER_PROJECT_ID = '01c2494e-e5e5-4d0b-a139-34fa370171c4';
const mockSave = jest.fn();
const mockCancel = jest.fn();
const mockReload = jest.fn();
const mockRefreshCalendar = jest.fn();
const cashFixture = (): AllocationProps['cashes'][number] => ({
  id: CASH_ID,
  revision: 2,
  title: 'Client bank receipt',
  category: 'INCOME',
  currency: 'USD',
  amountMicros: '100000000',
  date: '2026-10-25',
  dueDate: null,
  projectId: PROJECT_ID,
  projectName: 'Client Alpha',
  status: 'POSTED',
  evidenceUrl: 'https://example.com/payment',
  note: 'Bank receipt',
  sourceReviewToken: 'cash-reviewed-2',
  sourceWarnings: [],
  settledMicros: '20000000',
  remainingSettlementMicros: '80000000',
  matchedMicros: '50000000',
  remainingMatchMicros: '50000000',
  outstandingMicros: '0',
});
const invoiceFixture = (): AllocationProps['receivables'][number] => ({
  ...cashFixture(),
  id: INVOICE_ID,
  category: 'RECEIVABLE',
  title: 'October invoice',
  status: 'OPEN',
  dueDate: '2026-10-31',
  sourceReviewToken: 'invoice-reviewed-2',
  amountMicros: '150000000',
  settledMicros: '30000000',
  outstandingMicros: '120000000',
});
const entryFixture = (): AllocationProps['entries'][number] => ({
  id: ENTRY_ID,
  revision: 3,
  month: '2026-10',
  title: 'October service revenue',
  kind: 'REVENUE',
  currency: 'USD',
  status: 'POSTED',
  sourceReviewToken: 'entry-reviewed-3',
  allocations: [
    {
      projectId: PROJECT_ID,
      projectName: 'Client Alpha',
      amountMicros: '90000000',
      matchedMicros: '30000000',
      remainingMatchMicros: '60000000',
    },
    {
      projectId: null,
      projectName: null,
      amountMicros: '10000000',
      matchedMicros: '0',
      remainingMatchMicros: '10000000',
    },
  ],
});
const paymentProps = (): PaymentProps => ({
  reportingClocks: ['USD', 'AED', 'EUR', 'GBP', 'INR', 'SGD', 'AUD', 'CAD'].map(
    (currency) => ({
      currency,
      timezone: 'UTC',
      businessDate: '2020-10-27',
      confirmed: false,
    }),
  ),
  currency: 'USD',
  projects: [{ id: PROJECT_ID, name: 'Client Alpha' }],
  busy: false,
  onSave: mockSave,
  onCancel: mockCancel,
  onRefreshCalendar: mockRefreshCalendar,
});
const allocationProps = (
  kind: AllocationProps['kind'] = 'SETTLEMENT',
): AllocationProps => ({
  kind,
  cashes: [cashFixture()],
  receivables: [invoiceFixture()],
  entries: [entryFixture()],
  initialCashId: CASH_ID,
  initialReceivableId: INVOICE_ID,
  initialEntryId: ENTRY_ID,
  busy: false,
  onSave: mockSave,
  onCancel: mockCancel,
  onReload: mockReload,
});
const renderPayment = (props: PaymentProps) => (
  <ReconciliationPaymentForm
    reportingClocks={props.reportingClocks}
    currency={props.currency}
    projects={props.projects}
    invoice={props.invoice}
    busy={props.busy}
    readOnly={props.readOnly}
    onSave={props.onSave}
    onCancel={props.onCancel}
    onRefreshCalendar={props.onRefreshCalendar}
  />
);
const renderAllocation = (props: AllocationProps) => (
  <ReconciliationAllocationForm
    kind={props.kind}
    cashes={props.cashes}
    receivables={props.receivables}
    entries={props.entries}
    initialCashId={props.initialCashId}
    initialReceivableId={props.initialReceivableId}
    initialEntryId={props.initialEntryId}
    busy={props.busy}
    readOnly={props.readOnly}
    onSave={props.onSave}
    onCancel={props.onCancel}
    onReload={props.onReload}
  />
);
const setup = (content: ReactElement) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  Object.assign(globalThis, { Request });
  let replaceContent: (value: ReactElement) => void = () => undefined;
  const Harness = () => {
    const [value, setValue] = useState(content);
    replaceContent = setValue;
    return value;
  };
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <Harness />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: ['/delivery?view=finance'] },
  );
  render(<RouterProvider router={router} />);
  return { update: (value: ReactElement) => act(() => replaceContent(value)) };
};
const fillPayment = async (amount = '12.34', user = userEvent.setup()) => {
  await user.type(
    screen.getByRole('textbox', { name: 'Payment title' }),
    'Paid October invoice',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Actual payment amount' }),
    amount,
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Payment notes' }),
    'Bank transfer received',
  );
  return user;
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  mockSave.mockReset().mockResolvedValue(false);
  mockCancel.mockReset();
  mockReload.mockReset();
  mockRefreshCalendar.mockReset().mockResolvedValue(undefined);
});
afterEach(() => jest.useRealTimers());

describe('actual payment recording', () => {
  it('records exact cents on the actual date with one stable id across failed retries', async () => {
    setup(renderPayment(paymentProps()));
    const user = await fillPayment('999999999.99');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Client project' }),
      PROJECT_ID,
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Payment direction' }),
      'EXPENSE',
    );
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    await screen.findByRole('alert');
    expect(
      screen.getByRole('textbox', { name: 'Actual payment amount' }),
    ).toHaveValue('999999999.99');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave.mock.calls[0][0]).toEqual({
      id: expect.any(String),
      title: 'Paid October invoice',
      category: 'EXPENSE',
      currency: 'USD',
      amountMicros: '999999999990000',
      date: '2020-10-27',
      projectId: PROJECT_ID,
      note: 'Bank transfer received',
      evidenceUrl: null,
    });
    expect(mockSave.mock.calls[1][0].id).toBe(mockSave.mock.calls[0][0].id);
  });
  it.each(['0', '-1', '1.001', '1000000000.01', '1e2'])(
    'blocks invalid actual payment %s',
    async (amount) => {
      setup(renderPayment(paymentProps()));
      await fillPayment(amount);
      expect(
        screen.getByRole('button', { name: 'Record payment' }),
      ).toBeDisabled();
      expect(mockSave).not.toHaveBeenCalled();
    },
  );
  it('accepts the highest cent amount within storage range', async () => {
    setup(renderPayment(paymentProps()));
    const user = await fillPayment('1000000000');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(mockSave.mock.calls[0][0].amountMicros).toBe('1000000000000000');
  });
  it('requires evidence or a note and rejects invalid evidence URLs', async () => {
    setup(renderPayment(paymentProps()));
    const user = await fillPayment();
    await user.clear(screen.getByRole('textbox', { name: 'Payment notes' }));
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeDisabled();
    await user.type(
      screen.getByRole('textbox', { name: 'Payment evidence link' }),
      'ftp://example.com/receipt',
    );
    expect(
      screen.getByText(
        'Use a valid http or https evidence link, or leave it blank.',
      ),
    ).toBeVisible();
    await user.clear(
      screen.getByRole('textbox', { name: 'Payment evidence link' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Payment evidence link' }),
      'https://example.com/receipt',
    );
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(mockSave.mock.calls[0][0].evidenceUrl).toBe(
      'https://example.com/receipt',
    );
  });
  it('rejects an impossible actual date without replacing it with today', async () => {
    setup(renderPayment(paymentProps()));
    fireEvent.change(screen.getByLabelText('Actual payment date'), {
      target: { value: '2026-02-30' },
    });
    await fillPayment();
    expect(
      screen.getByText(
        'Choose a valid actual payment date no later than 2020-10-27 (UTC).',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeDisabled();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('rejects a future payment date instead of recording expected money as actual cash', async () => {
    setup(renderPayment(paymentProps()));
    fireEvent.change(screen.getByLabelText('Actual payment date'), {
      target: { value: '2999-01-01' },
    });
    await fillPayment();
    expect(
      screen.getByText(
        'Choose a valid actual payment date no later than 2020-10-27 (UTC).',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeDisabled();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('requires correction of an unsupported supplied currency', async () => {
    setup(renderPayment({ ...paymentProps(), currency: 'INVALID' }));
    const user = await fillPayment();
    expect(screen.getByText('Choose a supported currency.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeDisabled();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Currency' }),
      'AED',
    );
    expect(screen.getByLabelText('Actual payment date')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Actual payment date'), {
      target: { value: '2020-10-27' },
    });
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(mockSave.mock.calls[0][0].currency).toBe('AED');
  });
  it('uses invoice context without inferring a payment amount or settlement', () => {
    setup(
      renderPayment({
        ...paymentProps(),
        invoice: {
          id: INVOICE_ID,
          title: 'October invoice',
          currency: 'EUR',
          projectId: PROJECT_ID,
        },
      }),
    );
    expect(screen.getByRole('textbox', { name: 'Payment title' })).toHaveValue(
      'October invoice',
    );
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveValue(
      'EUR',
    );
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeDisabled();
    expect(
      screen.getByRole('combobox', { name: 'Client project' }),
    ).toHaveValue(PROJECT_ID);
    expect(
      screen.getByRole('textbox', { name: 'Actual payment amount' }),
    ).toHaveValue('');
    expect(
      screen.getByText(/No amount or invoice settlement is assumed/),
    ).toBeVisible();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it.each([
    ['Asia/Qatar', '2026-10-28', '2026-10-27T22:30:00Z'],
    ['America/Los_Angeles', '2026-10-27', '2026-10-28T02:00:00Z'],
  ])(
    'uses the authoritative %s day %s even when the device UTC day differs',
    async (timezone, businessDate, now) => {
      jest.useFakeTimers({ now: new Date(now) });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const props = paymentProps();
      props.reportingClocks = props.reportingClocks.map((clock) =>
        clock.currency === 'USD'
          ? { ...clock, timezone, businessDate, confirmed: true }
          : clock,
      );
      setup(renderPayment(props));
      expect(screen.getByLabelText('Actual payment date')).toHaveValue(
        businessDate,
      );
      expect(screen.getByLabelText('Actual payment date')).toHaveAttribute(
        'max',
        businessDate,
      );
      expect(
        screen.getByText(`Payment dates use ${timezone} ledger days.`),
      ).toBeVisible();
      await fillPayment('400', user);
      await user.click(screen.getByRole('button', { name: 'Record payment' }));
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          date: businessDate,
          amountMicros: '400000000',
        }),
      );
    },
  );
  it('discloses the server UTC fallback without claiming a confirmed reporting time zone', () => {
    setup(renderPayment(paymentProps()));
    expect(
      screen.getByText('Payment calendar: UTC · Business date: 2020-10-27'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'UTC is used until a reporting time zone is confirmed for this currency.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Actual payment date')).toHaveValue(
      '2020-10-27',
    );
  });
  it('revalidates a chosen date against another currency’s clock without rewriting the draft', async () => {
    const props = paymentProps();
    props.reportingClocks = props.reportingClocks.map((clock) =>
      clock.currency === 'USD'
        ? {
            ...clock,
            timezone: 'Asia/Qatar',
            businessDate: '2026-10-28',
            confirmed: true,
          }
        : clock.currency === 'EUR'
          ? {
              ...clock,
              timezone: 'America/Los_Angeles',
              businessDate: '2026-10-27',
              confirmed: true,
            }
          : clock,
    );
    setup(renderPayment(props));
    const user = await fillPayment();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Currency' }),
      'EUR',
    );
    expect(screen.getByLabelText('Actual payment date')).toHaveValue(
      '2026-10-28',
    );
    expect(screen.getByLabelText('Actual payment date')).toHaveAttribute(
      'max',
      '2026-10-27',
    );
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Choose a valid actual payment date no later than 2026-10-27 (America/Los_Angeles).',
      ),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Actual payment date'), {
      target: { value: '2026-10-27' },
    });
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeEnabled();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Currency' }),
      'USD',
    );
    expect(screen.getByLabelText('Actual payment date')).toHaveValue(
      '2026-10-27',
    );
    expect(screen.getByRole('textbox', { name: 'Payment notes' })).toHaveValue(
      'Bank transfer received',
    );
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('preserves the entered date when a refreshed clock moves the allowed day backwards', async () => {
    const props = paymentProps();
    props.reportingClocks = props.reportingClocks.map((clock) =>
      clock.currency === 'USD'
        ? {
            ...clock,
            timezone: 'Asia/Qatar',
            businessDate: '2026-10-28',
            confirmed: true,
          }
        : clock,
    );
    const page = setup(renderPayment(props));
    await fillPayment();
    const reportingClocks = props.reportingClocks.map((clock) =>
      clock.currency === 'USD'
        ? {
            ...clock,
            timezone: 'America/Los_Angeles',
            businessDate: '2026-10-27',
          }
        : clock,
    );
    page.update(renderPayment({ ...props, reportingClocks }));
    expect(screen.getByLabelText('Actual payment date')).toHaveValue(
      '2026-10-28',
    );
    expect(screen.getByLabelText('Actual payment date')).toHaveAttribute(
      'max',
      '2026-10-27',
    );
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('textbox', { name: 'Actual payment amount' }),
    ).toHaveValue('12.34');
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('blocks missing calendar metadata and retains the entered payment through failed refresh and recovery', async () => {
    const props = { ...paymentProps(), reportingClocks: [] };
    const page = setup(renderPayment(props));
    expect(screen.getByLabelText('Actual payment date')).toHaveValue('');
    const user = await fillPayment('400');
    fireEvent.change(screen.getByLabelText('Actual payment date'), {
      target: { value: '2026-10-28' },
    });
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeDisabled();
    mockRefreshCalendar.mockRejectedValueOnce(new Error('Offline'));
    await user.click(
      screen.getByRole('button', { name: 'Refresh payment calendar' }),
    );
    expect(
      screen.getByText(
        'The payment calendar could not be refreshed. Your entered date and payment draft are kept.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Actual payment date')).toHaveValue(
      '2026-10-28',
    );
    page.update(
      renderPayment({
        ...props,
        reportingClocks: [
          {
            currency: 'USD',
            timezone: 'Asia/Qatar',
            businessDate: '2026-10-28',
            confirmed: true,
          },
        ],
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Record payment' }),
    ).toBeEnabled();
    expect(screen.getByLabelText('Actual payment date')).toHaveValue(
      '2026-10-28',
    );
    expect(
      screen.getByRole('textbox', { name: 'Actual payment amount' }),
    ).toHaveValue('400');
    expect(screen.getByRole('textbox', { name: 'Payment notes' })).toHaveValue(
      'Bank transfer received',
    );
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('preserves a readable dirty draft after edit revocation and keeps guarded Cancel available', async () => {
    const props = paymentProps();
    const view = setup(renderPayment(props));
    const user = await fillPayment();
    view.update(renderPayment({ ...props, readOnly: true }));
    expect(screen.getByRole('textbox', { name: 'Payment title' })).toHaveValue(
      'Paid October invoice',
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
    expect(mockCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('explicit invoice and monthly linking', () => {
  it('links a partial invoice amount with frozen review tokens and separate cash balances', async () => {
    setup(renderAllocation(allocationProps()));
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '12.34',
    );
    expect(
      screen.getByText(/Payment available for invoices:/),
    ).toHaveTextContent('$80.00');
    expect(
      screen.getByText(/Payment available for monthly matching:/),
    ).toHaveTextContent('$50.00');
    await user.click(screen.getByRole('button', { name: 'Apply to invoice' }));
    expect(mockSave).toHaveBeenCalledWith({
      kind: 'SETTLEMENT',
      input: {
        id: expect.any(String),
        cashId: CASH_ID,
        receivableId: INVOICE_ID,
        amountMicros: '12340000',
        expectedCashToken: 'cash-reviewed-2',
        expectedReceivableToken: 'invoice-reviewed-2',
        acknowledgeUnassignedCash: false,
      },
    });
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Apply to invoice' }));
    expect(mockSave.mock.calls[1][0].input.id).toBe(
      mockSave.mock.calls[0][0].input.id,
    );
  });
  it('requires an explicit monthly bucket, preserves micro precision and creates no invoice settlement', async () => {
    setup(renderAllocation(allocationProps('MATCH')));
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '0.000001',
    );
    expect(
      screen.getByRole('button', { name: 'Save monthly match' }),
    ).toBeDisabled();
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Monthly client or company allocation',
      }),
      PROJECT_ID,
    );
    await user.click(
      screen.getByRole('button', { name: 'Save monthly match' }),
    );
    expect(mockSave).toHaveBeenCalledWith({
      kind: 'MATCH',
      input: {
        id: expect.any(String),
        cashId: CASH_ID,
        entryId: ENTRY_ID,
        projectId: PROJECT_ID,
        amountMicros: '1',
        expectedCashToken: 'cash-reviewed-2',
        expectedEntryToken: 'entry-reviewed-3',
        acknowledgeUnassignedCash: false,
      },
    });
  });
  it.each(['80.01', '0', '1.001'])(
    'rejects invoice amount %s without writing',
    async (amount) => {
      setup(renderAllocation(allocationProps()));
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Amount to link' }),
        amount,
      );
      expect(
        screen.getByRole('button', { name: 'Apply to invoice' }),
      ).toBeDisabled();
      expect(mockSave).not.toHaveBeenCalled();
    },
  );
  it('does not use invoice remainder to bypass a smaller monthly remainder', async () => {
    setup(renderAllocation(allocationProps('MATCH')));
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Monthly client or company allocation',
      }),
      PROJECT_ID,
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '50.000001',
    );
    expect(
      screen.getByText(
        'The amount exceeds this payment’s remaining monthly matching balance.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Save monthly match' }),
    ).toBeDisabled();
  });
  it('matches an actual expense only to costs and does not suggest an invoice balance', async () => {
    const props = allocationProps('MATCH');
    props.cashes = [{ ...cashFixture(), category: 'SALARY' }];
    props.entries = [{ ...entryFixture(), kind: 'COST' }];
    setup(renderAllocation(props));
    const user = userEvent.setup();
    expect(
      screen.queryByText(/Payment available for invoices:/),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Monthly client or company allocation',
      }),
      PROJECT_ID,
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '20',
    );
    await user.click(
      screen.getByRole('button', { name: 'Save monthly match' }),
    );
    expect(mockSave.mock.calls[0][0].kind).toBe('MATCH');
    expect(mockSave.mock.calls[0][0].input.amountMicros).toBe('20000000');
  });
  it('limits invoice settlement by the invoice balance even when the payment has more available', async () => {
    const props = allocationProps();
    props.receivables = [
      { ...invoiceFixture(), outstandingMicros: '10000000' },
    ];
    setup(renderAllocation(props));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '10.01',
    );
    expect(
      screen.getByText(
        'The amount exceeds this invoice’s outstanding balance.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Apply to invoice' }),
    ).toBeDisabled();
  });
  it('limits a monthly match by its chosen bucket rather than another allocation', async () => {
    const props = allocationProps('MATCH');
    props.entries[0].allocations[0].remainingMatchMicros = '1000000';
    setup(renderAllocation(props));
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Monthly client or company allocation',
      }),
      PROJECT_ID,
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '1.000001',
    );
    expect(
      screen.getByText(
        'The amount exceeds this monthly allocation’s unmatched balance.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Save monthly match' }),
    ).toBeDisabled();
  });
  it('freezes monthly source review even if only the selected target changes', async () => {
    const props = allocationProps('MATCH');
    const view = setup(renderAllocation(props));
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Monthly client or company allocation',
      }),
      PROJECT_ID,
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '1',
    );
    view.update(
      renderAllocation({
        ...props,
        entries: [{ ...entryFixture(), sourceReviewToken: 'entry-reviewed-4' }],
      }),
    );
    expect(screen.getByRole('textbox', { name: 'Amount to link' })).toHaveValue(
      '1',
    );
    expect(
      screen.getByRole('button', { name: 'Save monthly match' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reload latest version' }),
    ).toBeEnabled();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it.each([
    'LEGACY_RECEIPT_MISMATCH',
    'SOURCE_VOID',
    'SOURCE_CHANGED',
    'SOURCE_PROJECT_UNAVAILABLE',
    'FUTURE_CASH_DATE',
    'OVER_SETTLED',
    'OVER_MATCHED',
  ])('blocks linking when cash has unresolved %s', async (warning) => {
    const props = allocationProps();
    props.cashes = [{ ...cashFixture(), sourceWarnings: [warning] }];
    setup(renderAllocation(props));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '1',
    );
    expect(
      screen.getByRole('button', { name: 'Apply to invoice' }),
    ).toBeDisabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('blocks a corrupt preserved invoice receipt instead of accepting a client acknowledgement override', async () => {
    const props = allocationProps();
    props.cashes = [{ ...cashFixture(), projectId: null, projectName: null }];
    props.receivables = [
      { ...invoiceFixture(), sourceWarnings: ['LEGACY_RECEIPT_MISMATCH'] },
    ];
    setup(renderAllocation(props));
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '1',
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I confirm this unassigned payment belongs to the selected client.',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Apply to invoice' }),
    ).toBeDisabled();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('does not let an unchanged cash token override an unavailable invoice source', async () => {
    const props = allocationProps();
    props.receivables = [
      { ...invoiceFixture(), sourceWarnings: ['SOURCE_PROJECT_UNAVAILABLE'] },
    ];
    setup(renderAllocation(props));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '1',
    );
    expect(
      screen.getByRole('button', { name: 'Apply to invoice' }),
    ).toBeDisabled();
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('requires explicit acknowledgement when unassigned cash is linked to a client', async () => {
    const props = allocationProps();
    props.cashes = [
      {
        ...cashFixture(),
        projectId: null,
        projectName: null,
        sourceWarnings: ['UNASSIGNED_CASH'],
      },
    ];
    setup(renderAllocation(props));
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '20',
    );
    expect(
      screen.getByRole('button', { name: 'Apply to invoice' }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I confirm this unassigned payment belongs to the selected client.',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Apply to invoice' }));
    expect(mockSave.mock.calls[0][0].input.acknowledgeUnassignedCash).toBe(
      true,
    );
  });
  it('allows an explicit company monthly bucket without claiming a client', async () => {
    const props = allocationProps('MATCH');
    props.cashes = [{ ...cashFixture(), projectId: null, projectName: null }];
    setup(renderAllocation(props));
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Monthly client or company allocation',
      }),
      'COMPANY',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '10',
    );
    await user.click(
      screen.getByRole('button', { name: 'Save monthly match' }),
    );
    expect(mockSave.mock.calls[0][0].input.projectId).toBeNull();
    expect(mockSave.mock.calls[0][0].input.acknowledgeUnassignedCash).toBe(
      false,
    );
  });
  it.each(['currency', 'client', 'direction', 'void', 'draft'])(
    'blocks incompatible %s targets',
    async (issue) => {
      const props = allocationProps('MATCH');
      const entry = entryFixture();
      if (issue === 'currency') entry.currency = 'EUR';
      if (issue === 'client') entry.allocations[0].projectId = OTHER_PROJECT_ID;
      if (issue === 'direction') entry.kind = 'COST';
      if (issue === 'void') props.cashes[0].status = 'VOID';
      if (issue === 'draft') entry.status = 'DRAFT';
      props.entries = [entry];
      setup(renderAllocation(props));
      const user = userEvent.setup();
      await user.selectOptions(
        screen.getByRole('combobox', {
          name: 'Monthly client or company allocation',
        }),
        issue === 'client' ? OTHER_PROJECT_ID : PROJECT_ID,
      );
      await user.type(
        screen.getByRole('textbox', { name: 'Amount to link' }),
        '1',
      );
      expect(
        screen.getByRole('button', { name: 'Save monthly match' }),
      ).toBeDisabled();
      expect(mockSave).not.toHaveBeenCalled();
    },
  );
  it('locks a changed source, retains the amount, and guards both reload and Cancel', async () => {
    const props = allocationProps();
    const view = setup(renderAllocation(props));
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '12.34',
    );
    view.update(
      renderAllocation({
        ...props,
        cashes: [
          {
            ...cashFixture(),
            sourceReviewToken: 'cash-reviewed-3',
            remainingSettlementMicros: '10000000',
          },
        ],
      }),
    );
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
    expect(mockReload).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Reload latest version' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('keeps cancellation available when source access becomes read only or unavailable', async () => {
    const props = allocationProps();
    const view = setup(renderAllocation(props));
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('textbox', { name: 'Amount to link' }),
      '12',
    );
    view.update(renderAllocation({ ...props, readOnly: true, cashes: [] }));
    expect(screen.getByRole('textbox', { name: 'Amount to link' })).toHaveValue(
      '12',
    );
    expect(
      screen.getByRole('button', { name: 'Apply to invoice' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reload latest version' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('leaves sources and amount unselected unless the caller supplies context', () => {
    setup(
      renderAllocation({
        ...allocationProps(),
        initialCashId: undefined,
        initialReceivableId: undefined,
      }),
    );
    expect(
      screen.getByRole('combobox', { name: 'Actual payment' }),
    ).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Invoice' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Amount to link' })).toHaveValue(
      '',
    );
    expect(
      screen.getByRole('button', { name: 'Apply to invoice' }),
    ).toBeDisabled();
  });
});

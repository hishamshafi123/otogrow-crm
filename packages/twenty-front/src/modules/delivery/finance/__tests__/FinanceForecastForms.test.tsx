import { useState, type ReactElement } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeliveryDraftGuardProvider } from '@/delivery/drafts/DeliveryDraftGuard';
import { FinanceForecastAnchorForm } from '@/delivery/finance/FinanceForecastAnchorForm';
import { FinanceForecastItemForm } from '@/delivery/finance/FinanceForecastItemForm';
import { FinanceForecastRealizationForm } from '@/delivery/finance/FinanceForecastRealizationForm';
import {
  financeForecastAnchorFixture,
  financeForecastCollectionFixture,
  financeForecastItemFixture,
  financeForecastSnapshotFixture,
  financeForecastSourceFixture,
  FORECAST_CASH_ID,
  FORECAST_ITEM_ID,
  FORECAST_OWNER_ID,
} from '@/delivery/finance/__tests__/finance-forecast.fixtures';

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryButton: 'button',
}));
const mockSave = jest.fn();
const mockCancel = jest.fn();
const mockReload = jest.fn();
const setup = (initial: ReactElement) => {
  let replace: (content: ReactElement) => void = () => undefined;
  const Page = () => {
    const [content, setContent] = useState(initial);
    replace = setContent;
    return content;
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
    { initialEntries: ['/delivery?view=finance&financeView=forecast'] },
  );
  render(<RouterProvider router={router} />);
  return { replace: (content: ReactElement) => act(() => replace(content)) };
};
const anchorForm = (
  initial: ReturnType<typeof financeForecastAnchorFixture> | null = null,
  readOnly = false,
) => (
  <FinanceForecastAnchorForm
    initial={initial}
    currency="USD"
    busy={false}
    readOnly={readOnly}
    onSave={mockSave}
    onCancel={mockCancel}
    onReload={mockReload}
  />
);
const itemForm = (
  initial: ReturnType<typeof financeForecastItemFixture> | null = null,
  source: ReturnType<typeof financeForecastSourceFixture> | null = null,
  readOnly = false,
) => (
  <FinanceForecastItemForm
    initial={initial}
    source={source}
    owners={financeForecastSnapshotFixture().owners}
    currency="USD"
    busy={false}
    readOnly={readOnly}
    onSave={mockSave}
    onCancel={mockCancel}
    onReload={mockReload}
  />
);
const realizationForm = (
  item = financeForecastItemFixture(),
  cash = financeForecastSourceFixture('CASH'),
  readOnly = false,
) => (
  <FinanceForecastRealizationForm
    item={item}
    cash={cash}
    busy={false}
    readOnly={readOnly}
    onSave={mockSave}
    onCancel={mockCancel}
    onReload={mockReload}
  />
);
const date = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillAnchor = async (amount: string) => {
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Closing cash balance (USD)' }),
    amount,
  );
  date('Closing through date', '2026-10-27');
  await userEvent.clear(
    screen.getByRole('textbox', { name: 'Reporting time zone' }),
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reporting time zone' }),
    'Asia/Makassar',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'How you confirmed this balance' }),
    'Checked the completed closing balance.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
};
const fillItemReview = async (collection = false) => {
  if (
    !screen
      .getByRole('textbox', { name: 'Expectation title' })
      .getAttribute('value')
  )
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Expectation title' }),
      'Reviewed one-off supplier payment',
    );
  date(
    collection ? 'Expected collection date' : 'Expected payment date',
    '2026-11-03',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Responsible finance owner' }),
    FORECAST_OWNER_ID,
  );
  date('Next action date', '2026-10-29');
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Follow-up note' }),
    'Confirm the agreed payment date.',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for this review' }),
    'Reviewed current cash expectation.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
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
  mockSave.mockReset().mockResolvedValue(false);
  mockCancel.mockReset();
  mockReload.mockReset();
});

it.each([
  ['0', '0'],
  ['-9223372036854.775808', '-9223372036854775808'],
])(
  'confirms explicit starting cash %s exactly with coverage and a stable retry command',
  async (amount, expected) => {
    setup(anchorForm());
    expect(
      screen.getByRole('textbox', { name: 'Closing cash balance (USD)' }),
    ).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Confirm starting cash' }),
    ).toBeDisabled();
    await fillAnchor(amount);
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm starting cash' }),
    );
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const first = mockSave.mock.calls[0][0];
    expect(first).toMatchObject({
      revision: 0,
      currency: 'USD',
      amountMicros: expected,
      closingDate: '2026-10-27',
      timezone: 'Asia/Makassar',
      acknowledgeCoverage: true,
    });
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm starting cash' }),
    );
    expect(mockSave.mock.calls[1][0].id).toBe(first.id);
  },
);

it('keeps an edited balance through revision conflict and guards cancellation', async () => {
  const initial = financeForecastAnchorFixture();
  const page = setup(anchorForm(initial));
  await userEvent.clear(
    screen.getByRole('textbox', { name: 'Closing cash balance (USD)' }),
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Closing cash balance (USD)' }),
    '-0.000001',
  );
  page.replace(anchorForm({ ...initial, revision: 2 }));
  expect(
    screen.getByText(/This record changed while you were editing/),
  ).toBeVisible();
  expect(
    screen.getByRole('textbox', { name: 'Closing cash balance (USD)' }),
  ).toHaveValue('-0.000001');
  expect(
    screen.getByRole('button', { name: 'Confirm starting cash' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancel balance review' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(mockCancel).not.toHaveBeenCalled();
});

it('schedules the full live invoice remainder and retains dates when a routine receipt reduces it', async () => {
  const source = financeForecastSourceFixture();
  const page = setup(itemForm(null, source));
  await fillItemReview(true);
  expect(
    screen.queryByRole('textbox', { name: /Expected payment amount/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Full remaining invoice balance/)).toHaveTextContent(
    '$600.00',
  );
  page.replace(itemForm(null, { ...source, remainingMicros: '400000000' }));
  expect(
    screen.queryByText(/This record changed while you were editing/),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Expected collection date')).toHaveValue(
    '2026-11-03',
  );
  expect(
    screen.getByRole('combobox', { name: 'Responsible finance owner' }),
  ).toHaveValue(FORECAST_OWNER_ID);
  await userEvent.click(
    screen.getByRole('button', { name: 'Save expected collection' }),
  );
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceType: 'RECEIVABLE',
      sourceId: source.id,
      amountMicros: '400000000',
      expectedDate: '2026-11-03',
      expectedSourceReviewToken: source.sourceReviewToken,
      acknowledgeSourceWarnings: true,
    }),
  );
});

it.each([null, undefined])(
  'does not fall back to a saved collection amount when its current source balance is %s',
  async (remainingMicros) => {
    const initial = financeForecastCollectionFixture();
    setup(
      itemForm(initial, { ...financeForecastSourceFixture(), remainingMicros }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reason for this review' }),
      'Review the currently unconfirmed source balance.',
    );
    await userEvent.click(screen.getByRole('checkbox'));
    expect(
      screen.getByText(/Full remaining invoice balance/),
    ).toHaveTextContent('Not confirmed');
    expect(
      screen.getByRole('button', { name: 'Save expected collection' }),
    ).toBeDisabled();
    expect(mockSave).not.toHaveBeenCalled();
  },
);

it('preserves a collection draft and blocks a changed structural source instead of silently reviewing it', async () => {
  const source = financeForecastSourceFixture();
  const page = setup(itemForm(null, source));
  await fillItemReview(true);
  page.replace(
    itemForm(null, { ...source, sourceReviewToken: 'f'.repeat(64) }),
  );
  expect(
    screen.getByText(/This record changed while you were editing/),
  ).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Follow-up note' })).toHaveValue(
    'Confirm the agreed payment date.',
  );
  expect(
    screen.getByRole('button', { name: 'Save expected collection' }),
  ).toBeDisabled();
  expect(mockSave).not.toHaveBeenCalled();
});

it('keeps an existing plan occurrence’s reviewed amount and date when inactive-plan warnings are explicitly acknowledged', async () => {
  const source = {
    ...financeForecastSourceFixture('PLAN'),
    eligible: false,
    warnings: ['PLAN_INACTIVE'],
    occurrenceItemId: FORECAST_ITEM_ID,
  };
  const initial = {
    ...financeForecastItemFixture(),
    sourceType: 'PLAN',
    sourceId: source.id,
    planMonth: '2026-11',
    amountMicros: '777000000',
    expectedDate: '2026-11-15',
    sourceReviewToken: source.sourceReviewToken,
    warnings: ['PLAN_INACTIVE'],
    appliedMicros: '0',
  };
  setup(itemForm(initial, source));
  expect(
    screen.getByRole('textbox', { name: 'Expected payment amount (USD)' }),
  ).toHaveValue('777');
  expect(screen.getByLabelText('Expected payment date')).toHaveValue(
    '2026-11-15',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for this review' }),
    'Salary remains due for the agreed service month.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Save expected payment' }),
  );
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      amountMicros: '777000000',
      expectedDate: '2026-11-15',
      acknowledgeSourceWarnings: true,
      planMonth: '2026-11',
    }),
  );
});

it('leaves a one-off amount unknown until an explicit zero is entered and refuses an amount below applied cash', async () => {
  const page = setup(itemForm());
  await fillItemReview();
  expect(
    screen.getByRole('textbox', { name: 'Expected payment amount (USD)' }),
  ).toHaveValue('');
  expect(
    screen.getByRole('button', { name: 'Save expected payment' }),
  ).toBeDisabled();
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Expected payment amount (USD)' }),
    '0',
  );
  expect(
    screen.getByRole('button', { name: 'Save expected payment' }),
  ).toBeEnabled();
  page.replace(
    <FinanceForecastItemForm
      key="other"
      initial={financeForecastItemFixture()}
      source={null}
      owners={financeForecastSnapshotFixture().owners}
      currency="USD"
      busy={false}
      readOnly={false}
      onSave={mockSave}
      onCancel={mockCancel}
      onReload={mockReload}
    />,
  );
  await userEvent.clear(
    screen.getByRole('textbox', { name: 'Expected payment amount (USD)' }),
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Expected payment amount (USD)' }),
    '399.999999',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for this review' }),
    'Review reduced supplier amount.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
  expect(
    screen.getByRole('button', { name: 'Save expected payment' }),
  ).toBeDisabled();
});

it('applies a partial recorded payment with exact independent source tokens and does not create cash', async () => {
  setup(realizationForm());
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Amount to apply' }),
    '200.000001',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Payment application note' }),
    'Partial supplier transfer.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Apply recorded payment' }),
  );
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      itemId: FORECAST_ITEM_ID,
      cashId: FORECAST_CASH_ID,
      amountMicros: '200000001',
      expectedCashReviewToken: 'e'.repeat(64),
      expectedItemReviewToken: 'b'.repeat(64),
      note: 'Partial supplier transfer.',
    }),
  );
  const firstId = mockSave.mock.calls[0][0].id;
  await userEvent.click(
    screen.getByRole('button', { name: 'Apply recorded payment' }),
  );
  expect(mockSave.mock.calls[1][0].id).toBe(firstId);
});

it.each([null, undefined])(
  'keeps an unavailable payment remainder %s unconfirmed and blocks application',
  async (remainingMicros) => {
    setup(
      realizationForm(financeForecastItemFixture(), {
        ...financeForecastSourceFixture('CASH'),
        remainingMicros,
      }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Amount to apply' }),
      '1',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Payment application note' }),
      'Wait for the actual remaining amount.',
    );
    expect(screen.getByText(/Unapplied actual payment/)).toHaveTextContent(
      'Unapplied actual payment: Not confirmed',
    );
    expect(
      screen.getByRole('button', {
        name: 'Use the remaining applicable amount',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Apply recorded payment' }),
    ).toBeDisabled();
    expect(mockSave).not.toHaveBeenCalled();
  },
);

it('blocks an over-application and preserves a realization draft through changed cash and read-only access', async () => {
  const item = financeForecastItemFixture();
  const cash = financeForecastSourceFixture('CASH');
  const page = setup(realizationForm(item, cash));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Amount to apply' }),
    '400.000001',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Payment application note' }),
    'Keep this application note.',
  );
  expect(
    screen.getByRole('button', { name: 'Apply recorded payment' }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Use the remaining applicable amount' }),
  );
  expect(screen.getByRole('textbox', { name: 'Amount to apply' })).toHaveValue(
    '400',
  );
  page.replace(realizationForm(item, cash, true));
  expect(
    screen.getByRole('textbox', { name: 'Amount to apply' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('textbox', { name: 'Payment application note' }),
  ).toHaveValue('Keep this application note.');
  page.replace(
    realizationForm(item, { ...cash, sourceReviewToken: 'f'.repeat(64) }),
  );
  expect(
    screen.getByText(/This record changed while you were editing/),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Apply recorded payment' }),
  ).toBeDisabled();
  expect(mockSave).not.toHaveBeenCalled();
});

it('requires reassignment when the saved owner is no longer an eligible finance reader', async () => {
  const initial = {
    ...financeForecastCollectionFixture(),
    ownerId: '9c4f29a4-5d27-41aa-b049-366320784a5a',
    ownerName: 'Former owner',
    ownerEligible: false,
    warnings: ['OWNER_INELIGIBLE'],
  };
  setup(itemForm(initial));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Reason for this review' }),
    'Reassign finance follow-up.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
  expect(
    screen.getByRole('button', { name: 'Save expected collection' }),
  ).toBeDisabled();
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Responsible finance owner' }),
    FORECAST_OWNER_ID,
  );
  expect(
    screen.getByRole('button', { name: 'Save expected collection' }),
  ).toBeEnabled();
});

it.each(['owner', 'source'] as const)(
  'blocks a direct application form after current %s validity is lost without treating overdue dates as a denial',
  async (failure) => {
    const item = {
      ...financeForecastItemFixture(),
      eligible: false,
      expectedDate: null,
      warnings: ['UNDATED_EXPECTATION'],
    };
    const page = setup(realizationForm(item));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Amount to apply' }),
      '1',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Payment application note' }),
      'Match the recorded supplier transfer.',
    );
    expect(
      screen.getByRole('button', { name: 'Apply recorded payment' }),
    ).toBeEnabled();
    page.replace(
      realizationForm(
        failure === 'owner'
          ? { ...item, ownerEligible: false }
          : {
              ...item,
              sourceType: 'PLAN',
              sourceReviewToken: 'f'.repeat(64),
              warnings: ['SOURCE_CHANGED'],
            },
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Apply recorded payment' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('textbox', { name: 'Payment application note' }),
    ).toHaveValue('Match the recorded supplier transfer.');
  },
);

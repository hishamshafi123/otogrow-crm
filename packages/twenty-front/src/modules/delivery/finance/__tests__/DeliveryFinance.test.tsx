import { useState } from 'react';
import { Request } from 'cross-fetch';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useSearchParams,
} from 'react-router-dom';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { DeliveryFinance } from '@/delivery/finance/DeliveryFinance';
import {
  DeliveryDraftGuardProvider,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';

const ORIGINAL_PAYMENT_URL =
  '/delivery?view=finance&financeView=payments&financeCash=receipt&financeCurrency=USD';
const MockPaymentsWorkspace = () => {
  const [amount, setAmount] = useState('');
  const [params] = useSearchParams();
  useDeliveryDraftStatus({ dirty: amount !== '', saving: false });
  return (
    <>
      <p>Payment matching workspace</p>
      <p>Selected payment: {params.get('financeCash')}</p>
      <p>Selected currency: {params.get('financeCurrency')}</p>
      <label>
        Payment amount
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <Link to="/delivery?view=finance&financeView=payments&financeCash=second-receipt&financeCurrency=USD">
        Choose another payment
      </Link>
      <Link to="/delivery?view=finance&financeView=payments&financeCash=receipt&financeCurrency=AED">
        Use AED payments
      </Link>
      <Link to={ORIGINAL_PAYMENT_URL}>Return to original payment</Link>
    </>
  );
};

const MockForecastWorkspace = () => {
  const [reason, setReason] = useState('');
  const [params] = useSearchParams();
  useDeliveryDraftStatus({ dirty: reason !== '', saving: false });
  return (
    <>
      <p>Cash forecast workspace</p>
      <p>Forecast days: {params.get('financeForecastDays') ?? '30'}</p>
      <label>
        Forecast review note
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <Link to="/delivery?view=finance&financeView=forecast&financeCurrency=USD&financeForecastDays=90">
        Review 90 days
      </Link>
    </>
  );
};
const MockExportsWorkspace = () => {
  const [reason, setReason] = useState('');
  useDeliveryDraftStatus({ dirty: reason !== '', saving: false });
  return (
    <>
      <p>Accounting export workspace</p>
      <label>
        Export review reason
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </>
  );
};

jest.mock('@/delivery/deliveryStyles', () => ({
  StyledDeliveryStack: 'div',
  StyledDeliveryButton: 'button',
}));
jest.mock('@/delivery/finance/financeStyles', () => ({
  StyledFinanceWorkspace: 'div',
  StyledFinanceNavigation: 'nav',
  StyledFinanceDesktopNavigation: 'nav',
  StyledFinanceMobileNavigation: 'label',
}));
jest.mock('@/delivery/DeliveryBusiness', () => ({
  DeliveryBusiness: () => <p>Cash records workspace</p>,
}));
jest.mock('@/delivery/finance/DeliveryReconciliation', () => ({
  DeliveryReconciliation: () => <MockPaymentsWorkspace />,
}));
jest.mock('@/delivery/finance/DeliveryFinanceAiCosts', () => ({
  DeliveryFinanceAiCosts: () => <p>AI-cost workspace</p>,
}));
jest.mock('@/delivery/finance/DeliveryFinanceForecast', () => ({
  DeliveryFinanceForecast: () => <MockForecastWorkspace />,
}));
jest.mock('@/delivery/finance/export/DeliveryFinanceExports', () => ({
  DeliveryFinanceExports: () => <MockExportsWorkspace />,
}));
jest.mock('@/delivery/finance/DeliveryMonthlyFinance', () => ({
  DeliveryMonthlyFinance: ({ view }: { view: string }) => (
    <p>
      {view === 'plans' ? 'Cost plan workspace' : 'Monthly results workspace'}
    </p>
  ),
}));
const workspace: DeliveryWorkspace = {
  actor: { memberId: 'member', isAdmin: true, isManager: true },
  projects: [],
  members: [],
  companies: [],
  tasks: [],
};
const setup = (query = '') => {
  const router = createMemoryRouter(
    [
      {
        path: '/delivery',
        element: (
          <I18nProvider i18n={i18n}>
            <DeliveryDraftGuardProvider>
              <DeliveryFinance
                workspace={workspace}
                onChanged={jest.fn()}
                onOpenTask={jest.fn()}
              />
            </DeliveryDraftGuardProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: [`/delivery?view=finance${query}`] },
  );
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return router;
};
beforeEach(() => {
  Object.assign(globalThis, { Request });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

it.each([
  ['', 'Cash records', 'Cash records workspace', 'cash'],
  [
    '&financeView=payments',
    'Payments and matching',
    'Payment matching workspace',
    'payments',
  ],
  [
    '&financeView=monthly',
    'Monthly results',
    'Monthly results workspace',
    'monthly',
  ],
  ['&financeView=plans', 'Monthly cost plans', 'Cost plan workspace', 'plans'],
  ['&financeView=ai-costs', 'AI costs', 'AI-cost workspace', 'ai-costs'],
  [
    '&financeView=exports',
    'Accounting exports',
    'Accounting export workspace',
    'exports',
  ],
  [
    '&financeView=forecast',
    'Cash forecast',
    'Cash forecast workspace',
    'forecast',
  ],
  ['&financeView=unknown', 'Cash records', 'Cash records workspace', 'cash'],
])(
  'shows the requested finance workspace for %s',
  (query, label, content, value) => {
    setup(query);
    expect(
      screen.getByRole('navigation', { name: 'Finance views' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: label })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText(content)).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Finance view' })).toHaveValue(
      value,
    );
  },
);

it.each([
  ['cash', 'Cash records workspace'],
  ['forecast', 'Cash forecast workspace'],
  ['payments', 'Payment matching workspace'],
  ['monthly', 'Monthly results workspace'],
  ['plans', 'Cost plan workspace'],
  ['ai-costs', 'AI-cost workspace'],
  ['exports', 'Accounting export workspace'],
])(
  'routes the native selector to %s while preserving source and filter context',
  async (value, content) => {
    const router = setup(
      '&financeView=payments&financeCurrency=AED&financeCash=receipt&financeMatchEntry=entry&financeMonth=2098-11&financeForecastDays=90',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Finance view' }),
      value,
    );
    expect(screen.getByText(content)).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Finance view' })).toHaveValue(
      value,
    );
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('financeView')).toBe(value === 'cash' ? null : value);
    expect(params.get('view')).toBe('finance');
    expect(params.get('financeCurrency')).toBe('AED');
    expect(params.get('financeCash')).toBe('receipt');
    expect(params.get('financeMatchEntry')).toBe('entry');
    expect(params.get('financeMonth')).toBe('2098-11');
    expect(params.get('financeForecastDays')).toBe('90');
  },
);

it('follows browser history and direct URL fallback without separate selector state', async () => {
  const router = setup('&financeView=monthly&financeCurrency=USD');
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Finance view' }),
    'ai-costs',
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole('combobox', { name: 'Finance view' })).toHaveValue(
    'monthly',
  );
  expect(screen.getByText('Monthly results workspace')).toBeVisible();
  await act(async () => {
    await router.navigate(1);
  });
  expect(screen.getByRole('combobox', { name: 'Finance view' })).toHaveValue(
    'ai-costs',
  );
  await act(async () => {
    await router.navigate(
      '/delivery?view=finance&financeView=unknown&financeCurrency=EUR',
    );
  });
  expect(screen.getByRole('combobox', { name: 'Finance view' })).toHaveValue(
    'cash',
  );
  expect(screen.getByText('Cash records workspace')).toBeVisible();
});
it('guards an export review while switching the seventh Finance destination and clears only discarded state', async () => {
  setup(
    '&financeView=exports&financeExportProfile=profile&financeCurrency=USD',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Export review reason' }),
    'Review duplicate handoff',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Finance view' }),
    'forecast',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('combobox', { name: 'Finance view' })).toHaveValue(
    'exports',
  );
  expect(
    screen.getByRole('textbox', { name: 'Export review reason' }),
  ).toHaveValue('Review duplicate handoff');
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Finance view' }),
    'forecast',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByText('Cash forecast workspace')).toBeVisible();
  await userEvent.click(
    screen.getByRole('link', { name: 'Accounting exports' }),
  );
  expect(
    screen.getByRole('textbox', { name: 'Export review reason' }),
  ).toHaveValue('');
});

it('keeps URL selection and a dirty payment draft on Keep editing, then discards before selector navigation', async () => {
  const router = setup(
    '&financeView=payments&financeCurrency=USD&financeCash=receipt',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Payment amount' }),
    '123.45',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Finance view' }),
    'forecast',
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('combobox', { name: 'Finance view' })).toHaveValue(
    'payments',
  );
  expect(screen.getByRole('textbox', { name: 'Payment amount' })).toHaveValue(
    '123.45',
  );
  expect(
    new URLSearchParams(router.state.location.search).get('financeView'),
  ).toBe('payments');
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Finance view' }),
    'forecast',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByRole('combobox', { name: 'Finance view' })).toHaveValue(
    'forecast',
  );
  expect(screen.getByText('Cash forecast workspace')).toBeVisible();
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Finance view' }),
    'payments',
  );
  expect(screen.getByRole('textbox', { name: 'Payment amount' })).toHaveValue(
    '',
  );
  expect(
    new URLSearchParams(router.state.location.search).get('financeCash'),
  ).toBe('receipt');
});

it('keeps source and filter context while switching finance views', async () => {
  const router = setup(
    '&financeView=payments&financeCash=receipt&financeCurrency=AED&financeMatchEntry=entry',
  );
  await userEvent.click(screen.getByRole('link', { name: 'Monthly results' }));
  expect(screen.getByText('Monthly results workspace')).toBeVisible();
  expect(
    new URLSearchParams(router.state.location.search).get('financeCash'),
  ).toBe('receipt');
  await userEvent.click(
    screen.getByRole('link', { name: 'Payments and matching' }),
  );
  expect(screen.getByText('Payment matching workspace')).toBeVisible();
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('financeCurrency')).toBe('AED');
  expect(params.get('financeCash')).toBe('receipt');
  expect(params.get('financeMatchEntry')).toBe('entry');
  await userEvent.click(screen.getByRole('link', { name: 'Cash records' }));
  expect(screen.getByText('Cash records workspace')).toBeVisible();
  expect(
    new URLSearchParams(router.state.location.search).has('financeView'),
  ).toBe(false);
});

it('protects a forecast review through view and horizon navigation and clears discarded state', async () => {
  const router = setup(
    '&financeView=forecast&financeCurrency=USD&financeForecastDays=30',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Forecast review note' }),
    'Review uncertain collection date.',
  );
  await userEvent.click(screen.getByRole('link', { name: 'Monthly results' }));
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(
    screen.getByRole('textbox', { name: 'Forecast review note' }),
  ).toHaveValue('Review uncertain collection date.');
  await userEvent.click(screen.getByRole('link', { name: 'Review 90 days' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Discard and continue' }),
  );
  expect(screen.getByText('Forecast days: 90')).toBeVisible();
  expect(
    screen.getByRole('textbox', { name: 'Forecast review note' }),
  ).toHaveValue('');
  expect(
    new URLSearchParams(router.state.location.search).get('financeCurrency'),
  ).toBe('USD');
  await userEvent.click(screen.getByRole('link', { name: 'Cash records' }));
  await userEvent.click(screen.getByRole('link', { name: 'Cash forecast' }));
  expect(
    screen.getByRole('textbox', { name: 'Forecast review note' }),
  ).toHaveValue('');
});
it.each([
  ['Choose another payment', 'second-receipt', 'USD'],
  ['Use AED payments', 'receipt', 'AED'],
])(
  'retains the payment draft on Keep editing and clears it after discarding through %s',
  async (link, cashId, currency) => {
    const router = setup(
      '&financeView=payments&financeCash=receipt&financeCurrency=USD',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Payment amount' }),
      '123.45',
    );
    await userEvent.click(screen.getByRole('link', { name: link }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Payment amount' })).toHaveValue(
      '123.45',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByText('Selected payment: receipt')).toBeVisible();
    expect(screen.getByText('Selected currency: USD')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Payment amount' })).toHaveValue(
      '123.45',
    );
    await userEvent.click(screen.getByRole('link', { name: link }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard and continue' }),
    );
    expect(screen.getByText(`Selected payment: ${cashId}`)).toBeVisible();
    expect(screen.getByText(`Selected currency: ${currency}`)).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Payment amount' })).toHaveValue(
      '',
    );
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('financeCash')).toBe(cashId);
    expect(params.get('financeCurrency')).toBe(currency);
    await userEvent.click(
      screen.getByRole('link', { name: 'Return to original payment' }),
    );
    expect(screen.getByText('Selected payment: receipt')).toBeVisible();
    expect(screen.getByText('Selected currency: USD')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Payment amount' })).toHaveValue(
      '',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  },
);
